import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { inspect } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";

/**
 * SEED 086: the rest of the question-bank audit.
 *
 * Like 085, no answer key was wrong, so most of these hold properties rather
 * than answers -- each one something a later seed could quietly undo:
 *
 *     PREREQUISITES  no question leans on syntax its concept's lesson, or an
 *                    earlier one, has not taught
 *     ONE ANSWER     a diagnose question says what was meant; no distractor
 *                    is also true
 *     ACCURATE       runaway recursion is described as what it does
 *     ALIGNED        a question tests the concept it is filed under
 *     NO GIVEAWAY    the answer is not the only option in its format
 *     VARIETY        sibling questions do not share one code shape
 *
 * And because 086 wrote new code, every prediction it wrote is executed and
 * compared against the option it marks correct.
 */
const SEED = readFileSync(new URL("../../seeds/086_question_bank_audit.sql", import.meta.url), "utf8");

interface Row {
    id: number;
    source: string;
    ref: string | null;
    prompt: string;
    concept: string;
    demand: string;
}

describe("seed 086: question-bank audit fixes", () => {
    let fx: CurriculumFixture;
    let before: string;
    let after: string;

    // Everything that 086 could touch, timestamps included, so a re-run that
    // rewrote a row with identical text would still show up.
    const fingerprint = async () =>
        JSON.stringify(
            await fx.rows(
                `SELECT q.id, q.prompt, q.explanation, q.is_active, q.updated_at, q.challenge_id,
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

    const active = (concepts: string[], demand = "predict") =>
        fx.rows<Row>(
            `SELECT q.id::int, q.source, q.external_ref AS ref, q.prompt, c.slug AS concept, d.slug AS demand
             FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             JOIN demands  d    ON d.id  = ch.demand_id
             WHERE q.is_active AND c.slug = ANY($1) AND d.slug = $2
             ORDER BY q.id`,
            [concepts, demand]
        );

    const code = (prompt: string) => prompt.split("\n\n").slice(1).join("\n\n");

    const VALUES = [
        "console-output", "arithmetic-operators", "expressions-produce-values", "primitive-types",
        "booleans", "comparison-operators", "typeof", "null-vs-undefined"
    ];
    // Variables up to and including assignment: before reading-variables.
    const EARLY_VARIABLES = ["variables-name-values", "declaration", "initialization", "assignment"];

    it("is idempotent: applying it again changes nothing", () => {
        expect(after).toBe(before);
    });

    describe("prerequisites", () => {
        it("uses no ++ or -- anywhere a lesson could have taught them, because none does", async () => {
            const rows = await active([...VALUES, ...EARLY_VARIABLES, "reading-variables", "reassignment",
                "let-vs-const", "variable-state", "assignment-operators"]);
            expect(rows.filter((q) => /\+\+|--/.test(code(q.prompt))).map((q) => q.id)).toEqual([]);
        });

        it("never passes console.log two arguments in Values or early Variables", async () => {
            // A comma inside console.log's brackets that is not inside quotes.
            const twoArgs = /console\.log\((?:[^()"]|"[^"]*")*,/;
            const rows = await active([...VALUES, ...EARLY_VARIABLES]);
            expect(rows.filter((q) => twoArgs.test(code(q.prompt))).map((q) => q.id)).toEqual([]);
        });

        it("never reads one variable into another before reading-variables", async () => {
            // `let b = a;` or `total = total + 3;`: a name on the right of =.
            const KEYWORDS = new Set(["true", "false", "null", "undefined", "typeof"]);
            const readsAName = (line: string) => {
                const rhs = line.match(/^(?:let |const )?\w+ = (.*);$/)?.[1];
                if (rhs === undefined) return false;
                const names = rhs.replace(/"[^"]*"/g, "").match(/\b[a-z_]\w*\b/gi) ?? [];
                return names.some((n) => !KEYWORDS.has(n));
            };
            const rows = await active(EARLY_VARIABLES);
            const leaks = rows.filter((q) => code(q.prompt).split("\n").some(readsAName));
            expect(leaks.map((q) => q.id)).toEqual([]);
        });
    });

    describe("one defensible answer", () => {
        it("has every diagnose question in this-binding say what was meant", async () => {
            const rows = await active(["this-binding"], "diagnose");
            expect(rows.length).toBeGreaterThan(0);
            for (const q of rows) {
                expect(q.prompt.split("\n\n")[0], `question ${q.id}`).toMatch(/meant|should|supposed/);
            }
        });

        it("no longer offers a true description of every() on an empty list as a distractor", async () => {
            const rows = await fx.rows<{ option_text: string }>(
                `SELECT o.option_text FROM question_options o
                 JOIN questions q ON q.id = o.question_id
                 WHERE q.source = 'jolt-array-methods-completion'
                   AND q.external_ref = 'find-some-every-explain-01'
                   AND o.is_active AND NOT o.is_correct`
            );
            expect(rows).toHaveLength(3);
            expect(rows.map((r) => r.option_text)).not.toContain(
                "every returns true whenever nothing could be tested"
            );
        });
    });

    it("describes runaway recursion as the RangeError it is, not as running for ever", async () => {
        const rows = await fx.rows<{ id: number; prompt: string }>(
            `SELECT q.id::int, q.prompt FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             WHERE q.is_active AND c.slug IN ('recursion', 'base-cases')
               AND q.prompt ~* 'never (stops|finishes|ends)|for ever|forever'`
        );
        expect(rows).toEqual([]);
    });

    describe("alignment", () => {
        it("keeps arithmetic out of primitive-types' predictions", async () => {
            const rows = await active(["primitive-types"]);
            expect(rows.length).toBeGreaterThan(0);
            expect(rows.filter((q) => /\d\s*[-+*/]\s*\d/.test(code(q.prompt))).map((q) => q.id)).toEqual([]);
        });

        it("asks null-vs-undefined about null and undefined, not typeof trivia", async () => {
            const rows = await active(["null-vs-undefined"]);
            expect(rows.length).toBeGreaterThan(0);
            for (const q of rows) {
                expect(code(q.prompt), `question ${q.id}`).not.toMatch(/typeof/);
                expect(code(q.prompt)).toMatch(/null/);
                expect(code(q.prompt)).toMatch(/undefined/);
            }
        });

        it("retires the three legacy rows and fills their rungs with named replacements", async () => {
            const legacy = await fx.rows<{ is_active: boolean }>(
                `SELECT is_active FROM questions
                 WHERE source = 'internal' AND prompt IN (
                     E'What does this log?\\n\\nlet n = 5;\\nn += 3;\\nn++;\\nconsole.log(n);',
                     E'What does this log?\\n\\nconsole.log(typeof "5", typeof 5);',
                     E'What does this log?\\n\\nconsole.log(typeof null);')`
            );
            expect(legacy.length).toBe(3);
            expect(legacy.every((r) => !r.is_active)).toBe(true);

            const named = await active(["assignment-operators", "typeof", "null-vs-undefined"]);
            expect(named.filter((q) => q.source === "jolt-bank-audit").map((q) => q.concept).sort()).toEqual([
                "assignment-operators", "null-vs-undefined", "typeof"
            ]);
        });
    });

    it("gives #366's distractors the same `then` format as its answer", async () => {
        const rows = await fx.rows<{ option_text: string }>(
            `SELECT o.option_text FROM question_options o
             JOIN questions q ON q.id = o.question_id
             WHERE q.source = 'jolt-loops-completion' AND q.external_ref = 'break-continue-predict-01'
               AND o.is_active`
        );
        expect(rows).toHaveLength(4);
        for (const { option_text } of rows) {
            // A list of values is written with `then`; "nothing" is the one non-list.
            if (option_text !== "nothing") expect(option_text).toMatch(/^\S+( then \S+)+$/);
        }
    });

    describe("variety", () => {
        // Code shape: names, numbers and strings stood in for, so two questions
        // that differ only in what they call things compare equal.
        const shape = (prompt: string) =>
            code(prompt)
                .replace(/"[^"]*"/g, '""')
                .replace(/\b\d+(\.\d+)?\b/g, "0")
                .replace(/\b(?!let\b|const\b|console\b|log\b|typeof\b|true\b|false\b|null\b|undefined\b)[a-z_]\w*\b/gi, "x");

        it.each([["comparison-operators"], ["declaration"], ["variables-name-values"], ["assignment"]])(
            "gives no two %s predictions the same code shape",
            async (concept) => {
                const rows = await active([concept]);
                const shapes = rows.map((q) => shape(q.prompt));
                expect(new Set(shapes).size, shapes.join("\n---\n")).toBe(shapes.length);
            }
        );

        it("asks comparison-operators about more than `>`", async () => {
            const ops = new Set(
                (await active(["comparison-operators"])).map((q) => code(q.prompt).match(/[<>]=?/)?.[0])
            );
            expect(ops.size).toBeGreaterThanOrEqual(3);
        });
    });

    describe("every prediction 086 wrote is what the code prints", () => {
        const WRITTEN: [string, string][] = [
            ["jolt-bank-audit", "assignment-operators-predict-02"],
            ["jolt-bank-audit", "typeof-predict-01"],
            ["jolt-bank-audit", "null-vs-undefined-predict-01"],
            ["jolt-variables-practice", "vars-007"],
            ["jolt-variables-practice", "vars-008"],
            ["jolt-variables-predict", "vars-predict-002"],
            ["jolt-variables-predict", "vars-predict-004"],
            ["jolt-variables-predict", "vars-predict-005"],
            ["jolt-primitive-types", "primitive-002"],
            ["jolt-booleans-predict", "bool-001"],
            ["jolt-booleans-predict", "bool-002"],
            ["jolt-loops-completion", "break-continue-predict-01"]
        ];

        // Strings raw, everything else as Node prints it; one call per line.
        const run = (snippet: string) => {
            const lines: string[] = [];
            const log = (...args: unknown[]) =>
                lines.push(args.map((a) => (typeof a === "string" ? a : inspect(a))).join(" "));
            runInNewContext(snippet, { console: { log } }, { timeout: 1000 });
            return lines;
        };

        it.each(WRITTEN)("%s / %s", async (source, ref) => {
            const [q] = await fx.rows<{ prompt: string; correct: string; options: string[] }>(
                `SELECT q.prompt,
                        (SELECT o.option_text FROM question_options o
                         WHERE o.question_id = q.id AND o.is_active AND o.is_correct) AS correct,
                        (SELECT array_agg(o.option_text) FROM question_options o
                         WHERE o.question_id = q.id AND o.is_active) AS options
                 FROM questions q
                 WHERE q.is_active AND q.source = $1 AND q.external_ref = $2`,
                [source, ref]
            );
            expect(q, "the question exists and is active").toBeDefined();
            const lines = run(code(q!.prompt));
            // The bank writes several lines either one per line or joined by `then`.
            const real = q!.correct.includes(" then ") ? lines.join(" then ") : lines.join("\n");

            expect(q!.correct).toBe(real);
            expect(q!.options).toHaveLength(4);
            expect(q!.options.filter((o) => o === real)).toHaveLength(1);
        });
    });

    it("throws RangeError where the recursion questions now say it does", () => {
        const down = "function down(n) {\n  return down(n - 1);\n}\ndown(3);";
        const total = "function total(n) {\n  if (n === 0) {\n    return 0;\n  }\n  return n + total(n + 1);\n}\ntotal(4);";
        for (const snippet of [down, total]) {
            let name = "";
            try {
                runInNewContext(snippet, {}, { timeout: 5000 });
            } catch (error) {
                name = (error as Error).name;
            }
            expect(name).toBe("RangeError");
        }
    });

    it("leaves exactly one correct option on every question it touched", async () => {
        const rows = await fx.rows<{ id: number; correct: number }>(
            `SELECT q.id::int AS id,
                    (SELECT COUNT(*)::int FROM question_options o
                     WHERE o.question_id = q.id AND o.is_active AND o.is_correct) AS correct
             FROM questions q
             WHERE q.is_active
               AND (q.source = 'jolt-bank-audit'
                    OR q.external_ref IN ('vars-007', 'vars-008', 'vars-predict-002', 'vars-predict-004',
                        'vars-predict-005', 'primitive-002', 'bool-001', 'bool-002',
                        'break-continue-predict-01', 'find-some-every-explain-01', 'this-binding-diagnose-01',
                        'recursion-diagnose-01', 'base-cases-diagnose-01', 'base-cases-repair-01'))`
        );
        expect(rows.length).toBe(17);
        for (const r of rows) expect(r.correct, `question ${r.id}`).toBe(1);
    });
});
