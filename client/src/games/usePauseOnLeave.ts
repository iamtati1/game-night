import { useEffect, useRef } from "react";
import { api } from "../api/client.js";

/**
 * Pauses this game's run when the learner leaves its page mid-run.
 *
 * Leaving through the nav used to leave the run live on the server with its
 * clock still going: the round expired while the learner was on Home, and
 * Reaction and Memory, which only resume a *paused* run, dealt a new one. A
 * pause is the same thing the Pause button does -- the clock stops, the run
 * waits, and the game's page offers Resume on return.
 *
 * `live` is the page's own judgement of "a round is in play": a run started
 * and not finished, not already paused. The server answers 200 with
 * `paused: false` when there is nothing to pause, so a stray call is harmless;
 * `live` exists to avoid the call, not to make it safe.
 *
 * In-app navigation only. A closed tab or a reload does not run React's
 * cleanup, and is unchanged (see docs/KNOWN_LIMITATIONS.md).
 */
export function usePauseOnLeave(slug: string, live: boolean): void {
    const liveRef = useRef(live);

    useEffect(() => {
        liveRef.current = live;
    }, [live]);

    useEffect(
        () => () => {
            if (liveRef.current) {
                void api.post(`/api/me/sessions/${slug}/pause`).catch(() => undefined);
            }
        },
        [slug]
    );
}
