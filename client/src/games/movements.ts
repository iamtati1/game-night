import { MISSIONS, type Mission, type Movement } from "./missions.js";
import { PRACTICES } from "./practice.js";

/**
 * Finding the written exercise for one (concept, rung).
 *
 * THE JOIN BETWEEN THE TWO CONTENT SYSTEMS. A Movement has always declared the
 * concept and demand it is evidence for; migration 030 lets a challenge record
 * that a movement realises it. Neither side stores an id for the other -- the
 * pair is the address, and it already existed on both sides.
 *
 * WHY THIS IS ITS OWN MODULE. `practice.ts` imports `Movement` from
 * `missions.ts`, so the lookup cannot live in `missions.ts` without a cycle.
 * It is a lookup over two existing lists, not a third content system: nothing is
 * authored here and nothing is copied here.
 *
 * MISSIONS AND PRACTICES ARE THE SAME THING TO A RUNG. Both are lists of
 * Movements -- same type, same `check` signature, same littleJs -- differing
 * only in what they were written for: a mission closes a topic, a practice
 * drills one concept. Practices cover `declaration/produce` and
 * `assignment/produce`, which no mission does, so searching only missions would
 * leave two rungs empty with the exercise already written.
 */

/** A practice, in the framing MissionScene renders. */
function asMission(title: string, movements: readonly Movement[]): Mission {
    return {
        topic: "variables",
        title,
        place: "Practice bay",
        capability: title,
        movements
    };
}

/**
 * The single movement that is evidence for one (concept, rung), or null.
 *
 * Wrapped as a Mission so MissionScene renders it unchanged: one movement is a
 * whole mission from the scene's point of view, which is what makes a
 * topic-closing demonstration usable as one rung of one concept.
 *
 * Missions are searched first. Where both define the same pair the mission wins,
 * because it is the one written to be the topic's demonstration.
 */
export function movementMissionFor(concept: string, demand: string): Mission | null {
    const candidates: Mission[] = [
        ...MISSIONS,
        ...PRACTICES.map((p) => asMission(p.title, p.movements))
    ];

    for (const mission of candidates) {
        const movement = mission.movements.find(
            (m) => m.concept === concept && m.demand === demand
        );

        if (movement) {
            return { ...mission, movements: [movement] };
        }
    }

    return null;
}
