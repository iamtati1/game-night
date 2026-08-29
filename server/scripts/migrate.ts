/**
 * Schema migrations: npm run migrate
 *
 * Brings any Jolt database up to the current schema. Safe to run repeatedly --
 * a migration that has already been applied is skipped, so the command is the
 * same whether the database is empty or already current.
 *
 * This exists because the alternative was fifteen `psql -f` invocations in the
 * right order, and we already lost an afternoon to that: a seed run against
 * $DATABASE_URL, which was unset, connected to a database named after the OS
 * user and reported the Bug Hunt tables as missing. A runner that reads its
 * connection from one place removes that entire class of mistake.
 *
 * Pass --dry-run to list what would be applied without touching anything.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pool } from "../src/db.js";
import {
    connectOrExplain,
    readSqlDirectory,
    reportFailure,
    runInTransaction
} from "./sqlFiles.js";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/**
 * The ledger. Created by the runner rather than by a migration, because it has
 * to exist before the first migration can be recorded -- a migration that
 * creates the migrations table cannot record itself.
 *
 * The checksum is stored so an edit to an already-applied migration can be
 * detected. Editing one is almost always a mistake: it has already run
 * everywhere, so the change silently applies to new databases only, and the two
 * drift apart with nothing to show for it.
 */
const LEDGER = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
        name        TEXT PRIMARY KEY,
        checksum    TEXT NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
`;

const dryRun = process.argv.includes("--dry-run");

async function main(): Promise<number> {
    const files = readSqlDirectory(MIGRATIONS_DIR);

    if (files.length === 0) {
        console.error(`No .sql files found in ${MIGRATIONS_DIR}`);
        return 1;
    }

    const client = await connectOrExplain(pool);

    if (!client) {
        await pool.end();
        return 1;
    }

    try {
        await client.query(LEDGER);

        const applied = new Map(
            (
                await client.query<{ name: string; checksum: string }>(
                    "SELECT name, checksum FROM schema_migrations"
                )
            ).rows.map((r) => [r.name, r.checksum])
        );

        // Drift check before applying anything. Refusing up front beats applying
        // three new migrations and then mentioning that an old one no longer
        // matches what this database was built from.
        const drifted = files.filter(
            (f) => applied.has(f.name) && applied.get(f.name) !== f.checksum
        );

        if (drifted.length > 0) {
            console.error("\n  Applied migrations have been edited since they ran:\n");
            for (const f of drifted) {
                console.error(`    ${f.name}  recorded ${applied.get(f.name)}, file is ${f.checksum}`);
            }
            console.error(
                "\n  This database was built from a different version of those files.\n" +
                    "  Add a new migration rather than editing one that has already run.\n"
            );
            return 1;
        }

        const pending = files.filter((f) => !applied.has(f.name));

        console.log(`  ${files.length} migrations, ${applied.size} applied, ${pending.length} pending`);

        if (pending.length === 0) {
            console.log("  Database is up to date.");
            return 0;
        }

        if (dryRun) {
            console.log("\n  Would apply:");
            for (const f of pending) console.log(`    ${f.name}`);
            return 0;
        }

        console.log("");

        for (const file of pending) {
            process.stdout.write(`  applying ${file.name} ... `);

            try {
                await runInTransaction(client, file, async (tx) => {
                    await tx.query(
                        "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
                        [file.name, file.checksum]
                    );
                });
                console.log("ok");
            } catch (error) {
                console.log("FAILED");
                reportFailure("migration", file, error);
                // Stop here rather than carrying on. Later migrations assume the
                // schema this one was supposed to produce.
                return 1;
            }
        }

        console.log(`\n  Applied ${pending.length} migration(s). Database is up to date.`);
        return 0;
    } finally {
        client.release();
        await pool.end();
    }
}

process.exit(await main());
