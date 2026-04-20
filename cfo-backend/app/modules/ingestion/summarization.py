"""Per-page summarization + theme extraction via a single LLM call.

For each physical page of a document, produces:
    - summary: a compact summary of the page
    - primary_theme: the single dominant topic
    - sub_themes: a list of secondary topics for deeper tagging

Designed to fail soft: if the LLM call fails or returns malformed JSON,
returns an empty PageAnalysis so ingestion can still proceed.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

from app.infrastructure.llm import chat_completion
from app.shared.constants import (
    CATEGORY_TAXONOMY_BLOCK,
    EXPERT_PERSONA,
    INDUSTRY_AWARE_DIRECTIVE,
)

MAX_CHARS_FOR_LLM = 6000
MAX_SUB_THEMES = 6
MAX_L2_HEADINGS = 6
MAX_L3_HEADINGS = 10


@dataclass
class PageAnalysis:
    summary: str = ""
    primary_theme: str = ""
    sub_themes: list[str] = field(default_factory=list)
    l1_heading: str = ""
    l2_headings: list[str] = field(default_factory=list)
    l3_headings: list[str] = field(default_factory=list)
    # Three-level categorical taxonomy (aligned with the question generator).
    # L1 = broad bucket from the closed enum; L2 = specific angle; L3 = even
    # more granular sub-angle. Used to match chunks against L1/L2 questions.
    category_l1: str = ""
    category_l2: str = ""
    category_l3: str = ""

    def to_dict(self) -> dict:
        return {
            "summary": self.summary,
            "primary_theme": self.primary_theme,
            "sub_themes": list(self.sub_themes),
            "l1_heading": self.l1_heading,
            "l2_headings": list(self.l2_headings),
            "l3_headings": list(self.l3_headings),
            "category_l1": self.category_l1,
            "category_l2": self.category_l2,
            "category_l3": self.category_l3,
        }


_SYSTEM_PROMPT = (
    EXPERT_PERSONA
    + "\n\n"
    + INDUSTRY_AWARE_DIRECTIVE
    + "\n\n"
    + "You analyze a single page of a corporate finance document (earnings "
    "release, transcript, investor presentation, annual report, etc.). "
    "Return STRICT JSON with keys:\n"
    "  summary        — 2-4 sentence page summary in industry-specific "
    "vocabulary.\n"
    "  primary_theme  — short phrase (2-6 words) capturing the dominant topic.\n"
    "  sub_themes     — array of 3-6 short phrases for secondary topics.\n"
    "  l1_heading     — the single top-level page heading (empty string if none).\n"
    "  l2_headings    — array of section sub-headings under L1 (may be empty).\n"
    "  l3_headings    — array of sub-sub-headings under L2 entries (may be empty).\n"
    + "  " + CATEGORY_TAXONOMY_BLOCK.replace("\n", "\n  ")
    + "\n"
    "Headings should reflect the document's actual structure (titles, section "
    "banners, slide headers, bold labels), not your own invented taxonomy. "
    "category_l1/l2/l3 are MANDATORY — they are the primary signal used "
    "downstream to match this chunk against analyst questions. "
    "No prose outside the JSON."
)


def _build_user_prompt(page_text: str, page_number: int, company: str = "") -> str:
    snippet = page_text.strip()
    if len(snippet) > MAX_CHARS_FOR_LLM:
        snippet = snippet[:MAX_CHARS_FOR_LLM] + " …[truncated]"
    company_line = f"Company: {company.strip()}\n" if company.strip() else ""
    return (
        f"{company_line}"
        f"Page {page_number} content:\n"
        f"---\n{snippet}\n---\n\n"
        "Respond with JSON only."
    )


def _extract_json_object(text: str) -> dict | None:
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def _coerce_str_list(raw: Any, limit: int) -> list[str]:
    out: list[str] = []
    if not isinstance(raw, list):
        return out
    for item in raw:
        s = str(item).strip()
        if s and s not in out:
            out.append(s)
        if len(out) >= limit:
            break
    return out


def _coerce_analysis(obj: dict | None) -> PageAnalysis:
    if not isinstance(obj, dict):
        return PageAnalysis()
    return PageAnalysis(
        summary=str(obj.get("summary") or "").strip(),
        primary_theme=str(obj.get("primary_theme") or "").strip(),
        sub_themes=_coerce_str_list(obj.get("sub_themes"), MAX_SUB_THEMES),
        l1_heading=str(obj.get("l1_heading") or "").strip(),
        l2_headings=_coerce_str_list(obj.get("l2_headings"), MAX_L2_HEADINGS),
        l3_headings=_coerce_str_list(obj.get("l3_headings"), MAX_L3_HEADINGS),
        category_l1=str(obj.get("category_l1") or "").strip(),
        category_l2=str(obj.get("category_l2") or "").strip(),
        category_l3=str(obj.get("category_l3") or "").strip(),
    )


def analyze_page(page_text: str, page_number: int, company: str = "") -> PageAnalysis:
    """LLM-driven summary + primary theme + sub-themes + L1/L2/L3 taxonomy.

    Returns an empty PageAnalysis on any failure so callers can proceed.
    """
    if not page_text or not page_text.strip():
        return PageAnalysis()
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": _build_user_prompt(page_text, page_number, company)},
    ]
    try:
        raw = chat_completion(messages, temperature=0.2)
    except Exception:
        return PageAnalysis()
    return _coerce_analysis(_extract_json_object(raw))


def analyze_pages(pages: list[tuple[int, str]], company: str = "") -> dict[int, PageAnalysis]:
    """Analyze a list of (page_number, page_text) tuples. Sequential calls."""
    out: dict[int, PageAnalysis] = {}
    for page_num, page_text in pages:
        out[page_num] = analyze_page(page_text, page_num, company)
    return out
