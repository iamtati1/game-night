-- The three Functions rungs realised by code-writing movements.
--
--   function-declaration / produce   define one, then call it
--   guard-clauses        / produce   return early, with no else
--   arrow-functions      / produce   the short form, implicit return
--
-- Judged on the source as well as the output, because in each case the output
-- alone cannot tell the concept from the shortcut: printing directly produces
-- the same line as defining-and-calling, an if/else returns the same answer a
-- guard does, and a braced arrow with an explicit return prints what an
-- implicit one prints.

BEGIN;

INSERT INTO challenges (concept_id, demand_id, role, difficulty, activity)
SELECT c.id, d.id, 'practise', 3, 'mission'
FROM (VALUES ('function-declaration'), ('guard-clauses'), ('arrow-functions'))
     AS m (concept_slug)
JOIN concepts c ON c.slug = m.concept_slug
JOIN demands  d ON d.slug = 'produce'
WHERE NOT EXISTS (
    SELECT 1 FROM challenges ch
    WHERE ch.concept_id = c.id AND ch.demand_id = d.id AND ch.role = 'practise');

COMMIT;
