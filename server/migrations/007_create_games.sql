-- The games table, deferred in Phase 2 as speculative generality and now
-- genuinely required: a second game (Flush) needs sessions to record which game
-- they belong to. This is the migration sketched at the time, unchanged.

CREATE TABLE games (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- The identifier application code uses. Numeric ids shift if the table is
    -- ever reseeded; a slug is stable, readable in logs, and safe to hardcode.
    slug TEXT NOT NULL,

    name TEXT NOT NULL,
    tagline TEXT,

    -- Games are retired, never deleted: sessions reference them forever.
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT games_slug_unique
        UNIQUE (slug),

    -- Same normalization contract as users.email: store it already-normalized so
    -- the constraint is a backstop rather than the thing callers trip over.
    CONSTRAINT games_slug_normalized
        CHECK (slug = LOWER(TRIM(slug))),

    CONSTRAINT games_slug_not_blank
        CHECK (TRIM(slug) <> ''),

    CONSTRAINT games_slug_max_length
        CHECK (LENGTH(slug) <= 50),

    CONSTRAINT games_name_not_blank
        CHECK (TRIM(name) <> ''),

    CONSTRAINT games_name_max_length
        CHECK (LENGTH(name) <= 80)
);

CREATE TRIGGER games_updated_at
BEFORE UPDATE ON games
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION update_updated_at();

-- Backfill the existing game before adding the column that requires it.
INSERT INTO games (slug, name, tagline)
VALUES ('code-blitz', 'Code Blitz', 'Ten questions, thirty seconds each.');

-- Three steps, in this order, deliberately. Adding a NOT NULL column with no
-- default to a populated table fails outright, so: add nullable, backfill every
-- existing row, then tighten the constraint.
ALTER TABLE game_sessions
    ADD COLUMN game_id BIGINT REFERENCES games(id) ON DELETE RESTRICT;

UPDATE game_sessions
SET game_id = (SELECT id FROM games WHERE slug = 'code-blitz')
WHERE game_id IS NULL;

ALTER TABLE game_sessions
    ALTER COLUMN game_id SET NOT NULL;

-- Serves the RESTRICT check against games plus every per-game aggregate
-- (per-game stats now, per-game leaderboards later). Nothing else covers it:
-- game_sessions_user_id_idx leads with user_id, and the one-active-session
-- index is partial on status = 'in_progress'.
CREATE INDEX game_sessions_game_id_idx
    ON game_sessions (game_id);
