# Jolt — Where we are, and what is left

Written 2026-10-02. Status against `LEARNING_LOOP.md` (the contract).
🟢 built · 🟡 partial · 🔴 missing · 🔵 needs a product decision

---

# PART 1 — Where the project is now

## The learning system is finished

| | |
|---|---|
| Topics / concepts | **16 / 100** |
| Declared rungs realised | **281 / 281** — no holes |
| Active questions | 495 (261 tagged to challenges) |
| Bug Hunt incidents | 64 (25 tagged) |
| Mission-realised rungs | 32 |
| Server tests | **1288** |
| Client tests | **521** |

Typechecks and production builds green on both sides.

## What is genuinely working

- **One curriculum, enforced.** A composite FK refuses a challenge whose demand
  its concept does not declare. A rung cannot be invented by writing content.
- **Server decides what you are learning.** `findCurrentConcept` →
  `findJourneyPath`. No `concept` field exists in any client request body.
- **One evidence model.** `CLEARED_RUNGS_CTE`, three arms, all requiring
  `role='practise'`. Introductions deliberately excluded.
- **Demonstration is gated.** `/demonstrate` 409s unless `evidenceFor()` finds
  every playable rung cleared. No game can call it.
- **One interpreter.** `littleJs` — no `eval`, grammar grown with the
  curriculum, now refuses nothing. Experiment imports no API client at all.
- **Auth persists.** argon2id, session regeneration, verified register → play →
  logout → login → same learner, same evidence.
- **Two games are real learning activities.** Code Blitz and Bug Hunt resolve
  the current concept server-side, reserve beats for it, and clear rungs.
- **Round lengths are on target.** Code Blitz 10 × 18s = 3:00. Bug Hunt 6 hunts,
  timed portion capped at 3:00.
- **The map reflects progress** with per-concept `cleared/playable`.
- **Remediation ladder in the encounter**: feedback naming the misconception →
  a neighbouring question → back to the explanation.

---

# PART 2 — What is left

## A. Three of five games are not learning activities 🔴🔵

| Game | Curriculum predicates | Content | Verdict |
|---|---|---|---|
| Code Blitz | 3 | `questions` | 🟢 |
| Bug Hunt | 3 | `bug_hunt_incidents` | 🟢 |
| Flush | **0** | `flush_snippets`, no `challenge_id` | 🔴 cheap to fix |
| Reaction | **0** | procedural, no content table | 🔵 decision |
| Memory | **0** | procedural, no content table | 🔵 decision |

## B. Nothing adapts 🔴 — the largest gap

`needed_retry` is **written** to `concept_demonstrations` and
`topic_challenge_completions` and **read nowhere**. The codebase says so
outright:

- `eligibility.ts`: *"'met' here means encountered, never understood. No
  thresholds, no success rates, no decay."*
- `frontier.ts`: *"EXPOSURE, NOT MASTERY."*

A learner who struggles through three concepts gets exactly the same next
experience as one who breezed through. Contract §12 and §13 are 0% implemented.

## C. The beginner's first minute contradicts the contract 🔴

Code Blitz times a learner's **first ever question**. Contract §11: *"a timer
should never exist simply because a game traditionally has one."* Bug Hunt
already agrees — `THINKING_MS[1] = null`, its opening hunts have no clock. The
two games disagree with each other.

## D. Targeting is 2 beats of 10 🟡

`FOCUS_SLOTS = [0, 5]`. The other eight are *eligible*, not *targeted* — this is
the mechanism behind "why am I being asked this?"

## E. The world reflects but does not react 🟡

`Planet`, `ConceptObject` and `Ship` all have real per-state renderings, read on
mount. Every animation is ambient. Nothing happens *because* a rung cleared.

## F. Smaller, known

| Item | Status |
|---|---|
| Code Blitz has no in-round remediation | 🟡 |
| Bug Hunt content thin — 39/64 untagged | 🔴 content |
| HUD chrome at 0.6–0.68rem (24 declarations) | 🟡 — primary reading path is fine |
| `this`/classes never browser-tested (needs 95 concepts of progress) | 🟡 |
| Seeds not idempotent — rebuild, don't re-seed | 🔴 backlog |
| `() => console.log(x)` unsupported | 🔴 interpreter |
| Integrity meter floors at 4%, not 0 | 🔵 decision |

---

# PART 3 — The plan

Ordered by vision impact per unit of risk. Each phase is independently
shippable and independently revertible.

## Phase 1 — The beginner's first minute 🔴→🟢
**Fixes §11, §20. Makes the two games agree.**

Opening beats of a Code Blitz round carry no clock, mirroring Bug Hunt.

- **Files:** `server/src/game/scoring.ts`, `game/routes.ts`, `client/.../GamePage.tsx`
- **DB:** none · **XP:** unchanged
- **Open question:** how an untimed beat scores. Bug Hunt already solved this;
  the answer must be read from there, not invented.
- **Acceptance:** a fresh learner's opening beats show no timer; the clock
  appears from the ramp's timed portion; XP for a perfect game still 125.

## Phase 2 — Widen concept targeting 🟡→🟢
**Fixes §2, §18, Problem 1 and Problem 5.**

`FOCUS_SLOTS` becomes a count derived from how much tagged content the current
concept actually has, capped so a round never becomes a single-concept quiz.

- **Files:** `game/curve.ts`, `game/queries.ts`
- **DB:** none
- **Acceptance:** with N tagged questions available, up to K beats are the
  current concept; at least one beat is not; both asserted.

## Phase 3 — Adaptation 🔴→🟢
**Fixes §12, §13. The largest gap.**

`learnerStance(userId, concept)` → `struggling | developing | confident`,
**derived** from rows that already exist. Drives: whether the timer applies,
whether the repair is offered sooner, which difficulty is preferred.

- **Files:** `server/src/curriculum/`, `game/routes.ts`, `bugHunt/routes.ts`
- **DB:** **none** — deliberately derived, matching the recorded decision to
  reject `learner_concept_state` (see `CURRICULUM_ARCHITECTURE.md`)
- **Needs sign-off:** the thresholds, and whether adaptation is within-session
  only or across sessions.

## Phase 4 — Flush joins the curriculum 🔴→🟢
2 of 5 games becomes 3 of 5, honestly: predicting output *in order* genuinely is
the `predict` demand.

- **DB:** one additive column `flush_snippets.challenge_id` + a tagging seed
- **Acceptance:** Flush deals only eligible snippets; a cleared round clears a
  `predict` rung; untagged snippets stay playable and uncredited.

## Phase 5 — The world reacts 🟡→🟢
An acknowledgement when a rung clears — arrival, not ambience. Data already
exists; this is design, not plumbing.

## Phase 6 — HUD density 🟡→🟢
Evidence-led, narrow: the primary reading path (`.ask` 1.35rem, `.prompt`
1.02rem) is fine. The audit is of chrome, not a redesign.

---

# Decisions needed before Phase 3 and 4

1. **Reaction and Memory** — connect them, or remove them from the learning path
   and let them be what they are? Inventing curriculum content for a reflex game
   is the invented relationship §10 forbids.
2. **Adaptation scope** — within a session, or across sessions?
3. **Integrity meter** — raise `INTEGRITY_FAILED_COST` so a catastrophic run
   reaches 0 again, or accept 4%?

# Not to be changed

XP constants · `CLEARED_RUNGS_CTE` · `evidenceFor()` gating · `roleEligible`
ordering · the interpreter's progressive allowlist · Experiment's no-API
guarantee · derive-don't-store.
