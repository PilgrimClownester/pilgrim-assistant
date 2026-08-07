"""Build a private, deterministic daily briefing from Firefly's local data."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from backend.companion import list_memories, list_reflections
from backend.growth import list_habits, list_records
from backend.productivity import ScheduleEvent, TodoItem, list_schedule, list_todos
from backend.profile import get_profile
from backend.workspace import list_projects


Period = Literal["morning", "afternoon", "evening"]


def _period_for(hour: int) -> Period:
    if hour < 12:
        return "morning"
    if hour < 18:
        return "afternoon"
    return "evening"


def _minutes(value: str) -> int:
    try:
        hours, minutes = value.split(":", 1)
        return int(hours) * 60 + int(minutes)
    except (AttributeError, TypeError, ValueError):
        return 24 * 60


def _todo_sort_key(item: TodoItem, today: str) -> tuple[int, int, str, str]:
    overdue_rank = 0 if item.due_date and item.due_date < today else 1
    priority_rank = {"high": 0, "medium": 1, "low": 2}.get(item.priority, 3)
    return overdue_rank, priority_rank, item.due_date or "9999-12-31", item.title


def _lead_action(
    active_todos: list[TodoItem],
    today_events: list[ScheduleEvent],
    today: str,
    now_minutes: int,
) -> dict[str, str] | None:
    upcoming = [item for item in today_events if not item.done and _minutes(item.start_time) >= now_minutes]
    if upcoming and _minutes(upcoming[0].start_time) - now_minutes <= 120:
        item = upcoming[0]
        time_text = f"{item.start_time} 开始" if item.start_time else "今天进行"
        return {
            "title": item.title,
            "detail": f"{time_text}，先为它留出一点准备时间。",
            "source": "schedule",
            "target": "schedule",
            "item_id": item.id,
        }
    if active_todos:
        item = sorted(active_todos, key=lambda value: _todo_sort_key(value, today))[0]
        if item.due_date and item.due_date < today:
            reason = "已逾期，先决定完成、拆小或重新安排。"
        elif item.due_date == today:
            reason = "今天到期，适合先向前推进一小步。"
        elif item.priority == "high":
            reason = "这是当前优先级最高的未完成任务。"
        else:
            reason = item.notes or "从一件清楚的小事开始，今天会轻一点。"
        return {
            "title": item.title,
            "detail": reason,
            "source": "todo",
            "target": "todo",
            "item_id": item.id,
        }
    remaining_events = [item for item in today_events if not item.done]
    if remaining_events:
        item = remaining_events[0]
        return {
            "title": item.title,
            "detail": "今天还有这项安排，按自己的节奏完成就好。",
            "source": "schedule",
            "target": "schedule",
            "item_id": item.id,
        }
    return None


def _summary(period: Period, completed: int, pending: int, overdue: int, event_count: int) -> str:
    if period == "evening":
        if completed and pending:
            return f"今天已经完成 {completed} 项，还有 {pending} 项没有收尾；不必全部清空，留下一件给明天就好。"
        if completed:
            return f"今天已经完成 {completed} 项。现在适合把这一天轻轻收好。"
        if pending:
            return f"今天还有 {pending} 项未完成。先决定哪一件值得保留，不需要追赶所有事情。"
        return "今天没有必须收尾的事项，可以安静地结束这一天。"
    if overdue:
        return f"今天有 {event_count} 项日程、{pending} 项待推进，其中 {overdue} 项已经逾期。先重新安排一件就够了。"
    if pending or event_count:
        return f"今天有 {event_count} 项日程、{pending} 项待推进。把注意力留给最重要的一件事。"
    return "今天的安排很轻。可以主动选择一件真正想推进的事。"


def build_daily_brief(day: str | None = None, hour: int | None = None, minute: int | None = None) -> dict[str, Any]:
    now = datetime.now()
    target_date = date.fromisoformat(day) if day else now.date()
    current_hour = now.hour if hour is None else max(0, min(hour, 23))
    current_minute = now.minute if minute is None else max(0, min(minute, 59))
    today = target_date.isoformat()
    period = _period_for(current_hour)

    todos = list_todos()
    schedule = list_schedule()
    active_todos = [item for item in todos if not item.done]
    today_todos = [item for item in todos if item.due_date == today]
    today_events = sorted(
        [item for item in schedule if item.date == today],
        key=lambda item: (_minutes(item.start_time), item.title),
    )
    overdue = [item for item in active_todos if item.due_date and item.due_date < today]
    completed = sum(1 for item in today_todos if item.done) + sum(1 for item in today_events if item.done)
    pending_todos = sum(1 for item in today_todos if not item.done)
    pending_today = pending_todos + sum(1 for item in today_events if not item.done)
    lead = _lead_action(active_todos, today_events, today, current_hour * 60 + current_minute)

    signals: list[dict[str, str]] = []
    if overdue:
        signals.append({
            "kind": "overdue",
            "tone": "warning",
            "title": f"{len(overdue)} 项已经逾期",
            "detail": "重新安排比一直挂起更轻松。",
            "target": "todo",
        })

    unchecked_habits = [item for item in list_habits() if not item.get("checked_today")]
    if unchecked_habits and period != "morning":
        names = "、".join(str(item.get("name")) for item in unchecked_habits[:2])
        signals.append({
            "kind": "habit",
            "tone": "calm",
            "title": "习惯还留有余地",
            "detail": f"{names}{' 等' if len(unchecked_habits) > 2 else ''}今天尚未记录。",
            "target": "growth",
        })

    projects = [item for item in list_projects() if item.get("status") == "active"]
    risky_projects = [
        item for item in projects
        if item.get("open_risks")
        or (item.get("days_left") is not None and int(item["days_left"]) < 14 and int(item.get("progress") or 0) < 60)
    ]
    if risky_projects:
        signals.append({
            "kind": "project",
            "tone": "attention",
            "title": f"留意项目：{risky_projects[0]['title']}",
            "detail": "有开放风险或临近节点，适合确认下一步。",
            "target": "projects",
        })

    moods = sorted(list_records("moods"), key=lambda item: str(item.get("date") or ""), reverse=True)
    recent_moods = [item for item in moods if str(item.get("date") or "") <= today][:3]
    if len(recent_moods) >= 2 and sum(int(item.get("score") or 0) for item in recent_moods) / len(recent_moods) < 2.5:
        signals.append({
            "kind": "recovery",
            "tone": "gentle",
            "title": "最近的状态有些低",
            "detail": "今天的计划可以少一点，并给恢复留出空间。",
            "target": "growth",
        })

    if period == "evening" and not any(item.date == today for item in list_reflections()):
        signals.append({
            "kind": "reflection",
            "tone": "calm",
            "title": "还没有收好今天",
            "detail": "三句话就够了：完成、消耗、明天。",
            "target": "home",
        })

    active_memories = [item for item in list_memories() if not item.is_frozen]
    memory_echo = None
    if active_memories:
        item = active_memories[target_date.toordinal() % len(active_memories)]
        memory_echo = {"id": item.id, "content": item.content, "category": item.category}

    nickname = get_profile().nickname.strip()
    period_titles = {"morning": "把今天照亮一点", "afternoon": "回到今天的主线", "evening": "把今天轻轻收好"}
    return {
        "date": today,
        "period": period,
        "title": period_titles[period],
        "summary": _summary(
            period,
            completed,
            pending_today if period == "evening" else pending_todos,
            len(overdue),
            len(today_events),
        ),
        "nickname": nickname,
        "lead": lead,
        "signals": signals[:3],
        "memory_echo": memory_echo,
        "stats": {
            "completed": completed,
            "pending": pending_today,
            "overdue": len(overdue),
            "events": len(today_events),
        },
        "generated_at": now.isoformat(timespec="seconds"),
        "private_processing": True,
    }
