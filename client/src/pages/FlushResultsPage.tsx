import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api } from "../api/client.js";
import type { FlushSessionSummary } from "../api/types.js";

const BEST_POSSIBLE = 5 * 200; // five perfect four-output rounds

export function FlushResultsPage() {
    const { id } = useParams<{ id: string }>();
    const [session, setSession] = useState<FlushSessionSummary | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        api.get<{ session: FlushSessionSummary }>(`/api/flush/sessions/${id}`)
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
                <Link className="button primary" to="/">
                    Back home
                </Link>
            </section>
        );
    }

    if (!session) {
        return <p className="muted center">Draining the queue…</p>;
    }

    const perfect = session.completedRounds === session.totalRounds;

    return (
        <section className="results flush">
            <p className="eyebrow">Flush complete</p>
            <h1>{session.score} points</h1>

            {/* A target to beat is what makes a second run tempting. */}
            <p className="lede">
                {perfect
                    ? "Every round flushed. That is the maximum multiplier on all five."
                    : `${session.completedRounds} of ${session.totalRounds} rounds flushed. A perfect run is worth up to ${BEST_POSSIBLE}.`}
            </p>

            <dl className="stat-row">
                <div>
                    <dt>XP earned</dt>
                    <dd>{session.xpEarned}</dd>
                </div>
                <div>
                    <dt>Flushed</dt>
                    <dd>
                        {session.completedRounds}/{session.totalRounds}
                    </dd>
                </div>
                <div>
                    <dt>Broke</dt>
                    <dd>{session.failedRounds}</dd>
                </div>
                <div>
                    <dt>Timed out</dt>
                    <dd>{session.timedOutRounds}</dd>
                </div>
            </dl>

            <ol className="breakdown">
                {session.rounds.map((round) => (
                    <li key={round.roundNumber} className={round.status === "completed" ? "ok" : "bad"}>
                        <pre className="prompt small">{round.prompt}</pre>
                        <p className="answer-line">
                            {round.status === "completed" && (
                                <span className="tag correct">
                                    Flushed {round.correctPlacements}/{round.totalOutputs}
                                </span>
                            )}
                            {round.status === "failed" && (
                                <span className="tag incorrect">
                                    Broke at {round.correctPlacements + 1} of {round.totalOutputs}
                                </span>
                            )}
                            {round.status === "timed_out" && <span className="tag timeout">Out of time</span>}
                            {round.status === "pending" && <span className="tag timeout">Not reached</span>}
                            <span className="points">+{round.pointsAwarded}</span>
                        </p>
                    </li>
                ))}
            </ol>

            <div className="cta-row">
                <Link className="button primary" to="/flush">
                    Play again
                </Link>
                <Link className="button ghost" to="/history">
                    History
                </Link>
            </div>
        </section>
    );
}
