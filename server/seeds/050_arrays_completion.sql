-- Completing Arrays: fifteen question rungs across seven concepts.
--
-- Eighth topic built to the Values template. The remaining two rungs --
-- array-copy-spread / produce and default-rest-params / produce -- are
-- code-writing movements registered by 051.
--
-- THE INTERPRETER LEARNED ARRAYS FOR THIS, as it learned scope for the topic
-- before. littleJs had no array literal, no indexing into one, no `.length`
-- on one, no spread and no default or rest parameters. Arrays are held as
-- objects rather than copied values, which is what makes `array-mutation` and
-- `array-reference-identity` demonstrable at all: two names can hold ONE list.
--
-- `default-rest-params` IS HERE, having arrived from Functions. Rest gathers
-- extra arguments INTO AN ARRAY, so it could not be taught until there was an
-- array to gather into.
--
-- NOTHING HERE USES map, filter, reduce, forEach, find, some, every, flat OR
-- sort. All nine belong to array-methods, the next topic, and the interpreter
-- refuses them by name so that a question cannot quietly reach for one --
-- including `sort`, which `array-mutation`'s own wording names in passing.
--
-- EVERY SNIPPET BELOW HAS BEEN RUN. The claimed output is the output.
--
-- THE DISTINCTION THE TOPIC KEEPS RETURNING TO: a list is one thing that two
-- names can share, and copying it is a decision you have to make on purpose.

BEGIN;

CREATE OR REPLACE FUNCTION seed_arr(
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
    WHERE source = 'jolt-arrays-completion' AND external_ref = p_ref;

    IF v_question IS NOT NULL THEN RETURN; END IF;

    /*
     * ADOPTION, for rows seeded before names existed. They carry the right
     * content and no name, so the first run after this change gives them one
     * rather than inserting beside them. Restricted to rows that have no name
     * yet, so it can never steal a question that already belongs to another.
     */
    SELECT id INTO v_question
    FROM questions
    WHERE prompt = p_prompt AND source = 'jolt-arrays-completion' AND external_ref IS NULL
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
    VALUES (p_prompt, 3, 'arrays', v_type, v_challenge, 'jolt-arrays-completion', p_why, p_ref)
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

/* ── 1 · array-indexing ─────────────────────────────────────────────────── */

SELECT seed_arr(
    'array-indexing-recognise-01',
    'array-indexing', 'recognise',
    E'Which one reaches the FIRST item?\n\nlet scores = [90, 80, 70];',
    'scores[0]', ARRAY['scores[1]', 'scores(0)', 'scores.length'],
    'Counting starts at zero, so the first item sits at position 0 and `scores[1]` is the second. Square brackets reach a position; round ones would try to call the list.');

SELECT seed_arr(
    'array-indexing-predict-01',
    'array-indexing', 'predict',
    E'What does this log?\n\nlet scores = [90, 80, 70];\nconsole.log(scores[3]);',
    'undefined', ARRAY['70', 'an error', '3'],
    'Three items means positions 0, 1 and 2. Reaching past the end hands back `undefined` rather than complaining, which is why a wrong index usually shows up somewhere else, later, as an odd value.');

/* ── 2 · array-length ───────────────────────────────────────────────────── */

SELECT seed_arr(
    'array-length-predict-01',
    'array-length', 'predict',
    E'What does this log?\n\nlet a = [4, 5, 6];\nconsole.log(a.length);\nconsole.log(a[a.length - 1]);',
    '3 then 6', ARRAY['3 then undefined', '2 then 6', '3 then 4'],
    '`length` counts the items, so it is 3. The positions stop one short of it, which makes `length - 1` the last one every time, whatever the list holds.');

SELECT seed_arr(
    'array-length-diagnose-01',
    'array-length', 'diagnose',
    E'This should print the last item and prints undefined. Which line is the cause?\n\nlet a = [4, 5, 6];\nconsole.log(a[a.length]);',
    'console.log(a[a.length]);',
    ARRAY['let a = [4, 5, 6];', 'nothing — it works', 'both lines equally'],
    'The length is 3 and the last position is 2, so `a[3]` is one past the end. The list itself is fine; the index is off by exactly one, which is what `length - 1` exists to fix.');

/* ── 3 · array-mutation ─────────────────────────────────────────────────── */

SELECT seed_arr(
    'array-mutation-predict-01',
    'array-mutation', 'predict',
    E'What does this log?\n\nlet a = [1, 2];\nlet b = a.push(3);\nconsole.log(b);',
    '3', ARRAY['[1, 2, 3]', '[3]', 'undefined'],
    '`push` changes `a` and hands back the new LENGTH, not the list. Storing its result is a common way to end up holding a number where a list was expected.');

SELECT seed_arr(
    'array-mutation-diagnose-01',
    'array-mutation', 'diagnose',
    E'This should leave the original untouched and changes it. Which line is the cause?\n\nlet original = [1, 2];\nlet copy = original;\ncopy.push(3);\nconsole.log(original.length);',
    'let copy = original;',
    ARRAY['copy.push(3);', 'console.log(original.length);', 'let original = [1, 2];'],
    'That line did not copy anything — it gave the same list a second name. `push` through either name changes the one list they both hold, so this prints 3.');

SELECT seed_arr(
    'array-mutation-repair-01',
    'array-mutation', 'repair',
    E'This prints 3 and should print 2. Which change fixes it?\n\nlet original = [1, 2];\nlet copy = original;\ncopy.push(3);\nconsole.log(original.length);',
    'Change `let copy = original;` to `let copy = [...original];`',
    ARRAY['Declare `original` with `const` instead of `let`',
          'Move the push above the copy',
          'Change `push` to `pop`'],
    'Only a real copy helps. `const` would not: it fixes which list the name points at, not what is inside it, so `original.push(3)` is still allowed after it.');

SELECT seed_arr(
    'array-mutation-explain-01',
    'array-mutation', 'explain',
    E'Why does declaring an array with `const` not stop it being changed?',
    'const fixes which list the name points at, not what is inside that list',
    ARRAY['Because arrays are always mutable and const only applies to numbers',
          'Because push is allowed to bypass const',
          'Because const only takes effect once the array has items in it'],
    'The mechanism is what `const` guards. It refuses `original = somethingElse`, because that would point the name at a different list. `original.push(3)` points at nothing new — it changes the list already there, so nothing about const is involved.');

/* ── 4 · array-copy-spread ──────────────────────────────────────────────── */

SELECT seed_arr(
    'array-copy-spread-predict-01',
    'array-copy-spread', 'predict',
    E'What does this log?\n\nlet a = [1, 2];\nlet b = [...a];\nb.push(3);\nconsole.log(a.length);',
    '2', ARRAY['3', '1', 'an error'],
    '`[...a]` built a NEW list holding the same items, so `b` is not `a`. Pushing to the copy leaves the original at the two items it started with.');

SELECT seed_arr(
    'array-copy-spread-explain-01',
    'array-copy-spread', 'explain',
    E'Why is a spread copy described as shallow?',
    'It makes a new outer list, but anything nested inside it is still the same list as before',
    ARRAY['Because it copies only the first item',
          'Because it copies the items but not the length',
          'Because the copy can be read but not changed'],
    'The mechanism is how far the copying goes: one level. `[...a]` gives a new outer list whose items are the SAME values — and when one of those values is itself a list, both copies point at it, so changing it through either is visible through both.');

/* ── 5 · default-rest-params ────────────────────────────────────────────── */

SELECT seed_arr(
    'default-rest-params-predict-01',
    'default-rest-params', 'predict',
    E'What does this log?\n\nfunction greet(name, greeting = "Hello") {\n  return greeting + ", " + name;\n}\nconsole.log(greet("Tati"));',
    'Hello, Tati', ARRAY['undefined, Tati', ', Tati', 'an error'],
    'Only one argument was given, so `greeting` was missing and its default filled in. A default is used when the argument is absent — not when it is present and empty.');

/* ── 6 · nested-arrays ──────────────────────────────────────────────────── */

SELECT seed_arr(
    'nested-arrays-recognise-01',
    'nested-arrays', 'recognise',
    E'Which one reaches the 4?\n\nlet grid = [[1, 2], [3, 4]];',
    'grid[1][1]', ARRAY['grid[1, 1]', 'grid[3]', 'grid[1]'],
    'Two steps, because there are two levels: `grid[1]` is the second inner list, and `[1]` on the end of that reaches its second item. `grid[1]` on its own gives the whole inner list.');

SELECT seed_arr(
    'nested-arrays-predict-01',
    'nested-arrays', 'predict',
    E'What does this log?\n\nlet grid = [[1, 2], [3, 4]];\nconsole.log(grid[0].length);',
    '2', ARRAY['4', '1', 'undefined'],
    '`grid[0]` is the inner list `[1, 2]`, and its length is 2. The outer list also has length 2 here, which is a coincidence worth not relying on.');

/* ── 7 · array-reference-identity ───────────────────────────────────────── */

SELECT seed_arr(
    'array-reference-identity-predict-01',
    'array-reference-identity', 'predict',
    E'What does this log?\n\nlet a = [1, 2];\nlet b = [1, 2];\nconsole.log(a === b);',
    'false', ARRAY['true', 'an error', 'undefined'],
    'Two separate lists were written, so there are two. `===` asks whether they are the SAME list, and identical contents do not make them one.');

SELECT seed_arr(
    'array-reference-identity-explain-01',
    'array-reference-identity', 'explain',
    E'Why are two arrays holding identical items still not equal?',
    'Comparing them asks whether they are the same list, not whether they look the same',
    ARRAY['Because arrays can never be compared with ===',
          'Because the items are compared one at a time and that always fails',
          'Because the comparison checks the length first and then gives up'],
    'The mechanism is what is being compared: the list itself, not its contents. Two names holding one list ARE equal, which is the same rule seen from the other side — and why comparing contents means walking them yourself.');

DROP FUNCTION seed_arr(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT);

COMMIT;
