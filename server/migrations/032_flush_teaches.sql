-- Flush learns to explain itself, and to say which concept it exercises.
--
-- THE PROBLEM. Flush is the only code game in Jolt that cannot teach. Code
-- Blitz has questions.explanation; Bug Hunt has a per-option explanation AND
-- one to three authored hints. Flush has output_text, position, is_distractor
-- and nothing else -- so when a learner gets the order wrong it can show them
-- the correct sequence and has no words to say why.
--
-- The client even claims otherwise. Above the reveal:
--
--     "The teaching moment. Seeing both sequences side by side is what turns
--      'the game screwed me' into 'ohhh, microtasks first'."
--
-- It is a wordless diff. For a learner who already knows the event loop it
-- confirms; for the only learner who needs it, it explains nothing. That is why
-- playing Flush feels like a standalone game -- structurally it is one.
--
-- TWO COLUMNS, BOTH ADDITIVE, BOTH NULLABLE.

BEGIN;

-- Why this order, in one or two sentences. Written to name the RULE rather than
-- restate the sequence the learner can already see above it.
ALTER TABLE flush_snippets
    ADD COLUMN explanation TEXT;

COMMENT ON COLUMN flush_snippets.explanation IS
    'Why the outputs land in this order. Names the rule, not the sequence. '
    'NULL for a snippet nobody has written one for yet.';

-- Which rung this snippet is practice for.
--
-- MANY SNIPPETS TO ONE CHALLENGE, and deliberately no unique index -- which is
-- where this differs from questions.challenge_id and
-- bug_hunt_incidents.challenge_id, both of which are 1:1.
--
-- The reason is that those two tables ARE the content that realises a rung, so
-- a second row on one challenge would be two exercises wearing one name. Flush
-- is not realising a new rung: every Async concept already has a practise
-- `predict` challenge filled by a question. Flush is a SECOND WAY to clear the
-- rung that already exists, the way Code Blitz and the encounter are two ways
-- to clear the same one.
--
-- Keeping it many-to-one also keeps the encounter honest: no new challenge rows
-- appear, so a concept's rung does not sprout twenty-two options that the
-- encounter has no way to render.
ALTER TABLE flush_snippets
    ADD COLUMN challenge_id BIGINT REFERENCES challenges (id) ON DELETE RESTRICT;

COMMENT ON COLUMN flush_snippets.challenge_id IS
    'The practise rung this snippet exercises. Many snippets may share one '
    'challenge -- Flush is a second route to an existing rung, not a new one. '
    'NULL means the snippet is playable but credits nothing.';

CREATE INDEX flush_snippets_challenge_idx
    ON flush_snippets (challenge_id)
    WHERE challenge_id IS NOT NULL;

COMMIT;
