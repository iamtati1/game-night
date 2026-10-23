# Known limitations

What a demo, a reviewer or the next coding session might run into, and why.
Updated 2026-10-23 against `558d5b2`; each item was checked against the code
or a read-only database query on that date unless it says otherwise.
Prioritised fixes live in `ROADMAP.md`.

Sections: **confirmed limitations** · **unverified behaviour** · **technical
debt** · **deployment requirements**.

---

## Confirmed limitations

### Progress and evidence

- **Checkpoint answers are judged by the server, but the key is also in the
  client bundle.** Since 2026-10-23 the checkpoint route judges every answer
  against `server/src/curriculum/checkpoints.ts` and refuses empty, malformed
  or wrong submissions. The quiz still gives per-choice feedback in the
  browser, so the right answers ship in `client/src/games/lessons.ts`; someone
  reading the bundle could script a correct submission. Closing that means
  serving checkpoint questions from the server one at a time.
- **The Variables checkpoint's mission half is browser-reported.** The quiz
  half is judged by the server; the launch-check mission runs in the browser's
  interpreter and is accepted on the browser's word, as concept missions are.
- **`/practise/:concept` is routed but not linked.** Nothing in the app links
  to it; a typed or bookmarked URL reaches it. Since 2026-10-23 it shows
  completion only when the server records it.
- **Reaction and Memory pay XP for rounds played, not rounds right.** Their
  `xpForSession` counts resolved rounds (`server/src/reaction/scoring.ts`,
  `server/src/memory/scoring.ts`), so a 0-of-5 run earns the same XP as a
  perfect one. Code Blitz counts correct answers, Flush completed rounds, Bug
  Hunt resolved incidents; every game adds a 25 XP completion bonus
  (`server/src/games/xp.ts`), so a finished run with nothing right still earns
  25. XP is never evidence and never moves progress, but
  it is shown on the Games page. Roadmap P4 (needs a decision).

### Gameplay

- **Flush says whether a round counted only on that round's reveal.** The
  results screen lists rounds and XP but not which rounds counted: the server
  decides `credited` as each round ends and does not keep it per round.

- **Reaction and Memory restart after a reload mid-run.** A *paused* run
  resumes where it stopped. A run that is simply left in progress — the tab
  reloaded or closed between rounds — shows the game's intro again, and
  pressing Start abandons that unfinished run and deals a new one (the start
  request sends `fresh: true`). Code Blitz, Flush and Bug Hunt restore an
  in-progress run instead. Neither game records learning evidence, so nothing
  on the journey is lost; only that run's XP is.
- **Code Blitz may open with a short intro instead of a round.** When too few
  questions are open for a ten-question round, starting Code Blitz teaches the
  next idea first (a Learn Beat). This is the curriculum working as designed,
  not an error.
- **Flush and Bug Hunt can be shorter than a full game.** With fewer than five
  puzzles or six bugs open, a shorter game of at least three is dealt, and every
  counter and the results screen say its real length. Below three, the game
  explains on arrival what opens it.
- **A relaxed run's pace lives in the login session.** Code Blitz and Flush
  remember that a run is relaxed (no clock) in the server-side login session,
  because there is no column for it and this work added no migration. If the
  learner signs out and back in mid-run, or continues the run in another
  browser, the rest of that run is timed as before. Nothing is lost or
  inflated. Bug Hunt stores its limits on the rounds, so a relaxed hunt stays
  relaxed everywhere.
- **Hints are remembered in the login session.** A hint in Code Blitz (rules
  out a wrong answer) or Flush (shows the next output) halves that answer's or
  round's points, and which ones were hinted is kept in the server-side login
  session, like relaxed runs. If the learner signs out and back in mid-run, an
  answer hinted before then scores in full. Points only: XP, evidence and
  progress never depend on hints.
- **Code Blitz's two untimed opening questions still pay a speed bonus.** The
  scoring code says an untimed question pays none, but the answer route and the
  session total call it without the question's position, so the first two
  questions of a timed run can score 150. A relaxed run is unaffected: every
  correct answer there scores exactly 100.

### Content and data

- **Beginner Flush puzzles need seed 083, and the dev database does not have
  it.** Without `seeds/083_flush_beginner.sql`, Flush holds only the 34 Async
  puzzles, which open late in the course, so early learners see "Flush needs at
  least 3 puzzles". On 2026-10-23 dev held only those 34; the QA clones
  (`jolt_qa_085_20261019`, `jolt_qa_087_20261019`) also hold the 10 beginner
  puzzles. Apply 083 on its own, as rehearsed, and only with approval.
- **Some one-line Bug Hunt bugs list their choices instead of using the line
  picker.** When a bug's wrong answer is a sentence on the same line as the
  fault, clicking the line could not tell the two apart, so the options are
  listed as choices, as the lesson shows them.

### Interface

- **Focus stays where it was after a route change.** Moving between pages does
  not move focus to the new page or announce it, so a screen-reader user lands
  on the top of the document. Fixing it from the app shell would override the
  games' own autofocus, so it needs a design decision and testing with a real
  screen reader.
- **Bug Hunt's incident numbers are faint in dusk** (2.0:1). They are hidden
  from assistive technology and decorative; the incident titles beside them
  carry the content.
- **Practice on a concept already demonstrated shows "+25" again.** The
  server records nothing new and points do not change; the completion screen
  does not know the concept was already done. The route is not linked.

- **Profile is a primary tab, not yet behind an avatar or settings control.**
  The blueprint (`JOLT_VISION.md`, The places) puts Profile & Settings behind
  an avatar or settings control; the current navigation is Home, Games, Skills,
  Profile. Roadmap P3.
- **Signed-in theme and sound settings are on Profile only.** The header's
  theme and sound buttons show only to signed-out visitors.
- **The default pace on Profile applies when a game's intro opens.** An intro
  already on screen keeps the choice it opened with.
- **The journey map is an optional view.** The step list is the default; the
  map is one click away and is tall on a phone.

---

## Unverified behaviour

- **Production database state.** Which migrations and seeds production has is
  unknown; nothing has been checked against it. See Deployment requirements.
- **Screen readers.** Accessibility was checked with automated tooling, tests
  and browser inspection: on 2026-10-23 an in-browser audit of 17 learner
  pages in both themes (one `h1` each, named landmarks and controls, labelled
  inputs, live regions for feedback, WCAG AA text contrast, a visible focus
  ring). A pass with VoiceOver or NVDA has not been done; Memory's flashing
  sequence is the most likely gap. Reaction supports Space and Enter and
  announces its state through a live region.
- **Keyboard order in a real, focused browser.** Focus styles were checked by
  focusing controls programmatically; pressing Tab through whole pages was not
  possible in the QA browser pane.
- **Free-tier hosting behaviour.** Cold-start time and Render's current free
  Postgres expiry terms have not been measured or re-read.

---

## Technical debt

- **Lint baseline: 39 findings (34 errors, 5 warnings), all pre-existing**
  (`cd client && npm run lint`). Mostly React-hooks rules in the larger game
  pages. New work must not raise the count.
- **Two global stylesheets overlap** (`client/src/index.css` and
  `client/src/world/world.css`).
- **Unused code:** `GET /api/curriculum/journey` has no client caller;
  `components/GameCard.tsx` is used only for its `GameStatus` type; `.play-focus`
  rules in `index.css` and `world.css` style nothing.
- **Some client tests are timing-sensitive under a loaded full run.** Seen
  2026-10-23: `ProfilePage.test.tsx` (sound toggle) failed once in a full run
  and passed alone and on the next full run; `GameTimeout.test.tsx` has done
  the same before. Re-run before treating one as a regression.
- **Seeds are not tracked.** There is no table of applied seeds; whether one is
  applied has to be read from the content it adds.

---

## Deployment requirements

Release steps are in `DEVELOPMENT_WORKFLOW.md` (Release checklist). What must
be true:

- **Production dependencies audit clean (2026-10-23).** `npm audit --omit=dev`
  reports 0 in `server/` and `client/` after the lockfile update that resolved
  release blocker R1. Re-run it before each release. Four advisories remain in
  the server's dev-only test tooling (vitest, vite, source-map-js). Render's
  build installs them (`--include=dev`), but the server build is `tsc` and
  the running service never loads them, so they are not a release blocker.
- **Render runs no migrations or seeds.** `render.yaml` has no pre-deploy step
  and the free plan has no shell, so `migrate:prod` and `seed:prod` must be run
  from a trusted machine, after a backup, with approval. Seeds 083–087 are the
  most recent; confirm each one's content after applying. Release blocker R2.
- **Render deploys the default branch.** `render.yaml` names no branch. Release
  blocker R3.
- **Node 22.19.0** (`.node-version`); the server requires `>=22.9.0`.
- **Single origin.** The web service serves the client and the API;
  `CLIENT_ORIGIN` and `COOKIE_SAMESITE` stay unset. `app.set("trust proxy", 1)`
  lets the `Secure` session cookie work behind Render's proxy.
