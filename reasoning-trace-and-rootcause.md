# Reasoning Trace & Root-Cause Mechanism

**Extends** `technical-design.md` (adds schema §3.10, a 6th LangGraph graph, API + UI drill-down, tasks).
**Purpose:** When a prediction *doesn't come true*, let the reasoning layer go back, replay the
decision path, and pinpoint **where exactly** it broke — turning every miss into a precise,
attributed, fixable cause instead of an anonymous dent in the F1.

---

## 1. The gap this closes

Today the Performance Debrief tells you *that* a question was missed (FN) or wrongly predicted (FP).
It does not tell you **why**: was the document never uploaded? was the right context not retrieved?
did the model actually generate the question but rank it 31st? did it predict correctly but the L1/L2
label didn't match? Each of those has a *different fix* — and a different owner (ML team vs Admin/data).

The mechanism has two halves:

- **(A) Provenance capture — at predict time (T0).** Every predicted question stores the full reasoning
  that produced it, plus the *entire candidate pool* (not just the promoted top-N).
- **(B) Root-cause replay — at score time (T3+).** A **Root-Cause Agent** replays each miss against
  that stored trace and the actuals, runs deterministic checks down a decision tree, and emits a
  structured attribution + a human-readable narrative + a suggested fix.

---

## 2. (A) What gets captured at predict time

Recorded per **predicted question** (and per **run** for shared config) so the trace is replayable
and reproducible — no re-running the model, which would itself be a leakage risk.

**Per run:** `doc_set_hash`, `model_version`, `regime`, `retrieval_config`, `τ`, `scoring_weights`, `langsmith_trace_id`.

**Per predicted question:**
- `signals_fired` — `[{type, ref_id, weight, contribution}]` (e.g. metric `NIM` moved −20bps → ref `metrics.id`).
- `retrieved_chunks` — `[{chunk_id, score}]` actually fed to generation.
- `candidate_lineage` — prompt id, raw LLM output, `cluster_id`, sibling candidates merged in.
- `score_breakdown` — per-feature contribution → `probability`, `rank`.
- `label_assignment` — `{predicted_l1, predicted_l2, method, confidence}`.

**Per run — the candidate pool (critical):** *all* generated candidates, promoted **and** dropped,
with their scores. Without the dropped candidates you cannot tell a true blind spot (`GENERATION_GAP`)
from a ranking failure (`RANK_CUTOFF`) — the single most useful distinction in the whole mechanism.

---

## 3. (B) Failure taxonomy — where exactly it broke

Each miss is attributed to a **pipeline stage** (from the Prediction graph) and a **category**:

### Missed questions (FN — analyst asked, we didn't capture)

| Category | Stage | What it means | Fix / owner |
|---|---|---|---|
| `COVERAGE_GAP` | Input | No uploaded document covered the topic | Upload missing doc — **Admin** |
| `UNFORECASTABLE` | Input | Depended on info that didn't exist pre-call | Not a defect; excluded from forecastable ceiling |
| `LEAKAGE_CUTOFF` | Regime | Needed input filtered by the date/doc-type cutoff | Revisit regime/cutoff — **ML** |
| `RETRIEVAL_GAP` | Retrieval | Relevant chunk existed but wasn't retrieved | Chunking / hybrid retrieval / reranker — **ML** |
| `SIGNAL_MISS` | Signal | A real trigger (metric move, recurrence) didn't fire / scored low | Trigger logic / weights — **ML** |
| `GENERATION_GAP` | Generation | Context was retrieved but no candidate produced | Prompt / generation coverage — **ML** |
| `CLUSTER_LOSS` | Dedup | A good candidate was merged/dropped during clustering | Dedup threshold — **ML** |
| `RANK_CUTOFF` | Scoring | Candidate **was** generated but ranked below N (near-miss) | Re-weight scoring — **ML** |
| `LABEL_MISMATCH` | Labeling | Semantically predicted, but L1/L2 didn't match | Canonicalizer / taxonomy — **ML** |

### Wrong predictions (FP — we predicted, not asked)

| Category | Stage | What it means | Fix / owner |
|---|---|---|---|
| `OVERWEIGHT_SIGNAL` | Scoring | A feature inflated the score | Re-weight — **ML** |
| `STALE_RECURRENCE` | Signal | Historically asked, no longer relevant | Recency decay — **ML** |
| `WEAK_GROUNDING` | Generation | Generated from thin/no source (near-hallucination) | Groundedness guardrail — **ML** |
| `LABEL_MISMATCH` | Labeling | Effectively asked, but our L1/L2 differed | Canonicalizer — **ML** |
| `PLAUSIBLE_UNASKED` | — | Reasonable question simply not asked this time | Not a defect; analysts had limited time |

**Key reframe:** `UNFORECASTABLE` + `PLAUSIBLE_UNASKED` are *not bugs* — they're the forecastability
ceiling. The mechanism lets you report the 80% gate against **forecastable misses only**, separating
"the model is wrong" from "this was never predictable," which is the honest way to read the number.

---

## 4. The Root-Cause Agent (LangGraph, graph #6)

Runs inside / right after the Evaluation graph, once per miss. **Deterministic checks first**
(computable from the trace), **LLM critic last** (narrative + ambiguous tie-breaks). The decision tree
for an FN:

```
sim_pool = max cosine(actual_question, every candidate in the run's pool)

IF sim_pool ≥ τ:                         # we did generate something close
   locate that candidate:
     promoted (rank ≤ N) but label ≠      → LABEL_MISMATCH
     rank > N                             → RANK_CUTOFF      (we knew, under-ranked)
ELSE:                                     # nothing close was generated
   was a relevant chunk retrieved?
     YES                                  → GENERATION_GAP
     NO → does any corpus chunk cover it?
            YES                           → RETRIEVAL_GAP
            NO → was the info available pre-call?
                   filtered by cutoff     → LEAKAGE_CUTOFF
                   never existed          → UNFORECASTABLE
                   exists, not uploaded   → COVERAGE_GAP   (Admin action)

# orthogonal overlay: if a strong signal existed but no question surfaced → also tag SIGNAL_MISS
```

Node flow:
```
load_trace(miss) → coverage_check → retrieval_check → candidate_proximity_check
   → rank/label_check → signal_check → classify(stage, category)
   → llm_critic(narrative + suggested_fix + confidence) → persist_attribution
```

The agent's input is the **stored trace**, never a live re-prediction — so the diagnosis is
deterministic, reproducible, and leakage-free.

---

## 5. Schema additions (§3.10 of technical-design)

#### `prediction_traces`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| predicted_question_id | uuid FK→predicted_questions ON DELETE CASCADE | |
| signals_fired | jsonb | `[{type,ref_id,weight,contribution}]` |
| retrieved_chunks | jsonb | `[{chunk_id,score}]` |
| candidate_lineage | jsonb | prompt id, raw output, cluster, siblings |
| score_breakdown | jsonb | per-feature contributions |
| label_assignment | jsonb | predicted l1/l2 + method + confidence |
| langsmith_trace_id | text | link to full graph trace |

#### `candidate_pool`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| prediction_run_id | uuid FK ON DELETE CASCADE | |
| candidate_text | text | |
| embedding | vector(1536) | for proximity check vs actuals |
| score | numeric | |
| rank | int NULL | null if dropped pre-ranking |
| promoted | bool | became a `predicted_question`? |
| dropped_reason | text NULL | dedup / below-cutoff |

#### `failure_attributions`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| evaluation_run_id | uuid FK ON DELETE CASCADE | |
| question_link_id | uuid FK→question_links NULL | |
| predicted_question_id | uuid FK NULL | set for FP |
| actual_qa_pair_id | uuid FK NULL | set for FN |
| match_type | enum(`FP`,`FN`) | |
| stage | enum(`input`,`regime`,`retrieval`,`signal`,`generation`,`dedup`,`scoring`,`labeling`) | |
| category | text | from §3 taxonomy |
| is_forecastable | bool | false for UNFORECASTABLE / PLAUSIBLE_UNASKED |
| confidence | numeric | agent confidence in the diagnosis |
| evidence | jsonb | chunk ids, sim scores, candidate rank, signal refs |
| narrative | text | human-readable "what went wrong, where" |
| suggested_fix | text | actionable |
| owner | enum(`ml`,`admin_data`) | routes the fix |

---

## 6. Traceable "in the tool" — API + UI

**API**
```
GET /predicted-questions/{id}/trace            full provenance for one prediction
GET /evaluations/{run}/attributions            every miss + stage + category + narrative + fix
GET /evaluations/{run}/attributions/summary    aggregated by stage/category/owner (+ forecastable ceiling)
```

**Performance Debrief UI**
- Every FP/FN row in the L1/L2 confusion matrices is **clickable → a drill-down**:
  a *reasoning timeline* (signals → retrieved chunks → candidates+scores → rank → label) with the
  break point highlighted, the plain-English narrative, and the suggested fix + owner.
- A **"Where the system breaks" panel**: misses grouped by stage/category (e.g. "L2: 45%
  `LABEL_MISMATCH`, 25% `RANK_CUTOFF`") + the **forecastable ceiling** vs raw score.
- The **Export Learning Report** now carries per-miss root-cause, not just aggregate KPIs.

---

## 7. Closes the loop (targeted, future-only)

The aggregated attribution summary becomes the *prioritized* backlog for the next quarter — and it's
specific: `RETRIEVAL_GAP`-heavy → fix chunking/reranker; `RANK_CUTOFF`-heavy → re-weight scoring;
`LABEL_MISMATCH`-heavy → expand the canonicalizer / template L2 vocab; `COVERAGE_GAP`-heavy → an Admin
upload checklist. Same rule as before: **fixes apply to future quarters, never re-score the locked one.**

---

## 8. Tasks

### System-Architect lens
- [ ] Persist the full candidate pool + per-question trace at freeze time (don't discard dropped candidates).
- [ ] Store and link LangSmith/OTel `trace_id` so UI drill-down jumps to the raw graph run.
- [ ] Attribution drill-down API + the three endpoints; cache the summary per `evaluation_run`.
- [ ] UI: clickable confusion-matrix rows → reasoning timeline; "where it breaks" panel; enriched export.
- [ ] Attribution writes are immutable and tied to the frozen `evaluation_run` (audit-logged).

### ML-Architect lens
- [ ] Build the **Root-Cause Agent** (graph #6): deterministic decision tree (§4) + LLM critic for narrative.
- [ ] Implement `candidate_proximity_check` (actual vs full pool) to split `RANK_CUTOFF` from `GENERATION_GAP`.
- [ ] `coverage_check` / `retrieval_check` against the corpus to split `RETRIEVAL_GAP` from `COVERAGE_GAP`.
- [ ] `signal_check` overlay (strong-signal-but-no-question → `SIGNAL_MISS`).
- [ ] Tag `is_forecastable`; report the **forecastable-only** F1 alongside the raw 0.80 gate.
- [ ] Validate the agent's labels against human-coded misses on the gold set (diagnosis accuracy metric).
- [ ] Feed the attribution summary into the future-only learning backlog with owners.
```
