import { readFileSync, readdirSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { inspect } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";

/**
 * SEED 087: a third pass over the question bank.
 *
 * Like 085 and 086, no answer key was wrong, so most of these hold properties
 * rather than answers -- each one something a later seed could quietly undo:
 *
 *     LANDED        every distractor 087 names was replaced, and the old text
 *                   is gone from the active bank
 *     NO TELL       on explain and repair, the answer is never the only
 *                   option with a comma, semicolon or colon
 *     NO STACKING   a distractor standing for one mistake does not add quotes
 *     PREREQUISITES an option does not use syntax taught after its concept
 *     ALIGNED       initialization asks about initialization
 *     VARIETY       let-vs-const predictions are not one shape twice, and
 *                   arithmetic does not replay its own lesson
 *     CONVERGENT    no prompt 087 writes is one an earlier seed re-matches
 *
 * And because 087 wrote new code and new wrong answers, every prediction it
 * wrote is run and compared with its answer, and every repair it added as a
 * distractor is run to show that it does not repair anything.
 */
const SEEDS_DIR = new URL("../../seeds/", import.meta.url);
const SEED = readFileSync(new URL("087_question_bank_review.sql", SEEDS_DIR), "utf8");

/** The rows of one `INSERT INTO <table> VALUES ...;` block in the seed. */
const sqlString = (raw: string, escaped: boolean) => {
    const text = raw.replace(/''/g, "'");
    return escaped ? text.replace(/\\n/g, "\n") : text;
};
const block = (table: string) => {
    const start = SEED.indexOf(`INSERT INTO ${table} VALUES`);
    expect(start, `087 inserts into ${table}`).toBeGreaterThan(-1);
    return SEED.slice(start, SEED.indexOf(";\n", start));
};
const LIT = String.raw`(E?)'((?:[^']|'')*)'`;
const tuples = (table: string, width: number) =>
    [...block(table).matchAll(new RegExp(String.raw`\(\s*` + Array(width).fill(LIT).join(String.raw`,\s*`) + String.raw`\s*\)`, "g"))]
        .map((m) => Array.from({ length: width }, (_, i) => sqlString(m[2 * i + 2]!, m[2 * i + 1] === "E")));

const DISTRACTORS = tuples("review_o", 4) as [string, string, string, string][];
const LEGACY = tuples("review_legacy", 3) as [string, string, string][];
const REWRITTEN = tuples("review_q", 5) as [string, string, string, string, string][];

interface Row {
    id: number;
    source: string;
    ref: string | null;
    prompt: string;
    concept: string;
    demand: string;
}

describe("seed 087: question-bank review", () => {
    let fx: CurriculumFixture;
    let before: string;
    let after: string;

    const fingerprint = async () =>
        JSON.stringify(
            await fx.rows(
                `SELECT q.id, q.prompt, q.explanation, q.is_active, q.updated_at, q.challenge_id, q.difficulty,
                        (SELECT json_agg(json_build_array(o.id, o.option_text, o.is_correct, o.updated_at)
                                         ORDER BY o.id)
                         FROM question_options o WHERE o.question_id = q.id) AS options
                 FROM questions q ORDER BY q.id`
            )
        );

    beforeAll(async () => {
        fx = await buildCurriculumFixture();
        before = await fingerprint();
        await fx.db.exec(SEED);
        after = await fingerprint();
    }, 120000);

    const active = (concepts: string[], demand?: string) =>
        fx.rows<Row>(
            `SELECT q.id::int, q.source, q.external_ref AS ref, q.prompt, c.slug AS concept, d.slug AS demand
             FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             JOIN demands  d    ON d.id  = ch.demand_id
             WHERE q.is_active AND c.slug = ANY($1) AND ($2::text IS NULL OR d.slug = $2)
             ORDER BY q.id`,
            [concepts, demand ?? null]
        );

    const optionsOf = (where: string, params: unknown[]) =>
        fx.rows<{ option_text: string; is_correct: boolean }>(
            `SELECT o.option_text, o.is_correct FROM question_options o
             JOIN questions q ON q.id = o.question_id
             WHERE o.is_active AND q.is_active AND ${where}
             ORDER BY o.display_order`,
            params
        );

    const code = (prompt: string) => prompt.split("\n\n").slice(1).join("\n\n");

    it("is idempotent: applying it again changes nothing", () => {
        expect(after).toBe(before);
    });

    it("parses what it is about to check", () => {
        // A typo in the parser would make every test below vacuous.
        expect(DISTRACTORS).toHaveLength(36);
        expect(LEGACY).toHaveLength(4);
        expect(REWRITTEN).toHaveLength(3);
    });

    describe("landed", () => {
        it.each(DISTRACTORS)("%s / %s: a distractor replaced", async (source, ref, oldText, newText) => {
            const options = await optionsOf("q.source = $1 AND q.external_ref = $2", [source, ref]);
            expect(options).toHaveLength(4);
            expect(options.filter((o) => o.is_correct)).toHaveLength(1);
            expect(options.map((o) => o.option_text)).not.toContain(oldText);
            expect(options.filter((o) => o.option_text === newText && !o.is_correct)).toHaveLength(1);
        });

        it.each(LEGACY)("legacy %j loses its stacked quotes", async (prompt, oldText, newText) => {
            const options = await optionsOf("q.source = 'internal' AND q.prompt = $1", [prompt]);
            expect(options).toHaveLength(4);
            expect(options.map((o) => o.option_text)).not.toContain(oldText);
            expect(options.filter((o) => o.option_text === newText && !o.is_correct)).toHaveLength(1);
        });

        it.each(REWRITTEN)("%s / %s is rewritten", async (source, ref, oldPrompt, newPrompt, why) => {
            const [q] = await fx.rows<{ prompt: string; explanation: string }>(
                `SELECT prompt, explanation FROM questions WHERE is_active AND source = $1 AND external_ref = $2`,
                [source, ref]
            );
            expect(q).toBeDefined();
            expect(q!.prompt).toBe(newPrompt);
            expect(q!.prompt).not.toBe(oldPrompt);
            expect(q!.explanation).toBe(why);
            expect(why.length).toBeLessThanOrEqual(400);
        });
    });

    describe("no tell", () => {
        it.each([["explain"], ["repair"]])(
            "never makes the answer the only %s option with a comma, semicolon or colon",
            async (demand) => {
                const rows = await fx.rows<{ id: number; correct: string; wrong: string[] }>(
                    `SELECT q.id::int,
                            (SELECT o.option_text FROM question_options o
                             WHERE o.question_id = q.id AND o.is_active AND o.is_correct) AS correct,
                            (SELECT array_agg(o.option_text) FROM question_options o
                             WHERE o.question_id = q.id AND o.is_active AND NOT o.is_correct) AS wrong
                     FROM questions q
                     JOIN challenges ch ON ch.id = q.challenge_id
                     JOIN demands d     ON d.id  = ch.demand_id
                     WHERE q.is_active AND d.slug = $1`,
                    [demand]
                );
                expect(rows.length).toBeGreaterThan(10);
                const punctuated = (t: string) => /[,;:]/.test(t);
                const tells = rows.filter((r) => punctuated(r.correct) && !r.wrong.some(punctuated));
                expect(tells.map((r) => r.id)).toEqual([]);
            }
        );

        it("does not make any touched question's answer its longest option where it was not before", async () => {
            // The distractors were rewritten at the same grain: none of them
            // became the reason the answer stands out by length.
            for (const [source, ref] of DISTRACTORS) {
                const options = await optionsOf("q.source = $1 AND q.external_ref = $2", [source, ref]);
                const correct = options.find((o) => o.is_correct)!.option_text;
                const longestWrong = Math.max(...options.filter((o) => !o.is_correct).map((o) => o.option_text.length));
                // Either the answer was already the longest (and still is), or it is not now.
                if (correct.length > longestWrong) {
                    const replaced = DISTRACTORS.filter(([s, r]) => s === source && r === ref).map((d) => d[2]);
                    expect(replaced.every((old) => old.length < correct.length), `${ref}`).toBe(true);
                }
            }
        });
    });

    it("stacks no quotes on the joining, naming or text mistakes in legacy predictions", async () => {
        for (const [prompt] of LEGACY) {
            const options = await optionsOf("q.source = 'internal' AND q.prompt = $1", [prompt]);
            const quoted = options.filter((o) => !o.is_correct && /^".*"$/.test(o.option_text));
            expect(quoted.map((o) => o.option_text), prompt).toEqual([]);
        }
    });

    describe("prerequisites", () => {
        it("offers no `return` in an option before functions are taught", async () => {
            const rows = await fx.rows<{ id: number; option_text: string }>(
                `SELECT q.id::int, o.option_text
                 FROM questions q
                 JOIN question_options o ON o.question_id = q.id AND o.is_active
                 JOIN challenges ch ON ch.id = q.challenge_id
                 JOIN concepts c    ON c.id  = ch.concept_id
                 JOIN topics t      ON t.id  = c.topic_id
                 WHERE q.is_active
                   AND t.display_order < (SELECT display_order FROM topics WHERE slug = 'functions')
                   AND o.option_text ~ '\\mreturn\\M'`
            );
            expect(rows).toEqual([]);
        });

        it("offers no `.flat(` before flat is taught", async () => {
            const rows = await fx.rows<{ id: number }>(
                `SELECT q.id::int
                 FROM questions q
                 JOIN question_options o ON o.question_id = q.id AND o.is_active
                 JOIN challenges ch ON ch.id = q.challenge_id
                 JOIN concepts c    ON c.id  = ch.concept_id
                 JOIN topics t      ON t.id  = c.topic_id
                 WHERE q.is_active AND o.option_text LIKE '%.flat(%'
                   AND (t.display_order, c.display_order) <
                       (SELECT t2.display_order, c2.display_order FROM concepts c2
                        JOIN topics t2 ON t2.id = c2.topic_id WHERE c2.slug = 'flat')`
            );
            expect(rows).toEqual([]);
        });
    });

    describe("alignment and variety", () => {
        it("asks initialization predictions about a name given a value as it is declared", async () => {
            const rows = await active(["initialization"], "predict");
            expect(rows.length).toBeGreaterThan(0);
            for (const q of rows) {
                expect(code(q.prompt), `question ${q.id}`).toMatch(/^let \w+ = [^;]+;$/m);
            }
        });

        it("retires #8 and #325 and fills their rungs with named replacements", async () => {
            const retired = await fx.rows<{ is_active: boolean }>(
                `SELECT is_active FROM questions
                 WHERE (source = 'internal' AND prompt = E'What does this log?\\n\\nlet x;\\nconsole.log(x);')
                    OR (source = 'jolt-operators-completion' AND external_ref = 'equality-explain-01')`
            );
            expect(retired).toHaveLength(2);
            expect(retired.every((r) => !r.is_active)).toBe(true);

            const named = await fx.rows<{ concept: string; demand: string; role: string; difficulty: number }>(
                `SELECT c.slug AS concept, d.slug AS demand, ch.role, ch.difficulty
                 FROM questions q
                 JOIN challenges ch ON ch.id = q.challenge_id
                 JOIN concepts c    ON c.id  = ch.concept_id
                 JOIN demands  d    ON d.id  = ch.demand_id
                 WHERE q.is_active AND q.source = 'jolt-bank-review'
                 ORDER BY c.slug`
            );
            expect(named).toEqual([
                { concept: "equality", demand: "explain", role: "practise", difficulty: 2 },
                { concept: "initialization", demand: "predict", role: "practise", difficulty: 1 }
            ]);
        });

        it("says which thing `===` compares, rather than `them`", async () => {
            const rows = await fx.rows<{ option_text: string }>(
                `SELECT o.option_text FROM question_options o
                 JOIN questions q ON q.id = o.question_id
                 JOIN challenges ch ON ch.id = q.challenge_id
                 JOIN concepts c ON c.id = ch.concept_id
                 WHERE q.is_active AND o.is_active AND c.slug = 'equality'`
            );
            expect(rows.length).toBeGreaterThan(0);
            expect(rows.filter((r) => /\bthem\b/.test(r.option_text))).toEqual([]);
        });

        it("gives no two let-vs-const predictions the same code shape", async () => {
            const shape = (prompt: string) =>
                code(prompt)
                    .replace(/"[^"]*"/g, '""')
                    .replace(/\b\d+\b/g, "0")
                    .replace(/\b(?!let\b|const\b|console\b|log\b)[a-z_]\w*\b/gi, "x");
            const shapes = (await active(["let-vs-const"], "predict")).map((q) => shape(q.prompt));
            expect(new Set(shapes).size, shapes.join("\n---\n")).toBe(shapes.length);
        });

        it("does not replay the arithmetic lesson's own steps, and asks about addition", async () => {
            const codes = (await active(["arithmetic-operators"], "predict")).map((q) => code(q.prompt));
            // The lesson's predict steps (client/src/games/lessons.ts).
            for (const step of ["console.log(3 * 4);", "console.log(10 / 4);", "console.log(9 / 2);"]) {
                expect(codes).not.toContain(step);
            }
            expect(codes.some((c) => /\d \+ \d/.test(c))).toBe(true);
        });

        it("has every diagnose question in string-length say what was meant", async () => {
            const rows = await active(["string-length"], "diagnose");
            expect(rows.length).toBeGreaterThan(0);
            for (const q of rows) expect(q.prompt.split("\n\n")[0]).toMatch(/meant|should|supposed/);
        });
    });

    describe("convergent", () => {
        // Every LIKE pattern an earlier seed applies, and every prompt literal
        // it names: a prompt 087 writes must match none of them, or that seed
        // would rewrite it on the next run.
        const earlier = readdirSync(SEEDS_DIR)
            .filter((f) => f.endsWith(".sql") && f < "087")
            .map((f) =>
                readFileSync(new URL(f, SEEDS_DIR), "utf8")
                    .replace(/\/\*[\s\S]*?\*\//g, "")
                    .replace(/^\s*--.*$/gm, "")
                    .replace(/\$j\$[\s\S]*?\$j\$/g, "")
            );
        const literals = earlier.flatMap((s) =>
            [...s.matchAll(/(E?)'((?:[^']|'')*)'/g)].map((m) => sqlString(m[2]!, m[1] === "E"))
        );
        const likes = literals
            .filter((t) => /^%|%$/.test(t) && t.length > 2)
            .map((t) => new RegExp("^" + t.split("%").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/_/g, ".")).join("[\\s\\S]*") + "$"));

        const written = async () =>
            (
                await fx.rows<{ prompt: string }>(
                    `SELECT prompt FROM questions
                     WHERE is_active AND (source = 'jolt-bank-review' OR (source, external_ref) IN
                         (('jolt-variables-predict', 'vars-predict-007'),
                          ('jolt-arithmetic-predict', 'arith-003'),
                          ('jolt-strings-completion', 'string-length-diagnose-01')))`
                )
            ).map((r) => r.prompt);

        it("writes five prompts, none matched by an earlier seed's LIKE pattern that did not match before", async () => {
            // A pattern that already matched the old prompt was already being
            // applied to that row on every run (025's `let name = "Tati"`, which
            // only fills a missing explanation), so it is not new exposure.
            expect(likes.length).toBeGreaterThan(50);
            const prompts = await written();
            expect(prompts).toHaveLength(5);
            for (const prompt of prompts) {
                const old = REWRITTEN.find((r) => r[3] === prompt)?.[2];
                const fresh = likes.filter((re) => re.test(prompt) && !(old !== undefined && re.test(old)));
                expect(fresh.map(String), prompt).toEqual([]);
            }
        });

        it("writes no prompt an earlier seed names exactly", async () => {
            for (const prompt of await written()) expect(literals, prompt).not.toContain(prompt);
        });
    });

    // Strings raw, everything else as Node prints it; one call per line.
    const run = (snippet: string) => {
        const lines: string[] = [];
        const log = (...args: unknown[]) =>
            lines.push(args.map((a) => (typeof a === "string" ? a : inspect(a))).join(" "));
        let error: string | null = null;
        try {
            runInNewContext(snippet, { console: { log } }, { timeout: 2000 });
        } catch (e) {
            error = (e as Error).name;
        }
        return { lines, error };
    };

    describe("every prediction 087 wrote or re-optioned is what the code prints", () => {
        const PRINTS: [string, string][] = [
            ["jolt-bank-review", "initialization-predict-01"],
            ["jolt-arithmetic-predict", "arith-003"],
            ["jolt-booleans-predict", "bool-005"]
        ];

        it.each(PRINTS)("%s / %s", async (source, ref) => {
            const options = await optionsOf("q.source = $1 AND q.external_ref = $2", [source, ref]);
            const [q] = await fx.rows<{ prompt: string }>(
                `SELECT prompt FROM questions WHERE source = $1 AND external_ref = $2`, [source, ref]);
            const { lines, error } = run(code(q!.prompt));
            const real = lines.join("\n");

            expect(error).toBeNull();
            expect(options.find((o) => o.is_correct)!.option_text).toBe(real);
            expect(options.filter((o) => o.option_text === real)).toHaveLength(1);
        });

        it.each(LEGACY)("legacy %j", async (prompt) => {
            const options = await optionsOf("q.source = 'internal' AND q.prompt = $1", [prompt]);
            const { lines, error } = run(code(prompt));
            const real = lines.join("\n");

            expect(error).toBeNull();
            expect(options.find((o) => o.is_correct)!.option_text).toBe(real);
            expect(options.filter((o) => o.option_text === real)).toHaveLength(1);
        });

        it("stops vars-predict-007 at the const line, before anything is printed", async () => {
            const [q] = await fx.rows<{ prompt: string }>(
                `SELECT prompt FROM questions WHERE source = 'jolt-variables-predict' AND external_ref = 'vars-predict-007'`);
            const { lines, error } = run(code(q!.prompt));
            expect(error).toBe("TypeError");
            expect(lines).toEqual([]);

            const options = await optionsOf(
                "q.source = 'jolt-variables-predict' AND q.external_ref = 'vars-predict-007'", []);
            expect(options.find((o) => o.is_correct)!.option_text).toBe("It stops with an error");
        });

        it("prints the symptom string-length-diagnose-01 describes", async () => {
            const [q] = await fx.rows<{ prompt: string }>(
                `SELECT prompt FROM questions WHERE source = 'jolt-strings-completion' AND external_ref = 'string-length-diagnose-01'`);
            expect(run(code(q!.prompt)).lines).toEqual(["Empty"]);
            // The fix the explanation names: only an empty name is Empty.
            const fixed = code(q!.prompt).replace("name.length < 10", "name.length === 0");
            expect(run(fixed).lines).toEqual(["Ready"]);
            expect(run(fixed.replace('"Tati"', '""')).lines).toEqual(["Empty"]);
        });
    });

    describe("every wrong repair 087 offers really is wrong", () => {
        const cases: [string, string, (r: ReturnType<typeof run>) => boolean][] = [
            ["Call it twice: name.toUpperCase().toUpperCase();",
             'let name = "tati";\nname.toUpperCase().toUpperCase();\nconsole.log(name);',
             (r) => r.lines[0] === "TATI"],
            ["Log it instead: console.log(add(2, 3));",
             "function add(a, b) {\n  console.log(a + b);\n}\nconsole.log(add(2, 3));\nlet total = add(2, 3);\nconsole.log(total);",
             (r) => r.lines.at(-1) !== "undefined"],
            ["Rename it: `let backup = original;`",
             "let original = [1, 2];\nlet backup = original;\nbackup.push(3);\nconsole.log(original.length);",
             (r) => r.lines[0] === "2"],
            ["Rename it: `let backup = settings;`",
             'let settings = { theme: "dark" };\nlet backup = settings;\nbackup.theme = "light";\nconsole.log(settings.theme);',
             (r) => r.lines[0] === "dark"],
            ["Sort a copy: [...scores].sort()",
             "let scores = [10, 9, 1];\n[...scores].sort();\nconsole.log(scores);",
             (r) => r.lines[0] === inspect([1, 9, 10])],
            ["Start lower instead: total(3)",
             "function total(n) {\n  if (n === 0) {\n    return 0;\n  }\n  return n + total(n + 1);\n}\nconsole.log(total(3));",
             (r) => r.error === null],
            ["total.then((v) => { console.log(v); });",
             "async function total() {\n  return 3;\n}\ntotal.then((v) => { console.log(v); });",
             (r) => r.error === null],
            ["go.catch((e) => { console.log(e); });",
             'async function go() {\n  throw "boom";\n}\ngo.catch((e) => { console.log(e); });',
             (r) => r.error === null]
        ];

        it.each(cases)("%s", async (option, snippet, repairs) => {
            const offered = DISTRACTORS.some(([, , , text]) => text === option);
            expect(offered, "the case checks an option 087 actually offers").toBe(true);
            expect(repairs(run(snippet))).toBe(false);
        });
    });

    it("leaves exactly one correct option on every question it touched", async () => {
        const refs = [...DISTRACTORS, ...REWRITTEN].map(([s, r]) => `${s}/${r}`);
        const rows = await fx.rows<{ key: string; correct: number }>(
            `SELECT q.source || '/' || COALESCE(q.external_ref, q.prompt) AS key,
                    (SELECT COUNT(*)::int FROM question_options o
                     WHERE o.question_id = q.id AND o.is_active AND o.is_correct) AS correct
             FROM questions q
             WHERE q.is_active
               AND (q.source || '/' || q.external_ref = ANY($1)
                    OR q.source = 'jolt-bank-review'
                    OR (q.source = 'internal' AND q.prompt = ANY($2)))`,
            [refs, LEGACY.map(([p]) => p)]
        );
        expect(rows.length).toBe(new Set(refs).size + 2 + LEGACY.length);
        for (const r of rows) expect(r.correct, r.key).toBe(1);
    });
});
