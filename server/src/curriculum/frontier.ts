import { assertContentAlias } from "./eligibility.js";

/**
 * The curriculum practice frontier: HOW HARD a practice exercise this learner
 * should be offered for a concept they have met.
 *
 * The fourth layer, and the last one before pacing:
 *
 *     PREREQUISITES  "is this concept reachable?"                eligibility.ts
 *     ROLE           "meet it, or drill it?"                     roles.ts
 *     FRONTIER       "how demanding a drill?"                    here
 *     PACING         "which slot, under what clock?"             game/curve.ts
 *
 * TWO DIFFICULTY SYSTEMS, AND THEY ARE NOT THE SAME NUMBER.
 *
 *   questions.difficulty   Code Blitz's own ramp -- how much time pressure the
 *                          slot carries. Owned by curve.ts. Untouched here.
 *   challenges.difficulty  how conceptually demanding the exercise is, derived
 *                          from (topic.tier, demand.order) by the curriculum.
 *
 * A question can be questions.difficulty 3 because it needs a fast answer while
 * its challenge is difficulty 1 because it is an introductory drill. This module
 * reads only the second, and curve.ts still reads only the first.
 *
 * EXPOSURE, NOT MASTERY. The frontier advances when the learner has FACED
 * content at a difficulty -- answered or timed out, resolved or failed. Not when
 * they got it right. There is no threshold, no percentage and no learner-state
 * table; this is the same encounter signal the two layers above already use,
 * asked at a finer grain.
 */

/**
 * Every (concept, practice difficulty) this learner has actually faced.
 *
 * SELF-CONTAINED, deliberately, even though it repeats the two join chains in
 * metConceptsCte. Each CTE stands alone so callers can declare only what they
 * read: the introduction query needs `met` and has no use for difficulties, and
 * a query that declared an unused CTE would be inviting the next reader to
 * wonder which one is authoritative.
 *
 * ROLE = 'practise' ONLY. The frontier is about practice, so an introduction
 * does not advance it -- completing a Learn Beat says the CONCEPT was met, never
 * that a difficulty was. That distinction is the whole reason
 * introduction_completions is absent from this derivation while it is present in
 * metConceptsCte.
 *
 * Pending rounds are excluded for the same reason they are excluded there: a
 * unit that was dealt and never faced is not an encounter.
 */
export function metDifficultiesCte(userParam: string): string {
    if (!/^\$\d+$/.test(userParam)) {
        throw new Error(`metDifficultiesCte expects a positional placeholder, got ${userParam}`);
    }

    return `met_difficulties AS (
        SELECT ch.concept_id, ch.difficulty
        FROM session_questions sq
        JOIN game_sessions gs ON gs.id = sq.game_session_id
        JOIN questions q      ON q.id  = sq.question_id
        JOIN challenges ch    ON ch.id = q.challenge_id
        WHERE gs.user_id = ${userParam}
          AND sq.status IN ('answered', 'timed_out')
          AND ch.role = 'practise'

        UNION

        SELECT ch.concept_id, ch.difficulty
        FROM bug_hunt_rounds bhr
        JOIN game_sessions gs       ON gs.id  = bhr.game_session_id
        JOIN bug_hunt_incidents bhi ON bhi.id = bhr.incident_id
        JOIN challenges ch          ON ch.id  = bhi.challenge_id
        WHERE gs.user_id = ${userParam}
          AND bhr.status IN ('resolved', 'failed')
          AND ch.role = 'practise'
    )`;
}

/**
 * One row per concept with practice content: the highest rung this learner may
 * currently be dealt.
 *
 * THE SINGLE DEFINITION OF THE CEILING. withinFrontier reads it, and so does
 * Code Blitz's candidate query, which needs the VALUE rather than a yes/no --
 * the selection policy ranks candidates by how far below the ceiling they sit,
 * and cannot do that from a predicate. Two copies of this arithmetic would be
 * two things to keep in step.
 *
 * Declares the met_difficulties CTE it reads from, so a caller writes
 * `WITH ${difficultyCeilingCte("$1")}` and gets both.
 *
 * @param userParam the positional placeholder holding the user id.
 */
export function difficultyCeilingCte(userParam: string): string {
    return `${metDifficultiesCte(userParam)},
    difficulty_ceiling AS (
        SELECT
            rungs.concept_id,
            COALESCE(
                (
                    -- The next rung above the highest one reached.
                    --
                    -- COALESCE(..., 0) is the brand-new learner: no rung
                    -- reached, and every difficulty is >= 1 by the CHECK
                    -- constraint on challenges, so this becomes "the lowest rung
                    -- there is".
                    SELECT MIN(step.difficulty)
                    FROM challenges step
                    WHERE step.concept_id = rungs.concept_id
                      AND step.role = 'practise'
                      AND step.is_active
                      AND step.difficulty > COALESCE(
                          (
                              SELECT MAX(faced.difficulty)
                              FROM met_difficulties faced
                              WHERE faced.concept_id = rungs.concept_id
                          ),
                          0
                      )
                ),
                (
                    -- Nothing above what they have reached: the ceiling is the
                    -- top rung, and stays there.
                    MAX(rungs.difficulty)
                )
            ) AS ceiling
        FROM challenges rungs
        WHERE rungs.role = 'practise' AND rungs.is_active
        GROUP BY rungs.concept_id
    )`;
}

/**
 * Whether a practice exercise is at or below this learner's frontier for its
 * concept.
 *
 * THE FRONTIER IS A CEILING, and it only ever rises. It is the next active
 * practice difficulty above the highest one the learner has reached -- or, for a
 * learner who has reached none, the lowest one there is. A challenge passes when
 * its difficulty is at or below that.
 *
 *     available {1,2,3}, faced {}      -> ceiling 1  -> eligible {1}
 *     available {1,2,3}, faced {1}     -> ceiling 2  -> eligible {1,2}
 *     available {1,2,3}, faced {1,2}   -> ceiling 3  -> eligible {1,2,3}
 *     available {1,2,3}, faced {1,3}   -> ceiling 3  -> eligible {1,2,3}
 *     available {1,2,3}, faced {1,2,3} -> ceiling 3  -> eligible {1,2,3}
 *
 * THE FOURTH LINE IS THE POINT, and it is a deliberate change from the first
 * version of this rule. That version took the lowest UNFACED rung, which meant a
 * learner who reached difficulty 3 without passing through 2 lost access to 3
 * until they went back -- a ceiling that could fall. Exposure is not a
 * prerequisite chain: games are different modalities and a learner may meet a
 * hard rung early through Bug Hunt and an easy one later through Code Blitz.
 * Taking something away because the order was untidy punishes them for how the
 * content happened to be dealt.
 *
 * NOTHING BELOW THE CEILING IS EVER WITHDRAWN either, so a learner working at
 * difficulty 2 can still be dealt difficulty 1. The ceiling rises; it does not
 * step.
 *
 * MEASURED PER DIFFICULTY, NOT PER CHALLENGE. equality has two practice
 * challenges at difficulty 2; facing either one means difficulty 2 has been
 * encountered. The frontier is a statement about how demanding a rung the
 * learner has stood on, not about which exercises they have exhausted -- that
 * would be coverage, which is a different question and not one this layer asks.
 *
 * ONLY `practise` IS GATED. An introduction has no content row to reach this
 * predicate, and `reinforce` is already withheld by roles.ts. Anything else is
 * passed through rather than silently blocked by a rule that was not written
 * with it in mind.
 *
 * UNTAGGED CONTENT PASSES, unchanged, for the same transitional reason as the
 * two layers above: almost nothing is tagged, and gating it would empty the game.
 *
 * Reads the ceiling from difficultyCeilingCte, which the caller must declare.
 *
 * @param alias the SQL alias of the content table, which must expose challenge_id.
 */
export function withinFrontier(alias: string): string {
    assertContentAlias(alias, "withinFrontier");

    return `(
        ${alias}.challenge_id IS NULL
        OR EXISTS (
            SELECT 1
            FROM challenges rung
            WHERE rung.id = ${alias}.challenge_id
              AND (
                  rung.role <> 'practise'
                  OR rung.difficulty <= (
                      SELECT ceiling FROM difficulty_ceiling
                      WHERE difficulty_ceiling.concept_id = rung.concept_id
                  )
              )
        )
    )`;
}
