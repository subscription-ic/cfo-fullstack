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


def chat_completion(
    messages: list[dict[str, Any]],
    temperature: float = 0.4,
    model: str | None = None,
) -> str:
    """Reasoning-tier completion (settings.openai_chat_model by default).

    Use this for question generation, the similarity judge, and any output a
    user reads directly. For high-volume mechanical extraction use
    `extraction_completion` instead — it is materially cheaper per call.
    """
    s = get_settings()
    client = get_openai_client()
    if not client:
        raise RuntimeError("OPENAI_API_KEY is not configured")
    resp = client.chat.completions.create(
        model=model or s.openai_chat_model,
        messages=messages,
        temperature=temperature,
    )
    choice = resp.choices[0]
    if not choice.message.content:
        return ""
    return choice.message.content


def extraction_completion(messages: list[dict[str, Any]], temperature: float = 0.4) -> str:
    """Cheap-tier completion for high-volume, mechanical extraction.

    Pulls structured facts out of text that is already in front of the model —
    per-page document analysis, headline classification, field extraction,
    reranking. Nothing here requires the reasoning tier, and per-page analysis
    alone is one call per PDF page, so this is where ingestion cost lives.
    """
    return chat_completion(
        messages,
        temperature=temperature,
        model=get_settings().openai_extraction_model,
    )
