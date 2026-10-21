import { beforeAll, describe, expect, it } from "vitest";
import { DEALABLE_INCIDENTS_SQL, REACHABLE_INCIDENTS_SQL } from "../bugHunt/queries.js";
import { dealableSnippet } from "../flush/queries.js";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";
import { curriculumCtes } from "./selection.js";

/**
 * What the readiness screens SAY opens game content, checked against what
 * actually does.
 *
 * Browser QA: Flush told a learner "Keep going with <concept> to open more",
 * and finishing that concept's lesson opened nothing, because the dealer did
 * not read lesson evidence. Product decision since: it does. The dealer counts
 * an idea as met through Code Blitz questions, Bug Hunt rounds, Learn Beats,
 * and the lesson's own evidence -- activity_completions and
 * concept_demonstrations (eligibility.ts). The copy now says lessons open
 * content, and these pin that rule, so the two cannot drift apart silently.
 */

let fx: CurriculumFixture;

beforeAll(async () => {
    fx = await buildCurriculumFixture();
}, 300000);

async function flushDealable(user: string): Promise<number> {
    const [row] = await fx.rows<{ n: number }>(
        `WITH ${curriculumCtes("$1")} SELECT COUNT(*)::int AS n FROM flush_snippets s WHERE ${dealableSnippet("s")}`,
        [user]
    );
    return row!.n;
}

const count = async (sql: string, user: string) => Number((await fx.rows<{ count: string }>(sql, [user]))[0]!.count);

async function challengeOf(concept: string, role: "introduce" | "practise"): Promise<string[]> {
    const rows = await fx.rows<{ id: string }>(
        `SELECT ch.id::text AS id FROM challenges ch JOIN concepts c ON c.id = ch.concept_id
         WHERE c.slug = $1 AND ch.role = $2 AND ch.is_active ORDER BY ch.id`,
        [concept, role]
    );
    return rows.map((r) => r.id);
}

describe("finishing a lesson opens that concept's game content", () => {
    it("opens Flush and Bug Hunt content once the lesson is done", async () => {
        const user = await fx.insertUser("lesson-only@jolt.test");

        // Every practise rung of console-output cleared in the lesson, and the
        // concept demonstrated: everything a lesson can record.
        for (const id of await challengeOf("console-output", "practise")) {
            await fx.db.query("INSERT INTO activity_completions (user_id, challenge_id) VALUES ($1, $2)", [user, id]);
        }
        const [concept] = await fx.rows<{ id: string }>("SELECT id FROM concepts WHERE slug = 'console-output'");
        await fx.db.query("INSERT INTO concept_demonstrations (user_id, concept_id) VALUES ($1, $2)", [user, concept!.id]);

        expect(await flushDealable(user)).toBeGreaterThan(0);
        // Met now, so Bug Hunt's reason can no longer be "not-met".
        expect(await count(REACHABLE_INCIDENTS_SQL, user)).toBeGreaterThan(0);
    });

    it("opens them once the idea is met where the dealer looks: a Learn Beat", async () => {
        const user = await fx.insertUser("learn-beat@jolt.test");
        const [intro] = await challengeOf("console-output", "introduce");
        await fx.db.query("INSERT INTO introduction_completions (user_id, challenge_id) VALUES ($1, $2)", [user, intro!]);

        expect(await flushDealable(user)).toBeGreaterThan(0);
        expect(await count(REACHABLE_INCIDENTS_SQL, user)).toBeGreaterThan(0);
    });
});

describe("Bug Hunt's readiness reason matches the gate that is actually closed", () => {
    it("reports 'difficulty' -- met, but harder -- for a learner who has only met the idea", async () => {
        // The QA account's state: console-output met through its Learn Beat,
        // nothing yet played on it. The bugs are reachable; the frontier holds
        // them back. Saying "you have not met any of those ideas" was false.
        const user = await fx.insertUser("met-not-played@jolt.test");
        const [intro] = await challengeOf("console-output", "introduce");
        await fx.db.query("INSERT INTO introduction_completions (user_id, challenge_id) VALUES ($1, $2)", [user, intro!]);

        const reachable = await count(REACHABLE_INCIDENTS_SQL, user);
        const dealable = await count(DEALABLE_INCIDENTS_SQL, user);

        expect(reachable).toBeGreaterThan(0);
        expect(dealable).toBeLessThan(reachable);
    });

    it("never counts more dealable than reachable: dealable is reachable plus the frontier", async () => {
        const user = await fx.insertUser("fresh-learner@jolt.test");
        expect(await count(DEALABLE_INCIDENTS_SQL, user)).toBeLessThanOrEqual(await count(REACHABLE_INCIDENTS_SQL, user));
    });
});
