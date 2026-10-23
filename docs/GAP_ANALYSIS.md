# Gap Analysis — vision vs implementation

> **Historical snapshot (2026-10-02).** Kept as the record of what the vision
> reconciliation found. It is not current: Flush has since joined the
> curriculum, and several gaps below are closed. Current status and priorities
> are in `ROADMAP.md`; known gaps in `KNOWN_LIMITATIONS.md`.

Reconciled 2026-10-02. Status: 🟢 implemented · 🟡 partial · 🔴 missing ·
🔵 needs gameplay redesign.

## Your table, filled in

| Vision requirement | Existing implementation | Status | What is actually true |
|---|---|---|---|
| Learner sees current concept | `findJourneyPath().current` → Home, map, `/play` band, in-game marker | 🟢 | Was 🟡. The concept is now named on Home, on the map, on the Play page, **inside the game on reserved beats**, and on the results screen. |
| Interactive concept introduction | `lessons.ts` | 🟢 | 100 concepts, worked examples, named parts, graded steps, authored remediation. |
| Write JavaScript | Experiment + missions | 🟢 | One interpreter; Experiment proven consequence-free by test. |
| Run JavaScript | `littleJs` | 🟢 | Refuses nothing as of `this`/classes. |
| Game reinforces concept | Code Blitz, Bug Hunt | 🟡 | True for 2 of 5 games. |
| Debug code | Bug Hunt | 🟢 | Targeted, evidence-producing, two attempts. |
| Evidence collection | 3-arm `CLEARED_RUNGS_CTE` | 🟢 | Derived, never stored twice. |
| Demonstration | `concept_demonstrations` | 🟢 | Gated by `evidenceFor()`; no game can trigger it. |
| Unlock next concept | `CONCEPT_STATE_SQL` | 🟢 | Single reachability authority. |
| **World changes as learner progresses** | `Planet` / `ConceptObject` / `Ship` states | 🟡 | **Reflects, does not react.** |
| **Games feel connected to curriculum** | 2 of 5 games | 🟡 | **Flush, Reaction, Memory contribute nothing.** |
| **2–3 minute satisfying gameplay** | Code Blitz only | 🟡 | **Bug Hunt is 3–15 min.** |

---

## The three rows that matter, in detail

### A. World changes as learner progresses — 🟡

**What exists.** Three genuinely different renderings per state, not one shape
at three opacities: `ConceptObject` goes bare rock → lit beacon → outpost with
windows. `Planet` has visited/here/ahead. `Ship` has parked/learning/challenge/
departing. The map shows `cleared/playable` on a part-done concept.

**What is missing.** All of it is read **on mount**. Every animation in
`world.css` is ambient — drift, parallax, twinkle. There is no "you just cleared
a rung" moment anywhere: no arrival, no transition, no acknowledgement. The
world is an accurate status display, not a responsive place.

Also: `ConceptObject` — the richest progress rendering in the codebase — is used
on `/world/:topic` **only**. The map and Home never show it.

**Gap:** 🟡 for the state model, 🔴 for reaction. Needs design, not plumbing:
the data is already there.

### B. Games feel connected to curriculum — 🟡

| Game | Connected | Evidence | Note |
|---|---|---|---|
| Code Blitz | 🟢 | rung | targeted + labelled + results |
| Bug Hunt | 🟢 | rung | targeted; content thin |
| Flush | 🔴 | none | `flush_snippets` has no `challenge_id` |
| Reaction | 🔴 | none | no content rows at all |
| Memory | 🔴 | none | no content rows at all |

**Gap:** Flush is 🔴 but cheap — predicting printed output in order *is*
`predict`; it needs a `challenge_id` column, tagging, and the same reservation
the other two have. Reaction and Memory are 🔵: they test reflexes and recall of
symbols, not JavaScript, so connecting them means changing what they *are*.

### C. 2–3 minute satisfying gameplay — 🟡

| Game | Worst case | Verdict |
|---|---|---|
| Code Blitz | 10 × 18s = **3:00** | 🟢 on time, 🔵 on "satisfying" |
| Bug Hunt | 10 × 18–90s = **3:00–15:00** | 🔴 |
| Flush | 5 × (20s + 10s/output) | 🟡 |
| Reaction / Memory | 5 rounds | 🟢 short |

**Gap:** Bug Hunt is the clear 🔴 — incident count or per-incident budget has to
come down. "Satisfying" is a separate 🔵 for Code Blitz: on time, but the only
verb is choosing one of four, and failure ends at the explanation.

---

## Everything else that is genuinely missing

> Items already recorded in `BACKLOG.md` are **not** repeated here — notably the
> missing "leave / quit a game" endpoint (category B). This table is only what
> the vision reconciliation surfaced on top of that backlog.


| Gap | Status | Note |
|---|---|---|
| Pre-round "First up" is a lesson screen inside the game | 🔵 | It records introduction evidence, so it earns its place — but it is a lesson between Start and play. |
| No retry/remediation inside a Code Blitz round | 🔵 | Bug Hunt has two attempts; Code Blitz has one. |
| Bug Hunt content thin | 🔴 | 39/64 untagged; `diagnose` 13 incidents vs 40 rungs. |
| Seeds are not idempotent | 🔴 | Re-seeding adds 42 duplicate challenges. Backlog task; **rebuild rather than re-seed** until fixed. |
| `() => console.log(x)` fails | 🔴 | `console.log` is a statement form, not an expression — pre-existing interpreter gap, beginner-facing. |
| 24 legacy `conditionals` questions | 🟡 | Harmless; the slug is not a curriculum topic. |
| `this`/classes never browser-tested | 🟡 | Verified against PGlite only; needs the dev DB rebuild. |

---

## Recommended order (not started)

1. **Bug Hunt round length** — 🔴, smallest change, biggest felt effect.
2. **World reacts to a cleared rung** — 🟡→🟢, the single change that most makes
   Jolt feel like one place. Data already exists.
3. **Flush → curriculum** — turns 2-of-5 into 3-of-5 honestly.
4. **Code Blitz retry/remediation** — closes the failure loop.
5. **Reaction / Memory** — decide whether they earn their place at all.

Reaction and Memory are the only place where the honest answer may be
*subtraction*: by the spec's own rule, a game that reinforces no concept and
produces no evidence has to justify itself some other way.
