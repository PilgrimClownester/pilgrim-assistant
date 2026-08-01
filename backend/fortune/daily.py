import json
import random
from datetime import date, datetime
from pathlib import Path
from threading import RLock
from typing import Callable


DAILY_FORTUNE_PATH = Path(__file__).resolve().parents[2] / "data" / "daily_fortune.json"
_DAILY_FORTUNE_LOCK = RLock()
_MAX_SAVED_DAYS = 90


KEYWORDS = [
    "稳住节奏",
    "重整装备",
    "向前一步",
    "减少内耗",
    "清理战场",
    "等待窗口",
    "集中火力",
    "修复系统",
    "保持航线",
    "点亮星图",
    "低噪声推进",
    "完成闭环",
]

FOCUS_AREAS = [
    "学习与项目推进",
    "整理计划与优先级",
    "沟通与边界",
    "复盘近期选择",
    "恢复精力与睡眠",
    "完成一个小闭环",
]


def load_daily_fortune(target_date: str | None = None) -> dict[str, object] | None:
    date_key = target_date or date.today().isoformat()
    with _DAILY_FORTUNE_LOCK:
        entries = _load_daily_entries()
        item = entries.get(date_key)
        if not isinstance(item, dict):
            return None
        seed = item.get("seed")
        if (
            item.get("type") != "daily"
            or not isinstance(seed, dict)
            or seed.get("date") != date_key
            or not isinstance(item.get("answer"), str)
        ):
            return None
        return dict(item)


def get_or_create_daily_fortune(
    factory: Callable[[], dict[str, object]],
    target_date: str | None = None,
) -> tuple[dict[str, object], bool]:
    date_key = target_date or date.today().isoformat()
    with _DAILY_FORTUNE_LOCK:
        cached = load_daily_fortune(date_key)
        if cached is not None:
            return cached, True

        result = dict(factory())
        seed = result.get("seed")
        if not isinstance(seed, dict) or seed.get("date") != date_key:
            raise ValueError("Daily fortune date does not match the cache key")
        result["generated_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
        _save_daily_fortune(date_key, result)
        return result, False


def _load_daily_entries() -> dict[str, dict[str, object]]:
    if not DAILY_FORTUNE_PATH.exists():
        return {}
    try:
        payload = json.loads(DAILY_FORTUNE_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError, TypeError):
        return {}
    raw_entries = payload.get("entries") if isinstance(payload, dict) else None
    if not isinstance(raw_entries, dict):
        return {}
    return {key: value for key, value in raw_entries.items() if isinstance(key, str) and isinstance(value, dict)}


def _save_daily_fortune(date_key: str, result: dict[str, object]) -> None:
    entries = _load_daily_entries()
    entries[date_key] = result
    if len(entries) > _MAX_SAVED_DAYS:
        entries = {key: entries[key] for key in sorted(entries)[-_MAX_SAVED_DAYS:]}

    DAILY_FORTUNE_PATH.parent.mkdir(parents=True, exist_ok=True)
    temp_path = DAILY_FORTUNE_PATH.with_suffix(".tmp")
    temp_path.write_text(
        json.dumps({"version": 1, "entries": entries}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temp_path.replace(DAILY_FORTUNE_PATH)


def generate_daily_seed() -> dict[str, object]:
    today = date.today().isoformat()
    rng = random.Random(today)
    return {
        "date": today,
        "keyword": rng.choice(KEYWORDS),
        "energy": rng.randint(55, 95),
        "focus": rng.choice(FOCUS_AREAS),
    }


def build_daily_user_prompt(seed: dict[str, object]) -> str:
    return f"""
今日种子信息：
日期：{seed["date"]}
关键词：{seed["keyword"]}
能量值：{seed["energy"]}/100
适合聚焦方向：{seed["focus"]}

请生成用户的今日参考。不要用“作为AI”“根据你提供的信息”“以下是”等开场。
不要在开头写免责声明；如果需要提醒，只在最后用一句很轻的话说明“当作今天的小参考”。

输出格式：
今日关键词：
今天的感觉：
适合推进：
需要避开：
一个小动作：
给你的一句话：

要求：语言温柔、坚定、像 Firefly 在跟 Pilgrim 说话；少一点模板感，少一点玄学腔；必须包含现实行动建议，不要恐吓，不要宣称百分百准确。
不要使用 Markdown 粗体、星号列表或编号列表。标题只用“标题：内容”的形式。
"""
