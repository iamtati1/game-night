/**
 * A deliberately small JavaScript, for the code a learner has actually been
 * taught.
 *
 * WHY THIS EXISTS. The Variables mission has to tell these two apart:
 *
 *     console.log("Fuel: 100")          right output, wrong idea
 *     console.log("Fuel: " + fuel)      right output, right idea
 *
 * Output alone cannot. Both print `Fuel: 100`. The difference is STRUCTURAL --
 * whether a name was used or a number was typed into the message -- so the
 * mission needs to know what the program is made of, not only what it printed.
 * That is the entire reason this file exists, and it is the reason it is a
 * parser rather than a regular expression.
 *
 * WHAT IT DELIBERATELY CANNOT DO. No functions, no objects, no arrays, no
 * conditionals, no loops, no property access, no method calls. Not because they
 * are hard, but because a learner at Variables has not met them -- and a
 * mission that silently accepts `fuel.toString()` is teaching something nobody
 * taught. Anything outside the grammar is refused by NAME, which is also the
 * friendliest possible error: "we have not covered that yet" is true, useful,
 * and never a stack trace.
 *
 * This is not a sandbox with holes in it. There is no `eval`, no `Function`, no
 * host object reachable from the grammar, and no way to express a call other
 * than `console.log`. It runs on a fixed step budget so nothing here can spin.
 *
 * IT WILL GROW, AND THAT IS THE POINT. When the curriculum teaches `if`, this
 * gains `if` -- and not a moment before. The grammar tracking the curriculum is
 * the feature.
 */

/**
 * A function the learner wrote: where its body starts, and what it takes.
 *
 * Stored as a TOKEN POSITION rather than a parsed tree, because that is how
 * every other body in this interpreter is handled -- an `if` branch and a loop
 * body are both "run the tokens starting here". A function is the same thing
 * with a name, some parameters and a way back out.
 */
/**
 * One parameter.
 *
 * `fallback` is the token position of a default expression rather than a
 * value, because a default is evaluated AT CALL TIME in the function's own
 * scope -- evaluating it once when the function is defined would be a
 * different language and a wrong one.
 */
export interface LittleParam {
    name: string;
    fallback: number | null;
    rest: boolean;
}

export interface LittleFunction {
    kind: "function";
    name: string;
    params: LittleParam[];
    body: number;
    /** An arrow with no braces: the body is one expression, returned. */
    expression: boolean;
    /**
     * The scope this function was WRITTEN in -- not the one it is called from.
     *
     * This single field is what makes a closure a closure: the variables a
     * function can see are fixed where it appears in the source, and it keeps
     * them after the call that created it has finished.
     */
    closure: Scope;
    /**
     * The promise this function settles, for `resolve` and `reject`.
     *
     * Carried on the function rather than on a stack in the context, because
     * an executor is free to resolve LATER -- `new Promise(r => setTimeout(r, 0))`
     * is the first thing anyone writes, and by the time that timer fires any
     * stack of "what are we settling" has long since been popped.
     */
    bound?: LittlePromise;
    /** True for `async function`: calling it hands back a promise. */
    isAsync?: boolean;
    /**
     * True for an arrow.
     *
     * THE ONE FIELD `this-binding` TURNS ON. An ordinary function is given a
     * fresh `this` by whoever calls it; an arrow is not given one at all, so
     * reading `this` inside an arrow walks out to the function it was written
     * in. That is not a special case bolted on here -- it falls out of `this`
     * being an ordinary binding in the call's scope, and arrows not making one.
     */
    isArrow?: boolean;
    /**
     * The class this method was written in, when it was.
     *
     * Only `super` needs it, and it needs it for a reason worth stating: the
     * parent to look in is decided by WHERE THE METHOD WAS WRITTEN, not by
     * what the instance happens to be. A `Dog` method calling `super.speak()`
     * means Animal's, even when `this` is a `Puppy` three classes down --
     * reading the parent off the instance instead would make a method that
     * calls `super` loop forever once anything inherited it.
     */
    owner?: LittleClass;
}

/**
 * A value this language can hold.
 *
 * `null` and `undefined` joined when the curriculum reached `null-vs-undefined`
 * (Values #8) and functions became values at Functions #6 -- which is the
 * concept `functions-as-values` IS.
 */
/**
 * A list.
 *
 * AN OBJECT, DELIBERATELY, because that is what makes arrays behave the way
 * Arrays #3 and #7 say they do. Two names holding the same array hold the same
 * object, so `push` through one is visible through the other, and `===` is
 * identity rather than a comparison of contents. Had this been a plain
 * JavaScript array copied around by value, `array-mutation` and
 * `array-reference-identity` would both have been unteachable.
 */
export interface LittleArray {
    kind: "array";
    items: LittleValue[];
}

/**
 * An object.
 *
 * A MAP, NOT A PLAIN OBJECT, and for the reason this file learned the hard way
 * at `STRING_METHODS`: a plain object answers for every key on
 * `Object.prototype`, so `person.constructor` would have handed back a real
 * JavaScript function from inside the sandbox. A Map has no inherited keys,
 * and it remembers insertion order, which is what `for...in` walks.
 */
export interface LittleObject {
    kind: "object";
    props: Map<string, LittleValue>;
    /**
     * The class this object was made by, or undefined for a plain `{ }`.
     *
     * THE PROTOTYPE LINK, and the reason `prototypes` is a teachable concept
     * rather than a word. A method is NOT copied onto each instance -- it is
     * stored once on the class, and the instance keeps a line back to it. So
     * `dog.speak()` finds nothing called `speak` on `dog`, follows this link,
     * and finds it there. An interpreter that copied methods in would make
     * every sentence the concept wants to say false.
     */
    from?: LittleClass;
}

/**
 * A class: a constructor and a table of methods.
 *
 * NOT A FUNCTION WITH A `prototype` PROPERTY, which is what real JavaScript
 * has underneath. That shape exists for history, and reproducing it here would
 * put `Dog.prototype.speak` in front of a beginner in order to explain `class
 * Dog { speak() {} }`, which is backwards. What is modelled is the RELATIONSHIP
 * the concept is about -- instance, class, and the lookup between them -- in
 * the vocabulary the learner is actually writing.
 */
export interface LittleClass {
    kind: "class";
    name: string;
    /** `constructor(...)`, or null for a class that declares none. */
    ctor: LittleFunction | null;
    methods: Map<string, LittleFunction>;
    /** What it `extends`, or null. */
    parent: LittleClass | null;
}

/**
 * A `Map` or a `Set`, and the `JSON` namespace.
 *
 * Deliberately three thin wrappers rather than one general object system:
 * `built-in-collections` asks a learner to CHOOSE between a Set, a Map and a
 * plain object, and `json-shape` asks what survives the round trip. Neither
 * needs classes, prototypes or `this`, all of which belong to a later topic.
 */
/**
 * An Error object: something with a `name` and a `message`.
 *
 * Deliberately not a LittleObject with those two properties, because the
 * curriculum asks a learner to tell an Error apart from a plain object -- and
 * because `catch` has to be able to say what it caught.
 */
/**
 * A promise.
 *
 * THREE STATES AND NOTHING ELSE, which is what `promise-states` is defined as:
 * pending until it settles, then fulfilled with a value or rejected with a
 * reason, and never anything again after that. `settled` is checked on every
 * path that could change it, because a promise that resolves twice would make
 * the concept untrue.
 *
 * The waiting callbacks are held here rather than in the queue, because a
 * `.then` attached to an ALREADY settled promise still has to run later --
 * never in the same tick. That is the rule the whole of `event-loop` rests on.
 */
export interface LittlePromise {
    kind: "promise";
    state: "pending" | "fulfilled" | "rejected";
    value: LittleValue;
    /** Run when it settles: queued, never called in the tick that settled it. */
    waiting: Reaction[];
    /** True once something is listening for a rejection, so silence can be reported. */
    watched: boolean;
}

/**
 * Something waiting on a promise.
 *
 * Two kinds, because two different things wait: a `.then` chain, which has
 * handlers and a promise of its own to settle, and the interpreter itself --
 * `await` and `Promise.all` -- which just wants to be told.
 */
type Reaction =
    | { kind: "handlers"; onOk: LittleValue; onNo: LittleValue; next: LittlePromise }
    | { kind: "raw"; then: (state: "fulfilled" | "rejected", value: LittleValue) => void };

export interface LittleThrown {
    kind: "error";
    name: string;
    message: string;
}

/**
 * An element on a pretend page.
 *
 * THE ONLY HOST OBJECT THIS LANGUAGE HAS, and it exists because the DOM topic
 * cannot be taught honestly without one. Every other topic's questions are
 * verified by RUNNING the snippet; `event-order` in particular -- an event
 * travelling down to the target and back up through its ancestors -- is
 * exactly the kind of claim that careful reasoning gets wrong. So there is a
 * real tree here, and a real dispatch over it.
 *
 * Deliberately small: no layout, no styles, no document.write, no innerHTML.
 * Attributes are the two the curriculum names, children are a real list, and
 * the parent link is what makes bubbling expressible.
 */
export interface LittleElement {
    kind: "element";
    tag: string;
    id: string;
    classes: string[];
    text: string;
    children: LittleElement[];
    parent: LittleElement | null;
    listeners: { type: string; fn: LittleValue; capture: boolean }[];
}

export interface LittleBuiltIn {
    kind: "builtin";
    name: "Set" | "Map" | "JSON" | "Math";
    set?: Set<LittleValue>;
    map?: Map<LittleValue, LittleValue>;
}

export type LittleValue =
    | LittlePromise
    | LittleElement
    | LittleThrown
    | LittleBuiltIn
    | string
    | number
    | boolean
    | null
    | undefined
    | LittleFunction
    | LittleArray
    | LittleClass
    | LittleObject;

export interface RunResult {
    /** Lines printed by console.log, in order. */
    output: string[];
    /** A learner-legible message, or null if the program ran. */
    error: string | null;
    /**
     * What the last line evaluated to, when the last thing the program did was
     * evaluate something.
     *
     * FOR THE EXPERIMENT PLAYGROUND, where a learner types `score;` and expects
     * to see the value the way a console would. `console.log` output is a
     * different thing and is still reported separately -- this is set only by a
     * top-level expression written on its own, never by anything inside a
     * function, and never by a declaration or an assignment.
     */
    value: LittleValue;
    /** True when the last line produced a value worth showing. */
    hasValue: boolean;
    /**
     * What KIND of failure, when there was one.
     *
     * `error-types` is defined as telling from the name what went wrong, so
     * the interpreter names its own failures the way JavaScript does rather
     * than reporting every one of them as a sentence with no category.
     */
    errorName: string | null;
    /**
     * The calls that were in progress, most recent first -- a stack trace.
     *
     * Empty when the failure happened at the top level, which is itself worth
     * seeing: a trace with nothing in it means nothing was called.
     */
    trace: string[];
    /** Names brought into existence, in declaration order. */
    declared: string[];
    /** Names that were REASSIGNED after declaration. */
    reassigned: string[];
    /**
     * Names read inside each console.log argument, one entry per call.
     *
     * This is what movement 2 is judged on: an empty set for a call means the
     * learner typed the value straight into the message.
     */
    namesUsedInOutput: string[][];
}

/* ----------------------------------------------------------------- tokens */

type Tok =
    | { k: "num"; v: number }
    | { k: "str"; v: string }
    | { k: "name"; v: string }
    | { k: "bool"; v: boolean }
    | { k: "kw"; v: "let" | "const" | "var" }
    | { k: "ctl"; v: "if" | "else" }
    | { k: "loop"; v: "for" | "while" }
    | { k: "flow"; v: "break" | "continue" }
    | { k: "fn"; v: "function" | "return" }
    | { k: "nothing"; v: null | undefined }
    | { k: "punc"; v: string };

const KEYWORDS = new Set(["let", "const", "var"]);

/** `total += 5` and friends: read the current value, combine, store back. */
const COMPOUND = new Set(["+=", "-=", "*=", "/="]);

/**
 * Words that mean something in real JavaScript and nothing here. Naming them
 * individually is what turns "Unexpected token" into a sentence a beginner can
 * act on.
 */
/*
 * A MAP, for the same reason STRING_METHODS is one.
 *
 * As a plain object this answered for every key on Object.prototype, so a
 * learner who wrote a variable called `constructor` -- or any code containing
 * the word -- got an error message that was the SOURCE OF Object, because
 * `NOT_YET["constructor"]` is truthy and was thrown as the explanation. The
 * lookup was inherited; the table never had the key.
 *
 * Latent since this table was written, and surfaced by a test that used
 * `.constructor` to check the string allowlist could not be escaped.
 */
const NOT_YET = new Map<string, string>(Object.entries({}));

/**
 * Words that ARE the language now, added as the curriculum reached them.
 *
 * `true` and `false` are Values #5. Comparison is Values #6, logical operators
 * are Operators #4, and `if`/`else` are Control Flow #1 -- so by the time a
 * learner is asked to WRITE a condition, every piece of it has been taught.
 * Each of these was in NOT_YET until the concept that teaches it landed, which
 * is the rule this file has followed from the start. `var` left that table at
 * Scope #2, `hoisting-tdz`, because a learner cannot be asked to predict what
 * `var` does differently while the word itself is refused.
 */
const BOOLEANS = new Set(["true", "false"]);

/** `null` and `undefined`, which Values #8 teaches. */
const NOTHINGS = new Map<string, null | undefined>(
    Object.entries({ null: null, undefined: undefined })
);

/**
 * How deep calls may nest.
 *
 * A function that calls itself is the one way a program can still run away
 * without a loop, and the step budget would catch it only after a great deal of
 * stack. Naming it as recursion is more use to a learner than reporting the
 * program as busy -- and recursion itself is Algorithms, nine topics later.
 */
const MAX_DEPTH = 50;

/** How many queued jobs may run, so a self-requeueing timer is named. */
const MAX_TASKS = 10_000;

/**
 * The body position of `stopPropagation`.
 *
 * A function the learner can call but that has no source: it is the one thing
 * on the event object that DOES something rather than holding a value.
 * Negative because no real body ever starts before the first token, so `call`
 * can recognise it without a flag.
 */
const STOP_PROPAGATION = -1;

/** `resolve` and `reject`, handed to a `new Promise` executor. Sourceless. */
const SETTLE_OK = -2;
const SETTLE_NO = -3;

/**
 * How many passes any one loop may make.
 *
 * SEPARATE FROM THE STEP BUDGET, and both are needed. The step budget bounds
 * total work; this bounds a single loop, so a runaway is reported as what it
 * actually is -- "this loop never finishes" -- rather than as the program being
 * generally too busy. A beginner whose condition never goes false needs to be
 * told about the condition.
 *
 * 10_000 is far above anything the curriculum asks for -- its loops count to
 * ten and walk strings of a few characters -- and far below anything that would
 * make the browser wait noticeably.
 */
const MAX_PASSES = 2_000;

/**
 * How many lines a program may print.
 *
 * A runaway loop with a `console.log` in it will reach this long before it
 * reaches the step budget, and the message it gets names the actual problem --
 * the condition -- rather than reporting the program as generally too busy.
 * It also keeps a mistake from building an array big enough to matter.
 */
const MAX_OUTPUT = 200;

/**
 * Total work any one program may do.
 *
 * THIS IS NOW A REAL TIMEOUT. Until Loops the grammar had no way to repeat, so
 * this bounded only the length of what was pasted in and the comment here said
 * so. A `while` changes that: the budget is the thing standing between a
 * learner's typo and a frozen tab, and every loop pass and every statement
 * inside one spends from it.
 *
 * Raised from 2000 because a legitimate nested loop over a short string can
 * reach a few thousand steps, and a learner hitting the ceiling on correct work
 * would be told their right answer was too busy.
 */
const MAX_STEPS = 50_000;

/**
 * The string methods the curriculum teaches, and nothing else.
 *
 * AN ALLOWLIST, NOT PROPERTY ACCESS. This is the difference between "strings
 * have methods now" and "any property of any value can be reached". `.trim` is
 * here; `.constructor`, `.__proto__` and `.toString` are not, and a name not on
 * this list is refused the same way `for` is -- by name, with a sentence. The
 * sandbox holds because there is no syntax for reaching anything else, not
 * because a check happens to catch it.
 *
 * Each takes a fixed number of arguments, which is checked: `slice` with three
 * arguments is a mistake worth naming rather than quietly ignoring.
 */
interface StringMethod {
    args: [number, number];
    run: (s: string, a: LittleValue[]) => LittleValue;
}

/*
 * A MAP, NOT AN OBJECT, and that is not a style choice.
 *
 * As a plain object this table answered for every key on Object.prototype:
 * `"a".constructor` looked the method up, found `Object`, and handed back
 * `function Object() { [native code] }`. The allowlist was a hole the moment it
 * was written as `Record<string, ...>`, because the lookup itself was inherited.
 * A Map has no prototype chain to walk, so a name that was never put in it is
 * simply absent.
 */
const STRING_METHODS = new Map<string, StringMethod>(Object.entries({
    toUpperCase: { args: [0, 0], run: (s) => s.toUpperCase() },
    toLowerCase: { args: [0, 0], run: (s) => s.toLowerCase() },
    trim: { args: [0, 0], run: (s) => s.trim() },
    includes: { args: [1, 1], run: (s, a) => s.includes(text(a[0]!)) },
    indexOf: { args: [1, 1], run: (s, a) => s.indexOf(text(a[0]!)) },
    slice: {
        args: [1, 2],
        run: (s, a) =>
            a.length === 1 ? s.slice(a[0] as number) : s.slice(a[0] as number, a[1] as number)
    },
    charAt: { args: [1, 1], run: (s, a) => s.charAt(a[0] as number) },
    replace: { args: [2, 2], run: (s, a) => s.replace(text(a[0]!), text(a[1]!)) }
} as Record<string, StringMethod>));

/**
 * A failure the learner should read.
 *
 * CARRIES A TYPE NAME, because `error-types` is defined as telling from the
 * name what kind of thing went wrong. Until this topic every failure here was
 * an untyped sentence, which made that concept unteachable on its own
 * interpreter -- the game would have been naming categories it never used.
 *
 * The names are the real ones and are chosen the way JavaScript chooses them:
 * reaching into nothing or using a value as the wrong kind of thing is a
 * TypeError, a name that was never declared is a ReferenceError, and running
 * away is a RangeError.
 */
class LittleError extends Error {
    kindName: "Error" | "TypeError" | "ReferenceError" | "RangeError";
    trace: string[];

    constructor(
        message: string,
        kindName: "Error" | "TypeError" | "ReferenceError" | "RangeError" = "Error",
        trace: string[] = []
    ) {
        super(message);
        this.kindName = kindName;
        this.trace = trace;
    }
}

/**
 * A value the LEARNER threw, as opposed to a failure the interpreter raised.
 *
 * Carried as its own exception so that `throw 1` and `throw new Error("x")`
 * both arrive at `catch` as whatever was actually thrown -- which is what
 * JavaScript does, and what makes `catch (e) { e.message }` worth being
 * careful about.
 */
class Thrown extends Error {
    value: LittleValue;
    trace: string[];

    constructor(value: LittleValue, trace: string[] = []) {
        super("thrown");
        this.value = value;
        this.trace = trace;
    }
}

function tokenise(src: string): Tok[] {
    const toks: Tok[] = [];
    let i = 0;

    while (i < src.length) {
        const c = src[i]!;

        if (/\s/.test(c)) {
            i += 1;
            continue;
        }

        // Comments are allowed and ignored: a learner pasting a hint back in
        // should not be an error.
        if (c === "/" && src[i + 1] === "/") {
            while (i < src.length && src[i] !== "\n") i += 1;
            continue;
        }

        if (c === '"' || c === "'") {
            const quote = c;
            let out = "";
            i += 1;

            while (i < src.length && src[i] !== quote) {
                if (src[i] === "\\" && i + 1 < src.length) {
                    out += src[i + 1];
                    i += 2;
                    continue;
                }
                out += src[i];
                i += 1;
            }

            if (i >= src.length) {
                throw new LittleError(
                    `That text is missing its closing ${quote === '"' ? "double" : "single"} quote.`
                );
            }

            i += 1;
            toks.push({ k: "str", v: out });
            continue;
        }

        if (c === "`") {
            // A template literal is accepted even though the curriculum has not
            // reached it yet, and that is a deliberate exception to the
            // refuse-what-was-not-taught rule.
            //
            // The rule exists so a learner is never silently credited for
            // something nobody taught them. A learner who TYPES `Fuel: ${fuel}`
            // already knows the form -- refusing their working answer teaches
            // nothing and reads as the tool being broken. And the evidence the
            // mission actually wants is unaffected: ${fuel} reads the name,
            // exactly as "Fuel: " + fuel does.
            //
            // Desugared into the same tokens a join produces, so everything
            // downstream -- including which names were read -- is identical.
            i += 1;
            const pieces: Tok[] = [];
            let text = "";

            const flush = () => {
                if (pieces.length > 0) pieces.push({ k: "punc", v: "+" });
                pieces.push({ k: "str", v: text });
                text = "";
            };

            while (i < src.length && src[i] !== "`") {
                if (src[i] === "\\" && i + 1 < src.length) {
                    text += src[i + 1];
                    i += 2;
                    continue;
                }

                if (src[i] === "$" && src[i + 1] === "{") {
                    flush();
                    i += 2;

                    let depth = 1;
                    let inner = "";

                    while (i < src.length && depth > 0) {
                        if (src[i] === "{") depth += 1;
                        if (src[i] === "}") {
                            depth -= 1;
                            if (depth === 0) break;
                        }
                        inner += src[i];
                        i += 1;
                    }

                    if (depth !== 0) throw new LittleError("That ${ ... } is missing its closing brace.");

                    i += 1;
                    pieces.push({ k: "punc", v: "+" }, { k: "punc", v: "(" });
                    pieces.push(...tokenise(inner));
                    pieces.push({ k: "punc", v: ")" });
                    continue;
                }

                text += src[i];
                i += 1;
            }

            if (i >= src.length) throw new LittleError("That text is missing its closing backtick.");

            i += 1;
            flush();

            // Wrapped, so it composes with whatever surrounds it.
            toks.push({ k: "punc", v: "(" }, ...pieces, { k: "punc", v: ")" });
            continue;
        }

        if (/[0-9]/.test(c)) {
            let out = "";
            while (i < src.length && /[0-9.]/.test(src[i]!)) {
                out += src[i];
                i += 1;
            }

            const n = Number(out);

            if (!Number.isFinite(n)) throw new LittleError(`${out} is not a number I can read.`);

            toks.push({ k: "num", v: n });
            continue;
        }

        if (/[A-Za-z_$]/.test(c)) {
            let out = "";
            while (i < src.length && /[A-Za-z0-9_$]/.test(src[i]!)) {
                out += src[i];
                i += 1;
            }

            const notYet = NOT_YET.get(out);

            if (notYet) throw new LittleError(notYet);

            if (BOOLEANS.has(out)) {
                toks.push({ k: "bool", v: out === "true" });
                continue;
            }

            if (NOTHINGS.has(out)) {
                // `?? null` would turn `undefined` into `null` -- the Map
                // holds undefined as a real value, so it is read by key.
                toks.push({ k: "nothing", v: out === "null" ? null : undefined });
                continue;
            }

            if (out === "function" || out === "return") {
                toks.push({ k: "fn", v: out });
                continue;
            }

            if (out === "if" || out === "else") {
                toks.push({ k: "ctl", v: out });
                continue;
            }

            if (out === "for" || out === "while") {
                toks.push({ k: "loop", v: out });
                continue;
            }

            if (out === "break" || out === "continue") {
                toks.push({ k: "flow", v: out });
                continue;
            }

            if (KEYWORDS.has(out)) {
                toks.push({ k: "kw", v: out as "let" | "const" | "var" });
                continue;
            }

            toks.push({ k: "name", v: out });
            continue;
        }

        if ("=+-*/();.,<>!&|{}?:[]".includes(c)) {
            /*
             * MULTI-CHARACTER OPERATORS, longest first.
             *
             * `===` before `==`, `!==` before `!=`, and both before a bare `=`
             * or `!`, or `a === b` would tokenise as `a == = b`. Comparison is
             * Values #6 and logical operators are Operators #4, so by Control
             * Flow every one of these has been taught.
             */
            const three = src.slice(i, i + 3);
            const two = src.slice(i, i + 2);

            if (two === "?.") {
                toks.push({ k: "punc", v: "?." });
                i += 2;
                continue;
            }

            // `...` before `.`, or spread tokenises as three member accesses.
            if (three === "...") {
                toks.push({ k: "punc", v: "..." });
                i += 3;
                continue;
            }

            if (three === "===" || three === "!==") {
                toks.push({ k: "punc", v: three });
                i += 3;
                continue;
            }

            if (two === "=>") {
                toks.push({ k: "punc", v: "=>" });
                i += 2;
                continue;
            }

            if (["==", "!=", "<=", ">=", "&&", "||"].includes(two)) {
                toks.push({ k: "punc", v: two });
                i += 2;
                continue;
            }
            /*
             * COMPOUND ASSIGNMENT, added when the curriculum reached it.
             *
             * `assignment-operators` is the concept "update a variable using its
             * own current value", and its produce rung asks the learner to write
             * exactly this. Until Operators there was nothing to run, so the
             * grammar did not have it -- which is the rule this file states for
             * itself: it gains a construct when the curriculum teaches it, and
             * not a moment before.
             */
            if ("+-*/".includes(c) && src[i + 1] === "=") {
                toks.push({ k: "punc", v: c + "=" });
                i += 2;
                continue;
            }

            // `==` and `===` are comparison, which belongs to a later topic.
            if (c === "=" && src[i + 1] === "=") {
                throw new LittleError(
                    "`==` compares two values. To change a variable, use a single `=`."
                );
            }

            toks.push({ k: "punc", v: c });
            i += 1;
            continue;
        }

        throw new LittleError(`I do not know what to do with \`${c}\`.`);
    }

    return toks;
}

/* ------------------------------------------------------------------ parse
 *
 * Statements, each one of:
 *
 *     let NAME = EXPR ;          declaration
 *     NAME = EXPR ;              reassignment
 *     console.log( EXPR ) ;      output
 *
 * EXPR is literals and names joined by + - *, left to right with * binding
 * tighter. That is the whole language.
 */

/* ------------------------------------------------------------------ scope
 *
 * A CHAIN OF SCOPES, not one flat table.
 *
 * Until the curriculum reached Scope this was a single `Map` for the whole
 * program, snapshotted and put back around each call. That model answers
 * `variables` and `functions` correctly and it is WRONG about every single
 * thing this topic exists to teach:
 *
 *   - a `let` inside `{ }` leaked out of the block
 *   - an inner `let x` raised "x has already been declared" instead of shadowing
 *   - a function could read THE LOCALS OF ITS CALLER, because the map it saw
 *     was whatever happened to exist at the moment of the call -- dynamic scope
 *   - a function handed back by another function had lost the variables it was
 *     written beside, so a closure could not be built at all
 *
 * A chain, with each function value holding the scope it was WRITTEN in, is
 * the smallest model that is honest about all four.
 */
interface Cell {
    value: LittleValue;
    isConst: boolean;
    /** Put here by the scan that opened this block, not by a line that ran. */
    hoisted?: boolean;
}

interface Scope {
    vars: Map<string, Cell>;
    parent: Scope | null;
    /**
     * Names this block declares with `let`/`const` further down.
     *
     * Collected when the block opens, so that reading one BEFORE its
     * declaration is the temporal dead zone rather than a quiet miss that
     * walks outward and finds an older variable of the same name. That
     * difference IS `hoisting-tdz`.
     */
    pending: Set<string>;
    /** `var` lands on the nearest scope with this set: a function body, or the program. */
    fnBoundary: boolean;
}

/** The pretend page, when the caller supplied one. */
interface Page {
    root: LittleElement;
}

/** The outermost scope, with the one binding that is always there. */
function rootScope(): Scope {
    const scope = newScope(null, true);

    scope.vars.set("this", { value: undefined, isConst: true });

    return scope;
}

function newScope(parent: Scope | null, fnBoundary = false): Scope {
    return { vars: new Map(), parent, pending: new Set(), fnBoundary };
}

/**
 * Reading a property off an object, following the prototype link.
 *
 * TWO PLACES ARE SEARCHED AND THE ORDER IS THE LESSON: the object's own
 * properties first, then the class it was made by, then that class's parent,
 * and so on outwards. `prototypes` is exactly this walk, and `inheritance` is
 * exactly the fact that the walk does not stop at the first class.
 *
 * Shadowing falls out of the order rather than being coded for: an own
 * property with the same name as a method wins because it is found first, and
 * an overriding method in a subclass wins because the subclass is reached
 * before its parent.
 */
function memberOf(obj: LittleObject, name: string): LittleValue {
    if (obj.props.has(name)) return obj.props.get(name);

    for (let cls = obj.from; cls; cls = cls.parent ?? undefined) {
        const method = cls.methods.get(name);

        if (method) return method;
    }

    return undefined;
}

/** What a name refers to here, walking outward. `undefined` when nothing holds it. */
function lookup(scope: Scope | null, name: string): Cell | undefined {
    for (let s: Scope | null = scope; s; s = s.parent) {
        const cell = s.vars.get(name);

        if (cell) return cell;

        if (s.pending.has(name)) {
            throw new LittleError(
                `\`${name}\` is declared further down this block, so it cannot be used yet.`,
                "ReferenceError"
            );
        }
    }

    return undefined;
}

/** The nearest function body, or the program itself. Where `var` goes. */
function fnScope(scope: Scope): Scope {
    let s = scope;

    while (!s.fnBoundary && s.parent) s = s.parent;

    return s;
}

/**
 * Brings a name into being in THIS scope.
 *
 * Only this scope is checked, which is the whole of `shadowing`: an inner
 * `let x` beside an outer `x` is a second, separate variable, and the inner
 * one wins until the block ends.
 */
function declareIn(c: Ctx, name: string, cell: Cell): void {
    if (c.scope.vars.has(name)) {
        throw new LittleError(`\`${name}\` has already been declared.`);
    }

    c.scope.vars.set(name, cell);
    c.scope.pending.delete(name);
    c.declared.push(name);
}

interface Ctx {
    toks: Tok[];
    at: number;
    scope: Scope;
    /**
     * Names whose block has closed.
     *
     * Kept only so that reaching for one can say WHY it is not there. "`b` has
     * not been given a value yet" is true but useless when the learner can see
     * `let b = 2` three lines up; the point of the lesson is that the `}` ended
     * it.
     */
    gone: Set<string>;
    /** Set while a loop body is running, so break and continue have a target. */
    loop: { broke: boolean; continued: boolean } | null;
    /** Set when a `return` has run, until the call that asked for it collects. */
    returning: { value: LittleValue } | null;
    /**
     * How deep inside a suppressed walk we are.
     *
     * A `throw` IS SUPPRESSED TOO, for the same reason a `break` and a
     * `return` are. Two walks reach statements that are not running: the one
     * that measures where a body ends, and the one that consumes a branch that
     * was not taken. Letting a `throw` fire in either meant
     * `if (false) { throw ... }` threw, and `try { throw ... } catch` never
     * reached its own catch -- the measuring walk raised it first.
     */
    suppressed: number;
    /** The pretend page, or null when the program was run without one. */
    page: Page | null;
    /** Set by `stopPropagation()`, read by the dispatch that is in progress. */
    stopped: boolean;
    /** The last top-level expression statement's value, for the playground. */
    lastValue: LittleValue;
    lastValueSet: boolean;
    /**
     * THE EVENT LOOP, as two queues.
     *
     * `micro` is promise work and `macro` is `setTimeout`. The whole of
     * `event-loop` is the rule that connects them: all synchronous code
     * finishes first, then EVERY microtask, and only then the next timer --
     * and any microtask queued while draining goes on the end of the same
     * drain rather than waiting for the next one.
     *
     * A timer carries its delay and the order it was set, because two timers
     * with the same delay run in the order they were written and a learner
     * will try exactly that.
     */
    /** Answers already collected for the awaits in the statement being re-run. */
    awaited: { state: "fulfilled" | "rejected"; value: LittleValue }[];
    awaitAt: number;
    micro: (() => void)[];
    macro: { at: number; seq: number; run: () => void }[];
    timerSeq: number;
    /** How many calls deep, so runaway recursion is named rather than timing out. */
    depth: number;
    /**
     * The calls in progress, outermost first.
     *
     * Kept so that a failure can report WHERE it happened, which is the whole
     * of `stack-traces`. The depth counter above answers "how deep"; this
     * answers "through what", and a learner cannot be asked to read a trace
     * the game has never produced.
     */
    stack: string[];
    out: string[];
    declared: string[];
    reassigned: string[];
    namesUsedInOutput: string[][];
    steps: number;
}

function peek(c: Ctx): Tok | undefined {
    return c.toks[c.at];
}

function eat(c: Ctx, k: Tok["k"], v?: string): Tok {
    const t = c.toks[c.at];

    if (!t || t.k !== k || (v !== undefined && String((t as { v: unknown }).v) !== v)) {
        throw new LittleError(v ? `I expected \`${v}\` here.` : "That line is not finished.");
    }

    c.at += 1;

    return t;
}

/**
 * Runs a callback the way an array method runs one.
 *
 * ONLY AS MANY ARGUMENTS AS IT ASKED FOR, which is the whole reason this
 * exists rather than calling `call` directly. `map` hands its callback the
 * item, the index and the array; almost every callback a learner writes takes
 * just the item. Ordinary calls in this language check their count exactly --
 * `parameters-arguments` is built on that -- so passing three to `(n) => n * 2`
 * would fail with "takes 1 thing, and was given 3" on the first `map` anybody
 * wrote. JavaScript simply ignores the extra ones, and so does this.
 */
function callback(
    c: Ctx,
    fn: LittleValue,
    method: string,
    args: LittleValue[]
): LittleValue {
    if (fn === null || typeof fn !== "object" || fn.kind !== "function") {
        throw new LittleError(
            `\`.${method}()\` needs a function itself inside its brackets, not the result of calling one.`,
                "TypeError"
            );
    }

    const wants = fn.params.some((p) => p.rest) ? args.length : fn.params.length;

    return call(c, fn, args.slice(0, wants));
}

/** How `sort` with no comparator compares: as text, which is Array Methods #6. */
function asText(v: LittleValue): string {
    return v === undefined ? "\uffff" : text(v);
}

interface ArrayMethod {
    args: [number, number];
    /** True when it changes the array it was called on. That IS Arrays #3. */
    mutates: boolean;
    /**
     * Takes the context, because the methods this topic adds CALL THINGS.
     * `map` runs a function once per item, and running anything needs the
     * interpreter -- so a table of pure transformations was not enough any
     * more.
     */
    run: (c: Ctx, a: LittleArray, args: LittleValue[]) => LittleValue;
}

/**
 * The array methods the curriculum has reached, and no others.
 *
 * `map`, `filter`, `reduce`, `forEach`, `find`, `some`, `every`, `flat` and
 * `sort` are ALL array-methods, the next topic, and every one of them is
 * deliberately missing here -- a learner meeting `.map` inside Arrays would be
 * meeting it before the concept that teaches it. `sort` is absent despite
 * `array-mutation`'s own wording naming it, because the concept that teaches
 * sorting is array-methods #6 and its real behaviour (comparing as text) is
 * the whole of what that concept is for.
 *
 * `mutates` is carried per method rather than left implicit, because the one
 * thing Arrays #3 asks a learner to know is which of these change the original
 * and which hand back something new.
 */
const ARRAY_METHODS = new Map<string, ArrayMethod>(Object.entries({
    map: {
        args: [1, 1] as [number, number],
        mutates: false,
        run: (c: Ctx, a: LittleArray, g: LittleValue[]): LittleValue => ({
            kind: "array",
            items: a.items.map((item, i) => callback(c, g[0]!, "map", [item, i, a]))
        })
    },
    /* Returns undefined, deliberately and visibly. Array Methods #2 is
       defined as knowing that it hands nothing back. */
    forEach: {
        args: [1, 1] as [number, number],
        mutates: false,
        run: (c: Ctx, a: LittleArray, g: LittleValue[]): LittleValue => {
            a.items.forEach((item, i) => {
                callback(c, g[0]!, "forEach", [item, i, a]);
            });

            return undefined;
        }
    },
    filter: {
        args: [1, 1] as [number, number],
        mutates: false,
        run: (c: Ctx, a: LittleArray, g: LittleValue[]): LittleValue => ({
            kind: "array",
            items: a.items.filter((item, i) =>
                truthy(callback(c, g[0]!, "filter", [item, i, a]))
            )
        })
    },
    find: {
        args: [1, 1] as [number, number],
        mutates: false,
        run: (c: Ctx, a: LittleArray, g: LittleValue[]): LittleValue =>
            a.items.find((item, i) => truthy(callback(c, g[0]!, "find", [item, i, a])))
    },
    some: {
        args: [1, 1] as [number, number],
        mutates: false,
        run: (c: Ctx, a: LittleArray, g: LittleValue[]): LittleValue =>
            a.items.some((item, i) => truthy(callback(c, g[0]!, "some", [item, i, a])))
    },
    every: {
        args: [1, 1] as [number, number],
        mutates: false,
        run: (c: Ctx, a: LittleArray, g: LittleValue[]): LittleValue =>
            a.items.every((item, i) => truthy(callback(c, g[0]!, "every", [item, i, a])))
    },
    /*
     * With a starting value or without one, because the difference is a real
     * trap: with no seed the FIRST ITEM becomes the accumulator and the walk
     * starts at the second, and on an empty list there is nothing to start
     * from at all.
     */
    reduce: {
        args: [1, 2] as [number, number],
        mutates: false,
        run: (c: Ctx, a: LittleArray, g: LittleValue[]): LittleValue => {
            const seeded = g.length === 2;

            if (!seeded && a.items.length === 0) {
                throw new LittleError(
                    "`.reduce()` on an empty list needs a starting value as its second argument."
                );
            }

            let total: LittleValue = seeded ? g[1]! : a.items[0];

            for (let i = seeded ? 0 : 1; i < a.items.length; i += 1) {
                total = callback(c, g[0]!, "reduce", [total, a.items[i], i, a]);
            }

            return total;
        }
    },
    /*
     * MUTATES, AND RETURNS THE SAME LIST -- `a.sort() === a` is true, which is
     * half of what makes sorting a copy a thing people get wrong.
     *
     * With no comparator it compares AS TEXT, so [10, 9, 1] sorts to
     * [1, 10, 9]. That is not a quirk to hide; it is the concept.
     */
    sort: {
        args: [0, 1] as [number, number],
        mutates: true,
        run: (c: Ctx, a: LittleArray, g: LittleValue[]): LittleValue => {
            if (g.length === 0) {
                a.items.sort((x, y) => (asText(x) < asText(y) ? -1 : asText(x) > asText(y) ? 1 : 0));

                return a;
            }

            a.items.sort((x, y) => {
                const verdict = callback(c, g[0]!, "sort", [x, y]);

                if (typeof verdict !== "number") {
                    throw new LittleError(
                        "A sort comparator has to return a number: negative, zero or positive."
                    );
                }

                return verdict;
            });

            return a;
        }
    },
    flat: {
        args: [0, 1] as [number, number],
        mutates: false,
        run: (_c: Ctx, a: LittleArray, g: LittleValue[]): LittleValue => {
            const depth = g.length === 0 ? 1 : (g[0] as number);
            const pull = (items: LittleValue[], left: number): LittleValue[] =>
                items.flatMap((i) => (isArray(i) && left > 0 ? pull(i.items, left - 1) : [i]));

            return { kind: "array", items: pull(a.items, depth) };
        }
    },
    push: {
        args: [1, 1] as [number, number],
        mutates: true,
        run: (_c: Ctx, a: LittleArray, g: LittleValue[]) => {
            a.items.push(g[0]!);

            return a.items.length;
        }
    },
    pop: {
        args: [0, 0] as [number, number],
        mutates: true,
        run: (_c: Ctx, a: LittleArray) => a.items.pop()
    },
    shift: {
        args: [0, 0] as [number, number],
        mutates: true,
        run: (_c: Ctx, a: LittleArray) => a.items.shift()
    },
    unshift: {
        args: [1, 1] as [number, number],
        mutates: true,
        run: (_c: Ctx, a: LittleArray, g: LittleValue[]) => {
            a.items.unshift(g[0]!);

            return a.items.length;
        }
    },
    /* Two arguments only. The variadic "and insert these" form is a third
       behaviour in one name, and nothing in Arrays needs it. */
    splice: {
        args: [1, 2] as [number, number],
        mutates: true,
        run: (_c: Ctx, a: LittleArray, g: LittleValue[]): LittleValue => {
            const start = g[0] as number;
            const removed =
                g.length === 1
                    ? a.items.splice(start)
                    : a.items.splice(start, g[1] as number);

            return { kind: "array", items: removed };
        }
    },
    slice: {
        args: [0, 2] as [number, number],
        mutates: false,
        run: (_c: Ctx, a: LittleArray, g: LittleValue[]): LittleValue => ({
            kind: "array",
            items:
                g.length === 0
                    ? a.items.slice()
                    : g.length === 1
                      ? a.items.slice(g[0] as number)
                      : a.items.slice(g[0] as number, g[1] as number)
        })
    },
    concat: {
        args: [1, 1] as [number, number],
        mutates: false,
        run: (_c: Ctx, a: LittleArray, g: LittleValue[]): LittleValue => ({
            kind: "array",
            items: a.items.concat(isArray(g[0]!) ? (g[0] as LittleArray).items : [g[0]!])
        })
    },
    indexOf: {
        args: [1, 1] as [number, number],
        mutates: false,
        run: (_c: Ctx, a: LittleArray, g: LittleValue[]) => a.items.indexOf(g[0]!)
    },
    includes: {
        args: [1, 1] as [number, number],
        mutates: false,
        run: (_c: Ctx, a: LittleArray, g: LittleValue[]) => a.items.includes(g[0]!)
    },
    join: {
        args: [0, 1] as [number, number],
        mutates: false,
        run: (_c: Ctx, a: LittleArray, g: LittleValue[]) =>
            a.items.map((i) => (i === null || i === undefined ? "" : text(i)))
                .join(g.length === 0 ? "," : text(g[0]!))
    }
}));

function isPunc(c: Ctx, v: string): boolean {
    const t = peek(c);

    return t !== undefined && t.k === "punc" && t.v === v;
}

function isArray(v: LittleValue): v is LittleArray {
    return v !== null && typeof v === "object" && v.kind === "array";
}

function isObject(v: LittleValue): v is LittleObject {
    return v !== null && typeof v === "object" && v.kind === "object";
}

function isBuiltIn(v: LittleValue): v is LittleBuiltIn {
    return v !== null && typeof v === "object" && v.kind === "builtin";
}

function isThrown(v: LittleValue): v is LittleThrown {
    return v !== null && typeof v === "object" && v.kind === "error";
}

function isPromise(v: LittleValue): v is LittlePromise {
    return v !== null && typeof v === "object" && v.kind === "promise";
}

function isElement(v: LittleValue): v is LittleElement {
    return v !== null && typeof v === "object" && v.kind === "element";
}

/** The four the curriculum names. Anything else is still refused by name. */
const ERROR_KINDS = new Set(["Error", "TypeError", "ReferenceError", "RangeError"]);

/** Nothing to reach through: the two values `?.` exists to stop at. */
function isNothing(v: LittleValue): boolean {
    return v === null || v === undefined;
}

/**
 * How a value looks when PRINTED. Numbers and booleans bare, strings without
 * their quotes, a list in brackets with its strings quoted so that `["1"]` and
 * `[1]` do not look the same on screen.
 */
export function show(v: LittleValue): string {
    if (typeof v === "string") return v;
    if (isArray(v)) {
        return `[${v.items.map((i) => (typeof i === "string" ? `"${i}"` : show(i))).join(", ")}]`;
    }
    if (isPromise(v)) {
        return v.state === "pending"
            ? "Promise { pending }"
            : v.state === "rejected"
              ? `Promise { rejected: ${show(v.value)} }`
              : `Promise { ${show(v.value)} }`;
    }
    if (isElement(v)) {
        const id = v.id ? `#${v.id}` : "";
        const cls = v.classes.length ? `.${v.classes.join(".")}` : "";

        return `<${v.tag}${id}${cls}>`;
    }
    if (isThrown(v)) return `${v.name}: ${v.message}`;
    if (isBuiltIn(v)) {
        if (v.name === "Math") return "Math";
        if (v.name === "Set") return `Set(${v.set!.size}) {${[...v.set!].map((i) => ` ${show(i)}`).join(",")} }`;
        if (v.name === "Map") {
            return `Map(${v.map!.size}) {${[...v.map!].map(([k, val]) => ` ${show(k)} => ${show(val)}`).join(",")} }`;
        }

        return "JSON";
    }
    if (isObject(v)) {
        const pairs = [...v.props].map(
            ([k, val]) => `${k}: ${typeof val === "string" ? `"${val}"` : show(val)}`
        );

        return pairs.length === 0 ? "{}" : `{ ${pairs.join(", ")} }`;
    }
    if (v !== null && typeof v === "object" && v.kind === "function") {
        return `[function ${v.name}]`;
    }

    return String(v);
}

/**
 * How a value reads when JOINED TO TEXT, which is not the same thing.
 *
 * `console.log([1, 2])` shows a list and `"x" + [1, 2]` gives `x1,2` -- real
 * JavaScript does both, and the difference is a genuine surprise rather than
 * an inconsistency to paper over. Nothing in the curriculum is written to
 * depend on it; it is here so that a learner who tries it is not lied to.
 */
function text(v: LittleValue): string {
    if (isObject(v)) return "[object Object]";
    if (isArray(v)) {
        return v.items
            .map((i) => (i === null || i === undefined ? "" : text(i)))
            .join(",");
    }

    return show(v);
}

/**
 * JavaScript's own truthiness, which `truthy-falsy` (Operators #5) teaches.
 *
 * Deliberately the real rule rather than a simplified one: a learner who is
 * told here that empty text is falsy and then finds otherwise has been taught
 * something they must unlearn.
 */
function truthy(v: LittleValue): boolean {
    if (typeof v === "string") return v.length > 0;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "boolean") return v;

    // null and undefined are falsy; a function and a list are objects, and
    // every object is truthy -- including an EMPTY list, which catches people.
    return v !== null && v !== undefined;
}

function primary(c: Ctx, used: string[]): LittleValue {
    const t = peek(c);

    if (!t) throw new LittleError("That line is not finished.");

    /*
     * A NEGATIVE NUMBER.
     *
     * Missing since the beginning and invisible until now, because nothing in
     * the earlier topics wrote one: `-` was only ever the binary operator
     * between two values, so `f(-1)` and `return -1;` both failed with "I
     * expected a value here". It belongs to arithmetic, which Values #3
     * teaches -- "subtraction can cross zero" is in that concept's own
     * explanation.
     */
    if (isPunc(c, "-")) {
        c.at += 1;

        const value = primary(c, used);

        if (typeof value !== "number") {
            throw new LittleError("A minus sign in front only works with numbers.");
        }

        return -value;
    }

    if (t.k === "nothing") {
        c.at += 1;

        return t.v;
    }

    /*
     * An arrow function, in either shape:
     *
     *     (a, b) => a + b        one expression, returned automatically
     *     (a) => { return a; }   a body, like any other function
     *
     * `arrow-functions` is defined as reading and writing both, including the
     * implicit return, so the two are kept distinct rather than one rewritten
     * into the other.
     */
    if (isPunc(c, "(") && arrowAhead(c)) {
        const params = parameterList(c);

        eat(c, "punc", "=>");

        const expressionBodied = !isPunc(c, "{");
        const body = c.at;

        if (expressionBodied) skipExpression(c);
        else skipBlock(c);

        return {
            kind: "function",
            name: "(arrow)",
            params,
            body,
            expression: expressionBodied,
            closure: c.scope,
            isArrow: true
        };
    }

    /*
     * `new Map()` and `new Set()`, and nothing else.
     *
     * `new` left the refused list here because `built-in-collections` is the
     * concept that needs it. It is an allowlist of two rather than a general
     * constructor: classes, prototypes and `this` are a later topic, and a
     * learner who writes `new Thing()` is better told that than handed a
     * half-working object system.
     */
    /*
     * `setTimeout(fn, ms)` — the only way into the macrotask queue.
     *
     * Nothing actually waits. The delay decides ORDER and nothing else, which
     * is what the concept is about: a learner should not sit watching a
     * spinner to find out what `setTimeout(f, 0)` does.
     */
    /*
     * `await` — only where re-running the statement is free of side effects,
     * which is the condition the async driver needs. See runAsyncBody.
     */
    if (t.k === "name" && t.v === "await") {
        c.at += 1;

        const operand = expression(c, used);

        /*
         * Walked but not running -- measuring where a statement ends. A walk
         * that is not executing cannot suspend, for exactly the reason it
         * cannot `break`, `return` or `throw`.
         */
        if (c.suppressed > 0) return postfix(c, undefined, used, "that value");

        if (c.awaitAt < c.awaited.length) {
            // Already settled on an earlier run of this statement: hand back
            // the recorded answer instead of suspending again.
            const got = c.awaited[c.awaitAt]!;

            c.awaitAt += 1;

            if (got.state === "rejected") throw new Thrown(got.value, [...c.stack]);

            return postfix(c, got.value, used, "that value");
        }

        if (!isPromise(operand)) {
            // Awaiting a plain value still waits one turn, exactly as in
            // JavaScript -- which is a real ordering surprise, so it is not
            // smoothed over.
            const wrapped = newPromise();

            settle(c, wrapped, "fulfilled", operand);

            throw new Awaiting(wrapped);
        }

        throw new Awaiting(operand);
    }

    if (t.k === "name" && t.v === "setTimeout") {
        c.at += 1;

        const args = callArgs(c, used);
        const fn = args[0];
        const ms = typeof args[1] === "number" ? args[1] : 0;

        c.timerSeq += 1;
        c.macro.push({
            at: ms,
            seq: c.timerSeq,
            run: () => {
                callback(c, fn, "setTimeout", []);
            }
        });

        return postfix(c, undefined, used, "that timer");
    }

    if (t.k === "name" && t.v === "Promise") {
        c.at += 1;
        eat(c, "punc", ".");

        const what = eat(c, "name").v as string;
        const args = callArgs(c, used);

        if (what === "resolve" || what === "reject") {
            const made = newPromise();

            settle(c, made, what === "resolve" ? "fulfilled" : "rejected", args[0]);

            return postfix(c, made, used, "that promise");
        }

        if (what === "all") {
            /*
             * Waits for every one and rejects the moment any one does, which
             * is `promise-all` word for word. The results keep the order they
             * were given in, not the order they finished -- the single most
             * useful thing about it.
             */
            if (!isArray(args[0])) {
                throw new LittleError("`Promise.all()` needs a list of promises.", "TypeError");
            }

            const given = args[0].items;
            const all = newPromise();
            const results: LittleValue[] = new Array(given.length);
            let left = given.length;

            if (left === 0) settle(c, all, "fulfilled", { kind: "array", items: [] });

            given.forEach((item, i) => {
                const one = isPromise(item) ? item : (() => {
                    const wrapped = newPromise();

                    settle(c, wrapped, "fulfilled", item);

                    return wrapped;
                })();

                follow(c, one, (state, v) => {
                    if (state === "rejected") {
                        settle(c, all, "rejected", v);

                        return;
                    }

                    results[i] = v;
                    left -= 1;

                    if (left === 0) settle(c, all, "fulfilled", { kind: "array", items: results });
                });
            });

            return postfix(c, all, used, "that promise");
        }

        throw new LittleError(
            `\`Promise.${what}()\` is not something we have covered yet.`,
            "TypeError"
        );
    }

    /*
     * `super(...)` and `super.method(...)`.
     *
     * Both mean "the version my parent class has". The first runs the parent's
     * constructor so its share of the setup happens -- which is why a subclass
     * that adds fields still gets the parent's -- and the second runs a
     * parent method the subclass has overridden, which is how `inheritance`
     * lets a learner EXTEND behaviour rather than only replace it.
     *
     * `this` is carried through unchanged in both: there is one object being
     * built or acted on, and the parent is being asked to do its part to it.
     */
    if (t.k === "name" && t.v === "super") {
        c.at += 1;

        const holder = lookup(c.scope, "(super)");
        const parent = holder?.value;

        if (!parent || parent === null || typeof parent !== "object" || parent.kind !== "class") {
            throw new LittleError(
                "`super` only means something inside a class that extends another one."
            );
        }

        const self = lookup(c.scope, "this")?.value;

        if (isPunc(c, "(")) {
            let withCtor: LittleClass | null = parent;

            while (withCtor && !withCtor.ctor) withCtor = withCtor.parent;

            const args = callArgs(c, used);

            if (withCtor?.ctor) call(c, withCtor.ctor, args, self);

            return undefined;
        }

        eat(c, "punc", ".");

        const member = eat(c, "name").v as string;
        let found: LittleFunction | undefined;

        for (let cls: LittleClass | null = parent; cls && !found; cls = cls.parent) {
            found = cls.methods.get(member);
        }

        if (!found) {
            throw new LittleError(
                `\`${parent.name}\` has no \`${member}\` for \`super\` to reach.`
            );
        }

        return postfix(c, call(c, found, callArgs(c, used), self), used, "that result");
    }

    if (t.k === "name" && t.v === "new") {
        c.at += 1;

        const what = eat(c, "name").v as string;

        if (what === "Promise") {
            /*
             * `new Promise((resolve, reject) => ...)`. The function runs
             * STRAIGHT AWAY, synchronously -- which surprises people, and is
             * why `promise-states` asks about it.
             */
            const made = newPromise();
            const args = callArgs(c, used);
            const resolve: LittleFunction = {
                kind: "function", name: "resolve", params: [{ name: "v", fallback: null, rest: false }],
                body: SETTLE_OK, expression: false, closure: c.scope, bound: made
            };
            const reject: LittleFunction = {
                kind: "function", name: "reject", params: [{ name: "v", fallback: null, rest: false }],
                body: SETTLE_NO, expression: false, closure: c.scope, bound: made
            };

            callback(c, args[0], "Promise", [resolve, reject]);

            return postfix(c, made, used, "that promise");
        }

        if (ERROR_KINDS.has(what)) {
            const made = callArgs(c, used);

            return postfix(
                c,
                { kind: "error", name: what, message: made[0] === undefined ? "" : text(made[0]) },
                used,
                "that error"
            );
        }

        /*
         * `new Dog("Rex")` -- a class the learner wrote.
         *
         * Checked BEFORE the allowlist below, so a learner's own class is
         * reached first and the refusal message stays about the built-ins it
         * is really about.
         *
         * Three steps, and they are the three sentences `classes` says: make
         * an empty object, remember what made it, then run the constructor
         * with `this` pointing at it. Nothing is copied onto the object except
         * what the constructor itself puts there.
         */
        const known = lookup(c.scope, what);

        if (known && known.value !== null && typeof known.value === "object" && known.value.kind === "class") {
            const cls = known.value;
            const args = callArgs(c, used);
            const made: LittleObject = { kind: "object", props: new Map(), from: cls };

            /* The nearest constructor up the chain. A subclass that declares
               none behaves as though it passed its arguments straight up,
               which is what JavaScript's implicit constructor does. */
            let withCtor: LittleClass | null = cls;

            while (withCtor && !withCtor.ctor) withCtor = withCtor.parent;

            if (withCtor?.ctor) call(c, withCtor.ctor, args, made);

            return postfix(c, made, used, `that ${cls.name}`);
        }

        if (what !== "Map" && what !== "Set") {
            throw new LittleError(
                `\`new ${what}()\` is not something we have covered yet. So far there are \`new Map()\`, \`new Set()\` and the error types.`
            );
        }

        const args = callArgs(c, used);
        const seed = args[0];

        if (what === "Set") {
            const made: LittleBuiltIn = { kind: "builtin", name: "Set", set: new Set() };

            if (isArray(seed)) for (const item of seed.items) made.set!.add(item);

            return postfix(c, made, used, "that Set");
        }

        const made: LittleBuiltIn = { kind: "builtin", name: "Map", map: new Map() };

        return postfix(c, made, used, "that Map");
    }

    /*
     * AN OBJECT LITERAL.
     *
     * Reached only from EXPRESSION position, which is the whole of how `{` is
     * told apart from a block: a statement that begins with `{` is a block and
     * never arrives here, exactly as in JavaScript.
     */
    if (isPunc(c, "{")) {
        c.at += 1;

        const props = new Map<string, LittleValue>();

        while (!isPunc(c, "}")) {
            /*
             * `{ ...other }` copies another object's properties in, one level
             * deep -- the same shape and the same caveat as `[...list]`, which
             * `array-copy-spread` already taught. It is here because it is the
             * ordinary answer to the bug `object-references` is about.
             */
            if (isPunc(c, "...")) {
                c.at += 1;

                const spread = expression(c, used);

                if (!isObject(spread)) {
                    throw new LittleError("`...` inside braces needs an object to spread.");
                }

                for (const [k, v] of spread.props) props.set(k, v);

                if (isPunc(c, ",")) {
                    c.at += 1;
                    continue;
                }

                break;
            }

            const key =
                peek(c)?.k === "str"
                    ? (eat(c, "str").v as string)
                    : (eat(c, "name").v as string);

            /*
             * A METHOD: `{ greet() { ... } }`.
             *
             * WHY THIS SHAPE AND NOT `greet: function () { ... }`. An object
             * could not hold behaviour at all before this -- neither form
             * parsed -- so there was a free choice, and the shorthand is the
             * one worth teaching: it is what modern JavaScript is written in,
             * it is shorter than the alternative, and it is what `class` bodies
             * use, so `methods` and `classes` end up being the same syntax in
             * two places rather than two things to learn.
             *
             * Deliberately NOT an arrow. A method needs the `this` its caller
             * supplies -- that is the entire point of putting behaviour on an
             * object -- and an arrow would silently take the surrounding one
             * instead. The two are different tools and the curriculum teaches
             * them as different tools.
             */
            if (isPunc(c, "(")) {
                const params = parameterList(c);
                const body = c.at;

                // Stored, not walked -- the body runs when the method is
                // called, exactly as a function declaration's does.
                skipBlock(c);

                props.set(key, {
                    kind: "function",
                    name: key,
                    params,
                    body,
                    expression: false,
                    closure: c.scope
                });
            } else {
                eat(c, "punc", ":");
                props.set(key, expression(c, used));
            }

            if (isPunc(c, ",")) {
                c.at += 1;
                continue;
            }

            break;
        }

        eat(c, "punc", "}");

        return postfix(c, { kind: "object", props }, used, "that object");
    }

    /*
     * AN ARRAY LITERAL, with spread.
     *
     * `[...a]` is the whole of `array-copy-spread`: it builds a NEW list whose
     * items are the old one's, which is why pushing to the copy leaves the
     * original alone and why a nested list inside it is still shared.
     */
    if (isPunc(c, "[")) {
        c.at += 1;

        const items: LittleValue[] = [];

        while (!isPunc(c, "]")) {
            if (isPunc(c, "...")) {
                c.at += 1;

                const spread = expression(c, used);

                if (!isArray(spread)) {
                    throw new LittleError("`...` inside brackets needs a list to spread.");
                }

                items.push(...spread.items);
            } else {
                items.push(expression(c, used));
            }

            if (isPunc(c, ",")) {
                c.at += 1;
                continue;
            }

            break;
        }

        eat(c, "punc", "]");

        return postfix(c, { kind: "array", items }, used, "that list");
    }

    // Literals go through postfix too, so `"Tati".length` and `"a".trim()`
    // work on text written directly rather than only on text held by a name.
    if (t.k === "bool" || t.k === "num" || t.k === "str") {
        c.at += 1;

        return postfix(c, t.v, used, t.k === "str" ? "that text" : "that value");
    }

    if (t.k === "name") {
        c.at += 1;

        const cell = lookup(c.scope, t.v);

        if (!cell) {
            throw new LittleError(
                c.gone.has(t.v)
                    ? `\`${t.v}\` was declared inside a \`{ }\` block, so it does not exist out here.`
                    : `\`${t.v}\` has not been given a value yet. Declare it with \`let ${t.v} = ...\` first.`,
                "ReferenceError"
            );
        }

        used.push(t.v);

        /*
         * A NAME FOLLOWED BY BRACKETS IS A CALL. Without them it is the
         * function itself, which is the whole of `functions-as-values`:
         * `shout` is a value you can pass, `shout()` is a result.
         */
        if (isPunc(c, "(")) {
            const fn = cell.value;

            if (fn === null || typeof fn !== "object" || fn.kind !== "function") {
                throw new LittleError(
                    `\`${t.v}\` is not a function, so it cannot be called.`,
                "TypeError"
            );
            }

            c.at += 1;

            const args: LittleValue[] = [];

            if (!isPunc(c, ")")) {
                args.push(expression(c, used));

                while (isPunc(c, ",")) {
                    c.at += 1;
                    args.push(expression(c, used));
                }
            }

            eat(c, "punc", ")");

            return postfix(c, call(c, fn, args), used, t.v);
        }

        return postfix(c, cell.value, used, t.v);
    }

    if (isPunc(c, "(")) {
        c.at += 1;
        const v = expression(c, used);
        eat(c, "punc", ")");

        return postfix(c, v, used, "that value");
    }

    throw new LittleError("I expected a value here.");
}

/**
 * What can follow a value: `.length`, `[i]`, and a method from the allowlist.
 *
 * STRINGS ONLY, which is the whole of what the curriculum has taught. A number
 * or a boolean followed by a dot is refused by name rather than silently
 * producing undefined -- `undefined` is not a value this language has, and a
 * beginner who sees it has learned nothing.
 *
 * There is NO general property access here. `.length` is spelled out, methods
 * come from a fixed table, and anything else is a sentence saying so. That is
 * what keeps `a.constructor` unreachable: not a check, but the absence of any
 * syntax that could express it.
 */
/** The comma-separated values inside a method's brackets. */
function callArgs(c: Ctx, used: string[]): LittleValue[] {
    eat(c, "punc", "(");

    const args: LittleValue[] = [];

    if (!isPunc(c, ")")) {
        args.push(expression(c, used));

        while (isPunc(c, ",")) {
            c.at += 1;
            args.push(expression(c, used));
        }
    }

    eat(c, "punc", ")");

    return args;
}

/**
 * Consumes the rest of a property chain without evaluating any of it.
 *
 * Used when `?.` has already decided the answer is undefined. The tokens must
 * still be stepped over, or everything after them is read as a new statement.
 */
function skipChain(c: Ctx): void {
    for (;;) {
        if (isPunc(c, ".") || isPunc(c, "?.")) {
            c.at += 2;
            continue;
        }

        if (isPunc(c, "[")) {
            let depth = 0;

            do {
                if (isPunc(c, "[")) depth += 1;
                if (isPunc(c, "]")) depth -= 1;

                c.at += 1;
            } while (depth > 0 && c.at < c.toks.length);

            continue;
        }

        if (isPunc(c, "(")) {
            let depth = 0;

            do {
                if (isPunc(c, "(")) depth += 1;
                if (isPunc(c, ")")) depth -= 1;

                c.at += 1;
            } while (depth > 0 && c.at < c.toks.length);

            continue;
        }

        return;
    }
}

function postfix(c: Ctx, value: LittleValue, used: string[], label: string): LittleValue {
    /**
     * The object the CURRENT value was just read off, or undefined.
     *
     * Lives for exactly one step. Set when a property is read from an object,
     * spent by a `(` that immediately follows, and cleared by anything else --
     * which is what makes `person.greet()` and `const g = person.greet; g()`
     * behave differently, as `this-binding` says they must.
     */
    let receiver: LittleValue = undefined;

    for (;;) {
        c.steps += 1;

        if (c.steps > MAX_STEPS) throw new LittleError("That program is doing too much.",
                "RangeError"
            );

        /*
         * `?.` STOPS THE WHOLE REST OF THE CHAIN, not just this one step.
         *
         * `a?.b.c` on a missing `a` gives undefined rather than failing at
         * `.c`, which is the entire reason the operator exists. The remaining
         * steps still have to be CONSUMED so the parser stays in step with the
         * tokens -- they are walked without being evaluated.
         */
        if (isPunc(c, "?.") && isNothing(value)) {
            skipChain(c);

            return undefined;
        }

        // One branch for both, because on a value that IS there `?.` does
        // exactly what a dot does.
        if (isPunc(c, ".") || isPunc(c, "?.")) {
            c.at += 1;

            const name = eat(c, "name").v as string;

            /*
             * NOTHING THERE, said plainly.
             *
             * This used to fall through to "`.city` only works on text, and u
             * is not text" -- which names the wrong thing twice over, because
             * `u` is an object and it is `u.work` that is missing. The
             * suggestion is the point: this is the exact failure `?.` exists
             * for, and the message is where a learner meets it.
             */
            if (isNothing(value)) {
                throw new LittleError(
                    `There is nothing there, so \`.${name}\` cannot be read from it. When a step might be missing, \`?.\` gives undefined instead of failing.`,
                "TypeError"
            );
            }

            /*
             * A PROPERTY THAT IS NOT THERE IS `undefined`, not an error --
             * which is what makes `optional-chaining` worth teaching and what
             * makes a typo in a property name so quiet.
             */
            if (isPromise(value)) {
                const p = value;
                const args = callArgs(c, used);

                if (name === "then") {
                    value = promiseThen(c, p, args[0], args[1]);
                    continue;
                }

                if (name === "catch") {
                    value = promiseThen(c, p, undefined, args[0]);
                    continue;
                }

                if (name === "finally") {
                    /*
                     * Runs either way and changes nothing: the value or the
                     * reason travels on past it untouched, which is the whole
                     * difference between `.finally` and a `.then` that happens
                     * to ignore its argument.
                     */
                    const after = newPromise();

                    follow(c, p, (state, v) => {
                        if (args[0] !== undefined) callback(c, args[0], "finally", []);

                        settle(c, after, state, v);
                    });

                    value = after;
                    continue;
                }

                throw new LittleError(
                    `\`.${name}\` is not something a promise does, as far as we have covered.`,
                    "TypeError"
                );
            }

            if (isElement(value)) {
                value = elementMember(c, value, name, used);
                continue;
            }

            if (isThrown(value)) {
                if (name === "name" || name === "message") {
                    value = value[name];
                    continue;
                }

                throw new LittleError(
                    `An error has a \`name\` and a \`message\`. \`.${name}\` is not something we have covered yet.`,
                    "TypeError"
                );
            }

            if (isBuiltIn(value)) {
                value = builtInMember(c, value, name, used);
                continue;
            }

            if (isObject(value)) {
                /*
                 * THE RECEIVER, held just long enough to reach the `(`.
                 *
                 * `person.greet()` is two steps -- read `greet` off `person`,
                 * then call what came back -- and by the time the call happens
                 * the object is gone unless something keeps it. This is that
                 * something, and it is deliberately cleared by every other
                 * step: `const g = person.greet; g()` must NOT see it, because
                 * the whole of `this-binding` is that those two lines differ.
                 */
                receiver = value;
                value = memberOf(value, name);
                continue;
            }

            if (isArray(value)) {
                if (name === "length") {
                    value = value.items.length;
                    continue;
                }

                const fn = ARRAY_METHODS.get(name);

                if (!fn) {
                    throw new LittleError(
                        `\`.${name}\` is not something we have covered yet.`
                    );
                }

                const list = value;
                const given = callArgs(c, used);
                const [lo, hi] = fn.args;

                if (given.length < lo || given.length > hi) {
                    throw new LittleError(
                        lo === hi
                            ? `\`.${name}()\` takes ${lo} thing${lo === 1 ? "" : "s"} inside the brackets.`
                            : `\`.${name}()\` takes between ${lo} and ${hi} things inside the brackets.`
                    );
                }

                value = fn.run(c, list, given);
                continue;
            }

            if (typeof value !== "string") {
                throw new LittleError(
                    `\`.${name}\` only works on text, and ${label} is not text.`,
                "TypeError"
            );
            }

            if (name === "length") {
                value = value.length;
                continue;
            }

            const method = STRING_METHODS.get(name);

            if (!method) {
                throw new LittleError(`\`.${name}\` is not something we have covered yet.`);
            }

            eat(c, "punc", "(");

            const args: LittleValue[] = [];

            if (!isPunc(c, ")")) {
                args.push(expression(c, used));

                while (isPunc(c, ",")) {
                    c.at += 1;
                    args.push(expression(c, used));
                }
            }

            eat(c, "punc", ")");

            const [min, max] = method.args;

            if (args.length < min || args.length > max) {
                throw new LittleError(
                    min === max
                        ? `\`.${name}()\` takes ${min} thing${min === 1 ? "" : "s"} inside the brackets.`
                        : `\`.${name}()\` takes ${min} or ${max} things inside the brackets.`
                );
            }

            value = method.run(value, args);
            continue;
        }

        /*
         * CALLING A FUNCTION THAT IS NOT HELD BY A NAME.
         *
         * `greet()` is handled where the name is read, but `event.stopPropagation()`
         * and anything else stored on an object reaches here with the function
         * already in hand and a `(` still to come. Without this the line parsed
         * as far as the function and then stopped, reporting that it did not
         * know how to run it.
         */
        if (isPunc(c, "(") && value !== null && typeof value === "object" && value.kind === "function") {
            const fn = value;
            /* Read and spent here: a second call in the same chain is a plain
               call unless it too came off an object. */
            const through = receiver;

            receiver = undefined;
            value = call(c, fn, callArgs(c, used), through);
            continue;
        }

        if (isPunc(c, "[")) {
            c.at += 1;

            const index = expression(c, used);

            eat(c, "punc", "]");

            if (isNothing(value)) {
                throw new LittleError(
                    "There is nothing there, so nothing can be read out of it with `[ ]`.",
                "TypeError"
            );
            }

            /*
             * PAST THE END IS `undefined`, and that is the concept.
             *
             * `array-indexing` is defined as "items are numbered from zero,
             * and an index past the end gives undefined". Raising an error
             * instead would teach the first half and hide the second.
             */
            /*
             * BRACKETS TAKE AN EXPRESSION, which is the half of `object-access`
             * that dot notation cannot do: the key can be worked out while the
             * program runs.
             */
            if (isObject(value)) {
                value = value.props.get(text(index));
                continue;
            }

            if (isArray(value)) {
                if (typeof index !== "number") {
                    throw new LittleError("The position inside the brackets has to be a number.");
                }

                value = value.items[index];
                continue;
            }

            if (typeof value !== "string") {
                throw new LittleError(`Square brackets only work on text, and ${label} is not text.`,
                "TypeError"
            );
            }

            if (typeof index !== "number") {
                throw new LittleError("The position inside the brackets has to be a number.");
            }

            /*
             * OUT OF RANGE IS `undefined`, as it is for a list.
             *
             * This used to raise a sentence instead, and the comment that
             * stood here said why: `undefined` was not a value this language
             * had, so naming the mistake was the honest option "until
             * null-vs-undefined is runnable". It became runnable at Values #8,
             * and Arrays #1 is defined as "an index past the end gives
             * undefined" -- so leaving text alone would have meant answering
             * the same question two different ways in one language.
             */
            value = value[index];
            continue;
        }

        return value;
    }
}

function product(c: Ctx, used: string[]): LittleValue {
    let left = primary(c, used);

    for (;;) {
        const op = isPunc(c, "*") ? "*" : isPunc(c, "/") ? "/" : null;

        if (!op) break;

        c.at += 1;
        const right = primary(c, used);

        if (typeof left !== "number" || typeof right !== "number") {
            throw new LittleError(`\`${op}\` only works with numbers.`);
        }

        if (op === "/" && right === 0) {
            throw new LittleError("Dividing by zero does not give a number.");
        }

        left = op === "*" ? left * right : left / right;
    }

    return left;
}

function additive(c: Ctx, used: string[]): LittleValue {
    let left = product(c, used);

    for (;;) {
        c.steps += 1;

        // Every layer spends from the same budget. See MAX_STEPS: since Loops
        // this is a genuine timeout rather than an input-size guard.
        if (c.steps > MAX_STEPS) throw new LittleError("That program is doing too much.",
                "RangeError"
            );

        if (isPunc(c, "+")) {
            c.at += 1;
            const right = product(c, used);

            // The one place this language is JavaScript-honest about types:
            // text + anything is text, which is exactly what the mission's
            // message relies on.
            left =
                typeof left === "string" || typeof right === "string"
                    ? text(left) + text(right)
                    : (left as number) + (right as number);
            continue;
        }

        if (isPunc(c, "-")) {
            c.at += 1;
            const right = product(c, used);

            if (typeof left !== "number" || typeof right !== "number") {
                throw new LittleError("`-` only works with numbers.");
            }

            left = left - right;
            continue;
        }

        return left;
    }
}

/**
 * Comparison, which `comparison-operators` (Values #6) and `equality`
 * (Operators #3) teach.
 *
 * `==` and `===` are both here because the curriculum teaches the difference
 * between them, and a language that only had one could not show it. `==`
 * compares loosely, exactly as JavaScript does -- being honest about the
 * behaviour is the whole point of the concept.
 */
function comparison(c: Ctx, used: string[]): LittleValue {
    let left = additive(c, used);

    for (;;) {
        const op = [">=", "<=", "===", "!==", "==", "!=", ">", "<"].find((o) => isPunc(c, o));

        if (!op) return left;

        c.at += 1;
        const right = additive(c, used);

        left =
            op === ">" ? (left as number) > (right as number)
            : op === "<" ? (left as number) < (right as number)
            : op === ">=" ? (left as number) >= (right as number)
            : op === "<=" ? (left as number) <= (right as number)
            : op === "===" ? left === right
            : op === "!==" ? left !== right
            // eslint-disable-next-line eqeqeq
            : op === "==" ? left == right
            // eslint-disable-next-line eqeqeq
            : left != right;
    }
}

/**
 * `&&` and `||`, which `logical-operators` (Operators #4) teaches.
 *
 * SHORT-CIRCUITING IS THE CONCEPT, not an optimisation: `compound-conditions`
 * is defined as "predict which parts of a combined condition actually get
 * evaluated". The right side is parsed either way -- the tokens have to be
 * consumed -- but it is only EVALUATED when the left side does not settle the
 * answer, which is what the learner is being asked about.
 *
 * Returns the operand, as JavaScript does, rather than coercing to a boolean.
 */
function logicalAnd(c: Ctx, used: string[]): LittleValue {
    let left = comparison(c, used);

    while (isPunc(c, "&&")) {
        c.at += 1;
        const right = comparison(c, used);

        left = truthy(left) ? right : left;
    }

    return left;
}

function logicalOr(c: Ctx, used: string[]): LittleValue {
    let left = logicalAnd(c, used);

    while (isPunc(c, "||")) {
        c.at += 1;
        const right = logicalAnd(c, used);

        left = truthy(left) ? left : right;
    }

    return left;
}

/**
 * The top of the grammar: a ternary, or anything below it.
 *
 * `ternary` (Control Flow #5) is "a conditional that produces a value", which
 * is the thing that makes it different from an `if`. Both branches are parsed;
 * only the chosen one is evaluated, for the same reason `&&` short-circuits.
 */
function expression(c: Ctx, used: string[]): LittleValue {
    const test = logicalOr(c, used);

    if (!isPunc(c, "?")) {
        return test;
    }

    c.at += 1;
    const whenTrue = expression(c, used);

    eat(c, "punc", ":");

    const whenFalse = expression(c, used);

    return truthy(test) ? whenTrue : whenFalse;
}

/**
 * Runs a `{ ... }` block, or the single statement standing in for one.
 *
 * `run` false walks the same tokens with every effect suppressed, which is what
 * makes the branch not taken cost nothing while still being consumed.
 */

/**
 * Reads a block's declarations BEFORE running a line of it.
 *
 * Three different things are hoisted three different ways, and the differences
 * are the entire content of `hoisting-tdz`:
 *
 *   `var n`        the name exists from the start, holding `undefined`
 *   `function f`   the name exists from the start, already holding the function
 *   `let`/`const`  the name is SPOKEN FOR from the start but cannot be read
 *                  until its line runs -- the temporal dead zone
 *
 * Only this block's own level is scanned. A nested `{ }` is a scope of its
 * own and gets its own scan when it opens, and a `let` inside a `for ( )` head
 * belongs to the loop rather than to the block around it.
 */
/**
 * Reads a function declaration's parameters and body position from the tokens
 * alone, without running anything. Used by the scan above, which happens
 * before any line of the block has run.
 */
function functionShape(c: Ctx, at: number): { params: LittleParam[]; body: number } | null {
    const was = c.at;

    try {
        // Past `function` and the name, then the ordinary parameter parser --
        // one place that knows what a parameter list may contain, so defaults
        // and `...rest` are understood by the scan as well as by the line.
        c.at = at + 2;

        const params = parameterList(c);

        if (!isPunc(c, "{")) return null;

        return { params, body: c.at };
    } catch {
        // A malformed list is a real error, but it belongs to the line that
        // declares the function, not to the scan that ran before it.
        return null;
    } finally {
        c.at = was;
    }
}

function hoist(c: Ctx, from: number): void {
    let depth = 0;
    let parens = 0;

    for (let i = from; i < c.toks.length; i += 1) {
        const t = c.toks[i]!;

        if (t.k === "punc") {
            if (t.v === "{") depth += 1;
            else if (t.v === "}") {
                if (depth === 0) return;

                depth -= 1;
            } else if (t.v === "(") parens += 1;
            else if (t.v === ")") parens -= 1;

            continue;
        }

        if (depth !== 0) continue;

        const next = c.toks[i + 1];

        if (!next || next.k !== "name") continue;

        if (t.k === "kw" && t.v === "var") {
            // Function-scoped, so the parentheses of a `for` head make no
            // difference to where it lands.
            const target = fnScope(c.scope);

            if (!target.vars.has(next.v)) {
                target.vars.set(next.v, { value: undefined, isConst: false });
            }

            continue;
        }

        if (parens !== 0) continue;

        if (t.k === "kw") {
            c.scope.pending.add(next.v);
            continue;
        }

        if (t.k === "fn" && t.v === "function") {
            /*
             * ALREADY HOLDING THE FUNCTION, not a placeholder for one.
             *
             * A function declaration is hoisted whole, which is why calling it
             * on a line ABOVE where it is written works -- and that is half of
             * what `hoisting-tdz` contrasts. Storing only the name here would
             * have made the call fail on "f is not a function", which is the
             * same wrong answer with a more confusing message.
             */
            const shape = functionShape(c, i);

            if (shape && !c.scope.vars.has(next.v)) {
                c.scope.vars.set(next.v, {
                    value: {
                        kind: "function",
                        name: next.v,
                        params: shape.params,
                        body: shape.body,
                        expression: false,
                        closure: c.scope
                    },
                    isConst: true,
                    hoisted: true
                });
            }
        }
    }
}

function block(c: Ctx, run: boolean): void {
    if (isPunc(c, "{")) {
        c.at += 1;

        /*
         * BRACES ARE A SCOPE. A `let` in here is gone when the `}` is reached,
         * which is the difference `block-vs-function-scope` is named after and
         * which this interpreter used to get backwards.
         */
        const outer = c.scope;

        c.scope = newScope(outer);
        hoist(c, c.at);

        try {
            while (!isPunc(c, "}")) {
                c.steps += 1;

                if (c.steps > MAX_STEPS) throw new LittleError("That program is doing too much.",
                "RangeError"
            );
                if (c.at >= c.toks.length) throw new LittleError("That `{` is missing its `}`.");

                if (run) {
                    statement(c);
                } else {
                    suppress(c, () => statement(c));
                }

                // A return stops the rest of this body for the same reason a
                // break does, and at every level up to the call that asked.
                if (run && c.returning) {
                    suppress(c, () => {
                        while (!isPunc(c, "}") && c.at < c.toks.length) statement(c);
                    });
                    break;
                }

                // A break or continue stops the rest of this body. The tokens
                // still have to be consumed so the loop knows where the body
                // ends, which is what the suppressed walk below does.
                if (run && (c.loop?.broke || c.loop?.continued)) {
                    const signal = c.loop;

                    c.loop = null;
                    suppress(c, () => {
                        while (!isPunc(c, "}") && c.at < c.toks.length) statement(c);
                    });
                    c.loop = signal;
                    break;
                }
            }
        } finally {
            for (const name of c.scope.vars.keys()) c.gone.add(name);

            c.scope = outer;
        }

        if (!isPunc(c, "}")) throw new LittleError("That `{` is missing its `}`.");

        c.at += 1;

        return;
    }

    if (run) {
        statement(c);
    } else {
        suppress(c, () => statement(c));
    }
}

/**
 * Walks statements without letting them change anything the learner can see.
 *
 * Output, declarations and reassignments are all restored afterwards, and the
 * variable map is snapshotted rather than aliased. A branch that is not taken
 * must leave no trace -- that is the whole meaning of "not taken".
 */
function suppress(c: Ctx, walk: () => void): void {
    /*
     * The CELLS are copied, not just the map.
     *
     * `new Map(c.vars)` alone shares every cell object, and reassignment
     * mutates the cell rather than replacing it -- so `n = 99` inside a branch
     * that never ran still changed `n`. A snapshot that shares its contents is
     * not a snapshot.
     */
    const chain: { scope: Scope; entries: [string, Cell][]; pending: string[] }[] = [];

    for (let s: Scope | null = c.scope; s; s = s.parent) {
        chain.push({
            scope: s,
            entries: [...s.vars].map(([name, cell]) => [name, { ...cell }] as [string, Cell]),
            pending: [...s.pending]
        });
    }

    const scope = c.scope;
    /*
     * THE LOOP SIGNAL IS SUPPRESSED TOO.
     *
     * A `break` inside a branch that is NOT taken is still walked -- the tokens
     * have to be consumed -- and without this it set the flag anyway, so
     * `if (i === 2) { break; }` broke out on the very first pass whatever `i`
     * was. A statement that did not run cannot signal.
     */
    const loop = c.loop ? { ...c.loop } : null;
    /*
     * THE RETURN SIGNAL IS SUPPRESSED TOO, for the same reason the loop signal
     * is. Once a `return` has fired, the rest of the body is walked to consume
     * its tokens -- and a later `return` in that walk overwrote the value,
     * so a guard clause handed back whatever the happy path said instead of
     * its own answer.
     */
    const returning = c.returning ? { ...c.returning } : null;
    const gone = new Set(c.gone);
    const out = c.out.length;

    c.suppressed += 1;
    const declared = c.declared.length;
    const reassigned = c.reassigned.length;
    const used = c.namesUsedInOutput.length;

    try {
        walk();
    } finally {
        c.suppressed -= 1;
    }

    for (const { scope: s, entries, pending } of chain) {
        s.vars.clear();

        for (const [name, cell] of entries) s.vars.set(name, cell);

        s.pending.clear();

        for (const name of pending) s.pending.add(name);
    }

    c.scope = scope;
    c.gone = gone;
    c.loop = loop;
    c.returning = returning;
    c.out.length = out;
    c.declared.length = declared;
    c.reassigned.length = reassigned;
    c.namesUsedInOutput.length = used;
}

/**
 * Moves the cursor to a punctuation mark, ignoring ones inside brackets.
 *
 * Used to find the boundaries of a for loop's three parts without evaluating
 * them -- the condition and the step have to be RE-run on every pass, so the
 * parser records where they start rather than running them in place.
 */
/**
 * Moves past a balanced `{ ... }` without running any of it.
 *
 * Defining a function stores instructions rather than following them, which is
 * what `function-declaration` says -- and the difference is not cosmetic. The
 * first version walked the body suppressed, which still EXECUTED it: `return`
 * fired with no call to return from, and parameters were read before any
 * argument had been bound. A definition must not run.
 */
function skipBlock(c: Ctx): void {
    if (!isPunc(c, "{")) {
        throw new LittleError("I expected a `{` to start that body.");
    }

    let depth = 0;

    while (c.at < c.toks.length) {
        const t = c.toks[c.at]!;

        if (t.k === "punc" && t.v === "{") depth += 1;
        if (t.k === "punc" && t.v === "}") {
            depth -= 1;
            c.at += 1;

            if (depth === 0) return;

            continue;
        }

        c.at += 1;
    }

    throw new LittleError("That `{` is missing its `}`.");
}

/** The same, for an arrow whose body is a single expression. */
function skipExpression(c: Ctx): void {
    let depth = 0;

    while (c.at < c.toks.length) {
        const t = c.toks[c.at]!;

        if (t.k === "punc") {
            if ("([{".includes(t.v)) depth += 1;
            else if (")]}".includes(t.v)) {
                if (depth === 0) return;
                depth -= 1;
            } else if (depth === 0 && (t.v === ";" || t.v === ",")) return;
        }

        c.at += 1;
    }
}

function skipTo(c: Ctx, mark: string): void {
    let depth = 0;

    while (c.at < c.toks.length) {
        const t = c.toks[c.at]!;

        if (t.k === "punc") {
            if ("([{".includes(t.v)) depth += 1;
            else if (")]}".includes(t.v)) {
                if (depth === 0 && t.v === mark) return;
                depth -= 1;
            } else if (depth === 0 && t.v === mark) return;
        }

        c.at += 1;
    }

    throw new LittleError(`I expected a \`${mark}\` in that loop.`);
}

/** `(a, b)` in a definition: the names, not the values. */
/**
 * Is the bracket at the cursor the start of an arrow's parameter list?
 *
 * `(a + b) * 2` and `(a, b) => a + b` both open with a bracket, so the only way
 * to tell is to look for the `=>` that follows the matching close. Scanned
 * rather than backtracked, because the parser evaluates as it goes and cannot
 * undo what a parenthesised expression would already have done.
 */
function arrowAhead(c: Ctx): boolean {
    let depth = 0;

    for (let i = c.at; i < c.toks.length; i += 1) {
        const t = c.toks[i]!;

        if (t.k !== "punc") continue;

        if (t.v === "(") depth += 1;
        else if (t.v === ")") {
            depth -= 1;

            if (depth === 0) {
                const next = c.toks[i + 1];

                return next?.k === "punc" && next.v === "=>";
            }
        }
    }

    return false;
}

function parameterList(c: Ctx): LittleParam[] {
    eat(c, "punc", "(");

    const params: LittleParam[] = [];

    while (!isPunc(c, ")")) {
        const rest = isPunc(c, "...");

        if (rest) c.at += 1;

        const name = eat(c, "name").v as string;
        let fallback: number | null = null;

        if (isPunc(c, "=")) {
            if (rest) {
                throw new LittleError("A `...` parameter cannot also have a default.");
            }

            c.at += 1;
            fallback = c.at;
            skipExpression(c);
        }

        params.push({ name, fallback, rest });

        if (rest && !isPunc(c, ")")) {
            throw new LittleError("A `...` parameter has to be the last one.");
        }

        if (isPunc(c, ",")) {
            c.at += 1;
            continue;
        }

        break;
    }

    eat(c, "punc", ")");

    return params;
}

/**
 * Runs a function and hands back what it returned.
 *
 * A CALL FRAME, not a fresh world. The function sees the names that existed
 * where it was defined plus its own parameters, and when it finishes the
 * caller's names are restored -- so `parameters-arguments` is demonstrable:
 * changing a parameter inside does not reach out, and a name declared inside
 * does not survive.
 *
 * `undefined` when nothing was returned, which is exactly what
 * `return-values` says happens.
 */
function call(
    c: Ctx,
    fn: LittleFunction,
    args: LittleValue[],
    /**
     * What `this` should be inside the call -- the object the function was
     * reached THROUGH, or undefined for a plain call.
     *
     * THE CALL SITE DECIDES, which is the sentence `this-binding` exists to
     * teach. `person.greet()` and `const g = person.greet; g()` run identical
     * instructions and differ only here, so the receiver has to arrive as an
     * argument to the call rather than be stored on the function.
     */
    thisArg: LittleValue = undefined
): LittleValue {
    /*
     * A CALL IN CODE THAT IS NOT RUNNING DOES NOT RUN.
     *
     * The fifth and worst case of the rule this file keeps relearning -- after
     * `break`, `return`, `throw` and `await`. Two walks reach code that is not
     * executing: measuring where a body ends, and consuming the rest of a
     * block after a `return`. Both still EVALUATED, so a call was made.
     *
     * For an ordinary function that was invisible, because `suppress` puts the
     * scope back afterwards. For a RECURSIVE one it was fatal: reaching the
     * base case set `returning`, the block then walked the remaining
     * `return down(n - 1);` to consume its tokens, and that walk called `down`
     * again -- which recursed until the depth guard stopped it. Recursion has
     * never worked in Jolt, and this is why.
     */
    if (c.suppressed > 0) return undefined;

    /*
     * An async function hands back a promise and runs its body on the driver,
     * which is what lets `await` inside it suspend.
     */
    if (fn.isAsync) return runAsyncBody(c, fn, args);

    // The functions with no source: they are the interpreter, handed to the
    // learner's code as something callable.
    if (fn.body === STOP_PROPAGATION) {
        c.stopped = true;

        return undefined;
    }

    if (fn.body === SETTLE_OK || fn.body === SETTLE_NO) {
        if (fn.bound) {
            settle(c, fn.bound, fn.body === SETTLE_OK ? "fulfilled" : "rejected", args[0]);
        }

        return undefined;
    }

    if (c.depth >= MAX_DEPTH) {
        throw new LittleError(
            `\`${fn.name}\` is calling itself over and over. A function that calls itself needs a case where it stops.`,
                "RangeError"
            );
    }

    /*
     * ARITY, now that a parameter may be optional or may gather the rest.
     *
     * Required means neither: a default fills a missing argument, and `...`
     * accepts any number including none, so both of those widen what the
     * function will take. That widening IS `default-rest-params`.
     */
    const required = fn.params.filter((p) => !p.rest && p.fallback === null).length;
    const gathers = fn.params.some((p) => p.rest);

    if (args.length < required || (!gathers && args.length > fn.params.length)) {
        throw new LittleError(
            gathers
                ? `\`${fn.name}\` needs at least ${required} thing${required === 1 ? "" : "s"}, and was given ${args.length}.`
                : required === fn.params.length
                  ? `\`${fn.name}\` takes ${required} thing${required === 1 ? "" : "s"}, and was given ${args.length}.`
                  : `\`${fn.name}\` takes between ${required} and ${fn.params.length} things, and was given ${args.length}.`
        );
    }

    const callerScope = c.scope;
    const callerLoop = c.loop;
    const callerAt = c.at;

    /*
     * The frame hangs off the function's OWN scope, not the caller's.
     *
     * Hanging it off the caller is dynamic scope, and it is what this
     * interpreter used to do: a function could read a local belonging to
     * whoever happened to call it, and a function handed back out of another
     * function could read nothing at all. Parented here, both are right.
     */
    c.scope = newScope(fn.closure, true);

    /*
     * `this` IS AN ORDINARY BINDING IN THE CALL'S SCOPE.
     *
     * Two things fall out of that and both are the curriculum:
     *
     *   an ordinary function gets a fresh one every call, from the call site;
     *   an arrow makes NONE, so reading `this` inside it walks out through the
     *   scope chain to the function the arrow was written in.
     *
     * The second needs no code at all, which is the point -- lexical `this` is
     * the same mechanism as every other lexically scoped name, and writing it
     * as a special case would have taught the wrong thing.
     */
    if (!fn.isArrow) {
        c.scope.vars.set("this", { value: thisArg, isConst: true });
    }

    /* `super` is bound the same way `this` is, and for the same reason: it is
       a property of the call, not of the function object. The parenthesised
       name cannot collide with anything a learner can type. */
    if (fn.owner?.parent) {
        c.scope.vars.set("(super)", { value: fn.owner.parent, isConst: true });
    }

    c.depth += 1;
    c.stack.push(fn.name === "(arrow)" ? "(anonymous)" : fn.name);
    c.loop = null;

    /*
     * Bound in order, and defaults evaluated HERE rather than where the
     * function was written -- in the frame, after the earlier parameters are
     * already in it, which is what lets `(a, b = a + 1)` work and is what
     * JavaScript does.
     */
    fn.params.forEach((p, i) => {
        if (p.rest) {
            c.scope.vars.set(p.name, {
                value: { kind: "array", items: args.slice(i) },
                isConst: false
            });

            return;
        }

        let value = args[i];

        if (value === undefined && p.fallback !== null) {
            const was = c.at;

            c.at = p.fallback;

            try {
                value = expression(c, []);
            } finally {
                c.at = was;
            }
        }

        c.scope.vars.set(p.name, { value, isConst: false });
    });

    c.at = fn.body;

    let result: LittleValue;

    try {
        if (fn.expression) {
            // An arrow with no braces returns its one expression.
            result = expression(c, []);
        } else {
            block(c, true);
            result = c.returning ? c.returning.value : undefined;
        }
    } catch (err) {
        /*
         * THE TRACE IS TAKEN HERE, at the deepest frame that saw the failure.
         *
         * A learner's `throw` records the stack where it is written, but a
         * failure the INTERPRETER raises -- which is most of them, and most of
         * what `stack-traces` is about -- is constructed in seventy-odd places
         * that know nothing about the stack. Catching it on the way out of the
         * innermost call is the one place that does, and the frame has not
         * been popped yet because `finally` runs after this.
         *
         * Only the first frame to see it fills it in; the ones above find a
         * trace already there and leave it alone.
         */
        if (err instanceof LittleError && err.trace.length === 0) {
            err.trace = [...c.stack];
        }

        throw err;
    } finally {
        c.returning = null;
        c.depth -= 1;
        c.stack.pop();
        c.loop = callerLoop;
        c.scope = callerScope;
        c.at = callerAt;
    }

    return result;
}

/**
 * Whether a single `=` follows, at the top level, before this statement ends.
 *
 * `a[0] = 9` assigns and `a.push(2)` does not, and both start the same way.
 * Depth is tracked so that the `=` inside `a[f(x = 1)]` -- or any comparison
 * inside an index -- is not mistaken for the one that matters, and `==`,
 * `===`, `!=` and `!==` are skipped because they are comparisons rather than
 * assignments.
 */
function assignsAhead(c: Ctx, from: number): boolean {
    let depth = 0;

    for (let i = from; i < c.toks.length; i += 1) {
        const t = c.toks[i]!;

        if (t.k !== "punc") continue;

        if (t.v === "[" || t.v === "(" || t.v === "{") depth += 1;
        else if (t.v === "]" || t.v === ")" || t.v === "}") depth -= 1;
        else if (t.v === ";" && depth === 0) return false;
        else if (depth === 0 && (t.v === "=" || COMPOUND.has(t.v))) return true;
    }

    return false;
}

/**
 * Walks `a.b[0].c` down to its LAST step and hands back the thing that holds
 * it plus the key to use.
 *
 * Shared by assignment and by `delete`, because both need the container rather
 * than the value: `p.name = "x"` writes into `p`, and `delete p.name` removes
 * from it. Dots and brackets are interchangeable all the way down, because
 * they are interchangeable in the language.
 *
 * The cursor is left just after the chain.
 */
function targetOf(c: Ctx, base: string): { holder: LittleValue; key: LittleValue } {
    const cell = lookup(c.scope, base);

    if (!cell) {
        throw new LittleError(
            c.gone.has(base)
                ? `\`${base}\` was declared inside a \`{ }\` block, so it does not exist out here.`
                : `\`${base}\` has not been declared. Use \`let ${base} = ...\` to create it.`,
                "ReferenceError"
            );
    }

    let holder = cell.value;

    for (;;) {
        const dotted = isPunc(c, ".");
        let key: LittleValue;

        if (dotted) {
            c.at += 1;
            key = eat(c, "name").v as string;
        } else {
            eat(c, "punc", "[");
            key = expression(c, []);
            eat(c, "punc", "]");
        }

        if (isNothing(holder)) {
            throw new LittleError("There is nothing there to reach a property on.",
                "TypeError"
            );
        }

        if (isArray(holder) && dotted) {
            throw new LittleError(
                "A list's items are reached by position, so use `[ ]` rather than a dot."
            );
        }

        if (isArray(holder) && typeof key !== "number") {
            throw new LittleError("The position inside the brackets has to be a number.");
        }

        if (!isPunc(c, ".") && !isPunc(c, "[")) {
            return { holder, key };
        }

        holder = isObject(holder)
            ? holder.props.get(text(key))
            : isArray(holder)
              ? holder.items[key as number]
              : undefined;
    }
}

/**
 * What survives a trip through JSON, which is the whole of `json-shape`.
 *
 * Functions and `undefined` are DROPPED from an object and become `null`
 * inside a list, exactly as `JSON.stringify` does. A Map or a Set comes out as
 * `{}`, which is the other surprise the concept names.
 */
function toJson(v: LittleValue): string | undefined {
    if (typeof v === "string") return JSON.stringify(v);
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (v === null) return "null";
    if (v === undefined) return undefined;

    if (isArray(v)) {
        return `[${v.items.map((i) => toJson(i) ?? "null").join(",")}]`;
    }

    if (isObject(v)) {
        const pairs: string[] = [];

        for (const [k, val] of v.props) {
            const written = toJson(val);

            if (written !== undefined) pairs.push(`${JSON.stringify(k)}:${written}`);
        }

        return `{${pairs.join(",")}}`;
    }

    // A function, a Map or a Set: nothing JSON can carry.
    return isBuiltIn(v) ? "{}" : undefined;
}

function fromJson(v: unknown): LittleValue {
    if (v === null) return null;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;

    if (Array.isArray(v)) {
        return { kind: "array", items: v.map(fromJson) };
    }

    if (typeof v === "object") {
        const props = new Map<string, LittleValue>();

        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
            props.set(k, fromJson(val));
        }

        return { kind: "object", props };
    }

    return undefined;
}

/**
 * `.size`, `.add`, `.get` and the rest, for the three built-ins this topic
 * introduces. An allowlist, like every other member table in this file.
 */
function builtInMember(
    c: Ctx,
    value: LittleBuiltIn,
    name: string,
    used: string[]
): LittleValue {
    if (value.name === "Math") {
        /*
         * The handful a learner reaches for, and no more. `Math.floor` is
         * what makes halving a range expressible, which is the whole of
         * `search-strategies`; the rest are here because a learner who has
         * just met one will try the others in the same breath.
         */
        const args = callArgs(c, used);
        const nums = args.map((a) => {
            if (typeof a !== "number") {
                throw new LittleError(`\`Math.${name}()\` works on numbers.`, "TypeError");
            }

            return a;
        });

        if (name === "floor") return Math.floor(nums[0]!);
        if (name === "ceil") return Math.ceil(nums[0]!);
        if (name === "round") return Math.round(nums[0]!);
        if (name === "abs") return Math.abs(nums[0]!);
        if (name === "min") return Math.min(...nums);
        if (name === "max") return Math.max(...nums);

        throw new LittleError(
            `\`Math.${name}\` is not something we have covered yet.`,
            "TypeError"
        );
    }

    if (value.name === "JSON") {
        const args = callArgs(c, used);

        if (name === "stringify") {
            return toJson(args[0]) ?? undefined;
        }

        if (name === "parse") {
            if (typeof args[0] !== "string") {
                throw new LittleError("`JSON.parse()` needs a piece of text to read.");
            }

            try {
                return fromJson(JSON.parse(args[0]));
            } catch {
                throw new LittleError("That text is not valid JSON, so it could not be read.");
            }
        }

        throw new LittleError(`\`JSON.${name}\` is not something we have covered yet.`);
    }

    if (name === "size") return value.name === "Set" ? value.set!.size : value.map!.size;

    const args = callArgs(c, used);

    if (value.name === "Set") {
        if (name === "add") {
            value.set!.add(args[0]);

            return value;
        }

        if (name === "has") return value.set!.has(args[0]);
        if (name === "delete") return value.set!.delete(args[0]);
    } else {
        if (name === "set") {
            value.map!.set(args[0], args[1]);

            return value;
        }

        if (name === "get") return value.map!.get(args[0]);
        if (name === "has") return value.map!.has(args[0]);
        if (name === "delete") return value.map!.delete(args[0]);
    }

    throw new LittleError(
        `\`.${name}\` is not something a ${value.name} does, as far as we have covered.`
    );
}


/* -------------------------------------------------------------------- page
 *
 * A TINY HTML READER, for fixtures only.
 *
 * Not a browser parser: it understands open tags with `id` and `class`, close
 * tags, text, and self-closing tags. That is everything the DOM concepts show,
 * and anything it does not understand is a mistake in a fixture I wrote rather
 * than something a learner can reach.
 */
function parseHtml(html: string): LittleElement {
    const root: LittleElement = {
        kind: "element",
        tag: "body",
        id: "",
        classes: [],
        text: "",
        children: [],
        parent: null,
        listeners: []
    };
    let at: LittleElement = root;
    let i = 0;

    while (i < html.length) {
        const lt = html.indexOf("<", i);

        if (lt < 0) break;

        const written = html.slice(i, lt).trim();

        if (written) at.text += written;

        const gt = html.indexOf(">", lt);

        if (gt < 0) break;

        const inside = html.slice(lt + 1, gt).trim();

        i = gt + 1;

        if (inside.startsWith("/")) {
            at = at.parent ?? root;
            continue;
        }

        const selfClosing = inside.endsWith("/");
        const body = selfClosing ? inside.slice(0, -1).trim() : inside;
        const tag = body.split(/\s/)[0]!.toLowerCase();
        const id = /id\s*=\s*"([^"]*)"/.exec(body)?.[1] ?? "";
        const classAttr = /class\s*=\s*"([^"]*)"/.exec(body)?.[1] ?? "";
        const made: LittleElement = {
            kind: "element",
            tag,
            id,
            classes: classAttr.split(/\s+/).filter(Boolean),
            text: "",
            children: [],
            parent: at,
            listeners: []
        };

        at.children.push(made);

        if (!selfClosing) at = made;
    }

    return root;
}

/** Every element in the tree, in document order. */
function descendants(el: LittleElement): LittleElement[] {
    return el.children.flatMap((child) => [child, ...descendants(child)]);
}

/**
 * Whether one selector matches one element.
 *
 * `#id`, `.class`, `tag`, and a tag with a class after it. That is what
 * `selecting-elements` is defined as -- "the same way CSS does" -- at the
 * depth the curriculum goes to. A selector it cannot read is named rather
 * than silently matching nothing, because silently matching nothing is the
 * single most confusing thing a selector can do.
 */
function matches(el: LittleElement, selector: string): boolean {
    const parts = selector.trim().match(/^([a-z][\w-]*)?((?:[.#][\w-]+)*)$/i);

    if (!parts) {
        throw new LittleError(
            `\`${selector}\` is not a selector we have covered. Try a tag, \`#an-id\` or \`.a-class\`.`
        );
    }

    if (parts[1] && parts[1].toLowerCase() !== el.tag) return false;

    for (const [, mark, name] of (parts[2] ?? "").matchAll(/([.#])([\w-]+)/g)) {
        if (mark === "#" && el.id !== name) return false;
        if (mark === "." && !el.classes.includes(name!)) return false;
    }

    return true;
}

/**
 * The text of an element and everything under it, which is what `textContent`
 * gives in a browser -- not just the text written directly inside this tag.
 */
function textOf(el: LittleElement): string {
    return el.text + el.children.map(textOf).join("");
}

/**
 * Reading and calling things on an element.
 *
 * An allowlist, like every other member table here. `innerHTML` is absent on
 * purpose: it turns a string into live markup, which is the one DOM feature
 * that would put a hole in a sandbox built on not having one.
 */
function elementMember(
    c: Ctx,
    el: LittleElement,
    name: string,
    used: string[]
): LittleValue {
    if (name === "textContent") return textOf(el);
    if (name === "id") return el.id;
    if (name === "className") return el.classes.join(" ");
    if (name === "tagName") return el.tag.toUpperCase();
    if (name === "parentElement") return el.parent;
    if (name === "children") return { kind: "array", items: [...el.children] };

    if (name === "querySelector" || name === "querySelectorAll") {
        const args = callArgs(c, used);
        const selector = text(args[0]);
        const found = descendants(el).filter((d) => matches(d, selector));

        return name === "querySelector" ? (found[0] ?? null) : { kind: "array", items: found };
    }

    if (name === "addEventListener") {
        const args = callArgs(c, used);

        el.listeners.push({ type: text(args[0]), fn: args[1], capture: args[2] === true });

        return undefined;
    }

    if (name === "click") {
        callArgs(c, used);
        dispatch(c, el, "click");

        return undefined;
    }

    throw new LittleError(
        `\`.${name}\` is not something an element does, as far as we have covered.`,
        "TypeError"
    );
}

/**
 * An event travelling down to the target and back up, which IS `event-order`.
 *
 * The path runs from the target outwards; reversed, it is the way down.
 * Listeners registered with a third argument of `true` run on the capture
 * pass, everything else on the bubble pass, and `stopPropagation()` ends the
 * journey after the current element -- all three exactly as a browser does
 * them, because a learner who is taught otherwise has to unlearn it.
 */
function dispatch(c: Ctx, target: LittleElement, type: string): void {
    const upward: LittleElement[] = [];

    for (let at: LittleElement | null = target; at; at = at.parent) upward.push(at);

    let stopped = false;
    const event: LittleObject = {
        kind: "object",
        props: new Map<string, LittleValue>([["type", type], ["target", target]])
    };
    const stopper: LittleFunction = {
        kind: "function",
        name: "stopPropagation",
        params: [],
        body: STOP_PROPAGATION,
        expression: false,
        closure: c.scope
    };

    event.props.set("stopPropagation", stopper);

    const fire = (el: LittleElement, capture: boolean): void => {
        for (const listener of [...el.listeners]) {
            if (listener.type !== type || listener.capture !== capture) continue;

            event.props.set("currentTarget", el);
            c.stopped = false;
            callback(c, listener.fn, "addEventListener", [event]);

            if (c.stopped) stopped = true;
        }
    };

    for (const el of [...upward].reverse()) {
        if (stopped) return;
        if (el !== target) fire(el, true);
    }

    for (const el of upward) {
        if (stopped) return;

        fire(el, false);
    }
}

/* ------------------------------------------------------------- the event loop
 *
 * Everything here exists so that `event-loop` can be taught as a rule a
 * learner can check rather than a claim they have to take on faith: all
 * synchronous code first, then every microtask, then the next timer.
 */

function newPromise(): LittlePromise {
    return { kind: "promise", state: "pending", value: undefined, waiting: [], watched: false };
}

/** Settles a promise once and queues whatever was waiting on it. */
function settle(c: Ctx, p: LittlePromise, state: "fulfilled" | "rejected", value: LittleValue): void {
    if (p.state !== "pending") return;

    /*
     * Resolving WITH a promise waits for that one instead, which is what makes
     * `.then` chains flatten and what makes an async function returning a
     * promise behave like the promise it returned.
     */
    if (state === "fulfilled" && isPromise(value)) {
        follow(c, value, (s, v) => settle(c, p, s, v));

        return;
    }

    p.state = state;
    p.value = value;

    const waiting = p.waiting;

    p.waiting = [];

    for (const w of waiting) queueReaction(c, p, w);
}

/** Calls back when `p` settles, now or later. Always on the microtask queue. */
function follow(
    c: Ctx,
    p: LittlePromise,
    then: (state: "fulfilled" | "rejected", value: LittleValue) => void
): void {
    p.watched = true;

    const reaction: Reaction = { kind: "raw", then };

    if (p.state === "pending") p.waiting.push(reaction);
    else queueReaction(c, p, reaction);
}

/**
 * Runs one waiting reaction against a settled promise, on the microtask queue,
 * and settles the promise that `.then` handed back.
 */
function queueReaction(c: Ctx, p: LittlePromise, w: Reaction): void {
    if (w.kind === "raw") {
        c.micro.push(() => w.then(p.state as "fulfilled" | "rejected", p.value));

        return;
    }

    c.micro.push(() => {
        const handler = p.state === "fulfilled" ? w.onOk : w.onNo;

        if (handler === null || typeof handler !== "object" || handler.kind !== "function") {
            // No handler for this outcome, so it passes straight through --
            // which is how a rejection travels down a chain looking for a
            // `.catch` and why an unhandled one reaches the end.
            settle(c, w.next, p.state as "fulfilled" | "rejected", p.value);

            return;
        }

        try {
            settle(c, w.next, "fulfilled", callback(c, handler, "then", [p.value]));
        } catch (err) {
            if (err instanceof Thrown) settle(c, w.next, "rejected", err.value);
            else if (err instanceof LittleError) {
                settle(c, w.next, "rejected", {
                    kind: "error",
                    name: err.kindName,
                    message: err.message
                });
            } else throw err;
        }
    });
}

/** `.then(ok, no)` — and `.catch` and `.finally`, which are it in other words. */
function promiseThen(
    c: Ctx,
    p: LittlePromise,
    onOk: LittleValue,
    onNo: LittleValue
): LittlePromise {
    const next = newPromise();

    p.watched = true;

    const reaction: Reaction = { kind: "handlers", onOk, onNo, next };

    if (p.state === "pending") p.waiting.push(reaction);
    else queueReaction(c, p, reaction);

    return next;
}

/**
 * Runs queued work until there is none left.
 *
 * MICROTASKS FIRST AND COMPLETELY. A microtask queued while draining joins the
 * same drain; a timer only gets a turn once the microtask queue is empty. That
 * ordering is the concept, so it is written as the loop rather than left to
 * fall out of how the arrays happen to be used.
 *
 * Timers are run in (delay, order written) order, with no real waiting -- a
 * learner should not sit watching a spinner to find out what `setTimeout(f, 0)`
 * does, and the ORDER is the whole lesson.
 */
function drain(c: Ctx): void {
    let turns = 0;

    for (;;) {
        while (c.micro.length > 0) {
            if ((turns += 1) > MAX_TASKS) {
                throw new LittleError(
                    "This program keeps queueing more work and never finishes.",
                    "RangeError"
                );
            }

            c.micro.shift()!();
        }

        if (c.macro.length === 0) return;

        if ((turns += 1) > MAX_TASKS) {
            throw new LittleError(
                "This program keeps queueing more work and never finishes.",
                "RangeError"
            );
        }

        c.macro.sort((a, b) => a.at - b.at || a.seq - b.seq);
        c.macro.shift()!.run();
    }
}

/**
 * Thrown by `await` when the promise it is waiting on has not settled.
 *
 * NOT AN ERROR -- it is how the interpreter gets back out to the driver that
 * is running an async function body, because this is a tree-walking
 * interpreter and there is no other way to leave the middle of an expression
 * and come back to it.
 */
class Awaiting extends Error {
    promise: LittlePromise;

    constructor(promise: LittlePromise) {
        super("awaiting");
        this.promise = promise;
    }
}

/**
 * Runs the body of an async function, stopping and resuming at each `await`.
 *
 * HOW SUSPENSION WORKS HERE. A real engine keeps the half-finished call frame
 * and returns to it. This interpreter cannot -- the position inside a
 * statement lives on the JavaScript call stack -- so instead a statement that
 * awaits is RE-RUN from its start once the promise settles, with the awaits it
 * already got through handed their recorded answers from `awaited` instead of
 * suspending again.
 *
 * THAT IS ONLY SOUND IF THE RE-RUN IS FREE OF SIDE EFFECTS UP TO THE AWAIT,
 * so `await` is accepted in exactly the places where it is: as a whole
 * statement, or as the value of a declaration or a return. Anywhere else --
 * buried in a condition, in a loop header, halfway through an expression that
 * has already printed something -- it is refused BY NAME rather than quietly
 * replayed, which is the same contract every other unreached construct in this
 * file has.
 *
 * A `try` is driven here rather than handed to `block`, so that the statements
 * inside it are each individually re-runnable and a rejected await lands in
 * the matching `catch`.
 */
function runAsyncBody(c: Ctx, fn: LittleFunction, args: LittleValue[]): LittlePromise {
    const result = newPromise();
    const frame = newScope(fn.closure, true);

    fn.params.forEach((pm, i) => {
        frame.vars.set(pm.name, { value: args[i], isConst: false });
    });

    /* The statements of the body, as token ranges, so each can be re-run. */
    const outer = c.scope;
    const was = c.at;

    c.scope = frame;
    c.at = fn.body;

    const steps = sliceBlock(c);

    c.scope = outer;
    c.at = was;

    let step = 0;
    let awaited: { state: "fulfilled" | "rejected"; value: LittleValue }[] = [];

    const advance = (): void => {
        for (;;) {
            if (step >= steps.length) {
                settle(c, result, "fulfilled", undefined);

                return;
            }

            const savedScope = c.scope;
            const savedAt = c.at;
            const savedLog = c.awaited;
            const savedIdx = c.awaitAt;

            c.scope = frame;
            c.at = steps[step]!.from;
            c.awaited = awaited;
            c.awaitAt = 0;
            c.depth += 1;
            c.stack.push(fn.name === "(arrow)" ? "(anonymous)" : fn.name);

            try {
                while (c.at < steps[step]!.to) statement(c);

                step += 1;
                awaited = [];
            } catch (err) {
                if (err instanceof Awaiting) {
                    const waitingOn = err.promise;

                    follow(c, waitingOn, (state, value) => {
                        awaited.push({ state, value });
                        advance();
                    });

                    return;
                }

                if (err instanceof Thrown) {
                    settle(c, result, "rejected", err.value);

                    return;
                }

                if (err instanceof LittleError) {
                    settle(c, result, "rejected", {
                        kind: "error",
                        name: err.kindName,
                        message: err.message
                    });

                    return;
                }

                throw err;
            } finally {
                c.depth -= 1;
                c.stack.pop();
                c.scope = savedScope;
                c.at = savedAt;
                c.awaited = savedLog;
                c.awaitAt = savedIdx;
            }

            if (c.returning) {
                const value = c.returning.value;

                c.returning = null;
                settle(c, result, "fulfilled", value);

                return;
            }
        }
    };

    advance();

    return result;
}

/**
 * The top-level statements of a `{ }` body, as token ranges.
 *
 * MEASURED BY SCANNING, NOT BY RUNNING. Every other measuring walk in this
 * file executes with everything suppressed, and that is wrong here for the
 * same reason it was wrong for a catch body: the second statement of
 * `const v = await p; console.log(v);` reads a name the first has not created
 * yet, so walking it raised a ReferenceError before the body had run at all.
 */
function sliceBlock(c: Ctx): { from: number; to: number }[] {
    eat(c, "punc", "{");

    const steps: { from: number; to: number }[] = [];

    while (!isPunc(c, "}") && c.at < c.toks.length) {
        const from = c.at;

        skipStatement(c);

        if (c.at === from) break;

        steps.push({ from, to: c.at });
    }

    return steps;
}

/**
 * Steps over one statement without running any of it.
 *
 * A statement ends at a semicolon written outside any brackets, or at the
 * closing brace of a block it opened -- and a block may be followed by `else`,
 * `catch` or `finally`, which continue the same statement rather than starting
 * a new one.
 */
/**
 * Steps over a loop or branch body without running any of it.
 *
 * THE SIXTH TIME THIS FILE HAS LEARNED THE SAME LESSON. Measuring where a body
 * ends used to be done by walking it with everything suppressed -- and a
 * suppressed walk still EVALUATES. That broke `break`, then `return`, then
 * `throw`, then `await`, then recursion, and finally any `let` declared inside
 * a loop body: the walk declared it, `suppress` put the scope back, and the
 * next statement read a name that was now in its own dead zone.
 *
 * Measuring is a question about tokens, so it is answered with tokens.
 */
function skipBody(c: Ctx): void {
    if (isPunc(c, "{")) skipBlock(c);
    else skipStatement(c);
}

function skipStatement(c: Ctx): void {
    let depth = 0;

    while (c.at < c.toks.length) {
        const t = c.toks[c.at]!;

        if (t.k === "punc") {
            if (t.v === "{" || t.v === "(" || t.v === "[") {
                depth += 1;
                c.at += 1;
                continue;
            }

            if (t.v === "}" || t.v === ")" || t.v === "]") {
                if (depth === 0) return; // the brace closing the body we are in

                depth -= 1;
                c.at += 1;

                if (depth === 0 && t.v === "}") {
                    const next = c.toks[c.at];
                    const joins =
                        (next?.k === "ctl" && next.v === "else") ||
                        (next?.k === "name" && (next.v === "catch" || next.v === "finally"));

                    if (joins) continue;

                    return;
                }

                continue;
            }

            if (t.v === ";" && depth === 0) {
                c.at += 1;

                return;
            }
        }

        c.at += 1;
    }
}

/**
 * `function f() { ... }`, with or without `async` in front of it.
 *
 * Shared because the two differ in exactly one thing -- what CALLING it does
 * -- and nothing else. An async function is declared, hoisted and closed over
 * identically; it simply hands back a promise instead of a value.
 */
/**
 * `class Name { constructor(...) { } method() { } }`, with optional `extends`.
 *
 * Read the same way a function declaration is: the bodies are LOCATED and not
 * walked. Defining a class stores instructions; running them is what `new`
 * does. Methods are stored on the class, once -- never copied onto instances,
 * because the whole of `prototypes` is that they are not.
 */
function declareClass(c: Ctx): void {
    const name = eat(c, "name").v as string;
    let parent: LittleClass | null = null;

    if (peek(c)?.k === "name" && peek(c)?.v === "extends") {
        c.at += 1;

        const parentName = eat(c, "name").v as string;
        const cell = lookup(c.scope, parentName);

        if (!cell || cell.value === null || typeof cell.value !== "object" || cell.value.kind !== "class") {
            throw new LittleError(
                `\`${parentName}\` is not a class, so \`${name}\` cannot extend it.`
            );
        }

        parent = cell.value;
    }

    eat(c, "punc", "{");

    const methods = new Map<string, LittleFunction>();
    const owned: LittleFunction[] = [];
    let ctor: LittleFunction | null = null;

    while (!isPunc(c, "}")) {
        const member = eat(c, "name").v as string;
        const params = parameterList(c);
        const body = c.at;

        skipBlock(c);

        const fn: LittleFunction = {
            kind: "function",
            name: member === "constructor" ? name : member,
            params,
            body,
            expression: false,
            closure: c.scope
        };

        /* Filled in below, once the class object exists for it to point at. */
        owned.push(fn);

        if (member === "constructor") ctor = fn;
        else methods.set(member, fn);
    }

    eat(c, "punc", "}");

    const cls: LittleClass = { kind: "class", name, ctor, methods, parent };

    for (const fn of owned) fn.owner = cls;

    declareIn(c, name, { value: cls, isConst: true });
}

function declareFunction(c: Ctx, isAsync: boolean): void {
    const name = eat(c, "name").v as string;
    const params = parameterList(c);
    const body = c.at;

    // Skipped, not walked. Defining a function stores instructions; it does
    // not follow them. See skipBlock.
    skipBlock(c);

    const fn: LittleFunction = {
        kind: "function",
        name,
        params,
        body,
        expression: false,
        closure: c.scope,
        isAsync
    };

    const hoisted = c.scope.vars.get(name);

    if (hoisted?.hoisted) {
        hoisted.value = fn;
        c.declared.push(name);
    } else {
        declareIn(c, name, { value: fn, isConst: true });
    }
}

/**
 * Records what a bare expression statement evaluated to.
 *
 * Only at the top level, and only when actually running: a value computed
 * inside a function, or during a walk that is measuring rather than executing,
 * is not what the learner last asked for.
 */
function noteValue(c: Ctx, value: LittleValue): void {
    if (c.depth > 0 || c.suppressed > 0) return;

    c.lastValue = value;
    c.lastValueSet = true;
}

function statement(c: Ctx): void {
    const t = peek(c);

    if (!t) return;

    /*
     * A `{ }` on its own is a statement, and a scope. Worth supporting for one
     * reason only: it is the shortest way to show that braces are what make a
     * scope, with no `if` or `for` standing next to it taking the credit.
     */
    if (t.k === "punc" && t.v === "{") {
        block(c, true);

        return;
    }

    if (t.k === "kw") {
        const isConst = t.v === "const";
        const isVar = t.v === "var";
        c.at += 1;

        /*
         * DESTRUCTURING, which is a declaration of several names at once.
         *
         * `const { name } = person` and `const [first] = list`. The names are
         * taken literally -- no renaming, no defaults -- because the concept
         * is defined as copying properties out into variables OF THE SAME
         * NAME, and the two extra forms are a different lesson.
         */
        if (isPunc(c, "{") || isPunc(c, "[")) {
            const fromObject = isPunc(c, "{");
            const closing = fromObject ? "}" : "]";
            const names: string[] = [];

            c.at += 1;

            while (!isPunc(c, closing)) {
                names.push(eat(c, "name").v as string);

                if (isPunc(c, ",")) {
                    c.at += 1;
                    continue;
                }

                break;
            }

            eat(c, "punc", closing);
            eat(c, "punc", "=");

            const source = expression(c, []);

            if (fromObject) {
                if (!isObject(source)) {
                    throw new LittleError("`{ }` on the left of an `=` needs an object to pull from.");
                }

                for (const n of names) {
                    declareIn(c, n, { value: source.props.get(n), isConst });
                }
            } else {
                if (!isArray(source)) {
                    throw new LittleError("`[ ]` on the left of an `=` needs a list to pull from.");
                }

                names.forEach((n, i) => {
                    declareIn(c, n, { value: source.items[i], isConst });
                });
            }

            if (isPunc(c, ";")) c.at += 1;

            return;
        }

        const name = eat(c, "name").v as string;

        if (isVar) {
            /*
             * `var` IGNORES BLOCKS. It lands on the nearest function body --
             * the scan when that body opened already put the name there
             * holding `undefined` -- and this line only fills in a value.
             *
             * Which is also why a second `var n` is not an error the way a
             * second `let n` is: there was only ever one binding to begin
             * with.
             */
            const target = fnScope(c.scope);
            const cell = target.vars.get(name) ?? { value: undefined, isConst: false };

            target.vars.set(name, cell);

            if (isPunc(c, "=")) {
                c.at += 1;
                cell.value = expression(c, []);
            }

            c.declared.push(name);

            if (isPunc(c, ";")) c.at += 1;

            return;
        }

        // `let x;` with no value is legal JavaScript but is not what the
        // mission asks for, and `undefined` is not taught yet.
        eat(c, "punc", "=");
        const value = expression(c, []);

        declareIn(c, name, { value, isConst });

        if (isPunc(c, ";")) c.at += 1;

        return;
    }

    /* `async function f() { ... }` — the word only marks what the call does. */
    if (t.k === "name" && t.v === "async") {
        const next = c.toks[c.at + 1];

        if (next?.k === "fn" && next.v === "function") {
            c.at += 1;

            c.at += 1;
            declareFunction(c, true);

            return;
        }
    }

    if (t.k === "fn" && t.v === "function") {
        c.at += 1;
        declareFunction(c, false);

        return;
    }

    /* `class Name { ... }` -- a declaration, like `function`, and hoisted the
       same way nothing else here is: read where it is written. */
    if (t.k === "name" && t.v === "class") {
        c.at += 1;
        declareClass(c);

        return;
    }

    if (t.k === "fn" && t.v === "return") {
        if (c.depth === 0) {
            throw new LittleError("`return` only means something inside a function.");
        }

        c.at += 1;

        // `return;` with nothing after it hands back undefined, which is also
        // what a function with no return at all gives.
        const value = isPunc(c, ";") || isPunc(c, "}") ? undefined : expression(c, []);

        if (isPunc(c, ";")) c.at += 1;

        c.returning = { value };

        return;
    }

    if (t.k === "loop") {
        const kind = t.v;

        c.at += 1;
        eat(c, "punc", "(");

        /*
         * THE LOOP HEAD IS A SCOPE OF ITS OWN.
         *
         * `for (let i = ...)` declares `i` beside the loop, not in the block
         * around it, so `i` is gone afterwards and a nested loop can use the
         * same name without "b has already been declared". Under the old flat
         * map this needed a hand-kept set of outer names and a cleanup pass;
         * a scope does it by existing.
         */
        const beforeLoop = c.scope;

        c.scope = newScope(beforeLoop);

        /*
         * A for loop is its three parts, and they run at different times:
         * the setup once, the condition before every pass, and the step after
         * every pass. `for-loop-anatomy` is defined as exactly that, so the
         * parser keeps them apart rather than desugaring into a while.
         */
        /*
         * `for (const x of list)` and `for (const k in object)`.
         *
         * A different shape from the three-part head, and told apart by
         * looking two tokens in: a declaration followed by the word `of` or
         * `in`. Handled here rather than desugared into a counting loop,
         * because `for-of-for-in` is defined as choosing between these forms
         * -- rewriting one into the other would teach that they are the same.
         */
        const walkWord = c.toks[c.at + 1]?.k === "name" ? c.toks[c.at + 2] : undefined;

        if (
            kind === "for" &&
            peek(c)?.k === "kw" &&
            walkWord?.k === "name" &&
            (walkWord.v === "of" || walkWord.v === "in")
        ) {
            const overValues = walkWord.v === "of";

            c.at += 1;

            const name = eat(c, "name").v as string;

            c.at += 1;

            const subject = expression(c, []);

            eat(c, "punc", ")");

            /*
             * THE NAME IS DECLARED BEFORE THE BODY IS MEASURED.
             *
             * Finding where the body ends means walking it once with
             * everything suppressed -- and that walk still EVALUATES, so
             * `console.log(n)` inside it fails on an undeclared `n`. The
             * three-part `for` gets this for free because its setup runs
             * first; this form has to do it on purpose.
             */
            const beforeLoop = c.scope;

            c.scope = newScope(beforeLoop);
            c.scope.vars.set(name, { value: undefined, isConst: false });

            const body = c.at;

            skipBody(c);

            const after = c.at;
            let series: LittleValue[];

            if (overValues) {
                if (isArray(subject)) series = subject.items;
                else if (typeof subject === "string") series = [...subject];
                else {
                    c.scope = beforeLoop;

                    throw new LittleError(
                        isObject(subject)
                            ? "`for...of` walks a list's values. To walk an object's keys, use `for...in`."
                            : "`for...of` needs a list or some text to walk."
                    );
                }
            } else if (isObject(subject)) {
                series = [...subject.props.keys()];
            } else if (isArray(subject)) {
                // Real JavaScript gives the INDEXES here, as text, which is
                // the trap the concept names.
                series = subject.items.map((_, i) => String(i));
            } else {
                c.scope = beforeLoop;

                throw new LittleError("`for...in` walks the keys of an object.");
            }

            for (const item of series) {
                if (c.out.length > MAX_OUTPUT) {
                    throw new LittleError(
                        `That printed more than ${MAX_OUTPUT} lines. A loop that keeps going is usually a condition that never becomes false.`,
                "RangeError"
            );
                }

                c.steps += 1;

                if (c.steps > MAX_STEPS) throw new LittleError("That program is doing too much.",
                "RangeError"
            );

                c.at = body;
                c.loop = { broke: false, continued: false };

                /*
                 * A FRESH BINDING EACH PASS, as `for (const x of ...)` gives
                 * in real JavaScript -- so a function written in the body
                 * keeps the item that pass had.
                 */
                const head = c.scope;

                c.scope = newScope(head);
                c.scope.vars.set(name, { value: item, isConst: false });

                try {
                    block(c, true);
                } finally {
                    c.scope = head;
                }

                const signal = c.loop;

                c.loop = null;

                if (c.returning) break;
                if (signal?.broke) break;
            }

            c.at = after;
            c.scope = beforeLoop;

            return;
        }

        let setup: number | null = null;
        let condition = 0;
        let step: number | null = null;

        if (kind === "for") {
            setup = c.at;
            statement(c);
            condition = c.at;
            skipTo(c, ";");
            c.at += 1;
            step = c.at;
            skipTo(c, ")");
        } else {
            condition = c.at;
            skipTo(c, ")");
        }

        eat(c, "punc", ")");

        const body = c.at;

        /*
         * Measured with a loop context in place.
         *
         * Finding where the body ends means walking it once with everything
         * suppressed -- and a `break` inside it is a statement like any other,
         * so without a context to break out of it raised "break only means
         * something inside a loop" while measuring code that was perfectly
         * fine.
         */
        skipBody(c);

        const after = c.at;

        /*
         * The loop's own scope, recorded as the names that existed BEFORE it.
         *
         * `for (let b = 0; ...)` declares `b`, and on the next pass of an OUTER
         * loop that same line runs again -- "b has already been declared" the
         * moment two loops were nested. Real JavaScript gives each entry to a
         * loop a fresh binding.
         *
         * Restoring the whole map was the obvious fix and the wrong one: it
         * also reverted variables declared OUTSIDE the loop, so every
         * accumulator came out at its starting value. Only the names the loop
         * introduced are removed.
         */
        let passes = 0;

        for (;;) {
            c.at = condition;

            const keepGoing = truthy(expression(c, []));

            if (!keepGoing) break;

            passes += 1;

            if (c.out.length > MAX_OUTPUT) {
                throw new LittleError(
                    `That printed more than ${MAX_OUTPUT} lines. A loop that keeps going is usually a condition that never becomes false.`,
                "RangeError"
            );
            }

            if (passes > MAX_PASSES) {
                throw new LittleError(
                    "This loop never finishes. Check that its condition eventually becomes false.",
                "RangeError"
            );
            }

            c.steps += 1;

            if (c.steps > MAX_STEPS) throw new LittleError("That program is doing too much.",
                "RangeError"
            );

            c.at = body;
            c.loop = { broke: false, continued: false };

            /*
             * A FRESH BINDING OF THE COUNTER FOR EVERY PASS.
             *
             * `for (let i ...)` gives each pass its own `i` in real
             * JavaScript, so a function written inside the body keeps the
             * value that pass had rather than the one the loop stopped on.
             * `var` has no such thing -- there is only ever the one binding,
             * which is why the same loop written with `var` makes every
             * function agree on the last value. That contrast IS
             * `loop-variable-capture`, and it only exists if the copy below
             * is made.
             */
            const head = c.scope;
            const pass = newScope(head.parent);

            for (const [name, cell] of head.vars) {
                pass.vars.set(name, { ...cell });
            }

            c.scope = pass;

            try {
                block(c, true);
            } finally {
                c.scope = head;
            }

            // Whatever the pass did to the counter is what the step works
            // from, so an `i = i + 1` inside the body still counts.
            for (const [name, cell] of pass.vars) {
                const original = head.vars.get(name);

                if (original && !original.isConst) original.value = cell.value;
            }

            const signal = c.loop;

            c.loop = null;

            if (c.returning) break;
            if (signal?.broke) break;

            if (step !== null) {
                c.at = step;
                statement(c);
            }
        }

        c.at = after;
        c.scope = beforeLoop;

        void setup;

        return;
    }

    if (t.k === "flow") {
        if (!c.loop) {
            throw new LittleError(`\`${t.v}\` only means something inside a loop.`);
        }

        c.at += 1;

        if (isPunc(c, ";")) c.at += 1;

        if (t.v === "break") {
            c.loop.broke = true;
        } else {
            c.loop.continued = true;
        }

        return;
    }

    if (t.k === "ctl") {
        if (t.v === "else") {
            throw new LittleError("This `else` has no `if` above it.");
        }

        c.at += 1;
        eat(c, "punc", "(");

        const test = expression(c, []);

        eat(c, "punc", ")");

        /*
         * BOTH BRANCHES ARE PARSED, only one is RUN.
         *
         * The tokens have to be consumed either way -- skipping them textually
         * would mean re-implementing the parser as a scanner -- so the branch
         * not taken is walked with execution suppressed. `if-else` is defined
         * as "say which branch of a condition will run", and a learner
         * predicting that is predicting exactly this.
         */
        const taken = truthy(test);

        block(c, taken);

        if (peek(c)?.k === "ctl" && (peek(c) as { v: string }).v === "else") {
            c.at += 1;

            // `else if` is an if statement in the else position, which is all
            // an else-if chain has ever been.
            if (peek(c)?.k === "ctl") {
                if (taken) {
                    suppress(c, () => statement(c));
                } else {
                    statement(c);
                }

                return;
            }

            block(c, !taken);
        }

        return;
    }

    if (t.k === "name" && t.v === "console") {
        c.at += 1;
        eat(c, "punc", ".");
        const method = eat(c, "name").v as string;

        if (method !== "log") {
            throw new LittleError(`\`console.${method}\` is not something we have covered yet.`);
        }

        eat(c, "punc", "(");

        const used: string[] = [];
        const parts: string[] = [];

        if (!isPunc(c, ")")) {
            parts.push(show(expression(c, used)));

            while (isPunc(c, ",")) {
                c.at += 1;
                parts.push(show(expression(c, used)));
            }
        }

        eat(c, "punc", ")");

        c.out.push(parts.join(" "));
        c.namesUsedInOutput.push(used);

        if (isPunc(c, ";")) c.at += 1;

        return;
    }

    /*
     * `throw`, which stops everything immediately and hands the value up.
     *
     * Any value may be thrown, exactly as in JavaScript -- `throw "oops"` is
     * legal and unhelpful, and the curriculum says so rather than forbidding
     * it. The trace is captured HERE, while the calls that led to it are still
     * on the stack.
     */
    if (t.k === "name" && t.v === "throw") {
        c.at += 1;

        const value = expression(c, []);

        if (isPunc(c, ";")) c.at += 1;

        // Walked but not running: measuring a body, or consuming a branch
        // that was not taken. Either way nothing is actually thrown.
        if (c.suppressed > 0) return;

        throw new Thrown(value, [...c.stack]);
    }

    /*
     * `delete`, which is the half of `object-mutation` that adding a property
     * does not cover. Reading the property afterwards gives `undefined`, the
     * same answer as a property that was never there -- which is exactly why
     * the concept asks a learner to tell those two apart.
     */
    if (t.k === "name" && t.v === "delete") {
        c.at += 1;

        const base = eat(c, "name").v as string;
        const { holder, key } = targetOf(c, base);

        if (isObject(holder)) {
            holder.props.delete(text(key));
        } else {
            throw new LittleError("`delete` removes a property from an object.");
        }

        c.reassigned.push(base);

        if (isPunc(c, ";")) c.at += 1;

        return;
    }

    /*
     * `try` / `catch` / `finally`.
     *
     * The three parts run at different times and that IS the concept: the try
     * block until something fails, the catch block only if it did, and the
     * finally block either way -- including when the try block returned, which
     * is the part people are surprised by.
     *
     * A failure the INTERPRETER raised is handed to `catch` as an Error object
     * with the right name, so a learner catching a TypeError sees the same
     * thing they would in a browser.
     */
    if (t.k === "name" && t.v === "try") {
        c.at += 1;

        const tryAt = c.at;

        /*
         * MEASURED BY SKIPPING, NOT BY WALKING.
         *
         * Every other block in this file finds its end with a suppressed walk,
         * which still EVALUATES -- and a catch body is written about a value
         * that does not exist until something has failed, so walking
         * `console.log(e.message)` raised a TypeError before the try block had
         * even run. `skipBlock` steps over the tokens without running any of
         * them, which is all the measuring was ever for.
         */
        skipBlock(c);

        const afterTry = c.at;
        let name: string | null = null;
        let catchAt: number | null = null;
        let afterCatch = afterTry;

        if (peek(c)?.k === "name" && (peek(c) as { v: string }).v === "catch") {
            c.at += 1;

            if (isPunc(c, "(")) {
                c.at += 1;
                name = eat(c, "name").v as string;
                eat(c, "punc", ")");
            }

            catchAt = c.at;
            skipBlock(c);
            afterCatch = c.at;
        }

        let finallyAt: number | null = null;
        let afterFinally = afterCatch;

        if (peek(c)?.k === "name" && (peek(c) as { v: string }).v === "finally") {
            c.at += 1;
            finallyAt = c.at;
            skipBlock(c);
            afterFinally = c.at;
        }

        if (catchAt === null && finallyAt === null) {
            throw new LittleError("A `try` needs a `catch` or a `finally` after it.");
        }

        let escaped: unknown = null;

        try {
            c.at = tryAt;
            block(c, true);
        } catch (err) {
            if (!(err instanceof Thrown) && !(err instanceof LittleError)) throw err;

            if (catchAt === null) {
                escaped = err;
            } else {
                const caught: LittleValue =
                    err instanceof Thrown
                        ? err.value
                        : { kind: "error", name: err.kindName, message: err.message };

                c.at = catchAt;

                const outer = c.scope;

                c.scope = newScope(outer);

                if (name) c.scope.vars.set(name, { value: caught, isConst: false });

                try {
                    block(c, true);
                } catch (second) {
                    escaped = second;
                } finally {
                    c.scope = outer;
                }
            }
        }

        if (finallyAt !== null) {
            c.at = finallyAt;
            block(c, true);
        }

        c.at = afterFinally;

        if (escaped) throw escaped;

        return;
    }

    /*
     * A STATEMENT THAT IS JUST AN EXPRESSION.
     *
     * `[1, 2].forEach(...)` on its own line begins with a `[`, and until
     * arrays existed nothing did. Its value is evaluated and dropped, which is
     * what JavaScript does with any expression used as a statement.
     */
    /*
     * A LITERAL, OR A BRACKETED EXPRESSION, ON ITS OWN LINE.
     *
     * `5;`, `"hi";`, `(1 + 2);` -- useless in a program and the first thing
     * anyone types in the Experiment playground, where the whole point is to
     * ask what something evaluates to. Until now only a name or a `[` could
     * begin an expression statement, so a bare literal was "I do not know how
     * to run that line".
     */
    if (t.k === "num" || t.k === "str" || t.k === "bool" || (t.k === "punc" && t.v === "(")) {
        noteValue(c, expression(c, []));

        if (isPunc(c, ";")) c.at += 1;

        return;
    }

    if (t.k === "punc" && t.v === "[") {
        noteValue(c, expression(c, []));

        if (isPunc(c, ";")) c.at += 1;

        return;
    }

    if (t.k === "name") {
        const after = c.toks[c.at + 1];

        /*
         * `x == 5;` is almost always a missing character rather than a
         * comparison thrown away, so it is named before anything else.
         */
        if (after?.k === "punc" && ["==", "===", "!=", "!=="].includes(after.v)) {
            throw new LittleError(
                `\`${after.v}\` compares two values. To change a variable, use a single \`=\`.`
            );
        }

        /*
         * NOT AN ASSIGNMENT, SO AN EXPRESSION.
         *
         * `greet();`, `a.push(2);` and `n * 2;` are all statements whose value
         * is discarded. The last of those is why this is a general case rather
         * than a list: a braced arrow body is full of them -- `(n) => { n * 2; }`
         * is the mistake `map`'s repair rung is ABOUT, and before this it could
         * not be written down, let alone run.
         */
        if (!assignsAhead(c, c.at + 1)) {
            noteValue(c, expression(c, []));

            if (isPunc(c, ";")) c.at += 1;

            return;
        }

        /*
         * An indexed assignment needs the CONTAINER rather than its value,
         * which is what the walk below collects. A plain `name = ...` falls
         * through to the ordinary reassignment path after it.
         */
        if (after?.k === "punc" && (after.v === "[" || after.v === ".")) {
            c.at += 1;

            const { holder, key } = targetOf(c, t.v);

            eat(c, "punc", "=");

            const value = expression(c, []);

            if (isElement(holder)) {
                const prop = text(key);

                if (prop === "textContent") {
                    // Setting it replaces everything inside, children included.
                    holder.text = text(value);
                    holder.children = [];
                } else if (prop === "className") {
                    holder.classes = text(value).split(/\s+/).filter(Boolean);
                } else if (prop === "id") {
                    holder.id = text(value);
                } else {
                    throw new LittleError(
                        `\`.${prop}\` is not something we have covered setting on an element.`,
                        "TypeError"
                    );
                }
            } else if (isObject(holder)) {
                holder.props.set(text(key), value);
            } else if (isArray(holder)) {
                holder.items[key as number] = value;
            } else {
                throw new LittleError(
                    `\`${t.v}\` is not an object or a list, so nothing can be stored on it.`,
                "TypeError"
            );
            }

            c.reassigned.push(t.v);

            if (isPunc(c, ";")) c.at += 1;

            return;
        }

        const name = t.v;
        c.at += 1;

        const op = peek(c);
        const compound =
            op?.k === "punc" && COMPOUND.has(op.v) ? (op.v as string) : null;

        if (compound) {
            c.at += 1;
        } else {
            eat(c, "punc", "=");
        }

        const cell = lookup(c.scope, name);

        if (!cell) {
            throw new LittleError(
                c.gone.has(name)
                    ? `\`${name}\` was declared inside a \`{ }\` block, so it does not exist out here.`
                    : `\`${name}\` has not been declared. Use \`let ${name} = ...\` to create it.`,
                "ReferenceError"
            );
        }

        if (cell.isConst) {
            throw new LittleError(
                `\`${name}\` was declared with \`const\`, so its value cannot be changed. Use \`let\` instead.`
            );
        }

        if (compound) {
            /*
             * `total += 5` is `total = total + 5`, and it is judged as a
             * reassignment because that is what it is. The learner's CURRENT
             * value is the left operand, which is the whole point of the
             * concept -- the name is read and written in one step.
             */
            const right = expression(c, []);
            const left = cell.value;

            if (compound === "+=" && (typeof left === "string" || typeof right === "string")) {
                cell.value = `${text(left)}${text(right)}`;
            } else {
                if (typeof left !== "number" || typeof right !== "number") {
                    throw new LittleError(`\`${compound}\` only works with numbers.`);
                }

                cell.value =
                    compound === "+=" ? left + right
                    : compound === "-=" ? left - right
                    : compound === "*=" ? left * right
                    : right === 0
                      ? (() => {
                            throw new LittleError("Dividing by zero does not give a number.");
                        })()
                      : left / right;
            }
        } else {
            cell.value = expression(c, []);
        }

        c.reassigned.push(name);

        if (isPunc(c, ";")) c.at += 1;

        return;
    }

    throw new LittleError("I do not know how to run that line.");
}

/**
 * Runs a little program and reports both what it printed and what it was made
 * of. Never throws: a broken program is a result with an `error`, because a
 * beginner's mistake is an outcome the mission has something to say about, not
 * an exception the page has to survive.
 */
/**
 * Runs a little program.
 *
 * `html` is a fixture for the DOM topic, and only for it. Without one there is
 * no `document` at all -- reaching for it is a ReferenceError, which is what
 * every other topic should see, and is why the sandbox has stayed free of host
 * objects for eleven topics.
 */
export function runLittleJs(source: string, html?: string): RunResult {
    const c: Ctx = {
        toks: [],
        at: 0,
        /* `this` exists at the top level and refers to nothing, which is what
           a module's `this` does. Bound rather than left absent so that using
           it out there reports the same thing as using it in a plain call --
           "there is nothing there" -- instead of "`this` is not defined",
           which would suggest it was a name the learner forgot to make. */
        scope: rootScope(),
        gone: new Set(),
        stack: [],
        suppressed: 0,
        page: null,
        stopped: false,
        lastValue: undefined,
        lastValueSet: false,
        awaited: [],
        awaitAt: 0,
        micro: [],
        macro: [],
        timerSeq: 0,
        loop: null,
        returning: null,
        depth: 0,
        out: [],
        declared: [],
        reassigned: [],
        namesUsedInOutput: [],
        steps: 0
    };

    try {
        c.toks = tokenise(source);

        // `JSON` is a name the program can read but not declare over, which is
        // what it is in a browser too.
        c.scope.vars.set("JSON", {
            value: { kind: "builtin", name: "JSON" },
            isConst: true
        });
        c.scope.vars.set("Math", {
            value: { kind: "builtin", name: "Math" },
            isConst: true
        });

        if (html !== undefined) {
            c.page = { root: parseHtml(html) };
            c.scope.vars.set("document", { value: c.page.root, isConst: true });
        }

        // The program is a function body as far as `var` is concerned.
        hoist(c, 0);

        while (c.at < c.toks.length) {
            const before = c.at;

            statement(c);

            // A statement that consumed nothing would loop forever.
            if (c.at === before) throw new LittleError("I do not know how to run that line.");
        }

        /*
         * SYNCHRONOUS CODE IS FINISHED. Only now does queued work get a turn,
         * which is the rule `event-loop` teaches -- and running it here rather
         * than inside the loop above is what makes that rule true rather than
         * merely described.
         */
        drain(c);
    } catch (err) {
        /*
         * A value the learner threw and never caught reads the way a browser
         * reports one: the type, then the message.
         */
        if (err instanceof Thrown) {
            const v = err.value;

            return {
                output: c.out,
                error: isThrown(v)
                    ? `Uncaught ${v.name}: ${v.message}`
                    : `Uncaught: ${show(v)}`,
                errorName: isThrown(v) ? v.name : null,
                value: undefined,
                hasValue: false,
                trace: [...err.trace].reverse(),
                declared: c.declared,
                reassigned: c.reassigned,
                namesUsedInOutput: c.namesUsedInOutput
            };
        }

        return {
            output: c.out,
            error: err instanceof LittleError ? err.message : "Something in that program did not run.",
            errorName: err instanceof LittleError ? err.kindName : null,
            value: undefined,
            hasValue: false,
            trace: err instanceof LittleError ? [...err.trace].reverse() : [],
            declared: c.declared,
            reassigned: c.reassigned,
            namesUsedInOutput: c.namesUsedInOutput
        };
    }

    return {
        output: c.out,
        error: null,
        errorName: null,
        trace: [],
        value: c.lastValue,
        hasValue: c.lastValueSet && c.lastValue !== undefined,
        declared: c.declared,
        reassigned: c.reassigned,
        namesUsedInOutput: c.namesUsedInOutput
    };
}
