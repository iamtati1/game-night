-- Completing Loops: eleven question rungs across six concepts.
--
-- Fifth topic built to the Values template. Three more rungs --
-- loop-conditions / produce, accumulators / produce and nested-loops / produce
-- -- are code-writing movements registered by seed 042.
--
-- `for-of-for-in` IS NOT HERE. It is about choosing between arrays and objects,
-- which are topics 9 and 11, so neither half of its objective could be met at
-- topic 6. It moved to Objects, after `object-access`. See curriculum.ts.
--
-- TAUGHT OVER NUMBERS AND STRINGS, which is all the learner has. Arrays are the
-- obvious thing to loop over and they are three topics away, so every example
-- here counts numbers or walks a string by position -- both of which Strings
-- made available.
--
-- `littleJs` gained `for`, `while`, `break` and `continue` for this topic, and
-- with them a real timeout: until now the grammar could not repeat, so its step
-- budget only bounded how much was pasted in.
--
-- THE TWO IDEAS THE TOPIC KEEPS RETURNING TO, because both are where the bugs
-- are: the condition is checked BEFORE each pass, and the last valid position
-- is length minus one.

BEGIN;

CREATE OR REPLACE FUNCTION seed_loop(
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
    WHERE source = 'jolt-loops-completion' AND external_ref = p_ref;

    IF v_question IS NOT NULL THEN RETURN; END IF;

    /*
     * ADOPTION, for rows seeded before names existed. They carry the right
     * content and no name, so the first run after this change gives them one
     * rather than inserting beside them. Restricted to rows that have no name
     * yet, so it can never steal a question that already belongs to another.
     */
    SELECT id INTO v_question
    FROM questions
    WHERE prompt = p_prompt AND source = 'jolt-loops-completion' AND external_ref IS NULL
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
    VALUES (p_prompt, 3, 'loops', v_type, v_challenge, 'jolt-loops-completion', p_why, p_ref)
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

/* ── 1 · for-loop-anatomy ───────────────────────────────────────────────── */

SELECT seed_loop(
    'for-loop-anatomy-recognise-01',
    'for-loop-anatomy', 'recognise',
    E'Which part decides whether another pass happens?\n\nfor (let i = 0; i < 5; i += 1) {\n  console.log(i);\n}',
    'i < 5', ARRAY['let i = 0', 'i += 1', 'console.log(i)'],
    'The middle part is the condition, and it is checked before every pass. The first part runs once at the start, and the third runs after each pass -- it changes `i`, but the condition is what decides.');

SELECT seed_loop(
    'for-loop-anatomy-predict-01',
    'for-loop-anatomy', 'predict',
    E'How many lines does this print?\n\nfor (let i = 0; i < 4; i += 1) {\n  console.log(i);\n}',
    '4', ARRAY['5', '3', '0'],
    '`i` takes the values 0, 1, 2 and 3. At 4 the condition is false and there is no fifth pass -- counting from zero up to but not including four is four passes.');

/* ── 2 · while-loops ────────────────────────────────────────────────────── */

SELECT seed_loop(
    'while-loops-recognise-01',
    'while-loops', 'recognise',
    E'Which loop would you reach for when you do not know how many passes there will be?',
    'while', ARRAY['for', 'neither -- both need a count', 'either, they are identical'],
    'A while loop asks only when to stop. A for loop gathers a counter, a bound and a step on one line, which is most useful when the number of passes is known up front.');

SELECT seed_loop(
    'while-loops-predict-01',
    'while-loops', 'predict',
    E'What does this log?\n\nlet n = 3;\nwhile (n < 3) {\n  console.log(n);\n  n += 1;\n}',
    'nothing', ARRAY['3', '0 1 2', '3 4 5'],
    'The condition is checked BEFORE the first pass, and 3 is not less than 3. A loop can run zero times, which is exactly what makes checking first useful.');

SELECT seed_loop(
    'while-loops-explain-01',
    'while-loops', 'explain',
    E'Why does a while loop whose body never changes anything run forever?',
    'The condition reads the same values every pass, so it can never become false',
    ARRAY['Because while loops have no built-in limit on the number of passes',
          'Because the condition is only checked once, at the start',
          'Because a while loop has no step of its own'],
    'The mechanism is that nothing moves the condition towards false. It IS checked before every pass -- that is why unchanging values mean an unchanging answer. A for loop with an empty step does the same thing.');

/* ── 3 · loop-conditions ────────────────────────────────────────────────── */

SELECT seed_loop(
    'loop-conditions-predict-01',
    'loop-conditions', 'predict',
    E'How many passes does this make?\n\nlet word = "Jolt";\nfor (let i = 0; i < word.length; i += 1) {\n  console.log(i);\n}',
    '4', ARRAY['5', '3', '0'],
    'Length is 4 and `<` stops before 4, so the passes are 0, 1, 2 and 3 -- one per character, which is exactly what you want.');

SELECT seed_loop(
    'loop-conditions-diagnose-01',
    'loop-conditions', 'diagnose',
    E'This is meant to print every character, and it reaches past the end. Which part is the cause?\n\nlet word = "Jolt";\nfor (let i = 0; i <= word.length; i += 1) {\n  console.log(word[i]);\n}',
    'i <= word.length',
    ARRAY['let i = 0', 'i += 1', 'console.log(word[i])'],
    'The bound is one too generous. Positions run from 0 to length minus one, so `<=` asks for position 4 on a four-character word -- which does not exist. Starting at 0 and stepping by 1 are both right.');

SELECT seed_loop(
    'loop-conditions-repair-01',
    'loop-conditions', 'repair',
    E'This reaches past the end. Which change fixes it?\n\nlet word = "Jolt";\nfor (let i = 0; i <= word.length; i += 1) {\n  console.log(word[i]);\n}',
    'Change the condition to i < word.length',
    ARRAY['Start the loop at i = 1', 'Change the step to i += 2', 'Use word.length - 1 as the starting point'],
    'The repair belongs in the condition, which is the part that is wrong. Starting at 1 would skip the first character instead, and changing the step would skip others -- both trade one bug for another.');

/* ── 4 · accumulators ───────────────────────────────────────────────────── */

SELECT seed_loop(
    'accumulators-predict-01',
    'accumulators', 'predict',
    E'What does this log?\n\nlet total = 0;\nfor (let i = 1; i < 4; i += 1) {\n  total += i;\n}\nconsole.log(total);',
    '6', ARRAY['3', '0', '10'],
    'Each pass adds its own value to what is already there: 1, then 2, then 3. `total` is declared outside the loop, so what each pass adds survives into the next.');

/* ── 5 · break-continue ─────────────────────────────────────────────────── */

SELECT seed_loop(
    'break-continue-predict-01',
    'break-continue', 'predict',
    E'What does this log?\n\nfor (let i = 0; i < 5; i += 1) {\n  if (i === 2) {\n    break;\n  }\n  console.log(i);\n}',
    '0 then 1', ARRAY['0 1 3 4', '0 1 2 3 4', 'nothing'],
    '`break` leaves the loop entirely, so the three passes the condition would still have allowed never happen. Skipping just the one pass and carrying on would be `continue`.');

SELECT seed_loop(
    'break-continue-explain-01',
    'break-continue', 'explain',
    E'Why would you use break rather than letting the loop finish?',
    'Once the answer is found, the remaining passes cannot change it',
    ARRAY['Because a loop is not allowed to finish after an if has run',
          'Because break makes the loop condition false',
          'Because the loop would otherwise never stop'],
    'The mechanism is that the work is already done. break does not touch the condition and the loop was never obliged to stop early -- it is a choice about wasted passes, most often when searching.');

/* ── 6 · nested-loops ───────────────────────────────────────────────────── */

SELECT seed_loop(
    'nested-loops-predict-01',
    'nested-loops', 'predict',
    E'How many lines does this log?\n\nfor (let a = 0; a < 3; a += 1) {\n  for (let b = 0; b < 4; b += 1) {\n    console.log(a + "-" + b);\n  }\n}',
    '12', ARRAY['7', '4', '3'],
    'The inner loop runs all the way through on every pass of the outer one, so the two multiply rather than add: three outer passes of four inner passes each.');

DROP FUNCTION seed_loop(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT);

COMMIT;
