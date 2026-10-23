import type { JourneyPathResponse } from "../api/types.js";
import { sceneLessonFor } from "./scenes.js";

/**
 * The first-time tutorial: the playable console.log lesson (scenes.ts) that a
 * brand-new learner walks before their first mission.
 *
 * WHO GETS IT. A learner with nothing demonstrated, no topic complete, not one
 * stop cleared on their current concept, and that concept has a scene lesson
 * (today only console-output). Everyone else goes straight to the concept as
 * before. Read from the server's path, so it cannot be wrong about progress.
 *
 * SEEN ONCE, ON THIS DEVICE. Finishing or skipping it is remembered in
 * localStorage -- a convenience, not progress. If storage is unavailable or
 * cleared, the worst case is being offered the tutorial again, which records
 * nothing and has a skip link. The tutorial never writes learner state: the
 * concept's evidence still comes only from its practice stops.
 */

const key = (concept: string) => `jolt.tutorial.${concept}`;

export function hasSeenTutorial(concept: string): boolean {
    try {
        return window.localStorage.getItem(key(concept)) === "seen";
    } catch {
        return false;
    }
}

export function markTutorialSeen(concept: string): void {
    try {
        window.localStorage.setItem(key(concept), "seen");
    } catch {
        // Storage unavailable: the tutorial may be offered again. Harmless.
    }
}

/** Where a brand-new learner's first "Start learning" should go, or null. */
export function tutorialHref(path: JourneyPathResponse): string | null {
    const current = path.current;
    const fresh = path.points.concepts === 0 && !path.topics.some((t) => t.state === "complete");

    if (!current || !fresh || current.rungs.cleared > 0) return null;
    if (!sceneLessonFor(current.slug) || hasSeenTutorial(current.slug)) return null;

    return `/learn/${current.slug}`;
}

/** The concept whose scene lesson is the first-time tutorial. */
export const TUTORIAL_CONCEPT = "console-output";

/**
 * Where Profile's "Replay the tutorial" goes. The same /learn page a new
 * learner walks: it records nothing, so a replay cannot add to progress or
 * take anything away, and no stored flag needs clearing to reach it. The
 * query only changes the closing words, which would otherwise call this the
 * learner's first program.
 */
export function replayTutorialHref(): string {
    return `/learn/${TUTORIAL_CONCEPT}?replay=1`;
}
