import json
from datetime import date
from pathlib import Path
from typing import Any, Literal, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


PRODUCTIVITY_PATH = Path(__file__).resolve().parents[1] / "data" / "productivity.json"


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


class ScheduleEvent(ScheduleCreate):
    id: str


def _default_data() -> dict[str, list[dict[str, Any]]]:
    return {"todos": [], "schedule": []}


def _load_data() -> dict[str, list[dict[str, Any]]]:
    if not PRODUCTIVITY_PATH.exists():
        return _default_data()
    try:
        data = json.loads(PRODUCTIVITY_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError, TypeError):
        return _default_data()
    return {
        "todos": list(data.get("todos") or []),
        "schedule": list(data.get("schedule") or []),
    }


def _save_data(data: dict[str, list[dict[str, Any]]]) -> None:
    PRODUCTIVITY_PATH.parent.mkdir(parents=True, exist_ok=True)
    PRODUCTIVITY_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def list_todos() -> list[TodoItem]:
    data = _load_data()
    return [TodoItem(**item) for item in data["todos"]]


def create_todo(item: TodoCreate) -> TodoItem:
    data = _load_data()
    todo = TodoItem(id=uuid4().hex, **item.model_dump())
    data["todos"].append(todo.model_dump())
    _save_data(data)
    return todo


def update_todo(todo_id: str, patch: TodoUpdate) -> TodoItem | None:
    data = _load_data()
    updates = patch.model_dump(exclude_unset=True)
    for index, item in enumerate(data["todos"]):
        if item.get("id") == todo_id:
            item.update(updates)
            todo = TodoItem(**item)
            data["todos"][index] = todo.model_dump()
            _save_data(data)
            return todo
    return None


def delete_todo(todo_id: str) -> bool:
    data = _load_data()
    before = len(data["todos"])
    data["todos"] = [item for item in data["todos"] if item.get("id") != todo_id]
    if len(data["todos"]) == before:
        return False
    _save_data(data)
    return True


def list_schedule() -> list[ScheduleEvent]:
    data = _load_data()
    events = [ScheduleEvent(**item) for item in data["schedule"]]
    return sorted(events, key=lambda event: (event.date, event.start_time, event.title))


def create_schedule_event(item: ScheduleCreate) -> ScheduleEvent:
    data = _load_data()
    event = ScheduleEvent(id=uuid4().hex, **item.model_dump())
    data["schedule"].append(event.model_dump())
    _save_data(data)
    return event


def update_schedule_event(event_id: str, patch: ScheduleUpdate) -> ScheduleEvent | None:
    data = _load_data()
    updates = patch.model_dump(exclude_unset=True)
    for index, item in enumerate(data["schedule"]):
        if item.get("id") == event_id:
            item.update(updates)
            event = ScheduleEvent(**item)
            data["schedule"][index] = event.model_dump()
            _save_data(data)
            return event
    return None


def delete_schedule_event(event_id: str) -> bool:
    data = _load_data()
    before = len(data["schedule"])
    data["schedule"] = [item for item in data["schedule"] if item.get("id") != event_id]
    if len(data["schedule"]) == before:
        return False
    _save_data(data)
    return True
