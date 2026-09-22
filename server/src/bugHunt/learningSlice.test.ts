import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "../curriculum/database.fixture.js";
import { ELIGIBLE_INCIDENT_PREDICATE } from "./queries.js";

/**
 * Bug Hunt's first beginner incident, checked as a learning experience rather
 * than as a row.
 *
 * The product claim under test is that a learner meets CODE first. So the
 * assertions are about how much there is to read before the snippet, whether the
 * distractors teach anything when they are chosen, and whether the curriculum --
 * not the incident author -- supplies the explanation.
 */

const SLUG = "score-never-updated";

let fx: CurriculumFixture;

beforeAll(async () => {
    fx = await buildCurriculumFixture();
}, 120_000);

interface Incident {
    slug: string;
    title: string;
    bug_report: string;
    error_log: string | null;
    code: string;
    difficulty: number;
    challenge_type: string;
    hints: string[];
}

async function incident(slug: string): Promise<Incident> {
    const [row] = await fx.rows<Incident>(
        `SELECT slug, title, bug_report, error_log, code, difficulty, challenge_type, hints
         FROM bug_hunt_incidents WHERE slug = $1`,
        [slug]
    );

    return row!;
}

describe("the learner meets code, not an incident report", () => {
    it("says what should have happened in one short sentence", async () => {
        const it_ = await incident(SLUG);

        expect(it_.bug_report).toBe(
            "The score should be 15 after the bonus, but it prints 10."
        );
        expect(
            it_.bug_report.length,
            "a beginner should not read a paragraph before the code"
        ).toBeLessThan(80);
    });

    it("is among the leanest in the bank, though not uniquely so", async () => {
        // Worth stating plainly, because it corrects the assumption this slice
        // started from. The DATA was never the main problem at difficulty 1:
        // existing easy incidents already run 68-94 characters of prose over
        // 3-6 lines of code. What made Bug Hunt feel text-heavy was the page
        // around them -- theme, severity, title, error log, phase label, streak,
        // score, integrity meter and an in-world system voice, all of which a
        // learner reads before reaching anything debuggable.
        //
        // So this incident is ordinary by the numbers, and the slice's actual
        // work is in the presentation and in where the teaching text comes from.
        const prose = await fx.rows<{ n: number }>(
            `SELECT (LENGTH(bug_report) + LENGTH(title) + COALESCE(LENGTH(error_log), 0))::INT n
             FROM bug_hunt_incidents ORDER BY n`
        );
        const mine = await fx.rows<{ n: number }>(
            `SELECT (LENGTH(bug_report) + LENGTH(title) + COALESCE(LENGTH(error_log), 0))::INT n
             FROM bug_hunt_incidents WHERE slug = $1`,
            [SLUG]
        );

        const rank = prose.findIndex((p) => p.n >= mine[0]!.n);

        expect(rank, "in the leanest handful").toBeLessThan(5);
        expect(mine[0]!.n, "and well under the bank average of 122").toBeLessThan(90);
    });

    it("carries no error log to read past", async () => {
        expect((await incident(SLUG)).error_log).toBeNull();
    });

    it("offers no hints, because three lines with one idea have nothing to hint at", async () => {
        expect((await incident(SLUG)).hints).toEqual([]);
    });

    it("is three lines long", async () => {
        const code = (await incident(SLUG)).code;

        expect(code.split("\n")).toHaveLength(3);
        expect(code).toContain("score + 5;");
    });

    it("is the easiest incident in the bank", async () => {
        const [{ n }] = await fx.rows<{ n: number }>(
            `SELECT MIN(difficulty)::INT n FROM bug_hunt_incidents`
        );

        expect((await incident(SLUG)).difficulty).toBe(n);
    });
});

describe("every wrong answer teaches instead of scolding", () => {
    it("explains why each innocent line is innocent", async () => {
        const options = await fx.rows<{ line_number: number; is_correct: boolean; explanation: string }>(
            `SELECT o.line_number, o.is_correct, o.explanation
             FROM bug_hunt_options o
             JOIN bug_hunt_incidents i ON i.id = o.incident_id
             WHERE i.slug = $1 ORDER BY o.line_number`,
            [SLUG]
        );

        expect(options).toHaveLength(3);

        for (const o of options.filter((x) => !x.is_correct)) {
            expect(o.explanation, `line ${o.line_number} must say why it is fine`).toContain(
                "fine"
            );
            expect(o.explanation.length).toBeGreaterThan(40);
        }
    });

    it("names the misconception on the line that is actually wrong", async () => {
        const [correct] = await fx.rows<{ explanation: string }>(
            `SELECT o.explanation FROM bug_hunt_options o
             JOIN bug_hunt_incidents i ON i.id = o.incident_id
             WHERE i.slug = $1 AND o.is_correct`,
            [SLUG]
        );

        // The teaching sentence from the brief: it calculates, then discards.
        expect(correct!.explanation).toContain("throws it away");
        expect(correct!.explanation).toContain("score = score + 5");
    });
});

describe("the curriculum, not the incident, says what is being taught", () => {
    it("is tagged to assignment at the diagnose rung", async () => {
        const [row] = await fx.rows<{ concept: string; demand: string; role: string }>(
            `SELECT c.slug AS concept, d.slug AS demand, ch.role
             FROM bug_hunt_incidents i
             JOIN challenges ch ON ch.id = i.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             JOIN demands d     ON d.id  = ch.demand_id
             WHERE i.slug = $1`,
            [SLUG]
        );

        expect(row).toEqual({ concept: "assignment", demand: "diagnose", role: "practise" });
    });

    it("draws its teaching line from the concept rather than repeating it", async () => {
        // The rule shown in feedback is concepts.meaning -- authored once, in the
        // curriculum, and reusable by every future incident on this concept.
        const [row] = await fx.rows<{ meaning: string }>(
            `SELECT c.meaning FROM bug_hunt_incidents i
             JOIN challenges ch ON ch.id = i.challenge_id
             JOIN concepts c    ON c.id  = ch.concept_id
             WHERE i.slug = $1`,
            [SLUG]
        );

        expect(row!.meaning).toContain("evaluates everything on the right first");
    });

    it("is reachable -- assignment has an introduction to unlock it", async () => {
        // A practise challenge is role-withheld until the concept has been met.
        // Without an introduction this incident could never be dealt.
        const [{ n }] = await fx.rows<{ n: number }>(
            `SELECT COUNT(*)::INT n FROM challenges ch
             JOIN concepts c ON c.id = ch.concept_id
             WHERE c.slug = 'assignment' AND ch.role = 'introduce' AND ch.is_active`
        );

        expect(n).toBe(1);
    });

    it("is playable -- it passes the dealer's own eligibility predicate", async () => {
        const playable = await fx.rows<{ slug: string }>(
            `SELECT i.slug FROM bug_hunt_incidents i
             WHERE i.slug = $1 AND ${ELIGIBLE_INCIDENT_PREDICATE}`,
            [SLUG]
        );

        expect(playable).toHaveLength(1);
    });
});

describe("the page switches presentation on the curriculum, not on difficulty", () => {
    const page = readFileSync(
        new URL("../../../client/src/pages/BugHuntPage.tsx", import.meta.url),
        "utf8"
    );

    it("renders the beginner layout when a concept is attached", () => {
        expect(page).toContain("incident.concept ? (");
        expect(page).toContain("bh-learning-concept");
    });

    it("drops the theme, severity, title and error log from that layout", () => {
        const learning = page.slice(
            page.indexOf('<div className="bh-report is-learning">'),
            page.indexOf('<div className="bh-report">')
        );

        for (const noise of ["bh-theme", "bh-severity", "bh-incident-title", "bh-error-log"]) {
            expect(learning, `${noise} must not survive into the beginner layout`).not.toContain(
                noise
            );
        }
    });

    it("keeps the incident-report layout for the fifty legacy incidents", () => {
        expect(page).toContain('<div className="bh-report">');
        expect(page).toContain("bh-incident-title");
    });

    it("replaces the in-world voice with the concept's rule", () => {
        expect(page).toContain("bh-feedback-rule");
        expect(page).toContain("{!learning && (");
    });
});
