import type { Landmark } from "./atlas.js";

/**
 * The small things that make space inhabited.
 *
 * A map of planets alone reads as astronomy. What turns it into a place people
 * go is the built stuff around the planets -- a station in orbit, a beacon lit
 * on approach, an arch someone put up. These are tiny (a handful of shapes
 * each) and they never carry information the learner needs: losing one costs
 * nothing, which is exactly why they are allowed to be charming.
 *
 * All of them share the page's light source, upper left, and all of them draw
 * from the same palette as the planets.
 */

/** A structure at a destination, chosen per-world by the atlas. */
export function WorldLandmark({ kind, size = 30 }: { kind: Landmark; size?: number }) {
    if (kind === "none") return null;

    if (kind === "station") {
        // An orbital station: a habitat ring with a docking spine through it.
        return (
            <svg
                className="landmark landmark-station"
                viewBox="0 0 48 48"
                width={size}
                height={size}
                aria-hidden="true"
            >
                <ellipse
                    cx="24"
                    cy="24"
                    rx="18"
                    ry="7"
                    fill="none"
                    stroke="#cbd6ff"
                    strokeWidth="3"
                    transform="rotate(-22 24 24)"
                />
                <rect x="21" y="10" width="6" height="28" rx="3" fill="#eef2ff" transform="rotate(-22 24 24)" />
                {/* Lit windows. Warm against all that cool metal. */}
                <circle cx="24" cy="16" r="1.8" fill="#ffd166" />
                <circle cx="24" cy="32" r="1.8" fill="#ffd166" />
            </svg>
        );
    }

    if (kind === "beacon") {
        // A navigation beacon: a mast with a lamp that pulses on approach.
        return (
            <svg
                className="landmark landmark-beacon"
                viewBox="0 0 32 48"
                width={size * 0.66}
                height={size}
                aria-hidden="true"
            >
                <path d="M16 46 L11 30 h10 Z" fill="#8f9bd4" />
                <rect x="14" y="14" width="4" height="18" rx="2" fill="#cbd6ff" />
                <circle className="beacon-lamp" cx="16" cy="12" r="6" fill="#5ee7f0" />
                <circle cx="14" cy="10" r="2" fill="#fff" opacity="0.8" />
            </svg>
        );
    }

    // An arch: someone built a gateway here, which is the cheapest possible way
    // to say "this is a threshold" without a label.
    return (
        <svg
            className="landmark landmark-arch"
            viewBox="0 0 48 40"
            width={size}
            height={size * 0.83}
            aria-hidden="true"
        >
            <path
                d="M8 38 V22 a16 16 0 0 1 32 0 V38"
                fill="none"
                stroke="#cbd6ff"
                strokeWidth="4"
                strokeLinecap="round"
            />
            <circle cx="24" cy="8" r="3.5" fill="#ffd166" />
        </svg>
    );
}

/**
 * A star pattern with the lines drawn in.
 *
 * Used as a quiet section marker. A constellation is a set of unrelated stars
 * that somebody decided to see a shape in, which is a reasonable thing for a
 * learning product to have on the wall.
 */
export function Constellation({
    points,
    width = 120,
    height = 60,
    className
}: {
    /** Normalised 0..1 coordinates, joined in order. */
    points: ReadonlyArray<[number, number]>;
    width?: number;
    height?: number;
    className?: string;
}) {
    const at = (p: readonly [number, number]) => [p[0] * width, p[1] * height] as const;
    const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${at(p).join(" ")}`).join(" ");

    return (
        <svg
            className={className ? `constellation ${className}` : "constellation"}
            viewBox={`0 0 ${width} ${height}`}
            width={width}
            height={height}
            aria-hidden="true"
        >
            <path d={path} fill="none" stroke="#fff" strokeWidth="0.75" opacity="0.3" />
            {points.map((p, i) => {
                const [x, y] = at(p);

                return <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 2.4 : 1.6} fill="#fff" opacity="0.85" />;
            })}
        </svg>
    );
}

/**
 * A drifting rock. Irregular on purpose -- a regular polygon reads as a shape
 * and a circle reads as a small planet, and it is neither.
 */
export function Asteroid({ size = 22, className }: { size?: number; className?: string }) {
    return (
        <svg
            className={className ? `asteroid ${className}` : "asteroid"}
            viewBox="0 0 32 28"
            width={size}
            height={(size / 32) * 28}
            aria-hidden="true"
        >
            <path
                d="M6 14 L10 5 L21 3 L29 11 L27 21 L16 26 L7 22 Z"
                fill="#5c6399"
            />
            <path d="M10 5 L21 3 L29 11 Z" fill="#7c84c4" />
            <circle cx="17" cy="14" r="3" fill="#464d7d" opacity="0.7" />
            <circle cx="23" cy="18" r="2" fill="#464d7d" opacity="0.55" />
        </svg>
    );
}
