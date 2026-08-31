import type { ReactElement } from "react";

/**
 * One Memory symbol.
 *
 * Drawn as SVG rather than set as a character: a glyph would render differently
 * depending on the player's fonts, and "the triangle" has to look the same for
 * everyone. Every shape has a distinct silhouette, so the set is readable
 * without relying on colour -- colour is a second channel, never the only one.
 */
const PATHS: Record<string, ReactElement> = {
    circle: <circle cx="24" cy="24" r="16" />,
    square: <rect x="9" y="9" width="30" height="30" rx="3" />,
    triangle: <path d="M24 7 42 40H6Z" />,
    diamond: <path d="M24 5 43 24 24 43 5 24Z" />,
    star: <path d="M24 4 29.6 18.3 45 19.2 33.1 29.1 36.9 44 24 35.6 11.1 44l3.8-14.9L3 19.2l15.4-.9Z" />,
    hexagon: <path d="M24 4 40.6 14v20L24 44 7.4 34V14Z" />,
    cross: <path d="M18 5h12v13h13v12H30v13H18V30H5V18h13Z" />,
    moon: <path d="M31 5a19 19 0 1 0 0 38 22 22 0 0 1 0-38Z" />,
    bolt: <path d="M28 3 10 27h10l-3 18 20-25H26Z" />,
    ring: <path d="M24 6a18 18 0 1 1 0 36 18 18 0 0 1 0-36Zm0 10a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z" />
};

/** A hue per symbol, as reinforcement on top of the shape. */
const HUES: Record<string, string> = {
    circle: "#22d3ee",
    square: "#a78bfa",
    triangle: "#f472b6",
    diamond: "#34d399",
    star: "#fbbf24",
    hexagon: "#60a5fa",
    cross: "#fb923c",
    moon: "#c4b5fd",
    bolt: "#facc15",
    ring: "#4ade80"
};

interface SymbolGlyphProps {
    name: string;
    /** Screen readers get the name; sighted players get the shape. */
    labelled?: boolean;
}

export function SymbolGlyph({ name, labelled = false }: SymbolGlyphProps) {
    const path = PATHS[name];

    return (
        <svg
            className="glyph"
            viewBox="0 0 48 48"
            style={{ ["--glyph" as string]: HUES[name] ?? "var(--text)" }}
            role={labelled ? "img" : undefined}
            aria-label={labelled ? name : undefined}
            aria-hidden={labelled ? undefined : true}
            focusable="false"
        >
            {path ?? <circle cx="24" cy="24" r="4" />}
        </svg>
    );
}

export { HUES as SYMBOL_HUES };
