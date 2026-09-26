import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";

/**
 * A demonstration now says WHAT the learner can do, not only that they met the
 * concept.
 *
 * concept_demonstrations.demand_id existed for three commits and nothing wrote
 * to it. A lesson still leaves it null -- finishing a lesson says the learner
 * was SHOWN a variable and nothing about whether they can write one. Practice
 * fills it in, which is the whole difference.
 */
describe("the rung a demonstration is evidence of", () => {
    let fx: CurriculumFixture;

    beforeAll(async () => {
        fx = await buildCurriculumFixture();
    }, 120000);

    /** Calls the same SQL the route does, against the fixture. */
    async function demonstrate(user: string, concept: string, demand: string | null) {
        await fx.rows(
            `INSERT INTO concept_demonstrations (user_id, concept_id, needed_retry, demand_id)
             SELECT $1, c.id, FALSE, (SELECT id FROM demands WHERE slug = $3)
             FROM concepts c WHERE c.slug = $2
             ON CONFLICT (user_id, concept_id) DO UPDATE
                 SET demand_id = COALESCE(EXCLUDED.demand_id, concept_demonstrations.demand_id)
                 WHERE concept_demonstrations.demand_id IS DISTINCT FROM EXCLUDED.demand_id
                   AND EXCLUDED.demand_id IS NOT NULL`,
            [user, concept, demand]
        );
    }

    async function rungOf(user: string, concept: string) {
        const [row] = await fx.rows<{ slug: string | null }>(
            `SELECT d.slug FROM concept_demonstrations cd
             JOIN concepts c ON c.id = cd.concept_id
             LEFT JOIN demands d ON d.id = cd.demand_id
             WHERE cd.user_id = $1 AND c.slug = $2`,
            [user, concept]
        );

        return row?.slug ?? null;
    }

    it("leaves a lesson's demonstration without a rung", async () => {
        await fx.scenario(async () => {
            const user = await fx.insertUser("r1@jolt.test");

            await demonstrate(user, "reassignment", null);

            expect(await rungOf(user, "reassignment")).toBeNull();
        });
    }, 120000);

    it("records the rung practice asked for", async () => {
        await fx.scenario(async () => {
            const user = await fx.insertUser("r2@jolt.test");

            await demonstrate(user, "reassignment", "apply");

            expect(await rungOf(user, "reassignment")).toBe("apply");
        });
    }, 120000);

    /* The ordering that matters: practice after a lesson must ADD evidence. */
    it("upgrades a lesson's rungless demonstration when practice follows", async () => {
        await fx.scenario(async () => {
            const user = await fx.insertUser("r3@jolt.test");

            await demonstrate(user, "reassignment", null);
            await demonstrate(user, "reassignment", "apply");

            expect(await rungOf(user, "reassignment")).toBe("apply");
        });
    }, 120000);

    /* And the reverse must never erase it. */
    it("never lets a later rungless demonstration erase what practice established", async () => {
        await fx.scenario(async () => {
            const user = await fx.insertUser("r4@jolt.test");

            await demonstrate(user, "reassignment", "apply");
            await demonstrate(user, "reassignment", null);

            expect(await rungOf(user, "reassignment")).toBe("apply");
        });
    }, 120000);

    it("keeps one row per learner per concept", async () => {
        await fx.scenario(async () => {
            const user = await fx.insertUser("r5@jolt.test");

            await demonstrate(user, "reassignment", null);
            await demonstrate(user, "reassignment", "apply");
            await demonstrate(user, "reassignment", "apply");

            const [{ n }] = await fx.rows<{ n: number }>(
                `SELECT COUNT(*)::INT n FROM concept_demonstrations WHERE user_id = $1`,
                [user]
            );

            expect(n).toBe(1);
        });
    }, 120000);

    it("ignores a rung the curriculum has never heard of", async () => {
        // Losing the rung is a smaller loss than losing the demonstration.
        await fx.scenario(async () => {
            const user = await fx.insertUser("r6@jolt.test");

            await demonstrate(user, "reassignment", "wizardry");

            expect(await rungOf(user, "reassignment")).toBeNull();
        });
    }, 120000);
});
