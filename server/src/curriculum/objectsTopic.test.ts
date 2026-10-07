import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";
import { ENCOUNTER_RUNGS_SQL, rungsFromRows } from "./encounter.js";

/**
 * Objects, end to end — the eleventh complete topic.
 *
 * THE WIDEST INTERPRETER EXTENSION SO FAR. Nine pieces of syntax had to exist
 * before a question could be written: object literals, dot and bracket access,
 * property assignment, `delete`, `for...of`, `for...in`, `?.`, destructuring,
 * object spread, `JSON`, and `new Map()` / `new Set()`. `new` left the refused
 * list here, as `var` did at Scope — and stayed an allowlist of two.
 *
 * `{` is told from a block by POSITION, as JavaScript does it: a statement
 * beginning with `{` is a block, and an object literal is only ever reached
 * from expression position. The claims these questions make are checked
 * against the interpreter in `client/src/games/littleJs.test.ts`.
 */
describe("the Objects topic", () => {
    let fx: CurriculumFixture;
    let user: string;

    beforeAll(async () => {
        fx = await buildCurriculumFixture();
        user = await fx.insertUser("obj-topic@example.com");
    }, 120000);

    const concepts = async (): Promise<string[]> =>
        (
            await fx.rows<{ slug: string }>(
                `SELECT c.slug FROM concepts c JOIN topics t ON t.id = c.topic_id
                 WHERE t.slug = 'objects' ORDER BY c.display_order`
            )
        ).map((r) => r.slug);

    it("has a playable activity at every declared rung", async () => {
        const holes: string[] = [];

        for (const concept of await concepts()) {
            const rungs = rungsFromRows(await fx.rows(ENCOUNTER_RUNGS_SQL, [user, concept]));

            expect(rungs.length, `${concept} declares nothing`).toBeGreaterThan(0);

            for (const rung of rungs) {
                if (rung.options.length === 0) holes.push(`${concept}/${rung.demandSlug}`);
            }
        }

        expect(holes).toEqual([]);
    });

    it("realises both produce rungs with code-writing movements", async () => {
        const rows = await fx.rows<{ concept: string; activity: string | null }>(
            `SELECT c.slug AS concept, ch.activity FROM challenges ch
             JOIN concepts c ON c.id = ch.concept_id
             JOIN topics   t ON t.id = c.topic_id
             JOIN demands  d ON d.id = ch.demand_id
             WHERE t.slug = 'objects' AND d.slug = 'produce'
               AND ch.role = 'practise' AND ch.is_active
             ORDER BY c.display_order`
        );

        expect(rows.map((r) => r.concept)).toEqual(["destructuring", "json-shape"]);

        for (const row of rows) {
            expect(row.activity, row.concept).toBe("mission");
        }
    });

    it("keeps for-of-for-in here, where both halves can be met", async () => {
        const [row] = await fx.rows<{ topic: string }>(
            `SELECT t.slug AS topic FROM concepts c JOIN topics t ON t.id = c.topic_id
             WHERE c.slug = 'for-of-for-in'`
        );

        // for-of walks a list and for-in walks an object, so it could not sit
        // in Loops: there were no objects yet.
        expect(row?.topic).toBe("objects");
    });

    it("never uses a construct the learner has not reached", async () => {
        const rows = await fx.rows<{ concept: string; pos: number; prompt: string }>(
            `SELECT c.slug AS concept,
                    t.display_order * 100 + c.display_order AS pos,
                    q.prompt
             FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             JOIN topics t      ON t.id  = c.topic_id
             WHERE t.slug = 'objects' AND q.is_active AND ch.role = 'practise'`
        );
        const positions = new Map(
            (
                await fx.rows<{ slug: string; pos: number }>(
                    `SELECT c.slug, t.display_order * 100 + c.display_order AS pos
                     FROM concepts c JOIN topics t ON t.id = c.topic_id`
                )
            ).map((r) => [r.slug, r.pos])
        );

        /*
         * Each piece of syntax is checked against the concept that owns it, so
         * a `?.` inside `object-access` -- four concepts too early -- would be
         * caught here rather than noticed by a learner.
         */
        const owns: [RegExp, string][] = [
            [/\bfunction\b|=>/, "function-declaration"],
            [/\bfor\s*\(|\bwhile\s*\(/, "for-loop-anatomy"],
            [/\[\s*\]|\[[^\]]*,/, "array-indexing"],
            [/\.map\s*\(|\.filter\s*\(|\.reduce\s*\(/, "map"],
            [/\{\s*\w+\s*:/, "object-access"],
            [/\bdelete\s+\w/, "object-mutation"],
            [/\bof\s+\w|\bin\s+\w+\s*\)/, "for-of-for-in"],
            [/\?\./, "optional-chaining"],
            [/(const|let)\s*\{/, "destructuring"],
            [/\.\.\./, "object-references"],
            [/JSON\./, "json-shape"],
            [/\bnew\s+(Map|Set)\b/, "built-in-collections"]
        ];
        const offences: string[] = [];

        for (const row of rows) {
            const [ask, ...rest] = row.prompt.split(/\n\s*\n/);
            const quoted = [...ask!.matchAll(/`([^`]+)`/g)].map((q) => q[1]).join("\n");
            const code = `${quoted}\n${rest.join("\n")}`;

            for (const [pattern, owner] of owns) {
                const at = positions.get(owner);

                if (at !== undefined && at > row.pos && pattern.test(code)) {
                    offences.push(`${row.concept} needs ${owner}`);
                }
            }
        }

        expect([...new Set(offences)]).toEqual([]);
    });

    it("can explain itself wherever a learner is wrong", async () => {
        const silent = await fx.rows<{ concept: string }>(
            `SELECT c.slug AS concept FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             JOIN topics t      ON t.id  = c.topic_id
             WHERE t.slug = 'objects' AND q.is_active AND q.explanation IS NULL`
        );

        expect(silent.map((r) => r.concept)).toEqual([]);
    });

    it("asks explain questions as why, never as what", async () => {
        const rows = await fx.rows<{ prompt: string; correct: string }>(
            `SELECT q.prompt,
                    (SELECT o.option_text FROM question_options o
                     WHERE o.question_id = q.id AND o.is_correct LIMIT 1) AS correct
             FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             JOIN topics t      ON t.id  = c.topic_id
             JOIN demands d     ON d.id  = ch.demand_id
             WHERE t.slug = 'objects' AND d.slug = 'explain' AND q.is_active`
        );
        const declared = await fx.rows<{ n: number }>(
            `SELECT COUNT(*)::INT AS n FROM concept_demands cd
             JOIN concepts c ON c.id = cd.concept_id
             JOIN topics   t ON t.id = c.topic_id
             JOIN demands  d ON d.id = cd.demand_id
             WHERE t.slug = 'objects' AND d.slug = 'explain'`
        );

        expect(rows.length, "one question per declared explain rung").toBe(declared[0]!.n);
        expect(rows.length).toBe(2);

        for (const row of rows) {
            expect(row.prompt.toLowerCase(), row.prompt.slice(0, 40)).toContain("why");
            expect(row.correct.length, "a mechanism takes a clause, not a word")
                .toBeGreaterThan(25);
        }
    });

    /**
     * The distinction a learner cannot see from the outside.
     *
     * `p.b = undefined` and `delete p.b` both make `p.b` read as `undefined`.
     * The difference only shows when the OBJECT is looked at rather than the
     * property, so the diagnose rung has to print the object — not read the
     * property back, which would show the same thing either way. Walking the
     * keys would do as well, but `for...in` is two concepts later.
     */
    it("separates emptying a property from removing it", async () => {
        const [row] = await fx.rows<{ prompt: string; explanation: string }>(
            `SELECT q.prompt, q.explanation FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             JOIN demands d     ON d.id  = ch.demand_id
             WHERE c.slug = 'object-mutation' AND d.slug = 'diagnose' AND q.is_active`
        );

        expect(row?.prompt).toMatch(/console\.log\(p\);/);
        expect(row?.explanation).toMatch(/delete/i);
    });

    it("counts only playable rungs toward demonstration", async () => {
        const rows = await fx.rows<{ concept: string; playable: number; declared: number }>(
            `SELECT c.slug AS concept,
                    COUNT(*) FILTER (WHERE EXISTS (
                        SELECT 1 FROM challenges ch
                        LEFT JOIN questions q          ON q.challenge_id = ch.id AND q.is_active
                        LEFT JOIN bug_hunt_incidents i ON i.challenge_id = ch.id AND i.is_active
                        WHERE ch.concept_id = cd.concept_id AND ch.demand_id = cd.demand_id
                          AND ch.role = 'practise' AND ch.is_active
                          AND (q.id IS NOT NULL OR i.id IS NOT NULL OR ch.activity IS NOT NULL)
                    ))::INT AS playable,
                    COUNT(*)::INT AS declared
             FROM concept_demands cd
             JOIN concepts c ON c.id = cd.concept_id
             JOIN topics t   ON t.id = c.topic_id
             WHERE t.slug = 'objects'
             GROUP BY c.slug, c.display_order
             ORDER BY c.display_order`
        );

        expect(rows).toHaveLength(9);

        for (const row of rows) {
            expect(row.playable, row.concept).toBe(row.declared);
        }
    });
});
