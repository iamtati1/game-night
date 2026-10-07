-- What realises a challenge, when no content row does.
--
-- THE PROBLEM. A challenge is one playable exercise. Until now, what made it
-- playable always lived in a table pointing back at it -- questions.challenge_id
-- for Code Blitz, bug_hunt_incidents.challenge_id for Bug Hunt. A challenge with
-- neither was a hole: a rung the curriculum declares and nothing can play.
--
-- But Jolt already has a third kind of activity, and it is not in the database
-- at all. The Variables mission in client/src/games/missions.ts has four
-- movements where the learner types JavaScript, runs it through littleJs, and is
-- judged on the STRUCTURE of what they wrote rather than its output. Each
-- movement already declares the concept and the rung it is evidence for, and all
-- four land on rungs that concept_demands declares and nothing fills.
--
-- So the content exists, the curriculum declares the rung, and the two cannot
-- see each other. This column is that introduction, and nothing more.
--
-- WHY NOT A CONTENT TABLE. Copying the movements into Postgres would make two
-- copies of the same exercise and a second place to edit a `check` function --
-- which cannot be stored as data anyway, because it is code that inspects a
-- parse result. The movement stays where it is. The database records only that
-- this rung is realised by one, which is the single fact the curriculum needs in
-- order to stop calling it a hole.
--
-- NO IDENTIFIER IS STORED, deliberately. A movement is already addressed by
-- (concept, demand) -- it carries both -- and a challenge already has both. A
-- separate key here would be a second, weaker name for something already named,
-- and the first thing to drift.
--
-- NULL KEEPS ITS EXISTING MEANING: realised by a content row, or not realised at
-- all. Every existing challenge is untouched and every existing query that has
-- never heard of this column continues to be correct.

BEGIN;

ALTER TABLE challenges
    ADD COLUMN activity TEXT;

COMMENT ON COLUMN challenges.activity IS
    'What realises this challenge when no content row points at it. NULL means a '
    'question or incident does (or nothing does yet). ''mission'' means the '
    'client-authored mission movement declaring the same (concept, demand).';

ALTER TABLE challenges
    ADD CONSTRAINT challenges_activity_valid
        CHECK (activity IS NULL OR activity IN ('mission'));

COMMIT;
