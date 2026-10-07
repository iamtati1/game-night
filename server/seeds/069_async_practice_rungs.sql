-- The three Async rungs realised by code-writing movements.
--
--   event-loop    / produce   make output appear in a chosen order
--   async-await   / produce   wait for a value and use it
--   promise-all   / produce   wait for several at once
--
-- Judged on the source as well as the output, because the answer alone proves
-- nothing here: three console.logs in a row print the same three lines as a
-- timer does, and a value can be printed without ever having been awaited.

BEGIN;

INSERT INTO challenges (concept_id, demand_id, role, difficulty, activity)
SELECT c.id, d.id, 'practise', 3, 'mission'
FROM (VALUES ('event-loop'), ('async-await'), ('promise-all')) AS m (concept_slug)
JOIN concepts c ON c.slug = m.concept_slug
JOIN demands  d ON d.slug = 'produce'
WHERE NOT EXISTS (
    SELECT 1 FROM challenges ch
    WHERE ch.concept_id = c.id AND ch.demand_id = d.id AND ch.role = 'practise');

COMMIT;
