import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * A QUESTION IS ITS NAME, NOT ITS WORDING.
 *
 * seedConvergence.test.ts proves a second pass adds nothing. This proves the
 * reasons it adds nothing are the right ones: that a row is found by the name
 * it was authored under even after its text has moved, that two questions which
 * happen to share a prompt stay two questions, and that a re-run leaves the
 * content of a found row alone. Counts alone cannot tell "matched the right
 * row" from "matched some row".
 *
 * THE UPDATE RULE BEING PINNED. A seed's own question function is insert-once:
 * a row it finds by name is returned untouched. Changes to existing content are
 * made by explicit later seeds (029, 059-061, 066, 080...), never by re-running
 * the seed that first inserted the row. So a re-run must not revert a later
 * correction, reactivate a retired question, or rewrite an option a learner
 * has already selected.
 */
const SEEDS = new URL("../../seeds/", import.meta.url);
const MIGRATIONS = new URL("../../migrations/", import.meta.url);

const files = (base: URL) =>
    readdirSync(base)
        .filter((f) => f.endsWith(".sql"))
        .sort();

const read = (base: URL, file: string) => readFileSync(new URL(file, base), "utf8");

let db: PGlite;

async function seedAll(): Promise<void> {
    for (const file of files(SEEDS)) await db.exec(read(SEEDS, file));
}

async function one(sql: string, params: unknown[] = []): Promise<number> {
    return Number((await db.query<{ n: number }>(sql, params)).rows[0]!.n);
}

/** Everything a learner can see or be scored on, keyed by stable row id. */
async function content(): Promise<string[]> {
    const rows = await db.query<{ line: string }>(`
        SELECT concat_ws(' | ', q.id, q.source, q.external_ref, q.prompt, q.explanation,
                         q.difficulty, q.topic, q.challenge_type, q.challenge_id, q.is_active,
                         (SELECT string_agg(concat_ws(':', o.id, o.option_text, o.is_correct,
                                                      o.is_active, o.display_order),
                                            ' ; ' ORDER BY o.id)
                          FROM question_options o WHERE o.question_id = q.id)) AS line
        FROM questions q ORDER BY q.id
    `);
    return rows.rows.map((r) => r.line);
}

let before: string[];
let after: string[];
let emptyBefore: number[];
let emptyAfter: number[];

/** Practise challenges with nothing on them. Missions and practices live in the client. */
async function emptyChallenges(): Promise<number[]> {
    const rows = await db.query<{ id: number }>(`
        SELECT ch.id::int AS id FROM challenges ch
        WHERE ch.role = 'practise' AND ch.is_active AND ch.activity IS NULL
          AND NOT EXISTS (SELECT 1 FROM questions q WHERE q.challenge_id = ch.id)
          AND NOT EXISTS (SELECT 1 FROM bug_hunt_incidents i WHERE i.challenge_id = ch.id)
          AND NOT EXISTS (SELECT 1 FROM flush_snippets f WHERE f.challenge_id = ch.id)
        ORDER BY ch.id
    `);
    return rows.rows.map((r) => r.id);
}

beforeAll(async () => {
    db = new PGlite();
    for (const file of files(MIGRATIONS)) await db.exec(read(MIGRATIONS, file));
    await seedAll();

    before = await content();
    emptyBefore = await emptyChallenges();
    await seedAll();
    after = await content();
    emptyAfter = await emptyChallenges();
}, 300000);

describe("a re-run leaves found rows exactly as they were", () => {
    it("changes no prompt, explanation, difficulty, activation or option", () => {
        expect(after.length).toBeGreaterThan(400);
        // Compared as a set difference so a failure names the rows, not a count.
        expect(after.filter((line) => !before.includes(line))).toEqual([]);
        expect(before.filter((line) => !after.includes(line))).toEqual([]);
    });
});

describe("a question keeps its identity when its wording changes", () => {
    it("finds a renamed prompt by its name and inserts nothing beside it", async () => {
        const target = (
            await db.query<{ id: number; external_ref: string }>(
                `SELECT id, external_ref FROM questions
                 WHERE source = 'jolt-operators-completion' AND external_ref IS NOT NULL
                 ORDER BY id LIMIT 1`
            )
        ).rows[0]!;

        await db.query(`UPDATE questions SET prompt = prompt || E'\n\n(reworded)' WHERE id = $1`, [
            target.id
        ]);
        const total = await one("SELECT COUNT(*)::int n FROM questions");

        await seedAll();

        expect(await one("SELECT COUNT(*)::int n FROM questions")).toBe(total);
        const holders = await db.query<{ id: number; prompt: string }>(
            `SELECT id, prompt FROM questions
             WHERE source = 'jolt-operators-completion' AND external_ref = $1`,
            [target.external_ref]
        );
        expect(holders.rows.map((r) => r.id)).toEqual([target.id]);
        expect(holders.rows[0]!.prompt).toMatch(/\(reworded\)$/);
    }, 300000);

    it("does not revert a later correction to content or activation", async () => {
        const target = (
            await db.query<{ id: number }>(
                `SELECT id FROM questions
                 WHERE source = 'jolt-arithmetic-depth' AND external_ref IS NOT NULL
                 ORDER BY id LIMIT 1`
            )
        ).rows[0]!;

        await db.exec(`
            UPDATE questions
            SET explanation = 'corrected later', difficulty = 3, is_active = FALSE
            WHERE id = ${target.id};
            UPDATE question_options SET option_text = option_text || ' (corrected)'
            WHERE question_id = ${target.id} AND is_correct;
        `);

        await seedAll();

        const row = (
            await db.query<{ explanation: string; difficulty: number; is_active: boolean }>(
                "SELECT explanation, difficulty, is_active FROM questions WHERE id = $1",
                [target.id]
            )
        ).rows[0]!;
        expect(row).toEqual({ explanation: "corrected later", difficulty: 3, is_active: false });

        const options = await db.query<{ option_text: string; is_correct: boolean }>(
            "SELECT option_text, is_correct FROM question_options WHERE question_id = $1",
            [target.id]
        );
        expect(options.rows.filter((o) => o.is_correct)).toHaveLength(1);
        expect(options.rows.find((o) => o.is_correct)!.option_text).toMatch(/\(corrected\)$/);
    }, 300000);
});

describe("adopting rows seeded before names existed", () => {
    it("names the oldest copy and leaves a newer duplicate unnamed", async () => {
        const original = (
            await db.query<{ id: number; external_ref: string; challenge_id: number }>(
                `SELECT id, external_ref, challenge_id FROM questions
                 WHERE source = 'jolt-arithmetic-depth' AND external_ref IS NOT NULL
                 ORDER BY id OFFSET 1 LIMIT 1`
            )
        ).rows[0]!;

        // What the development database holds: the original and a later copy,
        // both unnamed, both with the authored prompt.
        // Each copy came with its own challenge, as on the development database:
        // questions_challenge_id_idx allows one question per challenge.
        await db.exec(`
            UPDATE questions SET external_ref = NULL WHERE id = ${original.id};
            INSERT INTO challenges (concept_id, demand_id, role, difficulty)
            SELECT concept_id, demand_id, role, difficulty FROM challenges
            WHERE id = ${original.challenge_id};
            INSERT INTO questions (prompt, difficulty, topic, challenge_type, challenge_id, source, explanation)
            SELECT prompt, difficulty, topic, challenge_type,
                   (SELECT MAX(id) FROM challenges), source, explanation
            FROM questions WHERE id = ${original.id};
        `);
        const copy = await one(
            "SELECT MAX(id)::int n FROM questions WHERE source = 'jolt-arithmetic-depth'"
        );
        const total = await one("SELECT COUNT(*)::int n FROM questions");

        await db.exec(read(SEEDS, "082_arithmetic_depth.sql"));

        expect(await one("SELECT COUNT(*)::int n FROM questions")).toBe(total);
        const named = await db.query<{ id: number }>(
            "SELECT id FROM questions WHERE source = 'jolt-arithmetic-depth' AND external_ref = $1",
            [original.external_ref]
        );
        expect(named.rows.map((r) => r.id)).toEqual([original.id]);
        expect(
            await one("SELECT COUNT(*)::int n FROM questions WHERE id = $1 AND external_ref IS NULL", [
                copy
            ])
        ).toBe(1);

        // Leave the fixture as the other tests expect it.
        const copyChallenge = await one("SELECT challenge_id::int n FROM questions WHERE id = $1", [copy]);
        await db.query("DELETE FROM questions WHERE id = $1", [copy]);
        await db.query("DELETE FROM challenges WHERE id = $1", [copyChallenge]);
    }, 300000);
});

describe("two questions that share a prompt stay two questions", () => {
    it("inserts each name once, even with identical wording", async () => {
        // seed_op is dropped at the end of its file, so recreate just the
        // function from the file itself rather than a copy that could drift.
        const source = read(SEEDS, "033_operators_completion.sql");
        const fn = source.slice(
            source.indexOf("CREATE OR REPLACE FUNCTION seed_op("),
            source.indexOf("$$;", source.indexOf("CREATE OR REPLACE FUNCTION seed_op(")) + 3
        );
        await db.exec(fn);

        const prompt = "What does this log?\n\nconsole.log(1 + 1);";
        const call = (ref: string) =>
            db.query(
                `SELECT seed_op($1, 'assignment-operators', 'predict', $2, '2', ARRAY['11', 'NaN'], 'why')`,
                [ref, prompt]
            );

        await call("identity-test-twin-a");
        await call("identity-test-twin-b");
        await call("identity-test-twin-a");
        await call("identity-test-twin-b");

        const rows = await db.query<{ external_ref: string; options: number }>(
            `SELECT q.external_ref,
                    (SELECT COUNT(*)::int FROM question_options o WHERE o.question_id = q.id) AS options
             FROM questions q
             WHERE q.source = 'jolt-operators-completion' AND q.external_ref LIKE 'identity-test-twin-%'
             ORDER BY q.external_ref`
        );
        expect(rows.rows).toEqual([
            { external_ref: "identity-test-twin-a", options: 3 },
            { external_ref: "identity-test-twin-b", options: 3 }
        ]);

        await db.exec("DROP FUNCTION seed_op(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT)");
    });
});

describe("what the seeds leave is playable and consistent", () => {
    it("gives every active curriculum question the shape the selector requires", async () => {
        // journey.ts: active, at least two active options, exactly one correct.
        const broken = await db.query<{ id: number; external_ref: string }>(`
            SELECT q.id, q.external_ref FROM questions q
            WHERE q.is_active AND q.challenge_id IS NOT NULL
              AND q.external_ref NOT LIKE 'identity-test-%'
              AND ((SELECT COUNT(*) FROM question_options o
                    WHERE o.question_id = q.id AND o.is_active) < 2
                OR (SELECT COUNT(*) FROM question_options o
                    WHERE o.question_id = q.id AND o.is_active AND o.is_correct) <> 1)
        `);
        expect(broken.rows).toEqual([]);
    });

    it("leaves no new empty challenge behind on a re-run", () => {
        // An empty practise challenge is skipped by the encounter (see
        // conceptRungs: "content was retired or never written"), and 029 leaves
        // a few by moving questions off them. Harmless once; a seed that left
        // one per run would be the same defect as the duplicate questions.
        expect(emptyAfter).toEqual(emptyBefore);
    });
});

describe("seeds address rows by name, never by row id", () => {
    it("contains no update keyed on a literal surrogate id", () => {
        // 066 once targeted `WHERE id = 1280`: right only on a database built in
        // exactly the order it was written against, and silently wrong on any
        // other. A seed must name what it changes.
        const offenders = files(SEEDS).flatMap((file) =>
            read(SEEDS, file)
                .split("\n")
                .filter((line) => !line.trimStart().startsWith("--"))
                .filter((line) => /\b(id|question_id|incident_id|challenge_id)\s*=\s*\d+\b/.test(line))
                .map((line) => `${file}: ${line.trim()}`)
        );
        expect(offenders).toEqual([]);
    });

    it("lands every one of 066's reshaped options", async () => {
        // Keyed on the text each one replaces, so a mismatch is a silent no-op.
        // A fresh build is where every one of them must have applied.
        const statement =
            /SET option_text = '((?:[^']|'')*)'\s+FROM questions q WHERE q\.id = o\.question_id\s+AND q\.source = '([^']+)' AND q\.external_ref = '([^']+)'\s+AND o\.option_text = '((?:[^']|'')*)';/g;
        const sql = read(SEEDS, "066_answer_shape.sql");
        const expected = [...sql.matchAll(statement)].map((m) => ({
            text: m[1]!.replace(/''/g, "'"),
            source: m[2]!,
            ref: m[3]!
        }));
        expect(expected.length).toBe(96);

        // Replaced again by a later seed, deliberately. 086: "every returns true
        // whenever nothing could be tested" is a true description of the
        // empty-list case, so it could not stay a distractor.
        const superseded = new Set(["find-some-every-explain-01: every returns true whenever nothing could be tested"]);
        // 087 replaced more: distractors that were true, used syntax not yet
        // taught, or were the only ones without the answer's punctuation.
        const review = read(SEEDS, "087_question_bank_review.sql");
        for (const m of review.matchAll(/\('[^']+', '([^']+)',\s*'((?:[^']|'')*)', '(?:[^']|'')*'\)/g)) {
            superseded.add(`${m[1]}: ${m[2]!.replace(/''/g, "'")}`);
        }

        const missing: string[] = [];
        for (const e of expected.filter((x) => !superseded.has(`${x.ref}: ${x.text}`))) {
            const n = await one(
                `SELECT COUNT(*)::int n FROM question_options o JOIN questions q ON q.id = o.question_id
                 WHERE q.source = $1 AND q.external_ref = $2 AND o.option_text = $3 AND NOT o.is_correct`,
                [e.source, e.ref, e.text]
            );
            if (n !== 1) missing.push(`${e.ref}: ${e.text}`);
        }
        expect(missing).toEqual([]);
    });
});
