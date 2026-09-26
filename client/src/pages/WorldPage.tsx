import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api } from "../api/client.js";
import { Planet } from "../world/Planet.js";
import { Ship } from "../world/Ship.js";
import { Icon } from "../world/Icon.js";
import { ConceptObject } from "../world/ConceptObject.js";
import { orbitFor, topicWarmth } from "../world/orbits.js";
import { practiceFor } from "../games/practice.js";
import type { JourneyPathResponse, JourneyTopic } from "../api/types.js";

/**
 * One world, close up.
 *
 * The Journey map answers "where am I in JavaScript?". This answers "I am
 * here." Both read the same curriculum from the same endpoint; neither is the
 * source of truth and neither replaces the other.
 *
 * NO NEW ANYTHING. No table, no endpoint, no progression, no stored position.
 * Every object on this screen is a concept from /api/curriculum/path, placed by
 * a function of its index and its state, linking to a route that already
 * exists. The learner's position is wherever the curriculum says they are.
 *
 * NOT A CANVAS. Every object is a real link with a real accessible name, in
 * curriculum order in the DOM, that happens to be positioned. A spatial
 * interface is the easiest thing in this codebase to make unusable with a
 * keyboard, and the cheapest moment to prevent that is now.
 *
 * NO MOVEMENT. There is no walking. Crossing empty space to reach an object is
 * time between the learner and the learning, and it buys nothing.
 */
export function WorldPage() {
    const { topic: slug } = useParams<{ topic: string }>();
    const [path, setPath] = useState<JourneyPathResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        void (async () => {
            try {
                const data = await api.get<JourneyPathResponse>("/api/curriculum/path");

                if (active) setPath(data);
            } catch (err) {
                if (active) {
                    setError(err instanceof ApiError ? err.message : "Could not reach that world.");
                }
            }
        })();

        return () => {
            active = false;
        };
    }, [slug]);

    if (error) {
        return (
            <section className="panel narrow">
                <p className="form-error" role="alert">
                    {error}
                </p>
                <Link className="button primary" to="/journey">
                    Back to the map
                </Link>
            </section>
        );
    }

    if (!path) return <p className="muted center">Arriving…</p>;

    const topic: JourneyTopic | undefined = path.topics.find((t) => t.slug === slug);

    if (!topic) {
        return (
            <section className="panel narrow">
                <p className="muted">There is no world there yet.</p>
                <Link className="button primary" to="/journey">
                    Back to the map
                </Link>
            </section>
        );
    }

    const warmth = topicWarmth(topic.concepts.map((c) => c.state));
    const everyConceptDone = topic.concepts.every((c) => c.state === "demonstrated");
    const challengeReady = topic.challenge?.state === "current" && everyConceptDone;

    return (
        <section className="world" style={{ "--warmth": warmth } as React.CSSProperties}>
            <header className="world-head">
                <p className="world-eyebrow">You are here</p>
                <h1 className="world-name">{topic.name}</h1>
                {/* The topic's own sentence about itself, which the curriculum
                    already carries. No progress count: "3 of 7" is a progress
                    bar wearing a costume, and the objects say it better. */}
                {topic.principle && <p className="world-principle">{topic.principle}</p>}
            </header>

            <div className="world-field">
                <div className="world-body">
                    <Planet slug={topic.slug} state="here" size={168} />
                    <Ship size={38} rotate={24} state="learning" label="Your craft, here" />
                </div>

                {/* In curriculum order in the DOM, wherever they sit on screen.
                    Tab through them and you walk the topic in the order it is
                    taught. */}
                <ol className="world-orbit">
                    {topic.concepts.map((concept, i) => {
                        const at = orbitFor(i, concept.state);
                        const reachable = concept.state === "current";

                        /*
                         * WHERE THE CURRICULUM SENDS THEM.
                         *
                         * A concept they have not met goes to its lesson. One
                         * they have met, and which has practice authored, goes
                         * to the practice -- because being shown a variable and
                         * being able to write one are different things, and the
                         * second is what was missing.
                         *
                         * Deterministic and readable: what has the learner
                         * reached, what have they demonstrated, what is
                         * authored. No scoring, no recommendation engine.
                         */
                        const practice = practiceFor(concept.slug);
                        const goesTo =
                            concept.state === "demonstrated" && practice
                                ? `/practise/${concept.slug}`
                                : `/learn/${concept.slug}`;

                        // A finished concept with practice still to do is worth
                        // returning to; one with nothing left is not.
                        const revisitable = concept.state === "demonstrated" && practice !== null;

                        const label =
                            concept.state === "demonstrated"
                                ? practice
                                    ? `${concept.name} — practise writing it`
                                    : `${concept.name} — you can ${concept.objective}`
                                : reachable
                                  ? `${concept.name} — go here next`
                                  : `${concept.name} — not reached yet`;

                        const body = (
                            <>
                                <ConceptObject state={concept.state} seed={i} size={58 * at.scale} />
                                <span className="world-object-name">{concept.name}</span>
                            </>
                        );

                        return (
                            <li
                                key={concept.slug}
                                className={`world-object is-${concept.state}${
                                    revisitable ? " is-revisitable" : ""
                                }`}
                                style={{
                                    left: `${at.x}%`,
                                    top: `${at.y}%`,
                                    zIndex: Math.round(at.depth * 10) + 1,
                                    animationDelay: `${i * 80}ms`
                                }}
                            >
                                {reachable || revisitable ? (
                                    <Link to={goesTo} aria-label={label}>
                                        {body}
                                    </Link>
                                ) : (
                                    // Not a disabled button. Nothing refuses the
                                    // learner here; the thing is simply far away.
                                    <span aria-label={label} role="img">
                                        {body}
                                    </span>
                                )}
                            </li>
                        );
                    })}
                </ol>
            </div>

            {/* The checkpoint only exists once there is nothing left out there. */}
            {challengeReady && (
                <div className="world-checkpoint">
                    <p className="world-checkpoint-line">
                        Every outpost on {topic.name} is lit.
                    </p>
                    <Link className="button primary big" to={`/challenge/${topic.slug}`}>
                        Take the launch check
                    </Link>
                </div>
            )}

            <p className="world-exit">
                <Link to="/journey">
                    <Icon name="map" size={17} /> Back to the map
                </Link>
            </p>
        </section>
    );
}
