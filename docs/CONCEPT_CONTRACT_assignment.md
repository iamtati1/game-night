# Reference Concept — `assignment`

**The model for the other 99.** One concept mapped completely against
`LEARNING_LOOP.md` §2, using only what exists today. Chosen from data, not
intuition: it is one of three beginner concepts whose loop is already complete
(questions **and** a Bug Hunt incident **and** a written mission), and its three
rungs are exactly the three verbs the loop cares about — **read, write, debug**.

## The contract, filled in

| Field | Value |
|---|---|
| **Concept** | `assignment` — "Assigning a Value" |
| **Topic** | Variables (#2 of 16), concept #4 |
| **Objective** | work out what gets stored when the right-hand side is an expression |
| **Meaning** | assignment evaluates everything on the right first, then stores that single value under the name on the left |
| **Prerequisites** | `expressions-produce-values`, `declaration` |
| **Required demands** | `predict`, `produce`, `diagnose` |
| **Unlocks** | `reassignment` |

## The loop, step by step

### World → Introduce
`challenges` **ch6**, role `introduce`, difficulty 1. Acknowledging it writes
`introduction_completions` and makes the three practise rungs eligible — before
that, `roleEligible` withholds them.

### Learn → Interact
Lesson in `client/src/games/lessons.ts`, rendered by `EncounterPage`. Worked
examples with `parts` naming `let` · the name · `=` · the value, a `notice`, and
graded steps each carrying a `retry`.

### Write Code → Run Code
**ch81**, `activity = 'mission'` — the `produce` rung. Movement authored in
`practice.ts`, addressed by `(assignment, produce)`. The learner writes it,
`littleJs` runs it, and the check reads the structure, not just the output.

### Play
Code Blitz deals **ch45** / **ch46** (`predict`) when `assignment` is the
learner's current concept, reserved into beats 1 and 6 and labelled *"What you
are learning · Assigning a Value"*.

> Q: `let total = 5; total = total + 3; console.log(total);`
> Q: `let count = 2; count = count * 3; console.log(count);`

Both ask the concept's actual claim: the right-hand side is evaluated **first**.

### Debug / Repair
Bug Hunt deals **ch7** (`score-never-updated`) and **ch53**
(`assigned-wrong-way-round`) at the `diagnose` rung.

`score-never-updated` is the canonical misconception: `score + 5;` computes 15
and throws it away, because adding does not change `score` — the result has to
be stored back into it.

### Evidence
| Rung | Cleared by | Table |
|---|---|---|
| `predict` | correct Code Blitz / encounter answer | `session_questions.is_correct` |
| `produce` | mission satisfied | `activity_completions` |
| `diagnose` | hunt resolved | `bug_hunt_rounds.status='resolved'` |

All three via `CLEARED_RUNGS_CTE`, all requiring `role='practise'`.

### Remediation
Authored `retry` on the lesson steps; per-option feedback naming the
misconception; two attempts inside a Bug Hunt round. **No retry inside a Code
Blitz round** — the gap §15 names.

### Demonstrate → Unlock
`POST /api/curriculum/concepts/assignment/demonstrate` — 409 until all three
rungs are cleared. On success, `concept_demonstrations`, and `reassignment`
becomes reachable through `CONCEPT_STATE_SQL`.

## Three paths to the same concept

The reason this concept is the right model: a learner can clear it **three
different ways** and all three are the same evidence system.

```
          ┌── Code Blitz ──→ session_questions ──┐
assignment ├── mission ─────→ activity_completions ├─→ CLEARED_RUNGS_CTE ─→ rung
          └── Bug Hunt ────→ bug_hunt_rounds ────┘
```

## What is missing for this concept to "feel right"

Measured against the contract, not invented:

| Gap | § | Severity |
|---|---|---|
| **Timed from beat one.** Code Blitz times a beginner's first-ever question. §11 says a timer must earn its place; prediction is not a speed skill. | 11, 20 | 🔴 the sharpest conflict |
| **No retry inside a Code Blitz round.** One answer, explanation, next. | 15 | 🟡 |
| **The world does not react** when a rung clears. The learner navigates back and finds it changed. | 1, 19 | 🟡 |
| **8 of 10 Code Blitz beats are eligible, not targeted** — deliberate, but it is why a round can feel unrelated to the concept. | 2, 18 | 🟡 |
| **`apply` is not declared** for this concept, so *using* a variable in a larger task is not required to demonstrate it. | 16 | 🟡 content |
| **Editor UI unaudited** against §7's readability list. | 7 | 🟡 |

## Using this as the template

For each remaining concept, fill the same table. Where a field is empty, that is
the work. Where all fields are full and the gaps above are closed, the concept
is done by §25 — not because rows exist, but because the journey is coherent.
