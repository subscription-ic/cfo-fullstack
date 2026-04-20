"""Domain-specific content enrichment: sections, topics, metrics, importance.

Not placed in `shared/` because these regex tables are specific to the
finance-document ingestion pipeline.
"""

from __future__ import annotations

import re
from typing import Any

from app.shared.utils import normalize_space

SECTION_PATTERNS: list[tuple[str, str]] = [
    ("financials", r"\b(financial results?|income statement|balance sheet|cash flow|p&l)\b"),
    ("commentary", r"\b(management commentary|ceo remarks|outlook|guidance|prepared remarks)\b"),
    ("segments", r"\b(segment|business unit|geography|vertical)\b"),
    ("risk_notes", r"\b(risk|headwind|uncertainty|regulatory|litigation)\b"),
]

TOPIC_PATTERNS: list[tuple[str, str]] = [
    ("revenue", r"\brevenue|sales|turnover\b"),
    ("profitability", r"\bebitda|ebit|profit|margin|pat\b"),
    ("cash_flow", r"\bcash flow|operating cash|free cash\b"),
    ("guidance", r"\bguidance|outlook|forecast\b"),
    ("capital", r"\bcapex|capital allocation|buyback|dividend\b"),
    ("risk", r"\brisk|uncertain|pressure|headwind\b"),
]


def is_table_like(text: str) -> bool:
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if not lines:
        return False
    numeric_tokens = len(re.findall(r"\b\d[\d,.\-]*%?\b", text))
    structured_lines = sum(
        1
        for ln in lines
        if "|" in ln or "\t" in ln or len(re.findall(r"\s{2,}", ln)) >= 2
    )
    return structured_lines >= 2 or (numeric_tokens >= 16 and len(lines) >= 5)


def classify_document_type(text: str, provided_doc_type: str) -> str:
    low = text.lower()
    if "press release" in low:
        return "press_release"
    if "standalone" in low and ("results" in low or "financial" in low):
        return "standalone_financial"
    if "consolidated" in low and ("results" in low or "financial" in low):
        return "consolidated_financial"
    if "earnings call" in low or "prepared remarks" in low:
        return "earnings_transcript"
    return provided_doc_type or "unknown"


def segment_sections(text: str) -> list[tuple[str, str]]:
    lines = [normalize_space(ln) for ln in text.splitlines()]
    lines = [ln for ln in lines if ln]
    if not lines:
        return []

    sections: list[tuple[str, list[str]]] = [("general", [])]
    current = "general"
    for ln in lines:
        switched = False
        for label, pat in SECTION_PATTERNS:
            if re.search(pat, ln, flags=re.IGNORECASE):
                current = label
                sections.append((current, []))
                switched = True
                break
        sections[-1][1].append(ln)
        if switched:
            continue

    out: list[tuple[str, str]] = []
    for label, chunk_lines in sections:
        txt = "\n".join(chunk_lines).strip()
        if txt:
            out.append((label, txt))
    return out


def extract_financial_metrics(text: str) -> list[dict[str, Any]]:
    metrics: list[dict[str, Any]] = []
    patterns = [
        ("revenue", r"\b(revenue|sales)\b.{0,40}?(\d[\d,.\-]*\s?(?:bn|million|crore|%)?)"),
        ("ebitda", r"\b(ebitda)\b.{0,30}?(\d[\d,.\-]*\s?(?:bn|million|crore|%)?)"),
        ("margin", r"\b(margin|gross margin|ebitda margin)\b.{0,30}?(\d[\d,.\-]*\s?%)"),
        ("profit", r"\b(net profit|pat|profit after tax)\b.{0,35}?(\d[\d,.\-]*\s?(?:bn|million|crore)?)"),
    ]
    low = text.lower()
    for metric_name, pat in patterns:
        for m in re.finditer(pat, low, flags=re.IGNORECASE):
            metrics.append({"metric": metric_name, "value_text": m.group(2)})
            if len(metrics) >= 60:
                return metrics
    return metrics


def detect_topics(text: str) -> list[str]:
    topics: list[str] = []
    for topic, pat in TOPIC_PATTERNS:
        if re.search(pat, text, flags=re.IGNORECASE):
            topics.append(topic)
    return topics


def importance_score(text: str) -> float:
    base = 0.25
    if re.search(r"\bguidance|outlook|risk|margin|revenue|profit\b", text, flags=re.IGNORECASE):
        base += 0.25
    num_density = len(re.findall(r"\b\d[\d,.\-]*%?\b", text))
    if num_density >= 10:
        base += 0.25
    if is_table_like(text):
        base += 0.15
    return min(base, 0.95)
