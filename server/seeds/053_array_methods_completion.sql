-- Completing Array Methods: twenty-five question rungs across eight concepts.
--
-- Ninth topic built to the Values template, and the largest: twenty-nine
-- rungs. The remaining four -- map, filter, reduce and method-chaining, all
-- `produce` -- are code-writing movements registered by 054.
--
-- THE INTERPRETER LEARNED TO CALL A CALLBACK FOR THIS. Every method here
-- takes a function and runs it, which a table of pure transformations could
-- not do. The one decision that made it work: a callback is handed only as
-- many arguments as it declares. `map` passes the item, the index and the
-- array, ordinary calls in this language check their count exactly, and
-- `(n) => n * 2` would otherwise have failed on the first `map` anyone wrote.
--
-- ALL NINE METHODS LEFT THE REFUSED LIST AT ONCE, the way `var` left it at
-- Scope. Until this topic the interpreter answered `.map` with "not something
-- we have covered yet" -- which is what kept Arrays, the topic before, honest.
--
-- EVERY SNIPPET BELOW HAS BEEN RUN. The claimed output is the output,
-- including the three that surprise people: forEach hands back nothing, sort
-- with no comparator compares AS TEXT, and sort returns the list it mutated.
--
-- THE DISTINCTION THE TOPIC KEEPS RETURNING TO: what each method HANDS BACK,
-- because that is what decides whether you can store it, chain it, or neither.

BEGIN;

CREATE OR REPLACE FUNCTION seed_am(
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
    VALUES (p_prompt, 3, 'array-methods', v_type, v_challenge, 'jolt-array-methods-completion', p_why)
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

/* ── 1 · map ────────────────────────────────────────────────────────────── */

SELECT seed_am('map', 'recall',
    E'Which method builds a NEW list by passing every item through a function?',
    '.map()', ARRAY['.forEach()', '.filter()', '.find()'],
    '`map` gives back a new list the same length as the original, with each item replaced by whatever your function returned. `forEach` returns nothing, and `filter` keeps items rather than changing them.');

SELECT seed_am('map', 'recognise',
    E'Which one doubles every number into a new list?\n\nlet a = [1, 2, 3];',
    'a.map((n) => n * 2)',
    ARRAY['a.forEach((n) => n * 2)', 'a.filter((n) => n * 2)', 'a.map(n * 2)'],
    '`map` collects what the function returns. `forEach` throws those values away, `filter` would read them as true or false, and the last one passes a number where a function is wanted.');

SELECT seed_am('map', 'predict',
    E'What does this log?\n\nlet a = [1, 2, 3];\nlet b = a.map((n) => n * 2);\nconsole.log(a);',
    '[1, 2, 3]', ARRAY['[2, 4, 6]', '[1, 2, 3, 2, 4, 6]', 'undefined'],
    '`a` is untouched — the doubled numbers went into `b`. Building a new list rather than changing the old one is the whole habit `map` is for.');

-- NOT the forEach-instead-of-map mix-up, tempting though it is: `forEach` is
-- the NEXT concept, and a learner meeting it here would be meeting it early.
-- That confusion is covered where it belongs, at for-each's own explain rung.
SELECT seed_am('map', 'diagnose',
    E'This should hold the doubled numbers and holds [undefined, undefined, undefined].\n\nlet a = [1, 2, 3];\nlet doubled = a.map((n) => { n * 2; });\nconsole.log(doubled);\n\nWhich line is the cause?',
    'let doubled = a.map((n) => { n * 2; });',
    ARRAY['let a = [1, 2, 3];', 'console.log(doubled);', 'nothing — it works'],
    'The arrow has braces, which make a body — and a body that never says `return` gives undefined. `map` collected that answer once per item, which is why there are exactly three of them.');

SELECT seed_am('map', 'repair',
    E'let a = [1, 2, 3];\nlet doubled = a.map((n) => { n * 2; });\nconsole.log(doubled);\n\nThis prints [undefined, undefined, undefined]. Which change fixes it?',
    'Remove the braces, so the arrow returns n * 2',
    ARRAY['Change map to forEach', 'Add 0 as a second argument to map', 'Declare doubled with const'],
    'The braces made it a body, and a body with no `return` gives undefined — once per item, which is why every slot is undefined. `(n) => n * 2` returns without saying so.');

/* ── 2 · for-each ───────────────────────────────────────────────────────── */

SELECT seed_am('for-each', 'recall',
    E'Which method runs a function for every item and hands nothing back?',
    '.forEach()', ARRAY['.map()', '.filter()', '.reduce()'],
    '`forEach` is for doing something with each item — printing it, say — rather than producing a value. The other three all hand something back, which is why they can be stored or chained.');

SELECT seed_am('for-each', 'recognise',
    E'Which one prints each name on its own line?\n\nlet names = ["Tati", "Sam"];',
    'names.forEach((n) => { console.log(n); })',
    ARRAY['console.log(names);', 'names.map((n) => n);', 'names.join("-");'],
    'Printing once per item is exactly what `forEach` is for. Logging the list prints it as one line, and the other two produce a value without printing anything.');

SELECT seed_am('for-each', 'predict',
    E'What does this log?\n\nlet a = [1, 2];\nlet out = a.forEach((n) => n * 2);\nconsole.log(out);',
    'undefined', ARRAY['[2, 4]', '[1, 2]', '2'],
    'The function ran twice and its answers were discarded. `forEach` always gives `undefined`, whatever the function returns.');

SELECT seed_am('for-each', 'explain',
    E'Why can another method not be chained onto forEach?',
    'It hands back undefined, so there is nothing for the next method to be called on',
    ARRAY['Because forEach must always be the last method in a chain',
          'Because forEach changes the original list and chaining needs a copy',
          'Because forEach finishes after the rest of the chain has run'],
    'The mechanism is what chaining IS: calling the next method on the previous one''s result. `map` hands back a list, so `.map(...).filter(...)` works. `forEach` hands back undefined, and `undefined.filter` is an error.');

/* ── 3 · filter ─────────────────────────────────────────────────────────── */

SELECT seed_am('filter', 'recall',
    E'Which method keeps only the items that pass a test?',
    '.filter()', ARRAY['.map()', '.find()', '.some()'],
    '`filter` gives back a new list holding however many items passed — none, some or all. `find` gives one item, `some` gives true or false, and `map` keeps every item but changes it.');

SELECT seed_am('filter', 'predict',
    E'What does this log?\n\nlet a = [1, 2, 3, 4];\nconsole.log(a.filter((n) => n > 2));',
    '[3, 4]', ARRAY['[1, 2]', '[3]', 'true'],
    'Each item is tested and the ones that pass are collected into a new list. The result is a list even when only one item passes, which is what tells `filter` apart from `find`.');

SELECT seed_am('filter', 'diagnose',
    E'This should keep only the names longer than two letters, and keeps all three.\n\nlet names = ["Tati", "Al", "Sam"];\nlet long = names.filter((n) => n.length);\nconsole.log(long.length);\n\nWhich line is the cause?',
    'let long = names.filter((n) => n.length);',
    ARRAY['let names = ["Tati", "Al", "Sam"];', 'console.log(long.length);', 'nothing — it works'],
    'The test hands back a NUMBER, and 4, 2 and 3 are all truthy, so every name passed. `filter` asks whether the answer is truthy, not whether it is large — the test needs a comparison: `n.length > 2`.');

/* ── 4 · find-some-every ────────────────────────────────────────────────── */

SELECT seed_am('find-some-every', 'recall',
    E'Which one hands back a single item rather than a list or a yes-or-no?',
    '.find()', ARRAY['.some()', '.every()', '.filter()'],
    '`find` gives the first item that passes, or `undefined` if none do. `filter` gives a list even when one item matches, and `some` and `every` only ever give true or false.');

SELECT seed_am('find-some-every', 'predict',
    E'What does this log?\n\nlet a = [1, 2, 3];\nconsole.log(a.find((n) => n > 5));\nconsole.log(a.some((n) => n > 5));',
    'undefined then false', ARRAY['false then false', 'undefined then undefined', 'an error'],
    'Nothing passed the test. `find` has no item to give, so it gives `undefined`; `some` is asking a yes-or-no question and the answer is no.');

SELECT seed_am('find-some-every', 'explain',
    E'Why does every() hand back true for an empty list?',
    'There is no item that fails the test, and not failing is all every checks for',
    ARRAY['Because an empty list counts as holding one invisible item',
          'Because every returns true whenever nothing could be tested',
          'Because an empty list is itself truthy'],
    'The mechanism is the question being asked: "is there an item that fails?" On an empty list there is nothing to fail, so the answer is no and `every` reports true. `some` on the same list is false, for the mirror-image reason.');

/* ── 5 · reduce ─────────────────────────────────────────────────────────── */

SELECT seed_am('reduce', 'predict',
    E'What does this log?\n\nlet a = [1, 2, 3];\nconsole.log(a.reduce((total, n) => total + n, 0));',
    '6', ARRAY['[1, 2, 3]', '3', '0'],
    'The 0 is where the total starts. Each item is added to the running total, and the last total is what comes out — one value from a whole list.');

SELECT seed_am('reduce', 'diagnose',
    E'This should add up to 6 and prints 123.\n\nlet a = [1, 2, 3];\nlet total = a.reduce((sum, n) => sum + n, "");\nconsole.log(total);\n\nWhich line is the cause?',
    'let total = a.reduce((sum, n) => sum + n, "");',
    ARRAY['let a = [1, 2, 3];', 'console.log(total);', 'nothing — it works'],
    'The starting value is TEXT, so the first `+` joined instead of adding — and once the total is text, every `+` after it joins too. Starting from 0 gives 6.');

SELECT seed_am('reduce', 'explain',
    E'Why does reduce need a starting value to work on a list that might be empty?',
    'With no items to take a first value from and nothing given, there is no answer it could return',
    ARRAY['Because the starting value tells reduce how many items to expect',
          'Because an empty list would otherwise return an empty list',
          'Because the starting value is what reduce compares each item against'],
    'The mechanism is where the total begins. Given a start, reduce folds every item into it and an empty list simply gives the start back. With no start it uses the FIRST ITEM instead — and an empty list has not got one.');

/* ── 6 · sort ───────────────────────────────────────────────────────────── */

SELECT seed_am('sort', 'predict',
    E'What does this log?\n\nlet a = [10, 9, 1];\na.sort();\nconsole.log(a);',
    '[1, 10, 9]', ARRAY['[1, 9, 10]', '[10, 9, 1]', '[9, 10, 1]'],
    'With no comparator, `sort` turns each item into text and compares the text. "10" comes before "9" because the character "1" comes before "9" — which is almost never what was wanted with numbers.');

SELECT seed_am('sort', 'diagnose',
    E'This should put the scores in numerical order and does not.\n\nlet scores = [10, 9, 1];\nscores.sort();\nconsole.log(scores);\n\nWhich line is the cause?',
    'scores.sort();',
    ARRAY['let scores = [10, 9, 1];', 'console.log(scores);', 'nothing — it works'],
    'Calling `sort` with nothing inside the brackets is what asks for the text comparison. The list and the printing are both fine; what is missing is a comparator saying how two numbers should be ordered.');

SELECT seed_am('sort', 'repair',
    E'let scores = [10, 9, 1];\nscores.sort();\nconsole.log(scores);\n\nThis prints [1, 10, 9] and should print [1, 9, 10]. Which change fixes it?',
    'Pass a comparator: scores.sort((a, b) => a - b)',
    ARRAY['Call scores.sort() a second time',
          'Flatten the list first with scores.flat()',
          'Declare scores with const instead of let'],
    'A comparator tells `sort` how to order two items: negative to put the first one earlier, positive to put it later. `a - b` is exactly that for numbers. Sorting twice changes nothing — the text order is already settled.');

SELECT seed_am('sort', 'explain',
    E'Why does sorting a list change the original rather than giving back a sorted copy?',
    'sort rearranges the very list it was called on, and hands that same list back',
    ARRAY['Because a copy would lose the comparator',
          'Because sort returns a new list and the old one is thrown away',
          'Because the comparator is allowed to change the items'],
    'The mechanism is that `sort` is one of the methods that mutates. `a.sort() === a` is true — the thing returned IS the thing sorted. To keep the original, sort a copy: `[...a].sort()`.');

/* ── 7 · flat ───────────────────────────────────────────────────────────── */

SELECT seed_am('flat', 'predict',
    E'What does this log?\n\nlet a = [1, [2, [3]]];\nconsole.log(a.flat());',
    '[1, 2, [3]]', ARRAY['[1, 2, 3]', '[1, [2, [3]]]', '[1, 2]'],
    'One level came up and no more. The inner `[3]` was two levels down, so it is still a list — `a.flat(2)` would pull that one up too.');

SELECT seed_am('flat', 'explain',
    E'Why does flat() often leave some nesting behind?',
    'It lifts one level unless you tell it how many to lift',
    ARRAY['Because it stops at the first item that is not a list',
          'Because the deepest level is always kept',
          'Because it only flattens lists holding numbers'],
    'The mechanism is a depth that defaults to 1. Anything nested deeper than that is lifted one level and stays a list. `flat(2)` goes two deep, and `flat(Infinity)` goes all the way.');

/* ── 8 · method-chaining ────────────────────────────────────────────────── */

SELECT seed_am('method-chaining', 'predict',
    E'What does this log?\n\nlet a = [1, 2, 3, 4];\nconsole.log(a.filter((n) => n > 1).map((n) => n * 10));',
    '[20, 30, 40]', ARRAY['[10, 20, 30, 40]', '[20, 30]', '[2, 3, 4]'],
    '`filter` ran first and handed on `[2, 3, 4]`, and `map` worked from that rather than from the original. Each method in a chain starts where the one before it finished.');

DROP FUNCTION seed_am(TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT);

COMMIT;
