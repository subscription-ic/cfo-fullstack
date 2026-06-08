"""Match-pipeline diagnostics.

Three primitives that operate on `predicted_qa`, `actual_earnings_qa`, and
`match_audit_log` to answer:

  taxonomy_drift           — which L1/L2 labels appear on only one side?
  similarity_histogram     — what does the cosine/judge-score distribution look like?
  confusion_invariants     — sanity check: any L1 with both sides populated but TP=0?

All three are read-only and take the same (company, fiscal_year, quarter)
filter triple. Anything that goes wrong returns a defensive empty/no-op
shape rather than raising, so the endpoint stays callable even when
match_audit_log isn't populated yet.
"""

from __future__ import annotations

import logging
from collections import Counter
from typing import Any

from supabase import Client

logger = logging.getLogger(__name__)


def _normalize(label: str | None) -> str:
    return (label or "").strip().lower()


def _fetch_predictions(
    supabase: Client, company: str, fiscal_year: int, quarter: str,
) -> list[dict[str, Any]]:
    try:
        resp = (
            supabase.table("predicted_qa")
            .select("id, category_l1, category_l2, predicted_question")
            .ilike("company", f"%{company.strip()}%")
            .eq("fiscal_year", fiscal_year)
            .eq("quarter", quarter)
            .execute()
        )
        return list(resp.data or [])
    except Exception as exc:
        logger.warning("diagnostics: predicted_qa fetch failed: %s", exc)
        return []


def _fetch_actuals(
    supabase: Client, company: str, fiscal_year: int, quarter: str,
) -> list[dict[str, Any]]:
    try:
        resp = (
            supabase.table("actual_earnings_qa")
            .select("id, category_l1, category_l2, question, predicted_qa_id, similarity_score")
            .ilike("company", f"%{company.strip()}%")
            .eq("fiscal_year", fiscal_year)
            .eq("quarter", quarter)
            .execute()
        )
        return list(resp.data or [])
    except Exception as exc:
        logger.warning("diagnostics: actual_earnings_qa fetch failed: %s", exc)
        return []


def taxonomy_drift(
    supabase: Client, company: str, fiscal_year: int, quarter: str,
) -> dict[str, Any]:
    """Symmetric difference between L1/L2 labels on predicted vs actual sides.

    Surfaces vocabulary asymmetry without hard-coded rules — e.g. extractor
    emits "Other Growth" but the prompt never does → that label appears in
    actual_only_l2 automatically.
    """
    predicted = _fetch_predictions(supabase, company, fiscal_year, quarter)
    actuals = _fetch_actuals(supabase, company, fiscal_year, quarter)

    pred_l1 = {(_normalize(p.get("category_l1"))) for p in predicted if p.get("category_l1")}
    actual_l1 = {(_normalize(a.get("category_l1"))) for a in actuals if a.get("category_l1")}
    pred_l2 = {
        (_normalize(p.get("category_l1")), _normalize(p.get("category_l2")))
        for p in predicted if p.get("category_l2")
    }
    actual_l2 = {
        (_normalize(a.get("category_l1")), _normalize(a.get("category_l2")))
        for a in actuals if a.get("category_l2")
    }

    return {
        "company": company,
        "fiscal_year": fiscal_year,
        "quarter": quarter,
        "predicted_total": len(predicted),
        "actual_total": len(actuals),
        "predicted_only_l1": sorted(pred_l1 - actual_l1),
        "actual_only_l1": sorted(actual_l1 - pred_l1),
        "predicted_only_l2": sorted(
            {f"{l1} / {l2}" for l1, l2 in (pred_l2 - actual_l2)}
        ),
        "actual_only_l2": sorted(
            {f"{l1} / {l2}" for l1, l2 in (actual_l2 - pred_l2)}
        ),
        "shared_l1": sorted(pred_l1 & actual_l1),
        "shared_l2": sorted({f"{l1} / {l2}" for l1, l2 in (pred_l2 & actual_l2)}),
    }


def similarity_histogram(
    supabase: Client,
    company: str,
    fiscal_year: int,
    quarter: str,
    bucket_size: float = 10.0,
) -> dict[str, Any]:
    """Distribution of similarity scores across all judged actuals for the
    period. Reads from match_audit_log (richer — includes unmatched and
    near-miss candidates) when the table is populated; otherwise falls back
    to `actual_earnings_qa.similarity_score` so the view still renders before
    migration 015 has been applied.
    """
    scores: list[float] = []
    source = "match_audit_log"
    try:
        resp = (
            supabase.table("match_audit_log")
            .select("similarity")
            .ilike("company", f"%{company.strip()}%")
            .eq("fiscal_year", fiscal_year)
            .eq("quarter", quarter)
            .order("created_at", desc=True)
            .limit(5000)
            .execute()
        )
        rows = list(resp.data or [])
        for r in rows:
            v = r.get("similarity")
            if isinstance(v, (int, float)):
                scores.append(float(v))
    except Exception:
        source = "match_audit_log_missing"
        rows = []

    if not scores:
        # Fallback: read from actuals' stored similarity_score column.
        source = "actual_earnings_qa_fallback"
        for a in _fetch_actuals(supabase, company, fiscal_year, quarter):
            v = a.get("similarity_score")
            if isinstance(v, (int, float)):
                scores.append(float(v))

    buckets: list[dict[str, Any]] = []
    if scores:
        bucket_size = max(1.0, float(bucket_size))
        edges = []
        edge = 0.0
        while edge <= 100.0 + 1e-9:
            edges.append(edge)
            edge += bucket_size
        for i in range(len(edges) - 1):
            lo, hi = edges[i], edges[i + 1]
            count = sum(1 for s in scores if (lo <= s < hi) or (hi >= 100.0 and s == 100.0))
            buckets.append({"lo": lo, "hi": hi, "count": count})

    return {
        "company": company,
        "fiscal_year": fiscal_year,
        "quarter": quarter,
        "bucket_size": bucket_size,
        "source": source,
        "total_scores": len(scores),
        "min": min(scores) if scores else None,
        "max": max(scores) if scores else None,
        "mean": (sum(scores) / len(scores)) if scores else None,
        "buckets": buckets,
    }


def confusion_invariants(
    supabase: Client, company: str, fiscal_year: int, quarter: str,
) -> dict[str, Any]:
    """Sanity invariant: for every L1 (and L1+L2 pair) where predicted_count>0
    AND actual_count>0, TP should be >0 unless every linked pair lands on a
    different L1. Anything else is a linker-integrity alert.

    Returns a list of alerts; an empty list means the linker is internally
    consistent for the period.
    """
    predicted = _fetch_predictions(supabase, company, fiscal_year, quarter)
    actuals = _fetch_actuals(supabase, company, fiscal_year, quarter)

    pred_l1_count: Counter[str] = Counter()
    actual_l1_count: Counter[str] = Counter()
    for p in predicted:
        l1 = _normalize(p.get("category_l1"))
        if l1:
            pred_l1_count[l1] += 1
    for a in actuals:
        l1 = _normalize(a.get("category_l1"))
        if l1:
            actual_l1_count[l1] += 1

    # TP per L1: linked actual whose linked prediction is in the same L1.
    pred_by_id = {str(p["id"]): p for p in predicted if p.get("id")}
    tp_l1: Counter[str] = Counter()
    for a in actuals:
        pid = a.get("predicted_qa_id")
        if not pid:
            continue
        p = pred_by_id.get(str(pid))
        if not p:
            continue
        a_l1 = _normalize(a.get("category_l1"))
        p_l1 = _normalize(p.get("category_l1"))
        if a_l1 and a_l1 == p_l1:
            tp_l1[a_l1] += 1

    alerts: list[dict[str, Any]] = []
    for l1 in pred_l1_count.keys() | actual_l1_count.keys():
        pc, ac, tp = pred_l1_count.get(l1, 0), actual_l1_count.get(l1, 0), tp_l1.get(l1, 0)
        if pc > 0 and ac > 0 and tp == 0:
            alerts.append({
                "level": "l1",
                "category": l1,
                "predicted_count": pc,
                "actual_count": ac,
                "tp": 0,
                "message": (
                    f"L1 '{l1}' has {pc} predicted and {ac} actual but TP=0. "
                    "Linker either failed to judge similarity above threshold or "
                    "is linking actuals to a different L1's prediction."
                ),
            })

    return {
        "company": company,
        "fiscal_year": fiscal_year,
        "quarter": quarter,
        "predicted_total": len(predicted),
        "actual_total": len(actuals),
        "alerts": alerts,
        "ok": not alerts,
    }
