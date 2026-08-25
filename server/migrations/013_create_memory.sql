-- Memory: watch a sequence, hold it, play it back.
--
-- Per-game round table, the same shape as session_questions, flush_rounds and
-- reaction_rounds. The sequence lives here rather than being regenerated on
-- demand, because it is the answer: a round the server cannot mark is a round
-- the client could mark for itself.
--
-- Wrapped in a transaction: the games row and the table referencing it should
-- land together or not at all.

BEGIN;

INSERT INTO games (slug, name, tagline)
VALUES ('memory', 'Memory', 'Watch the sequence. Hold it. Play it back.');

CREATE TABLE memory_rounds (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    game_session_id BIGINT NOT NULL
        REFERENCES game_sessions(id) ON DELETE CASCADE,

    display_order INTEGER NOT NULL,

    -- The authoritative sequence, generated server-side when the session is
    -- created. Stored as an array rather than a join table: it is an ordered
    -- tuple that is always read whole and never queried by element.
    sequence TEXT[] NOT NULL,

    -- How long the client shows it. Stored per round so the difficulty curve has
    -- exactly one definition and a served round carries its own timing.
    display_ms INTEGER NOT NULL,

    status TEXT NOT NULL DEFAULT 'pending',

    served_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,

    -- What the player played back, kept so the results screen can show the two
    -- sequences side by side rather than only a verdict.
    submitted TEXT[],

    -- Positions matched, computed server-side. Points derive from this and the
    -- sequence length, so there is no stored score column to drift.
    correct_positions INTEGER,

    CONSTRAINT memory_rounds_display_order_positive
        CHECK (display_order > 0),

    CONSTRAINT memory_rounds_display_ms_positive
        CHECK (display_ms > 0),

    CONSTRAINT memory_rounds_sequence_length
        CHECK (array_length(sequence, 1) BETWEEN 1 AND 10),

    CONSTRAINT memory_rounds_status_valid
        CHECK (status IN ('pending', 'answered')),

    CONSTRAINT memory_rounds_unique_display_order
        UNIQUE (game_session_id, display_order),

    -- Never more matches than there were symbols to match.
    CONSTRAINT memory_rounds_correct_in_range
        CHECK (
            correct_positions IS NULL
            OR (correct_positions >= 0 AND correct_positions <= array_length(sequence, 1))
        ),

    -- State matrix, one constraint per status so a violation names the state it
    -- broke. Same pattern as the other three games.
    CONSTRAINT memory_rounds_pending_state
        CHECK (
            status <> 'pending'
            OR (ended_at IS NULL AND submitted IS NULL AND correct_positions IS NULL)
        ),

    CONSTRAINT memory_rounds_answered_state
        CHECK (
            status <> 'answered'
            OR (
                served_at IS NOT NULL
                AND ended_at IS NOT NULL
                AND submitted IS NOT NULL
                AND correct_positions IS NOT NULL
            )
        )
);

COMMIT;
