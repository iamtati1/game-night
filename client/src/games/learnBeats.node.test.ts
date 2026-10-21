import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONCEPTS } from "./curriculum.js";
import { learnBeatFor, learnBeatForConcept } from "./learnBeats.js";

/**
 * The Learn half of Learn -> Play, on the client side of the wire.
 *
 * The server decides WHICH concept is due; this file is about what the client
 * does with that answer. Two things matter: that a beat exists for the concept
 * the first slice introduces, and that the page reports the acknowledgement
 * before the run is dealt -- because the concept has to be encountered by the
 * time the dealer builds the candidate pool.
 */

// Resolved from the working directory rather than import.meta.url: Vite
// rewrites that during transform, so it does not point at the file on disk.
const GAME_PAGE = readFileSync(join(process.cwd(), "src/pages/GamePage.tsx"), "utf8");

describe("the first concept has a worked example", () => {
    it("has a beat for primitive-types", () => {
        expect(learnBeatForConcept("primitive-types")).not.toBeNull();
    });

    it("names a concept the curriculum actually declares", () => {
        // A beat keyed to a slug no concept has would never be reached, because
        // the server only ever sends slugs from `concepts`.
        const beat = learnBeatForConcept("primitive-types")!;

        expect(CONCEPTS.some((c) => c.id === "primitive-types")).toBe(true);
        expect(beat.topic).toBe("values");
    });

    it("shows the thing the learner is about to use", () => {
        // The practice question seed 016 tags is typeof "5" versus typeof 5.
        // The beat has to be that idea, or the transition teaches one thing and
        // tests another.
        const beat = learnBeatForConcept("primitive-types")!;

        expect(beat.code).toContain("typeof");
        expect(beat.output).toContain("string");
        expect(beat.output).toContain("number");
    });

    it("stays a beat, not a lesson", () => {
        // "Here's the thing you're about to use", not a chapter. Kept as a
        // measured limit rather than a note nobody reads.
        for (const [slug, beat] of [
            ["primitive-types", learnBeatForConcept("primitive-types")!]
        ] as const) {
            expect(beat.code.split("\n").length, `${slug} code`).toBeLessThanOrEqual(4);
            expect(beat.rule.length, `${slug} rule`).toBeLessThanOrEqual(120);
            expect(beat.rule.trim().split(/(?<=[.!?])\s+/).length, `${slug} sentences`).toBe(1);
        }
    });

    it("returns null for a concept with no beat authored", () => {
        // The server may offer an introduction this client has no example for.
        // Null is the signal to fall back to the curriculum's own one-liner.
        expect(learnBeatForConcept("async-await")).toBeNull();
        expect(learnBeatForConcept(null)).toBeNull();
    });
});

describe("the older ?focus= path is untouched", () => {
    it("still resolves its topic-keyed beat", () => {
        // Not part of curriculum progression -- unrecorded, and nothing in the
        // app links to it -- but removing it was never the job.
        expect(learnBeatFor("variables")).not.toBeNull();
        expect(learnBeatFor("primitive-types"), "topic map, not concept map").toBeNull();
    });
});

describe("the page reports the acknowledgement before it deals the run", () => {
    it("asks the server which concept to introduce", () => {
        expect(GAME_PAGE).toContain("/api/curriculum/introduction");
        expect(GAME_PAGE).toContain("learnBeatForConcept");
    });

    it("posts the completion before starting the session", () => {
        // POST /api/sessions builds the candidate pool. If the completion landed
        // after it, the practice this introduction unlocks would be missing from
        // the very run it was meant to unlock.
        const acknowledge = GAME_PAGE.indexOf("const acknowledge = useCallback");
        const complete = GAME_PAGE.indexOf("/complete");
        const begin = GAME_PAGE.indexOf("const begin = useCallback");

        expect(acknowledge).toBeGreaterThan(-1);
        expect(complete).toBeGreaterThan(acknowledge);
        expect(complete).toBeLessThan(begin);
    });

    it("awaits it, rather than firing and hoping", () => {
        const acknowledge = GAME_PAGE.slice(
            GAME_PAGE.indexOf("const acknowledge = useCallback"),
            GAME_PAGE.indexOf("const begin = useCallback")
        );

        expect(acknowledge).toContain("await api.post(");
        expect(acknowledge).toContain("setCountingIn(true)");
    });

    it("does not let a failed report block play", () => {
        // Losing a run to a bookkeeping request would be worse than showing one
        // card twice.
        const acknowledge = GAME_PAGE.slice(
            GAME_PAGE.indexOf("const acknowledge = useCallback"),
            GAME_PAGE.indexOf("const begin = useCallback")
        );

        expect(acknowledge).toContain("catch");
    });

    it("never decides for itself what the learner may see", () => {
        // Eligibility is the server's. The page renders a concept it was handed
        // and reports a button press; it reads no prerequisite graph.
        for (const word of ["prerequisite", "concept_id", "challenges"]) {
            expect(GAME_PAGE, `GamePage must not mention ${word}`).not.toContain(word);
        }
    });
});

describe("every Learn Beat shows real code", () => {
    // Understand -> See -> Try. A concept with no hand-written beat used to fall
    // back to its name and a sentence; GamePage now shows the first worked
    // example from the concept's own lesson instead. This holds the data that
    // fallback depends on, for every concept the server can introduce.
    it("has a beat or a lesson example with code for every concept", async () => {
        const { lessonFor } = await import("./lessons.js");
        const missing = CONCEPTS.filter(
            (c) =>
                !learnBeatForConcept(c.id)?.code &&
                !lessonFor(c.id)?.teach.some((block) => block.code.trim() !== "")
        ).map((c) => c.id);

        expect(missing).toEqual([]);
    });

    it("builds the fallback from the lesson rather than the bare meaning", () => {
        expect(GAME_PAGE).toContain("beatFromLesson(introduction)");
        expect(GAME_PAGE).not.toMatch(/code: "",\s*output: "",\s*rule: introduction\.meaning/);
    });
});
