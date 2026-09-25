/**
 * The journey: WHERE IN JAVASCRIPT this learner currently is.
 *
 * Every other curriculum layer reasons about one concept at a time -- is it
 * reachable, has it been met, how demanding a rung, what kind of thinking. None
 * of them knows that `values` comes before `async`, because none of them needs
 * to. This one does nothing else.
 *
 * WHY IT EXISTS, measured rather than assumed. Two of the 232 dealable questions
 * carry a challenge. The other 230 pass through the transitional hatch untouched
 * by every gate above, so a beginner's run is drawn from the whole language and
 * ordered only by questions.difficulty. There are ZERO tier-4 questions in
 * topics 1-6 and one in topic 7 -- all 23 live in scope, arrays, array-methods,
 * objects and async -- so the pacing curve's closing slots had no choice but to
 * reach into advanced material. The curve is not wrong; the pool was.
 *
 * WHAT IT REUSES. topics.display_order, which the curriculum has always carried
 * and nothing has ever read at runtime. That is the whole data model: no table,
 * no learner-state row, no second curriculum.
 *
 * TWO KINDS OF PROGRESS, AND THEY ARE NOT THE SAME THING:
 *
 *   curriculum state   concepts, rungs and demands met -- derived from
 *                      CHALLENGES played, and untagged content can never
 *                      advance it. That stays exactly as it was.
 *
 *   journey position   how far through JavaScript the learner has worked --
 *                      derived from TOPICS played, tagged or not.
 *
 * The second has to count untagged content, because untagged content is
 * essentially all the content: a journey that only moved on tagged questions
 * would leave every learner stuck in `values` forever. Playing a legacy
 * `variables` question says nothing about which concept was practiced, but it
 * does say the learner has been doing variables.
 */

function assertUserParam(userParam: string, fn: string): void {
    if (!/^\$\d+$/.test(userParam)) {
        throw new Error(`${fn} expects a positional placeholder, got ${userParam}`);
    }
}

/**
 * Where each question sits in the journey, and how far the learner has got.
 *
 * Declares two CTEs:
 *
 * REQUIRES metConceptsCte() TO BE DECLARED FIRST, because the stocked count now
 * applies the eligibility and role gates and both read the `met` CTE. Every
 * caller must place curriculumCtes() ahead of this one in the same WITH.
 *
 *   question_journey (question_id, topic_order)
 *   journey          (ceiling, reached)
 *
 * TOPIC OF A QUESTION. The concept's topic when the question is curriculum
 * tagged, and questions.topic otherwise. Those two genuinely disagree -- the
 * seeded primitive-types exercise is `questions.topic = 'variables'` while its
 * concept lives in `values` -- and the curriculum is the authority when it has
 * an opinion. `conditionals` is mapped to `control-flow` at read time because 24
 * questions still carry the pre-migration-022 name; renaming them is a separate
 * job and this is not it.
 *
 * THE CEILING, which is the whole rule:
 *
 *   reached  the deepest topic the learner has played anything from
 *   ceiling  the next topic ABOVE that which actually has content,
 *            or the deepest topic with content once there is nothing above
 *
 * Topics with no content are stepped over rather than waited on. `strings`,
 * `errors`, `dom`, `this-and-classes` and `algorithms` have no questions at all,
 * and a ceiling that parked on one would be a wall the learner could never climb
 * -- they cannot play what does not exist. Same principle as the unteachable
 * prerequisite in eligibility.ts: a thing Jolt cannot teach cannot hold anyone
 * back.
 *
 * THE FLOOR. A fresh learner has reached nothing, so the ceiling would be the
 * first topic with content -- `values`, which holds exactly one question. Ten
 * are needed. So the ceiling is also pushed up to the first topic at which the
 * cumulative bank can fill a session. Today that lands on `variables`, giving a
 * beginner 25 questions drawn from values and variables instead of 232 drawn
 * from everything.
 *
 * The floor is computed over the whole eligible bank rather than over the
 * learner's own filtered pool, which keeps it a constant rather than a
 * definition that refers to itself.
 *
 * IT ONLY EVER RISES, and it rises by one topic at a time: the pool can never
 * contain a topic above the ceiling, so the deepest topic played can never
 * exceed it, so a run advances the journey by at most one step. That is the
 * sequential walk -- values, then variables, then operators -- rather than a
 * sampling of the bank.
 *
 * @param userParam    positional placeholder holding the user id
 * @param minimumPool  questions a session needs; the floor guarantees this many
 */
import { curriculumEligible } from "./eligibility.js";
import { roleEligible } from "./roles.js";

export function journeyCte(userParam: string, minimumPool: number): string {
    assertUserParam(userParam, "journeyCte");

    if (!Number.isInteger(minimumPool) || minimumPool < 1) {
        throw new Error(`journeyCte expects a positive session size, got ${minimumPool}`);
    }

    return `question_journey AS (
        SELECT
            q.id AS question_id,
            COALESCE(tagged.display_order, legacy.display_order) AS topic_order
        FROM questions q
        LEFT JOIN challenges ch  ON ch.id = q.challenge_id
        LEFT JOIN concepts c     ON c.id  = ch.concept_id
        LEFT JOIN topics tagged  ON tagged.id = c.topic_id
        LEFT JOIN topics legacy
               ON legacy.slug = CASE WHEN q.topic = 'conditionals'
                                     THEN 'control-flow'
                                     ELSE q.topic
                                END
    ),
    journey_dealable AS (
        -- Every question the DEALER could actually use, evaluated ONCE.
        --
        -- The floor has to count what can be dealt, not what the bank holds:
        -- withinJourney is a hard gate, and the only thing that makes a hard
        -- gate safe is the promise that the ceiling never settles on a topic
        -- which cannot fill a session. Tagged practise content is withheld
        -- until its concept has been met, so a topic can look fully stocked and
        -- deal nothing -- invisible while the bank was untagged and everything
        -- passed, and immediate once real content is attached.
        --
        -- MATERIALISED AS ITS OWN CTE, not inlined into the per-topic count
        -- below. Inlined, the two predicates -- each carrying its own nested
        -- EXISTS over challenges and prerequisites -- are re-evaluated for
        -- every (topic, question) pair. At 16 topics and a few hundred
        -- questions that took a single query from milliseconds to minutes.
        -- Here they run once per question and the counting is a cheap join.
        SELECT qj.question_id, qj.topic_order
        FROM question_journey qj
        JOIN questions q ON q.id = qj.question_id
        WHERE q.is_active
          AND (SELECT COUNT(*) FROM question_options o
               WHERE o.question_id = q.id AND o.is_active) >= 2
          AND (SELECT COUNT(*) FROM question_options o
               WHERE o.question_id = q.id AND o.is_active AND o.is_correct) = 1
          AND ${curriculumEligible("q")}
          AND ${roleEligible("q")}
    ),
    journey_stocked AS (
        -- Topics a learner could actually play something from, and how much the
        -- bank holds up to and including each one.
        SELECT
            t.display_order,
            (
                SELECT COUNT(*)
                FROM journey_dealable d
                WHERE d.topic_order <= t.display_order
            ) AS cumulative,
            EXISTS (
                SELECT 1 FROM question_journey qj
                JOIN questions q ON q.id = qj.question_id
                WHERE qj.topic_order = t.display_order AND q.is_active
            ) AS stocked
        FROM topics t
    ),
    journey_reached AS (
        SELECT COALESCE(MAX(qj.topic_order), 0) AS reached
        FROM session_questions sq
        JOIN game_sessions gs   ON gs.id = sq.game_session_id
        JOIN question_journey qj ON qj.question_id = sq.question_id
        WHERE gs.user_id = ${userParam}
          AND sq.status IN ('answered', 'timed_out')
    ),
    journey AS (
        SELECT
            r.reached,
            GREATEST(
                -- the next stocked topic above what they have reached
                COALESCE(
                    (SELECT MIN(s.display_order) FROM journey_stocked s
                     WHERE s.stocked AND s.display_order > r.reached),
                    (SELECT MAX(s.display_order) FROM journey_stocked s WHERE s.stocked)
                ),
                -- never below the point where a session can be filled
                COALESCE(
                    (SELECT MIN(s.display_order) FROM journey_stocked s
                     WHERE s.cumulative >= ${minimumPool}),
                    (SELECT MAX(s.display_order) FROM journey_stocked s WHERE s.stocked)
                )
            ) AS ceiling
        FROM journey_reached r
    )`;
}

/**
 * Whether a question belongs to a topic the learner has reached.
 *
 * A HARD GATE, not a preference, and deliberately unlike the recency ordering it
 * sits beside. Ordering would still let the closing slots of a run reach into
 * async whenever the early topics were thin at that pacing tier, which is
 * exactly the experience this exists to end. The floor in journeyCte is what
 * makes a hard gate safe: the pool is guaranteed to fill a session.
 *
 * A question whose topic matches nothing in the curriculum passes rather than
 * disappearing. There are none today -- the conditionals mapping covers the only
 * mismatch -- and content should not become undealable because someone typed a
 * topic the curriculum has not heard of.
 *
 * @param alias the SQL alias of the questions table.
 */
export function withinJourney(alias: string): string {
    if (!/^[a-z][a-z0-9_]*$/.test(alias)) {
        throw new Error(`withinJourney expects a table alias, got ${alias}`);
    }

    return `(
        COALESCE(
            (SELECT qj.topic_order FROM question_journey qj WHERE qj.question_id = ${alias}.id),
            0
        ) <= (SELECT ceiling FROM journey)
    )`;
}


/**
 * Whether a Bug Hunt incident belongs to a topic the learner has reached.
 *
 * SEPARATE FROM withinJourney BECAUSE THE DEFAULT HAS TO BE THE OPPOSITE.
 *
 * A question carries a legacy `topic` column, so an untagged question still
 * maps to a real place in the curriculum and passing it through is honest. An
 * incident carries nothing: `bug_hunt_incidents` has no topic, and the bank was
 * written for people who already know JavaScript. Measured, the eight easiest
 * incidents included functions, arrays, string methods, null and comparison --
 * seven of the eight needed something a Variables learner has never met, and
 * every one of them was difficulty 1.
 *
 * So treating an untagged incident as "topic 0, always allowed" -- which is
 * what withinJourney does for questions -- is exactly how a beginner ends up
 * debugging `cart.length` on a null. Here an untagged incident is treated as
 * belonging to the first NON-BEGINNER topic: it stays out of reach while the
 * learner is in the beginner tier, and becomes available the moment they leave
 * it, with no list of slugs to maintain.
 *
 * Tagged incidents are placed properly, by their concept's topic, and are
 * therefore available exactly when that topic is.
 *
 * @param alias the SQL alias of the bug_hunt_incidents table.
 */
export function incidentWithinJourney(alias: string): string {
    if (!/^[a-z][a-z0-9_]*$/.test(alias)) {
        throw new Error(`incidentWithinJourney expects a table alias, got ${alias}`);
    }

    return `(
        COALESCE(
            (SELECT t.display_order
             FROM challenges ch
             JOIN concepts c ON c.id = ch.concept_id
             JOIN topics   t ON t.id = c.topic_id
             WHERE ch.id = ${alias}.challenge_id),
            (SELECT MIN(display_order) FROM topics WHERE tier <> 'beginner')
        ) <= (SELECT ceiling FROM journey)
    )`;
}
