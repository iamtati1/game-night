import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * One name per destination, across the whole client.
 *
 * The link to /journey was "See your journey", "Back to your journey", "Back
 * to the journey", "Back to the map" and "Continue your Journey"; the link to
 * /play was "Back home" (it is not home) and "Back to Jolt". They now read
 * ACTION.seeJourney and ACTION.backToGames from vocabulary.ts. This scans the
 * source so a retired label cannot quietly come back.
 *
 * Resolved from the working directory, as preGame.node.test.ts does.
 */
const ROOTS = ["src/pages", "src/components", "src/games"];

const sources = ROOTS.flatMap((dir) =>
    readdirSync(join(process.cwd(), dir))
        .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
        .map((f) => ({ file: `${dir}/${f}`, text: readFileSync(join(process.cwd(), dir, f), "utf8") }))
);

/** Copy only: drop comments, so an explanation that quotes an old label is fine. */
const copyOf = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("labels for the same destination", () => {
    it.each([
        "Continue your Journey",
        "Back to your journey",
        "Back to the journey",
        "Back to the map",
        "Back to Jolt",
        "See the whole map",
        "launch check"
    ])("no screen still says %s", (label) => {
        const offenders = sources.filter((s) => copyOf(s.text).includes(label)).map((s) => s.file);
        expect(offenders).toEqual([]);
    });

    it("never labels a link to the Games page 'Back home'", () => {
        const offenders = sources
            .filter((s) => /to="\/play"[^>]*>\s*Back home/.test(copyOf(s.text)))
            .map((s) => s.file);
        expect(offenders).toEqual([]);
    });
});
