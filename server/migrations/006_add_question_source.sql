-- Provenance and duplicate prevention for externally imported questions.
--
-- Why this migration is necessary rather than convenient: the alternative way
-- to avoid importing the same question twice is SELECT-then-INSERT, which is
-- the exact time-of-check/time-of-use race already rejected for registration.
-- A partial unique index makes the check atomic, the same way
-- users_email_unique does.

ALTER TABLE questions
    ADD COLUMN source TEXT NOT NULL DEFAULT 'internal';

ALTER TABLE questions
    ADD COLUMN external_ref TEXT;

ALTER TABLE questions
    ADD CONSTRAINT questions_source_not_blank CHECK (TRIM(source) <> '');

-- Partial: hand-written questions have no external_ref, and many NULLs must not
-- collide. Only rows that actually came from a provider are constrained.
CREATE UNIQUE INDEX questions_external_ref_idx
    ON questions (source, external_ref)
    WHERE external_ref IS NOT NULL;
