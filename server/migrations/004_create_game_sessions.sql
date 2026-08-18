CREATE TABLE game_sessions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    user_id BIGINT NOT NULL
        REFERENCES users(id),

    status TEXT NOT NULL DEFAULT 'in_progress',

    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    completed_at TIMESTAMPTZ,

    score INTEGER NOT NULL DEFAULT 0,

    xp_earned INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT game_sessions_status_valid
        CHECK (status IN ('in_progress', 'completed', 'timed_out')),

    CONSTRAINT game_sessions_score_non_negative
        CHECK (score >= 0),

    CONSTRAINT game_sessions_xp_non_negative
        CHECK (xp_earned >= 0)
);