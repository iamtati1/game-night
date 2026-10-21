-- Practice for `primitive-types`, which seed 029 left empty.
--
-- Its only practice was `console.log(typeof "5", typeof 5)`, which is a typeof
-- question -- typeof comes AFTER primitive-types, so the concept's single
-- exercise required the concept that follows it. Seed 029 moved it to `typeof`,
-- where it belongs, and that correctly left this concept with nothing.
--
-- WHAT CAN BE ASKED HERE. At Values #4 the learner has met console.log,
-- arithmetic, and the idea that an expression produces one value. No variables,
-- no booleans, no comparison, no typeof, and no coercion -- so a question may
-- not turn on `"3" + 4` or on comparing types, both of which are later ideas.
--
-- That leaves two honest angles, and both are used:
--
--   recognition  -- tell a number from text that looks like a number, which is
--                   the concept's own objective: name what kind of thing a
--                   value is.
--   prediction   -- JavaScript has ONE number type. A learner arriving from
--                   almost any other language expects 7 / 2 to be 3, and the
--                   fact that it is 3.5 is a fact about the type, not about
--                   division.

BEGIN;

CREATE OR REPLACE FUNCTION seed_pt(
    p_ref TEXT, p_prompt TEXT, p_demand TEXT, p_correct TEXT, p_wrong TEXT[], p_why TEXT
)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_question BIGINT; v_challenge BIGINT; v_wrong TEXT; v_order INT := 1;
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
    WHERE source = 'jolt-primitive-types' AND external_ref = p_ref;

    IF v_question IS NOT NULL THEN RETURN; END IF;

    -- ADOPTION for rows seeded before names existed: give the existing row the
    -- name rather than inserting beside it. Only rows with no name yet, so this
    -- can never take a question that already belongs to another.
    SELECT id INTO v_question
    FROM questions
    WHERE prompt = p_prompt AND source = 'jolt-primitive-types' AND external_ref IS NULL
    ORDER BY id  -- the oldest copy: the one learners have answered
    LIMIT 1;

    IF v_question IS NOT NULL THEN
        UPDATE questions SET external_ref = p_ref WHERE id = v_question;
        RETURN;
    END IF;

    INSERT INTO challenges (concept_id, demand_id, role, difficulty)
    SELECT c.id, d.id, 'practise', 1
    FROM concepts c, demands d
    WHERE c.slug = 'primitive-types' AND d.slug = p_demand
    RETURNING id INTO v_challenge;

    INSERT INTO questions
        (prompt, difficulty, topic, challenge_type, challenge_id, source, explanation, external_ref)
    VALUES (p_prompt, 1, 'values',
            CASE WHEN p_demand = 'recognise' THEN 'match-concept' ELSE 'predict-output' END,
            v_challenge, 'jolt-primitive-types', p_why, p_ref)
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

SELECT seed_pt(
    'primitive-001',
    E'Which of these is a number?', 'recognise',
    '7', ARRAY['"7"', '"seven"', '"7.5"'],
    'Quotes make a value text, whatever is inside them. `7` is the number; `"7"` is the character 7 written down, which is a different kind of thing.');

SELECT seed_pt(
    'primitive-002',
    E'What does this log?\n\nconsole.log(7 / 2);', 'predict',
    '3.5', ARRAY['3', '4', '3.0'],
    'JavaScript has only one number type and it holds decimals, so division does not round. Languages that separate whole numbers from decimals would give 3 here.');

DROP FUNCTION seed_pt(TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT);

COMMIT;
