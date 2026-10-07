-- Completing Values: the last ten (concept, demand) pairs.
--
-- Values is the first topic a learner walks and the wall they hit was
-- `null-vs-undefined`, which declared three rungs and had nothing at any of
-- them. Progression correctly refused to let it be demonstrated, which made the
-- whole topic unfinishable. This seed makes every declared rung in Values
-- playable, so the topic can be walked end to end with no database grants.
--
-- RECALL AND EXPLAIN ARE NOT NEW MECHANICS. They were reported as having "no
-- renderer anywhere", which was wrong: findExercise is demand-agnostic and
-- Exercise.code is nullable, so a question with no snippet renders today. What
-- they lacked was content. Each is written to what the demand actually asks:
--
--   recall   "Retrieve what something does from memory, with no instance in
--            front of you."  -> no code shown. The learner is not reading, they
--            are remembering.
--
--   explain  "Give the mechanism, not the outcome."  -> the distractors are all
--            TRUE statements about the outcome. Only one says why it happens.
--            A learner who has memorised what happens still gets it wrong.
--
-- ALLOWED KNOWLEDGE is checked per concept, at its position:
--   #1 console-output           console.log and literals
--   #2 arithmetic-operators     + arithmetic
--   #3 expressions-produce-...  + the idea that an expression collapses
--   #5 booleans                 + true/false
--   #6 comparison-operators     + comparison
--   #7 typeof                   + typeof
--   #8 null-vs-undefined        + null/undefined, and typeof from #7
-- No `let` anywhere: Variables is the next topic, not this one.

BEGIN;

CREATE OR REPLACE FUNCTION seed_values(
    p_concept TEXT, p_demand TEXT, p_prompt TEXT,
    p_correct TEXT, p_wrong TEXT[], p_why TEXT
)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_question BIGINT; v_challenge BIGINT; v_wrong TEXT; v_order INT := 1; v_type TEXT;
BEGIN
    SELECT id INTO v_question FROM questions WHERE prompt = p_prompt;
    IF v_question IS NOT NULL THEN RETURN; END IF;

    v_type := CASE WHEN p_demand IN ('recognise', 'recall', 'explain')
                   THEN 'match-concept' ELSE 'predict-output' END;

    INSERT INTO challenges (concept_id, demand_id, role, difficulty)
    SELECT c.id, d.id, 'practise', 1
    FROM concepts c, demands d
    WHERE c.slug = p_concept AND d.slug = p_demand
    RETURNING id INTO v_challenge;

    INSERT INTO questions
        (prompt, difficulty, topic, challenge_type, challenge_id, source, explanation)
    VALUES (p_prompt, 1, 'values', v_type, v_challenge, 'jolt-values-completion', p_why)
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

-- 1 · console-output / recognise
SELECT seed_values('console-output', 'recognise',
    E'Which line displays something?',
    'console.log("Ready");', ARRAY['"Ready";', 'console.log;', 'Ready'],
    'Displaying takes both parts: `console.log` names the action, and the brackets carry the thing to display. Text on its own is a value nobody asked to be shown.');

-- 2 · arithmetic-operators / explain  (mechanism, not outcome)
SELECT seed_values('arithmetic-operators', 'explain',
    E'Why does console.log(2 + 3 * 4) display 14?',
    'Multiplication is worked out before addition, so 3 * 4 becomes 12 first',
    ARRAY['Because 14 is the correct total of those three numbers',
          'Because console.log reads the numbers from right to left',
          'Because addition is always worked out last in JavaScript'],
    'The order operators are applied in is the mechanism. Multiplication binds tighter than addition, so the expression becomes 2 + 12 before anything is added. It is not that addition goes last -- with 2 + 3 + 4 there is no multiplication to go first.');

-- 3 · expressions-produce-values / recognise
SELECT seed_values('expressions-produce-values', 'recognise',
    E'Which of these produces a value?',
    '6 / 2', ARRAY['console.log', 'the brackets', 'the semicolon'],
    'An expression is code that turns into a single value. `6 / 2` turns into 3. `console.log` is an action, and brackets and semicolons are punctuation that shape the code rather than values in their own right.');

-- 4 · expressions-produce-values / explain
SELECT seed_values('expressions-produce-values', 'explain',
    E'Why does console.log(5 + 5) display 10 rather than 5 + 5?',
    'The expression is replaced by the value it produces before console.log runs',
    ARRAY['Because console.log adds up any numbers it is given',
          'Because JavaScript never displays mathematical symbols',
          'Because 10 is shorter to display than 5 + 5'],
    'Order is the mechanism: the expression is worked out first, so by the time console.log runs there is nothing left but the value 10. console.log does no arithmetic of its own -- give it `"5 + 5"` in quotes and it displays exactly that.');

-- 5 · booleans / recognise
SELECT seed_values('booleans', 'recognise',
    E'Which of these is a boolean?',
    'false', ARRAY['"false"', '0', 'nothing'],
    'There are exactly two booleans, `true` and `false`, and neither is written with quotes. `"false"` is text that spells the word, and 0 is a number -- a different kind of value that people often confuse with false.');

-- 6 · comparison-operators / recognise
SELECT seed_values('comparison-operators', 'recognise',
    E'Which part of this line produced a boolean?\n\nconsole.log(8 > 2);',
    '8 > 2', ARRAY['console.log', '8', '2'],
    'The comparison is what produces the answer; console.log only displays it. Neither number is the answer -- they are the things being compared.');

-- 7 · typeof / recall  (no code: remembered, not read)
SELECT seed_values('typeof', 'recall',
    E'What does typeof report for a piece of text?',
    '"string"', ARRAY['"text"', '"char"', '"word"'],
    'JavaScript calls text a string, and typeof answers with that name as a piece of text itself. The name comes from a string of characters joined together.');

-- 8 · null-vs-undefined / recognise
SELECT seed_values('null-vs-undefined', 'recognise',
    E'Which value does JavaScript produce on its own when nothing was supplied?',
    'undefined', ARRAY['null', '0', '"empty"'],
    'undefined is what JavaScript reaches for by itself. null is the opposite case: it only ever appears because somebody wrote it down, which is why it means a deliberate emptiness.');

-- 9 · null-vs-undefined / predict -- ADOPTED, not written.
--
-- The legacy bank already held `console.log(typeof null)` with the right answer,
-- good distractors and an explanation. Writing a second copy would leave two
-- questions asking the same thing, one of them untagged and reachable by
-- accident. Attaching the existing one instead fills the rung and removes a
-- legacy question from the untagged pool in the same move.
--
-- Two things are corrected on the way in: its `topic` said 'variables', and its
-- explanation recommended `value === null`, which is Operators #3 -- a forward
-- dependency in the one place a confused learner is reading most carefully.
INSERT INTO challenges (concept_id, demand_id, role, difficulty)
SELECT c.id, d.id, 'practise', 1
FROM concepts c, demands d
WHERE c.slug = 'null-vs-undefined' AND d.slug = 'predict'
  AND NOT EXISTS (
      SELECT 1 FROM challenges ch
      WHERE ch.concept_id = c.id AND ch.demand_id = d.id AND ch.role = 'practise');

UPDATE questions q
SET challenge_id = ch.id,
    topic = 'values',
    explanation = 'JavaScript''s most famous mistake, kept on purpose. null is not an object, but typeof has answered "object" for it since 1995, and correcting it now would break too much existing code. undefined reports its own name; null does not.'
FROM challenges ch, concepts c, demands d
WHERE ch.concept_id = c.id AND ch.demand_id = d.id
  AND c.slug = 'null-vs-undefined' AND d.slug = 'predict' AND ch.role = 'practise'
  AND q.prompt = E'What does this log?\n\nconsole.log(typeof null);'
  AND q.challenge_id IS NULL;

-- 10 · null-vs-undefined / explain
SELECT seed_values('null-vs-undefined', 'explain',
    E'Why are null and undefined not interchangeable?',
    'undefined records that no value was supplied; null records that emptiness was chosen',
    ARRAY['Because null is older than undefined',
          'Because only one of them can be displayed',
          'Because they report the same type as each other'],
    'The difference is where each one came from, not what it looks like. undefined is an absence JavaScript noticed; null is an absence a programmer decided on. They also report different types, which is a consequence of the difference rather than the reason for it.');

DROP FUNCTION seed_values(TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT);

COMMIT;
