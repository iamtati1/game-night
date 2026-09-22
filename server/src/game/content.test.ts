import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The question bank, checked by running it.
 *
 * Reading a snippet carefully is not verification. This project has twice
 * shipped content whose declared answer was wrong in a way that survived
 * review -- a Python bug written as JavaScript, and a Bug Hunt option that was
 * the correct answer in disguise -- and both were caught by executing the thing
 * rather than re-reading it. So every question whose prompt asks what the code
 * produces is EXECUTED, and its real output compared against what it claims.
 *
 * Reads EVERY seed in the directory rather than a hardcoded list. The list used
 * to name 008 and 010, which meant seed 012 shipped twenty-one questions that
 * nothing here ever looked at -- the file silently stopped covering the bank the
 * moment the bank grew. Seeds whose options are SQL arguments rather than JSON
 * (001 and 003) have no $j$ block and are skipped here; they are checked
 * structurally further down.
 */
const SEEDS_DIR = new URL("../../seeds/", import.meta.url);

const SEED_FILES = readdirSync(SEEDS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();

interface SeedOption {
    text: string;
    correct?: boolean;
    /** Position in an assembly answer. Present only on complete-code tokens. */
    pos?: number;
}

interface SeedQuestion {
    prompt: string;
    difficulty: number;
    topic: string;
    explanation: string;
    options: SeedOption[];
    /** Which mechanic answers it. Derived from the seed helper that wrote it. */
    challengeType: "predict-output" | "complete-code";
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
    const questions: SeedQuestion[] = [];

    for (const name of SEED_FILES) {
        const sql = readFileSync(new URL(name, SEEDS_DIR), "utf8");

        // Splitting on a capturing group interleaves helper names with the
        // blocks that follow them, so each question knows which helper wrote it.
        const parts = sql.split(/SELECT (seed_[a-z_]+)\(/);

        for (let i = 1; i < parts.length; i += 2) {
            const helper = parts[i]!;
            const block = parts[i + 1] ?? "";

            // Only the helpers that take the JSONB option shape. Seeds 001 and
            // 003 pass their options as separate SQL arguments and are checked
            // structurally elsewhere.
            if (!block.includes("$j$")) continue;

            // Bug Hunt incidents also pass their options as $j$ JSONB, but they
            // are not questions: no prompt, no difficulty-then-topic argument
            // pair, and nothing to execute. The looser "$j$" guard above let
            // them through and they only parsed by accident of argument order --
            // an incident with a NULL error_log broke it. Skipped by name.
            if (helper === "seed_bug_hunt_incident") continue;

            const prompt = /^\s*E?'((?:[^']|'')*)'/.exec(block);
            const meta = /',\s*(\d),\s*'([a-z-]+)',\s*'((?:[^']|'')*)',/.exec(block);
            const options = /\$j\$([\s\S]*?)\$j\$/.exec(block);

            if (!prompt || !meta || !options) {
                throw new Error(`Unparseable question block in ${name}: ${block.slice(0, 80)}`);
            }

            const text = unescape(prompt[1]!);
            const parsed = JSON.parse(options[1]!) as SeedOption[];

            questions.push({
                prompt: text,
                difficulty: Number(meta[1]),
                topic: meta[2]!,
                explanation: unescape(meta[3]!),
                // A token carrying a position is by definition part of the answer.
                options: parsed.map((o) => ({ ...o, correct: o.correct === true || o.pos !== undefined })),
                challengeType: helper === "seed_complete_code" ? "complete-code" : "predict-output",
                code: text.split("\n").slice(1).join("\n").trim()
            });
        }
    }

    return questions;
}

/**
 * How a value is written when a question states what the code produced.
 *
 * Strings are quoted, including at the top level, because for a whole class of
 * question the quotes ARE the answer: `1 + "1"` gives `"11"` and `1 + 1` gives
 * `2`, and an option written as a bare 11 cannot tell those apart. It also
 * matches what a JavaScript REPL shows.
 *
 * Deliberately not util.inspect: Node prints `[ 1, 2, 3 ]` with padding, and an
 * option that read that way would look wrong to a player.
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
 * questions are about.
 */
async function run(
    code: string,
    joinWith = "\n",
    quoteStrings = true,
    /** Time allowed for microtasks and 0ms timers. Zero for synchronous snippets,
     *  which matters when one question is executed hundreds of times. */
    settleMs = 25
): Promise<string> {
    const logged: string[] = [];
    const capture = (...args: unknown[]) =>
        logged.push(args.map((a) => render(a, quoteStrings)).join(" "));

    try {
        // eslint-disable-next-line no-new-func
        new Function("console", `"use strict";\n${code}`)({ log: capture });
    } catch (error) {
        return error instanceof Error ? error.constructor.name : String(error);
    }

    if (settleMs > 0) await new Promise((resolve) => setTimeout(resolve, settleMs));

    return logged.join(joinWith);
}

const QUESTIONS = parseSeed();

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

/** Questions answered by picking one of four. Every question until now. */
const PREDICT = QUESTIONS.filter((q) => q.challengeType === "predict-output");

/** Questions answered by assembling tokens into a gap. */
const ASSEMBLY = QUESTIONS.filter((q) => q.challengeType === "complete-code");

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
        // predict-output only: an assembly answer is two to four correct tokens,
        // which is the whole point of it.
        for (const q of PREDICT) {
            expect(q.options.filter((o) => o.correct), q.prompt.slice(0, 40)).toHaveLength(1);
        }
    });

    it("offers four options, so a guess is worth 25% and no more", () => {
        for (const q of PREDICT) {
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
        for (const q of PREDICT) {
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
    /**
     * Two different questions used to share one list, and adding the first
     * `operators` question exposed the conflation:
     *
     *   "is this topic permitted?"      -> whatever migration 022 allows
     *   "does this unit have depth?"    -> only the units that are meant to
     *
     * A brand new topic legitimately starts with one question, so applying an
     * eight-question floor to it would block exactly the incremental authoring
     * the curriculum slices are. The floors below therefore stay on the nine
     * units that were the whole bank when they were written, and validity is
     * checked against the migration instead.
     */
    const PERMITTED_TOPICS = [
        ...readFileSync(
            new URL("../../migrations/022_expand_question_topic_taxonomy.sql", import.meta.url),
            "utf8"
        ).matchAll(/^\s*'([a-z-]+)',?$/gm)
    ].map((m) => m[1]!);

    /** The units carrying depth floors. Not the whole curriculum. */
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

    it("read the permitted topics from the migration", () => {
        // Guards the regex above: an empty list would make the next test pass
        // for every possible topic.
        expect(PERMITTED_TOPICS.length).toBeGreaterThanOrEqual(16);
        expect(PERMITTED_TOPICS).toContain("operators");
        expect(PERMITTED_TOPICS).toContain("conditionals");
    });

    it("gives every active question a topic the schema permits", () => {
        for (const q of active) {
            expect(PERMITTED_TOPICS, `unknown topic "${q.topic}"`).toContain(q.topic);
        }
    });

    it("keeps every floored unit inside the permitted set", () => {
        // If a floored unit were ever dropped from the migration, its floor
        // would silently start asserting against content that cannot exist.
        for (const topic of TOPICS) {
            expect(PERMITTED_TOPICS, `${topic} is floored but not permitted`).toContain(topic);
        }
    });

    it("teaches every floored unit, so none can quietly vanish", () => {
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

/**
 * No active question may reach the database without a curriculum topic.
 *
 * The earlier coverage check compared SQL LITERALS -- the `E'...'` source text.
 * The database compares decoded strings, and those are not the same comparison:
 * two literals can differ in escaping and still decode to one prompt, or match
 * as text while decoding differently. A literal-level check can therefore pass
 * while a row is left untouched, which is exactly the failure that reaches
 * production as "check constraint questions_topic_required is violated by some
 * row" with no indication of which.
 *
 * So this decodes both sides the way PostgreSQL does and compares the values the
 * UPDATE will actually match on.
 */
describe("every question a seed creates is given a topic by a seed", () => {
    /** Decodes a PostgreSQL string literal, E'' escapes included. */
    const decode = (literal: string): string => {
        const escaped = literal.startsWith("E");
        const body = literal.slice(escaped ? 2 : 1, -1).replace(/''/g, "'");

        return escaped
            ? body.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\\\/g, "\\")
            : body;
    };

    const FIRST_LITERAL = /^\s*(E?'(?:[^']|'')*')/;

    /** The prompts seeds 001 and 003 actually insert. */
    const created = new Set(
        OLD_SEEDS.split("SELECT seed_question(")
            .slice(1)
            .map((block) => FIRST_LITERAL.exec(block))
            .filter((m): m is RegExpExecArray => m !== null)
            .map((m) => decode(m[1]!))
    );

    /** The prompts seed 009 either files under a topic or takes out of play. */
    const addressed = new Set(
        ["backfill_question", "retire_question"].flatMap((fn) =>
            BACKFILL.split(`SELECT ${fn}(`)
                .slice(1)
                .map((block) => FIRST_LITERAL.exec(block))
                .filter((m): m is RegExpExecArray => m !== null)
                .map((m) => decode(m[1]!))
        )
    );

    it("parsed both sides", () => {
        expect(created.size).toBeGreaterThan(0);
        expect(addressed.size).toBeGreaterThan(0);
    });

    it("leaves no created question unaddressed once decoded", () => {
        const missed = [...created].filter((p) => !addressed.has(p));

        expect(
            missed.map((p) => p.replace(/\n/g, " | ").slice(0, 80)).join("\n"),
            `${missed.length} question(s) would be inserted with no topic:`
        ).toBe("");
    });

    it("addresses nothing that is never created", () => {
        // The mirror failure: a backfill aimed at a prompt no seed inserts
        // updates zero rows and passes silently.
        const phantom = [...addressed].filter((p) => !created.has(p));

        expect(
            phantom.map((p) => p.replace(/\n/g, " | ").slice(0, 80)).join("\n"),
            `${phantom.length} backfill target(s) match no question:`
        ).toBe("");
    });

    it("gives every question the newer seeds insert a topic inline", () => {
        // 008 and 010 insert with a topic argument rather than relying on a
        // later backfill, so there is nothing to reconcile -- but a block that
        // somehow lost its topic would be a NULL insert, and the constraint
        // would reject it at seed time rather than at validation.
        for (const q of QUESTIONS) {
            expect(q.topic, `${q.prompt.slice(0, 50)} has no topic`).toBeTruthy();
        }
    });

    it("names the offending rows when validation fails", () => {
        // VALIDATE CONSTRAINT reports only "violated by some row". In a table of
        // a hundred and seventy that is not actionable, so seed 009 checks first
        // and raises with the ids and prompts.
        expect(BACKFILL).toMatch(/RAISE EXCEPTION/);
        expect(BACKFILL).toMatch(/WHERE is_active AND topic IS NULL/);
        expect(BACKFILL).toMatch(/VALIDATE CONSTRAINT questions_topic_required/);
    });
});

/**
 * complete-code: the assembly mechanic, checked by building every answer it
 * could possibly produce and running them all.
 *
 * The risk this mechanic carries is not that the declared answer is wrong -- that
 * is the easy case, and one execution catches it. The risk is that a SECOND
 * arrangement of the same bank is also right, which no amount of re-reading
 * reliably catches. `i < items.length` and `i <= items.length - 1` are the same
 * condition written two ways, and a bank offering `<`, `<=`, `items.length` and
 * `items.length - 1` quietly contains both. So every ordering and every
 * same-length assembly the bank permits is executed, and exactly one of them is
 * allowed to produce the declared result.
 *
 * The distinction that matters throughout: a wrong assembly SHOULD run cleanly.
 * That is what makes it a distractor rather than a syntax error the player can
 * discard without understanding anything. These tests fail on a wrong assembly
 * only when it produces the RIGHT answer.
 */
const GAP = "/*?*/";

/** What a complete-code prompt claims its answer produces. */
function declaredResult(prompt: string): string {
    const stated = /so it logs:\s*(.+)$/m.exec(prompt.split("\n")[0] ?? "");

    if (!stated) {
        throw new Error(`complete-code prompt must state "so it logs: ..." -- got: ${prompt.slice(0, 60)}`);
    }

    return stated[1]!.trim();
}

const tokensOf = (q: SeedQuestion) =>
    q.options.filter((o) => o.pos !== undefined).sort((a, b) => a.pos! - b.pos!);

const assemble = (code: string, texts: string[]) => code.replace(GAP, texts.join(" "));

/** Nothing here queues work, so the 25ms settle is wasted on hundreds of runs. */
const needsSettling = (code: string) =>
    /setTimeout|setInterval|Promise|await|queueMicrotask/.test(code);

function permutations<T>(items: readonly T[]): T[][] {
    if (items.length <= 1) return [[...items]];

    return items.flatMap((item, i) =>
        permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest])
    );
}

/** Every ordered selection of `size` distinct entries. */
function arrangements<T>(items: readonly T[], size: number): T[][] {
    if (size === 0) return [[]];

    return items.flatMap((item, i) =>
        arrangements([...items.slice(0, i), ...items.slice(i + 1)], size - 1).map((rest) => [
            item,
            ...rest
        ])
    );
}

describe("complete-code questions are assemblable exactly one way", () => {
    it("has assembly questions to check", () => {
        expect(ASSEMBLY.length).toBeGreaterThan(0);
    });

    it("marks a gap in every prompt, exactly once", () => {
        for (const q of ASSEMBLY) {
            expect(q.code.split(GAP).length - 1, q.prompt.slice(0, 40)).toBe(1);
        }
    });

    it("states the result the player is building towards", () => {
        // The player cannot assemble an answer they have not been shown, and the
        // execution checks below have nothing to compare against without it.
        for (const q of ASSEMBLY) {
            expect(() => declaredResult(q.prompt), q.prompt.slice(0, 40)).not.toThrow();
        }
    });

    it("gaps two to four tokens", () => {
        // One token is a four-option question with a box drawn round it; five is
        // transcription.
        for (const q of ASSEMBLY) {
            const n = tokensOf(q).length;

            expect(n, `${q.prompt.slice(0, 40)}: ${n} tokens`).toBeGreaterThanOrEqual(2);
            expect(n, `${q.prompt.slice(0, 40)}: ${n} tokens`).toBeLessThanOrEqual(4);
        }
    });

    it("offers a bank of four to eight tokens", () => {
        for (const q of ASSEMBLY) {
            expect(q.options.length, q.prompt.slice(0, 40)).toBeGreaterThanOrEqual(4);
            expect(q.options.length, q.prompt.slice(0, 40)).toBeLessThanOrEqual(8);
        }
    });

    it("numbers the answer positions 1..n with no gaps or repeats", () => {
        // The database can stop two tokens claiming one slot; it cannot see that
        // the slots run 1, 2, 4. That is a cross-row fact and lives here.
        for (const q of ASSEMBLY) {
            const positions = tokensOf(q).map((o) => o.pos!);

            expect(positions, q.prompt.slice(0, 40)).toEqual(
                positions.map((_, i) => i + 1)
            );
        }
    });

    it("gives every correct token a position and no distractor one", () => {
        for (const q of ASSEMBLY) {
            for (const option of q.options) {
                expect(
                    option.correct,
                    `${q.prompt.slice(0, 40)}: "${option.text}" position/correct disagree`
                ).toBe(option.pos !== undefined);
            }
        }
    });

    it("produces the declared result when assembled in the declared order", async () => {
        const wrong: string[] = [];

        for (const q of ASSEMBLY) {
            const expected = declaredResult(q.prompt);
            const code = assemble(q.code, tokensOf(q).map((o) => o.text));
            const actual = await run(code, ", ", true, needsSettling(code) ? 25 : 0);

            if (actual !== expected) {
                wrong.push(`\n  ${q.prompt.slice(0, 46)}\n    declared: ${expected}\n    actual:   ${actual}`);
            }
        }

        expect(wrong.join(""), `${wrong.length} assembly question(s) declare the wrong result:`).toBe("");
    });

    it("offers no distractor that only ever produces a syntax error", async () => {
        // A distractor is useless if placing it cannot produce a running program:
        // the player discards it on shape alone, without understanding anything.
        // "Somewhere it parses" rather than "everywhere", because an operand
        // substituted for an operator legitimately will not.
        const useless: string[] = [];

        for (const q of ASSEMBLY) {
            const tokens = tokensOf(q).map((o) => o.text);

            for (const distractor of q.options.filter((o) => o.pos === undefined)) {
                const parsesSomewhere = await Promise.all(
                    tokens.map(async (_, i) => {
                        const swapped = tokens.map((t, j) => (i === j ? distractor.text : t));
                        const code = assemble(q.code, swapped);

                        return (await run(code, ", ", true, 0)) !== "SyntaxError";
                    })
                );

                if (!parsesSomewhere.some(Boolean)) {
                    useless.push(`\n  ${q.prompt.slice(0, 46)}: "${distractor.text}"`);
                }
            }
        }

        expect(useless.join(""), `${useless.length} distractor(s) can never parse:`).toBe("");
    });

    it("accepts only one ordering of its own tokens", async () => {
        const ambiguous: string[] = [];

        for (const q of ASSEMBLY) {
            const expected = declaredResult(q.prompt);
            const tokens = tokensOf(q).map((o) => o.text);
            const settle = needsSettling(q.code) ? 25 : 0;
            const declared = tokens.join(" ");

            for (const ordering of permutations(tokens)) {
                if (ordering.join(" ") === declared) continue;

                const actual = await run(assemble(q.code, ordering), ", ", true, settle);

                if (actual === expected) {
                    ambiguous.push(`\n  ${q.prompt.slice(0, 46)}\n    also correct: ${ordering.join(" ")}`);
                }
            }
        }

        expect(ambiguous.join(""), `${ambiguous.length} question(s) accept a second ordering:`).toBe("");
    });

    it("accepts only one assembly out of everything the bank can build", async () => {
        // The broader check, and the one that catches an equivalent answer rather
        // than a reordered one -- `<= items.length - 1` against `< items.length`.
        const ambiguous: string[] = [];

        for (const q of ASSEMBLY) {
            const expected = declaredResult(q.prompt);
            const tokens = tokensOf(q).map((o) => o.text);
            const settle = needsSettling(q.code) ? 25 : 0;
            const declared = tokens.join(" ");
            let matches = 0;

            for (const candidate of arrangements(q.options.map((o) => o.text), tokens.length)) {
                const actual = await run(assemble(q.code, candidate), ", ", true, settle);

                if (actual !== expected) continue;

                matches += 1;

                if (candidate.join(" ") !== declared) {
                    ambiguous.push(`\n  ${q.prompt.slice(0, 46)}\n    also correct: ${candidate.join(" ")}`);
                }
            }

            expect(matches, `${q.prompt.slice(0, 40)}: declared assembly does not win`).toBeGreaterThan(0);
        }

        expect(ambiguous.join(""), `${ambiguous.length} alternative assembly(s) also correct:`).toBe("");
    });
});
