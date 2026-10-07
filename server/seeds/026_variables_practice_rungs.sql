-- The two Variables rungs that a PRACTICE fills, as curriculum rungs.
--
-- Seed 024 registered the four mission movements. Two more rungs already have a
-- written exercise and were still reporting as holes:
--
--     declaration  produce
--     assignment   produce
--
-- Both live in client/src/games/practice.ts. A practice and a mission are the
-- same thing to a rung -- both are lists of Movement, judged by the same `check`
-- signature against the same littleJs run -- and they differ only in what they
-- were written for. The encounter looks in both (client/src/games/movements.ts),
-- so both belong in the curriculum.
--
-- This closes `declaration` and `assignment` to the point where the only thing
-- still missing from them is `recognise`.
--
-- Idempotent, like every seed here.

BEGIN;

INSERT INTO challenges (concept_id, demand_id, role, difficulty, activity)
SELECT c.id, d.id, 'practise', 2, 'mission'
FROM (VALUES ('declaration', 'produce'), ('assignment', 'produce'))
     AS m (concept_slug, demand_slug)
JOIN concepts c ON c.slug = m.concept_slug
JOIN demands  d ON d.slug = m.demand_slug
WHERE NOT EXISTS (
    SELECT 1 FROM challenges ch
    WHERE ch.concept_id = c.id AND ch.demand_id = d.id AND ch.activity = 'mission'
);

COMMIT;
