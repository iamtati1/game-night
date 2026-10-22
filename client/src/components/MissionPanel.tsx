import { Link } from "react-router-dom";
import type { JourneyPathResponse } from "../api/types.js";
import { nextAction, sectionProgress } from "../games/progression.js";
import { ACTION } from "../vocabulary.js";
import { withCode } from "./CodeText.js";
import { tutorialHref } from "../games/tutorial.js";

/**
 * THE MISSION: one compact panel that says what to do next.
 *
 * In priority order, and nothing else:
 *
 *     1. the mission's name     -- the concept (or checkpoint) the path says is next
 *     2. its goal, in a line    -- the concept's own objective
 *     3. one primary action     -- Start / Continue / Take the checkpoint
 *     4. compact progress       -- stops done on this concept, concepts done in the topic
 *
 * Home and Games both used to say this in their own words: Home in five stacked
 * lines around a planet, Games in a separate band (PlayFocus) that fetched the
 * concept's encounter to count its stops. Both now render this.
 *
 * NO RULE OF ITS OWN. Everything comes from GET /api/curriculum/path: the next
 * step is `nextAction` (the same function every screen uses), the goal is the
 * concept's `objective`, and the stop counts are the server's `rungs`, derived
 * from the same evidence that clears a rung anywhere else. This component never
 * decides what is open, never sends anything, and records nothing.
 *
 * HONEST ABOUT EMPTY CONCEPTS. `rungs.playable` counts only stops something
 * actually fills, so 0 means there is nothing to practise yet; the panel says
 * the concept is taught in its lesson rather than drawing zero pips.
 */
export function MissionPanel({
    path,
    headingLevel = 2,
    className = "",
    quiet = false
}: {
    path: JourneyPathResponse;
    /** Home's mission is its page heading; on Games it sits under the page's own h1. */
    headingLevel?: 1 | 2;
    className?: string;
    /**
     * A secondary button instead of the primary one, for a page whose own
     * primary action is something else (Games, where it is the island's Play).
     * One primary per screen.
     */
    quiet?: boolean;
}) {
    const step = nextAction(path);

    /* Everything reachable is done: nothing to point at, so nothing is drawn.
       The screen around it says what is true instead. */
    if (!step) return null;

    /** Nothing demonstrated and no checkpoint passed: "Start", not "Continue". */
    const fresh = path.points.concepts === 0 && !path.topics.some((t) => t.state === "complete");
    const Heading = headingLevel === 1 ? "h1" : "h2";

    if (step.kind === "checkpoint") {
        const topic = path.topics.find((t) => t.challenge?.state === "current")!;

        return (
            <section className={`mission-panel ${className}`.trim()} aria-labelledby="mission-panel-name">
                <p className="mission-panel-eyebrow">Your mission · {topic.name}</p>
                <Heading className="mission-panel-name" id="mission-panel-name">
                    {step.name}
                </Heading>
                <p className="mission-panel-goal">
                    Show you can use everything in {topic.name} together.
                </p>
                <Link className={`button ${quiet ? "ghost" : "primary"} big mission-panel-action`} to={step.href}>
                    {ACTION.takeCheckpoint}
                </Link>
                <p className="mission-panel-progress">{sectionProgress(topic).label}</p>
            </section>
        );
    }

    const concept = path.current!;
    const topic = path.topics.find((t) => t.slug === concept.topic) ?? null;
    const { cleared, playable } = concept.rungs;
    const done = Math.min(cleared, playable);

    return (
        <section className={`mission-panel ${className}`.trim()} aria-labelledby="mission-panel-name">
            <p className="mission-panel-eyebrow">
                {fresh ? "Your first mission" : "Your mission"}
                {topic && <> · {topic.name}</>}
            </p>

            <Heading className="mission-panel-name" id="mission-panel-name">
                {withCode(concept.name)}
            </Heading>

            {concept.objective && <p className="mission-panel-goal">Goal: {withCode(sentence(concept.objective))}</p>}

            {/* A brand-new learner starts with the playable tutorial; it hands
                back to this same concept when they finish or skip it. */}
            <Link className={`button ${quiet ? "ghost" : "primary"} big mission-panel-action`} to={tutorialHref(path) ?? step.href}>
                {fresh ? ACTION.startLearning : ACTION.continueLearning}
            </Link>

            <div className="mission-panel-progress">
                {playable > 0 ? (
                    <>
                        {/* Pips are decoration for the sentence beside them,
                            which says the same thing in words. */}
                        <span className="mission-panel-pips" aria-hidden="true">
                            {Array.from({ length: playable }, (_, i) => (
                                <span key={i} className={`mission-panel-pip${i < done ? " is-done" : ""}`} />
                            ))}
                        </span>
                        <span>
                            {done === playable
                                ? "Every stop done: show what you know"
                                : `${done} of ${playable} ${playable === 1 ? "stop" : "stops"} done`}
                        </span>
                    </>
                ) : (
                    <span>Taught in the lesson: nothing to practise here yet</span>
                )}
                {topic && (
                    <span className="mission-panel-topic-progress">{sectionProgress(topic).label}</span>
                )}
            </div>
        </section>
    );
}

/** "run a snippet and say what it prints" -> "Run a snippet and say what it prints." */
function sentence(text: string): string {
    const trimmed = text.trim();
    const capped = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}
