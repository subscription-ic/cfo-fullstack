"""Per-page summarization + analyst-grade signal extraction via a single LLM call.

For each physical page of a corporate-finance document, produces a structured
analysis the downstream question generator can mine for analyst-style probes:

    - summary, primary_theme, sub_themes           (overview)
    - l1/l2/l3_heading(s)                          (document structure)
    - category_l1/l2/l3                            (taxonomy — closed enum)
    - quant_anchors                                (numbers WITH context: e.g.
                                                    "GM declined 230 bps to 32.4%")
    - named_entities                               (customers, suppliers, regulators,
                                                    consultants, named events)
    - catalyst_events                              (M&A, regulatory changes,
                                                    contract wins/losses, lawsuits,
                                                    management changes, etc.)
    - forward_statements                           (guidance, commitments,
                                                    outlook claims)

Design goals:
  Company-agnostic — instructions never name specific companies, sectors, or
  regulators. Examples are illustrative, not lookup tables.
  Quarter-agnostic — extraction logic operates on whatever text the page
  carries; the LLM is not told which quarter is "current."
  Depth-stable — temperature 0.2, structured-JSON output, fixed budget per
  page so a 100-page annual report and a 4-page press release get equal
  extraction quality per page.

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
    CATEGORY_TAXONOMY_PAGE_PROMPT,
    EXPERT_PERSONA,
    INDUSTRY_AWARE_DIRECTIVE,
)

MAX_CHARS_FOR_LLM = 8000          # raised from 6000 — longer context = more anchors
MAX_SUB_THEMES = 6
MAX_L2_HEADINGS = 6
MAX_L3_HEADINGS = 10
MAX_QUANT_ANCHORS = 12
MAX_NAMED_ENTITIES = 12
MAX_CATALYST_EVENTS = 8
MAX_FORWARD_STATEMENTS = 8


@dataclass
class PageAnalysis:
    summary: str = ""
    primary_theme: str = ""
    sub_themes: list[str] = field(default_factory=list)
    l1_heading: str = ""
    l2_headings: list[str] = field(default_factory=list)
    l3_headings: list[str] = field(default_factory=list)
    # Three-level categorical taxonomy (aligned with the question generator).
    category_l1: str = ""
    category_l2: str = ""
    category_l3: str = ""
    # Analyst-grade signal extraction. Each list carries short, self-contained
    # strings the question generator can paste directly into a prompt as
    # discussion anchors.
    quant_anchors: list[str] = field(default_factory=list)
    named_entities: list[str] = field(default_factory=list)
    catalyst_events: list[str] = field(default_factory=list)
    forward_statements: list[str] = field(default_factory=list)

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
            "quant_anchors": list(self.quant_anchors),
            "named_entities": list(self.named_entities),
            "catalyst_events": list(self.catalyst_events),
            "forward_statements": list(self.forward_statements),
        }


# Note on examples used below: every example is a TEMPLATE pattern (using
# `<placeholders>`) — never a specific real-world company, person, or
# regulator. This keeps extraction company-agnostic and quarter-agnostic;
# the LLM must adapt the pattern to whatever appears on the page in front
# of it, not match against a hard-coded dictionary.
_SYSTEM_PROMPT = (
    EXPERT_PERSONA
    + "\n\n"
    + INDUSTRY_AWARE_DIRECTIVE
    + "\n\n"
    + """You analyze ONE page of a corporate finance document (earnings
release, transcript, investor presentation, annual report, supplementary
data, press release, etc.).

PRIMARY GOAL: extract everything an equity analyst would probe in the next
earnings call. The downstream question generator mines your output —
anything you miss here is a question the model will fail to predict.

Run the 5-step reasoning procedure from the meta-instruction at the end.
Then return STRICT JSON with these keys:

────────────────── OVERVIEW ──────────────────
  summary        — 3-5 sentences. Specific, numeric, and ACTION-oriented:
                   include the page's key claim, the supporting metrics, and
                   the implication. NOT a generic gloss.
  primary_theme  — 2-6 words capturing the dominant page topic.
  sub_themes     — array of 3-6 secondary topic phrases.

──────────── DOCUMENT STRUCTURE ──────────────
  l1_heading     — the single top-level page heading; empty string if none.
  l2_headings    — array of sub-section headings under L1.
  l3_headings    — array of sub-sub-section headings under L2.
  Reflect the document's actual structure (titles, banners, slide headers,
  bold labels). DO NOT invent or paraphrase.

────────────── TAXONOMY (MANDATORY) ──────────
  category_l1    — VERBATIM from the L1 enum at the end of this prompt.
  category_l2    — VERBATIM from the L2 list for that L1.
  category_l3    — 2-5 word page-specific sub-angle, or empty string.
  category       — lowercase snake_case of category_l1.
  These are the PRIMARY retrieval key downstream. NEVER skip them.

────────── ANALYST SIGNAL EXTRACTION ─────────
The four lists below are the difference between a generic FAQ and a real
analyst probe. Quality > quantity. Each item must be SHORT, self-contained,
and grounded in the page text — no synthesis from outside knowledge.

  quant_anchors        — array of 0-12 strings, each carrying a number WITH
                         its context and direction. Required form:
                         "<metric> <verb> <value> <unit/direction>"
                         Templates (adapt to whatever the page actually says):
                         • "<margin metric> declined <N> bps to <N>%"
                         • "<segment> revenue grew <N>% YoY to ₹<N>"
                         • "<cost line> increased to <N>% of sales from <N>%"
                         • "<balance sheet item> at ₹<N>, +<N>% vs prior period"
                         • "guidance raised/lowered to <N>%–<N>%"
                         Skip pure prose. Skip generic numbers without a metric.

  named_entities       — array of 0-12 PROPER NOUNS that drive the page's
                         substance. Categories the LLM should sweep for:
                         • customers, suppliers, distribution partners
                         • named regulators, regulatory regimes, FTAs, tariffs
                         • consultants, auditors, restructuring advisors
                         • acquired/divested subsidiaries or brands
                         • lenders, lead bankers, anchor investors
                         • named geographies (countries, key states)
                         • named litigations, court rulings, named precedents
                         • named management (only if the page mentions them
                           in a non-trivial role: e.g., a CFO change, not the
                           CEO's quoted greeting)
                         Strip generic labels — "the customer", "European
                         peers", "the regulator" are NOT entities. Concrete
                         names only.

  catalyst_events      — array of 0-8 SHORT phrases naming material events
                         occurring in this period that the next call's
                         analysts will probe. Templates:
                         • "<named entity> filed for <event>"
                         • "<regulator> imposed <new measure> effective <date>"
                         • "<contract type> signed with <named entity>"
                         • "<facility/product> launched in <named geography>"
                         • "<segment> exited / acquired / restructured"
                         • "<management role> change to/from <name>"
                         • "<credit rating> upgraded/downgraded by <agency>"
                         An event is "material" if it changes guidance,
                         valuation, or risk profile.

  forward_statements   — array of 0-8 management commitments / outlook
                         claims that the page asserts about future periods.
                         Each must be one short sentence containing a
                         TIMEFRAME and a CLAIMED OUTCOME. Templates:
                         • "Expect <metric> at <range> through <period>"
                         • "Targeting <metric> improvement of <N> bps over
                            next <N> quarters"
                         • "Plans <action> by <date>"
                         • "Reiterates <range> guidance for full year"
                         These become the most-probed items on the next call.

──────────── TRACE FIELD ────────────
  _reasoning     — Steps 1-5 trace from the procedure, ≤100 words.

CONSTRAINTS APPLIED TO EVERY FIELD:
  • No prose outside the JSON.
  • No company name from your training data unless the page text uses it.
  • No fiscal-quarter inference: if the page says "FY26 outlook", echo that;
    do NOT promote it into a category_l3 or named_entity.
  • An empty list is valid when the page genuinely has nothing in that
    bucket. Do NOT pad lists with fluff.
  • Quality of `quant_anchors`, `named_entities`, `catalyst_events`,
    `forward_statements` is what the downstream generator scores against —
    treat them as the most important fields after the taxonomy.

"""
    + CATEGORY_TAXONOMY_PAGE_PROMPT
)


def _build_user_prompt(page_text: str, page_number: int, company: str = "") -> str:
    snippet = page_text.strip()
    if len(snippet) > MAX_CHARS_FOR_LLM:
        snippet = snippet[:MAX_CHARS_FOR_LLM] + " …[truncated]"
    # We pass the company verbatim only so the LLM can resolve pronouns ("we",
    # "the group") to a clearer subject inside anchors. The extraction logic
    # itself must NOT special-case any company — that's enforced by the
    # system prompt.
    company_line = f"Company under analysis: {company.strip()}\n" if company.strip() else ""
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
        quant_anchors=_coerce_str_list(obj.get("quant_anchors"), MAX_QUANT_ANCHORS),
        named_entities=_coerce_str_list(obj.get("named_entities"), MAX_NAMED_ENTITIES),
        catalyst_events=_coerce_str_list(obj.get("catalyst_events"), MAX_CATALYST_EVENTS),
        forward_statements=_coerce_str_list(obj.get("forward_statements"), MAX_FORWARD_STATEMENTS),
    )


def analyze_page(page_text: str, page_number: int, company: str = "") -> PageAnalysis:
    """LLM-driven summary + structure + taxonomy + analyst-signal extraction.

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
