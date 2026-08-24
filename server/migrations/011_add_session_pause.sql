-- Pause/resume: a session may be set down and picked up later without being
-- destroyed. Leaving a game stops meaning abandoning it.
--
-- Wrapped in an explicit transaction. Two of the statements below are a
-- DROP CONSTRAINT followed by an ADD CONSTRAINT of the same name; without
-- BEGIN/COMMIT a failure between them would leave the table with no constraint
-- at all, which is a worse state than either the old or the new schema.

BEGIN;

-- ------------------------------------------------------------------ status ----

-- 'paused' is a status rather than a boolean flag. The timestamp matrix, both
-- partial indexes, and every history/stats predicate already key off `status`;
-- a boolean would turn each of them into `status = 'in_progress' AND NOT
-- is_paused` and would need the one-active index's predicate widened by hand.
-- One forgotten AND is then a live bug.
ALTER TABLE game_sessions
    DROP CONSTRAINT game_sessions_status_valid;

ALTER TABLE game_sessions
    ADD CONSTRAINT game_sessions_status_valid
        CHECK (status IN ('in_progress', 'paused', 'completed', 'abandoned'));

-- ------------------------------------------------------------------- state ----

ALTER TABLE game_sessions
    -- Set for exactly as long as the session is paused. Resume reads it to work
    -- out how far to push the live unit's clock forward, then clears it.
    ADD COLUMN paused_at TIMESTAMPTZ,

    -- How many times this session was paused. Preserved through completion, so a
    -- future leaderboard can tell an uninterrupted run from one that was set down
    -- and thought about. Pausing necessarily preserves the puzzle as well as the
    -- clock; this is the column that keeps the ranking layer's options open
    -- without putting a penalty inside the scoring rules.
    ADD COLUMN pause_count INTEGER NOT NULL DEFAULT 0,

    -- Total time spent paused. The audit trail for the served_at shift below:
    -- without it, a clock that has been moved cannot be reconciled after the
    -- fact against when the unit was actually first shown.
    ADD COLUMN total_paused_ms BIGINT NOT NULL DEFAULT 0;

ALTER TABLE game_sessions
    ADD CONSTRAINT game_sessions_pause_count_non_negative
        CHECK (pause_count >= 0),

    ADD CONSTRAINT game_sessions_total_paused_ms_non_negative
        CHECK (total_paused_ms >= 0);

-- --------------------------------------------------------- timestamp matrix ----

-- Rewritten rather than extended. The CASE ends in ELSE FALSE, so adding
-- 'paused' to the status domain above WITHOUT touching this constraint would
-- make every paused row fail here: no branch matches, and the fallback rejects.
--
-- paused_at appears in all four branches, not just its own. Naming it only under
-- 'paused' would let a resumed or finished session keep a stale paused_at, and a
-- stale paused_at is exactly the value the resume shift multiplies by.
ALTER TABLE game_sessions
    DROP CONSTRAINT game_sessions_status_timestamps_consistent;

ALTER TABLE game_sessions
    ADD CONSTRAINT game_sessions_status_timestamps_consistent
        CHECK (
            CASE status
                WHEN 'in_progress' THEN completed_at IS NULL     AND abandoned_at IS NULL     AND paused_at IS NULL
                WHEN 'paused'      THEN completed_at IS NULL     AND abandoned_at IS NULL     AND paused_at IS NOT NULL
                WHEN 'completed'   THEN completed_at IS NOT NULL AND abandoned_at IS NULL     AND paused_at IS NULL
                WHEN 'abandoned'   THEN abandoned_at IS NOT NULL AND completed_at IS NULL     AND paused_at IS NULL
                ELSE FALSE
            END
        );

-- ----------------------------------------------------------------- indexes ----

-- At most one resumable session per user per game.
--
-- Scoped to (user_id, game_id), so one paused Code Blitz alongside one paused
-- Flush is legal: the pile of unfinished games is capped at the number of games
-- rather than by a magic number that would need revisiting for game #3.
--
-- The predicate covers 'in_progress' as well as 'paused' on purpose. That makes
-- "a paused Code Blitz next to a live Code Blitz" impossible rather than merely
-- discouraged. Without it, starting a new game while one is paused would succeed
-- and the collision would surface later as a 23505 at PAUSE time -- the worst
-- place to discover it, since the player is trying to leave. This index forces
-- the choice to be made at start, with the player's consent.
CREATE UNIQUE INDEX game_sessions_one_resumable_per_game_idx
    ON game_sessions (user_id, game_id)
    WHERE status IN ('in_progress', 'paused');

-- Deliberately NOT touched: game_sessions_one_active_per_user_idx. Its predicate
-- is already WHERE status = 'in_progress', so a row leaving that status drops out
-- of the index by itself. "A paused session must not block another game" costs
-- zero index changes -- the payoff for having made it partial in the first place.

COMMIT;
