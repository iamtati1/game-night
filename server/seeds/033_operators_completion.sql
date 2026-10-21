-- Completing Operators: eleven rungs across five concepts.
--
-- Values is the reference implementation and this follows it exactly: every
-- declared rung gets a real activity, each activity tests the concept it claims
-- rather than something adjacent, nothing requires a construct the learner has
-- not reached, and every question can explain itself when the answer is wrong.
--
-- The twelfth rung, `assignment-operators / produce`, is a code-writing
-- movement rather than a question -- it lives in client/src/games/practice.ts
-- and is registered by seed 034. "Update a variable using its own current
-- value" cannot be demonstrated by choosing an option.
--
-- ALLOWED KNOWLEDGE at Operators is everything in Values and Variables:
-- console.log, literals, arithmetic, comparison, booleans, typeof, null and
-- undefined, let/const, declaration, assignment and reassignment. NOT strings
-- methods, arrays, objects, functions, loops or anything later.
--
-- WHAT EACH DEMAND ASKS, taken from the demands table rather than assumed:
--   recall   retrieve from memory, with no instance in front of you
--   predict  run it in your head and state the result
--   diagnose locate the fault in code that runs wrongly
--   repair   produce the correction, not merely its location
--   explain  give the mechanism, not the outcome
--
-- The explain questions are built the same way throughout: every distractor is
-- a TRUE statement about the outcome. Only one gives the mechanism, so a
-- learner who has memorised what happens still has to know why.

BEGIN;

CREATE OR REPLACE FUNCTION seed_op(
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
    WHERE source = 'jolt-operators-completion' AND external_ref = p_ref;

    IF v_question IS NOT NULL THEN RETURN; END IF;

    /*
     * ADOPTION, for rows seeded before names existed. They carry the right
     * content and no name, so the first run after this change gives them one
     * rather than inserting beside them. Restricted to rows that have no name
     * yet, so it can never steal a question that already belongs to another.
     */
    SELECT id INTO v_question
    FROM questions
    WHERE prompt = p_prompt AND source = 'jolt-operators-completion' AND external_ref IS NULL
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
                THEN 2 ELSE 1 END
    FROM concepts c, demands d
    WHERE c.slug = p_concept AND d.slug = p_demand
    RETURNING id INTO v_challenge;

    INSERT INTO questions
        (prompt, difficulty, topic, challenge_type, challenge_id, source, explanation, external_ref)
    VALUES (p_prompt, 1, 'operators', v_type, v_challenge, 'jolt-operators-completion', p_why, p_ref)
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

/* ── 1 · assignment-operators ───────────────────────────────────────────── */

SELECT seed_op(
    'assignment-operators-predict-01',
    'assignment-operators', 'predict',
    E'What does this log?\n\nlet score = 10;\nscore += 5;\nconsole.log(score);',
    '15', ARRAY['5', '105', '10'],
    '`+=` reads the current value first, adds to it, and stores the result back. It is shorthand for `score = score + 5`, so the 10 is used rather than replaced.');

/* ── 2 · type-coercion ──────────────────────────────────────────────────── */

SELECT seed_op(
    'type-coercion-predict-01',
    'type-coercion', 'predict',
    E'What does this log?\n\nconsole.log("5" + 3);',
    '53', ARRAY['8', '15', '2'],
    'When `+` has text on one side it joins rather than adds, so the 3 is turned into text and stuck on the end. This is the one operator that behaves differently depending on what it is given.');

SELECT seed_op(
    'type-coercion-diagnose-01',
    'type-coercion', 'diagnose',
    E'A total is coming out wrong. Which line is the cause?\n\nlet base = "20";\nlet bonus = 5;\nlet total = base + bonus;\nconsole.log(total);',
    'let base = "20";',
    ARRAY['let bonus = 5;', 'let total = base + bonus;', 'console.log(total);'],
    'The fault is where the value was made text, not where it was added. `base` holds `"20"` with quotes, so the addition on line 3 joins instead of adding. Line 3 is only doing what the value it was given demands.');

SELECT seed_op(
    'type-coercion-repair-01',
    'type-coercion', 'repair',
    E'This prints 205. Which change makes it print 25?\n\nlet base = "20";\nlet bonus = 5;\nconsole.log(base + bonus);',
    'Write base without quotes: let base = 20;',
    ARRAY['Write bonus with quotes: let bonus = "5";',
          'Swap the order: console.log(bonus + base);',
          'Remove the bonus from the sum'],
    'The repair is to fix the value, not the sum. With both sides numbers, `+` adds. Quoting `bonus` as well would join two pieces of text into "205" again, and swapping the order changes only which text comes first.');

SELECT seed_op(
    'type-coercion-explain-01',
    'type-coercion', 'explain',
    E'Why does "5" + 3 give "53" while "5" - 3 gives 2?',
    '`+` also means join text, so it turns the number into text; `-` has no such meaning, so it turns the text into a number',
    ARRAY['Because subtraction is always worked out before addition',
          'Because "5" is really a number and the quotes are ignored',
          'Because JavaScript rounds the result of subtraction'],
    'The mechanism is that `+` is the only operator with two jobs. Faced with a mixture it picks joining, which needs text. `-` can only subtract, so it converts the other way. The quotes are never ignored -- they decide which way the conversion goes.');

/* ── 3 · equality ───────────────────────────────────────────────────────── */

SELECT seed_op(
    'equality-explain-01',
    'equality', 'explain',
    E'Why does "7" == 7 come out true while "7" === 7 comes out false?',
    '`==` converts one side to the other''s type before comparing; `===` compares the type as well as the value',
    ARRAY['Because `===` is stricter about whitespace inside the quotes',
          'Because `==` is older and has a bug that was never fixed',
          'Because `===` compares how the values are stored in memory'],
    'The mechanism is the conversion. `==` makes the two sides the same type first, so the text becomes the number 7 and the values match. `===` refuses to convert, so text and number are different from the start.');

/* ── 4 · logical-operators ──────────────────────────────────────────────── */

SELECT seed_op(
    'logical-operators-predict-01',
    'logical-operators', 'predict',
    E'What does this log?\n\nlet ready = true;\nlet fuelled = false;\nconsole.log(ready && fuelled);',
    'false', ARRAY['true', 'ready', 'fuelled'],
    '`&&` answers true only when BOTH sides are true. One of these is false, so the whole thing is false -- and the answer is a boolean, not one of the names.');

SELECT seed_op(
    'logical-operators-explain-01',
    'logical-operators', 'explain',
    E'Why does false && somethingElse never look at somethingElse?',
    'Once one side of `&&` is false the answer cannot change, so JavaScript stops there',
    ARRAY['Because `&&` only ever reads the value on its left',
          'Because false is treated as the end of the line',
          'Because the second value has not been declared yet'],
    'The mechanism is that the answer is already settled. `&&` needs both sides true, so a false on the left decides it -- reading further could not change anything. It is not that the right side is ignored in general: with a true on the left it is read.');

/* ── 5 · truthy-falsy ───────────────────────────────────────────────────── */

SELECT seed_op(
    'truthy-falsy-recall-01',
    'truthy-falsy', 'recall',
    E'Which of these values is falsy?',
    '0', ARRAY['"0"', '"false"', '-1'],
    'The falsy values are few enough to remember: false, 0, empty text, null, undefined and NaN. Everything else is truthy -- including `"0"` and `"false"`, which are non-empty text, and negative numbers, which are not zero.');

SELECT seed_op(
    'truthy-falsy-predict-01',
    'truthy-falsy', 'predict',
    E'What does this log?\n\nlet name = "";\nconsole.log(Boolean(name));',
    'false', ARRAY['true', '""', 'undefined'],
    'Empty text is one of the falsy values. It is still a piece of text and still a real value -- it just counts as false when a condition asks a yes-or-no question of it.');

SELECT seed_op(
    'truthy-falsy-explain-01',
    'truthy-falsy', 'explain',
    E'Why is "false" truthy when false is falsy?',
    'The quotes make it a non-empty piece of text, and every non-empty piece of text is truthy',
    ARRAY['Because text is always truthy, empty or not',
          'Because the word false is spelled correctly inside the quotes',
          'Because only numbers can be falsy'],
    'The mechanism is length, not meaning. JavaScript never reads what the text says -- it asks only whether there is any text at all. Empty text is falsy for the same reason, which is why "always truthy" is the wrong rule.');

DROP FUNCTION seed_op(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT);

COMMIT;
