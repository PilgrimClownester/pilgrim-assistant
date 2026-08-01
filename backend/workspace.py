"""Connected workspace features: projects, universal inbox actions and weekly reviews."""

import json
import re
import sqlite3
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from threading import RLock
from typing import Any, Literal, Optional
from uuid import uuid4

from pydantic import BaseModel, Field

from backend.companion import list_focus_sessions, list_reflections
from backend.growth import (
    ExpenseCreate,
    GoalCreate,
    HabitCreate,
    IdeaCreate,
    add_record,
    delete_record,
    list_goals,
    list_habits,
    list_records,
)
from backend.productivity import (
    ScheduleCreate,
    TodoCreate,
    create_schedule_event,
    create_todo,
    delete_schedule_event,
    delete_todo,
    list_schedule,
    list_todos,
)
from backend.treehole import TreeholeWrite, delete_capsule, seal as seal_treehole


WORKSPACE_PATH = Path(__file__).resolve().parents[1] / "data" / "workspace.db"
_LOCK = RLock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _connect() -> sqlite3.Connection:
    WORKSPACE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(WORKSPACE_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA synchronous=FULL")
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS inbox_actions (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            target_id TEXT NOT NULL,
            payload TEXT NOT NULL,
            undone INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS weekly_reviews (
            id TEXT PRIMARY KEY,
            week_start TEXT NOT NULL UNIQUE,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """
    )
    return connection


class ProjectMilestoneCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    weight: int = Field(default=1, ge=1, le=100)


class ProjectTaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    priority: Literal["low", "medium", "high"] = "medium"
    due_date: Optional[str] = None
    notes: str = Field(default="", max_length=500)


class ProjectEventCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    date: str
    start_time: str = ""
    end_time: str = ""
    category: Literal["study", "project", "life", "deadline", "other"] = "project"
    notes: str = Field(default="", max_length=500)


class ProjectDecisionCreate(BaseModel):
    decision: str = Field(..., min_length=1, max_length=500)
    rationale: str = Field(default="", max_length=1000)
    review_date: Optional[str] = None


class ProjectLinkCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    url: str = Field(..., min_length=1, max_length=1000)
    kind: Literal["document", "reference", "repository", "other"] = "reference"


class ProjectCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    deadline: Optional[str] = None
    color: str = Field(default="#3FAFD9", pattern=r"^#[0-9A-Fa-f]{6}$")
    milestones: list[ProjectMilestoneCreate] = Field(default_factory=list, max_length=30)
    tasks: list[ProjectTaskCreate] = Field(default_factory=list, max_length=30)


class ProjectUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=2000)
    deadline: Optional[str] = None
    color: Optional[str] = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    status: Optional[Literal["active", "paused", "completed", "archived"]] = None


class ProjectRiskCreate(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)
    level: Literal["low", "medium", "high"] = "medium"


class InboxProposal(BaseModel):
    kind: Literal["todo", "schedule", "expense", "habit", "goal", "idea", "project", "treehole"]
    title: str = Field(..., min_length=1, max_length=160)
    description: str = Field(default="", max_length=500)
    confidence: float = Field(default=0.5, ge=0, le=1)
    rationale: str = Field(default="", max_length=240)
    payload: dict[str, Any] = Field(default_factory=dict)
    missing_fields: list[str] = Field(default_factory=list)
    source_text: str = Field(default="", max_length=5000)


class InboxCommitRequest(BaseModel):
    proposal: InboxProposal
    project_id: Optional[str] = None
    password: Optional[str] = Field(default=None, max_length=256)
    unlock_date: Optional[datetime] = None


class WeeklyReviewSave(BaseModel):
    week_start: str
    highlight: str = Field(default="", max_length=1000)
    challenge: str = Field(default="", max_length=1000)
    next_focus: str = Field(default="", max_length=500)
    note: str = Field(default="", max_length=2000)
    snapshot: dict[str, Any] = Field(default_factory=dict)


class WeeklyPlanTask(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    priority: Literal["low", "medium", "high"] = "medium"
    due_date: Optional[str] = None
    notes: str = Field(default="来自每周复盘", max_length=500)
    project_id: Optional[str] = None


class WeeklyPlanApply(BaseModel):
    tasks: list[WeeklyPlanTask] = Field(..., min_length=1, max_length=20)


def _read_project(row: sqlite3.Row) -> dict[str, Any]:
    return json.loads(row["payload"])


def _save_project(project: dict[str, Any]) -> None:
    project["updated_at"] = _now()
    connection = _connect()
    try:
        with connection:
            connection.execute(
                """INSERT INTO projects(id, payload, created_at, updated_at) VALUES (?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at""",
                (project["id"], json.dumps(project, ensure_ascii=False), project["created_at"], project["updated_at"]),
            )
    finally:
        connection.close()


def create_project(value: ProjectCreate) -> dict[str, Any]:
    now = _now()
    project = {
        "id": uuid4().hex,
        "title": value.title,
        "description": value.description,
        "deadline": value.deadline,
        "color": value.color,
        "status": "active",
        "milestones": [
            {"id": uuid4().hex, **item.model_dump(), "done": False, "completed_at": None}
            for item in value.milestones
        ],
        "task_ids": [],
        "event_ids": [],
        "idea_ids": [],
        "risks": [],
        "decisions": [],
        "links": [],
        "created_at": now,
        "updated_at": now,
    }
    for task in value.tasks:
        created = create_todo(TodoCreate(**task.model_dump()))
        project["task_ids"].append(created.id)
    _save_project(project)
    return hydrate_project(project)


def _get_raw_project(project_id: str) -> dict[str, Any] | None:
    connection = _connect()
    try:
        row = connection.execute("SELECT payload FROM projects WHERE id = ?", (project_id,)).fetchone()
    finally:
        connection.close()
    return _read_project(row) if row else None


def hydrate_project(project: dict[str, Any]) -> dict[str, Any]:
    todos = {item.id: item.model_dump() for item in list_todos()}
    events_by_id = {item.id: item.model_dump() for item in list_schedule()}
    ideas = {str(item.get("id")): item for item in list_records("ideas")}
    tasks = [todos[item_id] for item_id in project.get("task_ids", []) if item_id in todos]
    events = [events_by_id[item_id] for item_id in project.get("event_ids", []) if item_id in events_by_id]
    linked_ideas = [ideas[item_id] for item_id in project.get("idea_ids", []) if item_id in ideas]
    milestones = project.get("milestones") or []
    milestone_total = sum(max(1, int(item.get("weight") or 1)) for item in milestones)
    milestone_done = sum(max(1, int(item.get("weight") or 1)) for item in milestones if item.get("done"))
    milestone_progress = round(milestone_done / milestone_total * 100) if milestone_total else None
    task_progress = round(sum(1 for item in tasks if item.get("done")) / len(tasks) * 100) if tasks else None
    values = [value for value in (milestone_progress, task_progress) if value is not None]
    progress = round(sum(values) / len(values)) if values else 0
    try:
        days_left = (date.fromisoformat(project["deadline"]) - date.today()).days if project.get("deadline") else None
    except ValueError:
        days_left = None
    open_risks = sum(1 for risk in project.get("risks") or [] if risk.get("status") == "open")
    week_start = date.today() - timedelta(days=6)
    weekly_completed = sum(
        1 for item in tasks
        if item.get("done") and week_start.isoformat() <= str(item.get("completed_at") or "")[:10] <= date.today().isoformat()
    ) + sum(
        1 for item in events
        if item.get("done") and week_start.isoformat() <= str(item.get("completed_at") or item.get("date") or "")[:10] <= date.today().isoformat()
    )
    return {
        **project,
        "tasks": tasks,
        "events": events,
        "ideas": linked_ideas,
        "progress": progress,
        "days_left": days_left,
        "open_risks": open_risks,
        "weekly_completed": weekly_completed,
    }


def list_projects(include_archived: bool = False) -> list[dict[str, Any]]:
    connection = _connect()
    try:
        rows = connection.execute("SELECT payload FROM projects ORDER BY updated_at DESC").fetchall()
    finally:
        connection.close()
    projects = [_read_project(row) for row in rows]
    if not include_archived:
        projects = [item for item in projects if item.get("status") != "archived"]
    return [hydrate_project(item) for item in projects]


def get_project(project_id: str) -> dict[str, Any] | None:
    project = _get_raw_project(project_id)
    return hydrate_project(project) if project else None


def update_project(project_id: str, value: ProjectUpdate) -> dict[str, Any] | None:
    with _LOCK:
        project = _get_raw_project(project_id)
        if not project:
            return None
        project.update(value.model_dump(exclude_unset=True))
        _save_project(project)
        return hydrate_project(project)


def delete_project(project_id: str) -> bool:
    connection = _connect()
    try:
        with connection:
            cursor = connection.execute("DELETE FROM projects WHERE id = ?", (project_id,))
            return cursor.rowcount > 0
    finally:
        connection.close()


def add_project_milestone(project_id: str, value: ProjectMilestoneCreate) -> dict[str, Any] | None:
    with _LOCK:
        project = _get_raw_project(project_id)
        if not project:
            return None
        project.setdefault("milestones", []).append(
            {"id": uuid4().hex, **value.model_dump(), "done": False, "completed_at": None}
        )
        _save_project(project)
        return hydrate_project(project)


def toggle_project_milestone(project_id: str, milestone_id: str, done: bool) -> dict[str, Any] | None:
    with _LOCK:
        project = _get_raw_project(project_id)
        if not project:
            return None
        milestone = next((item for item in project.get("milestones", []) if item.get("id") == milestone_id), None)
        if not milestone:
            return None
        milestone["done"] = done
        milestone["completed_at"] = _now() if done else None
        _save_project(project)
        return hydrate_project(project)


def add_project_task(project_id: str, value: ProjectTaskCreate) -> dict[str, Any] | None:
    with _LOCK:
        project = _get_raw_project(project_id)
        if not project:
            return None
        created = create_todo(TodoCreate(**value.model_dump()))
        project.setdefault("task_ids", []).append(created.id)
        _save_project(project)
        return hydrate_project(project)


def add_project_event(project_id: str, value: ProjectEventCreate) -> dict[str, Any] | None:
    with _LOCK:
        project = _get_raw_project(project_id)
        if not project:
            return None
        created = create_schedule_event(ScheduleCreate(**value.model_dump()))
        project.setdefault("event_ids", []).append(created.id)
        _save_project(project)
        return hydrate_project(project)


def link_project_task(project_id: str, todo_id: str) -> bool:
    with _LOCK:
        project = _get_raw_project(project_id)
        if not project or not any(item.id == todo_id for item in list_todos()):
            return False
        ids = project.setdefault("task_ids", [])
        if todo_id not in ids:
            ids.append(todo_id)
            _save_project(project)
        return True


def link_project_event(project_id: str, event_id: str) -> bool:
    with _LOCK:
        project = _get_raw_project(project_id)
        if not project or not any(item.id == event_id for item in list_schedule()):
            return False
        ids = project.setdefault("event_ids", [])
        if event_id not in ids:
            ids.append(event_id)
            _save_project(project)
        return True


def link_project_idea(project_id: str, idea_id: str) -> dict[str, Any] | None:
    with _LOCK:
        project = _get_raw_project(project_id)
        if not project or not any(str(item.get("id")) == idea_id for item in list_records("ideas")):
            return None
        ids = project.setdefault("idea_ids", [])
        if idea_id not in ids:
            ids.append(idea_id)
            _save_project(project)
        return hydrate_project(project)


def add_project_risk(project_id: str, value: ProjectRiskCreate) -> dict[str, Any] | None:
    with _LOCK:
        project = _get_raw_project(project_id)
        if not project:
            return None
        project.setdefault("risks", []).append(
            {"id": uuid4().hex, **value.model_dump(), "status": "open", "created_at": _now()}
        )
        _save_project(project)
        return hydrate_project(project)


def add_project_decision(project_id: str, value: ProjectDecisionCreate) -> dict[str, Any] | None:
    with _LOCK:
        project = _get_raw_project(project_id)
        if not project:
            return None
        project.setdefault("decisions", []).append(
            {"id": uuid4().hex, **value.model_dump(), "created_at": _now()}
        )
        _save_project(project)
        return hydrate_project(project)


def add_project_link(project_id: str, value: ProjectLinkCreate) -> dict[str, Any] | None:
    with _LOCK:
        project = _get_raw_project(project_id)
        if not project:
            return None
        project.setdefault("links", []).append(
            {"id": uuid4().hex, **value.model_dump(), "created_at": _now()}
        )
        _save_project(project)
        return hydrate_project(project)


def resolve_project_risk(project_id: str, risk_id: str, resolved: bool) -> dict[str, Any] | None:
    with _LOCK:
        project = _get_raw_project(project_id)
        if not project:
            return None
        risk = next((item for item in project.get("risks", []) if item.get("id") == risk_id), None)
        if not risk:
            return None
        risk["status"] = "resolved" if resolved else "open"
        risk["resolved_at"] = _now() if resolved else None
        _save_project(project)
        return hydrate_project(project)


def _relative_date(text: str) -> str | None:
    today = date.today()
    if "后天" in text:
        return (today + timedelta(days=2)).isoformat()
    if "明天" in text or "明日" in text:
        return (today + timedelta(days=1)).isoformat()
    if "今天" in text or "今日" in text or "今晚" in text:
        return today.isoformat()
    match = re.search(r"(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})", text)
    if match:
        try:
            return date(int(match.group(1)), int(match.group(2)), int(match.group(3))).isoformat()
        except ValueError:
            return None
    return None


def _small_number(value: str) -> int | None:
    if value.isdigit():
        return int(value)
    digits = {"零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
    if value == "十":
        return 10
    if "十" in value:
        left, right = value.split("十", 1)
        return (digits.get(left, 1) * 10) + digits.get(right, 0)
    return digits.get(value)


def parse_inbox_locally(text: str) -> InboxProposal:
    source = text.strip()
    expense = re.search(r"(\d+(?:\.\d{1,2})?)\s*(?:元|块)", source)
    if not expense and any(word in source for word in ("花", "买", "饭", "餐", "咖啡", "奶茶", "打车", "记账", "消费")):
        expense = re.search(r"(\d+(?:\.\d{1,2})?)\s*$", source)
    if expense and any(word in source for word in ("花", "买", "饭", "餐", "咖啡", "打车", "记账", "消费")):
        amount = float(expense.group(1))
        category = "餐饮" if any(word in source for word in ("饭", "餐", "咖啡", "奶茶")) else "交通" if any(word in source for word in ("车", "地铁", "公交")) else "其他"
        note = re.sub(r"\d+(?:\.\d{1,2})?\s*(?:元|块)?", "", source).strip(" ，。:：") or "快速记账"
        return InboxProposal(kind="expense", title=f"{note} ¥{amount:g}", description="记录一笔支出", confidence=0.95, rationale="识别到金额和消费场景", payload={"amount": amount, "category": category, "note": note}, source_text=source)
    if source.startswith(("记个点子", "灵感", "想法")) or "点子：" in source:
        content = re.sub(r"^(?:记个点子|记录灵感|灵感|想法)\s*[：:]?\s*", "", source).strip()
        return InboxProposal(kind="idea", title=content[:80], description="保存到灵感收集箱", confidence=0.94, rationale="识别到灵感表达", payload={"content": content, "category": "待分类", "tags": []}, source_text=source)
    if source.startswith(("树洞", "封存")) or any(word in source for word in ("不想再看", "写给未来")):
        content = re.sub(r"^(?:树洞|封存)\s*[：:]?\s*", "", source).strip()
        return InboxProposal(kind="treehole", title="封存一段话", description=content[:120], confidence=0.9, rationale="识别到私密封存意图", payload={"content": content}, missing_fields=["password", "unlock_date"], source_text=source)
    if source.startswith(("每周", "每天", "每日", "养成习惯", "习惯")):
        weekly = source.startswith("每周")
        target_match = re.search(r"每周\D*([1-7一二两三四五六七])\s*次", source)
        weekly_target = _small_number(target_match.group(1)) if target_match else 1
        name = re.sub(r"^(?:每周|每天|每日|养成习惯|习惯)\s*", "", source)
        name = re.sub(r"[1-7一二两三四五六七]\s*次", "", name).strip(" ，。:：")
        return InboxProposal(kind="habit", title=name or "新习惯", description="创建习惯", confidence=0.9, rationale="识别到重复行为", payload={"name": name or source, "frequency": "weekly" if weekly else "daily", "weekly_target": weekly_target or 1}, source_text=source)
    if any(word in source for word in ("项目：", "新项目", "启动项目")):
        title = re.sub(r"^(?:新项目|启动项目|项目)\s*[：:]?\s*", "", source).strip()
        return InboxProposal(kind="project", title=title[:120], description="创建项目驾驶舱", confidence=0.9, rationale="识别到项目创建意图", payload={"title": title, "description": "", "deadline": _relative_date(source)}, source_text=source)
    if any(word in source for word in ("长期目标", "我的目标", "目标是")):
        title = re.sub(r"^(?:长期目标|我的目标|目标是|目标)\s*[：:]?\s*", "", source).strip()
        deadline = _relative_date(source)
        return InboxProposal(kind="goal", title=title[:120], description="创建长期目标", confidence=0.82, rationale="识别到长期目标", payload={"title": title, "deadline": deadline or (date.today() + timedelta(days=90)).isoformat(), "milestones": []}, source_text=source)
    event_date = _relative_date(source)
    time_match = re.search(r"(?<!\d)([01]?\d|2[0-3])(?:[:：点时])([0-5]\d)?", source)
    chinese_time_match = re.search(r"([零一二两三四五六七八九十]{1,3})(?:点|时)(半|[零一二两三四五六七八九十]{1,3}分?)?", source)
    if event_date or ((time_match or chinese_time_match) and any(word in source for word in ("提醒", "安排", "开会", "上课", "约"))):
        matched_time = time_match.group(0) if time_match else chinese_time_match.group(0) if chinese_time_match else ""
        if time_match:
            hour, minute = int(time_match.group(1)), int(time_match.group(2) or 0)
        elif chinese_time_match:
            hour = _small_number(chinese_time_match.group(1)) or 0
            minute_text = chinese_time_match.group(2) or ""
            minute = 30 if minute_text == "半" else (_small_number(minute_text.removesuffix("分")) or 0)
        else:
            hour, minute = 0, 0
        if any(word in source for word in ("下午", "晚上", "今晚")) and hour < 12:
            hour += 12
        elif "中午" in source and hour < 11:
            hour += 12
        start_time = f"{hour:02d}:{minute:02d}" if matched_time else ""
        title = source
        for word in ("今天", "明天", "明日", "后天", "今晚", "上午", "下午", "中午", "晚上", "提醒我", "安排", "日程"):
            title = title.replace(word, "")
        if matched_time:
            title = title.replace(matched_time, "")
        title = title.strip(" ，。:：") or "新日程"
        return InboxProposal(kind="schedule", title=title[:120], description="加入日程", confidence=0.92, rationale="识别到日期或时间", payload={"title": title, "date": event_date or date.today().isoformat(), "start_time": start_time, "end_time": "", "category": "other", "notes": source}, source_text=source)
    title = re.sub(r"^(?:待办|任务|记一下|帮我记得|记得)\s*[：:]?\s*", "", source).strip()
    return InboxProposal(kind="todo", title=title[:120], description="加入任务清单", confidence=0.58, rationale="未发现更明确类别，暂按待办处理", payload={"title": title, "priority": "medium", "due_date": _relative_date(source), "notes": "来自万能收件箱"}, source_text=source)


def record_action(kind: str, target_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    action = {"id": uuid4().hex, "kind": kind, "target_id": target_id, "payload": payload, "undone": False, "created_at": _now()}
    connection = _connect()
    try:
        with connection:
            connection.execute(
                "INSERT INTO inbox_actions(id, kind, target_id, payload, undone, created_at) VALUES (?, ?, ?, ?, 0, ?)",
                (action["id"], kind, target_id, json.dumps(payload, ensure_ascii=False), action["created_at"]),
            )
    finally:
        connection.close()
    return action


def commit_inbox(request: InboxCommitRequest) -> dict[str, Any]:
    proposal = request.proposal
    payload = proposal.payload
    kind = proposal.kind
    if kind == "todo":
        item = create_todo(TodoCreate(**payload)).model_dump()
    elif kind == "schedule":
        item = create_schedule_event(ScheduleCreate(**payload)).model_dump()
    elif kind == "expense":
        item = add_record("expenses", ExpenseCreate(**payload))
    elif kind == "habit":
        item = add_record("habits", HabitCreate(**payload))
    elif kind == "goal":
        item = add_record("goals", GoalCreate(**payload))
    elif kind == "idea":
        item = add_record("ideas", IdeaCreate(**payload))
    elif kind == "project":
        item = create_project(ProjectCreate(**payload))
    elif kind == "treehole":
        if not request.password or len(request.password) < 6 or request.unlock_date is None:
            raise ValueError("树洞需要至少 6 位密码和解锁日期")
        item = seal_treehole(TreeholeWrite(content=str(payload.get("content") or proposal.source_text), password=request.password, unlock_date=request.unlock_date, response_mode="listen"))
    else:
        raise ValueError("不支持的收件箱类型")
    target_id = str(item.get("id"))
    if request.project_id and kind in {"todo", "schedule", "idea"}:
        if kind == "todo":
            link_project_task(request.project_id, target_id)
        elif kind == "schedule":
            link_project_event(request.project_id, target_id)
        else:
            link_project_idea(request.project_id, target_id)
    action = record_action(kind, target_id, {"proposal": proposal.model_dump(mode="json"), "project_id": request.project_id})
    return {"item": item, "action": action}


def undo_action(action_id: str) -> dict[str, Any] | None:
    connection = _connect()
    try:
        row = connection.execute("SELECT * FROM inbox_actions WHERE id = ?", (action_id,)).fetchone()
        if not row or row["undone"]:
            return None
        kind, target_id = str(row["kind"]), str(row["target_id"])
        def remove_project_with_created_children() -> bool:
            project = _get_raw_project(target_id)
            if not project:
                return False
            for task_id in project.get("task_ids", []):
                delete_todo(str(task_id))
            for event_id in project.get("event_ids", []):
                delete_schedule_event(str(event_id))
            return delete_project(target_id)

        handlers = {
            "todo": lambda: delete_todo(target_id),
            "schedule": lambda: delete_schedule_event(target_id),
            "expense": lambda: delete_record("expenses", target_id),
            "habit": lambda: delete_record("habits", target_id),
            "goal": lambda: delete_record("goals", target_id),
            "idea": lambda: delete_record("ideas", target_id),
            "project": remove_project_with_created_children,
            "treehole": lambda: delete_capsule(target_id),
        }
        removed = handlers[kind]() if kind in handlers else False
        if not removed:
            return None
        if kind in {"todo", "schedule", "idea"}:
            relation_key = {"todo": "task_ids", "schedule": "event_ids", "idea": "idea_ids"}[kind]
            for project in list_projects(include_archived=True):
                raw = _get_raw_project(project["id"])
                if raw and target_id in raw.get(relation_key, []):
                    raw[relation_key] = [item_id for item_id in raw[relation_key] if item_id != target_id]
                    _save_project(raw)
        with connection:
            connection.execute("UPDATE inbox_actions SET undone = 1 WHERE id = ?", (action_id,))
        return {"id": action_id, "kind": kind, "target_id": target_id, "undone": True}
    finally:
        connection.close()


def recent_actions(limit: int = 20) -> list[dict[str, Any]]:
    connection = _connect()
    try:
        rows = connection.execute("SELECT * FROM inbox_actions ORDER BY created_at DESC LIMIT ?", (max(1, min(limit, 100)),)).fetchall()
    finally:
        connection.close()
    return [
        {"id": row["id"], "kind": row["kind"], "target_id": row["target_id"], "payload": json.loads(row["payload"]), "undone": bool(row["undone"]), "created_at": row["created_at"]}
        for row in rows
    ]


def build_weekly_review(start_value: str | None = None) -> dict[str, Any]:
    end = date.today()
    start = date.fromisoformat(start_value) if start_value else end - timedelta(days=6)
    if start > end:
        raise ValueError("复盘开始日期不能晚于今天")
    todos = list_todos()
    schedule = list_schedule()
    focus = list_focus_sessions()
    moods = [item for item in list_records("moods") if start.isoformat() <= str(item.get("date")) <= end.isoformat()]
    expenses = [item for item in list_records("expenses") if start.isoformat() <= str(item.get("date")) <= end.isoformat()]
    reflections = [item for item in list_reflections() if start.isoformat() <= item.date <= end.isoformat()]
    completed_todos = [item for item in todos if item.done and start.isoformat() <= str(item.completed_at or "")[:10] <= end.isoformat()]
    completed_events = [item for item in schedule if item.done and start.isoformat() <= str(item.completed_at or item.date)[:10] <= end.isoformat()]
    focus_minutes = sum(item.completed_minutes for item in focus if start.isoformat() <= item.started_at[:10] <= end.isoformat())
    active_todos = [item for item in todos if not item.done]
    overdue = [item for item in active_todos if item.due_date and item.due_date < end.isoformat()]
    habits = list_habits()
    projects = list_projects()
    goals = list_goals()
    ideas = sorted(list_records("ideas"), key=lambda item: str(item.get("created_at") or ""))
    total_expense = round(sum(float(item.get("amount") or 0) for item in expenses), 2)
    mood_average = round(sum(int(item.get("score") or 0) for item in moods) / len(moods), 1) if moods else None
    wins: list[str] = []
    watchouts: list[str] = []
    if completed_todos or completed_events:
        wins.append(f"完成了 {len(completed_todos) + len(completed_events)} 项任务与日程")
    if focus_minutes:
        wins.append(f"留下了 {focus_minutes} 分钟专注时间")
    strong_habits = [item for item in habits if item.get("current_streak", 0) >= 3]
    if strong_habits:
        wins.append("守住了 " + "、".join(item["name"] for item in strong_habits[:3]))
    if overdue:
        watchouts.append(f"仍有 {len(overdue)} 项任务逾期，需要重新安排")
    risky_projects = [item for item in projects if item.get("open_risks") or (item.get("days_left") is not None and item["days_left"] < 14 and item["progress"] < 60)]
    if risky_projects:
        watchouts.append("项目需要留意：" + "、".join(item["title"] for item in risky_projects[:3]))
    if mood_average is not None and mood_average < 2.5:
        watchouts.append("本周心情评分偏低，下周计划宜留出恢复空间")
    if not wins:
        wins.append("这一周的数据还不多，愿意回看本身就是一次整理")
    suggestions: list[dict[str, Any]] = []
    next_monday = end + timedelta(days=(7 - end.weekday()))
    for project in [item for item in projects if item.get("status") == "active"][:3]:
        next_step = next((item for item in project.get("milestones", []) if not item.get("done")), None)
        if next_step:
            suggestions.append({"title": f"{project['title']}：{next_step['title']}", "priority": "high" if project.get("days_left") is not None and project["days_left"] < 14 else "medium", "due_date": (next_monday + timedelta(days=2)).isoformat(), "project_id": project["id"], "selected": True})
    for item in overdue[:2]:
        suggestions.append({"title": f"重新推进：{item.title}", "priority": item.priority, "due_date": next_monday.isoformat(), "project_id": None, "selected": False})
    if not suggestions and goals:
        suggestions.append({"title": f"推进目标：{goals[0]['title']}", "priority": "medium", "due_date": (next_monday + timedelta(days=2)).isoformat(), "project_id": None, "selected": True})
    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "metrics": {
            "completed": len(completed_todos) + len(completed_events),
            "focus_minutes": focus_minutes,
            "mood_average": mood_average,
            "expense_total": total_expense,
            "reflection_days": len(reflections),
            "active_tasks": len(active_todos),
            "overdue": len(overdue),
        },
        "wins": wins,
        "watchouts": watchouts,
        "habits": habits,
        "projects": projects,
        "goals": goals,
        "old_idea": ideas[0] if ideas else None,
        "plan_suggestions": suggestions,
    }


def save_weekly_review(value: WeeklyReviewSave) -> dict[str, Any]:
    date.fromisoformat(value.week_start)
    now = _now()
    connection = _connect()
    try:
        existing = connection.execute("SELECT id, created_at FROM weekly_reviews WHERE week_start = ?", (value.week_start,)).fetchone()
        review_id = str(existing["id"]) if existing else uuid4().hex
        created_at = str(existing["created_at"]) if existing else now
        payload = {"id": review_id, **value.model_dump(), "created_at": created_at, "updated_at": now}
        with connection:
            connection.execute(
                """INSERT INTO weekly_reviews(id, week_start, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT(week_start) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at""",
                (review_id, value.week_start, json.dumps(payload, ensure_ascii=False), created_at, now),
            )
        return payload
    finally:
        connection.close()


def list_weekly_reviews(limit: int = 12) -> list[dict[str, Any]]:
    connection = _connect()
    try:
        rows = connection.execute("SELECT payload FROM weekly_reviews ORDER BY week_start DESC LIMIT ?", (max(1, min(limit, 52)),)).fetchall()
    finally:
        connection.close()
    return [json.loads(row["payload"]) for row in rows]


def apply_weekly_plan(value: WeeklyPlanApply) -> list[dict[str, Any]]:
    created: list[dict[str, Any]] = []
    for task in value.tasks:
        todo = create_todo(TodoCreate(title=task.title, priority=task.priority, due_date=task.due_date, notes=task.notes))
        if task.project_id:
            link_project_task(task.project_id, todo.id)
        created.append(todo.model_dump())
    return created


def build_projects_context(max_items: int = 5) -> str:
    projects = [item for item in list_projects() if item.get("status") == "active"][:max_items]
    if not projects:
        return "当前没有进行中的项目。"
    return "项目驾驶舱：\n" + "\n".join(
        f"- {item['title']}：进度 {item['progress']}%，剩余 {item['days_left']} 天，开放风险 {item['open_risks']} 个"
        for item in projects
    )
