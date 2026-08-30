-- Code Blitz: bring the original 58 questions up to the same standard.
--
-- Seeds 001 and 003 predate difficulty and explanation, so half the bank taught
-- and half only tested -- and a session mixed the two, which reads as a bug
-- rather than as history. This gives every surviving question a tier and a
-- reason, and retires seven that should not have been in a JavaScript learning
-- game in the first place.
--
-- Tiers mean reasoning, not appearance. `console.log([] + {})` is one short line
-- and sits at tier 3, because answering it means tracking two separate coercions;
-- `[3, 25, 4].sort((a, b) => a - b)` looks busier and sits at tier 1, because
-- once you know sort takes a comparator there is nothing left to work out.
--
-- Retirement is is_active = false, never DELETE: session_questions references
-- these rows, so deleting would either fail on the foreign key or take real play
-- history with it. A retired question stays readable in past runs and stops
-- being dealt.

BEGIN;

/**
 * Sets a tier and an explanation on an existing question, by prompt.
 *
 * Skips silently when the prompt is not present, so this is safe to run against
 * a database that never had the older seeds. Nothing enforces the match at
 * runtime -- content.test.ts does, by checking every prompt named here exists in
 * seed 001 or 003, which catches a typo when it is WRITTEN rather than leaving a
 * NULL nobody notices.
 */
CREATE OR REPLACE FUNCTION backfill_question(
    p_prompt TEXT,
    p_difficulty INTEGER,
    p_topic TEXT,
    p_explanation TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    UPDATE questions
    SET difficulty = p_difficulty, topic = p_topic, explanation = p_explanation
    WHERE prompt = p_prompt;
END;
$$;

/** Takes a question out of circulation without losing the rows that cite it. */
CREATE OR REPLACE FUNCTION retire_question(p_prompt TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE questions SET is_active = FALSE WHERE prompt = p_prompt;
END;
$$;


-- ---------------------------------------------------------------------------
-- Retired: seven questions.
--
-- Four do not teach JavaScript. Three are superseded by a better-written version
-- of the same question in seed 008 -- near-identical prompts, but the newer ones
-- carry a tier and an explanation, so keeping both would put a duplicate pair in
-- the bank where one half explains itself and the other does not.

-- Not a code question at all: the only recall-only item in the bank, and its
-- four distractors are the four complexities everyone memorises.
SELECT retire_question('What is the average time complexity of binary search on a sorted array?');

-- Tests arithmetic, not JavaScript. Nothing here is language behaviour.
SELECT retire_question(E'What does this log?\n\nconsole.log(10 % 3);');

-- Tests counting characters in a word.
SELECT retire_question(E'What does this log?\n\nconsole.log("Hello".indexOf("l"));');

-- API recall with no edge case; seed 008 asks about join() as part of a chain,
-- where it actually earns its place.
SELECT retire_question(E'What does this log?\n\nconsole.log(["a", "b"].join("-"));');

-- Superseded: seed 008 asks the same closure question and explains it.
SELECT retire_question(E'What does this log?\n\nfunction counter() {\n  let n = 0;\n  return () => ++n;\n}\nconst c = counter();\nc();\nconsole.log(c());');

-- Superseded: seed 008 asks the same var-capture question and explains it.
SELECT retire_question(E'What does this log?\n\nvar fns = [];\nfor (var i = 0; i < 3; i++) fns.push(() => i);\nconsole.log(fns[0]());');

-- Superseded: seed 008 pairs the same comparison with the EPSILON check, which
-- is the half that tells you what to actually do about it.
SELECT retire_question(E'What does this log?\n\nconsole.log(0.1 + 0.2 === 0.3);');


-- ---------------------------------------------------------------------------
-- TIER 1 -- fundamentals

SELECT backfill_question(E'What does this log?\n\nconsole.log(typeof null);', 1, 'variables',
    'A bug preserved from 1995 for backwards compatibility. Use `value === null` to test for null -- typeof cannot.');

SELECT backfill_question(E'What does this log?\n\nconst nums = [2, 4, 6];\nconsole.log(nums.map(n => n * 2));', 1, 'array-methods',
    'map() builds a new array by running the function on each item. The original is left alone.');

SELECT backfill_question(E'What does this log?\n\nconsole.log(1 + "1");', 1, 'variables',
    'With a string on either side, + concatenates rather than adds. Every other arithmetic operator converts to number instead.');

SELECT backfill_question(E'What does this log?\n\nconsole.log("5" - 3);', 1, 'variables',
    '- has no string meaning, so both sides convert to numbers. This is why + is the odd one out.');

SELECT backfill_question(E'What does this log?\n\nlet x;\nconsole.log(x);', 1, 'variables',
    'A declared variable with no value is undefined. null is different: it is a value you assign deliberately.');

SELECT backfill_question(E'What does this log?\n\nconsole.log([1, 2, 3].filter(n => n > 1).length);', 1, 'array-methods',
    'filter() keeps every item the test returns true for, so two survive.');

SELECT backfill_question(E'What does this log?\n\nconsole.log(Array.isArray([]));', 1, 'variables',
    'Arrays are objects, so typeof cannot tell them apart. Array.isArray() is the check that can.');

SELECT backfill_question(E'What does this log?\n\nconsole.log([3, 25, 4].sort((a, b) => a - b));', 1, 'array-methods',
    'The comparator makes the sort numeric. Returning a - b orders ascending; b - a orders descending.');

-- duplicates "5" - 3
SELECT retire_question(E'What does this log?\n\nconsole.log("5" * "2");');

-- duplicates typeof null plus the Array.isArray question
SELECT retire_question(E'What does this log?\n\nconsole.log(typeof []);');

SELECT backfill_question(E'What does this log?\n\nconsole.log(typeof function () {});', 1, 'variables',
    'Functions are the one kind of object typeof names specifically -- handy for checking a callback before calling it.');

SELECT backfill_question(E'What does this log?\n\nconsole.log([1, 2, 3].indexOf(4));', 1, 'arrays',
    'indexOf() returns -1 rather than undefined when nothing matches, because -1 is not a valid index.');

SELECT backfill_question(E'What does this log?\n\nconsole.log([1, 2, 3][5]);', 1, 'arrays',
    'Reading past the end gives undefined rather than an error. JavaScript arrays have no bounds check.');

SELECT backfill_question(E'What does this log?\n\nfunction f() {}\nconsole.log(f());', 1, 'functions',
    'A function with no return statement returns undefined. Forgetting return is the commonest cause of an unexpected undefined.');

SELECT backfill_question(E'What does this log?\n\nconsole.log(null ?? "fallback");', 1, 'conditionals',
    '?? falls back only on null or undefined. Here the left side is null, so the fallback is used.');

SELECT backfill_question(E'What does this log?\n\nconsole.log("abc".slice(-2));', 1, 'arrays',
    'A negative index counts back from the end, so this takes the last two characters.');


-- ---------------------------------------------------------------------------
-- TIER 2 -- practical

SELECT backfill_question(E'What does this log?\n\nconsole.log([10, 9, 1].sort());', 2, 'array-methods',
    'Without a comparator sort() compares as text, so "10" sorts before "9". Always pass (a, b) => a - b for numbers.');

SELECT backfill_question(E'What does this log?\n\nconsole.log([..."abc"]);', 2, 'arrays',
    'Strings are iterable, so spreading one gives an array of its characters -- shorter than split("").');

SELECT backfill_question(E'What does this log?\n\nconst a = { n: 1 };\nconst b = a;\nb.n = 2;\nconsole.log(a.n);', 2, 'objects',
    'Objects are held by reference. a and b are two names for one object, so a change through either is visible from both.');

-- duplicates [10, 9, 1].sort()
SELECT retire_question(E'What does this log?\n\nconsole.log([5, 100, 20].sort());');

-- cute, but nothing you would ever write
SELECT retire_question(E'What does this log?\n\nconsole.log(true + true);');

-- quirk recall
SELECT retire_question(E'What does this log?\n\nconsole.log(typeof NaN);');

SELECT backfill_question(E'What does this log?\n\nconsole.log([1, 2, 3].reduce((a, b) => a + b, 10));', 2, 'array-methods',
    'The second argument is the starting value, so the total begins at 10 rather than at the first item.');

SELECT backfill_question(E'What does this log?\n\nconsole.log([1, 2, 3].map(n => n * 2).filter(n => n > 3));', 2, 'array-methods',
    'Chains run left to right: double first, giving [2, 4, 6], then keep what is over 3.');

SELECT backfill_question(E'What does this log?\n\nconst a = [1, 2];\nconst b = [...a];\nb.push(3);\nconsole.log(a.length);', 2, 'arrays',
    'Spread makes a new array, so pushing to the copy leaves the original alone. It is a shallow copy -- nested objects are still shared.');

SELECT backfill_question(E'What does this log?\n\nconsole.log({ a: 1 } === { a: 1 });', 2, 'objects',
    'Objects compare by identity, not contents. These are two different objects that happen to look alike.');

-- == quirk
SELECT retire_question(E'What does this log?\n\nconsole.log(null == undefined);');

-- orphaned once its == pair goes
SELECT retire_question(E'What does this log?\n\nconsole.log(null === undefined);');

SELECT backfill_question(E'What does this log?\n\nconsole.log(Boolean("0"));', 2, 'variables',
    'Every string is truthy except the empty one. The characters inside do not matter, so "0" and "false" are both true.');

SELECT backfill_question(E'What does this log?\n\nconsole.log(Boolean([]));', 2, 'variables',
    'Every object is truthy, including empty arrays. Check `array.length` when you mean "has items".');

SELECT backfill_question(E'What does this log?\n\nlet x = 1;\nfunction f() { let x = 2; return x; }\nconsole.log(f() + x);', 2, 'scope',
    'The inner x shadows the outer one inside f only. So f() returns 2, and the outer x is still 1.');

SELECT backfill_question(E'What does this log?\n\nconst o = { a: 1 };\nconsole.log(o.b?.c);', 2, 'objects',
    '?. stops and gives undefined when the value before it is null or undefined. Without it this would throw.');

SELECT backfill_question(E'What does this log?\n\nconsole.log(0 ?? "fallback");', 2, 'conditionals',
    '?? only falls back on null or undefined. 0 is neither, so it survives -- which is usually what you wanted.');

SELECT backfill_question(E'What does this log?\n\nconsole.log(0 || "fallback");', 2, 'conditionals',
    '|| falls back on any falsy value, and 0 is falsy. This is the bug ?? was added to fix.');

SELECT backfill_question(E'What does this log?\n\nconsole.log("a,b,,c".split(",").length);', 2, 'arrays',
    'The two commas together produce an empty string between them, and it counts. Use .filter(Boolean) to drop empties.');

SELECT backfill_question(E'What does this log?\n\nconsole.log([1, [2, [3]]].flat().length);', 2, 'array-methods',
    'flat() unwraps one level by default, leaving [1, 2, [3]]. Pass a depth, or Infinity, to go further.');

-- a gotcha that no longer applies -- negative learning value
SELECT retire_question(E'What does this log?\n\nconsole.log(parseInt("08"));');

SELECT backfill_question(E'What does this log?\n\nconsole.log(parseInt("12px"));', 2, 'variables',
    'parseInt stops at the first character that is not a digit and returns what it has. Number("12px") would give NaN instead.');

-- edge-case recall
SELECT retire_question(E'What does this log?\n\nconsole.log(Number(""));');

SELECT backfill_question(E'What does this print?\n\nconst newWord = (str) => {\n    let result = "";\n\n    for (const char of str) {\n        result += char.repeat(3);\n    }\n\n    return result;\n};\n\nconsole.log(newWord("cat"));', 2, 'loops',
    'The loop takes one character at a time and repeats that character, so the letters stay in order: ccc, then aaa, then ttt.');


-- ---------------------------------------------------------------------------
-- TIER 3 -- deeper reasoning

-- the same coercion puzzle in another costume
SELECT retire_question(E'What does this log?\n\nconsole.log([1, 2] + [3, 4]);');

-- pure coercion puzzle -- nobody writes this
SELECT retire_question(E'What does this log?\n\nconsole.log([] + {});');

SELECT backfill_question(E'What does this log?\n\nconst o = { x: 1 };\nfunction f(v) { v = { x: 9 }; }\nf(o);\nconsole.log(o.x);', 3, 'objects',
    'The parameter is a copy of the reference. Reassigning it repoints the local name only -- setting v.x would have been visible.');

-- an == puzzle; "prefer ===" is taught better elsewhere
SELECT retire_question(E'What does this log?\n\nconsole.log("" == 0);');

SELECT backfill_question(E'What does this log?\n\nconst fns = [];\nfor (let i = 0; i < 3; i++) fns.push(() => i);\nconsole.log(fns[0]());', 3, 'scope',
    'let creates a fresh binding each iteration, so each function captured a different i. With var they would all see 3.');

-- truncating an array through length is rarely written
SELECT retire_question(E'What does this log?\n\nconst a = [1, 2, 3];\na.length = 1;\nconsole.log(a);');

SELECT backfill_question(E'In what order does this log?\n\nconsole.log("A");\nsetTimeout(() => console.log("B"), 0);\nconsole.log("C");', 3, 'async',
    'setTimeout queues a task for after the current code finishes. Even at 0ms it cannot jump the queue.');

SELECT backfill_question(E'In what order does this log?\n\nconsole.log("A");\nPromise.resolve().then(() => console.log("B"));\nconsole.log("C");', 3, 'async',
    'A .then() callback is a microtask: it waits for the synchronous code to finish, but runs before any timer.');

SELECT backfill_question(E'In what order does this log?\n\nsetTimeout(() => console.log("A"), 0);\nPromise.resolve().then(() => console.log("B"));\nconsole.log("C");', 3, 'async',
    'Synchronous first, then microtasks, then timers. The whole microtask queue drains before a single timer runs.');

SELECT backfill_question(E'In what order does this log?\n\nasync function run() {\n  console.log("A");\n  await null;\n  console.log("B");\n}\nrun();\nconsole.log("C");', 3, 'async',
    'An async function runs synchronously until its first await. Everything after that await is queued as a microtask.');

-- trivia -- calling it with no arguments is not a thing people do
SELECT retire_question(E'What does this log?\n\nconsole.log(Math.max());');

DROP FUNCTION backfill_question(TEXT, INTEGER, TEXT, TEXT);
DROP FUNCTION retire_question(TEXT);

-- Every active question now has a topic, so the rule can be checked against the
-- rows that were already there.
--
-- Migration 018 added questions_topic_required as NOT VALID: enforced for every
-- insert and update since, but never checked against the fifty-eight rows seeded
-- before the column existed. This is the other half. If the backfill above has
-- missed one, this fails and the whole seed rolls back -- which is the point.
-- A silent NULL would mean a question the dealer cannot balance and no test
-- counts.
--
-- The DO block runs first purely so the failure is useful. VALIDATE CONSTRAINT
-- reports only "violated by some row", which tells you nothing about WHICH row
-- in a table of a hundred and seventy. This names them, with their ids and the
-- start of their prompts, so the fix is obvious from the error alone.
DO $$
DECLARE
    v_offenders TEXT;
    v_count INTEGER;
BEGIN
    SELECT COUNT(*), string_agg('  [id ' || id || '] ' || left(replace(prompt, E'\n', ' | '), 90), E'\n')
    INTO v_count, v_offenders
    FROM questions
    WHERE is_active AND topic IS NULL;

    IF v_count > 0 THEN
        RAISE EXCEPTION E'% active question(s) still have no topic:\n\n%\n\nEvery active question needs one of the nine curriculum units. Add each of these to seed 009 -- as a backfill_question if it belongs in the bank, or a retire_question if it does not.', v_count, v_offenders;
    END IF;
END;
$$;

ALTER TABLE questions VALIDATE CONSTRAINT questions_topic_required;

COMMIT;
