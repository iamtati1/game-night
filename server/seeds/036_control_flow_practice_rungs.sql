-- The two Control Flow rungs realised by code-writing movements.
--
--   compound-conditions / produce   write one condition that asks two things
--   ternary            / produce   write a conditional that produces a value
--
-- Both are in client/src/games/practice.ts, and both are judged on the SOURCE
-- rather than the output, because the output does not distinguish the concept
-- from its neighbour: two nested ifs print what one `&&` prints, and an `if`
-- assigning a variable prints what a ternary prints. The check requires the
-- construct the concept is about.
--
-- Registered exactly as seeds 024, 026 and 034 register theirs.

BEGIN;

INSERT INTO challenges (concept_id, demand_id, role, difficulty, activity)
SELECT c.id, d.id, 'practise', 2, 'mission'
FROM (VALUES ('compound-conditions'), ('ternary')) AS m (concept_slug)
JOIN concepts c ON c.slug = m.concept_slug
JOIN demands  d ON d.slug = 'produce'
WHERE NOT EXISTS (
    SELECT 1 FROM challenges ch
    WHERE ch.concept_id = c.id AND ch.demand_id = d.id AND ch.role = 'practise');

COMMIT;
