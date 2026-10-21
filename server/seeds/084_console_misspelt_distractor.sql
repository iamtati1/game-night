-- One wrong answer that belonged to a different bug.
--
-- The `console-misspelt` incident (021) is `consol.log("Hello");`, and its
-- distractor was "The sum 5 + 3 is wrong", explained as "5 + 3 really is 8.
-- The trouble is that JavaScript was never asked to work it out." -- copied
-- from its sibling `quotes-around-sum`, which is about a different program.
-- Browser QA found it: a beginner who picked it was told about a sum that is
-- not in the code on their screen.
--
-- 021 now authors the right distractor. Incidents are inserted once (021
-- skips a slug that exists), so a database seeded before the fix still holds
-- the old one; this corrects that row in place. Matched by the incident's slug
-- and the exact wrong text, so it touches nothing else, does nothing on a fresh
-- build, and does nothing on a re-run.
--
-- The option keeps its id, so a learner's earlier choice still points at it.

BEGIN;

UPDATE bug_hunt_options o
SET option_text = 'The quotation marks around Hello',
    explanation = 'The quotes are right: they mark Hello as text, and console.log prints text without them. The error names consol, the word before the dot.'
FROM bug_hunt_incidents i
WHERE o.incident_id = i.id
  AND i.slug = 'console-misspelt'
  AND o.option_text = 'The sum 5 + 3 is wrong';

COMMIT;
