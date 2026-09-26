import { useId } from "react";
import type { ConceptState } from "./orbits.js";

/**
 * One concept, as a thing in orbit around its world.
 *
 * THREE GENUINELY DIFFERENT OBJECTS, not one object at three opacities. What
 * the learner has done changes what is actually there:
 *
 *   locked        a bare rock. Something is out there; nobody has been.
 *   current       a rock with a beacon on it, lit and pulsing. Somewhere to go.
 *   demonstrated  an outpost -- the beacon has become a structure with windows
 *                 lit, and it casts light into the space around it.
 *
 * That last one is the whole idea. Finishing a concept does not tick a box; it
 * BUILDS something, and the world is visibly different afterwards. The lights
 * on a completed outpost are the same warm yellow as the city lights on a
 * visited planet, because they mean the same thing: somebody is there now
 * because you went.
 *
 * Never grey. A locked concept is cool and dim but still coloured and still
 * interesting to look at -- a grey object reads as a disabled control, and the
 * places ahead of a learner should look worth travelling to.
 */
export function ConceptObject({
    state,
    size = 46,
    seed = 0
}: {
    state: ConceptState;
    size?: number;
    /** Varies the rock's silhouette so no two are identical. */
    seed?: number;
}) {
    const uid = useId().replace(/:/g, "");
    const glow = `cg-${uid}`;

    const lit = state === "demonstrated";
    const live = state === "current";

    // Cool and dim in the distance, warmer as it is reached. Hue rather than
    // saturation does the work, so nothing ever goes grey.
    const rock = lit ? "#6f7bc4" : live ? "#5d68ae" : "#464f8a";
    const face = lit ? "#98a3e0" : live ? "#7c87ca" : "#5b649e";

    // A little asymmetry per object, so a field of them does not read as tiling.
    const tilt = -14 + ((seed * 37) % 28);

    return (
        <svg
            className={`concept-object is-${state}`}
            viewBox="-18 -18 100 100"
            width={size}
            height={size}
            aria-hidden="true"
        >
            <defs>
                <radialGradient id={glow} cx="50%" cy="50%" r="50%">
                    <stop offset="40%" stopColor={lit ? "#ffd166" : "#5ee7f0"} stopOpacity="0" />
                    <stop
                        offset="70%"
                        stopColor={lit ? "#ffd166" : "#5ee7f0"}
                        stopOpacity={lit ? 0.3 : live ? 0.22 : 0}
                    />
                    <stop offset="100%" stopColor={lit ? "#ffd166" : "#5ee7f0"} stopOpacity="0" />
                </radialGradient>
            </defs>

            {/* The light a finished outpost throws into the space around it. */}
            {(lit || live) && <circle cx="32" cy="36" r="46" fill={`url(#${glow})`} />}

            <g transform={`rotate(${tilt} 32 36)`}>
                {/* The rock. Irregular on purpose -- a circle reads as a planet
                    and a polygon reads as a shape. */}
                <path
                    d="M10 34 L16 18 L33 12 L50 20 L54 38 L42 52 L20 50 Z"
                    fill={rock}
                />
                {/* One lit facet, matching the page's upper-left light. */}
                <path d="M16 18 L33 12 L50 20 Z" fill={face} />
            </g>

            {/* A beacon appears the moment the concept is reachable. */}
            {live && (
                <g>
                    <rect x="30" y="4" width="4" height="12" rx="2" fill="#aab4e8" />
                    <circle className="concept-beacon" cx="32" cy="4" r="5" fill="#5ee7f0" />
                    <circle cx="30.5" cy="2.5" r="1.6" fill="#fff" opacity="0.8" />
                </g>
            )}

            {/* Finished: the beacon has become somewhere people are. */}
            {lit && (
                <g>
                    <rect x="22" y="2" width="20" height="12" rx="3" fill="#8d98d8" />
                    <rect x="26" y="14" width="12" height="4" rx="1.5" fill="#6f7bc4" />
                    {/* Windows. The same warm yellow as a visited planet's city
                        lights, because it means the same thing. */}
                    <circle cx="28" cy="8" r="2" fill="#ffd166" />
                    <circle cx="36" cy="8" r="2" fill="#ffe9a8" />
                </g>
            )}
        </svg>
    );
}
