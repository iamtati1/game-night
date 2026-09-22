import { useId } from "react";
import { worldFor, type Surface } from "./atlas.js";

/**
 * A world, drawn.
 *
 * Real vector art rather than a coloured circle, because the difference between
 * "this is a place" and "this is a status dot" is entirely in the detail: a
 * terminator that falls across the surface, bands that curve with the sphere,
 * an atmosphere that sits slightly proud of the edge. All of it is cheap -- a
 * dozen shapes and no images -- and all of it is what makes the map feel drawn
 * rather than generated.
 *
 * LIGHT COMES FROM THE UPPER LEFT, EVERYWHERE. Every planet, the ship, and the
 * page's own halo agree on one light source. That single rule does more for
 * coherence than the palette does; break it on one body and that body looks
 * pasted in.
 *
 * `state` is the learner's relationship to the topic, and it changes the art
 * rather than just adding a badge:
 *   visited  -- fully lit and saturated, a place you have been
 *   here     -- the same, plus atmosphere and a live glow
 *   ahead    -- drained toward the background, still clearly a world, but one
 *               you are seeing from a distance
 */
export type PlanetState = "visited" | "here" | "ahead";

interface PlanetProps {
    /** Curriculum slug. Decides the whole appearance -- see the atlas. */
    slug: string;
    state: PlanetState;
    /** Rendered size in pixels. The art is resolution-independent. */
    size?: number;
    /** Optional accessible name. Decorative by default. */
    label?: string;
}

/** Surface features, drawn inside the sphere's clip. */
function Features({ surface, lit, dark, spin }: { surface: Surface; lit: number; dark: number; spin: number }) {
    const light = `hsl(${lit} 85% 74%)`;
    const shade = `hsl(${dark} 70% 44%)`;

    if (surface === "banded") {
        // Gas giant. Ellipses wider than the sphere so they read as latitude
        // bands wrapping it rather than as stripes laid on top.
        return (
            <g opacity="0.55">
                <ellipse cx="50" cy="32" rx="58" ry="7" fill={light} opacity="0.5" />
                <ellipse cx="50" cy="48" rx="58" ry="10" fill={shade} opacity="0.55" />
                <ellipse cx="50" cy="66" rx="58" ry="6" fill={light} opacity="0.4" />
                <ellipse cx="50" cy="78" rx="58" ry="8" fill={shade} opacity="0.4" />
                <ellipse cx="62" cy="48" rx="9" ry="4" fill={light} opacity="0.75" />
            </g>
        );
    }

    if (surface === "cratered") {
        // Rocky. Each crater is a lit rim plus an offset shadow -- two circles,
        // and the offset is what makes it read as a dish rather than a dot.
        const craters: ReadonlyArray<[number, number, number]> = [
            [36, 34, 9],
            [62, 58, 12],
            [44, 72, 6],
            [70, 30, 5],
            [26, 56, 5]
        ];

        return (
            <g transform={`rotate(${spin} 50 50)`}>
                {craters.map(([cx, cy, r], i) => (
                    <g key={i}>
                        <circle cx={cx} cy={cy} r={r} fill={shade} opacity="0.5" />
                        <circle cx={cx - r * 0.18} cy={cy - r * 0.18} r={r * 0.82} fill={light} opacity="0.22" />
                    </g>
                ))}
            </g>
        );
    }

    if (surface === "oceanic") {
        // Continents. Deliberately irregular hand-set paths: anything symmetric
        // reads as a logo.
        return (
            <g transform={`rotate(${spin} 50 50)`} opacity="0.6">
                <path
                    d="M22 44c8-9 18-4 25-9s16-2 18 5-6 12-14 11-12 5-19 2-14-3-10-9Z"
                    fill={light}
                />
                <path d="M54 68c6-5 16-3 20 3s-3 12-11 11-15-8-9-14Z" fill={light} opacity="0.8" />
                <path d="M30 76c4-4 11-2 12 3s-5 8-10 6-6-6-2-9Z" fill={light} opacity="0.6" />
            </g>
        );
    }

    // Swirled. One spiral storm, offset from centre so the sphere still reads
    // as turning.
    return (
        <g transform={`rotate(${spin} 50 50)`} opacity="0.5">
            <path
                d="M58 34c14 4 20 18 14 30s-24 16-34 7"
                fill="none"
                stroke={light}
                strokeWidth="7"
                strokeLinecap="round"
            />
            <path
                d="M52 46c7 1 10 8 7 14s-12 7-16 2"
                fill="none"
                stroke={shade}
                strokeWidth="5"
                strokeLinecap="round"
            />
            <ellipse cx="34" cy="30" rx="16" ry="5" fill={light} opacity="0.5" />
        </g>
    );
}

export function Planet({ slug, state, size = 84, label }: PlanetProps) {
    const world = worldFor(slug);
    // Scoped so two planets on one page cannot share a clip path or a gradient.
    const uid = useId().replace(/:/g, "");

    const body = `body-${uid}`;
    const clip = `clip-${uid}`;
    const glow = `glow-${uid}`;
    const term = `term-${uid}`;

    // Distance drains saturation and lightness rather than applying opacity to
    // the whole group: a semi-transparent planet lets the starfield show through
    // its own surface, which immediately breaks the illusion of a solid body.
    const ahead = state === "ahead";
    const sat = ahead ? 22 : 82;
    const lum = ahead ? 38 : 66;

    return (
        <svg
            className={`planet is-${state}`}
            viewBox="-22 -22 144 144"
            width={size}
            height={size}
            role={label ? "img" : "presentation"}
            aria-label={label}
            aria-hidden={label ? undefined : true}
        >
            <defs>
                <clipPath id={clip}>
                    <circle cx="50" cy="50" r="42" />
                </clipPath>

                {/* The body itself. Light upper-left, terminator falling to the
                    lower right, and a hue shift into shadow rather than a fade
                    to black. */}
                <radialGradient id={body} cx="33%" cy="28%" r="78%">
                    <stop offset="0%" stopColor={`hsl(${world.lit} ${sat}% ${lum + 16}%)`} />
                    <stop offset="46%" stopColor={`hsl(${world.lit} ${sat}% ${lum}%)`} />
                    <stop offset="82%" stopColor={`hsl(${world.dark} ${sat - 8}% ${lum - 26}%)`} />
                    <stop offset="100%" stopColor={`hsl(${world.dark} ${sat - 12}% ${lum - 36}%)`} />
                </radialGradient>

                {/* Atmosphere. Strongest just outside the limb, gone by the edge
                    of the box -- a uniform halo reads as a glow filter, this
                    reads as air. */}
                {/* The terminator. Soft-edged on purpose: a solid shape here
                    lands as a hard crescent drawn across the surface, which
                    reads as a wedge rather than as the body turning away from
                    the light. The falloff is what sells it as curvature. */}
                <radialGradient id={term} cx="26%" cy="22%" r="86%">
                    <stop offset="38%" stopColor={`hsl(${world.dark} 60% 10%)`} stopOpacity="0" />
                    <stop offset="72%" stopColor={`hsl(${world.dark} 60% 10%)`} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={`hsl(${world.dark} 65% 7%)`} stopOpacity="0.62" />
                </radialGradient>

                <radialGradient id={glow} cx="50%" cy="50%" r="50%">
                    <stop offset="62%" stopColor={`hsl(${world.lit} 90% 68%)`} stopOpacity="0" />
                    <stop offset="80%" stopColor={`hsl(${world.lit} 90% 68%)`} stopOpacity={ahead ? 0.1 : 0.34} />
                    <stop offset="100%" stopColor={`hsl(${world.lit} 90% 68%)`} stopOpacity="0" />
                </radialGradient>
            </defs>

            {/* Back half of the ring, drawn before the body so the planet
                occludes it. Drawing a whole ellipse on top is the giveaway that
                a ring is a decoration rather than a ring. */}
            {world.ring && (
                <g transform={`rotate(${world.tilt} 50 50)`}>
                    <path
                        d="M 8 50 A 42 13 0 0 1 92 50"
                        fill="none"
                        stroke={`hsl(${world.lit} ${sat}% ${lum + 6}%)`}
                        strokeWidth="5"
                        opacity={ahead ? 0.3 : 0.75}
                    />
                </g>
            )}

            <circle cx="50" cy="50" r="58" fill={`url(#${glow})`} />
            <circle cx="50" cy="50" r="42" fill={`url(#${body})`} />

            <g clipPath={`url(#${clip})`} opacity={ahead ? 0.45 : 1}>
                <Features surface={world.surface} lit={world.lit} dark={world.dark} spin={world.spin} />

                {/* Laid over the features, so the surface falls into shadow
                    with the body rather than staying lit inside it. */}
                <circle cx="50" cy="50" r="42" fill={`url(#${term})`} />
            </g>

            {/* Front half of the ring. */}
            {world.ring && (
                <g transform={`rotate(${world.tilt} 50 50)`}>
                    <path
                        d="M 8 50 A 42 13 0 0 0 92 50"
                        fill="none"
                        stroke={`hsl(${world.lit} ${sat}% ${lum + 14}%)`}
                        strokeWidth="6"
                        opacity={ahead ? 0.36 : 0.95}
                    />
                </g>
            )}

            {/* A specular highlight where the light actually hits. Small, and
                the last thing drawn. */}
            <ellipse
                cx="34"
                cy="30"
                rx="11"
                ry="8"
                fill="white"
                opacity={ahead ? 0.06 : 0.2}
                transform="rotate(-24 34 30)"
            />

            {Array.from({ length: world.moons }, (_, i) => (
                <circle
                    key={i}
                    cx={i === 0 ? 96 : 6}
                    cy={i === 0 ? 24 : 78}
                    r={i === 0 ? 6 : 4.5}
                    fill={`hsl(${world.lit} ${Math.max(10, sat - 40)}% ${lum + 18}%)`}
                    opacity={ahead ? 0.35 : 0.9}
                />
            ))}
        </svg>
    );
}
