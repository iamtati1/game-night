import { useEffect, useState } from "react";
import { play } from "../games/sound.js";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { Planet } from "../world/Planet.js";
import { Ship } from "../world/Ship.js";
import type { JourneyPathResponse } from "../api/types.js";
import { ACTION, continueTo } from "../vocabulary.js";
import { worldJustUnlocked } from "../games/progression.js";

/**
 * The moment after a topic's checkpoint, which is the moment a module unlocks.
 *
 * WHY THIS EXISTS. Passing the checkpoint is the ONLY write in Jolt that opens
 * a new module -- demonstrating concepts gets a learner to it, and the
 * checkpoint is the thing on the other side. The screen that owned that moment
 * said "Topic complete", showed the challenge's own title, and offered "See
 * what is next". It never named the module that had just opened, never said an
 * unlock had happened, and sent the learner back to the map to work it out for
 * themselves. The unlock was real and the game was silent about it, which is
 * exactly what "nothing unlocked" feels like from the outside.
 *
 * READ BACK, NOT ASSUMED. The path is re-fetched after the write and the
 * announcement is derived from it by the same `worldJustUnlocked` the concept
 * arrival uses -- so the banner cannot claim an unlock the server does not
 * show, and a checkpoint that was recorded but did not open anything (a topic
 * with nothing authored after it) says what is true instead.
 */
export function CheckpointComplete({ topic, title }: { topic: string; title: string }) {
    const [path, setPath] = useState<JourneyPathResponse | null>(null);

    // Something opened. Keyed, so StrictMode's double effect or a re-render
    // cannot play it twice; the page says the same thing in words.
    useEffect(() => {
        play("milestone", `checkpoint:${topic}`);
    }, [topic]);

    useEffect(() => {
        let active = true;

        void (async () => {
            try {
                const data = await api.get<JourneyPathResponse>("/api/curriculum/path");

                if (active) setPath(data);
            } catch {
                // Falls back to the plain confirmation below.
            }
        })();

        return () => {
            active = false;
        };
    }, [topic]);

    const world = path?.topics.find((t) => t.slug === topic) ?? null;
    const unlocked = path ? worldJustUnlocked(path.topics, topic) : null;

    /*
     * THE HONEST NEGATIVE. The checkpoint was recorded and this topic is still
     * not complete -- which can only mean a concept under it is outstanding.
     * Saying "topic complete" there would be the same lie in a different place.
     */
    const incomplete = world !== null && world.state !== "complete";

    const action = unlocked
        ? {
              label: `Enter ${unlocked.name}`,
              to: unlocked.concepts[0] ? `/concept/${unlocked.concepts[0].slug}` : "/journey"
          }
        : path?.current
          ? { label: continueTo(path.current.name), to: `/concept/${path.current.slug}` }
          : { label: "See what is next", to: "/journey" };

    return (
        <section className="complete">
            {/* The world that just unlocked, when one did -- arriving somewhere
                new is the whole content of this moment. Otherwise the one just
                finished. */}
            <div className="complete-arrival">
                <Planet
                    slug={unlocked?.slug ?? topic}
                    state={unlocked ? "here" : "visited"}
                    size={132}
                />
                <Ship size={42} rotate={20} thrusting />
            </div>

            <p className="complete-label">{incomplete ? "Checkpoint passed" : "Module complete"}</p>
            <h1 className="complete-capability">{world?.name ?? title}</h1>

            <p className="complete-points">
                <span className="complete-plus">+75</span> points
            </p>

            {/* THE UNLOCK, NAMED. role="status" so it is announced rather than
                only drawn, and kept on the page rather than flashed: a
                celebration that has faded by the time a first-time player looks
                up has told them nothing. */}
            {unlocked && (
                <p className="complete-unlocked" role="status">
                    <span className="complete-unlocked-label">Module unlocked</span>
                    <span className="complete-unlocked-world">{unlocked.name}</span>
                </p>
            )}

            {incomplete && (
                <p className="complete-remaining">
                    {world!.concepts.filter((c) => c.state !== "demonstrated").length} concepts here
                    are still unfinished, so the next module stays shut for now.
                </p>
            )}

            <Link className="button primary big" to={action.to}>
                {action.label}
            </Link>

            <p className="complete-aside">
                <Link to="/journey">{ACTION.seeJourney}</Link>
            </p>
        </section>
    );
}
