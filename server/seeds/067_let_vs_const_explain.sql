-- The last gap in the first thirteen topics: `let-vs-const` declared `explain`
-- and had nothing at it. Open since Variables was completed.
--
-- WRITTEN FOR WHERE IT SITS, which is Variables #7. The usual way to show that
-- `const` does not freeze a value is an array or an object being changed
-- through a const name -- and both are topics away. A learner here has met
-- values, declaration, assignment and reassignment, and nothing else.
--
-- So the mechanism is stated at the level the learner can actually check: the
-- name is what const fixes. That is true, it is the whole reason the error
-- happens, and it is what the later topics build on when they show that the
-- CONTENTS were never protected.

BEGIN;

CREATE OR REPLACE FUNCTION seed_lvc()
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_question BIGINT; v_challenge BIGINT; v_prompt TEXT;
BEGIN
    v_prompt := 'Why does `const total = 10; total = total + 1;` fail, when the same lines with `let` do not?';

    -- Named, so a later rewrite of the wording cannot make this insert again.
    -- See the identity note in 033_operators_completion.sql.
    SELECT id INTO v_question
    FROM questions
    WHERE source = 'jolt-variables-completion' AND external_ref = 'let-vs-const-explain-01';

    IF v_question IS NOT NULL THEN RETURN; END IF;

    SELECT id INTO v_question
    FROM questions
    WHERE prompt = v_prompt AND source = 'jolt-variables-completion' AND external_ref IS NULL
    ORDER BY id  -- the oldest copy: the one learners have answered
    LIMIT 1;

    IF v_question IS NOT NULL THEN
        UPDATE questions SET external_ref = 'let-vs-const-explain-01' WHERE id = v_question;
        RETURN;
    END IF;

    INSERT INTO challenges (concept_id, demand_id, role, difficulty)
    SELECT c.id, d.id, 'practise', 2
    FROM concepts c, demands d
    WHERE c.slug = 'let-vs-const' AND d.slug = 'explain'
    RETURNING id INTO v_challenge;

    INSERT INTO questions
        (prompt, difficulty, topic, challenge_type, challenge_id, source, explanation,
         external_ref)
    VALUES (v_prompt, 2, 'variables', 'match-concept', v_challenge, 'jolt-variables-completion',
            '`const` guards the NAME, not the value. `total + 1` works out a new number, and the line then tries to point `total` at it — which is the one thing const refuses. `let` allows the name to be pointed somewhere new, so the same two lines are fine.',
            'let-vs-const-explain-01')
    RETURNING id INTO v_question;

    INSERT INTO question_options (question_id, option_text, display_order, is_correct) VALUES
        (v_question, 'the name is fixed to one value, so pointing it elsewhere fails', 1, TRUE),
        (v_question, 'const values are kept somewhere in memory that cannot be written', 2, FALSE),
        (v_question, 'the number 10 is a constant and cannot take part in arithmetic', 3, FALSE),
        (v_question, 'const allows a value to be read only once after it is set', 4, FALSE);
END;
$$;

SELECT seed_lvc();
DROP FUNCTION seed_lvc();

COMMIT;
