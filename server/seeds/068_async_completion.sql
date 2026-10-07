-- Completing Async: nineteen question rungs across six concepts.
--
-- Fourteenth topic built to the Values template. Three more rungs --
-- event-loop, async-await and promise-all, all `produce` -- are code-writing
-- movements registered by 069.
--
-- THE INTERPRETER LEARNED TO WAIT FOR THIS, which is the largest single piece
-- of machinery any topic has needed: two queues, promises with three states,
-- `setTimeout`, `.then`/`.catch`/`.finally`, `Promise.all`, and real
-- suspension at `await`. Nothing here is faked by draining the queue early --
-- that would print `a, 1, b` where JavaScript prints `a, b, 1`, and that one
-- example is the whole topic.
--
-- `async` AND `await` LEFT THE REFUSED LIST HERE, as `var` did at Scope and
-- `new` at Objects. `this` and `class` are now the only words still refused.
--
-- EVERY SNIPPET BELOW HAS BEEN RUN, and the ordering in every answer is the
-- ordering the interpreter actually produces.
--
-- THE DISTINCTION THE TOPIC KEEPS RETURNING TO: handing work over is not doing
-- it. The value arrives later, and "later" has rules.

BEGIN;

CREATE OR REPLACE FUNCTION seed_as(
    p_concept TEXT, p_demand TEXT, p_prompt TEXT,
    p_correct TEXT, p_wrong TEXT[], p_why TEXT
)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_question BIGINT; v_challenge BIGINT; v_wrong TEXT; v_order INT := 1; v_type TEXT;
BEGIN
    SELECT id INTO v_question FROM questions WHERE prompt = p_prompt;
    IF v_question IS NOT NULL THEN RETURN; END IF;

    v_type := CASE WHEN p_demand IN ('recognise', 'recall', 'explain')
                   THEN 'match-concept' ELSE 'predict-output' END;

    INSERT INTO challenges (concept_id, demand_id, role, difficulty)
    SELECT c.id, d.id, 'practise',
           CASE WHEN d.display_order >= (SELECT display_order FROM demands WHERE slug='produce')
                THEN 3 ELSE 2 END
    FROM concepts c, demands d
    WHERE c.slug = p_concept AND d.slug = p_demand
    RETURNING id INTO v_challenge;

    INSERT INTO questions
        (prompt, difficulty, topic, challenge_type, challenge_id, source, explanation)
    VALUES (p_prompt, 3, 'async', v_type, v_challenge, 'jolt-async-completion', p_why)
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

/* ── 1 · callbacks ──────────────────────────────────────────────────────── */

SELECT seed_as('callbacks', 'predict',
    E'What does this log?\n\nfunction later(fn) {\n  setTimeout(fn, 0);\n}\nconsole.log("asked");\nlater(() => { console.log("ran"); });\nconsole.log("carried on");',
    'asked, carried on, ran', ARRAY['asked, ran, carried on', 'ran, asked, carried on', 'asked, carried on'],
    'Handing a function over is not running it. `later` only arranged for it, so the rest of the file finished first and the callback ran afterwards — even with a delay of 0.');

SELECT seed_as('callbacks', 'diagnose',
    E'This should log "hi" after a moment, and logs it immediately and then fails. Which line is the cause?\n\nfunction later(fn) {\n  setTimeout(fn, 0);\n}\nfunction hi() {\n  console.log("hi");\n}\nlater(hi());',
    'later(hi());',
    ARRAY['function later(fn) {', 'setTimeout(fn, 0);', 'function hi() {'],
    'The brackets called `hi` on the spot and handed over its result, which is nothing. A callback is passed WITHOUT brackets — `later(hi)` — so that something else can decide when to run it.');

SELECT seed_as('callbacks', 'repair',
    E'`later(hi());` runs too early and then fails. Which change fixes it?\n\nfunction later(fn) {\n  setTimeout(fn, 0);\n}\nfunction hi() {\n  console.log("hi");\n}\nlater(hi());',
    'Drop the brackets: later(hi);',
    ARRAY['Give setTimeout a longer delay', 'Declare hi with const instead', 'Call later twice'],
    'Without brackets the function itself is handed over; with them it is called first and its answer handed over instead. The delay is not involved — the problem happened before any waiting could begin.');

/* ── 2 · promise-states ─────────────────────────────────────────────────── */

SELECT seed_as('promise-states', 'recognise',
    E'A promise has settled. Which pair of states can it be in?',
    'fulfilled or rejected', ARRAY['pending or waiting', 'resolved or cancelled', 'done or failed'],
    'A promise starts pending and settles exactly once, either fulfilled with a value or rejected with a reason. After that it never changes again, which is what makes it safe to attach a `.then` late.');

SELECT seed_as('promise-states', 'predict',
    E'What does this log?\n\nlet p = new Promise((resolve) => {\n  setTimeout(() => { resolve("done"); }, 0);\n});\nconsole.log(p);',
    'Promise { pending }', ARRAY['done', 'Promise { done }', 'undefined'],
    'The log runs while the timer is still waiting, so the promise has not settled yet. A promise is a handle on a value that is coming, not the value — which is why you read it with `.then` rather than by printing it.');

SELECT seed_as('promise-states', 'explain',
    E'Why can a `.then` be attached to a promise that has already settled?',
    'a settled promise keeps its result, so a handler added later still receives it',
    ARRAY['the promise waits a moment before settling, in case anything attaches',
          'attaching a handler puts the promise back into its pending state',
          'a settled promise runs its handler immediately, before anything else'],
    'The mechanism is that settling is permanent. The result is kept, so `.then` can be attached at any time and still be called — on the microtask queue, never in the same tick, which is why the order stays predictable either way.');

/* ── 3 · event-loop ─────────────────────────────────────────────────────── */

SELECT seed_as('event-loop', 'predict',
    E'What does this log?\n\nconsole.log("1");\nsetTimeout(() => { console.log("4"); }, 0);\nPromise.resolve().then(() => { console.log("3"); });\nconsole.log("2");',
    '1, 2, 3, 4', ARRAY['1, 2, 4, 3', '1, 3, 2, 4', '1, 4, 3, 2'],
    'All the ordinary lines run first, so 1 and 2. Then promise work, so 3. Timers come last, so 4 — even with a delay of 0, because 0 means "as soon as the queue is empty", not "now".');

SELECT seed_as('event-loop', 'explain',
    E'Why does `setTimeout(f, 0)` not run f straight away?',
    'f is queued, and the queue is only read once the current code has finished',
    ARRAY['a delay of 0 is rounded up to a few milliseconds by the browser',
          'the timer starts counting only after the rest of the file is read',
          'f runs straight away but its output is held back until the end'],
    'The mechanism is one queue and one thread. Nothing queued can start while something is still running, so 0 means "first in line when this is over" — and anything already queued ahead of it still goes first.');

/* ── 4 · async-await ────────────────────────────────────────────────────── */

SELECT seed_as('async-await', 'recognise',
    E'Which one waits for the value and then uses it?',
    'const v = await p;', ARRAY['const v = p;', 'const v = p.value;', 'await const v = p;'],
    '`await` is what turns the promise into the value it settles with. Without it you hold the promise itself, and `.value` is not a property a promise has.');

SELECT seed_as('async-await', 'predict',
    E'What does this log?\n\nasync function go() {\n  console.log("a");\n  const v = await Promise.resolve(1);\n  console.log(v);\n}\ngo();\nconsole.log("b");',
    'a, b, 1', ARRAY['a, 1, b', 'b, a, 1', 'a, b'],
    'The function runs normally until the `await`, then hands control back to whoever called it — so "b" goes next. Only once the queue is reached does the rest of `go` continue. `await` pauses the function, not the program.');

SELECT seed_as('async-await', 'diagnose',
    E'This should log 3 and logs a promise instead. Which line is the cause?\n\nasync function total() {\n  const a = await Promise.resolve(2);\n  return a + 1;\n}\nconsole.log(total());',
    'console.log(total());',
    ARRAY['const a = await Promise.resolve(2);', 'return a + 1;', 'async function total() {'],
    'An async function always hands back a promise, whatever it returns inside. The body is right; what is missing is unwrapping the result — `total().then(...)`, or `await total()` inside another async function.');

SELECT seed_as('async-await', 'repair',
    E'`console.log(total())` prints a promise rather than 3. Which change fixes it?\n\nasync function total() {\n  const a = await Promise.resolve(2);\n  return a + 1;\n}\nconsole.log(total());',
    'total().then((v) => { console.log(v); });',
    ARRAY['Remove the await from inside total', 'Declare total without async', 'Return Promise.resolve(a + 1)'],
    'The value has to be collected once the promise settles. Removing `async` or `await` would stop the waiting working at all, and wrapping the return changes nothing — it was already a promise.');

SELECT seed_as('async-await', 'explain',
    E'Why does `await` pause the function without freezing the whole page?',
    'the function hands control back and is resumed later from where it stopped',
    ARRAY['the browser runs each async function on a thread of its own',
          'everything else is paused too, but only for a very short time',
          'the page keeps redrawing because awaiting is a low-priority task'],
    'The mechanism is giving up the thread. The function returns to its caller at the `await` and is picked up again from that point when the promise settles — so one function waits while everything else carries on as normal.');

/* ── 5 · error-propagation ──────────────────────────────────────────────── */

SELECT seed_as('error-propagation', 'predict',
    E'What does this log?\n\nasync function go() {\n  try {\n    await Promise.reject("boom");\n  } catch (e) {\n    console.log("caught " + e);\n  }\n  console.log("after");\n}\ngo();',
    'caught boom, then after', ARRAY['caught boom only', 'after only', 'nothing — it fails'],
    'A rejected await behaves like a thrown error inside the function, so the `catch` takes it — and because it was handled, the function carries on to the line below.');

SELECT seed_as('error-propagation', 'diagnose',
    E'This should report the failure and reports nothing at all. Which line is the cause?\n\nasync function go() {\n  await Promise.reject("boom");\n}\ngo();',
    'go();',
    ARRAY['async function go() {', 'await Promise.reject("boom");', 'nothing — it works'],
    'The rejection travelled out into the promise `go()` handed back, and nothing was listening to it. Adding `.catch(...)` to the call, or a try around the await, gives it somewhere to land.');

SELECT seed_as('error-propagation', 'repair',
    E'A rejection from `go()` is being lost. Which change reports it?\n\nasync function go() {\n  await Promise.reject("boom");\n}\ngo();',
    'go().catch((e) => { console.log(e); });',
    ARRAY['Wrap the call in a plain try and catch', 'Remove the async from go', 'Return the rejection instead of awaiting it'],
    'A rejected promise is caught with `.catch`, or by awaiting it inside a try. An ordinary try around `go()` catches nothing, because the call itself succeeds — it hands back a promise and only fails later.');

SELECT seed_as('error-propagation', 'explain',
    E'Why does a plain try and catch around `go()` not catch a rejection from inside it?',
    'the call itself succeeds and hands back a promise; the failure arrives afterwards',
    ARRAY['try and catch only works on errors thrown with the throw keyword',
          'the catch runs but the rejection is passed on to the next handler',
          'async functions deliberately hide their failures from the caller'],
    'The mechanism is timing. By the time the promise rejects, the try block has long since finished — so there is nothing left to catch it. `await` inside the try is what puts the failure back inside the block.');

/* ── 6 · promise-all ────────────────────────────────────────────────────── */

SELECT seed_as('promise-all', 'predict',
    E'What does this log?\n\nPromise.all([Promise.resolve(1), Promise.resolve(2)]).then((vs) => {\n  console.log(vs);\n});',
    '[1, 2]', ARRAY['1 then 2', 'Promise { pending }', '[2, 1]'],
    'One handler, called once, with every value in a list — and in the order the promises were GIVEN, not the order they finished. That ordering is the main reason to reach for it.');

SELECT seed_as('promise-all', 'explain',
    E'Why is `Promise.all` usually faster than awaiting each promise in turn?',
    'all of them are already running, so the wait is the longest one rather than the sum',
    ARRAY['it runs the promises on several threads at the same time',
          'it skips any promise that is taking longer than the others',
          'awaiting in turn re-starts each promise after the one before it'],
    'The mechanism is that the work had already begun. Promises start when they are made, so handing a list to `Promise.all` waits for them together; awaiting one at a time just stands and watches each in sequence.');

DROP FUNCTION seed_as(TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT);

COMMIT;
