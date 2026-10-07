import { describe, expect, it } from "vitest";
import { VARIABLES_MISSION, attempt, missionFor } from "./missions.js";

const [name, use, change, independent] = VARIABLES_MISSION.movements;

describe("the mission is shaped like the capability", () => {
    it("has four movements in the order the concepts require", () => {
        expect(VARIABLES_MISSION.movements.map((m) => m.concept)).toEqual([
            "initialization",
            "reading-variables",
            "reassignment",
            "variable-state"
        ]);
    });

    it("produces evidence at the rungs those concepts declare", () => {
        expect(VARIABLES_MISSION.movements.map((m) => m.demand)).toEqual([
            "produce",
            "apply",
            "apply",
            "produce"
        ]);
    });

    it("names the capability in the learner's own terms", () => {
        expect(VARIABLES_MISSION.capability).toBe(
            "name a value, use the name, and change the value in one place"
        );
    });

    it("is found by the topic it closes", () => {
        expect(missionFor("variables")).toBe(VARIABLES_MISSION);
        expect(missionFor("loops")).toBeNull();
    });
});

describe("1 · give the value a name", () => {
    it("accepts a declaration with the right name", () => {
        expect(attempt(name!, "let fuel = 100;").ok).toBe(true);
    });

    it("accepts const, because naming is what is being asked", () => {
        expect(attempt(name!, "const fuel = 100;").ok).toBe(true);
    });

    it("names the fix when the keyword is missing", () => {
        expect(attempt(name!, "fuel = 100;").note).toContain("let fuel");
    });

    it("says which name the gauge wants", () => {
        expect(attempt(name!, "let petrol = 100;").note).toContain("fuel");
    });
});

describe("2 · use the name — the movement the mission exists for", () => {
    /* Right output. Rejected. This is the decision the whole design turns on. */
    it("REJECTS the correct output when the value is typed into the message", () => {
        const { ok, run, note } = attempt(use!, 'console.log("Fuel: 100");');

        expect(run.output).toEqual(["Fuel: 100"]);
        expect(ok, "correct output is not enough").toBe(false);
        expect(note).toContain("right output");
        expect(note).toContain("Use the name `fuel`");
    });

    it("accepts the same output when the name produced it", () => {
        expect(attempt(use!, 'let fuel = 100;\nconsole.log("Fuel: " + fuel);').ok).toBe(true);
    });

    it("says what the board actually reads when it is wrong", () => {
        const { note } = attempt(use!, 'let fuel = 100;\nconsole.log("Fuel " + fuel);');

        expect(note).toContain("Fuel 100");
        expect(note).toContain("Fuel: 100");
    });
});

describe("3 · change the value", () => {
    it("accepts editing the declaration", () => {
        expect(attempt(change!, 'let fuel = 50;\nconsole.log("Fuel: " + fuel);').ok).toBe(true);
    });

    /* A learner who reassigns has understood MORE, not less. */
    it("accepts a reassignment on a new line", () => {
        const source = 'let fuel = 100;\nfuel = 50;\nconsole.log("Fuel: " + fuel);';

        expect(attempt(change!, source).ok).toBe(true);
    });

    it("catches editing the message instead of the value", () => {
        const { ok, note } = attempt(change!, 'let fuel = 100;\nconsole.log("Fuel: 50");');

        expect(ok).toBe(false);
        expect(note).toContain("change what `fuel` holds");
    });

    it("explains a const that refuses to move", () => {
        const source = 'const fuel = 100;\nfuel = 50;\nconsole.log("Fuel: " + fuel);';

        expect(attempt(change!, source).note).toContain("const");
    });
});

describe("4 · use it independently", () => {
    const solved =
        'let fuel = 50;\nlet crew = 3;\nconsole.log("Fuel: " + fuel);\nconsole.log("Crew: " + crew);';

    it("accepts two names driving two readings", () => {
        expect(attempt(independent!, solved).ok).toBe(true);
    });

    it("asks for a second name when only one exists", () => {
        const source = 'let fuel = 50;\nconsole.log("Fuel: " + fuel);\nconsole.log("Crew: 3");';

        expect(attempt(independent!, source).note).toContain("name of its own");
    });

    it("catches one reading with its number typed in", () => {
        const source =
            'let fuel = 50;\nlet crew = 3;\nconsole.log("Fuel: " + fuel);\nconsole.log("Crew: 3");';
        const { ok, note } = attempt(independent!, source);

        expect(ok).toBe(false);
        expect(note).toContain("typed in");
    });

    it("names which line is wrong", () => {
        const source =
            'let fuel = 10;\nlet crew = 3;\nconsole.log("Fuel: " + fuel);\nconsole.log("Crew: " + crew);';

        expect(attempt(independent!, source).note).toContain("Fuel: 10");
    });
});

describe("failure always gives one next thing to try", () => {
    it("never returns an empty or shouting note", () => {
        const misses = [
            [name!, "fuel = 100;"],
            [use!, 'console.log("Fuel: 100");'],
            [change!, 'let fuel = 100;\nconsole.log("Fuel: 50");'],
            [independent!, "let fuel = 50;"]
        ] as const;

        for (const [movement, source] of misses) {
            const { note } = attempt(movement, source);

            expect(note, source).toBeTruthy();
            expect(note!.length, source).toBeGreaterThan(20);
            expect(note, source).not.toMatch(/wrong|incorrect|failed|error!/i);
        }
    });

    it("turns untaught syntax into a sentence rather than a crash", () => {
        // Was `if`, then `for`, then `function`, then `class` -- each left this
        // test as the curriculum reached it, and `class` left when
        // this-and-classes was built. What is still genuinely ahead of the
        // learner is a constructor the allowlist does not name.
        const { note } = attempt(independent!, "let a = new Thing();");

        expect(note).toContain("not something we have covered yet");
        expect(note).not.toMatch(/SyntaxError|TypeError/);
    });
});

/**
 * The approved design, checked movement by movement against the exact code and
 * the exact wording it specifies.
 */
describe("the approved design, verbatim", () => {
    const specs: ReadonlyArray<{
        movement: (typeof VARIABLES_MISSION.movements)[number];
        concept: string;
        demand: string;
        accepts: readonly string[];
        rejects: readonly string[];
    }> = [
        {
            movement: name!,
            concept: "initialization",
            demand: "produce",
            accepts: ["let fuel = 100;"],
            rejects: ["fuel = 100;"]
        },
        {
            movement: use!,
            concept: "reading-variables",
            demand: "apply",
            // Both natural forms of "use the name". The design names the
            // template-literal one specifically.
            accepts: [
                'let fuel = 100;\nconsole.log("Fuel: " + fuel);',
                "let fuel = 100;\nconsole.log(`Fuel: ${fuel}`);"
            ],
            rejects: ['console.log("Fuel: 100");', "console.log(`Fuel: 100`);"]
        },
        {
            movement: change!,
            concept: "reassignment",
            demand: "apply",
            accepts: [
                'let fuel = 50;\nconsole.log("Fuel: " + fuel);',
                'let fuel = 100;\nfuel = 50;\nconsole.log("Fuel: " + fuel);',
                "let fuel = 100;\nfuel = 50;\nconsole.log(`Fuel: ${fuel}`);"
            ],
            rejects: ['let fuel = 100;\nconsole.log("Fuel: 50");']
        },
        {
            movement: independent!,
            concept: "variable-state",
            demand: "produce",
            accepts: [
                'let fuel = 50;\nlet crew = 3;\nconsole.log("Fuel: " + fuel);\nconsole.log("Crew: " + crew);',
                "let fuel = 50;\nlet crew = 3;\nconsole.log(`Fuel: ${fuel}`);\nconsole.log(`Crew: ${crew}`);"
            ],
            rejects: ['console.log("Fuel: 50");\nconsole.log("Crew: 3");']
        }
    ];

    for (const spec of specs) {
        describe(`${spec.concept} / ${spec.demand}`, () => {
            it("is the concept and rung the design names", () => {
                expect(spec.movement.concept).toBe(spec.concept);
                expect(spec.movement.demand).toBe(spec.demand);
            });

            for (const source of spec.accepts) {
                it(`accepts ${source.split("\n").pop()}`, () => {
                    const { ok, note } = attempt(spec.movement, source);

                    expect(ok, note ?? "").toBe(true);
                });
            }

            for (const source of spec.rejects) {
                it(`rejects ${source.split("\n").pop()}`, () => {
                    expect(attempt(spec.movement, source).ok).toBe(false);
                });
            }
        });
    }

    it("rejects hard-coded output in BOTH string forms", () => {
        // The central decision, and it must not have a syntactic loophole.
        for (const source of ['console.log("Fuel: 100");', "console.log(`Fuel: 100`);"]) {
            const { ok, run, note } = attempt(use!, source);

            expect(run.output, source).toEqual(["Fuel: 100"]);
            expect(ok, `${source} printed the right thing and must still be rejected`).toBe(false);
            expect(note, source).toContain("fuel");
        }
    });
});
