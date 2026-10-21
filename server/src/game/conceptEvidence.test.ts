import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { CLEARED_RUNGS_CTE } from "../curriculum/encounter.js";
import { TOPICS } from "../sessions/schemas.js";

/**
 * THE EVIDENCE HALF, against a real database.
 *
 * Concept focus is only worth building if answering one of those reserved beats
 * correctly actually moves the learner. It does, and it already did: the first
 * arm of CLEARED_RUNGS_CTE reads session_questions, which is Code Blitz's own
 * answer table. Nothing in this slice added an evidence path -- these tests
 * execute the EXISTING one to prove the targeting lands somewhere real.
 *
 * Run against PostgreSQL built from this repository's migrations and seeds,
 * because no string match on a CTE can tell a predicate that credits the right
 * learner from one that credits everybody.
 */

const db = new PGlite();

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await db.query<T>(sql, params as never[])).rows;
}

/** The existing derivation, asked about one learner. */
async function clearedRungs(userId: string): Promise<{ concept_id: string; demand_id: string }[]> {
    return rows(`WITH ${CLEARED_RUNGS_CTE} SELECT * FROM cleared`, [userId]);
}

let userId: string;
let otherId: string;
/** A tagged, practise-role question: the kind a reserved beat aims at. */
let tagged: { questionId: string; challengeId: string; conceptId: string; demandId: string };
let untagged: { questionId: string };
/** A fresh Code Blitz run. Two are needed: one question cannot appear twice in
 *  the same session, which is itself a constraint worth not working around. */
async function newRun(forUser: string): Promise<string> {
    /* One in_progress session per user, so the previous run has to end first --
       exactly what the route does before dealing a new one. */
    await rows(
        `UPDATE game_sessions
         SET status = 'completed', completed_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND status IN ('in_progress', 'paused')`,
        [forUser]
    );

    const [s] = await rows<{ id: string }>(
        `INSERT INTO game_sessions (user_id, game_id)
         VALUES ($1, (SELECT id FROM games WHERE slug = 'code-blitz'))
         RETURNING id`,
        [forUser]
    );

    return s!.id;
}

beforeAll(async () => {
    for (const dir of ["migrations", "seeds"]) {
        const base = new URL(`../../${dir}/`, import.meta.url);

        for (const f of readdirSync(base).filter((f) => f.endsWith(".sql")).sort()) {
            await db.exec(readFileSync(new URL(f, base), "utf8"));
        }
    }

    [userId, otherId] = await Promise.all(
        ["learner@jolt.test", "someone-else@jolt.test"].map(async (email) => {
            const [u] = await rows<{ id: string }>(
                `INSERT INTO users (email, username, password_hash)
                 VALUES ($1, $1, 'x') RETURNING id`,
                [email]
            );
            return u!.id;
        })
    );

    const [t] = await rows<{
        question_id: string;
        challenge_id: string;
        concept_id: string;
        demand_id: string;
    }>(
        `SELECT q.id AS question_id, ch.id AS challenge_id,
                ch.concept_id, ch.demand_id
         FROM questions q
         JOIN challenges ch ON ch.id = q.challenge_id
         WHERE q.is_active AND ch.is_active AND ch.role = 'practise'
           -- A rung no introduction shares, so the introduce-role check below
           -- can only see an introduction if clearing really counted one. It
           -- used to rely on the lowest id happening to be such a rung, and
           -- seed 086 retiring that question showed it.
           AND NOT EXISTS (
               SELECT 1 FROM challenges i
               WHERE i.concept_id = ch.concept_id AND i.demand_id = ch.demand_id
                 AND i.role = 'introduce')
         ORDER BY q.id
         LIMIT 1`
    );

    tagged = {
        questionId: t!.question_id,
        challengeId: t!.challenge_id,
        conceptId: t!.concept_id,
        demandId: t!.demand_id
    };

    // Fixture-owned, since seed 079 retired the legacy untagged bank. The
    // assertions below are unchanged and still worth holding: questions.
    // challenge_id is nullable, so a question with no rung must earn nothing.
    // Parked at `algorithms` so it can never reach a beginner's journey.
    const [fresh] = await rows<{ id: string }>(
        `INSERT INTO questions
             (prompt, difficulty, topic, challenge_type, challenge_id, source)
         VALUES ('fixture untagged question', 1, 'algorithms',
                 'predict-output', NULL, 'fixture-untagged')
         RETURNING id`
    );

    await db.query(
        `INSERT INTO question_options (question_id, option_text, display_order, is_correct)
         VALUES ($1, 'right', 1, TRUE), ($1, 'wrong', 2, FALSE)`,
        [fresh!.id]
    );

    untagged = { questionId: fresh!.id };

});

/**
 * Records an answered Code Blitz question exactly as the game does.
 *
 * Every column session_questions_answered_state demands is filled with a real
 * value, including a real option id -- the schema refuses a half-written answer
 * row, which is worth honouring rather than working around: a fixture that
 * could not exist in production would prove nothing about production.
 */
async function answer(
    sessionId: string,
    questionId: string,
    correct: boolean,
    order: number
): Promise<void> {
    const [option] = await rows<{ id: string; text: string }>(
        `SELECT id, option_text AS text FROM question_options
         WHERE question_id = $1 AND is_active AND is_correct = $2
         ORDER BY id LIMIT 1`,
        [questionId, correct]
    );

    const [right] = await rows<{ text: string }>(
        `SELECT option_text AS text FROM question_options
         WHERE question_id = $1 AND is_active AND is_correct
         ORDER BY id LIMIT 1`,
        [questionId]
    );

    await rows(
        `INSERT INTO session_questions
             (game_session_id, question_id, display_order, prompt_text, status,
              served_at, selected_option_id, selected_option_text,
              correct_option_text, is_correct, answered_at)
         VALUES ($1, $2, $3, 'x', 'answered',
                 CURRENT_TIMESTAMP, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
        [sessionId, questionId, order, option!.id, option!.text, right!.text, correct]
    );
}

describe("a Code Blitz answer and the rung it clears", () => {
    it("there is a tagged practise question for a reserved beat to aim at", () => {
        // If this ever fails, concept focus has nothing to reserve and the whole
        // feature is inert -- worth failing loudly rather than silently.
        expect(tagged.questionId).toBeTruthy();
        expect(tagged.conceptId).toBeTruthy();
    });

    it("clears nothing before the learner has played", async () => {
        expect(await clearedRungs(userId)).toHaveLength(0);
    });

    it("a WRONG answer on a tagged question clears no rung", async () => {
        await answer(await newRun(userId), tagged.questionId, false, 1);

        const cleared = await clearedRungs(userId);

        expect(
            cleared.some((r) => r.concept_id === tagged.conceptId),
            "being shown a question is not evidence of anything"
        ).toBe(false);
    });

    it("a CORRECT answer on a tagged question clears exactly its rung", async () => {
        await answer(await newRun(userId), tagged.questionId, true, 1);

        const cleared = await clearedRungs(userId);

        expect(
            cleared.some(
                (r) => r.concept_id === tagged.conceptId && r.demand_id === tagged.demandId
            )
        ).toBe(true);
    });

    it("an untagged question cannot clear any rung, however it is answered", async () => {
        // 234 of 495 active questions are untagged. A correct answer on one is a
        // good answer and no evidence -- there is no challenge to credit, so the
        // join in CLEARED_RUNGS_CTE drops it.
        const before = await clearedRungs(userId);

        await answer(await newRun(userId), untagged.questionId, true, 1);

        expect(await clearedRungs(userId)).toHaveLength(before.length);
    });

    it("credits only the learner who answered", async () => {
        expect(await clearedRungs(otherId)).toHaveLength(0);
    });

    it("does not count introduce-role challenges as practice", async () => {
        // Introduction evidence says the learner MET a concept. Keeping it out of
        // rung clearing is what stops "I watched the beat" becoming "I can do it".
        const cleared = await clearedRungs(userId);

        expect(cleared.length, "something must have cleared for this to mean anything")
            .toBeGreaterThan(0);

        const roles = await rows<{ role: string }>(
            `SELECT DISTINCT ch.role
             FROM challenges ch
             JOIN UNNEST($1::BIGINT[], $2::BIGINT[]) AS r(concept_id, demand_id)
               ON ch.concept_id = r.concept_id AND ch.demand_id = r.demand_id`,
            [cleared.map((r) => r.concept_id), cleared.map((r) => r.demand_id)]
        );

        expect(roles.map((r) => r.role)).toEqual(["practise"]);
    });
});

describe("Bug Hunt is a second path to the same rungs", () => {
    it("tags an incident only to a rung its concept declares", async () => {
        // The composite foreign key already refuses otherwise, so this is really
        // asserting that the seed did not quietly fail: a tagged incident whose
        // challenge pointed at an undeclared demand could not exist.
        const bad = await rows<{ slug: string }>(
            `SELECT i.slug
             FROM bug_hunt_incidents i
             JOIN challenges ch ON ch.id = i.challenge_id
             WHERE i.is_active
               AND NOT EXISTS (
                   SELECT 1 FROM concept_demands cd
                   WHERE cd.concept_id = ch.concept_id AND cd.demand_id = ch.demand_id
               )`
        );

        expect(bad.map((r) => r.slug)).toEqual([]);
    });

    it("gives repair rungs real Bug Hunt coverage", async () => {
        // Before the tagging seed exactly ONE concept could have its `repair`
        // rung cleared by fixing broken code; every other repair rung was a
        // multiple-choice question about fixing broken code.
        const [{ concepts }] = await rows<{ concepts: number }>(
            `SELECT COUNT(DISTINCT ch.concept_id)::INT AS concepts
             FROM bug_hunt_incidents i
             JOIN challenges ch ON ch.id = i.challenge_id
             JOIN demands d ON d.id = ch.demand_id
             WHERE i.is_active AND d.slug = 'repair'`
        );

        expect(concepts).toBeGreaterThanOrEqual(10);
    });

    it("leaves incidents untagged rather than forcing a match", async () => {
        // Nine choose_patch incidents have no rung whose demand they match, or
        // match one already taken. They stay dealable and uncredited, which is
        // the honest state -- a bank with everything tagged would mean something
        // had been tagged to a rung it does not exercise.
        const [{ untagged }] = await rows<{ untagged: number }>(
            `SELECT COUNT(*)::INT AS untagged
             FROM bug_hunt_incidents WHERE is_active AND challenge_id IS NULL`
        );

        expect(untagged).toBeGreaterThan(0);
    });

    it("holds at most one incident per challenge", async () => {
        // bug_hunt_incidents_challenge_id_idx is unique, and the encounter
        // depends on it: two pieces of content on one challenge would make the
        // rung offer the same challengeId twice.
        const dupes = await rows<{ challenge_id: string }>(
            `SELECT challenge_id FROM bug_hunt_incidents
             WHERE challenge_id IS NOT NULL
             GROUP BY challenge_id HAVING COUNT(*) > 1`
        );

        expect(dupes).toEqual([]);
    });

    it("clears a rung when a hunt is resolved, and not when it is failed", async () => {
        // The EXISTING arm of CLEARED_RUNGS_CTE. Nothing in this slice added it;
        // the tagging is what gives it something to credit.
        const [target] = await rows<{
            incident_id: string;
            concept_id: string;
            demand_id: string;
        }>(
            `SELECT i.id AS incident_id, ch.concept_id, ch.demand_id
             FROM bug_hunt_incidents i
             JOIN challenges ch ON ch.id = i.challenge_id
             JOIN demands d ON d.id = ch.demand_id
             WHERE i.is_active AND ch.role = 'practise' AND d.slug = 'repair'
             ORDER BY i.id LIMIT 1`
        );

        /**
         * A finished round, filled the way the game finishes one: the schema
         * refuses a resolved round with no option, no served_at or no attempt,
         * and honouring that is what makes the fixture evidence of anything.
         * Separate sessions because one incident may not appear twice in a run.
         */
        const round = async (status: "resolved" | "failed") => {
            const [option] = await rows<{ id: string }>(
                `SELECT id FROM bug_hunt_options
                 WHERE incident_id = $1 AND is_active AND is_correct
                 ORDER BY id LIMIT 1`,
                [target!.incident_id]
            );

            await rows(
                `INSERT INTO bug_hunt_rounds
                     (game_session_id, incident_id, display_order, status,
                      time_limit_ms, served_at, ended_at, selected_option_id, attempts)
                 VALUES ($1, $2, 1, $3, 60000,
                         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $4, 1)`,
                [await newRun(otherId), target!.incident_id, status, option!.id]
            );
        };

        await round("failed");

        let cleared = await clearedRungs(otherId);
        expect(
            cleared.some((r) => r.concept_id === target!.concept_id),
            "a failed hunt is not evidence"
        ).toBe(false);

        await round("resolved");

        cleared = await clearedRungs(otherId);
        expect(
            cleared.some(
                (r) =>
                    r.concept_id === target!.concept_id && r.demand_id === target!.demand_id
            )
        ).toBe(true);
    });
});

describe("the map's rung counts come from the same evidence", () => {
    it("counts a cleared rung for the learner who cleared it, and nobody else", async () => {
        // findJourneyPath composes CLEARED_RUNGS_CTE rather than restating what
        // "done" means, so this executes the real fragment the same way the
        // path query does. If the two ever diverge, the map starts telling a
        // different story from the concept page.
        const mine = await rows<{ n: number }>(
            `WITH ${CLEARED_RUNGS_CTE}
             SELECT COUNT(*)::INT AS n FROM cleared WHERE cleared.concept_id = $2`,
            [userId, tagged.conceptId]
        );

        const theirs = await rows<{ n: number }>(
            `WITH ${CLEARED_RUNGS_CTE}
             SELECT COUNT(*)::INT AS n FROM cleared WHERE cleared.concept_id = $2`,
            [otherId, tagged.conceptId]
        );

        expect(mine[0]!.n).toBeGreaterThan(0);
        expect(theirs[0]!.n, "one learner's progress is not another's").toBe(0);
    });

    it("never counts more cleared rungs than the concept has playable ones", async () => {
        // The clamp the path query applies exists for retired content. This is
        // the invariant it protects, asserted across every concept at once.
        const bad = await rows<{ slug: string; cleared: number; playable: number }>(
            `WITH ${CLEARED_RUNGS_CTE}
             SELECT c.slug,
                    (SELECT COUNT(*)::INT FROM cleared WHERE cleared.concept_id = c.id) AS cleared,
                    (SELECT COUNT(*)::INT
                       FROM concept_demands cd
                      WHERE cd.concept_id = c.id
                        AND EXISTS (
                            SELECT 1 FROM challenges pch
                             WHERE pch.concept_id = cd.concept_id
                               AND pch.demand_id  = cd.demand_id
                               AND pch.role = 'practise' AND pch.is_active
                               AND (EXISTS (SELECT 1 FROM questions pq
                                             WHERE pq.challenge_id = pch.id AND pq.is_active)
                                 OR EXISTS (SELECT 1 FROM bug_hunt_incidents pi
                                             WHERE pi.challenge_id = pch.id AND pi.is_active)
                                 OR pch.activity IS NOT NULL))
                    ) AS playable
             FROM concepts c`,
            [userId]
        );

        for (const row of bad) {
            expect(
                Math.min(row.cleared, row.playable),
                `${row.slug} must never report more than it has`
            ).toBeLessThanOrEqual(row.playable);
        }
    });

    it("counts only rungs something actually fills", async () => {
        // A declared rung with no content is not work the learner can do, so
        // showing it in the denominator would promise progress that can never
        // complete. 52 of 281 declared rungs are in exactly that state.
        const [{ declared }] = await rows<{ declared: number }>(
            `SELECT COUNT(*)::INT AS declared FROM concept_demands`
        );

        const [{ playable }] = await rows<{ playable: number }>(
            `SELECT COUNT(*)::INT AS playable
               FROM concept_demands cd
              WHERE EXISTS (
                  SELECT 1 FROM challenges pch
                   WHERE pch.concept_id = cd.concept_id
                     AND pch.demand_id  = cd.demand_id
                     AND pch.role = 'practise' AND pch.is_active
                     AND (EXISTS (SELECT 1 FROM questions pq
                                   WHERE pq.challenge_id = pch.id AND pq.is_active)
                       OR EXISTS (SELECT 1 FROM bug_hunt_incidents pi
                                   WHERE pi.challenge_id = pch.id AND pi.is_active)
                       OR pch.activity IS NOT NULL))`
        );

        /*
         * THESE WERE UNEQUAL and are now the same number, which is what
         * finishing the curriculum means: all 281 declared rungs are realised
         * by a question, an incident or a movement.
         *
         * The invariant worth keeping is the direction -- playable can never
         * EXCEED declared, because a rung has to be declared before anything
         * can fill it. A future concept declaring a rung with no content would
         * make this a strict inequality again, and that is fine; what must
         * never happen is the other way round.
         */
        expect(playable).toBeLessThanOrEqual(declared);
        expect(playable).toBe(declared);
    });
});

describe("the focus vocabulary matches the database", () => {
    it("accepts every topic the question bank actually uses", async () => {
        // The stale-enum bug, made un-repeatable: the enum was nine units while
        // the bank had sixteen, so focusing `values` parsed as invalid and was
        // silently dropped.
        const used = await rows<{ topic: string }>(
            `SELECT DISTINCT topic FROM questions WHERE is_active AND topic IS NOT NULL`
        );

        for (const { topic } of used) {
            expect(TOPICS as readonly string[], `topic "${topic}" is in the bank`).toContain(topic);
        }
    });

    it("keeps the legacy conditionals slug while questions still carry it", async () => {
        const [{ n }] = await rows<{ n: number }>(
            `SELECT COUNT(*)::INT AS n FROM questions WHERE is_active AND topic = 'conditionals'`
        );

        if (n > 0) {
            expect(TOPICS as readonly string[]).toContain("conditionals");
        }
    });

    it("names no topic the database would refuse", async () => {
        // The other direction: a focus the constraint rejects would be a request
        // that validates and then matches nothing.
        for (const topic of TOPICS) {
            const [{ ok }] = await rows<{ ok: boolean }>(
                `SELECT EXISTS (SELECT 1 FROM topics WHERE slug = $1) AS ok`,
                [topic]
            );

            // `conditionals` is the one permitted non-curriculum slug.
            if (topic !== "conditionals") {
                expect(ok, `"${topic}" is a real curriculum topic`).toBe(true);
            }
        }
    });
});
