-- `expressions-produce-values` teaches the idea, not more arithmetic; and the
-- answers that contradicted the console-output lesson.
--
-- Found by a read-only audit of all 294 active questions (every predict
-- question run in an isolated vm, every diagnose/repair symptom re-run). No
-- answer key was wrong. Three kinds of problem were real, and this fixes them.
--
-- 1. EXPRESSIONS WAS ARITHMETIC DRILL. Four of the concept's nine questions
--    were one-operator sums (5 + 5, 2 * 3, 10 - 4, 7 + 3) that repeat
--    arithmetic-operators -- 10 - 4 is the expressions lesson's own teaching
--    example word for word, and 2 * 3 is its step 3 * 2 with the numbers
--    swapped. Nothing in the predict rung asked the learner to tell text from
--    an expression, though #314's explanation and #530 depend on exactly that.
--    values-008/009/010 retire; three questions on that distinction replace
--    them. values-007 (5 + 5) stays: its distractors are the named
--    misconceptions and #314/#530 build on the same sum.
--
--    ALLOWED KNOWLEDGE at Values #3, unchanged from seeds 028 and 082:
--    console.log, number literals, quotes make text, an expression produces a
--    value. One operator per expression. No variables, no brackets.
--
--    The replacements stay on the same rung (practise, predict, challenge
--    difficulty 1) the retired rows held, so the frontier and every learner's
--    evidence are untouched: retiring a question never removes the challenge or
--    the session_questions rows that cite it.
--
-- 2. QUOTED OUTPUT. The console-output and typeof lessons teach that quotes
--    are never printed. Five legacy questions marked the quoted form correct
--    (`"object"`, `"string" "number"`, ...). Every option of those five loses
--    its surrounding quotes. In #155 that would make `"Ada" "Lovelace"` read
--    the same as the answer, so that distractor becomes `first last` -- the
--    variable names, the real beginner mistake.
--
-- 3. TWO OPTIONS THAT BOTH WORK OR LOOK THE SAME.
--    * string-concatenation-predict-01 offered `NovaDrift` and `NovaDrift `
--      (trailing space): identical on screen. The spare becomes `first + second`.
--    * early-008 asked for a change that makes line 1 print true and keeps line
--      2 at 8; `Use == instead of ===` does both. It becomes a change that does
--      not: comparing `entered` with 7 directly, still text against a number.
--
-- MATCHED NARROWLY. Questions by (source, external_ref) where they have one,
-- otherwise by exact prompt; options by their question and exact old text. On
-- a fresh build each UPDATE matches the row the earlier seed just wrote; on a
-- re-run it matches nothing. Options keep their ids, so a learner's earlier
-- choice still points at the same option.

BEGIN;

-- 1a. Retire the three arithmetic repeats.
UPDATE questions
SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
WHERE source = 'jolt-values-practice'
  AND external_ref IN ('values-008', 'values-009', 'values-010')
  AND is_active;

-- 1b. Their replacements.
CREATE OR REPLACE FUNCTION seed_expr_variety(
    p_ref TEXT, p_prompt TEXT, p_tier SMALLINT, p_type TEXT, p_demand TEXT,
    p_correct TEXT, p_wrong TEXT[], p_why TEXT
)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_question BIGINT; v_challenge BIGINT; v_wrong TEXT; v_order INT := 1;
BEGIN
    -- Identity by name, as seed 082: questions_external_ref_idx is UNIQUE on
    -- (source, external_ref), so a re-run finds the row and stops.
    SELECT id INTO v_question
    FROM questions
    WHERE source = 'jolt-expressions-variety' AND external_ref = p_ref;

    IF v_question IS NOT NULL THEN RETURN; END IF;

    INSERT INTO challenges (concept_id, demand_id, role, difficulty)
    SELECT c.id, d.id, 'practise', 1
    FROM concepts c, demands d
    WHERE c.slug = 'expressions-produce-values' AND d.slug = p_demand
    RETURNING id INTO v_challenge;

    INSERT INTO questions
        (prompt, difficulty, topic, challenge_type, challenge_id, source, explanation, external_ref)
    VALUES (p_prompt, p_tier, 'values', p_type, v_challenge,
            'jolt-expressions-variety', p_why, p_ref)
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

SELECT seed_expr_variety(
    'expr-variety-001',
    E'What does this log?\n\nconsole.log("4 + 1");', 1::SMALLINT, 'predict-output', 'predict',
    '4 + 1', ARRAY['5', '"4 + 1"', '41'],
    'The quotes make this text, and text is already a value with nothing left to work out. console.log displays it exactly as written, minus the quotes -- only 4 + 1 without quotes is an expression that becomes 5.');

SELECT seed_expr_variety(
    'expr-variety-002',
    E'Which line displays 6?', 2::SMALLINT, 'predict-output', 'predict',
    'console.log(3 * 2);', ARRAY['console.log("3 * 2");', 'console.log("6 * 1");', 'console.log(3 + 2);'],
    'Only an expression without quotes is worked out before it is displayed. Both quoted lines are text and appear exactly as typed, even though the sum inside one of them would come to 6. 3 + 2 is worked out, but to 5.');

SELECT seed_expr_variety(
    'expr-variety-003',
    E'What does this log?\n\nconsole.log("3 + 3");\nconsole.log(3 + 3);\nconsole.log("6");', 2::SMALLINT, 'predict-output', 'predict',
    E'3 + 3\n6\n6', ARRAY[E'6\n6\n6', E'3 + 3\n3 + 3\n6', E'3 + 3\n6\n"6"'],
    'The quoted sum is text and is displayed as written. The unquoted one is worked out to 6 before console.log sees it. The last line is text that happens to be 6, and once displayed it looks exactly like the number -- the quotes in the code are the only clue.');

DROP FUNCTION seed_expr_variety(TEXT, TEXT, SMALLINT, TEXT, TEXT, TEXT, TEXT[], TEXT);

-- 2. Printed strings never show their quotes. Legacy rows have no external_ref;
--    each is pinned by its exact prompt and the exact quoted text.
CREATE TEMP TABLE unquote (prompt TEXT, old_text TEXT, new_text TEXT) ON COMMIT DROP;
INSERT INTO unquote VALUES
    (E'What does this log?\n\nconsole.log(typeof "5", typeof 5);', '"string" "number"', 'string number'),
    (E'What does this log?\n\nconsole.log(typeof "5", typeof 5);', '"number" "number"', 'number number'),
    (E'What does this log?\n\nconsole.log(typeof "5", typeof 5);', '"string" "string"', 'string string'),
    (E'What does this log?\n\nconsole.log(typeof "5", typeof 5);', '"String" "Number"', 'String Number'),
    (E'What does this log?\n\nconst first = "Ada";\nconst last = "Lovelace";\nconsole.log(first + " " + last);', '"Ada Lovelace"', 'Ada Lovelace'),
    (E'What does this log?\n\nconst first = "Ada";\nconst last = "Lovelace";\nconsole.log(first + " " + last);', '"AdaLovelace"', 'AdaLovelace'),
    (E'What does this log?\n\nconst first = "Ada";\nconst last = "Lovelace";\nconsole.log(first + " " + last);', '"Ada" "Lovelace"', 'first last'),
    (E'What does this log?\n\nconst first = "Ada";\nconst last = "Lovelace";\nconsole.log(first + " " + last);', '"Ada + Lovelace"', 'Ada + Lovelace');

UPDATE question_options o
SET option_text = u.new_text
FROM unquote u, questions q
WHERE o.question_id = q.id
  AND q.prompt = u.prompt
  AND q.is_active
  AND o.option_text = u.old_text;

-- The other three quoted questions, whose prompts are long, by the same rule
-- applied only to options that are a whole quoted string with no inner quote:
-- the five questions the audit named, and no others.
UPDATE question_options o
SET option_text = substr(o.option_text, 2, length(o.option_text) - 2)
FROM questions q
WHERE o.question_id = q.id
  AND q.source = 'internal'
  AND q.challenge_type = 'predict-output'
  AND q.is_active  -- retired legacy copies hold the same strings; leave them as they were
  AND o.option_text IN (
      '"object"', '"null"', '"undefined"',
      '"Hi Ada, you have 5 messages"', '"Hi Ada, you have 2 + 3 messages"',
      '"Hi ${name}, you have ${2 + 3} messages"', '"Hi Ada, you have 23 messages"',
      '"a+b-c"', '"a+b+c"', '"a-b-c"', '"abc"'
  )
  AND EXISTS (
      SELECT 1 FROM question_options k
      WHERE k.question_id = q.id AND k.is_correct
        AND k.option_text IN ('"object"', '"Hi Ada, you have 5 messages"', '"a+b-c"')
  );

-- 3. Options that both work, or look the same.
UPDATE question_options o
SET option_text = 'first + second'
FROM questions q
WHERE o.question_id = q.id
  AND q.source = 'jolt-strings-completion'
  AND q.external_ref = 'string-concatenation-predict-01'
  AND o.option_text = 'NovaDrift ';

UPDATE question_options o
SET option_text = 'Compare with the number directly: console.log(entered === 7);'
FROM questions q
WHERE o.question_id = q.id
  AND q.source = 'jolt-early-diagnostics'
  AND q.external_ref = 'early-008'
  AND o.option_text = 'Use == instead of ===';

UPDATE questions
SET explanation = 'The repair is to fix the value, not the comparison. Quoting `secret` would break the sum below into 71, and comparing `entered` with 7 directly still compares text with a number. With both sides numbers, `===` matches.',
    updated_at = CURRENT_TIMESTAMP
WHERE source = 'jolt-early-diagnostics'
  AND external_ref = 'early-008'
  AND explanation LIKE '%`==` would only hide the mismatch%';

COMMIT;
