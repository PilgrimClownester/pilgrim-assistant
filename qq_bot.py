"""QQ 官方机器人适配器：把 C2C 消息转发给本机 Firefly API。"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from dotenv import load_dotenv


ROOT_DIR = Path(__file__).resolve().parent
SESSIONS_FILE = ROOT_DIR / "data" / "qq_bot_sessions.json"
MAX_HISTORY_MESSAGES = 16
MAX_REPLY_CHARS = 1800
_sessions_lock = threading.Lock()


def _env_flag(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}


def _load_sessions() -> dict[str, list[dict[str, str]]]:
    try:
        value = json.loads(SESSIONS_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(value, dict):
        return {}
    sessions: dict[str, list[dict[str, str]]] = {}
    for user_id, history in value.items():
        if not isinstance(user_id, str) or not isinstance(history, list):
            continue
        clean = [
            {"role": item["role"], "content": item["content"][:1200]}
            for item in history
            if isinstance(item, dict)
            and item.get("role") in {"user", "assistant"}
            and isinstance(item.get("content"), str)
            and item["content"].strip()
        ]
        sessions[user_id] = clean[-MAX_HISTORY_MESSAGES:]
    return sessions


def _save_sessions(sessions: dict[str, list[dict[str, str]]]) -> None:
    SESSIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
    temp_file = SESSIONS_FILE.with_suffix(".tmp")
    temp_file.write_text(json.dumps(sessions, ensure_ascii=False, indent=2), encoding="utf-8")
    temp_file.replace(SESSIONS_FILE)


class FireflyApi:
    def __init__(self, api_base: str) -> None:
        self.api_base = api_base.rstrip("/")
        self.sessions = _load_sessions()

    def clear_history(self, user_id: str) -> None:
        with _sessions_lock:
            self.sessions.pop(user_id, None)
            _save_sessions(self.sessions)

    def chat(self, user_id: str, message: str) -> str:
        with _sessions_lock:
            history = list(self.sessions.get(user_id, []))

        payload = json.dumps({"message": message, "history": history}, ensure_ascii=False).encode("utf-8")
        request = Request(
            f"{self.api_base}/chat",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=90) as response:
                data: Any = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Firefly API 返回 {exc.code}: {detail[:200]}") from exc
        except (URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise RuntimeError("无法连接 Firefly 后端，请确认桌面端或后端正在运行。") from exc

        answer = str(data.get("answer") or "抱歉，我这次没有生成回复。").strip()
        with _sessions_lock:
            new_history = (history + [
                {"role": "user", "content": message[:1200]},
                {"role": "assistant", "content": answer[:1200]},
            ])[-MAX_HISTORY_MESSAGES:]
            self.sessions[user_id] = new_history
            _save_sessions(self.sessions)
        return answer


def _reply_text(answer: str) -> str:
    answer = answer.strip()
    if len(answer) <= MAX_REPLY_CHARS:
        return answer
    return answer[: MAX_REPLY_CHARS - 1].rstrip() + "…"


def run() -> None:
    load_dotenv(ROOT_DIR / ".env")
    app_id = os.getenv("QQ_BOT_APP_ID", "").strip()
    secret = os.getenv("QQ_BOT_SECRET", "").strip()
    if not app_id or not secret:
        raise SystemExit("请先在 .env 中设置 QQ_BOT_APP_ID 和 QQ_BOT_SECRET。")

    try:
        import botpy
        from botpy.message import C2CMessage
    except ImportError as exc:
        raise SystemExit("缺少 qq-botpy，请运行：python -m pip install -r requirements.txt") from exc

    allowed_openids = {
        value.strip() for value in os.getenv("QQ_BOT_ALLOWED_OPENIDS", "").split(",") if value.strip()
    }
    api = FireflyApi(os.getenv("FIREFLY_API_BASE", "http://127.0.0.1:8000"))

    class FireflyQQBot(botpy.Client):
        async def on_ready(self) -> None:
            logging.info("Firefly QQ Bot 已连接；C2C 对话已就绪。")

        async def on_c2c_message_create(self, message: C2CMessage) -> None:
            user_openid = str(getattr(message.author, "user_openid", "")).strip()
            content = str(getattr(message, "content", "")).strip()
            if not user_openid or not content:
                return
            if user_openid not in allowed_openids:
                logging.warning(
                    "拒绝未授权 QQ 用户；其 user_openid=%s。将它填入 QQ_BOT_ALLOWED_OPENIDS 后重启机器人。",
                    user_openid,
                )
                await message.reply(content="此 Firefly 仅允许主人使用。")
                return
            if content in {"/reset", "重置对话", "清空对话"}:
                await asyncio.to_thread(api.clear_history, user_openid)
                await message.reply(content="这段 QQ 对话的上下文已经清空。")
                return
            try:
                answer = await asyncio.to_thread(api.chat, user_openid, content)
            except Exception:
                logging.exception("处理 QQ 消息失败")
                await message.reply(content="我现在连不上 Firefly 后端，稍后再试一次。")
                return
            await message.reply(content=_reply_text(answer))

    intents = botpy.Intents(public_messages=True)
    client = FireflyQQBot(intents=intents)
    client.run(appid=app_id, secret=secret)


if __name__ == "__main__":
    run()
