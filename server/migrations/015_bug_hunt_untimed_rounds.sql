-- Bug Hunt: let the earliest hunts carry no clock at all.
--
-- The timing model was line-count only, so difficulty never touched the budget:
-- measured across the seeded bank, difficulty 1 averaged 60.8s and difficulty 5
-- averaged 72.0s, and a trivial off-by-one and a concurrent read-modify-write
-- race both got exactly 66 seconds. There was no on-ramp because there was no
-- ramp -- hunt one carried the same pressure as the last one.
--
-- The fix is a budget derived from difficulty, and the first tier having no
-- deadline whatsoever. "Very generous" is not the same as untimed: a visible
-- countdown at 90 seconds still tells a player learning the game that they are
-- being measured. NULL means the round genuinely cannot expire.
--
-- expireOverdueRounds needs no change for this: comparing against a NULL
-- time_limit_ms yields NULL rather than true, so an untimed round is never
-- selected. The predicate names the condition explicitly anyway, so the
-- behaviour is stated rather than inherited from three-valued logic.

BEGIN;

ALTER TABLE bug_hunt_rounds
    ALTER COLUMN time_limit_ms DROP NOT NULL;

-- The old constraint required a positive number and therefore forbade NULL by
-- implication. Replaced so that "no clock" is legal and "a clock of zero" is not.
ALTER TABLE bug_hunt_rounds
    DROP CONSTRAINT bug_hunt_rounds_time_limit_positive;

ALTER TABLE bug_hunt_rounds
    ADD CONSTRAINT bug_hunt_rounds_time_limit_positive
    CHECK (time_limit_ms IS NULL OR time_limit_ms > 0);

COMMIT;
