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

/** A value this language can hold. Numbers and strings, and nothing else yet. */
export type LittleValue = string | number;

export interface RunResult {
    /** Lines printed by console.log, in order. */
    output: string[];
    /** A learner-legible message, or null if the program ran. */
    error: string | null;
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
    | { k: "kw"; v: "let" | "const" }
    | { k: "punc"; v: string };

const KEYWORDS = new Set(["let", "const"]);

/**
 * Words that mean something in real JavaScript and nothing here. Naming them
 * individually is what turns "Unexpected token" into a sentence a beginner can
 * act on.
 */
const NOT_YET: Record<string, string> = {
    if: "`if` is not something we have covered yet.",
    else: "`else` is not something we have covered yet.",
    for: "`for` is not something we have covered yet.",
    while: "`while` is not something we have covered yet.",
    function: "Functions are not something we have covered yet.",
    return: "`return` is not something we have covered yet.",
    var: "Use `let` or `const` here.",
    true: "`true` and `false` are not something we have covered yet.",
    false: "`true` and `false` are not something we have covered yet.",
    null: "`null` is not something we have covered yet.",
    undefined: "`undefined` is not something we have covered yet."
};

class LittleError extends Error {}

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
            throw new LittleError("Backticks are not something we have covered yet. Use \" \".");
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

            if (NOT_YET[out]) throw new LittleError(NOT_YET[out]!);
            if (KEYWORDS.has(out)) {
                toks.push({ k: "kw", v: out as "let" | "const" });
                continue;
            }

            toks.push({ k: "name", v: out });
            continue;
        }

        if ("=+-*();.,".includes(c)) {
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

interface Ctx {
    toks: Tok[];
    at: number;
    vars: Map<string, { value: LittleValue; isConst: boolean }>;
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

function isPunc(c: Ctx, v: string): boolean {
    const t = peek(c);

    return t !== undefined && t.k === "punc" && t.v === v;
}

/** Numbers print bare; strings print without their quotes. Same as console.log. */
function show(v: LittleValue): string {
    return typeof v === "number" ? String(v) : v;
}

function primary(c: Ctx, used: string[]): LittleValue {
    const t = peek(c);

    if (!t) throw new LittleError("That line is not finished.");

    if (t.k === "num") {
        c.at += 1;

        return t.v;
    }

    if (t.k === "str") {
        c.at += 1;

        return t.v;
    }

    if (t.k === "name") {
        c.at += 1;

        // A call is only ever console.log, handled in statement(). A name
        // followed by ( or . here is a method or a function, neither taught.
        if (isPunc(c, ".") || isPunc(c, "(")) {
            throw new LittleError(
                `\`${t.v}\` is being used like a function, which is not something we have covered yet.`
            );
        }

        const cell = c.vars.get(t.v);

        if (!cell) {
            throw new LittleError(
                `\`${t.v}\` has not been given a value yet. Declare it with \`let ${t.v} = ...\` first.`
            );
        }

        used.push(t.v);

        return cell.value;
    }

    if (isPunc(c, "(")) {
        c.at += 1;
        const v = expression(c, used);
        eat(c, "punc", ")");

        return v;
    }

    throw new LittleError("I expected a value here.");
}

function product(c: Ctx, used: string[]): LittleValue {
    let left = primary(c, used);

    while (isPunc(c, "*")) {
        c.at += 1;
        const right = primary(c, used);

        if (typeof left !== "number" || typeof right !== "number") {
            throw new LittleError("`*` only works with numbers.");
        }

        left = left * right;
    }

    return left;
}

function expression(c: Ctx, used: string[]): LittleValue {
    let left = product(c, used);

    for (;;) {
        c.steps += 1;

        // The grammar has no loops, so a program here CANNOT spin -- the only
        // unbounded quantity is the length of what was pasted in. 2000 is
        // therefore an input-size guard, and it is roughly twenty times more
        // than any program the curriculum has taught could need.
        if (c.steps > 2_000) throw new LittleError("That program is doing too much.");

        if (isPunc(c, "+")) {
            c.at += 1;
            const right = product(c, used);

            // The one place this language is JavaScript-honest about types:
            // text + anything is text, which is exactly what the mission's
            // message relies on.
            left =
                typeof left === "string" || typeof right === "string"
                    ? show(left) + show(right)
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

function statement(c: Ctx): void {
    const t = peek(c);

    if (!t) return;

    if (t.k === "kw") {
        const isConst = t.v === "const";
        c.at += 1;
        const name = eat(c, "name").v as string;

        if (c.vars.has(name)) {
            throw new LittleError(`\`${name}\` has already been declared.`);
        }

        // `let x;` with no value is legal JavaScript but is not what the
        // mission asks for, and `undefined` is not taught yet.
        eat(c, "punc", "=");
        const value = expression(c, []);

        c.vars.set(name, { value, isConst });
        c.declared.push(name);

        if (isPunc(c, ";")) c.at += 1;

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

    if (t.k === "name") {
        const name = t.v;
        c.at += 1;

        eat(c, "punc", "=");

        const cell = c.vars.get(name);

        if (!cell) {
            throw new LittleError(
                `\`${name}\` has not been declared. Use \`let ${name} = ...\` to create it.`
            );
        }

        if (cell.isConst) {
            throw new LittleError(
                `\`${name}\` was declared with \`const\`, so its value cannot be changed. Use \`let\` instead.`
            );
        }

        cell.value = expression(c, []);
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
export function runLittleJs(source: string): RunResult {
    const c: Ctx = {
        toks: [],
        at: 0,
        vars: new Map(),
        out: [],
        declared: [],
        reassigned: [],
        namesUsedInOutput: [],
        steps: 0
    };

    try {
        c.toks = tokenise(source);

        while (c.at < c.toks.length) {
            const before = c.at;

            statement(c);

            // A statement that consumed nothing would loop forever.
            if (c.at === before) throw new LittleError("I do not know how to run that line.");
        }
    } catch (err) {
        return {
            output: c.out,
            error: err instanceof LittleError ? err.message : "Something in that program did not run.",
            declared: c.declared,
            reassigned: c.reassigned,
            namesUsedInOutput: c.namesUsedInOutput
        };
    }

    return {
        output: c.out,
        error: null,
        declared: c.declared,
        reassigned: c.reassigned,
        namesUsedInOutput: c.namesUsedInOutput
    };
}
