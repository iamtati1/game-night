import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, api } from "../api/client.js";
import { activeGameFrom } from "../api/types.js";
import type {
    FlushCurrentResponse,
    FlushPlacementResponse,
    FlushRound,
    FlushStartResponse,
    ResumableResponse
} from "../api/types.js";
import { ActiveGameConflict } from "../components/ActiveGameConflict.js";
import { Countdown } from "../components/Countdown.js";
import { PausedRun } from "../components/PausedRun.js";
import { FLUSH } from "../games/catalog.js";
import { RoundProgress } from "../components/RoundProgress.js";

const ROUND_TIME_LIMIT_MS = 60_000;
const REVEAL_MS = 2600;

/** Round exit. Matches Code Blitz, so both games settle at the same rhythm. */
const EXIT_MS = 170;

/**
 * How long the resolved placement stays on the board before the reveal replaces
 * the rack.
 *
 * Without it the rack unmounted in the same frame the round ended, so the
 * rejected tile's red state and shake never rendered at all -- the player saw a
 * click turn instantly into a verdict with no visible cause. This is the beat
 * where the board answers "which tile was that?" before the reveal answers "and
 * what should it have been?".
 */
const RESOLVE_MS = 520;

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
    const [conflict, setConflict] = useState<{ slug: string; name: string } | null>(null);
    /** Bumped after abandoning, to re-run the start effect. */
    const [attempt, setAttempt] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const [paused, setPaused] = useState(false);
    /** Where a paused run stopped. Set from live state when the player pauses, or
     *  from the server when they arrive back on a run they had paused. */
    const [pausedInfo, setPausedInfo] = useState<{
        unit: string;
        current: number;
        total: number;
        score: number;
    } | null>(null);
    /** Bumped per resolved placement, so the score and award animations replay
     *  even when two placements are worth the same. */
    const [beat, setBeat] = useState(0);
    const [award, setAward] = useState(0);
    const [leaving, setLeaving] = useState(false);
    /** The slot that just accepted a tile, so only that line animates. */
    const [snapped, setSnapped] = useState<number | null>(null);

    /** Blocks a second click, and the countdown, while a placement is in flight
     *  or a reveal is on screen. Same guard Code Blitz uses. */
    const settling = useRef(false);

    /** Every pending timeout. The reveal timer calls navigate() when a session
     *  ends, so one surviving an unmount would redirect a player who had already
     *  left the page. Same fix Code Blitz needed. */
    const timers = useRef<number[]>([]);

    const later = useCallback((fn: () => void, ms: number) => {
        timers.current.push(window.setTimeout(fn, ms));
    }, []);

    useEffect(
        () => () => {
            timers.current.forEach(window.clearTimeout);
            timers.current = [];
        },
        []
    );

    async function handlePause() {
        if (!sessionId || busy) return;

        setBusy(true);

        try {
            await api.post("/api/me/sessions/flush/pause");

            if (round) {
                setPausedInfo({
                    unit: "Round",
                    current: round.roundNumber,
                    total: round.totalRounds,
                    score
                });
            }

            setPaused(true);
        } catch (err) {
            setError(err instanceof ApiError ? err.detailText : "Could not pause the game");
        } finally {
            setBusy(false);
        }
    }

    async function handleResume() {
        setBusy(true);

        try {
            // POST /api/flush/sessions resumes a paused session and serves the
            // round with its clock restored, so there is no separate resume call.
            const data = await api.post<FlushStartResponse>("/api/flush/sessions");

            setRound(data.round ?? null);
            setScore(data.scoreSoFar ?? 0);
            setPausedInfo(null);
            setPaused(false);
        } catch (err) {
            setError(err instanceof ApiError ? err.detailText : "Could not resume the game");
        } finally {
            setBusy(false);
        }
    }

    useEffect(() => {
        let active = true;

        void (async () => {
            // POST /api/flush/sessions means "start or resume", so arriving on a
            // paused run silently un-paused it and restarted the clock. A pause is
            // a decision; only the player gets to undo it.
            try {
                const open = await api.get<ResumableResponse>("/api/me/sessions/resumable");
                const heldRun = open.sessions.find(
                    (s) => s.game.slug === FLUSH && s.status === "paused"
                );

                if (!active) return;

                if (heldRun) {
                    setPausedInfo({
                        unit: "Round",
                        current: Math.min(heldRun.unitsDone + 1, heldRun.unitsTotal),
                        total: heldRun.unitsTotal,
                        score: heldRun.score
                    });
                    setPaused(true);
                    return;
                }
            } catch {
                // A failed probe must never stop someone playing.
            }

            if (!active) return;

            await api
                .post<FlushStartResponse>("/api/flush/sessions")
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
                    if (!active) return;

                    // 409 is not a failure: another game holds the single active
                    // session slot, and the player gets to choose what happens.
                    const conflicting = err instanceof ApiError ? activeGameFrom(err.body) : null;

                    if (conflicting) {
                        setConflict(conflicting);
                        return;
                    }

                    setError(err instanceof ApiError ? err.detailText : "Could not start Flush");
                });
        })();

        return () => {
            active = false;
        };
    }, [navigate, attempt]);

    const showReveal = useCallback(
        (r: Reveal, next: FlushRound | null, complete: boolean, id: string | null) => {
            setReveal(r);

            later(() => {
                setLeaving(true);

                later(() => {
                    setLeaving(false);
                    setReveal(null);
                    setLastWrong(null);

                    if (complete && id) {
                        navigate(`/flush/results/${id}`, { replace: true });
                        return;
                    }

                    setRound(next);
                    settling.current = false;
                }, EXIT_MS);
            }, REVEAL_MS);
        },
        [navigate, later]
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

            const gained = res.scoreSoFar - score;

            setScore(res.scoreSoFar);
            setBeat((n) => n + 1);
            setAward(gained);

            if (!res.roundEnded) {
                // The tile landed. Mark the slot it filled so only that line snaps.
                setSnapped(res.round ? res.round.placed.length - 1 : null);
                later(() => setSnapped(null), 420);
            }

            if (!res.roundEnded) {
                // Banked. Keep going -- the tile moves into its slot and the
                // stake goes up.
                setRound(res.round);
                settling.current = false;
                return;
            }

            if (res.outcome === "wrong") {
                // Left on screen for RESOLVE_MS so the shake and the red border
                // are actually seen before the rack gives way to the reveal.
                setLastWrong(outputId);
            }

            if (res.outcome === "round_complete") {
                // Show the last tile landing. The response's `round` is already
                // the NEXT round, so the finishing placement would otherwise never
                // appear in the console -- the most satisfying moment in the game
                // would be the one moment it did not show.
                //
                // This is not an optimistic guess: the server has confirmed the
                // placement was correct and which position it completed, so the
                // client is rendering a fact it was told, not predicting one.
                const placedTile = round.tiles.find((t) => t.id === outputId);

                if (placedTile) {
                    setRound({
                        ...round,
                        placed: [...round.placed, { outputId, text: placedTile.text }],
                        pointsBanked: res.pointsBanked,
                        tiles: round.tiles.filter((t) => t.id !== outputId)
                    });
                    setSnapped(round.placed.length);
                    later(() => setSnapped(null), 420);
                }
            }

            later(
                () =>
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
                    ),
                RESOLVE_MS
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

    if (conflict) {
        return (
            <ActiveGameConflict
                activeGame={conflict}
                wantedGame="Flush"
                onAbandoned={() => {
                    setConflict(null);
                    setAttempt((n) => n + 1);
                }}
            />
        );
    }

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

    if (paused) {
        return (
            <PausedRun
                slug={FLUSH}
                progress={pausedInfo}
                score={pausedInfo?.score ?? score}
                busy={busy}
                onResume={() => void handleResume()}
            />
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
            <header className="hud">
                <span className="hud-title">Flush</span>

                <span className="score-slot">
                    <span className="hud-label">Score</span>
                    <span className="score" aria-live="polite">
                        <span key={`s${beat}`} className="score-value">
                            {score}
                        </span>
                    </span>
                    {award > 0 && !reveal && (
                        <span key={`a${beat}`} className="score-award" aria-hidden="true">
                            +{award}
                        </span>
                    )}
                </span>

                <button
                    className="button ghost small"
                    onClick={() => void handlePause()}
                    disabled={busy || reveal !== null}
                >
                    Pause
                </button>
            </header>

            <RoundProgress
                current={round.roundNumber}
                total={round.totalRounds}
                unit="Round"
            />

            <Countdown
                deadlineAt={round.deadlineAt}
                totalMs={ROUND_TIME_LIMIT_MS}
                onExpire={onExpire}
            />

            {/* Keyed on the round, so a new round remounts and animates in rather
                than appearing in place. Same mechanism as Code Blitz. */}
            <div key={round.roundId} className={`play-stage${leaving ? " leaving" : ""}`}>
                {/* The board is the game: the code on one side, the output it
                    produces on the other. Two panels side by side say "this
                    produces that" without a sentence of instruction, and it is
                    deliberately not Code Blitz's single centred column. */}
                <div className="board">
                    <div className="board-panel">
                        <span className="board-label">Code</span>
                        <pre className="prompt">{round.prompt}</pre>
                    </div>

                    <div className="board-panel">
                        <span className="board-label">
                            Output
                            <span className="board-count">{remaining} left</span>
                        </span>

                        {/* The console being built. Filled lines read as printed
                            output; empty ones show the slot still waiting, which
                            is what communicates how much further there is to go. */}
                        <ol className="console" aria-label="Output so far">
                            {Array.from({ length: round.totalOutputs }, (_, i) => {
                                const tile = round.placed[i];

                                return (
                                    <li
                                        key={i}
                                        className={`console-line${tile ? " printed" : ""}${
                                            snapped === i ? " snap" : ""
                                        }`}
                                    >
                                        <span className="console-gutter">{i + 1}</span>
                                        <span className="console-text">
                                            {tile ? tile.text : ""}
                                        </span>
                                    </li>
                                );
                            })}
                        </ol>
                    </div>
                </div>

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

                {/* A rack of chips, not a column of buttons. Auto-width tiles that
                    wrap read as objects to pick up; full-width rows read as a
                    list to scan, which is the wrong verb for this game. */}
                {!reveal && (
                    <ul className="rack" aria-label="Available output">
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
            </div>
        </section>
    );
}
