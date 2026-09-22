import { useId } from "react";
import { worldFor, type Surface } from "./atlas.js";

/**
 * A world, drawn.
 *
 * ART DIRECTION. Bright illustrated forms, not semi-realistic rendering. The
 * first version of this component shaded every planet from a lit hemisphere
 * into a near-black shadow, which is how a photograph of a planet looks and is
 * exactly why it read as sober rather than as wonderful. These are built the
 * way an illustrator would build them: a bold saturated silhouette, flat
 * surface shapes in two tints of the same family, one crisp bright rim of
 * atmosphere on the lit edge, and a coloured glow around the whole body.
 *
 * Nothing here is desaturated toward grey and nothing fades to black. A world
 * you have not reached yet is DIMMER and COOLER, never colourless -- a grey
 * planet reads as a disabled button, and the whole point of the map is that the
 * places ahead of you look worth going to.
 *
 * CHARM COMES FROM SPECIFICS. City lights on the night side of a world you have
 * already been to, ice caps, a moon that is slightly too big, a ring at an
 * unlikely angle. Each is a few shapes, and together they are the difference
 * between a set of coloured circles and a set of places.
 *
 * Light comes from the upper left on every body here, on the craft, and on the
 * page itself. Break that on one object and it looks pasted in.
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

/**
 * Curated palettes rather than a hue wheel.
 *
 * Every planet is drawn from this list, so any two that end up side by side on
 * the map belong to the same universe. Generating hues arithmetically was the
 * earlier approach and it produced olive and mustard planets that fought with
 * everything around them -- the palette is the art direction, so it is authored.
 *
 * light  the lit face and the atmosphere rim
 * base   the body
 * deep   surface features and the night side
 */
const PALETTES: ReadonlyArray<{ light: string; base: string; deep: string }> = [
    { light: "#8ff3fb", base: "#3fc8e4", deep: "#1d6fae" }, // cyan
    { light: "#cbb8ff", base: "#9b7bff", deep: "#5b45b8" }, // violet
    { light: "#ffa9ba", base: "#ff7896", deep: "#b83f68" }, // coral
    { light: "#ffe08a", base: "#ffc35c", deep: "#d1762c" }, // warm yellow
    { light: "#9df5cf", base: "#5fd9a8", deep: "#238a6e" }, // mint
    { light: "#ffc9a6", base: "#ff9f73", deep: "#c25a42" }, // peach
    { light: "#a8c8ff", base: "#6d9bff", deep: "#3355c4" }, // bright blue
    { light: "#e0c9ff", base: "#c0a0ff", deep: "#7a56cc" }  // lavender
];

/** Surface features, drawn inside the sphere's clip. Flat shapes, two tints. */
function Features({
    surface,
    light,
    deep,
    spin
}: {
    surface: Surface;
    light: string;
    deep: string;
    spin: number;
}) {
    if (surface === "banded") {
        // Gas giant. Ellipses wider than the sphere, so they read as latitude
        // bands wrapping it rather than as stripes laid across it.
        return (
            <g>
                <ellipse cx="50" cy="30" rx="58" ry="6" fill={light} opacity="0.55" />
                <ellipse cx="50" cy="46" rx="58" ry="9" fill={deep} opacity="0.4" />
                <ellipse cx="50" cy="64" rx="58" ry="5" fill={light} opacity="0.45" />
                <ellipse cx="50" cy="76" rx="58" ry="7" fill={deep} opacity="0.32" />
                {/* The storm. Every gas giant gets one, and it is the detail
                    that makes it a particular planet rather than a striped ball. */}
                <ellipse cx="63" cy="46" rx="10" ry="4.5" fill={light} opacity="0.9" />
                <ellipse cx="63" cy="46" rx="5" ry="2" fill="#fff" opacity="0.5" />
            </g>
        );
    }

    if (surface === "cratered") {
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
                        <circle cx={cx} cy={cy} r={r} fill={deep} opacity="0.42" />
                        {/* A bright rim on the upper left of each dish, matching
                            the page's light. Without it a crater is just a dot. */}
                        <circle cx={cx - r * 0.2} cy={cy - r * 0.2} r={r * 0.78} fill={light} opacity="0.3" />
                    </g>
                ))}
            </g>
        );
    }

    if (surface === "oceanic") {
        // Continents. Deliberately irregular hand-set paths -- anything
        // symmetric reads as a logo rather than as land.
        return (
            <g transform={`rotate(${spin} 50 50)`}>
                <path
                    d="M22 44c8-9 18-4 25-9s16-2 18 5-6 12-14 11-12 5-19 2-14-3-10-9Z"
                    fill={light}
                    opacity="0.85"
                />
                <path d="M54 68c6-5 16-3 20 3s-3 12-11 11-15-8-9-14Z" fill={light} opacity="0.7" />
                <path d="M30 76c4-4 11-2 12 3s-5 8-10 6-6-6-2-9Z" fill={light} opacity="0.55" />
                {/* Ice caps. Two small arcs, and they do more to make a world
                    look inhabitable than the continents do. */}
                <ellipse cx="50" cy="10" rx="17" ry="6" fill="#fff" opacity="0.72" />
                <ellipse cx="50" cy="90" rx="13" ry="5" fill="#fff" opacity="0.6" />
            </g>
        );
    }

    // Swirled. One spiral storm system, offset from centre so the body still
    // reads as turning rather than as a target.
    return (
        <g transform={`rotate(${spin} 50 50)`}>
            <path
                d="M58 34c14 4 20 18 14 30s-24 16-34 7"
                fill="none"
                stroke={light}
                strokeWidth="8"
                strokeLinecap="round"
                opacity="0.75"
            />
            <path
                d="M52 46c7 1 10 8 7 14s-12 7-16 2"
                fill="none"
                stroke={deep}
                strokeWidth="5"
                strokeLinecap="round"
                opacity="0.55"
            />
            <ellipse cx="34" cy="28" rx="17" ry="5" fill={light} opacity="0.5" />
        </g>
    );
}

export function Planet({ slug, state, size = 84, label }: PlanetProps) {
    const world = worldFor(slug);
    const uid = useId().replace(/:/g, "");

    const body = `b-${uid}`;
    const clip = `c-${uid}`;
    const glow = `g-${uid}`;
    const rim = `r-${uid}`;

    const palette = PALETTES[world.paletteIndex % PALETTES.length]!;
    const ahead = state === "ahead";

    // Distance dims and cools; it never drains to grey. Applied as an opacity on
    // the whole body group plus a cool overlay, rather than by desaturating the
    // palette -- a greyed-out planet reads as a disabled control.
    const bodyOpacity = ahead ? 0.5 : 1;

    return (
        <svg
            className={`planet is-${state}`}
            viewBox="-24 -24 148 148"
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

                {/* Two stops, both bright. The body is lit from the upper left
                    and deepens into colour, never into black. */}
                <radialGradient id={body} cx="34%" cy="28%" r="82%">
                    <stop offset="0%" stopColor={palette.light} />
                    <stop offset="52%" stopColor={palette.base} />
                    <stop offset="100%" stopColor={palette.deep} />
                </radialGradient>

                {/* Atmosphere: strongest just outside the limb, gone by the edge
                    of the box. A uniform halo reads as a glow filter; this reads
                    as air. */}
                <radialGradient id={glow} cx="50%" cy="50%" r="50%">
                    <stop offset="58%" stopColor={palette.light} stopOpacity="0" />
                    <stop offset="76%" stopColor={palette.light} stopOpacity={ahead ? 0.14 : 0.42} />
                    <stop offset="100%" stopColor={palette.light} stopOpacity="0" />
                </radialGradient>

                {/* The rim light: a bright crescent hugging the lit edge. This
                    one detail does more than anything else to make a flat disc
                    read as a sphere. */}
                <radialGradient id={rim} cx="50%" cy="50%" r="50%">
                    <stop offset="86%" stopColor="#fff" stopOpacity="0" />
                    <stop offset="100%" stopColor="#fff" stopOpacity="0.9" />
                </radialGradient>
            </defs>

            {/* Back half of the ring, so the planet occludes it. Drawing a whole
                ellipse on top is the giveaway that a ring is a decoration. */}
            {world.ring && (
                <g transform={`rotate(${world.tilt} 50 50)`} opacity={bodyOpacity}>
                    <path
                        d="M 4 50 A 46 14 0 0 1 96 50"
                        fill="none"
                        stroke={palette.light}
                        strokeWidth="5"
                        opacity="0.6"
                        strokeLinecap="round"
                    />
                </g>
            )}

            <circle cx="50" cy="50" r="60" fill={`url(#${glow})`} />

            <g opacity={bodyOpacity}>
                <circle cx="50" cy="50" r="42" fill={`url(#${body})`} />

                <g clipPath={`url(#${clip})`}>
                    <Features
                        surface={world.surface}
                        light={palette.light}
                        deep={palette.deep}
                        spin={world.spin}
                    />

                    {/* Night side. A soft wash of the palette's own deep tone at
                        low opacity -- enough to turn the sphere, nowhere near
                        enough to make it dark. */}
                    <circle cx="82" cy="84" r="54" fill={palette.deep} opacity="0.3" />

                    {/* City lights, on worlds you have already been to. The
                        single most charming detail in the set, and it is four
                        dots: somebody lives there now because you went. */}
                    {state === "visited" && (
                        <g opacity="0.85">
                            <circle cx="72" cy="66" r="1.6" fill="#ffe9a8" />
                            <circle cx="78" cy="72" r="1.2" fill="#ffe9a8" />
                            <circle cx="68" cy="76" r="1.4" fill="#ffd166" />
                            <circle cx="80" cy="60" r="1" fill="#ffe9a8" />
                        </g>
                    )}
                </g>

                {/* Rim light and specular, drawn last so nothing sits over them. */}
                <circle cx="50" cy="50" r="42" fill={`url(#${rim})`} opacity={ahead ? 0.3 : 0.65} />
                <ellipse
                    cx="34"
                    cy="30"
                    rx="12"
                    ry="8"
                    fill="#fff"
                    opacity={ahead ? 0.12 : 0.34}
                    transform="rotate(-24 34 30)"
                />
            </g>

            {/* Front half of the ring. */}
            {world.ring && (
                <g transform={`rotate(${world.tilt} 50 50)`} opacity={bodyOpacity}>
                    <path
                        d="M 4 50 A 46 14 0 0 0 96 50"
                        fill="none"
                        stroke={palette.light}
                        strokeWidth="6.5"
                        strokeLinecap="round"
                    />
                    <path
                        d="M 4 50 A 46 14 0 0 0 96 50"
                        fill="none"
                        stroke="#fff"
                        strokeWidth="2"
                        opacity="0.5"
                        strokeLinecap="round"
                    />
                </g>
            )}

            {Array.from({ length: world.moons }, (_, i) => (
                <g key={i} opacity={bodyOpacity}>
                    <circle
                        cx={i === 0 ? 98 : 4}
                        cy={i === 0 ? 22 : 80}
                        r={i === 0 ? 7 : 5}
                        fill={palette.light}
                    />
                    {/* One crater, so the moon is a little body rather than a dot. */}
                    <circle
                        cx={i === 0 ? 100 : 5.5}
                        cy={i === 0 ? 24 : 82}
                        r={i === 0 ? 2.4 : 1.8}
                        fill={palette.deep}
                        opacity="0.45"
                    />
                </g>
            ))}
        </svg>
    );
}
