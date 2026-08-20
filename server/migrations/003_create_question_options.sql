CREATE TABLE question_options (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    question_id BIGINT NOT NULL
        REFERENCES questions(id) ON DELETE RESTRICT,

    option_text TEXT NOT NULL,

    display_order INTEGER NOT NULL,

    is_correct BOOLEAN NOT NULL DEFAULT FALSE,

    -- Options are retired, never deleted: historical games reference them.
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT question_options_option_text_not_blank
        CHECK (TRIM(option_text) <> ''),

    CONSTRAINT question_options_option_text_max_length
        CHECK (LENGTH(option_text) <= 500),

    CONSTRAINT question_options_display_order_positive
        CHECK (display_order > 0),

    -- Counts every row, including retired ones, because it is the target of
    -- the composite foreign key from session_questions. Redundant-looking
    -- (id is already the PK) but required: PostgreSQL only allows a foreign
    -- key to reference columns with a declared unique constraint.
    CONSTRAINT question_options_unique_id_question
        UNIQUE (question_id, id)
);

-- At most one CORRECT option per question, counting active rows only, so a
-- badly-worded correct option can be retired and replaced. Historical rows may
-- therefore hold several is_correct = true values for one question.
CREATE UNIQUE INDEX question_options_one_active_correct_idx
    ON question_options (question_id)
    WHERE is_correct AND is_active;

-- Same reasoning for slot positions: a retired option must not keep reserving
-- its display_order against the replacement that supersedes it.
CREATE UNIQUE INDEX question_options_active_display_order_idx
    ON question_options (question_id, display_order)
    WHERE is_active;

CREATE TRIGGER question_options_updated_at
BEFORE UPDATE ON question_options
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION update_updated_at();
