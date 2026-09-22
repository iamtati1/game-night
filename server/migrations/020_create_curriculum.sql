-- The curriculum foundation: what Jolt teaches, in what order, and why.
--
-- Five tables and nothing else. They hold the syllabus that every game will
-- eventually practise through -- topics, the concepts under them, the
-- prerequisite graph between concepts, the seven cognitive demands, and which
-- demands each concept declares.
--
-- WHY THESE TABLES EXIST AT ALL, given the curriculum is authored in TypeScript.
-- A TypeScript constant cannot refuse a challenge tagged to a concept that does
-- not exist; a foreign key can. The syllabus is authored in
-- client/src/games/curriculum.ts because it should be reviewable in a pull
-- request, and projected here because this is where it can be enforced and where
-- the server can read it. The server never imports the client's source.
--
-- The projection is generated, not hand-written:
--   npm run curriculum:generate  ->  server/seeds/014_curriculum.sql
-- See docs/CURRICULUM_ARCHITECTURE.md.
--
-- ADDITIVE AND REVERSIBLE. Nothing here touches an existing table. No existing
-- row changes. Dropping these five tables returns the database to exactly its
-- previous state, because nothing references them yet -- `challenges` and the
-- questions backfill are deliberately NOT part of this migration.
--
-- WHAT IS NOT HERE, ON PURPOSE:
--
--   challenges          the shared practice layer. It needs concepts and demands
--                       to point at, which is what this migration creates, so it
--                       is the next step rather than part of this one. Keeping it
--                       separate is what makes this migration reversible: once
--                       content tables carry a challenge_id, rollback stops being
--                       a DROP.
--
--   questions.concept   deliberately never. Questions reach the curriculum
--   questions.demand    through challenges, so that a Flush snippet and a Bug
--                       Hunt incident can carry the same tags. A per-game column
--                       would rebuild the fragmentation this exists to remove --
--                       the mistake bug_hunt_incidents.bug_category already made.
--
--   topic prerequisites the curriculum authors these, but the architecture puts
--                       the DAG between CONCEPTS: array-map requires
--                       callback-functions and array-access, which live in
--                       different topics, and a topic-level graph cannot express
--                       that. Topic order is carried by display_order instead.
--
--   learner state       needs challenges first. Every resolved unit has to be
--                       attributable to a concept before progress can be stored.

BEGIN;

-- ─────────────────────────────────────────────────────────────── demands ──
--
-- The seven cognitive demands, in order of what they ask of a learner. A table
-- rather than a CHECK constraint because concepts join against it, and because
-- adding a rung should be a row rather than a schema change.
--
-- display_order is unique as well as not-null: the ladder's whole meaning is
-- that `produce` is deeper than `recognise`, and two rungs sharing a position
-- would make "deeper than" undefined. difficulty is derived from this ordering.
CREATE TABLE demands (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug          TEXT    NOT NULL,
    display_order INTEGER NOT NULL,
    -- What this asks of the learner, independent of subject matter.
    asks          TEXT    NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT demands_slug_format CHECK (slug ~ '^[a-z][a-z0-9-]*$'),
    CONSTRAINT demands_order_positive CHECK (display_order >= 1)
);

CREATE UNIQUE INDEX demands_slug_idx ON demands (slug);
CREATE UNIQUE INDEX demands_display_order_idx ON demands (display_order);

-- ──────────────────────────────────────────────────────────────── topics ──
--
-- Syllabus chapters. A topic carries the TIER, which is a property of the
-- subject and identical for every learner -- never a property of a person, and
-- never confused with how far a given learner has got.
CREATE TABLE topics (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug          TEXT    NOT NULL,
    name          TEXT    NOT NULL,
    tier          TEXT    NOT NULL,
    display_order INTEGER NOT NULL,
    -- Why this topic sits here in the syllabus.
    rationale     TEXT    NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT topics_slug_format CHECK (slug ~ '^[a-z][a-z0-9-]*$'),
    CONSTRAINT topics_tier_valid
        CHECK (tier IN ('beginner', 'intermediate', 'advanced')),
    CONSTRAINT topics_order_positive CHECK (display_order >= 1)
);

CREATE UNIQUE INDEX topics_slug_idx ON topics (slug);
CREATE UNIQUE INDEX topics_display_order_idx ON topics (display_order);

-- ────────────────────────────────────────────────────────────── concepts ──
--
-- The atomic teachable skill, and the tag point for everything that follows.
--
-- GRANULARITY RULE, enforced by review rather than by SQL: a concept must
-- complete "I know how to ___". `transforming with map()` passes; `the arity of
-- the map callback` does not. objective holds that completion.
--
-- meaning serves twice over -- it is the rule line a Learn Beat prints under its
-- worked example, and the right-hand face of a Memory pair -- so it is authored
-- once here and never written twice.
CREATE TABLE concepts (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    topic_id      BIGINT  NOT NULL REFERENCES topics (id) ON DELETE RESTRICT,
    slug          TEXT    NOT NULL,
    name          TEXT    NOT NULL,
    -- Completes "I know how to ___".
    objective     TEXT    NOT NULL,
    -- The one-line definition.
    meaning       TEXT    NOT NULL,
    -- Why this skill is in the syllabus at all.
    why           TEXT    NOT NULL,
    -- How much of the curriculum rests on it, which drives how much practice it
    -- earns once challenges exist.
    weight        TEXT    NOT NULL,
    display_order INTEGER NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT concepts_slug_format CHECK (slug ~ '^[a-z][a-z0-9-]*$'),
    CONSTRAINT concepts_weight_valid
        CHECK (weight IN ('light', 'core', 'load-bearing')),
    CONSTRAINT concepts_order_positive CHECK (display_order >= 1)
);

-- Slugs are unique across the whole curriculum, not per topic: a challenge will
-- reference a concept by slug alone, and `map` must mean one thing.
CREATE UNIQUE INDEX concepts_slug_idx ON concepts (slug);

-- Ordering is per topic, so two topics may both have a first concept.
CREATE UNIQUE INDEX concepts_topic_order_idx ON concepts (topic_id, display_order);

-- Serves "every concept in this topic", which the Skill Map and the projection
-- test both ask on every read.
CREATE INDEX concepts_topic_idx ON concepts (topic_id);

-- ───────────────────────────────────────────────────────── prerequisites ──
--
-- A directed acyclic graph BETWEEN CONCEPTS, not between topics. array-map
-- requires callback-functions and array-access, which sit in different topics --
-- a topic-level graph could not express that and would force false ordering.
--
-- ACYCLICITY IS NOT ENFORCED HERE. A cycle is a property of the whole graph
-- rather than of any one row, so no CHECK or unique index can see it. Postgres
-- could express it with a recursive trigger, at the cost of running a traversal
-- on every insert for a table written only by a generated seed. The curriculum
-- tests assert it instead, in two places: against the authored source, and
-- against the projected rows.
CREATE TABLE prerequisites (
    concept_id  BIGINT NOT NULL REFERENCES concepts (id) ON DELETE CASCADE,
    requires_id BIGINT NOT NULL REFERENCES concepts (id) ON DELETE RESTRICT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (concept_id, requires_id),

    -- The one cycle SQL can see: a concept requiring itself.
    CONSTRAINT prerequisites_not_self CHECK (concept_id <> requires_id)
);

-- The PRIMARY KEY already serves "what does this concept need". This serves the
-- other direction -- "what depends on this" -- which is how a Skill Map decides
-- what a newly mastered concept unlocks.
CREATE INDEX prerequisites_requires_idx ON prerequisites (requires_id);

-- ─────────────────────────────────────────────────────── concept_demands ──
--
-- Which demands each concept can meaningfully be practised at. NEVER all seven
-- by default: a concept that affords no honest `explain` question does not list
-- it, and the Skill Map will not then show an unfilled cell and call it a gap.
--
-- This is also the CAP on a concept's reachable difficulty. Difficulty is
-- derived from (topic.tier, demand.display_order), so a beginner concept whose
-- deepest declared demand is `produce` can never produce a tier-3 challenge --
-- not by discipline, but because the row cannot exist.
CREATE TABLE concept_demands (
    concept_id BIGINT NOT NULL REFERENCES concepts (id) ON DELETE CASCADE,
    demand_id  BIGINT NOT NULL REFERENCES demands (id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (concept_id, demand_id)
);

-- "Which concepts can be practised at this demand" -- the question a game's
-- manifest will ask once challenges exist.
CREATE INDEX concept_demands_demand_idx ON concept_demands (demand_id);

COMMIT;
