import { describe, expect, it } from "vitest";
import { PRACTICES, practiceFor } from "./practice.js";
import { attempt } from "./missions.js";
import { runLittleJs } from "./littleJs.js";
import { CONCEPT_IDS, CONCEPTS, DEMANDS, TOPICS } from "./curriculum.js";

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
        /*
         * RELATIVE TO EACH PRACTICE, not absolute.
         *
         * This list was written when every practice was a Variables concept, so
         * "later" and "anything conditional" were the same thing. Practices now
         * reach into Operators and Control Flow, where comparisons and `if` are
         * the concept being taught -- so each construct is checked against the
         * position of the concept that OWNS it, exactly as the curriculum
         * questions are.
         */
        const untaught = [
            ["function", /\bfunction\b|=>/, "function-declaration"],
            ["array", /\[\s*\]|\.push|\.filter|\.map|\.length/, "array-indexing"],
            ["object", /\{\s*\w+\s*:/, "object-access"],
            ["comparison", /===|!==|[^=<>!]==[^=]|\s>\s|\s<\s/, "comparison-operators"],
            ["conditional", /\bif\b|\belse\b/, "if-else"],
            ["loop", /\bfor\b|\bwhile\b/, "for-loop-anatomy"],
            ["method call", /\.\w+\(/, "string-methods"]
        ] as const;

        const position = (slug: string): number => {
            const concept = CONCEPTS.find((c) => c.id === slug);

            if (!concept) return Number.MAX_SAFE_INTEGER;

            const topic = TOPICS.findIndex((t) => t.id === concept.topic);
            const within = CONCEPTS.filter((c) => c.topic === concept.topic).findIndex(
                (c) => c.id === slug
            );

            return (topic + 1) * 100 + within + 1;
        };

        for (const p of PRACTICES) {
            const here = position(p.concept);

            for (const movement of p.movements) {
                // console.log is the one call a beginner has met.
                const prose = `${movement.brief} ${movement.starter} ${movement.after}`.replace(
                    /console\.log/g,
                    ""
                );

                for (const [name, pattern, owner] of untaught) {
                    if (position(owner) <= here) continue;

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
                'let fuel = 80;\nlet crew = 3;\nconsole.log("Fuel: " + fuel);\nconsole.log("Crew: " + crew);',
            // The compound form is the concept. `fuel = 80` prints the same
            // and is rejected -- see the miss below.
            "assignment-operators": "let fuel = 100;\nfuel -= 20;\nconsole.log(fuel);",
            "compound-conditions":
                'let fuel = 80;\nlet crew = 4;\nif (fuel > 50 && crew > 2) {\n  console.log("Cleared");\n}',
            ternary: 'let fuel = 20;\nlet status = fuel > 50 ? "Plenty" : "Low";\nconsole.log(status);',
            "string-concatenation": 'let bays = 4;\nconsole.log("Bays: " + bays);',
            "string-methods": 'let name = "  tati  ";\nconsole.log(name.trim().toUpperCase());',
            "template-literals":
                'let name = "Tati";\nlet bays = 4;\nconsole.log(`${name} has ${bays} bays`);',
            "loop-conditions":
                'let word = "Jolt";\nfor (let i = 0; i < word.length; i += 1) {\n  console.log(word[i]);\n}',
            accumulators:
                "let total = 0;\nfor (let i = 1; i < 5; i += 1) {\n  total += i;\n}\nconsole.log(total);",
            "nested-loops":
                'for (let a = 0; a < 2; a += 1) {\n  for (let b = 0; b < 2; b += 1) {\n    console.log(a + "-" + b);\n  }\n}',
            "function-declaration":
                'function greet() {\n  console.log("Hello");\n}\ngreet();',
            "guard-clauses":
                'function describe(n) {\n  if (n < 0) {\n    return "negative";\n  }\n  return "ok";\n}\nconsole.log(describe(-4));',
            "arrow-functions": "const double = (n) => n * 2;\nconsole.log(double(4));",
            closures:
                'function makeGreeter(name) {\n  return () => {\n    console.log("Hello, " + name);\n  };\n}\nconst greet = makeGreeter("Tati");\ngreet();',
            "array-copy-spread":
                "let scores = [90, 80];\nlet copy = [...scores];\ncopy.push(100);\nconsole.log(scores.length);",
            "default-rest-params":
                "function total(...nums) {\n  let t = 0;\n  for (let i = 0; i < nums.length; i = i + 1) {\n    t = t + nums[i];\n  }\n  return t;\n}\nconsole.log(total(1, 2, 3));",
            map: "let a = [1, 2, 3];\nconsole.log(a.map((n) => n * 10));",
            filter: "let a = [5, 15, 25];\nconsole.log(a.filter((n) => n > 10));",
            reduce: "let a = [1, 2, 3, 4];\nconsole.log(a.reduce((t, n) => t + n, 0));",
            "method-chaining":
                "let a = [1, 2, 3, 4];\nconsole.log(a.filter((n) => n > 2).map((n) => n * 100));",
            destructuring:
                'let p = { name: "Tati", age: 3 };\nconst { name, age } = p;\nconsole.log(name);\nconsole.log(age);',
            "json-shape":
                'let p = { name: "Tati", age: 3 };\nlet text = JSON.stringify(p);\nlet back = JSON.parse(text);\nconsole.log(back.name);',
            "event-loop":
                'console.log("one");\nsetTimeout(() => { console.log("three"); }, 0);\nconsole.log("two");',
            "async-await":
                'async function go() {\n  const v = await Promise.resolve(10);\n  console.log(v);\n}\ngo();',
            "promise-all":
                'Promise.all([Promise.resolve(1), Promise.resolve(2), Promise.resolve(3)]).then((vs) => { console.log(vs.length); });',
            recursion:
                'function total(n) {\n  if (n === 0) {\n    return 0;\n  }\n  return n + total(n - 1);\n}\nconsole.log(total(5));',
            classes:
                'class Dog {\n  constructor(name) { this.name = name; }\n  speak() { console.log(this.name + " says woof"); }\n}\nconst a = new Dog("Rex");\nconst b = new Dog("Bo");\na.speak();\nb.speak();'
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
            // Right number, wrong idea: worked out the long way.
            "assignment-operators": "let fuel = 100;\nfuel = 80;\nconsole.log(fuel);",
            // Two ifs instead of one condition -- that is nested-conditions.
            "compound-conditions":
                'let fuel = 80;\nlet crew = 4;\nif (fuel > 50) {\n  if (crew > 2) {\n    console.log("Cleared");\n  }\n}',
            // Right message, wrong idea: the number typed into the text.
            "string-concatenation": 'let bays = 4;\nconsole.log("Bays: 4");',
            // Trimmed but not capitalised.
            "string-methods": 'let name = "  tati  ";\nconsole.log(name.trim());',
            // Joined with + rather than built from a template.
            "template-literals":
                'let name = "Tati";\nlet bays = 4;\nconsole.log(name + " has " + bays + " bays");',
            // Hardcoded bound rather than length -- works for this word only.
            "loop-conditions":
                'let word = "Jolt";\nfor (let i = 0; i < 4; i += 1) {\n  console.log(word[i]);\n}',
            // Added by hand, no loop.
            accumulators: "console.log(1 + 2 + 3 + 4);",
            // One loop, so only half the pairs.
            "nested-loops":
                'for (let a = 0; a < 2; a += 1) {\n  console.log(a + "-" + a);\n}',
            // Defined but never called.
            "function-declaration": 'function greet() {\n  console.log("Hello");\n}',
            // Uses an else, which a guard exists to avoid.
            "guard-clauses":
                'function describe(n) {\n  if (n < 0) {\n    return "negative";\n  } else {\n    return "ok";\n  }\n}\nconsole.log(describe(-4));',
            // Braces, so no implicit return -- the thing being taught.
            "arrow-functions": "const double = (n) => { n * 2; };\nconsole.log(double(4));",
            // An if cannot produce a value, which is the whole concept.
            ternary:
                'let fuel = 20;\nlet status = "Plenty";\nif (fuel > 50) {\n  status = "Plenty";\n}\nconsole.log(status);',
            "variable-state": "let fuel = 80;\nconsole.log(fuel);",
            // One function that prints directly. Same output, nothing captured
            // and nothing handed back -- which is the entire concept.
            closures:
                'function makeGreeter(name) {\n  console.log("Hello, " + name);\n}\nmakeGreeter("Tati");',
            // A second name for the same list. Prints 3, not 2.
            "array-copy-spread":
                "let scores = [90, 80];\nlet copy = scores;\ncopy.push(100);\nconsole.log(scores.length);",
            // Three fixed parameters. Adds these three up and nothing else.
            "default-rest-params":
                "function total(a, b, c) {\n  return a + b + c;\n}\nconsole.log(total(1, 2, 3));",
            // A loop. Same answer, not the method being taught.
            map: "let a = [1, 2, 3];\nlet out = [];\nfor (let i = 0; i < a.length; i = i + 1) {\n  out.push(a[i] * 10);\n}\nconsole.log(out);",
            // Built by hand rather than filtered.
            filter: "let a = [5, 15, 25];\nconsole.log([a[1], a[2]]);",
            // An accumulator loop, which is exactly what reduce replaces.
            reduce: "let a = [1, 2, 3, 4];\nlet t = 0;\nfor (let i = 0; i < a.length; i = i + 1) {\n  t = t + a[i];\n}\nconsole.log(t);",
            // Both methods, but as two statements rather than one chain.
            "method-chaining":
                "let a = [1, 2, 3, 4];\nlet kept = a.filter((n) => n > 2);\nlet out = kept.map((n) => n * 100);\nconsole.log(out);",
            // Reads the properties the long way. Same two lines of output.
            destructuring:
                'let p = { name: "Tati", age: 3 };\nconsole.log(p.name);\nconsole.log(p.age);',
            // Never leaves the object, so nothing was converted at all.
            "json-shape": 'let p = { name: "Tati", age: 3 };\nconsole.log(p.name);',
            // Three plain logs: same output, nothing queued.
            "event-loop": 'console.log("one");\nconsole.log("two");\nconsole.log("three");',
            // Prints the promise rather than awaiting it.
            "async-await": 'console.log(Promise.resolve(10));',
            // Waits for them one at a time instead of together.
            "promise-all":
                'Promise.resolve(1).then(() => Promise.resolve(2)).then(() => { console.log(3); });',
            // A loop. Same total, no function calling itself.
            recursion:
                'let t = 0;\nfor (let i = 1; i <= 5; i = i + 1) {\n  t = t + i;\n}\nconsole.log(t);'
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
        // `async-await` stood here until Async landed. `this-binding` is in a
        // topic that has not been built yet.
        expect(practiceFor("this-binding")).toBeNull();
        expect(practiceFor(null)).toBeNull();
    });
});
