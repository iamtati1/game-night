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
 * Covers the seeds that write their own questions -- 008 and the curriculum
 * questions in 010. The backfilled originals in 009 update rows seeded by 001
 * and 003, whose options are written as SQL arguments rather than JSON, so they
 * are checked structurally further down instead.
 */
const SEED = ["008_code_blitz_modern_js.sql", "010_code_blitz_curriculum.sql"]
    .map((name) => readFileSync(new URL(`../../seeds/${name}`, import.meta.url), "utf8"))
    .join("\n");

interface SeedOption {
    text: string;
    correct?: boolean;
}

interface SeedQuestion {
    prompt: string;
    difficulty: number;
    topic: string;
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
            const meta = /',\s*(\d),\s*'([a-z-]+)',\s*'((?:[^']|'')*)',/.exec(block);
            const options = /\$j\$([\s\S]*?)\$j\$/.exec(block);

            if (!prompt || !meta || !options) {
                throw new Error(`Unparseable question block: ${block.slice(0, 80)}`);
            }

            const text = unescape(prompt[1]!);

            return {
                prompt: text,
                difficulty: Number(meta[1]),
                topic: meta[2]!,
                explanation: unescape(meta[3]!),
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
            const m = /^\s*E?'(?:[^']|'')*',\s*(\d),\s*'([a-z-]+)',\s*'((?:[^']|'')*)'/.exec(block);

            if (!m) throw new Error(`Unparseable backfill: ${block.slice(0, 80)}`);

            return {
                difficulty: Number(m[1]),
                topic: m[2]!,
                explanation: m[3]!.replace(/''/g, "'")
            };
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

/**
 * Curriculum guards.
 *
 * Code Blitz is meant to be a JavaScript curriculum delivered as a game, and the
 * audit that produced this shape found the bank failing at exactly that while
 * looking fine by every other measure: five loop questions and twelve function
 * questions against twenty-six about objects, every one correctly tiered. A
 * difficulty ladder cannot see a curriculum gap.
 *
 * These are floors, not targets. They exist because writing a clever question is
 * more enjoyable than writing the eleventh loop question, so the drift runs one
 * way and needs something structural in its path.
 */
describe("the bank is a curriculum", () => {
    const TOPICS = [
        "variables",
        "conditionals",
        "loops",
        "arrays",
        "objects",
        "functions",
        "array-methods",
        "scope",
        "async"
    ];

    const backfilled = BACKFILL.split("SELECT backfill_question(")
        .slice(1)
        .map((block) => {
            const m = /^\s*E?'(?:[^']|'')*',\s*(\d),\s*'([a-z-]+)',/.exec(block);

            if (!m) throw new Error(`Unparseable backfill: ${block.slice(0, 70)}`);

            return { difficulty: Number(m[1]), topic: m[2]! };
        });

    const active = [
        ...QUESTIONS.map((q) => ({ difficulty: q.difficulty, topic: q.topic })),
        ...backfilled
    ];

    const inTopic = (t: string) => active.filter((q) => q.topic === t).length;

    it("gives every active question a topic from the nine units", () => {
        for (const q of active) {
            expect(TOPICS, `unknown topic "${q.topic}"`).toContain(q.topic);
        }
    });

    it("teaches every unit, so none can quietly vanish", () => {
        for (const topic of TOPICS) {
            expect(inTopic(topic), `${topic} has almost nothing in it`).toBeGreaterThanOrEqual(8);
        }
    });

    /**
     * The four units a beginner practises most. Loops and functions carry their
     * own floors because those two were the ones that had actually collapsed --
     * to five and twelve respectively -- while the bank still looked healthy.
     */
    it("keeps substantial practice in loops", () => {
        expect(inTopic("loops")).toBeGreaterThanOrEqual(20);
    });

    it("keeps substantial practice in functions", () => {
        expect(inTopic("functions")).toBeGreaterThanOrEqual(20);
    });

    it("keeps substantial practice in arrays", () => {
        expect(inTopic("arrays")).toBeGreaterThanOrEqual(20);
    });

    it("keeps substantial practice in conditionals", () => {
        expect(inTopic("conditionals")).toBeGreaterThanOrEqual(16);
    });

    it("keeps the fundamentals larger than the advanced units", () => {
        const fundamentals = ["loops", "arrays", "functions", "conditionals", "variables"]
            .map(inTopic)
            .reduce((a, b) => a + b, 0);
        const advanced = ["scope", "async"].map(inTopic).reduce((a, b) => a + b, 0);

        expect(fundamentals).toBeGreaterThan(advanced * 2);
    });

    it("gives each fundamental unit a beginner on-ramp", () => {
        // A unit that exists only at tier 3 is not being taught, it is being
        // tested.
        for (const topic of ["loops", "arrays", "functions", "conditionals", "variables"]) {
            const beginner = active.filter((q) => q.topic === topic && q.difficulty === 1);

            expect(beginner.length, `${topic} has no tier-1 questions`).toBeGreaterThanOrEqual(5);
        }
    });
});

describe("no question turns on a quirk or on the environment", () => {
    it("never asks the player to predict how a function or Promise prints", () => {
        // console.log of a function or a Promise shows different text in Node and
        // in a browser, so any answer written that way is right in one place and
        // wrong in the other. Two questions were caught by this and rewritten to
        // ask about the concept instead.
        for (const q of PREDICTIVE) {
            const answer = q.options.find((o) => o.correct)!.text;

            expect(answer, `${q.code.slice(0, 40)}: environment-dependent output`).not.toMatch(
                /^function |^\(?\w*\)? =>|Promise \{|\[object |^class /
            );
        }
    });

    it("keeps the retired coercion puzzles out of the bank", () => {
        // The fourteen retired in seed 009 were quirk recall with no practical
        // payoff. Nothing stops someone reintroducing one as a new question, so
        // the shapes themselves are named here.
        const BANNED = [
            /console\.log\(\[\] \+ \{\}\)/,
            /console\.log\(\[1, 2\] \+ \[3, 4\]\)/,
            /console\.log\(""\s*==\s*0\)/,
            /console\.log\(true \+ true\)/,
            /console\.log\(typeof NaN\)/,
            /console\.log\(Math\.max\(\)\)/,
            /console\.log\(Number\(""\)\)/,
            /parseInt\("08"\)/,
            /console\.log\(null == undefined\)/
        ];

        for (const q of QUESTIONS) {
            for (const banned of BANNED) {
                expect(q.code, `reintroduces a retired quirk: ${q.code.slice(0, 45)}`).not.toMatch(
                    banned
                );
            }
        }
    });
});
