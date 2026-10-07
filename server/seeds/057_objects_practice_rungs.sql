-- The two Objects rungs realised by code-writing movements.
--
--   destructuring / produce   pull two properties out by name
--   json-shape    / produce   send an object through text and back
--
-- Judged on the source as well as the output, because in both cases the
-- ordinary way round produces the same lines: `p.name` prints what a
-- destructured `name` prints, and an object copied by hand looks exactly like
-- one that survived a JSON round trip.

BEGIN;

INSERT INTO challenges (concept_id, demand_id, role, difficulty, activity)
SELECT c.id, d.id, 'practise', 3, 'mission'
FROM (VALUES ('destructuring'), ('json-shape')) AS m (concept_slug)
JOIN concepts c ON c.slug = m.concept_slug
JOIN demands  d ON d.slug = 'produce'
WHERE NOT EXISTS (
    SELECT 1 FROM challenges ch
    WHERE ch.concept_id = c.id AND ch.demand_id = d.id AND ch.role = 'practise');

COMMIT;
