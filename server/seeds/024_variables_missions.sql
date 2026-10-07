-- The Variables mission movements, as curriculum rungs.
--
-- Four rungs that concept_demands has always declared and nothing has ever
-- filled:
--
--     initialization    produce
--     reading-variables apply
--     reassignment      apply
--     variable-state    produce
--
-- The exercises for all four already exist, in client/src/games/missions.ts, and
-- have since before the curriculum could describe them. Each movement declares
-- the concept and demand it is evidence for; those four pairs are exactly the
-- four above. This seed creates the challenge rows that let the curriculum see
-- them, and nothing else. No exercise content is copied.
--
-- WHY THESE FOUR AND NO OTHERS. The remaining Variables gaps -- recognise on
-- five concepts, declaration/produce, assignment/produce, let-vs-const/explain
-- -- have no authored exercise anywhere. Inventing challenge rows for them would
-- replace an honest hole with a promise nothing can keep, which is precisely the
-- failure the encounter's empty-rung reporting exists to make visible.
--
-- DIFFICULTY follows the same derivation every other seed uses: produce and
-- deeper are one tier harder than the rungs below them, and Variables is a
-- beginner topic, so apply is 1 and produce is 2.
--
-- Idempotent. Re-running changes nothing, matching every other seed here.

BEGIN;

INSERT INTO challenges (concept_id, demand_id, role, difficulty, activity)
SELECT c.id,
       d.id,
       'practise',
       CASE WHEN d.display_order >= (SELECT display_order FROM demands WHERE slug = 'produce')
            THEN 2 ELSE 1 END,
       'mission'
FROM (VALUES
        ('initialization',    'produce'),
        ('reading-variables', 'apply'),
        ('reassignment',      'apply'),
        ('variable-state',    'produce')
     ) AS m (concept_slug, demand_slug)
JOIN concepts c ON c.slug = m.concept_slug
JOIN demands  d ON d.slug = m.demand_slug
WHERE NOT EXISTS (
    SELECT 1 FROM challenges ch
    WHERE ch.concept_id = c.id AND ch.demand_id = d.id AND ch.activity = 'mission'
);

COMMIT;
