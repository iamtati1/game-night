import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api } from "../api/client.js";
import type { MemorySessionSummary } from "../api/types.js";
import { RunVerdict } from "../components/RunVerdict.js";
import { SymbolGlyph } from "../components/SymbolGlyph.js";
import { MEMORY } from "../games/catalog.js";
import { useRunContext } from "../games/useRunContext.js";

export function MemoryResultsPage() {
    const { id } = useParams<{ id: string }>();
    const [session, setSession] = useState<MemorySessionSummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { previousBest, improvement } = useRunContext(MEMORY, id);

    useEffect(() => {
        let active = true;

        api.get<{ session: MemorySessionSummary }>(`/api/memory/sessions/${id}`)
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
                    Back to Jolt
                </Link>
            </section>
        );
    }

    if (!session) {
        return <p className="muted center">Recalling…</p>;
    }

    const accuracy =
        session.recallAccuracy === null ? null : Math.round(session.recallAccuracy * 100);
    const missed = session.rounds.filter((r) => r.status === "answered" && !r.perfect);

    return (
        <section className="results memory">
            <p className="run-eyebrow">Memory</p>
            <p className="run-score">
                <strong>{session.score}</strong>
                <span>points</span>
            </p>

            <p className="xp-earned">
                XP <strong>+{session.xpEarned}</strong>
            </p>

            <RunVerdict
                score={session.score}
                previousBest={previousBest}
                improvement={improvement}
            />

            <dl className="run-figures">
                {accuracy !== null && (
                    <div>
                        <dt>Recall</dt>
                        <dd>
                            {accuracy}
                            <span className="unit">%</span>
                        </dd>
                    </div>
                )}
                <div>
                    <dt>Perfect</dt>
                    <dd>
                        {session.perfectRounds}/{session.totalRounds}
                    </dd>
                </div>
                {session.bestSequenceLength !== null && (
                    <div>
                        <dt>Longest held</dt>
                        <dd>{session.bestSequenceLength}</dd>
                    </div>
                )}
                <div>
                    <dt>Best streak</dt>
                    <dd>{session.bestStreak}</dd>
                </div>
            </dl>

            {/* Only the rounds that slipped. A perfect round has nothing to teach,
                and listing all five would bury the ones that do. */}
            {missed.length === 0 ? (
                <p className="clean-sweep">
                    Every sequence, every position. {session.symbolsRemembered} symbols held.
                </p>
            ) : (
                <>
                    <p className="review-head">
                        {missed.length === 1 ? "The one that slipped" : `The ${missed.length} that slipped`}
                    </p>

                    <ol className="mem-review">
                        {missed.map((r) => (
                            <li key={r.roundNumber}>
                                <p className="review-n">
                                    Round {r.roundNumber} · {r.correct}/{r.length}
                                </p>

                                <div className="mem-compare">
                                    <span className="mem-compare-label">You played</span>
                                    <ol className="mem-row">
                                        {(r.sequence ?? []).map((symbol, i) => {
                                            const played = r.submitted?.[i];

                                            return (
                                                <li
                                                    key={i}
                                                    className={
                                                        played === undefined
                                                            ? "missing"
                                                            : played === symbol
                                                              ? "hit"
                                                              : "miss"
                                                    }
                                                >
                                                    {played ? (
                                                        <SymbolGlyph name={played} />
                                                    ) : (
                                                        <span>—</span>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ol>

                                    <span className="mem-compare-label">It was</span>
                                    <ol className="mem-row is-answer">
                                        {(r.sequence ?? []).map((symbol, i) => (
                                            <li key={i}>
                                                <SymbolGlyph name={symbol} />
                                            </li>
                                        ))}
                                    </ol>
                                </div>
                            </li>
                        ))}
                    </ol>
                </>
            )}

            <div className="cta-row">
                <Link className="button primary" to="/memory">
                    Play again
                </Link>
                <Link className="button ghost" to="/">
                    Pick another Jolt
                </Link>
            </div>
        </section>
    );
}
