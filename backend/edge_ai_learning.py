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


class EdgeAITaskPatch(BaseModel):
    checked: bool


def _load() -> dict:
    if not STATE_PATH.exists():
        return {"completed": [], "task_checks": {}, "updated_at": None}
    try:
        data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        completed = [item for item in data.get("completed", []) if item in VALID_STAGE_IDS]
        raw_checks = data.get("task_checks") if isinstance(data.get("task_checks"), dict) else {}
        task_checks = {
            stage_id: [task_id for task_id in checks if isinstance(task_id, str) and task_id.startswith(f"{stage_id}-task-")]
            for stage_id, checks in raw_checks.items()
            if stage_id in VALID_STAGE_IDS and isinstance(checks, list)
        }
        return {"completed": completed, "task_checks": task_checks, "updated_at": data.get("updated_at")}
    except (OSError, TypeError, json.JSONDecodeError):
        return {"completed": [], "task_checks": {}, "updated_at": None}


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
            "task_checks": state["task_checks"],
            "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        }
        STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        temporary = STATE_PATH.with_suffix(".tmp")
        temporary.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(temporary, STATE_PATH)
        return state


def set_edge_ai_task(stage_id: str, task_id: str, checked: bool) -> dict | None:
    if stage_id not in VALID_STAGE_IDS or not task_id.startswith(f"{stage_id}-task-"):
        return None
    with _LOCK:
        state = _load()
        checks = set(state["task_checks"].get(stage_id, []))
        if checked:
            checks.add(task_id)
        else:
            checks.discard(task_id)
        state["task_checks"][stage_id] = sorted(checks)
        state["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
        STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        temporary = STATE_PATH.with_suffix(".tmp")
        temporary.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(temporary, STATE_PATH)
        return state
