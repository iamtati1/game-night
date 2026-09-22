import { describe, expect, it } from "vitest";
// Vite serves the raw text of a module with ?raw, which is what lets this file
// assert on the curriculum SOURCE rather than only on its exported values.
import CURRICULUM_SOURCE from "./curriculum.ts?raw";
import {
    CONCEPTS,
    CONCEPT_IDS,
    DEMANDS,
    DEMAND_SPECS,
    TOPICS,
    TOPIC_IDS,
    conceptById,
    conceptsInTopic,
    difficultyFor,
    difficultyOf,
    maxDifficultyOf,
    tierOf,
    topicOrder,
    type Concept,
    type ConceptId,
    type TopicId
} from "./curriculum.js";

/**
 * The curriculum, checked against the rules it was approved under.
 *
 * This file is the source of truth for what Jolt teaches, and in Phase 4 it will
 * be projected into PostgreSQL tables that challenges hold foreign keys into. A
 * malformed entry here becomes a malformed row there, so every structural
 * promise the architecture makes is asserted rather than assumed.
 *
 * The rules are not arbitrary. Each one exists because breaking it would produce
 * a specific failure downstream -- a cycle that makes teaching order
 * uncomputable, a concept with no demands that can never be practised, a demand
 * set that lets a beginner skill generate an expert-level challenge.
 */

describe("the curriculum is well formed", () => {
    it("declares every topic exactly once", () => {
        expect(new Set(TOPIC_IDS).size).toBe(TOPIC_IDS.length);
        expect(TOPICS.map((t) => t.id).sort()).toEqual([...TOPIC_IDS].sort());
    });

    it("declares every concept exactly once", () => {
        expect(new Set(CONCEPT_IDS).size).toBe(CONCEPT_IDS.length);
        expect(CONCEPTS.map((c) => c.id).sort()).toEqual([...CONCEPT_IDS].sort());
    });

    it("files every concept under a topic that exists", () => {
        for (const c of CONCEPTS) {
            expect(TOPIC_IDS, `${c.id}`).toContain(c.topic);
        }
    });

    it("gives every topic at least one concept", () => {
        // A topic with nothing under it is a Skill Map row that can never fill.
        for (const t of TOPICS) {
            expect(conceptsInTopic(t.id).length, `${t.id} has no concepts`).toBeGreaterThan(0);
        }
    });

    it("keeps topics to a reviewable size", () => {
        // The granularity decision: meaningful skills, not syntax fragments. A
        // topic sprouting fifteen concepts is a sign the rule slipped.
        for (const t of TOPICS) {
            const n = conceptsInTopic(t.id).length;

            expect(n, `${t.id} has ${n} concepts`).toBeGreaterThanOrEqual(2);
            expect(n, `${t.id} has ${n} concepts`).toBeLessThanOrEqual(9);
        }
    });
});

describe("every concept is a teachable skill", () => {
    it("completes the sentence 'I know how to ___'", () => {
        // The approved granularity test. An objective that starts with a capital
        // or ends in a full stop is a sentence rather than a completion, which
        // usually means it is describing a topic instead of a capability.
        for (const c of CONCEPTS) {
            expect(c.objective.length, `${c.id}`).toBeGreaterThan(10);
            expect(c.objective[0], `${c.id}: objective should read as a completion`).toBe(
                c.objective[0]!.toLowerCase()
            );
            expect(c.objective.endsWith("."), `${c.id}: objective should not end in a full stop`).toBe(
                false
            );
        }
    });

    it("gives every concept a one-line meaning", () => {
        // Serves twice: the Learn Beat rule line, and the right-hand face of a
        // Memory pair. Authored once here so the two can never drift.
        for (const c of CONCEPTS) {
            expect(c.meaning.length, `${c.id}`).toBeGreaterThan(15);
            expect(c.meaning.length, `${c.id}: too long to sit under a worked example`).toBeLessThanOrEqual(110);
            expect(c.meaning.includes("\n"), `${c.id}: meaning must be one line`).toBe(false);
        }
    });

    it("says why every concept is in the syllabus", () => {
        for (const c of CONCEPTS) {
            expect(c.why.length, `${c.id} has no rationale`).toBeGreaterThan(40);
        }
    });

    it("never repeats an objective or a meaning", () => {
        // Two concepts claiming the same capability means one of them is not a
        // separate skill.
        expect(new Set(CONCEPTS.map((c) => c.objective)).size).toBe(CONCEPTS.length);
        expect(new Set(CONCEPTS.map((c) => c.meaning)).size).toBe(CONCEPTS.length);
    });
});

describe("prerequisites form a usable graph", () => {
    it("names only concepts that exist", () => {
        for (const c of CONCEPTS) {
            for (const p of c.prerequisites) {
                expect(conceptById(p), `${c.id} requires unknown concept ${p}`).not.toBeNull();
            }
        }
    });

    it("never makes a concept its own prerequisite", () => {
        for (const c of CONCEPTS) {
            expect(c.prerequisites, `${c.id}`).not.toContain(c.id);
        }
    });

    it("has no cycles, so a teaching order can always be computed", () => {
        // The check that matters most. A cycle makes "what should this learner
        // see next" unanswerable, and it cannot be spotted by reading.
        const done = new Set<ConceptId>();
        let remaining = [...CONCEPTS];

        while (remaining.length > 0) {
            const ready = remaining.filter((c) => c.prerequisites.every((p) => done.has(p)));

            expect(
                ready.length,
                `cycle or missing prerequisite among: ${remaining.map((c) => c.id).join(", ")}`
            ).toBeGreaterThan(0);

            for (const c of ready) done.add(c.id);
            remaining = remaining.filter((c) => !done.has(c.id));
        }

        expect(done.size).toBe(CONCEPTS.length);
    });

    it("never requires a concept from a later topic", () => {
        // A prerequisite may cross topics -- array-map needs arrow-functions --
        // but it must point backwards in teaching order, or the graph says one
        // thing and the syllabus says another.
        const order = topicOrder().map((t) => t.id);
        const positionOf = (id: TopicId) => order.indexOf(id);

        for (const c of CONCEPTS) {
            for (const p of c.prerequisites) {
                const required = conceptById(p)!;

                expect(
                    positionOf(required.topic),
                    `${c.id} (${c.topic}) requires ${p} from the later topic ${required.topic}`
                ).toBeLessThanOrEqual(positionOf(c.topic));
            }
        }
    });

    it("computes a topic order without a cycle", () => {
        expect(topicOrder().length).toBe(TOPICS.length);
        expect(topicOrder()[0]!.prerequisites).toHaveLength(0);
    });
});

describe("cognitive demands are the only progression axis", () => {
    it("has exactly seven, in order of what they ask", () => {
        expect(DEMANDS).toEqual([
            "recall",
            "recognise",
            "predict",
            "produce",
            "diagnose",
            "repair",
            "explain"
        ]);
    });

    it("describes each one independently of subject matter", () => {
        for (const d of DEMANDS) {
            expect(DEMAND_SPECS[d].demand).toBe(d);
            expect(DEMAND_SPECS[d].asks.length).toBeGreaterThan(20);
        }
    });

    it("gives every concept at least one demand", () => {
        // A concept with none can never be practised, which makes it a topic
        // heading rather than a skill.
        for (const c of CONCEPTS) {
            expect(c.demands.length, `${c.id} declares no demands`).toBeGreaterThan(0);
        }
    });

    it("never declares a demand twice for one concept", () => {
        for (const c of CONCEPTS) {
            expect(new Set(c.demands).size, `${c.id}`).toBe(c.demands.length);
        }
    });

    it("names only demands that exist", () => {
        for (const c of CONCEPTS) {
            for (const d of c.demands) {
                expect(DEMANDS, `${c.id}`).toContain(d);
            }
        }
    });

    it("does not require every concept to use every demand", () => {
        // The approved rule, asserted rather than trusted. If every concept
        // declared all seven, the declaration would be carrying no information
        // and the difficulty cap below would do nothing.
        const usingAll = CONCEPTS.filter((c) => c.demands.length === DEMANDS.length);

        expect(
            usingAll.map((c) => c.id).join(", "),
            "no concept should need all seven demands"
        ).toBe("");
    });

    it("keeps repair paired with diagnose", () => {
        // Producing a correction without being able to locate the fault is not a
        // coherent progression -- you cannot fix what you cannot find.
        for (const c of CONCEPTS) {
            if (c.demands.includes("repair")) {
                expect(c.demands, `${c.id} repairs without diagnosing`).toContain("diagnose");
            }
        }
    });
});

describe("difficulty is derived and capped", () => {
    it("is a pure function of tier and demand", () => {
        expect(difficultyFor("beginner", "recall")).toBe(1);
        expect(difficultyFor("beginner", "produce")).toBe(2);
        expect(difficultyFor("intermediate", "predict")).toBe(2);
        expect(difficultyFor("intermediate", "repair")).toBe(3);
        expect(difficultyFor("advanced", "recognise")).toBe(3);
        expect(difficultyFor("advanced", "explain")).toBe(4);
    });

    it("never leaves the 1-4 range the dealer expects", () => {
        for (const tier of ["beginner", "intermediate", "advanced"] as const) {
            for (const d of DEMANDS) {
                const value = difficultyFor(tier, d);

                expect(value).toBeGreaterThanOrEqual(1);
                expect(value).toBeLessThanOrEqual(4);
            }
        }
    });

    it("refuses to score a demand the concept does not declare", () => {
        // The guard that stops an undeclared combination becoming a challenge.
        const map = conceptById("map")!;

        expect(map.demands).not.toContain("explain");
        expect(() => difficultyOf(map, "explain")).toThrow(/does not declare/);
    });

    it("caps a beginner concept below the hardest tier", () => {
        // The structural fix for a bank that drifted advanced-heavy: a beginner
        // skill cannot produce a tier-4 challenge, whatever anyone writes.
        for (const c of CONCEPTS) {
            if (tierOf(c) === "beginner") {
                expect(maxDifficultyOf(c), `${c.id} reaches tier ${maxDifficultyOf(c)}`).toBeLessThanOrEqual(2);
            }
        }
    });

    it("reaches tier 4 only through advanced concepts", () => {
        const atFour = CONCEPTS.filter((c) => maxDifficultyOf(c) === 4);

        expect(atFour.length, "nothing reaches the hardest tier").toBeGreaterThan(0);

        for (const c of atFour) {
            expect(tierOf(c), `${c.id} is ${tierOf(c)} but reaches tier 4`).toBe("advanced");
        }
    });

    it("spreads across all four difficulties", () => {
        const reachable = new Set<number>();

        for (const c of CONCEPTS) {
            for (const d of c.demands) reachable.add(difficultyOf(c, d));
        }

        expect([...reachable].sort()).toEqual([1, 2, 3, 4]);
    });
});

describe("the curriculum knows nothing about games", () => {
    // Principle 1, asserted at the source rather than trusted. An earlier draft
    // exported GAME_SLUGS and listed which games hosted each challenge type,
    // which is exactly the coupling this architecture exists to remove.
    it("read its own source, so the checks below are not vacuous", () => {
        expect(CURRICULUM_SOURCE.length).toBeGreaterThan(10_000);
        expect(CURRICULUM_SOURCE).toContain("export const CONCEPTS");
    });

    it("mentions no game by name", () => {
        for (const game of ["code-blitz", "bug-hunt", "reaction", "memory", "flush"]) {
            expect(
                CURRICULUM_SOURCE.includes(`"${game}"`),
                `curriculum names the game ${game}`
            ).toBe(false);
        }
    });

    it("exports no game or challenge-type vocabulary", async () => {
        const mod = (await import("./curriculum.js")) as Record<string, unknown>;

        for (const banned of ["GAME_SLUGS", "CHALLENGE_TYPES", "CHALLENGE_TYPE_IDS", "STAGE_KINDS"]) {
            expect(mod[banned], `${banned} should no longer exist`).toBeUndefined();
        }
    });

    it("carries no authored difficulty on any concept", () => {
        for (const c of CONCEPTS as readonly (Concept & { difficulty?: unknown })[]) {
            expect(c.difficulty, `${c.id} authors a difficulty`).toBeUndefined();
        }
    });
});

describe("the curriculum is reviewable by a person", () => {
    it("gives every topic a tier and a rationale", () => {
        for (const t of TOPICS) {
            expect(["beginner", "intermediate", "advanced"], `${t.id}`).toContain(t.tier);
            expect(t.rationale.length, `${t.id} has no rationale`).toBeGreaterThan(40);
        }
    });

    it("orders tiers sensibly across the syllabus", () => {
        // Not a hard rule -- errors is intermediate but sits late -- so this only
        // asserts that the first topic is a beginner one and the last is not.
        const order = topicOrder();

        expect(order[0]!.tier).toBe("beginner");
        expect(order[order.length - 1]!.tier).toBe("advanced");
    });

    it("reports a syllabus a designer can read", () => {
        // Not an assertion so much as the generated view Phase 2 signs off. It
        // fails only if the shape is unprintable.
        const lines: string[] = [];

        for (const t of topicOrder()) {
            lines.push(`${t.label}  [${t.tier}]`);

            for (const c of conceptsInTopic(t.id)) {
                lines.push(`    ${c.label} -- I know how to ${c.objective}`);
                lines.push(`        ${c.demands.join(" > ")}  (max difficulty ${maxDifficultyOf(c)})`);
            }
        }

        expect(lines.length).toBeGreaterThan(TOPICS.length + CONCEPTS.length);
    });
});

describe("the shape the database will hold", () => {
    it("keeps every concept id URL and slug safe", () => {
        for (const c of CONCEPTS) {
            expect(c.id, `${c.id}`).toMatch(/^[a-z][a-z0-9-]*$/);
        }
    });

    it("keeps every topic id slug safe", () => {
        for (const t of TOPICS) {
            expect(t.id, `${t.id}`).toMatch(/^[a-z][a-z0-9-]*$/);
        }
    });

    it("produces one concept_demands row per declared demand", () => {
        // What Phase 4 will project. Counting it here means the seed's row count
        // is predictable before the migration is written.
        const rows = CONCEPTS.flatMap((c) => c.demands.map((d) => ({ concept: c.id, demand: d })));

        expect(rows.length).toBeGreaterThan(CONCEPTS.length);
        expect(new Set(rows.map((r) => `${r.concept}:${r.demand}`)).size).toBe(rows.length);
    });

    it("has a load-bearing concept in most topics", () => {
        // Weight drives how much practice a concept earns. A syllabus where
        // nothing is load-bearing has lost the signal.
        const heavy = CONCEPTS.filter((c) => c.weight === "load-bearing");

        expect(heavy.length).toBeGreaterThanOrEqual(TOPICS.length / 2);
    });
});

describe("the syllabus is the size it was designed to be", () => {
    it("holds sixteen topics", () => {
        expect(TOPICS.length).toBe(16);
    });

    it("holds a Skill Map that fits on a screen", () => {
        // The agreed ceiling. Past this the Skill Map stops being scannable and
        // starts being a database listing.
        expect(CONCEPTS.length).toBeGreaterThanOrEqual(60);
        expect(CONCEPTS.length).toBeLessThanOrEqual(100);
    });
});
