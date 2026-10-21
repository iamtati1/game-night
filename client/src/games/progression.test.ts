import { describe, expect, it } from "vitest";
import {
    conceptProgress,
    currentWorldStanding,
    openStanding,
    worldJustUnlocked,
    isNewlyOpen,
    nextAction,
    nextStepAfterRound,
    standingFor,
    unlockRequirement
} from "./progression.js";
import type { JourneyConcept, JourneyPathResponse, JourneyTopic } from "../api/types.js";

/**
 * The words the journey uses for its own state.
 *
 * These are assertions about what a learner is TOLD, which is the thing that
 * was missing: the map already drew the states and could not say them. The
 * progression rules themselves are the server's and are tested there; nothing
 * here invents a requirement or decides what unlocks what.
 */

const concept = (
    slug: string,
    state: JourneyConcept["state"],
    cleared = 0,
    playable = 3
): JourneyConcept => ({
    slug,
    name: slug,
    objective: `do ${slug}`,
    state,
    neededRetry: false,
    rungs: { cleared, playable }
});

const topic = (
    slug: string,
    state: JourneyTopic["state"],
    concepts: JourneyConcept[],
    challenge: JourneyTopic["challenge"] = null,
    order = 1
): JourneyTopic => ({ slug, name: slug, principle: "", order, state, concepts, challenge });

describe("what state a world is in, as the learner meets it", () => {
    const path = [
        topic("values", "complete", [concept("a", "demonstrated", 3)]),
        topic("variables", "current", [concept("b", "current", 1)]),
        topic("operators", "locked", [concept("c", "locked")]),
        topic("strings", "locked", [concept("d", "locked")])
    ];

    it("separates the next world from the far ones, where the API does not", () => {
        // Both are `locked` on the wire. Only one of them is worth telling the
        // learner about, and it is the one they are about to reach.
        expect(standingFor(path, "operators")).toBe("available");
        expect(standingFor(path, "strings")).toBe("locked");
    });

    it("reports the worlds behind and the world underfoot", () => {
        expect(standingFor(path, "values")).toBe("complete");
        expect(standingFor(path, "variables")).toBe("current");
    });

    it("locks everything when nothing is current, rather than guessing", () => {
        const done = [topic("values", "complete", [concept("a", "demonstrated", 3)])];

        expect(standingFor(done, "values")).toBe("complete");
        expect(standingFor(done, "nowhere")).toBe("locked");
    });
});

describe("what it takes to open the next world", () => {
    it("names exactly what is left, counted from real concept state", () => {
        const path = [
            topic("variables", "current", [
                concept("b", "demonstrated", 3),
                concept("c", "current", 1),
                concept("d", "locked")
            ]),
            topic("operators", "locked", [concept("e", "locked")])
        ];

        expect(unlockRequirement(path, "operators")).toBe(
            "Opens when you finish 2 concepts in variables"
        );
    });

    it("counts the checkpoint as its own outstanding thing", () => {
        const path = [
            topic("variables", "current", [concept("b", "current", 1)], { state: "locked" }),
            topic("operators", "locked", [concept("e", "locked")])
        ];

        expect(unlockRequirement(path, "operators")).toBe(
            "Opens when you finish 1 concept and the checkpoint in variables"
        );
    });

    it("does not walk the whole chain for a distant world", () => {
        // "Finish Values, then Variables, then Operators..." answers a question
        // nobody asked. One step is the only actionable amount.
        const path = [
            topic("variables", "current", [concept("b", "current")]),
            topic("operators", "locked", [concept("e", "locked")]),
            topic("strings", "locked", [concept("f", "locked")])
        ];

        expect(unlockRequirement(path, "strings")).toBe("Opens after operators");
    });

    it("says nothing about a world that is already open", () => {
        const path = [topic("variables", "current", [concept("b", "current")])];

        expect(unlockRequirement(path, "variables")).toBeNull();
    });

    it("never claims zero things are left", () => {
        // Everything in the previous topic is done and the next has still not
        // opened -- content, not the learner. "Finish 0 concepts" would be
        // worse than naming the world.
        const path = [
            topic("variables", "current", [concept("b", "demonstrated", 3)]),
            topic("operators", "locked", [concept("e", "locked")])
        ];

        expect(unlockRequirement(path, "operators")).toBe("Opens after variables");
    });
});

describe("marking a world the learner has only just reached", () => {
    it("is true while nothing in it has been cleared", () => {
        expect(isNewlyOpen(topic("variables", "current", [concept("b", "current", 0)]))).toBe(true);
    });

    it("stops as soon as they have FINISHED something, and survives a reload", () => {
        // Read from progress rather than from a timer, so refreshing the page
        // does not re-announce a world the learner is halfway through.
        expect(
            isNewlyOpen(topic("variables", "current", [concept("b", "demonstrated", 3)]))
        ).toBe(false);
    });

    it("is not cancelled by rungs cleared in a game rather than here", () => {
        // THE DEFECT THIS REPLACES. The test used to be `cleared > 0`, which
        // sounds like the same thing and is not: rungs are cleared by evidence,
        // and Code Blitz and Bug Hunt deal across the frontier rather than
        // along the lesson path. One Variables question answered in a round was
        // enough to make the world look "already started" before the learner
        // had ever been there -- so when it opened, the map said nothing and
        // the arrival announced nothing. The unlock was real and invisible.
        expect(isNewlyOpen(topic("variables", "current", [concept("b", "current", 2)]))).toBe(
            true
        );
    });

    it("is never true for a world behind or ahead", () => {
        expect(isNewlyOpen(topic("values", "complete", [concept("a", "demonstrated", 3)]))).toBe(
            false
        );
        expect(isNewlyOpen(topic("operators", "locked", [concept("e", "locked", 0)]))).toBe(false);
    });
});

describe("how far through a concept", () => {
    it("counts stops, and says so plainly", () => {
        expect(conceptProgress(concept("b", "current", 1, 3))).toBe("1 of 3 stops done");
    });

    it("says when the ladder is finished rather than showing 3 of 3", () => {
        expect(conceptProgress(concept("b", "current", 3, 3))).toBe("ready to demonstrate");
    });

    it("stays quiet when nothing is built for the concept", () => {
        expect(conceptProgress(concept("b", "current", 0, 0))).toBeNull();
    });
});

describe("the one next thing to do after a round", () => {
    it("offers the demonstration only when every stop is cleared", () => {
        const step = nextStepAfterRound({
            slug: "let-vs-const",
            name: "let vs const",
            rungs: { cleared: 4, playable: 4 }
        });

        expect(step.label).toBe("Demonstrate let vs const");
        expect(step.href).toBe("/concept/let-vs-const");
    });

    it("counts what is left when the ladder is unfinished", () => {
        const step = nextStepAfterRound({
            slug: "assignment",
            name: "assignment",
            rungs: { cleared: 2, playable: 3 }
        });

        expect(step.label).toBe("Continue: assignment");
        expect(step.because).toBe("1 stop left before you can demonstrate it");
    });

    it("falls back to the journey rather than inventing a destination", () => {
        expect(nextStepAfterRound(null).href).toBe("/journey");
        expect(
            nextStepAfterRound({ slug: "x", name: "x", rungs: { cleared: 0, playable: 0 } }).href
        ).toBe("/journey");
    });
});


describe("noticing that a world has just opened", () => {
    const values = (state: JourneyTopic["state"], concepts: JourneyConcept[]) =>
        topic("values", state, concepts, null, 1);
    const variables = (state: JourneyTopic["state"], concepts: JourneyConcept[]) =>
        topic("variables", state, concepts, null, 2);

    it("names the world that opened when the previous one is finished", () => {
        const path = [
            values("complete", [concept("a", "demonstrated", 3)]),
            variables("current", [concept("b", "current", 0)])
        ];

        expect(worldJustUnlocked(path, "a")?.slug).toBe("variables");
    });

    it("works from the topic slug too, which is what a checkpoint passes", () => {
        const path = [
            values("complete", [concept("a", "demonstrated", 3)]),
            variables("current", [concept("b", "current", 0)])
        ];

        expect(worldJustUnlocked(path, "values")?.slug).toBe("variables");
    });

    it("says nothing while the world the learner is in is unfinished", () => {
        const path = [
            values("current", [concept("a", "demonstrated", 3), concept("b", "current", 1)]),
            variables("locked", [concept("c", "locked", 0)])
        ];

        expect(worldJustUnlocked(path, "a")).toBeNull();
    });

    it("says nothing when the checkpoint is still outstanding", () => {
        // Every concept done is not the same as the topic being done: for a
        // topic with a checkpoint, the unlock is on the other side of it.
        const path = [
            topic("values", "current", [concept("a", "demonstrated", 3)], { state: "current" }, 1),
            variables("locked", [concept("b", "locked", 0)])
        ];

        expect(worldJustUnlocked(path, "a")).toBeNull();
    });

    it("does not announce a world the learner is already working in", () => {
        // Going back to mop up a straggler concept completes an earlier world,
        // but the one ahead was open long ago. Claiming an unlock there would
        // be the celebration firing for something that already happened.
        //
        // "ALREADY WORKING IN" IS A FINISHED CONCEPT, not a cleared rung. The
        // rung reading was the false negative that hid every real unlock from
        // a learner who also played the games -- see `isNewlyOpen`. A concept
        // can only be demonstrated inside a world that is already open, so it
        // is the sound test, and it is what this asserts now.
        const path = [
            values("complete", [concept("a", "demonstrated", 3)]),
            variables("current", [concept("b", "demonstrated", 3)])
        ];

        expect(worldJustUnlocked(path, "a")).toBeNull();
    });

    it("never points backwards", () => {
        const path = [
            values("current", [concept("a", "current", 0)]),
            variables("complete", [concept("b", "demonstrated", 3)])
        ];

        expect(worldJustUnlocked(path, "b")).toBeNull();
    });
});

describe("what is left in the world the learner is in", () => {
    it("counts demonstrated concepts against the total", () => {
        const standing = currentWorldStanding([
            topic("variables", "current", [
                concept("a", "demonstrated", 3),
                concept("b", "current", 1),
                concept("c", "locked", 0)
            ])
        ]);

        expect(standing?.done).toBe(1);
        expect(standing?.total).toBe(3);
        expect(standing?.remaining.concepts).toBe(2);
    });

    it("reports an outstanding checkpoint separately", () => {
        const standing = currentWorldStanding([
            topic("variables", "current", [concept("a", "demonstrated", 3)], { state: "current" })
        ]);

        expect(standing?.remaining.concepts).toBe(0);
        expect(standing?.remaining.checkpoint).toBe(true);
    });

    it("is null once nothing is current", () => {
        expect(currentWorldStanding([topic("values", "complete", [])])).toBeNull();
    });
});

describe("naming the state of the world the learner is standing in", () => {
    /*
     * The map could say why a world was shut and that a world was charted, and
     * had no word at all for the one the learner could actually walk into once
     * the "newly open" marker had cleared. Open is a state too, and a learner
     * asking "did anything unlock?" is asking about exactly that one.
     */
    it("counts what is left, concepts and checkpoint alike", () => {
        expect(
            openStanding(
                topic(
                    "values",
                    "current",
                    [concept("a", "demonstrated", 3), concept("b", "current", 1)],
                    { state: "locked" }
                )
            )
        ).toBe("1 concept left, then the checkpoint");
    });

    it("drops the checkpoint from the sentence once it is passed", () => {
        expect(
            openStanding(
                topic(
                    "values",
                    "current",
                    [concept("a", "current", 0), concept("b", "locked", 0)],
                    { state: "demonstrated" }
                )
            )
        ).toBe("2 concepts left");
    });

    it("says the same thing the next world says, from the other side", () => {
        // openStanding and unlockRequirement are one fact told twice. If they
        // ever disagree the learner is being given two different answers to
        // the same question on one screen.
        const path = [
            topic("values", "current", [concept("a", "current", 0)], { state: "locked" }, 1),
            topic("variables", "locked", [concept("b", "locked", 0)], null, 2)
        ];

        expect(openStanding(path[0]!)).toBe("1 concept left, then the checkpoint");
        expect(unlockRequirement(path, "variables")).toBe(
            "Opens when you finish 1 concept and the checkpoint in values"
        );
    });
});

describe("the one next thing on the path", () => {
    const path = (topics: JourneyTopic[], current: JourneyPathResponse["current"]): JourneyPathResponse => ({
        topics,
        current,
        points: { total: 0, concepts: 0, challenges: 0 }
    });

    it("is the current concept while one is open", () => {
        const values = topic("values", "current", [concept("a", "demonstrated"), concept("b", "current")], { state: "locked" });

        expect(nextAction(path([values], { ...concept("b", "current"), topic: "values" }))).toEqual({
            kind: "concept",
            name: "b",
            href: "/concept/b"
        });
    });

    it("is the checkpoint once it is due -- the server sends no current concept then", () => {
        const values = topic("values", "current", [concept("a", "demonstrated")], { state: "current" });
        const next = topic("variables", "locked", [concept("c", "locked")], null, 2);

        expect(nextAction(path([values, next], null))).toEqual({
            kind: "checkpoint",
            name: "values checkpoint",
            href: "/challenge/values"
        });
    });

    it("is nothing when the path has nothing left", () => {
        const values = topic("values", "complete", [concept("a", "demonstrated")], { state: "demonstrated" });

        expect(nextAction(path([values], null))).toBeNull();
    });
});

