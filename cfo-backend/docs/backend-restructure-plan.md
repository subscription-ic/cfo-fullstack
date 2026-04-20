# Backend Restructure Plan

Target layout: feature-module architecture under `app/modules/`, with cross-cutting concerns in `app/core/`, `app/shared/`, and `app/infrastructure/`.

This doc is the map for that migration. It is file-by-file, phased, and reversible commit-by-commit.

## Goals

- Group code by **feature**, not by layer, so every feature's API + logic + persistence live side-by-side.
- Isolate external systems (Supabase, OpenAI, Storage, pgvector) behind `infrastructure/` so services become testable pure logic.
- Keep the repo runnable between every phase. No "big bang" commit.

## Non-goals

- No behavior changes, no new features, no schema migrations.
- No rewrites of existing logic beyond the minimum required to split files.
- No new tests in the restructure itself (existing tests must still pass).

---

## Target layout

```
cfo-backend/
├── app/
│   ├── main.py                         # FastAPI app factory, router wiring
│   │
│   ├── core/                           # app-level setup
│   │   ├── config.py                   # Settings, get_settings()
│   │   ├── dependencies.py             # FastAPI DI (current user, supabase client)
│   │   ├── logging.py                  # logging config (new, minimal)
│   │   └── exceptions.py               # shared HTTP error helpers (new, minimal)
│   │
│   ├── shared/                         # tiny reusable utilities
│   │   ├── constants.py                # CHUNK_SIZE, PAGE_CHUNK_MAX_CHARS, TRANSCRIPT_DOC_TYPES, etc.
│   │   ├── enums.py                    # document_type, source_category, processing_status
│   │   └── utils.py                    # _utc_now_iso, _safe_citation_stem, _normalize_space
│   │
│   ├── infrastructure/                 # external integrations
│   │   ├── db.py                       # build_supabase_client(), thin wrapper
│   │   ├── vector_store.py             # match_document_chunks RPC, chunk insert helpers
│   │   ├── llm.py                      # embed_texts, embed_query, chat_completion
│   │   └── storage.py                  # ensure_bucket, upload_object, remove_object
│   │
│   └── modules/                        # feature-based
│       ├── auth/
│       │   ├── api.py                  # <- app/api/routes/auth.py
│       │   ├── service.py              # <- app/services/auth_service.py
│       │   └── schemas.py              # <- app/schemas/auth.py
│       │
│       ├── documents/                  # document CRUD, listing, delete cascade
│       │   ├── api.py                  # GET /documents, DELETE /documents/{id}
│       │   ├── service.py              # delete_document_cascade + list/get
│       │   ├── repository.py           # supabase.table("documents") calls
│       │   └── schemas.py              # <- app/schemas/document_catalog.py
│       │
│       ├── ingestion/                  # upload pipeline
│       │   ├── api.py                  # POST /upload
│       │   ├── orchestrator.py         # process_upload_file (top-level flow)
│       │   ├── service.py              # helpers: metadata parsing, validation
│       │   ├── chunking.py             # PageChunker / FixedSizeChunker (Strategy)
│       │   ├── summarization.py        # page summary LLM call
│       │   ├── theme.py                # primary + sub-theme extraction
│       │   ├── text_extraction.py      # pypdf, txt decoding
│       │   ├── enrichment.py           # financial metrics, topics, sections, importance
│       │   ├── repository.py           # chunk/document inserts via infrastructure
│       │   └── schemas.py              # <- app/schemas/upload.py
│       │
│       ├── analysis/
│       │   ├── api.py                  # <- app/api/routes/analysis.py
│       │   ├── service.py              # <- app/services/analysis_service.py
│       │   ├── repository.py           # document_analyses table access
│       │   └── schemas.py              # <- app/schemas/analysis.py
│       │
│       ├── question_generation/
│       │   ├── api.py                  # <- app/api/routes/question_generation.py
│       │   ├── service.py              # <- app/services/question_generation_service.py
│       │   ├── repository.py           # predicted_qa table access
│       │   └── schemas.py              # <- app/schemas/question_generation.py
│       │
│       ├── predicted_qa/               # review panel for predicted Q&A
│       │   ├── api.py                  # <- app/api/routes/predicted_qa.py
│       │   ├── service.py              # (split out of question_generation_service)
│       │   └── repository.py
│       │
│       ├── transcript_qa/              # actual earnings call Q&A extraction
│       │   ├── api.py                  # <- app/api/routes/actual_earnings_qa.py
│       │   ├── service.py              # thin orchestration
│       │   ├── extractor.py            # <- app/services/transcript_qa_extraction_service.py
│       │   ├── repository.py           # actual_earnings_qa table access
│       │   └── schemas.py              # <- app/schemas/actual_earnings.py
│       │
│       ├── simulator_rag/
│       │   ├── api.py                  # <- app/api/routes/simulator_rag.py
│       │   ├── service.py              # <- app/services/simulator_rag_service.py
│       │   └── retriever.py            # vector search + prompt assembly
│       │
│       └── historical/
│           ├── api.py                  # <- app/api/routes/historical.py
│           ├── service.py              # <- app/services/historical_service.py
│           ├── repository.py
│           └── schemas.py              # <- app/schemas/historical.py
│
├── migrations/                         # unchanged
├── scripts/                            # NEW: moves from app/bootstrap/*.py one-off scripts
│   ├── backfill_chunk_page_numbers.py
│   ├── create_storage_bucket.py
│   └── run_init.py
├── docs/                               # unchanged
├── requirements.txt                    # unchanged
└── .env.example                        # unchanged
```

---

## File-by-file mapping (current → target)

### core / shared / infrastructure

| Current                                           | Target                              | Notes |
|---------------------------------------------------|-------------------------------------|-------|
| `app/config.py`                                   | `app/core/config.py`                | Same content. |
| `app/dependencies.py`                             | `app/core/dependencies.py`          | FastAPI `Depends` factories. |
| *(new)*                                           | `app/core/logging.py`               | 10-line logger setup; optional for phase 1. |
| *(new)*                                           | `app/core/exceptions.py`            | Shared `raise_404`, `raise_400` helpers. Optional. |
| `app/llm/client.py`                               | `app/infrastructure/llm.py`         | Same content, keep `embed_texts`, `embed_query`, `chat_completion`. |
| *(scattered `create_client` calls)*               | `app/infrastructure/db.py`          | Single `get_supabase_client()`. |
| *(scattered `storage.from_().upload/remove`)*     | `app/infrastructure/storage.py`     | `ensure_bucket`, `upload_object`, `remove_object`. |
| *(scattered RPC + `document_chunks` writes)*      | `app/infrastructure/vector_store.py`| `insert_chunks`, `match_document_chunks`. |

### shared utilities pulled out of `document_service.py`

| Current (in `services/document_service.py`)       | Target                         |
|----------------------------------------------------|--------------------------------|
| `_utc_now_iso`, `_safe_citation_stem`, `_document_file_ref`, `_normalize_space` | `app/shared/utils.py` |
| `CHUNK_SIZE`, `CHUNK_OVERLAP`, `PAGE_CHUNK_MAX_CHARS`, `TRANSCRIPT_DOC_TYPES` | `app/shared/constants.py` |
| `SECTION_PATTERNS`, `TOPIC_PATTERNS` (regex tables) | `app/modules/ingestion/enrichment.py` (domain-specific, not shared) |

### modules

| Current                                                          | Target                                    |
|------------------------------------------------------------------|-------------------------------------------|
| `app/api/routes/auth.py`                                         | `app/modules/auth/api.py`                 |
| `app/services/auth_service.py`                                   | `app/modules/auth/service.py`             |
| `app/schemas/auth.py`                                            | `app/modules/auth/schemas.py`             |
| `app/api/routes/upload.py`                                       | `app/modules/ingestion/api.py`            |
| `app/services/document_service.py::process_upload_file`          | `app/modules/ingestion/orchestrator.py`   |
| `app/services/document_service.py::chunk_text / extract_pdf_pages / extract_text` | `app/modules/ingestion/chunking.py` + `text_extraction.py` |
| `app/services/document_service.py::segment_sections / extract_financial_metrics / detect_topics / _importance_score / _is_table_like / classify_document_type` | `app/modules/ingestion/enrichment.py` |
| `app/services/page_theme_service.py`                             | `app/modules/ingestion/summarization.py` + `theme.py` |
| `app/services/document_service.py::delete_document_cascade + listing` | `app/modules/documents/service.py` (+ `repository.py`) |
| `app/schemas/upload.py`                                          | `app/modules/ingestion/schemas.py`        |
| `app/schemas/document_catalog.py`                                | `app/modules/documents/schemas.py`        |
| `app/api/routes/analysis.py`                                     | `app/modules/analysis/api.py`             |
| `app/services/analysis_service.py`                               | `app/modules/analysis/service.py`         |
| `app/schemas/analysis.py`                                        | `app/modules/analysis/schemas.py`         |
| `app/api/routes/question_generation.py`                          | `app/modules/question_generation/api.py`  |
| `app/services/question_generation_service.py`                    | `app/modules/question_generation/service.py` |
| `app/schemas/question_generation.py`                             | `app/modules/question_generation/schemas.py` |
| `app/api/routes/predicted_qa.py`                                 | `app/modules/predicted_qa/api.py`         |
| `app/api/routes/actual_earnings_qa.py`                           | `app/modules/transcript_qa/api.py`        |
| `app/services/transcript_qa_extraction_service.py`               | `app/modules/transcript_qa/extractor.py`  |
| `app/schemas/actual_earnings.py`                                 | `app/modules/transcript_qa/schemas.py`    |
| `app/api/routes/simulator_rag.py`                                | `app/modules/simulator_rag/api.py`        |
| `app/services/simulator_rag_service.py`                          | `app/modules/simulator_rag/service.py`    |
| `app/api/routes/historical.py`                                   | `app/modules/historical/api.py`           |
| `app/services/historical_service.py`                             | `app/modules/historical/service.py`       |
| `app/schemas/historical.py`                                      | `app/modules/historical/schemas.py`       |
| `app/bootstrap/*.py`                                             | `cfo-backend/scripts/*.py`                |

---

## Phased rollout (one commit per phase)

Each phase leaves the app running. Run `uvicorn app.main:app --reload` + smoke-test the upload flow between phases.

### Phase 0 — Safety net
- Verify `pytest` passes on `feat/manish`.
- Branch: `refactor/backend-modules` off `feat/manish`.

### Phase 1 — `core/`
- Create `app/core/`.
- Move `app/config.py` → `app/core/config.py`; `app/dependencies.py` → `app/core/dependencies.py`.
- Update all `from app.config import …` → `from app.core.config import …` (grep-replace).
- Delete old files.
- **Acceptance:** app boots, tests pass.

### Phase 2 — `infrastructure/`
- Create `app/infrastructure/`.
- Move `app/llm/client.py` → `app/infrastructure/llm.py`; update imports.
- Add `app/infrastructure/db.py` (extract `create_client` usage from `app/core/dependencies.py` and `app/bootstrap/*`).
- Add `app/infrastructure/storage.py` (thin wrappers around the `supabase.storage.from_()` calls currently inside `document_service.py`).
- Add `app/infrastructure/vector_store.py` (the `document_chunks` insert batching + `match_document_chunks` RPC call sites).
- Keep `app/services/document_service.py` working by routing its calls through the new wrappers.
- **Acceptance:** upload + RAG endpoints still work end-to-end.

### Phase 3 — `shared/`
- Create `app/shared/`.
- Move constants + tiny helpers listed above.
- Grep-replace imports.
- **Acceptance:** tests pass.

### Phase 4 — Pilot module: `ingestion/`
- Create `app/modules/ingestion/`.
- Split `document_service.py` into `orchestrator.py`, `chunking.py`, `text_extraction.py`, `enrichment.py`.
- Split `page_theme_service.py` into `summarization.py` + `theme.py`.
- Move `api/routes/upload.py` → `modules/ingestion/api.py`.
- Update `app/main.py` router registration.
- Move `schemas/upload.py` → `modules/ingestion/schemas.py`.
- **Acceptance:** upload a PDF, confirm chunks + page summaries + themes are written.

### Phase 5 — `documents/` module
- Move listing + delete-cascade logic out of the old `document_service.py` (now almost empty) into `modules/documents/service.py` + `repository.py`.
- Move `api/routes/upload.py`'s `GET /documents` and `DELETE /documents/{id}` into `modules/documents/api.py`.
- Delete `app/services/document_service.py`.
- **Acceptance:** list + delete still work; storage object is removed.

### Phase 6 — Remaining modules (one commit each)
In this order (least interdependent first):
1. `auth/`
2. `analysis/`
3. `historical/`
4. `simulator_rag/`
5. `question_generation/`
6. `predicted_qa/`
7. `transcript_qa/` (depends on ingestion background task — update the `BackgroundTasks.add_task` call site in `ingestion/orchestrator.py` to import from the new location).

Each commit: move files, update imports, update `app/main.py`, smoke-test.

### Phase 7 — Cleanup
- Delete empty `app/api/`, `app/services/`, `app/schemas/`, `app/llm/` dirs.
- Move `app/bootstrap/*.py` → `cfo-backend/scripts/`.
- Update `README.md` with the new layout.
- Update `cfo-backend/docs/ingestion-pipeline.md` file references.

---

## Repository pattern — what goes where

**Service** (pure logic): takes domain inputs, returns domain outputs. No Supabase calls.
**Repository**: the only place that knows about Supabase tables. Returns plain dicts / dataclasses.
**API**: FastAPI route; parses request, calls service, shapes response.

Example for `documents`:

```python
# modules/documents/repository.py
class DocumentsRepository:
    def __init__(self, supabase: Client): self._s = supabase
    def get(self, doc_id: str) -> dict | None: ...
    def list_all(self) -> list[dict]: ...
    def delete(self, doc_id: str) -> None: ...

# modules/documents/service.py
class DocumentsService:
    def __init__(self, repo, storage, vectors, analyses_repo, qa_repo): ...
    def delete_cascade(self, doc_id: str) -> None:
        row = self._repo.get(doc_id) or raise_404(...)
        self._storage.remove(row["storage_bucket"], row["storage_path"])
        self._vectors.delete_by_document(doc_id)
        self._analyses.delete_by_document(doc_id)
        self._qa.delete_by_source_document(doc_id)
        self._repo.delete(doc_id)
```

Wiring happens in `app/core/dependencies.py` via FastAPI `Depends`.

---

## Chunking — Strategy pattern

Only introduce if we actually expect multiple strategies. Minimal first cut:

```python
# modules/ingestion/chunking.py
class ChunkStrategy(Protocol):
    def chunk(self, text: str, page_number: int) -> list[Chunk]: ...

class PageChunker:        # current behavior: 1 page = 1 chunk, split if > PAGE_CHUNK_MAX_CHARS
class FixedSizeChunker:   # legacy chunk_text behavior, kept for TXT fallback
```

`orchestrator.py` selects a strategy based on file type.

---

## Risk register

| Risk | Mitigation |
|---|---|
| Broken imports between phases | Grep-replace in one commit per phase; run the app after each. |
| Supabase client created differently in bootstrap scripts | Phase 2 centralizes client creation in `infrastructure/db.py`; update scripts last. |
| Background task (`transcript_qa`) import cycle | `ingestion/orchestrator.py` imports `transcript_qa.extractor` lazily inside the function, not at module top. |
| `document_chunks.metadata` shape drift | Metadata keys are unchanged — the page_summary / page_primary_theme / page_sub_themes keys from the recent ingestion-pipeline work must be preserved in `ingestion/orchestrator.py`. |
| Test fixtures referencing old paths | Update `cfo-backend/upload_questions/tests/` imports if any. |

---

## Acceptance checklist (end state)

- [ ] `app.main:app` boots with zero import errors
- [ ] `pytest` passes
- [ ] PDF upload creates chunks with `page_summary`, `page_primary_theme`, `page_sub_themes` in metadata
- [ ] `GET /documents` and `DELETE /documents/{id}` still work (storage object removed, cascade complete)
- [ ] `/analysis/run`, `/api/simulator`, `/api/historical`, `/api/predicted-qa`, `/api/actual-earnings-qa`, `/auth/login` all return expected shapes
- [ ] `app/api/`, `app/services/`, `app/schemas/`, `app/llm/` directories deleted
- [ ] README + ingestion-pipeline doc updated with new paths

---

## Open questions for the user

1. **Repository layer** — full repositories everywhere, or only where the service file is long? (Full = more boilerplate, cleaner tests.)
2. **`predicted_qa` split** — keep it as its own module or merge into `question_generation`? Current routes suggest they're distinct concerns.
3. **Bootstrap scripts** — move to `cfo-backend/scripts/` (as shown), or keep inside `app/` as `app/tools/`?
4. **`core/logging.py` / `core/exceptions.py`** — add now (empty-ish placeholders) or defer until needed?
5. **Chunking Strategy pattern** — worth it now, or leave as plain functions until a second strategy actually exists?
