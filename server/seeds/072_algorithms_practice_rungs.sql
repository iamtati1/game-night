-- The one Algorithms rung realised by a code-writing movement.
--
--   recursion / produce   write a function that calls itself and stops
--
-- Judged on the source as well as the output, because a loop adds up the same
-- numbers and prints the same total. The concept is the function calling
-- itself and the case that ends it.

BEGIN;

INSERT INTO challenges (concept_id, demand_id, role, difficulty, activity)
SELECT c.id, d.id, 'practise', 3, 'mission'
FROM concepts c JOIN demands d ON d.slug = 'produce'
WHERE c.slug = 'recursion'
AND NOT EXISTS (
    SELECT 1 FROM challenges ch
    WHERE ch.concept_id = c.id AND ch.demand_id = d.id AND ch.role = 'practise');

COMMIT;
