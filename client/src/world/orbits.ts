/**
 * Where a topic's concepts sit around its world.
 *
 * DERIVED, NEVER HAND-PLACED. A topic has between five and eight concepts today
 * and the curriculum is still moving; if a position had to be authored per
 * concept, adding one would become a design task and the world would rot behind
 * the curriculum. Everything here is a function of the concept's index, so a
 * concept added tomorrow already has somewhere to be.
 *
 * DISTANCE CARRIES THE MEANING.
 *
 * The design principle this whole view rests on is that a place you have not
 * reached is FAR AWAY, not forbidden. So an unreached concept genuinely orbits
 * further out and is drawn smaller -- it reads as something in the distance
 * worth travelling to, rather than a greyed-out button that refuses you.
 * Reaching it brings it closer.
 *
 * That movement is the point. Finishing a concept does not tick a box: the
 * object draws nearer, lights, and the space around the planet is visibly
 * different than it was ten minutes ago.
 */

/** How far out a concept sits, by what the learner has done with it. */
const RADIUS: Record<ConceptState, number> = {
    // Close in, lit, part of the furniture now.
    demonstrated: 1,
    // Near enough to reach for.
    current: 1.22,
    // Out there. Still clearly something, just not yet.
    locked: 1.62
};

/** Apparent size, which is mostly distance doing the work. */
const SCALE: Record<ConceptState, number> = {
    demonstrated: 1,
    current: 1.12,
    locked: 0.78
};

export type ConceptState = "demonstrated" | "current" | "locked";

export interface Orbit {
    /** Percentage of the field's width, from the left. */
    x: number;
    /** Percentage of the field's height, from the top. */
    y: number;
    /** Multiplier on the object's base size. */
    scale: number;
    /** 0 furthest, 1 nearest. Decides paint order and haze. */
    depth: number;
}

/**
 * The angle a concept sits at.
 *
 * Spread around the circle by index, but NOT evenly: an even spread reads as a
 * clock face, and a clock face reads as a progress meter. The golden angle
 * gives a distribution that never clumps and never looks counted.
 *
 * Rotated so nothing lands at the bottom of the field, which is where the craft
 * sits.
 */
function angleFor(index: number): number {
    const GOLDEN = 2.399963;

    return -Math.PI / 2 + index * GOLDEN;
}

/**
 * Where one concept sits, given what the learner has done with it.
 *
 * The field is an ellipse rather than a circle -- the view is wider than it is
 * tall, and a true circle would push the top and bottom objects off-screen
 * while leaving the sides empty.
 */
export function orbitFor(index: number, state: ConceptState): Orbit {
    const angle = angleFor(index);
    const radius = RADIUS[state];

    // Half-extents, in percent of the field. The planet is 30% of the field's
    // width, so its radius is 15%: the innermost orbit at 34% clears it with
    // room for the object and its label. Narrower vertically so the ellipse
    // fits a landscape field without clipping.
    const spreadX = 34;
    const spreadY = 27;

    return {
        x: 50 + Math.cos(angle) * spreadX * radius,
        y: 50 + Math.sin(angle) * spreadY * radius,
        scale: SCALE[state],
        // Objects low in the frame read as nearer, which is how a horizon works.
        depth: (Math.sin(angle) * radius + 1.62) / 3.24
    };
}

/**
 * How much of the topic is behind the learner, 0 to 1.
 *
 * Drives the atmosphere rather than any text: the world brightens as the topic
 * fills in. Deliberately not shown as a number anywhere -- "7 of 7" is a
 * progress bar wearing a costume.
 */
export function topicWarmth(states: readonly ConceptState[]): number {
    if (states.length === 0) return 0;

    return states.filter((s) => s === "demonstrated").length / states.length;
}
