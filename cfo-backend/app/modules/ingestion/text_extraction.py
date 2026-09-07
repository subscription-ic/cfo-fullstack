"""Raw text extraction from uploaded files (PDF, TXT, XLSX).

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
from datetime import date, datetime, time

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

try:
    import openpyxl
    _HAS_OPENPYXL = True
except ImportError:  # pragma: no cover
    _HAS_OPENPYXL = False


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
    if is_xlsx_name(filename, content_type):
        sheets = extract_xlsx_sheets(file_bytes)
        return "\n\n".join(t for _, t in sheets).strip()
    raise ValueError(f"Unsupported file type for {filename!r} (use PDF, TXT, or XLSX)")


def is_xlsx_name(filename: str, content_type: str | None = None) -> bool:
    """True for spreadsheet uploads. `.xls` is deliberately excluded — openpyxl
    reads the OOXML format only, and a legacy .xls would fail deeper in the
    pipeline with a much less obvious error."""
    fn = (filename or "").lower()
    ct = (content_type or "").lower()
    return (
        fn.endswith(".xlsx")
        or fn.endswith(".xlsm")
        or "spreadsheetml" in ct
    )


def _format_cell(value: object) -> str:
    """Render one cell as text. Floats that are whole numbers lose the
    trailing '.0' so '1234.0' doesn't read as a precision claim the source
    never made."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    if isinstance(value, datetime):
        return value.date().isoformat() if value.time() == time.min else value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value).strip()


def extract_xlsx_sheets(file_bytes: bytes) -> list[tuple[int, str]]:
    """Return (1-based sheet number, text) for each non-empty worksheet.

    Mirrors `extract_pdf_pages` so the ingestion orchestrator can treat a
    workbook exactly like a paginated document: one sheet becomes one "page",
    which keeps citations (`page_number`, `citation_label`) meaningful and lets
    per-sheet analysis run through the same `analyze_pages` path.

    Cells are joined with tabs so `enrichment.is_table_like` recognises the
    grid structure — financial supplementaries are almost entirely tables, and
    mis-classifying them as narrative degrades chunk importance scoring.
    """
    if not _HAS_OPENPYXL:
        logger.warning("openpyxl is not installed; cannot extract XLSX")
        return []
    try:
        wb = openpyxl.load_workbook(
            io.BytesIO(file_bytes),
            data_only=True,   # computed values, not formula strings
            read_only=True,   # streaming: large supplementaries stay bounded
        )
    except Exception:
        logger.warning("openpyxl failed to open workbook", exc_info=True)
        return []

    out: list[tuple[int, str]] = []
    try:
        for idx, ws in enumerate(wb.worksheets, start=1):
            lines: list[str] = []
            for row in ws.iter_rows(values_only=True):
                cells = [_format_cell(v) for v in row]
                while cells and not cells[-1]:
                    cells.pop()
                if not cells:
                    continue  # fully blank row
                lines.append("\t".join(cells))
            if not lines:
                continue  # empty sheet — skip so it doesn't cost an LLM call
            # Lead with the sheet name so the per-page analyzer has a real
            # heading to lift into l1_heading, the way a PDF page banner works.
            title = str(ws.title or f"Sheet {idx}").strip()
            out.append((idx, f"Sheet: {title}\n\n" + "\n".join(lines)))
    finally:
        wb.close()
    return out


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
