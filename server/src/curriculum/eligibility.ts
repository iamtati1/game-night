/**
 * Curriculum eligibility: WHICH content a learner may be dealt.
 *
 * This module answers one question and deliberately not a second:
 *
 *     ELIGIBILITY  "may this learner be shown this challenge at all?"   <- here
 *     PACING       "of the things they may see, what comes next?"       <- curve.ts
 *
 * The two were conflated until now. Both dealers selected from the whole active
 * bank and let a difficulty ramp decide everything, so a learner could be dealt
 * a closure question having never met a function. Separating them is the point
 * of this slice: eligibility RESTRICTS THE UNIVERSE the existing curve chooses
 * from, and the curve itself is untouched.
 *
 * WHY SQL RATHER THAN A PURE FUNCTION. The rest of this codebase keeps design
 * decisions in testable pure code -- dealSession, the scoring modules -- and
 * leaves SQL dumb. Eligibility cannot follow that shape: the answer depends on
 * the learner's entire history joined against the prerequisite graph, so a pure
 * function would need every row fetched first. Expressed as a predicate it
 * composes into the candidate query each game already runs, and costs no extra
 * round trip. The fragments below are therefore the rule itself, not a
 * projection of it, and eligibility.test.ts executes them against a real
 * PostgreSQL rather than string-matching them.
 *
 * NOT IN THIS SLICE, each for a stated reason:
 *
 *   role        challenges.role gates Learn / Play / Reinforce -- see migration
 *               021. All three existing challenges are `practise` and there are
 *               zero `introduce` challenges anywhere, so enforcing the role gate
 *               today would hide 100% of curriculum-tagged content. It belongs
 *               with Learn Beats becoming challenge-backed.
 *
 *   demand      walking recall -> ... -> explain needs more than three
 *               challenges on one concept to walk through.
 *
 *   mastery     "met" here means encountered, never understood. No thresholds,
 *               no success rates, no decay. Availability and competence are
 *               different axes and this module only decides availability.
 */

/**
 * The name of the CTE holding this learner's encountered concepts.
 *
 * Exported because roles.ts reads the same set: whether a learner should be
 * INTRODUCED to a concept or PRACTISE it is a different question from whether
 * the concept is reachable at all, but both are answered from one derivation of
 * learner state. One constant so the two layers cannot drift onto different
 * CTE names, and so a query that composes either fragment knows what it must
 * declare.
 */
export const MET_CONCEPTS = "met";

/** Local alias, so the SQL below stays readable. */
const MET = MET_CONCEPTS;

/**
 * Guards the one interpolation point these fragments have.
 *
 * Shared with roles.ts: both are written against a caller-supplied alias, and
 * "what counts as a content alias" should have exactly one definition.
 */
export function assertContentAlias(alias: string, fn: string): void {
    if (!/^[a-z][a-z0-9_]*$/.test(alias)) {
        throw new Error(`${fn} expects a table alias, got ${alias}`);
    }
}

/**
 * Every concept this learner has already encountered.
 *
 * DERIVED, NOT STORED. There is no learner_concept_state table and this slice
 * does not add one: the evidence already exists durably in the round tables,
 * which keep a foreign key to the content played and never lose a row. A table
 * would be a second source of truth that can silently disagree with the sessions
 * it came from, and it would have to be backfilled from exactly this query
 * anyway. Promote it to a materialised table when profiling asks for it, or when
 * state needs to carry something this query cannot derive -- decay, a manual
 * placement, an instructor override. Not before.
 *
 * Three sources of evidence, one derivation. Two are derived from gameplay and
 * cost nothing to keep: content -> challenges -> concept. The third is the one
 * fact gameplay cannot produce -- completing a Learn Beat, which is not a dealt
 * unit and has no round row to read. See migration 024 for why that needed a
 * table and why it is three columns wide.
 *
 * Flush, Reaction and Memory contribute nothing yet, the first because
 * flush_snippets carries no challenge_id and the other two because they have no
 * content rows at all.
 *
 * ENCOUNTERED, NOT PASSED. A timed-out question and a failed hunt both count.
 * The learner met the concept; whether they got it right is the competence
 * question this slice does not ask.
 *
 * The session's own outcome is deliberately not filtered on either. A run that
 * was later abandoned still happened, and the unit's own status is the evidence.
 *
 * UNION rather than UNION ALL: only the distinct concept ids matter, and letting
 * PostgreSQL deduplicate here keeps the NOT IN below linear in concepts rather
 * than in units played.
 *
 * @param userParam the positional placeholder holding the user id in the query
 *                  this CTE is composed into -- "$1", "$2", and so on.
 */
export function metConceptsCte(userParam: string): string {
    // Interpolated into SQL, so it may only ever be a placeholder token. The
    // callers pass literals today; this makes it impossible for that to quietly
    // become a value.
    if (!/^\$\d+$/.test(userParam)) {
        throw new Error(`metConceptsCte expects a positional placeholder, got ${userParam}`);
    }

    return `${MET} AS (
        SELECT ch.concept_id
        FROM session_questions sq
        JOIN game_sessions gs ON gs.id = sq.game_session_id
        JOIN questions q      ON q.id  = sq.question_id
        JOIN challenges ch    ON ch.id = q.challenge_id
        WHERE gs.user_id = ${userParam}
          AND sq.status IN ('answered', 'timed_out')

        UNION

        SELECT ch.concept_id
        FROM bug_hunt_rounds bhr
        JOIN game_sessions gs     ON gs.id  = bhr.game_session_id
        JOIN bug_hunt_incidents bhi ON bhi.id = bhr.incident_id
        JOIN challenges ch        ON ch.id  = bhi.challenge_id
        WHERE gs.user_id = ${userParam}
          AND bhr.status IN ('resolved', 'failed')

        UNION

        -- The learner sat through the concept's introduction and acknowledged
        -- it. Recorded rather than derived because a Learn Beat is not dealt,
        -- not scored and not timed -- there is no round to read it from.
        --
        -- This is still an ENCOUNTER, on exactly the same footing as the two
        -- above: it says the learner has met the concept, not that they
        -- understood it.
        SELECT ch.concept_id
        FROM introduction_completions ic
        JOIN challenges ch ON ch.id = ic.challenge_id
        WHERE ic.user_id = ${userParam}
    )`;
}

/**
 * Whether one row of curriculum-tagged content may be dealt to this learner.
 *
 * Composed into a query that already declares the CTE from metConceptsCte().
 * Written against an alias rather than a table so Code Blitz (questions q) and
 * Bug Hunt (bug_hunt_incidents i) share one definition of the rule -- the same
 * reason ELIGIBLE_QUESTION_PREDICATE and ELIGIBLE_INCIDENT_PREDICATE are
 * constants rather than inline SQL.
 *
 * THREE CASES, and the third is the one that matters right now:
 *
 *   prerequisite met                          -> does not block
 *   prerequisite unmet, Jolt can teach it     -> BLOCKS
 *   prerequisite unmet, Jolt cannot teach it  -> does not block
 *
 * "Can teach it" means an active challenge exists for that concept. Without
 * that third case the curriculum would lock itself: `equality` requires
 * `comparison-operators` and `type-coercion`, neither of which has any content,
 * so neither could ever be met, so the three equality items authored in the last
 * slice would be unreachable forever. A prerequisite Jolt has no way to deliver
 * cannot fairly be a barrier.
 *
 * That is a TRANSITIONAL rule and it tightens by itself. The day someone tags a
 * `type-coercion` challenge, equality starts being genuinely gated -- no code
 * changes, the boundary just moves as coverage grows.
 *
 * UNTAGGED CONTENT PASSES, for the same transitional reason and no other. 232 of
 * the 235 active questions carry challenge_id IS NULL. Gating them would collapse
 * the candidate pool to one question and 503 every run. This is a compatibility
 * escape hatch during the migration to a fully tagged bank, NOT the pedagogical
 * model -- the end state is that every dealt item is tagged and this disjunct
 * becomes dead weight worth deleting.
 *
 * DIRECT PREREQUISITES ONLY, no recursion. Transitive safety falls out
 * inductively: a concept is only ever met by being dealt, and it can only be
 * dealt once its own direct prerequisites are met. Walking the graph at deal
 * time would re-derive an invariant the curriculum tests already hold, and the
 * acyclicity those tests assert is what makes the induction sound.
 *
 * @param alias the SQL alias of the content table, which must expose challenge_id.
 */
export function curriculumEligible(alias: string): string {
    assertContentAlias(alias, "curriculumEligible");

    return `(
        ${alias}.challenge_id IS NULL
        OR NOT EXISTS (
            SELECT 1
            FROM challenges gated
            JOIN prerequisites p ON p.concept_id = gated.concept_id
            WHERE gated.id = ${alias}.challenge_id
              AND p.requires_id NOT IN (SELECT concept_id FROM ${MET})
              AND EXISTS (
                  SELECT 1
                  FROM challenges teachable
                  WHERE teachable.concept_id = p.requires_id
                    AND teachable.is_active
              )
        )
    )`;
}
