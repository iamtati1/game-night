# Jolt — Product Vision

> Reconciled against the implementation on 2026-10-02. Every claim below is
> either **built** (with the file that builds it) or marked as **not yet**.
> Nothing here describes architecture that does not exist.

## What Jolt is

A game-based JavaScript learning world. A learner learns by interacting with
code, writing and running it, playing, debugging, practising, and demonstrating
— and progression is earned through **evidence**, never through one correct
answer.

## What Jolt is not

- Not an LMS with game elements attached.
- Not a quiz app with game styling.
- Not a course and a game arcade that happen to share a login.

## The five things that make it one product

### 1. One curriculum, one source of truth

100 concepts across 16 topics, each declaring the **demands** (rungs) it can be
practised at. 281 rungs declared; **281 realised** by a question, a Bug Hunt
incident or a written movement. There is no second curriculum anywhere — not in
the client, not per game.

*Built:* `server/migrations/020_create_curriculum.sql`, `seeds/014_curriculum.sql`.

### 2. One evidence model

Progress is derived, never stored twice. `CLEARED_RUNGS_CTE` has three arms —
Code Blitz answers (`session_questions.is_correct`), Bug Hunt resolutions
(`bug_hunt_rounds.status = 'resolved'`), and `activity_completions` — and all
three require `challenges.role = 'practise'`.

*Built:* `server/src/curriculum/encounter.ts`.

### 3. The server decides what you are learning

`findCurrentConcept()` reads `findJourneyPath()`, the same authority the map and
home page use. No client may name the concept: there is deliberately no
`concept` field in the start-session body, because a client that could name it
could aim a run at whichever rung it wanted to clear.

*Built:* `server/src/curriculum/lessons.ts`, `server/src/sessions/schemas.ts`.

### 4. Playing is real evidence; playing is not mastery

A correct answer on a tagged practice challenge clears a rung. Clearing every
playable rung is what lets a concept be **demonstrated**, and `/demonstrate` is
gated server-side by `evidenceFor()`. No game calls it.

*Built:* `server/src/curriculum/routes.ts`.

### 5. One sandbox

`littleJs` is a hand-written tokenizer and interpreter — no `eval`, no
`Function`. The grammar grew as the curriculum reached each construct, and with
`this` and classes built it now refuses nothing. Experiment, Practice,
Demonstrate and the missions all run the same interpreter.

*Built:* `client/src/games/littleJs.ts`.

## The honest state

The **learning system** is complete and coherent. The **game layer** is not yet
the thing this vision describes: two of five games are connected to the
curriculum, three are not, and the world reflects progress rather than reacting
to it. See `GAP_ANALYSIS.md`.
