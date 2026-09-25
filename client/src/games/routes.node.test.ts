import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GAMES } from "./catalog.js";

/**
 * Every game must be REACHABLE.
 *
 * Code Blitz was unreachable for three commits and nothing failed. Its catalog
 * entry pointed at `/play`, which worked only while the games grid lived at
 * `/`. When the grid moved to `/play` there were two routes registered for that
 * path, React Router matched the first, and clicking Code Blitz rendered the
 * grid again -- a dead button with no error, no warning and no failing test.
 *
 * These read App.tsx as text rather than rendering it, for the same reason
 * learningPath.test.ts does: the thing that broke was the ROUTE TABLE, and a
 * render test would have had to guess which paths to visit. What matters is
 * that the table itself is sound.
 */
// Relative to the package root, which is where vitest runs. import.meta.url is
// not a file URL under Vite's test environment.
const APP = readFileSync("src/App.tsx", "utf8");

/** Every `path="..."` in the route table, in the order React Router sees them. */
const declared = [...APP.matchAll(/path="([^"]+)"/g)].map((m) => m[1]!);

describe("the route table", () => {
    it("declares no path twice", () => {
        // The exact failure. React Router silently takes the first match, so a
        // duplicate means whatever is registered second can never render.
        const seen = new Set<string>();
        const duplicated = declared.filter((p) => (seen.has(p) ? true : (seen.add(p), false)));

        expect(duplicated, "a repeated path shadows whatever comes after it").toEqual([]);
    });

    it("has a route for every game in the catalog", () => {
        const missing = GAMES.filter((game) => !declared.includes(game.path)).map((g) => g.slug);

        expect(missing, "these games have a card that leads nowhere").toEqual([]);
    });

    it("gives every game a path of its own", () => {
        const paths = GAMES.map((g) => g.path);

        expect(new Set(paths).size, "two games cannot share a route").toBe(paths.length);
    });

    it("keeps Code Blitz off the games-grid path", () => {
        // Named specifically because this is the collision that happened, and
        // /play is the one path a future grid is most likely to want back.
        const blitz = GAMES.find((g) => g.slug === "code-blitz");

        expect(blitz?.path).toBe("/code-blitz");
        expect(blitz?.path).not.toBe("/play");
    });
});
