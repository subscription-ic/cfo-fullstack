"""Raw text extraction from uploaded files (PDF, TXT)."""

from __future__ import annotations

import io

from pypdf import PdfReader


def extract_text(file_bytes: bytes, filename: str, content_type: str | None) -> str:
    fn = filename.lower()
    ct = (content_type or "").lower()
    if fn.endswith(".txt") or ct.startswith("text/plain"):
        return file_bytes.decode("utf-8", errors="replace")
    if fn.endswith(".pdf") or "pdf" in ct:
        reader = PdfReader(io.BytesIO(file_bytes))
        parts: list[str] = []
        for page in reader.pages:
            t = page.extract_text()
            if t:
                parts.append(t)
        return "\n\n".join(parts).strip()
    raise ValueError(f"Unsupported file type for {filename!r} (use PDF or TXT)")


def extract_pdf_pages(file_bytes: bytes) -> list[tuple[int, str]]:
    """Return (1-based page number, text) for each page with extractable text."""
    reader = PdfReader(io.BytesIO(file_bytes))
    out: list[tuple[int, str]] = []
    for i, page in enumerate(reader.pages, start=1):
        t = page.extract_text()
        if t and t.strip():
            out.append((i, t.strip()))
    return out
