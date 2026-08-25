import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "../api/client.js";
import { activeGameFrom } from "../api/types.js";
import type {
    MemoryRoundRef,
    MemoryStartResponse,
    MemorySubmitResponse,
    ResumableResponse
} from "../api/types.js";
import { ActiveGameConflict } from "../components/ActiveGameConflict.js";
import { PausedRun } from "../components/PausedRun.js";
import { ResumeCountdown } from "../components/ResumeCountdown.js";
import { RoundProgress } from "../components/RoundProgress.js";
import { SymbolGlyph } from "../components/SymbolGlyph.js";
import { MEMORY, gameBySlug } from "../games/catalog.js";

/** Beat before the sequence starts, so the player can settle and look. */
const READY_MS = 900;

/**
 * Cadence bounds for the reveal.
 *
 * The floor keeps late rounds from blurring into one flash. The ceiling stops a
 * generous round from spending its whole budget spreading four symbols a full
 * second apart, which reads as a laggy interface rather than a generous one.
 *
 * The ceiling has to be raised whenever the budgets are: at 420ms the current
 * curve pinned rounds one through three to the ceiling, so all three revealed at
 * an identical cadence and the acceleration this function exists to produce only
 * started in round four. 640ms clamps round one alone (727ms uncapped) and
 * leaves every other round free to fall out of the formula.
 */
const MIN_STEP_MS = 240;
const MAX_STEP_MS = 640;

/** The complete sequence is always held for at least this long, whatever is
 *  left of the budget. This is the window the player actually memorises in. */
const MIN_HOLD_MS = 800;

/** The feedback beat before the next round is offered. */
const FEEDBACK_MS = 2600;

/**
 * Splits a round's budget into a reveal cadence and a hold.
 *
 * The bug this fixes: the old presentation spent displayMs entirely on the
 * build-up and then held the finished sequence for a fixed 550ms. So the window
 * showing the WHOLE sequence -- the only part you can really memorise -- was
 * roughly constant no matter how generous the round was, and raising displayMs
 * just moved the symbols further apart.
 *
 * Now the cadence is clamped and whatever remains becomes the hold:
 *
 *   round 1  4 x 640ms = 2560  +  1440ms hold   (4000 total)
 *   round 2  5 x 538ms = 2690  +   810ms hold   (3500 total)
 *   round 3  6 x 433ms = 2598  +   800ms hold   (3398 total)
 *   round 4  7 x 353ms = 2471  +   800ms hold   (3271 total)
 *   round 5  8 x 289ms = 2312  +   800ms hold   (3112 total)
 *
 * The cadence accelerates every round and the hold never drops below a readable
 * beat, which is the difference between "demanding" and "out of reach".
 */
export function presentationTiming(displayMs: number, length: number) {
    const step = Math.min(
        MAX_STEP_MS,
        Math.max(MIN_STEP_MS, Math.round(displayMs / (length + 1.5)))
    );

    return { step, holdMs: Math.max(MIN_HOLD_MS, displayMs - step * length) };
}

type Phase =
    | "loading"
    | "intro"
    | "ready"
    | "showing"
    | "recall"
    | "feedback";

interface Feedback {
    sequence: string[];
    submitted: string[];
    correct: number;
    perfect: boolean;
    points: number;
}

export function MemoryPage() {
    const navigate = useNavigate();
    const game = gameBySlug(MEMORY);

    const [phase, setPhase] = useState<Phase>("loading");
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [round, setRound] = useState<MemoryRoundRef | null>(null);
    const [score, setScore] = useState(0);
    const [shownCount, setShownCount] = useState(0);
    const [picks, setPicks] = useState<string[]>([]);
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const [paused, setPaused] = useState(false);
    const [resuming, setResuming] = useState(false);
    const [pausedInfo, setPausedInfo] = useState<{
        unit: string;
        current: number;
        total: number;
        score: number;
    } | null>(null);
    const [conflict, setConflict] = useState<{ slug: string; name: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const timers = useRef<number[]>([]);
    const later = useCallback((fn: () => void, ms: number) => {
        timers.current.push(window.setTimeout(fn, ms));
    }, []);
    const clearTimers = useCallback(() => {
        timers.current.forEach(window.clearTimeout);
        timers.current = [];
    }, []);

    useEffect(() => () => clearTimers(), [clearTimers]);

    useEffect(() => {
        let active = true;

        void (async () => {
            try {
                const open = await api.get<ResumableResponse>("/api/me/sessions/resumable");
                const held = open.sessions.find(
                    (s) => s.game.slug === MEMORY && s.status === "paused"
                );

                if (!active) return;

                if (held) {
                    setPausedInfo({
                        unit: game?.unit ?? "Round",
                        current: Math.min(held.unitsDone + 1, held.unitsTotal),
                        total: held.unitsTotal,
                        score: held.score
                    });
                    setPaused(true);
                    setPhase("intro");
                    return;
                }
            } catch {
                // A failed probe must not stop someone playing.
            }

            if (!active) return;
            setPhase("intro");
        })();

        return () => {
            active = false;
        };
    }, [game]);

    /**
     * Plays one round's sequence.
     *
     * Symbols land one at a time rather than appearing as a row, because a
     * sequence you watch arrive is a sequence with rhythm -- and rhythm is what
     * you actually remember. Cadence and hold both come from the round's own
     * displayMs via presentationTiming, so later rounds genuinely flash faster
     * rather than merely showing more.
     */
    const present = useCallback(
        (next: MemoryRoundRef) => {
            setRound(next);
            setPicks([]);
            setFeedback(null);
            setShownCount(0);
            setPhase("ready");

            const { step, holdMs } = presentationTiming(next.displayMs, next.sequence.length);

            later(() => {
                setPhase("showing");

                next.sequence.forEach((_, i) => {
                    later(() => setShownCount(i + 1), step * i);
                });

                // The complete sequence then holds. This is the part the player
                // memorises in, so it gets whatever the cadence did not spend.
                later(() => {
                    setShownCount(0);
                    setPhase("recall");
                }, step * next.sequence.length + holdMs);
            }, READY_MS);
        },
        [later]
    );

    async function start(fresh: boolean) {
        setBusy(true);
        setError(null);

        try {
            const data = await api.post<MemoryStartResponse>("/api/memory/sessions", { fresh });

            if (data.session) {
                navigate(`/memory/results/${data.session.id}`, { replace: true });
                return;
            }

            setSessionId(data.sessionId ?? null);
            setScore(data.scoreSoFar ?? 0);
            setPaused(false);
            setPausedInfo(null);
            setResuming(false);

            if (data.round) {
                present(data.round);
            }
        } catch (err) {
            const held = err instanceof ApiError ? activeGameFrom(err.body) : null;

            if (held) {
                setConflict(held);
                return;
            }

            setError(err instanceof ApiError ? err.detailText : "Could not start Memory");
        } finally {
            setBusy(false);
        }
    }

    async function submit() {
        if (!sessionId || !round || picks.length === 0 || busy) return;

        setBusy(true);

        try {
            const res = await api.post<MemorySubmitResponse>(
                `/api/memory/sessions/${sessionId}/rounds`,
                { roundId: round.roundId, submitted: picks }
            );

            setScore(res.scoreSoFar);
            setFeedback({
                sequence: res.sequence,
                submitted: res.submitted,
                correct: res.correct,
                perfect: res.perfect,
                points: res.pointsAwarded
            });
            setPhase("feedback");

            later(() => {
                if (res.complete && res.session) {
                    navigate(`/memory/results/${res.session.id}`, { replace: true });
                    return;
                }

                if (res.round) {
                    present(res.round);
                }
            }, FEEDBACK_MS);
        } catch (err) {
            setError(err instanceof ApiError ? err.detailText : "Could not record that round");
        } finally {
            setBusy(false);
        }
    }

    async function handlePause() {
        if (!sessionId || busy) return;
        setBusy(true);
        clearTimers();

        try {
            await api.post(`/api/me/sessions/${MEMORY}/pause`);

            if (round) {
                setPausedInfo({
                    unit: game?.unit ?? "Round",
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

    if (conflict) {
        return (
            <ActiveGameConflict
                activeGame={conflict}
                wantedGame="Memory"
                onAbandoned={() => {
                    setConflict(null);
                    void start(false);
                }}
            />
        );
    }

    if (error) {
        return (
            <section className="panel narrow">
                <h1>Memory interrupted</h1>
                <p className="form-error" role="alert">
                    {error}
                </p>
                <button className="button primary" onClick={() => window.location.reload()}>
                    Try again
                </button>
            </section>
        );
    }

    if (resuming) {
        return <ResumeCountdown onDone={() => void start(false)} />;
    }

    if (paused) {
        return (
            <PausedRun
                slug={MEMORY}
                progress={pausedInfo}
                score={pausedInfo?.score ?? score}
                busy={busy}
                onResume={() => setResuming(true)}
            />
        );
    }

    if (phase === "loading") {
        return <p className="muted center">Shuffling…</p>;
    }

    if (phase === "intro") {
        return (
            <section className="game memory mem-intro">
                <p className="mem-eyebrow">Memory</p>
                <h1 className="mem-title">Hold the sequence.</h1>

                <p className="mem-lede">
                    Symbols appear one at a time, then vanish.
                    <br />
                    Play them back in the order you saw them.
                </p>

                {/* The mechanic in miniature: three symbols, mid-fade. */}
                <div className="mem-trace" aria-hidden="true">
                    <SymbolGlyph name="triangle" />
                    <SymbolGlyph name="star" />
                    <SymbolGlyph name="circle" />
                </div>

                <p className="mem-shape">5 rounds · 4 to 8 symbols</p>

                <button
                    className="button primary big"
                    onClick={() => void start(true)}
                    disabled={busy}
                >
                    {busy ? "Starting…" : "Start"}
                </button>
            </section>
        );
    }

    const bank = round ? [...round.sequence].sort() : [];
    const showing = phase === "showing";

    return (
        <section className="game memory">
            <header className="hud">
                <span className="hud-title">Memory</span>

                <span className="score-slot">
                    <span className="hud-label">Score</span>
                    <span className="score" aria-live="polite">
                        {score}
                    </span>
                </span>

                <button
                    className="button ghost small"
                    onClick={() => void handlePause()}
                    disabled={busy || phase !== "recall"}
                >
                    Pause
                </button>
            </header>

            {round && (
                <RoundProgress
                    current={round.roundNumber}
                    total={round.totalRounds}
                    unit="Round"
                />
            )}

            <div className="mem-stage">
                {phase === "ready" && (
                    <p className="mem-state">Watch</p>
                )}

                {showing && round && (
                    <ol className="mem-sequence" aria-label="Sequence">
                        {round.sequence.slice(0, shownCount).map((symbol, i) => (
                            <li key={i} className="mem-shown">
                                <SymbolGlyph name={symbol} />
                            </li>
                        ))}
                    </ol>
                )}

                {phase === "recall" && round && (
                    <>
                        <p className="mem-state mem-recall-cue">
                            Play it back
                            <span className="mem-count">
                                {picks.length} / {round.sequence.length}
                            </span>
                        </p>

                        {/* The slots fill as the player builds their answer, so the
                            reconstruction is visible rather than remembered twice. */}
                        <ol className="mem-slots" aria-label="Your sequence">
                            {Array.from({ length: round.sequence.length }, (_, i) => (
                                <li key={i} className={`mem-slot${picks[i] ? " filled" : ""}`}>
                                    {picks[i] ? (
                                        <SymbolGlyph name={picks[i]!} />
                                    ) : (
                                        <span className="mem-slot-n">{i + 1}</span>
                                    )}
                                </li>
                            ))}
                        </ol>
                    </>
                )}

                {phase === "feedback" && feedback && (
                    <div className="mem-feedback" role="status">
                        <p className={`mem-verdict${feedback.perfect ? " is-perfect" : ""}`}>
                            {feedback.perfect
                                ? "Perfect recall"
                                : `${feedback.correct} of ${feedback.sequence.length} remembered`}
                        </p>

                        {/* Both sequences, aligned position by position, so a wrong
                            answer teaches instead of just scoring. */}
                        <div className="mem-compare">
                            <span className="mem-compare-label">You played</span>
                            <ol className="mem-row">
                                {feedback.sequence.map((_, i) => {
                                    const played = feedback.submitted[i];

                                    return (
                                        <li
                                            key={i}
                                            className={
                                                played === undefined
                                                    ? "missing"
                                                    : played === feedback.sequence[i]
                                                      ? "hit"
                                                      : "miss"
                                            }
                                        >
                                            {played ? <SymbolGlyph name={played} /> : <span>—</span>}
                                        </li>
                                    );
                                })}
                            </ol>

                            <span className="mem-compare-label">It was</span>
                            <ol className="mem-row is-answer">
                                {feedback.sequence.map((symbol, i) => (
                                    <li key={i}>
                                        <SymbolGlyph name={symbol} />
                                    </li>
                                ))}
                            </ol>
                        </div>

                        <p className="mem-points">+{feedback.points}</p>
                    </div>
                )}
            </div>

            {phase === "recall" && round && (
                <div className="mem-controls">
                    <ul className="mem-bank" aria-label="Symbols">
                        {bank.map((symbol) => {
                            const used = picks.filter((p) => p === symbol).length > 0;

                            return (
                                <li key={symbol}>
                                    <button
                                        type="button"
                                        className={`mem-key${used ? " used" : ""}`}
                                        onClick={() =>
                                            setPicks((p) =>
                                                p.length < round.sequence.length ? [...p, symbol] : p
                                            )
                                        }
                                        disabled={used || picks.length >= round.sequence.length}
                                        aria-label={symbol}
                                    >
                                        <SymbolGlyph name={symbol} />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>

                    <div className="mem-actions">
                        <button
                            className="button ghost small"
                            onClick={() => setPicks((p) => p.slice(0, -1))}
                            disabled={picks.length === 0}
                        >
                            Undo
                        </button>
                        <button
                            className="button primary"
                            onClick={() => void submit()}
                            disabled={picks.length === 0 || busy}
                        >
                            {picks.length === round.sequence.length ? "Submit" : "Submit anyway"}
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}
