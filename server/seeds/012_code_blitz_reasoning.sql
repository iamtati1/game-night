-- Reason, explain and debug questions for six load-bearing concepts.
--
-- The bank measured 84% prediction: 168 of 201 classifiable questions asked
-- "what does this log?". Prediction is worth having and there is enough of it.
-- What was missing is the half of understanding that prediction cannot reach --
-- saying WHY a rule holds, and repairing code that breaks it. Every question
-- here is reason, explain or debug. None is prediction.
--
-- Concepts chosen from docs/question-audit.json: the six load-bearing concepts
-- whose reason/debug stages had zero questions.
--
-- ON THE TOPIC COLUMN. questions.topic is still constrained to the original
-- nine values, while the curriculum in client/src/games/curriculum.ts now names
-- sixteen. Two concepts here have no schema home yet:
--
--   type-coercion  -> curriculum topic `values`,    stored as 'variables'
--   equality       -> curriculum topic `operators`, stored as 'conditionals'
--
-- One question here is filed against a concept whose declared capability does
-- not quite describe it. The includes()-by-identity question sits at
-- object-references -> debug, whose `can` reads "Fix a function mutating its
-- argument". The stage is the right one -- identity versus equality, repaired --
-- but the wording is about mutation. The curriculum gives arrays an explicit
-- `array-reference-identity` concept and objects no equivalent; closing that
-- asymmetry is a curriculum change and is deliberately not made here.
--
-- Those are the legacy topics the existing coercion and equality questions
-- already use, so these rows sit with their siblings rather than inventing a
-- value the CHECK would reject. The concept and stage for every question live
-- in docs/question-audit.json until a migration adds columns for them.

CREATE OR REPLACE FUNCTION seed_reasoning_question(
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
    -- Converges rather than skipping, matching seeds 008 and 010: an existing
    -- row has its metadata refreshed so a later correction can reach it.
    -- Options are left alone because they are keyed by position and rewriting
    -- them would orphan any session_questions row citing one; is_active is left
    -- alone so anything retired stays retired.
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
        VALUES (v_id, v_option->>'text', v_pos, (v_option->>'correct')::BOOLEAN);
    END LOOP;
END;
$$;

-- ══════════════════ type-coercion (values) · 3 reason, 2 debug ══════════════════

SELECT seed_reasoning_question(
    E'Why does "5" - 3 give 2, but "5" + 3 gives "53"?',
    3, 'variables',
    'The operator decides, not the operands. Minus is only defined for numbers, so it converts both sides. Plus is defined for numbers and for strings, and one string operand is enough to choose concatenation -- which is why 3 + "5" is also "35".',
    $j$[
      {"text": "Minus has only a numeric meaning, so both sides convert to numbers. Plus also means concatenation, and a string operand selects that.", "correct": true},
      {"text": "Minus cannot be used on strings, so JavaScript falls back to the number.", "correct": false},
      {"text": "JavaScript always converts to a string when the two types differ.", "correct": false},
      {"text": "The operand on the left decides the result type.", "correct": false}
    ]$j$::JSONB);

SELECT seed_reasoning_question(
    E'A form field arrives as the string "0". Which check correctly identifies that it represents the number zero?',
    3, 'variables',
    'A non-empty string is truthy, so "0" does not pass !field. Comparing the string to the number 0 with === is false because the types differ, and .length measures characters rather than value. Number() converts the whole string before comparing, which is the test you actually meant. Note it converts "" to 0 as well, so guard for an empty field separately.',
    $j$[
      {"text": "Number(field) === 0", "correct": true},
      {"text": "field === 0", "correct": false},
      {"text": "!field", "correct": false},
      {"text": "field.length === 0", "correct": false}
    ]$j$::JSONB);

SELECT seed_reasoning_question(
    E'Why does "10" > "9" return false?',
    3, 'variables',
    'When both sides of a relational operator are strings, they are compared character by character. "1" comes before "9", so the comparison stops there. Conversion to numbers only happens when the types differ -- "10" > 9 is true.',
    $j$[
      {"text": "Both operands are strings, so they are compared character by character, and \"1\" comes before \"9\".", "correct": true},
      {"text": "The > operator always converts its operands to numbers first.", "correct": false},
      {"text": "Strings are compared by length before anything else.", "correct": false},
      {"text": "Comparison operators do not work on strings, so the result is always false.", "correct": false}
    ]$j$::JSONB);

SELECT seed_reasoning_question(
    E'What is the bug in this code?\n\nconst items = [{ price: "10" }, { price: "5" }];\nlet total = 0;\n\nfor (const item of items) {\n  total += item.price;\n}\n\nconsole.log(total);',
    3, 'variables',
    'total starts as the number 0, but item.price is a string, so + chooses concatenation and total becomes "0105". Convert as you read: total += Number(item.price).',
    $j$[
      {"text": "price is a string, so += concatenates instead of adding.", "correct": true},
      {"text": "total should start as an empty string rather than 0.", "correct": false},
      {"text": "for...of cannot iterate an array of objects.", "correct": false},
      {"text": "+= does not work on a property read from an object.", "correct": false}
    ]$j$::JSONB);

SELECT seed_reasoning_question(
    E'What is the bug in this code?\n\nconst rows = [{ amount: 5 }, { value: 3 }];\nlet total = 0;\n\nfor (const row of rows) {\n  total += row.amount;\n}\n\nconsole.log(total);',
    3, 'variables',
    'Reading a property that is not there gives undefined, and undefined in arithmetic gives NaN -- which then poisons every later addition. NaN almost always means a value was missing, not that the arithmetic was wrong.',
    $j$[
      {"text": "The second row has no amount, so undefined enters the arithmetic and the total becomes NaN.", "correct": true},
      {"text": "A division by zero somewhere in the loop produces NaN.", "correct": false},
      {"text": "One of the values is a string, so the total is concatenated instead.", "correct": false},
      {"text": "total has to be declared with let inside the loop body.", "correct": false}
    ]$j$::JSONB);

-- ═══════════════════ equality (operators) · 2 reason, 3 debug ═══════════════════

SELECT seed_reasoning_question(
    E'Which check is true for both null and undefined, but false for 0, "" and false?',
    3, 'conditionals',
    'Loose equality treats null and undefined as equal to each other and to nothing else, so == null catches exactly those two. === null misses undefined and === undefined misses null. !value also catches 0, "" and false. This is the one case where == is more precise than ===.',
    $j$[
      {"text": "value == null", "correct": true},
      {"text": "value === null", "correct": false},
      {"text": "value === undefined", "correct": false},
      {"text": "!value", "correct": false}
    ]$j$::JSONB);

SELECT seed_reasoning_question(
    E'Why is 0 == false true, while 0 === false is false?',
    3, 'conditionals',
    'Loose equality converts before comparing, and with a boolean involved it converts to number -- false becomes 0, so 0 == 0 holds. Strict equality requires the same type, and number is not boolean. "Any two falsy values are equal" is a tempting rule and a false one: null == false is false.',
    $j$[
      {"text": "== converts both operands to numbers, and false becomes 0. === compares types first and stops when they differ.", "correct": true},
      {"text": "== ignores the types of its operands entirely.", "correct": false},
      {"text": "Any two falsy values are == to each other.", "correct": false},
      {"text": "=== compares references, and 0 and false are stored in different places.", "correct": false}
    ]$j$::JSONB);

SELECT seed_reasoning_question(
    E'What is the bug in this code?\n\nfunction report(count) {\n  if (count == false) {\n    return "nothing to report";\n  }\n  return count + " items";\n}\n\nconsole.log(report(0));',
    3, 'conditionals',
    'Comparing a number to a boolean makes == convert both to numbers, so 0 and false match. Zero is a legitimate count and this guard swallows it. Test what you actually mean -- whether the value is missing, not whether it is falsy.',
    $j$[
      {"text": "0 == false is true, so a real count of zero is reported as missing.", "correct": true},
      {"text": "The returned string needs a String() call around count.", "correct": false},
      {"text": "The comparison should be count != false.", "correct": false},
      {"text": "report needs a default value for its parameter.", "correct": false}
    ]$j$::JSONB);

SELECT seed_reasoning_question(
    E'What is the bug in this code?\n\nconst seen = [{ id: 1 }];\nconst next = { id: 1 };\n\nif (!seen.includes(next)) {\n  seen.push(next);\n}\n\nconsole.log(seen.length);',
    3, 'objects',
    'Two objects are equal only if they are the same object, however identical their contents. includes uses that same rule, so it never matches a freshly built one. Compare something primitive instead: seen.some((s) => s.id === next.id).',
    $j$[
      {"text": "includes compares by identity, and next is a different object from the one already stored.", "correct": true},
      {"text": "includes does not work on an array of objects.", "correct": false},
      {"text": "The comparison inside includes should be == rather than ===.", "correct": false},
      {"text": "push returns a number, so length is reported wrongly.", "correct": false}
    ]$j$::JSONB);

SELECT seed_reasoning_question(
    E'What is the bug in this code?\n\nconst users = [{ id: 1, name: "Ada" }];\nconst params = { id: "1" };\n\nconst user = users.find((u) => u.id === params.id);\nconsole.log(user);',
    3, 'conditionals',
    'Values arriving from a URL, a form or JSON are strings even when they look like numbers, and === compares type first, so "1" === 1 is false. Switching to == would appear to fix it; converting once at the boundary with Number(params.id) says what you mean and keeps the comparison strict.',
    $j$[
      {"text": "params.id is the string \"1\" and u.id is the number 1, so === is never true.", "correct": true},
      {"text": "find needs a second argument to say what to compare.", "correct": false},
      {"text": "No user with that id exists in the array.", "correct": false},
      {"text": "find returns an index rather than the object.", "correct": false}
    ]$j$::JSONB);

-- ════════════════════════ loop-conditions (loops) · 2 debug ════════════════════════

SELECT seed_reasoning_question(
    E'What is the bug in this code?\n\nconst items = ["a", "b", "c"];\nlet out = "";\n\nfor (let i = 1; i < items.length; i++) {\n  out += items[i];\n}\n\nconsole.log(out);',
    2, 'loops',
    'Array indexes start at 0, so a loop starting at 1 silently skips the first element. It still runs without error and still produces a plausible-looking answer, which is what makes this kind of off-by-one easy to miss.',
    $j$[
      {"text": "The counter starts at 1, so index 0 is never read.", "correct": true},
      {"text": "The condition should be i <= items.length.", "correct": false},
      {"text": "The array is missing its first item.", "correct": false},
      {"text": "out should be initialised as an empty array.", "correct": false}
    ]$j$::JSONB);

SELECT seed_reasoning_question(
    E'What is the bug in this code?\n\nlet remaining = 5;\n\nwhile (remaining > 0) {\n  console.log("working");\n}',
    2, 'loops',
    'A while loop only re-checks its condition; it changes nothing by itself. Whatever the condition depends on has to be updated inside the body, or the condition never becomes false and the loop never ends.',
    $j$[
      {"text": "remaining is never changed inside the loop, so the condition stays true forever.", "correct": true},
      {"text": "The condition should be remaining >= 0.", "correct": false},
      {"text": "A while loop cannot be driven by a counter.", "correct": false},
      {"text": "The loop needs a break statement to be valid.", "correct": false}
    ]$j$::JSONB);

-- ═══════════════════════ return-values (functions) · 2 debug ═══════════════════════

SELECT seed_reasoning_question(
    E'What is the bug in this code?\n\nfunction grade(score) {\n  if (score >= 50) {\n    return "pass";\n  }\n}\n\nconsole.log(grade(20));',
    2, 'functions',
    'A function that runs off its end returns undefined -- there is no implicit "nothing happened" value. Every path the code can take needs a return, or the caller gets undefined from the branch you forgot about.',
    $j$[
      {"text": "When the condition is false the function reaches its end and returns undefined.", "correct": true},
      {"text": "The function should log the result instead of returning it.", "correct": false},
      {"text": "score has to be converted to a number before comparing.", "correct": false},
      {"text": "An if without a matching else is a syntax error.", "correct": false}
    ]$j$::JSONB);

SELECT seed_reasoning_question(
    E'What is the bug in this code?\n\nfunction shout(items) {\n  for (const item of items) {\n    return item.toUpperCase();\n  }\n}\n\nconsole.log(shout(["a", "b", "c"]));',
    2, 'functions',
    'return leaves the whole function immediately, not just the current iteration, so the loop can only ever run once. To produce something from every item, collect into an array and return it after the loop -- or use map.',
    $j$[
      {"text": "return exits the whole function, so the loop only ever runs once.", "correct": true},
      {"text": "The loop should use continue rather than return.", "correct": false},
      {"text": "toUpperCase cannot be called inside a loop body.", "correct": false},
      {"text": "The function has to declare that it returns an array.", "correct": false}
    ]$j$::JSONB);

-- ═══════════════════ functions-as-values (functions) · 2 reason ═══════════════════

SELECT seed_reasoning_question(
    E'Which one runs greet after 100 milliseconds, rather than immediately?\n\nfunction greet() {\n  console.log("hi");\n}',
    3, 'functions',
    'greet is the function itself; greet() runs it now and hands setTimeout whatever it returned, which here is undefined. The arrow version defers but returns the function instead of calling it, so nothing is ever logged. The parentheses are the whole difference.',
    $j$[
      {"text": "setTimeout(greet, 100)", "correct": true},
      {"text": "setTimeout(greet(), 100)", "correct": false},
      {"text": "setTimeout(() => greet, 100)", "correct": false},
      {"text": "setTimeout(greet(100))", "correct": false}
    ]$j$::JSONB);

SELECT seed_reasoning_question(
    E'A click handler has to call remove(id). Which registers it correctly?',
    3, 'functions',
    'A listener needs a function to call later. remove(id) runs immediately and registers its return value instead. Passing remove defers correctly, but the handler is then called with the event object rather than your id. Wrapping in an arrow keeps the call deferred and supplies the argument.',
    $j$[
      {"text": "button.addEventListener(\"click\", () => remove(id))", "correct": true},
      {"text": "button.addEventListener(\"click\", remove(id))", "correct": false},
      {"text": "button.addEventListener(\"click\", remove)", "correct": false},
      {"text": "button.addEventListener(\"click\", \"remove(id)\")", "correct": false}
    ]$j$::JSONB);

-- ══════════════════════ closures (scope) · 2 explain, 3 debug ══════════════════════

SELECT seed_reasoning_question(
    E'Why does next() keep counting up instead of restarting at 1?\n\nfunction makeCounter() {\n  let n = 0;\n  return () => ++n;\n}\n\nconst next = makeCounter();\nconsole.log(next(), next());',
    4, 'scope',
    'A function created inside another function keeps a live reference to that call''s variables, so they are not discarded when the outer function returns. A copy would freeze the value -- the fact that it keeps climbing is the proof that it is a reference, not a snapshot.',
    $j$[
      {"text": "The returned function holds a reference to the scope it was created in, so n survives after makeCounter returns.", "correct": true},
      {"text": "n is copied into the returned function at the moment it is created.", "correct": false},
      {"text": "n becomes a global variable once makeCounter finishes running.", "correct": false},
      {"text": "JavaScript caches the value a function returned last.", "correct": false}
    ]$j$::JSONB);

SELECT seed_reasoning_question(
    E'Why do a and b count independently?\n\nfunction makeCounter() {\n  let n = 0;\n  return () => ++n;\n}\n\nconst a = makeCounter();\nconst b = makeCounter();\na();\na();\nconsole.log(b());',
    4, 'scope',
    'The scope is created per call, not per function body. Two calls to the same factory produce two separate sets of variables, so the counters cannot interfere. Assigning them to different names is not what separates them -- calling the factory twice is.',
    $j$[
      {"text": "Each call to makeCounter creates a new scope, so a and b close over different n variables.", "correct": true},
      {"text": "They share n, but creating b reset it back to 0.", "correct": false},
      {"text": "They are independent because they were assigned to different variables.", "correct": false},
      {"text": "Only functions created with new get their own state.", "correct": false}
    ]$j$::JSONB);

SELECT seed_reasoning_question(
    E'What is the bug in this code?\n\nlet n = 0;\n\nfunction makeCounter() {\n  return () => ++n;\n}\n\nconst a = makeCounter();\nconst b = makeCounter();\na();\nconsole.log(b());',
    4, 'scope',
    'What a closure captures is decided by where the variable is declared, not by how many times the factory is called. n sits outside makeCounter, so every counter shares it. Moving let n = 0 inside the function gives each call its own.',
    $j$[
      {"text": "n is declared outside makeCounter, so every counter shares the same variable.", "correct": true},
      {"text": "makeCounter has to be called with new to produce separate counters.", "correct": false},
      {"text": "let should be const so that each counter gets its own copy.", "correct": false},
      {"text": "The arrow function should be written as a regular function.", "correct": false}
    ]$j$::JSONB);

SELECT seed_reasoning_question(
    E'What is the bug in this code?\n\nconst memo = {};\n\nfunction memoize(fn) {\n  return (n) => {\n    if (memo[n] === undefined) {\n      memo[n] = fn(n);\n    }\n    return memo[n];\n  };\n}\n\nconst double = memoize((n) => n * 2);\nconst triple = memoize((n) => n * 3);\n\nconsole.log(double(5), triple(5));',
    4, 'scope',
    'memo is declared outside memoize, so every memoised function shares one cache. double(5) stores 10 under the key 5, and triple(5) then finds that entry and returns it without ever calling its own function. Move const memo = {} inside memoize and each call gets a cache of its own.',
    $j$[
      {"text": "memo is declared outside memoize, so every memoised function shares the same cache.", "correct": true},
      {"text": "memoize has to be called with new to give each function its own cache.", "correct": false},
      {"text": "The returned arrow function should be a regular function so that it gets its own scope.", "correct": false},
      {"text": "double and triple have to be declared with let rather than const.", "correct": false}
    ]$j$::JSONB);

SELECT seed_reasoning_question(
    E'What is the bug in this code?\n\nfunction debounce(fn, ms) {\n  return (...args) => {\n    let timer;\n    clearTimeout(timer);\n    timer = setTimeout(() => fn(...args), ms);\n  };\n}',
    4, 'scope',
    'Debouncing depends on remembering the previous timer between calls, so that variable has to live in the closure -- outside the returned function, inside debounce. Declared where it is, every call starts with a fresh undefined timer and clearTimeout cancels nothing.',
    $j$[
      {"text": "timer is declared inside the returned function, so each call gets a fresh one and clearTimeout never cancels the previous timer.", "correct": true},
      {"text": "ms has to be converted to a number before being passed to setTimeout.", "correct": false},
      {"text": "The returned function should use function rather than an arrow.", "correct": false},
      {"text": "clearTimeout has to be called after setTimeout, not before.", "correct": false}
    ]$j$::JSONB);

DROP FUNCTION seed_reasoning_question(TEXT, INTEGER, TEXT, TEXT, JSONB);

SELECT COUNT(*) AS active_questions FROM questions WHERE is_active;
