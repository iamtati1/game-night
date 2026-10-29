# Jolt — Development Workflow

**The canonical process for changing Jolt.** `CLAUDE.md` and `AGENTS.md` point
here; this document owns the rules, so they are written once.

Every substantial task moves through eight stages:

```
inspect → diagnose → propose → approve → implement → verify → review → handoff
```

A one-line fix can move through them in minutes. None is skipped.

---

## Read first

| Always | Why |
|---|---|
| `docs/JOLT_VISION.md` | The blueprint: identity, places, decision criteria |
| `docs/ROADMAP.md` | What is done, what is next, what blocks release |
| `docs/KNOWN_LIMITATIONS.md` | What is already known not to work |

| When the task touches | Also read |
|---|---|
| How a concept is taught, evidence, demonstration | `docs/LEARNING_LOOP.md` |
| Curriculum tables, rungs, difficulty | `docs/CURRICULUM_ARCHITECTURE.md`, `docs/CONCEPT_CONTRACT_assignment.md` |
| A game's purpose or its link to the curriculum | `docs/GAMEPLAY_SPEC.md` |
| Whether a game is good to play | `docs/GAME_DESIGN.md` |
| Setup, running, tests | `README.md` |

## 1. Inspect

- `git status`, the current branch and the latest commits. **Preserve every
  uncommitted change**: no reset, revert, stash, clean or checkout over someone
  else's work.
- Look at current behaviour before proposing a change: read the code, run the
  tests, open the page.

## 2. Diagnose

- Name the learner's problem and the evidence for it: a file and line, a test,
  a measured screen, a database read.
- Separate **confirmed** findings from **unverified concerns** and
  **cosmetic** issues.
- Apply the blueprint's decision criteria (`JOLT_VISION.md`).

## 3. Propose

Recommend **the smallest safe slice**, with:
- what changes, and the files expected to change;
- acceptance criteria, for both behaviour and learner experience;
- regression risks, and the tests that will cover them.

**Keep these in separate, testable slices:** security fixes ·
curriculum/progression changes · navigation changes · scoring changes ·
unrelated refactors.

## 4. Approve

Wait for approval when scope or trade-offs are significant. **Always** ask
before:
- changing auth, sessions, XP, scoring, curriculum, progression or evidence
  rules (and anything on the "not to be changed" list in `ROADMAP.md`);
- seeding, migrating or resetting any database, or changing database records;
- pushing, deploying, or changing production resources or deployment settings.

## 5. Implement

- Only the approved scope. Reuse existing logic before writing new.
- Match the surrounding code's naming, comment density and idiom.
- Never weaken a test or change a product requirement to get a green build.
  When a test pins behaviour that is meant to change, update it deliberately
  and say so.

## 6. Verify

### Commands

Neither suite needs a running PostgreSQL: database tests build an in-process
PGlite database from the real migrations and seeds.

```bash
cd server && npm test -- --maxWorkers=4      # full server suite
cd server && npm run typecheck
cd server && npm run build

cd client && npm test                        # full client suite
cd client && npm run lint
cd client && npm run build                   # runs tsc -b, then vite build
```

- **Server tests:** use `--maxWorkers=4`; at default parallelism the suite can
  stall.
- **Client lint baseline:** 39 findings (34 errors, 5 warnings), all
  pre-existing. A change must not raise the count. The server has no lint
  script.
- **Client type check:** there is no `typecheck` script; `npx tsc -b` (also run
  by `npm run build`) is the check.
- Run focused tests while working, and the full suites before review.

### Database safety

- **Dev database (`code_blitz_dev`):** read-only probes only, e.g.
  `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;`.
- **Anything that writes** (seed rehearsals, QA accounts, gameplay): restore a
  `pg_dump --format=custom` copy of dev into a scratch database and point
  `DATABASE_URL` at that.
- **Migration drift:** a dev server can run new code against an old schema.
  Check `cd server && npm run migrate -- --dry-run` before trusting what a page
  shows.
- **Seeds are not tracked** in a table. Confirm whether a seed is applied by
  reading the content it adds, not by assuming.

### Browser and accessibility QA

Required when a change is visible in the browser.
- **Database:** run against a database clone, never dev or production; a
  throwaway test account on the clone is fine.
- **Widths:** 320px, 375px and desktop (1024px and 1280px).
- **Themes:** cream (the default) and dusk (Profile → Settings, or
  `localStorage["jolt.theme"]`).
- **Check:**
  - no horizontal page overflow;
  - text contrast meets WCAG AA;
  - every control works by keyboard and has an accessible name;
  - `aria-current` marks the right place in both navigation bars.
- **Report exactly what was checked.** A screen-reader pass has never been done.
  Do not claim one, or any other QA that was not performed.

## 7. Review

- Read the final diff. Remove anything outside the approved scope.
- State results as **verified** (tested, built, seen in the browser) or
  **assumed** (not checked, and why).
- Commit only when asked; commit messages carry no AI attribution trailers.
  Never push without approval.

## 8. Handoff

- Update `ROADMAP.md` and `KNOWN_LIMITATIONS.md` when status changed.
- Report changed files, test and build results, known limitations and
  follow-up work.
- Recommend the single best next slice.

---

## Definition of done

Writing the code is not done, and passing tests is not done. A change is done
when:
1. it is technically correct: tests, type checks, lint baseline and builds pass;
2. it serves the learner: it holds up against the blueprint's decision criteria,
   and when it is visible, it has been checked in the browser;
3. for curriculum work, the concept meets `LEARNING_LOOP.md` §25; for game work,
   the game meets `GAME_DESIGN.md`;
4. the roadmap and limitations say what is now true.

---

## Release checklist

Production runs on Render from `render.yaml`: one web service serving the
client and the API, plus a free Postgres. Every step marked **(approval)**
needs explicit approval at the time.

1. **Branch and region.** The `jolt` service deploys the branch chosen when it
   was set up; Render's deploy log (2026-10-25) shows `pre-jolt-visual-redesign`.
   Confirm it before pushing. `jolt` is in Ohio and `jolt-db` in Oregon, so the
   service connects over the database's External URL (`DATABASE_URL` set in the
   dashboard, `DATABASE_SSL=true`); the internal URL only resolves within one
   region. A Blueprint manages these resources: a push that changes
   `render.yaml` triggers a sync that creates any added resource and rewrites
   the env vars it declares, so push such a change on its own and on purpose
   **(approval)**.
2. **Release blockers.** Everything under "Release blockers" in `ROADMAP.md` is
   resolved, including `npm audit --omit=dev` reporting 0 in `server/` and
   `client/`.
3. **Build.** Node 22.19.0 (`.node-version`). Run Render's build command on a
   clean export of the release commit with `NODE_ENV=production`:
   `npm ci --include=dev --prefix client && npm run build --prefix client && npm ci --include=dev --prefix server && npm run build --prefix server`.
4. **Database (approval).** Render runs no migrations or seeds: there is no
   pre-deploy step, and the free plan has no shell. From a trusted machine,
   against the production `DATABASE_URL`:
   - take a `pg_dump` backup first;
   - run `cd server && npm run migrate:prod`, then `npm run seed:prod`;
   - confirm the new seeds' content is present.
5. **Environment.** `NODE_ENV`, `DATABASE_URL` and `SESSION_SECRET` are set
   by `render.yaml`. Leave `CLIENT_ORIGIN` and `COOKIE_SAMESITE` unset: the
   client and API share one origin.
6. **Health.** `/api/health` responds after deploy.
7. **Smoke test:**
   - register a new account, play the tutorial, finish a lesson;
   - Code Blitz relaxed with a hint, Flush, Bug Hunt;
   - Skills, the theme switch, pause and resume, log out and back in;
   - the session cookie is `Secure` behind Render's proxy.
8. **Free tier.** The service sleeps when idle, so expect cold starts. Free
   Postgres instances can expire; check Render's current terms and keep backups.
9. **Rollback.** Render's "roll back to previous deploy". Migrations are
   additive; restore the backup if data must be rolled back **(approval)**.
10. **Docs.** Update `ROADMAP.md` and `KNOWN_LIMITATIONS.md` with what shipped.
