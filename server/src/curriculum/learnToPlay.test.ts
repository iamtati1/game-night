import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { buildCurriculumFixture, type CurriculumFixture } from "./database.fixture.js";
import { curriculumEligible, metConceptsCte } from "./eligibility.js";
import { roleEligible } from "./roles.js";
import {
    COMPLETABLE_INTRODUCTION_SQL,
    NEXT_INTRODUCTION_SQL,
    RECORD_INTRODUCTION_SQL,
    type Introduction
} from "./queries.js";
import { ELIGIBLE_QUESTION_PREDICATE } from "../questions/queries.js";
import { ELIGIBLE_INCIDENT_PREDICATE } from "../bugHunt/queries.js";

/**
 * The first complete Learn -> Play loop, walked end to end against a real
 * PostgreSQL.
 *
 *     new learner
 *       -> primitive-types is reachable (it is the curriculum's only root)
 *       -> its introduction is offered
 *       -> its practice is withheld
 *       -> the learner acknowledges the Learn Beat
 *       -> the concept is encountered
 *       -> the introduction is withheld
 *       -> the practice is dealt by the existing pacing
 *
 * NOT ENCOUNTERED -> ENCOUNTERED is the entire transition under test. Nothing
 * here asserts anything about understanding, accuracy or mastery, and two tests
 * exist specifically to prove that getting the practice WRONG does not move the
 * learner backwards.
 *
 * The SQL is the exported statements from queries.ts, run verbatim. A test that
 * retyped them would be testing its own copy.
 */

/** The one exercise seed 016 tags: console.log(typeof "5", typeof 5). */
const PRACTICE_PROMPT = 'What does this log?\n\nconsole.log(typeof "5", typeof 5);';

const CONCEPT = "primitive-types";

/** 234 raw, minus equality's practise question and now minus this one. */
const NEW_LEARNER_CANDIDATES = 232;

let fx: CurriculumFixture;
let practiceQuestionId: string;
let equalityQuestionId: string;

beforeAll(async () => {
    fx = await buildCurriculumFixture();

    const [practice] = await fx.rows<{ id: string }>(
        `SELECT id FROM questions WHERE prompt = $1`,
        [PRACTICE_PROMPT]
    );

    expect(practice, "seed 016 must tag an existing question").toBeDefined();
    practiceQuestionId = practice!.id;

    const [equality] = await fx.rows<{ id: string }>(
        `SELECT q.id FROM questions q
         JOIN challenges ch ON ch.id = q.challenge_id
         JOIN concepts c    ON c.id  = ch.concept_id
         WHERE c.slug = 'equality'`
    );

    equalityQuestionId = equality!.id;
}, 120_000);

// ── the runtime, composed exactly as production composes it ─────────────

async function nextIntroduction(userId: string): Promise<Introduction | null> {
    const found = await fx.rows<Introduction>(NEXT_INTRODUCTION_SQL, [userId]);

    return found[0] ?? null;
}

/** What the route does: check it is completable, then record it. */
async function completeIntroduction(
    userId: string,
    challengeId: string
): Promise<Introduction | null> {
    const allowed = await fx.rows<Introduction>(COMPLETABLE_INTRODUCTION_SQL, [
        userId,
        challengeId
    ]);

    if (allowed.length === 0) {
        return null;
    }

    await fx.db.query(RECORD_INTRODUCTION_SQL, [userId, challengeId]);

    return allowed[0]!;
}

/** Exactly what createSessionWithQuestions selects. */
async function selectable(userId: string): Promise<string[]> {
    const found = await fx.rows<{ id: string }>(
        `WITH ${metConceptsCte("$1")}
         SELECT q.id FROM questions q
         WHERE ${ELIGIBLE_QUESTION_PREDICATE}
           AND ${curriculumEligible("q")}
           AND ${roleEligible("q")}`,
        [userId]
    );

    return found.map((r) => r.id);
}

async function selectableIncidents(userId: string): Promise<string[]> {
    const found = await fx.rows<{ slug: string }>(
        `WITH ${metConceptsCte("$1")}
         SELECT i.slug FROM bug_hunt_incidents i
         WHERE ${ELIGIBLE_INCIDENT_PREDICATE}
           AND ${curriculumEligible("i")}
           AND ${roleEligible("i")}`,
        [userId]
    );

    return found.map((r) => r.slug);
}

// ── the seeded slice ─────────────────────────────────────────────────────

describe("seed 016 creates exactly one introduction and one exercise", () => {
    it("adds an active introduce challenge for primitive-types", async () => {
        // Seed 018 added a second introduction, for `assignment`, so this is no
        // longer the only one -- which is the journey growing rather than a
        // regression. Asserted by concept instead of by count.
        const [intro] = await fx.rows<{ slug: string; demand: string }>(
            `SELECT c.slug, d.slug AS demand
             FROM challenges ch
             JOIN concepts c ON c.id = ch.concept_id
             JOIN demands d  ON d.id = ch.demand_id
             WHERE ch.role = 'introduce' AND ch.is_active AND c.slug = $1`,
            [CONCEPT]
        );

        expect(intro).toBeDefined();
        expect(intro!.demand, "an introduction asks the shallowest rung").toBe("recognise");
    });

    it("gives the introduction no content row of its own", async () => {
        // A Learn Beat is not dealt. If a question ever pointed at the
        // introduction it would enter the Code Blitz pool and be scored.
        const [{ n }] = await fx.rows<{ n: number }>(
            `SELECT COUNT(*)::INT n FROM questions q
             JOIN challenges ch ON ch.id = q.challenge_id
             WHERE ch.role = 'introduce'`
        );

        expect(n).toBe(0);
    });

    it("tags exactly one more question than the equality slice did", async () => {
        const [{ n }] = await fx.rows<{ n: number }>(
            `SELECT COUNT(*)::INT n FROM questions WHERE challenge_id IS NOT NULL`
        );

        expect(n, "one equality question plus one primitive-types question").toBe(2);
    });

    it("derives the introduction's difficulty rather than authoring it", async () => {
        // primitive-types is a beginner topic and recognise is a shallow rung,
        // so difficultyFor(beginner, recognise) = 1.
        const [intro] = await fx.rows<{ difficulty: number }>(
            `SELECT ch.difficulty FROM challenges ch WHERE ch.role = 'introduce'`
        );

        expect(intro!.difficulty).toBe(1);
    });
});

// ── 1 · a brand-new learner ──────────────────────────────────────────────

describe("1 · a brand-new learner is offered the introduction, not the exercise", () => {
    it("offers primitive-types", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("lp1@example.com");
            const introduction = await nextIntroduction(learner);

            expect(introduction).not.toBeNull();
            expect(introduction!.conceptSlug).toBe(CONCEPT);
        });
    });

    it("carries the curriculum's own words, so the client writes no lesson copy", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("lp1b@example.com");
            const introduction = await nextIntroduction(learner);

            expect(introduction!.conceptName).toBe("Identifying Primitive Types");
            expect(introduction!.objective).toBe("name what kind of thing a value is");
            expect(introduction!.meaning).toContain("primitive types");
            expect(introduction!.topicSlug).toBe("values");
        });
    });

    it("withholds the practice", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("lp1c@example.com");

            expect(await selectable(learner)).not.toContain(practiceQuestionId);
        });
    });
});

// ── 2 · completing the introduction ──────────────────────────────────────

describe("2 · acknowledging the Learn Beat is the transition", () => {
    it("moves the concept from unencountered to encountered", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("lp2@example.com");

            const before = await fx.rows<{ concept_id: string }>(
                `WITH ${metConceptsCte("$1")} SELECT * FROM met`,
                [learner]
            );

            expect(before, "nothing met yet").toHaveLength(0);

            const introduction = await nextIntroduction(learner);
            await completeIntroduction(learner, introduction!.challengeId);

            const after = await fx.rows<{ slug: string }>(
                `WITH ${metConceptsCte("$1")}
                 SELECT c.slug FROM met JOIN concepts c ON c.id = met.concept_id`,
                [learner]
            );

            expect(after.map((r) => r.slug)).toEqual([CONCEPT]);
        });
    });

    it("stops offering the introduction", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("lp2b@example.com");
            const introduction = await nextIntroduction(learner);

            await completeIntroduction(learner, introduction!.challengeId);

            expect((await nextIntroduction(learner))?.conceptSlug).not.toBe(CONCEPT);
        });
    });

    it("releases the practice", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("lp2c@example.com");
            const introduction = await nextIntroduction(learner);

            expect(await selectable(learner)).not.toContain(practiceQuestionId);

            await completeIntroduction(learner, introduction!.challengeId);

            expect(await selectable(learner)).toContain(practiceQuestionId);
        });
    });

    it("is idempotent -- a double-click records one fact, not two", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("lp2d@example.com");
            const introduction = await nextIntroduction(learner);

            await completeIntroduction(learner, introduction!.challengeId);
            const second = await completeIntroduction(learner, introduction!.challengeId);

            expect(second, "the second report is accepted, not refused").not.toBeNull();

            const [{ n }] = await fx.rows<{ n: number }>(
                `SELECT COUNT(*)::INT n FROM introduction_completions WHERE user_id = $1`,
                [learner]
            );

            expect(n).toBe(1);
        });
    });

    it("refuses a challenge that is not an introduction", async () => {
        // The client sends the id, so the server checks what it is. Without
        // this, a learner could mark any concept encountered without seeing it.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("lp2e@example.com");
            const [practise] = await fx.rows<{ id: string }>(
                `SELECT id FROM challenges WHERE role = 'practise' LIMIT 1`
            );

            expect(await completeIntroduction(learner, practise!.id)).toBeNull();
        });
    });

    it("refuses an introduction whose prerequisites are unmet", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("lp2f@example.com");
            const intro = await fx.challengeFor("equality", "introduce");

            await fx.makeTeachable("type-coercion");

            expect(
                await completeIntroduction(learner, intro.challengeId),
                "equality is out of reach, so its introduction is not due"
            ).toBeNull();
        });
    });
});

// ── 3 · practice does not move the learner backwards ─────────────────────

describe("3 · playing the practice leaves the concept encountered", () => {
    for (const status of ["answered", "timed_out"] as const) {
        it(`stays encountered after a ${status} practice question`, async () => {
            await fx.scenario(async () => {
                const learner = await fx.insertUser(`lp3-${status}@example.com`);
                const introduction = await nextIntroduction(learner);

                await completeIntroduction(learner, introduction!.challengeId);
                await fx.encounter(learner, practiceQuestionId, status);

                expect(
                    (await nextIntroduction(learner))?.conceptSlug,
                    "not re-introduced -- the journey has moved on"
                ).not.toBe(CONCEPT);
                expect(await selectable(learner)).toContain(practiceQuestionId);
            });
        });
    }

    it("stays encountered after getting the practice WRONG", async () => {
        // The point of encounter-based state. A learner who answered incorrectly
        // has still met the concept; sending them back to the introduction would
        // be a mastery judgement this slice deliberately does not make.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("lp3-wrong@example.com");
            const introduction = await nextIntroduction(learner);

            await completeIntroduction(learner, introduction!.challengeId);

            const [session] = await fx.rows<{ id: string }>(
                `INSERT INTO game_sessions (user_id, game_id, status, completed_at)
                 VALUES ($1, (SELECT id FROM games WHERE slug = 'code-blitz'),
                         'completed', CURRENT_TIMESTAMP)
                 RETURNING id`,
                [learner]
            );

            await fx.db.query(
                `INSERT INTO session_questions
                     (game_session_id, question_id, display_order, prompt_text, status,
                      served_at, answered_at, is_correct, selected_option_id,
                      selected_option_text, correct_option_text)
                 SELECT $1, $2, 1, 'p', 'answered',
                        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, FALSE,
                        o.id, o.option_text, 'x'
                 FROM question_options o
                 WHERE o.question_id = $2 AND NOT o.is_correct
                 LIMIT 1`,
                [session!.id, practiceQuestionId]
            );

            expect((await nextIntroduction(learner))?.conceptSlug).not.toBe(CONCEPT);
            expect(await selectable(learner)).toContain(practiceQuestionId);
        });
    });

    it("records no score, no XP and no session for the introduction itself", async () => {
        // Completing a Learn Beat must not look like having played anything.
        await fx.scenario(async () => {
            const learner = await fx.insertUser("lp3-xp@example.com");
            const introduction = await nextIntroduction(learner);

            await completeIntroduction(learner, introduction!.challengeId);

            const [{ n }] = await fx.rows<{ n: number }>(
                `SELECT COUNT(*)::INT n FROM game_sessions WHERE user_id = $1`,
                [learner]
            );

            expect(n, "an introduction is not a game played").toBe(0);
        });
    });
});

// ── 4 · per-user isolation ───────────────────────────────────────────────

describe("4 · one learner's introduction is not another's", () => {
    it("releases the practice only for the learner who completed it", async () => {
        await fx.scenario(async () => {
            const studious = await fx.insertUser("lp4a@example.com");
            const bystander = await fx.insertUser("lp4b@example.com");
            const introduction = await nextIntroduction(studious);

            await completeIntroduction(studious, introduction!.challengeId);

            expect(await selectable(studious)).toContain(practiceQuestionId);
            expect(await selectable(bystander)).not.toContain(practiceQuestionId);
            expect(
                await nextIntroduction(bystander),
                "the bystander is still owed the introduction"
            ).not.toBeNull();
        });
    });
});

// ── 5 · prerequisites still gate the introduction ────────────────────────

describe("5 · an introduction is only offered for a reachable concept", () => {
    it("never offers one whose prerequisites are unmet and teachable", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("lp5@example.com");

            await fx.challengeFor("equality", "introduce");
            await fx.makeTeachable("type-coercion");

            const offered = await nextIntroduction(learner);

            expect(
                offered!.conceptSlug,
                "equality is behind an unmet prerequisite, so the root comes first"
            ).toBe(CONCEPT);
        });
    });

    it("is why primitive-types was chosen -- nothing can gate it", async () => {
        // It sits one step in now, behind `console-output`, which has no content
        // and therefore cannot block anyone. An unteachable prerequisite is not
        // a barrier -- the rule eligibility.ts has applied since the first slice.
        const [{ n }] = await fx.rows<{ n: number }>(
            `SELECT COUNT(*)::INT n
             FROM prerequisites p
             JOIN concepts c ON c.id = p.concept_id
             WHERE c.slug = $1
               AND EXISTS (SELECT 1 FROM challenges ch
                           WHERE ch.concept_id = p.requires_id AND ch.is_active)`,
            [CONCEPT]
        );

        expect(n).toBe(0);
    });
});

// ── 6 · cross-game state is unchanged ────────────────────────────────────

describe("6 · the introduction joins the existing cross-game state", () => {
    it("is a third source of encounters, not a replacement for the two", async () => {
        const cte = metConceptsCte("$1");

        expect(cte).toContain("session_questions");
        expect(cte).toContain("bug_hunt_rounds");
        expect(cte).toContain("introduction_completions");
    });

    it("lets a Bug Hunt round still mark a concept encountered", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("lp6@example.com");
            const introduction = await nextIntroduction(learner);
            const slug = await fx.attachIncident(introduction!.challengeId);

            // Deliberately NOT completing the introduction: playing content
            // attached to the concept is still an encounter on its own terms.
            await fx.encounterIncident(learner, slug, "resolved");

            expect((await nextIntroduction(learner))?.conceptSlug).not.toBe(CONCEPT);
            expect(await selectable(learner)).toContain(practiceQuestionId);
        });
    });
});

// ── 7 · equality regression ──────────────────────────────────────────────

describe("7 · equality is untouched and still needs an introduction", () => {
    it("withholds its practise question from a brand-new learner", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("lp7@example.com");

            expect(await selectable(learner)).not.toContain(equalityQuestionId);
        });
    });

    it("withholds its two Bug Hunt incidents too", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("lp7b@example.com");
            const incidents = await selectableIncidents(learner);

            for (const slug of ["order-lookup-string-id", "profile-clear-field-null"]) {
                expect(incidents).not.toContain(slug);
            }
        });
    });

    it("is not unlocked by completing a different concept's introduction", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("lp7c@example.com");
            const introduction = await nextIntroduction(learner);

            await completeIntroduction(learner, introduction!.challengeId);

            expect(await selectable(learner)).not.toContain(equalityQuestionId);
        });
    });

    it("still has no introduction of its own", async () => {
        const [{ n }] = await fx.rows<{ n: number }>(
            `SELECT COUNT(*)::INT n FROM challenges ch
             JOIN concepts c ON c.id = ch.concept_id
             WHERE c.slug = 'equality' AND ch.role = 'introduce'`
        );

        expect(n).toBe(0);
    });
});

// ── 8 · untagged content is untouched ────────────────────────────────────

describe("8 · the transitional escape hatch is unchanged", () => {
    it("keeps every untagged question selectable, before and after", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("lp8@example.com");
            const untagged = await fx.rows<{ id: string }>(
                `SELECT q.id FROM questions q
                 WHERE q.challenge_id IS NULL AND ${ELIGIBLE_QUESTION_PREDICATE}`
            );

            expect(untagged).toHaveLength(NEW_LEARNER_CANDIDATES);

            const before = await selectable(learner);
            const introduction = await nextIntroduction(learner);

            await completeIntroduction(learner, introduction!.challengeId);

            const after = await selectable(learner);

            for (const q of untagged) {
                expect(before, `untagged ${q.id} before`).toContain(q.id);
                expect(after, `untagged ${q.id} after`).toContain(q.id);
            }
        });
    });

    it("leaves a brand-new learner 232 candidates -- two tagged items withheld", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("lp8b@example.com");

            expect(await selectable(learner)).toHaveLength(NEW_LEARNER_CANDIDATES);
        });
    });

    it("gives the learner 233 once primitive-types is introduced", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("lp8c@example.com");
            const introduction = await nextIntroduction(learner);

            await completeIntroduction(learner, introduction!.challengeId);

            expect(await selectable(learner)).toHaveLength(NEW_LEARNER_CANDIDATES + 1);
        });
    });
});

// ── 9 · reinforce stays out ──────────────────────────────────────────────

describe("9 · reinforce is still never selected", () => {
    it("ignores a reinforce challenge on the introduced concept", async () => {
        await fx.scenario(async () => {
            const learner = await fx.insertUser("lp9@example.com");
            const again = await fx.challengeFor(CONCEPT, "reinforce");
            const introduction = await nextIntroduction(learner);

            await completeIntroduction(learner, introduction!.challengeId);

            expect(await selectable(learner)).not.toContain(again.questionId);
        });
    });

    it("seeds no reinforce challenge", async () => {
        const [{ n }] = await fx.rows<{ n: number }>(
            `SELECT COUNT(*)::INT n FROM challenges WHERE role = 'reinforce'`
        );

        expect(n).toBe(0);
    });
});

// ── the wiring ───────────────────────────────────────────────────────────

describe("the server stays authoritative and the layers stay separate", () => {
    const app = readFileSync(new URL("../app.ts", import.meta.url), "utf8");
    const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
    const queries = readFileSync(new URL("./queries.ts", import.meta.url), "utf8");

    /** Code without comments, so prose about XP cannot fail an XP check. */
    const statementsOf = (source: string) =>
        source
            .split("\n")
            .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
            .join("\n");

    it("mounts the curriculum router before the catch-all /api router", () => {
        const curriculum = app.indexOf('app.use("/api/curriculum"');
        const catchAll = app.indexOf('app.use("/api", gameRouter)');

        expect(curriculum).toBeGreaterThan(-1);
        expect(curriculum).toBeLessThan(catchAll);
    });

    it("requires authentication on every endpoint", () => {
        const handlers = routes.match(/curriculumRouter\.(get|post)\([\s\S]*?requireAuth/g) ?? [];
        const registrations = routes.match(/curriculumRouter\.(get|post)\(/g) ?? [];

        // Counted against itself rather than against a literal. A fixed number
        // here broke on every new endpoint without ever catching an unguarded
        // one, which is the thing actually worth protecting.
        expect(registrations.length, "the router has endpoints").toBeGreaterThan(0);
        expect(handlers.length, "every one guarded by requireAuth").toBe(
            registrations.length
        );
    });

    it("reuses both eligibility layers rather than restating the graph", () => {
        expect(queries).toContain('curriculumEligible("tagged")');
        expect(queries).toContain('roleEligible("tagged")');
        expect(queries, "the prerequisite join has one home").not.toContain(
            "JOIN prerequisites"
        );
    });

    it("adds no XP, score or session to the introduction", () => {
        // Scoped to the introduction handlers rather than the whole file. The
        // router also serves the journey, which legitimately reports the points
        // a learner has earned by demonstrating concepts -- a different endpoint
        // answering a different question. What must stay true is that being
        // INTRODUCED to a concept pays nothing.
        const introductionHandlers = [
            routes.slice(
                routes.indexOf('curriculumRouter.get("/introduction"'),
                routes.indexOf('curriculumRouter.get("/journey"')
            ),
            routes.slice(routes.indexOf('curriculumRouter.post(\n    "/introductions/'))
        ].join("\n");

        for (const word of ["xp", "score", "points", "game_sessions"]) {
            const mention = new RegExp(`\\b${word}\\b`, "i");

            expect(
                mention.test(statementsOf(introductionHandlers)),
                `the introduction endpoints mention ${word}`
            ).toBe(false);
            expect(
                mention.test(statementsOf(queries)),
                `queries.ts mentions ${word}`
            ).toBe(false);
        }
    });
});
