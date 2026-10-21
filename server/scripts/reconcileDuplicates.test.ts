import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { PGlite, type PGliteInterface } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import {
    REPAIRS,
    REVIEWED_REPLACEMENTS,
    Refusal,
    confirmationToken,
    judgeEnvironment,
    judgeTarget,
    judgeUrl,
    namedPopulation,
    reconcile,
    type Db,
    type ReconcileOptions
} from "./reconcileDuplicates.js";

/**
 * The reconciliation, driven through the real code against a database shaped
 * like the development one: a fresh build, plus newer unnamed copies of some
 * questions, the two reviewed 029 replacements, and keepers holding the stale
 * text the repairs exist for.
 *
 * The end state is asserted against the fresh build itself. Reconciliation is
 * correct when it turns the damaged database back into exactly what the seeds
 * produce -- not when its own counts agree with each other.
 */
const SERVER = new URL("../", import.meta.url);
const files = (dir: string) =>
    readdirSync(new URL(dir, SERVER))
        .filter((f) => f.endsWith(".sql"))
        .sort();

let base: PGlite;
let expectedNamed: Set<string>;
let baseContent: string[];

/** pg's { rows, rowCount } over PGlite. */
const adapt = (db: PGliteInterface): Db => ({
    query: async <T,>(sql: string, params?: unknown[]) => {
        const r = await db.query<T>(sql, params);
        return { rows: r.rows, rowCount: r.affectedRows ?? 0 };
    }
});

/** Everything a learner can see, by row id. Timestamps excluded. */
async function content(db: PGliteInterface): Promise<string[]> {
    const r = await db.query<{ line: string }>(`
        SELECT concat_ws(' | ', q.id, q.source, q.external_ref, q.prompt, q.explanation,
                         q.difficulty, q.topic, q.challenge_id, q.is_active,
                         (SELECT string_agg(concat_ws(':', o.id, o.option_text, o.is_correct,
                                                      o.is_active, o.display_order), ' ; ' ORDER BY o.id)
                          FROM question_options o WHERE o.question_id = q.id)) AS line
        FROM questions q ORDER BY q.id`);
    return r.rows.map((x) => x.line);
}

async function one(db: PGliteInterface, sql: string, params: unknown[] = []): Promise<number> {
    return Number((await db.query<{ n: number }>(sql, params)).rows[0]!.n);
}

/** The name checks of judgeTarget, against PGlite's own database name. */
const nameOnly: ReconcileOptions["verifyTarget"] = async () => {};

function targetFor(database: string): ReconcileOptions["verifyTarget"] {
    return async (db) => {
        const actual = (await db.query<{ d: string }>("SELECT current_database() AS d")).rows[0]!.d;
        const problem = judgeTarget(database, {
            database: actual,
            serverAddr: null,
            serverClusterId: "local",
            localClusterId: "local"
        });
        if (problem) throw new Refusal(problem);
    };
}

const EXACT_COPIES = ["assignment-operators-predict-01", "values-completion-002", "map-repair-01"];

/** Copies `ref` as a newer unnamed duplicate with its own challenge and options. */
async function duplicate(db: PGliteInterface, ref: string, prompt?: string): Promise<number> {
    await db.query(
        `WITH k AS (SELECT * FROM questions WHERE external_ref = $1),
              ch AS (INSERT INTO challenges (concept_id, demand_id, role, difficulty)
                     SELECT c.concept_id, c.demand_id, c.role, c.difficulty
                     FROM challenges c JOIN k ON k.challenge_id = c.id RETURNING id)
         INSERT INTO questions (prompt, difficulty, topic, challenge_type, challenge_id, source, explanation)
         SELECT COALESCE($2, k.prompt), k.difficulty, k.topic, k.challenge_type, ch.id, k.source, k.explanation
         FROM k, ch`,
        [ref, prompt ?? null]
    );
    const id = await one(db, "SELECT MAX(id)::int n FROM questions");
    await db.query(
        `INSERT INTO question_options (question_id, option_text, display_order, is_correct)
         SELECT $1, o.option_text, o.display_order, o.is_correct
         FROM question_options o JOIN questions k ON k.id = o.question_id WHERE k.external_ref = $2`,
        [id, ref]
    );
    return id;
}

/** A database with the development history: duplicates, replacements, stale keepers, evidence. */
async function devLike(): Promise<PGliteInterface> {
    const db = await base.clone();

    for (const ref of EXACT_COPIES) await duplicate(db, ref);
    for (const r of REVIEWED_REPLACEMENTS) await duplicate(db, r.keeperRef, r.oldPrompt);

    for (const r of REPAIRS) {
        if (r.kind === "explanation") {
            await db.query("UPDATE questions SET explanation = $1 WHERE source = $2 AND external_ref = $3", [
                r.from,
                r.source,
                r.ref
            ]);
        } else {
            await db.query(
                `UPDATE question_options o SET option_text = $1 FROM questions q
                 WHERE q.id = o.question_id AND q.source = $2 AND q.external_ref = $3 AND o.option_text = $4`,
                [r.from, r.source, r.ref, r.to]
            );
        }
    }

    // A learner who answered a KEEPER: their evidence must survive untouched.
    await db.exec(`
        INSERT INTO users (email, username, password_hash) VALUES ('reconcile@jolt.test', 'reconcile', 'x');
        INSERT INTO game_sessions (user_id, game_id, status, completed_at)
        SELECT id, (SELECT id FROM games WHERE slug = 'code-blitz'), 'completed', CURRENT_TIMESTAMP
        FROM users WHERE username = 'reconcile';
        INSERT INTO session_questions (game_session_id, question_id, display_order, prompt_text, status,
            served_at, selected_option_id, selected_option_text, correct_option_text, is_correct, answered_at)
        SELECT s.id, q.id, 1, q.prompt, 'answered', CURRENT_TIMESTAMP, o.id, o.option_text, o.option_text,
               TRUE, CURRENT_TIMESTAMP
        FROM game_sessions s, questions q JOIN question_options o ON o.question_id = q.id AND o.is_correct
        WHERE q.external_ref = 'assignment-operators-predict-01';
    `);
    return db;
}

const DUPS = EXACT_COPIES.length + REVIEWED_REPLACEMENTS.length;

function options(over: Partial<ReconcileOptions> = {}): ReconcileOptions {
    return {
        database: "postgres",
        apply: false,
        confirm: undefined,
        expectedNamed,
        verifyTarget: nameOnly,
        ...over
    };
}

beforeAll(async () => {
    base = new PGlite();
    for (const dir of ["migrations/", "seeds/"]) {
        for (const f of files(dir)) await base.exec(readFileSync(new URL(dir + f, SERVER), "utf8"));
    }
    expectedNamed = await namedPopulation(adapt(base));
    baseContent = await content(base);
}, 300000);

describe("a damaged database is put back to exactly what the seeds produce", () => {
    it("rehearses without changing anything", async () => {
        const db = await devLike();
        const before = await content(db);

        const result = await reconcile(adapt(db), options());

        expect(result.outcome).toBe("rolled-back");
        expect(result.questionIds).toHaveLength(DUPS);
        expect(await content(db)).toEqual(before);
    });

    it("applies with the token it printed, and ends identical to a fresh build", async () => {
        const db = await devLike();
        const evidence = await one(db, "SELECT COUNT(*)::int n FROM session_questions");
        const { token } = await reconcile(adapt(db), options());

        const result = await reconcile(adapt(db), options({ apply: true, confirm: token }));

        expect(result.outcome).toBe("committed");
        expect(token.startsWith(`${DUPS}:${DUPS}:`)).toBe(true);
        expect(await content(db)).toEqual(baseContent);
        expect(await one(db, "SELECT COUNT(*)::int n FROM session_questions")).toBe(evidence);
    });

    it("finds nothing to do the second time, and changes nothing", async () => {
        const db = await devLike();
        const { token } = await reconcile(adapt(db), options());
        await reconcile(adapt(db), options({ apply: true, confirm: token }));
        const after = await content(db);

        const again = await reconcile(adapt(db), options());
        expect(again.token).toBe(confirmationToken([], [], 0, []));
        await reconcile(adapt(db), options({ apply: true, confirm: again.token }));

        expect(await content(db)).toEqual(after);
    });
});

describe("refusals: nothing is written", () => {
    async function refuses(db: PGliteInterface, over: Partial<ReconcileOptions>, message: RegExp) {
        const before = await content(db);
        await expect(reconcile(adapt(db), options(over))).rejects.toThrow(message);
        expect(await content(db)).toEqual(before);
    }

    it("refuses the wrong database name", async () => {
        const db = await devLike();
        const { token } = await reconcile(adapt(db), options());
        await refuses(
            db,
            { apply: true, confirm: token, database: "code_blitz_dev", verifyTarget: targetFor("code_blitz_dev") },
            /connected to "postgres", but --database says "code_blitz_dev"/
        );
    });

    it("refuses a keeper that is newer than its duplicate", async () => {
        const db = await devLike();
        // Names stamped onto the NEWER copy, as an unordered adoption could.
        const copy = await duplicate(db, "values-completion-004");
        await db.query("UPDATE questions SET external_ref = NULL WHERE external_ref = 'values-completion-004'");
        await db.query("UPDATE questions SET external_ref = 'values-completion-004' WHERE id = $1", [copy]);
        await refuses(db, {}, /keeper is not older than duplicates/);
    });

    it("refuses a duplicate whose wording matches no keeper", async () => {
        const db = await devLike();
        await duplicate(db, "values-completion-009", "Why are null and undefined not interchangeable, really?");
        await refuses(db, {}, /no single keeper for duplicates/);
    });

    it("refuses a reviewed replacement whose old wording differs by one character", async () => {
        const db = await devLike();
        const r = REVIEWED_REPLACEMENTS[0];
        await duplicate(db, r.keeperRef, r.oldPrompt.replace("crew = 3", "crew  = 3"));
        await refuses(db, {}, /no single keeper for duplicates/);
    });

    it("refuses a reviewed replacement whose keeper sits on another rung", async () => {
        const db = await devLike();
        // Move the keeper onto an empty challenge of a different concept: the
        // old-prompt duplicate then names a keeper that is not its question.
        const r = REVIEWED_REPLACEMENTS[1];
        await db.query(
            `UPDATE questions SET challenge_id = (
                 SELECT ch.id FROM challenges ch
                 WHERE ch.role = 'practise' AND ch.activity IS NULL
                   AND NOT EXISTS (SELECT 1 FROM questions x WHERE x.challenge_id = ch.id)
                   AND ch.concept_id <> (SELECT c.concept_id FROM challenges c JOIN questions k
                                         ON k.challenge_id = c.id WHERE k.external_ref = $1)
                 ORDER BY ch.id LIMIT 1)
             WHERE source = $2 AND external_ref = $1`,
            [r.keeperRef, r.source]
        );
        await refuses(db, {}, /keeper is on a different concept or demand/);
    });

    it("refuses when two keepers share one prompt", async () => {
        const db = await devLike();
        const twin = await duplicate(db, "values-completion-002");
        await db.query("UPDATE questions SET external_ref = 'values-completion-002-twin' WHERE id = $1", [twin]);
        const named = new Set([...expectedNamed, "jolt-values-completion/values-completion-002-twin"]);
        await refuses(db, { expectedNamed: named }, /no single keeper for duplicates/);
    });

    it("refuses a duplicate that a learner has answered", async () => {
        const db = await devLike();
        const dup = await one(db, "SELECT MAX(id)::int n FROM questions WHERE external_ref IS NULL AND source LIKE 'jolt-%'");
        await db.query(
            `INSERT INTO session_questions (game_session_id, question_id, display_order, prompt_text, status, served_at)
             SELECT (SELECT MIN(id) FROM game_sessions), q.id, 2, q.prompt, 'pending', CURRENT_TIMESTAMP
             FROM questions q WHERE q.id = $1`,
            [dup]
        );
        await refuses(db, {}, /duplicates still referenced/);
    });

    it("refuses the right counts with the wrong identity digest", async () => {
        const db = await devLike();
        const { token } = await reconcile(adapt(db), options());
        const forged = token.replace(/[0-9a-f]{16}$/, "0000000000000000");
        await refuses(db, { apply: true, confirm: forged }, /does not match this database/);
    });

    it("refuses --apply without a token", async () => {
        const db = await devLike();
        await refuses(db, { apply: true }, /--confirm=\(missing\)/);
    });

    it("refuses a database whose seeding is incomplete", async () => {
        const db = await devLike();
        // One keeper left unnamed, as a seed that stopped part-way would leave it.
        await db.query("UPDATE questions SET external_ref = NULL WHERE external_ref = 'early-004'");
        await refuses(db, {}, /named questions do not match a fresh build.*1 missing/);
    });

    it("refuses a database carrying a name the seeds do not produce", async () => {
        const db = await devLike();
        await db.query(
            "UPDATE questions SET external_ref = 'hand-added-01' WHERE id = (SELECT MIN(id) FROM questions WHERE source = 'internal')"
        );
        await refuses(db, {}, /named questions do not match a fresh build/);
    });

    it("refuses a keeper holding content neither side of a repair expects", async () => {
        const db = await devLike();
        await db.query("UPDATE questions SET explanation = 'edited by hand' WHERE external_ref = 'early-004'");
        await refuses(db, {}, /matches neither side of repairs: early-004/);
    });

    it("rolls back everything when a failure follows the deletes", async () => {
        const db = await devLike();
        const before = await content(db);
        const { token } = await reconcile(adapt(db), options());

        await expect(
            reconcile(
                adapt(db),
                options({
                    apply: true,
                    confirm: token,
                    afterDelete: async () => {
                        // The deletes really did happen inside the transaction ...
                        expect(await one(db, "SELECT COUNT(*)::int n FROM questions WHERE external_ref IS NULL AND source LIKE 'jolt-%'")).toBe(0);
                        throw new Error("injected");
                    }
                })
            )
        ).rejects.toThrow("injected");

        // ... and none of it survived.
        expect(await content(db)).toEqual(before);
    });
});

describe("the target guard", () => {
    const local = { database: "code_blitz_dev", serverAddr: null, serverClusterId: "7", localClusterId: "7" };

    it("accepts the named local cluster over a socket or loopback", () => {
        expect(judgeTarget("code_blitz_dev", local)).toBeNull();
        for (const serverAddr of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
            expect(judgeTarget("code_blitz_dev", { ...local, serverAddr })).toBeNull();
        }
    });

    it("refuses without an explicit database name", () => {
        expect(judgeTarget(undefined, local)).toMatch(/--database=<name> is required/);
    });

    it("refuses a server answering from another machine", () => {
        expect(judgeTarget("code_blitz_dev", { ...local, serverAddr: "10.0.4.12" })).toMatch(/not this machine/);
    });

    it("refuses a loopback connection to a different cluster -- a tunnel", () => {
        expect(judgeTarget("code_blitz_dev", { ...local, serverAddr: "127.0.0.1", localClusterId: "8" })).toMatch(
            /tunnel or proxy/
        );
    });

    it("refuses when the local cluster cannot be read, rather than assuming", () => {
        expect(judgeTarget("code_blitz_dev", { ...local, localClusterId: null })).toMatch(/no local pg_control/);
        expect(judgeTarget("code_blitz_dev", { ...local, serverClusterId: null })).toMatch(/did not report/);
    });

    it("refuses a URL that names another host", () => {
        expect(judgeUrl("postgresql://u@db.render.com:5432/jolt")).toMatch(/not this machine/);
        expect(judgeUrl("postgresql://u@localhost:5432/code_blitz_dev")).toBeNull();
        expect(judgeUrl("postgresql://u@[::1]:5432/code_blitz_dev")).toBeNull();
        expect(judgeUrl("postgresql:///code_blitz_dev?host=/tmp")).toBeNull();
        expect(judgeUrl(undefined)).toMatch(/no database URL/);
    });

    it("refuses a shell DATABASE_URL that differs from server/.env", () => {
        const file = "SESSION_SECRET=x\nDATABASE_URL=postgresql://u@localhost:5432/code_blitz_dev\n";
        expect(judgeEnvironment("postgresql://u@db.render.com/jolt", file)).toEqual({
            refusal: expect.stringMatching(/differs from server\/\.env/)
        });
        expect(judgeEnvironment(undefined, file)).toEqual({ url: "postgresql://u@localhost:5432/code_blitz_dev" });
        expect(judgeEnvironment("postgresql://u@localhost:5432/code_blitz_dev", file)).toEqual({
            url: "postgresql://u@localhost:5432/code_blitz_dev"
        });
        expect(judgeEnvironment(undefined, null)).toEqual({ refusal: expect.stringMatching(/not found/) });
        expect(judgeEnvironment(undefined, "DATABASE_URL=\n")).toEqual({ refusal: expect.stringMatching(/empty/) });
        expect(judgeEnvironment(undefined, "DATABASE_URL=a\nDATABASE_URL=b\n")).toEqual({
            refusal: expect.stringMatching(/2 times/)
        });
        expect(judgeEnvironment(undefined, 'DATABASE_URL="postgresql://u@localhost/x"\n')).toEqual({
            url: "postgresql://u@localhost/x"
        });
    });
});

describe("the command refuses before it connects", () => {
    const hasEnv = existsSync(new URL(".env", SERVER));
    const cli = (args: string[], env: Record<string, string | undefined>) =>
        spawnSync(new URL("node_modules/.bin/tsx", SERVER).pathname, ["scripts/reconcile-duplicates.ts", ...args], {
            cwd: SERVER.pathname,
            env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
            encoding: "utf8",
            timeout: 60000
        });

    it.skipIf(!hasEnv)("will not let an exported DATABASE_URL redirect an apply", () => {
        const run = cli(["--database=jolt", "--apply", "--confirm=1:1:1:0:0000000000000000"], {
            DATABASE_URL: "postgresql://u@db.example.invalid:5432/jolt"
        });
        expect(run.status).toBe(1);
        expect(run.stderr).toMatch(/REFUSED before connecting: DATABASE_URL in the environment differs/);
        expect(run.stdout).not.toMatch(/target:/);
    });

    it.skipIf(!hasEnv)("will not run without --database", () => {
        const run = cli(["--apply"], {});
        expect(run.status).toBe(1);
        expect(run.stderr).toMatch(/REFUSED before connecting: --database=<name> is required/);
    });
});
