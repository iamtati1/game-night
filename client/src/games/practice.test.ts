import { describe, expect, it } from "vitest";
import { PRACTICES, practiceFor } from "./practice.js";
import { attempt } from "./missions.js";
import { runLittleJs } from "./littleJs.js";
import { CONCEPT_IDS, CONCEPTS, DEMANDS } from "./curriculum.js";

describe("every practice is traceable to the curriculum", () => {
    it("names a concept the curriculum actually declares", () => {
        for (const p of PRACTICES) {
            expect(CONCEPT_IDS, p.concept).toContain(p.concept);
        }
    });

    it("asks at a rung that concept declares", () => {
        // The composite (concept, demand) key exists so content cannot claim a
        // rung the curriculum never said the concept has. Checked here too,
        // because this content is authored on the client.
        for (const p of PRACTICES) {
            const concept = CONCEPTS.find((c) => c.id === p.concept)!;

            for (const movement of p.movements) {
                expect(DEMANDS, movement.demand).toContain(movement.demand);
                expect(
                    concept.demands,
                    `${p.concept} does not declare ${movement.demand}`
                ).toContain(movement.demand);
            }
        }
    });

    it("fills the rungs that had nothing playable", () => {
        // The gap this exists to close: produce and apply were declared across
        // six Variables concepts and empty at every one.
        const rungs = new Set(PRACTICES.flatMap((p) => p.movements.map((m) => m.demand)));

        expect([...rungs].sort()).toEqual(["apply", "produce"]);
    });

    it("stays small — a practice is not a mission", () => {
        for (const p of PRACTICES) {
            expect(p.movements.length, p.concept).toBeLessThanOrEqual(2);
        }
    });
});

/**
 * PREREQUISITE SAFETY.
 *
 * The hard constraint. A learner practising `declaration` has met one topic.
 * Nothing they are shown, and nothing a correct answer needs, may reach past
 * that -- and the evaluator is the arbiter, because it refuses by name exactly
 * the syntax the curriculum has not taught.
 */
describe("nothing reaches past what the learner has met", () => {
    it("shows no starter code the evaluator would refuse", () => {
        for (const p of PRACTICES) {
            for (const movement of p.movements) {
                const starter = movement.starter.replace(/___/g, "1");

                if (starter.trim() === "") continue;

                const run = runLittleJs(starter);

                expect(run.error, `${p.concept}: ${movement.starter}`).toBeNull();
            }
        }
    });

    it("mentions nothing from later in the curriculum", () => {
        const untaught = [
            ["function", /\bfunction\b|=>/],
            ["array", /\[\s*\]|\.push|\.filter|\.map|\.length/],
            ["object", /\{\s*\w+\s*:/],
            ["comparison", /===|!==|[^=<>!]==[^=]|\s>\s|\s<\s/],
            ["conditional", /\bif\b|\belse\b/],
            ["loop", /\bfor\b|\bwhile\b/],
            ["method call", /\.\w+\(/]
        ] as const;

        for (const p of PRACTICES) {
            for (const movement of p.movements) {
                // console.log is the one call a beginner has met.
                const prose = `${movement.brief} ${movement.starter} ${movement.after}`.replace(
                    /console\.log/g,
                    ""
                );

                for (const [name, pattern] of untaught) {
                    expect(pattern.test(prose), `${p.concept} mentions a ${name}: ${prose}`).toBe(
                        false
                    );
                }
            }
        }
    });

    it("can be solved with only what has been taught", () => {
        // A worked solution for each, written in the beginner subset. If the
        // evaluator accepts these, the practice is genuinely reachable.
        const solutions: Record<string, string> = {
            declaration: "let fuel = 100;",
            initialization: "let crew = 3;\nconsole.log(crew);",
            assignment: "let total = 5;\ntotal = total + 3;\nconsole.log(total);",
            "reading-variables": 'let fuel = 80;\nconsole.log("Fuel: " + fuel);',
            reassignment: "let fuel = 100;\nfuel = 60;\nconsole.log(fuel);",
            "variable-state":
                'let fuel = 80;\nlet crew = 3;\nconsole.log("Fuel: " + fuel);\nconsole.log("Crew: " + crew);'
        };

        for (const p of PRACTICES) {
            const solution = solutions[p.concept];

            expect(solution, `no worked solution for ${p.concept}`).toBeTruthy();

            const { ok, note } = attempt(p.movements[p.movements.length - 1]!, solution!);

            expect(ok, `${p.concept}: ${note}`).toBe(true);
        }
    });
});

describe("the feedback teaches", () => {
    it("names the next thing to try, never just says wrong", () => {
        const misses: Record<string, string> = {
            declaration: "fuel = 100;",
            initialization: "let crew = 3;",
            assignment: "let total = 5;\nconsole.log(total);",
            "reading-variables": 'console.log("Fuel: 80");',
            reassignment: "let fuel = 100;\nconsole.log(fuel);",
            "variable-state": "let fuel = 80;\nconsole.log(fuel);"
        };

        for (const p of PRACTICES) {
            const { ok, note } = attempt(p.movements[p.movements.length - 1]!, misses[p.concept]!);

            expect(ok, `${p.concept} should not accept ${misses[p.concept]}`).toBe(false);
            expect(note, p.concept).toBeTruthy();
            expect(note!.length, p.concept).toBeGreaterThan(20);
            expect(note, p.concept).not.toMatch(/wrong|incorrect|failed|try again/i);
        }
    });

    /* The distinction the whole system turns on, at concept scale. */
    it("rejects a typed-in answer that prints the right thing", () => {
        const reading = practiceFor("reading-variables")!;
        const { ok, run, note } = attempt(reading.movements[0]!, 'console.log("Fuel: 80");');

        expect(run.output).toEqual(["Fuel: 80"]);
        expect(ok).toBe(false);
        expect(note).toContain("Use the name");
    });
});

describe("lookup", () => {
    it("finds a practice by concept and nothing otherwise", () => {
        expect(practiceFor("reassignment")?.concept).toBe("reassignment");
        expect(practiceFor("async-await")).toBeNull();
        expect(practiceFor(null)).toBeNull();
    });
});
