import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import type { GameImprovement, HistoryResponse, UserStatsResponse } from "../api/types.js";

export interface RunContext {
    /** Best score across this player's OTHER completed runs of this game. Null
     *  when this was their first, so nothing can be claimed against it. */
    previousBest: number | null;
    improvement: GameImprovement | null;
}

/**
 * What a finished run needs in order to say anything about itself.
 *
 * previousBest deliberately excludes the run being viewed. The stats endpoint's
 * bestScore already includes it -- it is a completed session -- so comparing
 * against that would call every run a tie with itself and never a new best.
 * History is read instead and this session filtered out, which is the only way
 * to answer "did I beat what I had?" truthfully.
 */
export function useRunContext(gameSlug: string, sessionId: string | undefined): RunContext {
    const [context, setContext] = useState<RunContext>({ previousBest: null, improvement: null });

    useEffect(() => {
        if (!sessionId) return;

        let active = true;

        void Promise.all([
            api.get<HistoryResponse>("/api/users/me/sessions?limit=50&offset=0"),
            api.get<UserStatsResponse>("/api/users/me/stats")
        ])
            .then(([history, stats]) => {
                if (!active) return;

                const earlier = history.sessions.filter(
                    (s) =>
                        s.game.slug === gameSlug &&
                        s.status === "completed" &&
                        s.id !== sessionId
                );

                setContext({
                    previousBest: earlier.length
                        ? Math.max(...earlier.map((s) => s.score))
                        : null,
                    improvement:
                        stats.perGame.find((g) => g.game.slug === gameSlug)?.improvement ?? null
                });
            })
            // A result screen must still render its score if this fails; the
            // verdict simply has nothing to say.
            .catch(() => undefined);

        return () => {
            active = false;
        };
    }, [gameSlug, sessionId]);

    return context;
}
