# Jolt Learning Loop

**The technical contract for how Jolt teaches.** Each section states the rule,
then binds it to the code, tables and games that implement it, with an honest
status: 🟢 built · 🟡 partial · 🔴 missing.

## Purpose

Jolt is a game-based JavaScript learning world where learners build programming
skill by interacting with concepts, writing and running code, playing games,
debugging, practising, and demonstrating required skill before progressing.

Jolt should not feel like a quiz app with games attached. The learner should
feel like they are moving through a world while actively learning to program.

---

## 1. The core loop

```
World → Introduce → Interact → Learn → Write Code → Run Code
      → Play → Practice → Debug/Repair → Demonstrate → Unlock → Next Concept
```

Not every concept needs every step weighted equally. But the learner should
always be able to answer: *what am I learning, why, what can I do with it, can I
try it, write it, run it, use it in gameplay, fix mistakes, demonstrate it — and
what does finishing unlock?*

## 2. The concept learning contract

Every concept defines: name · objective · prerequisites · introduction ·
explanation · interactive example · practice · coding activity · game
relationship · required demands · evidence · remediation · demonstration ·
unlock condition.

> **Concepts must not receive random questions from a global pool.** Content
> shown to the learner must be intentionally connected to the concept being
> learned.

**Implementation** 🟢 — `concepts`, `concept_demands`, `prerequisites`,
`challenges`. The composite FK refuses a challenge whose demand its concept does
not declare, so a rung cannot be invented by writing content for it.

**Status on the pool rule** 🟡 — Code Blitz reserves beats 1 and 6 for the
current concept (`FOCUS_SLOTS`) and the rest of the round still draws from the
eligible pool. That is deliberate (a run must not be a single-concept quiz), but
it means 8 of 10 beats are *eligible*, not *targeted*.

See `CONCEPT_CONTRACT_assignment.md` — one concept mapped end to end, the model
for the rest.

## 3. Learning objective

Each concept carries a learner-facing objective completing *"I know how to ___"*,
and a one-line `meaning`. Demands come from the curriculum definition, never
invented per activity.

**Implementation** 🟢 — `concepts.objective`, `concepts.meaning`. Example:
`assignment` → *"work out what gets stored when the right-hand side is an
expression"*.

## 4. Introduction

Answers *"what am I learning and why does it matter?"* Short and interactive, not
a wall of text. The learner meets the concept inside Jolt's world before being
asked to demonstrate anything.

**Implementation** 🟢 — `challenges.role = 'introduce'`, acknowledged via
`POST /api/curriculum/introductions/:id/complete` → `introduction_completions`.
`roleEligible` withholds `practise` content until this has happened, so
Learn-before-Practise is enforced by the query, not by convention.

**Status** 🟡 — inside Code Blitz the introduction is a full-screen card
("First up · <concept>") between Start and play. It earns its place
architecturally; it is still a lesson screen inside a game.

## 5. Explanation

The smallest amount of information needed to begin interacting. The interface
should visually emphasise the relationship between the pieces of a line.

**Implementation** 🟢 — `TeachBlock.parts` in `client/src/games/lessons.ts`
names each piece: `let` · the name · `=` · the value. That exists because a
beginner shown `console.log("Hello")` is looking at four unfamiliar things at
once and cannot be asked about any of them until someone says which is which.

## 6. Interactive example

Read it → change it → run it → see the result → understand what changed.

**Implementation** 🟢 — `/experiment` (`PlaygroundPage`) runs any snippet with
no grading and no recording; `MissionScene` runs graded ones. Both share
`CodeStage` and one interpreter.

## 7. Writing code

The coding task corresponds directly to the concept. Jolt runs the code and
evaluates the result.

**Implementation** 🟢 — `produce`/`apply` rungs realised by **movements**
(`challenges.activity = 'mission'`), authored in `client/src/games/practice.ts`
and `missions.ts`, addressed by `(concept, demand)`. Judged on the **structure**
of what was written as well as its output, so printing the right answer the
wrong way does not pass.

**Coding UI requirements** — readable code · comfortable font size · clear
syntax hierarchy · instructions visible while coding · no competing information ·
**no timer during initial learning** · errors that explain rather than mark wrong.

**Status** 🟡 — missions are untimed and explain errors in plain language
(`littleJs` writes beginner-facing messages, never raw `SyntaxError`). Font size
and visual hierarchy in the editor have not been audited against this list.

## 8. Running code

Safe, controlled execution. The interpreter supports JavaScript **progressively,
as concepts are taught** — not all of JavaScript at once.

**Implementation** 🟢 — `client/src/games/littleJs.ts`. Hand-written tokenizer
and recursive-descent interpreter; no `eval`, no `Function`. The grammar grew as
the curriculum reached each construct. With `this` and classes built it now
refuses nothing, and a construct outside the allowlist is still named in plain
words rather than crashing.

## 9. Practice

Jolt must be able to answer *"why is this question being shown right now?"* —
from the current concept, the current demand, the learner's evidence, and their
progression state.

**Implementation** 🟢 for the encounter (`/concept/:slug` serves exactly that
concept's rungs). 🟡 for Code Blitz, per §2.

## 10. Games

Games are part of the learning system, not entertainment attached to it. Every
game defines: concepts reinforced · skills · player actions · learning objective ·
mechanic · feedback · difficulty · evidence · demands satisfied · progression
impact · expected round length.

**Status** 🟡 — **3 of 5 games** meet this (Code Blitz, Bug Hunt, Flush;
updated 2026-10-23). See `GAMEPLAY_SPEC.md`.

## 11. Game difficulty

Learning before speed. A beginner is not punished by mechanics they have not
learned. **A timer must never exist simply because a game traditionally has
one** — the test is *does the timer help practise this skill?*

**Implementation** 🟡 — Bug Hunt's opening hunts are genuinely **untimed**
(`THINKING_MS[1] = null`), on the stated grounds that a countdown sitting at 90
seconds still tells a learner they are being measured. Code Blitz now agrees:
its first two beats are untimed (`UNTIMED_OPENING_BEATS`), and relaxed (no
clock) is the default pace for the curriculum games (updated 2026-10-23).

## 12. Debugging and repair

The learner encounters realistic mistakes, investigates, and repairs. Produces
evidence about what they can diagnose or repair.

**Implementation** 🟢 — Bug Hunt. `diagnose` = find the line; `repair` = choose
the patch. `bug_hunt_rounds.status = 'resolved'` clears the rung. 25 of 64
incidents are tagged; repair coverage spans 12 concepts.

## 13. Evidence

A correct answer alone does not mean the skill is demonstrated. **The backend
and database are the source of truth. Frontend for experience, backend for
truth.**

**Implementation** 🟢 — `CLEARED_RUNGS_CTE`, three arms, all requiring
`challenges.role = 'practise'`:

| Source | Condition | From |
|---|---|---|
| `session_questions` | `is_correct` | Code Blitz |
| `bug_hunt_rounds` | `status='resolved'` | Bug Hunt |
| `activity_completions` | row exists | encounter, missions |

`introduction_completions` is deliberately outside this set: it feeds
eligibility only. Watching a beat is not evidence of skill.

## 14. Demands

Eight: `recall · recognise · predict · apply · produce · diagnose · repair ·
explain`. A concept declares only the ones it can honestly be practised at.

**Implementation** 🟢 — `demands`, `concept_demands`. **281 rungs declared, 281
realised.**

## 15. Remediation

A struggling learner gets a path forward, not a stop: hints · another example ·
re-read · a simpler or different question · retry · repair · more practice.

**Implementation** 🟡 — every lesson step carries an authored `retry` (a
*different but neighbouring* question, because repeating the same one rewards
guessing), and every wrong option carries feedback naming the misconception.
**Inside a Code Blitz round there is no retry** — one answer, an explanation,
next. Bug Hunt gives two attempts.

## 16. Demonstration

The progression checkpoint, reached after the evidence requirements are
satisfied. It should require *using* the concept rather than recognising an
answer. Recording it updates progression and may make the next concept
available.

> A demonstration represents completion of the defined requirements. It is not a
> claim of perfect understanding.

**Implementation** 🟢 — `POST /api/curriculum/concepts/:slug/demonstrate`,
gated by `evidenceFor()`: 409 unless every *playable* rung is cleared. The
client cannot assert completion and **no game calls this endpoint**.

## 17. Unlocking

The backend decides, evaluating evidence, required demands, prerequisites,
demonstrations and progression state. The client never independently unlocks.

**Implementation** 🟢 — `CONCEPT_STATE_SQL` is the single reachability
authority (demonstrated / current / locked, including topic-checkpoint gating).

## 18. Concept-to-game alignment

Every game shown during a learning path has an intentional relationship to the
current concept. **The learner should never wonder "why am I playing this?"**

**Implementation** 🟡 — the current concept is resolved by
`findCurrentConcept()` (reading `findJourneyPath()`), passed server-side into
both dealers, and reserved into Code Blitz beats chosen by `focusSlots()`
(`server/src/game/curve.ts`; a count derived from the concept's tagged
content, still [0, 5] for two beats of ten) and `FOCUS_HUNTS [0,5]` in Bug Hunt.
Reserved beats are labelled *"What you are learning · <concept>"*; the results
screen names the rungs the round earned and links straight back to the concept.

🔴 for Reaction and Memory — see `GAMEPLAY_SPEC.md`. (Flush was 🔴 until it
joined the curriculum; updated 2026-10-23.)

## 19. Gameplay requirements

~2–3 minutes per round. Meaningful actions: movement · collecting · interacting ·
decisions · problem solving · writing code · feedback · objectives.

> The game should not simply replace a multiple-choice question with animation.

**Status** 🟡 — Code Blitz 10 × 18s = 3 min; Bug Hunt 6 hunts, timed portion
capped at 3 min. Both are on time. **Code Blitz's only verb is still "pick one
of four."**

## 20. Beginner experience

Readable code · clear instructions · predictable controls · low cognitive load ·
immediate feedback · enough time to think · visible progress · meaningful
rewards. The learner understands what is being asked before being asked to do it
quickly.

**Status** 🟡 — difficulty and content were audited for this (no untaught
prerequisites, no trick questions, answer shapes de-tells). The timer on a
beginner's first question, once the open conflict with §11, is resolved: Code
Blitz's first two beats are untimed (`UNTIMED_OPENING_BEATS` in
`server/src/game/scoring.ts`), the clock drops after two misses in a row, and
the curriculum games now start relaxed, with the clock as an opt-in choice
(updated 2026-10-23). What keeps this 🟡 is in `ROADMAP.md`.

## 21. Product principle

Optimise for **Learning + Agency + Forward Momentum**, not Speed + Difficulty +
Volume. A learner who needs another attempt has a clear path; one who succeeds
knows why; one who is stuck knows what to try next.

## 22. Technical architecture

| System | Responsibility |
|---|---|
| Frontend | the learning and gameplay experience |
| Backend | determines progression, validates actions |
| Database | curriculum, prerequisites, evidence, progress, demonstrations |
| Interpreter | safely executes supported JavaScript |
| Games | create interactive learning evidence |
| Curriculum | defines what must be learned |

These must agree on the same concept and progression state. They do, because
there is exactly one resolver (`findCurrentConcept`) and one evidence derivation
(`CLEARED_RUNGS_CTE`).

## 23. Implementation rule

Before building any curriculum feature, game or progression mechanic, answer:
what concept · what must be learned · what demand · what action · what evidence ·
how it affects progression · what happens on struggle · what it unlocks.

**If these cannot be answered, the feature is not ready to be implemented.**

## 24. Build strategy

Do not rebuild all 100 concepts. Build **one complete concept experience**, make
it feel right, then use it as the template.

**Reference concept: `assignment`** — see `CONCEPT_CONTRACT_assignment.md`.

## 25. Definition of done

A concept is not complete because questions exist, a lesson exists, a game
exists, a row exists, or the page loads.

> A concept is complete when the learner can move coherently from *"I don't know
> this yet"* to *"I can use this skill and demonstrate the required ability."*
