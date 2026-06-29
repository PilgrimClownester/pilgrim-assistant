STEM_WUXING = {
    "甲": "木",
    "乙": "木",
    "丙": "火",
    "丁": "火",
    "戊": "土",
    "己": "土",
    "庚": "金",
    "辛": "金",
    "壬": "水",
    "癸": "水",
}

BRANCH_WUXING = {
    "子": "水",
    "丑": "土",
    "寅": "木",
    "卯": "木",
    "辰": "土",
    "巳": "火",
    "午": "火",
    "未": "土",
    "申": "金",
    "酉": "金",
    "戌": "土",
    "亥": "水",
}

WUXING_KEYS = ["木", "火", "土", "金", "水"]


def split_pillar(pillar: str) -> tuple[str, str]:
    if len(pillar) < 2:
        return "", ""
    return pillar[0], pillar[1]


def count_wuxing(stems: dict[str, str], branches: dict[str, str]) -> dict[str, int]:
    result = {key: 0 for key in WUXING_KEYS}
    for stem in stems.values():
        wuxing = STEM_WUXING.get(stem)
        if wuxing:
            result[wuxing] += 1
    for branch in branches.values():
        wuxing = BRANCH_WUXING.get(branch)
        if wuxing:
            result[wuxing] += 1
    return result
