-- The rest of the question-bank audit: what seed 085 did not cover.
--
-- Same read-only audit as 085 (every predict question run in an isolated vm,
-- every diagnose/repair symptom re-run). No answer key was wrong. What is left
-- is questions that lean on syntax no lesson has taught yet, questions with
-- more than one defensible answer, two symptoms described wrongly, two
-- questions filed under a concept they do not test, one whose format gives the
-- answer away, and two clusters that ask the same thing in the same shape.
--
-- 1. PREREQUISITE LEAKS.
--    * #167 (assignment-operators) uses `n++`. No lesson teaches `++`; the
--      lesson uses `+=` and `-=`. Its spare distractor `"53"` was also quoted
--      text for a number variable.
--    * #73 (typeof) uses two-argument `console.log`, which no lesson shows.
--    * #277/#278 (assignment) read the variable on the right of `=` and
--      replace a value it already held -- reading-variables and reassignment,
--      concepts 5 and 6. The assignment lesson is `let x;` then `x = ...`.
--    * #281 (variables-name-values) and #283/#284 (declaration) declare one
--      variable from another before reading-variables is taught. #281 and #284
--      were also the same question with different names.
--    #167 and #73 are legacy rows: 008 finds them by prompt on every run, so
--    rewriting their prompts would make the next seed run insert the old ones
--    again. They retire, and named replacements take their rungs, as 085 did
--    for values-008/009/010. The named rows are rewritten in place: their seeds
--    find them by (source, external_ref) and stop, so nothing reverts this.
--
-- 2. MORE THAN ONE DEFENSIBLE ANSWER.
--    * #518 asked "Which line is the cause?" and never said what was intended,
--      so `run();` was as good an answer as the marked one. It now says.
--    * #429's distractor "every returns true whenever nothing could be tested"
--      is a true description of the empty-list case. It becomes a false one.
--
-- 3. SYMPTOMS DESCRIBED WRONGLY. #507/#508 said "never stops / never finishes";
--    both throw RangeError: Maximum call stack size exceeded almost at once.
--    #509, their repair sibling, said the same thing and is corrected with them.
--
-- 4. MISALIGNED.
--    * #310 asked `console.log(7 / 2)` under primitive-types: arithmetic, and
--      nothing about kinds of value.
--    * #1 asked `typeof null` under null-vs-undefined: typeof trivia, not the
--      distinction the concept teaches. Legacy, so it retires (see 1).
--
-- 5. FORMAT GIVEAWAY. #366 marked `0 then 1` correct while every distractor
--    was space-separated. The distractors use ` then ` too now.
--
-- 6. REPETITION. #292-#294 were three `>` comparisons. #292 and #293 now use
--    `<=` and `<`, keeping their answers (true, false) so no option moves;
--    #294's `6 > 6` near-miss stays. #281/#284 are covered by 1.
--
-- ALLOWED KNOWLEDGE is each concept's lesson and those before it
-- (client/src/games/lessons.ts). Values: console.log, quotes make text,
-- one-operator expressions, kinds of value, comparisons, typeof, null and
-- undefined. Variables, in order: names, declaration (`let x;` holds
-- undefined), initialization, assignment (`x = ...` into an existing name).
--
-- MATCHED NARROWLY. Named questions by (source, external_ref) AND their exact
-- old prompt, explanation or option text; legacy ones by exact prompt. On a
-- fresh build each UPDATE matches the row an earlier seed just wrote; on a
-- re-run it matches nothing. Options keep their ids, so a learner's earlier
-- choice still points at the same option. No answer flips between options.

BEGIN;

-- 1a / 4. Retire the three legacy rows. 008 leaves is_active alone on re-runs.
UPDATE questions
SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
WHERE source = 'internal'
  AND is_active
  AND prompt IN (
      E'What does this log?\n\nlet n = 5;\nn += 3;\nn++;\nconsole.log(n);',
      E'What does this log?\n\nconsole.log(typeof "5", typeof 5);',
      E'What does this log?\n\nconsole.log(typeof null);'
  );

-- 1b. Their replacements, on the same rungs (practise, predict, difficulty 1).
CREATE OR REPLACE FUNCTION seed_bank_audit(
    p_ref TEXT, p_concept TEXT, p_topic TEXT, p_prompt TEXT,
    p_correct TEXT, p_wrong TEXT[], p_why TEXT
)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_question BIGINT; v_challenge BIGINT; v_wrong TEXT; v_order INT := 1;
BEGIN
    -- Identity by name, as seeds 082 and 085: questions_external_ref_idx is
    -- UNIQUE on (source, external_ref), so a re-run finds the row and stops.
    SELECT id INTO v_question
    FROM questions
    WHERE source = 'jolt-bank-audit' AND external_ref = p_ref;

    IF v_question IS NOT NULL THEN RETURN; END IF;

    INSERT INTO challenges (concept_id, demand_id, role, difficulty)
    SELECT c.id, d.id, 'practise', 1
    FROM concepts c, demands d
    WHERE c.slug = p_concept AND d.slug = 'predict'
    RETURNING id INTO v_challenge;

    INSERT INTO questions
        (prompt, difficulty, topic, challenge_type, challenge_id, source, explanation, external_ref)
    VALUES (p_prompt, 1, p_topic, 'predict-output', v_challenge,
            'jolt-bank-audit', p_why, p_ref)
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

SELECT seed_bank_audit(
    'assignment-operators-predict-02', 'assignment-operators', 'operators',
    E'What does this log?\n\nlet fuel = 5;\nfuel += 3;\nfuel -= 1;\nconsole.log(fuel);',
    '7', ARRAY['8', '4', '1'],
    '`+=` adds to what fuel already holds and stores the result back, so fuel is 8. `-=` then takes 1 from that 8. Each line changes the value the next line sees: 4 would mean every line started again from 5, and 1 would mean they replaced the value instead of updating it.');

SELECT seed_bank_audit(
    'typeof-predict-01', 'typeof', 'values',
    E'What does this log?\n\nconsole.log(typeof "5");\nconsole.log(typeof 5);',
    E'string\nnumber', ARRAY[E'number\nnumber', E'string\nstring', E'5\n5'],
    'The quotes make the first 5 text, so typeof reports string; the second has no quotes and reports number. typeof gives the name of the type, never the value itself -- and like any text, that name is displayed without quotes.');

SELECT seed_bank_audit(
    'null-vs-undefined-predict-01', 'null-vs-undefined', 'values',
    E'What does this log?\n\nconsole.log(null);\nconsole.log(undefined);',
    E'null\nundefined', ARRAY[E'undefined\nundefined', E'null\nnull', 'nothing'],
    'null and undefined are two different values, not two spellings of one. Each displays as its own name: null because somebody wrote it on purpose, undefined because it is what JavaScript reaches for when nothing was supplied. Neither displays as a blank.');

DROP FUNCTION seed_bank_audit(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT);

-- 1c. Named Variables questions, rewritten in place.
CREATE TEMP TABLE rewrite_q (
    source TEXT, ref TEXT, old_prompt TEXT, new_prompt TEXT, new_why TEXT
) ON COMMIT DROP;
CREATE TEMP TABLE rewrite_o (source TEXT, ref TEXT, old_text TEXT, new_text TEXT) ON COMMIT DROP;

INSERT INTO rewrite_q VALUES
    -- #277 · assignment: declared, then filled -- timing, not a read of itself
    ('jolt-variables-practice', 'vars-007',
     E'What does this log?\n\nlet total = 5;\ntotal = total + 3;\nconsole.log(total);',
     E'What does this log?\n\nlet fuel;\nconsole.log(fuel);\nfuel = 8;\nconsole.log(fuel);',
     'Lines run top to bottom. When the first console.log runs, fuel has been declared but nothing has been put in it, so it holds undefined. The assignment then stores 8, and the second console.log sees that.'),
    -- #278 · assignment: the right side is worked out, then stored
    ('jolt-variables-practice', 'vars-008',
     E'What does this log?\n\nlet count = 2;\ncount = count * 3;\nconsole.log(count);',
     E'What does this log?\n\nlet crates;\ncrates = 4 * 3;\nconsole.log(crates);',
     'The right side of = is worked out first: 4 * 3 becomes 12, and only that single value is stored in crates. undefined was what it held before the assignment, not after.'),
    -- #281 · variables-name-values: a name in quotes is only text
    ('jolt-variables-predict', 'vars-predict-002',
     E'What does this log?\n\nlet port = "Mars";\nlet home = port;\nconsole.log(home);',
     E'What does this log?\n\nlet planet = "Mars";\nconsole.log("planet");\nconsole.log(planet);',
     'In quotes, planet is just text, and text is displayed exactly as written. Without quotes it is the name, and using a name fetches the value it points at: Mars.'),
    -- #283 · declaration: declared on its own holds undefined, not 0
    ('jolt-variables-predict', 'vars-predict-004',
     E'What does this log?\n\nlet cargo = 12;\nlet cargo2 = cargo;\nconsole.log(cargo2);',
     E'What does this log?\n\nlet cargo;\nlet crew = 4;\nconsole.log(cargo);\nconsole.log(crew);',
     'Both lines declare a name, but only the second puts a value in. cargo was declared with nothing, so it holds undefined -- JavaScript does not fill in 0 for you. crew was given 4.'),
    -- #284 · declaration: each name is its own; output follows the logs
    ('jolt-variables-predict', 'vars-predict-005',
     E'What does this log?\n\nlet ship = "Aurora";\nlet backup = ship;\nconsole.log(backup);',
     E'What does this log?\n\nlet dock = "Mars";\nlet shuttle = "Aurora";\nconsole.log(shuttle);\nconsole.log(dock);',
     'Each declaration brings its own name into existence with its own value, and neither affects the other. What is displayed follows the console.log lines, not the order the names were declared in.');

INSERT INTO rewrite_o VALUES
    ('jolt-variables-practice', 'vars-007', '8',  E'undefined\n8'),
    ('jolt-variables-practice', 'vars-007', '5',  E'8\n8'),
    ('jolt-variables-practice', 'vars-007', '3',  E'fuel\n8'),
    ('jolt-variables-practice', 'vars-007', '53', E'undefined\nundefined'),
    ('jolt-variables-practice', 'vars-008', '6',  '12'),
    ('jolt-variables-practice', 'vars-008', '2',  '4 * 3'),
    ('jolt-variables-practice', 'vars-008', '3',  'undefined'),
    ('jolt-variables-practice', 'vars-008', '23', '43'),
    ('jolt-variables-predict', 'vars-predict-002', 'Mars',     E'planet\nMars'),
    ('jolt-variables-predict', 'vars-predict-002', 'port',     E'Mars\nMars'),
    ('jolt-variables-predict', 'vars-predict-002', 'home',     E'planet\nplanet'),
    ('jolt-variables-predict', 'vars-predict-002', '"Mars"',   E'Mars\nplanet'),
    ('jolt-variables-predict', 'vars-predict-004', '12',       E'undefined\n4'),
    ('jolt-variables-predict', 'vars-predict-004', 'cargo',    E'cargo\ncrew'),
    ('jolt-variables-predict', 'vars-predict-004', 'cargo2',   E'4\n4'),
    ('jolt-variables-predict', 'vars-predict-004', '0',        E'0\n4'),
    ('jolt-variables-predict', 'vars-predict-005', 'Aurora',   E'Aurora\nMars'),
    ('jolt-variables-predict', 'vars-predict-005', 'ship',     E'Mars\nAurora'),
    ('jolt-variables-predict', 'vars-predict-005', 'backup',   E'shuttle\ndock'),
    ('jolt-variables-predict', 'vars-predict-005', '"Aurora"', E'Aurora\nAurora');

-- Options first, while the old prompt still marks a question as not yet done:
-- a re-run finds no old prompt, so it touches no option either.
UPDATE question_options o
SET option_text = r.new_text
FROM rewrite_o r, rewrite_q w, questions q
WHERE o.question_id = q.id
  AND q.source = r.source AND q.external_ref = r.ref
  AND w.source = r.source AND w.ref = r.ref
  AND q.prompt = w.old_prompt
  AND o.option_text = r.old_text;

UPDATE questions q
SET prompt = w.new_prompt, explanation = w.new_why, updated_at = CURRENT_TIMESTAMP
FROM rewrite_q w
WHERE q.source = w.source AND q.external_ref = w.ref
  AND q.prompt = w.old_prompt;

-- 2a. #518: say what was meant, so `run();` is not a second answer.
UPDATE questions
SET prompt = E'Calling run() is meant to print tick, and it does not. Which line is the cause?\n\nconst timer = {\n  label: "tick",\n  show() { console.log(this.label); }\n};\n\nconst run = timer.show;\nrun();',
    updated_at = CURRENT_TIMESTAMP
WHERE source = 'jolt-this-and-classes'
  AND external_ref = 'this-binding-diagnose-01'
  AND prompt = E'Which line is the cause?\n\nconst timer = {\n  label: "tick",\n  show() { console.log(this.label); }\n};\n\nconst run = timer.show;\nrun();';

-- 2b. #429: a distractor that was also true of the empty list.
UPDATE question_options o
SET option_text = 'every only checks the first item, and an empty list has none'
FROM questions q
WHERE o.question_id = q.id
  AND q.source = 'jolt-array-methods-completion'
  AND q.external_ref = 'find-some-every-explain-01'
  AND o.option_text = 'every returns true whenever nothing could be tested';

-- 3. Runaway recursion stops with a RangeError; it does not run for ever.
UPDATE questions
SET prompt = E'This is meant to count down from 3 and stop. It counts on past zero instead, until JavaScript gives up with a RangeError. Which line is the cause?\n\nfunction down(n) {\n  console.log(n);\n  return down(n - 1);\n}\ndown(3);',
    explanation = 'Nothing here is written wrongly — something is MISSING. Without a check that returns an answer instead of recursing, `n` keeps going down past zero, each call waiting on the next, until there is no room left for another and JavaScript stops with RangeError: Maximum call stack size exceeded.',
    updated_at = CURRENT_TIMESTAMP
WHERE source = 'jolt-algorithms-completion'
  AND external_ref = 'recursion-diagnose-01'
  AND prompt LIKE 'This counts down and never stops.%';

UPDATE questions
SET prompt = E'This should add 4 + 3 + 2 + 1, but it stops with a RangeError instead of printing. Which line is the cause?\n\nfunction total(n) {\n  if (n === 0) {\n    return 0;\n  }\n  return n + total(n + 1);\n}\nconsole.log(total(4));',
    updated_at = CURRENT_TIMESTAMP
WHERE source = 'jolt-algorithms-completion'
  AND external_ref = 'base-cases-diagnose-01'
  AND prompt LIKE 'This should add 4 + 3 + 2 + 1 and never finishes.%';

UPDATE questions
SET prompt = E'`total(4)` stops with a RangeError instead of returning 10. Which change fixes it?\n\nfunction total(n) {\n  if (n === 0) {\n    return 0;\n  }\n  return n + total(n + 1);\n}',
    updated_at = CURRENT_TIMESTAMP
WHERE source = 'jolt-algorithms-completion'
  AND external_ref = 'base-cases-repair-01'
  AND prompt LIKE '`total(4)` never finishes.%';

-- 4. #310: kinds of value, not division. Same answer shape as its rung.
UPDATE question_options o
SET option_text = m.new_text
FROM (VALUES ('3.5', E'true\ntrue'), ('3', E'"true"\ntrue'), ('4', E'true\nfalse'), ('3.0', E'string\nboolean'))
     AS m(old_text, new_text),
     questions q
WHERE o.question_id = q.id
  AND q.source = 'jolt-primitive-types' AND q.external_ref = 'primitive-002'
  AND q.prompt = E'What does this log?\n\nconsole.log(7 / 2);'
  AND o.option_text = m.old_text;

UPDATE questions
SET prompt = E'What does this log?\n\nconsole.log("true");\nconsole.log(true);',
    explanation = 'One is a string and one is a boolean, but console.log displays them the same way. The quotes decide what kind of value it is, and quotes are never displayed -- so the output alone cannot tell you which kind it was.',
    updated_at = CURRENT_TIMESTAMP
WHERE source = 'jolt-primitive-types' AND external_ref = 'primitive-002'
  AND prompt = E'What does this log?\n\nconsole.log(7 / 2);';

-- 5. #366: every option in the same ` then ` format as the answer.
UPDATE question_options o
SET option_text = m.new_text
FROM (VALUES ('0 1 3 4', '0 then 1 then 3 then 4'), ('0 1 2 3 4', '0 then 1 then 2 then 3 then 4'))
     AS m(old_text, new_text),
     questions q
WHERE o.question_id = q.id
  AND q.source = 'jolt-loops-completion' AND q.external_ref = 'break-continue-predict-01'
  AND o.option_text = m.old_text;

-- 6. #292/#293: the other comparison operators. Answers unchanged (true,
--    false), and the distractors are still the two numbers compared.
UPDATE questions
SET prompt = E'What does this log?\n\nconsole.log(4 <= 10);',
    explanation = 'A comparison hands back the ANSWER, never one of the values compared. `<=` asks whether 4 is smaller than or equal to 10, and it is, so the answer is true.',
    updated_at = CURRENT_TIMESTAMP
WHERE source = 'jolt-booleans-predict' AND external_ref = 'bool-001'
  AND prompt = E'What does this log?\n\nconsole.log(10 > 4);';

UPDATE questions
SET prompt = E'What does this log?\n\nconsole.log(8 < 3);',
    explanation = '`<` asks whether 8 is smaller than 3. It is not, so the comparison answers false. The answer is a boolean, not one of the numbers.',
    updated_at = CURRENT_TIMESTAMP
WHERE source = 'jolt-booleans-predict' AND external_ref = 'bool-002'
  AND prompt = E'What does this log?\n\nconsole.log(3 > 8);';

COMMIT;
