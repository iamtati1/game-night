import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * What the Bug Hunt results screen says a run cleared, against a real database.
 *
 * practiceClearedInSession reports the Bug Hunt arm of CLEARED_RUNGS_CTE for
 * one run. These tests hold it to that arm: a resolved round on a tagged
 * incident counts, a failed one and an untagged one do not, and for a learner
 * with a single run the two agree exactly.
 */

const db = new PGlite();

const pool = {
    query: async <T>(text: string, params?: unknown[]) => {
        const result = await db.query<T>(text, params as never[]);
        return { rows: result.rows, rowCount: result.affectedRows || result.rows.length };
    },
    connect: async () => ({ query: pool.query, release: () => undefined })
};

vi.mock("../db.js", () => ({ pool }));

const { practiceClearedInSession } = await import("./queries.js");
const { CLEARED_RUNGS_CTE } = await import("../curriculum/encounter.js");

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await db.query<T>(sql, params as never[])).rows;
}

let n = 0;
async function newLearner(): Promise<string> {
    n += 1;
    const [user] = await rows<{ id: string }>(
        `INSERT INTO users (email, username, password_hash) VALUES ($1, $1, 'x') RETURNING id`,
        [`practice-cleared-${n}@jolt.test`]
    );
    return user!.id;
}

async function newHunt(userId: string): Promise<string> {
    const [session] = await rows<{ id: string }>(
        `INSERT INTO game_sessions (user_id, game_id)
         VALUES ($1, (SELECT id FROM games WHERE slug = 'bug-hunt')) RETURNING id`,
        [userId]
    );
    return session!.id;
}

/** A finished round, filled the way the game finishes one (the schema refuses less). */
async function round(sessionId: string, incidentId: string, order: number, status: "resolved" | "failed") {
    const [option] = await rows<{ id: string }>(
        `SELECT id FROM bug_hunt_options WHERE incident_id = $1 AND is_active AND is_correct ORDER BY id LIMIT 1`,
        [incidentId]
    );
    await rows(
        `INSERT INTO bug_hunt_rounds
             (game_session_id, incident_id, display_order, status, time_limit_ms,
              served_at, ended_at, selected_option_id, attempts)
         VALUES ($1, $2, $3, $4, 60000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $5, 1)`,
        [sessionId, incidentId, order, status, option!.id]
    );
}

let tagged: { id: string; concept_slug: string; demand_slug: string }[];
let untagged: { id: string };

beforeAll(async () => {
    for (const dir of ["migrations", "seeds"]) {
        const base = new URL(`../../${dir}/`, import.meta.url);
        for (const f of readdirSync(base).filter((f) => f.endsWith(".sql")).sort()) {
            await db.exec(readFileSync(new URL(f, base), "utf8"));
        }
    }

    tagged = await rows(
        `SELECT i.id, c.slug AS concept_slug, d.slug AS demand_slug
         FROM bug_hunt_incidents i
         JOIN challenges ch ON ch.id = i.challenge_id
         JOIN concepts c ON c.id = ch.concept_id
         JOIN demands d ON d.id = ch.demand_id
         WHERE i.is_active AND ch.role = 'practise'
         ORDER BY i.id LIMIT 2`
    );
    [untagged] = await rows(
        `SELECT id FROM bug_hunt_incidents WHERE is_active AND challenge_id IS NULL ORDER BY id LIMIT 1`
    );
    expect(tagged).toHaveLength(2);
    expect(untagged).toBeDefined();
}, 300000);

describe("the practice stops a Bug Hunt run cleared", () => {
    it("counts a resolved tagged incident, not a failed one or an untagged one", async () => {
        const learner = await newLearner();
        const hunt = await newHunt(learner);
        await round(hunt, tagged[0]!.id, 1, "resolved");
        await round(hunt, tagged[1]!.id, 2, "failed");
        await round(hunt, untagged.id, 3, "resolved");

        const earned = await practiceClearedInSession(hunt);

        expect(earned.map((e) => [e.conceptSlug, e.demandSlug])).toEqual([
            [tagged[0]!.concept_slug, tagged[0]!.demand_slug]
        ]);
        expect(earned[0]!.conceptName.length).toBeGreaterThan(0);
    });

    it("agrees exactly with the evidence rule for a learner with one run", async () => {
        const learner = await newLearner();
        const hunt = await newHunt(learner);
        await round(hunt, tagged[0]!.id, 1, "resolved");
        await round(hunt, tagged[1]!.id, 2, "resolved");

        const earned = await practiceClearedInSession(hunt);
        const cleared = await rows<{ concept_slug: string; demand_slug: string }>(
            `WITH ${CLEARED_RUNGS_CTE}
             SELECT c.slug AS concept_slug, d.slug AS demand_slug
             FROM cleared JOIN concepts c ON c.id = cleared.concept_id JOIN demands d ON d.id = cleared.demand_id
             ORDER BY 1, 2`,
            [learner]
        );

        expect(earned.map((e) => ({ concept_slug: e.conceptSlug, demand_slug: e.demandSlug }))).toEqual(cleared);
    });

    it("is empty for a run that cleared nothing", async () => {
        const learner = await newLearner();
        const hunt = await newHunt(learner);
        await round(hunt, tagged[0]!.id, 1, "failed");
        await round(hunt, untagged.id, 2, "resolved");

        expect(await practiceClearedInSession(hunt)).toEqual([]);
    });

    it("reports only its own run", async () => {
        const learner = await newLearner();
        const first = await newHunt(learner);
        await round(first, tagged[0]!.id, 1, "resolved");
        await rows(`UPDATE game_sessions SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = $1`, [first]);
        const second = await newHunt(learner);
        await round(second, tagged[1]!.id, 1, "failed");

        expect(await practiceClearedInSession(second)).toEqual([]);
    });
});
