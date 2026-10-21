# Known limitations

What a demo or a reviewer might run into, and why it is the way it is. Each item
is known, deliberate to leave for now, and safe — none of them invents progress
or loses earned progress.

## Gameplay

- **Reaction and Memory restart after a reload mid-run.** A *paused* run resumes
  where it stopped. A run that is simply left in progress — the tab reloaded or
  closed between rounds — shows the game's intro again, and pressing Start
  abandons that unfinished run and deals a new one (the start request sends
  `fresh: true`). Code Blitz, Flush and Bug Hunt restore an in-progress run
  instead. Neither game records learning evidence, so nothing on the journey is
  lost; only that run's XP is.
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
- **Code Blitz's two untimed opening questions still pay a speed bonus.** The
  scoring code says an untimed question pays none, but the answer route and the
  session total call it without the question's position, so the first two
  questions of a timed run can score 150. This was here before and is
  unchanged. A relaxed run is unaffected: every correct answer there scores
  exactly 100.

## Content and data

- **Beginner Flush puzzles need seed 083 in the database.** Without
  `seeds/083_flush_beginner.sql` applied, Flush only holds Async puzzles, which
  open late in the course, so early learners see "Flush needs at least 3
  puzzles". Apply 083 (and 084, a wording fix to one Bug Hunt option) on their
  own, as rehearsed — not with `npm run seed`, which re-runs every seed file.
- **Seed 085 (question quality) is written and verified but not applied.** It
  retires three arithmetic-drill questions from `expressions-produce-values`
  and adds three on telling quoted text from an expression, removes printed
  quotes from five legacy answers, and fixes two ambiguous option sets. Until
  it is applied the old questions are still served. Apply it on its own, like
  083 and 084.
- **Some one-line Bug Hunt bugs list their choices instead of using the line
  picker.** When a bug's wrong answer is a sentence on the same line as the
  fault, clicking the line could not tell the two apart, so the options are
  listed as choices, as the lesson shows them.

## Interface

- **The journey map is an optional view.** The step list is the default; the map
  is one click away and is tall on a phone.
- **Two routes are unused.** `/learn/:concept` and `/practise/:concept` are
  routed but nothing links to them; the lesson flow is `/concept/:concept` and
  checkpoints are `/challenge/:topic`.
- **Accessibility was checked with automated tooling, not a screen reader.**
  Names, roles, live regions, keyboard operation and focus are covered by tests
  and browser inspection. A pass with VoiceOver or NVDA has not been done.

## Engineering

- **Lint baseline: 39 findings (34 errors, 5 warnings), all pre-existing.**
  Mostly React-hooks rules in the larger game pages. Not changed by the
  redesign slices or the readability and relaxed-timer work.
- **Two global stylesheets overlap** (`client/src/index.css` and
  `client/src/world/world.css`). Consolidation is out of scope for the current
  work.
