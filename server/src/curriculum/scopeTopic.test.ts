import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";
import { ENCOUNTER_RUNGS_SQL, rungsFromRows } from "./encounter.js";

/**
 * Scope, end to end — the seventh complete topic.
 *
 * THE FIRST TOPIC THAT NEEDED THE INTERPRETER CHANGED BEFORE ANY CONTENT COULD
 * BE WRITTEN. littleJs kept one flat table of variables and was wrong about
 * all five of these concepts at once — most seriously, a function could read
 * the locals of whoever CALLED it, which is dynamic scope. Closures cannot be
 * taught on top of that, so the interpreter now holds a chain of scopes and
 * every function value carries the scope it was written in. The claims the
 * questions here make are checked against the interpreter in
 * `client/src/games/littleJs.test.ts`.
 */
describe("the Scope topic", () => {
    let fx: CurriculumFixture;
    let user: string;

    beforeAll(async () => {
        fx = await buildCurriculumFixture();
        user = await fx.insertUser("scope-topic@example.com");
    }, 120000);

    const concepts = async (): Promise<string[]> =>
        (
            await fx.rows<{ slug: string }>(
                `SELECT c.slug FROM concepts c JOIN topics t ON t.id = c.topic_id
                 WHERE t.slug = 'scope' ORDER BY c.display_order`
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

    it("realises its one produce rung with a code-writing movement", async () => {
        const rows = await fx.rows<{ concept: string; activity: string | null }>(
            `SELECT c.slug AS concept, ch.activity FROM challenges ch
             JOIN concepts c ON c.id = ch.concept_id
             JOIN topics   t ON t.id = c.topic_id
             JOIN demands  d ON d.id = ch.demand_id
             WHERE t.slug = 'scope' AND d.slug = 'produce'
               AND ch.role = 'practise' AND ch.is_active
             ORDER BY c.display_order`
        );

        /*
         * Only `closures` declares produce, and that is right. Writing out a
         * temporal dead zone or a shadowed variable ON PURPOSE is not a skill
         * anyone needs; recognising them in code that already exists is.
         */
        expect(rows.map((r) => r.concept)).toEqual(["closures"]);

        for (const row of rows) {
            expect(row.activity, row.concept).toBe("mission");
        }
    });

    it("captures a single function rather than an array of them", async () => {
        const rows = await fx.rows<{ prompt: string }>(
            `SELECT q.prompt FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             JOIN topics t      ON t.id  = c.topic_id
             WHERE t.slug = 'scope' AND q.is_active`
        );

        /*
         * The classic loop-capture demonstration pushes closures into an array
         * and prints them afterwards. Arrays are the NEXT topic, so this one
         * keeps a single captured function in a variable instead. Same bug,
         * nothing borrowed from ahead.
         */
        for (const row of rows) {
            expect(/\[\s*\]|\[[^\]]*,/.test(row.prompt), row.prompt.slice(0, 40)).toBe(false);
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
             WHERE t.slug = 'scope' AND q.is_active AND ch.role = 'practise'`
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
            [/\bif\s*\(|\belse\b/, "if-else"],
            [/(?<!console)\.\w+\(/, "string-methods"],
            [/\[\s*\]|\[[^\]]*,/, "array-indexing"],
            [/\bfunction\b|=>/, "function-declaration"],
            [/\bfor\s*\(|\bwhile\s*\(/, "for-loop-anatomy"],
            [/\{\s*\w+\s*:/, "object-access"],
            /*
             * `var` is owned by block-vs-function-scope, the FIRST concept
             * here, not by hoisting-tdz. It is listed because a topic that
             * teaches a keyword still has to teach it in the right order: the
             * concept whose entire point is "var ignores braces" is where the
             * word legitimately first appears.
             */
            [/\bvar\s+\w/, "block-vs-function-scope"]
        ];
        const offences: string[] = [];

        for (const row of rows) {
            // Code, not prose. The English half of a prompt says things like
            // "which change fixes it" and is not JavaScript.
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
        const silent = await fx.rows<{ concept: string; prompt: string }>(
            `SELECT c.slug AS concept, q.prompt
             FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             JOIN topics t      ON t.id  = c.topic_id
             WHERE t.slug = 'scope' AND q.is_active AND q.explanation IS NULL`
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
             WHERE t.slug = 'scope' AND d.slug = 'explain' AND q.is_active`
        );
        const declared = await fx.rows<{ n: number }>(
            `SELECT COUNT(*)::INT AS n FROM concept_demands cd
             JOIN concepts c ON c.id = cd.concept_id
             JOIN topics   t ON t.id = c.topic_id
             JOIN demands  d ON d.id = cd.demand_id
             WHERE t.slug = 'scope' AND d.slug = 'explain'`
        );

        expect(rows.length, "one question per declared explain rung").toBe(declared[0]!.n);
        expect(rows.length).toBe(4);

        for (const row of rows) {
            expect(row.prompt.toLowerCase(), row.prompt.slice(0, 40)).toContain("why");
            expect(row.correct.length, "a mechanism takes a clause, not a word")
                .toBeGreaterThan(25);
        }
    });

    /**
     * The myth this topic has to actively correct.
     *
     * Nearly every tutorial says "let is not hoisted", and it is false: the
     * name IS reserved from the top of the block, which is exactly why reading
     * it does not fall through to an outer variable of the same name. The
     * explain rung has to offer that sentence as a distractor and say so.
     */
    it("offers the let-is-not-hoisted myth as a distractor", async () => {
        const [row] = await fx.rows<{ explanation: string; wrong: string }>(
            `SELECT q.explanation,
                    (SELECT STRING_AGG(o.option_text, ' | ') FROM question_options o
                     WHERE o.question_id = q.id AND NOT o.is_correct) AS wrong
             FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             JOIN demands d     ON d.id  = ch.demand_id
             WHERE c.slug = 'hoisting-tdz' AND d.slug = 'explain' AND q.is_active`
        );

        expect(row?.wrong).toMatch(/not hoisted/i);
        expect(row?.explanation).toMatch(/is hoisted/i);
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
             WHERE t.slug = 'scope'
             GROUP BY c.slug, c.display_order
             ORDER BY c.display_order`
        );

        expect(rows).toHaveLength(5);

        for (const row of rows) {
            expect(row.playable, row.concept).toBe(row.declared);
        }
    });
});
