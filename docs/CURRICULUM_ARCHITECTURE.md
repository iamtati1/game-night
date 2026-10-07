# Jolt Curriculum Architecture

The curriculum belongs to Jolt, not to Code Blitz. One JavaScript syllabus
defines what a learner is learning; the five games are different ways of
practising it. Adding a sixth game must not require a sixth curriculum.

This document records the architecture the implementation is building toward.
It is the reference the `Phase N` comments in `client/src/games/curriculum.ts`
and `server/scripts/generate-curriculum.ts` point at.

---

## The layers

```
        client/src/games/curriculum.ts        authored, human-editable
                     │
                     │  npm run curriculum:generate
                     ▼
        server/seeds/014_curriculum.sql       generated, committed
                     │
                     │  npm run seed
                     ▼
┌────────────────────────────────────────────────────────────┐
│  CURRICULUM  (PostgreSQL — the runtime source of truth)     │
│                                                             │
│    topics ──< concepts ──< prerequisites (DAG)              │
│                  │                                          │
│                  └──< concept_demands >── demands           │
└────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────────┐
│  CHALLENGES  (shared practice layer — not yet built)        │
│    concept · demand · role · difficulty (stored projection) │
└────────────────────────────────────────────────────────────┘
                     ▲
        ┌────────────┼────────────┬─────────────┬────────────┐
        │            │            │             │            │
   questions    tick_snippets  bug_hunt_    reaction_    memory_
        │            │          incidents     prompts      pairs
        │            │            │          (not built)  (not built)
   + question_  + tick_       + bug_hunt_
      options      outputs       options

   Each content row carries a nullable challenge_id. CONTENT POINTS AT
   THE CHALLENGE -- the arrows run upward, not down.
```

Each layer knows only the one above it. The curriculum names no game; a game
names no concept.

### Future — specified, not built

```
        learner_concept_state      user · concept · state · strength
                  │
        learner_demand_progress    user · concept · demand · attempts · correct
                  │
                  ▼
        Mastery / Skill Map        a reader; nothing depends on it
```

---

## Authoring in TypeScript, enforcement in PostgreSQL

A syllabus is a set of design decisions that should be reviewable in a pull
request, not reconstructed from `INSERT` statements. So it is **authored** in
`client/src/games/curriculum.ts`.

But a TypeScript constant cannot refuse a challenge tagged to a concept that
does not exist — a foreign key can. So it is **enforced** in PostgreSQL, and the
runtime reads it from there. The server never imports the client's source.

The bridge is a generated seed:

| | |
| --- | --- |
| Generator | `server/scripts/generate-curriculum.ts` (`npm run curriculum:generate`) |
| Output | `server/seeds/014_curriculum.sql`, committed |
| Applied by | the existing `npm run seed`, unchanged |
| Drift caught by | `server/scripts/generateCurriculum.test.ts` — regenerates and compares |

**Why a seed rather than a migration.** The migration runner keeps a ledger with
sha256 checksums, so editing an applied migration is an error. The curriculum is
expected to change. Seeds have no ledger and are required to converge on re-run,
which is exactly the semantics regenerated output needs.

**Why the generator lives in `server/scripts/`.** `server/tsconfig.json` sets
`rootDir: "src"` and `include: ["src"]`, so `scripts/` sits outside the typecheck
program and can import across the package boundary without pulling client code
into `tsc`. `curriculum.ts` has no imports of its own, so nothing else follows it
across.

---

## The three axes that must never be conflated

| Axis | Belongs to | Values |
| --- | --- | --- |
| **Tier** | the concept's topic | beginner · intermediate · advanced |
| **Demand** | the challenge | recall · recognise · predict · produce · diagnose · repair · explain |
| **Learner state** | the person | unseen · introduced · practising · proficient · mastered |

Tier and demand describe content and are identical for every learner. Learner
state describes a person and moves both ways. A learner being "intermediate"
never implies they have mastered every intermediate concept.

*Stage* and *state* are one letter apart and mean opposite things. The code says
`demand` and `learner_state`, never `level` or `progress`.

---

## Difficulty is derived, never authored

```
difficulty = f(topic.tier, demand.order)

               recall recognise predict │ produce diagnose repair explain
  beginner        1       1        1    │    2       2       2      2
  intermediate    2       2        2    │    3       3       3      3
  advanced        3       3        3    │    4       4       4      4
```

Because a concept declares only the demands appropriate to it, its reachable
difficulty is **capped by its deepest declared demand**. A beginner concept that
stops at `produce` can never generate a tier-3 challenge — not by discipline,
but because the row cannot exist.

This is the structural fix for a question bank that drifted advanced-heavy: when
every question carried a hand-assigned 1–4, nothing constrained the number.

`difficultyFor(tier, demand)` in `curriculum.ts` is the reference implementation.
`challenges.difficulty` stores the same value — deliberately a **stored
projection**, not a PostgreSQL `GENERATED` column, because the tier lives two
joins away on `topics` and a generated column may reference only its own row.

Storing it does not create a second source of truth: the value is computed by the
generator from the curriculum, and the tests assert the stored value equals the
curriculum-derived one. Nobody authors it by hand, and a drifted value fails the
suite.

### Difficulty must never drive progression

Selection is two steps, and difficulty appears only in the second:

```
STEP 1 — ELIGIBILITY   which concepts may this learner receive?
  inputs: prerequisites · learner state · role gate · concept_demands
  difficulty: NOT REFERENCED

STEP 2 — PACING        in what order, within the session?
  inputs: the eligible set · the difficulty curve
```

Difficulty can reorder within the eligible set. It can never admit or exclude.

---

## No nullable mega-table

Different games genuinely need different content shapes. A Flush snippet with
ordered outputs is not a four-option question, and migration 008 documents why
forcing them together failed.

The rule: **a column lives in `challenges` only if it is non-null for every
game.** Everything else is game content, in that game's own table.

### A challenge is a pedagogical record. It does not own content.

Content tables carry a nullable `challenge_id`; `challenges` carries no
per-game column. The direction is forced twice over:

**By the existing schema.** Six foreign keys already reference content by its own
id, all `ON DELETE RESTRICT` — `session_questions.question_id → questions`,
`flush_rounds.snippet_id → tick_snippets` (twice),
`bug_hunt_rounds.incident_id → bug_hunt_incidents` (twice). If a challenge owned
its content — if `questions` were re-keyed on `challenge_id` — every one of those
and every query joining them would have to change, to gain nothing that a
nullable column does not already give.

**By this section's own rule.** A challenge pointing down at content would need
`question_id`, `snippet_id`, `incident_id` — nullable, one per game. That is
exactly the mega-table forbidden above.

So: questions connect to the curriculum **through `challenges`**, never by
carrying their own `concept` or `demand` column — but they keep their own
identity and their own primary key. A per-game curriculum tag would recreate the
fragmentation this architecture exists to remove, the mistake
`bug_hunt_incidents.bug_category` already made.

Availability is a fact rather than a prediction: a game serves a challenge *iff a
row in that game's content table points at it*. A game's manifest declares what
it **could** render; the content table records what it **can**. The gap between
them is the authoring backlog, and it is queryable.

**Database presence is not gameplay eligibility.** A content row may point at a
challenge and still never be dealt, because each game applies its own selection
predicate on top. Code Blitz's `ELIGIBLE_QUESTION_PREDICATE` currently excludes
all three `complete-code` questions — they carry two `is_correct` options and it
demands exactly one. Tests that link content to challenges must assert against
the real predicate, or they will prove a relationship the game can never use.

---

## Tables

### Built now — the curriculum foundation

| Table | Holds |
| --- | --- |
| `demands` | the seven, ordered. `slug`, `display_order`, `asks` |
| `topics` | `slug`, `name`, `tier`, `display_order`, `rationale` |
| `concepts` | `slug`, `topic_id`, `name`, `objective`, `meaning`, `why`, `weight`, `display_order` |
| `prerequisites` | `concept_id` → `requires_id`, a DAG between **concepts**, not topics |
| `concept_demands` | which demands each concept declares — also its difficulty cap |

### Next — the shared practice layer

`challenges` (`concept_id`, `demand_id`, `role`, stored `difficulty`), then each
game's existing content table gains a **nullable `challenge_id`** and is
backfilled — Code Blitz first. No content table is re-keyed and no primary key
changes, so both models coexist and the step stays reversible.

`difficulty` is a **stored projection** of `f(topic.tier, demand.display_order)`,
not a PostgreSQL `GENERATED` column: the tier lives two joins away on `topics`,
and a generated column may only reference its own row. The generator computes it
and the tests assert the stored value matches the curriculum-derived one, so
there is still exactly one source of truth.

`challenges` carries **no `tier` column**. Tier is needed only to compute
difficulty, which happens at generation time; no runtime query reads curriculum
tier, and any future one can join `concepts → topics`.

### Later — learner progress

`learner_concept_state` (coarse, read on every deal) and
`learner_demand_progress` (per-demand counts, for the Skill Map). Two tables
rather than one so the hot path stays narrow.

The only requirement this places on today's work: **every unit a learner resolves
must be attributable to a concept and a demand.** The `challenges` supertype
delivers that; without it, progress needs a per-game backfill that may not be
reconstructable.

---

## Instructional role

A challenge carries a role as well as a demand, and the role gates who may
receive it:

```
role = introduce  →  learner_state(concept) = unseen
role = practise   →  learner_state(concept) ≥ introduced
role = reinforce  →  learner_state(concept) ≥ introduced
```

This is what lets Reaction and Memory participate as reinforcement without ever
becoming a learner's first exposure to a concept — not by convention, but
because the query cannot return one.

A Learn Beat is a challenge with role `introduce`. It is not a separate entity.

---

## Out of scope, permanently

XP formulas, session and scoring mechanics, the Game Floor, auth, deployment,
and the existing dealer's pacing curve. Curriculum progression and XP are
separate concerns; the two systems only ever read the same session results.

---

# Reconciliation — 2026-10-02

This document was written before the challenge layer existed and describes what
the implementation was *building toward*. Most of it came true. Three claims
above are now stale, and one was deliberately **not** followed.

## Now built

**The CHALLENGES layer** — marked "not yet built" in the diagram — exists
(`migrations/021_create_challenges.sql`). Content points upward at it exactly as
drawn: `questions.challenge_id`, `bug_hunt_incidents.challenge_id`, and a third
route the diagram did not anticipate — `challenges.activity = 'mission'`, for a
rung realised by a written movement that lives in the client and has no content
row at all (`migrations/030`).

**Coverage:** 16 topics · 100 concepts · 281 declared rungs · **281 realised**.

**The role gate** works as specified: `roleEligible` withholds `practise`
content until its concept has been encountered, which is what makes
Learn-before-Practise an enforced order rather than a convention.

## Deliberately not followed

> ### Future — specified, not built
> `learner_concept_state`, `learner_demand_progress`, Mastery / Skill Map

**This was rejected, on purpose.** `curriculum/eligibility.ts` states the
reasoning: the evidence already exists durably in the round tables, which keep a
foreign key to the content played and never lose a row. A stored state table
would be a second source of truth that can silently disagree with the sessions
it came from, and would have to be backfilled from exactly the derivation that
replaces it.

So learner state is **derived, never stored**: `metConceptsCte` for
reachability, `CLEARED_RUNGS_CTE` for rung evidence. Promote to a materialised
table when profiling asks, or when state must carry something the query cannot
derive — decay, a manual placement, an instructor override. Not before.

The one exception is `introduction_completions`, and it earns it: acknowledging
a Learn Beat is the single fact gameplay cannot produce, because a beat is not
dealt, not scored and has no round row to read.

## Still accurate, still unbuilt

Reaction and Memory have no content tables, so they still cannot participate as
reinforcement. The paragraph above about the role gate letting them do so
describes a capability that is ready for them and that they do not yet use. See
`GAMEPLAY_SPEC.md` — by the gameplay bar, whether they should is an open product
question rather than a scheduling one.

## Still true, and worth re-stating

Authoring in TypeScript, enforcement in PostgreSQL, bridged by a generated seed.
The server still never imports the client's source. Curriculum progression and
XP remain separate concerns that only ever read the same session results.
