"""Ingestion HTTP routes."""

from typing import Any

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile, status

from app.core.dependencies import CurrentUserDep, SupabaseDep
from app.modules.ingestion.orchestrator import process_upload_file
from app.modules.ingestion.schemas import FileUploadResult, UploadResponse
from app.modules.ingestion.service import parse_metadata_json

router = APIRouter()


@router.post("/upload", response_model=UploadResponse)
async def upload_documents(
    _user: CurrentUserDep,
    supabase: SupabaseDep,
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(description="One or more PDF or TXT files"),
    metadata: str = Form(..., description="JSON array, one object per file: company, fiscal_year, quarter, document_type, source_category"),
):
    try:
        meta_list: list[dict[str, Any]] = parse_metadata_json(metadata)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid metadata JSON: {exc}")

    if len(files) != len(meta_list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Expected {len(files)} metadata entries, got {len(meta_list)}",
        )

    results = []
    for upload, meta in zip(files, meta_list):
        try:
            company = str(meta.get("company") or "").strip()
            fy = meta.get("fiscal_year")
            quarter = str(meta.get("quarter") or "").strip()
            doc_type = str(meta.get("document_type") or "").strip()
            src_cat = str(meta.get("source_category") or "").strip()
            if not company or fy is None or not quarter or not doc_type or not src_cat:
                raise ValueError("Each metadata object needs company, fiscal_year, quarter, document_type, source_category")
            fiscal_year = int(fy)
        except (TypeError, ValueError) as exc:
            results.append(
                FileUploadResult(
                    filename=upload.filename or "unknown", ok=False, error=f"Bad metadata: {exc}"
                )
            )
            continue

        res = process_upload_file(
            supabase,
            upload,
            company=company,
            fiscal_year=fiscal_year,
            quarter=quarter,
            document_type=doc_type,
            source_category=src_cat,
            background_tasks=background_tasks,
        )
        results.append(res)

    return UploadResponse(results=results)
