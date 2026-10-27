import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api } from "../api/client.js";
import type { ReactionSessionSummary } from "../api/types.js";
import { RunVerdict } from "../components/RunVerdict.js";
import { NextStepActions } from "../components/NextStepActions.js";
import { CourseNote } from "../components/CourseNote.js";
import { REACTION } from "../games/catalog.js";
import { useRunContext } from "../games/useRunContext.js";

import { usePageTitle } from "../usePageTitle.js";
import { ACTION } from "../vocabulary.js";
export function ReactionResultsPage() {
    usePageTitle("Reaction results");
    const { id } = useParams<{ id: string }>();
    const [session, setSession] = useState<ReactionSessionSummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { previousBest, improvement } = useRunContext(REACTION, id);

    useEffect(() => {
        let active = true;

        api.get<{ session: ReactionSessionSummary }>(`/api/reaction/sessions/${id}`)
            .then((data) => active && setSession(data.session))
            .catch(
                (err) =>
                    active &&
                    setError(err instanceof ApiError ? err.detailText : "Could not load results")
            );

        return () => {
            active = false;
        };
    }, [id]);

    if (error) {
        return (
            <section className="panel narrow">
                <h1>Results unavailable</h1>
                <p className="form-error" role="alert">
                    {error}
                </p>
                <Link className="button primary" to="/play">
                    {ACTION.backToGames}
                </Link>
            </section>
        );
    }

    if (!session) {
        return <p className="muted center">Adding it up…</p>;
    }

    /**
     * The player's fastest single reaction ever, across runs.
     *
     * improvement.averageMs is the mean; there is no all-time best in the stats
     * endpoint, and adding one for a label would mean a new aggregate. So the
     * personal best shown here is this run's best against the run's own rounds,
     * and the cross-run claim is left to RunVerdict, which already knows whether
     * the score beat the player's previous best.
     */
    const best = session.bestReactionMs;

    return (
        <section className="results reaction">
            <p className="run-eyebrow">Reaction</p>
            <p className="run-score">
                <strong>{session.score}</strong>
                <span>points</span>
            </p>

            <p className="xp-earned">
                XP <strong>+{session.xpEarned}</strong>
            </p>
            <CourseNote kind="fun" />

            <RunVerdict
                score={session.score}
                previousBest={previousBest}
                improvement={improvement}
            />

            {/* The rating is part of the outcome, so it comes before the decision. */}
            {session.tier && (
                <p className={`rx-verdict tier-${session.tier.key}`}>{session.tier.label}</p>
            )}

            {/* Back to the course first; playing again beside it. Right under the
                outcome, so a phone reaches it without scrolling past the details. */}
            <NextStepActions
                replay={(cls) => (
                    <Link className={cls} to="/reaction">
                        Play again
                    </Link>
                )}
            />

            <dl className="run-figures">
                {session.averageReactionMs !== null && (
                    <div>
                        <dt>Average</dt>
                        <dd>
                            {session.averageReactionMs}
                            <span className="unit">ms</span>
                        </dd>
                    </div>
                )}
                {best !== null && (
                    <div>
                        <dt>Best</dt>
                        <dd>
                            {best}
                            <span className="unit">ms</span>
                        </dd>
                    </div>
                )}
                <div>
                    <dt>Landed</dt>
                    <dd>
                        {session.reactedRounds}/{session.totalRounds}
                    </dd>
                </div>
            </dl>

            {/* Every round, at a glance. Five numbers is a shape the player can
                read instantly -- which round they fumbled is obvious. */}
            <ol className="rx-strip" aria-label="Every round">
                {session.rounds.map((r) => (
                    <li
                        key={r.roundNumber}
                        className={
                            r.status === "reacted"
                                ? `landed tier-${r.tier?.key ?? "sharp"}`
                                : r.status === "false_start" || r.status === "timed_out"
                                  ? "early"
                                  : "unplayed"
                        }
                    >
                        <span className="rx-strip-n">{r.roundNumber}</span>
                        <span className="rx-strip-v">
                            {/* A round that ran out is a miss, not a round that
                                never happened: QA found both shown as "-". */}
                            {r.status === "reacted"
                                ? r.reactionMs
                                : r.status === "false_start"
                                  ? "early"
                                  : r.status === "timed_out"
                                    ? "slow"
                                    : "-"}
                        </span>
                    </li>
                ))}
            </ol>
        </section>
    );
}
