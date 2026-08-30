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
 * Strings are quoted, including at the top level. That is the convention the
 * original bank used and it is the right one, because for a whole class of
 * question the quotes ARE the answer: `1 + "1"` gives `"11"` and `1 + 1` gives
 * `2`, and an option written as a bare 11 cannot tell those apart -- which is
 * the entire point of asking. It also matches what a JavaScript REPL shows.
 *
 * Deliberately not util.inspect: Node prints `[ 1, 2, 3 ]` with padding, and an
 * option that read that way would look wrong to a player. The options use the
 * spacing people actually write, so the comparison has to as well.
 */
function render(value: unknown, quoteStrings = true): string {
    if (typeof value === "string") return quoteStrings ? `"${value}"` : value;
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

/** Inside an array or object a string is always quoted, whatever the top level does. */
const renderInner = (value: unknown): string => render(value, true);

/**
 * Runs a snippet and returns what it logged, or the name of what it threw.
 *
 * Async on purpose. Tier 3 asks about execution order, so a snippet may queue a
 * microtask or a zero-delay timer and log from it -- returning the moment the
 * synchronous part finished would silently drop exactly the lines those
 * questions are about, and every one of them would look wrong.
 */
async function run(code: string, joinWith = "\n", quoteStrings = true): Promise<string> {
    const logged: string[] = [];
    const capture = (...args: unknown[]) =>
        logged.push(args.map((a) => render(a, quoteStrings)).join(" "));

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
    joinWith: q.prompt.startsWith("In what order") ? ", " : "\n",
    /**
     * Order questions do not quote their strings.
     *
     * "What does this log?" is often asking what TYPE came out, so `"11"` and
     * `11` have to look different. "In what order does this log?" is asking
     * about sequence, and its logged values are labels rather than results --
     * `A, D, C, B` is the answer, and `"A", "D", "C", "B"` is the same answer
     * with punctuation in the way.
     */
    quoteStrings: !q.prompt.startsWith("In what order")
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
            const actual = await run(q.code, q.joinWith, q.quoteStrings);

            if (actual !== expected) {
                wrong.push(`\n  ${q.code.replace(/\n/g, " ⏎ ")}\n    declared: ${expected}\n    actual:   ${actual}`);
            }
        }

        expect(wrong.join(""), `${wrong.length} question(s) declare the wrong answer:`).toBe("");
    });

    it("offers no distractor that is also what the code does", async () => {
        // A distractor equal to the real output would make two options correct.
        for (const q of PREDICTIVE) {
            const actual = await run(q.code, q.joinWith, q.quoteStrings);

            for (const option of q.options.filter((o) => !o.correct)) {
                expect(
                    option.text,
                    `${q.code.slice(0, 40)}: distractor "${option.text}" is the real output`
                ).not.toBe(actual);
            }
        }
    });
});

/**
 * The backfill, checked against the seeds it claims to update.
 *
 * Seed 009 matches questions by prompt text. A typo in one of those prompts
 * would not fail anything at runtime -- the UPDATE would simply match no rows,
 * and that question would keep a NULL tier and no explanation, which shows up as
 * a question that silently teaches nothing. So every prompt named there is
 * checked against the prompts that actually exist, and every surviving question
 * is checked for coverage.
 */
const OLD_SEEDS = ["001_code_blitz_questions.sql", "003_code_blitz_expansion.sql"]
    .map((name) => readFileSync(new URL(`../../seeds/${name}`, import.meta.url), "utf8"))
    .join("\n");

const BACKFILL = readFileSync(
    new URL("../../seeds/009_code_blitz_backfill.sql", import.meta.url),
    "utf8"
);

/** Prompts as seed_question() wrote them -- the first string literal of each call. */
function originalPrompts(): Set<string> {
    const prompts = new Set<string>();

    for (const block of OLD_SEEDS.split("SELECT seed_question(").slice(1)) {
        const literal = /^\s*(E?'(?:[^']|'')*')/.exec(block);

        if (literal) prompts.add(literal[1]!);
    }

    return prompts;
}

/** The prompt literal each backfill or retire call targets. */
function targeted(fn: string): string[] {
    return BACKFILL.split(`SELECT ${fn}(`)
        .slice(1)
        .map((block) => {
            const literal = /^\s*(E?'(?:[^']|'')*')/.exec(block);

            if (!literal) throw new Error(`Unparseable ${fn} call: ${block.slice(0, 60)}`);

            return literal[1]!;
        });
}

const ORIGINALS = originalPrompts();
const BACKFILLED = targeted("backfill_question");
const RETIRED = targeted("retire_question");

describe("the backfill reaches the questions it names", () => {
    it("found the original seeds to check against", () => {
        expect(ORIGINALS.size).toBe(58);
    });

    it("names only prompts that actually exist", () => {
        for (const prompt of [...BACKFILLED, ...RETIRED]) {
            expect(
                ORIGINALS.has(prompt),
                `no question has this prompt, so the UPDATE matches nothing:\n${prompt.slice(0, 90)}`
            ).toBe(true);
        }
    });

    it("leaves no surviving question without a tier and an explanation", () => {
        const retired = new Set(RETIRED);
        const covered = new Set(BACKFILLED);
        const missed = [...ORIGINALS].filter((p) => !retired.has(p) && !covered.has(p));

        expect(
            missed.map((p) => p.slice(0, 70)).join("\n"),
            `${missed.length} question(s) would keep a NULL tier:`
        ).toBe("");
    });

    it("never both retires and backfills the same question", () => {
        const overlap = BACKFILLED.filter((p) => RETIRED.includes(p));

        expect(overlap).toHaveLength(0);
    });

    it("accounts for every original question exactly once", () => {
        expect(BACKFILLED.length + RETIRED.length).toBe(ORIGINALS.size);
        expect(new Set(BACKFILLED).size).toBe(BACKFILLED.length);
        expect(new Set(RETIRED).size).toBe(RETIRED.length);
    });
});

describe("the backfilled questions meet the same standard as the new ones", () => {
    const entries = BACKFILL.split("SELECT backfill_question(")
        .slice(1)
        .map((block) => {
            const m = /^\s*E?'(?:[^']|'')*',\s*(\d),\s*'((?:[^']|'')*)'/.exec(block);

            if (!m) throw new Error(`Unparseable backfill: ${block.slice(0, 80)}`);

            return { difficulty: Number(m[1]), explanation: m[2]!.replace(/''/g, "'") };
        });

    it("tiers every one between 1 and 4", () => {
        for (const e of entries) {
            expect(e.difficulty).toBeGreaterThanOrEqual(1);
            expect(e.difficulty).toBeLessThanOrEqual(4);
        }
    });

    it("explains every one, within the column's limit", () => {
        for (const e of entries) {
            expect(e.explanation.trim().length).toBeGreaterThan(20);
            expect(e.explanation.length).toBeLessThanOrEqual(400);
        }
    });

    it("spreads across tiers rather than parking everything in the middle", () => {
        const tiers = new Set(entries.map((e) => e.difficulty));

        expect(tiers.size).toBeGreaterThanOrEqual(3);
    });
});

/**
 * The bank has to stay weighted toward fundamentals.
 *
 * This is a content-shape rule, not a style preference. Jolt is meant to build a
 * JavaScript foundation by being played repeatedly, and a bank that drifts
 * advanced-heavy quietly turns into an interview quiz -- which is what it was
 * becoming: 36/47/27/33, with the hardest tier nearly as deep as the easiest.
 *
 * Writing a hard question is more fun than writing a beginner one, so the drift
 * is one-directional and needs an actual guard rather than good intentions.
 * These count the whole active bank, seed 008 plus the backfill in 009 minus its
 * retirements, because a rule that only watched half of it would not be a rule.
 */
describe("the bank is weighted toward learning, not toward difficulty", () => {
    const backfillTiers = BACKFILL.split("SELECT backfill_question(")
        .slice(1)
        .map((block) => {
            const m = /^\s*E?'(?:[^']|'')*',\s*(\d),/.exec(block);

            if (!m) throw new Error(`Unparseable backfill: ${block.slice(0, 60)}`);

            return Number(m[1]);
        });

    const active = [...QUESTIONS.map((q) => q.difficulty), ...backfillTiers];
    const count = (tier: number) => active.filter((t) => t === tier).length;

    it("has a bank worth playing repeatedly", () => {
        expect(active.length).toBeGreaterThanOrEqual(150);
    });

    it("gives beginners the most to work with", () => {
        // Tier 1 is where a learner spends their first sessions, and the curve
        // draws three of every ten questions from it.
        expect(count(1)).toBeGreaterThanOrEqual(45);
    });

    it("keeps fundamentals and practical work far larger than the hardest tier", () => {
        expect(count(1) + count(2)).toBeGreaterThan(count(3) + count(4) + 40);
    });

    it("keeps the hardest tier the smallest", () => {
        expect(count(4)).toBeLessThan(count(1));
        expect(count(4)).toBeLessThan(count(2));
        expect(count(4)).toBeLessThan(count(3));
    });

    it("still has enough tier 4 to close a run without repeating quickly", () => {
        // The curve wants one tier-4 question for the last slot of every run, so
        // this is the tier whose depth decides how soon the hardest content
        // starts coming round again.
        expect(count(4)).toBeGreaterThanOrEqual(15);
    });
});
