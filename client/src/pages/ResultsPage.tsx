import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api } from "../api/client.js";
import type { SessionSummary } from "../api/types.js";

export function ResultsPage() {
    const { id } = useParams<{ id: string }>();
    const [session, setSession] = useState<SessionSummary | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        api.get<{ session: SessionSummary }>(`/api/sessions/${id}`)
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
        return <p className="muted center">Tallying up…</p>;
    }

    return (
        <section className="results">
            <p className="eyebrow">Game complete</p>
            <h1>{session.score} points</h1>

            <dl className="stat-row">
                <div>
                    <dt>XP earned</dt>
                    <dd>{session.xpEarned}</dd>
                </div>
                <div>
                    <dt>Correct</dt>
                    <dd>
                        {session.correctCount}/{session.totalQuestions}
                    </dd>
                </div>
                <div>
                    <dt>Incorrect</dt>
                    <dd>{session.incorrectCount}</dd>
                </div>
                <div>
                    <dt>Timed out</dt>
                    <dd>{session.timedOutCount}</dd>
                </div>
            </dl>

            <ol className="breakdown">
                {session.questions.map((q) => (
                    <li key={q.displayOrder} className={q.isCorrect ? "ok" : "bad"}>
                        <pre className="prompt small">{q.prompt}</pre>
                        <p className="answer-line">
                            {q.status === "timed_out" ? (
                                <span className="tag timeout">No answer</span>
                            ) : (
                                <span className={`tag ${q.isCorrect ? "correct" : "incorrect"}`}>
                                    {q.selectedOption}
                                </span>
                            )}
                            {!q.isCorrect && q.correctOption && (
                                <span className="muted"> · answer: {q.correctOption}</span>
                            )}
                            {q.responseTimeMs !== null && (
                                <span className="muted">
                                    {" "}
                                    · {(q.responseTimeMs / 1000).toFixed(1)}s
                                </span>
                            )}
                            <span className="points">+{q.pointsAwarded}</span>
                        </p>
                    </li>
                ))}
            </ol>

            <div className="cta-row">
                <Link className="button primary" to="/play">
                    Play again
                </Link>
                <Link className="button ghost" to="/">
                    Home
                </Link>
            </div>
        </section>
    );
}
