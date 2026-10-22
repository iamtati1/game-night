import { useCallback, useEffect, useRef, useState } from "react";
import { play } from "../games/sound.js";
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
import { withCode } from "../components/CodeText.js";
import { Countdown } from "../components/Countdown.js";
import { GameIntro } from "../components/GameIntro.js";
import { PaceChoice } from "../components/PaceChoice.js";
import { usePace } from "../games/usePace.js";
import { ACTION, startGame } from "../vocabulary.js";
import { PausedRun } from "../components/PausedRun.js";
import { GetReady } from "../components/GetReady.js";
import { FLUSH, gameBySlug } from "../games/catalog.js";
import { RoundProgress } from "../components/RoundProgress.js";
import { HighlightedCode } from "../components/HighlightedCode.js";
import { NotReady, readinessFrom, type Readiness } from "../components/NotReady.js";

import { usePageTitle } from "../usePageTitle.js";
import { usePauseOnLeave } from "../games/usePauseOnLeave.js";
/** Fallback only. The real limit varies with the round's output count and comes
 *  from the served round, so the countdown bar is sized by the same number the
 *  deadline was computed from. */
const FALLBACK_ROUND_LIMIT_MS = 60_000;

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

/** Whether the placement that ended the round was a line the program never prints. */
function neverPrints(reveal: { yourSequence: string[]; correctSequence: string[] }): boolean {
    const last = reveal.yourSequence[reveal.yourSequence.length - 1];
    return last !== undefined && !reveal.correctSequence.includes(last);
}

/** What the round is worth if you bank n placements, and if you finish.
 *  Mirrors the server's formula purely for display -- the server remains
 *  authoritative for every value that is actually stored. */
function banked(n: number): number {
    return (10 * n * (n + 1)) / 2;
}

interface Reveal {
    outcome: "wrong" | "round_complete" | "timed_out";
    roundScore: number | null;
    /** A hint was taken in the round just ended: its score was halved. Captured
     *  here because `round` may already be the next one when this renders. */
    hinted?: boolean;
    correctSequence: string[];
    yourSequence: string[];
    /**
     * Why the outputs land in that order, from the server.
     *
     * THE THING FLUSH COULD NOT DO. The side-by-side diff below shows WHAT the
     * order was; only this says why. Without it the reveal only helps a learner
     * who already knew the answer -- which is not the learner who just got it
     * wrong.
     */
    explanation: string | null;
}

export function FlushPage() {
    usePageTitle("Flush");
    const navigate = useNavigate();
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [round, setRound] = useState<FlushRound | null>(null);
    /** False until the player chooses to begin -- see the note in GamePage. */
    const [entered, setEntered] = useState(false);
    /** Runs before begin(), because begin() serves round one and starts its clock. */
    const [countingIn, setCountingIn] = useState(false);
    const [beginning, setBeginning] = useState(false);
    const [timed, setTimed] = usePace();
    const [score, setScore] = useState(0);
    const [reveal, setReveal] = useState<Reveal | null>(null);
    const [lastWrong, setLastWrong] = useState<string | null>(null);
    /**
     * How to leave the reveal, held until the learner presses the button.
     *
     * UX audit: the reveal -- the two sequences side by side, and the rule that
     * decided the order -- was Flush's whole teaching moment, and it vanished
     * after 2.6 seconds. Now it stays until the learner moves on. Nothing is
     * fetched until then, so no clock runs while they read.
     */
    const [proceed, setProceed] = useState<{ complete: boolean; go: () => void } | null>(null);
    const [conflict, setConflict] = useState<{ slug: string; name: string } | null>(null);
    /** Bumped after abandoning, to re-run the start effect. */
    const [attempt, setAttempt] = useState(0);
    const [error, setError] = useState<string | null>(null);
    // The server's "not enough puzzles for you yet": a next step, not a fault.
    const [notReady, setNotReady] = useState<Readiness | null>(null);
    const [busy, setBusy] = useState(false);
    /** A hint request is in flight. */
    const [hinting, setHinting] = useState(false);

    const [paused, setPaused] = useState(false);
    /** Counting in after Resume. The session is only resumed once the count
     *  finishes, so nothing is ticking while the numbers run. */
    const [resuming, setResuming] = useState(false);
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


    // Leaving mid-run pauses it, so the clock stops and the run waits for
    // Resume -- see usePauseOnLeave.
    usePauseOnLeave(FLUSH, entered && sessionId !== null && round !== null && !paused && !resuming && !proceed?.complete);
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
                    unit: gameBySlug(FLUSH)?.unit ?? "Round",
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

            if (data.session) {
                navigate(`/flush/results/${data.session.id}`, { replace: true });
                return;
            }

            // The run's id and `entered` as well as its round. Arriving on a
            // paused run after a reload, neither was set: Resume showed the
            // intro instead of the round, and with no session id a placement
            // would have done nothing.
            setSessionId(data.sessionId ?? null);
            setRound(data.round ?? null);
            setScore(data.scoreSoFar ?? 0);
            setEntered(true);
            setPausedInfo(null);
            setPaused(false);
            setResuming(false);
        } catch (err) {
            setResuming(false);
            setError(err instanceof ApiError ? err.detailText : "Could not resume the game");
        } finally {
            setBusy(false);
        }
    }

    /** Starts the run. Only the entrance's button calls this. */
    async function begin() {
        setBeginning(true);

        try {
            // Pace chosen once, for a new run; resume sends nothing.
            const data = await api.post<FlushStartResponse>("/api/flush/sessions", { relaxed: !timed });

            if (data.session) {
                navigate(`/flush/results/${data.session.id}`, { replace: true });
                return;
            }

            setSessionId(data.sessionId ?? null);
            setRound(data.round ?? null);
            setScore(data.scoreSoFar ?? 0);
            setEntered(true);
        } catch (err) {
            const conflicting = err instanceof ApiError ? activeGameFrom(err.body) : null;

            if (conflicting) {
                setConflict(conflicting);
                return;
            }

            const readiness = readinessFrom(err, "Not enough to play yet");
            if (readiness) {
                setNotReady(readiness);
                return;
            }

            setError(err instanceof ApiError ? err.detailText : "Could not start a game");
        } finally {
            setBeginning(false);
            // Cleared either way: on success `entered` takes the render, on
            // failure the conflict and error gates above the intro do.
            setCountingIn(false);
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
                        unit: gameBySlug(FLUSH)?.unit ?? "Round",
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

            // Already mid-run? GET /flush/sessions/current answers that without
            // creating anything -- it 404s when nothing is in progress. Refreshing
            // mid-run returns the player to their round; arriving fresh shows the
            // entrance.
            try {
                const current = await api.get<FlushCurrentResponse>(
                    "/api/flush/sessions/current"
                );

                if (!active) return;

                if (current.round) {
                    // The run's id as well as its round. Without it place()
                    // returns early, so after a reload no tile did anything --
                    // the bug Code Blitz had, found by the learner audit.
                    setSessionId(current.sessionId ?? null);
                    setRound(current.round);
                    setScore(current.scoreSoFar ?? 0);
                    setEntered(true);
                    return;
                }
            } catch {
                // 404 -- no run in progress, which is the normal first arrival.
            }

            if (!active) return;

            // Nothing to resume: can a game be dealt at all? Asked up front so
            // a learner who cannot play yet is told why on arrival, rather than
            // after pressing Start and sitting through a countdown. The same
            // answer the start route would give (GET /readiness shares its
            // function). A failed probe changes nothing -- Start still asks.
            try {
                const readiness = await api.get<{ ready: boolean; message: string | null }>(
                    "/api/flush/readiness"
                );

                if (active && !readiness.ready && readiness.message) {
                    setNotReady({ message: readiness.message, practice: null });
                }
            } catch {
                // Start will ask again.
            }

        })();

        return () => {
            active = false;
        };
    }, [navigate, attempt]);

    const showReveal = useCallback(
        (r: Reveal, _next: FlushRound | null, complete: boolean, id: string | null) => {
            setReveal(r);

            // Stored rather than run: the learner says when they have read it.
            setProceed({
                complete,
                go: () => {
                    setProceed(null);
                    setLeaving(true);

                    later(() => {
                        setLeaving(false);
                        setReveal(null);
                        setLastWrong(null);

                        if (complete && id) {
                            play("complete", id);
                            navigate(`/flush/results/${id}`, { replace: true });
                            return;
                        }

                        // The next round is fetched here rather than read off the
                        // placement response, because asking for it is what starts its
                        // clock. Bundling it in began the round's window during the
                        // reveal -- 3.29s of it, measured.
                        void advanceToNext();
                    }, EXIT_MS);
                }
            });
        },
        [navigate, later]
    );

    /**
     * Takes this round's hint: the server names the next output to place and
     * remembers the hint, so the round banks half. One per round; the
     * highlight comes back with the round on a reload.
     */
    async function takeHint() {
        if (!round || !sessionId || hinting || round.hinted) return;
        const asked = round.roundId;

        setHinting(true);
        try {
            const res = await api.post<{ outputId: string; pointsBanked: number }>(
                `/api/flush/sessions/${sessionId}/hints`,
                { roundId: asked }
            );
            play("hint");
            setRound((r) =>
                r && r.roundId === asked
                    ? { ...r, hinted: true, hintOutputId: res.outputId, pointsBanked: res.pointsBanked }
                    : r
            );
        } catch {
            // Nothing changed on the server; the round carries on as it was.
        } finally {
            setHinting(false);
        }
    }

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
                // stake goes up. A light tick, not a chime: the round is not won yet.
                play("place", `${round.roundId}:${outputId}`);
                setRound(res.round);
                settling.current = false;
                return;
            }

            // The round's verdict: a chime for the full order, a soft cue for a
            // wrong tap. The reveal below says the same thing in words.
            play(res.outcome === "round_complete" ? "correct" : "incorrect", `${round.roundId}:end`);

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
                            hinted: round.hinted === true,
                            correctSequence: res.correctSequence ?? [],
                            yourSequence: res.yourSequence ?? [],
                            explanation: res.explanation ?? null
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

    /**
     * Fetches the next round and starts its clock.
     *
     * GET /sessions/current is the endpoint that serves -- and so stamps
     * served_at on -- the next pending round, which is why it is called at the
     * moment the client is ready to render rather than earlier.
     */
    const advanceToNext = useCallback(async () => {
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

    /*
     * OUT OF TIME, SAID OUT LOUD.
     *
     * This went straight to the next round, so a round that ran out simply
     * vanished. It now shows what the learner had placed and waits for them,
     * like any other round end.
     *
     * The correct order is NOT shown, because the client does not have it: the
     * server only reveals it at a round end it adjudicates, and asking it to
     * adjudicate this one (GET /sessions/current) also serves the next round
     * and starts its clock. So the round is recorded as timed out when the
     * learner presses on -- the same request as before, just not until then.
     */
    const onExpire = useCallback(() => {
        if (settling.current || !round) return;
        settling.current = true;
        play("incorrect", `${round.roundId}:end`);

        showReveal(
            {
                outcome: "timed_out",
                roundScore: null,
                correctSequence: [],
                yourSequence: round.placed.map((p) => p.text),
                explanation: null
            },
            null,
            false,
            sessionId
        );
    }, [round, sessionId, showReveal]);

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

    if (notReady) {
        return (
            <NotReady
                title="Not enough for a Flush game yet"
                readiness={notReady}
                practiceLabel={(name) => `Continue with ${name}`}
                // Lesson steps on the Journey open puzzles here, as do Code
                // Blitz's Learn Beats and questions.
                other={{ to: "/journey", label: ACTION.seeJourney }}
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
                <Link className="button primary" to="/play">
                    {ACTION.backToGames}
                </Link>
            </section>
        );
    }

    if (resuming) {
        return <GetReady onDone={() => void handleResume()} />;
    }

    if (paused) {
        return (
            <PausedRun
                slug={FLUSH}
                progress={pausedInfo}
                score={pausedInfo?.score ?? score}
                busy={busy}
                onResume={() => setResuming(true)}
            />
        );
    }

    /* The entrance, after the paused/conflict/error gates for the same reason as
       Code Blitz: those explain why you cannot play, this only covers not having
       started. */
    if (!entered) {
        if (countingIn) {
            return <GetReady label="Flush" onDone={() => void begin()} />;
        }

        return (
            <GameIntro
                eyebrow="Flush"
                title="Predict the order."
                counts="course"
                lede="Read the code, then tap each output in the order it prints. One wrong tap ends the round and shows you the real order, and why."
                howTo={<FlushHowTo />}
                shape={`Up to 5 rounds · ${timed ? "20 seconds + 10 per output" : "no timer"}`}
                pace={<PaceChoice timed={timed} onChange={setTimed} clock="20 seconds plus 10 per output" speedBonus={false} />}
                busy={beginning}
                onStart={() => setCountingIn(true)}
                startLabel={startGame("Flush")}
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

            {/* Held while the reveal is up: the round is over, and a bar
                still draining under the feedback read as time running out. */}
            {/* A relaxed run has no deadline: no bar, and nothing to expire. */}
            {round.deadlineAt === null ? (
                <p className="untimed-note">Relaxed run: no timer.</p>
            ) : (
                <Countdown
                    deadlineAt={round.deadlineAt}
                    totalMs={round.limitMs ?? FALLBACK_ROUND_LIMIT_MS}
                    onExpire={onExpire}
                    paused={reveal !== null}
                />
            )}

            {/* Keyed on the round, so a new round remounts and animates in rather
                than appearing in place. Same mechanism as Code Blitz. */}
            <div key={round.roundId} className={`play-stage${leaving ? " leaving" : ""}`}>
                {/* The board is the game: the code on one side, the output it
                    produces on the other. Two panels side by side say "this
                    produces that" without a sentence of instruction, and it is
                    deliberately not Code Blitz's single centred column. */}
                {/* Layer 5: the stage. The board, the stakes line and the rack
                    are one place where the game happens, rather than three
                    stacked blocks floating on the page. */}
                <div className="flush-stage">
                {/* What this puzzle teaches, before the learner orders anything.
                    Same line Code Blitz uses above a question on the concept
                    being studied; here every curriculum puzzle has one. */}
                {round.practising && (
                    <p className="ask-practising flush-practising">
                        <span className="ask-practising-dot" aria-hidden="true" />
                        Practicing <strong>{round.practising.name}</strong>
                        <span className="flush-practising-meaning">{round.practising.meaning}</span>
                    </p>
                )}
                <div className="board">
                    <div className="board-panel">
                        <span className="board-label">Code</span>
                        <pre className="prompt"><HighlightedCode code={round.prompt} /></pre>
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
                    placement risks. This is the whole decision, stated plainly.

                    Gone once the round is over: no decision is left, and it
                    still read "Finish the order to double" over a reveal saying
                    the round was lost. The reveal's tag says what it came to. */}
                {!reveal && (
                    <div className="stake">
                        <span className="stake-safe">
                            Points so far <strong>{round.pointsBanked}</strong>
                        </span>
                        <span className="stake-risk">
                            {placedCount === round.totalOutputs - 1 ? (
                                <>
                                    The next one finishes the order and <strong>doubles</strong> the round
                                </>
                            ) : (
                                <>
                                    Finish the order to <strong>double</strong> the round · {atRisk} more to win
                                </>
                            )}
                        </span>
                    </div>
                )}

                {/* A rack of chips, not a column of buttons. Auto-width tiles that
                    wrap read as objects to pick up; full-width rows read as a
                    list to scan, which is the wrong verb for this game. */}
                {!reveal && (
                    <ul className="rack" aria-label="Available output">
                        {round.tiles.map((tile) => (
                            <li key={tile.id}>
                                <button
                                    className={`tile${lastWrong === tile.id ? " wrong" : ""}${
                                        round.hintOutputId === tile.id ? " is-hinted" : ""
                                    }`}
                                    onClick={() => void place(tile.id)}
                                    disabled={busy}
                                    aria-label={round.hintOutputId === tile.id ? `${tile.text}, next (your hint)` : undefined}
                                >
                                    {tile.text}
                                    {round.hintOutputId === tile.id && (
                                        <span className="tile-hint" aria-hidden="true">
                                            next
                                        </span>
                                    )}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                {/* THE HINT: shows the next output, at a stated cost -- the
                    round then banks half. One per round. XP is unchanged. */}
                {!reveal && (
                    <div className="hint-row">
                        <button
                            type="button"
                            className="button ghost small hint-button"
                            disabled={busy || hinting || round.hinted === true}
                            onClick={() => void takeHint()}
                        >
                            {round.hinted ? "Hint used" : "Hint: show the next output"}
                        </button>
                        <span className="hint-cost">
                            {round.hinted ? "This round banks half." : "The round then banks half."}
                        </span>
                    </div>
                )}

                </div>

            {reveal && (
                <div className="reveal" role="status">
                    {reveal.outcome === "round_complete" && (
                        <p className="tag correct">
                            {/* The round score already includes both: doubled for
                                finishing, then halved for the hint. Said in that order. */}
                            Flushed · +{reveal.roundScore}{" "}
                            <span className="mult">{reveal.hinted ? "×2, halved for the hint" : "×2"}</span>
                        </p>
                    )}
                    {reveal.outcome === "wrong" && (
                        <p className="tag incorrect">
                            {/* A distractor is not out of order: it never prints
                                at all, and "Wrong order" sent the learner looking
                                for a sequencing mistake they had not made. */}
                            {neverPrints(reveal) ? "That line never prints" : "Wrong order"} · kept{" "}
                            {reveal.roundScore}
                        </p>
                    )}
                    {/* Two timeouts. The server's (a tile placed just after the
                        deadline) carries the score and the real order; the
                        clock's own carries neither, so it claims neither. */}
                    {reveal.outcome === "timed_out" &&
                        (reveal.roundScore !== null ? (
                            <p className="tag timeout">Out of time · kept {reveal.roundScore}</p>
                        ) : (
                            <>
                                <p className="tag timeout">Out of time</p>
                                <p className="reveal-why">
                                    The round ended before the order was finished. You placed{" "}
                                    {reveal.yourSequence.length} of {round.totalOutputs}{" "}
                                    {round.totalOutputs === 1 ? "line" : "lines"}.
                                </p>
                            </>
                        ))}

                    {/* The teaching moment. Seeing both sequences side by side is
                        what turns "the game screwed me" into "ohhh, microtasks
                        first". Without the real order there is nothing to set
                        beside, so what was placed is shown alone and unmarked. */}
                    {reveal.correctSequence.length === 0 ? (
                        reveal.yourSequence.length > 0 && (
                            <div className="sequences">
                                <div>
                                    <span className="muted">You placed</span>
                                    <ol className="seq">
                                        {reveal.yourSequence.map((t, i) => (
                                            <li key={i}>{t}</li>
                                        ))}
                                    </ol>
                                </div>
                            </div>
                        )
                    ) : (
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
                    )}

                    {/* THE RULE, under the two sequences.
                        The diff above is the evidence; this is the lesson. It
                        names what decided the order rather than restating the
                        order, so it is useful on the NEXT snippet too. */}
                    {reveal.explanation && (
                        <p className="reveal-why">{withCode(reveal.explanation)}</p>
                    )}

                    {/* The learner moves on when they have read it. */}
                    {proceed && (
                        <button className="button primary" autoFocus onClick={proceed.go}>
                            {proceed.complete || round.roundNumber === round.totalRounds
                                ? "See results"
                                : "Next round"}
                        </button>
                    )}
                </div>
            )}
            </div>
        </section>
    );
}

const FLUSH_EXAMPLE = 'console.log("Ready");\nconsole.log(2 + 3);\nconsole.log("Go");';

/**
 * What a beginner needs before their first Flush round.
 *
 * Flush deals only puzzles whose concepts the learner has met (the curriculum
 * gate, server-side), so the first games are about the order plain lines run
 * in -- and the example says exactly that, using nothing a first lesson has
 * not shown. Code that waits, like setTimeout, arrives with the Async topic,
 * and its puzzles explain themselves when they are played.
 */
function FlushHowTo() {
    return (
        <dl className="game-howto">
            <dt>What you are practicing</dt>
            <dd>
                Reading code the way JavaScript runs it: line by line, from the top. Every puzzle
                uses ideas you have already met, and new ones open as you learn more.
            </dd>

            <dt>How to play</dt>
            <dd>
                Read the code. Then tap the outputs in the order they appear, first to last.
            </dd>

            <dt>Example</dt>
            <dd>
                <pre className="prompt">
                    <HighlightedCode code={FLUSH_EXAMPLE} />
                </pre>
                Prints <strong>Ready</strong>, then <strong>5</strong>, then <strong>Go</strong>.
                Each line runs in turn, and a sum is worked out before it is displayed.
            </dd>
        </dl>
    );
}
