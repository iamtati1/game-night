/**
 * Shared plumbing for the migration and seed runners.
 *
 * Both do the same three things -- read a directory of .sql files in a
 * deterministic order, run each one inside a transaction the runner controls,
 * and stop loudly on the first failure -- so the parts that are genuinely the
 * same live here and the two entry points stay short enough to read.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PoolClient } from "pg";

export interface SqlFile {
    /** The filename, which is also the ledger key. Never the absolute path -- a
     *  ledger keyed on a path would not survive the repo moving. */
    name: string;
    sql: string;
    checksum: string;
}

/**
 * Files in lexicographic order, which for a `NNN_name.sql` convention is also
 * numeric order. Deliberately not sorted by mtime or by directory order: both
 * vary by machine, and a migration runner that applies 014 before 013 on one
 * developer's laptop is worse than no runner at all.
 */
export function readSqlDirectory(dir: string): SqlFile[] {
    return readdirSync(dir)
        .filter((name) => name.endsWith(".sql"))
        .sort((a, b) => a.localeCompare(b, "en"))
        .map((name) => {
            const sql = readFileSync(join(dir, name), "utf8");

            return {
                name,
                sql,
                checksum: createHash("sha256").update(sql).digest("hex").slice(0, 16)
            };
        });
}

/**
 * Removes a file's own BEGIN;/COMMIT; so the runner can own the transaction.
 *
 * Six of the fifteen migrations wrap themselves. Left in place they are a real
 * hazard: the file's COMMIT would close the transaction the runner opened, and
 * the ledger INSERT that follows would land outside it -- so a crash between
 * the two would leave a migration applied but unrecorded, and the next run
 * would try to apply it again against a schema that already has it.
 *
 * Stripping instead makes every file behave identically: schema change and
 * ledger row commit together or not at all. The files on disk are untouched;
 * this only affects what gets sent to the server.
 *
 * Only whole-line, statement-level BEGIN;/COMMIT; are matched, so the word
 * appearing inside a dollar-quoted function body or a comment is left alone.
 */
export function stripOwnTransaction(sql: string): string {
    return sql
        .split("\n")
        .filter((line) => !/^\s*(BEGIN|COMMIT)\s*;\s*$/i.test(line))
        .join("\n");
}

/**
 * Runs one file inside a transaction, along with whatever bookkeeping the
 * caller wants recorded with it.
 *
 * The bookkeeping runs inside the same transaction on purpose -- that is the
 * whole point of taking the transaction away from the file.
 */
export async function runInTransaction(
    client: PoolClient,
    file: SqlFile,
    record?: (client: PoolClient) => Promise<void>
): Promise<void> {
    await client.query("BEGIN");

    try {
        await client.query(stripOwnTransaction(file.sql));
        if (record) await record(client);
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
    }
}

/** Formats a failure so the operator sees which file broke and why, not a stack. */
export function reportFailure(kind: string, file: SqlFile, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const detail =
        error && typeof error === "object" && "detail" in error
            ? String((error as { detail?: unknown }).detail ?? "")
            : "";

    console.error(`\n  ${kind} FAILED: ${file.name}`);
    console.error(`  ${message}`);
    if (detail) console.error(`  ${detail}`);
    console.error("\n  Nothing from this file was applied -- it was rolled back.");
}

/**
 * Connects, or explains why it could not in one line instead of a stack trace.
 *
 * The failure this is really for is an unset or wrong DATABASE_URL, which is
 * how the seed-006 afternoon was lost: psql fell back to a database named after
 * the OS user and reported perfectly present tables as missing. Naming the
 * target in the error makes that self-diagnosing.
 */
export async function connectOrExplain(pool: {
    connect: () => Promise<PoolClient>;
}): Promise<PoolClient | null> {
    try {
        return await pool.connect();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const url = process.env.DATABASE_URL;
        const target = url ? url.replace(/\/\/[^@]*@/, "//***@") : "(DATABASE_URL is not set)";

        console.error(`\n  Could not connect to the database.`);
        console.error(`  ${message}`);
        console.error(`  Target: ${target}\n`);
        return null;
    }
}
