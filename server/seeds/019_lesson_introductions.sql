-- The bridge between an authored lesson and the curriculum.
--
-- THE PROBLEM THIS FIXES. A lesson is only ever offered to a learner through an
-- `introduce` challenge: that row is what NEXT_INTRODUCTION_SQL finds, what
-- completing the lesson records against, and therefore what makes the concept
-- "met" so its practice can be released. Without one, an authored lesson is
-- unreachable and the concept behind it can never be demonstrated.
--
-- Before this seed, the client carried 21 authored lessons and the database
-- joined 2 of them. A learner starting from zero could complete
-- primitive-types, then assignment, and then the journey stopped having
-- anything to offer -- permanently. Measured, not assumed:
--
--     step 0: introduce values/primitive-types
--     step 1: introduce variables/assignment
--     step 2: NOTHING LEFT TO INTRODUCE -- stalled
--
-- This is a JOIN, not new curriculum. It adds no concept, no prerequisite, no
-- lesson copy and no question. Every slug below already exists in the
-- curriculum and already has a lesson written for it.
--
-- WHICH DEMAND. Not hardcoded. Each introduction is created at the SHALLOWEST
-- rung the concept actually declares in concept_demands, because the composite
-- foreign key from challenges refuses any pair that is not declared, and
-- because an introduction should ask the least of a learner meeting the idea
-- for the first time. Choosing the rung from the data means this seed cannot
-- break when a concept's declared demands change.
--
-- DIFFICULTY IS DERIVED, never typed in, exactly as seeds 015 and 016 do it.
--
-- KEPT IN SYNC BY A TEST. server/src/curriculum/lessonBridge.test.ts asserts
-- that the set of concepts with a lesson and the set with an introduction are
-- the same set, in both directions. Adding a lesson without an introduction, or
-- an introduction without a lesson, now fails the suite rather than silently
-- producing something a learner can never reach.
--
-- CONVERGENT. Anchored on "one active introduce challenge per concept", which
-- migration 024 enforces with a partial unique index, so re-running is a no-op.

BEGIN;

CREATE OR REPLACE FUNCTION curriculum_difficulty(p_concept TEXT, p_demand TEXT)
RETURNS SMALLINT
LANGUAGE sql
AS $$
    SELECT (CASE WHEN d.display_order >= (SELECT display_order FROM demands WHERE slug = 'produce') THEN
        CASE t.tier WHEN 'beginner' THEN 2 WHEN 'intermediate' THEN 3 ELSE 4 END
      ELSE CASE t.tier WHEN 'beginner' THEN 1 WHEN 'intermediate' THEN 2 ELSE 3 END END)::SMALLINT
    FROM concepts c
    JOIN topics t ON t.id = c.topic_id
    CROSS JOIN demands d
    WHERE c.slug = p_concept AND d.slug = p_demand;
$$;

-- One introduction per concept that has a lesson, at its shallowest declared
-- rung. Concepts already carrying an active introduction are skipped, which is
-- what makes this re-runnable and what leaves seeds 015 and 016 undisturbed.
INSERT INTO challenges (concept_id, demand_id, role, difficulty)
SELECT c.id,
       shallowest.demand_id,
       'introduce',
       curriculum_difficulty(c.slug, shallowest.demand_slug)
FROM concepts c
JOIN LATERAL (
    SELECT cd.demand_id, d.slug AS demand_slug
    FROM concept_demands cd
    JOIN demands d ON d.id = cd.demand_id
    WHERE cd.concept_id = c.id
    ORDER BY d.display_order
    LIMIT 1
) AS shallowest ON TRUE
WHERE c.slug IN (
    -- Every concept with an authored lesson in client/src/games/lessons.ts or
    -- scenes.ts. The guard test is what keeps this list honest.
    'arithmetic-operators',
    'assignment',
    'assignment-operators',
    'booleans',
    'comparison-operators',
    'console-output',
    'declaration',
    'equality',
    'expressions-produce-values',
    'initialization',
    'let-vs-const',
    'logical-operators',
    'null-vs-undefined',
    'primitive-types',
    'reading-variables',
    'reassignment',
    'truthy-falsy',
    'type-coercion',
    'typeof',
    'variable-state',
    'variables-name-values'
)
AND NOT EXISTS (
    SELECT 1 FROM challenges ch
    WHERE ch.concept_id = c.id AND ch.role = 'introduce' AND ch.is_active
);

DROP FUNCTION curriculum_difficulty(TEXT, TEXT);

COMMIT;
