# Earnings Call Simulator — Technical Design & Architecture

**Companion to:** `problem-statement.md` (the *what/why*) and `agent.md` (pipeline tasks).
**Scope of this doc:** Database schema · Backend (FastAPI + LangGraph agents) · Frontend (React) ·
two roles (**Admin**, **CFO**) · a build task list written from both an **ML-Architect** and a
**System-Architect** point of view.

---

## 1. System at a glance

```
                         ┌─────────────────────────── React SPA ───────────────────────────┐
                         │  Admin Console        │   CFO Workspace (4 tabs)                  │
                         │  (uploads, mgmt)      │   Historical · Simulator · Debrief · Post │
                         └───────────┬───────────────────────────┬───────────────────────────┘
                                     │  HTTPS / JWT (RBAC)        │  SSE/WS for streaming
                         ┌───────────▼────────────────────────────▼──────────┐
                         │                FastAPI (API gateway)                │
                         │   auth · RBAC · validation · job dispatch · stream  │
                         └───────┬───────────────┬───────────────┬────────────┘
                                 │               │               │
                   enqueue jobs  │      sync read│      stream    │
                         ┌───────▼──────┐  ┌──────▼──────┐  ┌──────▼───────┐
                         │ Worker pool   │  │ Postgres    │  │ Vector store │
                         │ (LangGraph    │  │ (+pgvector) │  │ (pgvector or │
                         │  agent graphs)│  │ relational  │  │  dedicated)  │
                         └───┬───────┬───┘  └─────────────┘  └──────────────┘
                             │       │
                   ┌─────────▼──┐ ┌──▼──────────┐
                   │ Object     │ │ LLM + Embed  │
                   │ store (raw │ │ providers    │
                   │ PDFs/TR)   │ │ + reranker   │
                   └────────────┘ └──────────────┘
```

**Why this shape:** ingestion and prediction are long-running, multi-step, and stateful — a poor fit
for request/response. They run as **LangGraph graphs on async workers**; FastAPI stays thin
(auth, validation, dispatch, streaming reads). Postgres + pgvector keeps relational + vector in one
store to start; swap to a dedicated vector DB later behind the same retrieval interface.

---

## 2. Roles & access (RBAC)

| Role | Can do | Tabs / surfaces |
|---|---|---|
| **Admin** | Create companies; upload all documents (FIN/PR/TR/PPT/AR/GUIDE/SUPP/RR); upload the **post-call transcript**; trigger ingestion & evaluation; manage taxonomy; view jobs/audit. | Admin Console + read access to all CFO tabs. |
| **CFO** | Read-only consumer. Explore history, generate & rehearse predictions, review debrief & post-call analytics. **No uploads, no taxonomy edits.** | Historical Intelligence Hub · Earnings Call Simulator · Performance Debrief · Post-Call Analysis. |

Enforcement: JWT with `role` + `company_scope` claims; FastAPI dependency guards on every route;
row-level company scoping in every query. "Upload Transcript" inside Performance Debrief is **Admin-gated**.

---

## 3. Database schema (PostgreSQL + pgvector)

> Conventions: `id` = `uuid` PK (default `gen_random_uuid()`); `created_at/updated_at` = `timestamptz`;
> enums implemented as Postgres `enum` or `text + CHECK`. FKs `ON DELETE` chosen per table.

### 3.1 Identity & Access

#### `users`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| email | citext UNIQUE | login |
| name | text | |
| role | enum(`admin`,`cfo`) | RBAC |
| password_hash | text NULL | null if SSO/OAuth |
| is_active | bool | default true |
| last_login_at | timestamptz NULL | |
| created_at / updated_at | timestamptz | |

#### `companies`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| name | text | e.g. "HDFC", "Americana" |
| ticker | text NULL | |
| industry | text NULL | drives industry-specific taxonomy |
| created_by | uuid FK→users | |
| created_at | timestamptz | |
| UNIQUE(name) | | |

#### `user_company_access` (multi-tenant scoping)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users | |
| company_id | uuid FK→companies | |
| access_level | enum(`read`,`manage`) | |
| UNIQUE(user_id, company_id) | | |

### 3.2 Calendar

#### `fiscal_quarters`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK→companies | |
| label | text | "Q3 FY2026" |
| fiscal_year | int | |
| quarter | int (1–4) | |
| release_date | date NULL | numbers published → enables **Warm** regime |
| call_date | date NULL | Q&A happens |
| status | enum(`upcoming`,`predicted`,`scored`) | |
| UNIQUE(company_id, fiscal_year, quarter) | | |

### 3.3 Documents & Vectors

#### `documents`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK→companies | |
| quarter_id | uuid FK→fiscal_quarters NULL | null for cross-quarter docs (AR) |
| doc_type | enum(`FIN`,`PR`,`TR`,`PPT`,`AR`,`GUIDE`,`SUPP`,`RR`) | |
| bucket | enum(`historical`,`current`) | Historical/Current tab |
| original_filename | text | |
| storage_uri | text | object-store key |
| mime_type | text | pdf / txt |
| file_size | bigint | |
| checksum | char(64) | sha256, dedup |
| page_count | int NULL | |
| status | enum(`uploaded`,`parsing`,`parsed`,`embedded`,`failed`) | |
| uploaded_by | uuid FK→users | |
| uploaded_at | timestamptz | |
| UNIQUE(company_id, checksum) | | idempotent re-upload |

#### `document_chunks`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| document_id | uuid FK→documents ON DELETE CASCADE | |
| chunk_index | int | |
| content | text | |
| section | enum(`prepared`,`qa`,`mdna`,`table`,`other`) | |
| page_from / page_to | int NULL | |
| token_count | int | |
| embedding | vector(1536) | pgvector; dim per model |
| embedding_model_version | text | reproducibility |
| metadata | jsonb | company/quarter/doc_type/theme denorm for filtering |

### 3.4 Extracted Knowledge

#### `themes` (L1/L2 taxonomy)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| l1 | text | main theme (Profitability, Risk, Guidance…) |
| l2 | text NULL | sub-theme (controlled vocab) |
| industry | text NULL | null = global |
| is_active | bool | |
| UNIQUE(l1, l2, industry) | | |

#### `analysts`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| name | text | |
| firm | text NULL | |
| UNIQUE(name, firm) | | |

#### `attendees` (per call)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| quarter_id | uuid FK→fiscal_quarters | |
| name | text | |
| designation | text NULL | "MD & CEO", "CFO" |
| side | enum(`management`,`analyst`) | |
| firm | text NULL | |

#### `qa_pairs` (historical / actual asked questions)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK→companies | |
| quarter_id | uuid FK→fiscal_quarters | |
| question_text | text | |
| answer_text | text NULL | |
| asker_analyst_id | uuid FK→analysts NULL | |
| responder_name | text NULL | |
| responder_role | text NULL | |
| l1 | text | **canonicalized** actual main theme |
| l2 | text NULL | canonicalized actual sub-theme |
| raw_l2 | text NULL | free-form extracted, pre-canonicalization |
| sentiment | enum(`pos`,`neu`,`neg`) NULL | |
| source_document_id | uuid FK→documents NULL | the TR |
| source_span | jsonb NULL | {page, start, end} |
| created_at | timestamptz | |

*These rows are the **actuals** the Performance Debrief scores predictions against.*

#### `metrics` (extracted KPIs + change signals)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK | |
| quarter_id | uuid FK | |
| name | text | NIM, LDR, CASA, ROA, Revenue… |
| value | numeric | |
| unit | text NULL | |
| qoq_delta / yoy_delta | numeric NULL | |
| surprise_score | numeric NULL | magnitude of change → prediction trigger |
| source_document_id | uuid FK→documents NULL | |

#### `sentiment_analysis` (per quarter, Historical Hub)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| quarter_id | uuid FK UNIQUE | |
| overall | enum(`positive`,`neutral`,`negative`) | |
| growth_drivers | jsonb | text[] |
| risks_concerns | jsonb | text[] |
| summary | text | |

### 3.5 Prediction (frozen snapshots)

#### `prediction_runs`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| company_id | uuid FK | |
| quarter_id | uuid FK | the *next* call |
| regime | enum(`cold`,`warm`) | governs allowed inputs + target |
| model_version | text | |
| doc_set_hash | text | hash of inputs used → reproducibility |
| prediction_ts | timestamptz | **frozen** pre-call timestamp |
| status | enum(`draft`,`frozen`,`scored`) | |
| params | jsonb | top_n, scoring weights |
| created_by | uuid FK→users | |

#### `predicted_questions`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| prediction_run_id | uuid FK ON DELETE CASCADE | |
| rank | int | 1..N (default 24) |
| question_text | text | |
| l1 | text | predicted main theme |
| l2 | text NULL | predicted sub-theme (template vocab) |
| probability | numeric | ranking score |
| likely_asker_profile | text NULL | "credit analyst", "macro" |
| rationale | text | "asked 3/4 quarters; NIM −20bps QoQ" |
| talking_points | jsonb | grounded answer bullets |
| sources | jsonb | [{document_id, span}] |
| cluster_id | text NULL | dedup cluster |

### 3.6 Evaluation (Performance Debrief)

#### `evaluation_runs`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| prediction_run_id | uuid FK | |
| quarter_id | uuid FK | |
| linking_threshold | numeric | τ used |
| model_version | text | |
| metrics | jsonb | categorical_precision, substantive_precision, recall, f1, top3_accuracy, theme_coverage, l1_f1, l2_f1, mean_f1 |
| gate_passed | bool | mean(l1_f1,l2_f1) ≥ 0.80 |
| frozen | bool | immutable once scored |
| created_at | timestamptz | |

#### `question_links` (predicted ↔ actual)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| evaluation_run_id | uuid FK ON DELETE CASCADE | |
| predicted_question_id | uuid FK→predicted_questions NULL | null ⇒ FN |
| actual_qa_pair_id | uuid FK→qa_pairs NULL | null ⇒ FP |
| similarity | numeric | cosine at link time |
| match_type | enum(`TP`,`FP`,`FN`) | |
| l1_match / l2_match | bool | label agreement |

#### `evaluation_category_rows` (confusion-matrix rows)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| evaluation_run_id | uuid FK ON DELETE CASCADE | |
| level | enum(`L1`,`L2`) | |
| category_label | text | "Risk" or "Risk / Credit" |
| pred_count / actual_count | int | |
| tp / fp / fn | int | |
| precision / recall / f1 | numeric | |

### 3.7 Rehearsal & Assistant (CFO)

#### `rehearsal_sessions`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users | CFO |
| prediction_run_id | uuid FK | |
| started_at / ended_at | timestamptz | |

#### `rehearsal_turns`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| session_id | uuid FK ON DELETE CASCADE | |
| predicted_question_id | uuid FK | |
| user_answer | text | |
| model_answer | text | |
| coaching_feedback | text | |
| coverage_score | numeric NULL | |

#### `chat_sessions` / `chat_messages` (AI Intelligence Assistant)
| `chat_sessions` | type | | `chat_messages` | type |
|---|---|---|---|---|
| id | uuid PK | | id | uuid PK |
| user_id | uuid FK | | session_id | uuid FK ON DELETE CASCADE |
| company_id | uuid FK | | role | enum(`user`,`assistant`) |
| quarter_id | uuid FK NULL | | content | text |
| created_at | timestamptz | | citations | jsonb |
| | | | created_at | timestamptz |

### 3.8 Post-Call Analysis

#### `post_call_market_data`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| company_id / quarter_id | uuid FK | |
| stock_price_movement_7d | jsonb | time series |
| sentiment_evolution | jsonb | |
| analyst_rating_changes | jsonb | upgrades/downgrades |
| fii_dii_flow | jsonb | |
| captured_at | timestamptz | external feed (integration) |

### 3.9 Ops

#### `agent_runs` (LangGraph job tracking)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| job_type | enum(`ingest`,`extract`,`embed`,`predict`,`evaluate`,`chat`,`rehearse`) | |
| entity_ref | jsonb | {company_id, quarter_id, document_id} |
| status | enum(`queued`,`running`,`success`,`failed`) | |
| trace_id | text | LangSmith/OTel link |
| error | text NULL | |
| started_at / finished_at | timestamptz | |

#### `audit_log`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| action | text | upload, predict, freeze, score, delete… |
| entity_type / entity_id | text / uuid | |
| metadata | jsonb | |
| created_at | timestamptz | |

---

## 4. Backend — FastAPI + LangGraph agents

### 4.1 LangGraph graphs (the ML core)
Each graph is a `StateGraph` with a typed shared state, runs on the worker pool, writes progress to
`agent_runs`, and is traced (LangSmith/OTel). Guardrail: every generated claim must carry a source or be dropped.

| Graph | Trigger | Nodes (happy path) | Writes |
|---|---|---|---|
| **Ingestion** | Admin upload | `validate → parse/OCR → segment → extract(QA, metrics, attendees, sentiment) → canonicalize_themes → chunk → embed → index → mark_ready` | documents, qa_pairs, metrics, attendees, sentiment_analysis, document_chunks |
| **Prediction** | CFO "Generate" | `gather_signals(metric surprises, recurring Qs, rising themes, peer hot-topics, analyst patterns) → retrieve_context → generate_candidates → dedup/cluster → score/rank → assign L1/L2 + asker → talking_points + cite → freeze_snapshot` | prediction_runs, predicted_questions |
| **Assistant (RAG)** | CFO chat | `route → hybrid_retrieve → rerank → answer_with_citations → (optional multi-hop)` | chat_messages |
| **Rehearsal** | CFO practice | `present_question → capture_answer → grade_vs_model → coach` | rehearsal_turns |
| **Evaluation** | Admin uploads TR | `extract_actuals → canonicalize_L1L2 → link(predicted↔actual, τ, 1:1 assign) → confusion_matrices(L1,L2) → KPIs → gate(≥0.80) → learning_report → emit_feedback(future-only)` | qa_pairs, evaluation_runs, question_links, evaluation_category_rows |

### 4.2 FastAPI endpoints (by role)

**Auth:** `POST /auth/login` · `POST /auth/refresh` · `GET /me`

**Admin**
```
POST   /companies                       create company
POST   /companies/{id}/documents        upload (multipart, per-file doc_type + bucket)
GET    /companies/{id}/documents        list
DELETE /documents/{id}
POST   /companies/{id}/quarters/{q}/ingest        trigger Ingestion graph
POST   /companies/{id}/quarters/{q}/transcript    upload TR → trigger Evaluation graph
GET    /jobs/{agent_run_id}             poll status
GET    /audit                           audit log
PUT    /themes                          taxonomy mgmt
```

**CFO — Historical Hub**
```
GET /companies                          (scoped)
GET /companies/{id}/quarters
GET /quarters/{id}/summary  | /qa | /themes | /attendees | /sentiment
POST /assistant/chat                    (SSE stream)
```

**CFO — Simulator**
```
POST /companies/{id}/quarters/{q}/predictions   generate (regime param) → run_id
GET  /predictions/{run_id}                       ranked questions
POST /predictions/{run_id}/freeze                lock snapshot
POST /predictions/{run_id}/ask                   interactive Q&A (SSE)
POST /rehearsal/sessions                         start
POST /rehearsal/sessions/{id}/answer             grade + coach
POST /predictions/{run_id}/custom-question       custom builder
```

**CFO — Performance Debrief**
```
GET /quarters/{id}/evaluation                    KPIs + gate
GET /evaluations/{run_id}/confusion?level=L1|L2  matrix rows
GET /evaluations/{run_id}/export                 learning report (PDF)
```

**CFO — Post-Call Analysis**
```
GET /quarters/{id}/post-call   stock 7d · sentiment evolution · ratings · FII/DII
```

---

## 5. Frontend — React

- **Stack:** React + TypeScript, React Router, TanStack Query (server state), Tailwind, charts (Recharts), SSE/WS for streaming. Design tokens match the existing navy/crimson card UI.
- **Role-gated routing:** `AdminConsole` vs `CfoWorkspace`; route guards read JWT role.

```
/login
/admin
  ├─ /companies                 company CRUD + selector
  ├─ /documents                 drag-drop upload, per-file type, list/delete (Image 1)
  ├─ /transcript                post-call TR upload (Image: Prediction vs Actual)
  └─ /jobs                      ingestion/eval progress
/app                            CFO landing — 4 module cards (Image 2)
  ├─ /historical                Key Topics · Quarter dropdown · AI Summary · Q&A · Attendees · Themes · Sentiment · Assistant chat (Images 3–4)
  ├─ /simulator                 Predicted-Q list (theme chips, prob, asker, sources) · Rehearsal mode · Custom builder
  ├─ /debrief                   KPI cards · L1 & L2 confusion matrices · theme analysis · Export Learning Report
  └─ /post-call                 7-day price · sentiment evolution · rating changes · FII/DII
```

**Shared components:** `CompanySelector`, `QuarterSelector`, `DocumentUploader`, `StreamingChat`,
`PredictedQuestionCard`, `ConfusionMatrixTable`, `KpiCard`, `RehearsalPanel`.

---

## 6. Build task list

### 6.1 System-Architect lens

- [ ] Provision Postgres (+pgvector), object store, queue, worker pool; IaC + secrets manager.
- [ ] Apply the schema in §3 as migrations; seed `themes` taxonomy; fixtures for one company.
- [ ] Auth service: JWT, refresh, `role` + `company_scope` claims; FastAPI RBAC dependency guards.
- [ ] **Row-level multi-tenant scoping** on every query (MNPI isolation) + audit logging.
- [ ] Object-store upload (presigned/multipart), checksum dedup, virus-scan hook.
- [ ] Async job framework: enqueue → LangGraph worker → `agent_runs` status → poll/stream.
- [ ] SSE/WebSocket transport for assistant chat, interactive Q&A, rehearsal.
- [ ] Caching layer (predictions keyed by `doc_set_hash`; invalidate on new upload).
- [ ] Observability: OpenTelemetry traces + LangSmith on every graph; structured errors, retries, DLQ.
- [ ] Encryption at rest/in transit; backup/retention honoring document Delete.
- [ ] React app scaffold, role-gated routing, API client, error/loading/empty states.
- [ ] CI/CD; environments; load test the worker pool; rate limiting on LLM-bound routes.

### 6.2 ML-Architect lens

- [ ] Parsing/OCR + section segmentation; table extraction for `FIN`/`SUPP`.
- [ ] Chunking strategy (semantic, section-aware) + embedding model/version pinned per chunk.
- [ ] **Hybrid retrieval** (dense + BM25) with metadata filters; add a reranker; expose one interface.
- [ ] **Theme canonicalization** model: free-form actual L1/L2 → controlled taxonomy (embedding-NN/classifier) — *gate for L2 fairness*.
- [ ] Q&A extraction (question/answer/asker/responder/theme/sentiment); analyst linking.
- [ ] Metric extraction + QoQ/YoY deltas + **surprise scoring** (the strongest prediction trigger).
- [ ] **Prediction scoring model**: weighted features (recurrence, recency, materiality, theme momentum, analyst interest, peer prevalence) → probability; start heuristic, evolve to learned.
- [ ] Candidate generation (RAG) + semantic **dedup/clustering**; top-N (24) selection.
- [ ] **Groundedness guardrail**: drop/flag any answer or figure without a resolvable source.
- [ ] **Question-linking algorithm**: embed, cosine, threshold **τ**, 1:1 (greedy/Hungarian); tune τ on a gold quarter.
- [ ] **Evaluation harness**: L1/L2 confusion matrices, the dashboard KPIs, `mean(L1_F1,L2_F1) ≥ 0.80` gate (Warm, canonicalized).
- [ ] **No-leakage enforcement**: prediction inputs filtered by date/doc-type cutoff; never the current Q&A transcript.
- [ ] **Frozen, reproducible artifacts**: `model_version` + `doc_set_hash` on every prediction/eval run.
- [ ] **Learning loop (future-only)**: FN→Phase-7 weights, FP→over-predicted themes, recurring free-form L2→expand template vocab.
- [ ] Gold sets + regression suite; **eval gating in CI** (block models that drop below the bar); drift alerts.
- [ ] Prompt/version management for each graph node; cost & latency budgets per graph.

---

## 7. Suggested sequencing

```
M1 Foundations  → schema + auth + RBAC + object store + worker skeleton + React shell
M2 Ingestion    → Ingestion graph end-to-end; Admin upload console live
M3 Historical   → Hub read APIs + Assistant RAG (CFO tab 1)
M4 Prediction   → Prediction graph + Simulator + Rehearsal (CFO tab 2)  ← core ML
M5 Evaluation   → Transcript upload + Evaluation graph + Debrief (CFO tab 3) ← 80% gate
M6 Post-Call    → market-data integration + Post-Call Analysis (CFO tab 4)
M7 Harden       → observability, gold-set/CI gating, security review, load test
```

*Detail per pipeline stage: `agent.md`. Problem framing & success criteria: `problem-statement.md`.*
