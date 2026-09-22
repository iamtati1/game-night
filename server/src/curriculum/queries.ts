import { pool } from "../db.js";
import { curriculumEligible, metConceptsCte } from "./eligibility.js";
import { journeyCte } from "./journey.js";
import { roleEligible } from "./roles.js";

/**
 * The Learn half of Learn -> Play.
 *
 * Two reads and one write, all answering the same question from the server
 * side: what should this learner meet next, and has the meeting happened. The
 * client never decides any of it -- it renders the worked example for whatever
 * concept it is handed and reports back when the learner has acknowledged it.
 */

/**
 * An introduction the learner has not had yet.
 *
 * Carries the curriculum's own authored language -- objective and meaning, from
 * concepts -- so the client is not writing lesson copy of its own. The worked
 * example (code, output, title) lives client-side in learnBeats.ts keyed by
 * conceptSlug; see the note in seed 016 on why it is not a table.
 */
export interface Introduction {
    challengeId: string;
    conceptSlug: string;
    conceptName: string;
    /** Completes "I know how to ___". */
    objective: string;
    /** The one-line rule. */
    meaning: string;
    topicSlug: string;
}

/**
 * The statements are exported, not just the functions.
 *
 * Same reason ELIGIBLE_QUESTION_PREDICATE is a constant: production runs them
 * through `pool`, and learnToPlay.test.ts runs the very same strings against a
 * real PostgreSQL it can seed. A test that retyped the query would be testing
 * its own copy.
 */
const INTRODUCTION_COLUMNS = `
    ch.id          AS "challengeId",
    c.slug         AS "conceptSlug",
    c.name         AS "conceptName",
    c.objective    AS objective,
    c.meaning      AS meaning,
    t.slug         AS "topicSlug"
`;

/**
 * The next concept to introduce, or null when there is nothing to teach.
 *
 * REUSES BOTH EXISTING LAYERS RATHER THAN RESTATING THEM. curriculumEligible
 * answers "is this concept reachable" and roleEligible answers "has this learner
 * met it yet" -- exactly the two questions an introduction has to pass, and the
 * same two the candidate queries ask of playable content. Writing the
 * prerequisite join a third time here is how the layers start disagreeing.
 *
 * Both fragments are written against a row exposing `challenge_id`, because
 * every other caller selects from a CONTENT table. A challenge exposes its id as
 * `id`, so a one-column lateral gives the challenge row that same shape. That is
 * the whole trick, and it is cheaper than a second pair of predicates.
 *
 * ORDERED BY THE SYLLABUS. topics.display_order then concepts.display_order --
 * the order the curriculum was authored in. With one introduction seeded the
 * ordering is academic; it is here so that the second one does not arrive
 * arbitrarily.
 */
export const NEXT_INTRODUCTION_SQL = `
    WITH ${metConceptsCte("$1")}
    SELECT ${INTRODUCTION_COLUMNS}
    FROM challenges ch
    CROSS JOIN LATERAL (VALUES (ch.id)) AS tagged (challenge_id)
    JOIN concepts c ON c.id = ch.concept_id
    JOIN topics t   ON t.id = c.topic_id
    WHERE ch.role = 'introduce'
      AND ch.is_active
      AND ${curriculumEligible("tagged")}
      AND ${roleEligible("tagged")}
    ORDER BY t.display_order, c.display_order
    LIMIT 1
`;

export async function findNextIntroduction(userId: string): Promise<Introduction | null> {
    const result = await pool.query<Introduction>(NEXT_INTRODUCTION_SQL, [userId]);

    return result.rows[0] ?? null;
}

/**
 * Records that the learner has been introduced to a concept.
 *
 * Returns the introduction on success, or null when the challenge is not an
 * introduction this learner may complete -- which the caller turns into a 404
 * rather than trusting the id it was handed.
 *
 * THE ELIGIBILITY CHECK IS NOT CEREMONY. Without it a client could post any
 * challenge id and mark a concept encountered without ever seeing it, which
 * would unlock practice for content the curriculum says is out of reach. The
 * server stays authoritative about learner curriculum state; the client only
 * reports that the learner pressed the button.
 *
 * Re-completing is not an error. The primary key on (user_id, challenge_id)
 * makes the insert idempotent, so a double-click, a refresh or a retried request
 * lands on the same single fact.
 *
 * WHICH IS WHY THIS CHECKS PREREQUISITES BUT NOT ROLE. roleEligible would refuse
 * an introduction the learner has already completed -- that is its job, and it
 * is what stops the same beat being offered twice. Applying it here would turn
 * the second click of a double-click into a 404. Reachability is the rule that
 * matters for accepting the report; having already heard it is not a reason to
 * reject hearing it again.
 */
export const COMPLETABLE_INTRODUCTION_SQL = `
    WITH ${metConceptsCte("$1")}
    SELECT ${INTRODUCTION_COLUMNS}
    FROM challenges ch
    CROSS JOIN LATERAL (VALUES (ch.id)) AS tagged (challenge_id)
    JOIN concepts c ON c.id = ch.concept_id
    JOIN topics t   ON t.id = c.topic_id
    WHERE ch.id = $2
      AND ch.role = 'introduce'
      AND ch.is_active
      AND ${curriculumEligible("tagged")}
`;

export const RECORD_INTRODUCTION_SQL = `
    INSERT INTO introduction_completions (user_id, challenge_id)
    VALUES ($1, $2)
    ON CONFLICT (user_id, challenge_id) DO NOTHING
`;

export async function completeIntroduction(
    userId: string,
    challengeId: string
): Promise<Introduction | null> {
    const eligible = await pool.query<Introduction>(COMPLETABLE_INTRODUCTION_SQL, [
        userId,
        challengeId
    ]);

    const introduction = eligible.rows[0];

    if (!introduction) {
        return null;
    }

    await pool.query(RECORD_INTRODUCTION_SQL, [userId, challengeId]);

    return introduction;
}

/**
 * One step of the learner's JavaScript journey.
 *
 * `status` is what a progress list renders: what they have worked through, what
 * they are on now, and what is still ahead. `stocked` says whether Jolt has any
 * content for it at all -- five topics currently have none, and a progress list
 * that showed them as ordinary upcoming steps would be promising material that
 * does not exist.
 */
export interface JourneyStep {
    slug: string;
    name: string;
    tier: string;
    order: number;
    status: "done" | "current" | "upcoming";
    stocked: boolean;
}

/**
 * Where the learner is in JavaScript, as a list they can be shown.
 *
 * Derived entirely from what they have already played -- see journey.ts. The
 * same ceiling that gates Code Blitz's candidate pool decides `current`, so the
 * progress list and the questions dealt can never tell different stories.
 *
 * @param sessionSize passed through to the journey's floor, so the position
 *                    shown is the position actually used to deal.
 */
export async function findJourney(
    userId: string,
    sessionSize: number
): Promise<JourneyStep[]> {
    const result = await pool.query<JourneyStep>(
        `WITH ${journeyCte("$1", sessionSize)}
         SELECT t.slug,
                t.name,
                t.tier,
                t.display_order AS order,
                CASE
                    WHEN t.display_order <= (SELECT reached FROM journey) THEN 'done'
                    WHEN t.display_order =  (SELECT ceiling FROM journey) THEN 'current'
                    ELSE 'upcoming'
                END AS status,
                COALESCE(s.stocked, FALSE) AS stocked
         FROM topics t
         LEFT JOIN journey_stocked s ON s.display_order = t.display_order
         ORDER BY t.display_order`,
        [userId]
    );

    return result.rows;
}

/**
 * One concept on the learner's current topic, and where they stand on it.
 *
 *     ✓ done      they have met it -- played something tagged to it, or
 *                 completed its introduction
 *     → current   the first one they have not met yet
 *     ○ upcoming  everything after that
 *
 * WHY ORDER AND NOT PREREQUISITES. Within a topic the concepts are already
 * sequenced, and that sequence was authored to build -- `declaration` before
 * `initialization` before `assignment`. So "what am I learning now" is the first
 * unmet concept in that order. Running the prerequisite graph here would answer
 * a different and less useful question ("what COULD I reach"), and would say
 * "current" about four concepts at once.
 *
 * NOT A SECOND PROGRESS SYSTEM. `met` is the same derivation eligibility.ts has
 * always used -- gameplay history plus introduction completions. Nothing is
 * stored, and XP is untouched: this answers "what do I understand", which is a
 * different question from "how much have I played".
 */
export interface ConceptStanding {
    slug: string;
    name: string;
    /** Completes "I know how to ___". */
    objective: string;
    status: "done" | "current" | "upcoming";
}

export async function findTopicStanding(
    userId: string,
    topicSlug: string
): Promise<ConceptStanding[]> {
    const rows = await pool.query<{
        slug: string;
        name: string;
        objective: string;
        met: boolean;
    }>(
        `WITH ${metConceptsCte("$1")}
         SELECT c.slug, c.name, c.objective,
                (c.id IN (SELECT concept_id FROM met)) AS met
         FROM concepts c
         JOIN topics t ON t.id = c.topic_id
         WHERE t.slug = $2
         ORDER BY c.display_order`,
        [userId, topicSlug]
    );

    let currentTaken = false;

    return rows.rows.map((row) => {
        if (row.met) {
            return { ...row, status: "done" as const };
        }

        if (!currentTaken) {
            currentTaken = true;
            return { ...row, status: "current" as const };
        }

        return { ...row, status: "upcoming" as const };
    });
}
