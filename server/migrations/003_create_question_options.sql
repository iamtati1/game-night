CREATE TABLE question_options (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    question_id BIGINT NOT NULL
        REFERENCES questions(id),

    option_text TEXT NOT NULL,

    display_order INTEGER NOT NULL,

    is_correct BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT question_options_option_text_not_blank
        CHECK (TRIM(option_text) <> ''),

    CONSTRAINT question_options_display_order_positive
        CHECK (display_order > 0),

    CONSTRAINT question_options_unique_display_order
        UNIQUE (question_id, display_order),

    CONSTRAINT question_options_unique_id_question
        UNIQUE (question_id, id)
);