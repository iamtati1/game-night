import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
    BUG_HUNT_INCIDENTS_PER_SESSION,
    BUG_HUNT_MAX_TIME_MS,
    BUG_HUNT_MIN_TIME_MS,
    DIFFICULTY_RAMP,
    PLAYABLE_CHALLENGE_TYPES,
    countCodeLines,
    timeLimitMs
} from "./scoring.js";

/** Both seeds. The bank is the sum of them, not whichever file came first. */
const SEED_FILES = ["005_bug_hunt_incidents.sql", "006_bug_hunt_easy_tier.sql"] as const;

const SEED = SEED_FILES.map((name) =>
    readFileSync(new URL(`../../seeds/${name}`, import.meta.url), "utf8")
).join("\n");

/**
 * Incidents seed 006 moves up a tier.
 *
 * They were sitting in tier one and setting the wrong expectation for the first
 * thirty seconds of a run -- the easiest of them needed you to know that find()
 * returns undefined on a miss. Listed explicitly rather than parsed out of the
 * UPDATE: a regex over SQL that quietly matches nothing (or everything) fails
 * silently, and this list is short enough to state.
 */
const MIGRATION = readFileSync(
    new URL("../../migrations/014_create_bug_hunt.sql", import.meta.url),
    "utf8"
);

const RETIERED_TO_2 = new Set([
    "profile-undefined-name",
    "cart-quantity-string",
    "inventory-count-overflow",
    "login-validator-no-return"
]);

interface SeedOption {
    text: string;
    line?: number;
    correct?: boolean;
    explanation: string;
}

interface SeedIncident {
    slug: string;
    theme: string;
    category: string;
    challengeType: string;
    code: string;
    hints: string[];
    difficulty: number;
    options: SeedOption[];
}

/**
 * Reads the seed rather than the database.
 *
 * The database cannot be reached from the test runner, and more usefully: this
 * catches a badly-formed incident when it is WRITTEN, not when it is dealt to a
 * player mid-run. A bank that only fails at deal time fails in front of someone.
 */
function parseSeed(): SeedIncident[] {
    return SEED.split("SELECT seed_bug_hunt_incident(")
        .slice(1)
        .map((block) => {
            const code = /\$code\$([\s\S]*?)\$code\$/.exec(block);
            const opts = /\$opts\$([\s\S]*?)\$opts\$/.exec(block);
            const slug = /^\s*'([a-z0-9-]+)'/.exec(block);
            const taxonomy = /'([a-z]+)',\s*'([a-z-]+)',\s*'([a-z_]+)',\s*\$code\$/.exec(block);
            const hints = /ARRAY\[([\s\S]*?)\n\s*\],/.exec(block);
            // Tolerant of both seeds' formatting: 005 puts the difficulty on its
            // own line, 006 puts it after the hints array on the same line.
            const difficulty = /(\d),\s*\n\$opts\$/.exec(block);

            if (!code || !opts || !slug || !taxonomy || !hints || !difficulty) {
                throw new Error(`Unparseable incident block starting: ${block.slice(0, 60)}`);
            }

            return {
                slug: slug[1]!,
                theme: taxonomy[1]!,
                category: taxonomy[2]!,
                challengeType: taxonomy[3]!,
                code: code[1]!,
                hints: [...hints[1]!.matchAll(/'((?:[^']|'')*)'/g)].map((m) =>
                    m[1]!.replace(/''/g, "'")
                ),
                difficulty: RETIERED_TO_2.has(slug[1]!) ? 2 : Number(difficulty[1]),
                options: JSON.parse(opts[1]!) as SeedOption[]
            };
        });
}

const INCIDENTS = parseSeed();
const named = (i: SeedIncident) => i.slug;

describe("the incident bank is big enough to play", () => {
    it("holds enough incidents for a ten-hunt run to vary", () => {
        expect(INCIDENTS).toHaveLength(32);
    });

    it("has more than one session's worth, so runs are not identical", () => {
        expect(INCIDENTS.length).toBeGreaterThan(BUG_HUNT_INCIDENTS_PER_SESSION * 2);
    });

    it("can fill every slot of the ramp twice over", () => {
        // The ramp asks for three tier-one hunts, two each of tiers two to four
        // and one tier five. A tier with only just enough would force the same
        // incident into that slot every single run.
        const needed = DIFFICULTY_RAMP.reduce<Record<number, number>>((acc, tier) => {
            acc[tier] = (acc[tier] ?? 0) + 1;
            return acc;
        }, {});

        for (const [tier, count] of Object.entries(needed)) {
            const have = INCIDENTS.filter((i) => i.difficulty === Number(tier)).length;

            expect(have, `difficulty ${tier}: needs ${count} per run`).toBeGreaterThanOrEqual(
                count * 2
            );
        }
    });

    it("gives every incident a unique slug", () => {
        const slugs = INCIDENTS.map(named);

        expect(new Set(slugs).size).toBe(slugs.length);
    });

    it("uses both MVP challenge types at every difficulty", () => {
        // Five find_line incidents in a row would be one mechanic, not a game.
        for (const difficulty of [1, 2, 3, 4, 5]) {
            const types = new Set(
                INCIDENTS.filter((i) => i.difficulty === difficulty).map((i) => i.challengeType)
            );

            expect(types.size, `difficulty ${difficulty} should mix types`).toBeGreaterThan(1);
        }
    });

    it("draws on every theme, so a run does not feel like one failing service", () => {
        const themes = new Set(INCIDENTS.map((i) => i.theme));

        expect(themes.size).toBeGreaterThanOrEqual(7);
    });

    it("covers a real spread of bug categories", () => {
        // The results screen's "strong today / keep practicing" line is only
        // meaningful if a run can actually meet several categories.
        const categories = new Set(INCIDENTS.map((i) => i.category));

        expect(categories.size).toBeGreaterThanOrEqual(6);
    });
});

describe("every incident is playable", () => {
    it("uses only challenge types the client can render", () => {
        for (const incident of INCIDENTS) {
            expect(PLAYABLE_CHALLENGE_TYPES, named(incident)).toContain(incident.challengeType);
        }
    });

    it("has exactly one correct option", () => {
        // Zero is unwinnable and wastes one of the player's five incidents; two
        // is unscoreable. The schema enforces "not two"; this enforces "not zero".
        for (const incident of INCIDENTS) {
            const correct = incident.options.filter((o) => o.correct === true);

            expect(correct.length, named(incident)).toBe(1);
        }
    });

    it("offers at least three options, so a wrong first attempt still leaves doubt", () => {
        // With two options, one wrong attempt hands over the answer and the
        // second attempt stops being a decision.
        for (const incident of INCIDENTS) {
            expect(incident.options.length, named(incident)).toBeGreaterThanOrEqual(3);
        }
    });

    it("never repeats an option within an incident", () => {
        // Two identical choices make the incident ill-defined -- either pick
        // would be equally defensible. The schema forbids it too.
        for (const incident of INCIDENTS) {
            const texts = incident.options.map((o) => o.text);

            expect(new Set(texts).size, named(incident)).toBe(texts.length);
        }
    });
});

describe("every option teaches something", () => {
    it("explains itself, including the wrong ones", () => {
        // The second attempt is meant to be spent on what the first one told you.
        for (const incident of INCIDENTS) {
            for (const option of incident.options) {
                expect(option.explanation, `${named(incident)}: ${option.text}`).toBeTruthy();
                expect(
                    option.explanation.length,
                    `${named(incident)}: ${option.text}`
                ).toBeGreaterThan(40);
            }
        }
    });

    it("never explains a distractor by just calling it wrong", () => {
        // "This is incorrect." teaches nothing. A distractor's explanation has to
        // say what it would actually do.
        const lazy = /^(this is )?(incorrect|wrong|not right)\.?$/i;

        for (const incident of INCIDENTS) {
            for (const option of incident.options) {
                expect(option.explanation, `${named(incident)}: ${option.text}`).not.toMatch(lazy);
            }
        }
    });
});

describe("the hint ladder narrows without answering", () => {
    it("gives every incident three rungs", () => {
        for (const incident of INCIDENTS) {
            expect(incident.hints.length, named(incident)).toBe(3);
        }
    });

    it("stays inside the range the schema allows", () => {
        expect(MIGRATION).toMatch(/array_length\(hints, 1\) BETWEEN 1 AND 3/);

        for (const incident of INCIDENTS) {
            expect(incident.hints.length, named(incident)).toBeLessThanOrEqual(3);
        }
    });

    it("never hands over the correct option verbatim", () => {
        // A hint that contains the answer is not a hint, it is the answer with a
        // score penalty attached.
        for (const incident of INCIDENTS) {
            const answer = incident.options.find((o) => o.correct)!.text.trim();

            for (const hint of incident.hints) {
                expect(hint, `${named(incident)} hint leaks the answer`).not.toContain(answer);
            }
        }
    });

    it("writes hints that are actually sentences", () => {
        for (const incident of INCIDENTS) {
            for (const hint of incident.hints) {
                expect(hint.length, `${named(incident)}: "${hint}"`).toBeGreaterThan(20);
            }
        }
    });
});

describe("find_line incidents point at real lines", () => {
    const findLine = INCIDENTS.filter((i) => i.challengeType === "find_line");

    it("has some", () => {
        expect(findLine.length).toBeGreaterThan(0);
    });

    it("gives every option a line number within the snippet", () => {
        // An option pointing at line 9 of a 6-line snippet is unanswerable, and
        // nothing at runtime would catch it -- the player would just be wrong.
        for (const incident of findLine) {
            const lineCount = incident.code.split("\n").length;

            for (const option of incident.options) {
                expect(option.line, `${named(incident)}: ${option.text}`).toBeDefined();
                expect(option.line!, `${named(incident)}: ${option.text}`).toBeGreaterThanOrEqual(1);
                expect(option.line!, `${named(incident)}: ${option.text}`).toBeLessThanOrEqual(
                    lineCount
                );
            }
        }
    });

    it("quotes the line it points at", () => {
        // The option text has to match the snippet, or the player is choosing
        // between lines that are not the lines in front of them.
        for (const incident of findLine) {
            const lines = incident.code.split("\n");

            for (const option of incident.options) {
                expect(
                    lines[option.line! - 1]!.trim(),
                    `${named(incident)} line ${option.line}`
                ).toBe(option.text.trim());
            }
        }
    });

    it("never points two options at the same line", () => {
        for (const incident of findLine) {
            const lines = incident.options.map((o) => o.line);

            expect(new Set(lines).size, named(incident)).toBe(lines.length);
        }
    });
});

describe("choose_patch incidents propose replacements, not locations", () => {
    const choosePatch = INCIDENTS.filter((i) => i.challengeType === "choose_patch");

    it("has some", () => {
        expect(choosePatch.length).toBeGreaterThan(0);
    });

    it("carries no line numbers", () => {
        // line_number is what distinguishes the two renderers. A patch option
        // with one would render as a line to click.
        for (const incident of choosePatch) {
            for (const option of incident.options) {
                expect(option.line, `${named(incident)}: ${option.text}`).toBeUndefined();
            }
        }
    });
});

describe("the clock each incident will get is reasonable", () => {
    it("gives the opening hunts no clock and everything else a fair one", () => {
        for (const incident of INCIDENTS) {
            const budget = timeLimitMs(incident.difficulty, countCodeLines(incident.code));

            if (incident.difficulty === 1) {
                expect(budget, `${named(incident)} should be untimed`).toBeNull();
                continue;
            }

            expect(budget, named(incident)).toBeGreaterThanOrEqual(BUG_HUNT_MIN_TIME_MS);
            expect(budget, named(incident)).toBeLessThanOrEqual(BUG_HUNT_MAX_TIME_MS);
        }
    });

    it("actually tightens as the bank gets harder", () => {
        // The measured defect this replaces: difficulty 1 averaged 60.8s and
        // difficulty 5 averaged 72.0s, so the clock got LOOSER as the bugs got
        // harder. Averages per tier must now fall.
        const averages = [2, 3, 4, 5].map((tier) => {
            const budgets = INCIDENTS.filter((i) => i.difficulty === tier).map(
                (i) => timeLimitMs(tier, countCodeLines(i.code))!
            );

            return budgets.reduce((a, b) => a + b, 0) / budgets.length;
        });

        for (let i = 1; i < averages.length; i++) {
            expect(averages[i]!, `tier ${i + 2} vs ${i + 1}`).toBeLessThan(averages[i - 1]!);
        }
    });

    it("keeps snippets short enough to hold in your head", () => {
        // Bug Hunt is about reasoning, not scrolling. Difficulty comes from what
        // the code does, not from how much of it there is.
        for (const incident of INCIDENTS) {
            expect(countCodeLines(incident.code), named(incident)).toBeLessThanOrEqual(12);
        }
    });
});

describe("the seed is safe to apply", () => {
    it("skips incidents that already exist", () => {
        expect(SEED).toMatch(/IF EXISTS \(SELECT 1 FROM bug_hunt_incidents WHERE slug = p_slug\)/);
    });

    it("cleans up its own helper", () => {
        expect(SEED).toMatch(/DROP FUNCTION seed_bug_hunt_incident/);
    });
});
