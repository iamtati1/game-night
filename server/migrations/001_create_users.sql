CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    email TEXT NOT NULL,

    username TEXT NOT NULL,

    password_hash TEXT NOT NULL,

    anonymized_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT users_email_not_blank
        CHECK (TRIM(email) <> ''),

    CONSTRAINT users_email_normalized
        CHECK (email = LOWER(TRIM(email))),

    CONSTRAINT users_email_max_length
        CHECK (LENGTH(email) <= 254),

    CONSTRAINT users_username_not_blank
        CHECK (TRIM(username) <> ''),

    CONSTRAINT users_username_no_outer_whitespace
        CHECK (username = TRIM(username)),

    CONSTRAINT users_username_max_length
        CHECK (LENGTH(username) <= 30),

    CONSTRAINT users_password_hash_not_blank
        CHECK (TRIM(password_hash) <> '')
);

CREATE UNIQUE INDEX users_email_unique_idx
ON users (LOWER(email));

CREATE UNIQUE INDEX users_username_unique_idx
ON users (LOWER(username));

CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

CREATE TRIGGER users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION update_users_updated_at();