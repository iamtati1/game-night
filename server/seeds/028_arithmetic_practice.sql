-- The predict rung for `arithmetic-operators`, now Values #3.
--
-- WHY THIS IS REQUIRED AND NOT OPTIONAL. Moving arithmetic into Values fixed a
-- forward dependency -- `expressions-produce-values` needed arithmetic to show
-- that an expression collapses to a value, and arithmetic was two topics later.
-- But the move put six expression questions BEHIND a concept with no content of
-- its own, which stranded them: a learner at Values #2 could no longer be dealt
-- them, Values stopped holding enough dealable questions to fill a session, and
-- the journey ceiling rose to admit Variables. The gate that keeps a beginner
-- inside the first topic opened, which is the exact failure the reorder was
-- meant to prevent.
--
-- So this is not "more content". It is the other half of the ordering fix.
--
-- ALLOWED KNOWLEDGE at Values #3: console.log, number and string literals, and
-- the idea that code produces a value. No variables -- those are the next topic.
-- No comparison, no booleans, no concatenation. Numbers and operators only.
--
-- The distractors are the arithmetic mistakes themselves: applying operators
-- left to right regardless of precedence, rounding division, and reading a
-- subtraction that crosses zero as its absolute value.

BEGIN;

CREATE OR REPLACE FUNCTION seed_arith(
    p_ref TEXT, p_prompt TEXT, p_correct TEXT, p_wrong TEXT[], p_why TEXT
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
    WHERE source = 'jolt-arithmetic-predict' AND external_ref = p_ref;

    IF v_question IS NOT NULL THEN RETURN; END IF;

    -- ADOPTION for rows seeded before names existed: give the existing row the
    -- name rather than inserting beside it. Only rows with no name yet, so this
    -- can never take a question that already belongs to another.
    SELECT id INTO v_question
    FROM questions
    WHERE prompt = p_prompt AND source = 'jolt-arithmetic-predict' AND external_ref IS NULL
    ORDER BY id  -- the oldest copy: the one learners have answered
    LIMIT 1;

    IF v_question IS NOT NULL THEN
        UPDATE questions SET external_ref = p_ref WHERE id = v_question;
        RETURN;
    END IF;

    INSERT INTO challenges (concept_id, demand_id, role, difficulty)
    SELECT c.id, d.id, 'practise', 1
    FROM concepts c, demands d
    WHERE c.slug = 'arithmetic-operators' AND d.slug = 'predict'
    RETURNING id INTO v_challenge;

    INSERT INTO questions
        (prompt, difficulty, topic, challenge_type, challenge_id, source, explanation, external_ref)
    VALUES (p_prompt, 1, 'values', 'predict-output', v_challenge,
            'jolt-arithmetic-predict', p_why, p_ref)
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

SELECT seed_arith(
    'arith-001',
    E'What does this log?\n\nconsole.log(2 + 3 * 4);', '14', ARRAY['20', '24', '9'],
    'Multiplication happens before addition, so this is 2 + 12. Working strictly left to right would give 20, which is the mistake this is checking for.');

SELECT seed_arith(
    'arith-002',
    E'What does this log?\n\nconsole.log((2 + 3) * 4);', '20', ARRAY['14', '24', '11'],
    'Brackets go first, so 2 + 3 becomes 5 and then 5 is multiplied by 4. The brackets are what change the order.');

SELECT seed_arith(
    'arith-003',
    E'What does this log?\n\nconsole.log(10 / 4);', '2.5', ARRAY['2', '3', '2.25'],
    'JavaScript does not round division. There is one number type and it holds decimals, so the answer keeps its half.');

SELECT seed_arith(
    'arith-004',
    E'What does this log?\n\nconsole.log(7 - 10);', '-3', ARRAY['3', '17', '0'],
    'Subtraction can cross zero and keep going. The result is three below zero, not three above it.');

SELECT seed_arith(
    'arith-005',
    E'What does this log?\n\nconsole.log(6 / 2 * 3);', '9', ARRAY['1', '4', '12'],
    'Division and multiplication have the same precedence, so they are worked out left to right: 6 / 2 is 3, then 3 * 3 is 9.');

SELECT seed_arith(
    'arith-006',
    E'What does this log?\n\nconsole.log(5 + 5 - 4);', '6', ARRAY['4', '14', '-4'],
    'Addition and subtraction also run left to right: 5 + 5 is 10, then 10 - 4 is 6.');

DROP FUNCTION seed_arith(TEXT, TEXT, TEXT, TEXT[], TEXT);

COMMIT;
