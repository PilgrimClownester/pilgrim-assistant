from datetime import date

from lunar_python import LunarYear, Solar

from backend.bazi.analyzer import count_wuxing, split_pillar
from backend.bazi.models import BirthInfo


def _gender_to_yun_value(gender: str | None) -> int | None:
    normalized = (gender or "unknown").lower()
    if normalized in {"male", "男", "m"}:
        return 1
    if normalized in {"female", "女", "f"}:
        return 0
    return None


def _build_da_yun(eight_char, gender: str | None, warnings: list[str]) -> list[dict[str, object]]:
    yun_gender = _gender_to_yun_value(gender)
    if yun_gender is None:
        warnings.append("性别未指定，大运顺逆无法可靠确定；本次不生成大运。")
        return []

    try:
        yun = eight_char.getYun(yun_gender)
        result = []
        for item in yun.getDaYun()[:10]:
            gan_zhi = item.getGanZhi()
            if not gan_zhi:
                continue
            result.append(
                {
                    "start_age": item.getStartAge(),
                    "end_age": item.getEndAge(),
                    "start_year": item.getStartYear(),
                    "end_year": item.getEndYear(),
                    "gan_zhi": gan_zhi,
                    "source": "lunar_python.getYun().getDaYun()",
                }
            )
        return result
    except Exception as exc:
        warnings.append(f"大运数据获取失败：{exc}")
        return []


def _build_liu_nian() -> list[dict[str, object]]:
    current_year = date.today().year
    return [
        {"year": year, "gan_zhi": LunarYear.fromYear(year).getGanZhi()}
        for year in range(current_year, current_year + 5)
    ]


def build_bazi_chart(birth_info: BirthInfo) -> dict[str, object]:
    warnings: list[str] = []

    if birth_info.calendar_type != "solar":
        raise ValueError("第一阶段仅支持公历 solar 输入；农历输入将在后续版本完善。")

    if birth_info.use_true_solar_time:
        warnings.append("第一阶段暂未启用真太阳时校正，当前按输入地当地钟表时间排盘。")
    if birth_info.birth_place:
        warnings.append("出生地已记录，但第一阶段暂不参与真太阳时计算。")

    try:
        solar = Solar.fromYmdHms(
            birth_info.birth_year,
            birth_info.birth_month,
            birth_info.birth_day,
            birth_info.birth_hour,
            birth_info.birth_minute,
            0,
        )
        lunar = solar.getLunar()
        eight_char = lunar.getEightChar()
    except Exception as exc:
        raise ValueError(f"排盘失败，请检查出生日期或时辰：{exc}") from exc

    pillars = {
        "year": eight_char.getYear(),
        "month": eight_char.getMonth(),
        "day": eight_char.getDay(),
        "hour": eight_char.getTime(),
    }
    stems = {}
    branches = {}
    for key, pillar in pillars.items():
        stem, branch = split_pillar(pillar)
        stems[key] = stem
        branches[key] = branch

    shi_shen = {
        "year_stem": eight_char.getYearShiShenGan(),
        "month_stem": eight_char.getMonthShiShenGan(),
        "day_stem": "日主",
        "hour_stem": eight_char.getTimeShiShenGan(),
        "note": "第一阶段仅展示天干十神；地支藏干十神将在后续版本补充。",
    }

    warnings.append("第一阶段五行统计仅按 4 个天干与 4 个地支主五行粗略统计，未纳入藏干权重。")

    return {
        "profile": {
            "name": birth_info.name,
            "gender": birth_info.gender,
            "birth_place": birth_info.birth_place,
            "calendar_type": birth_info.calendar_type,
            "solar_datetime": solar.toYmdHms(),
            "lunar_date": lunar.toString(),
            "note": birth_info.note,
        },
        "pillars": pillars,
        "stems": stems,
        "branches": branches,
        "day_master": stems["day"],
        "wuxing": count_wuxing(stems, branches),
        "shi_shen": shi_shen,
        "da_yun": _build_da_yun(eight_char, birth_info.gender, warnings),
        "liu_nian": _build_liu_nian(),
        "warnings": warnings,
    }
