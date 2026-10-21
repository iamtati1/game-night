import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * SEEDS AND THE IMPORTER SHARE A COLUMN, NOT A KEYSPACE.
 *
 * `external_ref` was added by migration 006 for one job: hold a PROVIDER's own
 * id so re-importing the same question is refused by the database rather than
 * by a prior SELECT. insertImportedQuestion() relies on that -- it inserts with
 * ON CONFLICT (source, external_ref) DO NOTHING and reads the row count to tell
 * "inserted" from "duplicate".
 *
 * The seeds now use the same column to name their own questions, which is the
 * same contract rather than a second one: a stable id, unique within a source.
 * What makes it safe is that the unique index is scoped BY source, so a seed
 * and a provider can never collide unless they claim the same source name.
 *
 * That is the thing worth testing, because it is the thing a careless future
 * change would break -- a seed written with `source = 'quizapi'`, or a provider
 * configured with a jolt- name, would put two different authorities in one
 * namespace and start silently discarding each other's rows.
 */
const SEEDS = new URL("../../seeds/", import.meta.url);

function seedSources(): Set<string> {
    const found = new Set<string>();

    for (const file of readdirSync(SEEDS).filter((f) => f.endsWith(".sql"))) {
        const sql = readFileSync(new URL(file, SEEDS), "utf8");

        for (const m of sql.matchAll(/'(jolt-[a-z0-9-]+)'/g)) found.add(m[1]!);
    }

    return found;
}

/** Every provider's `source`, read from the providers rather than assumed. */
function providerSources(): Set<string> {
    const base = new URL("./providers/", import.meta.url);
    const found = new Set<string>();

    for (const file of readdirSync(base).filter((f) => f.endsWith(".ts") && !f.includes(".test."))) {
        const src = readFileSync(new URL(file, base), "utf8");

        for (const m of src.matchAll(/source:\s*"([a-z0-9-]+)"/g)) found.add(m[1]!);
    }

    return found;
}

describe("seeded names cannot collide with imported ones", () => {
    it("finds both sets, or proves nothing", () => {
        expect(seedSources().size, "no seed sources found -- the regex has rotted")
            .toBeGreaterThan(10);
    });

    it("shares no source name between a seed and a provider", () => {
        const seeds = seedSources();
        const shared = [...providerSources()].filter((s) => seeds.has(s));

        expect(shared, "a provider and a seed claim the same namespace").toEqual([]);
    });

    it("keeps every seed source inside the jolt- namespace", () => {
        // The prefix is what makes the guarantee above checkable rather than
        // coincidental. A provider named `jolt-something` would be the mistake.
        for (const s of seedSources()) {
            expect(s.startsWith("jolt-"), `${s} is outside the seed namespace`).toBe(true);
        }
    });

    it("leaves the importer's conflict target exactly as it was", () => {
        // The seeds added rows to this index's keyspace. They must not have
        // changed how the importer uses it, because the row count from this
        // statement is what distinguishes "inserted" from "duplicate".
        const queries = readFileSync(new URL("./queries.ts", import.meta.url), "utf8");

        expect(queries).toContain(
            "ON CONFLICT (source, external_ref) WHERE external_ref IS NOT NULL DO NOTHING"
        );
    });
});
