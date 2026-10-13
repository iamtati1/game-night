import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";
import { CODE_BLITZ_CANDIDATES_SQL, byCurriculumPreference } from "../game/queries.js";
import { dealSession } from "../game/curve.js";
import { QUESTIONS_PER_SESSION } from "../game/scoring.js";
import { NEXT_INTRODUCTION_SQL, RECORD_INTRODUCTION_SQL } from "./queries.js";

/**
 * The pacing ramp a beginner actually meets.
 *
 * WHAT THIS GUARDS, AND WHY IT IS A PROPERTY RATHER THAN A TABLE.
 *
 * questions.difficulty is Code Blitz's pacing ramp, and it was never authored
 * per question -- each content seed wrote one constant for the whole file. With
 * the untagged bank retired in seed 079, a beginner's reachable pool was 70
 * questions at tier 1 and one at tier 2, so difficultyCurve asked for a climb
 * and nearestTier flattened every slot onto 1. Seed 080 re-tiered the Values
 * and Variables questions by cognitive demand.
 *
 * Asserting the resulting 40/20/11 spread would pin this to today's content and
 * fail the next time a question is authored, which is the mistake the frontier
 * spread test already had to be rescued from. What matters to the learner is
 * the SHAPE: the round opens gently and gets harder. That is what is checked.
 *
 * NOT A SECOND COPY OF THE DEALER. The round comes from the shipping candidate
 * query and the real dealSession, so a change to either is felt here.
 */

let fx: CurriculumFixture;

beforeAll(async () => {
    fx = await buildCurriculumFixture();
}, 120_000);

/**
 * Completes Learn Beats through the shipping statements.
 *
 * Two is the measured minimum for a dealable round: practice is withheld until
 * its concept is met, so a learner who has met nothing is dealt nothing and
 * POST /api/sessions answers with the Learn Beat instead.
 */
async function learnBeats(userId: string, count: number): Promise<void> {
    for (let i = 0; i < count; i += 1) {
        const [next] = await fx.rows<{ challengeId: string }>(NEXT_INTRODUCTION_SQL, [userId]);

        if (!next) return;

        await fx.db.query(RECORD_INTRODUCTION_SQL, [userId, next.challengeId]);
    }
}

interface Dealt {
    id: string;
    topic: string | null;
    difficulty: number | null;
    concept_id: string | null;
}

async function round(userId: string): Promise<Dealt[]> {
    const pool = await fx.rows<Dealt>(CODE_BLITZ_CANDIDATES_SQL, ["0", userId, "code-blitz"]);

    return dealSession(
        byCurriculumPreference(pool as never) as never,
        QUESTIONS_PER_SESSION,
        () => 0.5
    ) as Dealt[];
}

describe("a beginner's round is paced, not flat", () => {
    it("opens on the gentlest tier and climbs above it", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("p1@example.com");
            await learnBeats(learner, 2);

            const tiers = (await round(learner)).map((q) => q.difficulty ?? 0);

            expect(tiers, "a full round to pace").toHaveLength(QUESTIONS_PER_SESSION);
            expect(tiers[0], "opens on the fundamentals").toBe(1);
            expect(Math.max(...tiers), "and climbs above them").toBeGreaterThan(1);
        });
    });

    it("offers more than one tier to choose from, or the curve has nothing to do", async () => {
        // The failure mode seed 080 fixes is not "the dealer picked badly" but
        // "every candidate carried the same number". Checked on the POOL rather
        // than the round, because that is where the flatness lived.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("p2@example.com");
            await learnBeats(learner, 2);

            const pool = await fx.rows<Dealt>(CODE_BLITZ_CANDIDATES_SQL, [
                "0",
                learner,
                "code-blitz"
            ]);

            expect(new Set(pool.map((q) => q.difficulty)).size).toBeGreaterThan(1);
        });
    });

    it("never reaches tier 4, which stays reserved", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("p3@example.com");
            await learnBeats(learner, 2);

            for (const q of await round(learner)) {
                expect(q.difficulty, `q${q.id} is past the beginner tiers`).toBeLessThan(4);
            }
        });
    });

    it("pays for the climb with curriculum content, not with anything that leaked in", async () => {
        // Pacing must not have bought variety by admitting untagged or
        // out-of-journey content. Every beat still has to be tagged, and the
        // topics still have to be ones the journey has opened.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("p4@example.com");
            await learnBeats(learner, 2);

            const dealt = await round(learner);

            for (const q of dealt) {
                expect(q.concept_id, `q${q.id} carries no challenge`).not.toBeNull();
            }

            expect(new Set(dealt.map((q) => q.topic))).toEqual(new Set(["values"]));
        });
    });

    it("leaves challenges.difficulty alone -- pacing is not the frontier", async () => {
        /*
         * The failure mode: seed 080 writing its pacing tiers into the wrong
         * column. challenges.difficulty is the learning frontier, derived as
         * f(topic.tier, demand.order), and in a beginner topic that function
         * can only ever return 1 or 2. A pacing 3 landing here would be caught.
         *
         * DELIBERATELY NOT the full derivation check. Three Values `explain`
         * challenges are stored at 1 where the rule says 2 -- they are part of
         * the 174 pre-existing mismatches recorded in the earlier audit, they
         * predate this work, and fixing them is explicitly out of scope. A test
         * asserting the whole rule here would fail for their reasons rather
         * than for this seed's, which is how a guard stops being read.
         */
        const outOfRange = await fx.rows<{ slug: string; demand: string; difficulty: number }>(
            `SELECT c.slug, d.slug AS demand, ch.difficulty
             FROM challenges ch
             JOIN concepts c ON c.id = ch.concept_id
             JOIN topics   t ON t.id = c.topic_id
             JOIN demands  d ON d.id = ch.demand_id
             WHERE t.display_order <= 2
               AND ch.difficulty NOT IN (1, 2)`
        );

        expect(outOfRange).toEqual([]);
    });
});
