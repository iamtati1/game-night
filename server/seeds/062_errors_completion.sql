-- Completing Errors: twelve question rungs across five concepts.
--
-- Eleventh topic built to the Values template, and the smallest: twelve rungs,
-- and the only topic so far that declares NO `produce` rung. Writing a bug on
-- purpose is not a skill; recognising, predicting and repairing one is.
--
-- THE INTERPRETER LEARNED TO HAVE ERROR TYPES FOR THIS. Until now every
-- failure it raised was an untyped sentence, which made `error-types` -- "tell
-- from the name what kind of thing went wrong" -- unteachable on its own
-- engine: the game would have been naming categories it never used. Failures
-- are now TypeError, ReferenceError or RangeError the way JavaScript chooses
-- them, `throw`, `try`, `catch` and `finally` exist, and a failure carries the
-- calls that were in progress so a trace can be read.
--
-- A FAILURE THE INTERPRETER RAISES IS CATCHABLE, and arrives at `catch` as an
-- Error object with the right name -- so a learner catching a TypeError here
-- sees what they would see in a browser.
--
-- EVERY SNIPPET BELOW HAS BEEN RUN, and every trace shown is one the
-- interpreter actually produced.
--
-- THE DISTINCTION THE TOPIC KEEPS RETURNING TO: an error is information. The
-- type says what kind, the message says what, and the trace says where.

BEGIN;

CREATE OR REPLACE FUNCTION seed_err(
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
                THEN 3 ELSE 2 END
    FROM concepts c, demands d
    WHERE c.slug = p_concept AND d.slug = p_demand
    RETURNING id INTO v_challenge;

    INSERT INTO questions
        (prompt, difficulty, topic, challenge_type, challenge_id, source, explanation)
    VALUES (p_prompt, 3, 'errors', v_type, v_challenge, 'jolt-errors-completion', p_why)
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

/* ── 1 · error-types ────────────────────────────────────────────────────── */

SELECT seed_err('error-types', 'recall',
    E'Which error type means a value was used as a kind of thing it is not?',
    'TypeError', ARRAY['ReferenceError', 'RangeError', 'SyntaxError'],
    'A TypeError is about what a value IS — calling something that is not a function, or reading a property of nothing. A ReferenceError is about a NAME that does not exist at all, which is a different kind of mistake.');

SELECT seed_err('error-types', 'recognise',
    E'Which error does this cause?\n\nlet user = {};\nconsole.log(user.profile.name);',
    'TypeError', ARRAY['ReferenceError', 'RangeError', 'SyntaxError'],
    '`user.profile` is `undefined`, and reading `.name` from nothing is using a value as a kind of thing it is not. A ReferenceError would mean `user` itself had never been declared — which it was, on the line above.');

/* ── 2 · throwing ───────────────────────────────────────────────────────── */

SELECT seed_err('throwing', 'recognise',
    E'Which line refuses the bad input and stops the function?\n\nfunction withdraw(amount) {\n  // ...\n}',
    'throw new Error("Amount must be positive");',
    ARRAY['console.log("Amount must be positive");',
          'return new Error("Amount must be positive");',
          'new Error("Amount must be positive");'],
    'Throwing stops the function immediately and hands the error to whoever called it. Logging prints and carries on regardless; returning an error hands it back as an ordinary value the caller may never look at; and building one without throwing it does nothing at all.');

SELECT seed_err('throwing', 'predict',
    E'What does this log?\n\nfunction check(n) {\n  if (n < 0) {\n    throw new Error("negative");\n  }\n  return n;\n}\nconsole.log(check(5));\nconsole.log(check(-1));',
    '5, and then the program stops with an error',
    ARRAY['5 then -1', '5 then negative', 'nothing at all'],
    'The first call returned normally. The second threw, and nothing caught it, so the second `console.log` never ran and neither would anything after it.');

/* ── 3 · try-catch ──────────────────────────────────────────────────────── */

SELECT seed_err('try-catch', 'predict',
    E'What does this log?\n\ntry {\n  throw new Error("x");\n} catch (e) {\n  console.log("caught");\n} finally {\n  console.log("always");\n}\nconsole.log("after");',
    'caught, always, after', ARRAY['caught, after', 'always, caught, after', 'caught, always'],
    'The throw sent it to `catch`, `finally` ran next because it always does, and the program carried on afterwards — which is the point of catching: the failure stopped being fatal.');

SELECT seed_err('try-catch', 'explain',
    E'Why does `finally` run even when `catch` has already dealt with the error?',
    'finally is for work that has to happen either way, so it is not tied to whether anything failed',
    ARRAY['Because catch has not finished handling the error until finally runs',
          'Because finally always runs before catch',
          'Because the error is thrown again unless finally stops it'],
    'The mechanism is what each block is FOR. `try` is the risky work, `catch` is what to do if it fails, and `finally` is the tidying up — closing what you opened — which is needed whether the work succeeded or not.');

/* ── 4 · stack-traces ───────────────────────────────────────────────────── */

SELECT seed_err('stack-traces', 'recognise',
    E'A failure gives this trace. Which function was running when it failed?\n\nTypeError: cannot read .toUpperCase of undefined\n    at format\n    at render',
    'format', ARRAY['render', 'both, at the same time', 'neither — the trace shows the fix'],
    'A trace is most recent first. The top line is where execution actually was; the lines under it are the calls that were still waiting for it to come back.');

SELECT seed_err('stack-traces', 'diagnose',
    E'This fails with "cannot read .toUpperCase of undefined", and the trace is `at format` then `at render`. Which line is the cause?\n\nfunction format(u) {\n  return u.name.toUpperCase();\n}\nfunction render(u) {\n  return format(u);\n}\nrender({});',
    'return u.name.toUpperCase();',
    ARRAY['return format(u);', 'render({});', 'function format(u) {'],
    'The trace puts `format` on top, so that is the line that ran. `u.name` is undefined because the object passed in has no `name` — `render` and the call below it are in the trace because they were waiting, not because they are wrong.');

SELECT seed_err('stack-traces', 'explain',
    E'Why is the top line of a stack trace usually the most useful one?',
    'It is where execution actually was when it failed, and the lines below are calls still waiting',
    ARRAY['Because the top line is the first function the program ran',
          'Because the most recently written code is the most likely to be wrong',
          'Because the lines below it belong to the language rather than to your program'],
    'The mechanism is what a stack IS: calls pile up as they are made and come off as they finish. The top of the pile is the one that was running, so it is where to look — though the line that PUT a bad value there is often further down.');

/* ── 5 · debugging-strategy ─────────────────────────────────────────────── */

SELECT seed_err('debugging-strategy', 'diagnose',
    E'A total comes out wrong. The data is right when it goes into a long function and wrong when it comes out. What is the most useful next check?',
    'A value halfway through the function, to halve what is left to search',
    ARRAY['The data source again, to be certain',
          'Every line from the top, in order',
          'The code that displays the total'],
    'Two known points — right here, wrong there — turn the search into halving. A check in the middle removes half the remaining lines whichever answer it gives, which is why it beats reading from the top.');

SELECT seed_err('debugging-strategy', 'repair',
    E'You think the bug is in a sort comparator. Which next step actually tests that?',
    'Make one change that would behave differently if the hypothesis is right',
    ARRAY['Rewrite the comparator and the two functions around it',
          'Add logging to every function in the file',
          'Revert to the last version that worked'],
    'A hypothesis is only worth having if it can be wrong. One change means the next run answers one question; three changes means a working program tells you nothing about which of them mattered.');

SELECT seed_err('debugging-strategy', 'explain',
    E'Why is changing one thing at a time faster than changing several, even though it is more runs?',
    'Each run answers one question, so the result rules something in or out instead of leaving you guessing',
    ARRAY['Because several changes take longer to type',
          'Because JavaScript only applies the first change it finds',
          'Because the computer checks changes in the order they were made'],
    'The mechanism is information per attempt. Three changes and a working program leave you with three suspects and no way to choose; one change and a working program leaves you with an answer. More runs, fewer dead ends.');

DROP FUNCTION seed_err(TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT);

COMMIT;
