-- The predict rung for `booleans`, the earliest genuine gap in the path.
--
-- booleans sits at Values #4. A learner reaches it fourth, has a lesson for it,
-- and had no playable content at either rung it declares.
--
-- IT DECLARES recognise AND predict. Nothing else. No produce, no apply -- and
-- none is invented here to make the table look full. Its objective is "say
-- where a true or a false came from", which is recognition and reasoning, not
-- writing. Recognition now lives in the lesson, where recognition lives for
-- every other concept that has it; this seed is the predict half.
--
-- GRAMMAR, AND AN INCONSISTENCY WORTH KNOWING ABOUT.
--
-- These questions use `>` and `<`. That looks like a prerequisite violation --
-- comparison-operators is a concept in Operators, two topics later -- and it is
-- worth being precise about why it is not.
--
-- The booleans LESSON already teaches comparison, deliberately and explicitly:
-- "A comparison is a question, and the answer it hands back is a boolean." It
-- has to, because a learner at Values #4 has met no other way to produce one,
-- and the concept's whole objective is where booleans come from. So a learner
-- arriving at these questions has been taught exactly this, minutes earlier.
--
-- What is genuinely wrong is the CURRICULUM's record of it: booleans requires
-- primitive-types and nothing else, so nothing says its teaching depends on
-- comparison. That is a real gap and it is reported rather than patched here,
-- because changing a prerequisite edge is a curriculum decision.
--
-- Nothing else appears: no arrays, functions, objects, methods, loops, or
-- equality. Comparison and literals, which is precisely the lesson's grammar.

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
    VALUES (p_prompt, curriculum_difficulty(p_concept, p_demand), 'values',
            'predict-output', v_challenge, 'jolt-booleans-predict')
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

-- A comparison hands back the ANSWER, never one of the things compared. The
-- distractors are the two numbers, because reaching for one of them is the
-- mistake this is checking for.
SELECT seed_practice(
    E'What does this log?\n\nconsole.log(10 > 4);',
    'booleans', 'predict', 'true', ARRAY['false', '10', '4']);

SELECT seed_practice(
    E'What does this log?\n\nconsole.log(3 > 8);',
    'booleans', 'predict', 'false', ARRAY['true', '3', '8']);

-- Equal values are not greater. The near-miss a beginner makes most.
SELECT seed_practice(
    E'What does this log?\n\nconsole.log(6 > 6);',
    'booleans', 'predict', 'false',
    ARRAY['true', '6', 'nothing']);

-- A boolean written down directly, with no comparison anywhere. The point of
-- the concept: true and false are VALUES, and they can simply be stated.
SELECT seed_practice(
    E'What does this log?\n\nconsole.log(false);',
    'booleans', 'predict', 'false',
    ARRAY['true', '"false"', 'nothing']);

-- The quoted-word trap, which is the recognition idea returning as prediction.
-- A learner who read the recognition step will have this one.
SELECT seed_practice(
    E'What does this log?\n\nconsole.log("false");',
    'booleans', 'predict', 'false',
    ARRAY['true', 'a quoted word is not a boolean', 'nothing']);

DROP FUNCTION seed_practice(TEXT, TEXT, TEXT, TEXT, TEXT[]);
DROP FUNCTION curriculum_difficulty(TEXT, TEXT);

COMMIT;
