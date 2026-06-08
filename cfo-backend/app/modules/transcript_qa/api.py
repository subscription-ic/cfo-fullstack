from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Response, status

from app.core.dependencies import CurrentUserDep, SupabaseDep
from app.modules.transcript_qa.extractor import relink_actuals_to_predictions
from app.modules.transcript_qa.schemas import ActualEarningsQACreate, ActualEarningsQAUpdate

router = APIRouter()


@router.get("/actual-earnings-qa")
def list_actual_earnings_qa(
    supabase: SupabaseDep,
    company: Optional[str] = Query(default=None, description="Filter by company (ILIKE partial match)"),
):
    try:
        query = supabase.table("actual_earnings_qa").select("*").order("created_at", desc=True)
        if company:
            query = query.ilike("company", f"%{company}%")
        response = query.execute()
        return {"data": response.data or [], "count": len(response.data or [])}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/actual-earnings-qa/relink")
def relink_actuals(
    supabase: SupabaseDep,
    company: str = Query(..., description="Company name (ILIKE partial match)"),
    fiscal_year: int = Query(..., description="Target fiscal year (e.g. 2026)"),
    quarter: str = Query(..., description="Target quarter (Q1/Q2/Q3/Q4)"),
    overwrite_linked: bool = Query(
        False,
        description="If true, re-evaluate rows that already have predicted_qa_id set",
    ),
):
    """Re-run the LLM judge across `actual_earnings_qa` rows for the given
    period and (re)populate `predicted_qa_id` against the current set of
    `predicted_qa` rows. Use this when predictions were generated AFTER the
    transcript was uploaded, leaving the original extract with nothing to link.
    """
    try:
        return relink_actuals_to_predictions(
            supabase,
            company=company,
            fiscal_year=fiscal_year,
            quarter=quarter,
            overwrite_linked=overwrite_linked,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/actual-earnings-qa", status_code=status.HTTP_201_CREATED)
def create_actual_earnings_qa(
    supabase: SupabaseDep,
    _user: CurrentUserDep,
    body: ActualEarningsQACreate,
):
    try:
        row: dict = {"company": body.company.strip(), "question": body.question}
        if body.answer is not None:
            row["answer"] = body.answer
        if body.answered_by is not None:
            row["answered_by"] = body.answered_by
        if body.category is not None:
            row["category"] = body.category
        if body.fiscal_year is not None:
            row["fiscal_year"] = body.fiscal_year
        if body.quarter is not None:
            row["quarter"] = body.quarter
        if body.period_label is not None:
            row["period_label"] = body.period_label
        response = supabase.table("actual_earnings_qa").insert(row).execute()
        data = response.data
        if isinstance(data, list) and data:
            return data[0]
        if isinstance(data, dict):
            return data
        raise HTTPException(status_code=500, detail="Insert returned no row")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.put("/actual-earnings-qa/{row_id}")
def update_actual_earnings_qa(
    supabase: SupabaseDep,
    _user: CurrentUserDep,
    row_id: str,
    body: ActualEarningsQAUpdate,
):
    try:
        updates = body.model_dump(exclude_unset=True)
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        response = supabase.table("actual_earnings_qa").update(updates).eq("id", row_id).execute()
        data = response.data
        if isinstance(data, list) and data:
            return data[0]
        if isinstance(data, dict):
            return data
        raise HTTPException(status_code=404, detail="Row not found or not updated")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/actual-earnings-qa/{row_id}")
def delete_actual_earnings_qa(
    supabase: SupabaseDep,
    _user: CurrentUserDep,
    row_id: str,
):
    try:
        supabase.table("actual_earnings_qa").delete().eq("id", row_id).execute()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
