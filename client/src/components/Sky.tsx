/**
 * The world the game floor stands in.
 *
 * Purely decorative, so it is hidden from assistive technology entirely: a
 * screen reader announcing "image" five times before reaching the games would be
 * a worse page, not a richer one.
 *
 * Every layer lives inside one fixed, clipped container. That is deliberate and
 * it is the whole safety story: a fixed element is out of flow, so nothing here
 * can add to document height, and `overflow: hidden` on the container means a
 * planet that hangs off the corner or a shooting star that flies past the edge
 * is clipped rather than scrollable. Both of those have bitten this page before
 * -- once as a tiling seam, once as 100px of phantom scroll -- and the structure
 * now makes them impossible rather than merely avoided.
 *
 * Rendered only on the landing page. The games have their own atmosphere, and a
 * starfield behind a code snippet would be competing with the thing being read.
 */
export function Sky() {
    return (
        <div className="sky" aria-hidden="true">
            {/* Two star layers at different sizes and brightnesses. The
                difference between them is what reads as distance -- a single
                layer of identical dots reads as a texture. */}
            <span className="sky-stars sky-stars-far" />
            <span className="sky-stars sky-stars-near" />

            {/* One body, low in the frame and mostly out of it. Cropped on
                purpose: a whole circle reads as a graphic, an arc reads as
                something large that is far away. */}
            <span className="sky-planet" />

            {/* Two, on long and deliberately unequal periods so they never fall
                into a rhythm you can predict. */}
            <span className="sky-shot sky-shot-a" />
            <span className="sky-shot sky-shot-b" />
        </div>
    );
}
