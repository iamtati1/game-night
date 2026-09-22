-- What a learner has actually demonstrated, concept by concept.
--
-- WHY THIS IS SEPARATE FROM EVERY EXISTING SIGNAL. The curriculum already knows
-- two things about a learner, both derived from gameplay:
--
--   met          they FACED content on this concept  (answered or timed out)
--   introduced   they completed its Learn Beat       (introduction_completions)
--
-- Neither says they understood it. A learner who timed out on a question has met
-- the concept; a learner who read a card has been introduced to it. Demonstration
-- is the third and different claim: they worked through the lesson and answered
-- its questions, with retries where they needed them.
--
-- That claim cannot be derived, because the lessons are not dealt through
-- session_questions -- they are walked in order, outside any game session, with
-- no clock and no score. There is no round table to read it out of.
--
-- DELIBERATELY NOT A MASTERY MODEL. No score, no accuracy, no confidence, no
-- decay, no level. One row means "this learner completed this concept's lesson".
-- `needed_retry` is the single extra fact, and it is recorded rather than acted
-- on: it costs nothing to keep, it is the honest difference between a learner
-- who walked straight through and one who did not, and a later remediation pass
-- would otherwise have no history to work from. Nothing reads it today.
--
-- WHAT IT GATES. The next concept in the topic's sequence, and eventually the
-- next topic. That is all -- it awards no XP and touches no game.

BEGIN;

CREATE TABLE concept_demonstrations (
    user_id        BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    concept_id     BIGINT NOT NULL REFERENCES concepts (id) ON DELETE RESTRICT,

    -- Did they get there without needing a second attempt on any step?
    -- Recorded for later, read by nothing.
    needed_retry   BOOLEAN NOT NULL DEFAULT FALSE,

    demonstrated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Demonstrating twice is the same fact, not two facts. Re-walking a lesson
    -- is allowed and simply does not change anything.
    PRIMARY KEY (user_id, concept_id)
);

-- user_id leads the primary key, so "everything this learner has demonstrated"
-- -- the only read there is -- is already served.

COMMIT;
