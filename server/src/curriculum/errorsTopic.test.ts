import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";
import { ENCOUNTER_RUNGS_SQL, rungsFromRows } from "./encounter.js";

/**
 * Errors, end to end — the twelfth complete topic, and the smallest: twelve
 * rungs across five concepts.
 *
 * THE INTERPRETER LEARNED TO HAVE ERROR TYPES FOR THIS. Until this topic every
 * failure littleJs raised was an untyped sentence, which made `error-types` --
 * "tell from the name what kind of thing went wrong" -- unteachable on its own
 * engine. Failures are now TypeError, ReferenceError or RangeError the way
 * JavaScript chooses them, `throw`/`try`/`catch`/`finally` exist, and a
 * failure carries the calls that were in progress so a trace can be read.
 *
 * The claims these questions make are checked against the interpreter in
 * `client/src/games/littleJs.test.ts`.
 */
describe("the Errors topic", () => {
    let fx: CurriculumFixture;
    let user: string;

    beforeAll(async () => {
        fx = await buildCurriculumFixture();
        user = await fx.insertUser("err-topic@example.com");
    }, 120000);

    const concepts = async (): Promise<string[]> =>
        (
            await fx.rows<{ slug: string }>(
                `SELECT c.slug FROM concepts c JOIN topics t ON t.id = c.topic_id
                 WHERE t.slug = 'errors' ORDER BY c.display_order`
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

    /**
     * The only topic so far that declares no `produce` rung, and that is
     * right: writing a bug on purpose is not a skill. Recognising, predicting
     * and repairing one is, and all three are here.
     */
    it("declares no produce rung, and so has no movement", async () => {
        const declared = await fx.rows<{ n: number }>(
            `SELECT COUNT(*)::INT AS n FROM concept_demands cd
             JOIN concepts c ON c.id = cd.concept_id
             JOIN topics   t ON t.id = c.topic_id
             JOIN demands  d ON d.id = cd.demand_id
             WHERE t.slug = 'errors' AND d.slug = 'produce'`
        );
        const built = await fx.rows<{ n: number }>(
            `SELECT COUNT(*)::INT AS n FROM challenges ch
             JOIN concepts c ON c.id = ch.concept_id
             JOIN topics   t ON t.id = c.topic_id
             WHERE t.slug = 'errors' AND ch.activity = 'mission'`
        );

        expect(declared[0]!.n).toBe(0);
        expect(built[0]!.n).toBe(0);
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
             WHERE t.slug = 'errors' AND q.is_active AND ch.role = 'practise'`
        );
        const positions = new Map(
            (
                await fx.rows<{ slug: string; pos: number }>(
                    `SELECT c.slug, t.display_order * 100 + c.display_order AS pos
                     FROM concepts c JOIN topics t ON t.id = c.topic_id`
                )
            ).map((r) => [r.slug, r.pos])
        );

        const owns: [RegExp, string][] = [
            [/\bfunction\b|=>/, "function-declaration"],
            [/\bfor\s*\(|\bwhile\s*\(/, "for-loop-anatomy"],
            [/\[\s*\]|\[[^\]]*,/, "array-indexing"],
            [/\{\s*\w+\s*:/, "object-access"],
            [/\bthrow\b/, "throwing"],
            [/\btry\s*\{|\bcatch\s*\(|\bfinally\b/, "try-catch"]
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
             WHERE t.slug = 'errors' AND q.is_active AND q.explanation IS NULL`
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
             WHERE t.slug = 'errors' AND d.slug = 'explain' AND q.is_active`
        );

        const declared = await fx.rows<{ n: number }>(
            `SELECT COUNT(*)::INT AS n FROM concept_demands cd
             JOIN concepts c ON c.id = cd.concept_id
             JOIN topics   t ON t.id = c.topic_id
             JOIN demands  d ON d.id = cd.demand_id
             WHERE t.slug = 'errors' AND d.slug = 'explain'`
        );

        expect(rows.length, "one question per declared explain rung").toBe(declared[0]!.n);
        expect(rows.length).toBe(3);

        for (const row of rows) {
            expect(row.prompt.toLowerCase(), row.prompt.slice(0, 40)).toContain("why");
            expect(row.correct.length).toBeGreaterThan(25);
        }
    });

    /**
     * The four names the topic actually teaches, used as the options a learner
     * chooses between. Naming a category the interpreter never produces would
     * make the concept a vocabulary test rather than a reading skill.
     */
    it("offers the error types the interpreter really raises", async () => {
        const rows = await fx.rows<{ correct: string }>(
            `SELECT (SELECT o.option_text FROM question_options o
                     WHERE o.question_id = q.id AND o.is_correct LIMIT 1) AS correct
             FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             WHERE c.slug = 'error-types' AND q.is_active`
        );

        expect(rows.map((r) => r.correct)).toEqual(["TypeError", "TypeError"]);
    });

    /**
     * A trace shown to a learner has to be one the interpreter would really
     * produce: most recent first, and naming functions that are in the
     * snippet beside it.
     */
    it("shows a trace most-recent-first, naming functions in its own snippet", async () => {
        const rows = await fx.rows<{ prompt: string }>(
            `SELECT q.prompt FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             WHERE c.slug = 'stack-traces' AND q.is_active AND q.prompt LIKE '%at %'`
        );

        expect(rows.length).toBeGreaterThan(0);

        for (const row of rows) {
            // format is called BY render, so it must be listed above it.
            expect(row.prompt.indexOf("at format")).toBeLessThan(row.prompt.indexOf("at render"));
        }
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
             WHERE t.slug = 'errors'
             GROUP BY c.slug, c.display_order
             ORDER BY c.display_order`
        );

        expect(rows).toHaveLength(5);

        for (const row of rows) {
            expect(row.playable, row.concept).toBe(row.declared);
        }
    });
});
