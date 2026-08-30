-- Code Blitz: a curated modern JavaScript bank.
--
-- Written rather than imported, and that is a decision rather than a shortcut.
-- The QuizAPI provider in src/questions/providers is well built and has never
-- been run -- there is not one external row in the database. Three things make
-- it the wrong canonical source for this game:
--
--   * It carries no explanation. The whole point here is that a player who
--     answers wrong still learns something, and a bank that cannot explain
--     itself can only test.
--   * Its questions are recall-shaped ("which method does X") because it is a
--     general IT-certification service where JavaScript is one tag beside Linux
--     and Kubernetes. This game asks you to read code and predict it.
--   * Its Easy/Medium/Hard is self-reported per contributor, so it cannot carry
--     a difficulty that means "how much thinking", which is what our tiers mean.
--
-- The importer stays where it is. It is the seam if we ever want external
-- content as raw material, and nothing here depends on it.
--
-- Difficulty is how much THINKING a question takes, never how obscure it is:
--
--   1  fundamentals        one idea, read and answer
--   2  practical           several operations, or a method you must know cold
--   3  deeper reasoning    scope, closures, execution order, coercion
--   4  real-world          combines concepts, or debugs a realistic mistake
--
-- Every snippet whose prompt asks what the code produces is EXECUTED by
-- content.test.ts and compared against the option marked correct. That check has
-- already earned its keep on this project twice, so no answer here is asserted
-- on the strength of having been read carefully.

BEGIN;

/**
 * One question, its options, its tier and its explanation.
 *
 * Skips a prompt that already exists, so this is safe to re-run and safe to
 * apply on top of the older seeds. Options arrive as JSON in authored order;
 * display_order follows that order, and the serve path shuffles anyway.
 */
CREATE OR REPLACE FUNCTION seed_js_question(
    p_prompt TEXT,
    p_difficulty INTEGER,
    p_explanation TEXT,
    p_options JSONB
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_id BIGINT;
    v_option JSONB;
    v_pos INTEGER := 0;
BEGIN
    IF EXISTS (SELECT 1 FROM questions WHERE prompt = p_prompt) THEN
        RETURN;
    END IF;

    INSERT INTO questions (prompt, difficulty, explanation)
    VALUES (p_prompt, p_difficulty, p_explanation)
    RETURNING id INTO v_id;

    FOR v_option IN SELECT * FROM jsonb_array_elements(p_options) LOOP
        v_pos := v_pos + 1;

        INSERT INTO question_options (question_id, option_text, display_order, is_correct)
        VALUES (v_id, v_option ->> 'text', v_pos, (v_option ->> 'correct')::BOOLEAN);
    END LOOP;
END;
$$;


-- ===========================================================================
-- TIER 1 -- fundamentals
--
-- One idea each. A player who is new to JavaScript should be able to reason
-- their way to most of these, and the ones they miss should land as "oh, that
-- is how that works" rather than "how was I supposed to know that".
-- ===========================================================================

SELECT seed_js_question(
    E'What does this log?\n\nconst total = 4;\ntotal = 5;\nconsole.log(total);',
    1,
    'const cannot be reassigned. The error happens on the assignment, before anything is logged.',
    $j$[
      {"text": "TypeError", "correct": true},
      {"text": "5", "correct": false},
      {"text": "4", "correct": false},
      {"text": "undefined", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst scores = [3, 7];\nscores.push(9);\nconsole.log(scores.length);',
    1,
    'const stops the variable being reassigned, not the array being changed. push() mutates the same array.',
    $j$[
      {"text": "3", "correct": true},
      {"text": "2", "correct": false},
      {"text": "TypeError", "correct": false},
      {"text": "9", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst name = "Ada";\nconsole.log(`Hi ${name}, you have ${2 + 3} messages`);',
    1,
    'Template literals interpolate any expression inside ${}, so 2 + 3 is evaluated first.',
    $j$[
      {"text": "\"Hi Ada, you have 5 messages\"", "correct": true},
      {"text": "\"Hi Ada, you have 2 + 3 messages\"", "correct": false},
      {"text": "\"Hi ${name}, you have ${2 + 3} messages\"", "correct": false},
      {"text": "\"Hi Ada, you have 23 messages\"", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconsole.log([1, 2, 3].includes(2));',
    1,
    'includes() answers a yes/no question and returns a boolean. indexOf() is the one that returns a position.',
    $j$[
      {"text": "true", "correct": true},
      {"text": "1", "correct": false},
      {"text": "2", "correct": false},
      {"text": "false", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst user = { name: "Sam", age: 30 };\nconsole.log(Object.keys(user).length);',
    1,
    'Object.keys() returns an array of the object''s own keys, so its length is the number of properties.',
    $j$[
      {"text": "2", "correct": true},
      {"text": "1", "correct": false},
      {"text": "undefined", "correct": false},
      {"text": "[\"name\", \"age\"]", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconsole.log("javascript".toUpperCase().slice(0, 4));',
    1,
    'Methods run left to right: uppercase first, then take characters 0 up to (not including) 4.',
    $j$[
      {"text": "\"JAVA\"", "correct": true},
      {"text": "\"JAVAS\"", "correct": false},
      {"text": "\"java\"", "correct": false},
      {"text": "\"AVAS\"", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst add = (a, b) => a + b;\nconsole.log(add(2, 3));',
    1,
    'An arrow function with no braces returns its expression automatically -- no return keyword needed.',
    $j$[
      {"text": "5", "correct": true},
      {"text": "undefined", "correct": false},
      {"text": "23", "correct": false},
      {"text": "NaN", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst double = (n) => { n * 2 };\nconsole.log(double(4));',
    1,
    'Braces make it a function body, so it needs an explicit return. Without one the function returns undefined.',
    $j$[
      {"text": "undefined", "correct": true},
      {"text": "8", "correct": false},
      {"text": "4", "correct": false},
      {"text": "NaN", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nfunction greet(name = "friend") {\n  return `Hi ${name}`;\n}\nconsole.log(greet());',
    1,
    'A default parameter is used when the argument is undefined -- including when it is left out entirely.',
    $j$[
      {"text": "\"Hi friend\"", "correct": true},
      {"text": "\"Hi undefined\"", "correct": false},
      {"text": "\"Hi \"", "correct": false},
      {"text": "TypeError", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst items = ["a", "b", "c"];\nconsole.log(items.indexOf("d"));',
    1,
    'indexOf() returns -1 when the value is not found. That is why `indexOf(x) > -1` is the old way to test membership.',
    $j$[
      {"text": "-1", "correct": true},
      {"text": "undefined", "correct": false},
      {"text": "null", "correct": false},
      {"text": "false", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconsole.log(Boolean(""), Boolean("0"));',
    1,
    'Only the empty string is falsy. Any string with characters in it is truthy, including "0" and "false".',
    $j$[
      {"text": "false true", "correct": true},
      {"text": "false false", "correct": false},
      {"text": "true false", "correct": false},
      {"text": "true true", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst config = { theme: "dark" };\nconsole.log(config.fontSize);',
    1,
    'Reading a property that does not exist gives undefined rather than an error. Only reading a property OF undefined throws.',
    $j$[
      {"text": "undefined", "correct": true},
      {"text": "null", "correct": false},
      {"text": "TypeError", "correct": false},
      {"text": "ReferenceError", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst nums = [4, 8, 15];\nconst [first, , third] = nums;\nconsole.log(first, third);',
    1,
    'Array destructuring goes by position. The empty slot skips an element without naming it.',
    $j$[
      {"text": "4 15", "correct": true},
      {"text": "4 8", "correct": false},
      {"text": "8 15", "correct": false},
      {"text": "4 undefined", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst { city } = { name: "Ada", city: "London" };\nconsole.log(city);',
    1,
    'Object destructuring matches by property NAME, not position, so order in the object does not matter.',
    $j$[
      {"text": "\"London\"", "correct": true},
      {"text": "\"Ada\"", "correct": false},
      {"text": "undefined", "correct": false},
      {"text": "{ city: \"London\" }", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconsole.log(typeof "5", typeof 5);',
    1,
    'typeof returns a string naming the type. Quotes make it a string no matter what is inside them.',
    $j$[
      {"text": "\"string\" \"number\"", "correct": true},
      {"text": "\"number\" \"number\"", "correct": false},
      {"text": "\"string\" \"string\"", "correct": false},
      {"text": "\"String\" \"Number\"", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nlet count = 0;\nfor (let i = 0; i < 3; i++) {\n  count += i;\n}\nconsole.log(count);',
    1,
    'The loop adds 0, then 1, then 2. It stops before i reaches 3 because the test is `<`, not `<=`.',
    $j$[
      {"text": "3", "correct": true},
      {"text": "6", "correct": false},
      {"text": "2", "correct": false},
      {"text": "0", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst word = "hello";\nconsole.log(word[0], word.at(-1));',
    1,
    'Strings index like arrays, and at(-1) counts from the end -- much clearer than length - 1.',
    $j$[
      {"text": "\"h\" \"o\"", "correct": true},
      {"text": "\"h\" \"l\"", "correct": false},
      {"text": "\"hello\" \"o\"", "correct": false},
      {"text": "undefined \"o\"", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconsole.log([3, 1, 2].sort((a, b) => a - b));',
    1,
    'sort() compares as text by default. The (a, b) => a - b comparator is what makes it numeric.',
    $j$[
      {"text": "[1, 2, 3]", "correct": true},
      {"text": "[3, 1, 2]", "correct": false},
      {"text": "[3, 2, 1]", "correct": false},
      {"text": "[1, 3, 2]", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst a = "5";\nconst b = 5;\nconsole.log(a === b, a == b);',
    1,
    '=== compares type as well as value. == converts first, which is why it is the one that surprises people.',
    $j$[
      {"text": "false true", "correct": true},
      {"text": "true true", "correct": false},
      {"text": "false false", "correct": false},
      {"text": "true false", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst tags = ["a", "b"];\nconst more = [...tags, "c"];\nconsole.log(tags.length, more.length);',
    1,
    'Spread copies the elements into a NEW array. The original is untouched, which is the point of using it.',
    $j$[
      {"text": "2 3", "correct": true},
      {"text": "3 3", "correct": false},
      {"text": "2 2", "correct": false},
      {"text": "3 4", "correct": false}
    ]$j$::JSONB);


-- ===========================================================================
-- TIER 2 -- practical
--
-- The methods and syntax you reach for daily. Several operations combined, or
-- one method you have to know cold. Nothing here is a trick; getting one wrong
-- usually means a real gap rather than a missed footnote.
-- ===========================================================================

SELECT seed_js_question(
    E'What does this log?\n\nconst prices = [10, 20, 30];\nconsole.log(prices.map((p) => p * 2).filter((p) => p > 25));',
    2,
    'map() transforms every item, then filter() keeps the ones passing the test. Both return new arrays, so prices is unchanged.',
    $j$[
      {"text": "[40, 60]", "correct": true},
      {"text": "[20, 40, 60]", "correct": false},
      {"text": "[60]", "correct": false},
      {"text": "[30]", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst nums = [1, 2, 3, 4];\nconsole.log(nums.reduce((sum, n) => sum + n, 0));',
    2,
    'reduce() folds the array into one value. The 0 is the starting accumulator -- leave it out and the first item is used instead.',
    $j$[
      {"text": "10", "correct": true},
      {"text": "0", "correct": false},
      {"text": "[1, 2, 3, 4]", "correct": false},
      {"text": "4", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst users = [{ name: "Ada" }, { name: "Sam" }];\nconsole.log(users.find((u) => u.name === "Sam"));',
    2,
    'find() returns the first matching ITEM, or undefined. filter() is the one that returns an array.',
    $j$[
      {"text": "{ name: \"Sam\" }", "correct": true},
      {"text": "[{ name: \"Sam\" }]", "correct": false},
      {"text": "\"Sam\"", "correct": false},
      {"text": "1", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst nums = [1, 2, 3];\nconsole.log(nums.find((n) => n > 10));',
    2,
    'find() returns undefined when nothing matches -- not null and not -1. That is why the result needs checking before you use it.',
    $j$[
      {"text": "undefined", "correct": true},
      {"text": "null", "correct": false},
      {"text": "-1", "correct": false},
      {"text": "[]", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconsole.log([1, 2, 3].some((n) => n > 2), [1, 2, 3].every((n) => n > 2));',
    2,
    'some() asks "any of them?", every() asks "all of them?". Both return a boolean and stop as soon as they know.',
    $j$[
      {"text": "true false", "correct": true},
      {"text": "false true", "correct": false},
      {"text": "true true", "correct": false},
      {"text": "3 false", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst user = { profile: null };\nconsole.log(user.profile?.city);',
    2,
    'Optional chaining short-circuits to undefined when the value before ?. is null or undefined, instead of throwing.',
    $j$[
      {"text": "undefined", "correct": true},
      {"text": "null", "correct": false},
      {"text": "TypeError", "correct": false},
      {"text": "false", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst count = 0;\nconsole.log(count || "none", count ?? "none");',
    2,
    '|| falls back on any falsy value, so 0 triggers it. ?? only falls back on null or undefined, which is usually what you meant.',
    $j$[
      {"text": "\"none\" 0", "correct": true},
      {"text": "0 0", "correct": false},
      {"text": "\"none\" \"none\"", "correct": false},
      {"text": "0 \"none\"", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst base = { a: 1, b: 2 };\nconst next = { ...base, b: 3 };\nconsole.log(next);',
    2,
    'Spread copies the properties, then later keys win. This is the standard way to override one field without mutating the original.',
    $j$[
      {"text": "{ a: 1, b: 3 }", "correct": true},
      {"text": "{ a: 1, b: 2 }", "correct": false},
      {"text": "{ b: 3 }", "correct": false},
      {"text": "{ a: 1, b: 2, b: 3 }", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nfunction total(...nums) {\n  return nums.length;\n}\nconsole.log(total(1, 2, 3));',
    2,
    'Rest syntax gathers the remaining arguments into a real array -- unlike the old arguments object, which is not one.',
    $j$[
      {"text": "3", "correct": true},
      {"text": "1", "correct": false},
      {"text": "6", "correct": false},
      {"text": "undefined", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst { name, role = "user" } = { name: "Ada" };\nconsole.log(name, role);',
    2,
    'A destructuring default fills in when the property is missing or undefined. Handy for options objects.',
    $j$[
      {"text": "\"Ada\" \"user\"", "correct": true},
      {"text": "\"Ada\" undefined", "correct": false},
      {"text": "\"Ada\" null", "correct": false},
      {"text": "undefined \"user\"", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst scores = { a: 1, b: 2 };\nconsole.log(Object.entries(scores));',
    2,
    'Object.entries() gives [key, value] pairs -- the usual way to iterate an object with array methods.',
    $j$[
      {"text": "[[\"a\", 1], [\"b\", 2]]", "correct": true},
      {"text": "[\"a\", \"b\"]", "correct": false},
      {"text": "[1, 2]", "correct": false},
      {"text": "{ a: 1, b: 2 }", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst words = ["cat", "dog"];\nconsole.log(words.map((w) => w.length).join("-"));',
    2,
    'map() produces [3, 3], then join() makes a string. Chaining like this reads top to bottom as one pipeline.',
    $j$[
      {"text": "\"3-3\"", "correct": true},
      {"text": "[3, 3]", "correct": false},
      {"text": "\"cat-dog\"", "correct": false},
      {"text": "6", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst nums = [1, 2, 3];\nconst result = nums.forEach((n) => n * 2);\nconsole.log(result);',
    2,
    'forEach() always returns undefined -- it is for side effects. Reach for map() when you want the transformed array back.',
    $j$[
      {"text": "undefined", "correct": true},
      {"text": "[2, 4, 6]", "correct": false},
      {"text": "[1, 2, 3]", "correct": false},
      {"text": "6", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst nested = [1, [2, [3, [4]]]];\nconsole.log(nested.flat(2));',
    2,
    'flat(depth) unwraps that many levels. The default is 1, and flat(Infinity) flattens all the way down.',
    $j$[
      {"text": "[1, 2, 3, [4]]", "correct": true},
      {"text": "[1, 2, 3, 4]", "correct": false},
      {"text": "[1, [2, [3, [4]]]]", "correct": false},
      {"text": "[1, 2, [3, [4]]]", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst list = [5, 10, 15];\nconsole.log(list.slice(1), list.length);',
    2,
    'slice() copies a section and leaves the original alone. splice() is the one that mutates -- an easy pair to mix up.',
    $j$[
      {"text": "[10, 15] 3", "correct": true},
      {"text": "[10, 15] 2", "correct": false},
      {"text": "[5] 3", "correct": false},
      {"text": "[10, 15] 1", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst apply = (fn, value) => fn(value);\nconsole.log(apply((n) => n + 1, 4));',
    2,
    'A higher-order function takes a function as an argument. That is all a callback is -- a function passed somewhere to be called later.',
    $j$[
      {"text": "5", "correct": true},
      {"text": "4", "correct": false},
      {"text": "undefined", "correct": false},
      {"text": "NaN", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconsole.log(Number("12") + Number("3"));',
    2,
    'Number() converts before the arithmetic, so this adds rather than concatenates. Without it, "12" + "3" would be "123".',
    $j$[
      {"text": "15", "correct": true},
      {"text": "123", "correct": false},
      {"text": "NaN", "correct": false},
      {"text": "153", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst set = new Set([1, 2, 2, 3]);\nconsole.log(set.size, [...set]);',
    2,
    'A Set keeps only distinct values, so spreading one back into an array is the shortest way to dedupe.',
    $j$[
      {"text": "3 [1, 2, 3]", "correct": true},
      {"text": "4 [1, 2, 2, 3]", "correct": false},
      {"text": "3 [1, 2, 2]", "correct": false},
      {"text": "4 [1, 2, 3]", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst user = { name: "Ada" };\nconst copy = { ...user };\ncopy.name = "Sam";\nconsole.log(user.name);',
    2,
    'Spread makes a new object, so changing the copy leaves the original alone. This is a SHALLOW copy -- nested objects are still shared.',
    $j$[
      {"text": "\"Ada\"", "correct": true},
      {"text": "\"Sam\"", "correct": false},
      {"text": "undefined", "correct": false},
      {"text": "TypeError", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst outer = { inner: { n: 1 } };\nconst copy = { ...outer };\ncopy.inner.n = 99;\nconsole.log(outer.inner.n);',
    2,
    'Spread copies one level deep. Both objects still point at the SAME inner object, so changing it through either is visible from both.',
    $j$[
      {"text": "99", "correct": true},
      {"text": "1", "correct": false},
      {"text": "undefined", "correct": false},
      {"text": "TypeError", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconsole.log([10, 1, 5].sort());',
    2,
    'sort() converts to strings by default, so "10" sorts before "5". Pass (a, b) => a - b whenever the values are numbers.',
    $j$[
      {"text": "[1, 10, 5]", "correct": true},
      {"text": "[1, 5, 10]", "correct": false},
      {"text": "[10, 1, 5]", "correct": false},
      {"text": "[10, 5, 1]", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst text = "a,b,,c";\nconsole.log(text.split(",").filter(Boolean));',
    2,
    'split() keeps the empty piece between the two commas; filter(Boolean) drops every falsy entry, which is a neat way to clean a list.',
    $j$[
      {"text": "[\"a\", \"b\", \"c\"]", "correct": true},
      {"text": "[\"a\", \"b\", \"\", \"c\"]", "correct": false},
      {"text": "[\"a\", \"b\"]", "correct": false},
      {"text": "3", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst obj = { a: 1 };\nconsole.log("a" in obj, "b" in obj);',
    2,
    'in tests whether the KEY exists, regardless of its value. Useful when a property might legitimately hold undefined.',
    $j$[
      {"text": "true false", "correct": true},
      {"text": "1 undefined", "correct": false},
      {"text": "true true", "correct": false},
      {"text": "false false", "correct": false}
    ]$j$::JSONB);



-- ===========================================================================
-- TIER 3 -- deeper reasoning
--
-- Scope, closures, execution order, coercion. These take a moment of actual
-- thought rather than recall, and the explanation is doing real work: getting
-- one wrong is usually a model that needs correcting, not a fact that needs
-- memorising.
-- ===========================================================================

SELECT seed_js_question(
    E'What does this log?\n\nfunction counter() {\n  let n = 0;\n  return () => ++n;\n}\nconst next = counter();\nnext();\nconsole.log(next());',
    3,
    'The returned arrow keeps a live reference to n, not a copy. Each call to counter() makes a fresh, independent n.',
    $j$[
      {"text": "2", "correct": true},
      {"text": "1", "correct": false},
      {"text": "0", "correct": false},
      {"text": "undefined", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst a = counter();\nconst b = counter();\nfunction counter() {\n  let n = 0;\n  return () => ++n;\n}\na();\nconsole.log(b());',
    3,
    'Each call to counter() creates a separate closure with its own n, so a and b never share state. Function declarations hoist, which is why calling it above works.',
    $j$[
      {"text": "1", "correct": true},
      {"text": "2", "correct": false},
      {"text": "0", "correct": false},
      {"text": "ReferenceError", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst fns = [];\nfor (var i = 0; i < 3; i++) {\n  fns.push(() => i);\n}\nconsole.log(fns[0]());',
    3,
    'var has one binding for the whole loop, so all three functions see the same i -- which is 3 by the time they run. Swap in let for a fresh binding per iteration.',
    $j$[
      {"text": "3", "correct": true},
      {"text": "0", "correct": false},
      {"text": "1", "correct": false},
      {"text": "undefined", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconsole.log(typeof value);\nlet value = 3;',
    3,
    'let is hoisted but not initialised -- the temporal dead zone. Unlike an undeclared name, typeof does not protect you here.',
    $j$[
      {"text": "ReferenceError", "correct": true},
      {"text": "undefined", "correct": false},
      {"text": "number", "correct": false},
      {"text": "TypeError", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'In what order does this log?\n\nconsole.log("A");\nsetTimeout(() => console.log("B"), 0);\nPromise.resolve().then(() => console.log("C"));\nconsole.log("D");',
    3,
    'Synchronous code first, then promise callbacks (microtasks), then timers. A 0ms timeout still waits for the microtask queue to empty.',
    $j$[
      {"text": "A, D, C, B", "correct": true},
      {"text": "A, D, B, C", "correct": false},
      {"text": "A, B, C, D", "correct": false},
      {"text": "A, C, D, B", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'In what order does this log?\n\nasync function load() {\n  console.log("start");\n  await null;\n  console.log("after await");\n}\nload();\nconsole.log("sync");',
    3,
    'Everything before the first await runs immediately; everything after it is queued as a microtask. That is why "sync" beats "after await".',
    $j$[
      {"text": "start, sync, after await", "correct": true},
      {"text": "start, after await, sync", "correct": false},
      {"text": "sync, start, after await", "correct": false},
      {"text": "start, sync", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst obj = { a: 1 };\nfunction change(o) {\n  o = { a: 99 };\n}\nchange(obj);\nconsole.log(obj.a);',
    3,
    'The parameter is a copy of the reference. Reassigning it repoints the local name only -- mutating o.a instead would have been visible.',
    $j$[
      {"text": "1", "correct": true},
      {"text": "99", "correct": false},
      {"text": "undefined", "correct": false},
      {"text": "TypeError", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst obj = { a: 1 };\nfunction change(o) {\n  o.a = 99;\n}\nchange(obj);\nconsole.log(obj.a);',
    3,
    'Both names point at the same object, so mutating through the parameter is visible outside. This is the pair to the reassignment case.',
    $j$[
      {"text": "99", "correct": true},
      {"text": "1", "correct": false},
      {"text": "undefined", "correct": false},
      {"text": "TypeError", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconsole.log([] == false, [] === false);',
    3,
    '== converts both sides: [] becomes "" becomes 0, and false becomes 0. === skips all of that, which is why it is the safe default.',
    $j$[
      {"text": "true false", "correct": true},
      {"text": "false false", "correct": false},
      {"text": "true true", "correct": false},
      {"text": "false true", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconsole.log(0.1 + 0.2 === 0.3, Math.abs(0.1 + 0.2 - 0.3) < Number.EPSILON);',
    3,
    'Binary floating point cannot represent 0.1 exactly, so the sum is slightly off. Comparing within a small tolerance is the usual fix.',
    $j$[
      {"text": "false true", "correct": true},
      {"text": "true true", "correct": false},
      {"text": "false false", "correct": false},
      {"text": "true false", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst timer = {\n  label: "run",\n  start() {\n    return this.label;\n  }\n};\nconsole.log(timer.start());',
    3,
    'In a method call, this is whatever came before the dot. Pull start() out into a bare variable and that link is lost.',
    $j$[
      {"text": "\"run\"", "correct": true},
      {"text": "undefined", "correct": false},
      {"text": "TypeError", "correct": false},
      {"text": "\"timer\"", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst nums = [1, 2, 3];\nconst doubled = nums.map((n) => {\n  n * 2;\n});\nconsole.log(doubled);',
    3,
    'The braces made a body with no return, so the callback returns undefined for every item. Drop the braces or add return.',
    $j$[
      {"text": "[undefined, undefined, undefined]", "correct": true},
      {"text": "[2, 4, 6]", "correct": false},
      {"text": "[1, 2, 3]", "correct": false},
      {"text": "undefined", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst cart = [{ price: 10 }, { price: 5 }];\nconsole.log(cart.reduce((sum, item) => sum + item.price, 0));',
    3,
    'The 0 seed matters: without it reduce() starts with the first OBJECT, and adding a number to it gives a string.',
    $j$[
      {"text": "15", "correct": true},
      {"text": "[object Object]5", "correct": false},
      {"text": "0", "correct": false},
      {"text": "NaN", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nlet x = 1;\nfunction show() {\n  console.log(x);\n  let x = 2;\n}\nshow();',
    3,
    'The inner let shadows the outer x for the whole function body, so the log hits the temporal dead zone rather than reading the outer 1.',
    $j$[
      {"text": "ReferenceError", "correct": true},
      {"text": "1", "correct": false},
      {"text": "2", "correct": false},
      {"text": "undefined", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconsole.log([1, 2, 3].map((n) => n * 2).reduce((a, b) => a + b));',
    3,
    'Chained pipelines read left to right: double each item, then fold to a total. With no seed, reduce() starts from the first element.',
    $j$[
      {"text": "12", "correct": true},
      {"text": "6", "correct": false},
      {"text": "[2, 4, 6]", "correct": false},
      {"text": "NaN", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst make = () => ({ n: 1 });\nconsole.log(make().n);',
    3,
    'Wrapping the object in parentheses tells JavaScript it is a value, not a function body. Without them the arrow returns undefined.',
    $j$[
      {"text": "1", "correct": true},
      {"text": "undefined", "correct": false},
      {"text": "SyntaxError", "correct": false},
      {"text": "{ n: 1 }", "correct": false}
    ]$j$::JSONB);


-- ===========================================================================
-- TIER 4 -- real-world
--
-- Several concepts at once, or a mistake you would genuinely make. The prompts
-- vary here on purpose -- predict, debug, choose -- because a bank where every
-- question has the same shape gets skimmed rather than read.
-- ===========================================================================

SELECT seed_js_question(
    E'In what order does this log?\n\nasync function save() {\n  console.log("saving");\n  await Promise.resolve();\n  console.log("saved");\n}\nsave();\nPromise.resolve().then(() => console.log("other"));\nconsole.log("done");',
    4,
    'Sync first: "saving", "done". Then the microtask queue in order: save() resumes before the .then() that was queued after it.',
    $j$[
      {"text": "saving, done, saved, other", "correct": true},
      {"text": "saving, done, other, saved", "correct": false},
      {"text": "saving, saved, other, done", "correct": false},
      {"text": "done, saving, saved, other", "correct": false}
    ]$j$::JSONB);

-- Asks about the Promise rather than about how a Promise PRINTS: console.log of
-- one shows different text in Node and in a browser, so an answer written that
-- way would be right in one place and wrong in the other.
SELECT seed_js_question(
    E'What does this log?\n\nasync function getUser() {\n  return { name: "Ada" };\n}\nconsole.log(getUser() instanceof Promise);',
    4,
    'An async function always returns a Promise, even when its body returns a plain value. You need await or .then() to get at what is inside.',
    $j$[
      {"text": "true", "correct": true},
      {"text": "false", "correct": false},
      {"text": "{ name: \"Ada\" }", "correct": false},
      {"text": "undefined", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What is the bug in this code?\n\nasync function load(ids) {\n  const users = ids.map(async (id) => await fetchUser(id));\n  return users;\n}',
    4,
    'map() with an async callback gives an array of Promises, not values. Wrap it: return Promise.all(ids.map(...)).',
    $j$[
      {"text": "It returns an array of Promises rather than an array of users", "correct": true},
      {"text": "await cannot be used inside map()", "correct": false},
      {"text": "The function should not be marked async", "correct": false},
      {"text": "ids.map() mutates ids", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nasync function run() {\n  try {\n    await Promise.reject(new Error("nope"));\n  } catch (err) {\n    console.log(err.message);\n  }\n}\nrun();',
    4,
    'await turns a rejected promise into a thrown error, so try/catch works on async code exactly as it does on synchronous code.',
    $j$[
      {"text": "\"nope\"", "correct": true},
      {"text": "\"Error: nope\"", "correct": false},
      {"text": "undefined", "correct": false},
      {"text": "Nothing -- the rejection is unhandled", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What is the bug in this code?\n\nconst res = await fetch("/api/user");\nconst user = res.json();\nconsole.log(user.name);',
    4,
    'res.json() returns a Promise, so it needs its own await. fetch resolving only means the headers arrived.',
    $j$[
      {"text": "res.json() is not awaited, so user is a Promise", "correct": true},
      {"text": "fetch needs a method option", "correct": false},
      {"text": "res.json() should be res.body", "correct": false},
      {"text": "fetch cannot be awaited", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What is the bug in this code?\n\nconst res = await fetch("/api/user");\nconst user = await res.json();',
    4,
    'fetch only rejects on network failure. A 404 or 500 resolves normally, so you have to check res.ok yourself.',
    $j$[
      {"text": "A 404 or 500 is not treated as an error -- res.ok is never checked", "correct": true},
      {"text": "await cannot be used twice in a row", "correct": false},
      {"text": "res.json() should be JSON.parse(res)", "correct": false},
      {"text": "fetch requires a try/catch to compile", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'Which modern feature makes this clearer?\n\nconst city = user && user.address && user.address.city;',
    4,
    'Optional chaining says the same thing in one step: user?.address?.city. It also stops at null, which the && chain does not distinguish.',
    $j$[
      {"text": "Optional chaining: user?.address?.city", "correct": true},
      {"text": "Nullish coalescing: user ?? user.address ?? user.address.city", "correct": false},
      {"text": "Destructuring: const { city } = user", "correct": false},
      {"text": "Spread: const city = { ...user }.address.city", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'Which approach correctly gets the total price?\n\nconst cart = [{ price: 10 }, { price: 5 }];',
    4,
    'reduce() folds a list into one value. map() would give [10, 5], and forEach() returns undefined however you use it.',
    $j$[
      {"text": "cart.reduce((sum, item) => sum + item.price, 0)", "correct": true},
      {"text": "cart.map((item) => item.price)", "correct": false},
      {"text": "cart.forEach((item) => item.price)", "correct": false},
      {"text": "cart.filter((item) => item.price).length", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nfunction parse(text) {\n  try {\n    return JSON.parse(text);\n  } catch {\n    return null;\n  } finally {\n    console.log("done");\n  }\n}\nconsole.log(parse("oops"));',
    4,
    'finally runs on both paths, and it runs BEFORE the value is returned to the caller -- so "done" is logged first.',
    $j$[
      {"text": "\"done\"\nnull", "correct": true},
      {"text": "null\n\"done\"", "correct": false},
      {"text": "\"done\"\nundefined", "correct": false},
      {"text": "SyntaxError", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What is the bug in this code?\n\nfunction addItem(list, item) {\n  list.push(item);\n  return list;\n}',
    4,
    'It mutates the caller''s array. Returning [...list, item] keeps the original intact, which is what callers usually expect.',
    $j$[
      {"text": "It mutates the array the caller passed in", "correct": true},
      {"text": "push() does not return the new array", "correct": false},
      {"text": "list should be declared with const", "correct": false},
      {"text": "It will throw if list is frozen", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst settings = { retries: 0 };\nconst retries = settings.retries || 3;\nconsole.log(retries);',
    4,
    'A deliberate 0 is falsy, so || silently replaces it with the default. This is the classic case for ?? instead.',
    $j$[
      {"text": "3", "correct": true},
      {"text": "0", "correct": false},
      {"text": "undefined", "correct": false},
      {"text": "null", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'Which export can be imported under any name?\n\n// utils.js',
    4,
    'A default export has no name of its own, so the importing file chooses one. Named exports must match, unless you rename with as.',
    $j$[
      {"text": "export default function format() {}", "correct": true},
      {"text": "export function format() {}", "correct": false},
      {"text": "export const format = () => {}", "correct": false},
      {"text": "export { format }", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst rows = [3, 1, 2];\nconst sorted = [...rows].sort((a, b) => a - b);\nconsole.log(rows, sorted);',
    4,
    'sort() mutates in place, so copying first is what keeps the original order. Without the spread both names would show the sorted array.',
    $j$[
      {"text": "[3, 1, 2] [1, 2, 3]", "correct": true},
      {"text": "[1, 2, 3] [1, 2, 3]", "correct": false},
      {"text": "[3, 1, 2] [3, 1, 2]", "correct": false},
      {"text": "[1, 2, 3] [3, 1, 2]", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What is the bug in this code?\n\nconst ids = [1, 2, 3];\nlet found;\nids.forEach((id) => {\n  if (id === 2) return id;\n});\nconsole.log(found);',
    4,
    'return inside forEach() only exits that one callback -- it cannot return from the outer function or stop the loop. find() is the right tool.',
    $j$[
      {"text": "return inside forEach() does not return from the outer code", "correct": true},
      {"text": "forEach() cannot take an arrow function", "correct": false},
      {"text": "found must be declared with const", "correct": false},
      {"text": "=== should be == when comparing numbers", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst users = [{ id: 1, tags: ["a"] }];\nconst copy = structuredClone(users);\ncopy[0].tags.push("b");\nconsole.log(users[0].tags.length);',
    4,
    'structuredClone() copies all the way down, so nested arrays are independent. Spread or Object.assign would have shared that inner array.',
    $j$[
      {"text": "1", "correct": true},
      {"text": "2", "correct": false},
      {"text": "0", "correct": false},
      {"text": "TypeError", "correct": false}
    ]$j$::JSONB);



-- ---------------------------------------------------------------------------
-- TIER 4, second pass.
--
-- Tier 4 was the thinnest tier at fifteen, which matters more than the raw
-- number suggests: the curve wants a tier-4 question for the last slot of every
-- run, so the hardest content repeats soonest. These are the same kind of
-- question, not more of the same questions -- each one asks you to hold two or
-- three familiar ideas at once, which is what tier 4 is for. None of them turn
-- on a rule you would have to have memorised.

SELECT seed_js_question(
    E'What does this log?\n\nPromise.resolve(1)\n  .then((n) => Promise.resolve(n + 1))\n  .then((n) => console.log(n));',
    4,
    'Returning a promise from .then() makes the chain wait for it and hands on the value inside, rather than the promise itself. Chains flatten.',
    $j$[
      {"text": "2", "correct": true},
      {"text": "1", "correct": false},
      {"text": "3", "correct": false},
      {"text": "undefined", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst delay = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));\nPromise.all([delay(20, "a"), delay(0, "b")]).then((vs) => console.log(vs));',
    4,
    'Promise.all resolves in the order you passed the promises in, not the order they finished. "b" settles first but still lands second.',
    $j$[
      {"text": "[\"a\", \"b\"]", "correct": true},
      {"text": "[\"b\", \"a\"]", "correct": false},
      {"text": "[\"a\"]", "correct": false},
      {"text": "\"ab\"", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nasync function save() {\n  try {\n    return Promise.reject(new Error("boom"));\n  } catch {\n    return "caught";\n  }\n}\nsave().catch((e) => console.log(e.message));',
    4,
    'The promise is returned, not awaited, so it settles after the try block has already been left -- the catch never sees it. `return await` inside the try would fix it.',
    $j$[
      {"text": "\"boom\"", "correct": true},
      {"text": "\"caught\"", "correct": false},
      {"text": "undefined", "correct": false},
      {"text": "Nothing is logged", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'In what order does this log?\n\nfor (var i = 1; i <= 3; i++) {\n  setTimeout(() => console.log(i), 0);\n}',
    4,
    'var gives one binding for the whole loop, and the timers all run after it finishes -- by then i is 4. Changing var to let fixes it.',
    $j$[
      {"text": "4, 4, 4", "correct": true},
      {"text": "1, 2, 3", "correct": false},
      {"text": "3, 3, 3", "correct": false},
      {"text": "0, 1, 2", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst api = {\n  name: "users",\n  paths: ["a", "b"],\n  list() {\n    return this.paths.map(function (p) {\n      return this.name + "/" + p;\n    });\n  }\n};\nconsole.log(api.list());',
    4,
    'A plain function gets its own this, which is undefined here, so reading .name throws. An arrow function would have inherited this from list().',
    $j$[
      {"text": "TypeError", "correct": true},
      {"text": "[\"users/a\", \"users/b\"]", "correct": false},
      {"text": "[\"undefined/a\", \"undefined/b\"]", "correct": false},
      {"text": "[]", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst items = [1, 2, 3, 4];\nfor (const n of items) {\n  if (n % 2 === 0) items.splice(items.indexOf(n), 1);\n}\nconsole.log(items);',
    4,
    'Removing items while iterating shifts everything left, so the loop skips the element after each removal. Iterate a copy, or use filter().',
    $j$[
      {"text": "[1, 3]", "correct": true},
      {"text": "[1, 3, 4]", "correct": false},
      {"text": "[1, 2, 3, 4]", "correct": false},
      {"text": "[1]", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nPromise.allSettled([Promise.resolve(1), Promise.reject(new Error("x"))])\n  .then((rs) => console.log(rs.map((r) => r.status)));',
    4,
    'allSettled waits for every promise and never rejects -- you get a status for each. Promise.all would have rejected on the first failure.',
    $j$[
      {"text": "[\"fulfilled\", \"rejected\"]", "correct": true},
      {"text": "[\"fulfilled\"]", "correct": false},
      {"text": "[1, \"x\"]", "correct": false},
      {"text": "TypeError", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'In what order does this log?\n\nPromise.reject(new Error("a"))\n  .then(() => console.log("then"))\n  .catch((e) => console.log(e.message))\n  .then(() => console.log("after"));',
    4,
    'A rejection skips .then() handlers until a .catch(). The catch handles it, and the chain carries on normally from there.',
    $j$[
      {"text": "a, after", "correct": true},
      {"text": "then, a, after", "correct": false},
      {"text": "a", "correct": false},
      {"text": "after, a", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst config = { handlers: { onSave: null } };\nconsole.log(config.handlers?.onSave?.() ?? "no handler");',
    4,
    '?.() calls only if there is something to call, giving undefined otherwise -- and ?? then supplies the fallback. Three guards, no if statement.',
    $j$[
      {"text": "\"no handler\"", "correct": true},
      {"text": "undefined", "correct": false},
      {"text": "null", "correct": false},
      {"text": "TypeError", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst people = [\n  { name: "a", team: "x" },\n  { name: "b", team: "x" },\n  { name: "c", team: "y" }\n];\nconst grouped = people.reduce((acc, p) => {\n  (acc[p.team] ??= []).push(p.name);\n  return acc;\n}, {});\nconsole.log(grouped);',
    4,
    'reduce() builds an object here rather than a number. ??= creates the array the first time a team is seen, so each key collects its own names.',
    $j$[
      {"text": "{ x: [\"a\", \"b\"], y: [\"c\"] }", "correct": true},
      {"text": "{ x: [\"b\"], y: [\"c\"] }", "correct": false},
      {"text": "{ x: \"ab\", y: \"c\" }", "correct": false},
      {"text": "[[\"a\", \"b\"], [\"c\"]]", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst counts = new Map();\ncounts.set("a", 1);\nconsole.log(counts.a, counts.get("a"));',
    4,
    'A Map is not a plain object -- its entries live behind get() and set(), so dot access finds nothing. That separation is why any key type works.',
    $j$[
      {"text": "undefined 1", "correct": true},
      {"text": "1 1", "correct": false},
      {"text": "undefined undefined", "correct": false},
      {"text": "TypeError", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst scores = [\n  { name: "a", score: 2 },\n  { name: "b", score: 2 },\n  { name: "c", score: 1 }\n];\nconst best = Math.max(...scores.map((s) => s.score));\nconsole.log(scores.filter((s) => s.score === best).map((s) => s.name));',
    4,
    'Find the maximum first, then keep everything that matches it -- which is how you get ties. Sorting and taking the first would have dropped one.',
    $j$[
      {"text": "[\"a\", \"b\"]", "correct": true},
      {"text": "[\"a\"]", "correct": false},
      {"text": "[\"a\", \"b\", \"c\"]", "correct": false},
      {"text": "2", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nfunction once(fn) {\n  let called = false;\n  let result;\n  return (...args) => {\n    if (!called) {\n      called = true;\n      result = fn(...args);\n    }\n    return result;\n  };\n}\nconst init = once((n) => n * 2);\ninit(5);\nconsole.log(init(100));',
    4,
    'The closure remembers both the flag and the first result, so later calls return the cached value and the argument is ignored.',
    $j$[
      {"text": "10", "correct": true},
      {"text": "200", "correct": false},
      {"text": "undefined", "correct": false},
      {"text": "100", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does main.js log?\n\n// counter.js\nexport let count = 0;\nexport function increment() { count += 1; }\n\n// main.js\nimport { count, increment } from "./counter.js";\nincrement();\nconsole.log(count);',
    4,
    'An import is a live binding, not a copy taken at import time. When the module updates the variable, every importer sees the new value.',
    $j$[
      {"text": "1", "correct": true},
      {"text": "0", "correct": false},
      {"text": "undefined", "correct": false},
      {"text": "An error -- count is read-only", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What is the bug in this code?\n\nasync function total(ids) {\n  let sum = 0;\n  ids.forEach(async (id) => {\n    sum += await lookup(id);\n  });\n  return sum;\n}',
    4,
    'forEach does not wait for an async callback, so total returns 0 before any lookup finishes. A for...of loop with await inside would work.',
    $j$[
      {"text": "forEach does not await the callbacks, so it returns 0", "correct": true},
      {"text": "sum should be declared with const", "correct": false},
      {"text": "await cannot be used inside an arrow function", "correct": false},
      {"text": "total does not need to be async", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What is the bug in this code?\n\nfunction createTimer() {\n  let seconds = 0;\n  setInterval(() => { seconds += 1; }, 1000);\n  return seconds;\n}\nconst elapsed = createTimer();',
    4,
    'seconds is read once and returned as a number, so elapsed is 0 forever. Return a function that reads it, and the closure stays live.',
    $j$[
      {"text": "It returns the value once, so elapsed never changes", "correct": true},
      {"text": "setInterval should be setTimeout", "correct": false},
      {"text": "seconds must be declared with var to be captured", "correct": false},
      {"text": "The interval callback cannot modify seconds", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What is the bug in this code?\n\nlet cache = null;\nasync function load() {\n  if (cache) return cache;\n  cache = await fetchData();\n  return cache;\n}\nPromise.all([load(), load()]);',
    4,
    'Both calls check the empty cache before either finishes, so the fetch happens twice. Caching the PROMISE rather than the result fixes it.',
    $j$[
      {"text": "Two concurrent calls both fetch, because neither has filled the cache yet", "correct": true},
      {"text": "cache should be declared with const", "correct": false},
      {"text": "Promise.all cannot take the same function twice", "correct": false},
      {"text": "await cannot be assigned directly to a variable", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'Which approach waits for every request and keeps going if one fails?\n\nconst urls = ["/a", "/b", "/c"];',
    4,
    'allSettled never rejects: you get a status for each entry. Promise.all rejects on the first failure and abandons the rest of the results.',
    $j$[
      {"text": "await Promise.allSettled(urls.map(fetch))", "correct": true},
      {"text": "await Promise.all(urls.map(fetch))", "correct": false},
      {"text": "await Promise.race(urls.map(fetch))", "correct": false},
      {"text": "urls.forEach(async (u) => await fetch(u))", "correct": false}
    ]$j$::JSONB);


DROP FUNCTION seed_js_question(TEXT, INTEGER, TEXT, JSONB);

COMMIT;
