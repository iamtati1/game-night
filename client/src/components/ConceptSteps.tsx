import { Link } from "react-router-dom";
import { Icon } from "../world/Icon.js";
import type { JourneyTopic } from "../api/types.js";
import { STATE } from "../vocabulary.js";

/**
 * A module as a sequence: what is done, what is next, what is shut.
 *
 * WHY THIS REPLACED THE ORBIT. The world page placed every concept by a
 * function of its index and its state -- eight objects scattered across a
 * field, scaled and depth-sorted. It is the best-looking screen in Jolt and it
 * answered none of the three questions a learner actually arrives with: where
 * am I, what do I do, why can I not do that. The states were real but they
 * were encoded as treatments, and the only place they were named was an
 * aria-label. Reading it took work, and the work was optional, so nobody did
 * it.
 *
 * ORDER IS THE INTERFACE. Curriculum order, top to bottom, one row per step,
 * state said in words. Nothing is positioned by anything except its place in
 * the sequence.
 *
 * THE CHECKPOINT IS A STEP. A topic with a cumulative challenge is not
 * finished when its concepts are: the checkpoint is required work and the
 * unlock is on the other side of it. Leaving it off the list is what made the
 * last stretch of a topic feel like it had no end.
 *
 * ONE ACTION. Exactly one row carries a button -- the current step. Completed
 * rows are links because returning to them is allowed; locked rows are not
 * interactive at all. A screen with eight buttons has no next step.
 */

export type StepState = "complete" | "current" | "locked";

export interface Step {
    key: string;
    name: string;
    /** Completes "you can ___" on a finished step. */
    objective: string | null;
    state: StepState;
    href: string;
    /** Why a locked step is shut, in the learner's words. */
    reason: string | null;
}

/**
 * The topic's concepts, then its checkpoint, as one ordered list.
 *
 * Derived entirely from the path the server already sends. The only judgement
 * here is presentational: which of the three words each state gets.
 */
export function stepsFor(topic: JourneyTopic): Step[] {
    // In a topic not yet open every step is shut for the same reason -- the
    // topic is -- and naming the step before would point at something just as
    // unreachable.
    const topicOpen = topic.concepts.some((c) => c.state !== "locked");

    const steps: Step[] = topic.concepts.map((concept, i) => {
        // A locked step names the one it waits on -- "Finish the step above
        // first" made a learner go and work out which step that was. The
        // step straight after the current one opens when that one is
        // finished; anything further waits on the step before it, the same
        // one-step-at-a-time phrasing the topic rows use.
        const before = topic.concepts[i - 1];

        return {
            key: concept.slug,
            name: concept.name,
            objective: concept.objective,
            state:
                concept.state === "demonstrated"
                    ? "complete"
                    : concept.state === "current"
                      ? "current"
                      : "locked",
            href: `/concept/${concept.slug}`,
            reason:
                concept.state !== "locked"
                    ? null
                    : !topicOpen || !before
                      ? "Opens when this topic opens"
                      : before.state === "current"
                        ? `Opens when you finish ${before.name}`
                        : `Opens after ${before.name}`
        };
    });

    if (topic.challenge) {
        const outstanding = topic.concepts.filter((c) => c.state !== "demonstrated").length;

        steps.push({
            key: `${topic.slug}-checkpoint`,
            name: `${topic.name} checkpoint`,
            objective: null,
            state:
                topic.challenge.state === "demonstrated"
                    ? "complete"
                    : topic.challenge.state === "current"
                      ? "current"
                      : "locked",
            href: `/challenge/${topic.slug}`,
            reason:
                topic.challenge.state === "locked"
                    ? outstanding === 1
                        ? "1 concept still to finish"
                        : `${outstanding} concepts still to finish`
                    : null
        });
    }

    return steps;
}

export function ConceptSteps({
    topic,
    primaryAction = true
}: {
    topic: JourneyTopic;
    /**
     * Whether the current row carries the screen's primary button.
     *
     * False when the screen around the list already offers this same step as
     * its primary action -- the Progress view's "Next step" panel, or the
     * world's checkpoint block. Two equally loud buttons to one destination
     * read as two different things to do. The row then keeps a quiet link, so
     * the step can still be opened from where it sits in the list.
     */
    primaryAction?: boolean;
}) {
    const steps = stepsFor(topic);

    /*
     * NO "3 OF 8" HERE, deliberately, and not an oversight.
     *
     * WorldPage.test.tsx has forbidden a progress count on this screen since
     * the world was built -- "a progress bar wearing a costume" -- and the
     * reasoning holds: the rows already say it, one per line, with the state
     * written on each. A number above them would be the same fact a second
     * time, competing with the one thing that should draw the eye.
     *
     * The journey map keeps the count, where it is comparing worlds rather
     * than restating one.
     */
    return (
        <section className="steps" aria-label={`${topic.name}: your path`}>
            <ol className="steps-list">
                {steps.map((step) => (
                    <li key={step.key} className={`step is-${step.state}`}>
                        <span className="step-mark" aria-hidden="true">
                            {step.state === "complete" ? (
                                <Icon name="check" size={15} />
                            ) : step.state === "locked" ? (
                                <Icon name="lock" size={15} />
                            ) : (
                                <Icon name="arrow" size={15} />
                            )}
                        </span>

                        <span className="step-body">
                            <span className="step-state">
                                {step.state === "complete"
                                    ? STATE.complete
                                    : step.state === "current"
                                      ? STATE.here
                                      : STATE.locked}
                            </span>

                            <span className="step-name">{step.name}</span>

                            {/* One line under the name, and only when it says
                                something the name does not: what a finished
                                step bought, or why a shut one is shut. */}
                            {step.state === "complete" && step.objective && (
                                <span className="step-note">You can {step.objective}</span>
                            )}
                            {step.state === "locked" && step.reason && (
                                <span className="step-note">{step.reason}</span>
                            )}
                        </span>

                        {/* THE ONLY BUTTON ON THE PAGE -- unless the page
                            already shows this step as its primary action. */}
                        {step.state === "current" &&
                            (primaryAction ? (
                                <Link className="button primary step-go" to={step.href}>
                                    Start
                                </Link>
                            ) : (
                                <Link className="step-again" to={step.href}>
                                    Start
                                </Link>
                            ))}

                        {step.state === "complete" && (
                            <Link className="step-again" to={step.href}>
                                Revisit
                            </Link>
                        )}
                    </li>
                ))}
            </ol>
        </section>
    );
}
