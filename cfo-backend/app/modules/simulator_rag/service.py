"""Hybrid RAG for Earnings Call Simulator: dense + lexical, RRF fusion, LLM rerank, grounded answer."""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

from supabase import Client

logger = logging.getLogger(__name__)

from app.infrastructure.llm import chat_completion, embed_query, get_openai_client
from app.shared.constants import (
    EXPERT_PERSONA,
    INDUSTRY_AWARE_DIRECTIVE,
    TRANSCRIPT_DOC_TYPES,
)

RRF_K = 60
DENSE_K = 28
LEXICAL_K = 28
RRF_TOP_N = 14
RERANK_POOL = 12
CONTEXT_CHUNKS = 6


def _row_key(row: dict[str, Any]) -> str:
    return str(row.get("id") or "")


def _resolve_citation(meta: dict[str, Any], document_id: str | None) -> str:
    """Stable citation id: file_ref#page (new uploads) or stem#page / fallback for legacy chunks."""
    if meta.get("citation"):
        return str(meta["citation"])
    fn = meta.get("source_filename") or meta.get("original_filename")
    stem = _safe_stem(str(fn) if fn else "document")
    page = meta.get("page_number")
    if page is None:
        page = 1
    ref = meta.get("file_ref")
    if not ref and document_id:
        ref = document_id.replace("-", "")[:6]
    if not ref:
        ref = "doc"
    return f"{ref}#{int(page)}"


def _safe_stem(name: str, max_len: int = 28) -> str:
    base = Path(name).name
    stem = Path(base).stem if base else "document"
    stem = re.sub(r"[^\w.\-]+", "-", stem, flags=re.UNICODE).strip("-_.") or "document"
    if len(stem) > max_len:
        stem = stem[: max_len - 1] + "…"
    return stem


def _citation_legend_line(meta: dict[str, Any], citation_id: str) -> str:
    fn = meta.get("source_filename") or meta.get("original_filename") or ""
    fn = Path(str(fn)).name if fn else ""
    page = meta.get("page_number", 1)
    if fn:
        return f"  {citation_id} → {fn} (page {page})"
    return f"  {citation_id} → page {page}"


def _page_from_meta(meta: dict[str, Any], citation: str) -> int:
    p = meta.get("page_number")
    if p is not None:
        try:
            return max(1, int(p))
        except (TypeError, ValueError):
            pass
    if "#" in citation:
        try:
            return max(1, int(citation.rsplit("#", 1)[-1]))
        except ValueError:
            pass
    return 1


def _batch_document_storage(supabase: Client, doc_ids: set[str]) -> dict[str, dict[str, Any]]:
    ids = [i for i in doc_ids if i]
    if not ids:
        return {}
    try:
        res = (
            supabase.table("documents")
            .select("id, storage_bucket, storage_path, mime_type, original_filename")
            .in_("id", ids)
            .execute()
        )
        return {str(r["id"]): r for r in (res.data or [])}
    except Exception:
        return {}


def _signed_url_open_document(
    supabase: Client,
    bucket: str,
    storage_path: str,
    page_number: int,
    mime_type: str | None,
    original_filename: str | None,
) -> str | None:
    """Supabase signed URL; PDFs get #page=N for browser viewers that honor PDF fragments."""
    try:
        path_clean = (storage_path or "").lstrip("/")
        if not bucket or not path_clean:
            return None
        res = supabase.storage.from_(bucket).create_signed_url(path_clean, 7200)
        base: str | None = None
        if isinstance(res, dict):
            base = res.get("signedURL") or res.get("signedUrl")
        if not base:
            return None
        mt = (mime_type or "").lower()
        fn = (original_filename or path_clean).lower()
        is_pdf = "pdf" in mt or fn.endswith(".pdf")
        if is_pdf and page_number >= 1:
            return f"{base}#page={page_number}"
        return base
    except Exception:
        return None


def _enrich_sources_pdf_links(
    supabase: Client, sources: list[dict[str, Any]]
) -> dict[str, str]:
    """Add pdf_url / page_number to each source; return map citation_id -> url for inline links."""
    doc_ids = {str(s["document_id"]) for s in sources if s.get("document_id")}
    doc_rows = _batch_document_storage(supabase, doc_ids)
    hrefs: dict[str, str] = {}

    for s in sources:
        meta = s.get("metadata") or {}
        doc_id = str(s["document_id"]) if s.get("document_id") else ""
        row = doc_rows.get(doc_id) if doc_id else None
        bucket = meta.get("storage_bucket") or (row or {}).get("storage_bucket")
        path = meta.get("storage_path") or (row or {}).get("storage_path")
        mime = meta.get("mime_type") or (row or {}).get("mime_type")
        filename = meta.get("source_filename") or (row or {}).get("original_filename")
        citation = str(s.get("citation") or "")
        page = _page_from_meta(meta, citation)
        s["page_number"] = page

        if not bucket or not path:
            s["pdf_url"] = None
            continue

        url = _signed_url_open_document(
            supabase, str(bucket), str(path), page, str(mime) if mime else None, str(filename) if filename else None
        )
        s["pdf_url"] = url
        if url and citation and citation not in hrefs:
            hrefs[citation] = url

    return hrefs


def _reciprocal_rank_fusion(
    dense_rows: list[dict[str, Any]],
    lex_rows: list[dict[str, Any]],
    k: int = RRF_K,
) -> list[dict[str, Any]]:
    by_id: dict[str, dict[str, Any]] = {}
    ranks_dense: dict[str, int] = {}
    ranks_lex: dict[str, int] = {}

    for i, row in enumerate(dense_rows):
        rid = _row_key(row)
        if not rid:
            continue
        ranks_dense[rid] = i + 1
        by_id[rid] = dict(row)

    for i, row in enumerate(lex_rows):
        rid = _row_key(row)
        if not rid:
            continue
        ranks_lex[rid] = i + 1
        if rid not in by_id:
            by_id[rid] = dict(row)

    scored: list[tuple[float, str]] = []
    for rid in by_id:
        rrf = 0.0
        if rid in ranks_dense:
            rrf += 1.0 / (k + ranks_dense[rid])
        if rid in ranks_lex:
            rrf += 1.0 / (k + ranks_lex[rid])
        scored.append((rrf, rid))

    scored.sort(key=lambda x: -x[0])
    out: list[dict[str, Any]] = []
    for score, rid in scored:
        r = dict(by_id[rid])
        r["_rrf"] = score
        out.append(r)
    return out


def _lexical_search_safe(
    supabase: Client, question: str, company: str | None = None,
) -> list[dict[str, Any]]:
    """Full-text leg; constrained to the selected company when provided."""
    try:
        res = supabase.rpc(
            "match_document_chunks_lexical",
            {
                "query_text": question[:4000],
                "filter_company": (company or "").strip(),
                "match_count": LEXICAL_K,
            },
        ).execute()
        return list(res.data or [])
    except Exception as exc:
        logger.warning("match_document_chunks_lexical failed: %s", exc, exc_info=True)
        return []


def _dense_search(
    supabase: Client, question: str, company: str | None = None,
) -> list[dict[str, Any]]:
    """Vector leg; constrained to the selected company when provided."""
    if get_openai_client() is None:
        return []
    try:
        vec = embed_query(question)
        res = supabase.rpc(
            "match_document_chunks",
            {
                "query_embedding": vec,
                "filter_company": (company or "").strip(),
                "filter_doc_type": None,
                "filter_source_category": None,
                "match_count": DENSE_K,
            },
        ).execute()
        return list(res.data or [])
    except Exception as exc:
        logger.warning("match_document_chunks failed: %s", exc, exc_info=True)
        return []


def _llm_rerank(question: str, chunks: list[dict[str, Any]], keep: int = CONTEXT_CHUNKS) -> list[dict[str, Any]]:
    if not chunks or get_openai_client() is None:
        return chunks[:keep]
    pool = chunks[:RERANK_POOL]
    lines = []
    for i, ch in enumerate(pool):
        text = (ch.get("content") or "")[:700].replace("\n", " ")
        lines.append(f"{i + 1}. {text}")
    numbered = "\n".join(lines)
    msg = (
        EXPERT_PERSONA + "\n\n" + INDUSTRY_AWARE_DIRECTIVE + "\n\n"
        "Imagine you are supporting a CFO on a live earnings Q&A. Rank excerpts by how well they "
        "help answer the question’s real theme (e.g. guidance, margins, capital, risk, regulation)—"
        "not only keyword overlap.\n"
        f"Return ONLY a JSON array of integers: 1-based indices from the list below, "
        f"most relevant first. Include at most {keep} indices. No prose.\n\n"
        f"Question: {question[:1500]}\n\nExcerpts:\n{numbered}"
    )
    try:
        raw = chat_completion([{"role": "user", "content": msg}], temperature=0.05)
        raw = raw.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```\w*\n?", "", raw)
            raw = re.sub(r"\n?```\s*$", "", raw)
        arr = json.loads(raw)
        if not isinstance(arr, list):
            return pool[:keep]
        order: list[int] = []
        for x in arr:
            if isinstance(x, int) and 1 <= x <= len(pool):
                order.append(x - 1)
        seen: set[int] = set()
        ranked: list[dict[str, Any]] = []
        for idx in order:
            if idx not in seen:
                seen.add(idx)
                ranked.append(pool[idx])
            if len(ranked) >= keep:
                break
        for i, ch in enumerate(pool):
            if i not in seen and len(ranked) < keep:
                ranked.append(ch)
        return ranked[:keep]
    except Exception:
        return chunks[:keep]


def _synthesize(question: str, chunks: list[dict[str, Any]]) -> str:
    if not chunks:
        return (
            "No matching content was found in uploaded documents for this question. "
            "Upload relevant filings or transcripts and try again."
        )
    if get_openai_client() is None:
        parts = []
        for ch in chunks[:4]:
            meta = ch.get("metadata") or {}
            cit = _resolve_citation(meta, str(ch.get("document_id") or "") or None)
            parts.append(f"[{cit}] {(ch.get('content') or '')[:600]}")
        return "OpenAI is not configured; raw excerpts:\n\n" + "\n\n".join(parts)

    ctx_blocks = []
    legend_lines: list[str] = []
    seen_cit: set[str] = set()
    for i, ch in enumerate(chunks, start=1):
        meta = ch.get("metadata") or {}
        doc_id = str(ch.get("document_id") or "") or None
        cit = _resolve_citation(meta, doc_id)
        if cit not in seen_cit:
            seen_cit.add(cit)
            legend_lines.append(_citation_legend_line(meta, cit))
        label = f"{meta.get('document_type', '')}/{meta.get('quarter', '')} FY{meta.get('fiscal_year', '')}"
        # Hierarchical headings give the LLM context for where in the document
        # this excerpt sits — improves both relevance interpretation and the
        # downstream answer's specificity.
        l1 = ch.get("l1_heading") or meta.get("l1_heading") or ""
        l2 = ch.get("l2_headings") or meta.get("l2_headings") or []
        l3 = ch.get("l3_headings") or meta.get("l3_headings") or []
        heading_lines = []
        if l1:
            heading_lines.append(f"Section (L1): {l1}")
        if isinstance(l2, list) and l2:
            heading_lines.append(f"Sub-sections (L2): {' › '.join(str(x) for x in l2[:4])}")
        if isinstance(l3, list) and l3:
            heading_lines.append(f"Detail (L3): {' › '.join(str(x) for x in l3[:6])}")
        # Pre-extracted analyst signals from summarization.analyze_page —
        # surfaced so the answering CFO persona can reference specific numbers
        # / named events instead of paraphrasing the excerpt at a generic level.
        qa = meta.get("quant_anchors") or []
        ne = meta.get("named_entities") or []
        ce = meta.get("catalyst_events") or []
        fs = meta.get("forward_statements") or []
        if isinstance(qa, list) and qa:
            heading_lines.append("Quant anchors: " + " | ".join(str(x) for x in qa[:6]))
        if isinstance(ne, list) and ne:
            heading_lines.append("Named entities: " + " | ".join(str(x) for x in ne[:6]))
        if isinstance(ce, list) and ce:
            heading_lines.append("Catalyst events: " + " | ".join(str(x) for x in ce[:4]))
        if isinstance(fs, list) and fs:
            heading_lines.append("Forward statements: " + " | ".join(str(x) for x in fs[:4]))
        headings_block = ("\n".join(heading_lines) + "\n") if heading_lines else ""
        body = (ch.get("content") or "")[:1400]
        ctx_blocks.append(
            f"--- Excerpt {i} ---\nCitation ID (use exactly in brackets in your answer): [{cit}]\n"
            f"Context: {label.strip('/')}\n{headings_block}Text:\n{body}"
        )

    ctx = "\n\n".join(ctx_blocks)
    legend = "Citation key (file number # page number):\n" + "\n".join(legend_lines)
    messages = [
        {
            "role": "system",
            "content": (
                EXPERT_PERSONA + "\n\n" + INDUSTRY_AWARE_DIRECTIVE + "\n\n"
                "You are the CFO (or their voice) rehearsing answers before an earnings call. "
                "For EVERY question—whether it sounds trivial or complex—you always follow the same "
                "mental sequence: (1) Adopt the CFO persona: executive, accountable, clear, measured, "
                "confident without overpromising; use we/our where natural. "
                "(2) Infer the question’s theme and intent (what the analyst is really probing: "
                "e.g. growth, margins, liquidity, guidance, risk, capital returns, regulation, "
                "segment performance, one-off items). "
                "(3) Answer in that frame using ONLY the provided document excerpts—no outside facts "
                "or invented numbers. "
                "Citations are mandatory for any substantive claim tied to the documents."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Analyst question:\n{question}\n\n{legend}\n\nDocument excerpts:\n{ctx}\n\n"
                "Always, in order: briefly internalize the CFO persona and the question’s theme "
                "(you need not label these steps in the output unless one short orienting sentence "
                "helps clarity). Then respond as the CFO on the call.\n"
                "Length: if the question is simple or narrow, 2–5 tight sentences may suffice; "
                "if broad or multi-part, use up to 10 sentences.\n"
                "After each substantive claim that rests on the excerpts, add an inline citation "
                "in square brackets using the EXACT Citation ID for that material, e.g. [a1b2c3#4] "
                "(file reference # page number). These ids map to clickable PDF deep-links—do not alter them. "
                "Even brief factual points from the docs need a citation.\n"
                "If one sentence blends multiple excerpts, cite the primary source; add a second "
                "citation only when clearly needed.\n"
                "End with a line starting exactly `Sources:` then a comma-separated list of every "
                "unique citation id you used (e.g. Sources: a1b2c3#4, d4e5f6#2).\n"
                "Do not say 'excerpt' or chunk numbers in the spoken answer; the Sources line uses ids only."
            ),
        },
    ]
    return chat_completion(messages, temperature=0.35).strip()


def _answer_from_excerpts_only(chunks: list[dict[str, Any]]) -> str:
    """Non-LLM fallback when synthesis returns empty."""
    parts: list[str] = []
    for ch in chunks[:6]:
        meta = ch.get("metadata") or {}
        doc_id = str(ch.get("document_id") or "") or None
        cit = _resolve_citation(meta, doc_id)
        parts.append(f"[{cit}] {(ch.get('content') or '')[:700]}")
    return (
        "Suggested wording from your documents (model returned no text; showing excerpts):\n\n"
        + "\n\n".join(parts)
    )


def _is_transcript_chunk(chunk: dict[str, Any]) -> bool:
    """True for any chunk whose source document is an earnings-call transcript.
    The simulator should never source its answer from transcript text — that's
    the very class of document the analyst question came from."""
    meta = chunk.get("metadata") or {}
    doc_type = str(meta.get("document_type") or "").strip()
    return doc_type in TRANSCRIPT_DOC_TYPES


def _chunk_matches_period(
    chunk: dict[str, Any], fiscal_year: int | None, quarter: str | None,
) -> bool:
    if fiscal_year is None or not quarter:
        return False
    meta = chunk.get("metadata") or {}
    try:
        fy = int(meta.get("fiscal_year")) if meta.get("fiscal_year") is not None else None
    except (TypeError, ValueError):
        fy = None
    qt = str(meta.get("quarter") or "").strip()
    return fy == int(fiscal_year) and qt == quarter


def build_suggested_answer_from_uploads(
    supabase: Client,
    question: str,
    company: str | None = None,
    fiscal_year: int | None = None,
    quarter: str | None = None,
) -> dict[str, Any]:
    """Hybrid RAG over all chunks. The selected company scopes the retrieval.
    Earnings-call transcript chunks (any quarter) are excluded so the simulator
    grounds its answer in filings, press releases, presentations, and other
    non-transcript material only. When fiscal_year+quarter are provided we
    prefer chunks from that exact period and only fall back to other periods
    when the period-specific pool is too small."""
    q = (question or "").strip()

    dense = _dense_search(supabase, q, company)
    lexical = _lexical_search_safe(supabase, q, company)
    fused = _reciprocal_rank_fusion(dense, lexical)

    fused = [ch for ch in fused if not _is_transcript_chunk(ch)]

    # Period preference: when a target quarter is set, prioritize chunks from
    # that exact period. Reorder fused so period matches come first while
    # preserving relative ordering within each bucket. If we don't have enough
    # period-specific chunks to fill the top-N, the off-period chunks come
    # after as fallback rather than being dropped entirely.
    if fiscal_year is not None and quarter:
        period_chunks = [ch for ch in fused if _chunk_matches_period(ch, fiscal_year, quarter)]
        other_chunks = [ch for ch in fused if not _chunk_matches_period(ch, fiscal_year, quarter)]
        if period_chunks:
            fused = period_chunks + other_chunks

    top_rrf = fused[:RRF_TOP_N]

    reranked = _llm_rerank(q, top_rrf, keep=CONTEXT_CHUNKS)
    try:
        answer = _synthesize(q, reranked)
    except Exception as exc:
        logger.warning("RAG synthesis failed, using excerpt fallback: %s", exc, exc_info=True)
        answer = _answer_from_excerpts_only(reranked) if reranked else _synthesize(q, [])
    if reranked and not (answer or "").strip():
        answer = _answer_from_excerpts_only(reranked)

    if dense and lexical:
        mode = "hybrid"
    elif lexical:
        mode = "lexical_only"
    elif dense:
        mode = "dense_only"
    else:
        mode = "no_hits"

    sources: list[dict[str, Any]] = []
    for i, ch in enumerate(reranked, start=1):
        meta = ch.get("metadata") or {}
        doc_id = str(ch.get("document_id", "")) if ch.get("document_id") else None
        citation = _resolve_citation(meta, doc_id)
        raw_content = ch.get("content") or ""
        excerpt = raw_content[:320] + ("…" if len(raw_content) > 320 else "")
        sources.append(
            {
                "chunk_id": str(ch.get("id", "")),
                "document_id": doc_id,
                "citation": citation,
                "excerpt": excerpt,
                "metadata": meta,
                "rrf_score": float(ch.get("_rrf") or 0),
                "rerank_position": i,
            }
        )

    citation_hrefs = _enrich_sources_pdf_links(supabase, sources)

    return {
        "answer": answer,
        "sources": sources,
        "citation_hrefs": citation_hrefs,
        "retrieval_mode": mode,
    }
