-- Flush snippet bank, expansion.
--
-- Same rule as the Code Blitz expansion: concepts REPEAT, instances DIFFER.
-- Knowing that microtasks beat macrotasks must not be enough -- you still have
-- to order this particular arrangement.
--
-- Honours the original bank's constraint: nothing here depends on how many
-- microtask ticks `await somePromise` costs, since V8's await optimisation
-- changed that. Deferred continuations use `await null`, one tick under any
-- engine.
--
-- Every snippet was executed in Node before being written here, its real
-- console.log order compared against the declared order, and every distractor
-- checked to confirm it never prints. The checker was mutation-tested -- a
-- deliberately swapped order and a deliberately leaking distractor both fail it
-- -- so a clean run means something.
--
-- Depends on seed_flush() from 002_flush_snippets.sql. Safe to re-run.

-- 1 (difficulty 1)
SELECT seed_flush(
    E'console.log("one");\n\nsetTimeout(() => console.log("three"), 0);\n\nconsole.log("two");',
    1, ARRAY['one', 'two', 'three']);

-- 2 (difficulty 1)
SELECT seed_flush(
    E'setTimeout(() => console.log("last"), 0);\n\nconsole.log("first");\nconsole.log("second");',
    1, ARRAY['first', 'second', 'last']);

-- 3 (difficulty 2)
SELECT seed_flush(
    E'console.log("a");\n\nsetTimeout(() => console.log("c"), 10);\nsetTimeout(() => console.log("b"), 0);',
    2, ARRAY['a', 'b', 'c']);

-- 4 (difficulty 2)
SELECT seed_flush(
    E'setTimeout(() => console.log("timer"), 0);\n\nPromise.resolve().then(() => console.log("micro"));\n\nconsole.log("sync");',
    2, ARRAY['sync', 'micro', 'timer']);

-- 5 (difficulty 3)
SELECT seed_flush(
    E'console.log("A");\n\nsetTimeout(() => console.log("B"), 0);\n\nPromise.resolve().then(() => console.log("C"));\nPromise.resolve().then(() => console.log("D"));\n\nconsole.log("E");',
    3, ARRAY['A', 'E', 'C', 'D', 'B']);

-- 6 (difficulty 3)
SELECT seed_flush(
    E'queueMicrotask(() => console.log("micro"));\nsetTimeout(() => console.log("macro"), 0);\nconsole.log("now");',
    3, ARRAY['now', 'micro', 'macro']);

-- 7 (difficulty 2)
SELECT seed_flush(
    E'console.log("before");\n\nnew Promise((resolve) => {\n    console.log("inside");\n    resolve();\n}).then(() => console.log("after"));\n\nconsole.log("end");',
    2, ARRAY['before', 'inside', 'end', 'after']);

-- 8 (difficulty 3)
SELECT seed_flush(
    E'const p = new Promise((resolve) => {\n    console.log("executor");\n    resolve("value");\n});\n\nconsole.log("sync");\n\np.then((v) => console.log(v));',
    3, ARRAY['executor', 'sync', 'value']);

-- 9 (difficulty 3)
SELECT seed_flush(
    E'Promise.resolve()\n    .then(() => console.log("one"))\n    .then(() => console.log("two"));\n\nPromise.resolve().then(() => console.log("solo"));',
    3, ARRAY['one', 'solo', 'two']);

-- 10 (difficulty 4)
SELECT seed_flush(
    E'Promise.resolve()\n    .then(() => console.log("1"))\n    .then(() => console.log("2"))\n    .then(() => console.log("3"));\n\nPromise.resolve().then(() => console.log("X"));\n\nconsole.log("sync");',
    4, ARRAY['sync', '1', 'X', '2', '3']);

-- 11 (difficulty 3)
SELECT seed_flush(
    E'async function run() {\n    console.log("enter");\n    await null;\n    console.log("resumed");\n}\n\nrun();\nconsole.log("after call");',
    3, ARRAY['enter', 'after call', 'resumed']);

-- 12 (difficulty 4)
SELECT seed_flush(
    E'async function run() {\n    console.log("A");\n    await null;\n    console.log("C");\n}\n\nrun();\nPromise.resolve().then(() => console.log("B"));\nconsole.log("start");',
    4, ARRAY['A', 'start', 'C', 'B']);

-- 13 (difficulty 4)
SELECT seed_flush(
    E'async function outer() {\n    console.log("outer start");\n    await inner();\n    console.log("outer end");\n}\n\nasync function inner() {\n    console.log("inner");\n}\n\nouter();\nconsole.log("sync");',
    4, ARRAY['outer start', 'inner', 'sync', 'outer end']);

-- 14 (difficulty 2)
SELECT seed_flush(
    E'Promise.resolve("ok")\n    .then((v) => console.log(v))\n    .catch(() => console.log("caught"));\n\nconsole.log("sync");',
    2, ARRAY['sync', 'ok'],
    ARRAY['caught']);

-- 15 (difficulty 3)
SELECT seed_flush(
    E'const id = setTimeout(() => console.log("never"), 0);\nclearTimeout(id);\n\nsetTimeout(() => console.log("later"), 0);\nconsole.log("now");',
    3, ARRAY['now', 'later'],
    ARRAY['never']);

-- 16 (difficulty 3)
SELECT seed_flush(
    E'const ready = false;\n\nif (ready) {\n    console.log("ready");\n} else {\n    console.log("waiting");\n}\n\nsetTimeout(() => console.log("done"), 0);',
    3, ARRAY['waiting', 'done'],
    ARRAY['ready']);

-- 17 (difficulty 4)
SELECT seed_flush(
    E'Promise.reject(new Error("boom"))\n    .catch(() => console.log("handled"))\n    .then(() => console.log("continues"));\n\nconsole.log("sync");',
    4, ARRAY['sync', 'handled', 'continues'],
    ARRAY['boom']);

-- 18 (difficulty 4)
SELECT seed_flush(
    E'function unused() {\n    console.log("dead code");\n}\n\nconsole.log("alive");\nsetTimeout(() => console.log("tail"), 0);',
    4, ARRAY['alive', 'tail'],
    ARRAY['dead code']);

-- 19 (difficulty 3)
SELECT seed_flush(
    E'for (let i = 1; i <= 2; i++) {\n    setTimeout(() => console.log("t" + i), 0);\n}\n\nconsole.log("loop done");',
    3, ARRAY['loop done', 't1', 't2'],
    ARRAY['t3']);

-- 20 (difficulty 4)
SELECT seed_flush(
    E'[1, 2].forEach((n) => {\n    Promise.resolve().then(() => console.log("p" + n));\n});\n\nconsole.log("sync");',
    4, ARRAY['sync', 'p1', 'p2'],
    ARRAY['p0']);

-- 21 (difficulty 5)
SELECT seed_flush(
    E'setTimeout(() => {\n    console.log("timer");\n    Promise.resolve().then(() => console.log("in timer"));\n}, 0);\n\nPromise.resolve().then(() => console.log("micro"));\n\nconsole.log("sync");',
    5, ARRAY['sync', 'micro', 'timer', 'in timer']);

-- 22 (difficulty 5)
SELECT seed_flush(
    E'Promise.resolve().then(() => {\n    console.log("outer micro");\n    Promise.resolve().then(() => console.log("nested micro"));\n});\n\nsetTimeout(() => console.log("timer"), 0);\n\nconsole.log("sync");',
    5, ARRAY['sync', 'outer micro', 'nested micro', 'timer']);

-- 23 (difficulty 5)
SELECT seed_flush(
    E'async function run() {\n    console.log("1");\n    await null;\n    console.log("3");\n    await null;\n    console.log("5");\n}\n\nrun();\nPromise.resolve().then(() => console.log("2")).then(() => console.log("4"));',
    5, ARRAY['1', '3', '2', '5', '4']);

-- 24 (difficulty 5)
SELECT seed_flush(
    E'console.log("start");\n\nsetTimeout(() => console.log("macro 1"), 0);\n\nPromise.resolve()\n    .then(() => console.log("micro 1"))\n    .then(() => console.log("micro 2"));\n\nsetTimeout(() => console.log("macro 2"), 0);\n\nconsole.log("end");',
    5, ARRAY['start', 'end', 'micro 1', 'micro 2', 'macro 1', 'macro 2']);
