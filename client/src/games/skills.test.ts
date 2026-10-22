import { describe, expect, it } from "vitest";
import type { JourneyConcept, JourneyPathResponse, JourneyTopic } from "../api/types.js";
import { skillStateOf, skillSummary, skillTopics } from "./skills.js";

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
