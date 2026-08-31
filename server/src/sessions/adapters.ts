import type { PoolClient } from "pg";
import { BUG_HUNT, CODE_BLITZ, FLUSH, MEMORY, REACTION } from "../games/constants.js";
import * as bugHunt from "../bugHunt/queries.js";
import * as codeBlitz from "../game/queries.js";
import * as flush from "../flush/queries.js";
import * as memory from "../memory/queries.js";
import * as reaction from "../reaction/queries.js";

/**
 * The parts of the pause/resume lifecycle that cannot be game-agnostic.
 *
 * Everything else about pausing lives on game_sessions and is shared, but two
 * things are irreducibly per-game: where the live unit's clock is stored, and how
 * a partial score is derived from it. Code Blitz keeps both in session_questions,
 * Flush in flush_rounds -- the deliberate consequence of per-game round tables
 * rather than one polymorphic table with a JSONB payload.
 */
export interface GameSessionAdapter {
    /** Moves the live unit's served_at forward by the paused interval. Must run
     *  on the caller's client, inside the resume transaction, while paused_at is
     *  still set. */
    shiftClock(client: PoolClient, sessionId: string): Promise<void>;

    /** Points banked so far, recomputed from stored units. */
    scoreSoFar(sessionId: string): Promise<number>;
}

/**
 * Registry rather than a switch inside resumeSession.
 *
 * A missing branch in a switch fails silently in the worst possible way: the new
 * game's clock is never shifted, so every resumed session times out the moment
 * the player returns, and nothing errors. A registry keyed by slug turns that
 * into something a test can assert is complete -- see adapters.test.ts, which
 * checks this object against the slug constants.
 */
export const GAME_ADAPTERS: Record<string, GameSessionAdapter> = {
    [CODE_BLITZ]: {
        shiftClock: codeBlitz.shiftQuestionClock,
        scoreSoFar: codeBlitz.scoreSoFar
    },
    [FLUSH]: {
        shiftClock: flush.shiftRoundClock,
        scoreSoFar: flush.scoreSoFar
    },
    [REACTION]: {
        // A deliberate no-op: Reaction holds no countdown to shift. See the note
        // on shiftClock in reaction/queries.ts.
        shiftClock: reaction.shiftClock,
        scoreSoFar: reaction.scoreSoFar
    },
    [MEMORY]: {
        // Also a no-op: a paused Memory run is always paused between rounds, never
        // mid-flash, so no display timer survives the pause.
        shiftClock: memory.shiftClock,
        scoreSoFar: memory.scoreSoFar
    },
    [BUG_HUNT]: {
        // A real one, unlike the two above. Bug Hunt holds a genuine per-incident
        // countdown, so a resumed run whose clock was never shifted would time out
        // the moment the player came back -- silently, with nothing to error on.
        shiftClock: bugHunt.shiftClock,
        scoreSoFar: bugHunt.scoreSoFar
    }
};

export function adapterFor(gameSlug: string): GameSessionAdapter | null {
    return GAME_ADAPTERS[gameSlug] ?? null;
}
