import json
import os
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock

from pydantic import BaseModel


STATE_PATH = Path(__file__).resolve().parents[1] / "data" / "edge_ai_learning.json"
_LOCK = RLock()
VALID_STAGE_IDS = {f"stage-{index}" for index in range(1, 13)}


class EdgeAIStagePatch(BaseModel):
    done: bool


def _load() -> dict:
    if not STATE_PATH.exists():
        return {"completed": [], "updated_at": None}
    try:
        data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        completed = [item for item in data.get("completed", []) if item in VALID_STAGE_IDS]
        return {"completed": completed, "updated_at": data.get("updated_at")}
    except (OSError, TypeError, json.JSONDecodeError):
        return {"completed": [], "updated_at": None}


def get_edge_ai_progress() -> dict:
    with _LOCK:
        return _load()


def set_edge_ai_stage(stage_id: str, done: bool) -> dict | None:
    if stage_id not in VALID_STAGE_IDS:
        return None
    with _LOCK:
        state = _load()
        completed = set(state["completed"])
        if done:
            completed.add(stage_id)
        else:
            completed.discard(stage_id)
        state = {
            "completed": sorted(completed, key=lambda item: int(item.split("-")[1])),
            "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        }
        STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        temporary = STATE_PATH.with_suffix(".tmp")
        temporary.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(temporary, STATE_PATH)
        return state
