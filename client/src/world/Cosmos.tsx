/**
 * The place everything else happens in.
 *
 * Mounted once, in App, outside the router -- so it does not remount between
 * routes. That is what makes Jolt feel like one continuous world: navigating
 * from Home to the Journey to a lesson moves the content while the nebulae keep
 * drifting at exactly the phase they were at. Remounting the atmosphere on every
 * route would restart every animation and turn travel into a page load.
 *
 * SAFETY, which is structural rather than careful. Everything lives inside one
 * `position: fixed` clipped container: fixed is out of flow, so nothing here can
 * add a pixel of document height, and the clip means a nebula hanging off a
 * corner or a comet flying past the edge cannot produce phantom scroll. Both of
 * those have bitten this page before.
 *
 * Four depths, because parallax needs more than two to read as volume:
 *   nebulae  furthest, enormous, barely moving
 *   far      dense fine stars
 *   mid      fewer, brighter, tinted with the palette
 *   near     a handful of large ones, plus the drifting dust
 *
 * Every animation here is transform and opacity only -- both composited, so the
 * whole sky costs no layout and no paint while it runs. All of it stops under
 * `prefers-reduced-motion`; see world.css.
 */
import { Asteroid, Constellation } from "./Objects.js";

/* Two star patterns, hand-set. Real constellations are arbitrary shapes someone
   decided to see, which is a reasonable thing for a learning product to have on
   its walls -- and they give the eye something to find in the corners. */
const PLOUGH: ReadonlyArray<[number, number]> = [
    [0.05, 0.62], [0.24, 0.72], [0.44, 0.66], [0.6, 0.78], [0.72, 0.5], [0.88, 0.36], [0.98, 0.1]
];

const KITE: ReadonlyArray<[number, number]> = [
    [0.5, 0.04], [0.12, 0.4], [0.5, 0.96], [0.9, 0.44], [0.5, 0.04]
];

export function Cosmos() {
    return (
        <div className="cosmos" aria-hidden="true">
            {/* Colour first. These are what make the space bright: three huge,
                heavily blurred clouds in the Jolt palette, drifting on long
                unequal periods so they never return to the same arrangement. */}
            <span className="cosmos-nebula cosmos-nebula-violet" />
            <span className="cosmos-nebula cosmos-nebula-teal" />
            <span className="cosmos-nebula cosmos-nebula-magenta" />

            {/* A soft band across the middle distance -- the galactic plane.
                It gives the sky an orientation, which is most of the difference
                between a starfield and a sky. */}
            <span className="cosmos-band" />

            <span className="cosmos-stars cosmos-stars-far" />
            <span className="cosmos-stars cosmos-stars-mid" />
            <span className="cosmos-stars cosmos-stars-near" />

            {/* Dust. Six motes on long, offset drifts. They are the only thing
                here that moves fast enough to notice directly, and at this
                opacity they read as depth rather than as particles. */}
            <span className="cosmos-dust">
                {Array.from({ length: 6 }, (_, i) => (
                    <i key={i} className={`cosmos-mote cosmos-mote-${i + 1}`} />
                ))}
            </span>

            {/* Two comets on 37s and 61s -- coprime, so they never fall into a
                rhythm together. Each is lit for about a second of its cycle, so
                catching one feels like catching one. */}
            <span className="cosmos-comet cosmos-comet-a" />
            <span className="cosmos-comet cosmos-comet-b" />

            {/* Objects, not just points of light. Two constellations parked in
                opposite corners and two rocks tumbling through: the difference
                between a starfield and somewhere with things in it. */}
            <Constellation points={PLOUGH} className="cosmos-con-a" width={150} height={70} />
            <Constellation points={KITE} className="cosmos-con-b" width={90} height={100} />
            <Asteroid className="cosmos-rock-a" size={26} />
            <Asteroid className="cosmos-rock-b" size={18} />
        </div>
    );
}
