"""Dynamic question generation using historical Q&A, optional RAG chunks, and LLM."""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

from supabase import Client

from app.infrastructure.llm import chat_completion, embed_query, get_openai_client
from app.shared.constants import EXPERT_PERSONA, INDUSTRY_AWARE_DIRECTIVE
from app.modules.question_generation.schemas import (
    GeneratedQuestionItem,
    QuestionGenerationRequest,
    QuestionGenerationResponse,
)


DEFAULT_NUM_QUESTIONS_FALLBACK = 10
AUTO_NUM_QUESTIONS_MIN = 10
AUTO_NUM_QUESTIONS_MAX = 25


def _avg_questions_last_4_quarters(supabase: Client, company: str) -> int | None:
    """Average analyst-question count per quarter for this company across its
    most recent 4 quarters in actual_earnings_qa. Returns None when no data."""
    try:
        resp = (
            supabase.table("actual_earnings_qa")
            .select("fiscal_year, quarter")
            .ilike("company", f"%{company.strip()}%")
            .execute()
        )
        rows = resp.data or []
    except Exception:
        return None
    if not rows:
        return None

    counts: dict[tuple[int, str], int] = {}
    for r in rows:
        fy_raw = r.get("fiscal_year")
        qt = str(r.get("quarter") or "").strip()
        if fy_raw is None or not qt:
            continue
        try:
            fy = int(fy_raw)
        except (TypeError, ValueError):
            continue
        counts[(fy, qt)] = counts.get((fy, qt), 0) + 1

    if not counts:
        return None

    sorted_keys = sorted(counts.keys(), key=lambda k: (k[0], k[1]), reverse=True)
    last4 = sorted_keys[:4]
    avg = sum(counts[k] for k in last4) / len(last4)
    return max(AUTO_NUM_QUESTIONS_MIN, min(round(avg), AUTO_NUM_QUESTIONS_MAX))


def _filter_by_year(rows: list[dict[str, Any]], y_from: int | None, y_to: int | None) -> list[dict[str, Any]]:
    if y_from is None and y_to is None:
        return rows
    out: list[dict[str, Any]] = []
    for r in rows:
        fy = r.get("fiscal_year")
        if fy is None:
            out.append(r)
            continue
        try:
            y = int(fy)
        except (TypeError, ValueError):
            out.append(r)
            continue
        if y_from is not None and y < y_from:
            continue
        if y_to is not None and y > y_to:
            continue
        out.append(r)
    return out


def _fetch_historical_context(supabase: Client, req: QuestionGenerationRequest) -> tuple[str, str]:
    """Returns (actual_qa_block, predicted_qa_block) as formatted strings."""
    company_filter = req.company.strip()

    try:
        aq_resp = supabase.table("actual_earnings_qa").select("*").ilike("company", f"%{company_filter}%").execute()
        aq_rows = aq_resp.data or []
    except Exception:
        aq_rows = []

    aq_rows = _filter_by_year(aq_rows, req.year_from, req.year_to)
    if req.last_n_quarters and len(aq_rows) > req.last_n_quarters * 5:
        aq_rows = aq_rows[-req.last_n_quarters * 5 :]

    actual_lines: list[str] = []
    for r in aq_rows[:40]:
        period = r.get("period_label") or f"{r.get('quarter','')} {r.get('fiscal_year','')}"
        q = r.get("question", "")
        a = (r.get("answer") or "")[:400]
        cat = r.get("category", "")
        actual_lines.append(f"- [{period}] ({cat}) Q: {q}\n  A: {a}")

    try:
        pq_resp = supabase.table("predicted_qa").select("*").ilike("company", f"%{company_filter}%").execute()
        pq_rows = pq_resp.data or []
    except Exception:
        pq_rows = []

    pq_rows = _filter_by_year(
        pq_rows,
        req.year_from,
        req.year_to,
    )
    if req.last_n_quarters and len(pq_rows) > req.last_n_quarters * 5:
        pq_rows = pq_rows[-req.last_n_quarters * 5 :]

    pred_lines: list[str] = []
    for r in pq_rows[:40]:
        pq = r.get("predicted_question", r.get("question", ""))
        cat = r.get("category", "")
        risk = r.get("risk", "")
        pred_lines.append(f"- ({cat}, risk={risk}) {pq}")

    return "\n".join(actual_lines) if actual_lines else "(none)", "\n".join(pred_lines) if pred_lines else "(none)"


def _fetch_rag_chunks(supabase: Client, req: QuestionGenerationRequest) -> str:
    if get_openai_client() is None:
        return ""
    try:
        qtext = (
            f"Key themes and risks for {req.company} earnings calls across quarters; "
            f"analyst focus areas; guidance and margin topics."
        )
        vec = embed_query(qtext)
        params = {
            "query_embedding": vec,
            "filter_company": req.company.strip(),
            "filter_doc_type": req.document_type_filter,
            "filter_source_category": req.source_category_filter,
            "match_count": 12,
        }
        res = supabase.rpc("match_document_chunks", params).execute()
        rows = res.data or []
    except Exception:
        return ""

    lines: list[str] = []
    for row in rows[:12]:
        content = row.get("content", "")[:600]
        meta = row.get("metadata") or {}
        lines.append(f"- [{meta.get('document_type')}/{meta.get('source_category')}/{meta.get('quarter')} {meta.get('fiscal_year')}] {content}")
    return "\n".join(lines) if lines else ""


def _parse_llm_questions(raw: str, num: int) -> list[GeneratedQuestionItem]:
    raw = raw.strip()
    try:
        data = json.loads(raw)
        if isinstance(data, dict) and "questions" in data:
            data = data["questions"]
        if not isinstance(data, list):
            return []
        out: list[GeneratedQuestionItem] = []
        for item in data[:num]:
            if not isinstance(item, dict):
                continue
            l1 = str(item.get("category_l1") or "").strip() or None
            l2 = str(item.get("category_l2") or "").strip() or None
            flat = str(item.get("category") or "").strip()
            if not flat and l1:
                flat = f"{l1} / {l2}" if l2 else l1
            out.append(
                GeneratedQuestionItem(
                    predicted_question=str(item.get("predicted_question", item.get("question", ""))),
                    suggested_answer=str(item.get("suggested_answer", item.get("recommended_answer", ""))),
                    category=flat or "General",
                    category_l1=l1,
                    category_l2=l2,
                    risk=str(item.get("risk", "medium")).lower(),
                )
            )
        return out
    except json.JSONDecodeError:
        pass

    out: list[GeneratedQuestionItem] = []
    blocks = re.split(r"\n---\n", raw)
    for b in blocks[:num]:
        if not b.strip():
            continue
        out.append(
            GeneratedQuestionItem(
                predicted_question=b.strip()[:2000],
                suggested_answer="",
                category="General",
                risk="medium",
            )
        )
    return out


def _fetch_analysis_context(supabase: Client, analysis_id: str) -> str:
    """Fetch analysis results and format as structured context blocks."""
    try:
        resp = (
            supabase.table("document_analyses")
            .select("*")
            .eq("id", analysis_id)
            .limit(1)
            .execute()
        )
        if not resp.data:
            return ""
        row = resp.data[0]
    except Exception:
        return ""

    blocks: list[str] = []

    # Themes
    themes = row.get("themes") or []
    if themes:
        lines = [f"- {t['name']} ({t.get('importance','medium')}): {t.get('description','')}" for t in themes]
        blocks.append("--- Identified Themes (current quarter) ---\n" + "\n".join(lines))

    # Deltas
    deltas = row.get("deltas") or []
    if deltas:
        lines = [
            f"- {d['theme']}: {d.get('direction','stable')} ({d.get('magnitude','')})"
            f" — Current: {d.get('current_summary','')} | Previous: {d.get('previous_summary','')}"
            for d in deltas
        ]
        blocks.append("--- Quarter-over-Quarter Changes ---\n" + "\n".join(lines))

    # Signals
    signals = row.get("signals") or []
    if signals:
        lines = [f"- [{s.get('type','')}] ({s.get('severity','medium')}): {s.get('description','')}" for s in signals]
        blocks.append("--- Detected Signals & Risks ---\n" + "\n".join(lines))

    # Question patterns
    patterns = row.get("question_patterns") or []
    if patterns:
        lines = []
        for p in patterns:
            examples = "; ".join(p.get("example_questions", [])[:3])
            lines.append(f"- {p.get('theme','')}: {p.get('pattern_description','')} ({p.get('frequency','')}) — Examples: {examples}")
        blocks.append("--- Historical Analyst Question Patterns ---\n" + "\n".join(lines))

    return "\n\n".join(blocks)


def run_question_generation(supabase: Client, req: QuestionGenerationRequest) -> QuestionGenerationResponse:
    if get_openai_client() is None:
        raise RuntimeError("OPENAI_API_KEY is not configured; cannot generate questions")

    auto_resolved = False
    if req.num_questions is None:
        avg = _avg_questions_last_4_quarters(supabase, req.company)
        resolved_num = avg if avg is not None else DEFAULT_NUM_QUESTIONS_FALLBACK
        auto_resolved = True
    else:
        resolved_num = req.num_questions
    req.num_questions = resolved_num

    actual_block, predicted_block = _fetch_historical_context(supabase, req)
    rag_block = _fetch_rag_chunks(supabase, req)

    # Fetch analysis context if analysis_id is provided
    analysis_block = ""
    if req.analysis_id:
        analysis_block = _fetch_analysis_context(supabase, req.analysis_id)

    target = ""
    if req.fiscal_year and req.quarter:
        target = f"Target reporting period: {req.quarter} FY{str(req.fiscal_year)[-2:]} ({req.fiscal_year})."

    # Build analysis-enhanced instruction if analysis context is available
    analysis_instruction = ""
    if analysis_block:
        analysis_instruction = (
            "\n\nGenerate questions that specifically probe the identified themes, "
            "challenge areas showing decline, explore risks and forward-looking signals, "
            "and follow the patterns analysts historically use. Each question should be "
            "traceable to at least one theme, delta, or signal above."
        )

    prompt = f"""{EXPERT_PERSONA}

{INDUSTRY_AWARE_DIRECTIVE}

You are preparing a CFO for an earnings call.

Company: {req.company}
{target}

Use patterns from historical actual Q&A and prior predicted questions. Incorporate document context when present.

--- Historical actual Q&A (sample) ---
{actual_block}

--- Prior predicted / thematic questions ---
{predicted_block}

--- Relevant document excerpts (RAG) ---
{rag_block if rag_block else "(no vector matches or OPENAI unavailable)"}

{analysis_block}

Coverage requirements (MUST all be satisfied):
- Return a JSON array of AT LEAST {req.num_questions} objects — more is fine if the material supports it, fewer is not acceptable.
- Span the MAJOR themes that show up in the historical context, the RAG excerpts, and the page summaries above. Do NOT cluster every question on one topic.
- Prioritize HIGH-PROBABILITY questions: the ones analysts have repeatedly asked this company in prior quarters, and the ones that naturally follow from the most recent deltas / signals / financial disclosures in the documents.
- Each question should be distinct in substance — no paraphrases of another question in the same list.

Each object must have keys: predicted_question, suggested_answer, category_l1, category_l2, risk (one of low, medium, high).

Category taxonomy (use EXACTLY these L1 buckets; pick ONE L1 per question and a short specific L2 phrase):
- Growth            (L2 examples: Revenue Growth, Loan Book Growth, New Customer Acquisition, Geographic Expansion)
- Margins           (L2 examples: Gross Margin, Operating Margin, NIM Pressure, Cost Inflation)
- Guidance          (L2 examples: Full-Year Outlook, Next-Quarter Guidance, Long-term Targets)
- Capital & Liquidity  (L2 examples: Capital Adequacy, Buybacks, Dividends, Leverage)
- Asset Quality     (L2 examples: NPA Trend, Provisioning, Credit Cost, Restructured Book)
- Segment Performance (L2 examples: Segment Mix, Product Line, Geography)
- Demand            (L2 examples: End-Market Demand, Order Book, Pipeline)
- Cost Structure    (L2 examples: Opex Leverage, Headcount, Input Costs)
- M&A               (L2 examples: Acquisition Rationale, Integration, Divestiture)
- Risk & Regulation (L2 examples: Compliance, Litigation, Regulatory Change)
- Strategy          (L2 examples: Long-term Strategy, Digital, Competitive Positioning)
- Other             (only if none of the above fit)

Only output valid JSON, no markdown fences.{analysis_instruction}"""

    raw = chat_completion(
        [
            {
                "role": "system",
                "content": (
                    EXPERT_PERSONA
                    + "\n\n"
                    + INDUSTRY_AWARE_DIRECTIVE
                    + "\n\nYou output only valid JSON arrays. No markdown."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.35,
    )

    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    questions = _parse_llm_questions(cleaned, req.num_questions)

    persist_errors: list[str] = []
    persist_saved = 0
    # If the DB hasn't had migration 010 applied yet, PostgREST can't see the
    # fiscal_year / quarter columns. Detect that once and fall back to the
    # legacy column set so persistence still succeeds.
    period_columns_supported = True
    category_hierarchy_supported = True
    if req.persist and questions:
        for q in questions:
            base_row: dict[str, Any] = {
                "id": str(uuid.uuid4()),
                "company": req.company.strip(),
                "predicted_question": q.predicted_question,
                "suggested_answer": q.suggested_answer,
                "category": q.category,
                "risk": q.risk,
            }
            row = dict(base_row)
            if period_columns_supported:
                row["fiscal_year"] = req.fiscal_year
                row["quarter"] = req.quarter
            if category_hierarchy_supported:
                row["category_l1"] = q.category_l1
                row["category_l2"] = q.category_l2
            try:
                supabase.table("predicted_qa").insert(row).execute()
                q.id = row["id"]
                persist_saved += 1
            except Exception as exc:
                msg = str(exc)
                if category_hierarchy_supported and (
                    "category_l1" in msg or "category_l2" in msg
                ):
                    category_hierarchy_supported = False
                    row.pop("category_l1", None)
                    row.pop("category_l2", None)
                    try:
                        supabase.table("predicted_qa").insert(row).execute()
                        q.id = row["id"]
                        persist_saved += 1
                        continue
                    except Exception:
                        pass
                if period_columns_supported and (
                    "fiscal_year" in msg or "quarter" in msg or "PGRST204" in msg
                ):
                    period_columns_supported = False
                    try:
                        supabase.table("predicted_qa").insert(base_row).execute()
                        q.id = base_row["id"]
                        persist_saved += 1
                        continue
                    except Exception as exc2:
                        persist_errors.append(
                            f"{q.predicted_question[:40]}…: {exc2}"
                        )
                        continue
                persist_errors.append(f"{q.predicted_question[:40]}…: {exc}")
    if req.persist and questions and persist_saved == 0:
        raise RuntimeError(
            "Failed to persist questions to predicted_qa. "
            + ("; ".join(persist_errors[:3]) if persist_errors else "No rows saved.")
        )

    summary = (
        f"Target count: {resolved_num}"
        f"{' (auto from last 4 quarters)' if auto_resolved else ''}. "
        f"Used {len(actual_block.splitlines())} actual Q&A lines, "
        f"{len(predicted_block.splitlines())} predicted lines, RAG={'yes' if rag_block else 'no'}."
    )
    if persist_errors:
        summary += f" Persist: {persist_saved}/{len(questions)} saved; {len(persist_errors)} error(s)."
    return QuestionGenerationResponse(
        questions=questions,
        context_summary=summary,
        resolved_num_questions=resolved_num,
    )
