CREATE TABLE game_sessions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    user_id BIGINT NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,

    status TEXT NOT NULL DEFAULT 'in_progress',

    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Terminal-state timestamps. Exactly one is set once the session ends.
    completed_at TIMESTAMPTZ,

    abandoned_at TIMESTAMPTZ,

    score INTEGER NOT NULL DEFAULT 0,

    xp_earned INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT game_sessions_status_valid
        CHECK (status IN ('in_progress', 'completed', 'abandoned')),

    CONSTRAINT game_sessions_score_non_negative
        CHECK (score >= 0),

    CONSTRAINT game_sessions_xp_non_negative
        CHECK (xp_earned >= 0),

    -- Status and timestamps must agree. Without this a row can claim to be
    -- completed while carrying no completion time, or sit in_progress with one.
    CONSTRAINT game_sessions_status_timestamps_consistent
        CHECK (
            CASE status
                WHEN 'in_progress' THEN completed_at IS NULL     AND abandoned_at IS NULL
                WHEN 'completed'   THEN completed_at IS NOT NULL AND abandoned_at IS NULL
                WHEN 'abandoned'   THEN abandoned_at IS NOT NULL AND completed_at IS NULL
                ELSE FALSE
            END
        )
);

-- Serves the RESTRICT check against users plus history and leaderboard joins.
-- No composite index on this table covers user_id.
CREATE INDEX game_sessions_user_id_idx
    ON game_sessions (user_id);

-- A user may hold at most one in-progress session. Without this, "resume my
-- game" is ambiguous and lazy abandonment has no single target. Partial, so
-- it constrains only live sessions and ignores finished ones.
CREATE UNIQUE INDEX game_sessions_one_active_per_user_idx
    ON game_sessions (user_id)
    WHERE status = 'in_progress';
