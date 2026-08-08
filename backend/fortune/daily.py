import json
import random
from datetime import date, datetime
from pathlib import Path
from threading import RLock
from typing import Any, Callable


DAILY_FORTUNE_PATH = Path(__file__).resolve().parents[2] / "data" / "daily_fortune.json"
_DAILY_FORTUNE_LOCK = RLock()
_MAX_SAVED_DAYS = 90
_DAILY_METHOD_VERSION = 2


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
            or item.get("method_version") != _DAILY_METHOD_VERSION
            or not isinstance(seed, dict)
            or seed.get("date") != date_key
            or not isinstance(item.get("yijing"), dict)
            or not isinstance(item.get("answer"), str)
            or not str(item.get("answer") or "").strip()
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
        if not isinstance(result.get("yijing"), dict):
            raise ValueError("Daily fortune requires a Yijing hexagram")
        if not isinstance(result.get("answer"), str) or not str(result.get("answer") or "").strip():
            raise ValueError("Daily fortune answer is empty")
        result["method_version"] = _DAILY_METHOD_VERSION
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


def generate_daily_seed(target_date: str | None = None) -> dict[str, object]:
    today = target_date or date.today().isoformat()
    rng = random.Random(f"firefly-daily-seed-v1:{today}")
    return {
        "date": today,
        "keyword": rng.choice(KEYWORDS),
        "energy": rng.randint(55, 95),
        "focus": rng.choice(FOCUS_AREAS),
    }


def _reality_lines(reality: dict[str, Any] | None) -> str:
    if not reality:
        return "今天没有可用的工作台数据；不要虚构具体任务。"
    stats = reality.get("stats") if isinstance(reality.get("stats"), dict) else {}
    lines = [
        f"待推进 {stats.get('pending', 0)} 项，逾期 {stats.get('overdue', 0)} 项，今日事件 {stats.get('events', 0)} 项。"
    ]
    lead = reality.get("lead") if isinstance(reality.get("lead"), dict) else None
    if lead:
        lines.append(f"当前最值得留意：{lead.get('title', '')}（{lead.get('detail', '')}）")
    signals = reality.get("signals") if isinstance(reality.get("signals"), list) else []
    for item in signals[:3]:
        if isinstance(item, dict):
            lines.append(f"现实信号：{item.get('title', '')}；{item.get('detail', '')}")
    return "\n".join(lines)


def build_daily_user_prompt(
    seed: dict[str, object],
    yijing: dict[str, object],
    reality: dict[str, Any] | None = None,
) -> str:
    main = yijing.get("main_hexagram") if isinstance(yijing.get("main_hexagram"), dict) else {}
    changed = yijing.get("changed_hexagram") if isinstance(yijing.get("changed_hexagram"), dict) else {}
    moving = yijing.get("moving_lines") if isinstance(yijing.get("moving_lines"), list) else []
    return f"""
今日种子信息：
日期：{seed["date"]}
关键词：{seed["keyword"]}
能量值：{seed["energy"]}/100
适合聚焦方向：{seed["focus"]}

今日日卦（三枚钱币法，当天固定）：
本卦：{main.get("name", "未知")}（{main.get("meaning", "")}）
动爻：{"第 " + "、".join(str(value) for value in moving) + " 爻" if moving else "无动爻"}
变卦：{changed.get("name", "未知")}（{changed.get("meaning", "")}）

Firefly 工作台的现实快照：
{_reality_lines(reality)}

请综合日卦、关键词与现实快照生成用户的今日参考。卦象负责提供观察角度，现实数据负责决定建议落在哪里；二者冲突时，以现实情况为准。
不要为了显得神秘而虚构事件，不要杜撰爻辞原文，也不要把随机能量值说成客观测量。
不要用“作为AI”“根据你提供的信息”“以下是”等开场。
不要在开头写免责声明；如果需要提醒，只在最后用一句很轻的话说明“当作今天的小参考”。

输出 4 到 6 个简短段落，不要每天机械复用完全相同的结构。
必须包含“今日日卦：”“现实中的落点：”“今日行动：”“流萤寄语：”四段；其余段落根据当天卦象自行决定是否加入，例如“变化的方向：”“需要避开：”“可以等待：”。不需要为了凑格式而写空泛内容。

要求：必须具体提到本卦；有动爻时说明变化发生在哪一层，但不要假装引用古籍原文。现实建议尽量对应今天真实存在的任务或状态。
语言温柔、坚定、像 Firefly 在跟 Pilgrim 说话；少一点模板感，少一点玄学腔；必须包含现实行动建议，不要恐吓，不要宣称百分百准确。
不要使用 Markdown 粗体、星号列表或编号列表。标题只用“标题：内容”的形式。
"""
