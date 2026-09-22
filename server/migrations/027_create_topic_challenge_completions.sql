-- The checkpoint that closes a topic.
--
-- WHY A TOPIC NEEDS ITS OWN ROW. concept_demonstrations records that a learner
-- worked through each lesson. Clicking through eight lessons is evidence of
-- attendance; it does not show that the ideas connect when they arrive together
-- and unlabelled. The topic challenge asks that, and it is a different fact
-- about a different thing -- a topic, not a concept -- so it gets its own row
-- rather than a nullable column on the other table.
--
-- Same shape as concept_demonstrations and introduction_completions, on purpose:
-- a learner, a thing, a timestamp, and a primary key that makes re-doing it a
-- no-op. Three tables that look alike because they record the same KIND of fact.
--
-- STILL NOT A MASTERY MODEL. No score, no attempts, no accuracy. Finishing the
-- challenge is the evidence. What it changes is that the next topic opens.

BEGIN;

CREATE TABLE topic_challenge_completions (
    user_id      BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    topic_id     BIGINT NOT NULL REFERENCES topics (id) ON DELETE RESTRICT,
    needed_retry BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id, topic_id)
);

COMMIT;
