import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";
import { CODE_BLITZ_CANDIDATES_SQL } from "../game/queries.js";
import { NEXT_INTRODUCTION_SQL, RECORD_INTRODUCTION_SQL } from "./queries.js";

/**
 * Booleans, as a learner meets it.
 *
 * booleans sits at Values #4 and declares exactly two rungs -- recognise and
 * predict. Neither had playable content, which made it the earliest genuine
 * hole in the whole path: a learner could be taught booleans and then never
 * practise them.
 *
 * NO PRODUCE AND NO APPLY, deliberately. The concept does not declare them and
 * its objective is "say where a true or a false came from", which is
 * recognition and reasoning rather than writing. Nothing was invented to make
 * the table look full.
 */
describe("the booleans slice", () => {
    let fx: CurriculumFixture;

    beforeAll(async () => {
        fx = await buildCurriculumFixture();
    }, 120000);

    /** Walks a learner to a concept, practising each one on the way. */
    async function learnerAt(email: string, stop: string): Promise<string> {
        const user = await fx.insertUser(email);

        for (let step = 0; step < 16; step += 1) {
            const next = await fx.rows<{ challengeId: string; conceptSlug: string }>(
                NEXT_INTRODUCTION_SQL,
                [user]
            );

            if (next.length === 0) break;

            const concept = next[0]!.conceptSlug;

            await fx.rows(RECORD_INTRODUCTION_SQL, [user, next[0]!.challengeId]);

            const practice = await fx.rows<{ id: string }>(
                `SELECT q.id FROM questions q
                 JOIN challenges ch ON ch.id = q.challenge_id
                 JOIN concepts c   ON c.id  = ch.concept_id
                 WHERE c.slug = $1 AND ch.role = 'practise'`,
                [concept]
            );

            if (practice.length > 0) {
                const [session] = await fx.rows<{ id: string }>(
                    `INSERT INTO game_sessions (user_id, game_id, status, completed_at)
                     VALUES ($1,(SELECT id FROM games WHERE slug='code-blitz'),'completed',NOW())
                     RETURNING id`,
                    [user]
                );

                for (const [i, row] of practice.entries()) {
                    await fx.rows(
                        `INSERT INTO session_questions
                             (game_session_id, question_id, display_order, prompt_text, status,
                              served_at, answered_at, is_correct, selected_option_id,
                              selected_option_text, correct_option_text)
                         SELECT $1, $2, $3, 'p', 'answered', NOW(), NOW(), TRUE,
                                o.id, o.option_text, o.option_text
                         FROM question_options o
                         WHERE o.question_id = $2 AND o.is_correct LIMIT 1`,
                        [session!.id, row.id, i + 1]
                    );
                }
            }

            if (concept === stop) return user;
        }

        throw new Error(`never reached ${stop}`);
    }

    it("declares recognise and predict, and nothing was invented beyond them", async () => {
        const declared = await fx.rows<{ slug: string }>(
            `SELECT d.slug FROM concept_demands cd
             JOIN concepts c ON c.id = cd.concept_id
             JOIN demands  d ON d.id = cd.demand_id
             WHERE c.slug = 'booleans' ORDER BY d.display_order`
        );

        expect(declared.map((d) => d.slug)).toEqual(["recognise", "predict"]);

        // No challenge may claim a rung booleans does not declare.
        const rungs = await fx.rows<{ slug: string }>(
            `SELECT DISTINCT d.slug FROM challenges ch
             JOIN concepts c ON c.id = ch.concept_id
             JOIN demands  d ON d.id = ch.demand_id
             WHERE c.slug = 'booleans' AND ch.is_active AND ch.role = 'practise'`
        );

        // Both declared rungs are now realised. This asserted ["predict"] while
        // recognition lived only in the lesson; seed 032 gave booleans a
        // recognise question of its own, which is what made Values finishable.
        // Nothing beyond the two declared rungs exists, which is the claim that
        // has not changed.
        expect(rungs.map((r) => r.slug).sort()).toEqual(["predict", "recognise"]);
    });

    it("reaches a learner once they have practised their way to it", async () => {
        await fx.scenario(async () => {
            const user = await learnerAt("bool@jolt.test", "booleans");

            const [session] = await fx.rows<{ id: string }>(
                `INSERT INTO game_sessions (user_id, game_id, status)
                 VALUES ($1,(SELECT id FROM games WHERE slug='code-blitz'),'in_progress')
                 RETURNING id`,
                [user]
            );

            const pool = await fx.rows<{ prompt: string; concept_id: string | null }>(
                CODE_BLITZ_CANDIDATES_SQL,
                [session!.id, user, "code-blitz"]
            );

            const booleans = await fx.rows<{ prompt: string }>(
                `SELECT q.prompt FROM questions q
                 JOIN challenges ch ON ch.id = q.challenge_id
                 JOIN concepts c   ON c.id  = ch.concept_id
                 WHERE c.slug = 'booleans'`
            );

            const dealt = pool.map((r) => r.prompt);

            for (const b of booleans) {
                expect(dealt, `booleans content must be reachable: ${b.prompt}`).toContain(b.prompt);
            }
        });
    }, 120000);

    /**
     * The grammar the lesson itself teaches, and nothing beyond it.
     *
     * `>` and `<` appear on purpose: the booleans lesson introduces comparison
     * explicitly as the thing that produces a boolean, because a learner at
     * Values #4 has met no other way to make one. What must NOT appear is
     * anything the lesson does not teach.
     */
    it("stays inside the grammar the lesson teaches", async () => {
        const rows = await fx.rows<{ prompt: string }>(
            `SELECT q.prompt FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             JOIN concepts c   ON c.id  = ch.concept_id
             WHERE c.slug = 'booleans'`
        );

        const code = rows.map((r) => r.prompt).join("\n");

        for (const [name, pattern] of [
            ["function", /\bfunction\b|=>/],
            ["array", /\[|\.push|\.filter|\.map|\.length/],
            ["object", /\{\s*\w+\s*:/],
            ["equality", /===|!==|==[^=]/],
            ["logical operator", /&&|\|\|/],
            ["conditional", /\bif\b|\belse\b/],
            ["loop", /\bfor\b|\bwhile\b/],
            ["variable", /\blet\b|\bconst\b/],
            ["method call", /\.\w+\(/]
        ] as const) {
            expect(
                pattern.test(code.replace(/console\.log/g, "")),
                `booleans content reaches into ${name}`
            ).toBe(false);
        }
    });

    it("keeps every item at the difficulty the curriculum derives", async () => {
        const rows = await fx.rows<{ difficulty: number }>(
            `SELECT ch.difficulty FROM challenges ch
             JOIN concepts c ON c.id = ch.concept_id
             WHERE c.slug = 'booleans' AND ch.is_active AND ch.role = 'practise'`
        );

        // predict is a shallow rung and booleans is a beginner topic.
        for (const row of rows) expect(row.difficulty).toBe(1);
    });
});
