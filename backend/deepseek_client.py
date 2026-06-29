from openai import OpenAI

from backend.config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL


def _get_client() -> OpenAI:
    if not DEEPSEEK_API_KEY:
        raise RuntimeError(
            "DEEPSEEK_API_KEY is not set. Please copy .env.example to .env and fill in your DeepSeek API key."
        )
    return OpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)


def ask_deepseek(messages, temperature: float = 0.7) -> str:
    client = _get_client()
    response = client.chat.completions.create(
        model=DEEPSEEK_MODEL,
        messages=messages,
        temperature=temperature,
    )
    return response.choices[0].message.content or ""
