import { useId } from "react";

/**
 * The learner's craft.
 *
 * The one persistent object in the world: it sits on Home, it marks "you are
 * here" on the Journey map, and it rides the margin of a lesson. Because it is
 * always the same object, it is the thing that makes the surfaces feel like one
 * place seen from different distances rather than three screens that share a
 * background.
 *
 * Drawn nose-up and rotated by its callers, so every use shares one silhouette.
 * Lit from the upper left like everything else in the atlas.
 *
 * Deliberately NOT a rocket emoji and not a triangle. A rocket emoji renders as
 * someone else's artwork in the middle of ours, and a triangle is a cursor. This
 * has a cockpit, two fins and a hull seam -- enough to read as a vehicle with a
 * person in it at 28px, which is the size it is used at most often.
 */
interface ShipProps {
    size?: number;
    /** Degrees clockwise from nose-up. */
    rotate?: number;
    /** Draws the engine plume. Off when the craft is parked at a world. */
    thrusting?: boolean;
    label?: string;
}

export function Ship({ size = 44, rotate = 0, thrusting = false, label }: ShipProps) {
    const uid = useId().replace(/:/g, "");
    const hull = `hull-${uid}`;
    const glass = `glass-${uid}`;
    const flame = `flame-${uid}`;

    return (
        <svg
            className={`ship${thrusting ? " is-thrusting" : ""}`}
            viewBox="0 0 64 80"
            width={size}
            height={(size / 64) * 80}
            style={{ transform: `rotate(${rotate}deg)` }}
            role={label ? "img" : "presentation"}
            aria-label={label}
            aria-hidden={label ? undefined : true}
        >
            <defs>
                {/* Left-lit, so the right flank carries the shadow and the hull
                    reads as round rather than as a flat shape. */}
                <linearGradient id={hull} x1="0" y1="0" x2="1" y2="0.3">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="42%" stopColor="#e8ecff" />
                    <stop offset="100%" stopColor="#9aa4cf" />
                </linearGradient>

                <linearGradient id={glass} x1="0" y1="0" x2="0.6" y2="1">
                    <stop offset="0%" stopColor="#7ff0ee" />
                    <stop offset="100%" stopColor="#2d7fd6" />
                </linearGradient>

                <linearGradient id={flame} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffd25e" stopOpacity="0.95" />
                    <stop offset="55%" stopColor="#ff8a4c" stopOpacity="0.7" />
                    <stop offset="100%" stopColor="#ff6ec7" stopOpacity="0" />
                </linearGradient>
            </defs>

            {/* Plume first, so the hull sits over its root and the flame looks
                like it is coming out of the engine rather than out from behind. */}
            {thrusting && (
                <path className="ship-flame" d="M24 58 L32 80 L40 58 Z" fill={`url(#${flame})`} />
            )}

            {/* Fins. Swept back, and a shade darker than the hull so they read
                as separate surfaces catching less light. */}
            <path d="M20 40 L6 62 L20 57 Z" fill="#7f8ac2" />
            <path d="M44 40 L58 62 L44 57 Z" fill="#6c76ad" />

            {/* Hull: a pointed nose easing into a straight body. */}
            <path
                d="M32 2 C41 12 47 27 47 42 L47 60 L17 60 L17 42 C17 27 23 12 32 2 Z"
                fill={`url(#${hull})`}
            />

            {/* Seam. One line, and it does most of the work of making the hull
                look panelled rather than poured. */}
            <path d="M32 6 L32 60" stroke="#aab3dd" strokeWidth="1" opacity="0.5" />

            {/* Cockpit, with a highlight in the same upper-left position the
                planets use. */}
            <ellipse cx="32" cy="30" rx="10" ry="11" fill={`url(#${glass})`} />
            <ellipse cx="28" cy="26" rx="3.4" ry="4" fill="white" opacity="0.72" />

            {/* Engine bell. */}
            <rect x="23" y="58" width="18" height="6" rx="2.5" fill="#6c76ad" />
        </svg>
    );
}
