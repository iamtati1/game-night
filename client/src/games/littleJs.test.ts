import { describe, expect, it } from "vitest";
import { runLittleJs } from "./littleJs.js";

/**
 * The evaluator exists to answer one question the output cannot: was the idea
 * used, or was the answer typed in? Most of what is asserted here is therefore
 * about STRUCTURE, not about printing.
 */
describe("running the code a learner has been taught", () => {
    it("prints a string without its quotes", () => {
        expect(runLittleJs('console.log("Hello");').output).toEqual(["Hello"]);
    });

    it("prints a number bare", () => {
        expect(runLittleJs("console.log(5);").output).toEqual(["5"]);
    });

    it("works out an expression before printing it", () => {
        expect(runLittleJs("console.log(5 + 5);").output).toEqual(["10"]);
        expect(runLittleJs("console.log(2 * 3);").output).toEqual(["6"]);
        expect(runLittleJs("console.log(10 - 4);").output).toEqual(["6"]);
    });

    it("multiplies before it adds", () => {
        expect(runLittleJs("console.log(2 + 3 * 4);").output).toEqual(["14"]);
    });

    it("joins text to a number the way JavaScript does", () => {
        expect(runLittleJs('console.log("Fuel: " + 100);').output).toEqual(["Fuel: 100"]);
    });

    it("reads a variable's current value", () => {
        expect(runLittleJs("let fuel = 100;\nconsole.log(fuel);").output).toEqual(["100"]);
    });

    it("follows a reassignment", () => {
        const r = runLittleJs("let fuel = 100;\nfuel = 50;\nconsole.log(fuel);");

        expect(r.output).toEqual(["50"]);
        expect(r.reassigned).toEqual(["fuel"]);
    });

    it("prints several arguments separated by a space", () => {
        expect(runLittleJs('console.log("a", 1);').output).toEqual(["a 1"]);
    });

    it("tolerates a missing semicolon and a comment", () => {
        expect(runLittleJs("let a = 1 // a note\nconsole.log(a)").output).toEqual(["1"]);
    });
});

describe("what the program was made of", () => {
    /* The distinction the whole mission turns on. */
    it("reports no name used when the value is typed into the message", () => {
        const r = runLittleJs('console.log("Fuel: 100");');

        expect(r.output).toEqual(["Fuel: 100"]);
        expect(r.namesUsedInOutput).toEqual([[]]);
    });

    it("reports the name when the name is used", () => {
        const r = runLittleJs('let fuel = 100;\nconsole.log("Fuel: " + fuel);');

        expect(r.output).toEqual(["Fuel: 100"]);
        expect(r.namesUsedInOutput).toEqual([["fuel"]]);
        expect(r.declared).toEqual(["fuel"]);
    });

    it("reports every name used across several calls", () => {
        const r = runLittleJs(
            'let fuel = 50;\nlet crew = 3;\nconsole.log("Fuel: " + fuel);\nconsole.log("Crew: " + crew);'
        );

        expect(r.declared).toEqual(["fuel", "crew"]);
        expect(r.namesUsedInOutput).toEqual([["fuel"], ["crew"]]);
    });
});

describe("mistakes a beginner actually makes", () => {
    it("names an undeclared variable and says how to declare it", () => {
        const r = runLittleJs("console.log(fuel);");

        expect(r.error).toContain("fuel");
        expect(r.error).toContain("let fuel");
    });

    it("refuses to reassign a const and names the fix", () => {
        const r = runLittleJs("const fuel = 100;\nfuel = 50;");

        expect(r.error).toContain("const");
        expect(r.error).toContain("let");
    });

    it("catches == used where = was meant", () => {
        expect(runLittleJs("let a = 1;\na == 2;").error).toContain("single `=`");
    });

    it("catches an unclosed string", () => {
        expect(runLittleJs('console.log("Fuel);').error).toContain("closing");
    });

    it("refuses a redeclaration", () => {
        expect(runLittleJs("let a = 1;\nlet a = 2;").error).toContain("already been declared");
    });

    /* Partial output survives the error: what ran, ran. */
    it("keeps what printed before the error", () => {
        const r = runLittleJs('console.log("one");\nconsole.log(missing);');

        expect(r.output).toEqual(["one"]);
        expect(r.error).not.toBeNull();
    });
});

describe("syntax the learner has not been taught is refused by name", () => {
    const untaught: ReadonlyArray<[string, string]> = [
        ["if (1) {}", "`if`"],
        ["for (;;) {}", "`for`"],
        ["function f() {}", "Functions"],
        ["let a = true;", "`true`"],
        ["let a = null;", "`null`"],
        ["var a = 1;", "`let` or `const`"],
        ['let a = "x"; console.log(a.length);', "not something we have covered yet"],
        ["let a = x.y;", "not something we have covered yet"]
    ];

    for (const [source, expected] of untaught) {
        it(`refuses ${source.trim().slice(0, 28)}`, () => {
            const r = runLittleJs(source);

            expect(r.error, source).not.toBeNull();
            expect(r.error, source).toContain(expected);
        });
    }

    /* No stack traces, ever. Every message is a sentence. */
    it("never reports a raw JavaScript error", () => {
        for (const [source] of untaught) {
            expect(runLittleJs(source).error).not.toMatch(/undefined is not|TypeError|SyntaxError/);
        }
    });
});

describe("it cannot be used to run arbitrary code", () => {
    it("has no way to reach a host object", () => {
        for (const source of [
            "window",
            "globalThis",
            "let a = fetch;",
            "document.write(1);",
            "console.log(constructor);"
        ]) {
            expect(runLittleJs(source).error, source).not.toBeNull();
        }
    });

    it("stops a program that does too much", () => {
        const long = `let a = 1;\nconsole.log(${"1 + ".repeat(6000)}1);`;

        expect(runLittleJs(long).error).toContain("too much");
    });
});


/**
 * Template literals, accepted as a deliberate exception.
 *
 * The approved mission design names `Fuel: ${fuel}` as a correct answer for
 * "use the name", and it is: the interpolation reads the variable exactly as a
 * join does. Refusing a learner's working answer because the curriculum has not
 * formally reached backticks yet would teach nothing and read as a broken tool.
 */
describe("template literals", () => {
    it("reads a variable through an interpolation", () => {
        const r = runLittleJs("let fuel = 100;\nconsole.log(`Fuel: ${fuel}`);");

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["Fuel: 100"]);
    });

    it("records the interpolated name as used, exactly as a join does", () => {
        const template = runLittleJs("let fuel = 100;\nconsole.log(`Fuel: ${fuel}`);");
        const joined = runLittleJs('let fuel = 100;\nconsole.log("Fuel: " + fuel);');

        expect(template.namesUsedInOutput).toEqual([["fuel"]]);
        expect(template.namesUsedInOutput).toEqual(joined.namesUsedInOutput);
        expect(template.output).toEqual(joined.output);
    });

    it("still reports a hard-coded value as using no name", () => {
        // The distinction the mission turns on survives the new syntax.
        const r = runLittleJs("console.log(`Fuel: 100`);");

        expect(r.output).toEqual(["Fuel: 100"]);
        expect(r.namesUsedInOutput).toEqual([[]]);
    });

    it("handles an expression inside the braces", () => {
        expect(runLittleJs("let a = 2;\nconsole.log(`${a + 3}`);").output).toEqual(["5"]);
    });

    it("catches an unclosed backtick", () => {
        expect(runLittleJs("console.log(`Fuel);").error).toContain("closing backtick");
    });

    it("catches an unclosed interpolation", () => {
        expect(runLittleJs("let a = 1;\nconsole.log(`${a`);").error).toBeTruthy();
    });
});
