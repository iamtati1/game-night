-- The three Loops rungs realised by code-writing movements.
--
--   loop-conditions / produce   cover every position exactly once
--   accumulators    / produce   build a total across the passes
--   nested-loops    / produce   every pair from two loops
--
-- Judged on the source as well as the output. A hardcoded bound prints the same
-- four characters as `word.length` does, adding four numbers by hand prints the
-- same total as a loop, and a single loop can print half the pairs of a nested
-- one -- so in each case only the construct tells the concept from the shortcut.

BEGIN;

INSERT INTO challenges (concept_id, demand_id, role, difficulty, activity)
SELECT c.id, d.id, 'practise', 3, 'mission'
FROM (VALUES ('loop-conditions'), ('accumulators'), ('nested-loops')) AS m (concept_slug)
JOIN concepts c ON c.slug = m.concept_slug
JOIN demands  d ON d.slug = 'produce'
WHERE NOT EXISTS (
    SELECT 1 FROM challenges ch
    WHERE ch.concept_id = c.id AND ch.demand_id = d.id AND ch.role = 'practise');

COMMIT;
