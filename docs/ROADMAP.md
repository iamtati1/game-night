# Jolt — Roadmap

Updated 2026-10-23 against branch `pre-jolt-visual-redesign` at `558d5b2`.
Measured against `JOLT_VISION.md` (the blueprint) and `LEARNING_LOOP.md` (the
contract). Known gaps are detailed in `KNOWN_LIMITATIONS.md`; how work moves
through this list is in `DEVELOPMENT_WORKFLOW.md`.

🟢 built and verified · 🟡 partial · 🔴 missing · 🔵 needs a product decision ·
⚪ not verified

**Done means** technically correct *and* right for the learner
(`DEVELOPMENT_WORKFLOW.md`, Definition of done). Nothing below is marked 🟢
without a commit and a verification behind it.

---

## 1. Where Jolt is

| | 2026-10-23 |
|---|---|
| Topics / concepts / declared rungs | 16 / 101 / 282 (dev database) |
| Games producing learning evidence | 3 of 5 (Code Blitz, Bug Hunt, Flush) |
| Server tests | 1654 in 105 files, passing |
| Client tests | 930 in 69 files, passing |
| Client lint | 39 findings (34 errors, 5 warnings), the pre-existing baseline |
| Builds | Client and server production builds pass; Render's exact build command passed on a clean export (2026-10-22) |

## 2. Completed since the 2026-10-02 plan

| Work | Evidence | Verified by |
|---|---|---|
| Untimed opening beats in Code Blitz; clock drops after two misses | `d56d551`; `UNTIMED_OPENING_BEATS = 2` in `server/src/game/scoring.ts` | server tests |
| Concept targeting widened from fixed slots to a derived count | `d56d551`; `focusSlots()` in `server/src/game/curve.ts` | server tests |
| Flush joins the curriculum: concept tags, explanations, credited rounds count as evidence | `d56d551`, `7fc514d`; migration 032 | server tests |
| Learn Beat routing, beginner pacing | `7fc514d` | server and client tests |
| Deployment preparation and Render build fix | `2f53849`, `18a565f` | clean-export build (2026-10-22) |
| Only mission steps can be reported done by the browser | `490f13d` | server tests |
| Costed hints in Code Blitz and Flush (half points; XP unchanged) | `47d66e0` | server and client tests |
| Redesign: mission panel, Skills hub, first-time tutorial, islands under Games, desktop game layouts, adaptive results wording, cream theme with dusk switch, relaxed timers | `cf96277` | client tests; browser QA on a database clone |
| Profile page; navigation Home, Games, Skills, Profile | `558d5b2` | client and server tests; browser QA at 320, 375, 1024 and 1280px in both themes |

### Status of the 2026-10-02 phases

| Phase | Status |
|---|---|
| 1. The beginner's first minute | 🟢 |
| 2. Widen concept targeting | 🟢 |
| 3. Adaptation | 🟡 Within a run: clock drop, remediation ladder, recap after a tough run. Across sessions: not built, and the scope is still undecided. |
| 4. Flush joins the curriculum | 🟢 |
| 5. The world reacts to a cleared rung | ⚪ Not verified as built. |
| 6. HUD density | ⚪ Not re-audited since the redesign. |

---

## 3. Release blockers

These must be resolved before a production deploy. Each is its own slice.

| # | Blocker | Evidence | Acceptance | Slice type |
|---|---|---|---|---|
| R1 | **Server production dependencies have advisories:** `proxy-addr` (critical), `qs` and `ip-address` (moderate) | `npm audit --omit=dev` in `server/` (2026-10-23); all three fixable with `npm audit fix`. Client: 0. | `npm audit --omit=dev` reports 0; full server suite and build pass; lockfile committed | Security |
| R2 | **Production database state is unknown.** Render runs no migrations or seeds (`render.yaml` has no pre-deploy step; free plan has no shell). | `render.yaml` | Backup taken; `migrate:prod` and `seed:prod` run from a trusted machine **with explicit approval**; seeds 083–087 confirmed present | Deployment (needs approval) |
| R3 | **Which branch Render deploys.** `render.yaml` names none, so Render uses the repository's default branch. | `render.yaml` | The intended branch is merged or selected on purpose | Deployment (needs approval) |

## 4. Prioritised next work

Ordered by learner impact per unit of risk. One slice at a time, with approval
between slices.

### P1 — Checkpoint integrity 🟢 (implemented, not yet committed)
- **Was:** a topic checkpoint pass was a claim from the browser. The server
  recorded it once every concept was demonstrated, without seeing an answer;
  an empty request passed, and a topic with no checkpoint could be "passed"
  for points.
- **Now:** `POST /api/curriculum/topics/:topic/challenge` requires the answers
  and judges them against the server's key (`server/src/curriculum/checkpoints.ts`):
  every step right, first time or on its retry. 400 for a malformed
  submission, 422 for a wrong answer, 404 for a topic with no checkpoint;
  `needed_retry` is derived from the answers. The checkpoint page sends the
  answers and offers "Try the checkpoint again".
- **Verified:** `checkpointRoute.test.ts` (11 of its 15 tests fail against the
  original route), `checkpoints.test.ts` (rule and drift against
  `TOPIC_CHALLENGES`), `LessonPage.test.tsx`; browser check on the
  `jolt_qa_087_20261019` clone (2026-10-23).
- **Remaining:** see `KNOWN_LIMITATIONS.md` (answer key in the client bundle;
  the Variables mission half is browser-reported).

### P2 — Practice completion that ignores refusal 🔴
- **Problem:** `/practise/:concept` shows "concept complete" even when the
  server refuses `/demonstrate`. Nothing links to it, but a typed or bookmarked
  URL shows completion that did not happen.
- **Evidence:** `client/src/pages/PracticePage.tsx` (`catch {}` then
  `setDone(true)`).
- **Acceptance:** a refused demonstration is said plainly, as `LessonPage`
  already does, or the orphan route is removed. A test covers the refusal.
- **Slice type:** progression bug fix.

### P3 — Profile & Settings behind an avatar or settings control 🟡
- **Problem:** the blueprint puts Profile & Settings behind an avatar or
  settings control; it is currently a fourth primary tab.
- **Evidence:** `client/src/navArea.ts` (`PRIMARY_NAV`); `JOLT_VISION.md` (The
  places).
- **Acceptance:** primary navigation is Home, Games, Skills; Profile is reached
  from an avatar or settings control on desktop and phone, with an accessible
  name and a visible active state; the nav tests and
  `server/src/curriculum/learningPath.test.ts` are updated deliberately, not
  weakened.
- **Slice type:** navigation.

### P4 — XP honesty 🔵
- **Problem:** Reaction and Memory pay XP for every round played (a 0-of-5
  Reaction run earns the same XP as a perfect Code Blitz run), and XP is shown
  on the Games page. Blueprint criterion 7 asks that recorded progress reflect
  genuine practice.
- **Evidence:** `server/src/reaction/scoring.ts` and
  `server/src/memory/scoring.ts` (`xpForSession` counts resolved rounds). Code
  Blitz counts correct answers, Flush completed rounds, Bug Hunt resolved
  incidents.
- **Depends on:** decision D2. XP constants are on the "not to be changed" list
  below, so this needs explicit approval.
- **Slice type:** scoring (needs approval).

### P5 — Smaller, known
| Item | Status | Evidence |
|---|---|---|
| Untimed opening beats in timed Code Blitz still pay a speed bonus | 🔴 | `KNOWN_LIMITATIONS.md` |
| Screen-reader pass (VoiceOver or NVDA), Memory in particular | ⚪ | never performed |
| Unused `GET /api/curriculum/journey` | 🔴 tech debt | no client caller |
| `GameCard` used only for its `GameStatus` type; dead `.play-focus` CSS | 🔴 tech debt | `client/src/games/islands.ts`, `client/src/index.css` |
| Bug Hunt content thin | ⚪ re-count needed | 2026-10-02: 39/64 untagged |
| `() => console.log(x)` unsupported | ⚪ re-check | 2026-10-02 interpreter gap |

---

## 5. Open decisions

| # | Decision | Blocks |
|---|---|---|
| D1 | Reaction and Memory: connect them to the curriculum, or keep them off the learning path as "just for fun"? | the scoreboard; P4 |
| D2 | Should XP reward correctness in every game, and should XP be shown beside learning progress? | P4 |
| D3 | Adaptation across sessions: build it, and with what thresholds? | Phase 3 |
| D4 | Integrity meter floors at 4%, not 0: raise `INTEGRITY_FAILED_COST`, or accept? | — |

## 6. Not to be changed without explicit approval

XP constants · `CLEARED_RUNGS_CTE` · `evidenceFor()` gating · `roleEligible`
ordering · the interpreter's progressive allowlist · Experiment's no-API
guarantee · derive-don't-store · auth and sessions.

---

*History:* the 2026-10-02 version of this roadmap, with its full analysis, is
in git history (`git show 558d5b2:docs/ROADMAP.md`). `GAP_ANALYSIS.md` and
`BACKLOG.md` are snapshots from that period.
