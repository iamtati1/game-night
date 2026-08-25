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
-- Depends on seed_question() from 001_code_blitz_questions.sql.

SELECT seed_question(
    E'What does this log?\n\nconsole.log([10, 9, 1].sort());',
    '[1, 9, 10]', '[1, 10, 9]', '[10, 9, 1]', '[9, 10, 1]', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log([5, 100, 20].sort());',
    '[5, 20, 100]', '[100, 20, 5]', '[5, 100, 20]', '[20, 5, 100]', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log([3, 25, 4].sort((a, b) => a - b));',
    '[25, 4, 3]', '[3, 4, 25]', '[3, 25, 4]', '[4, 3, 25]', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(1 + "1");',
    '2', '"11"', 'NaN', '"2"', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log("5" - 3);',
    '"53"', '2', 'NaN', '"2"', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log("5" * "2");',
    '10', '"52"', 'NaN', '"10"', 1);

SELECT seed_question(
    E'What does this log?\n\nconsole.log([] + {});',
    '"[object Object]"', '"{}"', '0', 'NaN', 1);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(true + true);',
    '2', '"truetrue"', '1', 'NaN', 1);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(typeof null);',
    '"object"', '"null"', '"undefined"', '"boolean"', 1);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(typeof NaN);',
    '"nan"', '"number"', '"undefined"', '"object"', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(typeof []);',
    '"array"', '"object"', '"undefined"', '"list"', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(typeof function () {});',
    '"object"', '"function"', '"undefined"', '"Function"', 2);

SELECT seed_question(
    E'What does this log?\n\nconst nums = [2, 4, 6];\nconsole.log(nums.map(n => n * 2));',
    '[2, 4, 6]', '[4, 8, 12]', '[2, 4, 6, 2, 4, 6]', 'undefined', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log([1, 2, 3].filter(n => n > 1).length);',
    '3', '1', '2', '0', 3);

SELECT seed_question(
    E'What does this log?\n\nconsole.log([1, 2, 3].reduce((a, b) => a + b, 10));',
    '6', '16', '10', '"1236"', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log([1, 2, 3].map(n => n * 2).filter(n => n > 3));',
    '[4, 6]', '[2, 4, 6]', '[6]', '[2]', 1);

SELECT seed_question(
    E'What does this log?\n\nconsole.log([1, 2, 3].indexOf(4));',
    'null', 'undefined', '-1', '0', 3);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(["a", "b"].join("-"));',
    '"ab"', '"a-b"', '["a-b"]', '"a,b"', 2);

SELECT seed_question(
    E'What does this log?\n\nconst a = { n: 1 };\nconst b = a;\nb.n = 2;\nconsole.log(a.n);',
    '1', '2', 'undefined', 'NaN', 2);

SELECT seed_question(
    E'What does this log?\n\nconst a = [1, 2];\nconst b = [...a];\nb.push(3);\nconsole.log(a.length);',
    '3', '2', '1', 'undefined', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log({ a: 1 } === { a: 1 });',
    'true', 'false', 'undefined', 'TypeError', 2);

SELECT seed_question(
    E'What does this log?\n\nconst o = { x: 1 };\nfunction f(v) { v = { x: 9 }; }\nf(o);\nconsole.log(o.x);',
    '9', '1', 'undefined', 'NaN', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(0.1 + 0.2 === 0.3);',
    'true', 'false', 'NaN', 'undefined', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log("" == 0);',
    'true', 'false', 'NaN', 'TypeError', 1);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(null == undefined);',
    'true', 'false', 'TypeError', 'undefined', 1);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(null === undefined);',
    'true', 'false', 'TypeError', 'undefined', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(Boolean("0"));',
    'false', 'true', '0', 'NaN', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(Boolean([]));',
    'false', 'true', 'undefined', '0', 2);

SELECT seed_question(
    E'What does this log?\n\nlet x = 1;\nfunction f() { let x = 2; return x; }\nconsole.log(f() + x);',
    '2', '3', '4', '1', 2);

SELECT seed_question(
    E'What does this log?\n\nfunction counter() {\n  let n = 0;\n  return () => ++n;\n}\nconst c = counter();\nc();\nconsole.log(c());',
    '1', '2', '0', 'undefined', 2);

SELECT seed_question(
    E'What does this log?\n\nconst fns = [];\nfor (let i = 0; i < 3; i++) fns.push(() => i);\nconsole.log(fns[0]());',
    '3', '0', 'undefined', '1', 2);

SELECT seed_question(
    E'What does this log?\n\nvar fns = [];\nfor (var i = 0; i < 3; i++) fns.push(() => i);\nconsole.log(fns[0]());',
    '0', '3', 'undefined', '1', 2);

SELECT seed_question(
    E'What does this log?\n\nlet x;\nconsole.log(x);',
    'null', 'undefined', '0', 'ReferenceError', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log([1, 2, 3][5]);',
    'null', 'undefined', '-1', 'RangeError', 2);

SELECT seed_question(
    E'What does this log?\n\nfunction f() {}\nconsole.log(f());',
    'null', 'undefined', '0', 'NaN', 2);

SELECT seed_question(
    E'What does this log?\n\nconst o = { a: 1 };\nconsole.log(o.b?.c);',
    'TypeError', 'undefined', 'null', 'false', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(null ?? "fallback");',
    'null', '"fallback"', 'undefined', '""', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(0 ?? "fallback");',
    '"fallback"', '0', 'undefined', 'null', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(0 || "fallback");',
    '0', '"fallback"', 'undefined', 'false', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log([..."abc"]);',
    '["a", "b", "c"]', '["abc"]', '[97, 98, 99]', '"abc"', 1);

SELECT seed_question(
    E'What does this log?\n\nconsole.log("abc".slice(-2));',
    '"ab"', '"bc"', '"c"', '""', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log("a,b,,c".split(",").length);',
    '3', '4', '5', '2', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log("Hello".indexOf("l"));',
    '3', '2', '-1', '4', 2);

SELECT seed_question(
    E'What does this log?\n\nconst a = [1, 2, 3];\na.length = 1;\nconsole.log(a);',
    '[1, 2, 3]', '[1]', '[]', '[3]', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log([1, 2] + [3, 4]);',
    '[1, 2, 3, 4]', '"1,23,4"', '10', 'TypeError', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(Array.isArray([]));',
    'true', 'false', '"array"', 'undefined', 1);

SELECT seed_question(
    E'What does this log?\n\nconsole.log([1, [2, [3]]].flat().length);',
    '3', '2', '1', '4', 1);

SELECT seed_question(
    E'In what order does this log?\n\nconsole.log("A");\nsetTimeout(() => console.log("B"), 0);\nconsole.log("C");',
    'A, B, C', 'A, C, B', 'B, A, C', 'C, A, B', 2);

SELECT seed_question(
    E'In what order does this log?\n\nconsole.log("A");\nPromise.resolve().then(() => console.log("B"));\nconsole.log("C");',
    'A, B, C', 'A, C, B', 'B, A, C', 'C, B, A', 2);

SELECT seed_question(
    E'In what order does this log?\n\nsetTimeout(() => console.log("A"), 0);\nPromise.resolve().then(() => console.log("B"));\nconsole.log("C");',
    'A, B, C', 'C, B, A', 'C, A, B', 'B, C, A', 2);

SELECT seed_question(
    E'In what order does this log?\n\nasync function run() {\n  console.log("A");\n  await null;\n  console.log("B");\n}\nrun();\nconsole.log("C");',
    'A, B, C', 'A, C, B', 'C, A, B', 'B, A, C', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(Math.max());',
    '0', '-Infinity', 'Infinity', 'NaN', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(parseInt("08"));',
    '8', '0', 'NaN', 'undefined', 1);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(parseInt("12px"));',
    'NaN', '12', '0', '"12"', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(Number(""));',
    'NaN', '0', 'undefined', 'null', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(10 % 3);',
    '3', '1', '0', '3.33', 2);
SELECT seed_question(
    E'What does this print?\n\nconst newWord = (str) => {\n    let result = "";\n\n    for (const char of str) {\n        result += char.repeat(3);\n    }\n\n    return result;\n};\n\nconsole.log(newWord("cat"));',
    'catcatcat',
    'cccaaattt',
    'cccattt',
    'cat',
    2
);
