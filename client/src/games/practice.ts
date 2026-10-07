import type { Movement } from "./missions.js";

/**
 * GUIDED PRACTICE: write the thing you were just shown.
 *
 * THE STAGE THAT WAS MISSING. Measured across Values and Variables, the
 * curriculum declares 41 (concept, demand) pairs and only 12 had anything
 * playable. `predict` had 22 items and `diagnose` 12 -- but `produce` and
 * `apply` had ZERO, at every single concept that declares them.
 *
 * So a learner's real path was: lesson, then predict, then diagnose. They were
 * asked to say what code does and to find what was wrong with it, and never
 * once to write any. This is the step between "I was shown a variable" and
 * "predict what this program prints".
 *
 * ONE OR TWO MOVEMENTS, NEVER MORE. This is not a mission. A mission closes a
 * topic and asks the learner to combine everything in it; this closes a single
 * concept and asks for that concept alone, immediately after meeting it, while
 * the example is still on screen in their memory.
 *
 * REUSES THE MISSION'S MACHINERY ENTIRELY -- the same Movement type, the same
 * scoped evaluator, the same structural checks, the same MissionScene. What
 * differs is scope and when it appears, which is a content decision rather than
 * an architectural one.
 *
 * PREREQUISITE SAFETY IS THE HARD CONSTRAINT. Every snippet here uses only
 * console.log, string and number literals, + - *, and names. No arrays, no
 * functions, no objects, no comparison, no methods. A learner practising
 * `declaration` has met exactly one topic before this one, and the code they
 * are asked to write must stay inside that.
 */
export interface Practice {
    /** The concept this practises. */
    concept: string;
    /** Shown above the work. One line, naming the concept. */
    title: string;
    movements: readonly Movement[];
}

/* Shared shape of a "write it" check: it ran, it printed, and the structure is
   what the concept is about. */
function ran(run: Parameters<Movement["check"]>[0]): string | null {
    if (run.error) return run.error;
    if (run.output.length === 0) {
        return "Nothing was printed. Use `console.log(...)` to show the value.";
    }

    return null;
}

/* ────────────────────────────── this-and-classes · classes ───────────
 *
 * THE CODE-WRITING RUNG OF THE TOPIC. `classes` declares produce, and produce
 * cannot be asked as a list of options -- "define a class and create instances
 * from it" is a thing you do or do not do. So this is a movement: the learner
 * writes it, littleJs runs it, and the check reads the STRUCTURE of what they
 * wrote as well as what it printed.
 *
 * Judged on four separate things, because each is a way of appearing to have
 * done it without having done it: a class has to exist, it has to take the name
 * through its constructor rather than hard-coding one, TWO instances have to be
 * made (one instance never shows that a class is a template), and the two have
 * to print their own names. A learner who writes two plain objects passes none
 * of them.
 */
const CLASSES_PRACTICE: Practice = {
    concept: "classes",
    title: "Build two of the same thing",
    movements: [
        {
            concept: "classes",
            demand: "produce",
            brief:
                "Write a class called `Dog` that takes a `name` when you build it, and gives it a " +
                "`speak()` method printing `<name> says woof`. Then build two different dogs and " +
                "make them both speak.",
            /* Empty rather than a half-written `class Dog {`: the starter is
               run before the learner touches it, and an unfinished line is a
               parse error waiting on screen. */
            starter: "",
            after:
                "One class, two dogs, one `speak` shared between them. That is the whole point of a " +
                "class: the behaviour is written once and every instance has it.",
            check: (run, source) => {
                if (!/\bclass\s+Dog\b/.test(source)) {
                    return "Start with `class Dog {` — that is what makes it a class rather than an object.";
                }

                if (!/\bconstructor\s*\(/.test(source)) {
                    return "Add a `constructor(name)` so each dog can be given its own name when it is built.";
                }

                if (!/\bthis\.\w+\s*=/.test(source)) {
                    return "Inside the constructor, store the name on the dog with `this.name = name;`.";
                }

                if (!/\bspeak\s*\(/.test(source)) {
                    return "Give the class a `speak()` method — the behaviour both dogs will share.";
                }

                const built = source.match(/new\s+Dog\s*\(/g) ?? [];

                if (built.length < 2) {
                    return built.length === 1
                        ? "Build a second dog too. One instance cannot show that a class is a template."
                        : "Now build a dog with `new Dog(\"Rex\")` and make it speak.";
                }

                const broke = ran(run);

                if (broke) return broke;

                const spoke = run.output.filter((line) => /says woof/.test(line));

                if (spoke.length < 2) {
                    return "Both dogs should speak. Call `speak()` on each one.";
                }

                if (spoke[0] === spoke[1]) {
                    return (
                        "Both dogs printed the same line. Give them different names, and make " +
                        "`speak` use `this.name` rather than a fixed one."
                    );
                }

                return null;
            }
        }
    ]
};

export const PRACTICES: readonly Practice[] = [
    CLASSES_PRACTICE,
    /* ────────────────────────── functions · function-declaration ────────
     *
     * Judged on there being a definition AND a call. Printing directly
     * produces the same line and is not the concept -- the whole point is that
     * defining and calling are two separate things.
     */
    {
        concept: "function-declaration",
        title: "Define it, then run it",
        movements: [
            {
                concept: "function-declaration",
                demand: "produce",
                brief:
                    "Write a function called `greet` that prints `Hello` — then call it so it actually runs.",
                starter: "",
                after: "Defining stored the work. The call did it. Those are two separate things.",
                check: (run, source) => {
                    if (!/\bfunction\s+greet\b|\bgreet\s*=/.test(source)) {
                        return "Define a function called `greet` first.";
                    }

                    const broke = ran(run);

                    if (broke) return broke;

                    if (!/\bgreet\s*\(\s*\)/.test(source.replace(/function\s+greet\s*\(\s*\)/, ""))) {
                        return "Defining it is not enough — call `greet()` so it runs.";
                    }

                    const printed = run.output[run.output.length - 1];

                    if (printed !== "Hello") {
                        return `That printed \`${printed ?? "nothing"}\`. It should print \`Hello\`.`;
                    }

                    return null;
                }
            }
        ]
    },

    /* ───────────────────────────────────── functions · guard-clauses ───── */
    {
        concept: "guard-clauses",
        title: "Handle the exception first",
        movements: [
            {
                concept: "guard-clauses",
                demand: "produce",
                brief:
                    "Write `describe(n)` that returns `negative` when n is below zero and `ok` otherwise — using a guard, with no else. Print `describe(-4)`.",
                starter: "",
                after: "The early return ended the function, so the line below it is already the other case.",
                check: (run, source) => {
                    if (/\belse\b/.test(source)) {
                        return "No `else` — the point of a guard is that returning early makes one unnecessary.";
                    }

                    if (!/\breturn\b/.test(source)) {
                        return "A guard RETURNS early. Printing inside the if is a different shape.";
                    }

                    const broke = ran(run);

                    if (broke) return broke;

                    const printed = run.output[run.output.length - 1];

                    if (printed !== "negative") {
                        return `That printed \`${printed ?? "nothing"}\`. With -4 the guard should fire and give \`negative\`.`;
                    }

                    return null;
                }
            }
        ]
    },

    /* ──────────────────────────────────── functions · arrow-functions ──── */
    {
        concept: "arrow-functions",
        title: "The short form",
        movements: [
            {
                concept: "arrow-functions",
                demand: "produce",
                brief:
                    "Write `double` as an arrow function with no braces, so its value comes back automatically. Print `double(4)`.",
                starter: "",
                after: "No braces, no `return` — one expression, handed back for you.",
                check: (run, source) => {
                    if (!/=>/.test(source)) {
                        return "Use an arrow function: `const double = (n) => ...`.";
                    }

                    if (/=>\s*\{/.test(source)) {
                        return "No braces here — the point is the implicit return you get without them.";
                    }

                    if (/\bfunction\b/.test(source)) {
                        return "Use the arrow form rather than the `function` keyword.";
                    }

                    const broke = ran(run);

                    if (broke) return broke;

                    const printed = run.output[run.output.length - 1];

                    if (printed !== "8") {
                        return `That printed \`${printed ?? "nothing"}\`. Doubling 4 should print \`8\`.`;
                    }

                    return null;
                }
            }
        ]
    },
    /* ───────────────────────────────────────── scope · closures ─────────
     *
     * Judged on the source as well as the run, because the output alone cannot
     * tell this from the shortcut. A single function that takes a name and
     * prints the greeting produces exactly the same line; so does typing the
     * name into the message. What is asked for is a function that HANDS BACK a
     * function, and a greeting built from the captured name.
     */
    {
        concept: "closures",
        title: "A function that makes a function",
        movements: [
            {
                concept: "closures",
                demand: "produce",
                brief:
                    "Write `makeGreeter` so it takes a name and RETURNS a function. Calling that returned function should print `Hello, ` followed by the name. Make a greeter for \"Tati\" and run it.",
                starter: "",
                after: "The returned function kept `name` after `makeGreeter` had already finished.",
                check: (run, source) => {
                    if (!/\breturn\b/.test(source)) {
                        return "`makeGreeter` has to RETURN the inner function, not call it.";
                    }

                    // Two function headers: the factory, and the one it returns.
                    const headers = (source.match(/=>|\bfunction\b/g) ?? []).length;

                    if (headers < 2) {
                        return "There should be two functions here: `makeGreeter`, and the one it hands back.";
                    }

                    if (!/return\s*(\(|function\b)/.test(source)) {
                        return "The `return` should hand back a function — `return (…) => …` or `return function …`.";
                    }

                    const broke = ran(run);

                    if (broke) return broke;

                    const printed = run.output[run.output.length - 1];

                    if (printed !== "Hello, Tati") {
                        return `That printed \`${printed ?? "nothing"}\`. It should print \`Hello, Tati\`.`;
                    }

                    /*
                     * The greeting has to USE the captured name. Typing
                     * "Hello, Tati" straight into the message prints the same
                     * line and captures nothing, which is the one thing this
                     * movement exists to check.
                     */
                    const read = run.namesUsedInOutput[run.namesUsedInOutput.length - 1] ?? [];

                    if (read.length === 0) {
                        return "Build the greeting from the name the function was given, rather than typing it into the message.";
                    }

                    return null;
                }
            }
        ]
    },

    /* ────────────────────────── arrays · array-copy-spread ──────────────
     *
     * Judged on the source and on the ORIGINAL being untouched. A second name
     * for the same list prints the same length right up until something is
     * pushed, so the check pushes and then looks at the original.
     */
    {
        concept: "array-copy-spread",
        title: "Copy it, do not share it",
        movements: [
            {
                concept: "array-copy-spread",
                demand: "produce",
                brief:
                    "`scores` holds [90, 80]. Use spread to make a COPY that does not share with it, push 100 onto the copy, then print `scores.length` — which should still be 2.",
                starter: "let scores = [90, 80];\n",
                after: "A new list, so the push never reached the original.",
                check: (run, source) => {
                    if (!/\.\.\./.test(source)) {
                        return "Use spread to build the copy: `[...scores]`.";
                    }

                    if (!/\bpush\b/.test(source)) {
                        return "Push 100 onto the copy, so the two lists can be told apart.";
                    }

                    const broke = ran(run);

                    if (broke) return broke;

                    const printed = run.output[run.output.length - 1];

                    if (printed !== "2") {
                        return printed === "3"
                            ? "That printed `3`, so the push reached the original — the copy is still the same list."
                            : `That printed \`${printed ?? "nothing"}\`. Print \`scores.length\`, which should still be 2.`;
                    }

                    return null;
                }
            }
        ]
    },

    /* ──────────────────────── arrays · default-rest-params ──────────────
     *
     * Judged on there being a rest parameter. Three fixed parameters add up
     * three numbers exactly as `...nums` does, and only one of them still
     * works when a fourth is passed.
     */
    {
        concept: "default-rest-params",
        title: "However many you are given",
        movements: [
            {
                concept: "default-rest-params",
                demand: "produce",
                brief:
                    "Write `total` so it takes ANY number of numbers and returns their sum. Print `total(1, 2, 3)`.",
                starter: "",
                after: "One parameter, any number of arguments.",
                check: (run, source) => {
                    if (!/\(\s*\.\.\./.test(source)) {
                        return "Gather the arguments with a rest parameter: `function total(...nums)`.";
                    }

                    const broke = ran(run);

                    if (broke) return broke;

                    const printed = run.output[run.output.length - 1];

                    if (printed !== "6") {
                        return `That printed \`${printed ?? "nothing"}\`. Adding 1, 2 and 3 should print \`6\`.`;
                    }

                    return null;
                }
            }
        ]
    },

    /* ───────────────────────────────── array-methods · map ──────────────
     *
     * Judged on the method, not the answer. A `for` loop pushing into a new
     * list prints exactly the same thing, and the whole point of the topic is
     * the method that got there.
     */
    {
        concept: "map",
        title: "Transform every item",
        movements: [
            {
                concept: "map",
                demand: "produce",
                brief: "Use `map` to turn `[1, 2, 3]` into `[10, 20, 30]`, and print the result.",
                starter: "let a = [1, 2, 3];\n",
                after: "One in, one out — a new list the same length.",
                check: (run, source) => {
                    if (!/\.map\s*\(/.test(source)) {
                        return "Use `.map(...)` here — a loop gives the same answer by a different route.";
                    }

                    const broke = ran(run);

                    if (broke) return broke;

                    const printed = run.output[run.output.length - 1];

                    if (printed !== "[10, 20, 30]") {
                        return printed === "[undefined, undefined, undefined]"
                            ? "The arrow body needs to RETURN something — drop the braces, or add `return`."
                            : `That printed \`${printed ?? "nothing"}\`. It should print \`[10, 20, 30]\`.`;
                    }

                    return null;
                }
            }
        ]
    },

    /* ──────────────────────────────── array-methods · filter ────────────── */
    {
        concept: "filter",
        title: "Keep the ones that pass",
        movements: [
            {
                concept: "filter",
                demand: "produce",
                brief: "Use `filter` to keep only the numbers above 10 from `[5, 15, 25]`, and print the result.",
                starter: "let a = [5, 15, 25];\n",
                after: "A test per item, and the yeses collected.",
                check: (run, source) => {
                    if (!/\.filter\s*\(/.test(source)) {
                        return "Use `.filter(...)` here rather than building the list by hand.";
                    }

                    const broke = ran(run);

                    if (broke) return broke;

                    const printed = run.output[run.output.length - 1];

                    if (printed !== "[15, 25]") {
                        return `That printed \`${printed ?? "nothing"}\`. It should print \`[15, 25]\`.`;
                    }

                    return null;
                }
            }
        ]
    },

    /* ──────────────────────────────── array-methods · reduce ────────────── */
    {
        concept: "reduce",
        title: "Collapse it to one value",
        movements: [
            {
                concept: "reduce",
                demand: "produce",
                brief: "Use `reduce` to add up `[1, 2, 3, 4]` and print the total.",
                starter: "let a = [1, 2, 3, 4];\n",
                after: "A whole list folded into a single number.",
                check: (run, source) => {
                    if (!/\.reduce\s*\(/.test(source)) {
                        return "Use `.reduce(...)` here — an accumulator loop is the thing it replaces.";
                    }

                    const broke = ran(run);

                    if (broke) return broke;

                    const printed = run.output[run.output.length - 1];

                    if (printed !== "10") {
                        return printed === "1234"
                            ? "That joined the numbers instead of adding them — the starting value should be `0`, not `\"\"`."
                            : `That printed \`${printed ?? "nothing"}\`. 1 + 2 + 3 + 4 is \`10\`.`;
                    }

                    return null;
                }
            }
        ]
    },

    /* ─────────────────────────── array-methods · method-chaining ─────────
     *
     * Judged on BOTH methods being present and on one of them feeding the
     * other. Two separate statements give the same answer and are not the
     * concept, which is following what flows between them.
     */
    {
        concept: "method-chaining",
        title: "One into the next",
        movements: [
            {
                concept: "method-chaining",
                demand: "produce",
                brief:
                    "From `[1, 2, 3, 4]`, keep the numbers above 2 and then multiply each by 100 — in ONE chain — and print the result.",
                starter: "let a = [1, 2, 3, 4];\n",
                after: "filter handed [3, 4] straight to map.",
                check: (run, source) => {
                    if (!/\.filter\s*\(/.test(source) || !/\.map\s*\(/.test(source)) {
                        return "This one wants both `.filter(...)` and `.map(...)`.";
                    }

                    // `)` then `.filter`/`.map` is one calling the other.
                    if (!/\)\s*\.\s*(map|filter)\s*\(/.test(source)) {
                        return "Chain them: call the second method directly on the result of the first.";
                    }

                    const broke = ran(run);

                    if (broke) return broke;

                    const printed = run.output[run.output.length - 1];

                    if (printed !== "[300, 400]") {
                        return `That printed \`${printed ?? "nothing"}\`. It should print \`[300, 400]\`.`;
                    }

                    return null;
                }
            }
        ]
    },

    /* ────────────────────────────── objects · destructuring ─────────────
     *
     * Judged on the source, because `p.name` prints exactly what a
     * destructured `name` prints. The concept is pulling the properties OUT
     * into their own names, not the lines that follow.
     */
    {
        concept: "destructuring",
        title: "Take the parts you want",
        movements: [
            {
                concept: "destructuring",
                demand: "produce",
                brief:
                    "`p` holds a name and an age. Destructure BOTH into their own variables, then print the name and the age on separate lines.",
                starter: 'let p = { name: "Tati", age: 3 };\n',
                after: "Two properties, two variables, one line.",
                check: (run, source) => {
                    if (!/(const|let)\s*\{[^}]*\}\s*=/.test(source)) {
                        return "Destructure with braces on the left: `const { name, age } = p;`.";
                    }

                    const broke = ran(run);

                    if (broke) return broke;

                    if (run.output.length < 2) {
                        return "Print the name and the age on separate lines.";
                    }

                    const [first, second] = run.output.slice(-2);

                    if (first !== "Tati" || second !== "3") {
                        return `That printed \`${first}\` then \`${second}\`. It should print \`Tati\` then \`3\`.`;
                    }

                    /*
                     * The variables have to be what is PRINTED. Destructuring
                     * and then logging `p.name` anyway passes every other
                     * check and misses the point entirely.
                     */
                    const read = run.namesUsedInOutput.slice(-2).flat();

                    if (read.includes("p")) {
                        return "Print the destructured variables themselves, rather than reading them back off `p`.";
                    }

                    return null;
                }
            }
        ]
    },

    /* ──────────────────────────────── objects · json-shape ──────────────── */
    {
        concept: "json-shape",
        title: "Out to text, and back",
        movements: [
            {
                concept: "json-shape",
                demand: "produce",
                brief:
                    "Turn `p` into JSON text, read that text back into a new object, and print the new object's `name`.",
                starter: 'let p = { name: "Tati", age: 3 };\n',
                after: "Out as text and back again — which is how data travels.",
                check: (run, source) => {
                    if (!/JSON\.stringify\s*\(/.test(source)) {
                        return "Use `JSON.stringify(...)` to turn the object into text.";
                    }

                    if (!/JSON\.parse\s*\(/.test(source)) {
                        return "Use `JSON.parse(...)` to read the text back into an object.";
                    }

                    const broke = ran(run);

                    if (broke) return broke;

                    const printed = run.output[run.output.length - 1];

                    if (printed !== "Tati") {
                        return `That printed \`${printed ?? "nothing"}\`. It should print \`Tati\`.`;
                    }

                    return null;
                }
            }
        ]
    },

    /* ───────────────────────────────── async · event-loop ───────────────
     *
     * Judged on a timer being used. Three logs in a row print the same three
     * lines; the concept is that the LAST one printed is the one that was
     * queued, not the one written last.
     */
    {
        concept: "event-loop",
        title: "Make it arrive last",
        movements: [
            {
                concept: "event-loop",
                demand: "produce",
                brief:
                    "Print `one`, then `two`, then `three` — but write the `three` line BEFORE the `two` line, and use `setTimeout` so it still arrives last.",
                starter: 'console.log("one");\n',
                after: "Queued work waits for the ordinary lines to finish.",
                check: (run, source) => {
                    if (!/setTimeout\s*\(/.test(source)) {
                        return "Use `setTimeout(...)` — that is what puts the line in the queue.";
                    }

                    const three = source.indexOf('"three"');
                    const two = source.indexOf('"two"');

                    if (three < 0 || two < 0 || three > two) {
                        return "Write the `three` line above the `two` line, so the order you see is the queue at work.";
                    }

                    const broke = ran(run);

                    if (broke) return broke;

                    if (run.output.join(",") !== "one,two,three") {
                        return `That printed ${run.output.join(", ")}. It should print one, two, three.`;
                    }

                    return null;
                }
            }
        ]
    },

    /* ───────────────────────────────── async · async-await ──────────────── */
    {
        concept: "async-await",
        title: "Wait for the value",
        movements: [
            {
                concept: "async-await",
                demand: "produce",
                brief:
                    "Write an `async` function that awaits `Promise.resolve(10)` and prints the value it gets. Call it.",
                starter: "",
                after: "The promise became a value, and the rest of the line waited for it.",
                check: (run, source) => {
                    if (!/\basync\b/.test(source)) return "Mark the function `async` — `await` only works inside one.";
                    if (!/\bawait\b/.test(source)) {
                        return "Use `await` to turn the promise into the value it settles with.";
                    }

                    const broke = ran(run);

                    if (broke) return broke;

                    const printed = run.output[run.output.length - 1];

                    if (printed !== "10") {
                        return printed?.startsWith("Promise")
                            ? "That printed the promise itself — `await` is what turns it into the value."
                            : `That printed \`${printed ?? "nothing"}\`. It should print \`10\`.`;
                    }

                    return null;
                }
            }
        ]
    },

    /* ───────────────────────────────── async · promise-all ──────────────── */
    {
        concept: "promise-all",
        title: "Wait for all of them",
        movements: [
            {
                concept: "promise-all",
                demand: "produce",
                brief:
                    "Use `Promise.all` to wait for `Promise.resolve(1)`, `Promise.resolve(2)` and `Promise.resolve(3)`, then print how many values came back.",
                starter: "",
                after: "One handler, once, with every value in the order they were given.",
                check: (run, source) => {
                    if (!/Promise\.all\s*\(/.test(source)) {
                        return "Use `Promise.all([...])` rather than waiting for them one at a time.";
                    }

                    const broke = ran(run);

                    if (broke) return broke;

                    const printed = run.output[run.output.length - 1];

                    if (printed !== "3") {
                        return `That printed \`${printed ?? "nothing"}\`. Three promises go in, so \`.length\` is \`3\`.`;
                    }

                    return null;
                }
            }
        ]
    },

    /* ──────────────────────────── algorithms · recursion ────────────────
     *
     * Judged on the function calling itself. A loop adds the same numbers and
     * prints the same total; the concept is the call and the case that ends it.
     */
    {
        concept: "recursion",
        title: "A function that calls itself",
        movements: [
            {
                concept: "recursion",
                demand: "produce",
                brief:
                    "Write `total` so that `total(5)` adds up 5 + 4 + 3 + 2 + 1 by CALLING ITSELF with a smaller number. Give it a case that stops. Print `total(5)`.",
                starter: "",
                after: "It got smaller until it could not, then the answers came back out.",
                check: (run, source) => {
                    if (!/function\s+total/.test(source) && !/total\s*=/.test(source)) {
                        return "Write a function called `total`.";
                    }

                    // The call inside its own body is the whole concept.
                    const body = source.slice(source.indexOf("total"));

                    if ((body.match(/\btotal\s*\(/g) ?? []).length < 2) {
                        return "`total` has to call itself — that is what makes it recursive.";
                    }

                    if (/\bfor\s*\(|\bwhile\s*\(/.test(source)) {
                        return "No loop here — let the function call itself instead.";
                    }

                    const broke = ran(run);

                    if (broke) return broke;

                    const printed = run.output[run.output.length - 1];

                    if (printed !== "15") {
                        return `That printed \`${printed ?? "nothing"}\`. 5 + 4 + 3 + 2 + 1 is \`15\`.`;
                    }

                    return null;
                }
            }
        ]
    },

    /* ───────────────────────────────── loops · loop-conditions ──────────
     *
     * Judged on covering every character EXACTLY once. `<=` prints the same
     * four characters and then reaches past the end, so the output alone does
     * not tell a correct bound from an off-by-one -- the run has to be clean.
     */
    {
        concept: "loop-conditions",
        title: "Cover it exactly once",
        movements: [
            {
                concept: "loop-conditions",
                demand: "produce",
                brief:
                    "Print every character of `word` on its own line — all four, and nothing past the end.",
                starter: 'let word = "Jolt";\n',
                after: "Positions run from 0 to length minus one, which is what `<` gives you.",
                check: (run, source) => {
                    const broke = ran(run);

                    if (broke) return broke;

                    if (!/\bfor\b|\bwhile\b/.test(source)) {
                        return "Use a loop rather than four separate lines.";
                    }

                    if (!/\.length/.test(source)) {
                        return "Use `word.length` for the bound rather than typing 4 — the loop should work for any word.";
                    }

                    const printed = run.output.join(",");

                    if (printed !== "J,o,l,t") {
                        return `That printed \`${printed || "nothing"}\`. It should print J, o, l and t on four lines.`;
                    }

                    return null;
                }
            }
        ]
    },

    /* ──────────────────────────────────────── loops · accumulators ─────── */
    {
        concept: "accumulators",
        title: "Add it up",
        movements: [
            {
                concept: "accumulators",
                demand: "produce",
                brief:
                    "Add up 1, 2, 3 and 4 with a loop and print the total. Declare the total before the loop.",
                starter: "",
                after: "One variable outside, updated on every pass. That shape totals, counts and collects.",
                check: (run, source) => {
                    const broke = ran(run);

                    if (broke) return broke;

                    if (!/\bfor\b|\bwhile\b/.test(source)) {
                        return "Use a loop — adding the four numbers by hand is not the exercise.";
                    }

                    const printed = run.output[run.output.length - 1];

                    if (printed !== "10") {
                        return `That printed \`${printed ?? "nothing"}\`. One plus two plus three plus four is 10.`;
                    }

                    // The accumulator has to outlive the loop, which is what
                    // declaring it outside means.
                    if (run.declared.length === 0) {
                        return "Declare a total before the loop and add to it inside.";
                    }

                    return null;
                }
            }
        ]
    },

    /* ───────────────────────────────────────── loops · nested-loops ────── */
    {
        concept: "nested-loops",
        title: "Every pair",
        movements: [
            {
                concept: "nested-loops",
                demand: "produce",
                brief:
                    "Print every pair from 0-0 up to 1-1 — four lines, in the form `0-0`. Use one loop inside another.",
                starter: "",
                after: "The inner loop ran all the way through on each pass of the outer one.",
                check: (run, source) => {
                    const broke = ran(run);

                    if (broke) return broke;

                    if ((source.match(/\bfor\b|\bwhile\b/g) ?? []).length < 2) {
                        return "Two loops, one inside the other.";
                    }

                    const printed = run.output.join(",");

                    if (printed !== "0-0,0-1,1-0,1-1") {
                        return `That printed \`${printed || "nothing"}\`. It should print 0-0, 0-1, 1-0 and 1-1 in that order.`;
                    }

                    return null;
                }
            }
        ]
    },
    /* ───────────────────────────── strings · string-concatenation ───────
     *
     * Judged on the NAME being used, not the output. `"Bays: 4"` typed
     * directly prints what the join prints -- the same distinction the
     * Variables mission is built on, one topic later.
     */
    {
        concept: "string-concatenation",
        title: "Build the message",
        movements: [
            {
                concept: "string-concatenation",
                demand: "produce",
                brief:
                    "`bays` holds 4. Print exactly `Bays: 4` — joining the name in, not typing the number into the message.",
                starter: "let bays = 4;\n",
                after: "One piece of text, one value, joined. Change `bays` and the message follows.",
                check: (run) => {
                    const broke = ran(run);

                    if (broke) return broke;

                    const printed = run.output[run.output.length - 1];
                    const usedName = run.namesUsedInOutput.some((names) => names.includes("bays"));

                    if (printed === "Bays: 4" && !usedName) {
                        return "That is the right message — but `4` is typed into it. Join `bays` in instead.";
                    }

                    if (!usedName) return "Use the name `bays` inside `console.log`.";

                    if (printed !== "Bays: 4") {
                        return `That printed \`${printed}\`. It should read exactly \`Bays: 4\`.`;
                    }

                    return null;
                }
            }
        ]
    },

    /* ─────────────────────────────────── strings · string-methods ───────── */
    {
        concept: "string-methods",
        title: "Tidy it up",
        movements: [
            {
                concept: "string-methods",
                demand: "produce",
                brief:
                    "`name` has stray spaces around it. Print it with the spaces removed and every letter capital — `TATI`.",
                starter: 'let name = "  tati  ";\n',
                after: "Each method handed back new text, and the next one worked on that.",
                check: (run, source) => {
                    const broke = ran(run);

                    if (broke) return broke;

                    if (!/\.trim\s*\(/.test(source)) {
                        return "Use `.trim()` to take the spaces off both ends.";
                    }

                    if (!/\.toUpperCase\s*\(/.test(source)) {
                        return "Use `.toUpperCase()` to make the letters capital.";
                    }

                    const printed = run.output[run.output.length - 1];

                    if (printed !== "TATI") {
                        return `That printed \`${printed}\`. It should print \`TATI\` with no spaces.`;
                    }

                    return null;
                }
            }
        ]
    },

    /* ──────────────────────────────── strings · template-literals ───────── */
    {
        concept: "template-literals",
        title: "Fill in the holes",
        movements: [
            {
                concept: "template-literals",
                demand: "produce",
                brief:
                    "Print exactly `Tati has 4 bays` — using a template literal with backticks, not `+`.",
                starter: 'let name = "Tati";\nlet bays = 4;\n',
                after: "Backticks and two holes. Easier to read than three joins, and it does the same thing.",
                check: (run, source) => {
                    const broke = ran(run);

                    if (broke) return broke;

                    if (!/`/.test(source)) {
                        return "Use backticks rather than quotes — that is what makes it a template.";
                    }

                    if (!/\$\{/.test(source)) {
                        return "Drop the values in with `${ }` rather than writing them out.";
                    }

                    if (/\+/.test(source)) {
                        return "No `+` needed here — the holes do the joining.";
                    }

                    const printed = run.output[run.output.length - 1];

                    if (printed !== "Tati has 4 bays") {
                        return `That printed \`${printed}\`. It should read exactly \`Tati has 4 bays\`.`;
                    }

                    return null;
                }
            }
        ]
    },
    /* ──────────────────────────── control-flow · compound-conditions ────
     *
     * Two conditions, both of which must hold. Judged on the SOURCE using
     * `&&`, because `if (fuel > 50) { if (crew > 2) { ... } }` prints the same
     * thing and is a different concept -- that one is nested-conditions.
     */
    {
        concept: "compound-conditions",
        title: "Ask two things at once",
        movements: [
            {
                concept: "compound-conditions",
                demand: "produce",
                brief:
                    "Launch only when `fuel` is over 50 AND `crew` is over 2. Print `Cleared` when it is. Use one `if` with `&&`.",
                starter: "let fuel = 80;\nlet crew = 4;\n",
                after: "One condition, two parts. `&&` settles it as soon as either part fails.",
                check: (run, source) => {
                    const broke = ran(run);

                    if (broke) return broke;

                    if (!/&&/.test(source)) {
                        return "Join the two questions into one condition with `&&`.";
                    }

                    if ((source.match(/\bif\b/g) ?? []).length > 1) {
                        return "One `if`, not two. `&&` is what lets a single condition ask about both.";
                    }

                    const printed = run.output[run.output.length - 1];

                    if (printed !== "Cleared") {
                        return `The board reads \`${printed ?? "nothing"}\`. It should read \`Cleared\`.`;
                    }

                    return null;
                }
            }
        ]
    },

    /* ────────────────────────────────────── control-flow · ternary ───────
     *
     * The point of a ternary is that it PRODUCES a value, so the check
     * requires the result to be stored in a name rather than printed from
     * inside two branches.
     */
    {
        concept: "ternary",
        title: "Choose a value",
        movements: [
            {
                concept: "ternary",
                demand: "produce",
                brief:
                    "`fuel` is 20. Store `Low` in `status` when fuel is 50 or less, and `Plenty` when it is more — using a ternary, then print `status`.",
                starter: "let fuel = 20;\n",
                after: "One expression, one value, stored in one place. An `if` could not sit on the right of that `=`.",
                check: (run, source) => {
                    const broke = ran(run);

                    if (broke) return broke;

                    if (!/\?[^]*:/.test(source)) {
                        return "Use a ternary: `condition ? valueWhenTrue : valueWhenFalse`.";
                    }

                    if (/\bif\b/.test(source)) {
                        return "No `if` here — the whole point is that a ternary produces a value on its own.";
                    }

                    if (!run.declared.includes("status")) {
                        return "Store the result in a name called `status`.";
                    }

                    const printed = run.output[run.output.length - 1];

                    if (printed !== "Low") {
                        return `That printed \`${printed ?? "nothing"}\`. With fuel at 20 it should print \`Low\`.`;
                    }

                    return null;
                }
            }
        ]
    },
    /* ────────────────────────────── operators · assignment-operators ─────
     *
     * The ONE practice outside Variables, and the reason is the concept
     * itself: "update a variable using its own current value" cannot be
     * demonstrated by predicting, only by writing. `littleJs` gained `+=` and
     * friends when the curriculum reached this concept, which is the grammar
     * this movement exercises.
     *
     * JUDGED ON THE OPERATOR, NOT THE NUMBER. `fuel = 80` prints exactly what
     * `fuel -= 20` prints, and only one of them is the concept. The check reads
     * the SOURCE for the compound form, the same way the Variables mission
     * reads namesUsedInOutput to tell a used name from a typed-in value.
     */
    {
        concept: "assignment-operators",
        title: "Update it in place",
        movements: [
            {
                concept: "assignment-operators",
                demand: "produce",
                brief:
                    "`fuel` starts at 100 and the burn costs 20. Subtract it using `-=`, then print what is left.",
                starter: "let fuel = 100;\n",
                after: "`fuel -= 20` reads the current value, takes 20 off it, and stores it back — in one step.",
                check: (run, source) => {
                    const broke = ran(run);

                    if (broke) return broke;

                    const compound = /\bfuel\s*-=/.test(source);
                    const printed = run.output[run.output.length - 1];

                    // Said BEFORE the output is praised, so a learner who got
                    // the right number the long way does not read "correct".
                    if (printed === "80" && !compound) {
                        return "That is the right number — but it was worked out the long way. Use `fuel -= 20;` so the update reads as one step.";
                    }

                    if (!compound) return "Use `-=` to take 20 off `fuel`.";

                    if (printed !== "80") {
                        return `That printed \`${printed}\`. After a burn of 20 it should print \`80\`.`;
                    }

                    return null;
                }
            }
        ]
    },
    /* ───────────────────────────────── variables · declaration ───────── */
    {
        concept: "declaration",
        title: "Make a name",
        movements: [
            {
                concept: "declaration",
                demand: "produce",
                brief: "Your ship has 100 fuel. Give that value the name `fuel`.",
                starter: "let fuel = ___;",
                after: "`fuel` is a name now. `100` is what it refers to.",
                check: (run) => {
                    if (run.error) return run.error;

                    if (run.declared.length === 0) {
                        return "Nothing was declared. Start the line with `let`, then the name.";
                    }

                    if (!run.declared.includes("fuel")) {
                        return `You named it \`${run.declared[0]}\`. This one needs to be called \`fuel\`.`;
                    }

                    return null;
                }
            }
        ]
    },

    /* ──────────────────────────── variables · initialization ─────────── */
    {
        concept: "initialization",
        title: "A name and a starting value",
        movements: [
            {
                concept: "initialization",
                demand: "produce",
                brief: "Name the number of passengers `crew`, starting at 3, and print it.",
                starter: "",
                after: "Declared and given a starting value in one line — that is initialisation.",
                check: (run) => {
                    const broke = ran(run);

                    if (broke) return broke;

                    if (!run.declared.includes("crew")) {
                        return run.declared.length === 0
                            ? "Declare the name first: `let crew = 3;`"
                            : `You named it \`${run.declared[0]}\`. This one needs to be \`crew\`.`;
                    }

                    if (run.output[run.output.length - 1] !== "3") {
                        return `That printed \`${run.output[run.output.length - 1]}\`. It should print \`3\`.`;
                    }

                    return null;
                }
            }
        ]
    },

    /* ─────────────────────────────── variables · assignment ──────────── */
    {
        concept: "assignment",
        title: "Work it out, then store it",
        movements: [
            {
                concept: "assignment",
                demand: "produce",
                brief:
                    "`total` starts at 5. Add 3 to it — storing the result back in `total` — then print it.",
                starter: "let total = 5;\n",
                after: "The right-hand side was worked out first, then stored back under the same name.",
                check: (run) => {
                    const broke = ran(run);

                    if (broke) return broke;

                    if (!run.declared.includes("total")) {
                        return "Keep the name `total` from the first line.";
                    }

                    const printed = run.output[run.output.length - 1];

                    if (printed === "5") {
                        return "That is still 5. Working out `total + 3` is not enough — store it back with `total = total + 3;`.";
                    }

                    if (printed !== "8") {
                        return `That printed \`${printed}\`. It should print \`8\`.`;
                    }

                    return null;
                }
            }
        ]
    },

    /* ──────────────────────── variables · reading-variables ──────────── */
    {
        concept: "reading-variables",
        title: "Use the name",
        movements: [
            {
                concept: "reading-variables",
                demand: "apply",
                brief: "`fuel` already holds 80. Print `Fuel: 80` — using the name, not the number.",
                starter: "let fuel = 80;\nconsole.log(___);",
                after: "The message asked `fuel` what it held rather than containing 80 itself.",
                check: (run) => {
                    const broke = ran(run);

                    if (broke) return broke;

                    const printed = run.output[run.output.length - 1];
                    const usedName = run.namesUsedInOutput.some((names) => names.includes("fuel"));

                    if (printed === "Fuel: 80" && !usedName) {
                        return "Right output — but `80` is typed into the message. Use the name `fuel` instead.";
                    }

                    if (!usedName) return "Use the name `fuel` inside `console.log`.";

                    if (printed !== "Fuel: 80") {
                        return `That printed \`${printed}\`. It needs to read exactly \`Fuel: 80\`.`;
                    }

                    return null;
                }
            }
        ]
    },

    /* ─────────────────────────────── variables · reassignment ────────── */
    {
        concept: "reassignment",
        title: "Point it somewhere new",
        movements: [
            {
                concept: "reassignment",
                demand: "apply",
                brief:
                    "`fuel` starts at 100. Burn some: make it 60 on a new line, then print it.",
                starter: "let fuel = 100;\n",
                after: "The name stayed the same. What it refers to changed.",
                check: (run) => {
                    const broke = ran(run);

                    if (broke) return broke;

                    if (run.reassigned.length === 0) {
                        return "Change it on a line of its own: `fuel = 60;` — no `let` the second time.";
                    }

                    const printed = run.output[run.output.length - 1];

                    if (printed !== "60") {
                        return `That printed \`${printed}\`. After the burn it should print \`60\`.`;
                    }

                    return null;
                }
            }
        ]
    },

    /* ─────────────────────────── variables · variable-state ──────────── */
    {
        concept: "variable-state",
        title: "Two names at once",
        movements: [
            {
                concept: "variable-state",
                demand: "produce",
                brief:
                    "The ship has 80 fuel and 3 passengers. Name both, then print `Fuel: 80` and `Crew: 3` on separate lines.",
                starter: "",
                after: "Two names, two values, both read back. That is the state of the program.",
                check: (run) => {
                    const broke = ran(run);

                    if (broke) return broke;

                    if (run.declared.length < 2) {
                        return run.declared.length === 0
                            ? "Start by naming the fuel: `let fuel = 80;`"
                            : `You named \`${run.declared[0]}\`. The other reading needs a name too.`;
                    }

                    const [first, second] = run.output;

                    if (first !== "Fuel: 80") {
                        return `The first line reads \`${first ?? "nothing"}\`. It should read \`Fuel: 80\`.`;
                    }

                    if (second !== "Crew: 3") {
                        return `The second line reads \`${second ?? "nothing"}\`. It should read \`Crew: 3\`.`;
                    }

                    if (run.namesUsedInOutput.filter((n) => n.length > 0).length < 2) {
                        return "One of those lines has its number typed in. Both should come from a name.";
                    }

                    return null;
                }
            }
        ]
    }
];

/** The practice for a concept, or null where none is authored yet. */
export function practiceFor(concept: string | null): Practice | null {
    if (!concept) return null;

    return PRACTICES.find((p) => p.concept === concept) ?? null;
}
