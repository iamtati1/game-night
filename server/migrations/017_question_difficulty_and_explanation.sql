-- Code Blitz questions gain a difficulty and an explanation.
--
-- The bank has neither today, and both are load-bearing for a game whose point
-- is that you get better at JavaScript by playing it.
--
-- Without an explanation a question can only TEST. Get `0.1 + 0.2 === 0.3`
-- wrong and the game tells you that you were wrong and moves on, which teaches
-- nothing -- the player leaves with the same misconception they arrived with.
-- Bug Hunt already carries per-option explanations and is markedly the better
-- teacher for it. One concise explanation per question is the right size here:
-- Code Blitz serves ten questions on a 35-second clock, so this is a beat
-- between rounds, not a paragraph to read.
--
-- Without a difficulty the whole bank is one flat pool, so a run can open on
-- closures and close on `typeof`. A tier lets a session climb -- fundamentals,
-- then practical, then reasoning, then a realistic problem -- which is the
-- difference between a quiz and a game that gets harder.
--
-- Difficulty is 1-4 and means how much THINKING a question takes, never how
-- obscure it is. An easy question can carry an important concept; a hard one
-- should combine concepts rather than reach for a footnote in the spec.
--
--   1  fundamentals        one idea, read and answer
--   2  practical           several operations, or a method you must know cold
--   3  deeper reasoning    scope, closures, execution order, coercion
--   4  real-world          combines concepts, or debugs a realistic mistake
--
-- Both columns are nullable so the existing 58 rows stay valid. The seed that
-- follows fills them in; nothing here rewrites content.

BEGIN;

ALTER TABLE questions
    ADD COLUMN difficulty SMALLINT;

ALTER TABLE questions
    ADD COLUMN explanation TEXT;

ALTER TABLE questions
    ADD CONSTRAINT questions_difficulty_range
        CHECK (difficulty IS NULL OR difficulty BETWEEN 1 AND 4);

-- Long enough for two short sentences, short enough that nobody writes an
-- essay into it. The game shows this in the gap between questions.
ALTER TABLE questions
    ADD CONSTRAINT questions_explanation_length
        CHECK (explanation IS NULL OR (TRIM(explanation) <> '' AND LENGTH(explanation) <= 400));

-- Dealing reads difficulty for every eligible question on every new session, so
-- it is worth an index once the bank is a few hundred rows.
CREATE INDEX questions_difficulty_idx
    ON questions (difficulty)
    WHERE is_active;

COMMIT;
