-- Reaction: wait for the signal, react as fast as you can.
--
-- A per-game round table, same as session_questions and flush_rounds, rather
-- than a shared polymorphic one. The strength of this schema is that invariants
-- are enforced by the database, and a JSONB payload would move all of them back
-- into application code.
--
-- Wrapped in a transaction: the games row and the table that references it should
-- land together or not at all.

BEGIN;

INSERT INTO games (slug, name, tagline)
VALUES ('reaction', 'Reaction', 'Wait for the signal. Beat your own reflexes.');

CREATE TABLE reaction_rounds (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    game_session_id BIGINT NOT NULL
        REFERENCES game_sessions(id) ON DELETE CASCADE,

    display_order INTEGER NOT NULL,

    status TEXT NOT NULL DEFAULT 'pending',

    -- When the round was handed to the client. NOT the signal time: the signal
    -- fires after a random delay measured in the browser, so the server cannot
    -- know it. Kept for history and for parity with the other round tables.
    served_at TIMESTAMPTZ,

    ended_at TIMESTAMPTZ,

    -- Milliseconds between the signal and the player's interaction, measured by
    -- the client with performance.now() and validated here. NULL for a false
    -- start, which has no reaction to time.
    reaction_ms INTEGER,

    CONSTRAINT reaction_rounds_display_order_positive
        CHECK (display_order > 0),

    CONSTRAINT reaction_rounds_status_valid
        CHECK (status IN ('pending', 'reacted', 'false_start')),

    CONSTRAINT reaction_rounds_unique_display_order
        UNIQUE (game_session_id, display_order),

    -- The plausibility floor and ceiling live here as well as in the route, so a
    -- bad value cannot be stored even if it reaches the database another way.
    -- 80ms is below human simple-reaction latency; 5s is long enough that the
    -- player has stopped playing rather than reacted slowly.
    CONSTRAINT reaction_rounds_reaction_plausible
        CHECK (reaction_ms IS NULL OR (reaction_ms >= 80 AND reaction_ms <= 5000)),

    -- State matrix, one constraint per status so a violation names the state it
    -- broke. Same pattern as session_questions and flush_rounds.
    CONSTRAINT reaction_rounds_pending_state
        CHECK (
            status <> 'pending' OR (ended_at IS NULL AND reaction_ms IS NULL)
        ),

    CONSTRAINT reaction_rounds_reacted_state
        CHECK (
            status <> 'reacted'
            OR (served_at IS NOT NULL AND ended_at IS NOT NULL AND reaction_ms IS NOT NULL)
        ),

    -- A false start has no reaction time. Storing one would be a contradiction:
    -- the player moved before there was anything to react to.
    CONSTRAINT reaction_rounds_false_start_state
        CHECK (
            status <> 'false_start'
            OR (served_at IS NOT NULL AND ended_at IS NOT NULL AND reaction_ms IS NULL)
        )
);

COMMIT;
