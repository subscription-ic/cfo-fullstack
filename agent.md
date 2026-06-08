# agent.md — Earnings Call Simulator

> **Mission:** Predict the most *probable* questions a CFO will be asked on an upcoming
> earnings call — for any company, any industry — and let them rehearse with
> grounded, citable answers. The Simulator learns from a company's own historical
> calls, its current-quarter documents, peer/industry patterns, and analyst behaviour.

This file is the build plan. It lists every task from **Ingestion → Retrieval**, in the
order an agent (or team) should execute. Tasks are grouped into phases; each has an
intent, concrete tasks (`[ ]`), and acceptance criteria (✅). Treat phases as roughly
sequential but expect Phases 3–6 to iterate.

---

## 0. Conventions & Assumptions

- **Inputs:** PDFs / TXT uploaded per company, each tagged with a document type.
- **Document types:** `FIN` (financials), `PR` (press release), `TR` (transcript),
  `PPT` (presentation), `AR` (annual report), `GUIDE` (guidance), `SUPP` (supplementary),
  `RR` (research report — embedded like any doc, used as analyst-intent signal).
- **Granularity:** everything is keyed by `(company, fiscal_quarter)`.
- **Output of the Simulator:** a ranked set (default **24**) of predicted questions, each
  with theme, likely asker profile, probability score, suggested talking points, and sources.
- **Two tabs already exist:** `Historical` (past calls, structured Q&A) and `Current`
  (this quarter's uploads). The Simulator predicts the *next* call from both.
- **Evaluation is predict-before / score-after:** predictions are frozen *before* the call;
  the actual transcript is supplemented *after* the call; predicted vs actual L1/L2 are then
  matched. Predictions are never regenerated once the transcript is visible (see Phase 9).
- Replace any provider names below with your actual stack; the plan is provider-agnostic.

---

## 1. Foundations & Data Model

**Intent:** lock the schema and contracts everything else depends on.

- [ ] Define core entities: `Company`, `FiscalQuarter`, `Document`, `Chunk`, `QAPair`,
      `Theme`, `Attendee`, `Analyst`, `Metric`, `PredictedQuestion`.
- [ ] Define `Document` metadata: `company_id`, `quarter`, `doc_type`, `source_filename`,
      `upload_ts`, `page_count`, `checksum`, `status`.
- [ ] Define `QAPair`: `question`, `answer`, `asker` (analyst+firm), `responder`
      (name+role), `themes[]`, `quarter`, `sentiment`, `source_span`.
- [ ] Define `PredictedQuestion`: `text`, `theme`, `likely_asker_profile`,
      `probability`, `rationale`, `talking_points[]`, `sources[]`, `cluster_id`.
- [ ] Pick the **theme taxonomy** (seed from existing tags: Profitability, Revenue,
      Risk, Guidance, Capital, Cash Flow, Margins, Demand, Cost, Growth, ESG, M&A,
      Regulation, Capex). Keep it editable per industry.
- [ ] Choose stores: relational/metadata DB + vector DB + object store for raw files.
- [ ] Choose embedding model + LLM; capture model IDs and dimensions in config.
- [ ] **✅** Schema migrations apply cleanly; a fixture company round-trips through all tables.

---

## 2. Ingestion

**Intent:** get files in, validated, classified, and stored — reliably and idempotently.

- [ ] Multi-file upload endpoint (PDF + TXT), associate with selected company.
- [ ] Capture per-file `doc_type` selection (the dropdown in the Current Documents UI).
- [ ] Validate: file type, max size, page count, non-empty, virus/scan hook.
- [ ] Deduplicate via checksum (skip or version re-uploads).
- [ ] Persist raw file to object store; write `Document` row with `status=uploaded`.
- [ ] "Fetch All Documents" + Delete flows wired to metadata DB (per Image 4).
- [ ] Idempotent re-ingestion: re-uploading the same file does not duplicate chunks.
- [ ] Emit an `ingested` event to kick off the processing pipeline (queue/worker).
- [ ] **✅** Upload 5 mixed files → all appear under the correct company/quarter with
      correct `doc_type`; re-upload creates no duplicates.

---

## 3. Parsing & Preprocessing

**Intent:** turn raw bytes into clean, structured text with layout preserved.

- [ ] PDF text extraction with layout/reading order; fall back to **OCR** for scanned PDFs.
- [ ] Table extraction (financial tables in `FIN`/`SUPP`) into structured rows.
- [ ] Section segmentation: prepared remarks vs **Q&A section** vs MD&A vs disclaimers.
- [ ] Speaker/turn detection in transcripts (operator, management, analyst).
- [ ] Text normalization: whitespace, hyphenation, currency/number/units, fiscal labels.
- [ ] Detect & store document language; route to translation if needed.
- [ ] Quality gate: flag low-text-yield pages for OCR review.
- [ ] **✅** A transcript yields cleanly separated speaker turns and an isolated Q&A block;
      a financial PDF yields machine-readable metric tables.

---

## 4. Enrichment & Structuring (the historical "gold")

**Intent:** convert transcripts into the structured Q&A and signals the predictor learns from.
This is what powers the Historical Intelligence Hub *and* the Simulator.

- [ ] **Q&A pair extraction** from `TR`: pair each analyst question with management's answer.
- [ ] Identify `asker` (analyst name + firm) and `responder` (name + role, e.g. CFO/CEO).
- [ ] Link analysts to a persistent `Analyst` record (track who covers this company).
- [ ] **Theme tagging** of each question/answer against the taxonomy (multi-label).
- [ ] Sentiment scoring per Q&A and per theme (reuse the existing sentiment engine).
- [ ] **Metric extraction**: pull KPIs from `FIN`/`SUPP` and compute QoQ / YoY deltas.
- [ ] **Guidance extraction**: capture forward-looking statements from `GUIDE`/`PR`/`TR`.
- [ ] **Change detection**: diff current-quarter metrics & guidance vs prior quarters →
      produce "surprise / change" signals (the strongest predictor of a question).
- [ ] Attendee extraction (management + analysts) → populate Call Attendees panel.
- [ ] Persist a per-quarter **question bank** with themes, askers, and frequencies.
- [ ] **✅** For one historical quarter, the system reproduces the actual asked questions
      with correct asker/responder/theme tags at agreed accuracy.

---

## 5. Embedding & Indexing

**Intent:** make everything retrievable by meaning and by metadata.

- [ ] Semantic chunking (respect section/table boundaries; target token window).
- [ ] Generate embeddings for: document chunks **and** historical questions (separate index).
- [ ] Upsert to vector store with metadata filters: `company`, `quarter`, `doc_type`,
      `theme`, `speaker_role`.
- [ ] Build **hybrid retrieval** (dense + BM25/keyword) for numbers, tickers, and named metrics.
- [ ] Maintain a **question-bank vector index** (historical questions across quarters/peers).
- [ ] Re-embed/version on document update; track embedding model version per chunk.
- [ ] **✅** A metric query (e.g. "NIM trajectory") returns the right `FIN` rows + the
      historically related questions, filtered to the correct company.

---

## 6. Knowledge Base / Signal Layer

**Intent:** aggregate reusable signals the predictor scores against.

- [ ] **Company profile**: business model, segments, key KPIs it reports, typical themes.
- [ ] **Theme evolution**: frequency of each theme by quarter (what's rising / fading).
- [ ] **Analyst patterns**: which analysts ask about which themes, how persistently.
- [ ] **Recurring questions**: questions asked across ≥N quarters (high base-rate to recur).
- [ ] **Peer / industry layer**: cluster the company with peers; surface questions hot
      across the sector (covers *any company/industry* even with thin own-history).
- [ ] **Hot-topic detector**: emerging themes from current `PR`/`GUIDE`/`RR` + macro/regulatory.
- [ ] **✅** Given a company with sparse history, the peer layer still supplies a credible
      candidate question set.

---

## 7. Question Prediction & Ranking (core engine)

**Intent:** produce the ranked, deduped 24 questions a CFO is most likely to face.

- [ ] **Trigger assembly:** gather signals → metric surprises (Phase 4), guidance gaps,
      rising themes (Phase 6), recurring questions, peer hot topics, analyst interest.
- [ ] **Retrieval-augmented generation:** for each trigger, retrieve supporting context and
      generate candidate question(s) grounded in that context.
- [ ] **Candidate pooling:** combine generated candidates + recurring historical questions
      + peer questions into one pool.
- [ ] **Dedup & cluster** semantically; keep the best representative per cluster.
- [ ] **Probability scoring** — rank by a transparent weighted score:
      recurrence/base-rate, recency, materiality of the change, theme momentum,
      analyst interest, sentiment pressure, peer prevalence.
- [ ] Map each question → `theme` + **likely asker profile** (e.g. "credit analyst", "macro").
- [ ] Generate **CFO talking points / suggested answer** per question, grounded in docs,
      with inline source citations (doc_type + page/span).
- [ ] Attach a **rationale** ("asked 3 of last 4 quarters; NIM moved −20bps QoQ").
- [ ] Return top **N (default 24)**, configurable; expose score & sources for transparency.
- [ ] Guardrails: no fabricated numbers — every figure traces to a `Metric`/chunk source.
- [ ] **✅** Backtest on a held-out quarter: predicted set covers an agreed % of the
      questions actually asked (hit-rate target), with sources resolving correctly.

---

## 8. Retrieval & Serving (Simulator runtime)

**Intent:** the APIs and modes that the Simulator UI consumes.

- [ ] `POST /simulator/predict` → ranked predicted questions for `(company, quarter)`.
- [ ] `POST /simulator/ask` → **Interactive Q&A**: user asks, system answers from docs + history with citations.
- [ ] **Rehearsal Mode**: system presents predicted questions one by one; user answers;
      system gives a model answer + coaching/feedback and coverage notes.
- [ ] **Custom Question Builder**: user-authored question → grounded answer + talking points.
- [ ] Streaming responses; per-answer citations link back to source documents.
- [ ] Caching of predictions per `(company, quarter, doc-set hash)`; invalidate on new upload.
- [ ] **✅** From the Simulator screen, a user can generate 24 questions, drill into any one
      for talking points + sources, and run a full rehearsal loop.

---

## 9. Evaluation & Model Learning (Prediction vs Actual)

**Intent:** prove the predicted questions land, on a **predict-before / score-after** basis,
and feed misses back into the engine — without leaking the answer key.
**Target: mean(L1 F1, L2 F1) ≥ 0.80** at the *categorical* level, actuals canonicalized,
under the **Warm** regime. (See "Target" below.)

### 9.1 Temporal lifecycle (must be enforced in this order)

```
T0  PRE-CALL   → generate predictions → freeze + timestamp the set (immutable snapshot)
T1  CALL       → earnings call happens
T2  POST-CALL  → upload transcript (TR) → extract actual Qs → tag + CANONICALIZE L1/L2
T3  SCORE      → link frozen predictions ↔ actuals → check L1 & L2 match → confusion matrices
T4  LEARN      → export learning report; feed FN/FP to FUTURE quarters only
```

- [ ] **Prediction snapshot (immutable):** persist the predicted set at T0 with
      `prediction_ts`, `model_version`, `doc_set_hash`, `regime`. Score *this* frozen set —
      never regenerate predictions after the transcript is seen.
- [ ] **Post-call supplement:** "Upload Transcript" ingests the actual call (Phases 2–4),
      extracts actual questions, tags actual-L1 / actual-L2.
- [ ] **Lock on score:** once scored, the quarter's prediction set + eval record are read-only.

### 9.2 Integrity rules (the eval is worthless without these)

- [ ] **No leakage / temporal isolation:** the predictor at T0 may consume only documents that
      exist before the Q&A — prior transcripts, `GUIDE`, peers, and (Warm regime) the current
      quarter's just-released `PR`/`FIN`/`PPT`/prepared remarks. It must **never** see the
      current call's analyst-Q&A transcript. Backtests enforce a date / doc-type cutoff.
- [ ] **Frozen comparison:** scoring always uses the T0 snapshot, not a re-run.
- [ ] **Future-only learning:** FN/FP feedback tunes the *next* quarter; never re-score a
      locked quarter after tuning (that is overfitting and voids the metric).

### 9.3 Prediction regime (decides feasibility of 80%)

- [ ] Make regime an explicit config on every prediction set:
  - **Cold** — predict *before* the earnings release (prior data + guidance + peers only).
    Hardest; you're inferring the numbers too. Report separately as a stretch goal.
  - **Warm** — predict *after* release, *before* Q&A (this quarter's `PR`/`FIN`/`PPT` available).
    Metric *surprises* are visible → strongest signal → **80% target applies here.**

### 9.4 Label canonicalization (required, not optional)

- [ ] Map free-form *actual* L1/L2 (transcript-extracted) onto the controlled taxonomy via
      embedding-NN or a small classifier **before** scoring, so predicted (template) vocab and
      actual (free-form) vocab are compared like-for-like. Without this, L2 is unfairly punished.
- [ ] Keep a canonicalization audit (raw extracted label → mapped taxonomy label) for review.

### 9.5 Linking algorithm (biggest single lever on the score)

- [ ] Embed predicted + actual questions; cosine similarity; threshold **τ**.
- [ ] One-to-one assignment (greedy or Hungarian) so nothing double-counts.
- [ ] Tune **τ** on a hand-labeled **gold quarter** so "match" agrees with human judgment.
- [ ] A **TP requires both** a link (we anticipated it) **and** a label match (right theme).

### 9.6 Metrics (map 1:1 to the Prediction vs Actual dashboard)

- [ ] **Categorical Precision** — predictions whose linked actual shares the category label.
- [ ] **Substantive Precision** — stricter: shares a specific number / named entity / term.
      *Report only — do NOT gate on 80% (you won't predict exact figures).*
- [ ] **Recall (matching rate)** — share of actual analyst questions we anticipated (dedup'd).
- [ ] **F1** — harmonic mean of precision & recall, computed at L1 and at L2.
- [ ] **Top-3 Accuracy** — did the actual question land in our top-3 picks for its theme.
- [ ] **Theme Coverage** — share of L1/L2 themes we identified at all.
- [ ] **L1 confusion matrix** — one row per L1; Pred/Actual counts, TP/FP/FN, P/R/F1.
- [ ] **L2 confusion matrix** — one row per (L1, L2) pair; same columns.

### 9.7 Target definition (write it down, gate releases on it)

- [ ] **Primary gate:** `mean(L1_F1, L2_F1) ≥ 0.80` (categorical, actuals canonicalized, Warm).
- [ ] L2 is the limiter — expect it below L1; canonicalization + τ tuning are how you close it.
- [ ] Substantive Precision, Top-3, Theme Coverage, and Cold-regime scores: **reported, not gated.**

### 9.8 Quality & learning loop

- [ ] **Gold set:** 1–2 hand-labeled quarters per company to validate canonicalization + τ.
- [ ] **Groundedness / hallucination** checks on generated answers (every claim → source).
- [ ] **Miss analysis:** FN → questions we missed (→ Phase 7 triggers/weights);
      FP → over-predicted themes; recurring free-form L2 → expand template L2 vocabulary.
- [ ] **Export Learning Report** per quarter (the dashboard button) as an immutable artifact.
- [ ] **Regression suite** over fixed companies/quarters; alert on metric drift per release.
- [ ] **✅** A full T0→T4 run on a gold quarter reproduces the dashboard KPIs, hits the
      ≥0.80 gate (Warm), and writes a frozen, leakage-free eval record.

---

## 10. Frontend Integration

**Intent:** wire the engine into the Simulator module (Image 2 → "Start Simulator").

- [ ] Company/quarter selector reuses the existing Company Profile selection.
- [ ] Predicted-questions list with theme chips, probability, asker profile, expand-for-sources.
- [ ] Rehearsal Mode UI (question → user answer → model answer + feedback).
- [ ] Custom Question Builder input.
- [ ] **Export a "CFO Prep Pack"** (PDF): questions + talking points + sources.
- [ ] Loading / streaming / empty / error states.
- [ ] **✅** End-to-end click-through from the landing card works without manual API calls.

---

## 11. Ops, Security & Governance

**Intent:** earnings data is material non-public information — treat it accordingly.

- [ ] Multi-tenant isolation; strict per-company access control (note the Admin Access role).
- [ ] Encryption at rest + in transit; confidential-data handling policy.
- [ ] Audit logging of uploads, generations, and retrievals.
- [ ] Cost & latency monitoring on embeddings/LLM calls; rate limiting.
- [ ] Observability: tracing across ingest → predict; structured error reporting + retries.
- [ ] Data retention / deletion honoring the Delete actions in the Documents panel.
- [ ] **✅** A pen-test/access review confirms no cross-tenant leakage; all actions are audited.

---

## Execution Order (TL;DR)

```
1 Foundations → 2 Ingestion → 3 Parsing → 4 Enrichment → 5 Embedding/Index
→ 6 Knowledge Base → 7 Prediction Engine → 8 Serving → 9 Eval
(10 Frontend + 11 Ops run alongside from Phase 7)
```

**The single highest-leverage component is Phase 4 + Phase 7:** clean historical Q&A
extraction plus a transparent, change-driven scoring model is what makes the predicted
questions actually land in front of the CFO.
