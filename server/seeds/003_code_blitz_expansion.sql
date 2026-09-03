-- Code Blitz question bank, expansion.
--
-- The design rule is that concepts REPEAT while instances DIFFER. Recognising
-- "this is a sort question" must not hand you the answer -- you still have to
-- trace this particular array. That is the difference between a bank a returning
-- player memorises and one that keeps making them reason.
--
-- 56 questions across 12 concepts, every one of them executed in Node and
-- compared against its declared answer before being written here. That check
-- caught a real mistake: [5, 100, 20].sort() is [100, 20, 5] lexicographically,
-- not [5, 100, 20], and the question had also listed one distractor twice.
--
-- Re-runnable: seed_question skips any prompt that already exists, so this is
-- safe to apply on top of 001 and safe to apply twice.
--
-- Self-contained. This file used to name seed_question() from 001 as a
-- dependency, and that worked only because 001 never dropped it -- the helper
-- leaked into the database and was still lying around. The Flush pair had the
-- same arrangement with the cleanup actually present, and failed the moment the
-- seeds were applied in order. Every seed now defines and drops its own helper.

CREATE OR REPLACE FUNCTION seed_question(
    p_prompt TEXT,
    p_topic TEXT,
    p_a TEXT, p_b TEXT, p_c TEXT, p_d TEXT,
    p_correct INTEGER
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_question_id BIGINT;
BEGIN
    IF EXISTS (SELECT 1 FROM questions WHERE prompt = p_prompt) THEN
        RETURN;
    END IF;

    INSERT INTO questions (prompt, topic) VALUES (p_prompt, p_topic) RETURNING id INTO v_question_id;

    INSERT INTO question_options (question_id, option_text, display_order, is_correct)
    VALUES (v_question_id, p_a, 1, p_correct = 1),
           (v_question_id, p_b, 2, p_correct = 2),
           (v_question_id, p_c, 3, p_correct = 3),
           (v_question_id, p_d, 4, p_correct = 4);
END;
$$;

SELECT seed_question(
    E'What does this log?\n\nconsole.log([10, 9, 1].sort());',
    'array-methods',
    '[1, 9, 10]', '[1, 10, 9]', '[10, 9, 1]', '[9, 10, 1]', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log([5, 100, 20].sort());',
    'array-methods',
    '[5, 20, 100]', '[100, 20, 5]', '[5, 100, 20]', '[20, 5, 100]', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log([3, 25, 4].sort((a, b) => a - b));',
    'array-methods',
    '[25, 4, 3]', '[3, 4, 25]', '[3, 25, 4]', '[4, 3, 25]', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(1 + "1");',
    'variables',
    '2', '"11"', 'NaN', '"2"', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log("5" - 3);',
    'variables',
    '"53"', '2', 'NaN', '"2"', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log("5" * "2");',
    'variables',
    '10', '"52"', 'NaN', '"10"', 1);

SELECT seed_question(
    E'What does this log?\n\nconsole.log([] + {});',
    'variables',
    '"[object Object]"', '"{}"', '0', 'NaN', 1);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(true + true);',
    'variables',
    '2', '"truetrue"', '1', 'NaN', 1);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(typeof null);',
    'variables',
    '"object"', '"null"', '"undefined"', '"boolean"', 1);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(typeof NaN);',
    'variables',
    '"nan"', '"number"', '"undefined"', '"object"', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(typeof []);',
    'variables',
    '"array"', '"object"', '"undefined"', '"list"', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(typeof function () {});',
    'variables',
    '"object"', '"function"', '"undefined"', '"Function"', 2);

SELECT seed_question(
    E'What does this log?\n\nconst nums = [2, 4, 6];\nconsole.log(nums.map(n => n * 2));',
    'array-methods',
    '[2, 4, 6]', '[4, 8, 12]', '[2, 4, 6, 2, 4, 6]', 'undefined', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log([1, 2, 3].filter(n => n > 1).length);',
    'array-methods',
    '3', '1', '2', '0', 3);

SELECT seed_question(
    E'What does this log?\n\nconsole.log([1, 2, 3].reduce((a, b) => a + b, 10));',
    'array-methods',
    '6', '16', '10', '"1236"', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log([1, 2, 3].map(n => n * 2).filter(n => n > 3));',
    'array-methods',
    '[4, 6]', '[2, 4, 6]', '[6]', '[2]', 1);

SELECT seed_question(
    E'What does this log?\n\nconsole.log([1, 2, 3].indexOf(4));',
    'array-methods',
    'null', 'undefined', '-1', '0', 3);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(["a", "b"].join("-"));',
    'array-methods',
    '"ab"', '"a-b"', '["a-b"]', '"a,b"', 2);

SELECT seed_question(
    E'What does this log?\n\nconst a = { n: 1 };\nconst b = a;\nb.n = 2;\nconsole.log(a.n);',
    'objects',
    '1', '2', 'undefined', 'NaN', 2);

SELECT seed_question(
    E'What does this log?\n\nconst a = [1, 2];\nconst b = [...a];\nb.push(3);\nconsole.log(a.length);',
    'arrays',
    '3', '2', '1', 'undefined', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log({ a: 1 } === { a: 1 });',
    'objects',
    'true', 'false', 'undefined', 'TypeError', 2);

SELECT seed_question(
    E'What does this log?\n\nconst o = { x: 1 };\nfunction f(v) { v = { x: 9 }; }\nf(o);\nconsole.log(o.x);',
    'objects',
    '9', '1', 'undefined', 'NaN', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(0.1 + 0.2 === 0.3);',
    'variables',
    'true', 'false', 'NaN', 'undefined', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log("" == 0);',
    'variables',
    'true', 'false', 'NaN', 'TypeError', 1);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(null == undefined);',
    'variables',
    'true', 'false', 'TypeError', 'undefined', 1);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(null === undefined);',
    'variables',
    'true', 'false', 'TypeError', 'undefined', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(Boolean("0"));',
    'variables',
    'false', 'true', '0', 'NaN', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(Boolean([]));',
    'variables',
    'false', 'true', 'undefined', '0', 2);

SELECT seed_question(
    E'What does this log?\n\nlet x = 1;\nfunction f() { let x = 2; return x; }\nconsole.log(f() + x);',
    'scope',
    '2', '3', '4', '1', 2);

SELECT seed_question(
    E'What does this log?\n\nfunction counter() {\n  let n = 0;\n  return () => ++n;\n}\nconst c = counter();\nc();\nconsole.log(c());',
    'scope',
    '1', '2', '0', 'undefined', 2);

SELECT seed_question(
    E'What does this log?\n\nconst fns = [];\nfor (let i = 0; i < 3; i++) fns.push(() => i);\nconsole.log(fns[0]());',
    'scope',
    '3', '0', 'undefined', '1', 2);

SELECT seed_question(
    E'What does this log?\n\nvar fns = [];\nfor (var i = 0; i < 3; i++) fns.push(() => i);\nconsole.log(fns[0]());',
    'scope',
    '0', '3', 'undefined', '1', 2);

SELECT seed_question(
    E'What does this log?\n\nlet x;\nconsole.log(x);',
    'variables',
    'null', 'undefined', '0', 'ReferenceError', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log([1, 2, 3][5]);',
    'arrays',
    'null', 'undefined', '-1', 'RangeError', 2);

SELECT seed_question(
    E'What does this log?\n\nfunction f() {}\nconsole.log(f());',
    'functions',
    'null', 'undefined', '0', 'NaN', 2);

SELECT seed_question(
    E'What does this log?\n\nconst o = { a: 1 };\nconsole.log(o.b?.c);',
    'objects',
    'TypeError', 'undefined', 'null', 'false', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(null ?? "fallback");',
    'conditionals',
    'null', '"fallback"', 'undefined', '""', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(0 ?? "fallback");',
    'conditionals',
    '"fallback"', '0', 'undefined', 'null', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(0 || "fallback");',
    'conditionals',
    '0', '"fallback"', 'undefined', 'false', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log([..."abc"]);',
    'arrays',
    '["a", "b", "c"]', '["abc"]', '[97, 98, 99]', '"abc"', 1);

SELECT seed_question(
    E'What does this log?\n\nconsole.log("abc".slice(-2));',
    'variables',
    '"ab"', '"bc"', '"c"', '""', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log("a,b,,c".split(",").length);',
    'arrays',
    '3', '4', '5', '2', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log("Hello".indexOf("l"));',
    'variables',
    '3', '2', '-1', '4', 2);

SELECT seed_question(
    E'What does this log?\n\nconst a = [1, 2, 3];\na.length = 1;\nconsole.log(a);',
    'arrays',
    '[1, 2, 3]', '[1]', '[]', '[3]', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log([1, 2] + [3, 4]);',
    'arrays',
    '[1, 2, 3, 4]', '"1,23,4"', '10', 'TypeError', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(Array.isArray([]));',
    'arrays',
    'true', 'false', '"array"', 'undefined', 1);

SELECT seed_question(
    E'What does this log?\n\nconsole.log([1, [2, [3]]].flat().length);',
    'array-methods',
    '3', '2', '1', '4', 1);

SELECT seed_question(
    E'In what order does this log?\n\nconsole.log("A");\nsetTimeout(() => console.log("B"), 0);\nconsole.log("C");',
    'async',
    'A, B, C', 'A, C, B', 'B, A, C', 'C, A, B', 2);

SELECT seed_question(
    E'In what order does this log?\n\nconsole.log("A");\nPromise.resolve().then(() => console.log("B"));\nconsole.log("C");',
    'async',
    'A, B, C', 'A, C, B', 'B, A, C', 'C, B, A', 2);

SELECT seed_question(
    E'In what order does this log?\n\nsetTimeout(() => console.log("A"), 0);\nPromise.resolve().then(() => console.log("B"));\nconsole.log("C");',
    'async',
    'A, B, C', 'C, B, A', 'C, A, B', 'B, C, A', 2);

SELECT seed_question(
    E'In what order does this log?\n\nasync function run() {\n  console.log("A");\n  await null;\n  console.log("B");\n}\nrun();\nconsole.log("C");',
    'async',
    'A, B, C', 'A, C, B', 'C, A, B', 'B, A, C', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(Math.max());',
    'variables',
    '0', '-Infinity', 'Infinity', 'NaN', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(parseInt("08"));',
    'variables',
    '8', '0', 'NaN', 'undefined', 1);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(parseInt("12px"));',
    'variables',
    'NaN', '12', '0', '"12"', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(Number(""));',
    'variables',
    'NaN', '0', 'undefined', 'null', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(10 % 3);',
    'variables',
    '3', '1', '0', '3.33', 2);
SELECT seed_question(
    E'What does this print?\n\nconst newWord = (str) => {\n    let result = "";\n\n    for (const char of str) {\n        result += char.repeat(3);\n    }\n\n    return result;\n};\n\nconsole.log(newWord("cat"));',
    'loops',
    'catcatcat',
    'cccaaattt',
    'cccattt',
    'cat',
    2
);

DROP FUNCTION seed_question(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER);
