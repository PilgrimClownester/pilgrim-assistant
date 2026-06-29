import random
from pprint import pformat


MAJOR_ARCANA = [
    {"card": "愚者", "meaning": "新的旅程、冒险、信任直觉、尚未成形的可能"},
    {"card": "魔术师", "meaning": "资源整合、行动力、表达、把想法落到现实"},
    {"card": "女祭司", "meaning": "直觉、静默观察、隐藏信息、内在秩序"},
    {"card": "皇后", "meaning": "滋养、创造、丰盛、关系中的柔软力量"},
    {"card": "皇帝", "meaning": "结构、边界、责任、稳定推进"},
    {"card": "教皇", "meaning": "传统、学习、指导、价值系统"},
    {"card": "恋人", "meaning": "选择、联结、价值一致、关系课题"},
    {"card": "战车", "meaning": "推进、胜负心、专注、突破阻碍"},
    {"card": "力量", "meaning": "耐心、勇气、温和地掌控能量"},
    {"card": "隐者", "meaning": "独处、寻找答案、减噪、内在灯火"},
    {"card": "命运之轮", "meaning": "周期变化、机会、转折、顺势调整"},
    {"card": "正义", "meaning": "因果、判断、平衡、明确责任"},
    {"card": "倒吊人", "meaning": "暂停、换视角、牺牲短期便利、等待转机"},
    {"card": "死神", "meaning": "结束、清理、转化、旧结构退场"},
    {"card": "节制", "meaning": "调和、恢复、节奏、长期主义"},
    {"card": "恶魔", "meaning": "执念、诱惑、束缚、需要识别的消耗"},
    {"card": "高塔", "meaning": "冲击、真相显现、结构崩塌后的重建"},
    {"card": "星星", "meaning": "希望、疗愈、远方目标、重新校准航线"},
    {"card": "月亮", "meaning": "迷雾、潜意识、不确定、需要验证的信息"},
    {"card": "太阳", "meaning": "清晰、活力、成果、坦荡的推进"},
    {"card": "审判", "meaning": "召唤、复盘、觉醒、面对关键决定"},
    {"card": "世界", "meaning": "完成、整合、阶段成果、进入新循环"},
]

SPREADS = {
    "single": ["今日提示"],
    "three": ["过去", "现在", "未来"],
    "five": ["现状", "阻碍", "隐藏影响", "建议", "结果趋势"],
}


def draw_tarot(spread: str = "three") -> list[dict[str, str]]:
    if spread not in SPREADS:
        raise ValueError("Unsupported spread. Use one of: single, three, five.")

    positions = SPREADS[spread]
    cards = random.sample(MAJOR_ARCANA, len(positions))
    result = []
    for position, card in zip(positions, cards):
        result.append(
            {
                "position": position,
                "card": card["card"],
                "orientation": random.choice(["正位", "逆位"]),
                "meaning": card["meaning"],
            }
        )
    return result


def build_tarot_user_prompt(question: str, cards: list[dict[str, str]]) -> str:
    return f"""
用户的问题：
{question}

塔罗抽牌结果：
{pformat(cards, width=100)}

请先说明：这次解读只作为娱乐性与反思性参考，不能当作绝对预言。

请按照以下结构进行解读：

【这次牌面像在说】
用一小段有画面感的话概括整体牌面。

【现在的你】
解释用户当前状态。

【需要小心的地方】
指出风险、盲点、可能的内耗。

【可以相信的力量】
指出优势、已有资源、可以依靠的能力。

【接下来三步】
给出具体、现实、可执行的行动建议。

【给用户的一句话】
用温柔但坚定的语气收束。
"""
