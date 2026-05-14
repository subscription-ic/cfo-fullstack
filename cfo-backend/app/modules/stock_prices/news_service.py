"""Headline-level sentiment from yfinance `.news`, scoped to a fiscal quarter.

Flow:
  1. Resolve company → ticker (Yahoo search).
  2. Pull yfinance's news feed for the ticker.
  3. Filter to headlines published inside the quarter's date range.
  4. One batched LLM call classifies each headline as Positive/Neutral/Negative
     with a score (-1..1) and a short theme phrase.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime, timezone
from typing import Any

import yfinance as yf

from app.infrastructure.llm import chat_completion, get_openai_client
from app.modules.stock_prices.service import _quarter_to_range, resolve_ticker

logger = logging.getLogger(__name__)


def _extract_news_items(raw: list[Any]) -> list[dict[str, Any]]:
    """yfinance has two shapes depending on version: flat dict or {'content': {...}}.
    Normalize both into {title, summary, publisher, url, pub_date(iso)}."""
    out: list[dict[str, Any]] = []
    for item in raw or []:
        if not isinstance(item, dict):
            continue
        c = item.get("content") if isinstance(item.get("content"), dict) else item
        title = str(c.get("title") or "").strip()
        if not title:
            continue
        summary = str(c.get("summary") or c.get("description") or "").strip()
        provider = c.get("provider") or {}
        publisher = (
            str(provider.get("displayName"))
            if isinstance(provider, dict) and provider.get("displayName")
            else str(c.get("publisher") or "Yahoo")
        )
        canonical = c.get("canonicalUrl") or {}
        url = (
            str(canonical.get("url"))
            if isinstance(canonical, dict) and canonical.get("url")
            else str(c.get("link") or "")
        )

        # Date may be ISO string or epoch seconds.
        pub_date_iso: str | None = None
        raw_date = c.get("pubDate") or c.get("displayTime") or c.get("providerPublishTime")
        if isinstance(raw_date, (int, float)):
            try:
                pub_date_iso = datetime.fromtimestamp(int(raw_date), tz=timezone.utc).isoformat()
            except Exception:
                pub_date_iso = None
        elif isinstance(raw_date, str):
            pub_date_iso = raw_date

        out.append({
            "title": title,
            "summary": summary,
            "publisher": publisher,
            "url": url,
            "pub_date_iso": pub_date_iso,
        })
    return out


def _within_range(pub_date_iso: str | None, start: date, end: date) -> bool:
    if not pub_date_iso:
        return False
    try:
        d = datetime.fromisoformat(pub_date_iso.replace("Z", "+00:00")).date()
    except Exception:
        return False
    return start <= d <= end


def _classify_batch(headlines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Single LLM call to label each headline. Returns the input list with
    `sentiment`, `score`, and `theme` fields populated. Failures return the
    list with neutral defaults so the page still renders."""
    if not headlines:
        return []
    if get_openai_client() is None:
        for h in headlines:
            h["sentiment"] = "Neutral"
            h["score"] = 0.0
            h["theme"] = h["title"][:60]
        return headlines

    items_block = "\n".join(
        f"{i}. {h['title']}" + (f" — {h['summary'][:200]}" if h["summary"] else "")
        for i, h in enumerate(headlines)
    )
    prompt = (
        "You are scoring financial-news headlines about a single company for an "
        "equity research dashboard. For each numbered headline, return ONE JSON "
        "object inside a top-level JSON array. Each object MUST have:\n"
        '  index    — integer matching the headline number\n'
        '  sentiment — "Positive" | "Neutral" | "Negative"\n'
        '  score    — number between -1.0 and 1.0, signed by sentiment direction\n'
        '  theme    — 3-7 word phrase capturing the substantive theme\n'
        "Bias toward Neutral for routine corporate filings or generic coverage. "
        "Reserve Positive/Negative for headlines that name material drivers, "
        "risks, upgrades/downgrades, guidance changes, or specific results.\n\n"
        f"Headlines:\n{items_block}\n\n"
        "Return ONLY the JSON array, no markdown fences."
    )
    try:
        raw = chat_completion(
            [
                {
                    "role": "system",
                    "content": "You output strict JSON arrays only. No commentary, no markdown.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
        )
    except Exception as exc:
        logger.warning("news sentiment LLM failed: %s", exc)
        for h in headlines:
            h["sentiment"] = "Neutral"
            h["score"] = 0.0
            h["theme"] = h["title"][:60]
        return headlines

    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        data = json.loads(cleaned)
        if not isinstance(data, list):
            raise ValueError("not a list")
    except Exception as exc:
        logger.warning("news sentiment parse failed: %s — raw: %.300s", exc, raw)
        for h in headlines:
            h["sentiment"] = "Neutral"
            h["score"] = 0.0
            h["theme"] = h["title"][:60]
        return headlines

    by_index = {int(d.get("index", -1)): d for d in data if isinstance(d, dict)}
    for i, h in enumerate(headlines):
        d = by_index.get(i) or {}
        sentiment_raw = str(d.get("sentiment") or "Neutral").strip().title()
        if sentiment_raw not in ("Positive", "Neutral", "Negative"):
            sentiment_raw = "Neutral"
        try:
            score = float(d.get("score") or 0.0)
        except (TypeError, ValueError):
            score = 0.0
        score = max(-1.0, min(1.0, score))
        theme = str(d.get("theme") or h["title"]).strip()[:80] or h["title"][:80]
        h["sentiment"] = sentiment_raw
        h["score"] = round(score, 2)
        h["theme"] = theme
    return headlines


def fetch_news_sentiment(
    company: str, fiscal_year: int, quarter: str,
) -> dict[str, Any]:
    """Return classified news rows for the quarter."""
    ticker = resolve_ticker(company)
    if not ticker:
        return {
            "company": company,
            "ticker": None,
            "range": None,
            "rows": [],
            "error": "Could not resolve a ticker for this company.",
        }

    try:
        start, end = _quarter_to_range(fiscal_year, quarter)
    except ValueError as exc:
        return {
            "company": company,
            "ticker": ticker,
            "range": None,
            "rows": [],
            "error": str(exc),
        }

    try:
        tk = yf.Ticker(ticker)
        raw = list(tk.news or [])
    except Exception as exc:
        logger.warning("yfinance news failed for %s: %s", ticker, exc)
        return {
            "company": company,
            "ticker": ticker,
            "range": {"start": start.isoformat(), "end": end.isoformat()},
            "rows": [],
            "error": f"yfinance error: {exc}",
        }

    normalized = _extract_news_items(raw)
    in_range = [h for h in normalized if _within_range(h["pub_date_iso"], start, end)]
    if not in_range:
        return {
            "company": company,
            "ticker": ticker,
            "range": {"start": start.isoformat(), "end": end.isoformat()},
            "rows": [],
            "error": (
                f"No Yahoo Finance news entries found between {start} and {end} for {ticker}. "
                "yfinance only retains a short rolling window of headlines per ticker."
            ),
        }

    classified = _classify_batch(in_range[:25])
    rows: list[dict[str, Any]] = []
    for h in classified:
        pub_date = h["pub_date_iso"] or ""
        rows.append({
            "date": pub_date[:10] if pub_date else "",
            "publisher": h["publisher"],
            "url": h["url"],
            "title": h["title"],
            "summary": h["summary"],
            "theme": h["theme"],
            "sentiment": h["sentiment"],
            "score": h["score"],
        })
    rows.sort(key=lambda r: r["date"])
    return {
        "company": company,
        "ticker": ticker,
        "range": {"start": start.isoformat(), "end": end.isoformat()},
        "rows": rows,
        "error": None,
    }
