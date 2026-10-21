-- Flush for people who have not reached the event loop.
--
-- THE PROBLEM. All 34 Flush snippets were Async material (076 tags every one
-- to event-loop, promise-states, async-await or error-propagation), and Flush
-- dealt with no curriculum gate at all. So a learner on their first concept
-- met setTimeout(..., 0) in round one -- a rule nobody had told them yet --
-- and the game read as a guess. Playtest: "I did not understand Flush".
--
-- THE FIX IS CONTENT PLUS THE EXISTING GATE. These puzzles turn on the order
-- a program prints in for concepts taught at the start of the path, and the
-- dealer now applies the same curriculumSelects() Code Blitz and Bug Hunt use
-- (see flush/queries.ts). Each snippet is tagged to its concept's practise/
-- predict rung, so it becomes dealable exactly when that concept has been met
-- -- and the Async snippets, tagged to Async concepts, stay out of reach until
-- those are. Nothing here is a new gate; it is the old one, finally applied.
--
-- WHAT EACH ONE NEEDS. Only what its concept's lesson has shown by then. The
-- console-output lesson teaches lines printing in order, text versus numbers,
-- and that quotes are not printed -- and nothing else, so its puzzles use
-- nothing else (no two-argument console.log, which it never shows). Each
-- explanation names the rule, in the voice of 076.
--
-- DISTRACTORS are the misconception the concept exists to correct: the quoted
-- form, the expression as written, the stale value, the branch not taken, the
-- value that ends the loop. They never print.
--
-- Safe to re-run: a prompt that already exists is skipped, and tagging only
-- touches the row this file inserted.

BEGIN;

CREATE OR REPLACE FUNCTION seed_flush_taught(
    p_concept TEXT,
    p_prompt TEXT,
    p_difficulty INTEGER,
    p_outputs TEXT[],
    p_distractors TEXT[],
    p_why TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_id BIGINT;
    v_challenge BIGINT;
    v_text TEXT;
    v_pos INTEGER := 0;
BEGIN
    IF EXISTS (SELECT 1 FROM flush_snippets WHERE prompt = p_prompt) THEN
        RETURN;
    END IF;

    -- The concept's practise/predict rung. Concepts have several; the lowest id
    -- is taken so the answer does not depend on row order (teach_flush in 076
    -- took whichever came back first).
    SELECT ch.id INTO v_challenge
    FROM challenges ch
    JOIN concepts c ON c.id = ch.concept_id
    JOIN demands d  ON d.id = ch.demand_id
    WHERE c.slug = p_concept AND d.slug = 'predict'
      AND ch.role = 'practise' AND ch.is_active
    ORDER BY ch.id
    LIMIT 1;

    IF v_challenge IS NULL THEN
        RAISE EXCEPTION 'no practise/predict challenge for %', p_concept;
    END IF;

    INSERT INTO flush_snippets (prompt, difficulty, explanation, challenge_id)
    VALUES (p_prompt, p_difficulty, p_why, v_challenge)
    RETURNING id INTO v_id;

    FOREACH v_text IN ARRAY p_outputs LOOP
        v_pos := v_pos + 1;
        INSERT INTO flush_outputs (snippet_id, output_text, position)
        VALUES (v_id, v_text, v_pos);
    END LOOP;

    FOREACH v_text IN ARRAY p_distractors LOOP
        INSERT INTO flush_outputs (snippet_id, output_text, position, is_distractor)
        VALUES (v_id, v_text, NULL, TRUE);
    END LOOP;
END;
$$;

/* ── values · console-output ─────────────────────────────────────────────── */

SELECT seed_flush_taught('console-output',
    E'console.log("Ready");\nconsole.log("Set");\nconsole.log("Go");',
    1, ARRAY['Ready', 'Set', 'Go'], ARRAY[]::TEXT[],
    'Each console.log writes one line, and the lines run from top to bottom. The output comes out in the order the calls are written.');

SELECT seed_flush_taught('console-output',
    E'console.log("Hello");\nconsole.log("there");',
    1, ARRAY['Hello', 'there'], ARRAY['"Hello"'],
    'The quotes mark where the text starts and ends. They are not part of the text, so they are never displayed.');

SELECT seed_flush_taught('console-output',
    E'console.log("Lift");\nconsole.log(3);\nconsole.log("off");',
    1, ARRAY['Lift', '3', 'off'], ARRAY['"3"'],
    'A number is displayed as itself, and a piece of text without its quotes. Either way, each line prints in turn, top to bottom.');

/* ── values · arithmetic and expressions ─────────────────────────────────── */

SELECT seed_flush_taught('arithmetic-operators',
    E'console.log(2 + 3);\nconsole.log(10 - 4);',
    1, ARRAY['5', '6'], ARRAY['2 + 3'],
    'JavaScript works the sum out before anything is displayed, so each line shows the answer, never the sum as it was written.');

SELECT seed_flush_taught('expressions-produce-values',
    E'console.log(4 * 2);\nconsole.log("4 * 2");',
    1, ARRAY['8', '4 * 2'], ARRAY[]::TEXT[],
    'Without quotes, 4 * 2 is an expression and becomes the value 8. In quotes it is text, and text is displayed exactly as written.');

/* ── variables ───────────────────────────────────────────────────────────── */

SELECT seed_flush_taught('reading-variables',
    E'let fuel = 50;\nconsole.log(fuel);\nconsole.log("fuel");',
    1, ARRAY['50', 'fuel'], ARRAY[]::TEXT[],
    'A name without quotes is looked up and replaced by the value it holds. In quotes it is only the word.');

SELECT seed_flush_taught('reassignment',
    E'let lives = 3;\nconsole.log(lives);\nlives = 2;\nconsole.log(lives);',
    1, ARRAY['3', '2'], ARRAY[]::TEXT[],
    'Each console.log shows the value the name holds at that moment. The first one runs before lives changes, the second one after.');

SELECT seed_flush_taught('variable-state',
    E'let a = 1;\nlet b = a;\na = 5;\nconsole.log(a);\nconsole.log(b);',
    2, ARRAY['5', '1'], ARRAY[]::TEXT[],
    'let b = a copies the value 1 into b. Changing a afterwards gives a a new value and leaves b holding the 1 it was given.');

/* ── control flow · if / else ────────────────────────────────────────────── */

SELECT seed_flush_taught('if-else',
    E'let fuel = 3;\n\nif (fuel > 5) {\n  console.log("Launch");\n} else {\n  console.log("Refuel");\n}\n\nconsole.log("Done");',
    2, ARRAY['Refuel', 'Done'], ARRAY['Launch'],
    'fuel > 5 is false, so the else block runs and the if block is skipped entirely. The last line sits outside both, so it always runs.');

/* ── loops · reading a for loop ──────────────────────────────────────────── */

SELECT seed_flush_taught('for-loop-anatomy',
    E'for (let i = 0; i < 3; i++) {\n  console.log(i);\n}\n\nconsole.log("end");',
    2, ARRAY['0', '1', '2', 'end'], ARRAY['3'],
    'The loop runs while i < 3, so it logs 0, 1 and 2. Once i reaches 3 the condition is false, the loop stops, and the line after it runs.');

DROP FUNCTION seed_flush_taught(TEXT, TEXT, INTEGER, TEXT[], TEXT[], TEXT);

COMMIT;
