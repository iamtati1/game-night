import { curriculumEligible, metConceptsCte } from "./eligibility.js";
import { difficultyCeilingCte, withinFrontier } from "./frontier.js";
import { roleEligible } from "./roles.js";

/**
 * The one place the curriculum layers are composed.
 *
 * Three modules answer three separate questions, and each stays ignorant of the
 * others:
 *
 *     eligibility.ts   is this concept reachable?          (prerequisites)
 *     roles.ts         meet it, or drill it?               (introduce/practise)
 *     frontier.ts      how demanding a drill?              (challenges.difficulty)
 *
 * Composing them is itself a decision, and it belongs somewhere rather than
 * being repeated at each call site. Before this existed, Code Blitz's candidate
 * query, its availability count and Bug Hunt's two equivalents each spelled the
 * conjunction out, and every new layer meant editing four places -- with the
 * failure mode that an availability count clears a session the dealer cannot
 * fill, which the player meets halfway into starting.
 *
 * This is composition, not collapse. The rules still live in their own modules,
 * are still tested in their own files, and are still readable one at a time.
 *
 * DEMAND IS DELIBERATELY ABSENT. curriculum/demand.ts derives a second
 * progression ceiling -- which kind of thinking a learner should meet next --
 * and nothing here consumes it. How the two ceilings interact when choosing
 * content is a real design question: their product is not obviously the right
 * answer, and a concept can declare a rung no challenge fills yet. Composing it
 * in on the difficulty layer's pattern would settle that question by accident
 * and bury it inside a predicate nobody could read. The model is derived and
 * tested first; the selector is the next decision, taken on purpose.
 */

/**
 * Every CTE the predicates below read from, ready to follow a `WITH`.
 *
 * @param userParam the positional placeholder holding the user id.
 */
export function curriculumCtes(userParam: string): string {
    return `${metConceptsCte(userParam)},\n${difficultyCeilingCte(userParam)}`;
}

/**
 * The full curriculum gate for one content alias.
 *
 * Order is readability only -- SQL is free to evaluate them in any order -- but
 * it reads the way the pipeline is drawn: reachable, then the right job, then
 * the right rung.
 *
 * @param alias the SQL alias of the content table, which must expose challenge_id.
 */
export function curriculumSelects(alias: string): string {
    return `${curriculumEligible(alias)}
          AND ${roleEligible(alias)}
          AND ${withinFrontier(alias)}`;
}
