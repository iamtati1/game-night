-- Retiring the untagged legacy bank, so Code Blitz deals the curriculum.
--
-- WHAT THIS CHANGES FOR A LEARNER. Measured over 20 dealt rounds for a learner
-- whose current concept was `console-output`: 74% of beats were untagged legacy
-- questions, 26% carried a challenge, and 10% were on the concept the Home page
-- had just named. An untagged question cannot clear a rung -- every arm of
-- CLEARED_RUNGS_CTE joins through questions.challenge_id -- so three quarters of
-- a round could not contribute to the thing the round said it was about. After
-- this, every beat is curriculum content and every correct answer is evidence.
--
-- NOTHING IS DELETED. All 536 question rows stay, with their options, their
-- explanations and their prompts. is_active = FALSE is the same reversible
-- mechanism seed 009 used to retire seven questions, and the inverse is one
-- UPDATE. A question judged rescuable later is brought back by tagging it,
-- which is what seed 077 did for ten of them.
--
-- WHY THE THREE ESCAPE HATCHES ARE NOT TOUCHED. eligibility.ts:192,
-- roles.ts:86 and frontier.ts:182 each pass `challenge_id IS NULL`, and the
-- obvious next move is to delete them. Two reasons not to, both measured:
--
--   They are not needed. Every question-side caller ANDs those predicates with
--   ELIGIBLE_QUESTION_PREDICATE, which requires q.is_active, so a retired
--   untagged question is already excluded. The hatch is now dead code on this
--   side of the wire.
--
--   They are not only ours. curriculumSelects() is alias-generic, and
--   bugHunt/queries.ts applies it to bug_hunt_incidents, where 39 of 64 rows
--   are untagged. Deleting the disjuncts would silently retire more than half
--   the Bug Hunt bank -- a content decision about a different game, made as a
--   side effect of a Code Blitz change.
--
-- ONE SIDE EFFECT, FIXED ALONGSIDE. journeyCte's floor fell back to the LAST
-- stocked topic when no topic could fill a session, which with this bank gone
-- opened the whole curriculum to a brand-new learner and let Bug Hunt deal them
-- `cart.length` on a null. The fallback is now the FIRST stocked topic. See the
-- note in curriculum/journey.ts; the pools are unchanged for Code Blitz.
--
-- CONVERGENT. The UPDATE matches on challenge_id IS NULL and writes a constant,
-- so a second run selects the same rows and makes the same change. It inserts
-- nothing, so it cannot duplicate.

BEGIN;

-- Identical in shape to retire_question in seed 009, which retires by prompt.
-- This retires by the one thing the whole bank has in common -- having no rung
-- to stand on -- because naming 224 prompts would be a list nobody could check.
UPDATE questions
SET is_active = FALSE,
    updated_at = CURRENT_TIMESTAMP
WHERE challenge_id IS NULL
  AND is_active;

COMMIT;
