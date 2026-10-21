/**
 * Duplicate-question reconciliation: npm run reconcile:duplicates
 *
 * DRY RUN BY DEFAULT. Without --apply it reports, then performs the whole
 * reconciliation inside a transaction, checks every invariant, and ROLLS BACK.
 * Nothing changes. The report -- and the token it prints -- is what gets
 * reviewed.
 *
 * WHAT IT RECONCILES. Before seeds named their questions, 34 of them found an
 * existing row by prompt text, and five later seeds rewrite prompts -- so every
 * `npm run seed` inserted another copy. After `npm run seed` on the current
 * code, a database seeded that way holds:
 *
 *   - a KEEPER per question: the oldest copy, now carrying the question's name
 *     (adoption names the oldest unnamed copy, `ORDER BY id`);
 *   - DUPLICATES: jolt-sourced rows still unnamed, each with its own challenge
 *     and options.
 *
 * NOTHING IS WRITTEN unless every one of these holds:
 *
 *   TARGET    --database=<name> equals current_database(); the server answers
 *             over a Unix socket or loopback; and its cluster identifier
 *             matches global/pg_control on this machine's disk. The URL comes
 *             only from server/.env -- a different DATABASE_URL exported in the
 *             shell is refused, not silently used.
 *   SEEDED    the named questions are exactly those a fresh build of this
 *             checkout's seeds names. Anything missing or extra stops it.
 *   MAPPED    each duplicate has exactly one keeper: a named row with the
 *             identical prompt, or one of the two reviewed 029 replacements
 *             (REVIEWED_REPLACEMENTS), on the same concept and demand.
 *   OLDEST    every keeper's id is lower than its duplicate's.
 *   UNUSED    no session_questions row cites a duplicate or its options, and
 *             its challenge holds nothing else.
 *   CONFIRMED with --apply, --confirm equals the token computed live in the
 *             same transaction: counts, repair count, and a digest of the exact
 *             ids. A database that moved since the review produces a different
 *             token, and nothing is applied.
 *
 * Then: keeper repairs, the deletes, and a census that must account for every
 * row -- or the whole transaction rolls back.
 *
 *   npm run reconcile:duplicates -- --database=code_blitz_dev
 *   npm run reconcile:duplicates -- --database=code_blitz_dev --apply --confirm=<token>
 *
 * BEFORE APPLYING TO A DATABASE THAT MATTERS, take a backup outside the
 * repository and prove it restores (it holds users' emails and password
 * hashes, so it must never sit in the working tree):
 *
 * Run from the repository root. It is one subshell so a failed check stops
 * every later step with a nonzero status -- and `exit` leaves only the
 * subshell, never the terminal it was pasted into:
 *
 *   (
 *     set -eu
 *     [ "$(grep -cE '^DATABASE_URL=' server/.env)" = 1 ] || { echo "STOP: DATABASE_URL missing or repeated" >&2; exit 1; }
 *     U=$(grep -E '^DATABASE_URL=' server/.env | cut -d= -f2-)
 *     [ -n "$U" ] || { echo "STOP: DATABASE_URL is empty" >&2; exit 1; }
 *     mkdir -p "$HOME/jolt-backups" && chmod 700 "$HOME/jolt-backups"
 *     F="$HOME/jolt-backups/pre-reconcile-$(date +%Y%m%d-%H%M%S).dump"
 *     pg_dump --format=custom --file="$F" "$U"
 *     pg_restore --list "$F" > /dev/null
 *     echo "readable: $F"
 *   )
 *
 * then restore the file it printed into a scratch database and compare its
 * census with the source before reconciling:
 *
 *   F=<the path printed above>
 *   createdb jolt_backup_check && pg_restore --no-owner --dbname=jolt_backup_check "$F"
 *   # compare COUNT(*) of questions, challenges, question_options,
 *   # session_questions in both; drop jolt_backup_check afterwards.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    Refusal,
    freshNamedPopulation,
    judgeEnvironment,
    judgeTarget,
    judgeUrl,
    readTargetFacts,
    reconcile,
    type Db
} from "./reconcileDuplicates.js";

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function readEnvFile(): string | null {
    try {
        return readFileSync(join(SERVER_ROOT, ".env"), "utf8");
    } catch {
        return null;
    }
}

const redact = (url: string) => url.replace(/\/\/[^@/]*@/, "//***@");

async function main(): Promise<number> {
    const args = process.argv.slice(2);
    const apply = args.includes("--apply");
    const confirm = args.find((a) => a.startsWith("--confirm="))?.slice("--confirm=".length);
    const database = args.find((a) => a.startsWith("--database="))?.slice("--database=".length);

    // Everything below refuses BEFORE a connection is opened.
    const env = judgeEnvironment(process.env.DATABASE_URL, readEnvFile());
    if ("refusal" in env) return refused(env.refusal);
    const urlProblem = judgeUrl(env.url);
    if (urlProblem) return refused(urlProblem);
    if (!database) return refused("--database=<name> is required");

    console.log(`\n  target:   ${redact(env.url)}`);
    console.log(`  mode:     ${apply ? "APPLY" : "dry run (rolled back)"}`);
    console.log("  building the expected names from this checkout's seeds ...");
    const expectedNamed = await freshNamedPopulation(SERVER_ROOT);

    const pg = await import("pg");
    const client = new pg.default.Client({ connectionString: env.url });
    await client.connect();

    try {
        const result = await reconcile(client as unknown as Db, {
            database,
            apply,
            confirm,
            expectedNamed,
            log: (line) => console.log(line),
            verifyTarget: async (db) => {
                const problem = judgeTarget(database, await readTargetFacts(db));
                if (problem) throw new Refusal(problem);
                console.log(`  verified: local cluster, database "${database}"\n`);
            }
        });

        if (result.outcome === "committed") {
            console.log("\n  COMMITTED.");
        } else {
            console.log("\n  All checks passed. ROLLED BACK -- nothing changed.");
            console.log(`  To apply: npm run reconcile:duplicates -- --database=${database} --apply --confirm=${result.token}`);
        }
        return 0;
    } catch (error) {
        console.error(`\n  ABORTED, rolled back: ${error instanceof Error ? error.message : String(error)}`);
        return 1;
    } finally {
        await client.end();
    }
}

function refused(reason: string): number {
    console.error(`\n  REFUSED before connecting: ${reason}`);
    return 1;
}

process.exit(await main());
