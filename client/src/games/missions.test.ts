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
        const { note } = attempt(independent!, "if (fuel > 0) { console.log(1); }");

        expect(note).toContain("`if`");
        expect(note).not.toMatch(/SyntaxError|TypeError/);
    });
});
