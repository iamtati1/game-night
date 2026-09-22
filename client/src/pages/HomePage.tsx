import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";
import { Planet } from "../world/Planet.js";
import { Ship } from "../world/Ship.js";
import { WorldLandmark } from "../world/Objects.js";
import { worldFor } from "../world/atlas.js";
import { Icon } from "../world/Icon.js";
import type { JourneyPathResponse } from "../api/types.js";

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
    const { user, loading } = useAuth();
    const [path, setPath] = useState<JourneyPathResponse | null>(null);

    useEffect(() => {
        if (!user) return;

        let active = true;

        void (async () => {
            try {
                const data = await api.get<JourneyPathResponse>("/api/curriculum/path");

                if (active) setPath(data);
            } catch {
                // The page still works without it; the button falls back to the
                // journey rather than to a specific concept.
            }
        })();

        return () => {
            active = false;
        };
    }, [user]);

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
                    does — then keep going, one small discovery at a time.
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

    /* ------------------------------------------------------------ in orbit */
    const current = path?.current ?? null;
    const currentTopic = path?.topics.find((t) => t.state === "current") ?? null;
    const challenge = path?.topics.find((t) => t.challenge?.state === "current") ?? null;

    const action = challenge
        ? {
              label: "Take the checkpoint",
              to: `/challenge/${challenge.slug}`,
              name: `${challenge.name} checkpoint`
          }
        : current
          ? { label: "Continue", to: `/learn/${current.slug}`, name: current.name }
          : { label: "Open the map", to: "/journey", name: null };

    return (
        <section className="home">
            <div className="home-sky">
                <div className="home-brief">
                    <p className="home-greeting">Welcome back, {user.username}.</p>

                    {currentTopic ? (
                        <>
                            <p className="home-label">You are orbiting</p>
                            <h1 className="home-topic">{currentTopic.name}</h1>
                            {currentTopic.principle && (
                                <p className="home-principle">{currentTopic.principle}</p>
                            )}
                        </>
                    ) : (
                        <>
                            <p className="home-label">Your course</p>
                            <h1 className="home-topic">Ready when you are</h1>
                        </>
                    )}

                    {action.name && (
                        <p className="home-next">
                            Next — <strong>{action.name}</strong>
                        </p>
                    )}

                    <Link className="button primary big home-action" to={action.to}>
                        {action.label}
                    </Link>
                </div>

                {/* The craft in orbit around the world you are at. Same planet
                    art and same ship as the map, so arriving at /journey is
                    recognisably the same place seen from further out. */}
                <div className="home-orbit">
                    <Planet
                        slug={currentTopic?.slug ?? "values"}
                        state="here"
                        size={150}
                        label={currentTopic ? `${currentTopic.name}, your current world` : undefined}
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
                ever say about themselves. */}
            {path && (
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
                        <span className="home-stat-label">worlds charted</span>
                    </p>
                </div>
            )}

            {/* Secondary on purpose. The games are practice for what the course
                teaches, so they sit below the one thing Jolt wants next. */}
            <p className="home-aside">
                <Link to="/journey">
                    <Icon name="map" size={17} /> See the whole map
                </Link>
                <Link to="/play">
                    <Icon name="play" size={17} /> Practice with a game
                </Link>
            </p>
        </section>
    );
}
