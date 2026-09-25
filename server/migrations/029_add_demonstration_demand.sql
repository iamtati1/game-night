-- Which rung a lesson demonstration was evidence of.
--
-- THE CAPABILITY MAP IS ALREADY HALF DERIVED. metDemandsCte() in
-- curriculum/demand.ts produces (concept, demand) pairs from real play -- Code
-- Blitz answers and Bug Hunt rounds both reach a demand through their
-- challenge. So the game side of "what can this learner actually do" already
-- exists and is already correct.
--
-- The lesson side did not. concept_demonstrations recorded (user, concept) with
-- no rung, so a completed lesson said "they have met this" and nothing about
-- what they can do with it. That is the one hole in the map.
--
-- NULLABLE, AND THE UNIQUE INDEX IS UNTOUCHED. Existing rows stay NULL, meaning
-- "demonstrated, rung unrecorded" -- which is true, and better than backfilling
-- a guess. One row per (user, concept) still, because the rich per-rung picture
-- comes from play; the lesson only needs to JOIN that map rather than duplicate
-- it. Making this (user, concept, demand) would change every join in
-- findJourneyPath for no gain today.
--
-- ON DELETE RESTRICT, matching every other reference to demands: a rung that
-- content points at is not something to delete quietly.

BEGIN;

ALTER TABLE concept_demonstrations
    ADD COLUMN demand_id BIGINT REFERENCES demands (id) ON DELETE RESTRICT;

COMMENT ON COLUMN concept_demonstrations.demand_id IS
    'The rung this demonstration is evidence of. NULL for rows recorded before '
    'the column existed. Joined with metDemandsCte to complete the capability map.';

COMMIT;
