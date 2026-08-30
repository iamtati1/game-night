-- Code Blitz: the curriculum questions the bank was missing.
--
-- The audit that prompted this counted five loop questions and twelve function
-- questions in a bank of a hundred and sixty-one, against twenty-six about
-- objects and twenty-four about array methods. Every one of those loop questions
-- was correctly tiered -- the difficulty ladder was fine. The bank simply was not
-- teaching loops, and a difficulty ladder cannot see that.
--
-- So these are organised by curriculum unit and then by tier, and within a unit
-- they build. The loops section starts with a counter and ends with a nested
-- loop; the functions section starts with calling one and spends four questions
-- on the difference between returning and logging, because that is the thing
-- beginners get wrong for months.
--
-- Repetition with variation is the point. A learner should meet `for` many times
-- in different clothes rather than once, definitively.

BEGIN;

/** Same helper as seed 008, defined here so this file stands on its own. */
CREATE OR REPLACE FUNCTION seed_js_question(
    p_prompt TEXT,
    p_difficulty INTEGER,
    p_topic TEXT,
    p_explanation TEXT,
    p_options JSONB
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_id BIGINT;
    v_option JSONB;
    v_pos INTEGER := 0;
BEGIN
    -- Already present? Bring its metadata up to date and stop.
    --
    -- This used to RETURN and change nothing, and that is what broke the seed
    -- run. An earlier version of this file inserted 92 questions before the
    -- topic column existed. When topic arrived and every question here gained
    -- one, those 92 rows were skipped on the re-run -- so they kept a NULL topic
    -- and the constraint rejected them, naming no reason anyone could act on.
    --
    -- "Safe to re-run" has to mean CONVERGES, not "does nothing the second
    -- time". A seed that freezes whatever landed first can never carry a
    -- correction to content that already exists, which is the main reason to
    -- re-run one.
    --
    -- Metadata only. Options are left alone because they are keyed by position
    -- and rewriting them would orphan any session_questions row citing one, and
    -- is_active is left alone so a question retired by seed 009 stays retired.
    IF EXISTS (SELECT 1 FROM questions WHERE prompt = p_prompt) THEN
        UPDATE questions
        SET difficulty = p_difficulty, topic = p_topic, explanation = p_explanation
        WHERE prompt = p_prompt;

        RETURN;
    END IF;

    INSERT INTO questions (prompt, difficulty, topic, explanation)
    VALUES (p_prompt, p_difficulty, p_topic, p_explanation)
    RETURNING id INTO v_id;

    FOR v_option IN SELECT * FROM jsonb_array_elements(p_options) LOOP
        v_pos := v_pos + 1;
        INSERT INTO question_options (question_id, option_text, display_order, is_correct)
        VALUES (v_id, v_option ->> 'text', v_pos, (v_option ->> 'correct')::BOOLEAN);
    END LOOP;
END;
$$;


-- ===========================================================================
-- LOOPS -- from a counter to a nested loop.
-- ===========================================================================

SELECT seed_js_question(
    E'What does this log?\n\nfor (let i = 0; i < 3; i++) {\n  console.log(i);\n}',
    1, 'loops',
    'The counter starts at 0 and stops before 3, so the body runs three times. i++ is what moves it on each pass.',
    $j$[
      {"text": "0\n1\n2", "correct": true},
      {"text": "1\n2\n3", "correct": false},
      {"text": "0\n1\n2\n3", "correct": false},
      {"text": "3", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nlet total = 0;\n\nfor (let i = 1; i <= 4; i++) {\n  total += i;\n}\n\nconsole.log(total);',
    1, 'loops',
    'Each pass adds i to the running total: 1, then 3, then 6, then 10. Accumulating into a variable declared before the loop is the core pattern.',
    $j$[
      {"text": "10", "correct": true},
      {"text": "6", "correct": false},
      {"text": "4", "correct": false},
      {"text": "15", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nlet result = "";\n\nfor (let i = 0; i < 3; i++) {\n  result += "ab";\n}\n\nconsole.log(result);',
    1, 'loops',
    'The same accumulator pattern, building a string instead of a number. Three passes, so "ab" is added three times.',
    $j$[
      {"text": "\"ababab\"", "correct": true},
      {"text": "\"ab\"", "correct": false},
      {"text": "\"ab ab ab\"", "correct": false},
      {"text": "\"aabb\"", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst numbers = [1, 2, 3, 4];\nlet total = 0;\n\nfor (const number of numbers) {\n  total += number;\n}\n\nconsole.log(total);',
    1, 'loops',
    'for...of hands you each value directly, so there is no index to manage. This is the everyday way to walk an array.',
    $j$[
      {"text": "10", "correct": true},
      {"text": "4", "correct": false},
      {"text": "[1, 2, 3, 4]", "correct": false},
      {"text": "0", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst numbers = [1, 2, 3];\n\nfor (const number of numbers) {\n  console.log(number * 2);\n}',
    1, 'loops',
    'The body runs once per value, logging each result as it goes. Nothing is collected -- compare this with map(), which hands you an array back.',
    $j$[
      {"text": "2\n4\n6", "correct": true},
      {"text": "[2, 4, 6]", "correct": false},
      {"text": "6", "correct": false},
      {"text": "1\n2\n3", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nlet count = 5;\n\nwhile (count > 2) {\n  count--;\n}\n\nconsole.log(count);',
    1, 'loops',
    'The loop keeps going while the condition holds and stops the moment it does not, so it lands on 2 rather than going below.',
    $j$[
      {"text": "2", "correct": true},
      {"text": "1", "correct": false},
      {"text": "3", "correct": false},
      {"text": "0", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst words = ["a", "b", "c"];\nlet joined = "";\n\nfor (let i = 0; i < words.length; i++) {\n  joined += words[i];\n}\n\nconsole.log(joined);',
    1, 'loops',
    'i < words.length is what makes the loop fit any array. Reading words[i] each pass is how an index loop gets at the values.',
    $j$[
      {"text": "\"abc\"", "correct": true},
      {"text": "\"a\"", "correct": false},
      {"text": "[\"a\", \"b\", \"c\"]", "correct": false},
      {"text": "\"cba\"", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nlet total = 0;\n\nfor (let i = 0; i < 3; i++) {\n  total += 10;\n}\n\nconsole.log(total, i);',
    1, 'loops',
    'let makes i belong to the loop, so it does not exist afterwards -- reading it throws. Declaring the counter outside would keep it around.',
    $j$[
      {"text": "ReferenceError", "correct": true},
      {"text": "30 3", "correct": false},
      {"text": "30 undefined", "correct": false},
      {"text": "30 2", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst numbers = [4, 7, 2, 9];\nlet count = 0;\n\nfor (const n of numbers) {\n  if (n > 3) {\n    count++;\n  }\n}\n\nconsole.log(count);',
    2, 'loops',
    'A loop with an if inside is counting by hand: 4, 7 and 9 pass the test. This is what filter().length does in one line.',
    $j$[
      {"text": "3", "correct": true},
      {"text": "4", "correct": false},
      {"text": "2", "correct": false},
      {"text": "22", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst numbers = [1, 2, 3, 4];\nconst evens = [];\n\nfor (const n of numbers) {\n  if (n % 2 === 0) {\n    evens.push(n);\n  }\n}\n\nconsole.log(evens);',
    2, 'loops',
    'Filtering by hand: start with an empty array and push what qualifies. n % 2 === 0 is the usual test for even.',
    $j$[
      {"text": "[2, 4]", "correct": true},
      {"text": "[1, 3]", "correct": false},
      {"text": "[1, 2, 3, 4]", "correct": false},
      {"text": "2", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst scores = [12, 5, 20, 8];\nlet highest = scores[0];\n\nfor (const score of scores) {\n  if (score > highest) {\n    highest = score;\n  }\n}\n\nconsole.log(highest);',
    2, 'loops',
    'Track the best seen so far and replace it whenever something beats it. Starting from scores[0] rather than 0 keeps it correct for negative numbers.',
    $j$[
      {"text": "20", "correct": true},
      {"text": "12", "correct": false},
      {"text": "45", "correct": false},
      {"text": "5", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst users = [\n  { name: "Ada", active: true },\n  { name: "Sam", active: false }\n];\n\nfor (const user of users) {\n  if (user.active) {\n    console.log(user.name);\n  }\n}',
    2, 'loops',
    'Looping over objects and reaching into each one is the shape most real code takes. Only Ada passes the check, so only Ada is logged.',
    $j$[
      {"text": "\"Ada\"", "correct": true},
      {"text": "\"Ada\"\n\"Sam\"", "correct": false},
      {"text": "\"Sam\"", "correct": false},
      {"text": "true", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst items = ["a", "b", "c"];\n\nfor (let i = 0; i < items.length; i++) {\n  console.log(i + ": " + items[i]);\n}',
    2, 'loops',
    'An index loop is the one to reach for when you need the position as well as the value. for...of alone would not give you i.',
    $j$[
      {"text": "\"0: a\"\n\"1: b\"\n\"2: c\"", "correct": true},
      {"text": "\"1: a\"\n\"2: b\"\n\"3: c\"", "correct": false},
      {"text": "\"a: 0\"\n\"b: 1\"\n\"c: 2\"", "correct": false},
      {"text": "\"0: a, 1: b, 2: c\"", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nlet total = 0;\n\nfor (const n of [1, 2, 3, 4, 5]) {\n  if (n === 3) {\n    break;\n  }\n  total += n;\n}\n\nconsole.log(total);',
    2, 'loops',
    'break leaves the loop immediately, so 3, 4 and 5 are never added. continue would have skipped just that one pass instead.',
    $j$[
      {"text": "3", "correct": true},
      {"text": "6", "correct": false},
      {"text": "15", "correct": false},
      {"text": "12", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nlet total = 0;\n\nfor (const n of [1, 2, 3, 4]) {\n  if (n % 2 === 0) {\n    continue;\n  }\n  total += n;\n}\n\nconsole.log(total);',
    2, 'loops',
    'continue skips the rest of THIS pass and carries on, so only the odd numbers are added: 1 + 3.',
    $j$[
      {"text": "4", "correct": true},
      {"text": "10", "correct": false},
      {"text": "6", "correct": false},
      {"text": "0", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst counts = {};\n\nfor (const letter of ["a", "b", "a"]) {\n  counts[letter] = (counts[letter] || 0) + 1;\n}\n\nconsole.log(counts);',
    2, 'loops',
    'Counting into an object: || 0 supplies a starting value the first time a letter is seen, because counts[letter] is undefined until then.',
    $j$[
      {"text": "{ a: 2, b: 1 }", "correct": true},
      {"text": "{ a: 1, b: 1 }", "correct": false},
      {"text": "{ a: 3, b: 1 }", "correct": false},
      {"text": "{ a: NaN, b: NaN }", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst items = ["a", "b", "c"];\nlet out = "";\n\nfor (let i = items.length - 1; i >= 0; i--) {\n  out += items[i];\n}\n\nconsole.log(out);',
    3, 'loops',
    'Counting down from length - 1 to 0 walks the array backwards. Starting at length would read past the end on the first pass.',
    $j$[
      {"text": "\"cba\"", "correct": true},
      {"text": "\"abc\"", "correct": false},
      {"text": "\"undefinedcba\"", "correct": false},
      {"text": "\"cb\"", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nlet pairs = 0;\n\nfor (const a of [1, 2]) {\n  for (const b of ["x", "y", "z"]) {\n    pairs++;\n  }\n}\n\nconsole.log(pairs);',
    3, 'loops',
    'The inner loop runs completely for every pass of the outer one, so the total is 2 x 3. That multiplication is why nested loops get expensive.',
    $j$[
      {"text": "6", "correct": true},
      {"text": "5", "correct": false},
      {"text": "3", "correct": false},
      {"text": "2", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst grid = [[1, 2], [3, 4]];\nlet total = 0;\n\nfor (const row of grid) {\n  for (const cell of row) {\n    total += cell;\n  }\n}\n\nconsole.log(total);',
    3, 'loops',
    'A nested array needs a nested loop: the outer gives you each row, the inner each cell within it.',
    $j$[
      {"text": "10", "correct": true},
      {"text": "4", "correct": false},
      {"text": "[1, 2, 3, 4]", "correct": false},
      {"text": "6", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst numbers = [1, 2, 3];\n\nfor (let i = 0; i <= numbers.length; i++) {\n  console.log(numbers[i]);\n}',
    3, 'loops',
    'Using <= runs one pass too many, and reading past the end gives undefined rather than an error -- which is why off-by-one bugs are quiet.',
    $j$[
      {"text": "1\n2\n3\nundefined", "correct": true},
      {"text": "1\n2\n3", "correct": false},
      {"text": "RangeError", "correct": false},
      {"text": "1\n2\n3\nnull", "correct": false}
    ]$j$::JSONB);


-- ===========================================================================
-- FUNCTIONS -- and four questions on return versus log, because that is the
-- distinction beginners get wrong for months.
-- ===========================================================================

SELECT seed_js_question(
    E'What does this log?\n\nfunction sayHi() {\n  return "hi";\n}\n\nconsole.log(sayHi());',
    1, 'functions',
    'The parentheses are what CALL the function. Without them you would get the function itself rather than the value it produces.',
    $j$[
      {"text": "\"hi\"", "correct": true},
      {"text": "undefined", "correct": false},
      {"text": "\"sayHi\"", "correct": false},
      {"text": "\"function\"", "correct": false}
    ]$j$::JSONB);

-- Asks about the TYPES rather than logging the function itself: console.log of
-- a function prints different text in Node and in a browser, so an answer
-- written that way would be right in one place and wrong in the other.
SELECT seed_js_question(
    E'What does this log?\n\nfunction sayHi() {\n  return "hi";\n}\n\nconsole.log(typeof sayHi, typeof sayHi());',
    1, 'functions',
    'Without parentheses you have the function itself; with them you have what it returned. Forgetting the parentheses is a very common typo.',
    $j$[
      {"text": "\"function\" \"string\"", "correct": true},
      {"text": "\"string\" \"string\"", "correct": false},
      {"text": "\"function\" \"function\"", "correct": false},
      {"text": "\"undefined\" \"string\"", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nfunction double(n) {\n  console.log(n * 2);\n}\n\nconst result = double(5);\nconsole.log(result);',
    1, 'functions',
    'The function LOGS but never RETURNS, so result is undefined. Logging shows a value to you; returning hands it back to the code.',
    $j$[
      {"text": "10\nundefined", "correct": true},
      {"text": "10\n10", "correct": false},
      {"text": "undefined\n10", "correct": false},
      {"text": "10", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nfunction double(n) {\n  return n * 2;\n}\n\ndouble(5);\nconsole.log("done");',
    1, 'functions',
    'The return value is thrown away because nothing catches it. Returning does not print anything -- the pair to the previous question.',
    $j$[
      {"text": "\"done\"", "correct": true},
      {"text": "10\n\"done\"", "correct": false},
      {"text": "10", "correct": false},
      {"text": "undefined\n\"done\"", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nfunction add(a, b) {\n  return a + b;\n}\n\nconsole.log(add(2, 3) + add(1, 1));',
    1, 'functions',
    'Each call is replaced by the value it returns, so this becomes 5 + 2. Returning is what lets a function be used inside a larger expression.',
    $j$[
      {"text": "7", "correct": true},
      {"text": "5", "correct": false},
      {"text": "\"52\"", "correct": false},
      {"text": "undefined", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nfunction shout(word) {\n  return word.toUpperCase() + "!";\n}\n\nconsole.log(shout("hey"));',
    1, 'functions',
    'The argument "hey" fills the parameter word inside the function. The parameter is just a name for whatever gets passed in.',
    $j$[
      {"text": "\"HEY!\"", "correct": true},
      {"text": "\"hey!\"", "correct": false},
      {"text": "\"HEY\"", "correct": false},
      {"text": "\"word!\"", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst triple = (n) => n * 3;\nconsole.log(triple(4));',
    1, 'functions',
    'An arrow function with no braces returns its expression automatically. This is the same as writing return n * 3 inside braces.',
    $j$[
      {"text": "12", "correct": true},
      {"text": "undefined", "correct": false},
      {"text": "\"444\"", "correct": false},
      {"text": "7", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nfunction greet(name, greeting = "Hello") {\n  return `${greeting}, ${name}`;\n}\n\nconsole.log(greet("Ada", "Hi"));',
    1, 'functions',
    'A default only applies when no argument is passed. Here "Hi" is supplied, so it replaces the default.',
    $j$[
      {"text": "\"Hi, Ada\"", "correct": true},
      {"text": "\"Hello, Ada\"", "correct": false},
      {"text": "\"Ada, Hi\"", "correct": false},
      {"text": "\"Hello, Hi\"", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nfunction square(n) {\n  return n * n;\n}\n\nfunction sumOfSquares(a, b) {\n  return square(a) + square(b);\n}\n\nconsole.log(sumOfSquares(2, 3));',
    2, 'functions',
    'One function calling another is how bigger problems get broken up. square runs twice, giving 4 and 9.',
    $j$[
      {"text": "13", "correct": true},
      {"text": "25", "correct": false},
      {"text": "10", "correct": false},
      {"text": "36", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nfunction classify(n) {\n  if (n > 0) {\n    return "positive";\n  }\n  return "not positive";\n}\n\nconsole.log(classify(5));',
    2, 'functions',
    'return exits the function immediately, so the line below never runs. That is why an early return often removes the need for an else.',
    $j$[
      {"text": "\"positive\"", "correct": true},
      {"text": "\"not positive\"", "correct": false},
      {"text": "\"positive\"\n\"not positive\"", "correct": false},
      {"text": "undefined", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nfunction total(numbers) {\n  let sum = 0;\n  for (const n of numbers) {\n    sum += n;\n  }\n  return sum;\n}\n\nconsole.log(total([1, 2, 3]));',
    2, 'functions',
    'Wrapping a loop in a function is how you reuse it. The array arrives as a parameter, and the answer leaves through return.',
    $j$[
      {"text": "6", "correct": true},
      {"text": "3", "correct": false},
      {"text": "undefined", "correct": false},
      {"text": "[1, 2, 3]", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nfunction apply(fn, value) {\n  return fn(value);\n}\n\nfunction double(n) {\n  return n * 2;\n}\n\nconsole.log(apply(double, 7));',
    2, 'functions',
    'double is passed WITHOUT parentheses, so the function itself travels in and apply calls it. That is all a callback is.',
    $j$[
      {"text": "14", "correct": true},
      {"text": "7", "correct": false},
      {"text": "undefined", "correct": false},
      {"text": "TypeError", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nfunction repeat(times, fn) {\n  for (let i = 0; i < times; i++) {\n    fn(i);\n  }\n}\n\nrepeat(3, (i) => console.log(i * 10));',
    2, 'functions',
    'The callback is handed the loop counter each pass. Passing behaviour into a function is what makes map and forEach possible.',
    $j$[
      {"text": "0\n10\n20", "correct": true},
      {"text": "10\n20\n30", "correct": false},
      {"text": "0\n1\n2", "correct": false},
      {"text": "30", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nfunction multiplier(factor) {\n  return (n) => n * factor;\n}\n\nconst triple = multiplier(3);\nconsole.log(triple(5));',
    3, 'functions',
    'multiplier returns a function that remembers factor. Calling it later still has access to that value -- this is a closure, used deliberately.',
    $j$[
      {"text": "15", "correct": true},
      {"text": "3", "correct": false},
      {"text": "5", "correct": false},
      {"text": "undefined", "correct": false}
    ]$j$::JSONB);


-- ===========================================================================
-- CONDITIONALS -- comparison, then if, then else if, then combining.
-- ===========================================================================

SELECT seed_js_question(
    E'What does this log?\n\nconsole.log(5 > 3);',
    1, 'conditionals',
    'A comparison produces a boolean -- true or false -- rather than the numbers being compared. That value is what an if statement tests.',
    $j$[
      {"text": "true", "correct": true},
      {"text": "5", "correct": false},
      {"text": "\"true\"", "correct": false},
      {"text": "false", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst temperature = 30;\n\nif (temperature > 25) {\n  console.log("warm");\n} else if (temperature > 15) {\n  console.log("mild");\n} else {\n  console.log("cold");\n}',
    1, 'conditionals',
    'The first branch that matches wins and the rest are skipped, even though 30 is also greater than 15. Order matters in an if/else if chain.',
    $j$[
      {"text": "\"warm\"", "correct": true},
      {"text": "\"mild\"", "correct": false},
      {"text": "\"warm\"\n\"mild\"", "correct": false},
      {"text": "\"cold\"", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconsole.log(!true, !false);',
    1, 'conditionals',
    '! flips a boolean. It is most often seen as !something, meaning "if this is missing or empty".',
    $j$[
      {"text": "false true", "correct": true},
      {"text": "true false", "correct": false},
      {"text": "false false", "correct": false},
      {"text": "true true", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst age = 25;\nconst hasTicket = false;\n\nconsole.log(age >= 18 && hasTicket);',
    1, 'conditionals',
    '&& is true only when BOTH sides are. The age passes but the ticket does not, so the whole thing is false.',
    $j$[
      {"text": "false", "correct": true},
      {"text": "true", "correct": false},
      {"text": "25", "correct": false},
      {"text": "undefined", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst isAdmin = false;\nconst isOwner = true;\n\nconsole.log(isAdmin || isOwner);',
    1, 'conditionals',
    '|| is true when EITHER side is. This pair -- && needs both, || needs one -- covers most conditions you will write.',
    $j$[
      {"text": "true", "correct": true},
      {"text": "false", "correct": false},
      {"text": "\"isOwner\"", "correct": false},
      {"text": "undefined", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst score = 80;\nconsole.log(score >= 50 && score < 90 ? "pass" : "review");',
    2, 'conditionals',
    'Both comparisons are evaluated first, then the ternary picks a value from the result. 80 clears 50 and is under 90.',
    $j$[
      {"text": "\"pass\"", "correct": true},
      {"text": "\"review\"", "correct": false},
      {"text": "true", "correct": false},
      {"text": "80", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst name = "";\nconsole.log(name || "Anonymous");',
    2, 'conditionals',
    '|| returns the first truthy value, and an empty string is falsy -- so the fallback is used. This is the everyday default-value idiom.',
    $j$[
      {"text": "\"Anonymous\"", "correct": true},
      {"text": "\"\"", "correct": false},
      {"text": "true", "correct": false},
      {"text": "undefined", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nfunction check(user) {\n  if (!user) {\n    return "no user";\n  }\n  if (!user.email) {\n    return "no email";\n  }\n  return "ok";\n}\n\nconsole.log(check({ name: "Ada" }));',
    2, 'conditionals',
    'Guard clauses handle the bad cases first and return early, so the last line only runs once everything has passed. The user exists but has no email.',
    $j$[
      {"text": "\"no email\"", "correct": true},
      {"text": "\"no user\"", "correct": false},
      {"text": "\"ok\"", "correct": false},
      {"text": "undefined", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nlet calls = 0;\n\nfunction touch() {\n  calls++;\n  return true;\n}\n\nfalse && touch();\nconsole.log(calls);',
    3, 'conditionals',
    '&& stops as soon as it knows the answer, so with false on the left the right side never runs. That short-circuit is what makes `user && user.name` safe.',
    $j$[
      {"text": "0", "correct": true},
      {"text": "1", "correct": false},
      {"text": "2", "correct": false},
      {"text": "true", "correct": false}
    ]$j$::JSONB);


-- ===========================================================================
-- ARRAYS -- the operations the bank had skipped.
-- ===========================================================================

SELECT seed_js_question(
    E'What does this log?\n\nconst queue = ["a", "b", "c"];\nconst first = queue.shift();\nconsole.log(first, queue);',
    1, 'arrays',
    'shift() removes the FIRST item and returns it, leaving the rest shuffled down. pop() is the same idea at the other end.',
    $j$[
      {"text": "\"a\" [\"b\", \"c\"]", "correct": true},
      {"text": "\"c\" [\"a\", \"b\"]", "correct": false},
      {"text": "\"a\" [\"a\", \"b\", \"c\"]", "correct": false},
      {"text": "1 [\"b\", \"c\"]", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst items = ["b", "c"];\nitems.unshift("a");\nconsole.log(items);',
    1, 'arrays',
    'unshift() adds to the front, pushing everything else along. push() adds to the back.',
    $j$[
      {"text": "[\"a\", \"b\", \"c\"]", "correct": true},
      {"text": "[\"b\", \"c\", \"a\"]", "correct": false},
      {"text": "[\"a\"]", "correct": false},
      {"text": "3", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst letters = ["a", "b", "c"];\nletters[1] = "z";\nconsole.log(letters);',
    1, 'arrays',
    'Assigning to an index replaces that slot in place. Indexes start at 0, so [1] is the second item.',
    $j$[
      {"text": "[\"a\", \"z\", \"c\"]", "correct": true},
      {"text": "[\"z\", \"b\", \"c\"]", "correct": false},
      {"text": "[\"a\", \"b\", \"z\"]", "correct": false},
      {"text": "[\"a\", \"b\", \"c\", \"z\"]", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst nums = [10, 20, 30, 40];\nconsole.log(nums.slice(1, 3));',
    2, 'arrays',
    'slice(start, end) takes from start up to but NOT including end, and returns a new array. The original is untouched.',
    $j$[
      {"text": "[20, 30]", "correct": true},
      {"text": "[20, 30, 40]", "correct": false},
      {"text": "[10, 20, 30]", "correct": false},
      {"text": "[20]", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst nums = [10, 20, 30, 40];\nnums.splice(1, 2);\nconsole.log(nums);',
    2, 'arrays',
    'splice(start, count) removes that many items IN PLACE. slice copies and leaves the original alone -- the pair is easy to mix up.',
    $j$[
      {"text": "[10, 40]", "correct": true},
      {"text": "[20, 30]", "correct": false},
      {"text": "[10, 20, 30, 40]", "correct": false},
      {"text": "[10, 30, 40]", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst a = [1, 2];\nconst b = [3, 4];\nconsole.log([...a, ...b]);',
    2, 'arrays',
    'Spreading both arrays into a new one joins them without changing either. concat() does the same job.',
    $j$[
      {"text": "[1, 2, 3, 4]", "correct": true},
      {"text": "[[1, 2], [3, 4]]", "correct": false},
      {"text": "[1, 2]", "correct": false},
      {"text": "10", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nconst items = ["a", "b"];\nitems.push("c");\nitems.pop();\nitems.unshift("z");\nconsole.log(items.length, items[0]);',
    2, 'arrays',
    'Three operations in sequence: push then pop cancel out, and unshift adds one to the front. Tracing each step is the skill here.',
    $j$[
      {"text": "3 \"z\"", "correct": true},
      {"text": "2 \"a\"", "correct": false},
      {"text": "3 \"a\"", "correct": false},
      {"text": "4 \"z\"", "correct": false}
    ]$j$::JSONB);


-- ===========================================================================
-- ASYNC -- the on-ramp, before any talk of ordering.
-- ===========================================================================

SELECT seed_js_question(
    E'What does this log?\n\nasync function load() {\n  return "data";\n}\n\nload().then((value) => console.log(value));',
    3, 'async',
    'An async function always hands back a Promise. .then() is how you get at the value once it is ready.',
    $j$[
      {"text": "\"data\"", "correct": true},
      {"text": "undefined", "correct": false},
      {"text": "Nothing is logged", "correct": false},
      {"text": "\"Promise\"", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nasync function load() {\n  return "data";\n}\n\nasync function main() {\n  const value = await load();\n  console.log(value);\n}\n\nmain();',
    3, 'async',
    'await unwraps the Promise and gives you the value inside, so the code reads top to bottom. Without it you would log the Promise itself.',
    $j$[
      {"text": "\"data\"", "correct": true},
      {"text": "undefined", "correct": false},
      {"text": "Nothing is logged", "correct": false},
      {"text": "TypeError", "correct": false}
    ]$j$::JSONB);


-- ===========================================================================
-- RETURN VERSUS LOG, continued.
--
-- Four questions on this earlier were not enough for something beginners get
-- wrong for months. These carry the same idea forward: what happens when the
-- value is stored, passed on, or expected somewhere further away from the
-- function that failed to return it.
-- ===========================================================================

SELECT seed_js_question(
    E'What does this log?\n\nfunction getName() {\n  console.log("Ada");\n}\n\nconst name = getName();\nconsole.log("Name is " + name);',
    2, 'functions',
    'The function prints Ada, then returns nothing -- so name is undefined and joins into the string as the text "undefined".',
    $j$[
      {"text": "\"Ada\"\n\"Name is undefined\"", "correct": true},
      {"text": "\"Ada\"\n\"Name is Ada\"", "correct": false},
      {"text": "\"Name is Ada\"", "correct": false},
      {"text": "\"Ada\"", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nfunction addOne(n) {\n  return n + 1;\n}\n\nfunction addTwo(n) {\n  return addOne(addOne(n));\n}\n\nconsole.log(addTwo(5));',
    2, 'functions',
    'The inner call is replaced by its returned value before the outer one runs, so 5 becomes 6 and then 7. Only returning makes this nesting possible.',
    $j$[
      {"text": "7", "correct": true},
      {"text": "6", "correct": false},
      {"text": "5", "correct": false},
      {"text": "undefined", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nfunction shout(word) {\n  console.log(word.toUpperCase());\n}\n\nfunction announce(word) {\n  return "** " + shout(word) + " **";\n}\n\nconsole.log(announce("hi"));',
    2, 'functions',
    'shout logs but returns undefined, so the wrapper joins undefined into its string. A missing return travels: the damage shows up in the caller.',
    $j$[
      {"text": "\"HI\"\n\"** undefined **\"", "correct": true},
      {"text": "\"** HI **\"", "correct": false},
      {"text": "\"HI\"\n\"** HI **\"", "correct": false},
      {"text": "\"** **\"", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nfunction double(n) {\n  return n * 2;\n}\n\nconst numbers = [1, 2, 3];\nconsole.log(numbers.map(double));',
    2, 'functions',
    'map hands each item to double and collects what it RETURNS. A function that logged instead would give [undefined, undefined, undefined].',
    $j$[
      {"text": "[2, 4, 6]", "correct": true},
      {"text": "[1, 2, 3]", "correct": false},
      {"text": "[undefined, undefined, undefined]", "correct": false},
      {"text": "6", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nfunction double(n) {\n  console.log(n * 2);\n}\n\nconsole.log([1, 2].map(double));',
    3, 'functions',
    'The callback logs each doubled value and returns nothing, so map collects undefined for every item. This is the return-versus-log mistake inside an array method.',
    $j$[
      {"text": "2\n4\n[undefined, undefined]", "correct": true},
      {"text": "[2, 4]", "correct": false},
      {"text": "2\n4\n[2, 4]", "correct": false},
      {"text": "[undefined, undefined]", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nfunction sum(numbers) {\n  let total = 0;\n  for (const n of numbers) {\n    total += n;\n  }\n  console.log(total);\n}\n\nconst answer = sum([1, 2, 3]);\nconsole.log(answer);',
    2, 'functions',
    'The loop is right and the total is printed, but nothing is returned -- so answer is undefined. The bug is one missing word, and the console makes it look fine.',
    $j$[
      {"text": "6\nundefined", "correct": true},
      {"text": "6\n6", "correct": false},
      {"text": "undefined\n6", "correct": false},
      {"text": "6", "correct": false}
    ]$j$::JSONB);


-- ===========================================================================
-- ASYNC, continued -- the rest of the on-ramp before any ordering question.
-- ===========================================================================

SELECT seed_js_question(
    E'What does this log?\n\nfunction normal() {\n  return "value";\n}\n\nasync function wrapped() {\n  return "value";\n}\n\nconsole.log(normal() === "value", wrapped() === "value");',
    3, 'async',
    'A normal function hands back the value itself; an async one wraps it in a Promise, which is not equal to the value. This is the whole difference in one line.',
    $j$[
      {"text": "true false", "correct": true},
      {"text": "true true", "correct": false},
      {"text": "false false", "correct": false},
      {"text": "false true", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nasync function getTotal() {\n  return 42;\n}\n\nasync function main() {\n  const total = await getTotal();\n  console.log(total + 8);\n}\n\nmain();',
    3, 'async',
    'await unwraps the Promise, so total is the number 42 and arithmetic works normally. Without await you would be adding 8 to a Promise.',
    $j$[
      {"text": "50", "correct": true},
      {"text": "42", "correct": false},
      {"text": "NaN", "correct": false},
      {"text": "\"[object Promise]8\"", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nasync function getTotal() {\n  return 42;\n}\n\nasync function main() {\n  const total = getTotal();\n  console.log(typeof total);\n}\n\nmain();',
    3, 'async',
    'Without await, total holds the Promise rather than the number -- and a Promise is an object. This is the commonest async mistake there is.',
    $j$[
      {"text": "\"object\"", "correct": true},
      {"text": "\"number\"", "correct": false},
      {"text": "\"promise\"", "correct": false},
      {"text": "\"undefined\"", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nasync function load() {\n  throw new Error("offline");\n}\n\nasync function main() {\n  try {\n    await load();\n  } catch (err) {\n    console.log("caught");\n  }\n}\n\nmain();',
    3, 'async',
    'A throw inside an async function rejects its Promise, and await turns that rejection back into a throw -- so ordinary try/catch handles it.',
    $j$[
      {"text": "\"caught\"", "correct": true},
      {"text": "\"offline\"", "correct": false},
      {"text": "Nothing is logged", "correct": false},
      {"text": "\"Error: offline\"", "correct": false}
    ]$j$::JSONB);

SELECT seed_js_question(
    E'What does this log?\n\nasync function one() {\n  return 1;\n}\n\nasync function main() {\n  const a = await one();\n  const b = await one();\n  console.log(a + b);\n}\n\nmain();',
    3, 'async',
    'Each await waits for its own result before the next line runs, so the code reads top to bottom exactly like synchronous code.',
    $j$[
      {"text": "2", "correct": true},
      {"text": "1", "correct": false},
      {"text": "NaN", "correct": false},
      {"text": "\"11\"", "correct": false}
    ]$j$::JSONB);


DROP FUNCTION seed_js_question(TEXT, INTEGER, TEXT, TEXT, JSONB);

COMMIT;
