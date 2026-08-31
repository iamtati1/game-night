/**
 * Content seeds: npm run seed
 *
 * Loads the hand-authored Code Blitz questions, Flush snippets and Bug Hunt
 * incidents. Run after `npm run migrate` -- the seeds insert into tables the
 * migrations create.
 *
 * Unlike migrations there is no ledger here, and that is deliberate rather than
 * an omission. Every seed file already guards itself: each one skips a row whose
 * natural key is already present, so running them all every time converges on
 * the same content instead of duplicating it. A ledger would add a second,
 * weaker copy of a guarantee the files already make -- and would stop a seed
 * from picking up content added to a file later, which is the main reason to
 * re-run one.
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

const SEEDS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "seeds");

async function main(): Promise<number> {
    const files = readSqlDirectory(SEEDS_DIR);

    if (files.length === 0) {
        console.error(`No .sql files found in ${SEEDS_DIR}`);
        return 1;
    }

    const client = await connectOrExplain(pool);

    if (!client) {
        await pool.end();
        return 1;
    }

    try {
        console.log(`  ${files.length} seed files\n`);

        for (const file of files) {
            process.stdout.write(`  seeding ${file.name} ... `);

            try {
                await runInTransaction(client, file);
                console.log("ok");
            } catch (error) {
                console.log("FAILED");
                reportFailure("seed", file, error);
                return 1;
            }
        }

        // What actually landed, so the run ends with the numbers rather than
        // with "ok" five times and no idea whether the bank is populated.
        const counts = await client.query<{ label: string; n: string }>(`
            SELECT 'code blitz questions' AS label, COUNT(*)::text AS n FROM questions WHERE is_active
            UNION ALL
            SELECT 'flush snippets', COUNT(*)::text FROM flush_snippets WHERE is_active
            UNION ALL
            SELECT 'bug hunt incidents', COUNT(*)::text FROM bug_hunt_incidents WHERE is_active
            ORDER BY 1
        `);

        console.log("");
        for (const row of counts.rows) console.log(`  ${row.n.padStart(4)}  ${row.label}`);

        return 0;
    } finally {
        client.release();
        await pool.end();
    }
}

process.exit(await main());
