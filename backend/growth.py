"""Self-tracking, habits, goals and ideas backed by a transactional local SQLite store."""

import json
import random
import sqlite3
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from threading import RLock
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field

from backend.companion import list_focus_sessions
from backend.productivity import list_todos


DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "growth.json"
_LOCK = RLock()
_COLLECTIONS = ("moods", "expenses", "habits", "goals", "ideas")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _default() -> dict[str, list[dict[str, Any]]]:
    return {key: [] for key in _COLLECTIONS}


def _database_path() -> Path:
    return DATA_PATH.with_suffix(".db")


def _connect() -> sqlite3.Connection:
    database = _database_path()
    database.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA synchronous=FULL")
    connection.execute(
        """CREATE TABLE IF NOT EXISTS records (
            collection TEXT NOT NULL,
            id TEXT NOT NULL,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (collection, id)
        )"""
    )
    connection.execute("CREATE INDEX IF NOT EXISTS idx_records_collection ON records(collection)")
    connection.execute("CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    _migrate_legacy_json(connection)
    return connection


def _migrate_legacy_json(connection: sqlite3.Connection) -> None:
    migrated = connection.execute("SELECT value FROM metadata WHERE key = 'legacy_json_migrated'").fetchone()
    if migrated is not None:
        return
    data = _default()
    if DATA_PATH.exists():
        try:
            raw = json.loads(DATA_PATH.read_text(encoding="utf-8"))
            data = {key: list(raw.get(key) or []) for key in _COLLECTIONS}
        except (OSError, json.JSONDecodeError, TypeError):
            pass
    with connection:
        for collection, items in data.items():
            for item in items:
                item_id = str(item.get("id") or uuid4().hex)
                item["id"] = item_id
                connection.execute(
                    "INSERT OR IGNORE INTO records(collection, id, payload, created_at) VALUES (?, ?, ?, ?)",
                    (collection, item_id, json.dumps(item, ensure_ascii=False), str(item.get("created_at") or _now())),
                )
        connection.execute(
            "INSERT INTO metadata(key, value) VALUES ('legacy_json_migrated', ?)",
            (_now(),),
        )


def _backup_database(connection: sqlite3.Connection) -> None:
    backup_dir = _database_path().parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup_path = backup_dir / f"growth-{date.today().isoformat()}.db"
    if backup_path.exists():
        return
    destination = sqlite3.connect(backup_path)
    try:
        connection.backup(destination)
    finally:
        destination.close()


def _load() -> dict[str, list[dict[str, Any]]]:
    result = _default()
    connection = _connect()
    try:
        rows = connection.execute("SELECT collection, payload FROM records ORDER BY created_at, id").fetchall()
    finally:
        connection.close()
    for row in rows:
        if row["collection"] not in result:
            continue
        try:
            item = json.loads(row["payload"])
        except (json.JSONDecodeError, TypeError):
            continue
        if isinstance(item, dict):
            result[row["collection"]].append(item)
    return result


def _save(data: dict[str, Any]) -> None:
    connection = _connect()
    try:
        _backup_database(connection)
        with connection:
            connection.execute("DELETE FROM records")
            for collection in _COLLECTIONS:
                for item in data.get(collection) or []:
                    item_id = str(item.get("id") or uuid4().hex)
                    item["id"] = item_id
                    connection.execute(
                        "INSERT INTO records(collection, id, payload, created_at) VALUES (?, ?, ?, ?)",
                        (collection, item_id, json.dumps(item, ensure_ascii=False), str(item.get("created_at") or _now())),
                    )
    finally:
        connection.close()


class MoodCreate(BaseModel):
    score: int = Field(..., ge=1, le=5)
    note: str = Field(default="", max_length=500)
    date: str = Field(default_factory=lambda: date.today().isoformat())


class ExpenseCreate(BaseModel):
    amount: float = Field(..., gt=0)
    category: str = Field(default="其他", min_length=1, max_length=30)
    note: str = Field(default="", max_length=200)
    date: str = Field(default_factory=lambda: date.today().isoformat())


class HabitCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    frequency: Literal["daily", "weekly"] = "daily"
    weekly_target: int = Field(default=1, ge=1, le=7)


class MilestoneCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    weight: int = Field(default=1, ge=1, le=100)


class GoalCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    deadline: str
    milestones: list[MilestoneCreate] = Field(default_factory=list)


class IdeaCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000)
    category: str = Field(default="待分类", max_length=30)
    tags: list[str] = Field(default_factory=list, max_length=8)


def add_record(collection: str, payload: BaseModel) -> dict[str, Any]:
    with _LOCK:
        data = _load()
        item = {"id": uuid4().hex, **payload.model_dump(), "created_at": _now()}
        if collection == "habits":
            item["checkins"] = []
        if collection == "goals":
            item["milestones"] = [
                {"id": uuid4().hex, **milestone, "done": False}
                for milestone in item["milestones"]
            ]
        data[collection].append(item)
        _save(data)
        return item


def save_mood(payload: MoodCreate) -> dict[str, Any]:
    """A daily score is a snapshot: writing it again updates that day."""
    date.fromisoformat(payload.date)
    with _LOCK:
        data = _load()
        for item in data["moods"]:
            if item.get("date") == payload.date:
                item.update(payload.model_dump())
                item["updated_at"] = _now()
                _save(data)
                return item
        item = {"id": uuid4().hex, **payload.model_dump(), "created_at": _now()}
        data["moods"].append(item)
        _save(data)
        return item


def list_records(collection: str) -> list[dict[str, Any]]:
    with _LOCK:
        return _load()[collection]


def delete_record(collection: str, item_id: str) -> bool:
    with _LOCK:
        data = _load()
        before = len(data[collection])
        data[collection] = [item for item in data[collection] if item.get("id") != item_id]
        if len(data[collection]) == before:
            return False
        _save(data)
        return True


def checkin_habit(habit_id: str, day: str | None = None) -> dict[str, Any] | None:
    checkin_day = day or date.today().isoformat()
    date.fromisoformat(checkin_day)
    with _LOCK:
        data = _load()
        for habit in data["habits"]:
            if habit.get("id") == habit_id:
                dates = set(habit.get("checkins") or [])
                dates.add(checkin_day)
                habit["checkins"] = sorted(dates)
                _save(data)
                return enrich_habit(habit)
    return None


def enrich_habit(habit: dict[str, Any]) -> dict[str, Any]:
    dates = {date.fromisoformat(value) for value in habit.get("checkins") or []}
    today = date.today()
    if habit.get("frequency") == "weekly":
        target = max(1, int(habit.get("weekly_target") or 1))
        weekly_counts: dict[tuple[int, int], int] = {}
        for value in dates:
            year, week, _ = value.isocalendar()
            weekly_counts[(year, week)] = weekly_counts.get((year, week), 0) + 1
        monday = today - timedelta(days=today.weekday())
        cursor = monday
        current = 0
        while True:
            year, week, _ = cursor.isocalendar()
            if weekly_counts.get((year, week), 0) < target:
                break
            current += 1
            cursor -= timedelta(days=7)
        qualified = sorted(
            date.fromisocalendar(year, week, 1)
            for (year, week), count in weekly_counts.items() if count >= target
        )
        longest = run = 0
        previous = None
        for value in qualified:
            run = run + 1 if previous and value == previous + timedelta(days=7) else 1
            longest = max(longest, run)
            previous = value
        return {
            **habit,
            "current_streak": current,
            "longest_streak": longest,
            "streak_unit": "week",
            "checked_today": today in dates,
            "weekly_progress": weekly_counts.get(today.isocalendar()[:2], 0),
        }
    cursor = today if today in dates else today - timedelta(days=1)
    current = 0
    while cursor in dates:
        current += 1
        cursor -= timedelta(days=1)
    longest = run = 0
    previous = None
    for value in sorted(dates):
        run = run + 1 if previous and value == previous + timedelta(days=1) else 1
        longest = max(longest, run)
        previous = value
    return {**habit, "current_streak": current, "longest_streak": longest, "streak_unit": "day", "checked_today": today in dates}


def list_habits() -> list[dict[str, Any]]:
    return [enrich_habit(item) for item in list_records("habits")]


def toggle_milestone(goal_id: str, milestone_id: str, done: bool) -> dict[str, Any] | None:
    with _LOCK:
        data = _load()
        for goal in data["goals"]:
            if goal.get("id") != goal_id:
                continue
            for milestone in goal.get("milestones") or []:
                if milestone.get("id") == milestone_id:
                    milestone["done"] = done
                    milestone["completed_at"] = _now() if done else None
                    _save(data)
                    return enrich_goal(goal)
    return None


def enrich_goal(goal: dict[str, Any]) -> dict[str, Any]:
    milestones = goal.get("milestones") or []
    total = sum(max(0, int(item.get("weight") or 0)) for item in milestones)
    completed = sum(max(0, int(item.get("weight") or 0)) for item in milestones if item.get("done"))
    try:
        days_left = (date.fromisoformat(goal["deadline"]) - date.today()).days
    except (KeyError, ValueError):
        days_left = None
    return {**goal, "progress": round(completed / total * 100) if total else 0, "days_left": days_left}


def list_goals() -> list[dict[str, Any]]:
    return [enrich_goal(item) for item in list_records("goals")]


def random_idea() -> dict[str, Any] | None:
    ideas = list_records("ideas")
    return random.choice(ideas) if ideas else None


def dashboard(period: Literal["week", "month"] = "week") -> dict[str, Any]:
    days = 7 if period == "week" else 30
    start = date.today() - timedelta(days=days - 1)
    data = _load()
    moods = [item for item in data["moods"] if item.get("date", "") >= start.isoformat()]
    expenses = [item for item in data["expenses"] if item.get("date", "") >= start.isoformat()]
    focus_minutes = 0
    for item in list_focus_sessions():
        try:
            if datetime.fromisoformat(item.started_at.replace("Z", "+00:00")).date() >= start:
                focus_minutes += item.completed_minutes
        except ValueError:
            continue
    todos = list_todos()
    completed = sum(1 for item in todos if item.done)
    expense_by_category: dict[str, float] = {}
    for item in expenses:
        category = str(item.get("category") or "其他")
        expense_by_category[category] = round(expense_by_category.get(category, 0) + float(item.get("amount") or 0), 2)
    return {
        "period": period,
        "focus_minutes": focus_minutes,
        "moods": moods,
        "mood_average": round(sum(item["score"] for item in moods) / len(moods), 1) if moods else None,
        "expense_total": round(sum(float(item.get("amount") or 0) for item in expenses), 2),
        "expense_by_category": expense_by_category,
        "habits": list_habits(),
        "goals": list_goals(),
        "todo_completion_rate": round(completed / len(todos) * 100) if todos else 0,
    }


def build_growth_context(max_items: int = 5) -> str:
    goals = list_goals()[:max_items]
    habits = list_habits()[:max_items]
    lines = ["个人成长上下文："]
    lines.extend(f"- 目标 {item['title']}：{item['progress']}%，剩余 {item['days_left']} 天" for item in goals)
    lines.extend(f"- 习惯 {item['name']}：连续 {item['current_streak']} 天" for item in habits)
    return "\n".join(lines) if goals or habits else "个人成长上下文：暂无目标或习惯。"
