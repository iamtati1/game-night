-- Introductions for the five Control Flow lessons.
--
-- The same join seed 019 makes, for the concepts added since. A lesson reaches
-- a learner only through an `introduce` challenge: that row is what
-- NEXT_INTRODUCTION_SQL finds, what completing the lesson records against, and
-- therefore what makes the concept met so its practice can be released.
-- Without one, an authored lesson is unreachable and the concept behind it can
-- never be demonstrated.
--
-- Kept separate from 019 rather than edited into it, because seeds are applied
-- in filename order and re-run on every deploy -- editing an applied one hides
-- what changed and when.
--
-- Adds no concept, no prerequisite and no question. Every slug already exists
-- in the curriculum and already has a lesson written for it.

BEGIN;

INSERT INTO challenges (concept_id, demand_id, role, difficulty)
SELECT c.id, shallowest.demand_id, 'introduce', 1
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
    'if-else',
    'else-if-chains',
    'compound-conditions',
    'nested-conditions',
    'ternary'
)
AND NOT EXISTS (
    SELECT 1 FROM challenges ch
    WHERE ch.concept_id = c.id AND ch.role = 'introduce'
);

COMMIT;
