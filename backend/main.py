import hmac
import json
import re
from datetime import date, datetime, timedelta

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from backend.auth import (
    AUTH_COOKIE_NAME,
    AUTH_SESSION_SECONDS,
    AUTH_USERNAME,
    auth_enabled,
    clear_failed_logins,
    create_session,
    login_allowed,
    record_failed_login,
    request_is_authenticated,
    verify_password,
)

from backend.bazi.chart import build_bazi_chart
from backend.bazi.models import BaziAnalyzeRequest, BaziQuestion, BirthInfo
from backend.chat_archive import archive_chat_exchange, ensure_chat_archive, list_chat_archive, list_chat_messages
from backend.config import DEEPSEEK_FLASH_MODEL
from backend.companion import (
    FocusSessionCreate,
    MemoryCreate,
    ReflectionCreate,
    build_memory_context,
    create_focus_session,
    create_memory,
    delete_memory,
    list_focus_sessions,
    list_memories,
    list_reflections,
    save_reflection,
    weekly_summary,
)
from backend.deepseek_client import ask_deepseek
from backend.edge_ai_learning import EdgeAIStagePatch, EdgeAITaskPatch, get_edge_ai_progress, set_edge_ai_stage, set_edge_ai_task
from backend.fortune.daily import (
    build_daily_user_prompt,
    generate_daily_seed,
    get_or_create_daily_fortune,
    load_daily_fortune,
)
from backend.fortune.tarot import build_tarot_user_prompt, draw_tarot
from backend.fortune.yijing import build_yijing_user_prompt, cast_yijing
from backend.fortune.store import FortuneSyncRequest, list_fortune_results, save_fortune_result, sync_fortune_results
from backend.napcat_runtime import start as start_napcat_bridge
from backend.napcat_runtime import status as napcat_bridge_status
from backend.napcat_runtime import stop as stop_napcat_bridge
from backend.growth import (
    ExpenseCreate,
    GoalCreate,
    HabitCreate,
    IdeaCreate,
    MoodCreate,
    add_record,
    build_growth_context,
    checkin_habit,
    dashboard as growth_dashboard,
    delete_record,
    list_goals,
    list_habits,
    list_records,
    random_idea,
    save_mood,
    toggle_milestone,
)
from backend.music import stream_ambient_music
from backend.profile import UserProfile, build_profile_context, get_profile, save_profile
from backend.productivity import (
    ScheduleCreate,
    ScheduleUpdate,
    ProductivitySyncRequest,
    TodoCreate,
    TodoUpdate,
    create_schedule_event,
    create_todo,
    build_productivity_context,
    delete_schedule_event,
    delete_todo,
    list_schedule,
    list_todos,
    update_schedule_event,
    update_todo,
    sync_productivity,
)
from backend.prompts.bazi_prompt import (
    BAZI_SYSTEM_PROMPT,
    build_bazi_analysis_prompt,
    build_bazi_question_prompt,
)
from backend.prompts.base_prompt import CHAT_SYSTEM_PROMPT
from backend.prompts.fortune_prompt import FORTUNE_SYSTEM_PROMPT
from backend.prompts.starfire_persona import FIREFLY_PARTNER_PROMPT
from backend.treehole import (
    ClockRollbackError,
    TreeholeUnlock,
    TreeholeWrite,
    UnlockRateLimitError,
    seal as seal_treehole,
    status as treehole_status,
    unlock as unlock_treehole,
)
from backend.workspace import (
    InboxCommitRequest,
    InboxProposal,
    ProjectCreate,
    ProjectDecisionCreate,
    ProjectEventCreate,
    ProjectLinkCreate,
    ProjectMilestoneCreate,
    ProjectRiskCreate,
    ProjectTaskCreate,
    ProjectUpdate,
    WeeklyPlanApply,
    WeeklyReviewSave,
    add_project_milestone,
    add_project_decision,
    add_project_event,
    add_project_link,
    add_project_risk,
    add_project_task,
    apply_weekly_plan,
    build_projects_context,
    build_weekly_review,
    commit_inbox,
    create_project,
    delete_project,
    get_project,
    link_project_idea,
    list_projects,
    list_weekly_reviews,
    parse_inbox_locally,
    recent_actions,
    resolve_project_risk,
    save_weekly_review,
    toggle_project_milestone,
    undo_action,
    update_project,
)


app = FastAPI(title="Firefly", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "app://."],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def require_cloud_auth(request: Request, call_next):
    public_paths = {"/health", "/auth/login", "/auth/status"}
    if (
        auth_enabled()
        and request.method != "OPTIONS"
        and request.url.path not in public_paths
        and not request_is_authenticated(request)
    ):
        return Response(
            content=json.dumps({"detail": "authentication required"}),
            status_code=401,
            media_type="application/json",
        )
    return await call_next(request)


class TarotRequest(BaseModel):
    question: str = Field(..., min_length=1)
    spread: str = "three"


class YijingRequest(BaseModel):
    question: str = Field(..., min_length=1)


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=80)
    password: str = Field(..., min_length=1, max_length=256)


@app.get("/auth/status")
def auth_status(request: Request) -> dict[str, object]:
    authenticated = request_is_authenticated(request)
    return {
        "enabled": auth_enabled(),
        "authenticated": authenticated,
        "username": AUTH_USERNAME if authenticated else None,
    }


@app.post("/auth/login")
def auth_login(payload: LoginRequest, request: Request, response: Response) -> dict[str, object]:
    if not auth_enabled():
        return {"authenticated": True, "username": AUTH_USERNAME}
    client_key = request.client.host if request.client else "unknown"
    if not login_allowed(client_key):
        raise HTTPException(status_code=429, detail="尝试次数过多，请稍后再试")
    username_ok = hmac.compare_digest(payload.username, AUTH_USERNAME)
    password_ok = verify_password(payload.password)
    if not username_ok or not password_ok:
        record_failed_login(client_key)
        raise HTTPException(status_code=401, detail="用户名或密码不正确")
    clear_failed_logins(client_key)
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=create_session(AUTH_USERNAME),
        max_age=AUTH_SESSION_SECONDS,
        httponly=True,
        secure=True,
        samesite="strict",
        path="/",
    )
    return {"authenticated": True, "username": AUTH_USERNAME}


@app.post("/auth/logout")
def auth_logout(response: Response) -> dict[str, bool]:
    response.delete_cookie(AUTH_COOKIE_NAME, path="/", secure=True, httponly=True, samesite="strict")
    return {"authenticated": False}


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    history: list[dict[str, str]] = Field(default_factory=list)
    session_id: str = Field(default="unknown", max_length=120)
    use_persistent_context: bool = True


class HabitCheckinRequest(BaseModel):
    date: str | None = None


class MilestonePatch(BaseModel):
    done: bool


class CreativeRequest(BaseModel):
    mode: str = Field(..., pattern="^(continue|polish|organize|naming|copy)$")
    content: str = Field(..., min_length=1, max_length=20_000)
    tone: str = Field(default="自然", max_length=30)
    keywords: list[str] = Field(default_factory=list, max_length=12)
    iteration: str = Field(default="", max_length=500)


class InboxParseRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)


class DonePatch(BaseModel):
    done: bool


class ResolvedPatch(BaseModel):
    resolved: bool


class IdeaLinkRequest(BaseModel):
    idea_id: str = Field(..., min_length=1, max_length=64)


TIME_PERIODS = {
    "早上": ("08:30", "11:30"),
    "上午": ("08:30", "11:30"),
    "中午": ("12:00", "13:00"),
    "下午": ("14:00", "18:00"),
    "晚上": ("19:00", "22:00"),
}

SCHEDULE_EXTRACT_SYSTEM_PROMPT = """
你是 Firefly 的日程结构化抽取器。你的任务是把用户的自然语言转成严格 JSON，不要输出解释。

输出格式必须是：
{
  "should_create": true/false,
  "needs_clarification": true/false,
  "clarification": "需要追问时的一句话，否则为空字符串",
  "events": [
    {
      "title": "简短标题",
      "date": "YYYY-MM-DD",
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "category": "study|project|life|deadline|other",
      "notes": ""
    }
  ]
}

规则：
- 只在用户表达”要安排/添加/提醒/计划/将要做某事”时 should_create=true。
- 如果只是闲聊、询问建议、复盘过去，不要创建。
- 必须把相对日期换算成绝对日期。今天、明天、后天、本周几、下周几都要结合参考日期。
- “明早八点到九点我要打球”应创建一条，title 为”打球”，日期为明天，时间 08:00-09:00。
- 只有开始时间、没有结束时间时，默认 end_time = start_time + 1 小时。不要追问。
- “下午””晚上”等模糊时段可以用参考时段，但如果没有日期且无法从上下文推断，needs_clarification=true。
- 一句话里有多件事时，拆成多条 events。
- 时间必须 24 小时制，补零，例如 03:00。
- 标题不要包含日期、时间、编号、客套话。
- category 根据语义选择：学习 study，项目/比赛/开发 project，生活娱乐 life，截止 deadline，不确定 other。
- 如果 should_create=false，events 必须为空数组。
""".strip()


@app.get("/")
def root() -> dict[str, str]:
    return {
        "name": "Firefly",
        "message": "Local personal assistant powered by DeepSeek API.",
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/music/ambient")
def ambient_music(request: Request) -> StreamingResponse:
    return stream_ambient_music(request.headers.get("range"))


@app.get("/qq/napcat")
def get_napcat_status() -> dict[str, object]:
    """返回桌面端按需启动的 NapCat QQ 桥接器状态。"""
    return napcat_bridge_status()


@app.post("/qq/napcat/start")
def start_napcat(request: Request) -> dict[str, object]:
    """启动只允许 QQ 449140441 私聊的 NapCat 桥接器。"""
    return start_napcat_bridge(str(request.base_url).rstrip("/"))


@app.post("/qq/napcat/stop")
def stop_napcat() -> dict[str, object]:
    return stop_napcat_bridge()


@app.on_event("shutdown")
def shutdown_napcat_bridge() -> None:
    stop_napcat_bridge()


@app.get("/profile")
def read_profile() -> UserProfile:
    return get_profile()


@app.put("/profile")
def update_profile(profile: UserProfile) -> UserProfile:
    return save_profile(profile)


@app.get("/todos")
def read_todos() -> dict[str, object]:
    return {"items": list_todos()}


@app.get("/learning/edge-ai")
def read_edge_ai_progress() -> dict[str, object]:
    return get_edge_ai_progress()


@app.patch("/learning/edge-ai/{stage_id}")
def patch_edge_ai_stage(stage_id: str, patch: EdgeAIStagePatch) -> dict[str, object]:
    state = set_edge_ai_stage(stage_id, patch.done)
    if state is None:
        raise HTTPException(status_code=404, detail="Learning stage not found")
    return state


@app.patch("/learning/edge-ai/{stage_id}/tasks/{task_id}")
def patch_edge_ai_task(stage_id: str, task_id: str, patch: EdgeAITaskPatch) -> dict[str, object]:
    state = set_edge_ai_task(stage_id, task_id, patch.checked)
    if state is None:
        raise HTTPException(status_code=404, detail="Learning task not found")
    return state


@app.post("/todos")
def add_todo(item: TodoCreate) -> dict[str, object]:
    return {"item": create_todo(item)}


@app.patch("/todos/{todo_id}")
def patch_todo(todo_id: str, patch: TodoUpdate) -> dict[str, object]:
    item = update_todo(todo_id, patch)
    if item is None:
        raise HTTPException(status_code=404, detail="Todo not found")
    return {"item": item}


@app.delete("/todos/{todo_id}")
def remove_todo(todo_id: str) -> dict[str, object]:
    if not delete_todo(todo_id):
        raise HTTPException(status_code=404, detail="Todo not found")
    return {"ok": True}


@app.get("/schedule")
def read_schedule() -> dict[str, object]:
    return {"items": list_schedule()}


@app.post("/schedule")
def add_schedule_event(item: ScheduleCreate) -> dict[str, object]:
    return {"item": create_schedule_event(item)}


@app.patch("/schedule/{event_id}")
def patch_schedule_event(event_id: str, patch: ScheduleUpdate) -> dict[str, object]:
    item = update_schedule_event(event_id, patch)
    if item is None:
        raise HTTPException(status_code=404, detail="Schedule event not found")
    return {"item": item}


@app.delete("/schedule/{event_id}")
def remove_schedule_event(event_id: str) -> dict[str, object]:
    if not delete_schedule_event(event_id):
        raise HTTPException(status_code=404, detail="Schedule event not found")
    return {"ok": True}


@app.post("/sync/productivity")
def merge_productivity(payload: ProductivitySyncRequest) -> dict[str, object]:
    return sync_productivity(payload)


@app.get("/chat/archive")
def read_chat_archive(limit: int = 500) -> dict[str, object]:
    return {"items": list_chat_archive(limit)}


@app.get("/chat/history")
def read_chat_history(limit: int = 500) -> dict[str, object]:
    """返回网页、桌面端和手机端共同使用的云端聊天历史。"""
    return {"items": list_chat_messages(limit)}


@app.get("/chat/archive/export")
def export_chat_archive() -> FileResponse:
    archive_path = ensure_chat_archive()
    return FileResponse(
        archive_path,
        media_type="application/x-ndjson",
        filename=f"firefly-chat-{date.today().isoformat()}.jsonl",
    )


@app.get("/companion/reflections")
def read_reflections() -> dict[str, object]:
    return {"items": list_reflections()}


@app.post("/companion/reflections")
def add_reflection(item: ReflectionCreate) -> dict[str, object]:
    return {"item": save_reflection(item)}


@app.get("/companion/memories")
def read_memories() -> dict[str, object]:
    return {"items": list_memories()}


@app.post("/companion/memories")
def add_memory(item: MemoryCreate) -> dict[str, object]:
    return {"item": create_memory(item)}


@app.delete("/companion/memories/{memory_id}")
def remove_memory(memory_id: str) -> dict[str, object]:
    if not delete_memory(memory_id):
        raise HTTPException(status_code=404, detail="Memory not found")
    return {"ok": True}


@app.get("/companion/focus")
def read_focus_sessions() -> dict[str, object]:
    return {"items": list_focus_sessions()}


@app.post("/companion/focus")
def add_focus_session(item: FocusSessionCreate) -> dict[str, object]:
    return {"item": create_focus_session(item)}


@app.get("/companion/weekly")
def read_weekly_summary() -> dict[str, object]:
    return weekly_summary()


INBOX_CLASSIFY_PROMPT = """
你是 Firefly 万能收件箱的结构化分类器。只返回一个 JSON 对象，不要解释。
可用 kind：todo、schedule、expense、habit、goal、idea、project、treehole。
JSON 必须包含：kind、title、description、confidence、rationale、payload、missing_fields。
payload 规则：
- todo: title, priority(low|medium|high), due_date(null或YYYY-MM-DD), notes
- schedule: title, date(YYYY-MM-DD), start_time(HH:MM或空), end_time, category(study|project|life|deadline|other), notes
- expense: amount(数字), category, note, date(YYYY-MM-DD)
- habit: name, frequency(daily|weekly), weekly_target(1-7)
- goal: title, deadline(YYYY-MM-DD), milestones([])
- idea: content, category(待分类), tags([])
- project: title, description, deadline(null或YYYY-MM-DD), milestones([]), tasks([])
- treehole: content；并将 password、unlock_date 放进 missing_fields
相对日期必须结合参考日期换成绝对日期。不要创建数据，只做分类和预览。
""".strip()


def _parse_universal_inbox(text: str) -> InboxProposal:
    local = parse_inbox_locally(text)
    if local.confidence >= 0.88:
        return local
    try:
        raw = ask_deepseek(
            [
                {"role": "system", "content": INBOX_CLASSIFY_PROMPT},
                {"role": "user", "content": f"参考日期：{date.today().isoformat()}\n用户输入：{text}"},
            ],
            temperature=0.0,
            model=DEEPSEEK_FLASH_MODEL,
        )
        parsed = _parse_json_object(raw)
        if not parsed:
            return local
        parsed["source_text"] = text
        return InboxProposal.model_validate(parsed)
    except Exception:
        return local


@app.post("/inbox/parse")
def parse_inbox(payload: InboxParseRequest) -> dict[str, object]:
    return {"proposal": _parse_universal_inbox(payload.text)}


@app.post("/inbox/commit")
def confirm_inbox(payload: InboxCommitRequest) -> dict[str, object]:
    try:
        return commit_inbox(payload)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/inbox/actions")
def read_inbox_actions(limit: int = 20) -> dict[str, object]:
    return {"items": recent_actions(limit)}


@app.delete("/inbox/actions/{action_id}")
def revert_inbox_action(action_id: str) -> dict[str, object]:
    action = undo_action(action_id)
    if action is None:
        raise HTTPException(status_code=404, detail="操作不存在、已撤销或目标已被修改")
    return {"action": action}


@app.get("/projects")
def read_projects(include_archived: bool = False) -> dict[str, object]:
    return {"items": list_projects(include_archived)}


@app.post("/projects")
def add_project(payload: ProjectCreate) -> dict[str, object]:
    return {"item": create_project(payload)}


@app.get("/projects/{project_id}")
def read_project(project_id: str) -> dict[str, object]:
    item = get_project(project_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"item": item}


@app.patch("/projects/{project_id}")
def patch_project(project_id: str, payload: ProjectUpdate) -> dict[str, object]:
    item = update_project(project_id, payload)
    if item is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"item": item}


@app.delete("/projects/{project_id}")
def remove_project(project_id: str) -> dict[str, object]:
    if not delete_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return {"ok": True, "linked_data_preserved": True}


@app.post("/projects/{project_id}/milestones")
def add_project_milestone_route(project_id: str, payload: ProjectMilestoneCreate) -> dict[str, object]:
    item = add_project_milestone(project_id, payload)
    if item is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"item": item}


@app.patch("/projects/{project_id}/milestones/{milestone_id}")
def patch_project_milestone(project_id: str, milestone_id: str, payload: DonePatch) -> dict[str, object]:
    item = toggle_project_milestone(project_id, milestone_id, payload.done)
    if item is None:
        raise HTTPException(status_code=404, detail="Project or milestone not found")
    return {"item": item}


@app.post("/projects/{project_id}/tasks")
def add_project_task_route(project_id: str, payload: ProjectTaskCreate) -> dict[str, object]:
    item = add_project_task(project_id, payload)
    if item is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"item": item}


@app.post("/projects/{project_id}/events")
def add_project_event_route(project_id: str, payload: ProjectEventCreate) -> dict[str, object]:
    item = add_project_event(project_id, payload)
    if item is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"item": item}


@app.post("/projects/{project_id}/ideas")
def link_project_idea_route(project_id: str, payload: IdeaLinkRequest) -> dict[str, object]:
    item = link_project_idea(project_id, payload.idea_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Project or idea not found")
    return {"item": item}


@app.post("/projects/{project_id}/risks")
def add_project_risk_route(project_id: str, payload: ProjectRiskCreate) -> dict[str, object]:
    item = add_project_risk(project_id, payload)
    if item is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"item": item}


@app.post("/projects/{project_id}/decisions")
def add_project_decision_route(project_id: str, payload: ProjectDecisionCreate) -> dict[str, object]:
    item = add_project_decision(project_id, payload)
    if item is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"item": item}


@app.post("/projects/{project_id}/links")
def add_project_link_route(project_id: str, payload: ProjectLinkCreate) -> dict[str, object]:
    item = add_project_link(project_id, payload)
    if item is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"item": item}


@app.patch("/projects/{project_id}/risks/{risk_id}")
def patch_project_risk(project_id: str, risk_id: str, payload: ResolvedPatch) -> dict[str, object]:
    item = resolve_project_risk(project_id, risk_id, payload.resolved)
    if item is None:
        raise HTTPException(status_code=404, detail="Project or risk not found")
    return {"item": item}


@app.get("/reviews/weekly")
def read_weekly_review(start: str | None = None) -> dict[str, object]:
    try:
        return build_weekly_review(start)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/reviews/weekly/history")
def read_weekly_review_history(limit: int = 12) -> dict[str, object]:
    return {"items": list_weekly_reviews(limit)}


@app.post("/reviews/weekly")
def finalize_weekly_review(payload: WeeklyReviewSave) -> dict[str, object]:
    try:
        return {"item": save_weekly_review(payload)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="复盘日期格式应为 YYYY-MM-DD") from exc


@app.post("/reviews/weekly/plan")
def create_weekly_plan(payload: WeeklyPlanApply) -> dict[str, object]:
    return {"items": apply_weekly_plan(payload)}


@app.get("/dashboard")
def read_dashboard(period: str = "week") -> dict[str, object]:
    return growth_dashboard("month" if period == "month" else "week")


@app.get("/moods")
def read_moods() -> dict[str, object]:
    return {"items": list_records("moods")}


@app.post("/moods")
def add_mood(item: MoodCreate) -> dict[str, object]:
    try:
        return {"item": save_mood(item)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="心情日期格式应为 YYYY-MM-DD") from exc


@app.post("/expenses")
def add_expense(item: ExpenseCreate) -> dict[str, object]:
    return {"item": add_record("expenses", item)}


@app.get("/habits")
def read_habits() -> dict[str, object]:
    return {"items": list_habits()}


@app.post("/habits")
def add_habit(item: HabitCreate) -> dict[str, object]:
    return {"item": add_record("habits", item)}


@app.post("/habits/{habit_id}/checkin")
def add_habit_checkin(habit_id: str, payload: HabitCheckinRequest) -> dict[str, object]:
    try:
        item = checkin_habit(habit_id, payload.date)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="打卡日期格式应为 YYYY-MM-DD") from exc
    if item is None:
        raise HTTPException(status_code=404, detail="Habit not found")
    return {"item": item}


@app.delete("/habits/{habit_id}")
def remove_habit(habit_id: str) -> dict[str, object]:
    if not delete_record("habits", habit_id):
        raise HTTPException(status_code=404, detail="Habit not found")
    return {"ok": True}


@app.get("/goals")
def read_goals() -> dict[str, object]:
    return {"items": list_goals()}


@app.post("/goals")
def add_goal(item: GoalCreate) -> dict[str, object]:
    return {"item": add_record("goals", item)}


@app.patch("/goals/{goal_id}/milestones/{milestone_id}")
def patch_goal_milestone(goal_id: str, milestone_id: str, payload: MilestonePatch) -> dict[str, object]:
    item = toggle_milestone(goal_id, milestone_id, payload.done)
    if item is None:
        raise HTTPException(status_code=404, detail="Goal or milestone not found")
    return {"item": item}


@app.delete("/goals/{goal_id}")
def remove_goal(goal_id: str) -> dict[str, object]:
    if not delete_record("goals", goal_id):
        raise HTTPException(status_code=404, detail="Goal not found")
    return {"ok": True}


def _classify_idea(content: str) -> tuple[str, list[str]]:
    prompt = (
        "把下面灵感归入一个简短中文类别，并给 2-4 个短标签。只输出 JSON："
        '{"category":"项目点子","tags":["标签"]}\n' + content
    )
    try:
        parsed = _parse_json_object(ask_deepseek([
            {"role": "system", "content": "你是精确的灵感整理助手，只返回 JSON。"},
            {"role": "user", "content": prompt},
        ], temperature=0.1, model=DEEPSEEK_FLASH_MODEL)) or {}
        category = str(parsed.get("category") or "生活想法")[:30]
        tags = [str(tag)[:20] for tag in (parsed.get("tags") or []) if str(tag).strip()][:8]
        return category, tags
    except Exception:
        return "待分类", []


@app.get("/ideas")
def read_ideas() -> dict[str, object]:
    return {"items": list_records("ideas")}


@app.post("/ideas")
def add_idea(item: IdeaCreate) -> dict[str, object]:
    category, tags = _classify_idea(item.content) if item.category == "待分类" and not item.tags else (item.category, item.tags)
    classified = IdeaCreate(content=item.content, category=category, tags=tags)
    return {"item": add_record("ideas", classified)}


@app.get("/ideas/random")
def read_random_idea() -> dict[str, object]:
    return {"item": random_idea()}


@app.delete("/ideas/{idea_id}")
def remove_idea(idea_id: str) -> dict[str, object]:
    if not delete_record("ideas", idea_id):
        raise HTTPException(status_code=404, detail="Idea not found")
    return {"ok": True}


CREATIVE_PROMPTS = {
    "continue": "延续用户原有视角和语言节奏续写，不抢夺作者意图；直接给出续写正文。",
    "polish": "保留事实与原意，改善用词、节奏和可读性；直接给出润色稿。",
    "organize": "把口语碎片整理为有标题、有层次、自然连贯的文章或笔记。",
    "naming": "根据用途和关键词给出 8 个名称候选，每个附一句简短理由。",
    "copy": "给出 6 条精炼短文案候选，风格有变化且避免空泛套话。",
}


@app.post("/creative/generate")
def generate_creative(payload: CreativeRequest) -> dict[str, object]:
    instruction = CREATIVE_PROMPTS[payload.mode]
    user = f"目标语气：{payload.tone}\n关键词：{'、'.join(payload.keywords)}\n内容：\n{payload.content}"
    if payload.iteration:
        user += f"\n本轮调整要求：{payload.iteration}"
    try:
        answer = ask_deepseek([
            {"role": "system", "content": "你是 Firefly 创作陪练。" + instruction},
            {"role": "user", "content": user},
        ], temperature=0.8, model=DEEPSEEK_FLASH_MODEL)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DeepSeek API call failed: {exc}") from exc
    return {"mode": payload.mode, "answer": answer}


@app.get("/treehole/status")
def read_treehole_status() -> dict[str, object]:
    try:
        return treehole_status()
    except ClockRollbackError as exc:
        raise HTTPException(status_code=409, detail=f"检测到系统时间回退；最后可信时间：{exc}") from exc


@app.post("/treehole/write")
def write_treehole(payload: TreeholeWrite) -> dict[str, object]:
    if payload.response_mode == "comfort" and not payload.cloud_consent:
        raise HTTPException(status_code=400, detail="使用 AI 安慰前必须明确同意将本次内容发送至 DeepSeek")
    try:
        sealed = seal_treehole(payload)
    except ClockRollbackError as exc:
        raise HTTPException(status_code=409, detail=f"检测到系统时间回退；最后可信时间：{exc}") from exc
    fallback = "我听见了。你不需要现在把一切想明白，这些话已经替你安稳地收好了。"
    if payload.response_mode == "listen":
        answer = "我在听。这些话已经封存好了。"
    else:
        try:
            answer = ask_deepseek([
                {"role": "system", "content": "你只负责安静倾听和温柔接住情绪。不要分析、不要建议、不要追问，回复不超过80字。"},
                {"role": "user", "content": payload.content},
            ], temperature=0.7, model=DEEPSEEK_FLASH_MODEL)
        except Exception:
            answer = fallback
    return {**sealed, "answer": answer, "sealed": True}


@app.post("/treehole/unlock")
def open_treehole(payload: TreeholeUnlock) -> dict[str, object]:
    try:
        return unlock_treehole(payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=423, detail=f"尚未到解锁时间：{exc}") from exc
    except UnlockRateLimitError as exc:
        raise HTTPException(status_code=429, detail=f"密码尝试次数过多，请在 {exc.retry_at} 后重试") from exc
    except ClockRollbackError as exc:
        raise HTTPException(status_code=409, detail=f"检测到系统时间回退；最后可信时间：{exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail="密码不正确或封存内容已损坏") from exc


def _ask_fortune(user_prompt: str) -> str:
    prompt_with_profile = f"{build_profile_context()}\n\n{user_prompt}"
    try:
        return ask_deepseek(
            [
                {"role": "system", "content": FORTUNE_SYSTEM_PROMPT},
                {"role": "system", "content": FIREFLY_PARTNER_PROMPT},
                {"role": "user", "content": prompt_with_profile},
            ],
            temperature=0.8,
            model=DEEPSEEK_FLASH_MODEL,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DeepSeek API call failed: {exc}") from exc


def _ask_bazi(user_prompt: str) -> str:
    prompt_with_profile = f"{build_profile_context()}\n\n{user_prompt}"
    try:
        return ask_deepseek(
            [
                {"role": "system", "content": BAZI_SYSTEM_PROMPT},
                {"role": "system", "content": FIREFLY_PARTNER_PROMPT},
                {"role": "user", "content": prompt_with_profile},
            ],
            temperature=0.7,
            model=DEEPSEEK_FLASH_MODEL,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DeepSeek API call failed: {exc}") from exc


def _relative_due_date(message: str) -> str | None:
    today_value = date.today()
    if "后天" in message:
        return (today_value + timedelta(days=2)).isoformat()
    if "明天" in message or "明日" in message:
        return (today_value + timedelta(days=1)).isoformat()
    if "今天" in message or "今日" in message:
        return today_value.isoformat()
    return None


def _todo_keyword(message: str) -> str:
    noise = [
        "帮我", "请", "一下", "一个", "一条", "添加", "加入", "加到", "新建", "创建", "记下", "记一个",
        "完成", "做完", "已完成", "标记为", "标记", "删除", "删掉", "移除", "去掉", "推迟", "延期", "挪到", "改到",
        "改成", "设为", "调整", "待办事项", "待办", "任务", "清单", "高优先级", "中优先级", "低优先级",
        "重要", "紧急", "今天", "今日", "明天", "明日", "后天", "把", "吧", "：", ":",
    ]
    keyword = message
    for word in noise:
        keyword = keyword.replace(word, "")
    return keyword.strip(" ，。！？!?").removesuffix("到").removesuffix("为").strip()


_pending_delete_todo_id: str | None = None


def _try_handle_todo_from_chat(message: str) -> dict[str, object] | None:
    global _pending_delete_todo_id
    if _pending_delete_todo_id and _natural_confirm(message):
        todo_id = _pending_delete_todo_id
        _pending_delete_todo_id = None
        deleted = delete_todo(todo_id)
        return {"type": "todo_deleted", "message": message, "answer": "这条待办已经删除。" if deleted else "这条待办已经不存在了。"}
    if not any(word in message for word in ["待办", "任务", "清单"]):
        _pending_delete_todo_id = None
        return None
    keyword = _todo_keyword(message)
    active = [item for item in list_todos() if not item.done]

    if any(word in message for word in ["添加", "加入", "加到", "新建", "创建", "记下", "记一个"]):
        if not keyword:
            return {"type": "chat", "message": message, "answer": "可以，想加入清单的具体事情是什么？"}
        priority = "high" if any(word in message for word in ["重要", "高优先级", "紧急"]) else "low" if "低优先级" in message else "medium"
        item = create_todo(TodoCreate(title=keyword[:80], priority=priority, due_date=_relative_due_date(message)))
        due_text = f"，截止 {item.due_date}" if item.due_date else ""
        return {"type": "todo_created", "message": message, "item": item, "answer": f"记下了：「{item.title}」{due_text}。"}

    if any(word in message for word in ["删除", "删掉", "移除", "去掉"]):
        candidates = [item for item in active if keyword and keyword in item.title]
        if len(candidates) == 1:
            _pending_delete_todo_id = candidates[0].id
            return {"type": "chat", "message": message, "answer": f"确认删除待办「{candidates[0].title}」吗？回复「确认」执行。"}
        if len(candidates) > 1:
            return {"type": "chat", "message": message, "answer": "我找到了几条相似待办，再说具体一点标题吧。"}
        return None

    if any(word in message for word in ["完成", "做完", "标记为完成", "已完成"]):
        candidates = [item for item in active if keyword and keyword in item.title]
        if len(candidates) == 1:
            updated = update_todo(candidates[0].id, TodoUpdate(done=True))
            return {"type": "todo_updated", "message": message, "item": updated, "answer": f"好，已经把「{candidates[0].title}」标记为完成。"}
        if len(candidates) > 1:
            return {"type": "chat", "message": message, "answer": "我找到了几条相似待办，再说具体一点标题吧。"}
        return None

    if any(word in message for word in ["推迟", "延期", "挪到", "改到"]):
        due_date = _relative_due_date(message)
        candidates = [item for item in active if keyword and keyword in item.title]
        if due_date and len(candidates) == 1:
            updated = update_todo(candidates[0].id, TodoUpdate(due_date=due_date))
            return {"type": "todo_updated", "message": message, "item": updated, "answer": f"已经把「{candidates[0].title}」调整到 {due_date}。"}
        return None

    if "优先级" in message and any(word in message for word in ["改成", "设为", "调整"]):
        candidates = [item for item in active if keyword and keyword in item.title]
        priority = "high" if "高优先级" in message else "low" if "低优先级" in message else "medium"
        if len(candidates) == 1:
            updated = update_todo(candidates[0].id, TodoUpdate(priority=priority))
            label = {"high": "高", "medium": "中", "low": "低"}[priority]
            return {"type": "todo_updated", "message": message, "item": updated, "answer": f"已经把「{candidates[0].title}」调整为{label}优先级。"}
        return None

    return None


def _try_create_schedule_from_chat(message: str) -> dict[str, object] | None:
    if not _looks_like_schedule_intent(message):
        return None

    extracted = _extract_schedule_with_ai(message)
    if extracted is None or not extracted.get("should_create"):
        return None

    if extracted.get("needs_clarification"):
        return {
            "type": "chat",
            "message": message,
            "answer": extracted.get("clarification") or "可以记。你再补一下日期或时间，我就加进去。",
        }

    event_inputs = _coerce_extracted_schedule_events(extracted.get("events"))
    if not event_inputs:
        return None

    events = [create_schedule_event(item) for item in event_inputs]
    return _schedule_created_response(message, events)


# ── 日程删除 ──────────────────────────────────────

DELETE_CONFIRM_PREFIX = "DELETE "
# 待确认删除的日程 ID，全局只有一个（仅一个用户用）
_pending_delete_event_id: str | None = None

def _looks_like_delete_intent(message: str) -> bool:
    delete_words = ["删除", "删掉", "去掉", "移除", "取消"]
    target_words = ["日程", "安排", "提醒", "事项", "待办"]
    msg = message.strip()
    # 匹配 "DELETE <uuid>" 确认格式
    if msg.upper().startswith(DELETE_CONFIRM_PREFIX.upper()):
        return True
    has_delete = any(w in msg for w in delete_words)
    has_target = any(w in msg for w in target_words)
    return has_delete and has_target


def _natural_confirm(msg: str) -> bool:
    """检查消息是否为自然语言确认。"""
    confirm_words = [
        "确认", "好的", "好", "嗯", "可以", "行", "是的", "对",
        "删吧", "删掉吧", "ok", "yes", "y", "done", "删",
    ]
    return msg.lower().strip().rstrip("。！!？?.") in confirm_words


def _try_handle_delete(message: str) -> dict[str, object] | None:
    global _pending_delete_event_id
    msg = message.strip()

    # ── 自然确认：有待确认的删除 + 用户说"确认/好的/行" ──
    if _pending_delete_event_id and _natural_confirm(msg):
        event_id = _pending_delete_event_id
        _pending_delete_event_id = None
        deleted = delete_schedule_event(event_id)
        if deleted:
            return {
                "type": "chat",
                "message": message,
                "answer": f"[DELETED]\n日程已删除。（ID: {event_id}）",
            }
        return {
            "type": "chat",
            "message": message,
            "answer": f"[ERROR] 日程不存在或已被删除。（ID: {event_id}）",
        }

    # ── 精确匹配 DELETE <uuid>（向后兼容）──
    if msg.upper().startswith(DELETE_CONFIRM_PREFIX.upper()):
        event_id = msg[len(DELETE_CONFIRM_PREFIX):].strip().split()[0]
        _pending_delete_event_id = None
        if not event_id or not re.fullmatch(r"[a-f0-9]{32}", event_id):
            return {
                "type": "chat",
                "message": message,
                "answer": f"[ERROR] 无效的日程 ID：{event_id}",
            }
        deleted = delete_schedule_event(event_id)
        if deleted:
            return {
                "type": "chat",
                "message": message,
                "answer": f"[DELETED]\n日程已删除。（ID: {event_id}）",
            }
        return {
            "type": "chat",
            "message": message,
            "answer": f"[ERROR] 日程不存在或已被删除。（ID: {event_id}）",
        }

    # ── 删除意图：搜索匹配日程 ──
    if not _looks_like_delete_intent(msg):
        # 用户说了别的东西，清除待确认状态
        _pending_delete_event_id = None
        return None

    noise = ["删除", "删掉", "去掉", "移除", "取消", "日程", "安排", "提醒", "事项", "待办", "帮我", "请", "那个", "这个", "一下", "一个"]
    keyword = msg
    for w in noise:
        keyword = keyword.replace(w, "")
    keyword = keyword.strip()

    today_iso = date.today().isoformat()
    all_schedules = list_schedule()
    candidates = [
        e for e in all_schedules
        if e.date >= today_iso and not e.done and (not keyword or keyword in e.title)
    ]

    if not candidates:
        _pending_delete_event_id = None
        return None

    if len(candidates) == 1:
        e = candidates[0]
        _pending_delete_event_id = e.id
        time_str = f"{e.start_time}-{e.end_time}" if e.end_time else e.start_time
        return {
            "type": "chat",
            "message": message,
            "answer": (
                f"[DELETE_CONFIRM]\n"
                f"日程：{e.title}\n"
                f"时间：{e.date} {time_str}\n"
                f"---\n"
                f"确认删除？回复「确认」执行，回复其他内容取消。"
            ),
        }

    # 多个匹配
    _pending_delete_event_id = None
    lines = ["[DELETE_CONFIRM] 找到多个匹配：", ""]
    for e in candidates:
        time_str = f"{e.start_time}-{e.end_time}" if e.end_time else e.start_time
        lines.append(f"  {e.id[:8]}... | {e.date} {time_str} | {e.title}")
    lines.append("")
    lines.append("请更具体地指定要删除的日程，或回复 DELETE <完整ID>。")
    return {
        "type": "chat",
        "message": message,
        "answer": "\n".join(lines),
    }


def _looks_like_schedule_intent(message: str) -> bool:
    action_words = [
        "添加", "加到", "加进", "加入", "加上", "记到", "记一下", "记下",
        "安排", "提醒", "帮我记", "帮我加", "记录", "新建", "创建", "设",
        "帮我设", "加一个", "记一个", "设一个",
    ]
    schedule_words = [
        "日程", "安排", "提醒", "事项", "待办", "计划", "日历", "行程",
        "开会", "上课", "备忘",
    ]
    relative_words = [
        "今天", "明天", "明早", "明晚", "后天", "早上", "上午", "中午",
        "下午", "晚上", "今晚", "周", "星期", "礼拜",
    ]
    # 包含时间数字或相对日期词
    has_date_or_time = (
        bool(re.search(r"\d{1,2}\s*(?:[:：点]|月|\s*号|\s*日)", message))
        or any(word in message for word in relative_words)
    )
    has_action = any(word in message for word in action_words)
    has_schedule_word = any(word in message for word in schedule_words)
    future_intent = any(
        word in message
        for word in ["我要", "我想", "我打算", "需要", "得去", "要去", "要做", "准备", "约了", "约好", "定好", "定了"]
    )
    return (
        (has_action and (has_schedule_word or has_date_or_time))
        or (has_date_or_time and (future_intent or has_schedule_word))
    )


def _extract_schedule_with_ai(message: str) -> dict[str, object] | None:
    today_iso = date.today().isoformat()
    user_prompt = (
        f"参考日期：{today_iso}\n"
        f"参考时段：{json.dumps(TIME_PERIODS, ensure_ascii=False)}\n"
        f"用户原文：{message}"
    )
    try:
        raw = ask_deepseek(
            [
                {"role": "system", "content": SCHEDULE_EXTRACT_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.0,
            model=DEEPSEEK_FLASH_MODEL,
        )
    except Exception:
        return None
    return _parse_json_object(raw)


def _parse_json_object(raw: str) -> dict[str, object] | None:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        data = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def _coerce_extracted_schedule_events(events: object) -> list[ScheduleCreate]:
    if not isinstance(events, list):
        return []

    coerced: list[ScheduleCreate] = []
    for event in events:
        if not isinstance(event, dict):
            continue
        title = str(event.get("title") or "").strip()
        event_date = str(event.get("date") or "").strip()
        start_time = str(event.get("start_time") or "").strip()
        end_time = str(event.get("end_time") or "").strip()
        category = str(event.get("category") or "other").strip()
        notes = str(event.get("notes") or "").strip()
        if not title or not _valid_iso_date(event_date):
            continue
        if start_time and not _valid_time(start_time):
            continue
        if end_time and not _valid_time(end_time):
            continue
        # 只有开始时间时，默认 +1 小时
        if start_time and not end_time:
            try:
                h, m = int(start_time[:2]), int(start_time[3:5])
                eh = (h + 1) % 24
                end_time = f"{eh:02d}:{m:02d}"
            except (ValueError, IndexError):
                pass
        if category not in {"study", "project", "life", "deadline", "other"}:
            category = _guess_schedule_category(title)
        coerced.append(
            ScheduleCreate(
                title=title[:40],
                date=event_date,
                start_time=start_time,
                end_time=end_time,
                category=category,
                notes=notes,
            )
        )
    return coerced


def _valid_iso_date(value: str) -> bool:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def _day_period() -> str:
    h = datetime.now().hour
    if 5 <= h < 8:
        return "清晨"
    if 8 <= h < 12:
        return "上午"
    if 12 <= h < 14:
        return "中午"
    if 14 <= h < 18:
        return "下午"
    if 18 <= h < 22:
        return "晚上"
    return "深夜"


def _valid_time(value: str) -> bool:
    if not re.fullmatch(r"\d{2}:\d{2}", value):
        return False
    hour, minute = value.split(":")
    return 0 <= int(hour) <= 23 and 0 <= int(minute) <= 59


def _schedule_created_response(message: str, events: list[object]) -> dict[str, object]:
    lines = []
    for event in events:
        time_text = f"{event.start_time}-{event.end_time}" if event.start_time and event.end_time else event.start_time or "未定时间"
        lines.append(f"- {event.date} {time_text}，{event.title}")
    count_text = "一条日程" if len(events) == 1 else f"{len(events)} 条日程"
    key = "item" if len(events) == 1 else "items"
    return {
        "type": "schedule_created",
        "message": message,
        key: events[0] if len(events) == 1 else events,
        "answer": f"嗯，已经给你记上 {count_text}。\n\n" + "\n".join(lines),
    }


def _guess_schedule_category(title: str) -> str:
    if any(word in title for word in ["报告", "项目", "代码", "开发", "实验"]):
        return "project"
    if any(word in title for word in ["考试", "学习", "复习", "作业"]):
        return "study"
    if any(word in title for word in ["截止", "ddl", "DDL", "提交"]):
        return "deadline"
    return "other"


def _squash_newlines(text: str) -> str:
    """短回复合并多余换行，让回复更像短信而不是报告。"""
    # 如果回复很短（<200字），把连续的换行折叠成空格
    if len(text) < 200 and "\n" in text:
        # 保留单换行（段落内），折叠双换行以上（段落间）
        import re
        text = re.sub(r"\n{2,}", " ", text)
        text = text.replace("\n", "")
    return text.strip()


def _build_recent_chat_messages(history: list[dict[str, str]], max_messages: int = 16) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = []
    for item in history:
        role = item.get("role")
        content = str(item.get("content") or "").strip()
        if role not in {"user", "assistant"} or not content:
            continue
        messages.append({"role": role, "content": content[:1200]})
    return messages[-max_messages:]


def _build_persistent_chat_context(history: list[dict[str, str]], max_messages: int = 16) -> list[dict[str, str]]:
    """优先使用客户端上下文；客户端刚打开或未提供上下文时回退到云端归档。"""
    if history:
        return _build_recent_chat_messages(history, max_messages)
    try:
        archived = list_chat_messages(max_messages)
    except OSError:
        archived = []
    return _build_recent_chat_messages(archived, max_messages)


def _archive_chat_result(request: ChatRequest, result: dict[str, object]) -> dict[str, object]:
    """归档失败不影响当前对话；下一轮请求会优先使用客户端上下文。"""
    try:
        archive_chat_exchange(
            session_id=request.session_id,
            user_message=request.message,
            assistant_message=str(result.get("answer") or ""),
            response_type=str(result.get("type") or "chat"),
        )
    except OSError:
        pass
    return result


def _try_handle_growth_from_chat(message: str) -> dict[str, object] | None:
    text = message.strip()
    idea_match = re.match(r"^(?:记个点子|记录灵感|灵感)\s*[：:]\s*(.+)$", text, re.S)
    if idea_match:
        content = idea_match.group(1).strip()
        category, tags = _classify_idea(content)
        item = add_record("ideas", IdeaCreate(content=content, category=category, tags=tags))
        return {"type": "idea_created", "item": item, "answer": f"收进灵感箱了，归在「{category}」里。"}

    checkin_match = re.match(r"^(?:帮我)?打卡\s*[：:]?\s*(.+)$", text)
    if checkin_match:
        keyword = checkin_match.group(1).strip(" 。！!")
        matches = [item for item in list_habits() if keyword in item["name"] or item["name"] in keyword]
        if len(matches) == 1:
            item = checkin_habit(matches[0]["id"])
            return {"type": "habit_checked", "item": item, "answer": f"「{matches[0]['name']}」打卡成功，连续 {item['current_streak']} 天。"}
        if not matches:
            return {"type": "chat", "answer": f"还没有找到「{keyword}」这个习惯，可以先在成长面板创建它。"}

    expense_match = re.match(r"^(?:记账[：:]?\s*)?(.{0,20}?)\s*(\d+(?:\.\d{1,2})?)\s*(?:元|块)?$", text)
    if expense_match and (text.startswith("记账") or any(word in text for word in ["早餐", "午饭", "晚饭", "咖啡", "打车", "买", "消费", "花了"])):
        note = expense_match.group(1).replace("花了", "").strip() or "对话记账"
        amount = float(expense_match.group(2))
        category = "餐饮" if any(word in note for word in ["饭", "餐", "咖啡", "奶茶"]) else "交通" if any(word in note for word in ["车", "地铁", "公交"]) else "其他"
        item = add_record("expenses", ExpenseCreate(amount=amount, category=category, note=note))
        return {"type": "expense_created", "item": item, "answer": f"记好了：{note} {amount:g} 元，归到「{category}」。"}
    return None


@app.post("/chat")
def chat(request: ChatRequest) -> dict[str, object]:
    growth_result = _try_handle_growth_from_chat(request.message)
    if growth_result is not None:
        return _archive_chat_result(request, growth_result)

    todo_result = _try_handle_todo_from_chat(request.message)
    if todo_result is not None:
        return _archive_chat_result(request, todo_result)

    action_result = _try_create_schedule_from_chat(request.message)
    if action_result is not None:
        return _archive_chat_result(request, action_result)

    delete_result = _try_handle_delete(request.message)
    if delete_result is not None:
        return _archive_chat_result(request, delete_result)

    prompt_with_profile = (
        f"现在时间是 {datetime.now().strftime('%Y年%m月%d日 %H:%M')}，{_day_period()}。"
        f"  {build_profile_context()}"
        f"  {build_productivity_context()}"
        f"  {build_growth_context()}"
        f"  {build_projects_context()}"
        f"  {build_memory_context()}"
    )
    context_messages = (
        _build_persistent_chat_context(request.history)
        if request.use_persistent_context
        else _build_recent_chat_messages(request.history)
    )
    try:
        answer = ask_deepseek(
            [
                {"role": "system", "content": CHAT_SYSTEM_PROMPT},
                {"role": "system", "content": FIREFLY_PARTNER_PROMPT},
                {"role": "system", "content": prompt_with_profile},
                *context_messages,
                {"role": "user", "content": request.message},
            ],
            temperature=0.7,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DeepSeek API call failed: {exc}") from exc

    # 日常短回复合并换行，读起来像短信而不是报告。
    answer = _squash_newlines(answer)
    return _archive_chat_result(request, {"type": "chat", "message": request.message, "answer": answer})


@app.post("/bazi/chart")
def bazi_chart(request: BirthInfo) -> dict[str, object]:
    try:
        chart = build_bazi_chart(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"type": "bazi_chart", "chart": chart}


@app.post("/bazi/analyze")
def bazi_analyze(request: BaziAnalyzeRequest) -> dict[str, object]:
    try:
        birth_info = BirthInfo(**request.model_dump(exclude={"focus", "period"}))
        chart = build_bazi_chart(birth_info)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    prompt = build_bazi_analysis_prompt(chart, request.focus, request.period)
    answer = _ask_bazi(prompt)
    result = {
        "type": "bazi_analysis",
        "focus": request.focus,
        "period": request.period,
        "answer": answer,
    }
    save_fortune_result("bazi", date.today().isoformat(), result)
    return result


@app.post("/bazi/ask")
def bazi_ask(request: BaziQuestion) -> dict[str, object]:
    try:
        chart = build_bazi_chart(request.birth_info)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    prompt = build_bazi_question_prompt(chart, request.question, request.focus)
    answer = _ask_bazi(prompt)
    return {
        "type": "bazi_question",
        "chart": chart,
        "question": request.question,
        "answer": answer,
    }


@app.post("/fortune/tarot")
def tarot(request: TarotRequest) -> dict[str, object]:
    try:
        cards = draw_tarot(request.spread)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    user_prompt = build_tarot_user_prompt(request.question, cards)
    answer = _ask_fortune(user_prompt)
    result = {
        "type": "tarot",
        "question": request.question,
        "cards": cards,
        "answer": answer,
    }
    save_fortune_result("tarot", date.today().isoformat(), result)
    return result


@app.post("/fortune/yijing")
def yijing(request: YijingRequest) -> dict[str, object]:
    gua = cast_yijing()
    user_prompt = build_yijing_user_prompt(request.question, gua)
    answer = _ask_fortune(user_prompt)
    result = {
        "type": "yijing",
        "question": request.question,
        "gua": gua,
        "answer": answer,
    }
    save_fortune_result("yijing", date.today().isoformat(), result)
    return result


@app.get("/fortune/results/today")
def read_saved_fortune_results() -> dict[str, object]:
    today_iso = date.today().isoformat()
    return {"date": today_iso, "entries": list_fortune_results(today_iso)}


@app.post("/fortune/results/sync")
def merge_fortune_results(payload: FortuneSyncRequest) -> dict[str, object]:
    today_iso = date.today().isoformat()
    return {"date": today_iso, "entries": sync_fortune_results(payload, today_iso)}


@app.get("/fortune/daily/today")
def read_saved_daily_fortune() -> dict[str, object]:
    today_iso = date.today().isoformat()
    cached = load_daily_fortune(today_iso)
    return {
        "available": cached is not None,
        "date": today_iso,
        "result": {**cached, "cached": True} if cached is not None else None,
    }


@app.get("/fortune/daily")
def daily() -> dict[str, object]:
    def generate() -> dict[str, object]:
        seed = generate_daily_seed()
        user_prompt = build_daily_user_prompt(seed)
        answer = _ask_fortune(user_prompt)
        return {
            "type": "daily",
            "seed": seed,
            "answer": answer,
        }

    result, cached = get_or_create_daily_fortune(generate)
    return {**result, "cached": cached}
