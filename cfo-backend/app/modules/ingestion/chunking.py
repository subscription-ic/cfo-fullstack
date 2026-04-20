"""Plain-function chunking utilities.

Page-level chunking is applied directly in the orchestrator by slicing
`extract_pdf_pages` output. `chunk_text` below is the fixed-size fallback
used for TXT uploads and for splitting oversized single pages.
"""

from __future__ import annotations

from app.shared.constants import CHUNK_OVERLAP, CHUNK_SIZE


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    text = text.strip()
    if not text:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break
        start = end - overlap
        if start < 0:
            start = 0
    return chunks
