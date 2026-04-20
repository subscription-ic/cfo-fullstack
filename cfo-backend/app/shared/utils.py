"""Small cross-module utility helpers."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_space(text: str) -> str:
    return re.sub(r"[ \t]+", " ", text).strip()


def safe_citation_stem(filename: str, max_len: int = 32) -> str:
    base = Path(filename).name or "document"
    stem = Path(base).stem
    stem = re.sub(r"[^\w.\-]+", "-", stem, flags=re.UNICODE).strip("-_.") or "document"
    if len(stem) > max_len:
        stem = stem[: max_len - 1] + "…"
    return stem


def document_file_ref(doc_id: str) -> str:
    """Short stable id for citations (file number leg)."""
    h = doc_id.replace("-", "")[:6]
    return h if len(h) >= 6 else (h + "000000")[:6]
