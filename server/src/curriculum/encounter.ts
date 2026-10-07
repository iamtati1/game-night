/**
 * The encounter: the ordered arc of rungs that teach and test ONE concept.
 *
 * Every other selection layer answers "what may this learner be given next?"
 * across the whole bank -- eligibility, roles, frontier, demand and policy all
 * reason about a pool spanning many concepts, because that is what a ten-question
 * Code Blitz run draws from. This one does the opposite, and it exists because a
 * run drawn from the whole bank cannot be the way a learner practises the thing
 * they were just taught.
 *
 * THE RULE IT MAKES TRUE: a challenge is never merely "related to the topic".
 * It belongs to one concept and one demand, and the learner meets it because of
 * where they are in the sequence.
 *
 * WHY NOT FOCUS SLOTS. dealSession already accepts a focus topic and reserves
 * two of ten slots for it (curve.ts, FOCUS_SLOTS). That was the right shape for
 * a mixed run with a lean, and it is the wrong shape for an encounter: it
 * filters on `questions.topic`, the legacy string, so `true && false` and
 * `1 == "1"` land in the same bucket; and eight of the ten questions are still
 * something else. An encounter is short, it is entirely one concept, and it
 * climbs the demands that concept actually declares.
 *
 * DRIVEN BY concept_demands, NOT BY challenges. This is the whole shape of the
 * query and it was wrong the first time. A challenge is ONE playable exercise,
 * not one rung: booleans holds five challenges and every one of them is
 * `predict`. Walking outward from `challenges` therefore returns five rungs that
 * are really one, and -- far worse -- cannot return `recognise` AT ALL, because
 * a demand with no exercises has no challenge row to be found by. Only the
 * declaration knows the ladder's full height. So the arc comes from
 * concept_demands and the exercises hang off it.
 *
 * THREE KINDS OF CONTENT, TWO OF THEM ROWS. A question or an incident points at
 * a challenge; a mission movement cannot, because it is client-authored code --
 * its `check` inspects a parse result and is not storable as data. challenges.
 * activity records that a movement realises the rung, and the movement is found
 * by the (concept, demand) both already carry. See migration 030.
 *
 * A GAP IS REPORTED, NOT SWALLOWED. A declared demand with nothing playable
 * yields a rung with no options rather than vanishing. Dropping it would make a
 * half-built encounter look complete -- exactly the failure the coverage audit
 * found hiding behind "the topic has questions". The caller decides what to do
 * about a hole; it does not get to not know.
 *
 * PER-RUNG PROGRESS IS DERIVED, NOT STORED, and this was verified before any
 * schema was touched. The obvious move was to widen concept_demonstrations to
 * (user, concept, demand) so each rung could carry its own row. That would have
 * been wrong twice over:
 *
 *   - findJourneyPath LEFT JOINs that table one row per concept. Per-rung rows
 *     fan the join out, and the world would list a concept once per rung it had
 *     cleared.
 *   - findLearnerPoints counts its rows at POINTS_PER_CONCEPT each. Per-rung
 *     rows multiply a learner's points, which is a silent progression change.
 *
 * concept_demonstrations means ONE thing -- "this learner completed this
 * concept" -- and the world and the points both read it that way. Its demand_id
 * is an annotation (the last non-null rung a practice claimed, not the highest),
 * not a ladder.
 *
 * The ladder is already recorded elsewhere. session_questions.is_correct and
 * bug_hunt_rounds.status join through challenges to (concept, demand), so
 * "cleared this rung" is a fact the database can already answer. CLEARED_RUNGS
 * asks it. Nothing is migrated and nothing existing changes meaning.
 *
 * THREE ARMS, ONE MEANING. Code Blitz contributes a correct answer, Bug Hunt a
 * resolved incident, and activity_completions a finished mission movement --
 * which has no attempt row of its own because it is judged in the browser. All
 * three are evidence of success, joined the same way.
 *
 * CLEARED IS NOT met_demands. demand.ts derives `met_demands` from the same two
 * tables but counts a rung as met once it has been FACED -- a timed-out question
 * and a failed incident both count, deliberately, because that CTE feeds a
 * difficulty ceiling and exposure is what a ceiling should track. A learner has
 * not CLEARED a rung by running out of time on it, so this one requires success.
 *
 * PREREQUISITE LEAKAGE is structural here and editorial elsewhere. Structurally,
 * every rung of an encounter belongs to the requested concept, so the runtime
 * cannot wander into a later one. What the runtime cannot see is an exercise
 * whose TEXT reaches forward -- a booleans question written with `arr.reduce` in
 * it. That is an authoring rule, enforced by content tests, not by this query.
 */
import { pool } from "../db.js";
import { CHALLENGED } from "./lessons.js";

/**
 * Exported so the tests can run them against the PGlite fixture rather than a
 * mock. Same reason NEXT_INTRODUCTION_SQL is exported: a query that is only ever
 * exercised through a stub is a query nobody has checked.
 */
export const CONCEPT_HEAD_SQL = `
    SELECT c.slug, c.name, c.objective, c.meaning, t.slug AS topic_slug,
           EXISTS (
               SELECT 1 FROM concept_demonstrations cdem
               WHERE cdem.user_id = $1 AND cdem.concept_id = c.id
           ) AS demonstrated,
           COALESCE(
               (SELECT ARRAY_AGG(r.slug ORDER BY r.slug)
                FROM prerequisites p
                JOIN concepts r ON r.id = p.requires_id
                WHERE p.concept_id = c.id),
               ARRAY[]::TEXT[]
           ) AS prerequisites
    FROM concepts c
    JOIN topics t ON t.id = c.topic_id
    WHERE c.slug = $2`;

/**
 * Every (concept, rung) this learner has actually got right.
 *
 * Kept here rather than beside metDemandsCte in demand.ts because the encounter
 * is its only reader. If a second one appears it should move; one caller is not
 * yet a shared abstraction.
 */
export const CLEARED_RUNGS_CTE = `cleared AS (
    SELECT ch.concept_id, ch.demand_id
    FROM session_questions sq
    JOIN game_sessions gs ON gs.id = sq.game_session_id
    JOIN questions q      ON q.id  = sq.question_id
    JOIN challenges ch    ON ch.id = q.challenge_id
    WHERE gs.user_id = $1
      AND sq.is_correct
      AND ch.role = 'practise'

    UNION

    SELECT ch.concept_id, ch.demand_id
    FROM activity_completions ac
    JOIN challenges ch ON ch.id = ac.challenge_id
    WHERE ac.user_id = $1
      AND ch.role = 'practise'

    UNION

    SELECT ch.concept_id, ch.demand_id
    FROM bug_hunt_rounds bhr
    JOIN game_sessions gs       ON gs.id  = bhr.game_session_id
    JOIN bug_hunt_incidents bhi ON bhi.id = bhr.incident_id
    JOIN challenges ch          ON ch.id  = bhi.challenge_id
    WHERE gs.user_id = $1
      AND bhr.status = 'resolved'
      AND ch.role = 'practise'
)`;

/**
 * $1 = user id, $2 = concept slug.
 *
 * One row per (declared demand x playable exercise), plus one row with null
 * exercise columns for a declared demand that has none. Grouped into rungs in
 * TypeScript rather than with an aggregate, because the grouping is cheap and a
 * row shape is far easier to read back than a nested json_agg.
 */
export const ENCOUNTER_RUNGS_SQL = `
    WITH ${CLEARED_RUNGS_CTE}
    SELECT d.slug          AS demand_slug,
           d.display_order AS demand_order,
           ch.id           AS challenge_id,
           ch.difficulty,
           ch.activity,
           q.id            AS question_id,
           i.id            AS incident_id,
           EXISTS (
               SELECT 1 FROM cleared
               WHERE cleared.concept_id = cd.concept_id
                 AND cleared.demand_id = cd.demand_id
           ) AS cleared
    FROM concept_demands cd
    JOIN concepts c ON c.id = cd.concept_id
    JOIN demands  d ON d.id = cd.demand_id
    LEFT JOIN challenges ch
           ON ch.concept_id = cd.concept_id
          AND ch.demand_id  = cd.demand_id
          AND ch.role = 'practise'
          AND ch.is_active
    LEFT JOIN questions q
           ON q.challenge_id = ch.id
          AND q.is_active
          AND (SELECT COUNT(*) FROM question_options o
               WHERE o.question_id = q.id AND o.is_active) >= 2
    LEFT JOIN bug_hunt_incidents i
           ON i.challenge_id = ch.id
          AND i.is_active
    WHERE c.slug = $2
    ORDER BY d.display_order, ch.id, q.id, i.id`;

/** One playable exercise sitting at a rung. */
export interface EncounterOption {
    challengeId: string;
    /** challenges.difficulty, derived from tier and demand. Not pacing. */
    difficulty: number;
    /**
     * `mission` carries no id: a movement is addressed by the (concept, demand)
     * it declares, which the rung already knows. See migration 030.
     */
    content:
        | { kind: "question"; id: string }
        | { kind: "incident"; id: string }
        | { kind: "mission" };
}

/** One rung of a concept's ladder. `options` is empty when nothing is built. */
export interface EncounterRung {
    demandSlug: string;
    demandOrder: number;
    /** Whether this learner has got an exercise at this rung right. */
    cleared: boolean;
    options: EncounterOption[];
}

export interface ConceptEncounter {
    conceptSlug: string;
    name: string;
    objective: string;
    meaning: string;
    topicSlug: string;
    /** Concepts that must be demonstrated before this one is reachable. */
    prerequisites: string[];
    /**
     * The concept-level completion the world and the points already read. NOT
     * the conjunction of the rungs: a lesson records this without clearing any
     * rung, which is exactly the distinction between meeting a concept and
     * being able to do something with it.
     */
    demonstrated: boolean;
    rungs: EncounterRung[];
}

interface RungRow {
    demand_slug: string;
    demand_order: number;
    challenge_id: string | null;
    difficulty: number | null;
    activity: string | null;
    question_id: string | null;
    incident_id: string | null;
    cleared: boolean;
}

/** Groups the flat rows into rungs, preserving the ladder order the query set. */
export function rungsFromRows(rows: readonly RungRow[]): EncounterRung[] {
    const byDemand = new Map<string, EncounterRung>();

    for (const row of rows) {
        let rung = byDemand.get(row.demand_slug);

        if (!rung) {
            rung = {
                demandSlug: row.demand_slug,
                demandOrder: row.demand_order,
                cleared: row.cleared,
                options: []
            };
            byDemand.set(row.demand_slug, rung);
        }

        // A challenge with neither a question nor an incident is a challenge
        // whose content was retired or never written. It is not an option, and
        // it must not masquerade as one just because the challenge row exists.
        if (row.challenge_id === null) continue;

        const content = row.question_id
            ? ({ kind: "question", id: String(row.question_id) } as const)
            : row.incident_id
              ? ({ kind: "incident", id: String(row.incident_id) } as const)
              : row.activity === "mission"
                ? ({ kind: "mission" } as const)
                : null;

        if (!content) continue;

        rung.options.push({
            challengeId: String(row.challenge_id),
            difficulty: row.difficulty ?? 1,
            content
        });
    }

    return [...byDemand.values()].sort((a, b) => a.demandOrder - b.demandOrder);
}

/**
 * The arc for one concept, or null when the slug names nothing.
 *
 * Does NOT gate on the learner having met the prerequisites -- that is the
 * world's decision about what to link to, and a caller asking for an encounter
 * directly (a test, a deep link, a replay of something already finished) should
 * get the truth about it rather than a refusal. `prerequisites` is returned so
 * the caller can make that call with the same data.
 */
export async function findConceptEncounter(
    userId: string,
    conceptSlug: string
): Promise<ConceptEncounter | null> {
    const head = await pool.query<{
        slug: string;
        name: string;
        objective: string;
        meaning: string;
        topic_slug: string;
        prerequisites: string[];
        demonstrated: boolean;
    }>(CONCEPT_HEAD_SQL, [userId, conceptSlug]);

    const concept = head.rows[0];

    if (!concept) {
        return null;
    }

    const rows = await pool.query<RungRow>(ENCOUNTER_RUNGS_SQL, [userId, conceptSlug]);

    return {
        conceptSlug: concept.slug,
        name: concept.name,
        objective: concept.objective,
        meaning: concept.meaning,
        topicSlug: concept.topic_slug,
        prerequisites: concept.prerequisites,
        demonstrated: concept.demonstrated,
        rungs: rungsFromRows(rows.rows)
    };
}

/**
 * Whether every declared rung of an encounter can actually be played.
 *
 * The audit's classification, as a function: an encounter with an empty rung is
 * PARTIALLY covered, and a caller that offers it to a learner is promising an
 * arc it cannot finish.
 */
export function isPlayable(encounter: ConceptEncounter): boolean {
    return encounter.rungs.length > 0 && encounter.rungs.every((r) => r.options.length > 0);
}

/**
 * $1 = user id, $2 = concept slug.
 *
 * The learner's standing around one concept: which of its prerequisites are
 * still unmet, what it is safe to assume they know, and what follows it.
 *
 * ALLOWED KNOWLEDGE is the curriculum's own spine, cut at this concept: every
 * concept ordered before it that the learner has demonstrated, plus the concept
 * itself. It is what an exercise at this point may assume. Ordering is
 * (topic.display_order, concept.display_order) -- the path a learner actually
 * walks -- rather than the prerequisite edges alone, because the edges are a
 * partial order and "earlier" has to be a total one to be a boundary.
 */
export const CONCEPT_STANDING_SQL = `
    WITH here AS (
        SELECT c.id, t.display_order AS t_ord, c.display_order AS c_ord
        FROM concepts c JOIN topics t ON t.id = c.topic_id
        WHERE c.slug = $2
    )
    SELECT
        COALESCE((
            SELECT ARRAY_AGG(r.slug ORDER BY r.slug)
            FROM prerequisites p
            JOIN concepts r ON r.id = p.requires_id
            WHERE p.concept_id = (SELECT id FROM here)
              AND NOT EXISTS (
                  SELECT 1 FROM concept_demonstrations cdem
                  WHERE cdem.user_id = $1 AND cdem.concept_id = r.id
              )
        ), ARRAY[]::TEXT[]) AS unmet_prerequisites,
        COALESCE((
            SELECT ARRAY_AGG(c.slug ORDER BY t.display_order, c.display_order)
            FROM concepts c
            JOIN topics t ON t.id = c.topic_id
            WHERE (t.display_order, c.display_order)
                  < ((SELECT t_ord FROM here), (SELECT c_ord FROM here))
              AND EXISTS (
                  SELECT 1 FROM concept_demonstrations cdem
                  WHERE cdem.user_id = $1 AND cdem.concept_id = c.id
              )
        ), ARRAY[]::TEXT[]) AS allowed_concepts,
        (
            SELECT c.slug FROM concepts c
            JOIN topics t ON t.id = c.topic_id
            WHERE (t.display_order, c.display_order)
                  > ((SELECT t_ord FROM here), (SELECT c_ord FROM here))
            ORDER BY t.display_order, c.display_order
            LIMIT 1
        ) AS next_slug,
        (
            SELECT c.name FROM concepts c
            JOIN topics t ON t.id = c.topic_id
            WHERE (t.display_order, c.display_order)
                  > ((SELECT t_ord FROM here), (SELECT c_ord FROM here))
            ORDER BY t.display_order, c.display_order
            LIMIT 1
        ) AS next_name`;

/** What the client renders: the encounter, plus where it sits in the path. */
export interface EncounterView extends ConceptEncounter {
    /** The one authority: demonstrated, current, or locked. */
    state: ConceptState;
    /** False when the concept is locked. Derived from `state`, never from prerequisites alone. */
    reachable: boolean;
    /**
     * Which prerequisites are still outstanding. Explanatory only -- a concept
     * whose prerequisites are all met can still be locked, because something
     * earlier in the path is unfinished.
     */
    unmetPrerequisites: string[];
    /** Named when the concept is locked but its own prerequisites are satisfied. */
    blockedBy: { kind: "concept" | "checkpoint"; slug: string; name: string } | null;
    /** What an exercise here may assume the learner knows. */
    allowedConcepts: string[];
    /**
     * The rung to put in front of the learner: the shallowest declared rung not
     * yet cleared that has something playable. Null when the ladder is finished
     * -- or when every remaining rung is a hole, which is not the same thing and
     * is why `isPlayable` exists separately.
     */
    currentRung: string | null;
    next: { slug: string; name: string } | null;
}

export async function findEncounterView(
    userId: string,
    conceptSlug: string
): Promise<EncounterView | null> {
    const encounter = await findConceptEncounter(userId, conceptSlug);

    if (!encounter) {
        return null;
    }

    const standing = await pool.query<{
        unmet_prerequisites: string[];
        allowed_concepts: string[];
        next_slug: string | null;
        next_name: string | null;
    }>(CONCEPT_STANDING_SQL, [userId, conceptSlug]);

    const row = standing.rows[0]!;
    const state = (await findConceptState(userId, conceptSlug)) ?? "locked";
    const locked = state === "locked";

    // NOTHING PLAYABLE IS SERVED FOR A LOCKED CONCEPT. The head still comes
    // back so the world can say what this place is and why it is shut, but the
    // ladder is withheld -- a deep link gets an explanation, not a lesson.
    const rungs = locked ? [] : encounter.rungs;
    const current = rungs.find((r) => !r.cleared && r.options.length > 0);

    return {
        ...encounter,
        rungs,
        state,
        reachable: !locked,
        unmetPrerequisites: row.unmet_prerequisites,
        blockedBy: locked ? await findBlocker(userId, conceptSlug) : null,
        allowedConcepts: [...row.allowed_concepts, encounter.conceptSlug],
        currentRung: current?.demandSlug ?? null,
        next: row.next_slug ? { slug: row.next_slug, name: row.next_name! } : null
    };
}

/**
 * Records that a learner finished the activity realising a challenge.
 *
 * Returns false when the challenge does not exist or is not one this server
 * would ever hand out, so a bad id is a 404 rather than a row nothing can read.
 * Re-finishing is idempotent and keeps the FIRST result: a movement redone later
 * without a miss does not erase the fact that it took one the first time, which
 * is the same rule concept_demonstrations.needed_retry follows.
 */
export async function recordActivityCompletion(
    userId: string,
    challengeId: string,
    neededRetry: boolean
): Promise<boolean> {
    const result = await pool.query(
        `INSERT INTO activity_completions (user_id, challenge_id, needed_retry)
         SELECT $1, ch.id, $3
         FROM challenges ch
         WHERE ch.id = $2 AND ch.is_active AND ch.role = 'practise'
         ON CONFLICT (user_id, challenge_id) DO NOTHING`,
        [userId, challengeId, neededRetry]
    );

    if ((result.rowCount ?? 0) > 0) {
        return true;
    }

    // DO NOTHING and "no such challenge" are the same rowCount, so they are told
    // apart explicitly rather than reporting a missing challenge as success.
    const existing = await pool.query(
        `SELECT 1 FROM activity_completions WHERE user_id = $1 AND challenge_id = $2`,
        [userId, challengeId]
    );

    return (existing.rowCount ?? 0) > 0;
}

/* ------------------------------------------------------- playing one rung */

/**
 * The exercise realising a challenge, as the learner may see it.
 *
 * NO CORRECTNESS CROSSES THE WIRE. The same rule the games keep: options carry
 * their text and their id and nothing else, and the server decides what is right
 * when an answer comes back. An untimed lesson is not a reason to relax it --
 * the answer would be in the page source either way.
 *
 * ASK AND CODE ARE SEPARATED HERE, not in the browser. A question prompt is
 * stored as one blob -- "What does this log?\n\nconsole.log(...)" -- and
 * rendering that blob as one thing puts the QUESTION in a code block, where it
 * reads as part of the program. The split is a property of how prompts are
 * written, so it belongs next to them rather than in a component.
 */
export interface Exercise {
    challengeId: string;
    kind: "question" | "incident";
    /** The question, in prose. Never code. */
    ask: string;
    /** The code to read, when the exercise has any. */
    code: string | null;
    /** What is wrong, for a diagnosis. Null for a question. */
    brief: string | null;
    options: { id: string; text: string }[];
}

/**
 * Splits a stored prompt into the question and the code beneath it.
 *
 * Every curriculum prompt is written as a line of prose, a blank line, then the
 * snippet. Anything that does not follow that shape is treated as all prose --
 * showing a question as a question is the safe failure, showing code as prose
 * is merely ugly, and showing prose as code is the bug being fixed.
 */
export function splitPrompt(prompt: string): { ask: string; code: string | null } {
    const [head, ...rest] = prompt.split(/\n\s*\n/);

    if (rest.length === 0) {
        return { ask: prompt.trim(), code: null };
    }

    return { ask: head!.trim(), code: rest.join("\n\n").trim() || null };
}

/**
 * SHUFFLED, AND NOT AS A FLOURISH.
 *
 * Every one of the 144 curriculum questions stores its correct option at
 * display_order 1, because every seed writes the right answer first and the
 * distractors after it. Served in that order, the whole curriculum could be
 * cleared by pressing the top button every time -- and `session_questions`
 * would record it as evidence of understanding, which is what the encounter
 * stakes demonstration on. Found by a walk that tried options in the order
 * they arrived and finished eight topics with three wrong answers.
 *
 * STABLE PER LEARNER, not random per request. Re-reading the same exercise --
 * which the page does after a wrong answer, and on any reload -- has to show
 * the options where they were, or the learner is re-reading a different
 * question. Hashing the option id with the learner id gives an order that is
 * fixed for them and different between them.
 *
 * Incidents are deliberately NOT shuffled: their options are the lines of a
 * program, and a program read out of order is not a program.
 */
export const EXERCISE_SQL = `
    SELECT q.id AS question_id, q.prompt, o.id AS option_id, o.option_text
    FROM questions q
    JOIN question_options o ON o.question_id = q.id AND o.is_active
    JOIN challenges ch ON ch.id = q.challenge_id
    WHERE ch.id = $1 AND ch.is_active AND ch.role = 'practise' AND q.is_active
    ORDER BY MD5(o.id::TEXT || ':' || $2::TEXT), o.id`;

/**
 * The Bug Hunt incident realising a challenge, in the same shape.
 *
 * A diagnosis is a bug report, the code it came from, and a choice of which line
 * is at fault -- which is the same interaction as a question with a snippet
 * above it. Rendering it as one keeps `diagnose` inside the concept the learner
 * is on, instead of handing them off to another game mid-ladder.
 *
 * NOT A REPLACEMENT FOR BUG HUNT. The game still owns timing, hints, two
 * attempts and scoring. This is the untimed, unscored form of the same content,
 * exactly as the encounter's question rung is the untimed form of Code Blitz.
 */
export const INCIDENT_EXERCISE_SQL = `
    SELECT i.id AS incident_id, i.bug_report, i.code,
           o.id AS option_id, o.option_text
    FROM bug_hunt_incidents i
    JOIN bug_hunt_options o ON o.incident_id = i.id AND o.is_active
    JOIN challenges ch ON ch.id = i.challenge_id
    WHERE ch.id = $1 AND ch.is_active AND ch.role = 'practise' AND i.is_active
    ORDER BY o.line_number, o.id`;

export async function findExercise(
    challengeId: string,
    learnerId: string
): Promise<Exercise | null> {
    const questions = await pool.query<{
        prompt: string;
        option_id: string;
        option_text: string;
    }>(EXERCISE_SQL, [challengeId, learnerId]);

    if (questions.rows[0]) {
        const { ask, code } = splitPrompt(questions.rows[0].prompt);

        return {
            challengeId: String(challengeId),
            kind: "question",
            ask,
            code,
            brief: null,
            options: questions.rows.map((r) => ({
                id: String(r.option_id),
                text: r.option_text
            }))
        };
    }

    const incidents = await pool.query<{
        bug_report: string;
        code: string;
        option_id: string;
        option_text: string;
    }>(INCIDENT_EXERCISE_SQL, [challengeId]);

    const first = incidents.rows[0];

    if (!first) {
        return null;
    }

    return {
        challengeId: String(challengeId),
        kind: "incident",
        ask: "Which line is causing this?",
        code: first.code,
        brief: first.bug_report,
        options: incidents.rows.map((r) => ({
            id: String(r.option_id),
            text: r.option_text
        }))
    };
}

/** What the learner is told after answering. */
export interface Judgement {
    correct: boolean;
    /** Always sent, right or wrong: the reasoning is the teaching. */
    explanation: string | null;
    correctOptionId: string;
}

export const JUDGE_INCIDENT_SQL = `
    SELECT o.is_correct,
           o.explanation,
           (SELECT o2.id FROM bug_hunt_options o2
            WHERE o2.incident_id = i.id AND o2.is_correct AND o2.is_active
            LIMIT 1) AS correct_option_id
    FROM bug_hunt_options o
    JOIN bug_hunt_incidents i ON i.id = o.incident_id
    JOIN challenges ch ON ch.id = i.challenge_id
    WHERE ch.id = $1 AND o.id = $2 AND o.is_active AND i.is_active AND ch.is_active`;

export const JUDGE_SQL = `
    SELECT o.is_correct,
           q.explanation,
           (SELECT o2.id FROM question_options o2
            WHERE o2.question_id = q.id AND o2.is_correct AND o2.is_active
            LIMIT 1) AS correct_option_id
    FROM question_options o
    JOIN questions q   ON q.id = o.question_id
    JOIN challenges ch ON ch.id = q.challenge_id
    WHERE ch.id = $1 AND o.id = $2 AND o.is_active AND q.is_active AND ch.is_active`;

/**
 * Judges one answer and, when it is right, records the rung as cleared.
 *
 * The recording happens here rather than in the route so that "got it right"
 * and "it counted" cannot come apart -- a correct answer that failed to record
 * would leave the learner looking at a cleared rung the world disagrees with.
 *
 * `neededRetry` is the learner's own history on this rung, not this answer:
 * a first-attempt miss is remembered even once they get it right afterwards.
 */
export async function judgeAnswer(
    userId: string,
    challengeId: string,
    optionId: string,
    neededRetry: boolean
): Promise<Judgement | null> {
    const asQuestion = await pool.query<{
        is_correct: boolean;
        explanation: string | null;
        correct_option_id: string;
    }>(JUDGE_SQL, [challengeId, optionId]);

    // Option ids live in two different tables, so which query answers is decided
    // by which one finds the option -- not by anything the client sends.
    const result = asQuestion.rows[0]
        ? asQuestion
        : await pool.query<{
              is_correct: boolean;
              explanation: string | null;
              correct_option_id: string;
          }>(JUDGE_INCIDENT_SQL, [challengeId, optionId]);

    const row = result.rows[0];

    if (!row) {
        return null;
    }

    if (row.is_correct) {
        await recordActivityCompletion(userId, challengeId, neededRetry);
    }

    return {
        correct: row.is_correct,
        explanation: row.explanation,
        correctOptionId: String(row.correct_option_id)
    };
}

/* ------------------------------------------------ the one reachability rule */

/**
 * Whether a concept is open to this learner, and why.
 *
 * THE SINGLE AUTHORITY. Jolt had two definitions of "reachable" and they
 * disagreed. findJourneyPath walks the whole curriculum in order and makes the
 * FIRST unfinished thing current -- so exactly one concept is open at a time,
 * and a topic's checkpoint blocks everything after it. findEncounterView asked a
 * different question: are this concept's own prerequisites demonstrated? Those
 * are not the same rule. A learner who had finished `reassignment` could not
 * reach `variable-state` from the world, because `let-vs-const` came first --
 * but typing /concept/variable-state opened it, because its one prerequisite was
 * met. The UI hid the door; the door still worked.
 *
 * This reproduces the journey's rule exactly, in SQL, so both read the same
 * answer from the same place.
 *
 *   demonstrated  a row in concept_demonstrations
 *   current       the first concept, in (topic, concept) order, that is not
 *                 demonstrated -- provided no earlier topic's checkpoint is
 *                 still outstanding
 *   locked        everything else
 *
 * WHY CHECKPOINTS MATTER HERE. A topic's cumulative challenge sits between its
 * last concept and the next topic's first. Once a topic's concepts are all done
 * its checkpoint takes the position, and no later concept may be current until
 * it is passed. Leaving that out would make the encounter open the next topic
 * while the journey still pointed at the checkpoint -- the same disagreement in
 * a new place.
 *
 * $1 = user id, $2 = concept slug, $3 = slugs of topics that have a checkpoint.
 */
export const CONCEPT_STATE_SQL = `
    WITH here AS (
        SELECT c.id, t.display_order AS t_ord, c.display_order AS c_ord
        FROM concepts c JOIN topics t ON t.id = c.topic_id
        WHERE c.slug = $2
    )
    SELECT CASE
        WHEN EXISTS (
            SELECT 1 FROM concept_demonstrations d
            WHERE d.user_id = $1 AND d.concept_id = (SELECT id FROM here)
        ) THEN 'demonstrated'

        /*
         * Something earlier is still unfinished, so this cannot be the
         * position -- UNLESS nothing has been built for it.
         *
         * THE JOURNEY ALREADY STEPPED OVER EMPTY TOPICS and this did not, so
         * the two disagreed again: Algorithms appeared on the map as the
         * learner ceiling while the encounter answered locked, because the
         * unbuilt this-and-classes sits between them. That is the same class
         * of bug this rule was written to end -- the UI showing a door that
         * the door itself refuses.
         *
         * (No backticks in this comment on purpose: it lives inside a
         * template literal, and one would end the string.)
         *
         * A concept with no playable rung cannot be demonstrated by anyone, so
         * requiring it is requiring the impossible. It stops being skipped the
         * moment something is authored for it.
         */
        WHEN EXISTS (
            SELECT 1
            FROM concepts c2 JOIN topics t2 ON t2.id = c2.topic_id
            WHERE (t2.display_order, c2.display_order)
                  < ((SELECT t_ord FROM here), (SELECT c_ord FROM here))
              AND NOT EXISTS (
                  SELECT 1 FROM concept_demonstrations d2
                  WHERE d2.user_id = $1 AND d2.concept_id = c2.id
              )
              AND EXISTS (
                  SELECT 1 FROM challenges ch
                  LEFT JOIN questions q          ON q.challenge_id = ch.id AND q.is_active
                  LEFT JOIN bug_hunt_incidents i ON i.challenge_id = ch.id AND i.is_active
                  WHERE ch.concept_id = c2.id AND ch.role = 'practise' AND ch.is_active
                    AND (q.id IS NOT NULL OR i.id IS NOT NULL OR ch.activity IS NOT NULL)
              )
        ) THEN 'locked'

        -- Every earlier concept is done, so any earlier checkpoint is now the
        -- learner's position and this concept waits behind it.
        WHEN EXISTS (
            SELECT 1 FROM topics t3
            WHERE t3.display_order < (SELECT t_ord FROM here)
              AND t3.slug = ANY($3::TEXT[])
              AND NOT EXISTS (
                  SELECT 1 FROM topic_challenge_completions tc
                  WHERE tc.user_id = $1 AND tc.topic_id = t3.id
              )
        ) THEN 'locked'

        ELSE 'current'
    END AS state
    -- FROM here, so an unknown slug returns NO ROW rather than a verdict. A
    -- bare SELECT always produces one row, which made a concept that does not
    -- exist read as current.
    FROM here`;

export type ConceptState = "demonstrated" | "current" | "locked";

export async function findConceptState(
    userId: string,
    conceptSlug: string
): Promise<ConceptState | null> {
    const result = await pool.query<{ state: ConceptState }>(CONCEPT_STATE_SQL, [
        userId,
        conceptSlug,
        [...CHALLENGED]
    ]);

    return result.rows[0]?.state ?? null;
}

/**
 * Whether this learner may play the activity behind a challenge.
 *
 * Enforcement, not decoration. The encounter can describe a locked concept --
 * the world has to be able to say why a door is shut -- but nothing playable is
 * served for one, and an answer posted against one is refused. Hiding the link
 * was never enough.
 */
export async function mayPlayChallenge(userId: string, challengeId: string): Promise<boolean> {
    const owner = await pool.query<{ slug: string }>(
        `SELECT c.slug FROM challenges ch
         JOIN concepts c ON c.id = ch.concept_id
         WHERE ch.id = $1 AND ch.is_active`,
        [challengeId]
    );

    const slug = owner.rows[0]?.slug;

    if (!slug) {
        return false;
    }

    return (await findConceptState(userId, slug)) !== "locked";
}


/**
 * The one thing standing between this learner and a locked concept.
 *
 * Exists so a shut door can name what opens it. Returns the earliest unfinished
 * concept, or the outstanding checkpoint if every earlier concept is done --
 * which is the same order CONCEPT_STATE_SQL applies, asked for a name instead of
 * a verdict.
 */
export async function findBlocker(
    userId: string,
    conceptSlug: string
): Promise<{ kind: "concept" | "checkpoint"; slug: string; name: string } | null> {
    const earlier = await pool.query<{ slug: string; name: string }>(
        `WITH here AS (
             SELECT t.display_order AS t_ord, c.display_order AS c_ord
             FROM concepts c JOIN topics t ON t.id = c.topic_id WHERE c.slug = $2
         )
         SELECT c.slug, c.name
         FROM concepts c JOIN topics t ON t.id = c.topic_id
         WHERE (t.display_order, c.display_order)
               < ((SELECT t_ord FROM here), (SELECT c_ord FROM here))
           AND NOT EXISTS (
               SELECT 1 FROM concept_demonstrations d
               WHERE d.user_id = $1 AND d.concept_id = c.id
           )
         ORDER BY t.display_order, c.display_order
         LIMIT 1`,
        [userId, conceptSlug]
    );

    if (earlier.rows[0]) {
        return { kind: "concept", ...earlier.rows[0] };
    }

    const checkpoint = await pool.query<{ slug: string; name: string }>(
        `WITH here AS (
             SELECT t.display_order AS t_ord FROM concepts c
             JOIN topics t ON t.id = c.topic_id WHERE c.slug = $2
         )
         SELECT t.slug, t.name FROM topics t
         WHERE t.display_order < (SELECT t_ord FROM here)
           AND t.slug = ANY($3::TEXT[])
           AND NOT EXISTS (
               SELECT 1 FROM topic_challenge_completions tc
               WHERE tc.user_id = $1 AND tc.topic_id = t.id
           )
         ORDER BY t.display_order
         LIMIT 1`,
        [userId, conceptSlug, [...CHALLENGED]]
    );

    return checkpoint.rows[0] ? { kind: "checkpoint", ...checkpoint.rows[0] } : null;
}

/* -------------------------------------------------- evidence for a concept */

export interface DemonstrationVerdict {
    allowed: boolean;
    /** Rungs the learner still has to clear. Empty when allowed. */
    outstanding: string[];
    /** True when the concept declares rungs but none can be played yet. */
    unplayable: boolean;
}

/**
 * Whether this learner has produced the evidence a concept requires.
 *
 * THE RULE: every declared rung that HAS a playable activity must be cleared.
 * Rungs with nothing built are not counted -- they are a gap in the content, and
 * holding a learner responsible for an exercise nobody wrote would make the
 * curriculum's own holes into a punishment.
 *
 * WHAT THIS REPLACES. `POST /concepts/:concept/demonstrate` used to record
 * whatever the client claimed. Reading a lesson and pressing Continue recorded a
 * demonstration with no evidence behind it, and that demonstration is what the
 * world reads, what points are counted from, and what unlocks the next concept.
 * Lesson viewed is not concept demonstrated.
 *
 * A CONCEPT WITH NOTHING PLAYABLE CANNOT BE DEMONSTRATED, and that is deliberate
 * rather than an oversight. 87 of 100 concepts currently have no activity at any
 * rung. Letting those be completed by reading would be exactly the behaviour
 * this rule exists to stop; `unplayable` says so explicitly so the caller can
 * report a content gap rather than a refusal.
 */
export async function evidenceFor(
    userId: string,
    conceptSlug: string
): Promise<DemonstrationVerdict> {
    const rows = await pool.query<RungRow>(ENCOUNTER_RUNGS_SQL, [userId, conceptSlug]);
    const rungs = rungsFromRows(rows.rows);
    const playable = rungs.filter((r) => r.options.length > 0);

    if (playable.length === 0) {
        return { allowed: false, outstanding: [], unplayable: true };
    }

    const outstanding = playable.filter((r) => !r.cleared).map((r) => r.demandSlug);

    return { allowed: outstanding.length === 0, outstanding, unplayable: false };
}

/**
 * Whether a topic's checkpoint may be recorded for this learner.
 *
 * THE SAME HOLE AS /demonstrate, ONE LEVEL UP. The concept endpoint used to
 * accept whatever the client claimed, and was closed by requiring evidence. The
 * topic checkpoint still accepted a claim -- so a learner who had done nothing
 * at all could POST it, complete the topic, and open the next one. Every gate
 * built on concept reachability was intact and this went around all of them.
 *
 * THE PRECONDITION IS THE TOPIC'S OWN. A checkpoint sits after every concept in
 * its topic and closes it; findJourneyPath only ever makes one `current` once
 * `conceptsDone` holds. That is the rule being enforced here rather than a new
 * one invented for the purpose.
 *
 * NOT PER-QUESTION EVIDENCE, deliberately. A checkpoint's questions are authored
 * in lessons.ts and have no challenge rows, so there is nothing to derive
 * clearance from -- and inventing a store for it would be a second progress
 * model. Requiring the whole topic to be demonstrated closes the bypass without
 * one; tightening further belongs with moving checkpoints into the database.
 */
export async function topicReadyForCheckpoint(
    userId: string,
    topicSlug: string
): Promise<{ ready: boolean; outstanding: string[] } | null> {
    const rows = await pool.query<{ slug: string; demonstrated: boolean }>(
        `SELECT c.slug,
                EXISTS (
                    SELECT 1 FROM concept_demonstrations d
                    WHERE d.user_id = $1 AND d.concept_id = c.id
                ) AS demonstrated
         FROM concepts c
         JOIN topics t ON t.id = c.topic_id
         WHERE t.slug = $2
         ORDER BY c.display_order`,
        [userId, topicSlug]
    );

    if (rows.rows.length === 0) {
        return null;
    }

    const outstanding = rows.rows.filter((r) => !r.demonstrated).map((r) => r.slug);

    return { ready: outstanding.length === 0, outstanding };
}
