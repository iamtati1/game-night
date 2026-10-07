-- The three Strings rungs realised by code-writing movements.
--
--   string-concatenation / produce   join a value into a message
--   string-methods       / produce   reshape text with methods
--   template-literals    / produce   build text from holes
--
-- All three are judged on the SOURCE as well as the output, because in every
-- case the output does not distinguish the concept from the shortcut:
-- `"Bays: 4"` typed out prints what a join prints, a `+` chain prints what a
-- template prints, and trimming without capitalising prints something that
-- looks close enough. The check requires the construct the concept is about.
--
-- Registered exactly as seeds 024, 026, 034 and 036 register theirs.

BEGIN;

INSERT INTO challenges (concept_id, demand_id, role, difficulty, activity)
SELECT c.id, d.id, 'practise', 3, 'mission'
FROM (VALUES ('string-concatenation'), ('string-methods'), ('template-literals'))
     AS m (concept_slug)
JOIN concepts c ON c.slug = m.concept_slug
JOIN demands  d ON d.slug = 'produce'
WHERE NOT EXISTS (
    SELECT 1 FROM challenges ch
    WHERE ch.concept_id = c.id AND ch.demand_id = d.id AND ch.role = 'practise');

COMMIT;
