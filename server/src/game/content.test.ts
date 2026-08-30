import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The curated modern-JavaScript bank, checked by running it.
 *
 * Reading a snippet carefully is not verification. This project has twice
 * shipped content whose declared answer was wrong in a way that survived
 * review -- a Python bug written as JavaScript, and a Bug Hunt option that was
 * the correct answer in disguise -- and both were caught by executing the thing
 * rather than re-reading it. So every question here whose prompt asks what the
 * code produces is EXECUTED, and its real output compared against the option
 * marked correct.
 *
 * Only seed 008 is checked. The older seeds write their options in a different
 * style (quoted values like '"object"' rather than what console.log prints), and
 * retro-fitting one convention onto the other would mean rewriting content this
 * pass was told to leave alone.
 */
const SEED = readFileSync(
    new URL("../../seeds/008_code_blitz_modern_js.sql", import.meta.url),
    "utf8"
);

interface SeedOption {
    text: string;
    correct?: boolean;
}

interface SeedQuestion {
    prompt: string;
    difficulty: number;
    explanation: string;
    options: SeedOption[];
    /** The snippet, i.e. the prompt with its question line removed. */
    code: string;
}

/** Unescapes a PostgreSQL E'...' literal into the string it stands for. */
function unescape(literal: string): string {
    return literal
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\\\/g, "\\")
        .replace(/''/g, "'");
}

function parseSeed(): SeedQuestion[] {
    return SEED.split("SELECT seed_js_question(")
        .slice(1)
        .map((block) => {
            const prompt = /^\s*E'((?:[^']|'')*)'/.exec(block);
            const meta = /',\s*(\d),\s*'((?:[^']|'')*)',/.exec(block);
            const options = /\$j\$([\s\S]*?)\$j\$/.exec(block);

            if (!prompt || !meta || !options) {
                throw new Error(`Unparseable question block: ${block.slice(0, 80)}`);
            }

            const text = unescape(prompt[1]!);

            return {
                prompt: text,
                difficulty: Number(meta[1]),
                explanation: unescape(meta[2]!),
                options: JSON.parse(options[1]!) as SeedOption[],
                code: text.split("\n").slice(1).join("\n").trim()
            };
        });
}

const QUESTIONS = parseSeed();

/**
 * Renders a value the way the options are written.
 *
 * Deliberately not util.inspect: Node prints `[ 1, 2, 3 ]` with padding, and an
 * option that read that way would look wrong to a player. The options use the
 * spacing people actually write, so the comparison has to as well.
 */
function render(value: unknown): string {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return `[${value.map(renderInner).join(", ")}]`;
    if (value === null) return "null";
    if (typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>);

        return entries.length === 0
            ? "{}"
            : `{ ${entries.map(([k, v]) => `${k}: ${renderInner(v)}`).join(", ")} }`;
    }

    return String(value);
}

/** Inside an array or object, strings are quoted -- as console.log shows them. */
function renderInner(value: unknown): string {
    return typeof value === "string" ? `"${value}"` : render(value);
}

/**
 * Runs a snippet and returns what it logged, or the name of what it threw.
 *
 * Async on purpose. Tier 3 asks about execution order, so a snippet may queue a
 * microtask or a zero-delay timer and log from it -- returning the moment the
 * synchronous part finished would silently drop exactly the lines those
 * questions are about, and every one of them would look wrong.
 */
async function run(code: string, joinWith = "\n"): Promise<string> {
    const logged: string[] = [];
    const capture = (...args: unknown[]) => logged.push(args.map(render).join(" "));

    try {
        // eslint-disable-next-line no-new-func
        new Function("console", `"use strict";\n${code}`)({ log: capture });
    } catch (error) {
        return error instanceof Error ? error.constructor.name : String(error);
    }

    // Long enough for the microtask queue to drain and any 0ms timer to fire.
    await new Promise((resolve) => setTimeout(resolve, 25));

    return logged.join(joinWith);
}

/**
 * Questions that state an output, and how their answer is written.
 *
 * "What does this log?" compares against the lines as logged. "In what order
 * does this log?" compares against the same lines joined with commas, which is
 * how the options read -- that phrasing exists for the execution-order
 * questions, where several lines arrive across microtasks and timers.
 *
 * Anything else -- identify the bug, choose the approach -- is a reasoning
 * question with no single runnable output, and is checked structurally only.
 */
const PREDICTIVE = QUESTIONS.filter((q) =>
    /^(What does this log\?|In what order does this log\?)/.test(q.prompt)
).map((q) => ({
    ...q,
    joinWith: q.prompt.startsWith("In what order") ? ", " : "\n"
}));

describe("the bank is worth playing", () => {
    it("has questions", () => {
        expect(QUESTIONS.length).toBeGreaterThan(0);
    });

    it("gives every question a unique prompt, since the seed dedupes on it", () => {
        expect(new Set(QUESTIONS.map((q) => q.prompt)).size).toBe(QUESTIONS.length);
    });

    it("tiers every question between 1 and 4", () => {
        for (const q of QUESTIONS) {
            expect(q.difficulty, q.prompt.slice(0, 40)).toBeGreaterThanOrEqual(1);
            expect(q.difficulty).toBeLessThanOrEqual(4);
        }
    });

    it("uses the whole ladder, not just the middle of it", () => {
        expect(new Set(QUESTIONS.map((q) => q.difficulty))).toEqual(new Set([1, 2, 3, 4]));
    });
});

describe("every question can be answered", () => {
    it("offers exactly one correct option", () => {
        for (const q of QUESTIONS) {
            expect(q.options.filter((o) => o.correct), q.prompt.slice(0, 40)).toHaveLength(1);
        }
    });

    it("offers four options, so a guess is worth 25% and no more", () => {
        for (const q of QUESTIONS) {
            expect(q.options, q.prompt.slice(0, 40)).toHaveLength(4);
        }
    });

    it("never repeats an option within a question", () => {
        for (const q of QUESTIONS) {
            const texts = q.options.map((o) => o.text);

            expect(new Set(texts).size, `${q.prompt.slice(0, 40)}: duplicate option`).toBe(
                texts.length
            );
        }
    });

    it("never leaves an option blank", () => {
        for (const q of QUESTIONS) {
            for (const o of q.options) {
                expect(o.text.trim().length).toBeGreaterThan(0);
            }
        }
    });
});

describe("every question teaches", () => {
    it("explains itself", () => {
        for (const q of QUESTIONS) {
            expect(q.explanation.trim().length, q.prompt.slice(0, 40)).toBeGreaterThan(20);
        }
    });

    it("keeps the explanation to a beat between rounds, not a paragraph", () => {
        for (const q of QUESTIONS) {
            // Matches the CHECK in migration 017.
            expect(q.explanation.length, q.prompt.slice(0, 40)).toBeLessThanOrEqual(400);
        }
    });

    it("never explains by restating the answer and nothing else", () => {
        for (const q of QUESTIONS) {
            const answer = q.options.find((o) => o.correct)!.text.trim();

            expect(
                q.explanation.trim(),
                `${q.prompt.slice(0, 40)}: explanation is just the answer`
            ).not.toBe(answer);
        }
    });
});

/**
 * The check the whole file exists for.
 */
describe("every predicted output is the real output", () => {
    it("has predictive questions to check", () => {
        expect(PREDICTIVE.length).toBeGreaterThan(0);
    });

    it("matches what the code actually does", async () => {
        const wrong: string[] = [];

        for (const q of PREDICTIVE) {
            const expected = q.options.find((o) => o.correct)!.text;
            const actual = await run(q.code, q.joinWith);

            if (actual !== expected) {
                wrong.push(`\n  ${q.code.replace(/\n/g, " ⏎ ")}\n    declared: ${expected}\n    actual:   ${actual}`);
            }
        }

        expect(wrong.join(""), `${wrong.length} question(s) declare the wrong answer:`).toBe("");
    });

    it("offers no distractor that is also what the code does", async () => {
        // A distractor equal to the real output would make two options correct.
        for (const q of PREDICTIVE) {
            const actual = await run(q.code, q.joinWith);

            for (const option of q.options.filter((o) => !o.correct)) {
                expect(
                    option.text,
                    `${q.code.slice(0, 40)}: distractor "${option.text}" is the real output`
                ).not.toBe(actual);
            }
        }
    });
});
