import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import { Planet } from "../world/Planet.js";
import { Ship } from "../world/Ship.js";
import type { JourneyPathResponse } from "../api/types.js";

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

    const action = challenge
        ? {
              label: "Take the checkpoint",
              to: `/challenge/${challenge.slug}`,
              name: `${challenge.name} checkpoint`
          }
        : next
          ? { label: "Continue", to: `/concept/${next.slug}`, name: next.name }
          : { label: "Back to the map", to: "/journey", name: null };

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

            {action.name && (
                <>
                    <p className="complete-label complete-next-label">Next</p>
                    <p className="complete-next">{action.name}</p>
                </>
            )}

            <Link className="button primary big" to={action.to}>
                {action.label}
            </Link>

            <p className="complete-aside">
                <Link to="/journey">See the whole map</Link>
            </p>
        </section>
    );
}
