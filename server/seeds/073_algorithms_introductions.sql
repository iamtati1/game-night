-- Introductions for the five Algorithms lessons.

BEGIN;

INSERT INTO challenges (concept_id, demand_id, role, difficulty)
SELECT c.id, shallowest.demand_id, 'introduce', 3
FROM concepts c
JOIN LATERAL (
    SELECT cd.demand_id FROM concept_demands cd
    JOIN demands d ON d.id = cd.demand_id
    WHERE cd.concept_id = c.id ORDER BY d.display_order LIMIT 1
) AS shallowest ON TRUE
WHERE c.slug IN ('recursion','base-cases','search-strategies','sorting-basics','complexity')
AND NOT EXISTS (SELECT 1 FROM challenges ch WHERE ch.concept_id = c.id AND ch.role = 'introduce');

COMMIT;
