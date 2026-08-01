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
    """只做电脑端归档；归档内容不会被聊天提示词读取。"""
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


def ensure_chat_archive() -> Path:
    with _ARCHIVE_LOCK:
        CHAT_ARCHIVE_PATH.parent.mkdir(parents=True, exist_ok=True)
        CHAT_ARCHIVE_PATH.touch(exist_ok=True)
    return CHAT_ARCHIVE_PATH
