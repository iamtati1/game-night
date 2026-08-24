import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api } from "../api/client.js";
import type { FlushSessionSummary } from "../api/types.js";
import { RunVerdict } from "../components/RunVerdict.js";
import { useRunContext } from "../games/useRunContext.js";

const BEST_POSSIBLE = 5 * 200; // five perfect four-output rounds

export function FlushResultsPage() {
    const { id } = useParams<{ id: string }>();
    const [session, setSession] = useState<FlushSessionSummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { previousBest, improvement } = useRunContext("flush", id);

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
            <p className="run-eyebrow">Flush</p>
            <p className="run-score">
                <strong>{session.score}</strong>
                <span>points</span>
            </p>

            {/* The reward, where it is earned. XP was accruing invisibly: it
                appeared only in a history row and a landing total, so the moment
                it was actually won showed nothing. */}
            <p className="xp-earned">
                XP <strong>+{session.xpEarned}</strong>
            </p>

            <RunVerdict
                score={session.score}
                previousBest={previousBest}
                improvement={improvement}
            />

            {/* A target to beat is what makes a second run tempting. The count is
                left to the FLUSHED figure below rather than said twice. */}
            <p className="lede">
                {perfect
                    ? "Every round flushed — the maximum multiplier on all five."
                    : `A perfect run is worth ${BEST_POSSIBLE}.`}
            </p>

            {/* No average time and no accuracy. A Flush round ends the instant a
                placement is wrong, so a bad run finishes faster than a good one --
                reporting speed here would reward failing quickly, and an accuracy
                figure would exist only to match Code Blitz. */}
            <dl className="run-figures">
                <div>
                    <dt>Flushed</dt>
                    <dd>
                        {session.completedRounds}/{session.totalRounds}
                    </dd>
                </div>
                <div>
                    <dt>Best streak</dt>
                    <dd>{session.bestStreak}</dd>
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
                <Link className="button ghost" to="/">
                    Pick another Jolt
                </Link>
            </div>
        </section>
    );
}
