"""OpenAI embeddings and chat completions."""

from __future__ import annotations

from typing import Any

from openai import OpenAI

from app.core.config import get_settings


def get_openai_client() -> OpenAI | None:
    s = get_settings()
    if not s.openai_api_key:
        return None
    return OpenAI(api_key=s.openai_api_key)


def embed_texts(texts: list[str]) -> list[list[float]]:
    s = get_settings()
    client = get_openai_client()
    if not client:
        raise RuntimeError("OPENAI_API_KEY is not configured")
    resp = client.embeddings.create(model=s.embedding_model, input=texts)
    return [list(d.embedding) for d in resp.data]


def embed_query(text: str) -> list[float]:
    return embed_texts([text])[0]


def chat_completion(messages: list[dict[str, Any]], temperature: float = 0.4) -> str:
    s = get_settings()
    client = get_openai_client()
    if not client:
        raise RuntimeError("OPENAI_API_KEY is not configured")
    resp = client.chat.completions.create(
        model=s.openai_chat_model,
        messages=messages,
        temperature=temperature,
    )
    choice = resp.choices[0]
    if not choice.message.content:
        return ""
    return choice.message.content
