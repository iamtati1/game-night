import { MET_CONCEPTS, assertContentAlias } from "./eligibility.js";

/**
 * Role eligibility: WHICH JOB a piece of content is doing for this learner.
 *
 * The third layer of the selection pipeline, and deliberately a separate one:
 *
 *     PREREQUISITES  "is this concept reachable at all?"        eligibility.ts
 *     ROLE           "should this learner meet it or drill it?" here
 *     PACING         "which slot does it go in?"                game/curve.ts
 *
 * Prerequisites answer a question about the CURRICULUM: equality sits behind
 * comparison-operators, for everyone, forever. Role answers a question about
 * THIS LEARNER AT THIS MOMENT: someone who has never seen equality needs to be
 * shown it before being asked to predict its output. Collapsing the two would
 * mean a curriculum edit and a learner's progress changing the same predicate,
 * and neither would be readable afterwards.
 *
 * Both read one derived learner state -- the `met` CTE from eligibility.ts --
 * because "has this learner encountered the concept" is the input to both
 * questions. That is shared data, not shared responsibility.
 *
 * ENCOUNTERED, NOT MASTERED. The transition from introduce to practise fires on
 * first contact: a question answered, or timed out; an incident resolved, or
 * failed. Not on accuracy, not on a streak, not on a threshold. A learner who
 * met `equality` and got it wrong has still met it, and the right next thing for
 * them is practice rather than another introduction. Competence is a later
 * layer and will read the same history when it arrives.
 */

/**
 * The roles this layer will select. `reinforce` is deliberately absent.
 *
 * Reinforcement is not "practice again" -- it is practice at the right DISTANCE
 * from the last encounter, which needs a recency and spacing design this slice
 * does not have. Selecting reinforce content on the same rule as practise would
 * make the two indistinguishable and quietly spend the role that spacing will
 * need. Until that design exists, a reinforce challenge is authored, stored, and
 * never dealt.
 */
export const SELECTABLE_ROLES = ["introduce", "practise"] as const;

export type SelectableRole = (typeof SELECTABLE_ROLES)[number];

/**
 * Whether one row of curriculum-tagged content is doing the right job for this
 * learner right now.
 *
 * Composed into a query that already declares the CTE from metConceptsCte(),
 * and written against an alias so Code Blitz (questions q) and Bug Hunt
 * (bug_hunt_incidents i) share one definition -- the same reason
 * curriculumEligible() takes one.
 *
 * THE RULE, in full:
 *
 *   introduce   concept NOT yet encountered   -> eligible
 *   introduce   concept already encountered   -> withheld: the introduction has
 *                                                already happened, and repeating
 *                                                it is not the next useful thing
 *   practise    concept already encountered   -> eligible
 *   practise    concept NOT yet encountered   -> withheld: being asked to
 *                                                predict output for something
 *                                                never shown is the experience
 *                                                this layer exists to stop
 *   reinforce   either                        -> withheld, see SELECTABLE_ROLES
 *   inactive    either                        -> withheld; that is what
 *                                                is_active is for
 *
 * THIS IS NOT A PREREQUISITE CHECK AND DOES NOT REPEAT ONE. A concept can be
 * encountered and still be unreachable -- if one of its prerequisites later
 * gains content the learner has not met, curriculumEligible() withholds it and
 * this layer never gets a say. The two predicates are ANDed by the caller and
 * neither is sufficient alone.
 *
 * UNTAGGED CONTENT PASSES, unchanged from the previous slice and for the same
 * transitional reason: 231 of the 232 dealable questions carry challenge_id IS
 * NULL, and they have no role to be judged by. Gating them would empty the game.
 * The escape hatch disappears when the bank is tagged, not before.
 *
 * @param alias the SQL alias of the content table, which must expose challenge_id.
 */
export function roleEligible(alias: string): string {
    assertContentAlias(alias, "roleEligible");

    return `(
        ${alias}.challenge_id IS NULL
        OR EXISTS (
            SELECT 1
            FROM challenges job
            WHERE job.id = ${alias}.challenge_id
              AND job.is_active
              AND (
                  (job.role = 'introduce'
                   AND job.concept_id NOT IN (SELECT concept_id FROM ${MET_CONCEPTS}))
                  OR
                  (job.role = 'practise'
                   AND job.concept_id IN (SELECT concept_id FROM ${MET_CONCEPTS}))
              )
        )
    )`;
}
