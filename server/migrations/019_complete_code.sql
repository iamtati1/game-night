-- The complete-code mechanic: questions gain a type, options gain an answer position.
--
-- Every question in the bank so far asks the same thing -- read this, name the
-- output -- and is answered the same way: pick one of four. The audit found 84%
-- of the bank at a single cognitive stage, and the three stages that would
-- balance it (produce, trace, recall) had zero questions because there was no
-- way to ASK them. complete-code is the first of those mechanics: a snippet with
-- a gap, and a bank of tokens the player assembles an answer from.
--
-- Two columns, both additive, both safe for every existing row.
--
-- WHY A TYPE COLUMN. The dealer has to control how many assembly questions a run
-- contains, the client has to know which component to render, and the deadline
-- differs (assembly needs longer than picking). All three need to know the type
-- before they load the options, so it belongs on the question.
--
-- WHY NOT REUSE display_order FOR ANSWER POSITION. It was tempting: the column
-- exists, it is an integer, and the correct tokens need an order. But
-- display_order already means "the order to show these in", and the server
-- shuffles it at serve time so a player cannot learn the answer's position.
-- Making it mean "position in the answer" for some rows and "position on screen"
-- for others gives one column two meanings that can only be told apart by
-- joining to another table -- and nothing would stop two tokens claiming
-- position 2. A separate nullable column keeps each column's meaning single and
-- lets a unique index say what display_order never could.

BEGIN;

-- ────────────────────────────────────── questions.challenge_type

ALTER TABLE questions
    ADD COLUMN challenge_type TEXT NOT NULL DEFAULT 'predict-output';

-- Constrained rather than free text, for the same reason topic is: a typo'd
-- 'complete_code' would be a silent fourth type that the dealer never deals and
-- no renderer knows how to draw.
--
-- Listed here are the types that exist or are designed. trace-value and
-- match-concept are named so the constraint does not need editing when they
-- arrive, but nothing produces them yet.
ALTER TABLE questions
    ADD CONSTRAINT questions_challenge_type_valid
        CHECK (challenge_type IN (
            'predict-output',
            'complete-code',
            'trace-value',
            'match-concept'
        ));

-- The dealer filters on it for every new session, alongside difficulty and topic.
CREATE INDEX questions_challenge_type_idx
    ON questions (challenge_type)
    WHERE is_active;

-- ────────────────────────────────── question_options.answer_position

ALTER TABLE question_options
    ADD COLUMN answer_position INTEGER;

-- Positions count from 1. Zero or negative would sort correctly and mean nothing.
ALTER TABLE question_options
    ADD CONSTRAINT question_options_answer_position_positive
        CHECK (answer_position IS NULL OR answer_position >= 1);

-- A positioned token is by definition part of the answer, so the two columns
-- cannot disagree in the direction that matters: a distractor can never carry a
-- position. The reverse is deliberately allowed -- a correct option with no
-- position is exactly what every predict-output row is.
ALTER TABLE question_options
    ADD CONSTRAINT question_options_position_implies_correct
        CHECK (answer_position IS NULL OR is_correct);

-- Two tokens cannot claim the same slot. Partial, so the NULLs that every
-- existing row carries are not compared against each other.
CREATE UNIQUE INDEX question_options_answer_position_idx
    ON question_options (question_id, answer_position)
    WHERE answer_position IS NOT NULL;

-- Reading an assembly answer means "correct tokens, in order", which is this
-- index exactly.
CREATE INDEX question_options_assembly_idx
    ON question_options (question_id, answer_position)
    WHERE answer_position IS NOT NULL;

-- ─────────────────── redefining one existing index (not additive)
--
-- question_options_one_active_correct_idx enforced AT MOST ONE correct option per
-- question. complete-code breaks that by design: an assembly answer has two to
-- four correct tokens. Migration 008 hit this same wall and concluded that
-- questions/question_options could not host a many-correct-in-order answer at
-- all, which is why Flush was given tables of its own.
--
-- It can, with one word changed. The index is re-created with `answer_position
-- IS NULL` added to its predicate, which says: at most one correct option that
-- does not occupy a slot in an assembly.
--
--   predict-output  every option has a NULL position, so all of them are still
--                   covered and the original guarantee is untouched
--   complete-code   every correct token carries a position, so the tokens are
--                   outside the index and may number two to four
--
-- This is the one part of this migration that is not purely additive. The
-- alternative was Flush's route -- a parallel set of tables, a second dealer
-- path and a second answer endpoint -- to express something the existing two
-- tables model perfectly well once the index stops assuming a single answer.
--
-- What the index no longer catches: a complete-code question whose correct
-- tokens are missing their positions. That is a cross-table fact (it depends on
-- questions.challenge_type) so no index could have caught it, and it is checked
-- in src/game/content.test.ts.
DROP INDEX question_options_one_active_correct_idx;

CREATE UNIQUE INDEX question_options_one_active_correct_idx
    ON question_options (question_id)
    WHERE is_correct AND is_active AND answer_position IS NULL;

COMMIT;

-- NOT ENFORCEABLE HERE, AND CHECKED IN src/game/content.test.ts INSTEAD:
--
--   * positions run 1..n with no gaps -- a row-level CHECK cannot see siblings
--   * a complete-code question has 2-4 positioned tokens and 4-8 options
--   * a predict-output question has exactly 4 options and exactly 1 correct
--   * every correct token of a complete-code question carries a position
--
-- All four are cross-row or cross-table facts. A trigger could enforce them at a
-- cost that is not worth paying for content that is written once and reviewed;
-- the content tests fail the build instead.
