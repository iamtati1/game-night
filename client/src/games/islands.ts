import type { GameStatus } from "../components/GameCard.js";
import { CODE_BLITZ, type GameEntry } from "./catalog.js";

/**
 * The five games as island destinations on the Games page.
 *
 * NOTHING HERE DECIDES WHAT IS OPEN. Each island's availability is the game's
 * own readiness, from the same server endpoints the cards read
 * (/api/flush/readiness, /api/bug-hunt/readiness; Code Blitz, Reaction and
 * Memory are always playable). An island is drawn in mist only when its game
 * cannot deal a run yet -- and it still opens, to a page that explains why.
 *
 * The islands are the GAMES, not the journey. The guided topic journey lives
 * under Learn; nothing here implies a game is a step on it, and Reaction and
 * Memory are labelled "just for fun" because they record no learning evidence.
 */

export type IslandState = "resume" | "ready" | "misty" | "unknown";

export interface Island {
    game: GameEntry;
    state: IslandState;
    /** Whether the game counts toward the journey; null when not known (signed out). */
    counts: boolean | null;
    /** The server's readiness line, or null when not known. */
    status: string | null;
    resume: { unitsDone: number; unitsTotal: number; score: number } | null;
    /** The panel's one action, named for what it does. */
    action: string;
    /** The action's accessible name, matching the game cards it replaced. */
    actionLabel: string;
}

export function islandsFor({
    games,
    statuses,
    resumeFor
}: {
    games: readonly GameEntry[];
    statuses: Record<string, GameStatus | null> | null;
    resumeFor: (slug: string) => { unitsDone: number; unitsTotal: number; score: number } | null;
}): Island[] {
    return games.map((game) => {
        const status = statuses?.[game.slug] ?? null;
        const resume = resumeFor(game.slug);
        const state: IslandState = resume
            ? "resume"
            : status === null
              ? "unknown"
              : status.kind === "needs"
                ? "misty"
                : "ready";

        return {
            game,
            state,
            counts: status ? status.counts : null,
            status: status?.text ?? null,
            resume,
            action: state === "resume" ? "Continue your run" : state === "misty" ? "See how to open it" : `Play ${game.name}`,
            actionLabel: state === "misty" ? `${game.name}: how to open` : `Play ${game.name}`
        };
    });
}

export interface Recommendation {
    slug: string;
    why: string;
}

/**
 * The one island to point at, and why -- or null when nothing honest applies.
 *
 *     a run in progress            pick up where you left off
 *     otherwise Code Blitz         it reserves questions for the concept you
 *                                  are learning (practisingNow), so it is the
 *                                  game that practises today's lesson
 *
 * Never a misted island, and never Reaction or Memory: those count for nothing,
 * so recommending them as practice would be untrue.
 */
export function recommendedIsland(islands: readonly Island[]): Recommendation | null {
    const inProgress = islands.find((i) => i.state === "resume");
    if (inProgress) return { slug: inProgress.game.slug, why: "You have a run in progress" };

    const blitz = islands.find((i) => i.game.slug === CODE_BLITZ && i.state !== "misty");
    if (blitz) return { slug: blitz.game.slug, why: "Practises what you are learning now" };

    return null;
}
