import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "../api/client.js";
import { activeGameFrom } from "../api/types.js";
import type {
    ReactionRoundRef,
    ReactionRoundResponse,
    ReactionStartResponse,
    ReactionTier,
    ResumableResponse
} from "../api/types.js";
import { ActiveGameConflict } from "../components/ActiveGameConflict.js";
import { PausedRun } from "../components/PausedRun.js";
import { ResumeCountdown } from "../components/ResumeCountdown.js";
import { RoundProgress } from "../components/RoundProgress.js";
import { REACTION, gameBySlug } from "../games/catalog.js";

/**
 * The wait before the signal.
 *
 * Randomised so it cannot be anticipated, and floored at a full second so the
 * player has time to settle rather than being ambushed the instant the round
 * starts. The exact delay is never sent to the client-visible state.
 */
const MIN_WAIT_MS = 1500;
const MAX_WAIT_MS = 3200;

/** How long a round's result stays up before the next wait begins. */
const RESULT_MS = 1500;

/**
 * A settling beat between the previous result and the next wait.
 *
 * Without it the signal could arrive 1200ms after a result appeared, so a player
 * still reading "287ms · Fast" could be ambushed by the next round. The arena
 * says Ready, and only then does the unpredictable wait begin.
 */
const READY_MS = 700;
/** A false start gets slightly longer: there is a sentence to read. */
const FALSE_START_MS = 1700;

type Phase = "loading" | "intro" | "ready" | "waiting" | "signal" | "result" | "falseStart";

interface RoundOutcome {
    reactionMs: number | null;
    tier: ReactionTier | null;
    points: number;
}

export function ReactionPage() {
    const navigate = useNavigate();
    const game = gameBySlug(REACTION);

    const [phase, setPhase] = useState<Phase>("loading");
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [round, setRound] = useState<ReactionRoundRef | null>(null);
    const [score, setScore] = useState(0);
    const [outcome, setOutcome] = useState<RoundOutcome | null>(null);
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

    /**
     * When the signal was painted, from performance.now().
     *
     * A ref rather than state on purpose: the reaction is read in the same event
     * handler that the player's click triggers, and a state update would not be
     * visible there. This is the only value the score depends on, so it must not
     * be subject to a render cycle.
     */
    const signalAt = useRef<number | null>(null);
    /** Guards the window between submitting and the next round arriving. */
    const settling = useRef(false);

    const timers = useRef<number[]>([]);
    const later = useCallback((fn: () => void, ms: number) => {
        timers.current.push(window.setTimeout(fn, ms));
    }, []);
    const clearTimers = useCallback(() => {
        timers.current.forEach(window.clearTimeout);
        timers.current = [];
    }, []);

    useEffect(() => () => clearTimers(), [clearTimers]);

    // Arrive: resume, show the paused screen, or offer the intro.
    useEffect(() => {
        let active = true;

        void (async () => {
            try {
                const open = await api.get<ResumableResponse>("/api/me/sessions/resumable");
                const held = open.sessions.find(
                    (s) => s.game.slug === REACTION && s.status === "paused"
                );

                if (!active) return;

                if (held) {
                    setPausedInfo({
                        unit: "Round",
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
    }, []);

    /** Begins the wait for one round. */
    const beginWait = useCallback(
        (next: ReactionRoundRef) => {
            setRound(next);
            setOutcome(null);
            setPhase("ready");
            signalAt.current = null;
            settling.current = false;

            const delay = READY_MS + MIN_WAIT_MS + Math.random() * (MAX_WAIT_MS - MIN_WAIT_MS);

            // The wait proper starts after the settling beat, so the arena reads
            // Ready before it reads Wait.
            later(() => setPhase("waiting"), READY_MS);

            later(() => {
                // performance.now() rather than Date.now(): monotonic, sub-
                // millisecond, and immune to the clock being adjusted mid-round.
                signalAt.current = performance.now();
                setPhase("signal");
            }, delay);
        },
        [later]
    );

    async function start(fresh: boolean) {
        setBusy(true);
        setError(null);

        try {
            const data = await api.post<ReactionStartResponse>("/api/reaction/sessions", {
                fresh
            });

            if (data.session) {
                navigate(`/reaction/results/${data.session.id}`, { replace: true });
                return;
            }

            setSessionId(data.sessionId ?? null);
            setScore(data.scoreSoFar ?? 0);
            setPaused(false);
            setPausedInfo(null);
            setResuming(false);

            if (data.round) {
                beginWait(data.round);
            }
        } catch (err) {
            const held = err instanceof ApiError ? activeGameFrom(err.body) : null;

            if (held) {
                setConflict(held);
                return;
            }

            setError(err instanceof ApiError ? err.detailText : "Could not start Reaction");
        } finally {
            setBusy(false);
        }
    }

    /**
     * Submits a resolved round.
     *
     * The local result is shown before the request is awaited: the player's own
     * reaction is the one number they care about, and making them watch a spinner
     * for it would undo the whole point of the game. The server still decides the
     * score, and a rejection surfaces as an error rather than a silent pass.
     */
    async function submit(reactionMs: number | null) {
        if (!sessionId || !round || settling.current) return;

        settling.current = true;
        clearTimers();

        const falseStart = reactionMs === null;

        try {
            const res = await api.post<ReactionRoundResponse>(
                `/api/reaction/sessions/${sessionId}/rounds`,
                falseStart
                    ? { outcome: "false_start", roundId: round.roundId }
                    : { outcome: "reacted", roundId: round.roundId, reactionMs }
            );

            setScore(res.scoreSoFar);
            setOutcome({ reactionMs: res.reactionMs, tier: res.tier, points: res.pointsAwarded });
            setPhase(falseStart ? "falseStart" : "result");

            later(
                () => {
                    if (res.complete && res.session) {
                        navigate(`/reaction/results/${res.session.id}`, { replace: true });
                        return;
                    }

                    if (res.round) {
                        beginWait(res.round);
                    }
                },
                falseStart ? FALSE_START_MS : RESULT_MS
            );
        } catch (err) {
            settling.current = false;
            setError(err instanceof ApiError ? err.detailText : "Could not record that round");
        }
    }

    /** The one interaction the game has. */
    const act = useCallback(() => {
        if (phase === "signal" && signalAt.current !== null) {
            const ms = Math.round(performance.now() - signalAt.current);
            void submit(ms);
            return;
        }

        if (phase === "waiting") {
            void submit(null);
        }
        // In result / falseStart / intro, a press does nothing: the round is over
        // and the next wait has not begun.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase]);

    // Space and Enter play the game, so it is fully keyboard-playable.
    useEffect(() => {
        function onKey(event: KeyboardEvent) {
            if (event.key !== " " && event.key !== "Enter") return;
            if (phase !== "waiting" && phase !== "signal") return;

            event.preventDefault();
            act();
        }

        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });

    async function handlePause() {
        if (!sessionId || busy) return;
        setBusy(true);
        clearTimers();

        try {
            await api.post(`/api/me/sessions/${REACTION}/pause`);

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
                wantedGame="Reaction"
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
                <h1>Reaction interrupted</h1>
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
                slug={REACTION}
                progress={pausedInfo}
                score={pausedInfo?.score ?? score}
                busy={busy}
                onResume={() => setResuming(true)}
            />
        );
    }

    if (phase === "loading") {
        return <p className="muted center">Warming up…</p>;
    }

    if (phase === "intro") {
        return (
            <section className="game reaction rx-intro">
                <p className="rx-eyebrow">Reaction</p>
                <h1 className="rx-title">Test your reflexes.</h1>

                <p className="rx-lede">
                    Wait for the signal, then hit it as fast as you can.
                    <br />
                    Move early and the round is gone.
                </p>

                {/* Ambient, and the only decoration on this screen: it shows what
                    the thing you are about to watch for looks like. */}
                <div className="rx-orb" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                </div>

                <p className="rx-shape">5 rounds</p>

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

    const isSignal = phase === "signal";

    return (
        <section className="game reaction">
            <header className="hud">
                <span className="hud-title">Reaction</span>

                <span className="score-slot">
                    <span className="hud-label">Score</span>
                    <span className="score" aria-live="polite">
                        {score}
                    </span>
                </span>

                <button
                    className="button ghost small"
                    onClick={() => void handlePause()}
                    disabled={busy || (phase !== "waiting" && phase !== "ready")}
                >
                    Pause
                </button>
            </header>

            {round && <RoundProgress current={round.roundNumber} total={round.totalRounds} unit="Round" />}

            {/*
                One button is the whole game. A real <button> rather than a div
                with a click handler, so it is focusable, keyboard-operable and
                announced -- and the arena is the button rather than containing
                one, so the entire target is tappable on a phone.
            */}
            <button
                type="button"
                className={`rx-arena is-${phase}`}
                onClick={act}
                aria-live="assertive"
            >
                {phase === "ready" && (
                    <>
                        <span className="rx-state">Ready</span>
                        <span className="rx-hint">Next one coming up</span>
                    </>
                )}

                {phase === "waiting" && (
                    <>
                        <span className="rx-state">Wait</span>
                        <span className="rx-hint">Don&rsquo;t move yet</span>
                    </>
                )}

                {isSignal && (
                    <>
                        {/* Not colour alone: the word changes, the type doubles in
                            size, and the ring snaps outward. */}
                        <span className="rx-state rx-go">Go</span>
                        <span className="rx-hint">Hit it</span>
                    </>
                )}

                {phase === "result" && outcome && (
                    <>
                        <span className="rx-ms">
                            {outcome.reactionMs}
                            <i>ms</i>
                        </span>
                        <span className={`rx-tier tier-${outcome.tier?.key ?? "sharp"}`}>
                            {outcome.tier?.label}
                        </span>
                        <span className="rx-points">+{outcome.points}</span>
                    </>
                )}

                {phase === "falseStart" && (
                    <>
                        <span className="rx-state rx-early">Too early</span>
                        <span className="rx-hint">You jumped the signal — next one counts.</span>
                    </>
                )}
            </button>
        </section>
    );
}
