/**
 * The atlas: art direction as data.
 *
 * Every topic in the curriculum is a world, and this file is the only place
 * that decides what a world looks like. Nothing here knows about React or CSS
 * -- it turns a curriculum slug into a stable visual identity, so the same
 * topic is the same planet on Home, on the Journey map, and in a lesson header.
 *
 * WHY DERIVED RATHER THAN AUTHORED. There are 16 topics today and the
 * curriculum is still moving. Hand-drawing 16 planets would mean a topic added
 * next week has no art, and the honest fallback for "no art" is a grey circle
 * -- which is exactly the placeholder look this redesign exists to kill. So a
 * planet's hue, tilt, ring, moons and surface are all read off a hash of its
 * slug: deterministic, so it never flickers between renders, and total, so a
 * topic invented tomorrow is already a real planet the moment it exists.
 *
 * The hues are NOT random across the whole wheel. They are drawn from a curated
 * sequence that walks the Jolt palette -- teal, violet, magenta, gold, coral --
 * so any two planets that end up side by side belong to the same universe.
 * Random hue selection is what makes generated art look generated.
 */

/** FNV-1a. Small, stable, and dependency-free -- the only properties that matter here. */
function hash(slug: string): number {
    let h = 0x811c9dc5;

    for (let i = 0; i < slug.length; i += 1) {
        h ^= slug.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }

    return h >>> 0;
}

/**
 * How many authored palettes Planet.tsx offers. Kept here so the atlas can pick
 * one without importing the component (which would make the art direction and
 * the geometry circularly dependent).
 */
const PALETTE_COUNT = 8;

/** What a planet's surface is made of. Purely a drawing instruction. */
export type Surface = "banded" | "cratered" | "oceanic" | "swirled";

const SURFACES: readonly Surface[] = ["banded", "cratered", "oceanic", "swirled"];

/** A structure that marks a destination as somewhere people go. */
export type Landmark = "station" | "beacon" | "arch" | "none";

const LANDMARKS: readonly Landmark[] = ["station", "beacon", "arch", "none", "beacon", "none"];

export interface World {
    /** Index into the authored palette list in Planet.tsx. */
    readonly paletteIndex: number;
    /** What is built at this destination, if anything. */
    readonly landmark: Landmark;
    /** How the surface is drawn. */
    readonly surface: Surface;
    /** Whether the body carries a ring system. */
    readonly ring: boolean;
    /** Ring tilt in degrees, meaningful only when `ring`. */
    readonly tilt: number;
    /** 0, 1 or 2 moons. */
    readonly moons: number;
    /** Rotation of the surface features, so no two planets present the same face. */
    readonly spin: number;
    /** Stable 0..1 value free for any caller that needs one more dimension. */
    readonly seed: number;
}

/**
 * The visual identity of one topic. Total function: every string is a world.
 */
export function worldFor(slug: string): World {
    const h = hash(slug);

    // Each property reads a different slice of the hash. Reusing one slice for
    // two properties correlates them -- every ringed planet would also be gold.
    return {
        paletteIndex: h % PALETTE_COUNT,
        landmark: LANDMARKS[(h >>> 23) % LANDMARKS.length]!,
        surface: SURFACES[(h >>> 3) % SURFACES.length]!,
        // Roughly a third of bodies. Rings are the loudest feature here, so they
        // have to stay rare enough to still read as special on a map of sixteen.
        ring: (h >>> 7) % 3 === 0,
        tilt: -32 + ((h >>> 11) % 44),
        moons: (h >>> 13) % 5 === 0 ? 2 : (h >>> 13) % 2,
        spin: (h >>> 17) % 360,
        seed: ((h >>> 19) % 1000) / 1000
    };
}

/**
 * Where a world sits on the map.
 *
 * The journey is a single travelled route, so the map is one continuous path
 * rather than a scatter of destinations. Worlds alternate either side of a
 * centre line on a sine, which gives the path something to bend around -- a
 * straight line of evenly spaced dots reads as a progress bar, and the whole
 * point of a map is that it is a place rather than a measurement.
 *
 * Returned in a 0..100 viewBox space on x so the map scales with its container,
 * and in absolute pixels on y so every leg of the trip is the same length no
 * matter how wide the window is.
 */
export const LEG = 232;

export function stationAt(index: number): { x: number; y: number } {
    // Sides alternate EXPLICITLY rather than falling out of a sine. A sine with
    // a fixed step lands two consecutive worlds on nearly the same x wherever it
    // crosses a peak, and two worlds at the same x one leg apart collide -- the
    // first version of this map had Variables and Operators overlapping for
    // exactly that reason. Alternating by parity makes a collision impossible.
    const side = index % 2 === 0 ? -1 : 1;

    // Amplitude varies so the route is not a zigzag of identical Vs. The modulo
    // is a cheap way to get a repeating-but-uneven sequence in 18..29.
    const amplitude = 18 + ((index * 5) % 12);

    // Eased in over the first two stops: starting world one hard against a
    // margin makes the route look like it began off-screen.
    const ramp = Math.min(1, index / 2);

    return {
        x: 50 + side * amplitude * ramp,
        y: 96 + index * LEG
    };
}

/**
 * A smooth route through the stations.
 *
 * Cubic segments with vertical control handles: the tangent at every station is
 * straight up and down, so the curve arrives and leaves each world the same way
 * and the joins are invisible. Quadratics were tried first and kink visibly at
 * each stop.
 */
export function routeSegment(from: number, to: number): string {
    if (to <= from) return "";

    const start = stationAt(from);
    let d = `M ${start.x} ${start.y}`;

    for (let i = from + 1; i <= to; i += 1) {
        const a = stationAt(i - 1);
        const b = stationAt(i);
        const bend = (b.y - a.y) * 0.5;

        d += ` C ${a.x} ${a.y + bend}, ${b.x} ${b.y - bend}, ${b.x} ${b.y}`;
    }

    return d;
}

/** The whole route, start to finish. */
export function routePath(count: number): string {
    if (count === 0) return "";

    const first = stationAt(0);
    let d = `M ${first.x} ${first.y}`;

    for (let i = 1; i < count; i += 1) {
        const from = stationAt(i - 1);
        const to = stationAt(i);
        const bend = (to.y - from.y) * 0.5;

        d += ` C ${from.x} ${from.y + bend}, ${to.x} ${to.y - bend}, ${to.x} ${to.y}`;
    }

    return d;
}
