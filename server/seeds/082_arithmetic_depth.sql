-- Depth for `arithmetic-operators`, after precedence moved out.
--
-- WHY THIS IS REQUIRED AND NOT OPTIONAL, in the same sense seed 028 was.
--
-- 081 moved five questions to operator-precedence, where the rule they turn on
-- is taught. Four of them were arithmetic-operators' predict rung and the fifth
-- was its only explain question -- which left the concept with two predictions
-- (10 / 4 and 7 - 10) and left a beginner's first Code Blitz short. Measured on
-- the seeded fixture, a learner who has met console-output and
-- arithmetic-operators had:
--
--     before 081:  10 candidates, tiers {1, 2}
--     after  081:   9 candidates, tiers {1}
--
-- QUESTIONS_PER_SESSION is 10, so the round could no longer be filled, and
-- difficultyCurve had a single tier to deal from, so it opened and closed flat.
-- Both are guarded -- journey.test.ts "still gets a full ten-question game" and
-- beginnerPacing.test.ts "opens on the gentlest tier and climbs above it" --
-- and both failed on the move rather than on anything authored here.
--
-- The climb those tests used to see was built out of the precedence questions:
-- q312 was the only tier 2 in reach, and it asked a beginner to explain a rule
-- no lesson had taught. Restoring the shape with content the concept actually
-- teaches is the fix; putting the precedence questions back would not be.
--
-- ALLOWED KNOWLEDGE at Values #3, unchanged from seed 028: console.log, number
-- literals, and the idea that an expression produces a value. One operator per
-- expression -- a second operator is operator-precedence's subject now, not
-- this concept's. No variables, no comparison, no booleans, no concatenation.
--
-- WHAT MAKES ONE OF THESE TIER 2. Not a harder idea -- the idea is the same
-- single operation. Tier 2 here means the answer has to be WORKED OUT rather
-- than recalled: 6 * 7 is a times-table fact a learner reads off, 100 / 8 and
-- 25 * 4 are small calculations. That is the distinction seed 080 drew when it
-- re-tiered this bank by cognitive demand, applied to new rows.
--
-- The distractors are the mistakes themselves: adding instead of multiplying,
-- reading the digits as text joined together, and rounding a division that
-- keeps its decimal.
--
-- Convergent on the prompt, exactly as 028 is, so re-running changes nothing.

BEGIN;

CREATE OR REPLACE FUNCTION seed_arith_depth(
    p_ref TEXT, p_prompt TEXT, p_tier SMALLINT, p_correct TEXT, p_wrong TEXT[], p_why TEXT
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
    WHERE source = 'jolt-arithmetic-depth' AND external_ref = p_ref;

    IF v_question IS NOT NULL THEN RETURN; END IF;

    -- ADOPTION for rows seeded before names existed: give the existing row the
    -- name rather than inserting beside it. Only rows with no name yet, so this
    -- can never take a question that already belongs to another.
    SELECT id INTO v_question
    FROM questions
    WHERE prompt = p_prompt AND source = 'jolt-arithmetic-depth' AND external_ref IS NULL
    ORDER BY id  -- the oldest copy: the one learners have answered
    LIMIT 1;

    IF v_question IS NOT NULL THEN
        UPDATE questions SET external_ref = p_ref WHERE id = v_question;
        RETURN;
    END IF;

    -- One question per challenge (questions_challenge_id_idx), so each row
    -- needs its own. `difficulty` on challenges is f(tier, demand) and uniform
    -- within a rung; the pacing tier lives on the question, as seed 080 has it.
    INSERT INTO challenges (concept_id, demand_id, role, difficulty)
    SELECT c.id, d.id, 'practise', 1
    FROM concepts c, demands d
    WHERE c.slug = 'arithmetic-operators' AND d.slug = 'predict'
    RETURNING id INTO v_challenge;

    INSERT INTO questions
        (prompt, difficulty, topic, challenge_type, challenge_id, source, explanation, external_ref)
    VALUES (p_prompt, p_tier, 'values', 'predict-output', v_challenge,
            'jolt-arithmetic-depth', p_why, p_ref)
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

SELECT seed_arith_depth(
    'arith-depth-001',
    E'What does this log?\n\nconsole.log(6 * 7);', 1::SMALLINT,
    '42', ARRAY['13', '67', '42.0'],
    'One multiplication, one value. 13 would be 6 + 7, and 67 would be the two digits written next to each other rather than multiplied.');

SELECT seed_arith_depth(
    'arith-depth-002',
    E'What does this log?\n\nconsole.log(100 / 8);', 2::SMALLINT,
    '12.5', ARRAY['12', '13', '12.8'],
    'JavaScript does not round division. Eight goes into 100 twelve times with 4 left over, and that remainder is half of 8 -- so the answer keeps its decimal and is 12.5.');

SELECT seed_arith_depth(
    'arith-depth-003',
    E'What does this log?\n\nconsole.log(25 * 4);', 2::SMALLINT,
    '100', ARRAY['29', '254', '1000'],
    'Twenty-five taken four times is 100. 29 would be 25 + 4, and 254 would be the digits joined rather than multiplied.');

DROP FUNCTION seed_arith_depth(TEXT, TEXT, SMALLINT, TEXT, TEXT[], TEXT);

COMMIT;
