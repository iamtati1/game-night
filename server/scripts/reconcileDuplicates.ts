/**
 * The duplicate-question reconciliation, as functions over a database handle.
 *
 * The CLI (reconcile-duplicates.ts) owns arguments, the connection and the
 * fresh build that defines the expected names. Everything that decides what is
 * deleted, and everything that can refuse, is here -- so the tests exercise the
 * same code the CLI runs, against PGlite, rather than a copy of it.
 *
 * See reconcile-duplicates.ts for what is reconciled and why.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The part of pg's client (and of a PGlite adapter) this needs. */
export interface Db {
    query<T = Record<string, unknown>>(
        sql: string,
        params?: unknown[]
    ): Promise<{ rows: T[]; rowCount: number | null }>;
}

export interface Repair {
    kind: "explanation" | "option";
    source: string;
    ref: string;
    from: string;
    to: string;
}

/** Keeper content as a fresh build of the current seeds produces it. */
export const REPAIRS: Repair[] = [
    {
        kind: "explanation",
        source: "jolt-variables-practice",
        ref: "vars-009",
        from: "Starting `crew` at `3` means the name holds that number straight away. Joining it to `\"Crew: \"` uses the value, so the output ends in the digit rather than the word crew.",
        to: "The name was created and given 3 in the same line, so it already holds a value by the time it is logged."
    },
    {
        kind: "explanation",
        source: "jolt-variables-predict",
        ref: "vars-predict-003",
        from: "The `+` joins the text `\"Bays: \"` to the value `bays` holds. Because `bays` is a name rather than text, JavaScript uses the `4`.",
        to: "The name `bays` stands for the value 4. Writing the name without quotes looks up what it holds."
    },
    {
        kind: "explanation",
        source: "jolt-variables-predict",
        ref: "vars-predict-005",
        from: "The name `ship` stands for the value `\"Aurora\"`. Logging the name prints what it holds, not the letters s-h-i-p. The quotes were only how the text was written in the code, so they are not printed.",
        // As seed 086 rewrote it: the question no longer declares one name from another.
        to: "Each declaration brings its own name into existence with its own value, and neither affects the other. What is displayed follows the console.log lines, not the order the names were declared in."
    },
    {
        kind: "option",
        source: "jolt-values-completion",
        ref: "values-completion-004",
        from: "javaScript never displays mathematical symbols",
        to: "JavaScript never displays mathematical symbols"
    },
    {
        kind: "option",
        source: "jolt-operators-completion",
        ref: "type-coercion-explain-01",
        from: "javaScript rounds the result of subtraction",
        to: "JavaScript rounds the result of subtraction"
    },
    {
        kind: "option",
        source: "jolt-errors-completion",
        ref: "debugging-strategy-explain-01",
        from: "javaScript only applies the first change it finds",
        to: "JavaScript only applies the first change it finds"
    },
    {
        kind: "explanation",
        source: "jolt-early-diagnostics",
        ref: "early-004",
        from: "The line `let b = a;` reads `a` and stores its value, `5`. Logging `b` prints that copy.",
        to: "Reading `a` fetches the value it holds at that moment, which was 5. What `b` gets is that number, not a link to `a`, so later changes to `a` have nothing to travel along."
    }
];

/**
 * The only duplicates allowed to map to a keeper whose prompt differs.
 *
 * 029 replaced these two outright, so a copy seeded before the replacement
 * still carries the old wording and no keeper has it. Each is identified by
 * the keeper's name and the duplicate's exact old prompt; nothing else is
 * matched by anything but identical text.
 */
export const REVIEWED_REPLACEMENTS = [
    {
        source: "jolt-variables-practice",
        keeperRef: "vars-009",
        oldPrompt: 'What does this log?\n\nlet crew = 3;\nconsole.log("Crew: " + crew);'
    },
    {
        source: "jolt-variables-predict",
        keeperRef: "vars-predict-003",
        oldPrompt: 'What does this log?\n\nlet bays = 4;\nconsole.log("Bays: " + bays);'
    }
] as const;

export class Refusal extends Error {
    override name = "Refusal";
}

const refuse = (message: string): never => {
    throw new Refusal(message);
};

/* ------------------------------------------------------------ TARGET */

/**
 * Whether a connection string names this machine.
 *
 * Client-side and therefore advisory -- a tunnel makes anything look local --
 * which is why judgeTarget() checks the server's own answer as well.
 */
export function judgeUrl(url: string | undefined): string | null {
    if (!url) return "no database URL";

    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return "the database URL does not parse";
    }

    if (!/^postgres(ql)?:$/.test(parsed.protocol)) return `unexpected protocol ${parsed.protocol}`;

    const socketHost = parsed.searchParams.get("host");
    const host = parsed.hostname;
    if (host === "" && (socketHost === null || socketHost.startsWith("/"))) return null;
    if (["localhost", "127.0.0.1", "[::1]", "::1"].includes(host)) return null;

    return `the database URL points at ${host || socketHost}, not this machine`;
}

/**
 * Whether the URL in the process can be trusted to be the one in .env.
 *
 * `node --env-file` does not override a variable already exported in the
 * shell, so a terminal that exported a production URL earlier would otherwise
 * be reconciled silently. Both must agree, or nothing connects.
 */
export function judgeEnvironment(
    processUrl: string | undefined,
    envFileText: string | null
): { url: string } | { refusal: string } {
    if (envFileText === null) return { refusal: "server/.env not found; it is the only accepted source" };

    const values = envFileText
        .split(/\r?\n/)
        .map((line) => /^\s*DATABASE_URL\s*=\s*(.*?)\s*$/.exec(line)?.[1])
        .filter((v): v is string => v !== undefined)
        .map((v) => v.replace(/^(['"])(.*)\1$/, "$2"));

    if (values.length !== 1) return { refusal: `server/.env defines DATABASE_URL ${values.length} times` };
    const fileUrl = values[0]!;
    if (!fileUrl) return { refusal: "DATABASE_URL in server/.env is empty" };

    if (processUrl !== undefined && processUrl !== fileUrl) {
        return {
            refusal:
                "DATABASE_URL in the environment differs from server/.env -- " +
                "unset it (`unset DATABASE_URL`) so the target is the one in .env"
        };
    }

    return { url: fileUrl };
}

export interface TargetFacts {
    database: string;
    /** host(inet_server_addr()): null over a Unix socket. */
    serverAddr: string | null;
    /** pg_control_system().system_identifier, as the server reports it. */
    serverClusterId: string | null;
    /** The same identifier read from global/pg_control on THIS machine's disk. */
    localClusterId: string | null;
}

function isLoopback(addr: string): boolean {
    return addr === "::1" || /^127\./.test(addr) || /^::ffff:127\./i.test(addr);
}

/**
 * Whether the connected server is the expected local database.
 *
 * Three independent facts, all required. The NAME must be the one asked for
 * -- but a name proves nothing alone, so the server must also report a
 * socket or loopback address, and its cluster identifier must match the
 * pg_control file on this disk. A tunnel or proxy can fake loopback; it
 * cannot make a remote cluster's identifier appear in a local file.
 */
export function judgeTarget(expectedDatabase: string | undefined, facts: TargetFacts): string | null {
    if (!expectedDatabase) return "--database=<name> is required";
    if (facts.database !== expectedDatabase) {
        return `connected to "${facts.database}", but --database says "${expectedDatabase}"`;
    }
    if (facts.serverAddr !== null && !isLoopback(facts.serverAddr)) {
        return `the server answered from ${facts.serverAddr}, which is not this machine`;
    }
    if (!facts.serverClusterId) return "the server did not report a cluster identifier";
    if (!facts.localClusterId) return "no local pg_control to compare the cluster identifier against";
    if (facts.serverClusterId !== facts.localClusterId) {
        return "the server's cluster identifier is not the local cluster's -- a tunnel or proxy?";
    }
    return null;
}

/** Reads the facts judgeTarget() needs from a real PostgreSQL server. */
export async function readTargetFacts(db: Db): Promise<TargetFacts> {
    const row = (
        await db.query<{ database: string; server_addr: string | null; data_directory: string; cluster: string }>(
            `SELECT current_database() AS database,
                    host(inet_server_addr()) AS server_addr,
                    current_setting('data_directory') AS data_directory,
                    (SELECT system_identifier::text FROM pg_control_system()) AS cluster`
        )
    ).rows[0]!;

    let localClusterId: string | null = null;
    try {
        localClusterId = readFileSync(join(row.data_directory, "global", "pg_control")).readBigUInt64LE(0).toString();
    } catch {
        localClusterId = null;
    }

    return {
        database: row.database,
        serverAddr: row.server_addr,
        serverClusterId: row.cluster,
        localClusterId
    };
}

/* -------------------------------------------------------------- PLAN */

export interface Duplicate {
    id: string;
    challenge_id: string | null;
    source: string;
    keeper_id: string | null;
    keeper_ref: string | null;
    keepers: number;
    via: string | null;
    same_rung: boolean | null;
    options: number;
    evidence: number;
    challenge_refs: number;
}

const DUPLICATES = `
WITH dup AS (
    SELECT q.id, q.source, q.prompt, q.challenge_id, ch.concept_id, ch.demand_id
    FROM questions q
    LEFT JOIN challenges ch ON ch.id = q.challenge_id
    WHERE q.source LIKE 'jolt-%' AND q.external_ref IS NULL
),
named AS (
    SELECT q.id, q.source, q.prompt, q.external_ref, ch.concept_id, ch.demand_id
    FROM questions q
    LEFT JOIN challenges ch ON ch.id = q.challenge_id
    WHERE q.external_ref IS NOT NULL
),
reviewed AS (
    SELECT * FROM jsonb_to_recordset($1::jsonb) AS r(source TEXT, "keeperRef" TEXT, "oldPrompt" TEXT)
),
candidates AS (
    SELECT d.id, n.id AS keeper_id, n.external_ref AS keeper_ref, 'identical prompt' AS via,
           (n.concept_id = d.concept_id AND n.demand_id = d.demand_id) AS same_rung
    FROM dup d JOIN named n ON n.source = d.source AND n.prompt = d.prompt
    UNION ALL
    SELECT d.id, n.id, n.external_ref, 'reviewed replacement',
           (n.concept_id = d.concept_id AND n.demand_id = d.demand_id)
    FROM dup d
    JOIN reviewed r ON r.source = d.source AND r."oldPrompt" = d.prompt
    JOIN named n ON n.source = r.source AND n.external_ref = r."keeperRef"
)
SELECT d.id::text AS id, d.challenge_id::text AS challenge_id, d.source,
       MIN(c.keeper_id)::text AS keeper_id, MIN(c.keeper_ref) AS keeper_ref,
       COUNT(DISTINCT c.keeper_id)::int AS keepers,
       MIN(c.via) AS via,
       BOOL_AND(c.same_rung) AS same_rung,
       (SELECT COUNT(*) FROM question_options o WHERE o.question_id = d.id)::int AS options,
       ((SELECT COUNT(*) FROM session_questions s WHERE s.question_id = d.id)
        + (SELECT COUNT(*) FROM session_questions s
           JOIN question_options o ON o.id = s.selected_option_id
           WHERE o.question_id = d.id))::int AS evidence,
       ((SELECT COUNT(*) FROM questions q2 WHERE q2.challenge_id = d.challenge_id AND q2.id <> d.id)
        + (SELECT COUNT(*) FROM bug_hunt_incidents i WHERE i.challenge_id = d.challenge_id)
        + (SELECT COUNT(*) FROM flush_snippets f WHERE f.challenge_id = d.challenge_id)
        + (SELECT COUNT(*) FROM activity_completions a WHERE a.challenge_id = d.challenge_id)
        + (SELECT COUNT(*) FROM introduction_completions a WHERE a.challenge_id = d.challenge_id))::int
           AS challenge_refs
FROM dup d
LEFT JOIN candidates c ON c.id = d.id
GROUP BY d.id, d.challenge_id, d.source
ORDER BY d.id`;

const CENSUS = `
SELECT
    (SELECT COUNT(*) FROM questions)::int AS questions,
    (SELECT COUNT(*) FROM challenges)::int AS challenges,
    (SELECT COUNT(*) FROM question_options)::int AS options,
    (SELECT COUNT(*) FROM session_questions)::int AS session_questions,
    (SELECT COUNT(*) FROM activity_completions)::int AS activity_completions,
    (SELECT COUNT(*) FROM introduction_completions)::int AS introduction_completions,
    (SELECT COUNT(*) FROM questions WHERE external_ref IS NOT NULL)::int AS named,
    (SELECT COUNT(*) FROM questions WHERE source LIKE 'jolt-%' AND external_ref IS NULL)::int AS unnamed_jolt,
    (SELECT COALESCE(SUM(n - 1), 0)::int FROM
        (SELECT COUNT(*) n FROM questions GROUP BY prompt HAVING COUNT(*) > 1) t) AS duplicate_prompts,
    (SELECT COUNT(*) FROM questions q WHERE q.is_active AND q.challenge_id IS NOT NULL AND (
        (SELECT COUNT(*) FROM question_options o WHERE o.question_id = q.id AND o.is_active) < 2 OR
        (SELECT COUNT(*) FROM question_options o
         WHERE o.question_id = q.id AND o.is_active AND o.is_correct) <> 1))::int AS active_unplayable`;

export type Census = Record<string, number>;

export async function census(db: Db): Promise<Census> {
    return (await db.query<Census>(CENSUS)).rows[0]!;
}

/** Every named question as `source/external_ref`. */
export async function namedPopulation(db: Db): Promise<Set<string>> {
    const rows = await db.query<{ k: string }>(
        "SELECT source || '/' || external_ref AS k FROM questions WHERE external_ref IS NOT NULL"
    );
    return new Set(rows.rows.map((r) => r.k));
}

/**
 * Each repair's state: pending (old text present), done (new text present),
 * or neither -- which is refused, because it means the keeper holds content
 * this script was not reviewed against.
 */
async function repairStates(db: Db): Promise<{ pending: Repair[]; unexpected: Repair[] }> {
    const pending: Repair[] = [];
    const unexpected: Repair[] = [];

    for (const r of REPAIRS) {
        const count = async (text: string) =>
            (
                await db.query<{ n: number }>(
                    r.kind === "explanation"
                        ? `SELECT COUNT(*)::int n FROM questions
                           WHERE source = $1 AND external_ref = $2 AND explanation = $3`
                        : `SELECT COUNT(*)::int n FROM question_options o JOIN questions q ON q.id = o.question_id
                           WHERE q.source = $1 AND q.external_ref = $2 AND o.option_text = $3`,
                    [r.source, r.ref, text]
                )
            ).rows[0]!.n;

        const from = await count(r.from);
        const to = await count(r.to);
        if (from === 1 && to === 0) pending.push(r);
        else if (!(from === 0 && to === 1)) unexpected.push(r);
    }

    return { pending, unexpected };
}

const numeric = (a: string, b: string) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0);

/**
 * The confirmation token: counts, then a digest of exactly what will change.
 *
 * Counts alone would accept a different set of rows that happened to number
 * the same; the digest pins the ids and the repairs.
 */
export function confirmationToken(questionIds: string[], challengeIds: string[], optionCount: number, repairs: Repair[]): string {
    const q = [...questionIds].sort(numeric);
    const c = [...challengeIds].sort(numeric);
    const r = repairs.map((x) => `${x.kind}:${x.source}/${x.ref}`).sort();
    const digest = createHash("sha256").update(JSON.stringify({ q, c, r })).digest("hex").slice(0, 16);
    return `${q.length}:${c.length}:${optionCount}:${r.length}:${digest}`;
}

/* ------------------------------------------------------------- RUN */

export interface ReconcileOptions {
    /** --database: must equal current_database(). */
    database: string | undefined;
    apply: boolean;
    confirm: string | undefined;
    /** Every name a fresh build of the current seeds produces. */
    expectedNamed: Set<string>;
    /** Refuses unless the connection is the expected local database. Runs before BEGIN. */
    verifyTarget: (db: Db) => Promise<void>;
    log?: (line: string) => void;
    /** Test seam: runs after the deletes, inside the transaction. */
    afterDelete?: () => Promise<void>;
}

export interface ReconcileResult {
    outcome: "committed" | "rolled-back";
    token: string;
    before: Census;
    after: Census;
    questionIds: string[];
    challengeIds: string[];
}

export async function reconcile(db: Db, options: ReconcileOptions): Promise<ReconcileResult> {
    const log = options.log ?? (() => {});

    // Before anything is opened, let alone written.
    await options.verifyTarget(db);

    await db.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    try {
        const result = await run(db, options, log);
        await db.query(result.outcome === "committed" ? "COMMIT" : "ROLLBACK");
        return result;
    } catch (error) {
        await db.query("ROLLBACK").catch(() => {});
        throw error;
    }
}

async function run(db: Db, options: ReconcileOptions, log: (line: string) => void): Promise<ReconcileResult> {
    /*
     * SEED PRECONDITION. "Unnamed" is only a safe definition of "duplicate"
     * once every keeper carries its name -- so the named set must be EXACTLY
     * what a fresh build of the current seeds produces. A seed that stopped
     * part-way, or one run on older code, leaves names missing or extra, and
     * this stops there.
     */
    const named = await namedPopulation(db);
    const missing = [...options.expectedNamed].filter((k) => !named.has(k));
    const extra = [...named].filter((k) => !options.expectedNamed.has(k));
    if (missing.length || extra.length) {
        refuse(
            `named questions do not match a fresh build of the current seeds ` +
                `(${named.size} named, ${options.expectedNamed.size} expected; ` +
                `${missing.length} missing, e.g. ${missing.slice(0, 3).join(", ") || "-"}; ` +
                `${extra.length} unexpected, e.g. ${extra.slice(0, 3).join(", ") || "-"}) -- ` +
                `run \`npm run seed\` on the current code first`
        );
    }

    const before = await census(db);
    const dups = (await db.query<Duplicate>(DUPLICATES, [JSON.stringify(REVIEWED_REPLACEMENTS)])).rows;
    const { pending, unexpected } = await repairStates(db);

    const questionIds = dups.map((d) => d.id);
    const challengeIds = dups.flatMap((d) => (d.challenge_id ? [d.challenge_id] : []));
    const optionCount = dups.reduce((n, d) => n + d.options, 0);
    const token = confirmationToken(questionIds, challengeIds, optionCount, pending);

    log(`  named:         ${named.size} (matches a fresh build)`);
    log(`  duplicates:    ${questionIds.length} questions, ${challengeIds.length} challenges, ${optionCount} options`);
    log(`  question ids:  ${[...questionIds].sort(numeric).join(",") || "(none)"}`);
    log(`  challenge ids: ${[...challengeIds].sort(numeric).join(",") || "(none)"}`);
    for (const d of dups) {
        log(`    ${d.id.padStart(5)} -> ${String(d.keeper_id).padStart(5)}  ${d.keeper_ref ?? "?"}  (${d.via ?? "no keeper"})`);
    }
    log(`  keeper repairs pending: ${pending.length}`);
    for (const r of pending) log(`    ${r.kind.padEnd(11)} ${r.source}/${r.ref}`);
    log(`  before: ${JSON.stringify(before)}`);
    log(`  token:  ${token}`);

    const ids = (list: Duplicate[]) => list.map((d) => d.id).join(",");

    const unmapped = dups.filter((d) => d.keepers !== 1);
    if (unmapped.length) refuse(`no single keeper for duplicates ${ids(unmapped)}`);

    const offRung = dups.filter((d) => d.same_rung !== true);
    if (offRung.length) refuse(`keeper is on a different concept or demand for ${ids(offRung)}`);

    // The keeper must be the OLDEST copy: the one learners met first. A newer
    // named copy means names were stamped by something other than the current
    // adoption rule, and deleting the original would keep the wrong row.
    const newer = dups.filter((d) => BigInt(d.keeper_id!) >= BigInt(d.id));
    if (newer.length) refuse(`keeper is not older than duplicates ${ids(newer)}`);

    const referenced = dups.filter((d) => d.evidence > 0 || d.challenge_refs > 0);
    if (referenced.length) refuse(`duplicates still referenced: ${ids(referenced)}`);

    const noChallenge = dups.filter((d) => d.challenge_id === null);
    if (noChallenge.length) refuse(`duplicates without a challenge: ${ids(noChallenge)}`);

    if (unexpected.length) {
        refuse(`keeper content matches neither side of repairs: ${unexpected.map((r) => r.ref).join(", ")}`);
    }

    if (options.apply && options.confirm !== token) {
        refuse(`--confirm=${options.confirm ?? "(missing)"} does not match this database (${token}); nothing applied`);
    }

    /* ---------------------------------------------------------- WRITES */

    for (const r of pending) {
        const result =
            r.kind === "explanation"
                ? await db.query(
                      `UPDATE questions SET explanation = $4, updated_at = CURRENT_TIMESTAMP
                       WHERE source = $1 AND external_ref = $2 AND explanation = $3`,
                      [r.source, r.ref, r.from, r.to]
                  )
                : await db.query(
                      `UPDATE question_options o SET option_text = $4
                       FROM questions q WHERE q.id = o.question_id
                         AND q.source = $1 AND q.external_ref = $2 AND o.option_text = $3`,
                      [r.source, r.ref, r.from, r.to]
                  );
        if (result.rowCount !== 1) refuse(`repair ${r.ref} updated ${result.rowCount} rows`);
    }

    // RESTRICT on every key into these tables: anything still pointing at a
    // row makes the DELETE itself fail, and the transaction with it.
    const deletedOptions = await db.query("DELETE FROM question_options WHERE question_id = ANY($1::bigint[])", [questionIds]);
    const deletedQuestions = await db.query("DELETE FROM questions WHERE id = ANY($1::bigint[])", [questionIds]);
    const deletedChallenges = await db.query("DELETE FROM challenges WHERE id = ANY($1::bigint[])", [challengeIds]);

    if (options.afterDelete) await options.afterDelete();

    const after = await census(db);
    log(`  after:  ${JSON.stringify(after)}`);

    const expect = (label: string, actual: number | null | undefined, wanted: number) => {
        if (actual !== wanted) refuse(`${label}: expected ${wanted}, got ${actual}`);
    };
    expect("options deleted", deletedOptions.rowCount, optionCount);
    expect("questions deleted", deletedQuestions.rowCount, questionIds.length);
    expect("challenges deleted", deletedChallenges.rowCount, challengeIds.length);
    expect("questions", after.questions, before.questions! - questionIds.length);
    expect("challenges", after.challenges, before.challenges! - challengeIds.length);
    expect("options", after.options, before.options! - optionCount);
    expect("named", after.named, before.named!);
    expect("session_questions", after.session_questions, before.session_questions!);
    expect("activity_completions", after.activity_completions, before.activity_completions!);
    expect("introduction_completions", after.introduction_completions, before.introduction_completions!);
    expect("unnamed jolt questions", after.unnamed_jolt, 0);
    expect("duplicate prompts", after.duplicate_prompts, 0);
    expect("active unplayable questions", after.active_unplayable, before.active_unplayable!);
    const left = await repairStates(db);
    expect("repairs left", left.pending.length + left.unexpected.length, 0);

    return {
        outcome: options.apply ? "committed" : "rolled-back",
        token,
        before,
        after,
        questionIds,
        challengeIds
    };
}

/**
 * The names a fresh build of this checkout's migrations and seeds produces --
 * the population a correctly seeded database must carry exactly.
 */
export async function freshNamedPopulation(serverRoot: string): Promise<Set<string>> {
    const { readdirSync } = await import("node:fs");
    const { PGlite } = await import("@electric-sql/pglite");
    const db = new PGlite();
    try {
        for (const dir of ["migrations", "seeds"]) {
            const base = join(serverRoot, dir);
            for (const file of readdirSync(base).filter((f) => f.endsWith(".sql")).sort()) {
                await db.exec(readFileSync(join(base, file), "utf8"));
            }
        }
        const rows = await db.query<{ k: string }>(
            "SELECT source || '/' || external_ref AS k FROM questions WHERE external_ref IS NOT NULL"
        );
        return new Set(rows.rows.map((r) => r.k));
    } finally {
        await db.close();
    }
}
