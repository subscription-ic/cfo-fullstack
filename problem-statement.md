# Earnings Call Simulator — System Design Problem Statement

**Module:** Earnings Call Simulator (within the *Earnings Intelligence Copilot* / *Earnings Call Companion*)
**Document type:** Problem Statement (frames the *what & why*; the *how* lives in `agent.md`)

> **In one line:** Before an upcoming earnings call, for *any* company in *any* industry,
> predict the questions a CFO is most likely to be asked — ranked, theme-classified, and
> grounded in the company's own documents — then prove the prediction was right once the
> call transcript arrives.

---

## 1. Background

The platform already ingests company documents and structures **historical** earnings calls. For each fiscal quarter it extracts the actual Q&A (question, answer, the analyst who asked, the executive who answered), tags discussion themes (Profitability, Revenue, Risk, Guidance, Capital, Cash Flow…), records call attendees, and scores sentiment. Documents arrive typed as `FIN, PR, TR, PPT, AR, GUIDE, SUPP, RR`. The *Historical Intelligence Hub* lets users explore all of this for past calls.

What is missing is the **forward-looking** capability — turning that historical understanding into preparation for the *next* call. That is the Simulator.

---

## 2. Problem Statement

Earnings-call Q&A is high-stakes and unscripted. Analysts reliably probe exactly where the quarter moved — a margin that slipped, guidance that shifted, a risk the sector is worried about — and a weak or surprised answer from the CFO can move the stock. Today this preparation is manual, inconsistent, and dependent on who happens to be in the room.

**Build a system that, before an upcoming earnings call and for any company in any industry, predicts the most probable analyst questions the CFO will face** — ranked by likelihood, classified by main theme (L1) and sub-theme (L2), grounded with citations in the company's own documents and history — **and that can be objectively scored against what was actually asked** once the call transcript is supplied.

---

## 3. Objectives

- Produce a ranked set (default **24**) of most-probable questions for the next call.
- Generalize across any company/industry, **including those with thin own-history** (lean on peer/sector patterns).
- Ground every predicted question and every suggested answer in source documents — no fabricated figures.
- Enable rehearsal: interactive Q&A, a rehearsal mode, and a custom-question builder.
- Be **measurable** — predicted vs actual, by L1 and L2, against a defined accuracy bar.

---

## 4. Inputs

- **Current quarter:** `FIN`, `PR`, `GUIDE`, `PPT`, `SUPP` (the numbers, release, and prepared remarks).
- **History:** prior transcripts (`TR`), `AR`, and the structured Q&A bank (questions, answers, analysts, responders, themes, sentiment) per quarter.
- **Context:** `RR` (research reports → analyst intent) and peer / industry question patterns.

---

## 5. Expected Output

A **frozen, timestamped** prediction set per `(company, quarter)`, where each question carries:
text · L1 theme · L2 sub-theme · probability score · likely asker profile · CFO talking points · source citations.

---

## 6. The Core Challenge — why this is hard

1. **It is forecasting, not retrieval.** The strongest predictor of a question is *change* — a metric surprise, a guidance gap, a rising theme, a peer hot-topic — not what a document literally says.
2. **Any-company generalization.** It must work even when a company has little history, by borrowing sector/peer signal.
3. **No leakage.** Predictions are made *before* the Q&A exists; the system must never consume the very transcript it is later graded against.
4. **L2 vocabulary mismatch.** Predicted sub-themes use a controlled, template-driven vocabulary; actual sub-themes are free-form, extracted from the transcript — so naïve label matching unfairly penalizes L2.
5. **Groundedness.** Suggested answers must trace to real sources; no invented numbers.

---

## 7. Success Criteria — Evaluation (predict-before / score-after)

| Stage | What happens |
|---|---|
| **T0 — pre-call** | Generate predictions; **freeze + timestamp** the set (immutable snapshot). |
| **T1 — call** | The earnings call happens. |
| **T2 — post-call** | Upload the transcript; extract actual questions; tag and **canonicalize** their L1/L2. |
| **T3 — score** | Link frozen predictions ↔ actuals; match predicted L1/L2 to actual L1/L2; roll into **L1 and L2 confusion matrices** (TP/FP/FN → Precision / Recall / F1), plus Top-3 accuracy and theme coverage. |
| **T4 — learn** | Export a learning report; feed misses back into **future** quarters only. |

**Accuracy target:** `mean(L1 F1, L2 F1) ≥ ~80%` — categorical, with actuals canonicalized, under the **Warm** regime (predicting after the numbers are released but before Q&A, where metric surprises are visible). L2 is the limiter and is expected to trail L1. *Substantive precision and Cold-regime (pre-release) scores are reported but not gated at 80%.*

---

## 8. Constraints & Non-Negotiables

- **Temporal isolation / no leakage**, **immutable frozen predictions**, and **future-only learning** — or the 80% number is meaningless.
- **Citations + groundedness** on every predicted answer.
- **Material non-public information:** strict per-company isolation, access control, encryption, and audit logging.

---

## 9. Scope

**In scope:** prediction, ranking, theme classification, rehearsal, prediction-vs-actual evaluation, and the learning loop.
**Out of scope (for now):** trading or investment recommendations, real-time market-data feeds, and drafting official regulatory disclosures.

---

## 10. Key Assumptions

- Everything is keyed by `(company, fiscal_quarter)`.
- The earnings release (`PR`/`FIN`/`PPT`) is available shortly before Q&A (enabling the Warm regime).
- A small hand-labeled gold set exists to calibrate question-linking and label-canonicalization.

---

*Detailed task breakdown (Ingestion → Retrieval) and the full evaluation spec: see `agent.md`.*
