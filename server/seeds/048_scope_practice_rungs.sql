-- The one Scope rung realised by a code-writing movement.
--
--   closures / produce   write a function that makes a function
--
-- Judged on the source as well as the output, because the output alone cannot
-- tell a closure from the shortcut: a single function that takes a name and
-- prints a greeting produces exactly the same line. What is being asked for is
-- the function that HANDS BACK a function, and the greeting using the name it
-- captured rather than one typed into the message.
--
-- The topic's other fifteen rungs are questions, in 047. `produce` is declared
-- only by `closures` here -- writing out a temporal dead zone or a shadowed
-- variable on purpose is not a skill anybody needs.

BEGIN;

INSERT INTO challenges (concept_id, demand_id, role, difficulty, activity)
SELECT c.id, d.id, 'practise', 3, 'mission'
FROM concepts c
JOIN demands d ON d.slug = 'produce'
WHERE c.slug = 'closures'
AND NOT EXISTS (
    SELECT 1 FROM challenges ch
    WHERE ch.concept_id = c.id AND ch.demand_id = d.id AND ch.role = 'practise');

COMMIT;
