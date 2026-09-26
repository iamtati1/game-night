import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api } from "../api/client.js";
import { Planet } from "../world/Planet.js";
import { Ship, type ShipState } from "../world/Ship.js";
import { Icon } from "../world/Icon.js";
import { WorldLandmark } from "../world/Objects.js";
import { worldFor } from "../world/atlas.js";
import { LEG, routeSegment, stationAt } from "../world/atlas.js";
import type { JourneyPathResponse } from "../api/types.js";

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
    challenge: "ready for the launch check",
    departing: "clear to move on"
};

export function JourneyPage() {
    const [path, setPath] = useState<JourneyPathResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    // The travelled road's length in user units, measured from the DOM. The
    // dash animation needs a real number and only the browser knows it; the
    // ref-and-measure is the one thing on this page CSS genuinely cannot do.
    const doneRef = useRef<SVGPathElement | null>(null);
    const [roadLength, setRoadLength] = useState(0);

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
    }, [path]);

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

    const height = stationAt(Math.max(0, topics.length - 1)).y + LEG * 0.55;

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
    const currentChallenge = topics.find((t) => t.challenge?.state === "current");
    const next = currentChallenge
        ? {
              name: `${currentChallenge.name} checkpoint`,
              href: `/challenge/${currentChallenge.slug}`,
              label: "Take the checkpoint"
          }
        : path.current
          ? { name: path.current.name, href: `/learn/${path.current.slug}`, label: "Continue" }
          : null;

    return (
        <section className="journey">
            <header className="journey-head">
                <p className="journey-eyebrow">Your course</p>
                <h1 className="journey-title">The JavaScript system</h1>

                {/* What the learner can DO, not how many questions they
                    answered. Two facts, and both are things you would say out
                    loud about yourself. */}
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

                {next ? (
                    <Link className="button primary big" to={next.href}>
                        {next.label} — {next.name}
                    </Link>
                ) : (
                    <p className="muted">Every world on the route is behind you.</p>
                )}
            </header>

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
                        d={routeSegment(hereIndex, topics.length - 1)}
                        vectorEffect="non-scaling-stroke"
                    />

                    <path
                        ref={doneRef}
                        className="journey-road-done"
                        d={routeSegment(0, hereIndex)}
                        vectorEffect="non-scaling-stroke"
                    />

                    {/* The pulse: a short lit dash running the travelled road.
                        Its dash pattern is the measured length, so it sweeps the
                        road exactly once per cycle however long the road is. */}
                    {roadLength > 0 && (
                        <path
                            className="journey-road-pulse"
                            d={routeSegment(0, hereIndex)}
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
                    const at = stationAt(i);
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
                                    label={`Your craft — ${SHIP_LABEL[shipState]}`}
                                />
                            )}

                            <Planet
                                slug={topic.slug}
                                state={state}
                                size={here ? 104 : 74}
                                label={`${topic.name} — ${
                                    state === "visited"
                                        ? "behind you"
                                        : here
                                          ? "you are here"
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
                                    Go down
                                </Link>
                            )}

                            <div className="journey-caption">
                                <p className="journey-name">{topic.name}</p>

                                {state === "visited" && (
                                    <span className="journey-meta">
                                        <Icon name="check" size={13} /> charted
                                    </span>
                                )}

                                {state === "ahead" && (
                                    <span className="journey-meta">
                                        <Icon name="lock" size={13} /> unexplored
                                    </span>
                                )}
                            </div>

                            {/* Only the world you are at opens. Sixteen expanded
                                stations would be the wall of rows this redesign
                                exists to get rid of. */}
                            {here && (
                                <ol
                                    className={`journey-stops ${at.x > 50 ? "opens-left" : "opens-right"}`}
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
                                                <Link to={`/learn/${concept.slug}`}>
                                                    {concept.name}
                                                </Link>
                                            ) : (
                                                <span>{concept.name}</span>
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
                                                </Link>
                                            ) : (
                                                <span>{topic.name} checkpoint</span>
                                            )}
                                        </li>
                                    )}
                                </ol>
                            )}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
