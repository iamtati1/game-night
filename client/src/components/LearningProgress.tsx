import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { JourneyPathResponse, JourneyTopic } from "../api/types.js";
import { conceptProgress, remainingIn, sectionProgress, standingFor, unlockRequirement } from "../games/progression.js";
import { Icon } from "../world/Icon.js";
import { ConceptSteps } from "./ConceptSteps.js";
import { STATE } from "../vocabulary.js";

/**
 * The course as a path you can read top to bottom: an alternative to the map.
 *
 * The map is a place to arrive in; this is a list to scan. Every fact on it is
 * read from the same journey path the map draws, through the same helpers --
 * sectionProgress for the counts, standingFor and unlockRequirement for what is
 * shut and why, ConceptSteps for the current topic's milestones -- so the two
 * views cannot disagree about where the learner is. Nothing here decides
 * progress; it only says it.
 *
 * WHAT "AVAILABLE" MEANS HERE. The curriculum has one current concept at a
 * time, so within a topic a concept is complete, current or locked -- never
 * "available to start" alongside another. The topic after the current one is
 * the only thing that is next in line, and it is labelled for exactly that,
 * with what opens it. Inventing a fourth concept state would promise a door
 * the unlock rule keeps shut.
 */

export interface NextStep {
    name: string;
    href: string;
    label: string;
}

const STATE_WORD: Record<ReturnType<typeof standingFor>, string> = {
    complete: STATE.complete,
    current: STATE.inProgress,
    available: STATE.upNext,
    locked: STATE.locked
};

const STATE_ICON: Record<ReturnType<typeof standingFor>, "check" | "arrow" | "lock"> = {
    complete: "check",
    current: "arrow",
    available: "lock",
    locked: "lock"
};

export function LearningProgress({
    path,
    next,
    afterNext
}: {
    path: JourneyPathResponse;
    next: NextStep | null;
    /** Rendered between the next step and the topic list -- the Journey puts
     *  its Steps/Map switch here, so the next step is the first thing under
     *  the heading rather than below a control. */
    afterNext?: ReactNode;
}) {
    const { topics } = path;

    if (topics.length === 0) {
        return <p className="muted center">There is nothing on the course yet.</p>;
    }

    const currentIndex = topics.findIndex((t) => t.state === "current");
    const current = currentIndex === -1 ? null : topics[currentIndex]!;

    return (
        <section className="progress-path" aria-label="Learning progress">
            {next && current && <NextStepPanel next={next} topic={current} after={topics[currentIndex + 1]} path={path} />}

            {afterNext}

            <ol className="progress-topics">
                {topics.map((topic) => {
                    const standing = standingFor(topics, topic.slug);
                    const progress = sectionProgress(topic);

                    return (
                        <li key={topic.slug} className={`progress-topic is-${standing}`}>
                            <div className="progress-topic-head">
                                <span className="progress-topic-mark" aria-hidden="true">
                                    <Icon name={STATE_ICON[standing]} size={15} />
                                </span>
                                <h2 className="progress-topic-name">{topic.name}</h2>
                                <span className="progress-topic-state">{STATE_WORD[standing]}</span>
                            </div>

                            {(standing === "current" || standing === "complete") && (
                                <p className="progress-topic-count">{progress.label}</p>
                            )}

                            {(standing === "available" || standing === "locked") && (
                                <p className="progress-topic-count">
                                    {unlockRequirement(topics, topic.slug) ?? "Not open yet"}
                                </p>
                            )}

                            {/* Only the topic you are in is expanded, as on the
                                map. Its steps are ConceptSteps -- the same list,
                                states, reasons and single action the world page
                                shows. */}
                            {/* The "Next step" panel above is this screen's one
                                primary action, so the row it names stays quiet. */}
                            {standing === "current" && <ConceptSteps topic={topic} primaryAction={!next} />}
                        </li>
                    );
                })}
            </ol>
        </section>
    );
}

/**
 * The one thing to do now, and what it moves forward.
 *
 * "What it contributes" is counted, not claimed: the concepts left in this
 * topic after the current one, and the checkpoint, are what stand between the
 * learner and the next topic opening.
 */
function NextStepPanel({
    next,
    topic,
    after,
    path
}: {
    next: NextStep;
    topic: JourneyTopic;
    after: JourneyTopic | undefined;
    path: JourneyPathResponse;
}) {
    const left = remainingIn(topic);
    const onCheckpoint = topic.challenge?.state === "current";
    const ladder = path.current ? conceptProgress(path.current) : null;
    const afterThis = onCheckpoint ? 0 : Math.max(0, left.concepts - 1);

    const contribution = onCheckpoint
        ? after
            ? `Passing it opens ${after.name}.`
            : `Passing it completes ${topic.name}.`
        : afterThis > 0
          ? `Then ${afterThis} more ${afterThis === 1 ? "concept" : "concepts"}${
                left.checkpoint ? " and the checkpoint" : ""
            } ${after ? `before ${after.name} opens` : `to finish ${topic.name}`}.`
          : left.checkpoint
            ? `This is the last concept in ${topic.name}. The checkpoint comes next.`
            : `This is the last step in ${topic.name}.`;

    return (
        <div className="progress-next">
            {/* The same words the list uses for this row: it was "Next step"
                here and another name below, two names for one thing. The topic
                says where on the journey it is. */}
            <p className="progress-next-label">
                {STATE.here} · {topic.name}
            </p>
            <p className="progress-next-name">{next.name}</p>
            {ladder && <p className="progress-next-detail">{ladder}</p>}
            <p className="progress-next-detail">{contribution}</p>
            <Link className="button primary" to={next.href}>
                {next.label}
            </Link>
        </div>
    );
}
