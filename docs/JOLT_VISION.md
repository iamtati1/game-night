# Jolt — Product Vision

> **The product blueprint.** Every planning, implementation and review decision
> is checked against this document (see `DEVELOPMENT_WORKFLOW.md`).
>
> Reconciled against the implementation on 2026-10-02 and updated on
> 2026-10-23. Every claim below is either **built** (with the file that builds
> it) or marked as **not yet**. Nothing here describes architecture that does
> not exist. Current status and priorities live in `ROADMAP.md`; known gaps in
> `KNOWN_LIMITATIONS.md`.

## Identity: PLAY. GET BETTER.

Jolt is a beginner-friendly JavaScript learning platform. Its central
experience is learning through play, exploration, experimentation and
meaningful feedback — not disconnected lessons, quizzes or decorative game
mechanics.

## Who it is for

People starting JavaScript from nothing. The first-time tutorial opens with
"You don't need to know JavaScript yet", and every screen should hold to that:
readable code, clear instructions, enough time to think, and feedback that says
why (`LEARNING_LOOP.md` §20).

## What Jolt is

A game-based JavaScript learning world. A learner learns by interacting with
code, writing and running it, playing, debugging, practising, and demonstrating
— and progression is earned through **evidence**, never through one correct
answer.

## What Jolt is not

- Not an LMS with game elements attached.
- Not a quiz app with game styling.
- Not a course and a game arcade that happen to share a login.

## Learning philosophy

**Explore → Learn → Play → Understand → Grow.** A learner meets an idea, runs
and changes real code, practises it in play, understands why it behaves as it
does, and moves on when they have shown they can use it.

- **Discovery over recitation.** The learner is actively discovering or
  applying JavaScript, not reading about it and picking a letter.
- **Feedback teaches.** A wrong answer explains the consequence and names the
  misconception; a right one says why.
- **Understanding before speed.** Curriculum games start relaxed; the clock is
  a choice.
- **Progress is evidence.** What Jolt records must reflect genuine practice and
  demonstrated understanding (pillars 2 and 4 below). XP counts play; it is not
  shown as understanding.
- Optimise for **Learning + Agency + Forward Momentum**, not Speed + Difficulty
  + Volume (`LEARNING_LOOP.md` §21).

## The places

| Place | What it is for |
|---|---|
| **Home** | The entry point to learning: the next mission, and the guided topic journey reached from it. There is no separate Learn tab. |
| **Games** | All five games, as islands. Availability and recommendations come from real readiness. |
| **Skills** | Honest evidence of understanding: demonstrated, practised, learning, locked. |
| **Profile & Settings** | Account, settings (theme, sound, default pace, tutorial replay) and the game log, reached through an **avatar or settings control**, not a permanent primary-navigation tab. |

*Built:* Home, Games, Skills and Profile (`client/src/navArea.ts`,
`client/src/pages/ProfilePage.tsx`). *Not yet:* Profile is currently the fourth
primary tab (commit `558d5b2`); moving it behind an avatar or settings control
is a separate navigation slice on the roadmap.

## Product decision criteria

Every product decision is evaluated against these questions:

1. Does this feel distinctively like Jolt?
2. Is the next learner action clear?
3. Is the learner actively discovering or applying JavaScript?
4. Does feedback explain consequences and misconceptions?
5. Is difficulty appropriate, and is confusion caused by the concept or by the
   interface?
6. Does the world respond meaningfully to learning, rather than serving as
   decoration?
7. Does recorded progress reflect genuine practice and demonstrated
   understanding?
8. Can we improve the experience without adding unnecessary complexity?

They sit alongside, and do not replace, the game quality bar
(`GAME_DESIGN.md`), the implementation rule (`LEARNING_LOOP.md` §23) and the
definition of done (`LEARNING_LOOP.md` §25).

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

*Updated 2026-10-23.*

- **The learning system is complete and coherent.** The dev database holds 16
  topics, 101 concepts and 282 declared rungs (read 2026-10-23; the figures in
  pillar 1 date from 2026-10-02).
- **Three of five games produce learning evidence.** Code Blitz and Bug Hunt
  clear rungs directly; a credited Flush round writes `activity_completions`
  (`server/migrations/032_flush_teaches.sql`), the third arm in pillar 2.
  Reaction and Memory record XP only and stay "just for fun"; whether they
  belong on the learning path is an open decision (`ROADMAP.md`).
- **The world reflects progress more than it reacts to it.** See `ROADMAP.md`.
- **Two evidence gaps are known:** topic checkpoints are judged in the browser,
  and Reaction and Memory pay XP for rounds played rather than rounds right
  (`KNOWN_LIMITATIONS.md`).

`GAP_ANALYSIS.md` is the 2026-10-02 snapshot this section replaces.
