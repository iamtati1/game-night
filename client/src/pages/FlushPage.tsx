import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, api } from "../api/client.js";
import type {
    FlushCurrentResponse,
    FlushPlacementResponse,
    FlushRound,
    FlushStartResponse
} from "../api/types.js";
import { Countdown } from "../components/Countdown.js";

const ROUND_TIME_LIMIT_MS = 60_000;
const REVEAL_MS = 2600;

/** What the round is worth if you bank n placements, and if you finish.
 *  Mirrors the server's formula purely for display -- the server remains
 *  authoritative for every value that is actually stored. */
function banked(n: number): number {
    return (10 * n * (n + 1)) / 2;
}

interface Reveal {
    outcome: "wrong" | "round_complete" | "timed_out";
    roundScore: number | null;
    correctSequence: string[];
    yourSequence: string[];
}

export function FlushPage() {
    const navigate = useNavigate();
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [round, setRound] = useState<FlushRound | null>(null);
    const [score, setScore] = useState(0);
    const [reveal, setReveal] = useState<Reveal | null>(null);
    const [lastWrong, setLastWrong] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    /** Blocks a second click, and the countdown, while a placement is in flight
     *  or a reveal is on screen. Same guard Code Blitz uses. */
    const settling = useRef(false);

    useEffect(() => {
        let active = true;

        api.post<FlushStartResponse>("/api/flush/sessions")
            .then((data) => {
                if (!active) return;
                if (data.session) {
                    navigate(`/flush/results/${data.session.id}`, { replace: true });
                    return;
                }
                setSessionId(data.sessionId ?? null);
                setRound(data.round ?? null);
                setScore(data.scoreSoFar ?? 0);
            })
            .catch((err) => {
                if (active) {
                    setError(err instanceof ApiError ? err.detailText : "Could not start Flush");
                }
            });

        return () => {
            active = false;
        };
    }, [navigate]);

    const showReveal = useCallback(
        (r: Reveal, next: FlushRound | null, complete: boolean, id: string | null) => {
            setReveal(r);

            setTimeout(() => {
                setReveal(null);
                setLastWrong(null);

                if (complete && id) {
                    navigate(`/flush/results/${id}`, { replace: true });
                    return;
                }

                setRound(next);
                settling.current = false;
            }, REVEAL_MS);
        },
        [navigate]
    );

    async function place(outputId: string) {
        if (!sessionId || !round || settling.current) return;

        settling.current = true;
        setBusy(true);

        try {
            const res = await api.post<FlushPlacementResponse>(
                `/api/flush/sessions/${sessionId}/placements`,
                { roundId: round.roundId, outputId }
            );

            setScore(res.scoreSoFar);

            if (!res.roundEnded) {
                // Banked. Keep going -- the tile moves into its slot and the
                // stake goes up.
                setRound(res.round);
                settling.current = false;
                return;
            }

            if (res.outcome === "wrong") {
                setLastWrong(outputId);
            }

            showReveal(
                {
                    outcome: res.outcome === "correct" ? "wrong" : res.outcome,
                    roundScore: res.roundScore,
                    correctSequence: res.correctSequence ?? [],
                    yourSequence: res.yourSequence ?? []
                },
                res.round,
                res.complete,
                res.session?.id ?? sessionId
            );
        } catch (err) {
            settling.current = false;
            setError(err instanceof ApiError ? err.detailText : "Could not place that tile");
        } finally {
            setBusy(false);
        }
    }

    const onExpire = useCallback(async () => {
        if (settling.current) return;
        settling.current = true;

        try {
            const data = await api.get<FlushCurrentResponse>("/api/flush/sessions/current");

            if (data.complete && data.session) {
                navigate(`/flush/results/${data.session.id}`, { replace: true });
                return;
            }

            setRound(data.round ?? null);
            setScore(data.scoreSoFar ?? 0);
            settling.current = false;
        } catch (err) {
            settling.current = false;
            setError(err instanceof ApiError ? err.detailText : "Lost track of the round");
        }
    }, [navigate]);

    if (error) {
        return (
            <section className="panel narrow">
                <h1>Flush interrupted</h1>
                <p className="form-error" role="alert">
                    {error}
                </p>
                <Link className="button primary" to="/">
                    Back home
                </Link>
            </section>
        );
    }

    if (!round) {
        return <p className="muted center">Queueing up…</p>;
    }

    const placedCount = round.placed.length;
    const remaining = round.totalOutputs - placedCount;
    const atRisk = banked(round.totalOutputs) * 2 - banked(placedCount);

    return (
        <section className="game flush">
            <header className="game-bar">
                <span className="progress">
                    Round {round.roundNumber} of {round.totalRounds}
                </span>
                <span className="score" aria-live="polite">
                    {score} pts
                </span>
            </header>

            <Countdown
                deadlineAt={round.deadlineAt}
                totalMs={ROUND_TIME_LIMIT_MS}
                onExpire={onExpire}
            />

            <p className="flush-task">
                What prints, in order? <strong>{remaining}</strong> left
            </p>

            <pre className="prompt">{round.prompt}</pre>

            {/* The stake. Banked is safe; the multiplier is what another
                placement risks. This is the whole decision, stated plainly. */}
            <div className="stake">
                <span className="stake-safe">
                    Banked <strong>{round.pointsBanked}</strong>
                </span>
                <span className="stake-risk">
                    {placedCount === round.totalOutputs - 1 ? (
                        <>
                            Next one finishes the round · <strong>×2</strong>
                        </>
                    ) : (
                        <>
                            Finish for <strong>×2</strong> · {atRisk} at risk
                        </>
                    )}
                </span>
            </div>

            <ol className="slots" aria-label="Placed so far">
                {Array.from({ length: round.totalOutputs }, (_, i) => {
                    const tile = round.placed[i];
                    return (
                        <li key={i} className={`slot${tile ? " filled" : ""}`}>
                            <span className="slot-index">{i + 1}</span>
                            <span className="slot-text">{tile ? tile.text : "—"}</span>
                        </li>
                    );
                })}
            </ol>

            {!reveal && (
                <ul className="tiles">
                    {round.tiles.map((tile) => (
                        <li key={tile.id}>
                            <button
                                className={`tile${lastWrong === tile.id ? " wrong" : ""}`}
                                onClick={() => void place(tile.id)}
                                disabled={busy}
                            >
                                {tile.text}
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {reveal && (
                <div className="reveal" role="status">
                    {reveal.outcome === "round_complete" && (
                        <p className="tag correct">
                            Flushed · +{reveal.roundScore} <span className="mult">×2</span>
                        </p>
                    )}
                    {reveal.outcome === "wrong" && (
                        <p className="tag incorrect">Wrong order · kept {reveal.roundScore}</p>
                    )}
                    {reveal.outcome === "timed_out" && (
                        <p className="tag timeout">Out of time · kept {reveal.roundScore}</p>
                    )}

                    {/* The teaching moment. Seeing both sequences side by side is
                        what turns "the game screwed me" into "ohhh, microtasks
                        first". */}
                    <div className="sequences">
                        <div>
                            <span className="muted">You said</span>
                            <ol className="seq">
                                {reveal.yourSequence.map((t, i) => (
                                    <li key={i} className={t === reveal.correctSequence[i] ? "ok" : "bad"}>
                                        {t}
                                    </li>
                                ))}
                            </ol>
                        </div>
                        <div>
                            <span className="muted">Actually ran</span>
                            <ol className="seq">
                                {reveal.correctSequence.map((t, i) => (
                                    <li key={i}>{t}</li>
                                ))}
                            </ol>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
