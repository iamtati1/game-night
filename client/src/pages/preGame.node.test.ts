import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every game briefs the player before it starts, and nothing is served until
 * they say go.
 *
 * The second half is the one that can regress silently. The server stamps
 * served_at when it hands over a question, and that stamp is the deadline -- so
 * a countdown placed on the far side of the request that starts the round spends
 * the player's own time showing them a countdown. Code Blitz loses 1.65s of a
 * 35s window that way, and nothing about the screen looks wrong.
 *
 * These are source assertions rather than rendered tests because what matters is
 * the ORDER of two calls, which is a property of the code rather than of any one
 * frame. A render test would pass whether the POST came before or after.
 */
// Resolved from the working directory rather than import.meta.url: Vite rewrites
// that during transform, so it does not point at the file on disk here.
const page = (name: string) => readFileSync(join(process.cwd(), "src/pages", name), "utf8");

const PAGES = {
    "Code Blitz": page("GamePage.tsx"),
    Flush: page("FlushPage.tsx"),
    "Bug Hunt": page("BugHuntPage.tsx"),
    Reaction: page("ReactionPage.tsx"),
    Memory: page("MemoryPage.tsx")
};

describe("every game briefs before it plays", () => {
    it("shows something before the first round in all five", () => {
        // Code Blitz and Flush share GameIntro; the other three have their own,
        // which is deliberate -- Memory's was the benchmark the shared one came
        // from, and Bug Hunt's briefing is part of its voice.
        const introduces = (src: string) =>
            /GameIntro|mem-intro|bh-briefing|phase === "intro"/.test(src);

        for (const [name, src] of Object.entries(PAGES)) {
            expect(introduces(src), `${name} drops the player straight in`).toBe(true);
        }
    });

    it("gives every game a start control the player has to press", () => {
        for (const [name, src] of Object.entries(PAGES)) {
            expect(/onStart=|onClick=\{\(\) =>/.test(src), `${name} has no start action`).toBe(
                true
            );
        }
    });
});

describe("the clock does not run during the countdown", () => {
    /**
     * The three games whose first round is served by the request that starts the
     * session, so the countdown has to come first.
     *
     * Reaction is not here on purpose: it has its own ready phase, and its clock
     * starts when the signal is painted rather than when the session is created.
     * Bug Hunt is not here either -- its first three incidents are untimed, and
     * it already plays an alert beat between Start and the first hunt.
     */
    const SERVES_ON_START = ["Code Blitz", "Flush", "Memory"] as const;

    it("counts in before creating the session, not after", () => {
        for (const name of SERVES_ON_START) {
            const src = PAGES[name];

            expect(src, `${name} does not count the player in`).toMatch(/<GetReady/);

            // The start control must set the counting-in state rather than call
            // the function that creates the session.
            const startsDirectly =
                /onStart=\{\(\) => void (begin|start)\(/.test(src) ||
                /onClick=\{\(\) => void start\(true\)\}/.test(src);

            expect(
                startsDirectly,
                `${name}'s Start calls the session directly, so its clock runs during the countdown`
            ).toBe(false);
        }
    });

    it("hands the session call to the countdown's onDone", () => {
        for (const name of SERVES_ON_START) {
            expect(
                PAGES[name],
                `${name} never starts the session after counting in`
            ).toMatch(/<GetReady[\s\S]{0,120}onDone=\{\(\) => void (begin|start)\(/);
        }
    });

    it("keeps the countdown out of the way when the start fails", () => {
        // A conflict or an error has to win over the countdown, or a blocked
        // start leaves the player watching 3-2-1 forever.
        for (const name of ["Code Blitz", "Flush"] as const) {
            expect(PAGES[name]).toMatch(/setCountingIn\(false\)/);
        }
    });
});

describe("the briefings say what the player is in for", () => {
    it("tells Code Blitz players the difficulty climbs", () => {
        expect(PAGES["Code Blitz"]).toMatch(/get harder|difficulty climbs/i);
    });

    it("tells Bug Hunt players which incidents are timed", () => {
        expect(PAGES["Bug Hunt"]).toMatch(/untimed/i);
    });

    it("gives every game the shape of a run", () => {
        // Stated per game rather than by one loose pattern, because they say it
        // in different shapes: four use a single `shape` line, and Bug Hunt puts
        // its numbers in a definition list beside integrity and attempts.
        const SAYS_ITS_LENGTH: Record<string, RegExp> = {
            "Code Blitz": /10 questions/,
            Flush: /5 rounds/,
            "Bug Hunt": /<dt>Incidents<\/dt>[\s\S]{0,40}<dd>10<\/dd>/,
            Reaction: /5 rounds/,
            Memory: /5 rounds/
        };

        for (const [name, pattern] of Object.entries(SAYS_ITS_LENGTH)) {
            expect(PAGES[name as keyof typeof PAGES], `${name} never says how long a run is`)
                .toMatch(pattern);
        }
    });
});
