-- The eight early diagnose and repair rungs that had no Code Blitz question.
--
-- WHAT THIS IS NOT. It does not make anything reachable that was not reachable
-- before. Every one of these eight rungs already has a Bug Hunt incident, so
-- variablesCoverage.test.ts has always reported them playable and a learner
-- has always been able to clear them. What they had no way of being met
-- through was Code Blitz, which is the game a learner actually opens. This
-- adds that, and nothing else.
--
-- WHY THE LEGACY BANK COULD NOT SUPPLY THEM. The 234 untagged questions hold
-- no repair question at all, and the only legacy candidate for
-- equality/diagnose declares a function and branches with `if` -- four and one
-- topics early -- which operatorsTopic.test.ts refuses. These are authored to
-- the budget instead of bent to fit it.
--
-- THE SYNTAX BUDGET, per position, taken from the tests that enforce it:
--   console-output 1.1          console.log and literals. No let, no const,
--   expressions-produce-... 1.3 no comparison, no concatenation, no functions
--                               -- valuesTopic.test.ts scans the WHOLE prompt,
--                               prose included.
--   assignment 2.4 .. let-vs-const 2.7   let, const, arithmetic and comparison
--                               are all behind the learner by now.
--   equality 3.3                no if, no method call, no brackets, no
--                               function, no loop, no object literal --
--                               operatorsTopic.test.ts, which scans the code
--                               and any backticked fragment, not the prose.
--
-- SHAPE. Every one follows q322 and q323, the canonical pair: a symptom, the
-- snippet, then `Which line is the cause?` answered by the snippet's own lines,
-- or `Which change does that?` answered by edits. In all eight the cause is
-- NOT the line where the trouble surfaces -- that distinction is the whole
-- difference between diagnose and predict, and it is what each explanation
-- teaches.
--
-- ANSWER SHAPE. encounter.test.ts fails a demand of eight or more questions
-- whose longest option is the answer more than half the time. diagnose sat at
-- 15/33 and repair at 4/16; the correct option is the longest in none of these
-- eight, which moves them to 15/40 and 4/17.
--
-- DIFFICULTY IS DERIVED. diagnose and repair both sit at or past `produce` in
-- the demand order, so curriculum_difficulty returns 2 for every one of these
-- beginner-tier rungs. seed_values hardcodes 1 and is deliberately NOT reused
-- for that reason; variablesCoverage.test.ts asserts the derived value.
--
-- CONVERGENT. Each call returns early when a question with that prompt already
-- exists, so a second run creates nothing.

BEGIN;

-- Identical to the body in seeds 015 and 019, which both declare and drop it.
CREATE OR REPLACE FUNCTION curriculum_difficulty(p_concept TEXT, p_demand TEXT)
RETURNS SMALLINT LANGUAGE sql STABLE AS $$
    SELECT (CASE
        WHEN d.display_order >= (SELECT display_order FROM demands WHERE slug = 'produce') THEN
            CASE t.tier WHEN 'beginner' THEN 2 WHEN 'intermediate' THEN 3 ELSE 4 END
        ELSE
            CASE t.tier WHEN 'beginner' THEN 1 WHEN 'intermediate' THEN 2 ELSE 3 END
    END)::SMALLINT
    FROM concepts c
    JOIN topics t ON t.id = c.topic_id
    CROSS JOIN demands d
    WHERE c.slug = p_concept AND d.slug = p_demand;
$$;

-- Follows seed_values and seed_op, with two deliberate differences: the
-- challenge difficulty is derived rather than written as 1, and the topic is a
-- parameter because this slice spans Values, Variables and Operators.
CREATE OR REPLACE FUNCTION seed_early_diagnostic(
    p_concept TEXT, p_demand TEXT, p_topic TEXT, p_prompt TEXT,
    p_correct TEXT, p_wrong TEXT[], p_why TEXT
)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_question BIGINT; v_challenge BIGINT; v_wrong TEXT; v_order INT := 1;
BEGIN
    SELECT id INTO v_question FROM questions WHERE prompt = p_prompt;
    IF v_question IS NOT NULL THEN RETURN; END IF;

    INSERT INTO challenges (concept_id, demand_id, role, difficulty)
    SELECT c.id, d.id, 'practise', curriculum_difficulty(p_concept, p_demand)
    FROM concepts c, demands d
    WHERE c.slug = p_concept AND d.slug = p_demand
    RETURNING id INTO v_challenge;

    IF v_challenge IS NULL THEN
        RAISE EXCEPTION 'no concept_demands pair for % / %', p_concept, p_demand;
    END IF;

    -- predict-output, not match-concept: both demands put a snippet in front of
    -- the learner, which is the distinction seed_values and seed_op draw.
    INSERT INTO questions
        (prompt, difficulty, topic, challenge_type, challenge_id, source, explanation)
    VALUES (p_prompt, 1, p_topic, 'predict-output', v_challenge,
            'jolt-early-diagnostics', p_why)
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

/* ── 1 · values / console-output · diagnose ────────── */
--
-- The recognise rung (q311) asks which FORM displays something. This gives a
-- running program whose output is wrong and asks which of its own lines did it.
SELECT seed_early_diagnostic('console-output', 'diagnose', 'values',
    E'This is meant to print 1, then 2, then 3. It prints 1, then 3. Which line is the cause?\n\nconsole.log(1);\nconsole.log;\nconsole.log(3);',
    E'console.log;',
    ARRAY[E'console.log(1);',
          E'console.log(3);',
          E'nothing -- it works'],
    E'`console.log` on its own names the action without carrying it out. There are no brackets, so nothing is handed to it and nothing is printed. The line runs quietly rather than stopping the program, which is why 2 is simply missing.');

/* ── 2 · values / expressions-produce-values · diagnose ────────── */
--
-- The explain rung (q314) says why 5 + 5 shows 10. This is the same rule met
-- from the other side: quoted, it never collapses at all.
SELECT seed_early_diagnostic('expressions-produce-values', 'diagnose', 'values',
    E'Both lines are meant to print 10. The first does, and the second prints 5 + 5. Which line is the cause?\n\nconsole.log(2 + 8);\nconsole.log("5 + 5");',
    E'console.log("5 + 5");',
    ARRAY[E'console.log(2 + 8);',
          E'the spaces around the plus sign',
          E'nothing -- it works'],
    E'Quotes make something text, and text is already a value with nothing left to work out. Without them `5 + 5` is an expression, so it collapses to 10 before `console.log` is ever handed anything.');

/* ── 3 · variables / assignment · diagnose ────────── */
--
-- Not the snapshot lesson -- this is the missing store. The predict rung
-- (q277, q278) always has an `=`; here the result has nowhere to go.
SELECT seed_early_diagnostic('assignment', 'diagnose', 'variables',
    E'count is meant to end at 3 and ends at 1. Which line is the cause?\n\nlet count = 1;\ncount + 2;\nconsole.log(count);',
    E'count + 2;',
    ARRAY[E'let count = 1;',
          E'console.log(count);',
          E'nothing -- it works'],
    E'That line works out 3 and then throws it away. Adding is not storing: without `=` there is no name on the left for the result to go to, so `count` is never given the new value.');

/* ── 4 · variables / reading-variables · diagnose ────────── */
--
-- The predict rung (q273) walks `let b = a;` forwards. This asks why b did
-- not follow a afterwards: a name is read for its value, not linked to it.
SELECT seed_early_diagnostic('reading-variables', 'diagnose', 'variables',
    E'b is meant to follow a, and prints 5 after a has changed to 9. Which line is the cause?\n\nlet a = 5;\nlet b = a;\na = 9;\nconsole.log(b);',
    E'let b = a;',
    ARRAY[E'a = 9;',
          E'console.log(b);',
          E'the order of the last two lines'],
    E'Reading `a` fetches the value it holds at that moment, which was 5. What `b` gets is that number, not a link to `a`, so later changes to `a` have nothing to travel along.');

/* ── 5 · variables / reassignment · diagnose ────────── */
--
-- The predict rung (q274-q276) reassigns and then prints. This prints and
-- then reassigns, so the rule `from that line onward` is what is being tested.
SELECT seed_early_diagnostic('reassignment', 'diagnose', 'variables',
    E'fuel is meant to print 80 and prints 100. Which line is the cause?\n\nlet fuel = 100;\nconsole.log(fuel);\nfuel = 80;',
    E'console.log(fuel);',
    ARRAY[E'fuel = 80;',
          E'let fuel = 100;',
          E'nothing -- it works'],
    E'Assigning again replaces the value from that line onward, and not before it. The print ran while `fuel` still held 100, so the new value arrived one line too late to be seen.');

/* ── 6 · variables / let-vs-const · diagnose ────────── */
--
-- Deliberately NOT q286, q287 or legacy q59, which all ask WHAT HAPPENS when
-- a const is reassigned and answer `It stops with an error`. This asks which
-- line is to blame, and the answer is the declaration rather than the line
-- that threw.
SELECT seed_early_diagnostic('let-vs-const', 'diagnose', 'variables',
    E'This stops with an error on the third line. Which line is the cause?\n\nconst score = 0;\nconsole.log(score);\nscore = 10;',
    E'const score = 0;',
    ARRAY[E'score = 10;',
          E'console.log(score);',
          E'nothing -- it works'],
    E'The error surfaces on line 3 but the decision was made on line 1. A name that has to change later cannot be declared with `const`; line 3 is only doing what the program needs it to do.');

/* ── 7 · operators / equality · diagnose ──────────────────── */
--
-- The cause is the value, not the comparison -- the same shape as q322, and
-- the reason the repair below fixes the value rather than the operator.
SELECT seed_early_diagnostic('equality', 'diagnose', 'operators',
    E'A code typed in by hand is checked against the real one. This is meant to print true and prints false. Which line is the cause?\n\nlet entered = "7";\nlet secret = 7;\nconsole.log(entered === secret);',
    E'let entered = "7";',
    ARRAY[E'let secret = 7;',
          E'console.log(entered === secret);',
          E'the three equals signs'],
    E'The fault is where the value was made text, not where it was compared. `===` checks the type as well as the value, so a text 7 and a number 7 are different from the start. The comparison is doing exactly its job.');

/* ── 8 · operators / equality · repair ──────────────────────── */
--
-- The fourth line is what rules out two of the distractors. Quoting `secret`
-- would make the comparison true and the sum print 71; `==` would make it
-- true by giving up on types, which is the trap this concept exists to name.
SELECT seed_early_diagnostic('equality', 'repair', 'operators',
    E'The first line should print true and prints false. The second must keep printing 8. Which change does that?\n\nlet entered = "7";\nlet secret = 7;\nconsole.log(entered === secret);\nconsole.log(secret + 1);',
    E'Store the number: let entered = 7;',
    ARRAY[E'Add quotes to secret: let secret = "7";',
          E'Use == instead of ===',
          E'Swap the sides: console.log(secret === entered);'],
    E'The repair is to fix the value, not the comparison. Quoting `secret` would break the sum below into 71, and `==` would only hide the mismatch by converting rather than comparing types. With both sides numbers, `===` matches.');

-- Dropped, matching seeds 013, 015, 019 and 033: a seed declares the helpers
-- it needs and takes them away again.
DROP FUNCTION seed_early_diagnostic(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT);
DROP FUNCTION curriculum_difficulty(TEXT, TEXT);

COMMIT;
