import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";
import { Planet } from "../world/Planet.js";
import { Ship } from "../world/Ship.js";
import { WorldLandmark } from "../world/Objects.js";
import { worldFor } from "../world/atlas.js";
import { Icon } from "../world/Icon.js";
import type { JourneyPathResponse, ResumableResponse, ResumableSession } from "../api/types.js";
import { gameBySlug } from "../games/catalog.js";
import { nextAction, sectionProgress } from "../games/progression.js";
import { ACTION, STATE } from "../vocabulary.js";

import { usePageTitle } from "../usePageTitle.js";
/**
 * THE FRONT DOOR — as a location rather than a dashboard.
 *
 * The page answers one question, "where am I and what is next", and it now
 * answers it by showing it: the world you are currently at, your craft in orbit
 * around it, the one line that says what that world is about, and a single lit
 * control. The previous version said all of the same things in five stacked
 * paragraphs of text.
 *
 * ONE ACTION, STILL. Signed out that is "Start learning"; signed in it is the
 * exact next step the curriculum says is next. Nothing here asks a learner to
 * choose between destinations before they know what any of them are for -- the
 * games remain one click away, named as practice rather than as the thing
 * itself.
 *
 * The signed-out hero is the world itself rather than a headline over a
 * screenshot, because the planet is the most characteristic thing Jolt has and
 * the first screen should be the thing, not a description of it.
 */
export function HomePage() {
    usePageTitle("Home");
    const { user, loading } = useAuth();
    const [path, setPath] = useState<JourneyPathResponse | null>(null);
    /** The path could not be read. Said, rather than covered by a button that
     *  guesses -- it used to fall back to "Ready when you are" and a map link,
     *  which told a returning learner they had no progress. */
    const [failed, setFailed] = useState(false);
    /** Bumped by "Try again" to re-run the fetch. */
    const [attempt, setAttempt] = useState(0);
    /** A game left unfinished, so Home can say where it is and offer it back. */
    const [held, setHeld] = useState<ResumableSession | null>(null);

    useEffect(() => {
        if (!user) return;

        let active = true;

        // Best effort: Home still works without it, and a failure says nothing
        // rather than guessing.
        api.get<ResumableResponse>("/api/me/sessions/resumable")
            .then((data) => active && setHeld(data.sessions[0] ?? null))
            .catch(() => undefined);

        return () => {
            active = false;
        };
    }, [user]);

    useEffect(() => {
        if (!user) return;

        let active = true;

        void (async () => {
            try {
                const data = await api.get<JourneyPathResponse>("/api/curriculum/path");

                if (active) setPath(data);
            } catch {
                if (active) setFailed(true);
            }
        })();

        return () => {
            active = false;
        };
    }, [user, attempt]);

    if (loading) {
        return <p className="muted center">…</p>;
    }

    /* ------------------------------------------------ never been here before */
    if (!user) {
        return (
            <section className="welcome">
                {/* A world and a craft leaving it. No copy in here at all: if
                    the illustration needs a caption to read as an invitation,
                    it is the wrong illustration. */}
                <div className="welcome-stage">
                    <Planet slug="values" state="here" size={200} />
                    <Ship size={56} rotate={18} thrusting />
                    <WorldLandmark kind="station" size={44} />
                </div>

                <h1 className="welcome-title">
                    Learn JavaScript by <em>making things happen</em>.
                </h1>

                <p className="welcome-lede">
                    No experience needed. Write a line, press RUN, and find out what it
                    does, then keep going, one small discovery at a time.
                </p>

                <Link className="button primary big welcome-start" to="/register">
                    Start exploring
                </Link>

                <p className="welcome-note">
                    Already have an account? <Link to="/login">Log in</Link>
                </p>
            </section>
        );
    }

    /* ------------------------------------------- signed in, path not read */
    if (failed) {
        return (
            <section className="home">
                <div className="home-brief">
                    <h1 className="home-topic">Your progress did not load</h1>
                    <p className="home-principle" role="alert">
                        Nothing is lost. Try again, or open your journey directly.
                    </p>
                    <div className="cta-row">
                        <button
                            className="button primary"
                            onClick={() => {
                                setFailed(false);
                                setAttempt((n) => n + 1);
                            }}
                        >
                            Try again
                        </button>
                        <Link className="button ghost" to="/journey">
                            Open your journey
                        </Link>
                    </div>
                </div>
            </section>
        );
    }

    /* No button until the path is read. A guessed one ("Open the map") flashed
       up for every returning learner and pointed somewhere other than their
       next step. */
    if (!path) {
        return (
            <p className="muted center" role="status">
                Loading your progress…
            </p>
        );
    }

    /* ------------------------------------------------------------ in orbit */
    const currentTopic = path.topics.find((t) => t.state === "current") ?? null;
    const step = nextAction(path);
    const progress = currentTopic ? sectionProgress(currentTopic) : null;
    /** Nothing demonstrated and no checkpoint passed: a first visit, whatever
     *  the account's age. "Welcome back" and "Continue" would both be wrong. */
    const fresh = path.points.concepts === 0 && !path.topics.some((t) => t.state === "complete");

    const action = step
        ? {
              label: step.kind === "checkpoint" ? ACTION.takeCheckpoint : fresh ? ACTION.startLearning : ACTION.continueLearning,
              to: step.href
          }
        : { label: ACTION.seeJourney, to: "/journey" };

    return (
        <section className="home">
            <div className="home-sky">
                <div className="home-brief">
                    <p className="home-greeting">
                        {fresh ? `Welcome, ${user.username}.` : `Welcome back, ${user.username}.`}
                    </p>

                    {currentTopic ? (
                        <>
                            <p className="home-label">{STATE.currentTopic}</p>
                            <h1 className="home-topic">{currentTopic.name}</h1>
                            {currentTopic.principle && (
                                <p className="home-principle">{currentTopic.principle}</p>
                            )}
                        </>
                    ) : (
                        <>
                            <p className="home-label">Your journey</p>
                            <h1 className="home-topic">Every topic is complete</h1>
                        </>
                    )}

                    {step && (
                        <p className="home-next">
                            {fresh ? "First step" : "Next step"}: <strong>{step.name}</strong>
                            {progress && !fresh && (
                                <>
                                    <br />
                                    <span className="home-progress">{progress.label}</span>
                                </>
                            )}
                        </p>
                    )}

                    <Link className="button primary big home-action" to={action.to}>
                        {action.label}
                    </Link>

                    {/* A game left unfinished, said quietly under the one primary
                        action: leaving a game pauses it, and this is the way back. */}
                    {held && gameBySlug(held.game.slug) && (
                        <p className="home-held">
                            {held.status === "paused" ? "Paused" : "In progress"}:{" "}
                            <strong>{held.game.name}</strong>,{" "}
                            {(gameBySlug(held.game.slug)!.unit ?? "Round").toLowerCase()}{" "}
                            {Math.min(held.unitsDone + 1, held.unitsTotal)} of {held.unitsTotal}.{" "}
                            <Link to={gameBySlug(held.game.slug)!.path}>Resume</Link>
                        </p>
                    )}

                    {/* Secondary on purpose. The games are practice for what the course
                        teaches, so they sit below the one thing Jolt wants next -- directly
                        below it, so on a phone they are on screen rather than
                        under the planet. */}
                    <p className="home-aside">
                        <Link to="/journey">
                            <Icon name="map" size={17} /> {ACTION.seeJourney}
                        </Link>
                        <Link to="/play">
                            <Icon name="play" size={17} /> {ACTION.playGame}
                        </Link>
                    </p>
                </div>

                {/* The craft in orbit around the world you are at. Same planet
                    art and same ship as the map, so arriving at /journey is
                    recognisably the same place seen from further out. */}
                <div className="home-orbit">
                    <Planet
                        slug={currentTopic?.slug ?? "values"}
                        state="here"
                        size={150}
                        label={currentTopic ? `${currentTopic.name}, your current topic` : undefined}
                    />
                    <Ship size={40} rotate={28} />
                    <WorldLandmark
                        kind={worldFor(currentTopic?.slug ?? "values").landmark}
                        size={30}
                    />
                </div>
            </div>

            {/* Progress as a flight log: what you have earned and what you can
                do. No bar, no percentage -- neither is a thing a learner would
                ever say about themselves. Not shown on a first visit, where it
                would be a row of zeros before anything has happened. */}
            {!fresh && (
                <div className="home-log">
                    <p className="home-stat">
                        <span className="home-stat-value">{path.points.total}</span>
                        <span className="home-stat-label">points earned</span>
                    </p>
                    <p className="home-stat">
                        <span className="home-stat-value">{path.points.concepts}</span>
                        <span className="home-stat-label">
                            {path.points.concepts === 1 ? "thing you can do" : "things you can do"}
                        </span>
                    </p>
                    <p className="home-stat">
                        <span className="home-stat-value">
                            {path.topics.filter((t) => t.state === "complete").length}
                        </span>
                        <span className="home-stat-label">
                            {path.topics.filter((t) => t.state === "complete").length === 1 ? "topic complete" : "topics complete"}
                        </span>
                    </p>
                </div>
            )}
        </section>
    );
}
