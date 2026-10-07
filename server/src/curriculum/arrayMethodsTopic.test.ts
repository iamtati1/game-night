import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";
import { ENCOUNTER_RUNGS_SQL, rungsFromRows } from "./encounter.js";

/**
 * Array Methods, end to end — the tenth complete topic, and the largest:
 * twenty-nine rungs across eight concepts.
 *
 * THE TOPIC THAT TAUGHT THE INTERPRETER TO CALL A CALLBACK. Every method here
 * takes a function and runs it, which a table of pure transformations could
 * not do. All nine methods left the refused list at once — until this topic
 * littleJs answered `.map` with "not something we have covered yet", which is
 * what kept Arrays honest. The claims these questions make are checked against
 * the interpreter in `client/src/games/littleJs.test.ts`.
 */
describe("the Array Methods topic", () => {
    let fx: CurriculumFixture;
    let user: string;

    beforeAll(async () => {
        fx = await buildCurriculumFixture();
        user = await fx.insertUser("am-topic@example.com");
    }, 120000);

    const concepts = async (): Promise<string[]> =>
        (
            await fx.rows<{ slug: string }>(
                `SELECT c.slug FROM concepts c JOIN topics t ON t.id = c.topic_id
                 WHERE t.slug = 'array-methods' ORDER BY c.display_order`
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

    it("realises all four produce rungs with code-writing movements", async () => {
        const rows = await fx.rows<{ concept: string; activity: string | null }>(
            `SELECT c.slug AS concept, ch.activity FROM challenges ch
             JOIN concepts c ON c.id = ch.concept_id
             JOIN topics   t ON t.id = c.topic_id
             JOIN demands  d ON d.id = ch.demand_id
             WHERE t.slug = 'array-methods' AND d.slug = 'produce'
               AND ch.role = 'practise' AND ch.is_active
             ORDER BY c.display_order`
        );

        expect(rows.map((r) => r.concept)).toEqual([
            "map",
            "filter",
            "reduce",
            "method-chaining"
        ]);

        for (const row of rows) {
            expect(row.activity, row.concept).toBe("mission");
        }
    });

    /**
     * The first topic to use `recall`, which is a definition rather than a
     * trace. A recall question therefore carries NO snippet — if it showed
     * code it would be asking the learner to read rather than to remember.
     */
    it("asks recall questions without a snippet", async () => {
        const rows = await fx.rows<{ concept: string; prompt: string }>(
            `SELECT c.slug AS concept, q.prompt FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             JOIN topics t      ON t.id  = c.topic_id
             JOIN demands d     ON d.id  = ch.demand_id
             WHERE t.slug = 'array-methods' AND d.slug = 'recall' AND q.is_active
             ORDER BY c.display_order`
        );

        expect(rows.map((r) => r.concept)).toEqual([
            "map",
            "for-each",
            "filter",
            "find-some-every"
        ]);

        for (const row of rows) {
            expect(row.prompt, row.concept).not.toMatch(/\n\s*\n/);
        }
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
             WHERE t.slug = 'array-methods' AND q.is_active AND ch.role = 'practise'`
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
         * Each method is owned by its own concept, so a `filter` example
         * inside `map` would be caught here. Chaining is last, which is what
         * lets it legitimately use both.
         */
        const owns: [RegExp, string][] = [
            [/\bfunction\b|=>/, "function-declaration"],
            [/\bfor\s*\(|\bwhile\s*\(/, "for-loop-anatomy"],
            [/\[\s*\]|\[[^\]]*,/, "array-indexing"],
            [/\.\.\./, "array-copy-spread"],
            [/\.map\s*\(/, "map"],
            [/\.forEach\s*\(/, "for-each"],
            [/\.filter\s*\(/, "filter"],
            [/\.find\s*\(|\.some\s*\(|\.every\s*\(/, "find-some-every"],
            [/\.reduce\s*\(/, "reduce"],
            [/\.sort\s*\(/, "sort"],
            [/\.flat\s*\(/, "flat"],
            [/\{\s*\w+\s*:/, "object-access"]
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
             WHERE t.slug = 'array-methods' AND q.is_active AND q.explanation IS NULL`
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
             WHERE t.slug = 'array-methods' AND d.slug = 'explain' AND q.is_active`
        );
        const declared = await fx.rows<{ n: number }>(
            `SELECT COUNT(*)::INT AS n FROM concept_demands cd
             JOIN concepts c ON c.id = cd.concept_id
             JOIN topics   t ON t.id = c.topic_id
             JOIN demands  d ON d.id = cd.demand_id
             WHERE t.slug = 'array-methods' AND d.slug = 'explain'`
        );

        expect(rows.length, "one question per declared explain rung").toBe(declared[0]!.n);
        expect(rows.length).toBe(5);

        for (const row of rows) {
            expect(row.prompt.toLowerCase(), row.prompt.slice(0, 40)).toContain("why");
            expect(row.correct.length, "a mechanism takes a clause, not a word")
                .toBeGreaterThan(25);
        }
    });

    /**
     * The two facts about `sort` that everything else about it follows from,
     * and that the topic would be dishonest without: it compares AS TEXT when
     * given nothing, and it rearranges the list it was called on.
     */
    it("teaches both halves of the sort trap", async () => {
        const rows = await fx.rows<{ demand: string; correct: string; explanation: string }>(
            `SELECT d.slug AS demand,
                    (SELECT o.option_text FROM question_options o
                     WHERE o.question_id = q.id AND o.is_correct LIMIT 1) AS correct,
                    q.explanation
             FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             JOIN demands d     ON d.id  = ch.demand_id
             WHERE c.slug = 'sort' AND q.is_active`
        );
        const predict = rows.find((r) => r.demand === "predict");
        const explain = rows.find((r) => r.demand === "explain");

        // [10, 9, 1] sorts to [1, 10, 9], which is the text comparison.
        expect(predict?.correct).toBe("[1, 10, 9]");
        expect(predict?.explanation).toMatch(/text/i);

        // And it mutates: a.sort() === a.
        expect(explain?.explanation).toMatch(/===|mutat/i);
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
             WHERE t.slug = 'array-methods'
             GROUP BY c.slug, c.display_order
             ORDER BY c.display_order`
        );

        expect(rows).toHaveLength(8);

        let total = 0;

        for (const row of rows) {
            expect(row.playable, row.concept).toBe(row.declared);
            total += row.declared;
        }

        expect(total, "twenty-nine rungs, the largest topic so far").toBe(29);
    });
});
