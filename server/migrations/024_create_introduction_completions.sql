-- The one learner fact Jolt cannot derive from gameplay.
--
-- Everything the curriculum knows about a learner is derived from durable game
-- history -- a question answered or timed out, an incident resolved or failed --
-- and that is deliberate: see the note on metConceptsCte in
-- server/src/curriculum/eligibility.ts. There is no learner-state table, no
-- mastery score, and this migration does not add one.
--
-- WHY A TABLE IS NEVERTHELESS REQUIRED HERE.
--
-- A Learn Beat is not a dealt unit. Completing one is a real learner event --
-- it is what turns "never met this concept" into "met it" -- but nothing in the
-- schema can record it, and the three candidates each fail for a different
-- reason:
--
--   session_questions   needs a questions row, so the introduction would have
--                       to become a question. It would then be dealt into the
--                       Code Blitz pool, scored, counted toward the ten, and
--                       folded into XP and the results screen. That is a
--                       redesign of Code Blitz to store one boolean.
--
--   game_sessions       carries no per-concept slot, and giving the Learn Beat
--                       its own session would need a row in `games`, which
--                       would then appear in gamesCompleted, history and the
--                       cross-game XP totals as if it were a game played.
--
--   bug_hunt_rounds     same shape as session_questions, same objection, plus
--                       it is one game's private table.
--
-- So the event is recorded directly, in the smallest form that can carry it.
--
-- WHAT THIS TABLE MEANS, AND WHAT IT DOES NOT.
--
--   "this learner completed the introduction to this concept"
--
-- It does NOT mean understood, mastered, or answered correctly. There is
-- deliberately no score, no accuracy, no confidence, no streak and no level:
-- those belong to a competence model that does not exist yet, and adding a
-- column here in anticipation is how this becomes the mastery table the
-- architecture is avoiding. Three columns, one of which is a timestamp.
--
-- Keyed on the CHALLENGE rather than the concept. The introduction is a
-- challenge -- role = 'introduce' -- and the concept is one join away on
-- challenges.concept_id. Storing concept_id here as well would be a second copy
-- of a fact the challenge already owns, free to drift.

BEGIN;

CREATE TABLE introduction_completions (
    user_id      BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    challenge_id BIGINT NOT NULL REFERENCES challenges (id) ON DELETE RESTRICT,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Completing the same introduction twice is the same fact, not two facts.
    -- The primary key makes the insert idempotent rather than the caller.
    PRIMARY KEY (user_id, challenge_id)
);

-- user_id is the leftmost column of the primary key, so "everything this
-- learner has been introduced to" -- the only read there is -- is already
-- served. No second index.

-- ───────────────────────────────────── one introduction per concept ──
--
-- A concept has AN introduction, not a set of them: the runtime asks "what
-- should this learner meet next" and must get one answer. Without this, two
-- active introduce challenges for one concept would make that query's LIMIT 1
-- arbitrary, and a learner could complete one introduction and still be offered
-- the other.
--
-- Partial on is_active so an introduction can be retired and replaced, which is
-- an ordinary content edit rather than a schema problem. Partial on the role so
-- it constrains nothing about practise or reinforce, which are expected to have
-- many challenges per concept.
CREATE UNIQUE INDEX challenges_one_introduction_per_concept_idx
    ON challenges (concept_id)
    WHERE role = 'introduce' AND is_active;

COMMIT;
