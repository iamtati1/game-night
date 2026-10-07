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
    /*
     * `if` and booleans have LEFT this list, because the curriculum now teaches
     * them -- Control Flow #1 and Values #5. `var` left it at Scope #2,
     * `hoisting-tdz`, which is the concept that exists to contrast it with
     * `let`. That is the rule this file follows: the grammar gains a construct
     * when the curriculum reaches it. What must still be refused is everything
     * the learner has genuinely not met.
     */
    const untaught: ReadonlyArray<[string, string]> = [
        // `class` LEFT THIS LIST when this-and-classes was built, and was the
        // last word on it. What remains refused is content, not grammar: a
        // constructor the allowlist does not name, and the host objects below.
        // `new` itself left this list at Objects, for `new Map()` and
        // `new Set()`, and Errors added the four error types. It is still an
        // allowlist, so any other constructor is refused by name -- and the
        // message names the ones that do work.
        ["let a = new Thing();", "not something we have covered yet"],
        // `async` and `await` left this list at Async, as `var` left it at
        // Scope and `new` at Objects. `this` LEFT IT HERE, when this-binding
        // was built -- `class` is now the last word still refused outright,
        // and goes when the rest of this-and-classes lands.
        ['let a = "x"; console.log(a.padStart(3));', "not something we have covered yet"],
        ['let a = "x"; console.log(a.split(""));', "not something we have covered yet"],
        ['let a = "x"; console.log(a.constructor);', "not something we have covered yet"],
        ["let a = 1; console.log(a.length);", "only works on text"]
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


/*
 * SCOPE.
 *
 * Every case here was run against real JavaScript first and matches it. They
 * are written out one by one rather than rolled into a loop because each is a
 * separate claim the curriculum makes to a learner, and a failure should name
 * which claim broke.
 */
describe("scope is lexical", () => {
    it("ends a let at the closing brace", () => {
        const r = runLittleJs("let a = 1;\nif (true) {\n  let b = 2;\n}\nconsole.log(b);");

        expect(r.output).toEqual([]);
        expect(r.error).toContain("does not exist out here");
    });

    it("lets a block reassign a variable from outside it", () => {
        const r = runLittleJs("let a = 1;\nif (true) {\n  a = 2;\n}\nconsole.log(a);");

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["2"]);
    });

    it("treats a bare block as a scope", () => {
        const r = runLittleJs("let x = 1;\n{\n  let x = 2;\n  console.log(x);\n}\nconsole.log(x);");

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["2", "1"]);
    });

    it("shadows rather than refusing an inner declaration", () => {
        const r = runLittleJs(
            "let x = 'outer';\nfunction f() {\n  let x = 'inner';\n  console.log(x);\n}\nf();\nconsole.log(x);"
        );

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["inner", "outer"]);
    });

    it("still refuses a second let for the same name in one scope", () => {
        const r = runLittleJs("let x = 1;\nlet x = 2;");

        expect(r.error).toContain("already been declared");
    });

    /*
     * THE ONE THAT MATTERED MOST.
     *
     * Before Scope this printed 42: a function could read a local belonging to
     * whoever called it. That is dynamic scope, and it is not what JavaScript
     * does.
     */
    it("does not let a function see its caller's locals", () => {
        const r = runLittleJs(
            "function inner() {\n  return secret;\n}\nfunction outer() {\n  let secret = 42;\n  return inner();\n}\nconsole.log(outer());"
        );

        expect(r.output).toEqual([]);
        expect(r.error).not.toBeNull();
    });
});

describe("hoisting and the temporal dead zone", () => {
    it("gives a var undefined before its line", () => {
        const r = runLittleJs("console.log(n);\nvar n = 5;");

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["undefined"]);
    });

    it("refuses a let before its line", () => {
        const r = runLittleJs("console.log(a);\nlet a = 1;");

        expect(r.output).toEqual([]);
        expect(r.error).toContain("declared further down");
    });

    it("does not let an outer value stand in during the dead zone", () => {
        const r = runLittleJs("let a = 'outer';\n{\n  console.log(a);\n  let a = 'inner';\n}");

        expect(r.output).toEqual([]);
        expect(r.error).toContain("declared further down");
    });

    it("calls a function declared further down", () => {
        const r = runLittleJs("console.log(f());\nfunction f() { return 7; }");

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["7"]);
    });

    it("lets var ignore a block", () => {
        const r = runLittleJs("if (true) {\n  var n = 5;\n}\nconsole.log(n);");

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["5"]);
    });
});

describe("closures", () => {
    it("keeps a variable alive after the call that made it returned", () => {
        const r = runLittleJs(
            "function makeCounter() {\n  let n = 0;\n  return () => { n = n + 1; return n; };\n}\nconst c = makeCounter();\nconsole.log(c());\nconsole.log(c());"
        );

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["1", "2"]);
    });

    it("captures a parameter", () => {
        const r = runLittleJs("function adder(a) {\n  return (b) => a + b;\n}\nconst add5 = adder(5);\nconsole.log(add5(3));");

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["8"]);
    });

    it("gives two closures from one factory separate variables", () => {
        const r = runLittleJs(
            "function makeCounter() {\n  let n = 0;\n  return () => { n = n + 1; return n; };\n}\nconst a = makeCounter();\nconst b = makeCounter();\nconsole.log(a());\nconsole.log(a());\nconsole.log(b());"
        );

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["1", "2", "1"]);
    });
});

describe("loop variable capture", () => {
    it("gives each pass its own let binding", () => {
        const r = runLittleJs(
            "let show = 0;\nfor (let i = 0; i < 3; i = i + 1) {\n  if (i === 0) { show = () => i; }\n}\nconsole.log(show());"
        );

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["0"]);
    });

    it("shares one var binding across every pass", () => {
        const r = runLittleJs(
            "let show = 0;\nfor (var i = 0; i < 3; i = i + 1) {\n  if (i === 0) { show = () => i; }\n}\nconsole.log(show());"
        );

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["3"]);
    });

    it("still lets an accumulator outside the loop survive it", () => {
        const r = runLittleJs("let total = 0;\nfor (let i = 1; i <= 3; i = i + 1) {\n  total = total + i;\n}\nconsole.log(total);");

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["6"]);
    });

    it("lets nested loops use the same counter name", () => {
        const r = runLittleJs(
            "let n = 0;\nfor (let i = 0; i < 2; i = i + 1) {\n  for (let i = 0; i < 2; i = i + 1) {\n    n = n + 1;\n  }\n}\nconsole.log(n);"
        );

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["4"]);
    });
});

/*
 * ARRAYS.
 *
 * Every case was run against real JavaScript first and matches it, including
 * the two places arrays are surprising: an index past the end is `undefined`
 * rather than an error, and two lists with identical contents are not equal.
 */
describe("arrays", () => {
    it("reads an item by index and gives undefined past the end", () => {
        expect(runLittleJs("let a = [10, 20, 30];\nconsole.log(a[0]);").output).toEqual(["10"]);
        expect(runLittleJs("let a = [1];\nconsole.log(a[5]);").output).toEqual(["undefined"]);
    });

    it("counts with length, whose last index is one less", () => {
        expect(runLittleJs("let a = [1, 2, 3];\nconsole.log(a.length);").output).toEqual(["3"]);
        expect(runLittleJs("let a = [1, 2, 3];\nconsole.log(a[a.length - 1]);").output).toEqual(["3"]);
        expect(runLittleJs("let a = [1, 2, 3];\nconsole.log(a[a.length]);").output).toEqual([
            "undefined"
        ]);
    });

    it("prints a list in brackets, with its text quoted", () => {
        expect(runLittleJs('console.log([1, "a", true]);').output).toEqual(['[1, "a", true]']);
        expect(runLittleJs("console.log([]);").output).toEqual(["[]"]);
    });

    /* Real JavaScript's own split personality, kept rather than tidied away. */
    it("joins to text with commas even though it prints with brackets", () => {
        expect(runLittleJs('console.log("x" + [1, 2]);').output).toEqual(["x1,2"]);
    });

    it("writes through an index, including a nested one", () => {
        expect(runLittleJs("let a = [1, 2];\na[0] = 9;\nconsole.log(a[0]);").output).toEqual(["9"]);
        expect(
            runLittleJs("let a = [[1], [2]];\na[1][0] = 9;\nconsole.log(a[1][0]);").output
        ).toEqual(["9"]);
    });

    it("reaches into a nested list", () => {
        expect(runLittleJs("let a = [[1, 2], [3, 4]];\nconsole.log(a[1][0]);").output).toEqual([
            "3"
        ]);
    });

    it("loops over a list by index", () => {
        const r = runLittleJs(
            "let a = [1, 2, 3];\nlet t = 0;\nfor (let i = 0; i < a.length; i = i + 1) {\n  t = t + a[i];\n}\nconsole.log(t);"
        );

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["6"]);
    });
});

describe("arrays are changed in place or copied, and the difference shows", () => {
    it("changes the original with push and pop", () => {
        expect(runLittleJs("let a = [1];\na.push(2);\nconsole.log(a.length);").output).toEqual(["2"]);
        expect(runLittleJs("let a = [1, 2];\nconsole.log(a.pop());").output).toEqual(["2"]);
        expect(runLittleJs("let a = [1, 2];\na.pop();\nconsole.log(a.length);").output).toEqual(["1"]);
    });

    it("leaves the original alone with slice", () => {
        const r = runLittleJs("let a = [1, 2, 3];\nlet b = a.slice(1);\nconsole.log(b.length);\nconsole.log(a.length);");

        expect(r.output).toEqual(["2", "3"]);
    });

    it("shares one list between two names", () => {
        expect(runLittleJs("let a = [1];\nlet b = a;\nb.push(2);\nconsole.log(a.length);").output)
            .toEqual(["2"]);
    });

    it("breaks the sharing with spread", () => {
        expect(runLittleJs("let a = [1, 2];\nlet b = [...a];\nb.push(3);\nconsole.log(a.length);").output)
            .toEqual(["2"]);
    });

    /* The half of spread that catches people: one level deep, no further. */
    it("still shares what was nested inside a spread copy", () => {
        const r = runLittleJs(
            "let inner = [1];\nlet a = [inner];\nlet b = [...a];\nb[0].push(2);\nconsole.log(inner.length);"
        );

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["2"]);
    });

    it("compares lists by identity, not by contents", () => {
        expect(runLittleJs("console.log([1] === [1]);").output).toEqual(["false"]);
        expect(runLittleJs("let a = [1];\nlet b = a;\nconsole.log(a === b);").output).toEqual(["true"]);
    });

    /*
     * This list used to hold map, filter, reduce, forEach, find, some, every,
     * flat and sort. All nine LEFT it when Array Methods landed, exactly as
     * `var` left the untaught list at Scope and `if` left it at Control Flow.
     * What remains is everything the curriculum still has not reached -- the
     * table is an allowlist, so a method nobody has taught is refused by the
     * absence of an entry rather than by a check.
     */
    it("refuses array methods no concept has taught", () => {
        for (const method of [
            "findIndex", "findLast", "reduceRight", "flatMap",
            "fill", "at", "copyWithin", "toSorted", "entries"
        ]) {
            const r = runLittleJs(`let a = [1];\na.${method}();`);

            expect(r.error, method).toContain("not something we have covered yet");
        }
    });
});

describe("default and rest parameters", () => {
    it("fills in a missing argument", () => {
        expect(runLittleJs("function f(n = 5) {\n  return n;\n}\nconsole.log(f());").output).toEqual(["5"]);
        expect(runLittleJs("function f(n = 5) {\n  return n;\n}\nconsole.log(f(2));").output).toEqual(["2"]);
    });

    it("uses the default for an explicit undefined, as JavaScript does", () => {
        expect(runLittleJs("function f(n = 5) {\n  return n;\n}\nconsole.log(f(undefined));").output)
            .toEqual(["5"]);
    });

    it("evaluates a default in the call, so it can see earlier parameters", () => {
        expect(runLittleJs("function f(a, b = a + 1) {\n  return b;\n}\nconsole.log(f(4));").output)
            .toEqual(["5"]);
    });

    it("gathers what is left into a list", () => {
        expect(runLittleJs("function f(...rest) {\n  return rest.length;\n}\nconsole.log(f(1, 2, 3));").output)
            .toEqual(["3"]);
        expect(runLittleJs("function f(a, ...rest) {\n  return rest[0];\n}\nconsole.log(f(1, 2));").output)
            .toEqual(["2"]);
    });

    it("gathers an empty list when there is nothing left", () => {
        expect(runLittleJs("function f(...rest) {\n  return rest.length;\n}\nconsole.log(f());").output)
            .toEqual(["0"]);
    });

    it("works on arrows too", () => {
        expect(runLittleJs("const f = (n = 3) => n * 2;\nconsole.log(f());").output).toEqual(["6"]);
    });

    it("still counts the arguments it genuinely needs", () => {
        expect(runLittleJs("function f(a, b) {\n  return a;\n}\nconsole.log(f(1));").error)
            .toContain("takes 2 things");
        expect(runLittleJs("function f(a, ...rest) {\n  return a;\n}\nconsole.log(f());").error)
            .toContain("at least 1");
    });

    it("refuses a rest parameter that is not last", () => {
        expect(runLittleJs("function f(...rest, a) {\n  return a;\n}").error)
            .toContain("has to be the last one");
    });
});

/*
 * ARRAY METHODS.
 *
 * Every case was run against real JavaScript first and matches it, including
 * the three that catch people: `forEach` hands back nothing, `sort` with no
 * comparator compares as TEXT, and `sort` returns the very same list it was
 * called on.
 */
describe("array methods that take a function", () => {
    it("maps every item into a new list, leaving the original alone", () => {
        expect(runLittleJs("let a = [1, 2, 3];\nconsole.log(a.map((n) => n * 2));").output)
            .toEqual(["[2, 4, 6]"]);
        expect(runLittleJs("let a = [1, 2];\na.map((n) => n * 2);\nconsole.log(a);").output)
            .toEqual(["[1, 2]"]);
    });

    /*
     * The decision that made all of this work: a callback is handed only as
     * many arguments as it declares. Ordinary calls still count exactly.
     */
    it("hands a callback only the arguments it asked for", () => {
        expect(runLittleJs("console.log([10, 20].map((n) => n));").output).toEqual(["[10, 20]"]);
        expect(runLittleJs("console.log([10, 20].map((n, i) => i));").output).toEqual(["[0, 1]"]);
        expect(runLittleJs("function f(a, b) {\n  return a;\n}\nconsole.log(f(1));").error)
            .toContain("takes 2 things");
    });

    it("takes a named function as well as an arrow", () => {
        expect(runLittleJs("function dbl(n) {\n  return n * 2;\n}\nconsole.log([1, 2].map(dbl));").output)
            .toEqual(["[2, 4]"]);
    });

    it("says so when the brackets hold something that is not a function", () => {
        expect(runLittleJs("console.log([1].map(5));").error).toContain("needs a function");
    });

    it("returns undefined from forEach", () => {
        const r = runLittleJs("let a = [1, 2];\nlet out = a.forEach((n) => { console.log(n); });\nconsole.log(out);");

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["1", "2", "undefined"]);
    });

    it("filters on truthiness, not only on true", () => {
        expect(runLittleJs("console.log([1, 2, 3, 4].filter((n) => n > 2));").output).toEqual(["[3, 4]"]);
        expect(runLittleJs('console.log(["", "x"].filter((s) => s).length);').output).toEqual(["1"]);
    });

    it("finds an item, or undefined when nothing matches", () => {
        expect(runLittleJs("console.log([1, 2, 3].find((n) => n > 1));").output).toEqual(["2"]);
        expect(runLittleJs("console.log([1].find((n) => n > 5));").output).toEqual(["undefined"]);
    });

    it("answers some and every with booleans", () => {
        expect(runLittleJs("console.log([1, 2].some((n) => n > 1));").output).toEqual(["true"]);
        expect(runLittleJs("console.log([1, 2].every((n) => n > 1));").output).toEqual(["false"]);
        expect(runLittleJs("console.log([].every((n) => n > 1));").output).toEqual(["true"]);
    });

    it("reduces with a starting value and without one", () => {
        expect(runLittleJs("console.log([1, 2, 3].reduce((t, n) => t + n, 0));").output).toEqual(["6"]);
        expect(runLittleJs("console.log([1, 2, 3].reduce((t, n) => t + n));").output).toEqual(["6"]);
        expect(runLittleJs("console.log([1, 2, 3].reduce((t, n) => t + n, 10));").output).toEqual(["16"]);
    });

    it("needs a starting value to reduce an empty list", () => {
        expect(runLittleJs("console.log([].reduce((t, n) => t + n));").error)
            .toContain("needs a starting value");
        expect(runLittleJs("console.log([].reduce((t, n) => t + n, 0));").output).toEqual(["0"]);
    });
});

describe("sort, flat and chaining", () => {
    /* The trap the concept exists for. */
    it("sorts as text when given no comparator", () => {
        expect(runLittleJs("let a = [10, 9, 1];\na.sort();\nconsole.log(a);").output)
            .toEqual(["[1, 10, 9]"]);
    });

    it("sorts numerically with a comparator", () => {
        expect(runLittleJs("let a = [10, 9, 1];\na.sort((x, y) => x - y);\nconsole.log(a);").output)
            .toEqual(["[1, 9, 10]"]);
    });

    it("changes the list it was called on and hands back that same list", () => {
        expect(runLittleJs("let a = [2, 1];\nlet b = a.sort();\nconsole.log(a === b);").output)
            .toEqual(["true"]);
        expect(runLittleJs("let a = [2, 1];\na.sort();\nconsole.log(a);").output).toEqual(["[1, 2]"]);
    });

    it("insists a comparator returns a number", () => {
        expect(runLittleJs("let a = [2, 1];\na.sort((x, y) => true);").error)
            .toContain("has to return a number");
    });

    it("flattens one level by default and further when asked", () => {
        expect(runLittleJs("console.log([[1, 2], [3]].flat());").output).toEqual(["[1, 2, 3]"]);
        expect(runLittleJs("console.log([1, [2, [3]]].flat());").output).toEqual(["[1, 2, [3]]"]);
        expect(runLittleJs("console.log([1, [2, [3]]].flat(2));").output).toEqual(["[1, 2, 3]"]);
    });

    it("chains, because each one hands back something the next can use", () => {
        expect(runLittleJs("console.log([1, 2, 3, 4].filter((n) => n > 1).map((n) => n * 10));").output)
            .toEqual(["[20, 30, 40]"]);
        expect(runLittleJs("console.log([1, 2, 3].map((n) => n * 2).reduce((t, n) => t + n, 0));").output)
            .toEqual(["12"]);
    });

    it("cannot chain off forEach, which hands back nothing", () => {
        expect(runLittleJs("[1, 2].forEach((n) => n).map((n) => n);").error).not.toBeNull();
    });
});

/*
 * EXPRESSION STATEMENTS.
 *
 * Two gaps that had been there since the beginning and only showed up when
 * `map` arrived: a line that is just an expression was not a statement form,
 * and neither was a line beginning with `[`. A braced arrow body is full of
 * the first kind -- `(n) => { n * 2; }` is the mistake map's repair rung is
 * ABOUT, and it could not be written down, let alone run.
 */
describe("a line that is only an expression", () => {
    it("runs a braced arrow body whose statement returns nothing", () => {
        const r = runLittleJs("console.log([1, 2].map((n) => { n * 2; }));");

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["[undefined, undefined]"]);
    });

    it("runs a line that starts with a list", () => {
        const r = runLittleJs("[1, 2].forEach((n) => { console.log(n); });");

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["1", "2"]);
    });

    it("still reassigns, plainly and compounded", () => {
        expect(runLittleJs("let n = 1;\nn = 2;\nconsole.log(n);").output).toEqual(["2"]);
        expect(runLittleJs("let n = 1;\nn += 2;\nconsole.log(n);").output).toEqual(["3"]);
        expect(runLittleJs("let a = [1];\na[0] = 9;\nconsole.log(a[0]);").output).toEqual(["9"]);
    });

    it("still names a comparison written where an assignment was meant", () => {
        expect(runLittleJs("let n = 1;\nn == 2;").error).toContain("compares two values");
    });
});

/*
 * OBJECTS.
 *
 * Every case was run against real JavaScript first and matches it. The three
 * that matter most: a missing property is `undefined` rather than an error,
 * two objects with identical contents are not equal, and `for...in` over a
 * LIST gives its indexes as text.
 */
describe("objects", () => {
    it("reads a property with a dot and with brackets", () => {
        expect(runLittleJs('let p = { name: "Tati" };\nconsole.log(p.name);').output).toEqual(["Tati"]);
        expect(runLittleJs('let p = { name: "Tati" };\nlet k = "name";\nconsole.log(p[k]);').output)
            .toEqual(["Tati"]);
    });

    it("gives undefined for a property that is not there", () => {
        expect(runLittleJs("let p = { a: 1 };\nconsole.log(p.b);").output).toEqual(["undefined"]);
    });

    it("prints an object with its keys", () => {
        expect(runLittleJs('console.log({ name: "Tati", age: 3 });').output)
            .toEqual(['{ name: "Tati", age: 3 }']);
        expect(runLittleJs("console.log({});").output).toEqual(["{}"]);
    });

    it("adds, changes and deletes properties", () => {
        expect(runLittleJs("let p = { a: 1 };\np.b = 2;\nconsole.log(p.b);").output).toEqual(["2"]);
        expect(runLittleJs("let p = { a: 1 };\np.a = 9;\nconsole.log(p.a);").output).toEqual(["9"]);
        expect(runLittleJs("let p = { a: 1, b: 2 };\ndelete p.b;\nconsole.log(p.b);").output)
            .toEqual(["undefined"]);
    });

    it("reaches and writes through nesting", () => {
        expect(runLittleJs('let u = { home: { city: "Brooklyn" } };\nconsole.log(u.home.city);').output)
            .toEqual(["Brooklyn"]);
        expect(runLittleJs('let u = { home: { city: "A" } };\nu.home.city = "B";\nconsole.log(u.home.city);').output)
            .toEqual(["B"]);
    });

    /*
     * The sandbox check that mattered when this was written: a Map has no
     * inherited keys, so there is no way to reach a real JavaScript function.
     */
    it("has no inherited properties to reach through", () => {
        expect(runLittleJs("let p = { a: 1 };\nconsole.log(p.constructor);").output)
            .toEqual(["undefined"]);
        expect(runLittleJs("let p = { a: 1 };\nconsole.log(p.toString);").output)
            .toEqual(["undefined"]);
    });

    it("compares objects by identity, not contents", () => {
        expect(runLittleJs("console.log({ x: 1 } === { x: 1 });").output).toEqual(["false"]);
        expect(runLittleJs("let a = { x: 1 };\nlet b = a;\nconsole.log(a === b);").output).toEqual(["true"]);
    });

    it("shares one object between two names", () => {
        expect(runLittleJs("let a = { x: 1 };\nlet b = a;\nb.x = 9;\nconsole.log(a.x);").output)
            .toEqual(["9"]);
    });
});

describe("walking objects and lists", () => {
    it("walks values with for-of", () => {
        const r = runLittleJs("for (const n of [1, 2]) {\n  console.log(n);\n}");

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["1", "2"]);
    });

    it("walks keys with for-in", () => {
        const r = runLittleJs("let p = { a: 1, b: 2 };\nfor (const k in p) {\n  console.log(k);\n}");

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["a", "b"]);
    });

    /* The trap the concept is named for. */
    it("gives indexes, as text, for for-in over a list", () => {
        const r = runLittleJs('for (const i in ["a", "b"]) {\n  console.log(i);\n}');

        expect(r.output).toEqual(["0", "1"]);
    });

    it("says which loop to use when the wrong one is chosen", () => {
        expect(runLittleJs("for (const x of { a: 1 }) {\n  console.log(x);\n}").error)
            .toContain("for...in");
    });

    it("breaks out of a for-of", () => {
        const r = runLittleJs("for (const n of [1, 2, 3]) {\n  if (n === 2) { break; }\n  console.log(n);\n}");

        expect(r.output).toEqual(["1"]);
    });
});

describe("optional chaining and destructuring", () => {
    it("stops the whole chain rather than failing at the next step", () => {
        expect(runLittleJs("let p = { a: 1 };\nconsole.log(p.missing?.deep);").output)
            .toEqual(["undefined"]);
        expect(runLittleJs("let p = { a: 1 };\nconsole.log(p.missing?.deep.deeper);").output)
            .toEqual(["undefined"]);
    });

    it("behaves as an ordinary dot when the value is there", () => {
        expect(runLittleJs('let u = { home: { city: "Brooklyn" } };\nconsole.log(u.home?.city);').output)
            .toEqual(["Brooklyn"]);
    });

    it("still fails without the question mark, which is the point", () => {
        expect(runLittleJs("let p = { a: 1 };\nconsole.log(p.missing.deep);").error).not.toBeNull();
    });

    it("pulls names out of an object and a list", () => {
        expect(runLittleJs('let p = { name: "Tati", age: 3 };\nconst { name } = p;\nconsole.log(name);').output)
            .toEqual(["Tati"]);
        expect(runLittleJs("const [x, y] = [1, 2];\nconsole.log(y);").output).toEqual(["2"]);
    });

    it("gives undefined for a name the object has not got", () => {
        expect(runLittleJs("const { missing } = { a: 1 };\nconsole.log(missing);").output)
            .toEqual(["undefined"]);
    });
});

describe("JSON, Map and Set", () => {
    it("writes and reads JSON", () => {
        expect(runLittleJs('console.log(JSON.stringify({ a: 1, b: "x" }));').output)
            .toEqual(['{"a":1,"b":"x"}']);
        expect(runLittleJs('console.log(JSON.parse("{\\"a\\":1}").a);').output).toEqual(["1"]);
    });

    /* What does NOT survive, which is half of what json-shape teaches. */
    it("drops functions and undefined on the way out", () => {
        expect(runLittleJs("console.log(JSON.stringify({ a: 1, f: () => 1 }));").output)
            .toEqual(['{"a":1}']);
        expect(runLittleJs("console.log(JSON.stringify({ a: 1, b: undefined }));").output)
            .toEqual(['{"a":1}']);
        expect(runLittleJs("console.log(JSON.stringify([1, undefined]));").output)
            .toEqual(["[1,null]"]);
    });

    it("says so when the text is not JSON", () => {
        expect(runLittleJs('console.log(JSON.parse("not json"));').error).toContain("not valid JSON");
    });

    it("keeps a Set unique and a Map keyed", () => {
        expect(runLittleJs("console.log(new Set([1, 1, 2]).size);").output).toEqual(["2"]);
        expect(runLittleJs('let m = new Map();\nm.set("a", 1);\nconsole.log(m.get("a"));').output)
            .toEqual(["1"]);
        expect(runLittleJs('let s = new Set([1]);\nconsole.log(s.has(1));\nconsole.log(s.has(9));').output)
            .toEqual(["true", "false"]);
    });

    it("refuses any constructor but those two", () => {
        expect(runLittleJs("let a = new Thing();").error).toContain("new Map()");
    });
});

/*
 * ERRORS.
 *
 * Every case was run against real JavaScript first and matches it. The three
 * worth naming: a failure the INTERPRETER raises arrives at `catch` as an
 * Error object with the right type, `finally` runs whether or not anything
 * failed, and a trace lists the calls that were in progress.
 */
describe("errors have types", () => {
    it("names its own failures the way JavaScript does", () => {
        expect(runLittleJs("console.log(nope);").errorName).toBe("ReferenceError");
        expect(runLittleJs("let n = 1;\nconsole.log(n.length);").errorName).toBe("TypeError");
        expect(runLittleJs("let u = {};\nconsole.log(u.a.b);").errorName).toBe("TypeError");
        expect(runLittleJs("function f() {\n  return f();\n}\nf();").errorName).toBe("RangeError");
    });

    it("builds an error value with a name and a message", () => {
        expect(runLittleJs('let e = new Error("boom");\nconsole.log(e.name);\nconsole.log(e.message);').output)
            .toEqual(["Error", "boom"]);
        expect(runLittleJs('console.log(new TypeError("x").name);').output).toEqual(["TypeError"]);
        expect(runLittleJs('console.log(new RangeError("x").name);').output).toEqual(["RangeError"]);
    });

    it("prints an error as its type and message", () => {
        expect(runLittleJs('console.log(new Error("boom"));').output).toEqual(["Error: boom"]);
    });

    it("has only name and message on it", () => {
        expect(runLittleJs('new Error("x").stack;').error).toContain("not something we have covered");
    });
});

describe("throwing and catching", () => {
    it("reports an uncaught throw the way a browser does", () => {
        const r = runLittleJs('throw new Error("boom");');

        expect(r.error).toBe("Uncaught Error: boom");
        expect(r.errorName).toBe("Error");
    });

    it("throws any value at all, as JavaScript does", () => {
        expect(runLittleJs('throw "oops";').error).toBe("Uncaught: oops");
    });

    it("catches what was thrown and carries on", () => {
        const r = runLittleJs(
            'try {\n  throw new Error("boom");\n} catch (e) {\n  console.log(e.message);\n}\nconsole.log("still here");'
        );

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["boom", "still here"]);
    });

    /* A failure the interpreter raised is catchable, with its real type. */
    it("catches a built-in failure as an Error object", () => {
        const r = runLittleJs("let u = {};\ntry {\n  console.log(u.a.b);\n} catch (e) {\n  console.log(e.name);\n}");

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["TypeError"]);
    });

    it("runs finally whether or not anything failed", () => {
        expect(
            runLittleJs('try {\n  throw new Error("x");\n} catch (e) {\n  console.log("caught");\n} finally {\n  console.log("always");\n}').output
        ).toEqual(["caught", "always"]);
        expect(
            runLittleJs('try {\n  console.log("fine");\n} catch (e) {\n  console.log("caught");\n} finally {\n  console.log("always");\n}').output
        ).toEqual(["fine", "always"]);
    });

    it("lets a failure through when there is no catch, after running finally", () => {
        const r = runLittleJs('try {\n  throw new Error("x");\n} finally {\n  console.log("always");\n}');

        expect(r.output).toEqual(["always"]);
        expect(r.error).toBe("Uncaught Error: x");
    });

    it("insists on a catch or a finally", () => {
        expect(runLittleJs("try {\n  console.log(1);\n}").error).toContain("needs a `catch` or a `finally`");
    });

    /*
     * THE SAME RULE AS `break` AND `return`: a statement that did not run
     * cannot signal. Two walks reach statements that are not running -- the
     * one measuring where a body ends, and the one consuming a branch that was
     * not taken -- and a throw firing in either was a real bug.
     */
    it("does not throw from a branch that was not taken", () => {
        const r = runLittleJs('if (false) {\n  throw new Error("never");\n}\nconsole.log("fine");');

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["fine"]);
    });
});

describe("stack traces", () => {
    it("lists the calls that were in progress, most recent first", () => {
        const r = runLittleJs(
            'function inner() {\n  throw new Error("boom");\n}\nfunction outer() {\n  inner();\n}\nouter();'
        );

        expect(r.trace).toEqual(["inner", "outer"]);
    });

    it("has an empty trace when nothing was called", () => {
        expect(runLittleJs('throw new Error("boom");').trace).toEqual([]);
    });

    it("unwinds the stack as calls return", () => {
        const r = runLittleJs(
            'function a() {\n  return 1;\n}\nfunction b() {\n  a();\n  throw new Error("x");\n}\nb();'
        );

        // `a` had already returned, so it is not in the trace.
        expect(r.trace).toEqual(["b"]);
    });
});

/*
 * THE DOM.
 *
 * The one place this language has host objects, and it exists so that the DOM
 * topic can be verified the way the other twelve were: by running it. Every
 * case was checked against a real browser first.
 *
 * A page has to be handed in. Without one there is no `document` at all, which
 * is what every other topic sees.
 */
describe("a pretend page", () => {
    const PAGE = `
<div id="panel" class="card">
  <h2 class="title">Scores</h2>
  <ul id="list">
    <li class="item">A</li>
    <li class="item done">B</li>
  </ul>
</div>`;

    it("has no document unless one was given", () => {
        const r = runLittleJs("console.log(document);");

        expect(r.errorName).toBe("ReferenceError");
    });

    it("finds elements by id, class and tag", () => {
        expect(runLittleJs('console.log(document.querySelector("#panel").tagName);', PAGE).output)
            .toEqual(["DIV"]);
        expect(runLittleJs('console.log(document.querySelector(".title").textContent);', PAGE).output)
            .toEqual(["Scores"]);
        expect(runLittleJs('console.log(document.querySelectorAll(".item").length);', PAGE).output)
            .toEqual(["2"]);
        expect(runLittleJs('console.log(document.querySelectorAll("li.done").length);', PAGE).output)
            .toEqual(["1"]);
    });

    it("gives null when nothing matches", () => {
        expect(runLittleJs('console.log(document.querySelector("#nope"));', PAGE).output)
            .toEqual(["null"]);
    });

    it("names a selector it cannot read, rather than matching nothing", () => {
        expect(runLittleJs('document.querySelector("ul > li");', PAGE).error)
            .toContain("is not a selector we have covered");
    });

    /* textContent is everything underneath, not just this tag's own text. */
    it("reads text through the whole subtree", () => {
        expect(runLittleJs('console.log(document.querySelector("#list").textContent);', PAGE).output)
            .toEqual(["AB"]);
    });

    it("reads the properties the curriculum names", () => {
        expect(runLittleJs('console.log(document.querySelector("#panel").className);', PAGE).output)
            .toEqual(["card"]);
        expect(runLittleJs('console.log(document.querySelector(".title").parentElement.id);', PAGE).output)
            .toEqual(["panel"]);
        expect(runLittleJs('console.log(document.querySelector("#list").children.length);', PAGE).output)
            .toEqual(["2"]);
    });

    it("changes what is on the page", () => {
        const r = runLittleJs(
            'let t = document.querySelector(".title");\nt.textContent = "Totals";\nconsole.log(t.textContent);',
            PAGE
        );

        expect(r.output).toEqual(["Totals"]);
    });

    it("has no innerHTML, deliberately", () => {
        expect(runLittleJs('document.querySelector("#panel").innerHTML;', PAGE).error)
            .toContain("not something an element does");
    });
});

describe("events travel", () => {
    const PAGE = '<div id="panel"><h2 class="title">Scores</h2></div>';

    it("calls a listener when the element is clicked", () => {
        const r = runLittleJs(
            'let b = document.querySelector(".title");\nb.addEventListener("click", () => {\n  console.log("clicked");\n});\nb.click();',
            PAGE
        );

        expect(r.output).toEqual(["clicked"]);
    });

    it("hands the listener an event whose target is what was clicked", () => {
        const r = runLittleJs(
            'let b = document.querySelector(".title");\nb.addEventListener("click", (e) => {\n  console.log(e.target.tagName);\n});\nb.click();',
            PAGE
        );

        expect(r.output).toEqual(["H2"]);
    });

    /* The concept: target first, then up through the ancestors. */
    it("bubbles from the target outwards", () => {
        const r = runLittleJs(
            'let outer = document.querySelector("#panel");\nlet inner = document.querySelector(".title");\nouter.addEventListener("click", () => { console.log("outer"); });\ninner.addEventListener("click", () => { console.log("inner"); });\ninner.click();',
            PAGE
        );

        expect(r.output).toEqual(["inner", "outer"]);
    });

    it("runs capture listeners on the way down, before the target", () => {
        const r = runLittleJs(
            'let outer = document.querySelector("#panel");\nlet inner = document.querySelector(".title");\nouter.addEventListener("click", () => { console.log("capture"); }, true);\ninner.addEventListener("click", () => { console.log("target"); });\ninner.click();',
            PAGE
        );

        expect(r.output).toEqual(["capture", "target"]);
    });

    it("stops the journey at stopPropagation", () => {
        const r = runLittleJs(
            'let outer = document.querySelector("#panel");\nlet inner = document.querySelector(".title");\nouter.addEventListener("click", () => { console.log("outer"); });\ninner.addEventListener("click", (e) => {\n  console.log("inner");\n  e.stopPropagation();\n});\ninner.click();',
            PAGE
        );

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["inner"]);
    });
});

/*
 * ASYNC.
 *
 * Every case was run against real JavaScript first and matches it, including
 * the one the whole topic turns on: synchronous code finishes before any
 * queued work, so `a, b, 1` and never `a, 1, b`.
 */
describe("the event loop", () => {
    it("finishes all synchronous code first, then microtasks, then timers", () => {
        const r = runLittleJs(
            'console.log("1");\nsetTimeout(() => { console.log("3"); }, 0);\nPromise.resolve().then(() => { console.log("2.5"); });\nconsole.log("2");'
        );

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["1", "2", "2.5", "3"]);
    });

    it("runs timers in delay order, and by when they were written for a tie", () => {
        expect(runLittleJs('setTimeout(() => { console.log("b"); }, 10);\nsetTimeout(() => { console.log("a"); }, 0);').output)
            .toEqual(["a", "b"]);
        expect(runLittleJs('setTimeout(() => { console.log("first"); }, 0);\nsetTimeout(() => { console.log("second"); }, 0);').output)
            .toEqual(["first", "second"]);
    });

    it("names a program that never stops queueing work", () => {
        const r = runLittleJs("function again() {\n  setTimeout(again, 0);\n}\nagain();");

        expect(r.errorName).toBe("RangeError");
    });
});

describe("promises", () => {
    it("has three states and shows them", () => {
        expect(runLittleJs("console.log(Promise.resolve(1));").output).toEqual(["Promise { 1 }"]);
        expect(runLittleJs("console.log(new Promise((r) => {}));").output).toEqual(["Promise { pending }"]);
    });

    it("runs a new Promise executor straight away", () => {
        const r = runLittleJs(
            'console.log("before");\nnew Promise((resolve) => { console.log("inside"); resolve(1); }).then((v) => { console.log(v); });\nconsole.log("after");'
        );

        expect(r.output).toEqual(["before", "inside", "after", "1"]);
    });

    it("lets an executor settle later, from a timer", () => {
        const r = runLittleJs(
            'new Promise((resolve) => { setTimeout(() => { resolve("late"); }, 0); }).then((v) => { console.log(v); });\nconsole.log("sync");'
        );

        expect(r.output).toEqual(["sync", "late"]);
    });

    it("chains, and passes a rejection along to the first catch", () => {
        expect(runLittleJs("Promise.resolve(1).then((v) => v + 1).then((v) => { console.log(v); });").output)
            .toEqual(["2"]);
        expect(runLittleJs('Promise.reject("x").then((v) => { console.log("skipped"); }).catch((e) => { console.log("caught " + e); });').output)
            .toEqual(["caught x"]);
    });

    it("runs finally either way and passes the value through", () => {
        expect(runLittleJs('Promise.resolve(1).finally(() => { console.log("always"); }).then((v) => { console.log(v); });').output)
            .toEqual(["always", "1"]);
    });

    it("waits for every promise with all, keeping their order", () => {
        expect(runLittleJs("Promise.all([Promise.resolve(1), Promise.resolve(2)]).then((vs) => { console.log(vs); });").output)
            .toEqual(["[1, 2]"]);
    });

    it("rejects all as soon as one rejects", () => {
        expect(runLittleJs('Promise.all([Promise.resolve(1), Promise.reject("no")]).catch((e) => { console.log("caught " + e); });').output)
            .toEqual(["caught no"]);
    });
});

describe("async and await", () => {
    /* The example the whole topic turns on. */
    it("lets the caller finish before anything after an await runs", () => {
        const r = runLittleJs(
            'async function go() {\n  console.log("a");\n  const v = await Promise.resolve(1);\n  console.log(v);\n}\ngo();\nconsole.log("b");'
        );

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["a", "b", "1"]);
    });

    it("hands back a promise", () => {
        expect(runLittleJs('async function go() {\n  return 7;\n}\ngo().then((v) => { console.log(v); });\nconsole.log("sync");').output)
            .toEqual(["sync", "7"]);
    });

    it("waits a turn even for a plain value", () => {
        expect(runLittleJs('async function go() {\n  const v = await 5;\n  console.log(v);\n}\ngo();\nconsole.log("sync");').output)
            .toEqual(["sync", "5"]);
    });

    it("runs several awaits in order", () => {
        expect(runLittleJs("async function go() {\n  const a = await Promise.resolve(1);\n  const b = await Promise.resolve(2);\n  console.log(a + b);\n}\ngo();").output)
            .toEqual(["3"]);
    });

    it("waits for a timer through a promise", () => {
        const r = runLittleJs(
            'function wait() {\n  return new Promise((resolve) => { setTimeout(() => { resolve("done"); }, 0); });\n}\nasync function go() {\n  console.log("start");\n  const v = await wait();\n  console.log(v);\n}\ngo();\nconsole.log("sync");'
        );

        expect(r.output).toEqual(["start", "sync", "done"]);
    });

    it("interleaves with timers the way the queues say", () => {
        const r = runLittleJs(
            'async function go() {\n  console.log("1");\n  await Promise.resolve();\n  console.log("3");\n}\nsetTimeout(() => { console.log("4"); }, 0);\ngo();\nconsole.log("2");'
        );

        expect(r.output).toEqual(["1", "2", "3", "4"]);
    });
});

describe("a failure inside asynchronous work", () => {
    it("is caught by a try around the await", () => {
        const r = runLittleJs(
            'async function go() {\n  try {\n    await Promise.reject("boom");\n  } catch (e) {\n    console.log("caught " + e);\n  }\n}\ngo();'
        );

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["caught boom"]);
    });

    it("rejects the async function's own promise when nothing catches it", () => {
        expect(runLittleJs('async function go() {\n  await Promise.reject("boom");\n}\ngo().catch((e) => { console.log("outer " + e); });').output)
            .toEqual(["outer boom"]);
    });

    it("turns a throw inside a then into a rejection", () => {
        const r = runLittleJs(
            'Promise.resolve(1).then(() => { throw new Error("inside"); }).catch((e) => { console.log(e.message); });'
        );

        expect(r.output).toEqual(["inside"]);
    });
});

/*
 * RECURSION, AND THE BUG THAT HID IT.
 *
 * Recursion never worked in Jolt until Algorithms was built, and the reason
 * was not recursion at all: a suppressed walk still EVALUATED. After a
 * `return`, a block walks the statements below it to consume their tokens --
 * and that walk CALLED the function again, every time, until the depth guard
 * stopped it. The same root cause had already broken `break`, `return`,
 * `throw`, `await` and any `let` declared in a loop body.
 */
describe("recursion", () => {
    it("stops at its base case", () => {
        const r = runLittleJs(
            'function down(n) {\n  if (n === 0) {\n    return "done";\n  }\n  console.log(n);\n  return down(n - 1);\n}\nconsole.log(down(3));'
        );

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["3", "2", "1", "done"]);
    });

    it("builds a total on the way back up", () => {
        expect(runLittleJs("function total(n) {\n  if (n === 0) {\n    return 0;\n  }\n  return n + total(n - 1);\n}\nconsole.log(total(5));").output)
            .toEqual(["15"]);
    });

    it("still names a recursion that never stops", () => {
        expect(runLittleJs("function down(n) {\n  return down(n - 1);\n}\ndown(3);").errorName)
            .toBe("RangeError");
    });

    it("does not call anything from code that is not running", () => {
        const r = runLittleJs("let n = 0;\nfunction bump() {\n  n = n + 1;\n}\nif (false) {\n  bump();\n}\nconsole.log(n);");

        expect(r.output).toEqual(["0"]);
    });
});

describe("a let declared inside a loop body", () => {
    it("can be read by the statements after it", () => {
        const r = runLittleJs(
            "let a = [3, 1];\nfor (let i = 0; i < 1; i = i + 1) {\n  let t = a[i];\n  a[i] = a[i + 1];\n  a[i + 1] = t;\n}\nconsole.log(a);"
        );

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["[1, 3]"]);
    });
});

describe("Math", () => {
    it("rounds the ways a learner will reach for", () => {
        expect(runLittleJs("console.log(Math.floor(2.7));").output).toEqual(["2"]);
        expect(runLittleJs("console.log(Math.ceil(2.1));").output).toEqual(["3"]);
        expect(runLittleJs("console.log(Math.round(2.5));").output).toEqual(["3"]);
        expect(runLittleJs("console.log(Math.abs(-4));").output).toEqual(["4"]);
        expect(runLittleJs("console.log(Math.max(1, 9, 3));").output).toEqual(["9"]);
    });

    it("refuses the rest by name", () => {
        expect(runLittleJs("console.log(Math.random());").error).toContain("not something we have covered");
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
        // The budget rose from 2 000 to 50 000 when Loops arrived: a legitimate
        // nested loop over a short string reaches a few thousand steps, and a
        // learner hitting the ceiling on correct work would be told their right
        // answer was too busy. These inputs are sized to the new limit.
        const long = `let a = 1;\nconsole.log(${"1 + ".repeat(60_000)}1);`;

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

/**
 * Compound assignment, added when the curriculum reached `assignment-operators`.
 *
 * The grammar grows with the curriculum by design, and the risk of growing it
 * is that something else grows with it. These cover the new construct AND the
 * boundaries that must not have moved.
 */
describe("compound assignment", () => {
    it("updates a variable using its own current value", () => {
        const r = runLittleJs("let total = 5;\ntotal += 3;\nconsole.log(total);");

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["8"]);
    });

    it("supports the four arithmetic forms", () => {
        expect(runLittleJs("let n = 10;\nn -= 4;\nconsole.log(n);").output).toEqual(["6"]);
        expect(runLittleJs("let n = 3;\nn *= 4;\nconsole.log(n);").output).toEqual(["12"]);
        expect(runLittleJs("let n = 12;\nn /= 4;\nconsole.log(n);").output).toEqual(["3"]);
    });

    it("counts as a reassignment, because that is what it is", () => {
        const r = runLittleJs("let fuel = 100;\nfuel -= 20;\nconsole.log(fuel);");

        expect(r.reassigned).toContain("fuel");
        expect(r.declared).toEqual(["fuel"]);
    });

    it("joins text with += , matching JavaScript", () => {
        const r = runLittleJs('let s = "a";\ns += "b";\nconsole.log(s);');

        expect(r.output).toEqual(["ab"]);
    });

    it("refuses a const, exactly as plain reassignment does", () => {
        const r = runLittleJs("const total = 5;\ntotal += 1;");

        expect(r.error).toContain("const");
    });

    it("refuses a name that was never declared", () => {
        expect(runLittleJs("total += 1;").error).toContain("has not been declared");
    });

    it("refuses arithmetic on text it cannot combine", () => {
        expect(runLittleJs('let n = 1;\nn *= "two";').error).toContain("only works with numbers");
    });

    it("still refuses == , which belongs to a later topic", () => {
        // The tokeniser now looks ahead one character for compound operators.
        // That must not have opened a path for comparison.
        expect(runLittleJs("let a = 1;\na == 2;").error).toContain("single `=`");
    });

    it("has not gained any other operator", () => {
        for (const source of ["let a = 1;\na %= 2;", "let a = 1;\na **= 2;", "let a = 1;\na++;"]) {
            expect(runLittleJs(source).error, source).not.toBeNull();
        }
    });

    it("has not gained a way out of the sandbox", () => {
        for (const source of [
            'let a = 1;\na += window;',
            'let a = 1;\na += fetch;',
            'let a = 1;\nconsole.error(a);'
        ]) {
            expect(runLittleJs(source).error, source).not.toBeNull();
        }
    });
});

/**
 * Conditions, added when the curriculum reached Control Flow.
 *
 * The grammar grew by five constructs at once -- booleans, comparison, logical
 * operators, `if`/`else` and the ternary -- because the interpreter had fallen
 * behind Values #5, Values #6 and Operators #4 as well. That is the largest
 * single expansion this file has had, so what is covered here is both the new
 * behaviour AND the boundaries that must not have moved with it.
 */
describe("conditions", () => {
    it("runs the branch whose condition is true", () => {
        const r = runLittleJs('let fuel = 80;\nif (fuel > 50) {\n  console.log("plenty");\n}');

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["plenty"]);
    });

    it("runs nothing when the condition is false", () => {
        const r = runLittleJs('let fuel = 10;\nif (fuel > 50) {\n  console.log("plenty");\n}');

        expect(r.output).toEqual([]);
    });

    it("takes the else branch", () => {
        const r = runLittleJs(
            'let fuel = 10;\nif (fuel > 50) {\n  console.log("plenty");\n} else {\n  console.log("low");\n}'
        );

        expect(r.output).toEqual(["low"]);
    });

    it("runs the first matching branch of a chain and skips the rest", () => {
        const source =
            "let n = 5;\nif (n > 10) {\n  console.log(\"big\");\n} else if (n > 3) {\n  console.log(\"middling\");\n} else {\n  console.log(\"small\");\n}";

        expect(runLittleJs(source).output).toEqual(["middling"]);
    });

    /** The branch not taken must leave NO trace -- that is what not taken means. */
    it("leaves nothing behind from the branch it did not run", () => {
        const r = runLittleJs(
            'let n = 1;\nif (n > 5) {\n  let hidden = 9;\n  n = 99;\n  console.log("nope");\n}\nconsole.log(n);'
        );

        expect(r.output).toEqual(["1"]);
        expect(r.declared, "a declaration in a dead branch is not a declaration").toEqual(["n"]);
        expect(r.reassigned).toEqual([]);
    });

    it("compares with the operators the curriculum teaches", () => {
        expect(runLittleJs("console.log(3 > 2);").output).toEqual(["true"]);
        expect(runLittleJs("console.log(2 >= 2);").output).toEqual(["true"]);
        expect(runLittleJs('console.log("7" == 7);').output).toEqual(["true"]);
        expect(runLittleJs('console.log("7" === 7);').output).toEqual(["false"]);
        expect(runLittleJs('console.log("7" !== 7);').output).toEqual(["true"]);
    });

    it("short-circuits, which is what compound-conditions is about", () => {
        expect(runLittleJs("console.log(false && true);").output).toEqual(["false"]);
        expect(runLittleJs("console.log(true || false);").output).toEqual(["true"]);
        // Returns the operand, as JavaScript does.
        expect(runLittleJs('console.log("" || "Guest");').output).toEqual(["Guest"]);
    });

    it("uses real truthiness, not a simplified rule", () => {
        expect(runLittleJs('let s = "";\nif (s) {\n  console.log("yes");\n}').output).toEqual([]);
        expect(runLittleJs('let n = 0;\nif (n) {\n  console.log("yes");\n}').output).toEqual([]);
        expect(runLittleJs('let s = "0";\nif (s) {\n  console.log("yes");\n}').output).toEqual([
            "yes"
        ]);
    });

    it("chooses a value with a ternary", () => {
        const r = runLittleJs('let n = 3;\nlet label = n > 2 ? "big" : "small";\nconsole.log(label);');

        expect(r.output).toEqual(["big"]);
    });

    it("still names what it has not been taught", () => {
        expect(runLittleJs("if (true) {\n  let a = new Thing();\n}").error).toContain(
            "not something we have covered yet"
        );
        expect(runLittleJs("if (true) {\n  console.log(x);\n}").error).toContain(
            "has not been given a value"
        );
    });

    it("declares a class inside a branch like any other declaration", () => {
        // `class` used to be refused here. Now that it is grammar, the branch
        // is what is being tested -- the class is only the thing inside it.
        expect(
            runLittleJs(
                'if (true) {\n  class A { who() { return "A"; } }\n  console.log(new A().who());\n}'
            ).output
        ).toEqual(["A"]);
    });

    it("still refuses a comparison written where an assignment was meant", () => {
        expect(runLittleJs("let a = 1;\na == 2;").error).toContain("single `=`");
        expect(runLittleJs("let a = 1;\na === 2;").error).toContain("single `=`");
    });

    it("catches an unclosed block rather than running off the end", () => {
        expect(runLittleJs('if (true) {\n  console.log("x");').error).toContain("missing its `}`");
    });

    it("has not gained a way out of the sandbox", () => {
        for (const source of [
            'if (true) { console.log(window); }',
            'if (true) { console.log(fetch); }',
            'if (true) { console.error("x"); }',
            'let a = 1; if (a) { a.toString(); }'
        ]) {
            expect(runLittleJs(source).error, source).not.toBeNull();
        }
    });

    it("keeps its step budget", () => {
        const long = "let n = 0;\n" + "if (n < 1) { n = n + 1; }\n".repeat(20_000);

        expect(runLittleJs(long).error).toContain("too much");
    });
});

/**
 * Text, added when the curriculum reached Strings.
 *
 * `.length`, position access and a FIXED TABLE of methods. The risk in this
 * expansion is different from the others: property access is the usual way out
 * of a sandbox, so the tests below spend most of their effort on what is still
 * unreachable rather than on what now works.
 */
describe("text", () => {
    it("counts characters with length", () => {
        expect(runLittleJs('let name = "Tati";\nconsole.log(name.length);').output).toEqual(["4"]);
        expect(runLittleJs('console.log("".length);').output).toEqual(["0"]);
    });

    it("reads a character by position", () => {
        expect(runLittleJs('let name = "Tati";\nconsole.log(name[0]);').output).toEqual(["T"]);
        expect(runLittleJs('let name = "Tati";\nconsole.log(name[3]);').output).toEqual(["i"]);
    });

    /*
     * This used to assert the opposite -- that an out-of-range position was
     * named as a mistake rather than handed back as `undefined`. That was the
     * right behaviour while `undefined` was not a value the language had. It
     * is one now, and Arrays #1 teaches that an index past the end gives it,
     * so text answers the same way text does in JavaScript.
     */
    it("gives undefined for an out-of-range position, as a list does", () => {
        const r = runLittleJs('let name = "Tati";\nconsole.log(name[9]);');

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["undefined"]);
    });

    it("runs the methods the curriculum teaches", () => {
        expect(runLittleJs('console.log("tati".toUpperCase());').output).toEqual(["TATI"]);
        expect(runLittleJs('console.log("  hi  ".trim());').output).toEqual(["hi"]);
        expect(runLittleJs('console.log("Jolt".slice(0, 2));').output).toEqual(["Jo"]);
        expect(runLittleJs('console.log("Jolt".includes("ol"));').output).toEqual(["true"]);
        expect(runLittleJs('console.log("Jolt".indexOf("l"));').output).toEqual(["2"]);
        expect(runLittleJs('console.log("a-b".replace("-", "+"));').output).toEqual(["a+b"]);
    });

    it("leaves the original text alone, which is what immutability means", () => {
        const r = runLittleJs(
            'let name = "tati";\nlet shout = name.toUpperCase();\nconsole.log(name);\nconsole.log(shout);'
        );

        expect(r.output).toEqual(["tati", "TATI"]);
    });

    it("chains, because each method hands back new text", () => {
        expect(runLittleJs('console.log("  jolt ".trim().toUpperCase());').output).toEqual(["JOLT"]);
    });

    it("counts the wrong number of arguments as a mistake worth naming", () => {
        expect(runLittleJs('console.log("abc".trim(1));').error).toContain("0 things");
        expect(runLittleJs('console.log("abc".slice());').error).toContain("1 or 2");
    });

    /* ---------------------------------------------- what is still unreachable */

    it("has NOT gained general property access", () => {
        for (const source of [
            'console.log("a".constructor);',
            'console.log("a".__proto__);',
            'console.log("a".toString());',
            'console.log("a".split(""));',
            'console.log("a".at(0));'
        ]) {
            const r = runLittleJs(source);

            expect(r.error, source).not.toBeNull();
            expect(r.error, source).toContain("not something we have covered yet");
        }
    });

    it("refuses a dot on anything that is not text", () => {
        expect(runLittleJs("let n = 5;\nconsole.log(n.length);").error).toContain("only works on text");
        expect(runLittleJs("let b = true;\nconsole.log(b.trim());").error).toContain(
            "only works on text"
        );
    });

    it("refuses brackets on anything that is not text", () => {
        expect(runLittleJs("let n = 5;\nconsole.log(n[0]);").error).toContain(
            "Square brackets only work on text"
        );
    });

    it("keeps every other boundary where it was", () => {
        for (const source of [
            'console.log("a".length); for (;;) {}',
            'let a = "x"; let b = new Thing();',
            'console.log(window);',
            'console.log(fetch);',
            'console.error("x");'
        ]) {
            expect(runLittleJs(source).error, source).not.toBeNull();
        }
    });

    it("keeps its step budget with chained methods", () => {
        const long = 'console.log("a"' + ".trim()".repeat(60_000) + ");";

        expect(runLittleJs(long).error).toContain("too much");
    });
});

/**
 * Repetition, added when the curriculum reached Loops.
 *
 * THE BUDGET STOPS BEING A FORMALITY HERE. Every earlier expansion left the
 * grammar unable to repeat, so the step limit only ever bounded how much was
 * pasted in. A `while` makes it the thing standing between a learner's typo and
 * a frozen tab, so most of what follows is about runaways and about the branch
 * and scope rules that nesting exposes.
 */
describe("loops", () => {
    it("counts with a for loop", () => {
        const r = runLittleJs("for (let i = 0; i < 3; i += 1) {\n  console.log(i);\n}");

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["0", "1", "2"]);
    });

    it("repeats a while loop until its condition goes false", () => {
        const r = runLittleJs("let n = 0;\nwhile (n < 3) {\n  console.log(n);\n  n += 1;\n}");

        expect(r.output).toEqual(["0", "1", "2"]);
    });

    it("runs a loop body zero times when the condition starts false", () => {
        expect(runLittleJs('let n = 9;\nwhile (n < 5) {\n  console.log("x");\n}').output).toEqual(
            []
        );
    });

    it("carries on after the loop", () => {
        const r = runLittleJs('for (let i = 0; i < 2; i += 1) {\n  console.log(i);\n}\nconsole.log("done");');

        expect(r.output).toEqual(["0", "1", "done"]);
    });

    /** An accumulator is declared OUTSIDE and must survive the loop. */
    it("keeps what an accumulator built up", () => {
        const r = runLittleJs(
            "let total = 0;\nfor (let i = 1; i < 4; i += 1) {\n  total += i;\n}\nconsole.log(total);"
        );

        expect(r.output).toEqual(["6"]);
    });

    it("walks a string by position", () => {
        const r = runLittleJs(
            'let w = "Jolt";\nlet out = "";\nfor (let i = 0; i < w.length; i += 1) {\n  out += w[i];\n}\nconsole.log(out);'
        );

        expect(r.output).toEqual(["Jolt"]);
    });

    it("leaves the loop with break and skips a pass with continue", () => {
        expect(
            runLittleJs(
                "for (let i = 0; i < 10; i += 1) {\n  if (i === 2) {\n    break;\n  }\n  console.log(i);\n}"
            ).output
        ).toEqual(["0", "1"]);

        expect(
            runLittleJs(
                "for (let i = 0; i < 4; i += 1) {\n  if (i === 1) {\n    continue;\n  }\n  console.log(i);\n}"
            ).output
        ).toEqual(["0", "2", "3"]);
    });

    /**
     * A break in a branch that was NOT taken must not signal. Without this the
     * guard `if (i === 2) { break; }` left the loop on the first pass whatever
     * `i` was, because the tokens are walked either way.
     */
    it("does not let an untaken branch break the loop", () => {
        const r = runLittleJs(
            'for (let i = 0; i < 3; i += 1) {\n  if (i === 99) {\n    break;\n  }\n  console.log(i);\n}'
        );

        expect(r.output).toEqual(["0", "1", "2"]);
    });

    it("nests, and an inner break leaves only the inner loop", () => {
        expect(
            runLittleJs(
                'for (let a = 0; a < 2; a += 1) {\n  for (let b = 0; b < 2; b += 1) {\n    console.log(a + "-" + b);\n  }\n}'
            ).output
        ).toEqual(["0-0", "0-1", "1-0", "1-1"]);

        expect(
            runLittleJs(
                'for (let a = 0; a < 3; a += 1) {\n  for (let b = 0; b < 3; b += 1) {\n    if (b === 1) {\n      break;\n    }\n    console.log(a + "-" + b);\n  }\n}'
            ).output
        ).toEqual(["0-0", "1-0", "2-0"]);
    });

    it("gives the loop counter back when the loop ends", () => {
        // Otherwise a nested loop cannot redeclare its own counter, and no
        // later line can reuse the name.
        const r = runLittleJs(
            "for (let i = 0; i < 2; i += 1) {\n  console.log(i);\n}\nlet i = 9;\nconsole.log(i);"
        );

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["0", "1", "9"]);
    });

    /* ------------------------------------------------------------ runaways */

    it("names a loop that never finishes", () => {
        const r = runLittleJs("let n = 0;\nwhile (n < 5) {\n  n += 0;\n}");

        expect(r.error).toContain("never finishes");
        expect(r.error, "it names the condition, not the program").toContain("condition");
    });

    it("stops a runaway that is printing, and says why", () => {
        const r = runLittleJs("let n = 0;\nwhile (n < 5) {\n  console.log(n);\n}");

        expect(r.error).toContain("more than 200 lines");
        expect(r.output.length, "and does not build a huge array").toBeLessThanOrEqual(201);
    });

    it("stops a runaway nested loop", () => {
        const r = runLittleJs(
            "let n = 0;\nwhile (n < 5) {\n  for (let i = 0; i < 5; i += 1) {\n    n += 0;\n  }\n}"
        );

        expect(r.error).not.toBeNull();
    });

    it("allows a loop long enough for anything the curriculum asks", () => {
        const r = runLittleJs(
            "let total = 0;\nfor (let i = 0; i < 100; i += 1) {\n  total += i;\n}\nconsole.log(total);"
        );

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["4950"]);
    });

    it("refuses break and continue outside a loop", () => {
        expect(runLittleJs("break;").error).toContain("inside a loop");
        expect(runLittleJs('if (true) {\n  continue;\n}').error).toContain("inside a loop");
    });

    it("has not gained a way out of the sandbox", () => {
        for (const source of [
            "for (let i = 0; i < 1; i += 1) { console.log(window); }",
            "while (true) { console.log(fetch); }",
            'for (let i = 0; i < 1; i += 1) { console.log("a".split("")); }',
            "for (let i = 0; i < 1; i += 1) { let a = new Thing(); }"
        ]) {
            expect(runLittleJs(source).error, source).not.toBeNull();
        }
    });

    it("catches an unclosed loop body", () => {
        expect(runLittleJs('for (let i = 0; i < 2; i += 1) {\n  console.log(i);').error).toContain(
            "missing its `}`"
        );
    });
});

/**
 * Functions, added when the curriculum reached them.
 *
 * The largest addition the grammar has had: definitions, calls, parameters,
 * return, arrows, and functions as values. Two things get most of the attention
 * below -- that a definition does NOT run, and that a return reaches the call
 * that asked for it through whatever ifs and loops are in the way.
 */
describe("functions", () => {
    it("defines and calls", () => {
        const r = runLittleJs('function greet() {\n  console.log("hi");\n}\ngreet();');

        expect(r.error).toBeNull();
        expect(r.output).toEqual(["hi"]);
    });

    /** Defining stores instructions; it does not follow them. */
    it("does not run a function it has only defined", () => {
        const r = runLittleJs('function noisy() {\n  console.log("ran");\n}');

        expect(r.error).toBeNull();
        expect(r.output).toEqual([]);
    });

    it("passes arguments into parameters", () => {
        expect(
            runLittleJs("function add(a, b) {\n  return a + b;\n}\nconsole.log(add(2, 3));").output
        ).toEqual(["5"]);
    });

    it("gives undefined when nothing is returned", () => {
        expect(runLittleJs("function f() {\n  let x = 1;\n}\nconsole.log(f());").output).toEqual([
            "undefined"
        ]);
        expect(runLittleJs("function f() {\n  return;\n}\nconsole.log(f());").output).toEqual([
            "undefined"
        ]);
    });

    it("stops the body at a return", () => {
        const r = runLittleJs('function f() {\n  return 1;\n  console.log("never");\n}\nconsole.log(f());');

        expect(r.output).toEqual(["1"]);
    });

    /**
     * A GUARD CLAUSE. The early return has to win over the one below it --
     * the rest of the body is still walked to consume its tokens, and a later
     * `return` in that walk used to overwrite the answer.
     */
    it("lets an early return win over a later one", () => {
        const r = runLittleJs(
            'function check(n) {\n  if (n < 0) {\n    return "negative";\n  }\n  return "ok";\n}\nconsole.log(check(-1));\nconsole.log(check(5));'
        );

        expect(r.output).toEqual(["negative", "ok"]);
    });

    it("returns out of a loop", () => {
        const r = runLittleJs(
            'function find(w) {\n  for (let i = 0; i < w.length; i += 1) {\n    if (w[i] === "l") {\n      return i;\n    }\n  }\n  return -1;\n}\nconsole.log(find("Jolt"));\nconsole.log(find("abc"));'
        );

        expect(r.output).toEqual(["2", "-1"]);
    });

    it("keeps a parameter separate from the caller's name", () => {
        const r = runLittleJs(
            "function f(a) {\n  a = 99;\n  return a;\n}\nlet a = 1;\nconsole.log(f(a));\nconsole.log(a);"
        );

        expect(r.output).toEqual(["99", "1"]);
    });

    it("runs arrow functions in both shapes", () => {
        expect(runLittleJs("const double = (n) => n * 2;\nconsole.log(double(4));").output).toEqual([
            "8"
        ]);
        expect(
            runLittleJs("const t = (n) => { return n + 1; };\nconsole.log(t(1));").output
        ).toEqual(["2"]);
    });

    /** The concept `functions-as-values` is exactly this distinction. */
    it("treats a function without brackets as a value", () => {
        const r = runLittleJs(
            'function shout() {\n  return "HI";\n}\nconsole.log(shout);\nconsole.log(shout());'
        );

        expect(r.output).toEqual(["[function shout]", "HI"]);
    });

    it("passes a function to another function", () => {
        expect(
            runLittleJs(
                "function twice(fn) {\n  return fn() + fn();\n}\nfunction one() {\n  return 1;\n}\nconsole.log(twice(one));"
            ).output
        ).toEqual(["2"]);

        expect(
            runLittleJs(
                "function apply(f, n) {\n  return f(n);\n}\nconsole.log(apply((x) => x * 3, 4));"
            ).output
        ).toEqual(["12"]);
    });

    it("handles negative numbers", () => {
        // Missing since the beginning and invisible until a function wanted to
        // return -1.
        expect(runLittleJs("let n = -5;\nconsole.log(n + 1);").output).toEqual(["-4"]);
        expect(runLittleJs("console.log(3 - -2);").output).toEqual(["5"]);
        expect(runLittleJs('console.log(-"a");').error).toContain("only works with numbers");
    });

    it("still parses a bracketed expression as an expression", () => {
        // `(a, b) => ...` and `(2 + 3) * 4` both open with a bracket.
        expect(runLittleJs("console.log((2 + 3) * 4);").output).toEqual(["20"]);
    });

    /* --------------------------------------------------------- the limits */

    it("names runaway recursion rather than timing out", () => {
        const r = runLittleJs("function f(n) {\n  return f(n);\n}\nconsole.log(f(1));");

        expect(r.error).toContain("calling itself");
        expect(r.error, "and says what is missing").toContain("stops");
    });

    it("counts the arguments", () => {
        expect(
            runLittleJs("function add(a, b) {\n  return a + b;\n}\nconsole.log(add(1));").error
        ).toContain("takes 2 things");
    });

    it("refuses a return outside a function", () => {
        expect(runLittleJs("return 1;").error).toContain("inside a function");
    });

    it("refuses to call something that is not a function", () => {
        expect(runLittleJs("let n = 5;\nconsole.log(n());").error).toContain("not a function");
    });

    it("has not gained a way out of the sandbox", () => {
        for (const source of [
            "function f() { return window; }\nconsole.log(f());",
            "function f() { return fetch; }\nconsole.log(f());",
            'function f() { return "a".split(""); }\nconsole.log(f());'
        ]) {
            expect(runLittleJs(source).error, source).not.toBeNull();
        }
    });

    it("gives `this` nothing to escape through", () => {
        // `this` USED TO BE REFUSED OUTRIGHT, and this list is where it was
        // checked. Now that this-binding is built it has to be allowed -- so
        // the question changes from "is it rejected?" to "what does it hand
        // back?", which is the one that actually matters for the sandbox.
        //
        // At the top level and in a plain call it is `undefined`: no global
        // object, no window, nothing with a real prototype behind it. That is
        // also what a real module does, so the answer is honest as well as safe.
        for (const source of [
            "console.log(this);",
            "const f = () => this;\nconsole.log(f());",
            "function f() { return this; }\nconsole.log(f());"
        ]) {
            const run = runLittleJs(source);

            expect(run.error, source).toBeNull();
            expect(run.output, source).toEqual(["undefined"]);
        }
    });
});

/*
 * THIS, METHODS AND CLASSES.
 *
 * Every case here was run against real JavaScript first and matches it. Written
 * out one at a time rather than looped, because each is a separate claim the
 * curriculum makes to a learner and a failure should name which claim broke.
 */
describe("`this` is decided by the call site", () => {
    const person = `const person = {
  name: "Tati",
  greet() { return this.name; }
};`;

    it("a method call hands the method its object", () => {
        expect(runLittleJs(`${person}\nconsole.log(person.greet());`).output).toEqual(["Tati"]);
    });

    it("the SAME function gives a different answer through a different object", () => {
        // The heart of the concept. Nothing about the function changed; only
        // who called it did.
        expect(
            runLittleJs(
                `${person}\nconst other = { name: "Sam", greet: person.greet };\nconsole.log(other.greet());`
            ).output
        ).toEqual(["Sam"]);
    });

    it("detaching a method loses the object", () => {
        // Not an error about `greet` -- an error about there being nothing to
        // read `name` from, which is what actually went wrong.
        const run = runLittleJs(`${person}\nconst g = person.greet;\nconsole.log(g());`);

        expect(run.error).toContain("nothing there");
    });

    it("an arrow has no `this` of its own, so it uses the one around it", () => {
        expect(
            runLittleJs(
                `const timer = {
  label: "tick",
  start() { const show = () => this.label; return show(); }
};
console.log(timer.start());`
            ).output
        ).toEqual(["tick"]);
    });

    it("an arrow written outside a function sees the outer nothing", () => {
        expect(runLittleJs(`const f = () => this;\nconsole.log(f());`).output).toEqual([
            "undefined"
        ]);
    });
});

describe("objects can hold behaviour", () => {
    it("a method can read its object's data", () => {
        expect(
            runLittleJs(
                `const box = { items: 3, describe() { return "holds " + this.items; } };\nconsole.log(box.describe());`
            ).output
        ).toEqual(["holds 3"]);
    });

    it("a method can change its object's data", () => {
        expect(
            runLittleJs(
                `const tally = { n: 0, add() { this.n = this.n + 1; } };\ntally.add();\ntally.add();\nconsole.log(tally.n);`
            ).output
        ).toEqual(["2"]);
    });

    it("a method can call another method on the same object", () => {
        expect(
            runLittleJs(
                `const m = { n: 2, double() { return this.n * 2; }, show() { return "got " + this.double(); } };\nconsole.log(m.show());`
            ).output
        ).toEqual(["got 4"]);
    });

    it("takes arguments like any other function", () => {
        expect(
            runLittleJs(
                `const m = { base: 10, plus(n) { return this.base + n; } };\nconsole.log(m.plus(5));`
            ).output
        ).toEqual(["15"]);
    });
});

describe("a class makes objects that share their behaviour", () => {
    const dog = `class Dog {
  constructor(name) { this.name = name; }
  speak() { return this.name + " says woof"; }
}`;

    it("`new` runs the constructor against the new object", () => {
        expect(runLittleJs(`${dog}\nconsole.log(new Dog("Rex").speak());`).output).toEqual([
            "Rex says woof"
        ]);
    });

    it("each instance keeps its own data", () => {
        expect(
            runLittleJs(
                `class Counter { constructor() { this.n = 0; } add() { this.n = this.n + 1; } }
const a = new Counter();
const b = new Counter();
a.add();
a.add();
b.add();
console.log(a.n + " and " + b.n);`
            ).output
        ).toEqual(["2 and 1"]);
    });

    it("the method is NOT copied onto the instance", () => {
        // `prototypes`, as a behaviour rather than a word: deleting the idea
        // that methods live on instances is the only way the next test can be
        // true. An own property of the same name is found first.
        expect(
            runLittleJs(
                `class D { constructor() { this.tag = "own"; } tag() { return "method"; } }
console.log(new D().tag);`
            ).output
        ).toEqual(["own"]);
    });

    it("a subclass inherits what it does not define", () => {
        expect(
            runLittleJs(
                `class Animal { constructor(n) { this.name = n; } speak() { return this.name + " makes a sound"; } }
class Dog extends Animal {}
console.log(new Dog("Rex").speak());`
            ).output
        ).toEqual(["Rex makes a sound"]);
    });

    it("a subclass can override a method", () => {
        expect(
            runLittleJs(
                `class Animal { constructor(n) { this.name = n; } speak() { return this.name + " makes a sound"; } }
class Dog extends Animal { speak() { return this.name + " barks"; } }
console.log(new Dog("Rex").speak());`
            ).output
        ).toEqual(["Rex barks"]);
    });

    it("`super(...)` lets the parent do its share of the setup", () => {
        expect(
            runLittleJs(
                `class Animal { constructor(n) { this.name = n; } }
class Dog extends Animal { constructor(n, breed) { super(n); this.breed = breed; } }
const d = new Dog("Rex", "collie");
console.log(d.name + " the " + d.breed);`
            ).output
        ).toEqual(["Rex the collie"]);
    });

    it("`super.method()` EXTENDS behaviour rather than replacing it", () => {
        expect(
            runLittleJs(
                `class Animal { constructor(n) { this.name = n; } speak() { return this.name + " makes a sound"; } }
class Dog extends Animal { speak() { return super.speak() + ", specifically a bark"; } }
console.log(new Dog("Rex").speak());`
            ).output
        ).toEqual(["Rex makes a sound, specifically a bark"]);
    });

    it("`super` follows where the method was WRITTEN, not what the object is", () => {
        // The case that loops forever if `super` is read off the instance:
        // C's method would find C again and call itself. Three deep, so the
        // mistake cannot pass by accident.
        expect(
            runLittleJs(
                `class A { who() { return "A"; } }
class B extends A { who() { return super.who() + "B"; } }
class C extends B { who() { return super.who() + "C"; } }
console.log(new C().who());`
            ).output
        ).toEqual(["ABC"]);
    });

    it("says plainly when `super` has no parent to reach", () => {
        expect(
            runLittleJs(`class A { who() { return super.who(); } }\nconsole.log(new A().who());`)
                .error
        ).toContain("extends another one");
    });

    it("refuses to extend something that is not a class", () => {
        expect(
            runLittleJs(`const notAClass = 5;\nclass B extends notAClass {}`).error
        ).toContain("is not a class");
    });
});
