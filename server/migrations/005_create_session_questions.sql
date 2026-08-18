CREATE TABLE session_questions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    game_session_id BIGINT NOT NULL,
    question_id BIGINT NOT NULL,

    -- Position within the session (1..10), fixed when the session is planned.
    display_order INTEGER NOT NULL,

    -- Snapshot of what this player was actually shown, immune to later edits
    -- of the source question.
    prompt_text TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'pending',

    -- Server-authoritative timing. served_at is written when the question is
    -- handed to the client; response time is answered_at - served_at and is
    -- never taken from the client.
    served_at TIMESTAMPTZ,

    selected_option_id BIGINT,
    selected_option_text TEXT,

    -- Deliberately NULL until the question is answered or adjudicated as timed
    -- out. Populating it at planning time would place the correct answer on the
    -- row representing the question currently on screen, where any SELECT *
    -- reaching an API response would leak it to the player.
    correct_option_text TEXT,

    is_correct BOOLEAN,

    answered_at TIMESTAMPTZ,
    timed_out_at TIMESTAMPTZ,

    CONSTRAINT session_questions_game_session_fk
        FOREIGN KEY (game_session_id)
        REFERENCES game_sessions(id)
        ON DELETE CASCADE,

    CONSTRAINT session_questions_question_fk
        FOREIGN KEY (question_id)
        REFERENCES questions(id)
        ON DELETE RESTRICT,

    -- The selected option must belong to this question.
    -- Deliberately MATCH SIMPLE (PostgreSQL's default): when selected_option_id
    -- is NULL the constraint is skipped entirely, so pending and timed-out rows
    -- are legal. MATCH FULL would reject them, because question_id is NOT NULL
    -- and MATCH FULL requires all referencing columns to be NULL or none.
    CONSTRAINT session_questions_selected_option_fk
        FOREIGN KEY (question_id, selected_option_id)
        REFERENCES question_options (question_id, id)
        ON DELETE RESTRICT,

    -- The same question may not appear twice in one session.
    CONSTRAINT session_questions_unique_question
        UNIQUE (game_session_id, question_id),

    -- Two different questions may not claim the same slot. Neither unique
    -- implies the other.
    CONSTRAINT session_questions_unique_display_order
        UNIQUE (game_session_id, display_order),

    CONSTRAINT session_questions_display_order_positive
        CHECK (display_order > 0),

    CONSTRAINT session_questions_status_valid
        CHECK (status IN ('pending', 'answered', 'timed_out')),

    -- State matrix, split one constraint per status so a violation names the
    -- state it broke. 'pending' covers both planned (served_at NULL) and
    -- serving (served_at set); that distinction is internal bookkeeping, not a
    -- player-visible state, so served_at is unconstrained here.
    CONSTRAINT session_questions_pending_state
        CHECK (
            status <> 'pending' OR (
                    selected_option_id   IS NULL
                AND selected_option_text IS NULL
                AND correct_option_text  IS NULL
                AND is_correct           IS NULL
                AND answered_at          IS NULL
                AND timed_out_at         IS NULL
            )
        ),

    CONSTRAINT session_questions_answered_state
        CHECK (
            status <> 'answered' OR (
                    served_at            IS NOT NULL
                AND selected_option_id   IS NOT NULL
                AND selected_option_text IS NOT NULL
                AND correct_option_text  IS NOT NULL
                AND is_correct           IS NOT NULL
                AND answered_at          IS NOT NULL
                AND timed_out_at         IS NULL
            )
        ),

    CONSTRAINT session_questions_timed_out_state
        CHECK (
            status <> 'timed_out' OR (
                    served_at            IS NOT NULL
                AND selected_option_id   IS NULL
                AND selected_option_text IS NULL
                AND correct_option_text  IS NOT NULL
                AND is_correct           IS NULL
                AND answered_at          IS NULL
                AND timed_out_at         IS NOT NULL
            )
        )
);

-- One index, two jobs: question_id as the leading column serves the RESTRICT
-- check against questions, and the full pair serves the composite FK check
-- against question_options. game_session_id needs no index of its own -- it
-- leads both unique constraints above.
CREATE INDEX session_questions_question_option_idx
    ON session_questions (question_id, selected_option_id);
