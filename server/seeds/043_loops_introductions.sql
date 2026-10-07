-- Introductions for the six Loops lessons. Same join as seeds 019, 037 and 040.

BEGIN;

INSERT INTO challenges (concept_id, demand_id, role, difficulty)
SELECT c.id, shallowest.demand_id, 'introduce', 2
FROM concepts c
JOIN LATERAL (
    SELECT cd.demand_id FROM concept_demands cd
    JOIN demands d ON d.id = cd.demand_id
    WHERE cd.concept_id = c.id ORDER BY d.display_order LIMIT 1
) AS shallowest ON TRUE
WHERE c.slug IN (
    'for-loop-anatomy', 'while-loops', 'loop-conditions',
    'accumulators', 'break-continue', 'nested-loops'
)
AND NOT EXISTS (
    SELECT 1 FROM challenges ch WHERE ch.concept_id = c.id AND ch.role = 'introduce'
);

COMMIT;
