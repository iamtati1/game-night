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
    p_prompt TEXT, p_concept TEXT, p_demand TEXT, p_correct TEXT, p_wrong TEXT[]
)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_question BIGINT; v_challenge BIGINT; v_wrong TEXT; v_order INT := 1;
BEGIN
    SELECT id INTO v_question FROM questions WHERE prompt = p_prompt;
    IF v_question IS NOT NULL THEN RETURN; END IF;

    INSERT INTO challenges (concept_id, demand_id, role, difficulty)
    SELECT c.id, d.id, 'practise', curriculum_difficulty(p_concept, p_demand)
    FROM concepts c, demands d
    WHERE c.slug = p_concept AND d.slug = p_demand
    RETURNING id INTO v_challenge;

    INSERT INTO questions (prompt, difficulty, topic, challenge_type, challenge_id, source)
    VALUES (p_prompt, curriculum_difficulty(p_concept, p_demand), 'variables',
            'predict-output', v_challenge, 'jolt-variables-predict')
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
    E'What does this log?\n\nlet ship = "Aurora";\nconsole.log(ship);',
    'variables-name-values', 'predict', 'Aurora', ARRAY['ship', '"Aurora"', 'nothing']);

SELECT seed_practice(
    E'What does this log?\n\nlet port = "Mars";\nlet home = port;\nconsole.log(home);',
    'variables-name-values', 'predict', 'Mars', ARRAY['port', 'home', '"Mars"']);

SELECT seed_practice(
    E'What does this log?\n\nlet bays = 4;\nconsole.log("Bays: " + bays);',
    'variables-name-values', 'predict', 'Bays: 4', ARRAY['Bays: bays', 'Bays: + 4', '"Bays: 4"']);

-- ── declaration · predict ───────────────────────────────────────────────
--
-- "bring a name into existence before giving it a value". Order of lines is
-- the whole idea: a name does not exist before the line that makes it.

SELECT seed_practice(
    E'What does this log?\n\nlet cargo = 12;\nlet cargo2 = cargo;\nconsole.log(cargo2);',
    'declaration', 'predict', '12', ARRAY['cargo', 'cargo2', '0']);

SELECT seed_practice(
    E'What does this log?\n\nlet a = 3;\nlet b = 4;\nconsole.log(a * b);',
    'declaration', 'predict', '12', ARRAY['34', 'a * b', '7']);

SELECT seed_practice(
    E'What does this log?\n\nlet first = "Nova";\nlet second = "Drift";\nconsole.log(first + " " + second);',
    'declaration', 'predict', 'Nova Drift', ARRAY['NovaDrift', 'first second', '"Nova Drift"']);

-- ── let-vs-const · predict ──────────────────────────────────────────────
--
-- "choose between let and const and know what const actually protects".
-- Predicting here means knowing which programs finish and which stop.

SELECT seed_practice(
    E'What does this log?\n\nconst crew = 5;\nconsole.log(crew);',
    'let-vs-const', 'predict', '5', ARRAY['crew', 'an error', 'nothing']);

SELECT seed_practice(
    E'What happens when this runs?\n\nconst crew = 5;\ncrew = 6;\nconsole.log(crew);',
    'let-vs-const', 'predict', 'It stops with an error',
    ARRAY['It prints 6', 'It prints 5', 'It prints both 5 and 6']);

SELECT seed_practice(
    E'What does this log?\n\nlet crew = 5;\ncrew = 6;\nconsole.log(crew);',
    'let-vs-const', 'predict', '6', ARRAY['5', '11', 'an error']);

-- ── variable-state · predict ────────────────────────────────────────────
--
-- "track several variables at once through a block of code". Two names moving
-- independently, which is the first time order really bites.

SELECT seed_practice(
    E'What does this log?\n\nlet fuel = 100;\nlet spare = 40;\nfuel = 60;\nconsole.log(fuel + spare);',
    'variable-state', 'predict', '100', ARRAY['140', '160', '60']);

SELECT seed_practice(
    E'What does this log?\n\nlet a = 2;\nlet b = a;\na = 9;\nconsole.log(b);',
    'variable-state', 'predict', '2', ARRAY['9', '11', 'a']);

SELECT seed_practice(
    E'What does this log?\n\nlet total = 10;\nlet bonus = 5;\ntotal = total + bonus;\nbonus = 0;\nconsole.log(total);',
    'variable-state', 'predict', '15', ARRAY['10', '5', '0']);

DROP FUNCTION seed_practice(TEXT, TEXT, TEXT, TEXT, TEXT[]);
DROP FUNCTION curriculum_difficulty(TEXT, TEXT);

COMMIT;
