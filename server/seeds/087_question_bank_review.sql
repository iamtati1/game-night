-- A third pass over the question bank: what 085 and 086 left, and what a
-- fresh read of all 294 active questions found.
--
-- Same method as 085/086: every predict question run in an isolated vm and
-- compared with the option it marks correct, every option read against the
-- lessons in client/src/games/lessons.ts. Again no answer key was wrong. What
-- is left is distractors that are not wrong, or not in the answer's format,
-- items that repeat something else, and one shape that gives answers away.
--
-- 1. DISTRACTORS THAT ARE TRUE, OR NOT ANSWERS AT ALL.
--    * #296 `console.log("false")` offered "a quoted word is not a boolean": a
--      sentence, not something the line could print. It becomes `"false"`,
--      the quotes-are-printed mistake its sibling #295 already uses.
--    * #312 offered "14 is the correct total of those three numbers", which
--      explains nothing. It becomes the real mistake: left to right, 2 + 3 first.
--    * #361 "while loops have no built-in limit on the number of passes" is
--      true. It becomes a false belief: the condition cannot see the changes.
--    * #510 "the computer can only hold a limited number of waiting calls" and
--      #512 "halving works on any list, but only gives the right answer when
--      sorted" are both true. #516 "the growth is the part that can be
--      calculated before running anything" is true too. All three become
--      false statements.
--    * #446 offered `for (n of nums)`, which also walks the values in sloppy
--      mode. #485 offered "document.querySelector can be called on any
--      element", half true. Both become plainly wrong.
--
-- 2. QUOTED DISTRACTORS STACKED ON ANOTHER MISTAKE. Legacy #6 (`"5" - 3`)
--    offered `"53"` while #321 marks the same joining as `53`; #207 offered
--    `"isOwner"`, #156 `"Ada1"`, #164 `"@"`. Each stands for a different
--    mistake (joining, returning the name, returning the text), and the quotes
--    made it two mistakes at once. They lose the quotes, as 085 did for
--    correct answers.
--
-- 3. PREREQUISITE LEAKS. #340 (ternary) offered `if (n > 0) { return "up" }`;
--    `return` is three topics later. It becomes an if that assigns, which is
--    the real thing a ternary is mistaken for. #435 (sort) offered
--    `scores.flat()`; flat is the next concept. It becomes sorting a spread
--    copy, which is taught and still sorts as text.
--
-- 4. WRONG CONCEPT, OR A REPEAT.
--    * #8 (initialization) was `let x; console.log(x)`: no initialization in
--      it, a declaration question. Legacy, so it retires and a named
--      replacement takes its rung.
--    * #286 and #287 were the same question (const reassigned, "It stops
--      with an error"). #286 now changes a let and a const side by side and
--      logs only the let: the program still stops at the const line. Its
--      correct option keeps its text.
--    * #304 `console.log(10 / 4)` is the arithmetic lesson's own step, and the
--      concept had two ".5 division" items and no addition. It becomes
--      0.5 + 0.5: one whole, displayed without a .0.
--    * #347 said "rejects everything" while printing Too long for long names,
--      and its two branches could not both be right. It now says what was
--      meant and its else prints Ready.
--
-- 5. "THEM". #325's correct option read "`===` compares them too": the types
--    or the values? 066 sets that option's text on every run, so it cannot be
--    reworded in place. It retires, and a named replacement says it plainly.
--
-- 6. THE ANSWER WAS THE ONE WITH PUNCTUATION. On 20 of 45 explain questions
--    and 9 of 17 repair questions, the correct option was the only one with a
--    comma, semicolon or colon ("X, so Y"; "Copy it: `...`"). Picking it got
--    those right unread -- the same kind of tell 066 removed for "Because" and
--    for length. One distractor on each now has the same two-part shape. Most
--    keep their meaning and gain only the punctuation; none is longer than the
--    longest option already there.
--
-- KEPT, ON PURPOSE. 145 active questions share their code with a lesson
-- snippet (the completion seeds were built from the lessons); rewriting those
-- is authoring, not audit. Legacy explanations (#155 mentions template
-- literals) are rewritten by seed 008 on every run, so they cannot be changed
-- here without the two seeds fighting.
--
-- MATCHED NARROWLY, as 085/086. Named questions by (source, external_ref)
-- AND their exact old prompt or option text; legacy ones by exact prompt and
-- is_active. On a fresh build each UPDATE matches the row an earlier seed just
-- wrote; on a re-run it matches nothing. Options keep their ids, so a
-- learner's earlier choice still points at the same option, and no answer
-- moves between options. No new prompt matches a LIKE pattern that seeds 025,
-- 029, 031 or 081 re-apply (beyond one the old prompt already matched), or an
-- exact prompt that 080 re-applies.

BEGIN;

-- 4a / 5. Retire #8 (legacy) and #325 (named). Nothing re-activates either:
--         008 leaves is_active alone, and 033 stops at a row it can name.
UPDATE questions
SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
WHERE source = 'internal'
  AND is_active
  AND prompt = E'What does this log?\n\nlet x;\nconsole.log(x);';

UPDATE questions
SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
WHERE source = 'jolt-operators-completion'
  AND external_ref = 'equality-explain-01'
  AND is_active;

-- Their replacements, each on a new challenge at the rung the retired one held
-- (questions_challenge_id_idx is unique, so a challenge cannot be shared).
CREATE OR REPLACE FUNCTION seed_bank_review(
    p_ref TEXT, p_concept TEXT, p_demand TEXT, p_type TEXT, p_topic TEXT,
    p_challenge_difficulty SMALLINT, p_question_difficulty SMALLINT,
    p_prompt TEXT, p_correct TEXT, p_wrong TEXT[], p_why TEXT
)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_question BIGINT; v_challenge BIGINT; v_wrong TEXT; v_order INT := 1;
BEGIN
    -- Identity by name: questions_external_ref_idx is UNIQUE on
    -- (source, external_ref), so a re-run finds the row and stops.
    SELECT id INTO v_question
    FROM questions
    WHERE source = 'jolt-bank-review' AND external_ref = p_ref;

    IF v_question IS NOT NULL THEN RETURN; END IF;

    INSERT INTO challenges (concept_id, demand_id, role, difficulty)
    SELECT c.id, d.id, 'practise', p_challenge_difficulty
    FROM concepts c, demands d
    WHERE c.slug = p_concept AND d.slug = p_demand
    RETURNING id INTO v_challenge;

    INSERT INTO questions
        (prompt, difficulty, topic, challenge_type, challenge_id, source, explanation, external_ref)
    VALUES (p_prompt, p_question_difficulty, p_topic, p_type, v_challenge,
            'jolt-bank-review', p_why, p_ref)
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

-- #8's rung: initialization / predict, challenge difficulty 1, tier 1.
SELECT seed_bank_review(
    'initialization-predict-01', 'initialization', 'predict', 'predict-output', 'variables',
    1::SMALLINT, 1::SMALLINT,
    E'What does this log?\n\nlet docked = true;\nconsole.log(docked);',
    'true', ARRAY['undefined', 'docked', '"true"'],
    'Initialization declares the name and gives it its first value on the same line, so docked already holds true when it is logged. A name holds undefined only when it is declared with no value, as in `let docked;`.');

-- #325's rung: equality / explain, challenge difficulty 2, tier 1.
SELECT seed_bank_review(
    'equality-explain-02', 'equality', 'explain', 'match-concept', 'operators',
    2::SMALLINT, 1::SMALLINT,
    E'Why is "7" == 7 true, while "7" === 7 is false?',
    '`==` converts text to a number; `===` never converts',
    ARRAY['`===` converts the number to text; `==` does not',
          '`===` is stricter about whitespace inside the quotes',
          '`===` compares how the values are stored in memory'],
    'The mechanism is the conversion. `==` turns both sides into the same type before comparing, so the text "7" becomes the number 7 and they match. `===` never converts, so text and a number are different from the start.');

DROP FUNCTION seed_bank_review(TEXT, TEXT, TEXT, TEXT, TEXT, SMALLINT, SMALLINT, TEXT, TEXT, TEXT[], TEXT);

-- 4b-d. Named questions whose code changes, rewritten in place.
CREATE TEMP TABLE review_q (
    source TEXT, ref TEXT, old_prompt TEXT, new_prompt TEXT, new_why TEXT
) ON COMMIT DROP;
CREATE TEMP TABLE review_qo (source TEXT, ref TEXT, old_text TEXT, new_text TEXT) ON COMMIT DROP;

INSERT INTO review_q VALUES
    -- #286 · let-vs-const: not #287 again
    ('jolt-variables-predict', 'vars-predict-007',
     E'What happens when this runs?\n\nconst total = 10;\ntotal = total + 1;\nconsole.log(total);',
     E'What happens when this runs?\n\nlet fuel = 50;\nconst docks = 2;\nfuel = 60;\ndocks = 3;\nconsole.log(fuel);',
     'docks is a const, so the line `docks = 3;` fails and the program stops right there. The console.log comes after it, so it never runs and nothing is printed -- even though fuel, a let, was changed without any problem.'),
    -- #304 · arithmetic-operators: not the lesson's own step; addition, decimals
    ('jolt-arithmetic-predict', 'arith-003',
     E'What does this log?\n\nconsole.log(10 / 4);',
     E'What does this log?\n\nconsole.log(0.5 + 0.5);',
     'One number type holds whole numbers and decimals alike, so two halves add up to one whole: 1. It is displayed without a .0, because 1 and 1.0 are the same number. 0.10 would be adding the digits after the point on their own, and 0.55 would be joining them as text.'),
    -- #347 · string-length: says what was meant, and both branches make sense
    ('jolt-strings-completion', 'string-length-diagnose-01',
     E'This is meant to reject empty input, but it rejects everything. Which line is the cause?\n\nlet name = "Tati";\nif (name.length > 10) {\n  console.log("Too long");\n} else {\n  console.log("Empty");\n}',
     E'This is meant to print Empty only when name has no characters, but it prints Empty for "Tati". Which line is the cause?\n\nlet name = "Tati";\nif (name.length < 10) {\n  console.log("Empty");\n} else {\n  console.log("Ready");\n}',
     'The condition asks the wrong question. Empty means a length of 0, so the check should be `name.length === 0`. As written, any name shorter than ten characters counts as empty, and Tati has only four.');

INSERT INTO review_qo VALUES
    ('jolt-variables-predict', 'vars-predict-007', 'It prints 11',   'It prints 60'),
    ('jolt-variables-predict', 'vars-predict-007', 'It prints 10',   'It prints 50'),
    ('jolt-variables-predict', 'vars-predict-007', 'It prints both', 'It prints 60, then stops with an error'),
    ('jolt-arithmetic-predict', 'arith-003', '2.5',  '1'),
    ('jolt-arithmetic-predict', 'arith-003', '2',    '1.0'),
    ('jolt-arithmetic-predict', 'arith-003', '3',    '0.10'),
    ('jolt-arithmetic-predict', 'arith-003', '2.25', '0.55'),
    ('jolt-strings-completion', 'string-length-diagnose-01', 'if (name.length > 10) {',   'if (name.length < 10) {'),
    ('jolt-strings-completion', 'string-length-diagnose-01', 'console.log("Too long");', 'console.log("Ready");');

-- Options first, while the old prompt still marks a question as not yet done:
-- a re-run finds no old prompt, so it touches no option either.
UPDATE question_options o
SET option_text = r.new_text
FROM review_qo r, review_q w, questions q
WHERE o.question_id = q.id
  AND q.source = r.source AND q.external_ref = r.ref
  AND w.source = r.source AND w.ref = r.ref
  AND q.prompt = w.old_prompt
  AND o.option_text = r.old_text;

UPDATE questions q
SET prompt = w.new_prompt, explanation = w.new_why, updated_at = CURRENT_TIMESTAMP
FROM review_q w
WHERE q.source = w.source AND q.external_ref = w.ref
  AND q.prompt = w.old_prompt;

-- 1, 3, 6. One distractor each, on named questions, by its exact old text.
--          The correct option is never in this list.
CREATE TEMP TABLE review_o (source TEXT, ref TEXT, old_text TEXT, new_text TEXT) ON COMMIT DROP;

INSERT INTO review_o VALUES
    -- 1. not an answer, or true
    ('jolt-booleans-predict', 'bool-005',
     'a quoted word is not a boolean', '"false"'),
    ('jolt-values-completion', 'values-completion-002',
     '14 is the correct total of those three numbers', 'it reads left to right, so 2 + 3 comes first'),
    ('jolt-loops-completion', 'while-loops-explain-01',
     'while loops have no built-in limit on the number of passes', 'the condition cannot see changes made inside the loop'),
    ('jolt-algorithms-completion', 'base-cases-explain-01',
     'the computer can only hold a limited number of waiting calls', 'each call has to finish before the next one can start'),
    ('jolt-algorithms-completion', 'search-strategies-explain-01',
     'halving works on any list, but only gives the right answer when sorted', 'halving only works when the list has an even number of items'),
    ('jolt-algorithms-completion', 'complexity-explain-01',
     'the growth is the part that can be calculated before running anything', 'growth is measured in seconds, averaged over many runs'),
    ('jolt-objects-completion', 'for-of-for-in-recognise-01',
     'for (n of nums)', 'for (const n from nums)'),
    ('jolt-dom-completion', 'dom-as-tree-explain-01',
     'document.querySelector can be called on any element', 'the browser searches the whole page each time you ask'),
    -- 3. syntax not yet taught
    ('jolt-control-flow-completion', 'ternary-recognise-01',
     'if (n > 0) { return "up" }', 'if (n > 0) { label = "up" }'),
    ('jolt-array-methods-completion', 'sort-repair-01',
     'Flatten the list first with scores.flat()', 'Sort a copy: [...scores].sort()'),
    -- 6. explain: the same two-part shape as the answer
    ('jolt-values-completion', 'values-completion-009',
     'null is older than undefined', 'null means zero, while undefined means missing'),
    ('jolt-variables-completion', 'let-vs-const-explain-01',
     'const allows a value to be read only once after it is set', 'const can be read only once; the second read fails'),
    ('jolt-operators-completion', 'type-coercion-explain-01',
     'subtraction is always worked out before addition', '`-` turns the 5 into text; `+` turns it into a number'),
    ('jolt-operators-completion', 'logical-operators-explain-01',
     'false is treated as the end of the line', 'false stops the program, so nothing after it runs'),
    ('jolt-functions-completion', 'guard-clauses-explain-01',
     'an if without an else is faster to run', 'the guard runs last, after the rest of the function'),
    ('jolt-scope-completion', 'hoisting-tdz-explain-01',
     '`let` is not hoisted and `var` is', '`let` is not hoisted; only `var` exists early'),
    ('jolt-scope-completion', 'closures-explain-01',
     'the outer function keeps running quietly in the background', 'the outer function never really finishes; it keeps running'),
    ('jolt-scope-completion', 'loop-variable-capture-explain-01',
     '`let` stops the loop variable from changing', '`let` stops the loop variable changing; `var` does not'),
    ('jolt-arrays-completion', 'array-mutation-explain-01',
     'push is allowed to bypass const', 'push is special, so const lets it through'),
    ('jolt-arrays-completion', 'array-reference-identity-explain-01',
     'arrays can never be compared with ===', '=== cannot compare arrays, so it always says false'),
    ('jolt-array-methods-completion', 'for-each-explain-01',
     'forEach must always be the last method in a chain', 'forEach must come last, as a rule of the language'),
    ('jolt-array-methods-completion', 'reduce-explain-01',
     'an empty list would otherwise return an empty list', 'without a start, reduce returns the list unchanged'),
    ('jolt-errors-completion', 'debugging-strategy-explain-01',
     'several changes take longer to type', 'several changes take longer to type, and to undo'),
    ('jolt-dom-completion', 'element-properties-explain-01',
     'textContent is written back to the HTML automatically', 'the change is saved to the HTML file, then reloaded'),
    ('jolt-async-completion', 'event-loop-explain-01',
     'f runs straight away but its output is held back until the end', 'f runs straight away, but its output is held back until the end'),
    ('jolt-async-completion', 'error-propagation-explain-01',
     'the catch runs but the rejection is passed on to the next handler', 'the catch runs, but the rejection is passed on to the next handler'),
    ('jolt-async-completion', 'promise-all-explain-01',
     'it runs the promises on several threads at the same time', 'it runs the promises on several threads, all at the same time'),
    ('jolt-algorithms-completion', 'sorting-basics-explain-01',
     'the first pass compares items and a later one moves them', 'the first pass compares items; a later one moves them'),
    -- 6. repair: a wrong change written the way the right one is
    ('jolt-strings-completion', 'string-immutability-repair-01',
     'Call toUpperCase twice', 'Call it twice: name.toUpperCase().toUpperCase();'),
    ('jolt-functions-completion', 'return-values-repair-01',
     'Call add twice', 'Log it instead: console.log(add(2, 3));'),
    ('jolt-arrays-completion', 'array-mutation-repair-01',
     'Change `push` to `pop`', 'Rename it: `let backup = original;`'),
    ('jolt-objects-completion', 'object-references-repair-01',
     'Move the assignment above the copy', 'Rename it: `let backup = settings;`'),
    ('jolt-async-completion', 'callbacks-repair-01',
     'Call later twice', 'Delay it: setTimeout(hi(), 0);'),
    ('jolt-async-completion', 'async-await-repair-01',
     'Return Promise.resolve(a + 1)', 'total.then((v) => { console.log(v); });'),
    ('jolt-async-completion', 'error-propagation-repair-01',
     'Remove the async from go', 'go.catch((e) => { console.log(e); });'),
    ('jolt-algorithms-completion', 'base-cases-repair-01',
     'Call total twice', 'Start lower instead: total(3)');

UPDATE question_options o
SET option_text = r.new_text
FROM review_o r, questions q
WHERE o.question_id = q.id
  AND q.source = r.source AND q.external_ref = r.ref
  AND NOT o.is_correct
  AND o.option_text = r.old_text;

-- 2. Legacy distractors that stacked quotes on another mistake. Legacy rows
--    have no name; each is pinned by its exact prompt and the exact old text.
--    Seeds 001-010 insert options only with a new question, so nothing puts
--    the quotes back.
CREATE TEMP TABLE review_legacy (prompt TEXT, old_text TEXT, new_text TEXT) ON COMMIT DROP;

INSERT INTO review_legacy VALUES
    (E'What does this log?\n\nconsole.log("5" - 3);', '"53"', '53'),
    (E'What does this log?\n\nconst isAdmin = false;\nconst isOwner = true;\n\nconsole.log(isAdmin || isOwner);', '"isOwner"', 'isOwner'),
    (E'What does this log?\n\nconst name = "Ada";\nconsole.log(name.length + 1);', '"Ada1"', 'Ada1'),
    (E'What does this log?\n\nconst email = "ada@example.com";\nconsole.log(email.includes("@"));', '"@"', '@');

UPDATE question_options o
SET option_text = l.new_text
FROM review_legacy l, questions q
WHERE o.question_id = q.id
  AND q.source = 'internal'
  AND q.is_active  -- retired legacy copies keep what they had
  AND q.prompt = l.prompt
  AND NOT o.is_correct
  AND o.option_text = l.old_text;

COMMIT;
