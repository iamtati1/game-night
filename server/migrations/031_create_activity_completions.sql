-- A learner finished the activity that realises a challenge.
--
-- WHY THIS EXISTS. Per-rung progress is derived from evidence of success, never
-- stored as its own progress flag: session_questions.is_correct for Code Blitz,
-- bug_hunt_rounds.status = 'resolved' for Bug Hunt, both joined through
-- challenges to (concept, demand). That is deliberate, and it is why widening
-- concept_demonstrations was rejected -- see encounter.ts.
--
-- A mission movement produces no such evidence. It is judged in the browser by
-- a `check` that inspects a littleJs parse result, and nothing about that run
-- reaches the database. Without a row somewhere, a mission rung can be played
-- perfectly and still read as uncleared forever.
--
-- So this table is the missing EVIDENCE, in the same shape as the other two: it
-- records that an attempt succeeded, and the cleared-rung derivation reads it
-- exactly as it reads the other two. It is not a second progress model.
--
-- KEYED ON THE CHALLENGE, not on (concept, demand). The challenge is the
-- exercise, and one rung may hold several -- finishing one of them is the fact
-- being recorded. The concept and demand come back by joining challenges, which
-- is how both existing arms already work.
--
-- KIND-AGNOSTIC ON PURPOSE. Nothing here says 'mission'. Any future activity
-- judged client-side records completion the same way, and challenges.activity
-- stays the one place that says what kind of thing it was.
--
-- Finishing twice is the same fact, not two facts -- matching
-- concept_demonstrations and topic_challenge_completions exactly.

BEGIN;

CREATE TABLE activity_completions (
    user_id      BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    challenge_id BIGINT NOT NULL REFERENCES challenges (id) ON DELETE RESTRICT,

    -- Did they get there without a miss on any movement? Recorded for later,
    -- the same way concept_demonstrations.needed_retry is.
    needed_retry BOOLEAN NOT NULL DEFAULT FALSE,

    completed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id, challenge_id)
);

COMMIT;
