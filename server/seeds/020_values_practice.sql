-- Values practice: the beginner end of the Code Blitz bank.
--
-- WHY THIS EXISTS. The curriculum's selection layers all work. The journey gate
-- correctly holds a brand-new learner at topic_order <= 2, and the measured
-- candidate pool for a fresh account contains no functions, no async and no
-- loops. The games were still too hard for a different reason: the bank is
-- STARVED at the beginner end.
--
--     values     2 questions        <- the entire first topic
--     operators  1
--     variables  24
--     functions  36
--     async      29
--
-- journeyCte only stops expanding the ceiling once enough content sits at or
-- below it to fill a session. With three questions in reach at topic 1 and a
-- ten-question session, the ceiling HAS to open to Variables before the learner
-- has practised anything -- so a learner who has seen one lesson about
-- console.log immediately meets reassignment and scope.
--
-- Worse, both existing `values` questions are about `typeof`. The first topic
-- in the curriculum was represented entirely by runtime type inspection.
--
-- So this seed is not a tagging pass and not a difficulty edit. It stocks the
-- first topic with content that matches what the first lessons actually teach,
-- tagged to concepts and demands so the existing machinery can pace it.
--
-- THE LADDER IS THE POINT. Each concept gets an `introduce` challenge at
-- `recognise` (the Learn Beat anchor) and `practise` challenges at `predict`.
-- Difficulty is never typed in: it is derived from tier and demand by
-- curriculum_difficulty(), so a challenge cannot carry a number the curriculum
-- would not produce.
--
-- ONE CHALLENGE PER EXERCISE. Model A -- a challenge is the curriculum metadata
-- of exactly one playable item -- so every question below gets its own, and the
-- partial unique index from migration 024 keeps `introduce` to one per concept.
--
-- CONVERGENT. Every insert is anchored on the question's prompt, so re-running
-- changes nothing.

BEGIN;

-- Mirrors difficultyFor() in client/src/games/curriculum.ts, exactly as seeds
-- 015 and 016 do, and for the same reason: the value must be derived from the
-- curriculum rather than typed in. Dropped at the end, as they drop theirs.
CREATE OR REPLACE FUNCTION curriculum_difficulty(p_concept TEXT, p_demand TEXT)
RETURNS SMALLINT
LANGUAGE sql
AS $$
    SELECT (CASE WHEN d.display_order >= (SELECT display_order FROM demands WHERE slug = 'produce') THEN
        CASE t.tier WHEN 'beginner' THEN 2 WHEN 'intermediate' THEN 3 ELSE 4 END
      ELSE CASE t.tier WHEN 'beginner' THEN 1 WHEN 'intermediate' THEN 2 ELSE 3 END END)::SMALLINT
    FROM concepts c
    JOIN topics t ON t.id = c.topic_id
    CROSS JOIN demands d
    WHERE c.slug = p_concept AND d.slug = p_demand;
$$;

-- The introductions these concepts need are created by seed 019, which gives
-- one to every concept with an authored lesson. This file only adds practice.

-- ─────────────────────────────────────────────────── the practice ──
--
-- One question, one challenge, four options, one of them right.
--
-- The distractors are not noise. Each one is a misconception a beginner
-- actually holds: that the quotes are printed, that the expression itself is
-- printed rather than its value, that nothing happens at all. A wrong answer
-- the learner would never pick teaches nothing and wastes a slot.
CREATE OR REPLACE FUNCTION seed_practice(
    p_ref TEXT, p_prompt    TEXT,
    p_concept   TEXT,
    p_demand    TEXT,
    p_correct   TEXT,
    p_wrong     TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_question  BIGINT;
    v_challenge BIGINT;
    v_wrong     TEXT;
    v_order     INT := 1;
BEGIN
    -- IDENTITY FIRST, WORDING SECOND. p_ref names this question: authored
    -- once, never derived from its content, never edited afterwards, and
    -- namespaced by `source` -- questions_external_ref_idx is UNIQUE on
    -- (source, external_ref) and is what actually enforces one row per name.
    -- This replaces `WHERE prompt = p_prompt`, which five later seeds broke by
    -- rewriting stored prompts, so the guard stopped matching and every seed
    -- run inserted another copy.
    SELECT id INTO v_question
    FROM questions
    WHERE source = 'jolt-values-practice' AND external_ref = p_ref;

    -- ADOPTION for rows seeded before names existed: name the existing row
    -- rather than inserting beside it. Only rows with no name yet, so this can
    -- never take a question that already belongs to another.
    IF v_question IS NULL THEN
        SELECT id INTO v_question
        FROM questions
        WHERE prompt = p_prompt AND source = 'jolt-values-practice' AND external_ref IS NULL
        ORDER BY id  -- the oldest copy: the one learners have answered
        LIMIT 1;

        IF v_question IS NOT NULL THEN
            UPDATE questions SET external_ref = p_ref WHERE id = v_question;
        END IF;
    END IF;

    IF v_question IS NULL THEN
        INSERT INTO challenges (concept_id, demand_id, role, difficulty)
        SELECT c.id, d.id, 'practise', curriculum_difficulty(p_concept, p_demand)
        FROM concepts c, demands d
        WHERE c.slug = p_concept AND d.slug = p_demand
        RETURNING id INTO v_challenge;

        INSERT INTO questions (prompt, difficulty, topic, challenge_type, challenge_id, source, external_ref)
        VALUES (
            p_prompt,
            curriculum_difficulty(p_concept, p_demand),
            'values',
            'predict-output',
            v_challenge,
            'jolt-values-practice',
            p_ref
        )
        RETURNING id INTO v_question;

        INSERT INTO question_options (question_id, option_text, display_order, is_correct)
        VALUES (v_question, p_correct, v_order, TRUE);

        FOREACH v_wrong IN ARRAY p_wrong LOOP
            v_order := v_order + 1;
            INSERT INTO question_options (question_id, option_text, display_order, is_correct)
            VALUES (v_question, v_wrong, v_order, FALSE);
        END LOOP;
    END IF;
END;
$$;

-- ── console-output / predict ──────────────────────────────────────────
--
-- "run a snippet and say what it prints". Nothing here asks anything else.

SELECT seed_practice(
    'values-001',
    E'What does this log?\n\nconsole.log("Hello");',
    'console-output', 'predict', 'Hello',
    ARRAY['"Hello"', 'console.log("Hello")', 'nothing']
);

SELECT seed_practice(
    'values-002',
    E'What does this log?\n\nconsole.log(5);',
    'console-output', 'predict', '5',
    ARRAY['"5"', 'console.log(5)', 'nothing']
);

SELECT seed_practice(
    'values-003',
    E'What does this log?\n\nconsole.log("JavaScript");',
    'console-output', 'predict', 'JavaScript',
    ARRAY['"JavaScript"', 'javascript', 'nothing']
);

SELECT seed_practice(
    'values-004',
    E'What does this log?\n\nconsole.log("5");',
    'console-output', 'predict', '5',
    ARRAY['"5"', 'five', 'nothing']
);

SELECT seed_practice(
    'values-005',
    E'What does this log?\n\nconsole.log(42);',
    'console-output', 'predict', '42',
    ARRAY['"42"', 'console.log(42)', 'nothing']
);

SELECT seed_practice(
    'values-006',
    E'What does this log?\n\nconsole.log("hello world");',
    'console-output', 'predict', 'hello world',
    ARRAY['"hello world"', 'hello', 'helloworld']
);

-- ── expressions-produce-values / predict ─────────────────────────────
--
-- "work out the single value a piece of code collapses to". The arithmetic is
-- deliberately trivial: the idea under test is that the expression becomes one
-- value BEFORE it is printed, not whether the learner can add.

SELECT seed_practice(
    'values-007',
    E'What does this log?\n\nconsole.log(5 + 5);',
    'expressions-produce-values', 'predict', '10',
    ARRAY['5 + 5', '55', '"10"']
);

SELECT seed_practice(
    'values-008',
    E'What does this log?\n\nconsole.log(2 * 3);',
    'expressions-produce-values', 'predict', '6',
    ARRAY['2 * 3', '23', '"6"']
);

SELECT seed_practice(
    'values-009',
    E'What does this log?\n\nconsole.log(10 - 4);',
    'expressions-produce-values', 'predict', '6',
    ARRAY['10 - 4', '104', '"6"']
);

SELECT seed_practice(
    'values-010',
    E'What does this log?\n\nconsole.log(7 + 3);',
    'expressions-produce-values', 'predict', '10',
    ARRAY['7 + 3', '73', '"10"']
);

-- String concatenation, which is the same idea in the other direction: two
-- values collapse to one. Kept to plain words, with no numbers in sight, so it
-- cannot be mistaken for a coercion question.
-- Content as 029 rewrote it, so a re-run and a database seeded earlier agree.
SELECT seed_practice(
    'values-011',
    E'What does this log?\n\nconsole.log(4 + 5 - 3);',
    'expressions-produce-values', 'predict', '6',
    ARRAY['12', '2', '453']
);

-- Content as 029 rewrote it, so a re-run and a database seeded earlier agree.
SELECT seed_practice(
    'values-012',
    E'What does this log?\n\nconsole.log(2 * 2 * 2);',
    'expressions-produce-values', 'predict', '8',
    ARRAY['6', '222', '4']
);

DROP FUNCTION seed_practice(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]);
DROP FUNCTION curriculum_difficulty(TEXT, TEXT);

COMMIT;
