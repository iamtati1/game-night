import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { CONCEPTS, conceptsInTopic } from "../../../client/src/games/curriculum.ts";
import { SEED_PATH } from "../../scripts/generate-curriculum.ts";

/**
 * The curriculum seed converging onto a database that already holds an older
 * curriculum -- which is where it broke, and where the source-level convergence
 * tests could not see it.
 *
 * THE BUG THIS PINS. `concepts` has two unique indexes: (slug), which the seed's
 * upserts target, and (topic_id, display_order), which they cannot. Adding
 * `console-output` ahead of `primitive-types` shifted every concept in `values`
 * down one, and the first INSERT then tried to claim position 1 while
 * primitive-types still held it -- 23505 on concepts_topic_order_idx, with the
 * whole file rolled back. Every curriculum change before it had only appended to
 * the end of a topic, so no position had ever had to move.
 *
 * Executed rather than inspected, because the failure is a property of applying
 * the file to existing rows. A source-level check could assert the parking
 * statement is present but not that it is sufficient.
 */

const MIGRATIONS = new URL("../../migrations/", import.meta.url);
const CURRICULUM = readFileSync(SEED_PATH, "utf8");

let schema: string[];

beforeAll(() => {
    schema = readdirSync(MIGRATIONS)
        .filter((f) => f.endsWith(".sql"))
        .sort()
        .map((f) => readFileSync(new URL(f, MIGRATIONS), "utf8"));
}, 60_000);

/** A database whose curriculum tables hold `rows`, and nothing else. */
async function withConcepts(
    rows: { slug: string; order: number }[]
): Promise<PGlite> {
    const db = new PGlite();

    for (const sql of schema) await db.exec(sql);

    await db.exec(
        `INSERT INTO topics (slug, name, tier, display_order, rationale)
         VALUES ('values', 'Values and Types', 'beginner', 1, 'r')`
    );

    for (const row of rows) {
        await db.query(
            `INSERT INTO concepts
                 (topic_id, slug, name, objective, meaning, why, weight, display_order)
             VALUES ((SELECT id FROM topics WHERE slug = 'values'),
                     $1, $1, $1, $1, $1, 'core', $2)`,
            [row.slug, row.order]
        );
    }

    return db;
}

describe("the seed converges onto a database that already has a curriculum", () => {
    it("applies over the concept that used to hold position 1", async () => {
        // The exact shape that failed: values/primitive-types at 1, and no
        // console-output row at all.
        const db = await withConcepts([{ slug: "primitive-types", order: 1 }]);

        await expect(db.exec(CURRICULUM)).resolves.toBeDefined();
    }, 60_000);

    it("leaves the topic in the order the curriculum declares", async () => {
        const db = await withConcepts([{ slug: "primitive-types", order: 1 }]);

        await db.exec(CURRICULUM);

        const rows = await db.query<{ slug: string }>(
            `SELECT c.slug FROM concepts c
             JOIN topics t ON t.id = c.topic_id
             WHERE t.slug = 'values' ORDER BY c.display_order`
        );

        expect(rows.rows.map((r) => r.slug)).toEqual(
            conceptsInTopic("values").map((c) => c.id)
        );
    }, 60_000);

    it("projects every concept, however the database started", async () => {
        const db = await withConcepts([{ slug: "primitive-types", order: 1 }]);

        await db.exec(CURRICULUM);

        const [{ n }] = (
            await db.query<{ n: number }>(`SELECT COUNT(*)::INT n FROM concepts`)
        ).rows;

        expect(n).toBe(CONCEPTS.length);
    }, 60_000);

    it("parks nothing permanently -- a dropped concept is removed, not stranded", async () => {
        // A concept the curriculum no longer declares is shifted out of the way
        // like every other row, and then deleted rather than left at +1000.
        const db = await withConcepts([
            { slug: "primitive-types", order: 1 },
            { slug: "retired-idea", order: 2 }
        ]);

        await db.exec(CURRICULUM);

        const stranded = await db.query<{ slug: string }>(
            `SELECT slug FROM concepts WHERE display_order > 100`
        );
        const retired = await db.query<{ slug: string }>(
            `SELECT slug FROM concepts WHERE slug = 'retired-idea'`
        );

        expect(stranded.rows, "nothing left parked").toEqual([]);
        expect(retired.rows, "the dropped concept is gone").toEqual([]);
    }, 60_000);

    it("is still idempotent -- a second application changes nothing", async () => {
        const db = await withConcepts([{ slug: "primitive-types", order: 1 }]);

        await db.exec(CURRICULUM);

        const before = await db.query(
            `SELECT slug, display_order FROM concepts ORDER BY slug`
        );

        await db.exec(CURRICULUM);

        const after = await db.query(
            `SELECT slug, display_order FROM concepts ORDER BY slug`
        );

        expect(after.rows).toEqual(before.rows);
    }, 60_000);

    it("parks every row before writing any of them", async () => {
        // Order is the whole fix: parking after the first upsert would collide
        // exactly as before.
        const park = CURRICULUM.indexOf("UPDATE concepts SET display_order");
        const firstInsert = CURRICULUM.indexOf("INSERT INTO concepts");

        expect(park).toBeGreaterThan(-1);
        expect(park).toBeLessThan(firstInsert);
    });

    it("shifts by more than any position the curriculum can produce", async () => {
        // 1000 is a bound, not a guess. A shift derived from MAX(display_order)
        // would be wrong: it has to exceed the largest FINAL position.
        const topics = [...new Set(CONCEPTS.map((c) => c.topic))];
        const deepest = Math.max(...topics.map((t) => conceptsInTopic(t).length));

        expect(CURRICULUM).toContain("display_order + 1000");
        expect(deepest, "the largest topic must stay far below the shift").toBeLessThan(1000);
    });
});
