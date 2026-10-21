/**
 * First-contact worked examples — the Learn beat of the learning loop.
 *
 * One card per curriculum unit: a snippet, the answer it produces, and a single
 * line naming the rule. Shown once, before the first challenge on that unit, and
 * never scored or timed.
 *
 * Why this lives in the client rather than the database:
 *
 * A Learn beat is not content the player is tested on. It is never dealt, never
 * scored, never recorded against a session, and there is exactly one per unit --
 * nine rows that would change only when the curriculum itself changes. Putting
 * it in PostgreSQL would mean a table, a migration and a seed to deliver a
 * constant. If a beat ever needs to vary per player or per subtopic, that is the
 * point to move it; today it would be schema for its own sake.
 *
 * The hard limit is deliberate: if the rule does not fit on one card in front of
 * one challenge, it is too long for Jolt. A standalone lesson screen is the
 * thing this beat exists to avoid.
 */

export interface LearnBeat {
    /** The unit, matching questions.topic. */
    topic: string;
    /** What the player will see named on screen. */
    title: string;
    /** A few lines at most. This is a demonstration, not an exercise. */
    code: string;
    /** What the snippet prints, shown up front -- there is nothing to work out. */
    output: string;
    /** The rule, in one sentence. */
    rule: string;
    /** Optional: what happened in the example, in plain words. */
    note?: string;
}

/**
 * Beats keyed by TOPIC, reached only through ?focus=<topic>.
 *
 * The original path, kept working and otherwise untouched. It is not part of
 * curriculum progression: nothing in the app links to ?focus=, the beat is not
 * recorded anywhere, and seeing it changes nothing about what the learner is
 * dealt next.
 */
const BEATS: Record<string, LearnBeat> = {
    variables: {
        topic: "variables",
        title: "Naming a value",
        code: 'let score = 10;\nconsole.log(score);',
        output: "10",
        rule: "let gives a value a name, so you can use it again later."
    }
};

/**
 * Beats keyed by CURRICULUM CONCEPT -- the Learn half of Learn -> Play.
 *
 * These ARE progression. The server decides which concept is due (an active
 * `introduce` challenge whose prerequisites are met and which this learner has
 * not completed) and sends its slug; this map supplies the worked example, and
 * completing it is what marks the concept encountered.
 *
 * Only `primitive-types` is filled in. That is the vertical slice: one concept,
 * proving the loop, before eighty-six more are written. A concept the server
 * offers with no beat here simply falls back to the curriculum's own one-line
 * meaning, which is authored for every concept -- so a missing entry degrades
 * rather than dead-ends.
 *
 * WHY THESE ARE STILL NOT IN THE DATABASE. A beat is never dealt, never scored
 * and never timed, and there is exactly one per concept. It is a constant, and
 * the reasons above have not changed -- what changed is only that the server now
 * says WHICH constant to render. The completion event is durable (migration
 * 024); the worked example is not data.
 */
const CONCEPT_BEATS: Record<string, LearnBeat> = {
    assignment: {
        topic: "variables",
        title: "Working it out isn't storing it",
        code: 'let score = 10;\nscore = score + 5;\nconsole.log(score);',
        output: "15",
        rule: "The right side is worked out first, then stored back under the name on the left."
    },
    "primitive-types": {
        topic: "values",
        title: "Every value has a type",
        code: 'console.log(typeof "5");\nconsole.log(typeof 5);',
        output: '"string"\n"number"',
        rule: "5 and \"5\" look alike on screen and are different kinds of thing."
    }
};

/** The worked example for a unit, or null when it has none yet. */
export function learnBeatFor(topic: string | null): LearnBeat | null {
    return topic ? (BEATS[topic] ?? null) : null;
}

/** The worked example for a curriculum concept, or null when none is authored. */
export function learnBeatForConcept(concept: string | null): LearnBeat | null {
    return concept ? (CONCEPT_BEATS[concept] ?? null) : null;
}
