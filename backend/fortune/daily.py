import random
from datetime import date


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

请生成用户的今日运势。请先说明：这不是绝对预测，只是娱乐性与反思性参考。

输出格式：
今日关键词：
今日整体状态：
学习 / 项目建议：
人际提醒：
需要避开的坑：
今天最适合完成的一件事：
给用户的一句话：

要求：语言温柔、坚定、有一点星空科幻感；必须包含现实行动建议，不要恐吓，不要宣称百分百准确。
"""
