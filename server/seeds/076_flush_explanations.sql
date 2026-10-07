-- Giving Flush something to say.
--
-- Every active snippet gets a reason and the rung it exercises. The reason
-- NAMES THE RULE rather than restating the sequence -- the learner can already
-- see the sequence in the reveal above it, and "the correct order was sync,
-- micro, macro" teaches nobody anything they could use on the next snippet.
--
-- WHY THESE CONCEPTS. Flush's mechanic is output ORDER, and order only becomes
-- interesting when execution reorders it. All 34 snippets are therefore event
-- loop material, which makes Flush an unusually exact fit for one topic rather
-- than a poor fit for sixteen. Tagging follows what each snippet actually
-- turns on:
--
--   event-loop         sync-before-queued, microtasks before timers, timer order
--   promise-states     the executor runs immediately; pending never settles
--   async-await        await yields to the caller and resumes as microtask work
--   error-propagation  a rejection skips .then and travels to .catch
--
-- Each points at the concept's EXISTING practise/predict challenge. Flush is a
-- second route to a rung Code Blitz already fills, not a new rung.

BEGIN;

CREATE OR REPLACE FUNCTION teach_flush(p_id BIGINT, p_concept TEXT, p_why TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_challenge BIGINT;
BEGIN
    SELECT ch.id INTO v_challenge
    FROM challenges ch
    JOIN concepts c ON c.id = ch.concept_id
    JOIN demands d  ON d.id = ch.demand_id
    WHERE c.slug = p_concept AND d.slug = 'predict'
      AND ch.role = 'practise' AND ch.is_active;

    IF v_challenge IS NULL THEN
        RAISE EXCEPTION 'no practise/predict challenge for %', p_concept;
    END IF;

    UPDATE flush_snippets
    SET explanation = p_why, challenge_id = v_challenge
    WHERE id = p_id;
END;
$$;

/* ── the event loop: synchronous first, then the queues ─────────────────── */

SELECT teach_flush(1, 'event-loop',
    'setTimeout hands its function to the timer queue, and queued work only runs once every line of straight-through code has finished. A delay of 0 does not mean "now" -- it means "as soon as the synchronous work is done".');

SELECT teach_flush(11, 'event-loop',
    'The order lines are WRITTEN is not the order they run. Both console.log calls are straight-through code and finish first; the timer waits its turn however early it appears.');

SELECT teach_flush(12, 'event-loop',
    'A timer set on the first line still goes last. Being first in the file buys nothing -- queued work waits for all synchronous work.');

SELECT teach_flush(13, 'event-loop',
    'Timers run in order of DELAY, not in the order they were written. The 0ms timer was set second and still runs first.');

SELECT teach_flush(4, 'event-loop',
    'Timers fire in delay order, and two with the same delay keep the order they were set in. All of them still wait for the synchronous line.');

SELECT teach_flush(3, 'event-loop',
    'Both were queued, but not into the same queue. Promise reactions are microtasks, and the microtask queue drains completely before the first timer gets a turn.');

SELECT teach_flush(14, 'event-loop',
    'Two queues, one rule: microtasks before timers. The timer was set first and still loses.');

SELECT teach_flush(16, 'event-loop',
    'queueMicrotask puts work in the same queue .then uses, and that queue empties before any timer runs.');

SELECT teach_flush(5, 'event-loop',
    'A .then is microtask work and a setTimeout is timer work. Microtasks go first, whichever way round they are written.');

SELECT teach_flush(15, 'event-loop',
    'Every microtask drains before the first timer, and microtasks themselves run in the order they were queued.');

SELECT teach_flush(7, 'event-loop',
    'A .then chain queues ONE LINK AT A TIME. The second link is only queued once the first has run -- by which point the separate promise was already waiting.');

SELECT teach_flush(19, 'event-loop',
    'Chained links take turns with everything else in the queue. The second link of the chain joins the back of the line, behind the promise that was queued while the first link ran.');

SELECT teach_flush(20, 'event-loop',
    'Each .then queues only the next step. Two chains therefore interleave rather than one finishing before the other starts.');

SELECT teach_flush(9, 'event-loop',
    'The inner timer is set WHILE the microtask runs -- which is after the outer timer was already queued, so it joins the back of the line.');

SELECT teach_flush(31, 'event-loop',
    'A microtask queued inside a timer runs after that timer''s own code, not before it. The queue is drained when the timer finishes, not when it starts.');

SELECT teach_flush(32, 'event-loop',
    'A microtask queued by another microtask joins the same queue and is still drained before any timer. The queue empties completely, including anything added while emptying it.');

SELECT teach_flush(34, 'event-loop',
    'Every microtask drains before the first timer, and the timers then run in the order they were set.');

SELECT teach_flush(25, 'event-loop',
    'clearTimeout removes a queued timer before it ever fires, so that output never happens at all.');

SELECT teach_flush(26, 'event-loop',
    'An if/else is ordinary straight-through code -- it finishes, like every synchronous line, before any queued timer runs.');

SELECT teach_flush(28, 'event-loop',
    'A function that is never called produces nothing. Defining it stores instructions; only a call follows them.');

SELECT teach_flush(29, 'event-loop',
    'The loop runs to completion first. The timers it set are queued as it goes and run afterwards, in the order they were set.');

SELECT teach_flush(30, 'event-loop',
    'forEach is ordinary synchronous iteration, so both promises are queued before the synchronous line finishes -- and then drain in order.');

/* ── promise states: the executor is immediate ──────────────────────────── */

SELECT teach_flush(2, 'promise-states',
    'The function inside new Promise runs IMMEDIATELY, right where it is written -- which is why it lands before the line below it. Only the .then is queued.');

SELECT teach_flush(17, 'promise-states',
    'Creating a promise runs its executor straight away. Nothing about new Promise is deferred; only the reaction attached with .then waits.');

SELECT teach_flush(18, 'promise-states',
    'The executor runs immediately and the promise settles immediately. Attaching .then afterwards changes when the reaction is QUEUED, not when the promise settled.');

SELECT teach_flush(24, 'promise-states',
    'An already-settled promise still queues its reaction. The value was ready from the start; the .then was not immediate.');

SELECT teach_flush(10, 'promise-states',
    'The executor runs, but nothing ever calls resolve -- so the promise stays pending forever and its .then never runs at all. A pending promise is not an error; it is simply never finished.');

/* ── async/await: yielding to the caller ────────────────────────────────── */

SELECT teach_flush(6, 'async-await',
    'await hands control straight back to the caller, so the line after the call runs before the rest of the async function. Everything past the await is resumed later, as microtask work.');

SELECT teach_flush(21, 'async-await',
    'Calling an async function runs it until the first await. At that point it yields, the caller carries on, and the remainder is resumed from the microtask queue.');

SELECT teach_flush(22, 'async-await',
    'The await queues the rest of the function immediately, so it is ahead of the .then that was queued on the line below.');

SELECT teach_flush(23, 'async-await',
    'Calling inner() runs its body straight away -- it is AWAITING it that suspends outer and lets the synchronous line through.');

SELECT teach_flush(33, 'async-await',
    'Two chains taking turns. Each await and each .then queues only its next step, so the two interleave rather than one running to completion first.');

/* ── error propagation: where a rejection travels ───────────────────────── */

SELECT teach_flush(8, 'error-propagation',
    'A rejection skips every .then and travels to the first .catch. That catch is still microtask work, so it lands before the timer.');

SELECT teach_flush(27, 'error-propagation',
    'A .then after a .catch still runs. Catching the rejection puts the chain back on its feet, so what follows continues normally.');

DROP FUNCTION teach_flush(BIGINT, TEXT, TEXT);

COMMIT;
