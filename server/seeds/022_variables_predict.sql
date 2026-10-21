-- The predict rung, for the four Variables concepts that had none.
--
-- SECOND AUDIT, AFTER GUIDED PRACTICE LANDED. Variables declares 21
-- (concept, demand) pairs. Playable before this seed:
--
--     predict    initialization 1 · assignment 2 · reading-variables 3 · reassignment 3
--     produce    declaration · initialization · assignment · variable-state   (practice)
--     apply      reading-variables · reassignment                            (practice)
--     diagnose   assignment 2 · reading-variables 3 · reassignment 1 · let-vs-const 1
--
-- Missing: `predict` at variables-name-values, declaration, let-vs-const and
-- variable-state. Those four concepts could be learned, practised and in two
-- cases debugged -- but never predicted, which is the rung Code Blitz exists
-- for and the one a learner meets most often.
--
-- TWO RUNGS ARE DELIBERATELY LEFT EMPTY, and the audit is the reason:
--
--   recognise  Already taught. Fourteen recognition steps live inside the
--              lessons -- "In this line, what is the name?" -- covering eight
--              of the ten concepts that declare it. A lesson records one
--              rungless demonstration so the curriculum cannot see them, but
--              the learner is not missing the teaching. Authoring recognition
--              questions here would duplicate the lesson.
--
--   explain    let-vs-const declares it and no activity in Jolt does
--              explanation. That needs an interaction that does not exist,
--              not content.
--
-- PREREQUISITE SAFETY. Every snippet uses only let/const, string and number
-- literals, + - *, names, and console.log. No arrays, functions, objects,
-- comparison, conditionals or methods. A learner on variables-name-values has
-- met exactly one topic.
--
-- DISTRACTORS ARE MISCONCEPTIONS, not noise: that the name prints rather than
-- the value, that reassignment adds rather than replaces, that const merely
-- suggests.

BEGIN;

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

CREATE OR REPLACE FUNCTION seed_practice(
    p_ref TEXT, p_prompt TEXT, p_concept TEXT, p_demand TEXT, p_correct TEXT, p_wrong TEXT[]
)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_question BIGINT; v_challenge BIGINT; v_wrong TEXT; v_order INT := 1;
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
    WHERE source = 'jolt-variables-predict' AND external_ref = p_ref;

    IF v_question IS NOT NULL THEN RETURN; END IF;

    -- ADOPTION for rows seeded before names existed: give the existing row the
    -- name rather than inserting beside it. Only rows with no name yet, so this
    -- can never take a question that already belongs to another.
    SELECT id INTO v_question
    FROM questions
    WHERE prompt = p_prompt AND source = 'jolt-variables-predict' AND external_ref IS NULL
    ORDER BY id  -- the oldest copy: the one learners have answered
    LIMIT 1;

    IF v_question IS NOT NULL THEN
        UPDATE questions SET external_ref = p_ref WHERE id = v_question;
        RETURN;
    END IF;

    INSERT INTO challenges (concept_id, demand_id, role, difficulty)
    SELECT c.id, d.id, 'practise', curriculum_difficulty(p_concept, p_demand)
    FROM concepts c, demands d
    WHERE c.slug = p_concept AND d.slug = p_demand
    RETURNING id INTO v_challenge;

    INSERT INTO questions (prompt, difficulty, topic, challenge_type, challenge_id, source, external_ref)
    VALUES (p_prompt, curriculum_difficulty(p_concept, p_demand), 'variables',
            'predict-output', v_challenge, 'jolt-variables-predict', p_ref)
    RETURNING id INTO v_question;

    INSERT INTO question_options (question_id, option_text, display_order, is_correct)
    VALUES (v_question, p_correct, v_order, TRUE);

    FOREACH v_wrong IN ARRAY p_wrong LOOP
        v_order := v_order + 1;
        INSERT INTO question_options (question_id, option_text, display_order, is_correct)
        VALUES (v_question, v_wrong, v_order, FALSE);
    END LOOP;
END;
$$;

-- ── variables-name-values · predict ─────────────────────────────────────
--
-- "say what a name refers to at a given line". The name and the value are two
-- different things, and these ask which one comes out.

SELECT seed_practice(
    'vars-predict-001',
    E'What does this log?\n\nlet ship = "Aurora";\nconsole.log(ship);',
    'variables-name-values', 'predict', 'Aurora', ARRAY['ship', '"Aurora"', 'nothing']);

SELECT seed_practice(
    'vars-predict-002',
    E'What does this log?\n\nlet port = "Mars";\nlet home = port;\nconsole.log(home);',
    'variables-name-values', 'predict', 'Mars', ARRAY['port', 'home', '"Mars"']);

-- Content as 029 rewrote it, so a re-run and a database seeded earlier agree.
SELECT seed_practice(
    'vars-predict-003',
    E'What does this log?\n\nlet bays = 4;\nconsole.log(bays);',
    'variables-name-values', 'predict', '4', ARRAY['bays', '"4"', 'nothing']);

-- ── declaration · predict ───────────────────────────────────────────────
--
-- "bring a name into existence before giving it a value". Order of lines is
-- the whole idea: a name does not exist before the line that makes it.

SELECT seed_practice(
    'vars-predict-004',
    E'What does this log?\n\nlet cargo = 12;\nlet cargo2 = cargo;\nconsole.log(cargo2);',
    'declaration', 'predict', '12', ARRAY['cargo', 'cargo2', '0']);

-- Content as 029 rewrote it, so a re-run and a database seeded earlier agree.
SELECT seed_practice(
    'vars-predict-005',
    E'What does this log?\n\nlet ship = "Aurora";\nlet backup = ship;\nconsole.log(backup);',
    'declaration', 'predict', 'Aurora', ARRAY['ship', 'backup', '"Aurora"']);

-- Content as 029 rewrote it, so a re-run and a database seeded earlier agree.
SELECT seed_practice(
    'vars-predict-006',
    E'What does this log?\n\nlet crew = 4;\nlet spare = 2;\nconsole.log(crew);',
    'declaration', 'predict', '4', ARRAY['2', '6', 'crew']);

-- ── let-vs-const · predict ──────────────────────────────────────────────
--
-- "choose between let and const and know what const actually protects".
-- Predicting here means knowing which programs finish and which stop.

-- Content as 029 rewrote it, so a re-run and a database seeded earlier agree.
SELECT seed_practice(
    'vars-predict-007',
    E'What happens when this runs?\n\nconst total = 10;\ntotal = total + 1;\nconsole.log(total);',
    'let-vs-const', 'predict', 'It stops with an error', ARRAY['It prints 11', 'It prints 10', 'It prints both']);

SELECT seed_practice(
    'vars-predict-008',
    E'What happens when this runs?\n\nconst crew = 5;\ncrew = 6;\nconsole.log(crew);',
    'let-vs-const', 'predict', 'It stops with an error',
    ARRAY['It prints 6', 'It prints 5', 'It prints both 5 and 6']);

-- Content as 029 rewrote it, so a re-run and a database seeded earlier agree.
SELECT seed_practice(
    'vars-predict-009',
    E'What does this log?\n\nlet seats = 4;\nconst rows = 2;\nseats = 6;\nconsole.log(seats);',
    'let-vs-const', 'predict', '6', ARRAY['4', 'an error', '2']);

-- ── variable-state · predict ────────────────────────────────────────────
--
-- "track several variables at once through a block of code". Two names moving
-- independently, which is the first time order really bites.

SELECT seed_practice(
    'vars-predict-010',
    E'What does this log?\n\nlet fuel = 100;\nlet spare = 40;\nfuel = 60;\nconsole.log(fuel + spare);',
    'variable-state', 'predict', '100', ARRAY['140', '160', '60']);

SELECT seed_practice(
    'vars-predict-011',
    E'What does this log?\n\nlet a = 2;\nlet b = a;\na = 9;\nconsole.log(b);',
    'variable-state', 'predict', '2', ARRAY['9', '11', 'a']);

SELECT seed_practice(
    'vars-predict-012',
    E'What does this log?\n\nlet total = 10;\nlet bonus = 5;\ntotal = total + bonus;\nbonus = 0;\nconsole.log(total);',
    'variable-state', 'predict', '15', ARRAY['10', '5', '0']);

DROP FUNCTION seed_practice(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]);
DROP FUNCTION curriculum_difficulty(TEXT, TEXT);

COMMIT;
