import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";
import { CODE_BLITZ_CANDIDATES_SQL } from "../game/queries.js";
import { ELIGIBLE_INCIDENT_PREDICATE } from "../bugHunt/queries.js";
import { BUG_HUNT_INCIDENTS_PER_SESSION } from "../bugHunt/scoring.js";
import { curriculumCtes, curriculumSelects } from "./selection.js";
import { incidentWithinJourney, journeyCte } from "./journey.js";
import { NEXT_INTRODUCTION_SQL, RECORD_INTRODUCTION_SQL } from "./queries.js";

/**
 * WHAT A BEGINNER IS ACTUALLY SERVED.
 *
 * The measured failure this protects against: the eight easiest Bug Hunt
 * incidents in the bank used functions, arrays, string methods, null and
 * comparison. Seven of the eight needed something a Variables learner has never
 * met, and every one was difficulty 1 -- so "difficulty" was never the thing
 * making them hard.
 *
 * These tests walk a real learner through the curriculum and assert on what the
 * two games would actually deal them at each point.
 */
describe("the beginner path", () => {
    let fx: CurriculumFixture;

    beforeAll(async () => {
        fx = await buildCurriculumFixture();
    }, 120000);

    /** A learner who has learned and practised everything up to `stop`. */
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

            // Practise it in Code Blitz, exactly as playing records it.
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
                     VALUES ($1, (SELECT id FROM games WHERE slug = 'code-blitz'), 'completed', NOW())
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

    async function blitzPool(user: string) {
        const [session] = await fx.rows<{ id: string }>(
            `INSERT INTO game_sessions (user_id, game_id, status)
             VALUES ($1, (SELECT id FROM games WHERE slug = 'code-blitz'), 'in_progress')
             RETURNING id`,
            [user]
        );

        const rows = await fx.rows<{ topic: string | null; prompt: string }>(
            CODE_BLITZ_CANDIDATES_SQL,
            [session!.id, user, "code-blitz"]
        );

        await fx.rows(
            `UPDATE game_sessions SET status='abandoned', abandoned_at=NOW() WHERE id=$1`,
            [session!.id]
        );

        return rows;
    }

    async function huntPool(user: string) {
        return fx.rows<{ slug: string; code: string }>(
            `WITH ${curriculumCtes("$1")},
                  ${journeyCte("$1", 10)}
             SELECT i.slug, i.code FROM bug_hunt_incidents i
             WHERE ${ELIGIBLE_INCIDENT_PREDICATE}
               AND ${curriculumSelects("i")}
               AND ${incidentWithinJourney("i")}`,
            [user]
        );
    }

    it("never deals a beginner a topic they have not reached", async () => {
        await fx.scenario(async () => {
            const user = await learnerAt("b1@jolt.test", "reassignment");
            const topics = new Set((await blitzPool(user)).map((r) => r.topic));

            // The bank is 36 functions questions, 29 async, 28 loops. None of
            // them may appear while the learner is still on Variables.
            expect([...topics].sort()).toEqual(["values", "variables"]);
        });
    }, 120000);

    it("keeps functions, arrays and null out of a beginner's debugging", async () => {
        await fx.scenario(async () => {
            const user = await learnerAt("b2@jolt.test", "reassignment");
            const code = (await huntPool(user)).map((r) => r.code).join("\n");

            for (const untaught of ["function ", "=>", ".length", ".trim", ".size", "null", "[]"]) {
                expect(code, `a beginner met ${untaught}`).not.toContain(untaught);
            }
        });
    }, 120000);

    it("opens enough debugging to fill a hunt once Variables is practised", async () => {
        await fx.scenario(async () => {
            const user = await learnerAt("b3@jolt.test", "reassignment");

            // Below this the start route 503s, which is what made Bug Hunt
            // look broken rather than locked.
            expect((await huntPool(user)).length).toBeGreaterThanOrEqual(
                BUG_HUNT_INCIDENTS_PER_SESSION
            );
        });
    }, 120000);

    /**
     * The ordering the whole slice exists to produce: you predict a concept
     * before you are asked to debug it.
     */
    it("withholds a concept's bugs until that concept has been practised", async () => {
        await fx.scenario(async () => {
            const user = await fx.insertUser("b4@jolt.test");

            // Learned, but never played.
            for (let step = 0; step < 16; step += 1) {
                const next = await fx.rows<{ challengeId: string; conceptSlug: string }>(
                    NEXT_INTRODUCTION_SQL,
                    [user]
                );

                if (next.length === 0) break;

                await fx.rows(RECORD_INTRODUCTION_SQL, [user, next[0]!.challengeId]);

                if (next[0]!.conceptSlug === "reassignment") break;
            }

            expect(
                (await huntPool(user)).length,
                "debugging must not open on the strength of lessons alone"
            ).toBe(0);
        });
    }, 120000);

    it("ships no two incidents with the same program", async () => {
        const dupes = await fx.rows<{ code: string }>(
            `SELECT code FROM bug_hunt_incidents WHERE is_active
             GROUP BY code HAVING COUNT(*) > 1`
        );

        expect(dupes.map((d) => d.code)).toEqual([]);
    });

    it("leaves every tagged incident actually dealable", async () => {
        // Three were authored with a single option and silently never dealt.
        const broken = await fx.rows<{ slug: string }>(
            `SELECT i.slug FROM bug_hunt_incidents i
             WHERE i.challenge_id IS NOT NULL AND NOT (${ELIGIBLE_INCIDENT_PREDICATE})`
        );

        expect(broken.map((b) => b.slug)).toEqual([]);
    });
});
