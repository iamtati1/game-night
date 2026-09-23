import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";
import { journeyCte, withinJourney } from "./journey.js";
import { curriculumCtes } from "./selection.js";
import { metConceptsCte } from "./eligibility.js";
import { metDifficultiesCte } from "./frontier.js";
import { CODE_BLITZ_CANDIDATES_SQL, byCurriculumPreference } from "../game/queries.js";
import { dealSession } from "../game/curve.js";
import { QUESTIONS_PER_SESSION } from "../game/scoring.js";

/**
 * "Where am I in JavaScript?" -- the learner journey, end to end.
 *
 * The product question this answers is not "which question am I eligible for"
 * but "am I being taught JavaScript in an order that makes sense". So the
 * assertions are about TOPICS a beginner is and is not shown, measured through
 * the shipping candidate query and the real dealer.
 */

let fx: CurriculumFixture;

/** Topic display_order, read from the curriculum rather than assumed. */
let order: Record<string, number>;

beforeAll(async () => {
    fx = await buildCurriculumFixture();

    const topics = await fx.rows<{ slug: string; display_order: number }>(
        `SELECT slug, display_order FROM topics`
    );

    order = Object.fromEntries(topics.map((t) => [t.slug, t.display_order]));
}, 120_000);

async function journey(userId: string) {
    const [row] = await fx.rows<{ reached: number; ceiling: number }>(
        `WITH ${curriculumCtes("$1")},
              ${journeyCte("$1", QUESTIONS_PER_SESSION)}
         SELECT * FROM journey`,
        [userId]
    );

    return row!;
}

interface Row {
    id: string;
    topic: string | null;
    difficulty: number | null;
    concept_id: string | null;
}

async function pool(userId: string): Promise<Row[]> {
    return fx.rows<Row>(CODE_BLITZ_CANDIDATES_SQL, ["0", userId, "code-blitz"]);
}

async function run(userId: string): Promise<Row[]> {
    return dealSession(byCurriculumPreference(await pool(userId)) as never, QUESTIONS_PER_SESSION, () => 0.5);
}

/** Plays every question of a dealt run, as the game records it. */
async function play(userId: string, questions: Row[]): Promise<void> {
    const [session] = await fx.rows<{ id: string }>(
        `INSERT INTO game_sessions (user_id, game_id, status, completed_at)
         VALUES ($1, (SELECT id FROM games WHERE slug = 'code-blitz'),
                 'completed', CURRENT_TIMESTAMP)
         RETURNING id`,
        [userId]
    );

    for (const [i, q] of questions.entries()) {
        await fx.db.query(
            `INSERT INTO session_questions
                 (game_session_id, question_id, display_order, prompt_text, status,
                  served_at, timed_out_at, correct_option_text)
             VALUES ($1, $2, $3, 'p', 'timed_out',
                     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'x')`,
            [session!.id, q.id, i + 1]
        );
    }
}

// ── the beginner starts at the beginning ─────────────────────────────────

describe("a new learner starts at the start of JavaScript", () => {
    it("is held at `variables`, the first topic that can fill a session", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("t1@example.com");

            expect(await journey(learner)).toEqual({
                reached: 0,
                ceiling: order.variables
            });
        });
    });

    it("is offered only values and variables", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("t2@example.com");
            const topics = new Set((await pool(learner)).map((r) => r.topic));

            expect([...topics].sort()).toEqual(["values", "variables"]);
        });
    });

    it("never sees async, scope, objects or array methods", async () => {
        // The playtest complaint, as a test. These are not merely deprioritised
        // -- they are not in the pool at all.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("t3@example.com");
            const topics = new Set((await pool(learner)).map((r) => r.topic));

            for (const advanced of ["async", "scope", "objects", "array-methods", "arrays"]) {
                expect(topics, `${advanced} must be out of reach`).not.toContain(advanced);
            }
        });
    });

    it("still gets a full ten-question game", async () => {
        // The floor exists so the gate can be hard without starving a run.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("t4@example.com");

            expect(await run(learner)).toHaveLength(QUESTIONS_PER_SESSION);
        });
    });

    it("gets a run that climbs without leaving the beginner topics", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("t5@example.com");
            const dealt = await run(learner);
            const tiers = dealt.map((r) => r.difficulty ?? 2);

            expect(tiers[0], "still opens on the fundamentals").toBe(1);
            expect(Math.max(...tiers), "still climbs").toBeGreaterThan(1);
            expect(
                new Set(dealt.map((r) => r.topic)),
                "and never leaves the first two topics"
            ).toEqual(new Set(["values", "variables"]));
        });
    });
});

// ── the journey advances, one topic at a time ────────────────────────────

describe("playing moves the learner along the journey", () => {
    it("advances to the next topic after a run", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("t6@example.com");

            await play(learner, await run(learner));

            const after = await journey(learner);

            expect(after.reached).toBe(order.variables);
            expect(after.ceiling, "operators comes next").toBe(order.operators);
        });
    });

    it("keeps the earlier topics available rather than moving past them", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("t7@example.com");

            await play(learner, await run(learner));

            const topics = new Set((await pool(learner)).map((r) => r.topic));

            expect(topics, "values is not retired").toContain("values");
            expect(topics, "nor variables").toContain("variables");

            // operators is now within the journey -- and its only question is
            // the tagged equality exercise, which role still withholds because
            // equality has no introduction. The gates compose: passing the
            // journey is necessary, not sufficient.
            expect((await journey(learner)).ceiling).toBe(order.operators);
            expect(topics, "so nothing from operators is playable yet").not.toContain(
                "operators"
            );
        });
    });

    it("advances by at most one topic per run", async () => {
        // The pool can never hold a topic above the ceiling, so the deepest
        // topic played cannot exceed it. That is what makes the walk sequential
        // rather than a jump.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("t8@example.com");
            let previous = (await journey(learner)).ceiling;

            for (let session = 0; session < 3; session += 1) {
                await play(learner, await run(learner));

                const next = (await journey(learner)).ceiling;

                expect(next).toBeGreaterThanOrEqual(previous);
                expect(next - previous, "one step at a time").toBeLessThanOrEqual(2);
                previous = next;
            }
        });
    });

    it("steps over topics that have no content at all", async () => {
        // strings (5), errors (12), dom (13), this-and-classes (15) and
        // algorithms (16) have no questions. A ceiling that parked on one would
        // be a wall nobody could climb, because you cannot play what does not
        // exist.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("t9@example.com");

            // Reach control-flow, whose successor `strings` is empty.
            await fx.db.query(
                `INSERT INTO game_sessions (user_id, game_id, status, completed_at)
                 VALUES ($1, (SELECT id FROM games WHERE slug = 'code-blitz'),
                         'completed', CURRENT_TIMESTAMP)`,
                [learner]
            );

            const [conditional] = await fx.rows<{ id: string }>(
                `SELECT id FROM questions WHERE topic = 'conditionals' AND is_active LIMIT 1`
            );

            await fx.db.query(
                `INSERT INTO session_questions
                     (game_session_id, question_id, display_order, prompt_text, status,
                      served_at, timed_out_at, correct_option_text)
                 VALUES ((SELECT MAX(id) FROM game_sessions WHERE user_id = $1),
                         $2, 1, 'p', 'timed_out',
                         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'x')`,
                [learner, conditional!.id]
            );

            const after = await journey(learner);

            expect(after.reached, "legacy `conditionals` maps to control-flow").toBe(
                order["control-flow"]
            );
            expect(after.ceiling, "strings is empty, so loops is next").toBe(order.loops);
        });
    });
});

// ── the journey is a different signal from curriculum state ──────────────

describe("journey position and curriculum state are separate", () => {
    it("advances the journey on untagged content but no curriculum state", async () => {
        // The distinction that lets the journey work at all. Untagged questions
        // say which TOPIC the learner has been doing; only challenges say which
        // CONCEPT was practiced.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("t10@example.com");
            const dealt = await run(learner);

            await play(learner, dealt.filter((r) => r.concept_id === null));

            expect((await journey(learner)).reached).toBeGreaterThan(0);

            const concepts = await fx.rows(
                `WITH ${metConceptsCte("$1")} SELECT * FROM met`,
                [learner]
            );
            const rungs = await fx.rows(
                `WITH ${metDifficultiesCte("$1")} SELECT * FROM met_difficulties`,
                [learner]
            );

            expect(concepts, "no concept met").toHaveLength(0);
            expect(rungs, "no rung stood on").toHaveLength(0);
        });
    });

    it("does not let the journey bypass the curriculum gates", async () => {
        // The tagged primitive-types exercise sits in `values`, topic 1, so the
        // journey allows it from the first run. Role still withholds it until
        // the introduction is completed.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("t11@example.com");
            const [tagged] = await fx.rows<{ id: string }>(
                `SELECT q.id FROM questions q
                 JOIN challenges ch ON ch.id = q.challenge_id
                 JOIN concepts c    ON c.id  = ch.concept_id
                 WHERE c.slug = 'primitive-types'`
            );

            expect((await pool(learner)).map((r) => r.id)).not.toContain(tagged!.id);
        });
    });

    it("keeps equality out of reach for a beginner twice over", async () => {
        // operators is topic 3, above a fresh learner's ceiling, AND equality
        // has no introduction. Either alone would withhold it.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("t12@example.com");
            const [equality] = await fx.rows<{ id: string }>(
                `SELECT q.id FROM questions q
                 JOIN challenges ch ON ch.id = q.challenge_id
                 JOIN concepts c    ON c.id  = ch.concept_id
                 WHERE c.slug = 'equality'`
            );

            expect((await pool(learner)).map((r) => r.id)).not.toContain(equality!.id);
            expect(order.operators).toBeGreaterThan((await journey(learner)).ceiling);
        });
    });
});

// ── the gate itself ──────────────────────────────────────────────────────

describe("the journey gate", () => {
    it("is a hard filter, not a preference", async () => {
        const rule = withinJourney("q");

        expect(rule).toContain("<= (SELECT ceiling FROM journey)");
    });

    it("lets a question with an unrecognised topic through", () => {
        // Content should not become undealable because someone typed a topic the
        // curriculum has not heard of. COALESCE(..., 0) puts it below every
        // ceiling rather than above.
        expect(withinJourney("q")).toContain("0\n        ) <= ");
    });

    it("refuses anything but a placeholder and an alias", () => {
        expect(() => journeyCte("1", 10)).toThrow();
        expect(() => journeyCte("$1", 0)).toThrow();
        expect(() => withinJourney("q; DROP TABLE users")).toThrow();
    });
});
