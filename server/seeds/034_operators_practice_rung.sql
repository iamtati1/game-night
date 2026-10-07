-- `assignment-operators / produce`, realised by a code-writing movement.
--
-- The one Operators rung that is not a question. "Update a variable using its
-- own current value" is a thing you do, not a thing you pick from four options:
-- `fuel = 80` and `fuel -= 20` print the same number, and only one of them is
-- the concept. The movement in client/src/games/practice.ts judges the SOURCE
-- for the compound form, the same way the Variables mission judges whether a
-- name was used rather than a value typed in.
--
-- `littleJs` gained `+=`, `-=`, `*=` and `/=` for this, which is the rule that
-- file states for itself: the grammar grows when the curriculum teaches the
-- construct. Its existing boundaries are unchanged and tested.
--
-- Registered exactly as seeds 024 and 026 register the Variables movements:
-- challenges.activity = 'mission', with no identifier stored, because the
-- (concept, demand) pair is already the address on both sides.

BEGIN;

INSERT INTO challenges (concept_id, demand_id, role, difficulty, activity)
SELECT c.id, d.id, 'practise', 2, 'mission'
FROM concepts c, demands d
WHERE c.slug = 'assignment-operators' AND d.slug = 'produce'
  AND NOT EXISTS (
      SELECT 1 FROM challenges ch
      WHERE ch.concept_id = c.id AND ch.demand_id = d.id AND ch.role = 'practise');

COMMIT;
