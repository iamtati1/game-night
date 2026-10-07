-- The two Arrays rungs realised by code-writing movements.
--
--   array-copy-spread  / produce   copy a list instead of sharing it
--   default-rest-params/ produce   gather any number of arguments
--
-- Judged on the source as well as the output, because in both cases the
-- output alone cannot tell the concept from the shortcut: a second name for
-- the same list prints the same length until something is pushed, and a
-- function with three fixed parameters adds up three numbers exactly as a
-- rest parameter does.

BEGIN;

INSERT INTO challenges (concept_id, demand_id, role, difficulty, activity)
SELECT c.id, d.id, 'practise', 3, 'mission'
FROM (VALUES ('array-copy-spread'), ('default-rest-params'))
     AS m (concept_slug)
JOIN concepts c ON c.slug = m.concept_slug
JOIN demands  d ON d.slug = 'produce'
WHERE NOT EXISTS (
    SELECT 1 FROM challenges ch
    WHERE ch.concept_id = c.id AND ch.demand_id = d.id AND ch.role = 'practise');

COMMIT;
