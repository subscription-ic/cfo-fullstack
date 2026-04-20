from pydantic import BaseModel, Field


class FileUploadResult(BaseModel):
    filename: str
    ok: bool
    document_id: str | None = None
    chunks_created: int = 0
    detected_document_type: str | None = None
    sections_detected: list[str] = Field(default_factory=list)
    financial_metrics_count: int = 0
    chunking_strategy: str | None = None
    error: str | None = None


class UploadResponse(BaseModel):
    results: list[FileUploadResult]
