-- The shared practice layer: one table every game's content can point at.
--
-- A challenge is a PEDAGOGICAL RECORD -- "this practises array-map, at the
-- predict rung, as practice rather than instruction". It does not own the
-- content that realises it. Content tables point UP at a challenge; challenges
-- carry no per-game column.
--
-- WHY THE ARROWS RUN UPWARD. Two independent reasons, both from this codebase
-- rather than from the diagram:
--
--   1. Six foreign keys already reference content by its own id, all RESTRICT:
--      session_questions.question_id -> questions,
--      flush_rounds.snippet_id      -> tick_snippets      (twice),
--      bug_hunt_rounds.incident_id  -> bug_hunt_incidents (twice).
--      Re-keying questions on challenge_id would break every one of them and
--      every query that joins them, to gain nothing a nullable column does not
--      already give.
--
--   2. A challenge pointing DOWN at content would need question_id, snippet_id
--      and incident_id -- nullable, one per game. That is the nullable
--      mega-table the architecture exists to avoid, and the reason migration 008
--      gave Flush its own tables in the first place.
--
-- See docs/CURRICULUM_ARCHITECTURE.md.
--
-- THIS MIGRATION BACKFILLS NOTHING. It creates an empty table and adds one
-- nullable column. All 234 active questions keep challenge_id IS NULL, both
-- models coexist, and the dealer still reads the old questions.difficulty.
-- Tagging content to challenges is a later slice and needs the mapping pass
-- that has not happened yet.

BEGIN;

-- ──────────────────────────────────────────────────────────── challenges ──
--
-- DIFFICULTY IS A STORED PROJECTION, NOT A GENERATED COLUMN.
--
-- The rule is difficulty = f(topic.tier, demand.display_order), but a challenge
-- points at a CONCEPT and the tier lives two joins away on topics. A PostgreSQL
-- generated column may reference only columns of its own row, so the rule cannot
-- be expressed as one.
--
-- Storing it does not create a second source of truth. The value is computed
-- from the curriculum by the generator, never authored by hand, and the tests
-- assert every stored value equals difficultyFor(tierOf(concept), demand). A
-- drifted row fails the suite.
--
-- NO TIER COLUMN. Tier is needed only to COMPUTE difficulty, which happens at
-- generation time. Nothing in the runtime reads curriculum tier -- the only
-- `tier` in server code is Reaction's speed bands, which is an unrelated meaning
-- -- and any future reader can join concepts -> topics. A tier column here would
-- be exactly the redundant second source of truth the architecture forbids.
CREATE TABLE challenges (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    concept_id  BIGINT   NOT NULL,
    demand_id   BIGINT   NOT NULL,

    -- What job this challenge does in the loop, and the gate that decides
    -- whether a learner may receive it at all:
    --
    --   introduce  learner_state(concept) = unseen        -- Learn
    --   practise   learner_state(concept) >= introduced   -- Play
    --   reinforce  learner_state(concept) >= introduced   -- Reinforce
    --
    -- Exactly one per challenge, so a column rather than a table. A
    -- reinforcement-only game therefore cannot be anyone's first encounter with
    -- a concept -- not by convention, but because the query cannot return one.
    role        TEXT     NOT NULL,

    difficulty  SMALLINT NOT NULL,

    is_active   BOOLEAN  NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT challenges_role_valid
        CHECK (role IN ('introduce', 'practise', 'reinforce')),

    -- 1-4, matching the curriculum derivation and questions.difficulty.
    -- Deliberately NOT the 1-5 that tick_snippets and bug_hunt_incidents use:
    -- those are each game's private pacing ramp and mean something different.
    -- Three columns have shared this name and never shared a meaning.
    CONSTRAINT challenges_difficulty_range
        CHECK (difficulty BETWEEN 1 AND 4),

    -- THE COMPOSITE FOREIGN KEY, and the reason this table has no separate
    -- concept_id -> concepts and demand_id -> demands references.
    --
    -- The invariant worth enforcing is not "the concept exists" and "the demand
    -- exists" -- it is "this concept DECLARES this demand". A concept lists only
    -- the demands appropriate to it, and a challenge at an undeclared demand is
    -- content that should never have been written: array-map declares no
    -- `explain`, so an explain challenge for it is a mistake, not a gap.
    --
    -- Two single-column FKs could not see that. This one can, because
    -- concept_demands is keyed on exactly this pair -- PRIMARY KEY
    -- (concept_id, demand_id) from migration 020. The invariant becomes
    -- structural instead of a rule tests have to remember.
    --
    -- Referential integrity to concepts and demands comes free: a pair can only
    -- exist in concept_demands if both of its own foreign keys hold.
    --
    -- RESTRICT is deliberate. Removing a demand from a concept that already has
    -- challenges must fail loudly rather than silently deleting playable
    -- content. See the note at the end of this file -- it has a consequence for
    -- the curriculum seed that has to be handled before any challenge exists.
    CONSTRAINT challenges_concept_demand_fk
        FOREIGN KEY (concept_id, demand_id)
        REFERENCES concept_demands (concept_id, demand_id)
        ON DELETE RESTRICT
);

-- Serves the composite FK's own integrity checks, "every challenge for this
-- concept", and "this concept at this demand". concept_id alone is the leftmost
-- prefix, so no separate single-column index is needed.
CREATE INDEX challenges_concept_demand_idx ON challenges (concept_id, demand_id);

-- demand_id is not a prefix of the index above, so it needs its own: "which
-- concepts can be practised at this demand" is the question a game's manifest
-- will ask.
CREATE INDEX challenges_demand_idx ON challenges (demand_id);

-- Dealing reads difficulty across the active set on every new session, the same
-- access pattern questions_difficulty_idx serves today.
CREATE INDEX challenges_dealing_idx ON challenges (difficulty) WHERE is_active;

-- ───────────────────────────────────────────── questions -> challenges ──
--
-- Nullable on purpose, and left null by this migration. Every one of the 234
-- active questions keeps its own id, its own primary key and its own difficulty;
-- nothing that reads them changes. The old and new models coexist until a later
-- slice backfills, which is what keeps this step reversible: dropping the column
-- and the table returns the database exactly to migration 020.
ALTER TABLE questions
    ADD COLUMN challenge_id BIGINT REFERENCES challenges (id) ON DELETE RESTRICT;

-- One challenge is realised by at most one question. Partial, because the 234
-- un-backfilled rows all share NULL and a plain unique index would reject every
-- one of them after the first.
--
-- Not the same as "one question per challenge in every game" -- a Flush snippet
-- may point at the same challenge later, which is the whole point of a shared
-- practice layer. This only stops two QUESTIONS claiming one challenge.
CREATE UNIQUE INDEX questions_challenge_id_idx
    ON questions (challenge_id) WHERE challenge_id IS NOT NULL;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- KNOWN CONSEQUENCE, recorded here rather than discovered later.
--
-- server/seeds/014_curriculum.sql rebuilds the join tables on every run:
--
--     DELETE FROM concept_demands;
--     ... re-insert all 243 rows
--
-- That is safe today, because this migration creates challenges empty. It stops
-- being safe the moment a single challenge row exists: the DELETE will be
-- refused by challenges_concept_demand_fk, and `npm run seed` will fail even
-- when the curriculum has not changed at all.
--
-- The fix belongs to the generator, not to this schema: converge
-- concept_demands by upsert plus targeted delete instead of wholesale rebuild,
-- so an unchanged pair is never deleted and only a genuinely removed one is
-- refused. That refusal is the desired behaviour -- it is what makes removing a
-- demand that has playable content an explicit decision.
--
-- MUST BE DONE BEFORE THE FIRST CHALLENGE ROW IS CREATED.
