-- Completing Functions: sixteen question rungs across six concepts.
--
-- Sixth topic built to the Values template. Three more rungs --
-- function-declaration / produce, guard-clauses / produce and
-- arrow-functions / produce -- are code-writing movements registered by 045.
--
-- `default-rest-params` IS NOT HERE. Its own meaning says rest gathers extra
-- arguments INTO AN ARRAY, and arrays are two topics later, so a learner would
-- meet the syntax before the thing it produces. It moved to Arrays, beside
-- `array-copy-spread` -- the same three dots in the other direction.
--
-- `guard-clauses` IS here, having arrived from Control Flow for the opposite
-- reason: leaving a function early needs a function, and now there is one.
--
-- ALLOWED KNOWLEDGE is everything through Loops. No arrays, objects, classes
-- or async. Recursion is Algorithms, nine topics later, so nothing here calls
-- itself.
--
-- THE DISTINCTION THE TOPIC KEEPS RETURNING TO: defining is not running, and a
-- name without brackets is not a call. Both are where the bugs are.

BEGIN;

CREATE OR REPLACE FUNCTION seed_fn(
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
    WHERE source = 'jolt-functions-completion' AND external_ref = p_ref;

    IF v_question IS NOT NULL THEN RETURN; END IF;

    /*
     * ADOPTION, for rows seeded before names existed. They carry the right
     * content and no name, so the first run after this change gives them one
     * rather than inserting beside them. Restricted to rows that have no name
     * yet, so it can never steal a question that already belongs to another.
     */
    SELECT id INTO v_question
    FROM questions
    WHERE prompt = p_prompt AND source = 'jolt-functions-completion' AND external_ref IS NULL
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
    VALUES (p_prompt, 3, 'functions', v_type, v_challenge, 'jolt-functions-completion', p_why, p_ref)
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

/* ── 1 · function-declaration ───────────────────────────────────────────── */

SELECT seed_fn(
    'function-declaration-recognise-01',
    'function-declaration', 'recognise',
    E'Which line runs the function?\n\nfunction greet() {\n  console.log("Hello");\n}\n\ngreet();',
    'greet();', ARRAY['function greet() {', 'console.log("Hello");', 'the closing brace'],
    'The brackets at the call are what run it. The first line defines the function, and the line inside the braces runs only when something calls it.');

SELECT seed_fn(
    'function-declaration-predict-01',
    'function-declaration', 'predict',
    E'What does this log?\n\nfunction greet() {\n  console.log("Hello");\n}',
    'nothing', ARRAY['Hello', 'an error', 'greet'],
    'Defining a function stores instructions; it does not follow them. Nothing called `greet`, so the body never ran -- which is one of the commonest reasons code seems to do nothing at all.');

/* ── 2 · parameters-arguments ───────────────────────────────────────────── */

SELECT seed_fn(
    'parameters-arguments-recognise-01',
    'parameters-arguments', 'recognise',
    E'Which one is the argument?\n\nfunction greet(name) {\n  console.log(name);\n}\n\ngreet("Tati");',
    '"Tati"', ARRAY['name', 'greet', 'console.log'],
    'The argument is the value handed over at the call. `name` is the parameter -- a name in the definition that stands for whatever is passed.');

SELECT seed_fn(
    'parameters-arguments-predict-01',
    'parameters-arguments', 'predict',
    E'What does this log?\n\nfunction f(a) {\n  a = 99;\n  return a;\n}\n\nlet a = 1;\nconsole.log(f(a));\nconsole.log(a);',
    '99 then 1', ARRAY['99 then 99', '1 then 1', '1 then 99'],
    'The parameter is its own name inside the function, so setting it to 99 changed only that. They happen to share a name here, which is exactly what makes it worth checking.');

SELECT seed_fn(
    'parameters-arguments-diagnose-01',
    'parameters-arguments', 'diagnose',
    E'This should greet by name and prints the wrong thing. Which line is the cause?\n\nfunction greet(name) {\n  console.log("Hello, name");\n}\n\ngreet("Tati");',
    'console.log("Hello, name");',
    ARRAY['function greet(name) {', 'greet("Tati");', 'nothing -- it works'],
    'The parameter ended up INSIDE the quotes, so it is printed as the letters n-a-m-e rather than looked up. The definition and the call are both right.');

/* ── 3 · return-values ──────────────────────────────────────────────────── */

SELECT seed_fn(
    'return-values-predict-01',
    'return-values', 'predict',
    E'What does this log?\n\nfunction f() {\n  let x = 1;\n}\nconsole.log(f());',
    'undefined', ARRAY['1', 'nothing', 'an error'],
    '`x` existed only inside the function and was never handed back. A function with no return gives undefined, and console.log prints that like any other value.');

SELECT seed_fn(
    'return-values-diagnose-01',
    'return-values', 'diagnose',
    E'The total is always undefined. Which line is the cause?\n\nfunction add(a, b) {\n  console.log(a + b);\n}\n\nlet total = add(2, 3);\nconsole.log(total);',
    'console.log(a + b);',
    ARRAY['function add(a, b) {', 'let total = add(2, 3);', 'console.log(total);'],
    'That line PRINTS the sum instead of returning it, so there was nothing for the call to become. Printing shows a value; returning gives it to the caller.');

SELECT seed_fn(
    'return-values-repair-01',
    'return-values', 'repair',
    E'`total` is undefined. Which change fixes it?\n\nfunction add(a, b) {\n  console.log(a + b);\n}\nlet total = add(2, 3);',
    'Change the body to return a + b;',
    ARRAY['Call add twice', 'Declare total with const instead of let', 'Move the call above the function'],
    'The repair is to hand the value back rather than display it. Nothing about the call is wrong -- it simply had nothing to collect.');

SELECT seed_fn(
    'return-values-explain-01',
    'return-values', 'explain',
    E'Why can a returned value be stored in a variable when a printed one cannot?',
    'The call is replaced by whatever was returned, so there is a value where the call was',
    ARRAY['Because console.log sends its value somewhere that cannot be read back',
          'Because printing happens after the function has finished',
          'Because a variable can only hold what a function returns'],
    'The mechanism is what the CALL turns into. `add(2, 3)` collapses to a value the way any expression does, and `return` is what decides that value. Printing happens during the call and changes nothing about it.');

/* ── 4 · guard-clauses ──────────────────────────────────────────────────── */

SELECT seed_fn(
    'guard-clauses-predict-01',
    'guard-clauses', 'predict',
    E'What does this log?\n\nfunction f(n) {\n  if (n < 0) {\n    return "neg";\n  }\n  return "pos";\n}\nconsole.log(f(-1));',
    'neg', ARRAY['pos', 'neg then pos', 'undefined'],
    'The guard fired and a return ends the function immediately, so the line below it never ran. A function returns once.');

SELECT seed_fn(
    'guard-clauses-explain-01',
    'guard-clauses', 'explain',
    E'Why does a guard clause remove the need for an else?',
    'The early return ends the function, so anything below it is already the other case',
    ARRAY['Because an if without an else is faster to run',
          'Because else may only be used once in a function',
          'Because the guard changes the condition for the rest of the function'],
    'The mechanism is leaving. Once the exceptional case has returned, the code below it can only be reached when the guard did not fire -- so wrapping it in an else would say the same thing twice.');

/* ── 5 · arrow-functions ────────────────────────────────────────────────── */

SELECT seed_fn(
    'arrow-functions-recognise-01',
    'arrow-functions', 'recognise',
    E'Which of these hands a value back?',
    'const f = (n) => n + 1;',
    ARRAY['const f = (n) => { n + 1; };', 'const f = (n) => { console.log(n + 1); };',
          'const f = (n) => ;'],
    'With no braces the expression is returned automatically. Braces make it an ordinary body, and a body that never says `return` gives undefined however right the arithmetic inside it is.');

SELECT seed_fn(
    'arrow-functions-predict-01',
    'arrow-functions', 'predict',
    E'What does this log?\n\nconst triple = (n) => { n * 3; };\nconsole.log(triple(2));',
    'undefined', ARRAY['6', 'n * 3', 'an error'],
    'The braces make this a body rather than a single expression, and nothing in it returns. Remove the braces, or add `return`, and it gives 6.');

/* ── 6 · functions-as-values ────────────────────────────────────────────── */

SELECT seed_fn(
    'functions-as-values-predict-01',
    'functions-as-values', 'predict',
    E'What does this log?\n\nfunction shout() {\n  return "HI";\n}\nconsole.log(shout);',
    'the function itself, not HI',
    ARRAY['HI', 'an error', 'undefined'],
    'There are no brackets, so nothing was called -- what is logged is the function as a value. The brackets are the whole difference between the instructions and their result.');

SELECT seed_fn(
    'functions-as-values-diagnose-01',
    'functions-as-values', 'diagnose',
    E'This should run the given function twice and fails instead. Which line is the cause?\n\nfunction twice(fn) {\n  return fn() + fn();\n}\nfunction one() {\n  return 1;\n}\nconsole.log(twice(one()));',
    'console.log(twice(one()));',
    ARRAY['return fn() + fn();', 'function one() {', 'function twice(fn) {'],
    'The call site passed the RESULT rather than the function. `one()` is the number 1, and `twice` then tries to call a number. Dropping those brackets is the fix.');

SELECT seed_fn(
    'functions-as-values-explain-01',
    'functions-as-values', 'explain',
    E'Why does passing a function let the receiving code decide when it runs?',
    'Nothing has run yet -- only the instructions were handed over',
    ARRAY['Because functions are always run last in JavaScript',
          'Because the function is copied into the other function',
          'Because a function cannot run until it has been stored somewhere'],
    'The mechanism is the missing brackets. Handing over instructions is not the same as following them, so the receiving code chooses the moment -- which is how callbacks, array methods and event handlers all work.');

DROP FUNCTION seed_fn(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT);

COMMIT;
