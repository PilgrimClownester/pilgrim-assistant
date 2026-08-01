import json
import os
from datetime import date, datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Any, Literal, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


PRODUCTIVITY_PATH = Path(__file__).resolve().parents[1] / "data" / "productivity.json"
_DATA_LOCK = RLock()


def modified_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class TodoCreate(BaseModel):
    title: str = Field(..., min_length=1)
    priority: Literal["low", "medium", "high"] = "medium"
    due_date: Optional[str] = None
    notes: str = ""


class TodoUpdate(BaseModel):
    title: Optional[str] = None
    priority: Optional[Literal["low", "medium", "high"]] = None
    due_date: Optional[str] = None
    notes: Optional[str] = None
    done: Optional[bool] = None


class TodoItem(TodoCreate):
    id: str
    done: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat(timespec="seconds"))
    completed_at: Optional[str] = None
    updated_at: str = Field(default_factory=modified_now)


class ScheduleCreate(BaseModel):
    title: str = Field(..., min_length=1)
    date: str = Field(default_factory=lambda: date.today().isoformat())
    start_time: str = ""
    end_time: str = ""
    category: Literal["study", "project", "life", "deadline", "other"] = "study"
    notes: str = ""


class ScheduleUpdate(BaseModel):
    title: Optional[str] = None
    date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    category: Optional[Literal["study", "project", "life", "deadline", "other"]] = None
    notes: Optional[str] = None
    done: Optional[bool] = None


class ScheduleEvent(ScheduleCreate):
    id: str
    done: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat(timespec="seconds"))
    completed_at: Optional[str] = None
    updated_at: str = Field(default_factory=modified_now)


class ProductivitySyncRequest(BaseModel):
    todos: list[TodoItem] = Field(default_factory=list)
    schedule: list[ScheduleEvent] = Field(default_factory=list)
    deleted: dict[str, dict[str, str]] = Field(default_factory=dict)


def _default_data() -> dict[str, Any]:
    return {"todos": [], "schedule": [], "deleted": {"todos": {}, "schedule": {}}}


def _load_data() -> dict[str, Any]:
    if not PRODUCTIVITY_PATH.exists():
        return _default_data()
    try:
        data = json.loads(PRODUCTIVITY_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError, TypeError):
        return _default_data()
    deleted = data.get("deleted") if isinstance(data.get("deleted"), dict) else {}
    result = {
        "todos": list(data.get("todos") or []),
        "schedule": list(data.get("schedule") or []),
        "deleted": {
            "todos": dict(deleted.get("todos") or {}),
            "schedule": dict(deleted.get("schedule") or {}),
        },
    }
    for collection in ("todos", "schedule"):
        for item in result[collection]:
            if not item.get("updated_at"):
                item["updated_at"] = item.get("completed_at") or item.get("created_at") or "1970-01-01T00:00:00Z"
    return result


def _save_data(data: dict[str, Any]) -> None:
    PRODUCTIVITY_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = PRODUCTIVITY_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, PRODUCTIVITY_PATH)


def _timestamp_key(value: object) -> float:
    try:
        text = str(value or "1970-01-01T00:00:00Z").replace("Z", "+00:00")
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.timestamp()
    except (TypeError, ValueError, OverflowError):
        return 0.0


def _visible_items(data: dict[str, Any], collection: str) -> list[dict[str, Any]]:
    tombstones = data["deleted"][collection]
    return [
        item for item in data[collection]
        if _timestamp_key(item.get("updated_at")) > _timestamp_key(tombstones.get(str(item.get("id"))))
    ]


def list_todos() -> list[TodoItem]:
    with _DATA_LOCK:
        data = _load_data()
        return [TodoItem(**item) for item in _visible_items(data, "todos")]


def create_todo(item: TodoCreate) -> TodoItem:
    with _DATA_LOCK:
        data = _load_data()
        todo = TodoItem(id=uuid4().hex, **item.model_dump())
        data["todos"].append(todo.model_dump())
        _save_data(data)
        return todo


def update_todo(todo_id: str, patch: TodoUpdate) -> TodoItem | None:
    with _DATA_LOCK:
        data = _load_data()
        updates = patch.model_dump(exclude_unset=True)
        for index, item in enumerate(data["todos"]):
            if item.get("id") == todo_id:
                if "done" in updates:
                    updates["completed_at"] = datetime.now().isoformat(timespec="seconds") if updates["done"] else None
                updates["updated_at"] = modified_now()
                item.update(updates)
                todo = TodoItem(**item)
                data["todos"][index] = todo.model_dump()
                _save_data(data)
                return todo
    return None


def delete_todo(todo_id: str) -> bool:
    with _DATA_LOCK:
        data = _load_data()
        before = len(data["todos"])
        data["todos"] = [item for item in data["todos"] if item.get("id") != todo_id]
        if len(data["todos"]) == before:
            return False
        data["deleted"]["todos"][todo_id] = modified_now()
        _save_data(data)
        return True


def list_schedule() -> list[ScheduleEvent]:
    with _DATA_LOCK:
        data = _load_data()
        events = [ScheduleEvent(**item) for item in _visible_items(data, "schedule")]
    return sorted(events, key=lambda event: (event.date, event.start_time, event.title))


def create_schedule_event(item: ScheduleCreate) -> ScheduleEvent:
    with _DATA_LOCK:
        data = _load_data()
        event = ScheduleEvent(id=uuid4().hex, **item.model_dump())
        data["schedule"].append(event.model_dump())
        _save_data(data)
        return event


def update_schedule_event(event_id: str, patch: ScheduleUpdate) -> ScheduleEvent | None:
    with _DATA_LOCK:
        data = _load_data()
        updates = patch.model_dump(exclude_unset=True)
        for index, item in enumerate(data["schedule"]):
            if item.get("id") == event_id:
                if "done" in updates:
                    updates["completed_at"] = datetime.now().isoformat(timespec="seconds") if updates["done"] else None
                updates["updated_at"] = modified_now()
                item.update(updates)
                event = ScheduleEvent(**item)
                data["schedule"][index] = event.model_dump()
                _save_data(data)
                return event
    return None


def delete_schedule_event(event_id: str) -> bool:
    with _DATA_LOCK:
        data = _load_data()
        before = len(data["schedule"])
        data["schedule"] = [item for item in data["schedule"] if item.get("id") != event_id]
        if len(data["schedule"]) == before:
            return False
        data["deleted"]["schedule"][event_id] = modified_now()
        _save_data(data)
        return True


def sync_productivity(payload: ProductivitySyncRequest) -> dict[str, Any]:
    """按 ID 合并双端记录，同一 ID 以 updated_at 较新的版本为准。"""
    with _DATA_LOCK:
        data = _load_data()
        for collection, incoming_items in (("todos", payload.todos), ("schedule", payload.schedule)):
            current = {str(item.get("id")): item for item in data[collection] if item.get("id")}
            tombstones = data["deleted"][collection]
            for incoming in incoming_items:
                item = incoming.model_dump()
                item_id = incoming.id
                incoming_time = _timestamp_key(incoming.updated_at)
                if incoming_time <= _timestamp_key(tombstones.get(item_id)):
                    continue
                existing = current.get(item_id)
                if existing is None or incoming_time > _timestamp_key(existing.get("updated_at")):
                    current[item_id] = item

            incoming_deleted = payload.deleted.get(collection, {})
            for item_id, deleted_at in incoming_deleted.items():
                if _timestamp_key(deleted_at) > _timestamp_key(tombstones.get(item_id)):
                    tombstones[item_id] = deleted_at
                if _timestamp_key(tombstones.get(item_id)) >= _timestamp_key(current.get(item_id, {}).get("updated_at")):
                    current.pop(item_id, None)
            data[collection] = list(current.values())

        _save_data(data)
        return {
            "todos": [TodoItem(**item) for item in _visible_items(data, "todos")],
            "schedule": sorted(
                (ScheduleEvent(**item) for item in _visible_items(data, "schedule")),
                key=lambda event: (event.date, event.start_time, event.title),
            ),
            "deleted": data["deleted"],
        }


def build_productivity_context(max_items: int = 8) -> str:
    today_iso = date.today().isoformat()
    todos = sorted(
        [todo for todo in list_todos() if not todo.done],
        key=lambda todo: (
            {"high": 0, "medium": 1, "low": 2}.get(todo.priority, 3),
            todo.due_date or "9999-12-31",
            todo.title,
        ),
    )
    schedule = list_schedule()
    today_events = [event for event in schedule if event.date == today_iso]
    upcoming_events = [event for event in schedule if event.date >= today_iso and event.date != today_iso]

    lines = [f"本地日程和待办上下文（今天：{today_iso}）："]

    if today_events:
        lines.append("今日日程：")
        lines.extend(f"- {format_schedule_event(event)}" for event in today_events[:max_items])
    else:
        lines.append("今日日程：暂无")

    if upcoming_events:
        lines.append("未来日程：")
        lines.extend(f"- {format_schedule_event(event)}" for event in upcoming_events[:max_items])

    if todos:
        lines.append("未完成待办：")
        lines.extend(f"- {format_todo(todo)}" for todo in todos[:max_items])
    else:
        lines.append("未完成待办：暂无")

    return "\n".join(lines)


def format_schedule_event(event: ScheduleEvent) -> str:
    time_block = ""
    if event.start_time and event.end_time:
        time_block = f" {event.start_time}-{event.end_time}"
    elif event.start_time:
        time_block = f" {event.start_time}"
    elif event.end_time:
        time_block = f" 至 {event.end_time}"
    notes = f"；备注：{event.notes}" if event.notes else ""
    status = "；已完成" if event.done else ""
    return f"{event.date}{time_block} {event.title}（{event.category}{status}）{notes}"


def format_todo(todo: TodoItem) -> str:
    due = f"；截止：{todo.due_date}" if todo.due_date else ""
    notes = f"；备注：{todo.notes}" if todo.notes else ""
    return f"{todo.title}（优先级：{todo.priority}{due}{notes}）"
