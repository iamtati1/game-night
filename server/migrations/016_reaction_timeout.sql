-- Reaction: a round the player never answered is an OUTCOME, not an error.
--
-- reaction_ms was bounded at 5000 in three places -- the route, isPlausibleReaction
-- and a CHECK on this table -- and the route turned anything past it into HTTP 400.
-- That is the wrong shape for the situation it actually describes. Reacting after
-- five seconds is not a malformed request; it is a player who looked away, and the
-- game owes them a result rather than an API error and a stuck round.
--
-- So 'timed_out' joins 'false_start' as the second way a round can end without a
-- reaction time. It scores zero for the same reason a false start does, and like a
-- false start it carries no reaction_ms: there is no number to record, because
-- nothing was reacted to in time.
--
-- The 5000ms ceiling on reaction_ms is deliberately left exactly as it was. It
-- still means "no human reaction is this slow" -- the difference is that crossing
-- it now produces a timed_out round instead of a rejected one.

BEGIN;

ALTER TABLE reaction_rounds
    DROP CONSTRAINT reaction_rounds_status_valid;

ALTER TABLE reaction_rounds
    ADD CONSTRAINT reaction_rounds_status_valid
        CHECK (status IN ('pending', 'reacted', 'false_start', 'timed_out'));

-- Same shape as reaction_rounds_false_start_state: served, ended, no time.
-- One constraint per status, so a violation names the state it broke.
ALTER TABLE reaction_rounds
    ADD CONSTRAINT reaction_rounds_timed_out_state
        CHECK (
            status <> 'timed_out'
            OR (served_at IS NOT NULL AND ended_at IS NOT NULL AND reaction_ms IS NULL)
        );

COMMIT;
