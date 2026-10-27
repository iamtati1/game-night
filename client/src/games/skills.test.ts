import { describe, expect, it } from "vitest";
import type { ConceptPracticeRecord, JourneyConcept, JourneyPathResponse, JourneyTopic } from "../api/types.js";
import { practiceReading, skillStateOf, skillSummary, skillTopics } from "./skills.js";

/**
 * The Skills hub shows only what the server records. These hold the mapping
 * from evidence to state, and that nothing in the summary is invented.
 */

const c = (
    slug: string,
    state: JourneyConcept["state"],
    cleared = 0,
    playable = 3,
    neededRetry = false
): JourneyConcept => ({ slug, name: slug, objective: `do ${slug}`, state, neededRetry, rungs: { cleared, playable } });

const t = (slug: string, state: JourneyTopic["state"], concepts: JourneyConcept[], challenge: JourneyTopic["challenge"] = null): JourneyTopic => ({
    slug,
    name: slug,
    principle: "",
    order: 1,
    state,
    concepts,
    challenge
});

function path(topics: JourneyTopic[]): JourneyPathResponse {
    const current = topics.flatMap((x) => x.concepts.map((k) => ({ ...k, topic: x.slug }))).find((k) => k.state === "current") ?? null;
    return { topics, current, points: { total: 0, concepts: 0, challenges: 0 } };
}

describe("skill states come from evidence", () => {
    it("maps each concept to exactly one state", () => {
        expect(skillStateOf(c("a", "demonstrated", 3, 3))).toBe("demonstrated");
        expect(skillStateOf(c("a", "current", 1, 3))).toBe("practised");
        expect(skillStateOf(c("a", "current", 0, 3))).toBe("learning");
        expect(skillStateOf(c("a", "locked", 0, 3))).toBe("locked");
    });

    it("never calls a skill demonstrated because every stop is cleared", () => {
        // Clearing stops is practice; only /demonstrate makes it a shown skill.
        expect(skillStateOf(c("a", "current", 3, 3))).toBe("practised");
    });

    it("keeps practice from elsewhere visible on a locked skill, but offers no way in", () => {
        const [topic] = skillTopics(path([t("v", "current", [c("a", "current"), c("b", "locked", 1, 3)])]));
        const b = topic!.skills[1]!;
        expect(b.state).toBe("practised");
        expect(b.href).toBeNull();
        expect(b.reason).toBe("Opens when you finish a");
    });

    it("links open skills to their lesson and checkpoints only when open", () => {
        const [topic] = skillTopics(
            path([t("v", "current", [c("a", "demonstrated", 3, 3), c("b", "current")], { state: "locked" })])
        );
        expect(topic!.skills.map((s) => s.href)).toEqual(["/concept/a", "/concept/b"]);
        expect(topic!.checkpoint).toEqual({ state: "locked", href: null });
        expect(topic!.demonstrated).toBe(1);
    });

    it("never reports more stops cleared than exist", () => {
        const [topic] = skillTopics(path([t("v", "current", [c("a", "current", 5, 2)])]));
        expect(topic!.skills[0]!.cleared).toBe(2);
    });
});

describe("the summary", () => {
    const p = path([
        t("values", "complete", [c("a", "demonstrated", 3, 3), c("b", "demonstrated", 2, 2, true), c("c", "demonstrated", 1, 1)]),
        t("vars", "current", [c("d", "current", 1, 3), c("e", "locked")])
    ]);

    it("lists as strengths only skills shown without a retry, most advanced first", () => {
        expect(skillSummary(p).strengths.map((s) => s.slug)).toEqual(["c", "a"]);
    });

    it("puts the skill in progress first, then shown skills that needed a second try", () => {
        const next = skillSummary(p).practiseNext;
        expect(next.map((n) => n.skill.slug)).toEqual(["d", "b"]);
        expect(next[0]!.why).toBe("2 of 3 stops left");
        expect(next[1]!.why).toMatch(/second try/);
    });

    it("counts states without inventing any", () => {
        expect(skillSummary(p).counts).toEqual({ demonstrated: 3, practised: 1, learning: 0, locked: 1 });
    });

    it("has nothing to praise for a brand-new learner", () => {
        const fresh = path([t("values", "current", [c("a", "current"), c("b", "locked")])]);
        const summary = skillSummary(fresh);
        expect(summary.strengths).toEqual([]);
        expect(summary.practiseNext.map((n) => n.skill.slug)).toEqual(["a"]);
    });
});

/* ------------------------------------------------- the practice record -- */


const rec = (slug: string, attempts: number, correct: number, recent = [Math.min(attempts, 5), 0], earlier = [0, 0]): ConceptPracticeRecord => ({
    slug,
    attempts,
    correct,
    recent: { attempts: recent[0]!, correct: recent[1]! },
    earlier: { attempts: earlier[0]!, correct: earlier[1]! },
    lastAt: "2026-10-27T00:00:00.000Z"
});

describe("what the practice record can honestly say", () => {
    it("says nothing about accuracy under five answers, only the counts", () => {
        const p = practiceReading(rec("a", 4, 3, [4, 3]));
        expect(p).toMatchObject({ attempts: 4, correct: 3, accuracy: null, recent: null, needsPractice: false, trend: null });
    });

    it("gives a whole-percent accuracy from five answers", () => {
        expect(practiceReading(rec("a", 8, 6, [5, 4])).accuracy).toBe(75);
    });

    it("flags needs-practice only on a full window of five with two or fewer right", () => {
        expect(practiceReading(rec("a", 5, 2, [5, 2])).needsPractice).toBe(true);
        expect(practiceReading(rec("a", 5, 3, [5, 3])).needsPractice).toBe(false);
        // One wrong answer is not a verdict.
        expect(practiceReading(rec("a", 1, 0, [1, 0])).needsPractice).toBe(false);
    });

    it("shows a trend only with ten answers and a change of two or more", () => {
        expect(practiceReading(rec("a", 10, 5, [5, 4], [5, 1])).trend).toEqual({ direction: "up", recent: 4, earlier: 1 });
        expect(practiceReading(rec("a", 10, 5, [5, 1], [5, 4])).trend).toEqual({ direction: "down", recent: 1, earlier: 4 });
        expect(practiceReading(rec("a", 10, 5, [5, 3], [5, 2])).trend).toBeNull();
        expect(practiceReading(rec("a", 8, 5, [5, 4], [3, 0])).trend).toBeNull();
    });

    it("reads a skill with no answers as not started", () => {
        expect(practiceReading(undefined)).toMatchObject({ attempts: 0, accuracy: null, needsPractice: false });
    });
});

describe("the summary with a practice record", () => {
    const p = path([t("v", "current", [c("a", "demonstrated", 3, 3), c("b", "current", 1, 3), c("z", "locked")])]);

    it("puts an open skill that needs practice first, with the real count", () => {
        const next = skillSummary(p, [rec("a", 7, 3, [5, 1])]).practiseNext;
        expect(next[0]).toMatchObject({ skill: { slug: "a" }, why: "Needs more practice: 1 of your last 5 right" });
        // A demonstrated skill can still need practice: demonstrating is not mastery.
        expect(next.map((n) => n.skill.slug)).toEqual(["a", "b"]);
    });

    it("never suggests a locked skill, whatever its record", () => {
        const next = skillSummary(p, [rec("z", 6, 0, [5, 0])]).practiseNext;
        expect(next.map((n) => n.skill.slug)).not.toContain("z");
    });

    it("totals only real answers, and says nothing without a record", () => {
        expect(skillSummary(p, [rec("a", 7, 3), rec("b", 2, 2)]).answered).toEqual({ attempts: 9, correct: 5, skills: 2 });
        expect(skillSummary(p).answered).toBeNull();
        expect(skillTopics(p)[0]!.skills.every((s) => s.practice === null)).toBe(true);
    });
});

describe("flags only where the learner can act on them", () => {
    const p = path([t("v", "current", [c("a", "demonstrated", 3, 3), c("b", "current", 1, 3), c("z", "locked")])]);

    it("never flags a locked skill or gives it a trend, but keeps its counts", () => {
        const [topic] = skillTopics(p, [rec("z", 10, 1, [5, 0], [5, 3])]);
        const locked = topic!.skills.find((s) => s.slug === "z")!;

        expect(locked.practice).toMatchObject({ attempts: 10, correct: 1, needsPractice: false, trend: null });
    });

    it("never lists one skill as both a strength and something to practise", () => {
        const summary = skillSummary(p, [rec("a", 7, 3, [5, 1])]);

        expect(summary.practiseNext.map((n) => n.skill.slug)).toContain("a");
        expect(summary.strengths.map((s) => s.slug)).not.toContain("a");
    });

    it("keeps a demonstrated skill as a strength when its recent answers are fine", () => {
        expect(skillSummary(p, [rec("a", 7, 6, [5, 5])]).strengths.map((s) => s.slug)).toEqual(["a"]);
    });
});
