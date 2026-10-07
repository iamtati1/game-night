import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";
import { ENCOUNTER_RUNGS_SQL, rungsFromRows } from "./encounter.js";

/**
 * Strings, end to end — the fourth complete topic.
 *
 * Same contract as Values, Operators and Control Flow. What is specific here is
 * that square brackets mean something different from what they mean five topics
 * later: `word[1]` is `string-indexing`, not arrays, so the forward-dependency
 * scan has to tell an index from an array literal.
 */
describe("the Control Flow topic", () => {
    let fx: CurriculumFixture;
    let user: string;

    beforeAll(async () => {
        fx = await buildCurriculumFixture();
        user = await fx.insertUser("operators-topic@example.com");
    }, 120000);

    const concepts = async (): Promise<string[]> =>
        (
            await fx.rows<{ slug: string }>(
                `SELECT c.slug FROM concepts c JOIN topics t ON t.id = c.topic_id
                 WHERE t.slug = 'strings' ORDER BY c.display_order`
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

    it("realises every produce rung with a code-writing movement", async () => {
        const rows = await fx.rows<{ concept: string; activity: string | null }>(
            `SELECT c.slug AS concept, ch.activity FROM challenges ch
             JOIN concepts c ON c.id = ch.concept_id
             JOIN topics   t ON t.id = c.topic_id
             JOIN demands  d ON d.id = ch.demand_id
             WHERE t.slug = 'strings' AND d.slug = 'produce'
               AND ch.role = 'practise' AND ch.is_active
             ORDER BY c.display_order`
        );

        expect(rows.map((r) => r.concept)).toEqual([
            "string-concatenation",
            "string-methods",
            "template-literals"
        ]);

        for (const row of rows) {
            expect(row.activity, row.concept).toBe("mission");
        }
    });

    it("counts a bracket on text as indexing, not as an array", async () => {
        // `word[1]` is what `string-indexing` IS. An absolute "no square
        // brackets" rule would make the concept unable to demonstrate itself,
        // so the scan below distinguishes an index from an array literal.
        const rows = await fx.rows<{ prompt: string }>(
            `SELECT q.prompt FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             WHERE c.slug = 'string-indexing' AND q.is_active`
        );

        expect(rows.some((r) => /\w\[\d\]/.test(r.prompt))).toBe(true);
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
             WHERE t.slug = 'strings' AND q.is_active AND ch.role = 'practise'`
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
         * `Boolean(...)` is deliberately absent from this list.
         *
         * It is a call, and calls belong to Functions -- but it is how the
         * AUTHORED truthy-falsy lesson already teaches the concept, and without
         * it the only other boolean context is `if`, which is the next topic.
         * The learner is shown it in the teaching before any question uses it,
         * which is the rule that actually matters. It is recorded here so the
         * exemption is a decision rather than an oversight.
         */
        const owns: [RegExp, string][] = [
            // `if` is taught HERE, so it is checked against its own position
            // rather than assumed to be forward.
            [/\bif\s*\(|\belse\b/, "if-else"],
            // console.log is taught at Values #1, so it is not a method call
            // reaching forward. Anything else with a dot and brackets is.
            [/(?<!console)\.\w+\(/, "string-methods"],
            // An array LITERAL, not any bracket -- see the test above.
            [/\[\s*\]|\[[^\]]*,/, "array-indexing"],
            [/\bfunction\b|=>/, "function-declaration"],
            [/\bfor\s*\(|\bwhile\s*\(/, "for-loop-anatomy"],
            [/\{\s*\w+\s*:/, "object-access"]
        ];
        const offences: string[] = [];

        for (const row of rows) {
            /*
             * CODE, NOT PROSE -- the same rule the remediation scan learned.
             * A prompt is a question written in English followed by a snippet;
             * scanning the English flags "which change makes it print" as a
             * for-loop. Only the snippet, and any backticked fragment quoted
             * inline, is JavaScript.
             */
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
             WHERE t.slug = 'strings' AND q.is_active AND q.explanation IS NULL`
        );

        expect(silent.map((r) => r.concept)).toEqual([]);
    });

    /**
     * An explain question gives the MECHANISM. The way that is enforced in
     * content is that every distractor is a true-sounding statement about the
     * outcome, so a learner who knows what happens but not why still misses it.
     */
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
             WHERE t.slug = 'strings' AND d.slug = 'explain' AND q.is_active`
        );

        /*
         * Control Flow declares NO explain rung. `guard-clauses` was the only
         * concept here that did, and it moved to Functions -- so this holds
         * vacuously today and starts biting the moment an explain rung appears.
         * Asserting a count would make it fail for the wrong reason.
         */
        const declared = await fx.rows<{ n: number }>(
            `SELECT COUNT(*)::INT AS n FROM concept_demands cd
             JOIN concepts c ON c.id = cd.concept_id
             JOIN topics   t ON t.id = c.topic_id
             JOIN demands  d ON d.id = cd.demand_id
             WHERE t.slug = 'strings' AND d.slug = 'explain'`
        );

        expect(rows.length, "one question per declared explain rung").toBe(declared[0]!.n);

        for (const row of rows) {
            expect(row.prompt.toLowerCase(), row.prompt.slice(0, 40)).toContain("why");
            expect(row.correct.length, "a mechanism takes a clause, not a word")
                .toBeGreaterThan(25);
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
             WHERE t.slug = 'strings'
             GROUP BY c.slug, c.display_order
             ORDER BY c.display_order`
        );

        expect(rows).toHaveLength(7);

        for (const row of rows) {
            expect(row.playable, row.concept).toBe(row.declared);
        }
    });
});
