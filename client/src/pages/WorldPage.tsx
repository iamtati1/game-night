import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ConceptSteps } from "../components/ConceptSteps.js";
import { ApiError, api } from "../api/client.js";
import { Planet } from "../world/Planet.js";
import { Ship } from "../world/Ship.js";
import { Icon } from "../world/Icon.js";
import { topicWarmth } from "../world/orbits.js";
import type { JourneyPathResponse, JourneyTopic } from "../api/types.js";
import { nextAction, unlockRequirement } from "../games/progression.js";
import { ACTION, STATE } from "../vocabulary.js";

import { usePageTitle } from "../usePageTitle.js";
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
    usePageTitle("Topic");
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
                    {ACTION.seeJourney}
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
                    {ACTION.seeJourney}
                </Link>
            </section>
        );
    }

    const warmth = topicWarmth(topic.concepts.map((c) => c.state));

    /*
     * A WORLD NOBODY CAN ENTER HAS TO SAY SO.
     *
     * Playtesting found this as a dead end: a new learner opening
     * /world/variables got eight locked objects, no link, and nothing saying
     * why or where to go instead. The curriculum already knows where they
     * actually are, so the world says it rather than leaving them to guess.
     */
    /*
     * READ FROM THE SERVER'S TOPIC STATE, NOT GUESSED FROM THE CONCEPTS.
     *
     * This used to be "is any concept here current?", which is false in two
     * states that are not closed at all: a finished world, and a world whose
     * concepts are done with its checkpoint due. Both told the learner "This
     * world is not open yet". findJourneyPath already says which of complete,
     * current and locked a topic is, so that is what decides the message.
     */
    const status = topic.state;
    const everyConceptDone = topic.concepts.every((c) => c.state === "demonstrated");
    const challengeReady = topic.challenge?.state === "current" && everyConceptDone;

    /* What opens a locked world, from the same helper the map uses. */
    const requirement = status === "locked" ? unlockRequirement(path.topics, topic.slug) : null;

    /* Where the learner actually is, from the path, or nothing if the path has
       no next step. Never a guess. `path.current` is null while a checkpoint
       is due, which nextAction covers: the checkpoint is then the next step. */
    const step = nextAction(path);
    const whereNow = step ? (
        <Link to={step.href}>{step.kind === "checkpoint" ? `the ${step.name}` : step.name}</Link>
    ) : null;

    return (
        <section className="world" style={{ "--warmth": warmth } as React.CSSProperties}>
            <header className="world-head">
                <p className="world-eyebrow">{STATE.currentTopic}</p>
                <h1 className="world-name">{topic.name}</h1>
                {/* The topic's own sentence about itself, which the curriculum
                    already carries. No progress count: "3 of 7" is a progress
                    bar wearing a costume, and the objects say it better. */}
                {topic.principle && <p className="world-principle">{topic.principle}</p>}

                {/* A finished world says so, and where the learner is now. */}
                {status === "complete" && (
                    <p className="world-closed" role="status">
                        You have finished {topic.name}.
                        {whereNow && <> Next: {whereNow}.</>}
                    </p>
                )}

                {status === "locked" && (
                    <p className="world-closed">
                        This world is not open yet.
                        {requirement && <> {requirement}.</>} You are working on{" "}
                        {whereNow ?? <Link to="/journey">your journey</Link>}.
                    </p>
                )}
            </header>

            <div className="world-field">
                <div className="world-body">
                    <Planet slug={topic.slug} state="here" size={168} />
                    <Ship size={38} rotate={24} state="learning" label="Your craft, here" />
                </div>

                {/* With the checkpoint due, the block below is the one
                    primary action; the checkpoint's row keeps a quiet link. */}
                <ConceptSteps topic={topic} primaryAction={!challengeReady} />

                {/* THE SEQUENCE, NOT THE FIELD.
                    The orbit that used to live here placed each concept by a
                    function of its index and its state. It read beautifully
                    and answered none of "where am I, what do I do, why can I
                    not do that" -- the states were encoded as treatments and
                    named only in aria-labels. The planet and the craft stay,
                    because arriving somewhere is Jolt's whole idea; what was
                    scattered around them is now a list you can read. */}
            </div>

            {/* The checkpoint only exists once there is nothing left out there. */}
            {challengeReady && (
                <div className="world-checkpoint">
                    <p className="world-checkpoint-line">
                        Every concept in {topic.name} is done.
                    </p>
                    <Link className="button primary big" to={`/challenge/${topic.slug}`}>
                        {ACTION.takeCheckpoint}
                    </Link>
                </div>
            )}

            <p className="world-exit">
                <Link to="/journey">
                    <Icon name="map" size={17} /> {ACTION.seeJourney}
                </Link>
            </p>
        </section>
    );
}
