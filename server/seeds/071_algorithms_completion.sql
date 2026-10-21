-- Completing Algorithms: eleven question rungs across five concepts.
--
-- Fifteenth topic built to the Values template. The twelfth rung,
-- recursion / produce, is a code-writing movement registered by 072.
--
-- RECURSION HAD NEVER WORKED BEFORE THIS TOPIC, and the reason was not
-- recursion. A suppressed walk still EVALUATED: after a `return`, a block
-- walks the statements below it to consume their tokens, and that walk CALLED
-- the function again, every time, until the depth guard stopped it. The same
-- root cause had already broken `break`, `return`, `throw`, `await`, and any
-- `let` declared inside a loop body. Measuring is a question about tokens and
-- is now answered with tokens.
--
-- `Math` ARRIVED HERE, for `Math.floor` -- halving a range is what
-- `search-strategies` is about, and it cannot be written without it.
--
-- NOTHING HERE IS A PUZZLE. The sorting question shows ONE pass and asks what
-- it leaves behind, not what a full sort produces; the search question counts
-- halvings rather than tracing a binary search by hand. A beginner should be
-- challenged by the idea, not by holding six variables in their head.
--
-- EVERY SNIPPET BELOW HAS BEEN RUN.
--
-- THE DISTINCTION THE TOPIC KEEPS RETURNING TO: an algorithm is a plan for
-- getting smaller. What makes it finish is knowing when to stop.

BEGIN;

CREATE OR REPLACE FUNCTION seed_alg(
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
    WHERE source = 'jolt-algorithms-completion' AND external_ref = p_ref;

    IF v_question IS NOT NULL THEN RETURN; END IF;

    /*
     * ADOPTION, for rows seeded before names existed. They carry the right
     * content and no name, so the first run after this change gives them one
     * rather than inserting beside them. Restricted to rows that have no name
     * yet, so it can never steal a question that already belongs to another.
     */
    SELECT id INTO v_question
    FROM questions
    WHERE prompt = p_prompt AND source = 'jolt-algorithms-completion' AND external_ref IS NULL
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
    VALUES (p_prompt, 3, 'algorithms', v_type, v_challenge, 'jolt-algorithms-completion', p_why, p_ref)
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

/* ── 1 · recursion ──────────────────────────────────────────────────────── */

SELECT seed_alg(
    'recursion-predict-01',
    'recursion', 'predict',
    E'What does this log?\n\nfunction down(n) {\n  if (n === 0) {\n    return "liftoff";\n  }\n  console.log(n);\n  return down(n - 1);\n}\nconsole.log(down(3));',
    '3, 2, 1, liftoff', ARRAY['3, 2, 1, 0', 'liftoff', '3 only'],
    'Each call prints its own number and then asks a smaller version of itself. At 0 the question stops being asked and "liftoff" travels back out through every waiting call.');

SELECT seed_alg(
    'recursion-diagnose-01',
    'recursion', 'diagnose',
    E'This counts down and never stops. Which line is the cause?\n\nfunction down(n) {\n  console.log(n);\n  return down(n - 1);\n}\ndown(3);',
    'there is no line that stops it',
    ARRAY['console.log(n);', 'return down(n - 1);', 'down(3);'],
    'Nothing here is written wrongly — something is MISSING. Without a check that returns an answer instead of recursing, `n` simply keeps going down past zero for ever.');

/* ── 2 · base-cases ─────────────────────────────────────────────────────── */

SELECT seed_alg(
    'base-cases-diagnose-01',
    'base-cases', 'diagnose',
    E'This should add 4 + 3 + 2 + 1 and never finishes. Which line is the cause?\n\nfunction total(n) {\n  if (n === 0) {\n    return 0;\n  }\n  return n + total(n + 1);\n}\nconsole.log(total(4));',
    'return n + total(n + 1);',
    ARRAY['if (n === 0) {', 'return 0;', 'console.log(total(4));'],
    'The base case is fine; nothing ever reaches it. Each call asks about a BIGGER number, so it moves away from 0 instead of towards it — `n - 1` is what makes the problem get smaller.');

SELECT seed_alg(
    'base-cases-repair-01',
    'base-cases', 'repair',
    E'`total(4)` never finishes. Which change fixes it?\n\nfunction total(n) {\n  if (n === 0) {\n    return 0;\n  }\n  return n + total(n + 1);\n}',
    'Count down instead: total(n - 1)',
    ARRAY['Stop at n === 1 instead of 0', 'Return n instead of 0', 'Call total twice'],
    'The base case was never the problem — reaching it was. Counting down walks towards 0; stopping at 1 or returning something else changes the answer without fixing the direction.');

SELECT seed_alg(
    'base-cases-explain-01',
    'base-cases', 'explain',
    E'Why does every recursive function need a base case?',
    'without one there is nothing that returns an answer instead of asking again',
    ARRAY['the computer can only hold a limited number of waiting calls',
          'the base case is what makes the function faster to run',
          'a function is not allowed to call itself more than once'],
    'The mechanism is where the answers come from. Every recursive call is waiting on a smaller one, so something has to hand back a real value rather than another question — and that is the base case. Running out of room is the SYMPTOM, not the reason.');

/* ── 3 · search-strategies ──────────────────────────────────────────────── */

SELECT seed_alg(
    'search-strategies-predict-01',
    'search-strategies', 'predict',
    E'A sorted list of 8 items is searched by halving. What does this log?\n\nlet left = 8;\nlet checks = 0;\nwhile (left > 1) {\n  left = left / 2;\n  checks = checks + 1;\n}\nconsole.log(checks);',
    '3', ARRAY['8', '4', '7'],
    '8 halves to 4, then 2, then 1 — three steps. Checking every item in turn would take up to 8. That gap is the whole reason to keep a list sorted.');

SELECT seed_alg(
    'search-strategies-explain-01',
    'search-strategies', 'explain',
    E'Why can a sorted list be searched by halving when an unsorted one cannot?',
    'in a sorted list one comparison tells you which half the answer is in',
    ARRAY['a sorted list is stored differently, so the middle is faster to reach',
          'halving works on any list, but only gives the right answer when sorted',
          'an unsorted list has to be sorted first, which is why it is slower'],
    'The mechanism is what one comparison tells you. In a sorted list, "too big" rules out everything to the right at once. In an unsorted one it rules out exactly one item, so there is nothing to halve.');

/* ── 4 · sorting-basics ─────────────────────────────────────────────────── */

SELECT seed_alg(
    'sorting-basics-predict-01',
    'sorting-basics', 'predict',
    E'This is ONE pass of a simple sort. What does it log?\n\nlet a = [4, 3, 2, 1];\nfor (let i = 0; i < a.length - 1; i = i + 1) {\n  if (a[i] > a[i + 1]) {\n    let t = a[i];\n    a[i] = a[i + 1];\n    a[i + 1] = t;\n  }\n}\nconsole.log(a);',
    '[3, 2, 1, 4]', ARRAY['[1, 2, 3, 4]', '[4, 3, 2, 1]', '[3, 4, 2, 1]'],
    'Each pair is compared and swapped if it is the wrong way round, so the largest item is carried all the way to the end. One pass is not a sorted list — it is one item in its final place.');

SELECT seed_alg(
    'sorting-basics-explain-01',
    'sorting-basics', 'explain',
    E'Why does a simple sort need several passes rather than one?',
    'one pass only settles the largest item; the rest are still out of order',
    ARRAY['each pass is allowed to make only a single swap',
          'the list has to be read backwards on every second pass',
          'the first pass compares items and a later one moves them'],
    'The mechanism is how far an item can travel. Comparing neighbours moves the biggest one all the way along, but everything else shifts at most one place — so the work is repeated until a pass goes by with nothing left to swap.');

/* ── 5 · complexity ─────────────────────────────────────────────────────── */

SELECT seed_alg(
    'complexity-recall-01',
    'complexity', 'recall',
    E'Checking every item in a list of n items. Roughly how does the work grow as n grows?',
    'in step with n', ARRAY['not at all', 'with the square of n', 'with the halving of n'],
    'One check per item means doubling the list doubles the work. Nested loops would square it, and halving would grow far more slowly — those are the three shapes worth recognising.');

SELECT seed_alg(
    'complexity-explain-01',
    'complexity', 'explain',
    E'Why does complexity describe how work GROWS rather than how long something takes?',
    'the same code runs at different speeds on different machines, but grows the same way',
    ARRAY['measuring time accurately is too difficult to be worth doing',
          'the growth is the part that can be calculated before running anything',
          'how long it takes depends mostly on the programming language used'],
    'The mechanism is what stays true everywhere. A faster machine changes every measurement and changes no comparison — if one approach doubles when the input doubles and another squares, that holds on any machine, which is what makes it worth knowing.');

DROP FUNCTION seed_alg(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT);

COMMIT;
