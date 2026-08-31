# Game Night — Backlog

Recorded, not scheduled. Nothing here is implemented. Categories follow the
testing-pass convention: **A** = bug, **B** = missing requirement from the
current game design, **C** = future UX enhancement.

## B — Missing requirements

### Leave / quit a game
No endpoint exists. `game_sessions.status = 'abandoned'` is currently reachable
only by lazy timeout (15-minute resume window elapses and the next
`POST /api/sessions` marks it abandoned). A player cannot end a game on purpose.

Needs `POST /api/sessions/:id/abandon`. Additive — `status` and `abandoned_at`
already exist, so **no migration required**. Decide whether an abandoned game
awards partial XP; the ratified rule is 0.

## C — Future UX enhancements

### Feedback phase: more reading time + "Next Question" button
Correct/incorrect feedback works today (chosen option turns red, correct option
turns green, tag shows `Correct · +150`), but it auto-advances after
`FEEDBACK_MS = 1400` in `client/src/pages/GamePage.tsx`. Too fast to read the
correct answer when you got it wrong.

Wanted: a longer dwell, and/or an explicit **Next Question** button so the player
controls the pace.

⚠️ **Design tension to resolve first.** The next question's 30-second timer starts
when the server *serves* it, and `served_at` is stamped on fetch. If the player
sits on a "Next Question" button, the following question must not already be
counting down. Options:
- Do not fetch the next question until the button is pressed (server unchanged).
- Split serving from fetching via an explicit serve step.

The first is simpler and requires no server change. The current answer response
already returns the next question eagerly, so this would mean deferring that.

### Pause
Conflicts with the timing model. `served_at` is deliberately stamped once and
never reset — that is what stops a player refreshing for a fresh 30 seconds.
Pause requires elapsed time to stop counting.
- **Pause between questions only** — no schema change. Likely the right game design.
- **True mid-question pause** — needs `paused_ms` on `session_questions`, and the
  deadline becomes `served_at + 30s + paused_ms`. Note this creates a new value a
  cheating client would want to inflate, so it needs server-side accounting.

### Game platform experience

**Direction (decided, not yet built): a game library, not a dashboard with games on it.**
Reference points are Steam / Netflix / a casual game platform — artwork-led cards
with their own identity, categories, a rotating featured slot, a daily challenge,
and per-game detail pages. The test to apply: does the home screen read as a place
to browse games, or as five buttons for the games we happened to build?

Card hierarchy is fixed: **artwork → title → one-line hook → Play.** Everything
else (difficulty, duration, best score) is secondary and must not crowd those four.

The architectural requirement is that the home page becomes `games.map(...)` rather
than hardcoded `<CodeBlitzCard/> <FlushCard/>`. Target game shape:
`{ slug, name, description, thumbnail, category, difficulty, estimatedDuration,
featured, playable }`.

*Already in place:* the `games` table (slug, name, tagline, is_active), plus the
server-side `GAME_SLUGS` / `GAME_ADAPTERS` registry, which is the same
"no per-game branches" pattern one layer down.

*The blocker:* there is no `GET /api/games`, so nothing can be data-driven yet, and
`LandingPage.tsx` is currently the exact antipattern above — hardcoded hero copy
plus two hand-written `<Link>`s.

- **Game library / grid** — game cards with name, description, artwork, difficulty,
  estimated play time, player best score, Play button, "Coming Soon" state.
  Needs metadata columns on `games` and a `GET /api/games` endpoint. Cheap while the
  table holds two rows; a migration against real history later.
- **Categories** — QUICK PLAY / BRAIN / CODE / SKILL / COMPETE / NEW / FAVORITES.
  Decide early: a single `category` column forces one home per game, but Code Blitz
  is honestly CODE *and* QUICK PLAY *and* COMPETE. A `game_categories` join table
  costs little now and avoids a migration once sessions reference games.
- **Featured slot** — rotating by newest / most played / daily / player activity.
  "Most played" is already derivable from `game_sessions`; no new schema.
- **Star ratings (★ 4.8)** — needs a real ratings table, or it is fabricated social
  proof. Recommend replacing with something true per player: best score, times
  played, last played. Invented numbers on a portfolio project are a liability.
- **Placeholder "???" cards** — recommend against. Two strong cards beat four tiles
  with two holes; Steam does not show empty slots. Let the grid be 2-up until
  there is a third game.
- **Game preview / instructions screen** before gameplay starts. Purely client-side:
  `POST /api/sessions` is only called on Start, so nothing server-side changes.
- **Multiple game modes** — practice mode, per-language and per-difficulty modes.
  The `QuestionProvider` abstraction and `questions.source` already support sourcing.
- **Daily challenge — NOT a UI feature.** Worth flagging early because it reaches
  into the session model rather than the front end:
  - "Everyone gets the same challenge" is incompatible with `ORDER BY RANDOM()` in
    `createSessionWithQuestions` / `createSessionWithRounds`. It needs a
    deterministic per-day question set — a `daily_challenges` table, or date-seeded
    selection.
  - One attempt per player per day is a uniqueness rule, and
    `game_sessions_one_resumable_per_game_idx` would need a challenge dimension to
    coexist with ordinary play. That is a migration against a table holding real
    history, so the shape is much cheaper to decide before the table grows.
  - `game_sessions.pause_count` (added in migration 011) is already the mechanism
    for distinguishing a clean run from one that was paused and thought about —
    which is exactly what a daily leaderboard needs to stay honest.
- **Achievements** — needs `achievements` + `user_achievements` tables. Additive.
- **Leaderboards** — no schema change. `game_sessions.score`/`xp_earned` are stored
  per session and `game_sessions_user_id_idx` already supports the join. Decide
  whether anonymized users appear.
- **Player profile / XP / stats** — aggregate queries over `game_sessions`.

### Interaction polish
Micro-animations, hover states, button feedback, page transitions, progress and XP
animations, streak effects, level-up celebrations, per-game artwork and themes.
Target feel: playful, modern, consistent across games, portfolio-presentable —
without animation that costs usability or performance.

## Known limitations (not bugs)

### Two clients share one server-side game
Game state is per user, and a user may hold only one `in_progress` session
(`game_sessions_one_active_per_user_idx`). Two tabs on one account therefore act on
the same game, and the client holds local question state that it does not
reconcile when another client causes a timeout adjudication. Single-tab play is
unaffected.

### `GET /api/sessions/current` has a side effect
It stamps `served_at` on first fetch, so fetching a question starts its clock.
Idempotent in the way that matters — re-fetching does not reset the timer — but it
means any concurrent client can start a question's timer. An explicit
`POST /api/sessions/:id/serve` would remove this.

## Deferred infrastructure

- `/api/ready` has no query timeout: it handles Postgres being *down* but not
  Postgres being *slow*. A hanging readiness probe is worse than a failing one.
  Add `connectionTimeoutMillis` or `query_timeout`.
- `invalidateUserSessions()` is implemented but has no caller — there is no
  anonymization endpoint yet to invoke it.
- `pool.end()` on `SIGTERM`/`SIGINT` for clean shutdown.
- Integration tests that touch PostgreSQL (question pool eligibility, session
  lifecycle, answer handling, constraints). Currently covered only by the
  hand-run `constraint_tests.sql` suite.
