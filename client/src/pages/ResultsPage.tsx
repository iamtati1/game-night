import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { splitPrompt } from "../games/prompt.js";
import { ApiError, api } from "../api/client.js";
import type { SessionSummary } from "../api/types.js";
import { RunVerdict } from "../components/RunVerdict.js";
import { useRunContext } from "../games/useRunContext.js";

export function ResultsPage() {
    const { id } = useParams<{ id: string }>();
    const [session, setSession] = useState<SessionSummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { previousBest, improvement } = useRunContext("code-blitz", id);

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

    // A timed-out question is a miss too: no answer given is not the same as
    // right, and it is exactly the kind of thing worth reviewing.
    const misses = session.questions.filter((q) => q.isCorrect !== true);
    const correctCount = session.questions.length - misses.length;

    return (
        <section className="results">
            {/* The score is the headline, at brand scale. This screen is the "see"
                step of the loop, and the number is the only thing the player came
                back for. */}
            <p className="run-eyebrow">Code Blitz</p>
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

            {/* Three figures, not seven. Correct-of-total, how fast, how many in a
                row -- the things a player can actually try to move next run.
                Incorrect and timed-out were the same fact stated twice more. */}
            <dl className="run-figures">
                <div>
                    <dt>Correct</dt>
                    <dd>
                        {session.correctCount}/{session.totalQuestions}
                    </dd>
                </div>
                {session.averageResponseMs !== null &&
                    session.averageResponseMs !== undefined && (
                        <div>
                            <dt>Average</dt>
                            <dd>{(session.averageResponseMs / 1000).toFixed(1)}s</dd>
                        </div>
                    )}
                <div>
                    <dt>Best streak</dt>
                    <dd>{session.bestStreak}</dd>
                </div>
            </dl>

            {/* Only what went wrong. Ten full questions buried the score under a
                transcript of things the player already knows they got right; the
                reason to look down here is to find out what beat you. */}
            {misses.length === 0 ? (
                <p className="clean-sweep">Every answer correct.</p>
            ) : (
                <p className="review-head">
                    {misses.length === 1 ? "The one you missed" : `The ${misses.length} you missed`}
                    {correctCount > 0 && (
                        <span className="muted">
                            {" "}
                            · {correctCount} correct not shown
                        </span>
                    )}
                </p>
            )}

            <ol className="breakdown">
                {misses.map((q) => (
                    <li key={q.displayOrder} className="bad">
                        {/* The number, because this is a subset now: without it the
                            player cannot tell which question they are looking at. */}
                        <p className="review-n">Q{q.displayOrder}</p>
                        {/* Same split as the game screen. Without it the review
                            screen rendered "What does this log?" in monospace, so
                            prose looked like code in exactly the place a player
                            goes to understand what they got wrong.
                            
                            Deliberately not applied to Flush: its snippets are all
                            code and use blank lines between statements, so the same
                            rule would promote the first line to prose. */}
                        <p className="review-ask">{splitPrompt(q.prompt).question}</p>
                        {splitPrompt(q.prompt).code && (
                            <pre className="prompt small">{splitPrompt(q.prompt).code}</pre>
                        )}
                        <p className="answer-line">
                            {q.status === "timed_out" ? (
                                <span className="tag timeout">No answer</span>
                            ) : (
                                <span className="tag incorrect">{q.selectedOption}</span>
                            )}
                            {q.correctOption && (
                                <span className="muted"> · answer: {q.correctOption}</span>
                            )}
                            {q.responseTimeMs !== null && (
                                <span className="muted">
                                    {" "}
                                    · {(q.responseTimeMs / 1000).toFixed(1)}s
                                </span>
                            )}
                        </p>
                    </li>
                ))}
            </ol>

            {/* Two ways to keep going: the same game again, or a different one.
                A single "home" link ends the session; this continues it. */}
            <div className="cta-row">
                <Link className="button primary" to="/play">
                    Play again
                </Link>
                <Link className="button ghost" to="/">
                    Pick another Jolt
                </Link>
            </div>
        </section>
    );
}
