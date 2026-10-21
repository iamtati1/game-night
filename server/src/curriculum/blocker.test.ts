import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";

/**
 * findBlocker names what has to be done before a locked concept opens.
 *
 * UX audit: the client now shows this name on a locked concept ("Reading
 * Variables comes first"), where it used to show "builds on something else"
 * over an empty list. A name on screen has to be the true one, so this runs
 * the real query against the real migrations and seeds.
 *
 * findBlocker reads the server pool directly, so the pool is pointed at the
 * in-memory fixture. Nothing here touches a real database.
 */
const holder: { fx: CurriculumFixture | null } = { fx: null };

vi.mock("../db.js", () => ({
    pool: { query: (sql: string, params?: unknown[]) => holder.fx!.db.query(sql, params) }
}));

const { findBlocker } = await import("./encounter.js");

let fx: CurriculumFixture;

beforeAll(async () => {
    fx = await buildCurriculumFixture();
    holder.fx = fx;
}, 300000);

/** Concepts in path order, as the learner walks them. */
async function conceptsOf(topic: string): Promise<{ id: string; slug: string; name: string }[]> {
    return fx.rows(
        `SELECT c.id::text AS id, c.slug, c.name FROM concepts c JOIN topics t ON t.id = c.topic_id
         WHERE t.slug = $1 ORDER BY c.display_order`,
        [topic]
    );
}

async function demonstrate(user: string, conceptId: string) {
    await fx.db.query("INSERT INTO concept_demonstrations (user_id, concept_id) VALUES ($1, $2)", [user, conceptId]);
}

describe("what stands in front of a locked concept", () => {
    it("is the first unfinished concept on the path, by its real name", async () => {
        const user = await fx.insertUser("blocker-fresh@jolt.test");
        const [first, second, , fourth] = await conceptsOf("values");

        expect(await findBlocker(user, second!.slug)).toEqual({ kind: "concept", slug: first!.slug, name: first!.name });
        // Not this concept's own prerequisite: the earliest unfinished thing.
        expect(await findBlocker(user, fourth!.slug)).toEqual({ kind: "concept", slug: first!.slug, name: first!.name });
    });

    it("moves on as concepts are finished", async () => {
        const user = await fx.insertUser("blocker-moving@jolt.test");
        const [first, second, third] = await conceptsOf("values");
        await demonstrate(user, first!.id);

        expect(await findBlocker(user, third!.slug)).toEqual({ kind: "concept", slug: second!.slug, name: second!.name });
    });

    it("is the checkpoint once every earlier concept is done and the checkpoint is not", async () => {
        const user = await fx.insertUser("blocker-checkpoint@jolt.test");
        for (const c of await conceptsOf("values")) await demonstrate(user, c.id);
        const [firstVariable] = await conceptsOf("variables");
        const [values] = await fx.rows<{ name: string }>("SELECT name FROM topics WHERE slug = 'values'");

        expect(await findBlocker(user, firstVariable!.slug)).toEqual({
            kind: "checkpoint",
            slug: "values",
            name: values!.name
        });
    });

    it("is the checkpoint, not a concept still behind it, for a concept further into the next topic", async () => {
        // Phase 2A left a hop here: the earliest unfinished CONCEPT before the
        // second Variables concept is the first Variables concept -- itself
        // locked behind the Values checkpoint. Naming it sent the learner to a
        // locked page that then named the checkpoint. The path's own current
        // step is the checkpoint, and that is what stands in the way.
        const user = await fx.insertUser("blocker-hop@jolt.test");
        for (const c of await conceptsOf("values")) await demonstrate(user, c.id);
        const [, secondVariable] = await conceptsOf("variables");
        const [values] = await fx.rows<{ name: string }>("SELECT name FROM topics WHERE slug = 'values'");

        expect(await findBlocker(user, secondVariable!.slug)).toEqual({
            kind: "checkpoint",
            slug: "values",
            name: values!.name
        });
    });

    it("is nothing once the checkpoint is passed too", async () => {
        const user = await fx.insertUser("blocker-clear@jolt.test");
        for (const c of await conceptsOf("values")) await demonstrate(user, c.id);
        await fx.db.query(
            "INSERT INTO topic_challenge_completions (user_id, topic_id) SELECT $1, id FROM topics WHERE slug = 'values'",
            [user]
        );
        const [firstVariable] = await conceptsOf("variables");

        expect(await findBlocker(user, firstVariable!.slug)).toBeNull();
    });
});
