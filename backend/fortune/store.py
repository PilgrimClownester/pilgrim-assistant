import json
import os
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Any, Literal

from pydantic import BaseModel, Field


FORTUNE_RESULTS_PATH = Path(__file__).resolve().parents[2] / "data" / "fortune_results.json"
_STORE_LOCK = RLock()
FortuneTool = Literal["bazi", "tarot", "yijing"]


def fortune_modified_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class FortuneSyncEntry(BaseModel):
    tool: FortuneTool
    date: str
    result: dict[str, Any]
    updated_at: str = Field(default_factory=fortune_modified_now)


class FortuneSyncRequest(BaseModel):
    entries: list[FortuneSyncEntry] = Field(default_factory=list)


def _timestamp(value: object) -> float:
    try:
        parsed = datetime.fromisoformat(str(value or "1970-01-01T00:00:00Z").replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.timestamp()
    except (TypeError, ValueError, OverflowError):
        return 0.0


def _load() -> dict[str, Any]:
    if not FORTUNE_RESULTS_PATH.exists():
        return {"records": {}}
    try:
        value = json.loads(FORTUNE_RESULTS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, TypeError):
        return {"records": {}}
    return {"records": dict(value.get("records") or {})} if isinstance(value, dict) else {"records": {}}


def _save(data: dict[str, Any]) -> None:
    FORTUNE_RESULTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = FORTUNE_RESULTS_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, FORTUNE_RESULTS_PATH)


def _key(tool: str, date_key: str) -> str:
    return f"{date_key}:{tool}"


def save_fortune_result(tool: FortuneTool, date_key: str, result: dict[str, Any], updated_at: str | None = None) -> FortuneSyncEntry:
    incoming = FortuneSyncEntry(tool=tool, date=date_key, result=result, updated_at=updated_at or fortune_modified_now())
    with _STORE_LOCK:
        data = _load()
        key = _key(tool, date_key)
        current = data["records"].get(key)
        if current is None or _timestamp(incoming.updated_at) > _timestamp(current.get("updated_at")):
            data["records"][key] = incoming.model_dump()
            _save(data)
            return incoming
        return FortuneSyncEntry(**current)


def list_fortune_results(date_key: str) -> list[FortuneSyncEntry]:
    with _STORE_LOCK:
        data = _load()
    return sorted(
        (FortuneSyncEntry(**value) for value in data["records"].values() if value.get("date") == date_key),
        key=lambda entry: entry.tool,
    )


def sync_fortune_results(payload: FortuneSyncRequest, date_key: str) -> list[FortuneSyncEntry]:
    for entry in payload.entries:
        save_fortune_result(entry.tool, entry.date, entry.result, entry.updated_at)
    return list_fortune_results(date_key)
