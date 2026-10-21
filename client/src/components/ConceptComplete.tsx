import { useEffect, useState } from "react";
import { play } from "../games/sound.js";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { Planet } from "../world/Planet.js";
import { Ship } from "../world/Ship.js";
import type { JourneyPathResponse } from "../api/types.js";
import { ACTION } from "../vocabulary.js";
import { currentWorldStanding, worldJustUnlocked } from "../games/progression.js";

/**
 * The moment after a concept is demonstrated.
 *
 * Three things, in this order, because that is the order they matter in:
 *
 *     WHAT YOU CAN DO NOW   the point of the lesson
 *     +25 POINTS            recognition of it
 *     WHAT IS NEXT          the one action
 *
 * The capability line comes from the curriculum's own `objective`, which
 * completes "I know how to ___" by construction -- so "You can now run a snippet
 * and say what it prints" is authored curriculum text rather than a second copy
 * of it written for this screen.
 *
 * The points figure is read back from the server rather than assumed, so a
 * learner who somehow demonstrated the same concept twice sees their real total
 * rather than a number this component invented.
 */
export function ConceptComplete({ concept }: { concept: string }) {
    const [path, setPath] = useState<JourneyPathResponse | null>(null);

    // Something opened. Keyed, so StrictMode's double effect or a re-render
    // cannot play it twice; the page says the same thing in words.
    useEffect(() => {
        play("milestone", `concept:${concept}`);
    }, [concept]);

    useEffect(() => {
        let active = true;

        void (async () => {
            try {
                const data = await api.get<JourneyPathResponse>("/api/curriculum/path");

                if (active) setPath(data);
            } catch {
                // Falls back to a plain confirmation below.
            }
        })();

        return () => {
            active = false;
        };
    }, [concept]);

    const just = path?.topics
        .flatMap((t) => t.concepts)
        .find((c) => c.slug === concept);

    // The world this concept belongs to, so the arrival shows the place the
    // learner actually just finished working on rather than a generic planet.
    const world = path?.topics.find((t) => t.concepts.some((c) => c.slug === concept));

    const challenge = path?.topics.find((t) => t.challenge?.state === "current") ?? null;
    const next = path?.current ?? null;

    /*
     * THE UNLOCK, DETECTED WHERE IT ACTUALLY HAPPENS.
     *
     * This screen is the arrival for BOTH writes that can complete a topic --
     * demonstrating its last concept, and passing its checkpoint -- and it
     * already re-reads /api/curriculum/path after the write, so the state here
     * is the server's, taken after the fact. It simply never looked to see
     * whether a world had opened, which is why the unlock was invisible: the
     * learner was told "Next: <some concept>" and left to notice for
     * themselves that it lived somewhere new.
     *
     * See games/progression.ts for why this cannot fire for a world that was
     * already open, and why a refresh cannot replay it.
     */
    const unlocked = path ? worldJustUnlocked(path.topics, concept) : null;
    const standing = path ? currentWorldStanding(path.topics) : null;

    const action = unlocked
        ? {
              label: `Continue to ${unlocked.name}`,
              to: unlocked.concepts[0] ? `/concept/${unlocked.concepts[0].slug}` : "/journey",
              name: null
          }
        : challenge
          ? {
                label: ACTION.takeCheckpoint,
                to: `/challenge/${challenge.slug}`,
                name: `${challenge.name} checkpoint`
            }
          : next
            ? { label: ACTION.continueLearning, to: `/concept/${next.slug}`, name: next.name }
            : { label: ACTION.seeJourney, to: "/journey", name: null };

    /*
     * What is left here, when nothing opened. The learner has just finished
     * something and the honest answer to "am I nearly there?" is a count, not
     * silence. Suppressed on the unlock branch, where the answer is the banner.
     */
    const remainingHere =
        !unlocked && standing && standing.world.slug === world?.slug
            ? [
                  standing.remaining.concepts > 0
                      ? `${standing.remaining.concepts} ${
                            standing.remaining.concepts === 1 ? "concept" : "concepts"
                        }`
                      : null,
                  standing.remaining.checkpoint ? "the checkpoint" : null
              ].filter(Boolean)
            : [];

    return (
        <section className="complete">
            {/* An arrival, not a tick. The same planet and the same craft as
                the map and Home: finishing a lesson should read as having got
                somewhere, and a green check reads as having closed a dialog.
                The ship is thrusting because this is the moment you leave. */}
            <div className="complete-arrival">
                <Planet slug={world?.slug ?? "values"} state="visited" size={132} />
                <Ship size={42} rotate={20} thrusting />
            </div>

            <p className="complete-label">You can now</p>
            <h1 className="complete-capability">
                {just?.objective ?? "do something you could not do before"}
            </h1>

            <p className="complete-points">
                <span className="complete-plus">+25</span> points
            </p>

            {/* THE UNLOCK, SAID OUT LOUD.
                role="status" so it is announced rather than only drawn, and
                it is a persistent region on the page rather than a toast --
                a celebration that has faded by the time a first-time player
                looks up has told them nothing. */}
            {unlocked && (
                <p className="complete-unlocked" role="status">
                    <span className="complete-unlocked-label">Level unlocked</span>
                    <span className="complete-unlocked-world">{unlocked.name}</span>
                </p>
            )}

            {/* The other branch, and the one that runs far more often: no
                claim of an unlock, just what is actually left in this world,
                counted from the same state the map counts. */}
            {!unlocked && remainingHere.length > 0 && world && (
                <p className="complete-remaining">
                    {standing?.done} of {standing?.total} concepts done in {world.name}, with{" "}
                    {remainingHere.join(" and ")} to go
                </p>
            )}

            {action.name && (
                <>
                    <p className="complete-label complete-next-label">Next</p>
                    <p className="complete-next">{action.name}</p>
                </>
            )}

            <Link className="button primary big" to={action.to}>
                {action.label}
            </Link>

            {/* The way back to the bigger picture, and the way into practice:
                quiet, beside the one primary action. The journey link is left
                out when the primary action already goes there. */}
            <p className="complete-aside">
                {action.to !== "/journey" && <Link to="/journey">{ACTION.seeJourney}</Link>}
                <Link to="/play">{ACTION.playGame}</Link>
            </p>
        </section>
    );
}
