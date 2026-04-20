"""Theme extraction.

Theme detection is currently interleaved with page summarization in a single
LLM call (see `summarization.analyze_page`). This module re-exports the theme
surface so callers that care specifically about themes have a stable import
point, and leaves room to split into a dedicated theme-only call later.
"""

from __future__ import annotations

from app.modules.ingestion.summarization import (
    PageAnalysis,
    analyze_page,
    analyze_pages,
)

__all__ = ["PageAnalysis", "analyze_page", "analyze_pages"]
