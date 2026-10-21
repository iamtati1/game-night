import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { BUG_HUNT_INCIDENTS_PER_SESSION } from "../bugHunt/scoring.js";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";
import { INCIDENT_EXERCISE_SQL } from "./encounter.js";

/**
 * Debugging for a beginner, inside the concept they are learning.
 *
 * A Bug Hunt run is six incidents from ideas the learner has met, so a
 * beginner cannot start one. The curriculum already holds their debugging: each
 * early concept has a diagnose rung realised by a Bug Hunt incident, played in
 * the concept itself, untimed and unscored. These pin what makes that a real
 * beginner path rather than a lesser Bug Hunt:
 *
 *   - one scoped bug in a short program, with hints and reasoned feedback;
 *   - the hints reach the encounter;
 *   - it records rung evidence only -- never a Bug Hunt run, its score or XP.
 */

let fx: CurriculumFixture;

beforeAll(async () => {
    fx = await buildCurriculumFixture();
}, 300000);

interface BeginnerIncident {
    challenge_id: string;
    concept: string;
    topic: string;
    code: string;
    hints: string[];
    correct: number;
    options: number;
    explained: number;
}

async function beginnerIncidents(): Promise<BeginnerIncident[]> {
    return fx.rows<BeginnerIncident>(`
        SELECT ch.id::text AS challenge_id, c.slug AS concept, t.slug AS topic, i.code, i.hints,
               (SELECT COUNT(*)::int FROM bug_hunt_options o WHERE o.incident_id = i.id AND o.is_active AND o.is_correct) AS correct,
               (SELECT COUNT(*)::int FROM bug_hunt_options o WHERE o.incident_id = i.id AND o.is_active) AS options,
               (SELECT COUNT(*)::int FROM bug_hunt_options o
                WHERE o.incident_id = i.id AND o.is_active AND COALESCE(TRIM(o.explanation), '') <> '') AS explained
        FROM bug_hunt_incidents i
        JOIN challenges ch ON ch.id = i.challenge_id AND ch.role = 'practise' AND ch.is_active
        JOIN demands d     ON d.id  = ch.demand_id AND d.slug IN ('diagnose', 'repair')
        JOIN concepts c    ON c.id  = ch.concept_id
        JOIN topics t      ON t.id  = c.topic_id AND t.tier = 'beginner'
        WHERE i.is_active
        ORDER BY ch.id`);
}

describe("a beginner's debugging inside a concept", () => {
    it("exists for the first concepts a learner meets", async () => {
        const concepts = new Set((await beginnerIncidents()).map((i) => i.concept));
        expect(concepts.has("console-output")).toBe(true);
        expect(concepts.has("reassignment")).toBe(true);
    });

    it("is one bug in a short program, with hints and a reason for every choice", async () => {
        for (const i of await beginnerIncidents()) {
            const where = `${i.concept} (challenge ${i.challenge_id})`;
            expect(i.correct, `${where}: exactly one bug`).toBe(1);
            // Hints where they were authored. One incident is deliberately
            // hintless -- three lines, one idea (bugHunt/learningSlice.test.ts
            // pins that) -- so this asserts the shape, not a minimum.
            expect(i.hints.length, `${where}: at most three hints`).toBeLessThanOrEqual(3);
            expect(i.explained, `${where}: every choice explains itself`).toBe(i.options);
        }
    });

    it("is a short program on the first topics, where a full hunt cannot open yet", async () => {
        // Values and Variables are where a learner meets debugging before six
        // incidents are in reach. (Operators' two equality incidents run to 11
        // and 12 lines -- longer than a first bug should be, and noted rather
        // than hidden by a looser number here.)
        for (const i of (await beginnerIncidents()).filter((x) => x.topic === "values" || x.topic === "variables")) {
            expect(i.code.split("\n").length, `${i.concept}: short enough to read`).toBeLessThanOrEqual(5);
        }
    });

    it("has hints on nearly every one, for the encounter to offer", async () => {
        const all = await beginnerIncidents();
        expect(all.filter((i) => i.hints.length > 0).length).toBeGreaterThanOrEqual(all.length - 1);
    });

    it("carries its hints into the encounter, weakest first", async () => {
        const first = (await beginnerIncidents()).find((i) => i.hints.length > 0);
        const served = await fx.rows<{ hints: string[] }>(INCIDENT_EXERCISE_SQL, [first!.challenge_id]);

        expect(served[0]!.hints).toEqual(first!.hints);
    });
});

describe("beginner practice is not a Bug Hunt run", () => {
    const encounter = readFileSync(new URL("./encounter.ts", import.meta.url), "utf8");
    const judge = encounter.slice(
        encounter.indexOf("export async function judgeAnswer"),
        encounter.indexOf("/* ------------------------------------------------ the one reachability rule */")
    );

    it("records a correct diagnosis as the rung cleared, and nothing else", () => {
        expect(judge).toMatch(/if \(row\.is_correct\) \{\s*await recordActivityCompletion\(userId, challengeId, neededRetry\);\s*\}/);
    });

    it("can never write a Bug Hunt session, round, score or XP", () => {
        // A full run's evidence is a completed bug-hunt game_session with its
        // rounds, score and XP. The encounter has no path to any of it.
        expect(encounter).not.toMatch(/INSERT INTO game_sessions|UPDATE game_sessions/);
        expect(encounter).not.toMatch(/INSERT INTO bug_hunt_rounds|UPDATE bug_hunt_rounds/);
        expect(encounter).not.toMatch(/xp_earned/);
    });

    it("leaves the full run at six incidents", () => {
        expect(BUG_HUNT_INCIDENTS_PER_SESSION).toBe(6);
    });
});

describe("each beginner bug's answers are about that bug", () => {
    const SEED_084 = new URL("../../seeds/084_console_misspelt_distractor.sql", import.meta.url);

    async function options(slug: string) {
        return fx.rows<{ id: string; option_text: string; explanation: string; is_correct: boolean }>(
            `SELECT o.id::text AS id, o.option_text, o.explanation, o.is_correct
             FROM bug_hunt_options o JOIN bug_hunt_incidents i ON i.id = o.incident_id
             WHERE i.slug = $1 AND o.is_active ORDER BY o.id`,
            [slug]
        );
    }

    it("offers console-misspelt a wrong answer about its own code, not another program's sum", async () => {
        // Browser QA: `consol.log("Hello");` offered "The sum 5 + 3 is wrong",
        // explained with a different incident's program.
        const opts = await options("console-misspelt");
        expect(opts.map((o) => `${o.option_text} ${o.explanation}`).join(" ")).not.toMatch(/5 \+ 3|sum/i);

        const wrong = opts.find((o) => !o.is_correct)!;
        expect(wrong.option_text).toBe("The quotation marks around Hello");
        expect(wrong.explanation).toMatch(/consol/);
    });

    it("never explains a wrong answer with numbers that are not in the program", async () => {
        // The class of mistake behind it: a distractor copied from a sibling
        // bug, still talking about the sibling's code ("5 + 3 really is 8").
        // Shared wording is fine where it is true for both -- two quote bugs
        // legitimately share "Look at the quotation marks" -- so this checks
        // the thing that made the copy wrong: values the program never has.
        // "line 3" is a position, not a value, and is ignored.
        const rows = await fx.rows<{ slug: string; code: string; explanation: string; option_text: string }>(`
            SELECT i.slug, i.code, o.explanation, o.option_text
            FROM bug_hunt_options o
            JOIN bug_hunt_incidents i ON i.id = o.incident_id
            JOIN challenges ch ON ch.id = i.challenge_id
            JOIN concepts c ON c.id = ch.concept_id
            JOIN topics t ON t.id = c.topic_id AND t.slug IN ('values', 'variables')
            WHERE o.is_active AND NOT o.is_correct AND i.is_active`);

        const strays = rows.flatMap((r) => {
            const numbers = (r.explanation.replace(/\blines? \d+/gi, "").match(/\b\d+\b/g) ?? []);
            return numbers.filter((n) => !new RegExp(`\\b${n}\\b`).test(r.code)).map((n) => `${r.slug}: "${r.option_text}" mentions ${n}`);
        });
        expect(strays).toEqual([]);
    });

    it("corrects a database seeded before the fix, in place, and only once", async () => {
        const before = (await options("console-misspelt")).find((o) => !o.is_correct)!;
        await fx.db.query(
            `UPDATE bug_hunt_options SET option_text = 'The sum 5 + 3 is wrong',
                 explanation = '5 + 3 really is 8. The trouble is that JavaScript was never asked to work it out.'
             WHERE id = $1`,
            [before.id]
        );

        const sql = (await import("node:fs")).readFileSync(SEED_084, "utf8");
        await fx.db.exec(sql);
        await fx.db.exec(sql);

        const after = (await options("console-misspelt")).find((o) => !o.is_correct)!;
        expect(after.id).toBe(before.id);
        expect(after.option_text).toBe("The quotation marks around Hello");
    });
});
