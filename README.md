# game-night

A gamified software engineering learning platform built with React, TypeScript, Express, PostgreSQL, and AI.

## Local setup

Requires Node 22+ and a running PostgreSQL.

```bash
createdb code_blitz_dev
cp server/.env.example server/.env   # then set DATABASE_URL and SESSION_SECRET
```

Install each app separately — there is no root package.

```bash
cd server && npm install
cd ../client && npm install
```

### Database

Both commands live in `server/` and read `DATABASE_URL` from `server/.env`, so
there is one connection target and no chance of applying SQL to whichever
database your shell happened to default to.

```bash
cd server
npm run migrate    # bring the schema up to date
npm run seed       # load the question, snippet and incident banks
```

`npm run migrate` records what it has applied in a `schema_migrations` table, so
it is safe to run repeatedly — already-applied migrations are skipped. Add
`-- --dry-run` to list what would run without touching the database. It refuses
to continue if a migration that has already run has since been edited.

`npm run seed` is safe to re-run too: each seed file skips content that is
already present, so the command converges on the same banks rather than
duplicating them.

### Running

```bash
cd server && npm run dev     # http://localhost:3000
cd client && npm run dev     # http://localhost:5173
```

### Tests

```bash
cd server && npm test        # scoring, routes, registry, migration runner
cd client && npm test        # component and page tests
```

Neither suite needs a running PostgreSQL. The database tests build an ephemeral
one in-process from the real migrations and seeds, so they check the shipping
SQL rather than a hand-written fixture.

Type checks and the production build:

```bash
cd server && npm run typecheck
cd client && npm run typecheck && npm run build
```

## Known limitations

**Postgres.app refuses `trust` authentication to some applications.** Postgres.app
18 preloads `auth_permission_dialog`, which gates password-less connections on a
per-application macOS approval. A connection from an application that has not
been approved fails with:

```
FATAL: Postgres.app rejected "trust" authentication
```

Grant the application access in **Postgres.app → Settings → app permissions**, or
connect with a role password instead. The approval is per application, not per
command, so every tool launched by that application is covered at once. The test
suites are unaffected — they never open a connection to this database.
