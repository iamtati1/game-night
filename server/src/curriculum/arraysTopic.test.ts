import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";
import { ENCOUNTER_RUNGS_SQL, rungsFromRows } from "./encounter.js";

/**
 * Arrays, end to end — the eighth complete topic.
 *
 * THE SECOND TOPIC THAT NEEDED THE INTERPRETER EXTENDED FIRST. littleJs had no
 * array literal, no indexing into one, no `.length` on one, no spread and no
 * default or rest parameters — every one of the seven concepts here was
 * unrunnable. Arrays are now held as objects rather than copied values, which
 * is the thing that makes `array-mutation` and `array-reference-identity`
 * demonstrable at all: two names can hold ONE list. The claims these questions
 * make are checked against the interpreter in
 * `client/src/games/littleJs.test.ts`.
 */
describe("the Arrays topic", () => {
    let fx: CurriculumFixture;
    let user: string;

    beforeAll(async () => {
        fx = await buildCurriculumFixture();
        user = await fx.insertUser("arrays-topic@example.com");
    }, 120000);

    const concepts = async (): Promise<string[]> =>
        (
            await fx.rows<{ slug: string }>(
                `SELECT c.slug FROM concepts c JOIN topics t ON t.id = c.topic_id
                 WHERE t.slug = 'arrays' ORDER BY c.display_order`
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
             WHERE t.slug = 'arrays' AND d.slug = 'produce'
               AND ch.role = 'practise' AND ch.is_active
             ORDER BY c.display_order`
        );

        expect(rows.map((r) => r.concept)).toEqual([
            "array-copy-spread",
            "default-rest-params"
        ]);

        for (const row of rows) {
            expect(row.activity, row.concept).toBe("mission");
        }
    });

    it("keeps default-rest-params here, where there is an array to gather into", async () => {
        const [row] = await fx.rows<{ topic: string; order: number }>(
            `SELECT t.slug AS topic, c.display_order AS order FROM concepts c
             JOIN topics t ON t.id = c.topic_id WHERE c.slug = 'default-rest-params'`
        );

        // Rest gathers extra arguments INTO AN ARRAY, so it could not be met
        // in Functions, four topics earlier, where it used to sit.
        expect(row?.topic).toBe("arrays");
    });

    /**
     * The nine the NEXT topic owns.
     *
     * Every one is refused by the interpreter by name, so a question that
     * reached for one could not run — but content is written before it is run,
     * and `array-mutation`'s own wording names `sort` in passing. This checks
     * the prose as well as the code, because a prompt that merely MENTIONS
     * `.map()` has still put it in front of the learner early.
     */
    it("never reaches for an array method the next topic teaches", async () => {
        const rows = await fx.rows<{ concept: string; prompt: string; explanation: string | null }>(
            `SELECT c.slug AS concept, q.prompt, q.explanation
             FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             JOIN topics t      ON t.id  = c.topic_id
             WHERE t.slug = 'arrays' AND q.is_active`
        );
        const owned = ["map", "filter", "reduce", "forEach", "find", "some", "every", "flat", "sort"];
        const offences: string[] = [];

        // Not vacuous: there is content to scan, and the pattern does match
        // when the thing it looks for is there.
        expect(rows.length).toBeGreaterThan(10);
        expect(new RegExp(`\\.map\\s*\\(`).test("a.map(x)")).toBe(true);

        for (const row of rows) {
            for (const method of owned) {
                if (new RegExp(`\\.${method}\\s*\\(`).test(`${row.prompt}\n${row.explanation ?? ""}`)) {
                    offences.push(`${row.concept} uses .${method}()`);
                }
            }
        }

        expect([...new Set(offences)]).toEqual([]);
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
             WHERE t.slug = 'arrays' AND q.is_active AND ch.role = 'practise'`
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
            [/\bfunction\b|=>/, "function-declaration"],
            [/\bfor\s*\(|\bwhile\s*\(/, "for-loop-anatomy"],
            [/\bvar\s+\w/, "block-vs-function-scope"],
            // An array LITERAL is taught HERE, at array-indexing, so it is
            // checked against its own position rather than assumed forward.
            [/\[\s*\]|\[[^\]]*,/, "array-indexing"],
            // Spread belongs to array-copy-spread, four concepts in.
            [/\.\.\./, "array-copy-spread"],
            [/\{\s*\w+\s*:/, "object-access"]
        ];
        const offences: string[] = [];

        for (const row of rows) {
            // Code, not prose. A prompt is English, a blank line, then a
            // snippet; backticked fragments inline are code too.
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
             WHERE t.slug = 'arrays' AND q.is_active AND q.explanation IS NULL`
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
             WHERE t.slug = 'arrays' AND d.slug = 'explain' AND q.is_active`
        );
        const declared = await fx.rows<{ n: number }>(
            `SELECT COUNT(*)::INT AS n FROM concept_demands cd
             JOIN concepts c ON c.id = cd.concept_id
             JOIN topics   t ON t.id = c.topic_id
             JOIN demands  d ON d.id = cd.demand_id
             WHERE t.slug = 'arrays' AND d.slug = 'explain'`
        );

        expect(rows.length, "one question per declared explain rung").toBe(declared[0]!.n);
        expect(rows.length).toBe(3);

        for (const row of rows) {
            expect(row.prompt.toLowerCase(), row.prompt.slice(0, 40)).toContain("why");
            expect(row.correct.length, "a mechanism takes a clause, not a word")
                .toBeGreaterThan(25);
        }
    });

    /**
     * The misconception this topic has to actively correct.
     *
     * `const` on an array stops the NAME being pointed somewhere else and does
     * nothing whatever about the contents. It is the commonest wrong answer to
     * "how do I stop this being changed", so it is offered as a repair option
     * that does not work, and the explanation says why.
     */
    it("offers const as a repair that does not work", async () => {
        const [row] = await fx.rows<{ explanation: string; wrong: string }>(
            `SELECT q.explanation,
                    (SELECT STRING_AGG(o.option_text, ' | ') FROM question_options o
                     WHERE o.question_id = q.id AND NOT o.is_correct) AS wrong
             FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             JOIN demands d     ON d.id  = ch.demand_id
             WHERE c.slug = 'array-mutation' AND d.slug = 'repair' AND q.is_active`
        );

        expect(row?.wrong).toMatch(/const/i);
        expect(row?.explanation).toMatch(/const/i);
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
             WHERE t.slug = 'arrays'
             GROUP BY c.slug, c.display_order
             ORDER BY c.display_order`
        );

        expect(rows).toHaveLength(7);

        for (const row of rows) {
            expect(row.playable, row.concept).toBe(row.declared);
        }
    });
});
