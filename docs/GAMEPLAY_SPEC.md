# Gameplay Spec

**What each game is for.** Every game answers the same eleven questions from
`LEARNING_LOOP.md` §10. A game that cannot answer them is not a learning
activity — it is entertainment attached to a curriculum, which is the thing Jolt
is not.

> Companion docs: `GAME_DESIGN.md` holds the *quality bar* (is the mechanic fun?
> are there interesting decisions?). This file holds what each game **is** and
> what it owes the curriculum. A game can pass one and fail the other — two
> currently do (Reaction and Memory). `gameplay-baseline/` holds the captured screenshots these
> judgements were made against.

**Scoreboard: 3 of 5 games are learning activities** (Code Blitz, Bug Hunt and
Flush; updated 2026-10-23 — it read 2 of 5 before Flush joined the curriculum).

---

## Code Blitz 🟢

| | |
|---|---|
| Concepts reinforced | the learner's current concept (server-resolved) |
| Skills | reading code and predicting its output |
| Player actions | read a snippet · choose one of four · beat the clock |
| Learning objective | can you say what this code does, quickly and correctly |
| Mechanic | timed multiple choice, difficulty curve across the round |
| Feedback | immediate: correct/incorrect, the right answer, an explanation |
| Difficulty | `DIFFICULTY_CURVE`, tier 1→4 across 10 beats |
| Evidence | `session_questions.is_correct` |
| Demands satisfied | whatever the tagged challenge declares — mostly `predict`, `recognise`, `explain` |
| Progression impact | clears the rung |
| Round length | 10 × 18s = **3:00** cap |

**Open problems.** The only verb is choosing one of four — this is the one
activity that genuinely is a quiz with a timer (§19). It is **timed from beat
one**, including a beginner's first question, which contradicts §11. Failure
ends at the explanation with no retry (§15).

## Bug Hunt 🟢

| | |
|---|---|
| Concepts reinforced | current concept at hunts 1 and 6 (the boss), others from reached concepts |
| Skills | investigation — reading unfamiliar code and locating a fault |
| Player actions | read a bug report · inspect code · identify the line · choose a patch |
| Learning objective | can you find what is wrong and say how to fix it |
| Mechanic | find-the-line / choose-the-patch, two attempts, system-integrity meter |
| Feedback | per-option explanation naming why that line is or is not the cause |
| Difficulty | `DIFFICULTY_RAMP [1,1,2,3,4,5]` — two untimed openers, then a climb |
| Evidence | `bug_hunt_rounds.status = 'resolved'` |
| Demands satisfied | `diagnose`, `repair` |
| Progression impact | clears the rung |
| Round length | 6 hunts; timed portion capped at **3:00**, openers untimed |

**Strongest of the five.** More interactive than Code Blitz, the only game with
a retry in the loop, and the only one whose opening is deliberately untimed.

**Open problems.** Content is thin — 39 of 64 incidents untagged; `diagnose` has
13 incidents against 40 declared rungs. The integrity meter no longer reaches 0
on a catastrophic run now that a run is six hunts (worst case 4%).

## Flush 🟢

| | |
|---|---|
| Concepts reinforced | each snippet's tagged concept (`flush_snippets.challenge_id`, migration 032; beginner puzzles in seed 083) |
| Skills | predicting printed output *in order* |
| Player actions | read a snippet · call each output in sequence |
| Evidence | a solved round on a snippet the learner can reach writes `activity_completions` for its `predict` rung (`roundTeaching` in `server/src/flush/routes.ts`) |
| Demands | `predict` |
| Progression | clears the same `predict` rung a question would; never calls `/demonstrate` |
| Round length | 5 rounds × (20s + 10s per output) when timed; relaxed (no clock) is the default |

**Connected, as this spec recommended.** Predicting output in order *is* the
`predict` demand, done more rigorously than Code Blitz does it — one wrong call
ends the round, so it rewards actually tracing the program rather than
recognising a shape. Every round explains the order it was looking for
(`flush_snippets.explanation`), whether or not it credits anything. Evidence is
gated by `mayPlayChallenge`, the check Code Blitz and Bug Hunt use, so a
snippet from a concept not yet reached teaches but does not clear a rung. Many
snippets may share one challenge: Flush is a second way to clear a rung that
already exists, not a new rung.

*Before 2026-10-06 this section read 🔴: `flush_snippets` had no
`challenge_id`.*

## Reaction 🔵

| | |
|---|---|
| Concepts reinforced | **none — no content rows at all** |
| Skills | reflexes |
| Evidence / Demands / Progression | **none** |
| Round length | 5 rounds |

**Does not teach JavaScript.** By §10's rule it currently exists only because it
is entertaining. Connecting it means changing what it *is*, not tagging content.

## Memory 🔵

| | |
|---|---|
| Concepts reinforced | **none — no content rows at all** |
| Skills | short-term recall of a symbol sequence |
| Evidence / Demands / Progression | **none** |
| Round length | 5 rounds, 4–8 symbols |

**Same verdict as Reaction.** There is an argument that `recall` is a real
demand and this is a recall game — but it recalls *symbols*, not JavaScript, and
tagging it would be the invented relationship the targeting work exists to
avoid.

---

## The six activity types must stay distinct

| Activity | Verb | Judged | Evidence |
|---|---|---|---|
| World / Play | move, choose where to go | no | — |
| Code Blitz | decide fast | yes | rung |
| Bug Hunt | investigate and repair | yes | rung |
| Experiment | anything | **no** | **none, structurally** |
| Practice | write code with feedback | yes | rung |
| Demonstrate | prove the whole concept | yes | demonstration |

They share infrastructure. They must not become the same question UI.

## Standing constraints

No parallel progression system · no XP changes (`PERFECT_GAME_XP = 125`, derived
per unit so a perfect game pays the same in every game) · no weakening of
evidence · no decorative mechanics · beginner-friendly difficulty · backend
remains the source of truth.

## The open question

Reaction and Memory are the only place where the honest answer may be
**subtraction**. §10 says a game must have a curricular purpose. Two do not, and
inventing one for them would be worse than removing them from the learning path
and letting them be what they are.
