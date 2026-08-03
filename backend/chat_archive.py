import json
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any
from uuid import uuid4


CHAT_ARCHIVE_PATH = Path(__file__).resolve().parents[1] / "data" / "chat_archive.jsonl"
_ARCHIVE_LOCK = Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def archive_chat_exchange(
    *,
    session_id: str,
    user_message: str,
    assistant_message: str,
    response_type: str = "chat",
) -> dict[str, Any]:
    """把一次对话交换追加到服务器上的持久化归档。"""
    record = {
        "id": uuid4().hex,
        "session_id": session_id or "unknown",
        "created_at": _now(),
        "type": response_type,
        "messages": [
            {"role": "user", "content": user_message},
            {"role": "assistant", "content": assistant_message},
        ],
    }
    with _ARCHIVE_LOCK:
        CHAT_ARCHIVE_PATH.parent.mkdir(parents=True, exist_ok=True)
        with CHAT_ARCHIVE_PATH.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
            handle.flush()
    return record


def list_chat_archive(limit: int = 500) -> list[dict[str, Any]]:
    if not CHAT_ARCHIVE_PATH.exists():
        return []
    with _ARCHIVE_LOCK:
        try:
            lines = CHAT_ARCHIVE_PATH.read_text(encoding="utf-8").splitlines()
        except OSError:
            return []
    records: list[dict[str, Any]] = []
    for line in lines[-max(1, min(limit, 5000)):]:
        try:
            value = json.loads(line)
        except (json.JSONDecodeError, TypeError):
            continue
        if isinstance(value, dict):
            records.append(value)
    return records


def list_chat_messages(limit: int = 500) -> list[dict[str, Any]]:
    """把交换记录展开成聊天界面可以直接恢复的消息列表。

    归档文件以一问一答为单位存储，接口层再展开为消息，便于网页、桌面端和
    手机端从同一份服务器数据恢复对话。旧记录没有单条消息时间时，沿用交换
    的 ``created_at``。
    """
    message_limit = max(1, min(limit, 5000))
    records = list_chat_archive((message_limit + 1) // 2)
    messages: list[dict[str, Any]] = []
    for record in records:
        exchange_id = str(record.get("id") or uuid4().hex)
        created_at = str(record.get("created_at") or "")
        response_type = str(record.get("type") or "chat")
        raw_messages = record.get("messages")
        if not isinstance(raw_messages, list):
            continue
        for index, item in enumerate(raw_messages):
            if not isinstance(item, dict):
                continue
            role = item.get("role")
            content = item.get("content")
            if role not in {"user", "assistant"} or not isinstance(content, str) or not content.strip():
                continue
            messages.append(
                {
                    "id": f"{exchange_id}-{role}-{index}",
                    "role": role,
                    "content": content,
                    "created_at": created_at,
                    "type": response_type,
                }
            )
    return messages[-message_limit:]


def ensure_chat_archive() -> Path:
    with _ARCHIVE_LOCK:
        CHAT_ARCHIVE_PATH.parent.mkdir(parents=True, exist_ok=True)
        CHAT_ARCHIVE_PATH.touch(exist_ok=True)
    return CHAT_ARCHIVE_PATH
