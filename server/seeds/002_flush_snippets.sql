-- Flush content. Every snippet has exactly ONE defensible output order.
--
-- Deliberately avoided: anything depending on how many microtask ticks
-- `await somePromise` costs. That changed with V8's await optimisation, so a
-- puzzle resting on it would be unfair to anyone who learned either version.
-- Where a continuation is deferred, these use `await null`, which is one tick
-- under any engine.
--
-- Distractors are outputs offered as tiles that never actually print. They are
-- the sharpest thing about this game: recognising that a callback never fires is
-- a different skill from ordering the ones that do.
--
-- Safe to re-run: skips prompts that already exist.

CREATE OR REPLACE FUNCTION seed_flush(
    p_prompt TEXT,
    -- INTEGER, not SMALLINT, matching seed_question in 001. A bare SQL literal
    -- like `1` is typed integer, and PostgreSQL will not implicitly narrow it to
    -- smallint during function overload resolution -- so a SMALLINT parameter
    -- makes every call site fail with "function does not exist". The INSERT
    -- below assignment-casts to the smallint column, which is allowed.
    p_difficulty INTEGER,
    p_outputs TEXT[],
    p_distractors TEXT[] DEFAULT '{}'
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_id BIGINT;
    v_text TEXT;
    v_pos INTEGER := 0;
BEGIN
    IF EXISTS (SELECT 1 FROM flush_snippets WHERE prompt = p_prompt) THEN
        RETURN;
    END IF;

    INSERT INTO flush_snippets (prompt, difficulty)
    VALUES (p_prompt, p_difficulty)
    RETURNING id INTO v_id;

    FOREACH v_text IN ARRAY p_outputs LOOP
        v_pos := v_pos + 1;
        INSERT INTO flush_outputs (snippet_id, output_text, position)
        VALUES (v_id, v_text, v_pos);
    END LOOP;

    FOREACH v_text IN ARRAY p_distractors LOOP
        INSERT INTO flush_outputs (snippet_id, output_text, position, is_distractor)
        VALUES (v_id, v_text, NULL, TRUE);
    END LOOP;
END;
$$;

-- 1 -- the baseline: a macrotask always waits for the call stack to empty.
SELECT seed_flush(
    E'console.log("start");\n\nsetTimeout(() => console.log("timeout"), 0);\n\nconsole.log("end");',
    1, ARRAY['start', 'end', 'timeout']);

-- 2 -- the Promise executor runs synchronously. Catches almost everyone once.
SELECT seed_flush(
    E'console.log("A");\n\nnew Promise((resolve) => {\n    console.log("B");\n    resolve();\n}).then(() => console.log("C"));\n\nconsole.log("D");',
    2, ARRAY['A', 'B', 'D', 'C']);

-- 3 -- a microtask queued LATER still runs before a macrotask queued earlier.
SELECT seed_flush(
    E'setTimeout(() => console.log("timeout"), 0);\n\nPromise.resolve().then(() => console.log("promise"));\n\nconsole.log("sync");',
    2, ARRAY['sync', 'promise', 'timeout']);

-- 4 -- timers with equal delay fire in scheduling order; a longer delay waits.
SELECT seed_flush(
    E'setTimeout(() => console.log("10ms"), 10);\nsetTimeout(() => console.log("0ms first"), 0);\nsetTimeout(() => console.log("0ms second"), 0);\n\nconsole.log("sync");',
    3, ARRAY['sync', '0ms first', '0ms second', '10ms']);

-- 5 -- a .catch that never fires, because nothing rejects.
SELECT seed_flush(
    E'console.log("A");\n\nPromise.resolve()\n    .then(() => console.log("B"))\n    .catch(() => console.log("error"));\n\nsetTimeout(() => console.log("C"), 0);',
    3, ARRAY['A', 'B', 'C'], ARRAY['error']);

-- 6 -- await defers everything after it, even when the value is already known.
SELECT seed_flush(
    E'async function run() {\n    console.log("1");\n    await null;\n    console.log("3");\n}\n\nrun();\nconsole.log("2");',
    3, ARRAY['1', '2', '3']);

-- 7 -- two independent chains interleave: the queue drains in FIFO, not per-chain.
SELECT seed_flush(
    E'Promise.resolve()\n    .then(() => console.log("A"))\n    .then(() => console.log("C"));\n\nPromise.resolve().then(() => console.log("B"));\n\nconsole.log("sync");',
    4, ARRAY['sync', 'A', 'B', 'C']);

-- 8 -- rejection skips .then and lands in .catch, still as a microtask.
SELECT seed_flush(
    E'console.log("A");\n\nPromise.reject(new Error("boom"))\n    .then(() => console.log("then"))\n    .catch(() => console.log("caught"));\n\nsetTimeout(() => console.log("timer"), 0);\n\nconsole.log("B");',
    4, ARRAY['A', 'B', 'caught', 'timer'], ARRAY['then']);

-- 9 -- a timer scheduled from inside a microtask queues behind one already waiting.
SELECT seed_flush(
    E'Promise.resolve().then(() => {\n    console.log("micro");\n    setTimeout(() => console.log("inner timer"), 0);\n});\n\nsetTimeout(() => console.log("outer timer"), 0);\n\nconsole.log("sync");',
    5, ARRAY['sync', 'micro', 'outer timer', 'inner timer']);

-- 10 -- a promise that never settles. Its .then is unreachable, and the executor
--       still runs synchronously.
SELECT seed_flush(
    E'const pending = new Promise(() => {\n    console.log("executor");\n});\n\npending.then(() => console.log("resolved"));\n\nconsole.log("sync");\nsetTimeout(() => console.log("timer"), 0);',
    5, ARRAY['executor', 'sync', 'timer'], ARRAY['resolved']);

DROP FUNCTION seed_flush(TEXT, INTEGER, TEXT[], TEXT[]);

SELECT s.difficulty,
       COUNT(*) FILTER (WHERE NOT o.is_distractor) AS outputs,
       COUNT(*) FILTER (WHERE o.is_distractor)     AS distractors,
       LEFT(s.prompt, 40)                          AS snippet
FROM flush_snippets s
JOIN flush_outputs o ON o.snippet_id = s.id
GROUP BY s.id, s.difficulty, s.prompt
ORDER BY s.difficulty, s.id;
