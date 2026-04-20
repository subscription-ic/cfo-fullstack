# Ingestion Pipeline

## Overview

Documents flow through a fixed sequence of stages that turn raw files into page-level, thematically tagged chunks ready for downstream retrieval and analysis.

## Stages

### 1. Ingestion

Documents are loaded into the pipeline from their source (upload, storage bucket, or API).

### 2. Page-level Chunking

Chunking is strict: **one page = one chunk**. No sub-page splitting, no cross-page merging. This preserves page boundaries as the atomic unit of retrieval and citation.

### 3. Page Summarization

Each page chunk is summarized independently. The summary captures the page's key content in a compact form used by later stages and by retrieval ranking.

### 4. Primary Theme Identification

A single primary theme is assigned to each page, representing its dominant topic.

### 5. Sub-theme Extraction

Multiple sub-themes are extracted from each page to support deeper contextual tagging, enabling finer-grained filtering and multi-faceted retrieval.

## Output

Each processed page yields:

- The original page content (1 chunk)
- A page summary
- One primary theme
- A list of sub-themes

## Implementation

- `app/services/page_theme_service.py` — LLM-driven `analyze_page` / `analyze_pages` returning a `PageAnalysis` (summary, primary_theme, sub_themes). Fails soft on LLM or JSON errors.
- `app/services/document_service.py` — `process_upload_file` extracts pages via `extract_pdf_pages`, calls `analyze_pages`, and writes `page_summary`, `page_primary_theme`, `page_sub_themes` into each chunk's JSONB `metadata` column on `document_chunks`. TXT files are treated as a single logical page (page 1).
- No schema change required: fields live inside existing `document_chunks.metadata`.
