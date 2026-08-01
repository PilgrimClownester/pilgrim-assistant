"""通过 NapCat 的 OneBot 正向 WebSocket 让个人 QQ 使用 Firefly。"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import random
import re
from datetime import date, datetime
from typing import Any

from dotenv import load_dotenv

from backend.productivity import list_schedule
from qq_bot import FireflyApi, ROOT_DIR, _reply_text


# 允许私聊 Firefly 的 QQ 号。
ALLOWED_QQ = "449140441"
# 机器人的 QQ 号（用于判断群聊 @）。
BOT_QQ = "3420621499"
# 允许在群内 @机器人 触发回复的 QQ 号白名单。空列表 = 所有人 @ 都回复。
ALLOWED_GROUP_USERS: list[str] = ["449140441"]
# 允许回复的群号列表。空列表 = 允许所有群。
ALLOWED_GROUPS: list[str] = []
RECONNECT_DELAY_SECONDS = 5
# 单条消息最大字符数，超过则拆分发送。
MAX_CHUNK_CHARS = 50
# ── 日程提醒 ──────────────────────────────
REMINDER_CHECK_INTERVAL = 60       # 检查间隔（秒）
REMINDER_WINDOW_MINUTES = 10       # 提前多久提醒（分钟）

_reminded_event_ids: set[str] = set()


def _split_sentences(text: str) -> list[str]:
    """把文本按句子边界拆成短块，每条不超过 MAX_CHUNK_CHARS。"""
    if len(text) <= MAX_CHUNK_CHARS:
        return [text]

    # 按句号、感叹号、问号、换行切开
    raw = re.split(r"(?<=[。！？\n])", text)
    chunks: list[str] = []
    buf = ""
    for part in raw:
        part = part.strip()
        if not part:
            continue
        if len(buf) + len(part) <= MAX_CHUNK_CHARS:
            buf += part
        else:
            if buf:
                chunks.append(buf)
            # 如果一个分句本身就超长，强制按长度切
            while len(part) > MAX_CHUNK_CHARS:
                chunks.append(part[:MAX_CHUNK_CHARS])
                part = part[MAX_CHUNK_CHARS:]
            buf = part
    if buf:
        chunks.append(buf)
    return chunks or [text]


async def _send_in_chunks(send_fn: Any, text: str, *args: Any) -> None:
    """把长文本拆成多条短消息，间隔随机延迟发送。"""
    chunks = _split_sentences(text)
    for i, chunk in enumerate(chunks):
        await send_fn(*args, chunk)
        if i < len(chunks) - 1:
            await asyncio.sleep(random.uniform(0.4, 0.8))


def _extract_at_targets(message: object) -> set[str]:
    """从消息段中提取所有 @ 目标的 QQ 号。"""
    if not isinstance(message, list):
        return set()
    targets: set[str] = set()
    for segment in message:
        if not isinstance(segment, dict) or segment.get("type") != "at":
            continue
        data = segment.get("data")
        if isinstance(data, dict):
            qq = str(data.get("qq", "")).strip()
            if qq:
                targets.add(qq)
    return targets


def _message_text(message: object) -> str:
    if isinstance(message, str):
        return message.strip()
    if not isinstance(message, list):
        return ""
    parts: list[str] = []
    for segment in message:
        if not isinstance(segment, dict) or segment.get("type") != "text":
            continue
        data = segment.get("data")
        if isinstance(data, dict):
            parts.append(str(data.get("text") or ""))
    return "".join(parts).strip()


def _group_message_text(message: object) -> str:
    """提取群消息文本，跳过 @ 段。"""
    if isinstance(message, str):
        return message.strip()
    if not isinstance(message, list):
        return ""
    parts: list[str] = []
    for segment in message:
        if not isinstance(segment, dict):
            continue
        if segment.get("type") == "text":
            data = segment.get("data")
            if isinstance(data, dict):
                parts.append(str(data.get("text") or ""))
        # 跳过 at/image/face 等非文本段
    return "".join(parts).strip()


async def _send_private_message(websocket: Any, user_id: str, content: str) -> None:
    await websocket.send(
        json.dumps(
            {
                "action": "send_private_msg",
                "params": {"user_id": int(user_id), "message": _reply_text(content)},
            },
            ensure_ascii=False,
        )
    )


async def _send_group_message(websocket: Any, group_id: str, content: str) -> None:
    await websocket.send(
        json.dumps(
            {
                "action": "send_group_msg",
                "params": {"group_id": int(group_id), "message": _reply_text(content)},
            },
            ensure_ascii=False,
        )
    )


def _is_allowed_group_user(user_id: str) -> bool:
    if not ALLOWED_GROUP_USERS:
        return True
    return user_id in ALLOWED_GROUP_USERS


def _should_reply_group(group_id: str) -> bool:
    if not ALLOWED_GROUPS:
        return True
    return group_id in ALLOWED_GROUPS


async def _handle_payload(websocket: Any, payload: dict[str, Any], api: FireflyApi) -> None:
    if payload.get("post_type") != "message":
        return

    message_type = payload.get("message_type", "")

    # ── 私聊 ──────────────────────────────────
    if message_type == "private":
        user_id = str(payload.get("user_id") or "").strip()
        if user_id != ALLOWED_QQ or payload.get("sub_type") == "group":
            return
        content = _message_text(payload.get("message"))
        if not content:
            return
        if content in {"/reset", "重置对话", "清空对话"}:
            await asyncio.to_thread(api.clear_history, user_id)
            await _send_private_message(websocket, user_id, "这段 QQ 对话的上下文已经清空。")
            return
        try:
            answer = await asyncio.to_thread(api.chat, user_id, content)
            logging.info("私聊 %s → %s", content[:40], answer[:60])
        except Exception:
            logging.exception("处理 NapCat QQ 消息失败")
            await _send_private_message(websocket, user_id, "我现在连不上 Firefly 后端，稍后再试一次。")
            return
        await _send_in_chunks(_send_private_message, answer, websocket, user_id)
        return

    # ── 群聊 ──────────────────────────────────
    if message_type == "group":
        group_id = str(payload.get("group_id") or "").strip()
        sender_qq = str(payload.get("user_id") or "").strip()
        at_targets = _extract_at_targets(payload.get("message"))
        logging.info(
            "收到群消息 group=%s sender=%s at=%s text=%s",
            group_id, sender_qq, at_targets, _group_message_text(payload.get("message"))[:50],
        )

        if not group_id or not _should_reply_group(group_id):
            logging.info("群 %s 不在允许列表中，忽略", group_id)
            return

        # 必须 @ 了机器人才回复
        if BOT_QQ not in at_targets and "all" not in at_targets:
            logging.info("群 %s 未 @ 机器人，忽略", group_id)
            return

        if not _is_allowed_group_user(sender_qq):
            logging.info("群 %s 发送者 %s 不在白名单，忽略", group_id, sender_qq)
            return

        content = _group_message_text(payload.get("message"))
        # 用 group_{群号}_{发送者QQ} 作为对话 ID，保持群内每人独立上下文
        chat_id = f"group_{group_id}_{sender_qq}"

        if content in {"/reset", "重置对话", "清空对话"}:
            await asyncio.to_thread(api.clear_history, chat_id)
            await _send_group_message(websocket, group_id, "这段群聊对话的上下文已经清空。")
            return
        if not content:
            # 纯 @ 没有文字也回复一下
            content = "你好"

        sender_name = ""
        sender = payload.get("sender")
        if isinstance(sender, dict):
            sender_name = (sender.get("card") or sender.get("nickname") or "").strip()

        try:
            answer = await asyncio.to_thread(api.chat, chat_id, content)
        except Exception:
            logging.exception("处理 NapCat 群消息失败")
            await _send_group_message(websocket, group_id, "我现在连不上 Firefly 后端，稍后再试一次。")
            return

        # 回复时 @ 提问的人（仅第一条 @，后续不 @）
        chunks = _split_sentences(answer)
        for i, chunk in enumerate(chunks):
            if i == 0:
                await _send_group_message(websocket, group_id, f"[CQ:at,qq={sender_qq}] {chunk}")
            else:
                await _send_group_message(websocket, group_id, chunk)
            if i < len(chunks) - 1:
                await asyncio.sleep(random.uniform(0.4, 0.8))
        return


# ── 日程提醒 ──────────────────────────────────────────

def _clean_reminded_set(schedule: list[Any]) -> None:
    """清理已过期或已完成的提醒记录。"""
    today_iso = date.today().isoformat()
    now = datetime.now()
    for event in schedule:
        if event.id not in _reminded_event_ids:
            continue
        if event.done or event.date < today_iso:
            _reminded_event_ids.discard(event.id)
        elif event.date == today_iso and event.start_time:
            try:
                start_dt = datetime.strptime(
                    f"{event.date} {event.start_time}", "%Y-%m-%d %H:%M"
                )
                if start_dt < now:
                    _reminded_event_ids.discard(event.id)
            except ValueError:
                pass


async def _send_reminder(
    websocket: Any, event: Any, minutes_until: int
) -> None:
    """发送单条日程提醒。只有开始时间时默认时长 1 小时。"""
    time_str = event.start_time
    end = event.end_time
    if not end:
        # 默认 1 小时
        try:
            from datetime import timedelta
            start_dt = datetime.strptime(
                f"{event.date} {event.start_time}", "%Y-%m-%d %H:%M"
            )
            end = (start_dt + timedelta(hours=1)).strftime("%H:%M")
        except ValueError:
            pass
    if end:
        time_str += f"-{end}"

    if minutes_until <= 1:
        message = f"⏰ {event.title} 现在开始！（{time_str}）"
    else:
        message = f"⏰ {event.title} 将在 {minutes_until} 分钟后开始。（{time_str}）"

    try:
        await _send_private_message(websocket, ALLOWED_QQ, message)
        logging.info("已发送日程提醒：%s（%s %s）", event.title, event.date, event.start_time)
    except Exception:
        logging.exception("发送日程提醒失败：%s", event.title)


async def _check_and_remind(websocket: Any) -> None:
    """检查今天日程，发送到期提醒。"""
    today_iso = date.today().isoformat()
    now = datetime.now()

    try:
        schedule = list_schedule()
    except Exception:
        logging.exception("读取日程数据失败")
        return

    upcoming = [
        e for e in schedule
        if e.date == today_iso and e.start_time and not e.done
    ]
    _clean_reminded_set(schedule)

    for event in upcoming:
        if event.id in _reminded_event_ids:
            continue
        try:
            start_dt = datetime.strptime(
                f"{event.date} {event.start_time}", "%Y-%m-%d %H:%M"
            )
        except ValueError:
            continue
        minutes_until = (start_dt - now).total_seconds() / 60.0
        if 0 <= minutes_until <= REMINDER_WINDOW_MINUTES:
            await _send_reminder(websocket, event, int(minutes_until))
            _reminded_event_ids.add(event.id)


async def _reminder_loop(websocket: Any) -> None:
    """后台循环：定时检查日程并发送提醒。"""
    while True:
        try:
            await _check_and_remind(websocket)
        except asyncio.CancelledError:
            raise
        except Exception:
            logging.exception("日程提醒检查出错")
        await asyncio.sleep(REMINDER_CHECK_INTERVAL)


# ── 主循环 ──────────────────────────────────────────

async def _run_forever(ws_url: str, token: str, api: FireflyApi) -> None:
    try:
        import websockets
    except ImportError as exc:
        raise RuntimeError("缺少 websockets，请运行：python -m pip install -r requirements.txt") from exc

    headers = {"Authorization": f"Bearer {token}"} if token else None
    while True:
        try:
            logging.info("正在连接 NapCat：%s", ws_url)
            async with websockets.connect(ws_url, additional_headers=headers, ping_interval=20, ping_timeout=20) as websocket:
                logging.info(
                    "NapCat 已连接；私聊 QQ %s，群聊 %s，日程提醒已启动。",
                    ALLOWED_QQ,
                    "所有群（@ 即回复）" if not ALLOWED_GROUPS else f"群 {', '.join(ALLOWED_GROUPS)}",
                )
                reminder_task = asyncio.create_task(_reminder_loop(websocket))
                try:
                    async for raw_payload in websocket:
                        try:
                            payload = json.loads(raw_payload)
                        except json.JSONDecodeError:
                            logging.warning("忽略 NapCat 非 JSON 消息")
                            continue
                        if isinstance(payload, dict):
                            await _handle_payload(websocket, payload, api)
                finally:
                    reminder_task.cancel()
                    try:
                        await reminder_task
                    except asyncio.CancelledError:
                        pass
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logging.warning("NapCat 连接已断开：%s；%s 秒后重连。", exc, RECONNECT_DELAY_SECONDS)
            await asyncio.sleep(RECONNECT_DELAY_SECONDS)


def run() -> None:
    load_dotenv(ROOT_DIR / ".env")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    ws_url = os.getenv("NAPCAT_WS_URL", "ws://127.0.0.1:8095").strip()
    token = os.getenv("NAPCAT_TOKEN", "").strip()
    api = FireflyApi(os.getenv("FIREFLY_API_BASE", "http://127.0.0.1:8000"))
    asyncio.run(_run_forever(ws_url, token, api))


if __name__ == "__main__":
    run()
