-- Code Blitz questions gain a curriculum topic.
--
-- The bank had a difficulty but no subject, so nothing could answer "how much
-- practice does this player get at loops?" -- and the audit that asked it found
-- five loop questions out of a hundred and sixty-one, against twenty-six about
-- objects. A difficulty ladder alone cannot see that: every one of those loop
-- questions was correctly tiered, and the bank was still not teaching loops.
--
-- The dealer needs it too. It already tries to avoid asking two questions about
-- the same thing in a row, and until now it did that by comparing the FIRST LINE
-- OF CODE of each prompt -- so two map() questions with different variable names
-- read as unrelated, and two unrelated questions that both open
-- `const nums = [1, 2, 3];` read as identical. A topic replaces a string
-- similarity guess with the actual answer.
--
-- Nine values, matching the nine units of the curriculum. Constrained rather
-- than free text: a typo'd 'array-method' would silently become a tenth topic
-- that nothing balances against and no test counts.

BEGIN;

ALTER TABLE questions
    ADD COLUMN topic TEXT;

ALTER TABLE questions
    ADD CONSTRAINT questions_topic_valid
        CHECK (topic IS NULL OR topic IN (
            'variables',
            'conditionals',
            'loops',
            'arrays',
            'objects',
            'functions',
            'array-methods',
            'scope',
            'async'
        ));

-- Every question in play must have a topic.
--
-- Added NOT VALID on purpose. Fifty-eight rows from seeds 001 and 003 are
-- already live with no topic, so enforcing this immediately would fail -- and a
-- plain nullable column would leave nothing enforcing it at all. NOT VALID
-- applies the rule to every insert and update from now on while leaving the
-- existing rows alone; seed 010 fills them in and then runs
--
--     ALTER TABLE questions VALIDATE CONSTRAINT questions_topic_required;
--
-- which checks the rows already there. If the backfill has missed one, that
-- validation fails and the seed rolls back, so the gap is loud rather than a
-- NULL nobody notices.
--
-- Scoped to active questions: a retired question keeps its history without
-- needing to be filed under a unit it is no longer taught in.
ALTER TABLE questions
    ADD CONSTRAINT questions_topic_required
        CHECK (topic IS NOT NULL OR NOT is_active) NOT VALID;

-- Dealing reads topic for every eligible question on every new session, beside
-- the difficulty it already reads.
CREATE INDEX questions_topic_idx
    ON questions (topic)
    WHERE is_active;

COMMIT;
