/**
 * The demand ceiling: WHAT KIND OF THINKING this learner should meet next for a
 * concept.
 *
 * The curriculum's second progression axis, and deliberately not a replacement
 * for the first:
 *
 *     frontier.ts   how DEMANDING an exercise is    (challenges.difficulty)
 *     demand.ts     what it asks the learner to DO  (demands.display_order)
 *
 * A concept's state is eventually two coordinates, not one --
 * `equality: demand ceiling = diagnose, difficulty ceiling = 2` -- and the two
 * are independent. Predicting the output of a hard snippet and repairing an easy
 * one are different kinds of work, and neither number implies the other.
 *
 * THE LADDER IS PER CONCEPT, AND IT IS DECLARED, NOT ASSUMED. Seven rungs exist
 * -- recall, recognise, predict, produce, diagnose, repair, explain -- and no
 * concept uses all of them. `concept_demands` says which ones a concept can
 * honestly be practised at, and the order comes from demands.display_order. No
 * rung's position is written down here: asking the database what "deeper than"
 * means is the whole reason demands is a table rather than an enum.
 *
 * WHY DECLARED RUNGS RATHER THAN RUNGS WITH CONTENT. The ladder is a statement
 * about the CONCEPT -- what it affords -- so it comes from concept_demands even
 * where no challenge has been authored yet. equality declares `explain` and has
 * no explain content; its ladder still ends at explain, and the ceiling can
 * legitimately point at a rung nothing can currently fill. That is a coverage
 * gap being visible rather than a bug. Selection will have to reconcile the two,
 * which is exactly the decision this slice defers.
 *
 * EXPOSURE, NOT MASTERY. The ceiling moves when the learner has FACED a practice
 * challenge at a rung -- answered or timed out, resolved or failed. A wrong
 * answer counts. There is no threshold, no accuracy and no learner-state table,
 * for the same reasons as the two layers below.
 *
 * NOT WIRED INTO SELECTION, ON PURPOSE. Nothing composes these fragments into a
 * candidate query yet. How demand and difficulty interact when choosing content
 * is a real design question -- the product of two ceilings is not obviously the
 * right answer -- and guessing at it here would bury that decision inside an
 * opaque multidimensional predicate. The model is derived and tested first; the
 * selector comes after, deliberately.
 */

/** Guards the one interpolation point, matching the other curriculum fragments. */
function assertUserParam(userParam: string, fn: string): void {
    if (!/^\$\d+$/.test(userParam)) {
        throw new Error(`${fn} expects a positional placeholder, got ${userParam}`);
    }
}

/**
 * Every (concept, demand rung) this learner has actually faced.
 *
 * Self-contained for the same reason metDifficultiesCte is: a caller declares
 * only the CTEs it reads, and a query carrying an unused one invites the next
 * reader to wonder which is authoritative.
 *
 * ROLE = 'practise' ONLY, which excludes both of the other two for different
 * reasons. An `introduce` challenge has no content row to be faced at all -- a
 * Learn Beat is not dealt -- and completing one says the CONCEPT was met, never
 * that a rung was climbed. A `reinforce` challenge is never selected by
 * roles.ts, so it cannot be faced today; the filter is here so that when
 * reinforcement does arrive it revisits rungs without silently advancing them,
 * which is the whole distinction between practice and reinforcement.
 *
 * Pending is excluded: a unit dealt and never faced is not an encounter.
 *
 * The rung's ORDER is carried rather than its slug, because the only question
 * asked of it is "deeper than". Nothing downstream needs the name.
 *
 * @param userParam the positional placeholder holding the user id.
 */
export function metDemandsCte(userParam: string): string {
    assertUserParam(userParam, "metDemandsCte");

    return `met_demands AS (
        SELECT ch.concept_id, d.display_order AS demand_order
        FROM session_questions sq
        JOIN game_sessions gs ON gs.id = sq.game_session_id
        JOIN questions q      ON q.id  = sq.question_id
        JOIN challenges ch    ON ch.id = q.challenge_id
        JOIN demands d        ON d.id  = ch.demand_id
        WHERE gs.user_id = ${userParam}
          AND sq.status IN ('answered', 'timed_out')
          AND ch.role = 'practise'

        UNION

        SELECT ch.concept_id, d.display_order
        FROM bug_hunt_rounds bhr
        JOIN game_sessions gs       ON gs.id  = bhr.game_session_id
        JOIN bug_hunt_incidents bhi ON bhi.id = bhr.incident_id
        JOIN challenges ch          ON ch.id  = bhi.challenge_id
        JOIN demands d              ON d.id   = ch.demand_id
        WHERE gs.user_id = ${userParam}
          AND bhr.status IN ('resolved', 'failed')
          AND ch.role = 'practise'
    )`;
}

/**
 * One row per concept the curriculum declares a ladder for: the rung this
 * learner should meet next.
 *
 * THE CEILING RISES AND NEVER FALLS, the same shape as the difficulty ceiling.
 * It is the next declared rung above the deepest one reached -- or, for a
 * learner who has reached none, the shallowest rung the concept declares.
 *
 *     declares {predict, produce, diagnose}
 *
 *       faced {}                  -> predict
 *       faced {predict}           -> produce
 *       faced {predict, produce}  -> diagnose
 *       faced {predict, diagnose} -> diagnose     <- NOT produce
 *       faced all three           -> diagnose
 *
 * THE FOURTH LINE IS THE ONE THAT MATTERS. A learner who met `diagnose` through
 * Bug Hunt before ever meeting `produce` in Code Blitz has genuinely done
 * diagnostic work, and sending them back down the ladder would be punishing them
 * for which game dealt what. Exposure is not a prerequisite chain. The unmet
 * shallower rung is not lost either -- a ceiling admits everything beneath it --
 * so `produce` is still ahead of them, just no longer gating.
 *
 * Emits (concept_id, ceiling_order). Ceilings are joined back to `demands` by
 * the caller when a name is wanted; nothing here needs one.
 *
 * Declares the same `met_demands` CTE this reads from, so a caller writes
 * `WITH ${demandCeilingCte("$1")}` and gets both.
 *
 * @param userParam the positional placeholder holding the user id.
 */
export function demandCeilingCte(userParam: string): string {
    assertUserParam(userParam, "demandCeilingCte");

    return `${metDemandsCte(userParam)},
    demand_ceiling AS (
        SELECT
            cd.concept_id,
            COALESCE(
                (
                    -- The next declared rung above the deepest one reached.
                    --
                    -- COALESCE(..., 0) is the learner who has reached none:
                    -- display_order is >= 1 by constraint, so this becomes "the
                    -- shallowest rung this concept declares".
                    SELECT MIN(above.display_order)
                    FROM concept_demands step
                    JOIN demands above ON above.id = step.demand_id
                    WHERE step.concept_id = cd.concept_id
                      AND above.display_order > COALESCE(
                          (
                              SELECT MAX(faced.demand_order)
                              FROM met_demands faced
                              WHERE faced.concept_id = cd.concept_id
                          ),
                          0
                      )
                ),
                (
                    -- Nothing declared above what they reached: the ceiling is
                    -- the deepest rung this concept affords, and stays there.
                    SELECT MAX(top.display_order)
                    FROM concept_demands step
                    JOIN demands top ON top.id = step.demand_id
                    WHERE step.concept_id = cd.concept_id
                )
            ) AS ceiling_order
        FROM concept_demands cd
        GROUP BY cd.concept_id
    )`;
}
