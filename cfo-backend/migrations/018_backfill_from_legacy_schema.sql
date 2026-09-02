-- 018_backfill_from_legacy_schema.sql
-- One-time copy of the prototype schema's rows into the current tables.
--
-- The prototype (pipeline_router.py) keyed questions off earnings_calls ->
-- companies instead of a flat (company, fiscal_year, quarter). This flattens
-- that join into the shape predicted_qa / actual_earnings_qa expect.
--
-- READ-ONLY with respect to the legacy tables: nothing is dropped, deleted or
-- updated there. They remain intact as a fallback.
--
-- Run AFTER supabase_run_in_dashboard.sql.
-- Re-runnable: INSERTs use ON CONFLICT (id) DO NOTHING and the link UPDATE only
-- touches rows that are still unlinked, so a rerun never duplicates rows and
-- never clobbers links the application has since produced itself.
-- No-op if the legacy tables were never created.

DO $do$
DECLARE
    n_pred INTEGER := 0;
    n_act  INTEGER := 0;
    n_link INTEGER := 0;
BEGIN
    -- -------------------------------------------------------------------------
    -- 1. predicted_questions -> predicted_qa
    --    Legacy `category` is a clean 8-value taxonomy (Margins, Deposits, ...),
    --    so it is safe to seed category_l1 with it.
    -- -------------------------------------------------------------------------
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'predicted_questions'
    ) THEN
        INSERT INTO predicted_qa (
            id, company, predicted_question, suggested_answer,
            category, category_l1, risk, fiscal_year, quarter, created_at
        )
        SELECT
            pq.id,
            c.name,
            pq.question_text,
            pq.suggested_answer,
            pq.category,
            pq.category,
            pq.risk,
            ec.fiscal_year,
            ec.quarter,
            pq.created_at
        FROM predicted_questions pq
        JOIN earnings_calls ec ON ec.id = pq.earnings_call_id
        JOIN companies      c  ON c.id  = ec.company_id
        WHERE pq.question_text IS NOT NULL
        ON CONFLICT (id) DO NOTHING;

        GET DIAGNOSTICS n_pred = ROW_COUNT;
        RAISE NOTICE 'predicted_qa: % row(s) inserted from predicted_questions.', n_pred;
    END IF;

    -- -------------------------------------------------------------------------
    -- 2. actual_questions -> actual_earnings_qa
    --    category_l1 is deliberately left NULL: the legacy `category` here is
    --    free text with 67 distinct values, and seeding category_l1 with it
    --    would produce 67 bogus L1 buckets in the Prediction vs Actual
    --    breakdown. The UI already falls back to `category` when category_l1 is
    --    null (PredictionVsActual.tsx themeOf()), so no information is lost.
    --    question_topics / answer_summary / key_points have no column in the
    --    current schema; they stay in the legacy table and in backups/.
    -- -------------------------------------------------------------------------
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'actual_questions'
    ) THEN
        INSERT INTO actual_earnings_qa (
            id, company, fiscal_year, quarter, period_label,
            question, answer, answered_by, category, created_at
        )
        SELECT
            aq.id,
            c.name,
            ec.fiscal_year,
            ec.quarter,
            ec.quarter || ' FY' || right(ec.fiscal_year::text, 2),
            aq.question_text,
            aq.answer_text,
            aq.answered_by,
            aq.category,
            aq.created_at
        FROM actual_questions aq
        JOIN earnings_calls ec ON ec.id = aq.earnings_call_id
        JOIN companies      c  ON c.id  = ec.company_id
        WHERE aq.question_text IS NOT NULL
        ON CONFLICT (id) DO NOTHING;

        GET DIAGNOSTICS n_act = ROW_COUNT;
        RAISE NOTICE 'actual_earnings_qa: % row(s) inserted from actual_questions.', n_act;
    END IF;

    -- -------------------------------------------------------------------------
    -- 3. predicted_vs_actual_comparisons -> the prediction<->actual links
    --    Preserves the existing matched pairs and their similarity scores.
    --    Legacy IDs are carried over verbatim above, so these FKs line up.
    --    Only fills rows that are still unlinked.
    --
    --    The legacy table is many-to-many (one actual question may have several
    --    competing comparison rows) while actual_earnings_qa.predicted_qa_id
    --    holds a single link. DISTINCT ON keeps the HIGHEST-similarity match per
    --    actual question so the choice is deterministic rather than
    --    whichever row the join happened to reach first. Any lower-scoring
    --    alternates stay in predicted_vs_actual_comparisons, which is untouched.
    -- -------------------------------------------------------------------------
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'predicted_vs_actual_comparisons'
    ) THEN
        UPDATE actual_earnings_qa a
        SET predicted_qa_id  = cmp.predicted_question_id,
            similarity_score = cmp.similarity_score,
            -- feedback is an enum (feedback_type); cast before concatenating
            match_reason     = 'Migrated from legacy comparison (' || COALESCE(cmp.feedback::text, 'n/a') || ')'
        FROM (
            SELECT DISTINCT ON (c.actual_question_id)
                   c.actual_question_id,
                   c.predicted_question_id,
                   c.similarity_score,
                   c.feedback
            FROM predicted_vs_actual_comparisons c
            WHERE c.actual_question_id IS NOT NULL
              AND c.predicted_question_id IS NOT NULL
            ORDER BY c.actual_question_id,
                     c.similarity_score DESC NULLS LAST,
                     c.predicted_question_id
        ) cmp
        WHERE cmp.actual_question_id = a.id
          AND a.predicted_qa_id IS NULL
          AND EXISTS (SELECT 1 FROM predicted_qa p WHERE p.id = cmp.predicted_question_id);

        GET DIAGNOSTICS n_link = ROW_COUNT;
        RAISE NOTICE 'actual_earnings_qa: % prediction link(s) restored.', n_link;
    END IF;
END
$do$;
