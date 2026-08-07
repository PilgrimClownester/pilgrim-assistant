import json
import os
from datetime import date, datetime, timedelta
from pathlib import Path
from threading import RLock
from typing import Any, Literal, Optional
from uuid import uuid4

from pydantic import BaseModel, Field

from backend.productivity import list_schedule, list_todos


DATA_DIR = Path(__file__).resolve().parents[1] / "data"
REFLECTIONS_PATH = DATA_DIR / "reflections.json"
MEMORIES_PATH = DATA_DIR / "memories.json"
FOCUS_PATH = DATA_DIR / "focus_sessions.json"
_DATA_LOCK = RLock()


class ReflectionCreate(BaseModel):
    date: str = Field(default_factory=lambda: date.today().isoformat())
    win: str = ""
    challenge: str = ""
    tomorrow: str = ""
    mood: Literal["bright", "steady", "tired", "heavy"] = "steady"


class ReflectionItem(ReflectionCreate):
    id: str
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat(timespec="seconds"))


class MemoryCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=240)
    category: Literal["preference", "goal", "context", "boundary"] = "context"
    use_in_chat: bool = True


class MemoryUpdate(BaseModel):
    content: Optional[str] = Field(default=None, min_length=1, max_length=240)
    category: Optional[Literal["preference", "goal", "context", "boundary"]] = None
    use_in_chat: Optional[bool] = None
    is_frozen: Optional[bool] = None


class MemoryItem(MemoryCreate):
    id: str
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat(timespec="seconds"))
    updated_at: str = Field(default_factory=lambda: datetime.now().isoformat(timespec="seconds"))
    is_frozen: bool = False


class FocusSessionCreate(BaseModel):
    task_title: str = Field(..., min_length=1, max_length=120)
    planned_minutes: int = Field(default=25, ge=1, le=240)
    completed_minutes: int = Field(default=0, ge=0, le=240)
    completed: bool = False
    started_at: str = Field(default_factory=lambda: datetime.now().isoformat(timespec="seconds"))


class FocusSession(FocusSessionCreate):
    id: str


def _read_list(path: Path) -> list[dict[str, Any]]:
    with _DATA_LOCK:
        if not path.exists():
            return []
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
            return list(value) if isinstance(value, list) else []
        except (OSError, json.JSONDecodeError, TypeError):
            return []


def _write_list(path: Path, items: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, path)


def list_reflections() -> list[ReflectionItem]:
    return sorted((ReflectionItem(**item) for item in _read_list(REFLECTIONS_PATH)), key=lambda item: item.date, reverse=True)


def save_reflection(value: ReflectionCreate) -> ReflectionItem:
    with _DATA_LOCK:
        items = _read_list(REFLECTIONS_PATH)
        existing = next((item for item in items if item.get("date") == value.date), None)
        if existing:
            existing.update(value.model_dump())
            result = ReflectionItem(**existing)
        else:
            result = ReflectionItem(id=uuid4().hex, **value.model_dump())
            items.append(result.model_dump())
        _write_list(REFLECTIONS_PATH, items)
        return result


def list_memories() -> list[MemoryItem]:
    return sorted((MemoryItem(**item) for item in _read_list(MEMORIES_PATH)), key=lambda item: item.created_at, reverse=True)


def create_memory(value: MemoryCreate) -> MemoryItem:
    with _DATA_LOCK:
        items = _read_list(MEMORIES_PATH)
        result = MemoryItem(id=uuid4().hex, **value.model_dump())
        items.append(result.model_dump())
        _write_list(MEMORIES_PATH, items)
        return result


def update_memory(memory_id: str, value: MemoryUpdate) -> MemoryItem | None:
    with _DATA_LOCK:
        items = _read_list(MEMORIES_PATH)
        updates = value.model_dump(exclude_unset=True, exclude_none=True)
        for item in items:
            if item.get("id") != memory_id:
                continue
            item.update(updates)
            item["updated_at"] = datetime.now().isoformat(timespec="seconds")
            result = MemoryItem(**item)
            item.update(result.model_dump())
            _write_list(MEMORIES_PATH, items)
            return result
    return None


def delete_memory(memory_id: str) -> bool:
    with _DATA_LOCK:
        items = _read_list(MEMORIES_PATH)
        kept = [item for item in items if item.get("id") != memory_id]
        if len(kept) == len(items):
            return False
        _write_list(MEMORIES_PATH, kept)
        return True


def build_memory_context(max_items: int = 12) -> str:
    items = [item for item in list_memories() if item.use_in_chat and not item.is_frozen][:max_items]
    if not items:
        return "用户没有允许进入对话上下文的长期记忆。"
    labels = {"preference": "偏好", "goal": "长期目标", "context": "背景", "boundary": "边界"}
    return "用户主动保存的长期记忆：\n" + "\n".join(f"- [{labels[item.category]}] {item.content}" for item in items)


def list_focus_sessions() -> list[FocusSession]:
    return sorted((FocusSession(**item) for item in _read_list(FOCUS_PATH)), key=lambda item: item.started_at, reverse=True)


def create_focus_session(value: FocusSessionCreate) -> FocusSession:
    with _DATA_LOCK:
        items = _read_list(FOCUS_PATH)
        result = FocusSession(id=uuid4().hex, **value.model_dump())
        items.append(result.model_dump())
        _write_list(FOCUS_PATH, items)
        return result


def weekly_summary() -> dict[str, object]:
    end = date.today()
    start = end - timedelta(days=6)
    day_keys = [(start + timedelta(days=index)).isoformat() for index in range(7)]
    todos = list_todos()
    schedule = list_schedule()
    focus = list_focus_sessions()
    reflections = list_reflections()
    days = []
    for key in day_keys:
        completed_todos = sum(1 for item in todos if item.done and ((item.completed_at or item.due_date or "")[:10] == key))
        completed_events = sum(1 for item in schedule if item.done and ((item.completed_at or item.date or "")[:10] == key))
        focus_minutes = sum(item.completed_minutes for item in focus if item.started_at[:10] == key)
        days.append({"date": key, "completed": completed_todos + completed_events, "focus_minutes": focus_minutes})
    week_reflections = [item for item in reflections if start.isoformat() <= item.date <= end.isoformat()]
    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "days": days,
        "completed": sum(int(item["completed"]) for item in days),
        "focus_minutes": sum(int(item["focus_minutes"]) for item in days),
        "reflection_days": len(week_reflections),
    }
