-- Explanations for every Variables question.
--
-- All 21 had none. The column has existed since migration 017 and the client has
-- rendered it as `feedback-why` since GamePage was written, but the curriculum
-- seeds never filled it -- so the guided beginner path, the one part of Jolt a
-- new learner actually walks, was the part that explained nothing. The legacy
-- untagged bank has an explanation on every question.
--
-- THE STANDARD, set here for the rest of the curriculum to follow:
--
--   Explain the REASONING, never restate the answer. "The answer is 8" teaches
--   nothing that the correct option did not already say.
--
--   Name the misconception the distractors are built from. Every question here
--   has wrong options chosen deliberately -- the digits side by side, the name
--   instead of the value, the starting value instead of the current one -- and
--   the explanation is where that specific mistake gets addressed.
--
--   Stay inside taught grammar. Variables concepts may use names, values,
--   `console.log`, arithmetic and joining text. No arrays, no functions, no
--   methods, no terminology the learner has not met -- no "scope", no
--   "primitive", no "expression evaluation".
--
--   Short enough to read in the moment. One idea, two or three sentences.
--
-- Matched on a distinctive fragment of each prompt rather than the whole text,
-- because the prompts contain newlines and an exact match is one whitespace edit
-- away from silently updating nothing. A test asserts all 21 are covered.

BEGIN;

CREATE OR REPLACE FUNCTION explain(p_like TEXT, p_why TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    UPDATE questions q
    SET explanation = p_why
    FROM challenges ch, concepts c, topics t
    WHERE q.challenge_id = ch.id AND ch.concept_id = c.id AND c.topic_id = t.id
      AND t.slug = 'variables'
      AND q.prompt LIKE p_like
      -- Fill, never overwrite. The fragments also match questions added or
      -- rewritten after this file (029's replacements, 078's diagnostics), and
      -- an unguarded re-run gave those the explanation of a different question.
      AND q.explanation IS NULL;
END;
$$;

-- variables-name-values · a name stands for a value
SELECT explain('%let ship = "Aurora";
console.log(ship)%',
    'The name `ship` stands for the value `"Aurora"`. Logging the name prints what it holds, not the letters s-h-i-p. The quotes were only how the text was written in the code, so they are not printed.');
SELECT explain('%let port = "Mars"%',
    'The line `let home = port;` copies whatever `port` holds at that moment, which is `"Mars"`. Both names now stand for the same text, so logging either one prints `Mars`.');
SELECT explain('%let bays = 4%',
    'The name `bays` stands for the value 4. Writing the name without quotes looks up what it holds.');

-- declaration · bringing a name into existence
SELECT explain('%let cargo = 12%',
    'Declaring `cargo2` from `cargo` gives it the value `cargo` holds at that moment: `12`. It copies the value, never the name.');
SELECT explain('%let backup = ship;%',
    'Declaring `backup` from `ship` gives it whatever `ship` holds at that moment. A second name can be brought into existence from a first.');
SELECT explain('%let spare = 2;%',
    'Two names were declared, each holding its own value. Logging one of them shows only that one.');

-- initialization · a name with a value from the start
SELECT explain('%let crew = 3%',
    'The name was created and given 3 in the same line, so it already holds a value by the time it is logged.');

-- assignment · the right side is worked out first
SELECT explain('%let total = 5%',
    'The right side runs first: `total + 3` uses the current value, giving `5 + 3`, which is `8`. That result is then stored back into `total`, replacing the `5`.');
SELECT explain('%let count = 2%',
    'The right side is worked out before anything is stored: `count * 3` is `2 * 3`, which is `6`. Assignment then puts `6` back into `count`.');

-- reading-variables · a name without quotes is a lookup
SELECT explain('%let score = 10;
console.log(score)%',
    'Writing `score` without quotes tells JavaScript to look up what the name holds. With quotes it would print the word itself instead.');
SELECT explain('%let name = "Tati"%',
    'The name holds the text `Tati`. Quotes mark where text begins and ends in the code, so they are not part of the value and are not printed.');
SELECT explain('%let a = 5;%',
    'The line `let b = a;` reads `a` and stores its value, `5`. Logging `b` prints that copy.');

-- reassignment · one value at a time
SELECT explain('%let score = 10;
score = 20%',
    'The second line replaces what `score` holds. A variable keeps one value at a time, so the `10` is already gone by the time it is logged.');
SELECT explain('%let fuel = 100;
fuel = 80%',
    'Reassigning replaces the value outright. It does not add to it or subtract from it, so `fuel` simply holds `80`.');
SELECT explain('%let city = "Lagos"%',
    'The second line replaces the text the name holds. Nothing joins the two, so the old value is simply gone.');

-- let-vs-const · what const actually refuses
SELECT explain('%const total = 10;%',
    'A `const` name cannot be given a different value, and that includes building the new value out of the old one. The second line fails, so nothing is printed.');
SELECT explain('%const crew = 5;
crew = 6%',
    'A `const` name cannot be given a new value. The attempt on the second line fails, so the program stops there and never reaches the log.');
SELECT explain('%let seats = 4;%',
    'Only `seats` was changed, and it was declared with `let`, which allows that. Declaring `rows` as `const` nearby does not stop a different name from changing.');

-- variable-state · values as they are NOW
SELECT explain('%let fuel = 100;
let spare = 40%',
    'By the last line `fuel` holds `60` and `spare` holds `40`. The sum uses the values as they are at that moment, not the ones they started with.');
SELECT explain('%let a = 2;%',
    'The line `let b = a;` gave `b` a copy of the value `a` held then: `2`. Changing `a` afterwards does not reach back and change `b`.');
SELECT explain('%let total = 10;%',
    'The third line set `total` to `15`, using `bonus` as it was at that moment. Setting `bonus` to `0` afterwards changes only `bonus`.');

DROP FUNCTION explain(TEXT, TEXT);

COMMIT;
