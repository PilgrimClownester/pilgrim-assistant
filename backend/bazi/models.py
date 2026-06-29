from typing import Optional

from pydantic import BaseModel, Field


class BirthInfo(BaseModel):
    name: str = Field(default="Firefly 用户")
    gender: Optional[str] = Field(default="unknown", description="male / female / unknown")
    calendar_type: str = Field(default="solar", description="solar or lunar")
    birth_year: int = Field(..., ge=1900, le=2100)
    birth_month: int = Field(..., ge=1, le=12)
    birth_day: int = Field(..., ge=1, le=31)
    birth_hour: int = Field(..., ge=0, le=23)
    birth_minute: int = Field(default=0, ge=0, le=59)
    birth_place: Optional[str] = None
    use_true_solar_time: bool = False
    note: Optional[str] = None


class BaziAnalyzeRequest(BirthInfo):
    focus: str = Field(default="综合")


class BaziQuestion(BaseModel):
    birth_info: BirthInfo
    question: str = Field(..., min_length=1)
    focus: str = Field(default="综合")
