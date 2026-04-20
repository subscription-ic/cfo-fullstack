"""API models for listing ingested documents (admin catalog)."""

from pydantic import BaseModel, Field


class DocumentCatalogItem(BaseModel):
    id: str
    company: str
    document_type: str = Field(description="Ingest document_type / classifier output")
    quarter: str
    fiscal_year: int
    original_filename: str | None = None
    created_at: str
    updated_at: str
