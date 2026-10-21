-- Completing Scope: fifteen question rungs across five concepts.
--
-- Seventh topic built to the Values template. The sixteenth rung,
-- closures / produce, is a code-writing movement registered by 048.
--
-- THIS TOPIC NEEDED THE INTERPRETER CHANGED FIRST, which none of the previous
-- six did. littleJs held one flat table of variables for the whole program and
-- was therefore wrong about every single thing Scope teaches: a `let` leaked
-- out of its block, an inner `let x` was "already declared" rather than a
-- second variable, and a function could read the locals of WHOEVER CALLED IT.
-- That last one is dynamic scope, and no amount of content can teach closures
-- on top of it. The interpreter now holds a chain of scopes and each function
-- value holds the scope it was written in.
--
-- EVERY SNIPPET BELOW HAS BEEN RUN. The claimed output is the output.
--
-- ALLOWED KNOWLEDGE is everything through Functions. No arrays, objects,
-- classes or async -- which is why `loop-variable-capture` is written with a
-- single captured function rather than the usual array of them.
--
-- THE DISTINCTION THE TOPIC KEEPS RETURNING TO: a variable's lifetime is
-- decided by where it is WRITTEN, not by where it is used from.

BEGIN;

CREATE OR REPLACE FUNCTION seed_scope(
    p_ref TEXT, p_concept TEXT, p_demand TEXT, p_prompt TEXT,
    p_correct TEXT, p_wrong TEXT[], p_why TEXT
)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_question BIGINT; v_challenge BIGINT; v_wrong TEXT; v_order INT := 1; v_type TEXT;
BEGIN
    /*
     * IDENTITY FIRST, WORDING SECOND.
     *
     * p_ref is this question's name: authored once, never derived from its
     * content, and never edited afterwards. It is namespaced by `source`, and
     * questions_external_ref_idx -- UNIQUE on (source, external_ref) -- is what
     * actually enforces one row per name. The guard below is the fast path, not
     * the protection.
     *
     * THE DEFECT THIS REPLACES. This used to read `WHERE prompt = p_prompt`.
     * Five later seeds rewrite prompts -- 059 and 060 reorder the blocks, 029
     * rewrites wording outright -- so the stored text stopped matching the
     * authored text, the guard stopped matching anything, and EVERY subsequent
     * `npm run seed` inserted another copy. 41 questions had reached three
     * copies each. A name cannot drift that way; wording can.
     */
    SELECT id INTO v_question
    FROM questions
    WHERE source = 'jolt-scope-completion' AND external_ref = p_ref;

    IF v_question IS NOT NULL THEN RETURN; END IF;

    /*
     * ADOPTION, for rows seeded before names existed. They carry the right
     * content and no name, so the first run after this change gives them one
     * rather than inserting beside them. Restricted to rows that have no name
     * yet, so it can never steal a question that already belongs to another.
     */
    SELECT id INTO v_question
    FROM questions
    WHERE prompt = p_prompt AND source = 'jolt-scope-completion' AND external_ref IS NULL
    ORDER BY id  -- the oldest copy: the one learners have answered
    LIMIT 1;

    IF v_question IS NOT NULL THEN
        UPDATE questions SET external_ref = p_ref WHERE id = v_question;
        RETURN;
    END IF;

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
        (prompt, difficulty, topic, challenge_type, challenge_id, source, explanation, external_ref)
    VALUES (p_prompt, 3, 'scope', v_type, v_challenge, 'jolt-scope-completion', p_why, p_ref)
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

/* ── 1 · block-vs-function-scope ────────────────────────────────────────── */

SELECT seed_scope(
    'block-vs-function-scope-recognise-01',
    'block-vs-function-scope', 'recognise',
    E'Which names can still be read on the last line?\n\nlet a = 1;\nif (true) {\n  let b = 2;\n  var c = 3;\n}\nconsole.log(a);',
    'a and c', ARRAY['a, b and c', 'a only', 'b and c'],
    'A `let` belongs to the braces it was written in, so `b` ended at the `}`. `var` ignores braces entirely and is still there. `a` was never inside the block at all.');

SELECT seed_scope(
    'block-vs-function-scope-predict-01',
    'block-vs-function-scope', 'predict',
    E'What does this log?\n\nlet a = 1;\n{\n  let b = 2;\n}\nconsole.log(b);',
    'an error', ARRAY['2', 'undefined', 'nothing'],
    'The braces are `b`''s whole lifetime. By the last line there is no `b` to read, and reaching for a name that does not exist is an error rather than a quiet `undefined`.');

SELECT seed_scope(
    'block-vs-function-scope-explain-01',
    'block-vs-function-scope', 'explain',
    E'Why does a `let` written inside `{ }` disappear at the closing brace?',
    'The block is the variable''s whole lifetime — it begins when the block runs and ends when the block does',
    ARRAY['Because the braces hide it from the lines above them',
          'Because `let` may only be read once after it is set',
          'Because a variable is removed as soon as it has been used'],
    'The mechanism is the block itself. Braces do not hide a variable, they BOUND it: the name comes into being on the way in and is gone on the way out, which is why the same name can be used again safely in the next block.');

/* ── 2 · hoisting-tdz ───────────────────────────────────────────────────── */

SELECT seed_scope(
    'hoisting-tdz-predict-01',
    'hoisting-tdz', 'predict',
    E'What does this log?\n\nconsole.log(n);\nvar n = 5;',
    'undefined', ARRAY['5', 'an error', 'nothing'],
    'A `var` name exists from the top of its function, holding nothing. The line `var n = 5;` is really two things happening at different times: the name arrives early, the value arrives when that line runs.');

SELECT seed_scope(
    'hoisting-tdz-diagnose-01',
    'hoisting-tdz', 'diagnose',
    E'This should print 5 and fails instead. Which line is the cause?\n\nconsole.log(n);\nlet n = 5;',
    'console.log(n);',
    ARRAY['let n = 5;', 'nothing — it works', 'both lines equally'],
    'With `let`, the name is spoken for from the top of the block but cannot be read until its own line has run — the temporal dead zone. The declaration is fine; reading it early is not. Moving the log below it fixes this.');

SELECT seed_scope(
    'hoisting-tdz-explain-01',
    'hoisting-tdz', 'explain',
    E'Why does `var n` give `undefined` before its line while `let n` gives an error?',
    'Both names exist from the start; `var` already holds `undefined`, and `let` refuses to be read until its line runs',
    ARRAY['Because `let` is not hoisted and `var` is',
          'Because `undefined` is simply what any unset variable holds',
          'Because `var` is older and JavaScript is more forgiving about it'],
    'Worth being exact: `let` IS hoisted. The name is reserved from the top of the block, which is why it does not fall through to an outer variable of the same name. What it does not have is a value, and reading it then is an error rather than a guess.');

/* ── 3 · shadowing ──────────────────────────────────────────────────────── */

SELECT seed_scope(
    'shadowing-predict-01',
    'shadowing', 'predict',
    E'What does this log?\n\nlet name = "outer";\nfunction f() {\n  let name = "inner";\n  console.log(name);\n}\nf();\nconsole.log(name);',
    'inner then outer', ARRAY['inner then inner', 'outer then outer', 'an error'],
    'Two separate variables that happen to share a word. Inside `f` the inner one is the only `name` in reach; once `f` has finished, so has it, and the outer one is untouched. It was never a reassignment.');

SELECT seed_scope(
    'shadowing-diagnose-01',
    'shadowing', 'diagnose',
    E'This should add 1 to the running total and fails instead. Which line is the cause?\n\nlet total = 0;\nfunction bump() {\n  let total = total + 1;\n}\nbump();',
    'let total = total + 1;',
    ARRAY['let total = 0;', 'bump();', 'function bump() {'],
    'That `let` declares a NEW `total` for the whole function, so the `total` on the right of the `=` is the new one — which has no value yet. Dropping the `let` makes the line use the outer variable, which is what was meant.');

/* ── 4 · closures ───────────────────────────────────────────────────────── */

SELECT seed_scope(
    'closures-predict-01',
    'closures', 'predict',
    E'What does this log?\n\nfunction makeCounter() {\n  let n = 0;\n  return () => {\n    n = n + 1;\n    return n;\n  };\n}\nconst next = makeCounter();\nconsole.log(next());\nconsole.log(next());',
    '1 then 2', ARRAY['1 then 1', '0 then 1', 'an error'],
    '`makeCounter` has finished, and `n` has not. The returned function kept the variable itself rather than a copy of its value, so each call carries on from where the last one left it.');

SELECT seed_scope(
    'closures-diagnose-01',
    'closures', 'diagnose',
    E'Each counter should count on its own, and they share one total. Which line is the cause?\n\nlet n = 0;\nfunction makeCounter() {\n  return () => {\n    n = n + 1;\n    return n;\n  };\n}\nconst a = makeCounter();\nconst b = makeCounter();\nconsole.log(a());\nconsole.log(b());',
    'let n = 0;',
    ARRAY['return () => {', 'const b = makeCounter();', 'console.log(b());'],
    'There is only one `n`, because it was written outside the factory — so both functions captured the same variable and this prints 1 then 2. Moving `let n = 0;` inside `makeCounter` gives every call its own.');

SELECT seed_scope(
    'closures-explain-01',
    'closures', 'explain',
    E'Why can a function still read a variable after the function that created it has finished?',
    'It captured the variable itself, not a copy of its value, and a captured variable outlives the call',
    ARRAY['Because the outer function keeps running quietly in the background',
          'Because the value was copied into the inner function when it was made',
          'Because `return` keeps the outer function''s variables alive for one more call'],
    'The mechanism is where the function was WRITTEN. A function value carries the scope it appeared in, so the variables beside it stay reachable through it — a copy would not, which is why a counter can keep counting.');

/* ── 5 · loop-variable-capture ──────────────────────────────────────────── */

SELECT seed_scope(
    'loop-variable-capture-predict-01',
    'loop-variable-capture', 'predict',
    E'What does this log?\n\nlet show = 0;\nfor (var i = 0; i < 3; i = i + 1) {\n  if (i === 0) {\n    show = () => i;\n  }\n}\nconsole.log(show());',
    '3', ARRAY['0', '1', 'an error'],
    '`var` gives the whole loop a single `i`. The function was made on the first pass but did not RUN until after the loop, and by then that one `i` had been counted up to 3.');

SELECT seed_scope(
    'loop-variable-capture-diagnose-01',
    'loop-variable-capture', 'diagnose',
    E'This should print 0 and prints 3 instead. Which line is the cause?\n\nlet show = 0;\nfor (var i = 0; i < 3; i = i + 1) {\n  if (i === 0) {\n    show = () => i;\n  }\n}\nconsole.log(show());',
    'for (var i = 0; i < 3; i = i + 1) {',
    ARRAY['show = () => i;', 'console.log(show());', 'if (i === 0) {'],
    'The loop head is where the single shared `i` is created. Everything below it is correct and would behave as intended the moment each pass has an `i` of its own.');

SELECT seed_scope(
    'loop-variable-capture-repair-01',
    'loop-variable-capture', 'repair',
    E'This prints 3 and should print 0. Which change fixes it?\n\nlet show = 0;\nfor (var i = 0; i < 3; i = i + 1) {\n  if (i === 0) {\n    show = () => i;\n  }\n}\nconsole.log(show());',
    'Change `var i` to `let i`',
    ARRAY['Change `show = () => i;` to `show = i;`',
          'Move the `if` outside the loop',
          'Start the loop at 1 instead of 0'],
    'One word. `let` gives every pass its own `i`, so the function made on the first pass keeps that pass''s 0. Storing `show = i;` would record the number but leave nothing to call.');

SELECT seed_scope(
    'loop-variable-capture-explain-01',
    'loop-variable-capture', 'explain',
    E'Why does swapping `var` for `let` change what a function made inside the loop sees?',
    'Each pass gets its own binding with `let`, so the function captured that pass''s value; `var` has one binding for the whole loop',
    ARRAY['Because `let` copies the value into the function as it is created',
          'Because `let` stops the loop variable from changing',
          'Because a `var` is reassigned once more after the loop ends'],
    'The difference is how MANY variables there are, not how they are read. Three passes with `let` means three separate `i`s, each captured by whatever was written on that pass. With `var` there was only ever one for all three to share.');

DROP FUNCTION seed_scope(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT);

COMMIT;
