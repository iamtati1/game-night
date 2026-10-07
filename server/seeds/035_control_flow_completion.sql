-- Completing Control Flow: eleven question rungs across five concepts.
--
-- Third topic built to the Values template. The two remaining rungs --
-- `compound-conditions / produce` and `ternary / produce` -- are code-writing
-- movements registered by seed 036, because choosing an option cannot
-- demonstrate writing a condition.
--
-- `guard-clauses` IS NOT HERE. It declared "leave a function early instead of
-- nesting the happy path", which needs a function -- three topics away. It
-- moved to Functions, directly after `return-values`, rather than being taught
-- with syntax the learner has not met. See curriculum.ts.
--
-- ALLOWED KNOWLEDGE at Control Flow is Values + Variables + Operators:
-- console.log, literals, arithmetic, comparison, booleans, typeof, null and
-- undefined, let/const, assignment, reassignment, compound assignment, logical
-- operators, truthiness, and from this topic itself if/else and the ternary.
-- No functions, arrays, objects, loops or string methods.
--
-- `littleJs` gained booleans, comparison, logical operators, if/else and the
-- ternary for this topic, so every snippet below is code the learner could
-- paste into the editor and run.

BEGIN;

CREATE OR REPLACE FUNCTION seed_cf(
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
    SELECT c.id, d.id, 'practise',
           CASE WHEN d.display_order >= (SELECT display_order FROM demands WHERE slug='produce')
                THEN 2 ELSE 1 END
    FROM concepts c, demands d
    WHERE c.slug = p_concept AND d.slug = p_demand
    RETURNING id INTO v_challenge;

    INSERT INTO questions
        (prompt, difficulty, topic, challenge_type, challenge_id, source, explanation)
    VALUES (p_prompt, 2, 'control-flow', v_type, v_challenge,
            'jolt-control-flow-completion', p_why)
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

/* ── 1 · if-else ────────────────────────────────────────────────────────── */

SELECT seed_cf('if-else', 'recognise',
    E'Which part decides whether the block runs?\n\nif (crew > 3) {\n  console.log("Full");\n}',
    'crew > 3', ARRAY['if', 'console.log("Full")', 'the braces'],
    'The condition is the expression inside the brackets -- it produces true or false. `if` is the instruction to ask it, and the braces hold what runs afterwards.');

SELECT seed_cf('if-else', 'predict',
    E'What does this log?\n\nlet fuel = 20;\nif (fuel > 50) {\n  console.log("Plenty");\n} else {\n  console.log("Low");\n}',
    'Low', ARRAY['Plenty', 'Plenty then Low', 'nothing'],
    '20 is not greater than 50, so the condition was false and the else block ran. Exactly one of the two blocks runs -- never both, and never neither once there is an else.');

/* ── 2 · else-if-chains ─────────────────────────────────────────────────── */

SELECT seed_cf('else-if-chains', 'predict',
    E'What does this log?\n\nlet n = 100;\nif (n > 10) {\n  console.log("big");\n} else if (n > 50) {\n  console.log("huge");\n}',
    'big', ARRAY['huge', 'big then huge', 'nothing'],
    'Both conditions are true, but a chain stops at the first match and never asks the rest. This is why the narrowest condition usually has to go first.');

SELECT seed_cf('else-if-chains', 'diagnose',
    E'This is meant to print "huge" for very large numbers, but never does.\n\nlet n = 100;\nif (n > 10) {\n  console.log("big");\n} else if (n > 50) {\n  console.log("huge");\n}\n\nWhich line is the cause?',
    'if (n > 10) {',
    ARRAY['else if (n > 50) {', 'console.log("huge");', 'let n = 100;'],
    'The fault is the ORDER, and it belongs to the first condition. `n > 10` catches everything `n > 50` would have caught, so the second branch is unreachable for any value. The second branch itself is written correctly.');

/* ── 3 · compound-conditions ────────────────────────────────────────────── */

SELECT seed_cf('compound-conditions', 'predict',
    E'What does this log?\n\nlet ready = false;\nlet fuelled = true;\nif (ready && fuelled) {\n  console.log("Go");\n} else {\n  console.log("Hold");\n}',
    'Hold', ARRAY['Go', 'true', 'nothing'],
    '`&&` needs both sides true. The left side settled it as false, so the right side was never even looked at and the else block ran.');

SELECT seed_cf('compound-conditions', 'diagnose',
    E'Launch should need BOTH checks, but it clears with only one.\n\nlet fuel = 80;\nlet crew = 1;\nif (fuel > 50 || crew > 2) {\n  console.log("Cleared");\n}\n\nWhich line is the cause?',
    'if (fuel > 50 || crew > 2) {',
    ARRAY['let fuel = 80;', 'let crew = 1;', 'console.log("Cleared");'],
    'The operator is wrong, not the values. `||` clears as soon as either side is true, so a full tank alone is enough. Requiring both means `&&`.');

/* ── 4 · nested-conditions ──────────────────────────────────────────────── */

SELECT seed_cf('nested-conditions', 'predict',
    E'What does this log?\n\nlet docked = false;\nlet fuel = 80;\nif (docked) {\n  if (fuel > 50) {\n    console.log("Launch");\n  }\n}\nconsole.log("Done");',
    'Done', ARRAY['Launch then Done', 'Launch', 'nothing'],
    '`fuel > 50` is true, but it is never asked -- the outer condition was false, so nothing inside it is reached. The last line sits outside both blocks, so it always runs.');

SELECT seed_cf('nested-conditions', 'diagnose',
    E'The refuel warning never appears, whatever the fuel level.\n\nlet docked = false;\nlet fuel = 10;\nif (docked) {\n  if (fuel < 50) {\n    console.log("Refuel");\n  }\n}\n\nWhich line is the cause?',
    'if (docked) {',
    ARRAY['if (fuel < 50) {', 'console.log("Refuel");', 'let fuel = 10;'],
    'The inner check is correct and unreachable. An outer condition that is false makes every branch inside it dead, however right those branches are -- which is the thing nesting does that a chain does not.');

SELECT seed_cf('nested-conditions', 'repair',
    E'let docked = false;\nlet fuel = 10;\nif (docked) {\n  if (fuel < 50) {\n    console.log("Refuel");\n  }\n}\n\nThe warning should appear whenever fuel is low, docked or not. Which change does that?',
    'Take the fuel check out of the docked block, so it stands on its own',
    ARRAY['Change the inner condition to fuel > 50',
          'Add an else to the inner if',
          'Set docked to true'],
    'The repair is to stop the check depending on something it does not depend on. Setting `docked` to true would fix this one run and nothing else -- the next undocked ship has the same silence. Un-nesting removes the dependency itself.');

/* ── 5 · ternary ────────────────────────────────────────────────────────── */

SELECT seed_cf('ternary', 'recognise',
    E'Which of these produces a value you could store in a variable?',
    'n > 0 ? "up" : "down"',
    ARRAY['if (n > 0) { "up" }', 'if (n > 0) { return "up" }', 'console.log(n > 0)'],
    'A ternary is an expression: it collapses to one value, so it can sit on the right of an `=`. An `if` is a statement -- it runs code and hands nothing back, so there is nothing to store.');

SELECT seed_cf('ternary', 'predict',
    E'What does this log?\n\nlet crew = 1;\nlet label = crew > 2 ? "Full" : "Short";\nconsole.log(label);',
    'Short', ARRAY['Full', 'true', 'false'],
    '1 is not greater than 2, so the value after the colon was chosen. The condition produces true or false, but the ternary hands back one of the two VALUES rather than the answer to the condition.');

DROP FUNCTION seed_cf(TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT);

COMMIT;
