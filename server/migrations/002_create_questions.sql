CREATE TABLE questions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    prompt TEXT NOT NULL,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT questions_prompt_not_blank
        CHECK (TRIM(prompt) <> ''),

    CONSTRAINT questions_prompt_max_length
        CHECK (LENGTH(prompt) <= 5000)
);

CREATE TRIGGER questions_updated_at
BEFORE UPDATE ON questions
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION update_updated_at();