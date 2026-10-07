-- The four Array Methods rungs realised by code-writing movements.
--
--   map             / produce   transform every item
--   filter          / produce   keep the ones that pass
--   reduce          / produce   collapse the list to one value
--   method-chaining / produce   filter then map, in one chain
--
-- Judged on the source as well as the output, because in every case a loop
-- produces exactly the same answer. The point of this topic is not the result
-- but the method that got there, so each check insists on the method by name
-- and the chaining one insists on both in a single expression.

BEGIN;

INSERT INTO challenges (concept_id, demand_id, role, difficulty, activity)
SELECT c.id, d.id, 'practise', 3, 'mission'
FROM (VALUES ('map'), ('filter'), ('reduce'), ('method-chaining'))
     AS m (concept_slug)
JOIN concepts c ON c.slug = m.concept_slug
JOIN demands  d ON d.slug = 'produce'
WHERE NOT EXISTS (
    SELECT 1 FROM challenges ch
    WHERE ch.concept_id = c.id AND ch.demand_id = d.id AND ch.role = 'practise');

COMMIT;
