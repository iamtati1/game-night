CREATE TABLE answers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    game_session_id BIGINT NOT NULL,
    question_id BIGINT NOT NULL,
    question_option_id BIGINT NOT NULL,

    answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT answers_game_session_fk
        FOREIGN KEY (game_session_id)
        REFERENCES game_sessions(id)
        ON DELETE CASCADE,

    CONSTRAINT answers_question_fk
        FOREIGN KEY (question_id)
        REFERENCES questions(id)
        ON DELETE RESTRICT,

    CONSTRAINT answers_question_option_fk
        FOREIGN KEY (question_id, question_option_id)
        REFERENCES question_options(question_id, id)
        ON DELETE RESTRICT,

    CONSTRAINT answers_game_session_question_unique
        UNIQUE (game_session_id, question_id)
);
