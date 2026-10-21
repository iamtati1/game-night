import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import type { JourneyPathResponse } from "../api/types.js";
import { nextAction } from "../games/progression.js";
import { ACTION, continueTo } from "../vocabulary.js";

/**
 * The end of a game: back to the course, or play again.
 *
 * UX audit: Flush, Bug Hunt, Reaction and Memory each ended in "Play again" and
 * "Pick another Jolt" and nothing else, so finishing a game left the learner no
 * route back to what they were learning. Each now hands back to the one next
 * step on their path, as the primary action, with playing again beside it.
 *
 * THE STEP IS THE PATH'S, NOT THIS COMPONENT'S. nextAction reads the server's
 * path -- the same answer the journey map and the world page give -- so a
 * results screen can never point somewhere the map disagrees with.
 *
 * IT CLAIMS NOTHING ABOUT THE GAME. It names where the course goes next and
 * stops there. Whether this run cleared anything is the server's to say, and
 * these games' results do not carry that, so no line here suggests they did.
 *
 * NO GUESS WHEN THE PATH IS MISSING. While it loads, only the replay shows, so
 * the primary never appears and then changes. If it cannot be loaded, playing
 * again becomes the primary and the screen says the next step is unavailable,
 * rather than pointing at a destination it does not know.
 *
 * @param replay renders the game's own replay control with the class it is
 *               given -- a link for most games, a button for Bug Hunt, which
 *               has to start a fresh run first.
 */
export function NextStepActions({
    replay,
    className = "cta-row"
}: {
    replay: (className: string) => ReactNode;
    className?: string;
}) {
    const [path, setPath] = useState<JourneyPathResponse | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let active = true;

        api.get<JourneyPathResponse>("/api/curriculum/path")
            .then((data) => active && setPath(data))
            .catch(() => active && setFailed(true));

        return () => {
            active = false;
        };
    }, []);

    if (failed) {
        return (
            <>
                <p className="muted" role="status">
                    Your next step in the course could not be loaded just now. It is on{" "}
                    <Link to="/journey">your journey</Link>.
                </p>
                <div className={className}>{replay("button primary")}</div>
            </>
        );
    }

    if (!path) {
        return <div className={className}>{replay("button ghost")}</div>;
    }

    const step = nextAction(path);
    const primary = step
        ? {
              to: step.href,
              label: step.kind === "checkpoint" ? `Take the ${step.name}` : continueTo(step.name)
          }
        : { to: "/journey", label: ACTION.seeJourney };

    return (
        <div className={className}>
            <Link className="button primary" to={primary.to}>
                {primary.label}
            </Link>
            {replay("button ghost")}
        </div>
    );
}
