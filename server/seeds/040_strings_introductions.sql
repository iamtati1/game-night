-- Introductions for the seven Strings lessons.
--
-- The same join seeds 019 and 037 make. A lesson reaches a learner only through
-- an `introduce` challenge; without one the lesson is unreachable and the
-- concept behind it can never be demonstrated.

BEGIN;

INSERT INTO challenges (concept_id, demand_id, role, difficulty)
SELECT c.id, shallowest.demand_id, 'introduce', 2
FROM concepts c
JOIN LATERAL (
    SELECT cd.demand_id
    FROM concept_demands cd
    JOIN demands d ON d.id = cd.demand_id
    WHERE cd.concept_id = c.id
    ORDER BY d.display_order
    LIMIT 1
) AS shallowest ON TRUE
WHERE c.slug IN (
    'string-literals',
    'string-concatenation',
    'string-length',
    'string-indexing',
    'string-methods',
    'template-literals',
    'string-immutability'
)
AND NOT EXISTS (
    SELECT 1 FROM challenges ch
    WHERE ch.concept_id = c.id AND ch.role = 'introduce'
);

COMMIT;
