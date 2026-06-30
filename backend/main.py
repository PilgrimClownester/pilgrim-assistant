from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.bazi.chart import build_bazi_chart
from backend.bazi.models import BaziAnalyzeRequest, BaziQuestion, BirthInfo
from backend.deepseek_client import ask_deepseek
from backend.fortune.daily import build_daily_user_prompt, generate_daily_seed
from backend.fortune.tarot import build_tarot_user_prompt, draw_tarot
from backend.fortune.yijing import build_yijing_user_prompt, cast_yijing
from backend.profile import UserProfile, build_profile_context, get_profile, save_profile
from backend.productivity import (
    ScheduleCreate,
    ScheduleUpdate,
    TodoCreate,
    TodoUpdate,
    create_schedule_event,
    create_todo,
    delete_schedule_event,
    delete_todo,
    list_schedule,
    list_todos,
    update_schedule_event,
    update_todo,
)
from backend.prompts.bazi_prompt import (
    BAZI_SYSTEM_PROMPT,
    build_bazi_analysis_prompt,
    build_bazi_question_prompt,
)
from backend.prompts.base_prompt import CHAT_SYSTEM_PROMPT
from backend.prompts.fortune_prompt import FORTUNE_SYSTEM_PROMPT
from backend.prompts.starfire_persona import FIREFLY_PARTNER_PROMPT


app = FastAPI(title="Firefly", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "app://."],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TarotRequest(BaseModel):
    question: str = Field(..., min_length=1)
    spread: str = "three"


class YijingRequest(BaseModel):
    question: str = Field(..., min_length=1)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)


@app.get("/")
def root() -> dict[str, str]:
    return {
        "name": "Firefly",
        "message": "Local personal assistant powered by DeepSeek API.",
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/profile")
def read_profile() -> UserProfile:
    return get_profile()


@app.put("/profile")
def update_profile(profile: UserProfile) -> UserProfile:
    return save_profile(profile)


@app.get("/todos")
def read_todos() -> dict[str, object]:
    return {"items": list_todos()}


@app.post("/todos")
def add_todo(item: TodoCreate) -> dict[str, object]:
    return {"item": create_todo(item)}


@app.patch("/todos/{todo_id}")
def patch_todo(todo_id: str, patch: TodoUpdate) -> dict[str, object]:
    item = update_todo(todo_id, patch)
    if item is None:
        raise HTTPException(status_code=404, detail="Todo not found")
    return {"item": item}


@app.delete("/todos/{todo_id}")
def remove_todo(todo_id: str) -> dict[str, object]:
    if not delete_todo(todo_id):
        raise HTTPException(status_code=404, detail="Todo not found")
    return {"ok": True}


@app.get("/schedule")
def read_schedule() -> dict[str, object]:
    return {"items": list_schedule()}


@app.post("/schedule")
def add_schedule_event(item: ScheduleCreate) -> dict[str, object]:
    return {"item": create_schedule_event(item)}


@app.patch("/schedule/{event_id}")
def patch_schedule_event(event_id: str, patch: ScheduleUpdate) -> dict[str, object]:
    item = update_schedule_event(event_id, patch)
    if item is None:
        raise HTTPException(status_code=404, detail="Schedule event not found")
    return {"item": item}


@app.delete("/schedule/{event_id}")
def remove_schedule_event(event_id: str) -> dict[str, object]:
    if not delete_schedule_event(event_id):
        raise HTTPException(status_code=404, detail="Schedule event not found")
    return {"ok": True}


def _ask_fortune(user_prompt: str) -> str:
    prompt_with_profile = f"{build_profile_context()}\n\n{user_prompt}"
    try:
        return ask_deepseek(
            [
                {"role": "system", "content": FORTUNE_SYSTEM_PROMPT},
                {"role": "system", "content": FIREFLY_PARTNER_PROMPT},
                {"role": "user", "content": prompt_with_profile},
            ],
            temperature=0.8,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DeepSeek API call failed: {exc}") from exc


def _ask_bazi(user_prompt: str) -> str:
    prompt_with_profile = f"{build_profile_context()}\n\n{user_prompt}"
    try:
        return ask_deepseek(
            [
                {"role": "system", "content": BAZI_SYSTEM_PROMPT},
                {"role": "system", "content": FIREFLY_PARTNER_PROMPT},
                {"role": "user", "content": prompt_with_profile},
            ],
            temperature=0.7,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DeepSeek API call failed: {exc}") from exc


@app.post("/chat")
def chat(request: ChatRequest) -> dict[str, object]:
    prompt_with_profile = f"{build_profile_context()}\n\n用户消息：\n{request.message}"
    try:
        answer = ask_deepseek(
            [
                {"role": "system", "content": CHAT_SYSTEM_PROMPT},
                {"role": "system", "content": FIREFLY_PARTNER_PROMPT},
                {"role": "user", "content": prompt_with_profile},
            ],
            temperature=0.7,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DeepSeek API call failed: {exc}") from exc

    return {"type": "chat", "message": request.message, "answer": answer}


@app.post("/bazi/chart")
def bazi_chart(request: BirthInfo) -> dict[str, object]:
    try:
        chart = build_bazi_chart(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"type": "bazi_chart", "chart": chart}


@app.post("/bazi/analyze")
def bazi_analyze(request: BaziAnalyzeRequest) -> dict[str, object]:
    try:
        birth_info = BirthInfo(**request.model_dump(exclude={"focus"}))
        chart = build_bazi_chart(birth_info)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    prompt = build_bazi_analysis_prompt(chart, request.focus)
    answer = _ask_bazi(prompt)
    return {"type": "bazi_analysis", "chart": chart, "answer": answer}


@app.post("/bazi/ask")
def bazi_ask(request: BaziQuestion) -> dict[str, object]:
    try:
        chart = build_bazi_chart(request.birth_info)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    prompt = build_bazi_question_prompt(chart, request.question, request.focus)
    answer = _ask_bazi(prompt)
    return {
        "type": "bazi_question",
        "chart": chart,
        "question": request.question,
        "answer": answer,
    }


@app.post("/fortune/tarot")
def tarot(request: TarotRequest) -> dict[str, object]:
    try:
        cards = draw_tarot(request.spread)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    user_prompt = build_tarot_user_prompt(request.question, cards)
    answer = _ask_fortune(user_prompt)
    return {
        "type": "tarot",
        "question": request.question,
        "cards": cards,
        "answer": answer,
    }


@app.post("/fortune/yijing")
def yijing(request: YijingRequest) -> dict[str, object]:
    gua = cast_yijing()
    user_prompt = build_yijing_user_prompt(request.question, gua)
    answer = _ask_fortune(user_prompt)
    return {
        "type": "yijing",
        "question": request.question,
        "gua": gua,
        "answer": answer,
    }


@app.get("/fortune/daily")
def daily() -> dict[str, object]:
    seed = generate_daily_seed()
    user_prompt = build_daily_user_prompt(seed)
    answer = _ask_fortune(user_prompt)
    return {
        "type": "daily",
        "seed": seed,
        "answer": answer,
    }
