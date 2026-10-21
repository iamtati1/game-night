-- Aligning questions with the concept and demand they claim.
--
-- A challenge is not aligned with a concept because it is tagged with it. It is
-- aligned when answering it REQUIRES the knowledge that concept represents, and
-- requires nothing the curriculum has not taught yet. Nine questions reached
-- forward to a later concept and five tested something other than what they
-- claimed.
--
-- TWO KINDS OF FIX, and the difference matters:
--
--   REWRITTEN -- the question tested the right concept but used syntax from a
--   later one to do it. The code changes; the concept stays.
--
--   MOVED -- the question was already a good question about a DIFFERENT
--   concept. `console.log(10 > 4)` is a fine comparison question and never was
--   a booleans question. Moving it is the honest fix, not a way of avoiding
--   one: where a move empties a rung, this seed authors a replacement that
--   belongs there.
--
-- Nothing aligned is touched. The reassignment, assignment, const-reassignment
-- and variable-state questions are the pattern the rest are being brought up to.

BEGIN;

/*
 * Re-points a question at the (concept, demand) it actually tests.
 *
 * SCOPED TO THE CONCEPT IT IS LEAVING, and that is not a detail. Matching on
 * prompt text alone searches the whole bank -- 275 questions, most of them
 * untagged legacy content -- and `%let a = 3;%` finds a legacy question long
 * before it finds the curriculum one. The first version of this seed did
 * exactly that and rewrote the wrong rows. Every match is now anchored to the
 * concept the question is supposed to be on.
 */
CREATE OR REPLACE FUNCTION realign(
    p_like TEXT, p_from TEXT, p_concept TEXT, p_demand TEXT, p_why TEXT
)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_question BIGINT; v_challenge BIGINT; v_diff SMALLINT;
BEGIN
    SELECT q.id INTO v_question
    FROM questions q
    JOIN challenges ch ON ch.id = q.challenge_id
    JOIN concepts c ON c.id = ch.concept_id
    WHERE q.prompt LIKE p_like AND q.is_active AND c.slug = p_from
    LIMIT 1;

    IF v_question IS NULL THEN RETURN; END IF;

    SELECT difficulty INTO v_diff FROM questions WHERE id = v_question;

    SELECT ch.id INTO v_challenge FROM challenges ch
    JOIN concepts c ON c.id = ch.concept_id JOIN demands d ON d.id = ch.demand_id
    WHERE c.slug = p_concept AND d.slug = p_demand AND ch.role = 'practise' AND ch.is_active
      AND NOT EXISTS (SELECT 1 FROM questions q2 WHERE q2.challenge_id = ch.id)
    LIMIT 1;

    IF v_challenge IS NULL THEN
        INSERT INTO challenges (concept_id, demand_id, role, difficulty)
        SELECT c.id, d.id, 'practise', COALESCE(v_diff, 1)
        FROM concepts c, demands d WHERE c.slug = p_concept AND d.slug = p_demand
        RETURNING id INTO v_challenge;
    END IF;

    UPDATE questions SET challenge_id = v_challenge, explanation = COALESCE(p_why, explanation)
    WHERE id = v_question;
END;
$$;

/* Replaces a question's code and options in place, keeping its concept. */
CREATE OR REPLACE FUNCTION rewrite(
    p_like TEXT, p_concept TEXT, p_prompt TEXT, p_correct TEXT, p_wrong TEXT[], p_why TEXT
)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_question BIGINT; v_wrong TEXT; v_order INT := 1;
BEGIN
    -- Anchored to the concept, for the reason given on realign above.
    SELECT q.id INTO v_question
    FROM questions q
    JOIN challenges ch ON ch.id = q.challenge_id
    JOIN concepts c ON c.id = ch.concept_id
    WHERE q.prompt LIKE p_like AND q.is_active AND c.slug = p_concept
    LIMIT 1;

    IF v_question IS NULL THEN RETURN; END IF;

    /*
     * ALREADY REWRITTEN. Nothing below changes a row that is already in the
     * shape this seed wants, so the work is skipped rather than redone -- and
     * redoing it is not merely wasteful, it is refused.
     *
     * session_questions.selected_option_fk is ON DELETE RESTRICT, so the DELETE
     * below is rejected the moment any learner has answered this question. On a
     * database with play history that aborted 029 and every seed after it:
     *
     *   seed FAILED: 029_alignment_fixes.sql
     *   update or delete on table "question_options" violates RESTRICT setting
     *   of foreign key constraint "session_questions_selected_option_fk"
     *
     * A fresh database has no answers and never saw it, which is why the test
     * fixture did not. The README promises `npm run seed` is safe to re-run;
     * this is what makes that true once somebody has actually played.
     *
     * Matched on the prompt and the correct option together: the prompt alone
     * would skip a question whose code was right and whose options were not.
     */
    IF EXISTS (
        SELECT 1 FROM questions q
        WHERE q.id = v_question
          AND q.prompt = p_prompt
          AND EXISTS (
              SELECT 1 FROM question_options o
              WHERE o.question_id = q.id AND o.is_correct AND o.option_text = p_correct
          )
    ) THEN
        RETURN;
    END IF;

    UPDATE questions SET prompt = p_prompt, explanation = p_why WHERE id = v_question;
    DELETE FROM question_options WHERE question_id = v_question;

    INSERT INTO question_options (question_id, option_text, display_order, is_correct)
    VALUES (v_question, p_correct, v_order, TRUE);

    FOREACH v_wrong IN ARRAY p_wrong LOOP
        v_order := v_order + 1;
        INSERT INTO question_options (question_id, option_text, display_order, is_correct)
        VALUES (v_question, v_wrong, v_order, FALSE);
    END LOOP;
END;
$$;

/* ---------------------------------------------------------------- MOVED */

-- `typeof "5", typeof 5` is a typeof question. It sat on primitive-types, which
-- comes first, so the only practice primitive-types had required the concept
-- that follows it.
SELECT realign('%typeof "5", typeof 5%', 'primitive-types', 'typeof', 'predict',
    'typeof reports a value''s type as a string. The quotes around 5 make it text, so the two report different types even though they look alike.');

-- Three comparison questions filed under booleans. Comparison now sits directly
-- after booleans, which is where these belong.
SELECT realign('%console.log(10 > 4)%', 'booleans', 'comparison-operators', 'predict',
    'A comparison hands back the ANSWER, never one of the values compared. 10 is bigger than 4, so the answer is true.');
SELECT realign('%console.log(3 > 8)%', 'booleans', 'comparison-operators', 'predict',
    'Three is not bigger than eight, so the comparison answers false. The answer is a boolean, not one of the numbers.');
SELECT realign('%console.log(6 > 6)%', 'booleans', 'comparison-operators', 'predict',
    'Six is equal to six, not bigger than it. `>` asks only about bigger, so this is false -- the near-miss worth remembering.');

/* ------------------------------------------------------------- REWRITTEN */

-- expressions-produce-values: kept the concept, dropped the concatenation.
SELECT rewrite('%console.log("Java" + "Script")%', 'expressions-produce-values',
    E'What does this log?\n\nconsole.log(4 + 5 - 3);', '6', ARRAY['12', '2', '453'],
    'The whole expression is worked out into one value before anything is displayed: 4 + 5 is 9, then 9 - 3 is 6.');
SELECT rewrite('%console.log("Hello" + " " + "there")%', 'expressions-produce-values',
    E'What does this log?\n\nconsole.log(2 * 2 * 2);', '8', ARRAY['6', '222', '4'],
    'Each step produces a value that the next step uses: 2 * 2 is 4, then 4 * 2 is 8. One expression, one final value.');

-- variables-name-values: the point is that a name stands for a value, which the
-- concatenation was decorating rather than testing.
SELECT rewrite('%let bays = 4%', 'variables-name-values',
    E'What does this log?\n\nlet bays = 4;\nconsole.log(bays);', '4', ARRAY['bays', '"4"', 'nothing'],
    'The name `bays` stands for the value 4. Writing the name without quotes looks up what it holds.');

-- declaration: tested multiplication, not declaration.
SELECT rewrite('%let a = 3;%', 'declaration',
    E'What does this log?\n\nlet ship = "Aurora";\nlet backup = ship;\nconsole.log(backup);',
    'Aurora', ARRAY['ship', 'backup', '"Aurora"'],
    'Declaring `backup` from `ship` gives it whatever `ship` holds at that moment. A second name can be brought into existence from a first.');
SELECT rewrite('%let first = "Nova"%', 'declaration',
    E'What does this log?\n\nlet crew = 4;\nlet spare = 2;\nconsole.log(crew);', '4', ARRAY['2', '6', 'crew'],
    'Two names were declared, each holding its own value. Logging one of them shows only that one.');

-- initialization: created WITH a value, which the concatenation obscured.
SELECT rewrite('%let crew = 3%', 'initialization',
    E'What does this log?\n\nlet crew = 3;\nconsole.log(crew);', '3', ARRAY['crew', 'undefined', 'nothing'],
    'The name was created and given 3 in the same line, so it already holds a value by the time it is logged.');

-- let-vs-const: predicting 5 required knowing nothing about const.
SELECT rewrite('%const crew = 5;
console.log(crew)%', 'let-vs-const',
    E'What happens when this runs?\n\nconst total = 10;\ntotal = total + 1;\nconsole.log(total);',
    'It stops with an error', ARRAY['It prints 11', 'It prints 10', 'It prints both'],
    'A `const` name cannot be given a different value, and that includes building the new value out of the old one. The second line fails, so nothing is printed.');

-- let-vs-const: this was a reassignment question, one concept earlier. Made
-- about the CHOICE between the two keywords instead.
SELECT rewrite('%let crew = 5;
crew = 6%', 'let-vs-const',
    E'What does this log?\n\nlet seats = 4;\nconst rows = 2;\nseats = 6;\nconsole.log(seats);',
    '6', ARRAY['4', 'an error', '2'],
    'Only `seats` was changed, and it was declared with `let`, which allows that. Declaring `rows` as `const` nearby does not stop a different name from changing.');

/* -------------------------------------------------------------- REPLACED */

-- booleans lost its three comparison questions, so it gets one that is actually
-- about boolean VALUES -- which is what the concept claims at this point in the
-- path, before comparison has been met.
--
-- Adopted first, like every seed function: a database seeded before names
-- existed holds this question unnamed, and the name guard below cannot see it.
UPDATE questions SET external_ref = 'booleans-predict-true-01'
WHERE id = (SELECT id FROM questions
            WHERE source = 'jolt-booleans-predict' AND external_ref IS NULL
              AND prompt = E'What does this log?\n\nconsole.log(true);'
            ORDER BY id LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM questions
                  WHERE source = 'jolt-booleans-predict'
                    AND external_ref = 'booleans-predict-true-01');

INSERT INTO challenges (concept_id, demand_id, role, difficulty)
SELECT c.id, d.id, 'practise', 1 FROM concepts c, demands d
WHERE c.slug = 'booleans' AND d.slug = 'predict'
  AND NOT EXISTS (
      SELECT 1 FROM challenges ch JOIN questions q ON q.challenge_id = ch.id
      WHERE ch.concept_id = c.id AND ch.demand_id = d.id
        AND q.prompt LIKE '%console.log(true);%');

-- Named, like every other seeded question, so the row is identified by what it
-- IS rather than by how it currently reads. The NOT EXISTS below guards on the
-- name; questions_external_ref_idx is what enforces it.
INSERT INTO questions (prompt, difficulty, topic, challenge_type, challenge_id, source, explanation,
                       external_ref)
SELECT E'What does this log?\n\nconsole.log(true);', 1, 'values', 'predict-output', ch.id,
       'jolt-booleans-predict',
       'true is a value in its own right, like a number or a piece of text. It is displayed without quotes because it is not text.',
       'booleans-predict-true-01'
FROM challenges ch JOIN concepts c ON c.id = ch.concept_id JOIN demands d ON d.id = ch.demand_id
WHERE c.slug = 'booleans' AND d.slug = 'predict' AND ch.role = 'practise'
  AND NOT EXISTS (SELECT 1 FROM questions q WHERE q.challenge_id = ch.id)
  AND NOT EXISTS (
      SELECT 1 FROM questions q
      WHERE q.source = 'jolt-booleans-predict' AND q.external_ref = 'booleans-predict-true-01')
LIMIT 1;

INSERT INTO question_options (question_id, option_text, display_order, is_correct)
SELECT q.id, v.t, v.o, v.c
FROM questions q,
     (VALUES ('true', 1, TRUE), ('"true"', 2, FALSE), ('1', 3, FALSE), ('nothing', 4, FALSE))
     AS v (t, o, c)
WHERE q.prompt LIKE '%console.log(true);%'
  AND NOT EXISTS (SELECT 1 FROM question_options o2 WHERE o2.question_id = q.id);

DROP FUNCTION realign(TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION rewrite(TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT);

COMMIT;
