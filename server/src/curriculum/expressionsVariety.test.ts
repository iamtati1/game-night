import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";

/**
 * SEED 085: expressions-produce-values practises its own idea, and printed
 * strings never show their quotes.
 *
 * The audit behind 085 found no wrong answer key, so these do not re-check
 * answers. They hold the three properties 085 restores, each of which a later
 * seed could quietly undo:
 *
 *     VARIETY     the concept is not mostly one-operator sums any more, and
 *                 it asks the learner to tell text from an expression
 *     QUOTES      no correct prediction is a whole quoted string, the
 *                 convention the console-output lesson teaches
 *     DISTINCT    no question offers two options that read the same once
 *                 trailing spaces are invisible
 */
describe("seed 085: expressions variety and output conventions", () => {
    let fx: CurriculumFixture;

    beforeAll(async () => {
        fx = await buildCurriculumFixture();
    }, 120000);

    const predictionsOn = (concept: string) =>
        fx.rows<{ prompt: string; ref: string | null }>(
            `SELECT q.prompt, q.external_ref AS ref
             FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             JOIN demands  d    ON d.id  = ch.demand_id
             WHERE c.slug = $1 AND d.slug = 'predict' AND q.is_active`,
            [concept]
        );

    it("keeps arithmetic drill a minority of expressions-produce-values", async () => {
        const all = await predictionsOn("expressions-produce-values");
        // A prompt whose only code is one console.log of a bare sum.
        const drill = all.filter((q) => /\n\nconsole\.log\(\d+ [-+*/] \d+\);$/.test(q.prompt));

        expect(all.length).toBeGreaterThanOrEqual(5);
        expect(drill.length).toBeLessThanOrEqual(1);
    });

    it("retires the lesson's own example and the sums that repeat arithmetic-operators", async () => {
        const refs = (await predictionsOn("expressions-produce-values")).map((q) => q.ref);
        expect(refs).not.toContain("values-008");
        expect(refs).not.toContain("values-009");
        expect(refs).not.toContain("values-010");
        expect(refs).toContain("values-007");
    });

    it("asks the learner to tell quoted text from an expression", async () => {
        // In the code (expr-variety-001, -003) or in the options (-002, whose
        // prompt is only "Which line displays 6?").
        const quoted = (await predictionsOn("expressions-produce-values")).filter(
            (q) => /console\.log\("\d+ [-+*/] \d+"\)/.test(q.prompt) || q.ref === "expr-variety-002"
        );
        expect(quoted.length).toBeGreaterThanOrEqual(3);
    });

    it("never marks a whole quoted string as what console.log prints", async () => {
        const rows = await fx.rows<{ id: number; option_text: string }>(
            `SELECT q.id::int, o.option_text
             FROM questions q
             JOIN question_options o ON o.question_id = q.id
             WHERE q.is_active AND o.is_active AND o.is_correct
               AND q.challenge_type = 'predict-output'
               AND q.prompt LIKE '%console.log(%'
               AND o.option_text ~ '^"[^"]*"( "[^"]*")*$'`
        );
        expect(rows).toEqual([]);
    });

    it("never offers two options that differ only by surrounding spaces", async () => {
        const rows = await fx.rows<{ id: number }>(
            `SELECT o.question_id::int AS id
             FROM question_options o
             JOIN questions q ON q.id = o.question_id
             WHERE q.is_active AND o.is_active
             GROUP BY o.question_id, btrim(o.option_text)
             HAVING COUNT(*) > 1`
        );
        expect(rows).toEqual([]);
    });

    it("leaves exactly one correct option on every question it touched", async () => {
        const rows = await fx.rows<{ id: number; correct: number }>(
            `SELECT q.id::int AS id,
                    (SELECT COUNT(*)::int FROM question_options o
                     WHERE o.question_id = q.id AND o.is_active AND o.is_correct) AS correct
             FROM questions q
             WHERE q.is_active
               AND (q.source = 'jolt-expressions-variety'
                    OR q.external_ref IN ('early-008', 'string-concatenation-predict-01'))`
        );
        expect(rows.length).toBe(5);
        for (const r of rows) expect(r.correct, `question ${r.id}`).toBe(1);
    });
});
