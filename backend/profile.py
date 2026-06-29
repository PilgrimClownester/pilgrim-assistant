import json
import re
from pathlib import Path
from typing import Any, Optional

from pydantic import BaseModel, Field


PROFILE_PATH = Path(__file__).resolve().parents[1] / "data" / "profile.json"


class UserProfile(BaseModel):
    nickname: str = ""
    focus_areas: str = ""
    current_goals: str = ""
    communication_style: str = "温柔、直接、坚定，给出具体行动建议。"
    notes: str = ""

    gender: str = "unknown"
    calendar_type: str = "solar"
    birth_year: Optional[int] = Field(default=None, ge=1900, le=2100)
    birth_month: Optional[int] = Field(default=None, ge=1, le=12)
    birth_day: Optional[int] = Field(default=None, ge=1, le=31)
    birth_hour: Optional[int] = Field(default=None, ge=0, le=23)
    birth_minute: int = Field(default=0, ge=0, le=59)
    birth_place: Optional[str] = None
    use_true_solar_time: bool = False
    bazi_note: Optional[str] = None

    # Compatibility with earlier versions that stored birth info as free text.
    birth_info: str = ""


def get_profile() -> UserProfile:
    if not PROFILE_PATH.exists():
        return UserProfile()

    try:
        data: dict[str, Any] = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
        _repair_mojibake_defaults(data)
        _migrate_legacy_birth_info(data)
        return UserProfile(**data)
    except (json.JSONDecodeError, OSError, TypeError, ValueError):
        return UserProfile()


def _repair_mojibake_defaults(data: dict[str, Any]) -> None:
    style = str(data.get("communication_style") or "")
    if "銆" in style or "锛" in style or "?" in style:
        data["communication_style"] = "温柔、直接、坚定，给出具体行动建议。"


def _migrate_legacy_birth_info(data: dict[str, Any]) -> None:
    if all(data.get(key) is not None for key in ["birth_year", "birth_month", "birth_day", "birth_hour"]):
        return

    raw = str(data.get("birth_info") or "")
    match = re.search(
        r"(?P<year>\d{4})\D+(?P<month>\d{1,2})\D+(?P<day>\d{1,2})\D+(?P<hour>\d{1,2})(?:\D+(?P<minute>\d{1,2}))?",
        raw,
    )
    if not match:
        return

    data["birth_year"] = int(match.group("year"))
    data["birth_month"] = int(match.group("month"))
    data["birth_day"] = int(match.group("day"))
    data["birth_hour"] = int(match.group("hour"))
    if match.group("minute") is not None:
        data["birth_minute"] = int(match.group("minute"))


def save_profile(profile: UserProfile) -> UserProfile:
    PROFILE_PATH.parent.mkdir(parents=True, exist_ok=True)
    PROFILE_PATH.write_text(
        json.dumps(profile.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return profile


def build_profile_context(profile: UserProfile | None = None) -> str:
    profile = profile or get_profile()
    birth_lines = []
    if all(
        value is not None
        for value in [profile.birth_year, profile.birth_month, profile.birth_day, profile.birth_hour]
    ):
        birth_lines.append(
            f"{profile.birth_year}-{profile.birth_month:02d}-{profile.birth_day:02d} "
            f"{profile.birth_hour:02d}:{profile.birth_minute:02d}"
        )
        birth_lines.append(f"性别：{profile.gender}")
        birth_lines.append(f"历法：{profile.calendar_type}")
        if profile.birth_place:
            birth_lines.append(f"出生地：{profile.birth_place}")
        if profile.bazi_note:
            birth_lines.append(f"命理分析备注：{profile.bazi_note}")
    elif profile.birth_info:
        birth_lines.append(profile.birth_info)

    fields = [
        ("称呼", profile.nickname),
        ("关注方向", profile.focus_areas),
        ("当前目标", profile.current_goals),
        ("希望的沟通风格", profile.communication_style),
        ("出生信息", "；".join(birth_lines)),
        ("补充说明", profile.notes),
    ]
    lines = [f"{name}：{value}" for name, value in fields if isinstance(value, str) and value.strip()]
    if not lines:
        return "用户暂未填写个人档案。"
    return "用户个人档案：\n" + "\n".join(lines)
