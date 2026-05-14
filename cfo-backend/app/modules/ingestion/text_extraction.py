"""Raw text extraction from uploaded files (PDF, TXT).

PDF extraction tries multiple backends in order, returning text from the first
backend that yields content:

1. PyMuPDF (fitz) — handles most modern PDFs, including ones with complex
   fonts/encodings that defeat pypdf.
2. pypdf — fallback for any cases PyMuPDF can't parse.
3. OCR via PyMuPDF + pytesseract — used only when the prior steps return no
   text (image-only / scanned PDFs). Requires the Tesseract binary; if it isn't
   installed, OCR is skipped silently and the caller gets an empty result.
"""

from __future__ import annotations

import io
import logging
import os
import shutil

from pypdf import PdfReader

logger = logging.getLogger(__name__)

try:
    import fitz  # PyMuPDF
    _HAS_FITZ = True
except ImportError:  # pragma: no cover
    _HAS_FITZ = False

try:
    import pytesseract
    from PIL import Image
    _HAS_OCR = True
except ImportError:  # pragma: no cover
    _HAS_OCR = False


def _locate_tesseract_binary() -> str | None:
    """Find tesseract.exe on Windows even when it isn't on PATH yet (common
    right after a winget install before the shell is restarted)."""
    on_path = shutil.which("tesseract")
    if on_path:
        return on_path
    candidates = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe"),
        os.path.expandvars(r"%LOCALAPPDATA%\Tesseract-OCR\tesseract.exe"),
    ]
    for path in candidates:
        if os.path.isfile(path):
            return path
    return None


if _HAS_OCR:
    _tess = _locate_tesseract_binary()
    if _tess:
        pytesseract.pytesseract.tesseract_cmd = _tess


def _extract_with_fitz(file_bytes: bytes) -> list[tuple[int, str]]:
    if not _HAS_FITZ:
        return []
    out: list[tuple[int, str]] = []
    try:
        with fitz.open(stream=file_bytes, filetype="pdf") as doc:
            for i, page in enumerate(doc, start=1):
                t = page.get_text("text") or ""
                if t.strip():
                    out.append((i, t.strip()))
    except Exception as exc:
        logger.warning("PyMuPDF extraction failed: %s", exc)
        return []
    return out


def _extract_with_pypdf(file_bytes: bytes) -> list[tuple[int, str]]:
    out: list[tuple[int, str]] = []
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        for i, page in enumerate(reader.pages, start=1):
            t = page.extract_text() or ""
            if t.strip():
                out.append((i, t.strip()))
    except Exception as exc:
        logger.warning("pypdf extraction failed: %s", exc)
        return []
    return out


def _extract_with_ocr(file_bytes: bytes) -> list[tuple[int, str]]:
    """OCR each page via PyMuPDF rasterization + Tesseract. Returns [] if any
    component is missing or fails."""
    if not (_HAS_FITZ and _HAS_OCR):
        return []
    out: list[tuple[int, str]] = []
    try:
        with fitz.open(stream=file_bytes, filetype="pdf") as doc:
            for i, page in enumerate(doc, start=1):
                pix = page.get_pixmap(dpi=200)
                img = Image.open(io.BytesIO(pix.tobytes("png")))
                t = pytesseract.image_to_string(img) or ""
                if t.strip():
                    out.append((i, t.strip()))
    except pytesseract.TesseractNotFoundError:
        logger.warning(
            "Tesseract binary not installed — OCR fallback unavailable. "
            "Install Tesseract OCR to support image-only PDFs."
        )
        return []
    except Exception as exc:
        logger.warning("OCR extraction failed: %s", exc)
        return []
    return out


def extract_text(file_bytes: bytes, filename: str, content_type: str | None) -> str:
    fn = filename.lower()
    ct = (content_type or "").lower()
    if fn.endswith(".txt") or ct.startswith("text/plain"):
        return file_bytes.decode("utf-8", errors="replace")
    if fn.endswith(".pdf") or "pdf" in ct:
        pages = extract_pdf_pages(file_bytes)
        return "\n\n".join(t for _, t in pages).strip()
    raise ValueError(f"Unsupported file type for {filename!r} (use PDF or TXT)")


def extract_pdf_pages(file_bytes: bytes) -> list[tuple[int, str]]:
    """Return (1-based page number, text) for each page with extractable text.

    Tries PyMuPDF first, then pypdf, then OCR as a last resort.
    """
    pages = _extract_with_fitz(file_bytes)
    if pages:
        return pages
    pages = _extract_with_pypdf(file_bytes)
    if pages:
        return pages
    return _extract_with_ocr(file_bytes)
