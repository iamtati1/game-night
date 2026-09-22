-- The core JavaScript idea each topic exists to establish.
--
-- WHY A COLUMN AND NOT A TABLE. The curriculum hierarchy is
--
--     Topic -> Core Principle -> Concept -> Learner Capability -> Practice
--
-- and four of those five already have a home: topics, concepts, a concept's
-- objective plus its declared demands, and challenges. Only the principle was
-- homeless. It is exactly one sentence per topic -- sixteen rows of text, one to
-- one with a row that already exists -- so it is a column on that row. A
-- separate core_principles table would be a join for a value that can never
-- have more than one instance, and the architecture has resisted that kind of
-- layer everywhere else.
--
-- NOT THE SAME AS `rationale`, which is why this is a second column rather than
-- a rewrite of the first:
--
--     rationale   why this topic sits at this point in the journey
--                 "A variable is a value with a name attached, so it is
--                  meaningless before values."
--
--     principle   the JavaScript idea the learner should come away holding
--                 "Variables give names to values so a program can refer to
--                  information again and change it over time."
--
-- The first is an argument about curriculum design, addressed to whoever is
-- reviewing the syllabus. The second teaches something, and is addressed to the
-- learner. Collapsing them would lose the placement reasoning, which is the
-- only record of why the order is what it is.
--
-- DEFAULT '' BECAUSE THE FIRST PASS COVERS FIVE TOPICS. values, variables,
-- operators, control-flow and strings are where the foundational mental models
-- live and where the granularity audit found real gaps. The other eleven carry
-- an empty principle until they are written, which is a visible gap rather than
-- a silent one -- an empty string reads as "nobody has written this yet", where
-- a NULL would have needed every reader to decide what absence meant.

BEGIN;

ALTER TABLE topics ADD COLUMN principle TEXT NOT NULL DEFAULT '';

COMMIT;
