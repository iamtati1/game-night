import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError, api } from "../api/client.js";
import { Planet } from "../world/Planet.js";
import { Ship, type ShipState } from "../world/Ship.js";
import { Icon } from "../world/Icon.js";
import { WorldLandmark } from "../world/Objects.js";
import { worldFor } from "../world/atlas.js";
import { LEG, NARROW_LEG, routeSegment, stationAt } from "../world/atlas.js";
import type { JourneyPathResponse, JourneyTopic } from "../api/types.js";
import { isNewlyOpen, nextAction, sectionProgress, unlockRequirement } from "../games/progression.js";
import { ACTION, STATE } from "../vocabulary.js";
import { LearningProgress } from "../components/LearningProgress.js";

import { usePageTitle } from "../usePageTitle.js";
/**
 * THE MAP.
 *
 * This page used to be an ordered list: sixteen topic names down the left
 * margin with ✓ → ○ beside them, and the current topic's concepts indented
 * under it. Everything true about the learner's progress was in there, and none
 * of it felt like anything. A checklist of a syllabus is a document about a
 * journey, not a journey.
 *
 * It is now a route through a star system. Each topic is a world sitting on a
 * drawn path; the road behind you is lit and carries a pulse of light travelling
 * in the direction you came from, the road ahead is dashed and dim; your craft
 * is parked in orbit at the world you are on. Progress is distance, which means
 * there is no percentage and no progress bar anywhere on this page -- you read
 * how far you have come by looking at how much of the road is lit.
 *
 * THE DATA DID NOT CHANGE. Same `/api/curriculum/path`, same topic states, same
 * concept states, same single next action. The curriculum decides everything
 * about what is open and what is next; this file only decides what that looks
 * like. That separation is deliberate -- the progression system is the valuable
 * part and the visual layer is not allowed to have opinions about it.
 *
 * Geometry comes from world/atlas.ts, shared with the route drawing, so a world
 * and the road it sits on cannot disagree about where it is.
 */
/** What each craft state means, for the accessible name. */
const SHIP_LABEL: Record<ShipState, string> = {
    parked: "docked here",
    learning: "exploring here",
    challenge: "ready for the checkpoint",
    departing: "clear to move on"
};

export function JourneyPage() {
    usePageTitle("Your journey");
    const [path, setPath] = useState<JourneyPathResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    // List or map. In the URL rather than in state, so the choice survives a
    // reload and /journey?view=map opens the map directly.
    //
    // THE LIST IS THE DEFAULT. It names every step with its state in words --
    // complete, your current step, locked and why -- and fits a phone in a
    // few screens. The map is the same route drawn as worlds: worth having,
    // but on a phone it was 5,800px tall and a beginner had to read planets to
    // learn what was done. ?view=progress still opens the list, so older
    // links keep working.
    const [params, setParams] = useSearchParams();
    const view = params.get("view") === "map" ? "map" : "progress";
    const showView = (v: "map" | "progress") =>
        setParams(v === "progress" ? {} : { view: v }, { replace: true });

    // The travelled road's length in user units, measured from the DOM. The
    // dash animation needs a real number and only the browser knows it; the
    // ref-and-measure is the one thing on this page CSS genuinely cannot do.
    const doneRef = useRef<SVGPathElement | null>(null);
    const [roadLength, setRoadLength] = useState(0);

    // The leg follows the screen: see NARROW_LEG. The same 52rem breakpoint the
    // stylesheet uses to put each caption under its world.
    const narrow = useNarrow();
    const leg = narrow ? NARROW_LEG : LEG;

    // The open world's steps scroll inside their callout, which is held to one
    // leg so it cannot reach the next world. The current step is scrolled into
    // view so the one thing to do is never below the fold of the list.
    const stopsRef = useRef<HTMLOListElement | null>(null);

    useEffect(() => {
        let active = true;

        void (async () => {
            try {
                const data = await api.get<JourneyPathResponse>("/api/curriculum/path");

                if (active) setPath(data);
            } catch (err) {
                if (active) {
                    setError(
                        err instanceof ApiError ? err.message : "Could not load your journey."
                    );
                }
            }
        })();

        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        const el = doneRef.current;

        // getTotalLength is unimplemented in jsdom, so this is guarded rather
        // than assumed -- without the guard every test that renders the map
        // throws instead of asserting on it.
        if (el && typeof el.getTotalLength === "function") {
            setRoadLength(el.getTotalLength());
        }
        // Re-measured when the map comes back into view, or the leg changes:
        // the road is only in the DOM while it is shown.

        const list = stopsRef.current;
        const current = list?.querySelector<HTMLElement>(".is-current");
        if (list && current) {
            list.scrollTop = Math.max(0, current.offsetTop - list.clientHeight / 2);
        }
    }, [path, view, leg]);

    if (error) {
        return (
            <section className="panel narrow">
                <p className="form-error" role="alert">
                    {error}
                </p>
            </section>
        );
    }

    if (!path) {
        return <p className="muted center">Plotting your course…</p>;
    }

    const topics = path.topics;

    // Where the craft sits. The current topic if there is one; otherwise the
    // last world reached, so a learner who has finished everything still sees
    // their ship somewhere rather than nowhere.
    const hereIndex = (() => {
        const current = topics.findIndex((t) => t.state === "current");

        if (current !== -1) return current;

        const lastDone = topics.map((t) => t.state).lastIndexOf("complete");

        return lastDone === -1 ? 0 : lastDone;
    })();

    const height = stationAt(Math.max(0, topics.length - 1), leg).y + leg * 0.55;

    /**
     * What the craft is doing, read off the curriculum rather than stored.
     *
     * The challenge state IS the progression state: locked means still
     * learning, current means the demonstration is unlocked and waiting,
     * demonstrated means the topic is closed and the road onward is open. A
     * topic with no authored challenge has nothing to be ready for, so the
     * craft simply sits there.
     */
    const hereTopic = topics[hereIndex];
    const shipState: ShipState = (() => {
        if (!hereTopic) return "parked";
        if (hereTopic.state === "complete") return "departing";
        if (hereTopic.challenge?.state === "current") return "challenge";
        if (hereTopic.challenge?.state === "demonstrated") return "departing";

        return "learning";
    })();

    // The single next step, whether concept or checkpoint. Computed from the
    // same path the map renders, so the button and the lit world can never
    // point at different things.
    const step = nextAction(path);
    const next = step
        ? { name: step.name, href: step.href, label: step.kind === "checkpoint" ? ACTION.takeCheckpoint : ACTION.continueLearning }
        : null;

    // Steps or Map. On the steps view it sits under the next step, so the
    // next action is the first thing below the heading; on the map, where the
    // header carries the button, it stays in the header.
    const views = (
        <div className="journey-views" role="group" aria-label="How to show your journey">
            <button
                type="button"
                className="journey-view"
                aria-pressed={view === "progress"}
                onClick={() => showView("progress")}
            >
                Steps
            </button>
            <button
                type="button"
                className="journey-view"
                aria-pressed={view === "map"}
                onClick={() => showView("map")}
            >
                Map
            </button>
        </div>
    );

    return (
        <section className="journey">
            <header className="journey-head">
                <p className="journey-eyebrow">Your journey</p>
                <h1 className="journey-title">Learning JavaScript, step by step</h1>

                {/* What the learner can DO, not how many questions they
                    answered. Two facts, and both are things you would say out
                    loud about yourself. Not shown before the first concept is
                    done, where it would be a row of zeros -- as on Home. */}
                {path.points.concepts > 0 && (
                    <p className="journey-legend">
                        <span className="journey-chip">
                            <Icon name="spark" size={16} />
                            <b>{path.points.total}</b> points
                        </span>
                        <span className="journey-chip">
                            <Icon name="check" size={16} />
                            <b>{path.points.concepts}</b>{" "}
                            {path.points.concepts === 1 ? "thing you can do" : "things you can do"}
                        </span>
                    </p>
                )}

                {/* The path view carries its own next step, with what it
                    moves forward; one primary action per screen. */}
                {view === "map" &&
                    (next ? (
                        <Link className="button primary big" to={next.href}>
                            {next.label}: {next.name}
                        </Link>
                    ) : (
                        <p className="muted">Every world on the route is behind you.</p>
                    ))}

                {view === "map" && views}
            </header>

            {view === "progress" && (
                <>
                    <LearningProgress path={path} next={next} afterNext={views} />
                    {!next && <p className="muted center">Every world on the route is behind you.</p>}
                </>
            )}

            {view === "map" && (
            <div className="journey-map" style={{ height }}>
                <svg
                    className="journey-route"
                    viewBox={`0 0 100 ${height}`}
                    preserveAspectRatio="none"
                    aria-hidden="true"
                >
                    <defs>
                        {/* The travelled road warms as it approaches you: violet
                            at the start of the trip, teal where you are now. */}
                        <linearGradient id="journey-road-gradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.45" />
                            <stop offset="100%" stopColor="#3ddbd9" stopOpacity="0.95" />
                        </linearGradient>
                    </defs>

                    {/* Road ahead, drawn first so the lit road overlaps it
                        cleanly at the joint. non-scaling-stroke keeps the line
                        an even weight despite the viewBox being stretched
                        horizontally to fill the container. */}
                    <path
                        className="journey-road-todo"
                        d={routeSegment(hereIndex, topics.length - 1, leg)}
                        vectorEffect="non-scaling-stroke"
                    />

                    <path
                        ref={doneRef}
                        className="journey-road-done"
                        d={routeSegment(0, hereIndex, leg)}
                        vectorEffect="non-scaling-stroke"
                    />

                    {/* The pulse: a short lit dash running the travelled road.
                        Its dash pattern is the measured length, so it sweeps the
                        road exactly once per cycle however long the road is. */}
                    {roadLength > 0 && (
                        <path
                            className="journey-road-pulse"
                            d={routeSegment(0, hereIndex, leg)}
                            vectorEffect="non-scaling-stroke"
                            style={
                                {
                                    strokeDasharray: `${roadLength * 0.12} ${roadLength}`,
                                    "--road-length": `${roadLength * 1.12}`
                                } as React.CSSProperties
                            }
                        />
                    )}
                </svg>

                {topics.map((topic, i) => {
                    const at = stationAt(i, leg);
                    const state =
                        topic.state === "complete"
                            ? "visited"
                            : i === hereIndex
                              ? "here"
                              : "ahead";
                    const here = state === "here";

                    return (
                        <div
                            key={topic.slug}
                            className={`journey-station is-${state}`}
                            style={{
                                left: `${at.x}%`,
                                top: at.y,
                                animationDelay: `${Math.min(i * 70, 700)}ms`
                            }}
                        >
                            {/* The craft, parked. Not thrusting: it is in orbit,
                                not in transit, and a burning engine at a world
                                you are standing on reads as about to leave. */}
                            {here && (
                                <Ship
                                    size={40}
                                    rotate={24}
                                    state={shipState}
                                    label={`Your craft: ${SHIP_LABEL[shipState]}`}
                                />
                            )}

                            <Planet
                                slug={topic.slug}
                                state={state}
                                size={here ? 104 : 74}
                                label={`${topic.name}: ${
                                    state === "visited"
                                        ? "behind you"
                                        : here
                                          ? STATE.here.toLowerCase()
                                          : "ahead"
                                }`}
                            />

                            {/* Built structures appear only at worlds you have
                                reached. A station in orbit at a place you have
                                never been would say the opposite of
                                "unexplored". */}
                            {state !== "ahead" && (
                                <WorldLandmark kind={worldFor(topic.slug).landmark} size={26} />
                            )}

                            {/* Only the world you are at can be entered: the
                                close view of somewhere you have not reached
                                would be an empty room. */}
                            {here && (
                                <Link className="journey-enter" to={`/world/${topic.slug}`}>
                                    Open topic
                                </Link>
                            )}

                            <div className="journey-caption">
                                <p className="journey-name">
                                    {topic.name}
                                    {/* Stated in words and kept on the page.
                                        A colour change or a one-shot animation
                                        is gone by the time a first-time player
                                        looks up, and says nothing to anyone
                                        reading with a screen reader. It clears
                                        itself once they finish a concept here. */}
                                    {isNewlyOpen(topic) && (
                                        <span className="journey-new">Newly open</span>
                                    )}
                                </p>

                                {state === "visited" && (
                                    <span className="journey-meta">
                                        <Icon name="check" size={13} /> charted
                                    </span>
                                )}

                                {/* OPEN IS A STATE TOO, and until now the only
                                    one the map never named. A locked world said
                                    why it was locked and a charted one said it
                                    was charted; the world you can actually walk
                                    into said nothing at all once the "newly
                                    open" marker had cleared, which left the
                                    learner to infer from an absence. Counted
                                    from the same path everything else here is
                                    drawn from. */}
                                {/* THE SECTION'S PROGRESS, always, for the
                                    world you are in -- including the moment it
                                    opens, which is exactly when a beginner
                                    needs to see what the section asks of them.
                                    Demonstrated concepts and the checkpoint,
                                    from the same path the unlock text reads. */}
                                {here && <SectionProgressRead topic={topic} />}

                                {/* WHAT, NOT JUST WHETHER. A padlock says "not
                                    yet" and leaves the learner to work out the
                                    rest by playing and watching. The requirement
                                    is derived from the same path the map is
                                    drawn from -- see games/progression.ts -- so
                                    it cannot disagree with the gate it
                                    describes. */}
                                {state === "ahead" && (
                                    <span className="journey-meta">
                                        <Icon name="lock" size={13} />{" "}
                                        {unlockRequirement(topics, topic.slug) ?? "unexplored"}
                                    </span>
                                )}
                            </div>

                            {/* Only the world you are at opens. Sixteen expanded
                                stations would be the wall of rows this redesign
                                exists to get rid of. */}
                            {here && (
                                <ol
                                    ref={stopsRef}
                                    className={`journey-stops ${at.x > 50 ? "opens-left" : "opens-right"}`}
                                    style={{ maxHeight: `calc(${leg}px - 1.5rem)` }}
                                >
                                    {topic.concepts.map((concept) => (
                                        <li
                                            key={concept.slug}
                                            className={`journey-stop is-${concept.state}`}
                                        >
                                            <Icon
                                                name={
                                                    concept.state === "demonstrated"
                                                        ? "check"
                                                        : concept.state === "current"
                                                          ? "arrow"
                                                          : "lock"
                                                }
                                                size={14}
                                            />
                                            {concept.state === "current" ? (
                                                <Link to={`/concept/${concept.slug}`}>
                                                    {concept.name}
                                                    <span className="visually-hidden">
                                                        {" "}(your current step)
                                                    </span>
                                                </Link>
                                            ) : (
                                                <span>
                                                    {concept.name}
                                                    <span className="visually-hidden">
                                                        {concept.state === "demonstrated"
                                                            ? " (complete)"
                                                            : " (locked: finish the steps above first)"}
                                                    </span>
                                                </span>
                                            )}

                                            {/* WHAT THE GAME ALREADY DID.
                                                A rung cleared in Code Blitz is
                                                real progress the map used to
                                                say nothing about, because
                                                `state` is concept-level and a
                                                part-done concept still reads as
                                                `current`. Shown only while
                                                there is something to show --
                                                not on a finished concept, where
                                                the tick says more, and not at
                                                zero, where it would be noise on
                                                every locked stop. */}
                                            {concept.state !== "demonstrated" &&
                                                concept.rungs.cleared > 0 && (
                                                    <span
                                                        className="journey-stop-rungs"
                                                        title="Stops cleared on this concept"
                                                    >
                                                        {concept.rungs.cleared}/
                                                        {concept.rungs.playable}
                                                    </span>
                                                )}
                                        </li>
                                    ))}

                                    {/* The checkpoint that closes the world.
                                        Its own step, because walking every
                                        lesson does not on its own complete a
                                        topic. */}
                                    {topic.challenge && (
                                        <li
                                            className={`journey-stop journey-challenge is-${topic.challenge.state}`}
                                        >
                                            <Icon
                                                name={
                                                    topic.challenge.state === "demonstrated"
                                                        ? "check"
                                                        : topic.challenge.state === "current"
                                                          ? "spark"
                                                          : "lock"
                                                }
                                                size={14}
                                            />
                                            {topic.challenge.state === "current" ? (
                                                <Link to={`/challenge/${topic.slug}`}>
                                                    {topic.name} checkpoint
                                                    <span className="visually-hidden">
                                                        {" "}(your current step)
                                                    </span>
                                                </Link>
                                            ) : (
                                                <span>
                                                    {topic.name} checkpoint
                                                    <span className="visually-hidden">
                                                        {topic.challenge.state === "demonstrated"
                                                            ? " (complete)"
                                                            : " (locked: finish the concepts above first)"}
                                                    </span>
                                                </span>
                                            )}
                                        </li>
                                    )}
                                </ol>
                            )}
                        </div>
                    );
                })}
            </div>
            )}
        </section>
    );
}

/** One section's progress: a bar and the sentence that says the same thing. */
function SectionProgressRead({ topic }: { topic: JourneyTopic }) {
    const progress = sectionProgress(topic);
    const percent = progress.steps === 0 ? 0 : Math.round((progress.stepsDone / progress.steps) * 100);

    return (
        <span className="journey-progress">
            <span
                className="journey-progress-bar"
                role="progressbar"
                aria-label={`${topic.name} progress`}
                aria-valuemin={0}
                aria-valuemax={progress.steps}
                aria-valuenow={progress.stepsDone}
                aria-valuetext={progress.label}
            >
                <span className="journey-progress-fill" style={{ width: `${percent}%` }} />
            </span>
            <span className="journey-meta">{progress.label}</span>
        </span>
    );
}

/**
 * Whether the screen is at or below the stylesheet's 52rem breakpoint.
 *
 * jsdom has no matchMedia, so tests render the wide geometry -- the one the
 * map's route assertions are written against.
 */
function useNarrow(): boolean {
    const query = "(max-width: 52rem)";
    const [narrow, setNarrow] = useState(
        () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches
    );

    useEffect(() => {
        if (typeof window.matchMedia !== "function") return;
        const media = window.matchMedia(query);
        const update = () => setNarrow(media.matches);
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
    }, []);

    return narrow;
}
