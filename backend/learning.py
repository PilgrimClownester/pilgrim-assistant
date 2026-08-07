"""Controlled learning candidates for Firefly.

The assistant may notice explicit, stable preferences in ordinary chat, but a
candidate never becomes prompt context until the user confirms it.  This
module deliberately avoids model-generated extraction: evidence always comes
from the user's own words or an explicit feedback action.
"""

from __future__ import annotations

import json
import os
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from threading import RLock
from typing import Any, Literal, Optional
from uuid import uuid4

from pydantic import BaseModel, Field

from backend.companion import MemoryCreate, MemoryItem, MemoryUpdate, create_memory, list_memories, update_memory


LEARNING_PATH = Path(__file__).resolve().parents[1] / "data" / "learning.json"
_LOCK = RLock()

LearningCategory = Literal["preference", "goal", "context", "boundary"]
LearningStatus = Literal["pending", "confirmed", "rejected"]
LearningSource = Literal["chat_observation", "explicit_remember", "reply_feedback"]


class LearningPreferences(BaseModel):
    enabled: bool = True


class LearningPreferencesPatch(BaseModel):
    enabled: bool


class LearningCandidateCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=240)
    category: LearningCategory = "context"
    reason: str = Field(default="由你主动提出", max_length=240)
    evidence: str = Field(default="", max_length=500)
    confidence: float = Field(default=0.95, ge=0, le=1)
    source_type: LearningSource = "explicit_remember"
    use_in_chat: bool = True


class LearningCandidateItem(LearningCandidateCreate):
    id: str
    status: LearningStatus = "pending"
    occurrence_count: int = Field(default=1, ge=1)
    memory_id: Optional[str] = None
    created_at: str
    updated_at: str
    decided_at: Optional[str] = None


class LearningCandidateConfirm(BaseModel):
    content: Optional[str] = Field(default=None, min_length=1, max_length=240)
    category: Optional[LearningCategory] = None
    use_in_chat: Optional[bool] = None


class LearningFeedback(BaseModel):
    kind: Literal["remember", "too_long", "misunderstood"]
    content: str = Field(default="", max_length=5000)


_SENSITIVE_PATTERNS = [
    re.compile(pattern, re.I)
    for pattern in (
        r"(?:密码|口令|验证码|支付码|password|passwd|passcode)\s*[:：=]?",
        r"(?:api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|client[-_ ]?secret|private[-_ ]?key)\s*[:：=]?",
        r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
        r"\bBearer\s+[A-Za-z0-9._~+/=-]{12,}",
        r"\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b",
        r"(?<!\d)1[3-9]\d{9}(?!\d)",
        r"(?<!\d)\d{17}[\dXx](?!\d)",
        r"(?<!\d)\d{16,19}(?!\d)",
        r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b",
    )
]
_EXCLUDED_TOPIC_PATTERN = re.compile(r"(?:树洞|封存|八字|命盘|运势|塔罗|易经|占卜|出生时间|生辰)", re.I)


def _now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _empty_state() -> dict[str, Any]:
    return {"version": 1, "preferences": LearningPreferences().model_dump(), "candidates": []}


def _read_state() -> dict[str, Any]:
    if not LEARNING_PATH.exists():
        return _empty_state()
    try:
        value = json.loads(LEARNING_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, TypeError):
        return _empty_state()
    if not isinstance(value, dict):
        return _empty_state()
    return {
        "version": 1,
        "preferences": value.get("preferences") if isinstance(value.get("preferences"), dict) else {},
        "candidates": value.get("candidates") if isinstance(value.get("candidates"), list) else [],
    }


def _write_state(state: dict[str, Any]) -> None:
    LEARNING_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = LEARNING_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, LEARNING_PATH)


def _normalise(text: str) -> str:
    return re.sub(r"[\s，。！？、,.!?：:；;‘’“”\"']+", "", text).lower()


def contains_sensitive_information(text: str) -> bool:
    value = text.strip()
    return any(pattern.search(value) for pattern in _SENSITIVE_PATTERNS)


def get_learning_preferences() -> LearningPreferences:
    with _LOCK:
        return LearningPreferences(**_read_state()["preferences"])


def update_learning_preferences(value: LearningPreferencesPatch) -> LearningPreferences:
    with _LOCK:
        state = _read_state()
        result = LearningPreferences(**value.model_dump())
        state["preferences"] = result.model_dump()
        _write_state(state)
        return result


def list_learning_candidates(status: LearningStatus | Literal["all"] = "pending", limit: int = 50) -> list[LearningCandidateItem]:
    with _LOCK:
        items: list[LearningCandidateItem] = []
        for raw in _read_state()["candidates"]:
            try:
                item = LearningCandidateItem(**raw)
            except (TypeError, ValueError):
                continue
            if status == "all" or item.status == status:
                items.append(item)
        return sorted(items, key=lambda item: item.updated_at, reverse=True)[: max(1, min(limit, 100))]


def create_learning_candidate(value: LearningCandidateCreate) -> LearningCandidateItem:
    content = value.content.strip()
    evidence = value.evidence.strip()
    if _EXCLUDED_TOPIC_PATTERN.search(content) or _EXCLUDED_TOPIC_PATTERN.search(evidence):
        raise ValueError("树洞与运势相关内容不会进入学习候选")
    if contains_sensitive_information(content) or contains_sensitive_information(evidence):
        raise ValueError("这段内容可能包含密码、联系方式或其他敏感信息，不会进入学习候选")
    canonical = _normalise(content)
    if len(canonical) < 3:
        raise ValueError("候选内容过短，暂时无法形成稳定认识")

    with _LOCK:
        state = _read_state()
        existing_memories = {_normalise(item.content) for item in list_memories()}
        if canonical in existing_memories:
            raise ValueError("这条内容已经在长期记忆中")

        now = _now()
        for raw in state["candidates"]:
            if _normalise(str(raw.get("content") or "")) != canonical:
                continue
            if raw.get("status") == "pending":
                raw["occurrence_count"] = int(raw.get("occurrence_count") or 1) + 1
                raw["confidence"] = min(0.99, max(float(raw.get("confidence") or 0), value.confidence) + 0.01)
                raw["updated_at"] = now
                _write_state(state)
                return LearningCandidateItem(**raw)
            if raw.get("status") == "confirmed":
                raise ValueError("这条内容已经确认过")

        item = LearningCandidateItem(
            id=uuid4().hex,
            **value.model_copy(update={"content": content, "evidence": evidence}).model_dump(),
            created_at=now,
            updated_at=now,
        )
        state["candidates"].append(item.model_dump())
        _write_state(state)
        return item


def _inferred_candidate(message: str) -> LearningCandidateCreate | None:
    source = message.strip()
    if not source or len(source) > 500 or contains_sensitive_information(source) or _EXCLUDED_TOPIC_PATTERN.search(source):
        return None

    rules: list[tuple[re.Pattern[str], LearningCategory, str, float]] = [
        (re.compile(r"^(?:我的)?(?:长期)?目标是\s*(.+)$", re.S), "goal", "你明确说出了一个长期目标", 0.96),
        (re.compile(r"^我(?:比较|更)?(?:喜欢|偏好)\s*(.+)$", re.S), "preference", "你明确表达了自己的偏好", 0.94),
        (re.compile(r"^我(?:不喜欢|讨厌)\s*(.+)$", re.S), "boundary", "你明确表达了自己的边界", 0.95),
        (re.compile(r"^我(?:不希望|不想要)(?:(?:你|Firefly|流萤)\s*)?((?:回复|回答|说话|称呼|提醒|猜测|替我决定|过度解释|使用).+)$", re.S | re.I), "boundary", "你明确表达了不希望被怎样对待", 0.95),
        (re.compile(r"^(?:以后|今后)(?:(?:请)?(?:你|Firefly|流萤)\s*)?((?:回复|回答|说话|称呼|提醒|先问|先确认|少说|多说).+)$", re.S | re.I), "preference", "你给出了以后也可能适用的交流方式", 0.9),
        (re.compile(r"^(?:不要|别再)\s*((?:回复|回答|说话|称呼|提醒|猜测|替我决定|过度解释|使用).+)$", re.S), "boundary", "你明确提出了一条交流边界", 0.93),
        (re.compile(r"^我希望(?:你|Firefly|流萤)\s*((?:回复|回答|说话|称呼|提醒|先问|先确认|少说|多说|不要).+)$", re.S | re.I), "preference", "你明确提出了对 Firefly 的期待", 0.92),
    ]
    for pattern, category, reason, confidence in rules:
        match = pattern.fullmatch(source)
        if not match:
            continue
        detail = match.group(1).strip(" ，。！？!?")
        if len(_normalise(detail)) < 3:
            return None
        if category == "goal":
            content = source
        elif category == "boundary" and source.startswith(("不要", "别再")):
            content = f"我希望 Firefly 不要{detail}"
        elif source.startswith(("以后", "今后")):
            content = f"我希望 Firefly 以后{detail}"
        elif source.startswith("我希望"):
            content = f"我希望 Firefly {detail}"
        else:
            content = source
        if len(content) > 240 or contains_sensitive_information(content):
            return None
        return LearningCandidateCreate(
            content=content,
            category=category,
            reason=reason,
            evidence=source,
            confidence=confidence,
            source_type="chat_observation",
        )
    return None


def observe_user_message(message: str) -> LearningCandidateItem | None:
    """Create a candidate only for explicit, high-confidence user statements."""
    if not get_learning_preferences().enabled:
        return None
    inferred = _inferred_candidate(message)
    if inferred is None:
        return None
    try:
        return create_learning_candidate(inferred)
    except ValueError:
        return None


def record_learning_feedback(value: LearningFeedback) -> LearningCandidateItem:
    if value.kind == "remember":
        content = value.content.strip()
        inferred = _inferred_candidate(content)
        candidate = inferred.model_copy(update={"source_type": "explicit_remember", "confidence": 0.99}) if inferred else LearningCandidateCreate(
            content=content,
            category="context",
            reason="你在对话中主动选择了“记住”",
            evidence=content,
            confidence=0.99,
            source_type="explicit_remember",
        )
    elif value.kind == "too_long":
        candidate = LearningCandidateCreate(
            content="我希望 Firefly 的回复更简洁。",
            category="preference",
            reason="你在对话中反馈了一次“简短些”",
            evidence="来自你的对话反馈，不保存原回复内容",
            confidence=0.97,
            source_type="reply_feedback",
        )
    else:
        candidate = LearningCandidateCreate(
            content="当 Firefly 不确定我的意思时，先向我确认。",
            category="boundary",
            reason="你在对话中反馈了一次“理解错了”",
            evidence="来自你的对话反馈，不保存原回复内容",
            confidence=0.95,
            source_type="reply_feedback",
        )
    return create_learning_candidate(candidate)


def confirm_learning_candidate(candidate_id: str, changes: LearningCandidateConfirm) -> tuple[LearningCandidateItem, MemoryItem] | None:
    with _LOCK:
        state = _read_state()
        raw = next((item for item in state["candidates"] if item.get("id") == candidate_id), None)
        if raw is None or raw.get("status") != "pending":
            return None
        content = (changes.content if changes.content is not None else str(raw.get("content") or "")).strip()
        category = changes.category if changes.category is not None else raw.get("category", "context")
        use_in_chat = changes.use_in_chat if changes.use_in_chat is not None else bool(raw.get("use_in_chat", True))
        if _EXCLUDED_TOPIC_PATTERN.search(content):
            raise ValueError("树洞与运势相关内容不能写入学习记忆")
        if contains_sensitive_information(content):
            raise ValueError("这段内容可能包含敏感信息，无法写入长期记忆")

        memory = next((item for item in list_memories() if _normalise(item.content) == _normalise(content)), None)
        if memory is None:
            memory = create_memory(MemoryCreate(content=content, category=category, use_in_chat=use_in_chat))
        elif memory.category != category or memory.use_in_chat != use_in_chat:
            memory = update_memory(memory.id, MemoryUpdate(category=category, use_in_chat=use_in_chat)) or memory
        now = _now()
        raw.update(
            content=content,
            category=category,
            use_in_chat=use_in_chat,
            status="confirmed",
            memory_id=memory.id,
            decided_at=now,
            updated_at=now,
        )
        _write_state(state)
        return LearningCandidateItem(**raw), memory


def reject_learning_candidate(candidate_id: str) -> LearningCandidateItem | None:
    with _LOCK:
        state = _read_state()
        raw = next((item for item in state["candidates"] if item.get("id") == candidate_id), None)
        if raw is None or raw.get("status") != "pending":
            return None
        now = _now()
        raw.update(status="rejected", decided_at=now, updated_at=now)
        _write_state(state)
        return LearningCandidateItem(**raw)


def learning_weekly_summary(day: date | None = None) -> dict[str, Any]:
    end = day or date.today()
    start = end - timedelta(days=end.weekday())
    end_exclusive = start + timedelta(days=7)
    items = list_learning_candidates("all", 100)

    def in_week(timestamp: str | None) -> bool:
        if not timestamp:
            return False
        try:
            value = datetime.fromisoformat(timestamp.replace("Z", "+00:00")).date()
        except ValueError:
            return False
        return start <= value < end_exclusive

    generated = [item for item in items if in_week(item.created_at)]
    confirmed = [item for item in items if item.status == "confirmed" and in_week(item.decided_at)]
    rejected = [item for item in items if item.status == "rejected" and in_week(item.decided_at)]
    return {
        "start": start.isoformat(),
        "end": (end_exclusive - timedelta(days=1)).isoformat(),
        "generated": len(generated),
        "confirmed": len(confirmed),
        "rejected": len(rejected),
        "pending": len([item for item in items if item.status == "pending"]),
        "learned": [
            {"id": item.id, "content": item.content, "category": item.category, "memory_id": item.memory_id}
            for item in confirmed[:12]
        ],
    }
