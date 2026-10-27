import { useCallback, useEffect, useRef, useState } from "react";
import { play } from "../games/sound.js";
import { plainIdea } from "../games/lessons.js";
import { useNavigate } from "react-router-dom";
import { PaceChoice } from "../components/PaceChoice.js";
import { usePace } from "../games/usePace.js";
import { ApiError, api, isUnreachable } from "../api/client.js";
import type {
    BugHuntCurrentResponse,
    BugHuntDiagnosisResponse,
    BugHuntHintResponse,
    BugHuntIncident,
    BugHuntLiveResponse,
    ResumableResponse
} from "../api/types.js";
import { ActiveGameConflict } from "../components/ActiveGameConflict.js";
import { NotReady, readinessFrom, type Readiness } from "../components/NotReady.js";
import { Countdown } from "../components/Countdown.js";
import { PausedRun } from "../components/PausedRun.js";
import { GetReady } from "../components/GetReady.js";
import { RoundProgress } from "../components/RoundProgress.js";
import { BUG_HUNT, gameBySlug } from "../games/catalog.js";
import { INTEGRITY_COSTS } from "../games/bugHuntIntegrity.js";
import { usePageTitle } from "../usePageTitle.js";
import { ACTION, startGame } from "../vocabulary.js";
import { usePauseOnLeave } from "../games/usePauseOnLeave.js";
import {
    TIMER_LABELS,
    alertLine,
    failedLine,
    recoverableLine,
    resolvedLine,
    runPhase,
    retryLine,
    severityLabel
} from "../games/bugHuntVoice.js";
import { Explanation } from "../components/Explanation.js";

/**
 * How long the outcome of an incident stays on screen before the next one is
 * fetched.
 *
 * This beat is load-bearing, not decoration. The next incident's clock starts
 * when the SERVER hands it over, so fetching it early would burn the player's
 * time while they were still reading why their last patch worked. The client
 * therefore holds here, then pulls GET /sessions/current when it is ready to
 * render -- which is the whole reason the diagnosis response does not carry the
 * next incident.
 */
export const RECOVERY_MS = 2600;

/** A failed incident earns a longer look: there is a correct answer to read. */
export const FAILURE_MS = 4200;

/**
 * Incidents in a full hunt, as the briefing states it. The server decides
 * (BUG_HUNT_INCIDENTS_PER_SESSION); BugHuntPage.test.tsx pins this to it, so
 * the briefing cannot again say ten while the server deals six. A learner with
 * fewer bugs open is dealt a shorter run, so the briefing says "up to" and the
 * run's own counter shows the dealt total.
 */
export const INCIDENTS_PER_HUNT = 6;

/**
 * The alert beat before an incident is fetched.
 *
 * Deliberately BEFORE the request, not after. GET /sessions/current is what
 * stamps served_at, so an alert shown once the incident is in hand would run the
 * player's clock down while they read it -- the same three seconds per unit that
 * Code Blitz and Flush were losing. The trade is that this beat cannot name the
 * incident it is announcing; the incident screen's own header does that, for
 * free, once the clock is legitimately running.
 */
export const ALERT_MS = 1100;

/** The last incident's beat keeps its full length: it is the one moment of drama. */
export const BOSS_ALERT_MS = 1900;

/** One step of the diagnostic run. Three of these, so ~1.1s total. */
export const CHECK_STEP_MS = 380;

type Phase =
    | "loading"
    | "briefing"
    /** Something is wrong -- shown before the incident is requested. */
    | "alert"
    | "investigating"
    /** The patch has been submitted and judged; the run is being played back. */
    | "diagnostic"
    /** Wrong once, incident still open. The clock never stopped. */
    | "retry"
    | "resolved"
    | "failed"
    | "restored";

interface Feedback {
    outcome: "resolved" | "retry" | "failed";
    explanation: string;
    points: number;
    streak: number;
    attemptsRemaining: number;
    /** True when the incident ended because the clock ran out rather than
     *  because the player was wrong twice. Different feeling, different copy. */
    timedOut: boolean;
}

export function BugHuntPage() {
    usePageTitle("Bug Hunt");
    const navigate = useNavigate();
    const game = gameBySlug(BUG_HUNT);

    const [phase, setPhase] = useState<Phase>("loading");
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [incident, setIncident] = useState<BugHuntIncident | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const [score, setScore] = useState(0);
    const [integrity, setIntegrity] = useState(100);
    const [streak, setStreak] = useState(0);
    const [hints, setHints] = useState<{ order: number; text: string }[]>([]);
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    /**
     * The server's verdict, held back while the diagnostic run plays.
     *
     * The POST happens first and this is its answer -- the run on screen is a
     * presentation of a decision already made, never a computation. Animating
     * first and submitting after would let the clock expire during the player's
     * own success sequence.
     */
    const [pending, setPending] = useState<BugHuntDiagnosisResponse | null>(null);
    /** What the alert beat is announcing. Known from the run's position alone --
     *  no incident data is needed, and none has been fetched yet. */
    const [incoming, setIncoming] = useState<{ number: number; isBoss: boolean }>({
        number: 1,
        isBoss: false
    });
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
    // Whether `error` is a lost connection, as opposed to a request the server
    // answered and refused. Only the first is worth offering to reconnect.
    const [offline, setOffline] = useState(false);
    // The server's "nothing here for you yet": a readiness answer, not a fault,
    // and -- when the current concept has one -- where to debug instead.
    const [notReady, setNotReady] = useState<Readiness | null>(null);

    const failed = useCallback((err: unknown, fallback: string) => {
        setOffline(!(err instanceof ApiError) || isUnreachable(err));
        setError(err instanceof ApiError ? err.detailText : fallback);
    }, []);
    const [busy, setBusy] = useState(false);
    const [timed, setTimed] = usePace();

    /** Guards the window between submitting and the outcome landing, so a double
     *  click cannot spend the second attempt on the first click's answer. */
    const settling = useRef(false);
    const timers = useRef<number[]>([]);

    const later = useCallback((fn: () => void, ms: number) => {
        timers.current.push(window.setTimeout(fn, ms));
    }, []);
    const clearTimers = useCallback(() => {
        timers.current.forEach(window.clearTimeout);
        timers.current = [];
    }, []);


    // Leaving mid-run pauses it, so the clock stops and the run waits for
    // Resume -- see usePauseOnLeave.
    usePauseOnLeave(BUG_HUNT, sessionId !== null && !paused && !resuming && phase !== "loading" && phase !== "briefing" && phase !== "restored");
    useEffect(() => () => clearTimers(), [clearTimers]);

    /**
     * Puts the alert on screen, then runs the fetch once it has been read.
     *
     * The ordering is the whole point: the beat happens while nothing is served,
     * so the incident's clock starts when the incident appears rather than when
     * the player started reading about it.
     */
    const announce = useCallback(
        (number: number, isBoss: boolean, then: () => void) => {
            setIncoming({ number, isBoss });
            setFeedback(null);
            setPhase("alert");
            later(then, isBoss ? BOSS_ALERT_MS : ALERT_MS);
        },
        [later]
    );

    /** Applies whatever the server just said about the run. */
    const applyLive = useCallback((data: BugHuntLiveResponse) => {
        setSessionId(data.sessionId);
        setIncident(data.incident);
        setScore(data.scoreSoFar);
        setIntegrity(data.systemIntegrity);
        setStreak(data.streak ?? 0);
        setSelected(null);
        setFeedback(null);
        // Hints are per-incident. The count comes back from the server; the text
        // of anything already revealed does not, so a resumed incident starts its
        // ladder visually empty while the server still remembers the cost.
        setHints([]);
        setPhase("investigating");
        settling.current = false;
    }, []);

    // Arrive: show a paused run if one is held, otherwise offer the briefing --
    // or, when no run can be dealt, say why before anything is pressed.
    useEffect(() => {
        let active = true;

        void (async () => {
            /** Any unfinished hunt -- paused or live -- is always resumable, so
             *  readiness is only asked when there is none. Unknown if the probe
             *  failed, and then it is not asked either. */
            let noRun = false;

            try {
                const open = await api.get<ResumableResponse>("/api/me/sessions/resumable");
                const held = open.sessions.find(
                    (s) => s.game.slug === BUG_HUNT && s.status === "paused"
                );
                noRun = !open.sessions.some((s) => s.game.slug === BUG_HUNT);

                if (!active) return;

                if (held) {
                    setPausedInfo({
                        unit: "Incident",
                        current: Math.min(held.unitsDone + 1, held.unitsTotal),
                        total: held.unitsTotal,
                        score: held.score
                    });
                    setPaused(true);
                    setPhase("briefing");
                    return;
                }
            } catch {
                // A failed probe must not stop someone playing.
            }

            if (!active) return;

            // The same answer the start route would give (GET /readiness shares
            // its function), asked up front so the reason is on screen at once
            // rather than after the alert beat. A failure changes nothing --
            // Start still asks.
            if (noRun) {
                try {
                    const readiness = await api.get<{
                        ready: boolean;
                        message: string | null;
                        practice: { slug: string; name: string } | null;
                    }>("/api/bug-hunt/readiness");

                    if (!active) return;

                    if (!readiness.ready && readiness.message) {
                        setNotReady({ message: readiness.message, practice: readiness.practice });
                    }
                } catch {
                    // Start will ask again.
                }
            }

            if (!active) return;
            setPhase("briefing");
        })();

        return () => {
            active = false;
        };
    }, []);

    const start = useCallback(
        async (fresh: boolean) => {
            setBusy(true);
            setError(null);
            setNotReady(null);
            setResuming(false);
            setPaused(false);

            try {
                // POST /sessions serves the first incident, which stamps its
                // clock. So the alert has to be on screen before this call, not
                // after the response lands.

                // `relaxed` shapes only a newly dealt hunt; a resumed one keeps
                // the time limits its rounds were dealt with.
                const data = await api.post<BugHuntCurrentResponse>("/api/bug-hunt/sessions", {
                    fresh,
                    relaxed: !timed
                });

                if (data.complete) {
                    navigate(`/bug-hunt/results/${data.session.id}`, { replace: true });
                    return;
                }

                applyLive(data);
            } catch (err) {
                if (err instanceof ApiError && err.status === 409) {
                    const body = err.body as { activeGame?: { slug: string; name: string } };

                    if (body?.activeGame) {
                        setConflict(body.activeGame);
                        return;
                    }
                }

                const readiness = readinessFrom(err, "Not enough to hunt yet");
                if (readiness) {
                    setNotReady(readiness);
                    return;
                }

                failed(err, "Could not reach the incident feed");
            } finally {
                setBusy(false);
            }
        },
        [applyLive, failed, navigate, timed]
    );

    /**
     * Pulls the next incident once the recovery beat is over.
     *
     * Deliberately a separate request from the diagnosis. GET /sessions/current
     * is what stamps served_at, so calling it here -- and only here -- means the
     * countdown the player is shown is the countdown they actually get.
     */
    const pullNext = useCallback(async () => {
        try {
            // Same rule as start(): by the time this runs the alert has already
            // been shown, so the clock starts with the incident on screen.

            const data = await api.get<BugHuntCurrentResponse>("/api/bug-hunt/sessions/current");

            if (data.complete) {
                setPhase("restored");
                later(
                    () => navigate(`/bug-hunt/results/${data.session.id}`, { replace: true }),
                    1800
                );
                return;
            }

            applyLive(data);
        } catch (err) {
            failed(err, "Lost contact with the system");
        }
    }, [applyLive, failed, later, navigate]);

    async function revealHint() {
        if (!sessionId || !incident || busy) return;
        setBusy(true);

        try {
            const data = await api.post<BugHuntHintResponse>(
                `/api/bug-hunt/sessions/${sessionId}/diagnoses`,
                { action: "reveal-hint", roundId: incident.roundId }
            );

            // The server decides which rung this is and what it says. The client
            // only ever appends what it is handed.
            setHints((prev) => [...prev, data.hint]);
            play("hint", `${incident.roundId}:${data.hint.order}`);
            setIncident((prev) => (prev ? { ...prev, hintsUsed: data.hintsUsed } : prev));
            // A trace costs integrity, so the meter has to move now rather than
            // waiting for the next diagnosis to reveal what it already cost.
            setIntegrity(data.systemIntegrity);
        } catch (err) {
            failed(err, "No trace available");
        } finally {
            setBusy(false);
        }
    }

    async function diagnose() {
        if (!sessionId || !incident || !selected || settling.current) return;

        settling.current = true;
        setBusy(true);

        try {
            const data = await api.post<BugHuntDiagnosisResponse>(
                `/api/bug-hunt/sessions/${sessionId}/diagnoses`,
                { action: "diagnose", roundId: incident.roundId, optionId: selected }
            );

            // Judged. Now play it back -- see the note on `pending`.
            setPending(data);
            setPhase("diagnostic");
        } catch (err) {
            settling.current = false;
            failed(err, "The patch could not be applied");
        } finally {
            setBusy(false);
        }
    }

    /** Runs once the diagnostic finishes, with the verdict the server already gave. */
    function applyVerdict(data: BugHuntDiagnosisResponse) {
        if (!incident) return;

        try {
            setScore(data.scoreSoFar);
            setIntegrity(data.systemIntegrity);
            setStreak(data.streak);
            setPending(null);
            setFeedback({
                outcome: data.outcome,
                explanation: data.explanation,
                points: data.pointsAwarded,
                streak: data.streak,
                attemptsRemaining: data.attemptsRemaining,
                timedOut: false
            });
            play(
                data.outcome === "resolved" ? "correct" : "incorrect",
                `${incident.roundId}:${data.attemptsRemaining}:${data.outcome}`
            );
            if (data.complete) later(() => play("complete", sessionId ?? undefined), 900);

            if (data.outcome === "retry") {
                // The incident stays open and the clock keeps running. Only the
                // selection is cleared, so the player can act on the clue.
                setIncident((prev) =>
                    prev ? { ...prev, attemptsRemaining: data.attemptsRemaining } : prev
                );
                setSelected(null);
                setPhase("retry");
                settling.current = false;
                return;
            }

            setPhase(data.outcome === "resolved" ? "resolved" : "failed");

            if (data.complete) {
                later(() => setPhase("restored"), data.outcome === "resolved" ? 1400 : 2400);
                later(
                    () => navigate(`/bug-hunt/results/${sessionId}`, { replace: true }),
                    (data.outcome === "resolved" ? 1400 : 2400) + 1800
                );
                return;
            }

            const next = incident.incidentNumber + 1;

            later(
                () => announce(next, next === incident.totalIncidents, () => void pullNext()),
                data.outcome === "resolved" ? RECOVERY_MS : FAILURE_MS
            );
        } finally {
            setBusy(false);
        }
    }

    /** How to move on after a timeout, held until the learner presses Continue. */
    const [afterTimeout, setAfterTimeout] = useState<(() => void) | null>(null);

    /**
     * The countdown hit zero on screen.
     *
     * Cosmetic only: the server has already decided this incident is lost, from
     * its own served_at. Asking it for the current state is what makes that
     * official, and it is what moves the run on.
     */
    const handleExpire = useCallback(() => {
        if (settling.current) return;
        settling.current = true;

        setFeedback({
            outcome: "failed",
            explanation: "",
            points: 0,
            streak: 0,
            attemptsRemaining: 0,
            timedOut: true
        });
        setStreak(0);
        setPhase("failed");
        play("incorrect", `timeout:${incident?.roundId ?? ""}`);

        const next = (incident?.incidentNumber ?? 0) + 1;

        // HELD, NOT TIMED. This moved on by itself after 4.2 seconds, so a
        // timeout was the one loss a learner could not stop to read. The next
        // incident is not fetched until they press on, so no clock runs.
        setAfterTimeout(() => () =>
            announce(next, next === (incident?.totalIncidents ?? 5), () => void pullNext())
        );
    }, [announce, incident, pullNext]);

    async function handlePause() {
        if (!sessionId || busy) return;
        setBusy(true);
        clearTimers();

        try {
            await api.post(`/api/me/sessions/${BUG_HUNT}/pause`);

            if (incident) {
                setPausedInfo({
                    unit: game?.unit ?? "Incident",
                    current: incident.incidentNumber,
                    total: incident.totalIncidents,
                    score
                });
            }

            setPaused(true);
        } catch (err) {
            failed(err, "Could not pause the run");
        } finally {
            setBusy(false);
        }
    }

    // ------------------------------------------------------------- gates

    if (conflict) {
        return (
            <ActiveGameConflict
                activeGame={conflict}
                wantedGame="Bug Hunt"
                onAbandoned={() => {
                    setConflict(null);
                    void start(false);
                }}
            />
        );
    }

    if (notReady) {
        return (
            <NotReady
                title="Not enough for a hunt yet"
                readiness={notReady}
                practiceLabel={(name) => `Find a bug in ${name}`}
                // Lessons on the Journey open bugs here, as do Code Blitz
                // questions -- the learning path is the way in named first.
                other={{ to: "/journey", label: ACTION.seeJourney }}
            />
        );
    }

    if (error) {
        return (
            <section className="panel narrow">
                <h1>{offline ? "Connection lost" : "Something went wrong"}</h1>
                <p className="form-error" role="alert">
                    {error}
                </p>
                <button className="button primary" onClick={() => window.location.reload()}>
                    {offline ? "Reconnect" : "Try again"}
                </button>
            </section>
        );
    }

    if (resuming) {
        return <GetReady onDone={() => void start(false)} />;
    }

    if (paused) {
        return (
            <PausedRun
                slug={BUG_HUNT}
                progress={pausedInfo}
                score={pausedInfo?.score ?? score}
                busy={busy}
                onResume={() => setResuming(true)}
            />
        );
    }

    if (phase === "loading") {
        return <p className="muted center">Scanning for incidents…</p>;
    }

    if (phase === "briefing") {
        return (
            <Briefing
                busy={busy}
                timed={timed}
                onTimedChange={setTimed}
                onStart={() => announce(1, false, () => void start(false))}
            />
        );
    }

    if (phase === "alert") {
        return <AlertBeat number={incoming.number} isBoss={incoming.isBoss} />;
    }

    if (phase === "restored") {
        return (
            <section className="bh-restored" role="status">
                <p className="bh-restored-mark" aria-hidden="true">
                    ✓
                </p>
                <h1>System restored</h1>
                <p className="muted">Compiling incident report…</p>
            </section>
        );
    }

    if (!incident) {
        return <p className="muted center">Scanning for incidents…</p>;
    }

    return (
        <IncidentScreen
            /* Remount per incident. It already happened by accident -- the alert
               beat's early return unmounts this subtree between hunts, which is
               the only reason deadlineAt re-derives instead of carrying the
               previous hunt's expired clock. Saying it explicitly makes that
               correctness intentional rather than a side effect of a sibling
               phase, and it is what lets the incident animate in. */
            key={incident.roundId}
            incident={incident}
            phase={phase}
            feedback={feedback}
            pending={pending}
            onVerdict={() => pending && applyVerdict(pending)}
            selected={selected}
            hints={hints}
            score={score}
            integrity={integrity}
            streak={streak}
            busy={busy}
            onSelect={setSelected}
            onDiagnose={() => void diagnose()}
            onHint={() => void revealHint()}
            onExpire={handleExpire}
            onPause={() => void handlePause()}
            onContinue={
                afterTimeout
                    ? () => {
                          const go = afterTimeout;
                          setAfterTimeout(null);
                          go();
                      }
                    : null
            }
        />
    );
}

/* --------------------------------------------------------------------- alert */

/**
 * The beat between incidents.
 *
 * Names no service and quotes no code, because nothing has been fetched yet --
 * see the note on ALERT_MS. What it does carry is the one thing known from
 * position alone: whether the thing about to land is the last one.
 */
function AlertBeat({ number, isBoss }: { number: number; isBoss: boolean }) {
    return (
        <section className={`bh-alert-beat${isBoss ? " is-boss" : ""}`} role="status">
            <p className="bh-alert-siren" aria-hidden="true">
                <span className="bh-alert-ring" />
            </p>

            <p className="bh-alert-kicker">
                {isBoss ? "Critical system failure" : `Incident ${number} incoming`}
            </p>

            <p className="bh-alert-voice">
                <span className="bh-voice-tag">System</span>
                {alertLine(number, isBoss)}
            </p>
        </section>
    );
}

/* ------------------------------------------------------------------ briefing */

function Briefing({
    busy,
    timed,
    onTimedChange,
    onStart
}: {
    busy: boolean;
    timed: boolean;
    onTimedChange: (timed: boolean) => void;
    onStart: () => void;
}) {
    return (
        <section className="bh-briefing">
            <p className="bh-alert" role="status">
                <span className="bh-alert-dot" aria-hidden="true" />
                System alert
            </p>

            <h1 className="bh-title">Bug Hunt</h1>
            {/* Same wording as the other games' intros (GameIntro). */}
            <p className="game-intro-counts course">Counts toward your course</p>
            <p className="bh-tagline">Up to {INCIDENTS_PER_HUNT} incidents detected across production.</p>

            {/* One instruction, then the game. The stats table repeated the
                tagline (incidents) and a starting 100% that the meter shows
                on the first incident; the rules a first hunt can do without
                are one click away, and the trace's cost is also on its
                button at the moment it is spent. */}
            <p className="bh-instruction">
                Read the failing code and find what is actually wrong. Two attempts per incident.
            </p>

            <details className="bh-howto">
                <summary>How Bug Hunt works</summary>
                <ol className="bh-rules">
                    {/* Relaxed needs no line of its own: the pace choice below
                        already says "No timer". */}
                    {timed && <li>The first incidents are untimed. Later ones are not.</li>}
                    {/* What a trace really costs: the server takes points off
                        the incident's score AND integrity -- never an attempt. */}
                    <li>
                        Stuck? Pull a trace: it costs a little score and{" "}
                        {INTEGRITY_COSTS[2]!.cost}% integrity, never an attempt.
                    </li>
                    <li>
                        System integrity starts at 100%. A failed patch costs{" "}
                        {INTEGRITY_COSTS[1]!.cost}%, a lost incident {INTEGRITY_COSTS[0]!.cost}%.
                    </li>
                </ol>
            </details>

            <PaceChoice timed={timed} onChange={onTimedChange} clock="later incidents have a time limit" />

            <button className="button primary big" disabled={busy} onClick={onStart}>
                {busy ? "Connecting…" : startGame("Bug Hunt")}
            </button>
        </section>
    );
}

/* ------------------------------------------------------------------ incident */

interface IncidentScreenProps {
    incident: BugHuntIncident;
    phase: Phase;
    feedback: Feedback | null;
    pending: BugHuntDiagnosisResponse | null;
    onVerdict: () => void;
    selected: string | null;
    hints: { order: number; text: string }[];
    score: number;
    integrity: number;
    streak: number;
    busy: boolean;
    onSelect: (id: string) => void;
    onDiagnose: () => void;
    onHint: () => void;
    onExpire: () => void;
    onPause: () => void;
    /** Moving on after a timeout; null unless one is waiting for the learner. */
    onContinue: (() => void) | null;
}

function IncidentScreen({
    incident,
    phase,
    feedback,
    pending,
    onVerdict,
    selected,
    hints,
    score,
    integrity,
    streak,
    busy,
    onSelect,
    onDiagnose,
    onHint,
    onExpire,
    onPause,
    onContinue
}: IncidentScreenProps) {
    /** Can the player still act? Actions hide the moment a patch is submitted. */
    const live = phase === "investigating" || phase === "retry";

    /**
     * Is the incident's clock still running?
     *
     * Wider than `live` on purpose. The diagnostic takes over a second, and a
     * rejected patch leaves the incident open with the clock still going -- so
     * hiding the countdown during the run would spend the player's time where
     * they could not see it. It disappears only once the round has actually
     * ended.
     */
    const clockRunning = live || phase === "diagnostic";

    /**
     * The opening hunts have no deadline, so they get no countdown.
     *
     * Not a hidden one or a very long one -- none. A bar on screen is the game
     * saying "you are being timed", and for these hunts that would be a lie.
     */
    const timed = incident.remainingMs !== null && incident.timeLimitMs !== null;
    const hintsLeft = incident.hintsAvailable - incident.hintsUsed;

    // Derived once, at the moment the incident is rendered, so the countdown does
    // not restart every time a hint or a wrong answer re-renders the screen.
    const [deadlineAt] = useState(() =>
        new Date(Date.now() + (incident.remainingMs ?? 0)).toISOString()
    );

    const unsupported =
        incident.challengeType !== "find_line" && incident.challengeType !== "choose_patch";

    return (
        <section className={`bh-incident${incident.isBoss ? " is-boss" : ""}`}>
            <header className="bh-head">
                <div className="bh-head-left">
                    {incident.isBoss ? (
                        <p className="bh-critical" role="status">
                            <span aria-hidden="true">⚠</span> Critical system failure
                        </p>
                    ) : (
                        <div>
                            <p className="bh-phase">
                                {runPhase(incident.incidentNumber, incident.totalIncidents)}
                            </p>
                            <RoundProgress
                                current={incident.incidentNumber}
                                total={incident.totalIncidents}
                                unit="Hunt"
                            />
                        </div>
                    )}
                </div>

                <div className="bh-head-right">
                    <IntegrityMeter value={integrity} />
                    {/* Streak is the emotional mechanic, so it gets its own
                        element and holds its space -- it was rendering as a small
                        suffix that only appeared above one, which is exactly when
                        a player has nothing invested in it yet. */}
                    {streak > 0 && (
                        <p className={`bh-streak-badge${streak >= 3 ? " hot" : ""}`}>
                            <span aria-hidden="true">🔥</span>
                            <span className="bh-streak-n" key={streak}>{streak}</span>
                        </p>
                    )}

                    <p className="bh-score">
                        <span className="bh-score-value" key={score}>{score}</span>
                    </p>
                    <button
                        className="button ghost small"
                        disabled={busy || !live}
                        onClick={onPause}
                    >
                        Pause
                    </button>
                </div>
            </header>

            {clockRunning && timed && (
                <Countdown
                    deadlineAt={deadlineAt}
                    totalMs={incident.timeLimitMs!}
                    onExpire={onExpire}
                    statusLabels={TIMER_LABELS}
                />
            )}

            {/* Two presentations, chosen by whether the curriculum knows what
                this incident teaches.

                A curriculum-linked incident gets the beginner layout: one line
                saying what should have happened, and then the code. The theme,
                the severity word, the incident title and the error log are all
                removed -- not restyled -- because each one is something a
                learner has to read and discard before reaching the only thing
                that can actually be debugged. The concept's name is the single
                orienting label, and it says what is being learned rather than
                which fictional service is on fire.

                A legacy incident keeps the report it was written for. Fifty of
                them open on a production narrative that carries real
                information, and stripping that would leave them incoherent. */}
            {incident.concept ? (
                <div className="bh-report is-learning">
                    <p className="bh-learning-concept">{incident.concept.name}</p>
                    <p className="bh-expected">{incident.bugReport}</p>
                </div>
            ) : (
                <div className="bh-report">
                    <p className="bh-theme">
                        {incident.theme}
                        {/* Severity was being dropped entirely: the server sends
                            difficulty 1-5 and nothing rendered it. A word sets
                            expectations where a number out of five would not. */}
                        <span className={`bh-severity sev-${incident.difficulty}`}>
                            {severityLabel(incident.difficulty)}
                        </span>
                    </p>
                    <h1 className="bh-incident-title">{incident.title}</h1>
                    <p className="bh-bug-report">{incident.bugReport}</p>

                    {incident.errorLog && (
                        <pre className="bh-error-log">
                            <code>{incident.errorLog}</code>
                        </pre>
                    )}
                </div>
            )}

            {/* THE ARENA: the code and the way to answer it. On a wide screen
                it takes most of the width and the report, traces, actions and
                feedback sit in a column beside it (world.css); on a phone the
                order is unchanged. One wrapper, no behaviour. */}
            <div className="bh-arena">
            {unsupported ? (
                // Loud, not silent. Rendering the wrong interaction would leave the
                // player unable to answer and reasonably blaming themselves.
                <p className="form-error" role="alert">
                    This incident type is not supported by this version of Bug Hunt.
                </p>
            ) : incident.challengeType === "find_line" && linesIdentifyOptions(incident) ? (
                <CodeLines
                    incident={incident}
                    selected={selected}
                    disabled={!live}
                    onSelect={onSelect}
                />
            ) : (
                <>
                    <pre className="bh-code readonly">
                        <code>{incident.code}</code>
                    </pre>
                    <PatchChoices
                        incident={incident}
                        selected={selected}
                        disabled={!live}
                        onSelect={onSelect}
                        findFault={incident.challengeType === "find_line"}
                    />
                </>
            )}

            </div>

            {hints.length > 0 && (
                <ol className="bh-hints">
                    {hints.map((hint) => (
                        <li key={hint.order}>
                            <span className="bh-hint-tag">Trace {hint.order}</span>
                            {hint.text}
                        </li>
                    ))}
                </ol>
            )}

            {phase === "diagnostic" && pending && (
                <DiagnosticRun theme={incident.theme} passed={pending.correct} onDone={onVerdict} />
            )}

            {feedback && <FeedbackPanel feedback={feedback} incident={incident} />}

            {feedback?.timedOut && onContinue && (
                <button className="button primary" autoFocus onClick={onContinue}>
                    Continue
                </button>
            )}

            {/* Selecting is an act, not a form entry -- it gets an
                acknowledgement of its own before anything is submitted. */}
            {live && selected && (
                <p className="bh-targeted" role="status">
                    <span className="bh-targeted-mark" aria-hidden="true">◎</span>
                    {incident.challengeType === "find_line" ? "Fault targeted" : "Patch staged"}
                </p>
            )}

            {live && (
                <div className="bh-actions">
                    {/* Secondary on purpose: the hint must not compete with the
                        thing the player is actually here to do. */}
                    <button
                        className="button ghost"
                        disabled={busy || hintsLeft <= 0}
                        onClick={onHint}
                    >
                        {/* The cost rides on the button rather than living in a
                            permanent legend. This is the one moment the player
                            needs the number, and it is the moment they are
                            deciding whether to spend it. */}
                        {busy
                            ? "Tracing…"
                            : hintsLeft > 0
                              ? `Trace  −${INTEGRITY_COSTS[2]!.cost}%`
                              : "No traces left"}
                    </button>

                    {/* The label carries the state. Before a target is picked
                        there is nothing to test, and saying so beats a button
                        that is simply dead. */}
                    <button
                        className="button primary"
                        disabled={busy || !selected || unsupported}
                        onClick={onDiagnose}
                    >
                        {selected ? "Test patch" : "Select a target"}
                    </button>
                </div>
            )}
        </section>
    );
}

/* ------------------------------------------------------- challenge renderers */

/**
 * Whether clicking a line can name exactly one option.
 *
 * The beginner incidents are one-line programs whose wrong answer is a
 * sentence ("The quotation marks around Hello") filed on the same line as the
 * fault. Clicking line 1 then had two candidates, the later one won, and the
 * correct answer could not be chosen at all. When lines do not identify the
 * options one-to-one, the options are listed instead -- as the lesson shows
 * the same incident.
 */
export function linesIdentifyOptions(incident: Pick<BugHuntIncident, "options">): boolean {
    const lines = incident.options.map((o) => o.lineNumber);

    return lines.every((n) => typeof n === "number") && new Set(lines).size === lines.length;
}

/**
 * find_line: the snippet itself is the answer sheet.
 *
 * Radio inputs, visually hidden but really there -- so arrow keys, tab order and
 * screen readers all work without reimplementing any of it, while what the
 * player sees is a numbered listing they click straight into.
 */
function CodeLines({
    incident,
    selected,
    disabled,
    onSelect
}: {
    incident: BugHuntIncident;
    selected: string | null;
    disabled: boolean;
    onSelect: (id: string) => void;
}) {
    const lines = incident.code.split("\n");
    const byLine = new Map(incident.options.map((o) => [o.lineNumber, o]));

    return (
        <fieldset className="bh-code-fieldset" disabled={disabled}>
            {/* Visible, not screen-reader-only. It was hidden, and the snippet
                alone does not tell anyone that the lines are the answer -- the
                choose_patch renderer has always shown its instruction, and this
                one needs it more, not less. */}
            <legend className="bh-patches-legend">
                Locate the fault. <span className="bh-legend-sub">Which line is causing this?</span>
            </legend>

            <ol className="bh-code">
                {lines.map((line, index) => {
                    const number = index + 1;
                    const option = byLine.get(number);
                    const isSelected = option ? selected === option.id : false;

                    return (
                        <li
                            key={number}
                            className={[
                                "bh-line",
                                option ? "selectable" : "inert",
                                isSelected ? "selected" : ""
                            ]
                                .filter(Boolean)
                                .join(" ")}
                        >
                            <span className="bh-line-no" aria-hidden="true">
                                {String(number).padStart(2, "0")}
                            </span>

                            {option ? (
                                <label className="bh-line-label">
                                    {/* Named explicitly, not only by wrapping, and
                                        valued with the same words: inspection tools
                                        print a radio's value as its name, and the
                                        default value is "on". */}
                                    <input
                                        className="visually-hidden"
                                        type="radio"
                                        name="bh-line"
                                        value={`Line ${number}: ${line.trim() || "blank"}`}
                                        aria-label={`Line ${number}: ${line.trim() || "blank"}`}
                                        checked={isSelected}
                                        onChange={() => onSelect(option.id)}
                                    />
                                    <code>{line || " "}</code>
                                    {/* Not colour alone: selection also carries a
                                        mark and the radio's own checked state. */}
                                    <span className="bh-line-mark" aria-hidden="true">
                                        {isSelected ? "▸" : ""}
                                    </span>
                                </label>
                            ) : (
                                <code className="bh-line-label">{line || " "}</code>
                            )}
                        </li>
                    );
                })}
            </ol>
        </fieldset>
    );
}

/** choose_patch: the snippet is context, the patches are the decision. Also
 *  find_line when its lines cannot name the options (see linesIdentifyOptions). */
function PatchChoices({
    incident,
    selected,
    disabled,
    onSelect,
    findFault = false
}: {
    incident: BugHuntIncident;
    selected: string | null;
    disabled: boolean;
    onSelect: (id: string) => void;
    findFault?: boolean;
}) {
    return (
        <fieldset className="bh-patches" disabled={disabled}>
            {findFault ? (
                <legend className="bh-patches-legend">
                    Locate the fault. <span className="bh-legend-sub">What is causing this?</span>
                </legend>
            ) : (
                <legend className="bh-patches-legend">
                    Deploy a patch.{" "}
                    <span className="bh-legend-sub">Which change will stabilise the service?</span>
                </legend>
            )}

            {incident.options.map((option) => {
                const isSelected = selected === option.id;

                return (
                    <label
                        key={option.id}
                        className={`bh-patch${isSelected ? " selected" : ""}`}
                    >
                        {/* Named explicitly by its visible text, not only by
                            wrapping, and valued with it: inspection tools print
                            a radio's value as its name, and the default is "on". */}
                        <input
                            className="visually-hidden"
                            type="radio"
                            name="bh-patch"
                            value={option.text}
                            aria-labelledby={`bh-option-${option.id}`}
                            checked={isSelected}
                            onChange={() => onSelect(option.id)}
                        />
                        <span className="bh-patch-mark" aria-hidden="true">
                            {isSelected ? "▸" : ""}
                        </span>
                        <code id={`bh-option-${option.id}`}>{option.text}</code>
                    </label>
                );
            })}
        </fieldset>
    );
}

/* ---------------------------------------------------------------- diagnostic */

/**
 * The patch being tested, played back one check at a time.
 *
 * Presentation only: the verdict arrived from the server before this mounted,
 * and `passed` is that verdict. Nothing here evaluates anything, and no code is
 * executed -- these are the stages a real patch pipeline runs, in order.
 *
 * The check names deliberately avoid the incident's bug category. Naming it
 * ("checking async ordering") would tell the player what kind of bug they are
 * looking at, which is a free hint dressed up as scenery -- so the stages
 * describe the pipeline, not the fault.
 */
function DiagnosticRun({
    theme,
    passed,
    onDone
}: {
    theme: string;
    passed: boolean;
    onDone: () => void;
}) {
    const checks = [
        "Reproducing the failure",
        `Applying patch to ${theme}`,
        "Running regression checks"
    ];

    const [step, setStep] = useState(0);

    useEffect(() => {
        if (step > checks.length) return;

        const id = window.setTimeout(
            () => (step === checks.length ? onDone() : setStep((n) => n + 1)),
            CHECK_STEP_MS
        );

        return () => window.clearTimeout(id);
    }, [step, checks.length, onDone]);

    return (
        <div className="bh-diagnostic" role="status" aria-live="polite">
            <p className="bh-diagnostic-head">Running diagnostic…</p>

            <ol className="bh-checks">
                {checks.map((check, index) => {
                    // The last check is the one that fails, so a rejected patch
                    // reads as "it got all the way to the tests and did not hold"
                    // rather than as the pipeline refusing to start.
                    const isLast = index === checks.length - 1;
                    const done = index < step;
                    const failedHere = done && isLast && !passed;

                    return (
                        <li
                            key={check}
                            className={[
                                "bh-check",
                                done ? "done" : "waiting",
                                failedHere ? "failed" : ""
                            ]
                                .filter(Boolean)
                                .join(" ")}
                        >
                            <span className="bh-check-mark" aria-hidden="true">
                                {!done ? "·" : failedHere ? "✕" : "✓"}
                            </span>
                            {check}
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}

/* ------------------------------------------------------------------ feedback */

function FeedbackPanel({
    feedback,
    incident
}: {
    feedback: Feedback;
    incident: BugHuntIncident;
}) {
    // Plain words for a curriculum incident. "Patch rejected" is in-world and
    // fine for an ops narrative, but a learner who has just misread three lines
    // of JavaScript is being told off in a vocabulary they came here to learn.
    const learning = incident.concept !== null;

    const heading = learning
        ? feedback.outcome === "resolved"
            ? "That's it"
            : feedback.outcome === "retry"
              ? "Not quite: look again"
              : feedback.timedOut
                ? "Out of time"
                : "Here's what was happening"
        : feedback.outcome === "resolved"
          ? "Patch successful"
          : feedback.outcome === "retry"
            ? "Patch rejected"
            : feedback.timedOut
              ? "Incident unresolved: out of time"
              : "Incident unresolved";

    // One line from the system, chosen by position and outcome rather than at
    // random, so a run never repeats itself and a test can pin what it says.
    const voice =
        feedback.outcome === "resolved"
            ? resolvedLine(incident.incidentNumber, feedback.streak)
            : feedback.outcome === "retry"
              ? retryLine(incident.incidentNumber)
              : failedLine(incident.incidentNumber, feedback.timedOut);

    /** After a loss, and never on the last incident, where it would be a lie. */
    const showRecoverable =
        feedback.outcome === "failed" && incident.incidentNumber < incident.totalIncidents;

    return (
        <div className={`bh-feedback ${feedback.outcome}`} role="status" aria-live="polite">
            <p className="bh-feedback-head">
                {/* A mark as well as a colour, so the state does not depend on
                    being able to distinguish green from amber. */}
                <span className="bh-feedback-mark" aria-hidden="true">
                    {feedback.outcome === "resolved" ? "✓" : "✕"}
                </span>
                {heading}
            </p>

            {/* The in-world system voice is flavour. On a curriculum incident it
                sits between the learner and the explanation that teaches them
                something, so it is dropped rather than shortened -- the
                explanation below is the feedback. */}
            {!learning && (
                <p className="bh-feedback-voice">
                    <span className="bh-voice-tag">System</span>
                    {voice}
                </p>
            )}

            {/* The rule the code broke, in the curriculum's own words. Shown
                whatever the outcome: a learner who guessed right still benefits
                from being told why it was right. */}
            {learning && (
                <p className="bh-feedback-rule">{plainIdea(incident.concept!.slug, incident.concept!.meaning)}</p>
            )}

            {feedback.outcome === "resolved" && (
                <p className="bh-feedback-score">
                    <strong>+{feedback.points}</strong>
                    {feedback.streak > 1 && <span className="bh-streak">Streak ×{feedback.streak}</span>}
                </p>
            )}

            {feedback.outcome === "retry" && (
                <p className="bh-attempts">
                    {feedback.attemptsRemaining} attempt
                    {feedback.attemptsRemaining === 1 ? "" : "s"} left on incident{" "}
                    {incident.incidentNumber}.
                </p>
            )}

            {feedback.explanation && <Explanation className="bh-explanation" text={feedback.explanation} />}

            {/* A timeout has no explanation to show here: the server reveals
                the fix only for an incident it has closed, and closing this one
                also deals the next. The mission report lists it, so say where
                rather than leaving the learner with nothing. */}
            {feedback.timedOut && (
                <p className="bh-explanation">
                    This one counts as not fixed. The fix, and why it works, are in your
                    mission report at the end of the hunt.
                </p>
            )}

            {/* A loss is where a player is most likely to stop, so the system
                hands them a reason to keep going rather than leaving them with
                it. Never after the last incident, where it would not be true. */}
            {showRecoverable && <p className="bh-recoverable">{recoverableLine()}</p>}
        </div>
    );
}

/* ----------------------------------------------------------------- integrity */

function IntegrityMeter({ value }: { value: number }) {
    const tier = value >= 80 ? "stable" : value >= 50 ? "degraded" : "critical";
    const label = value >= 80 ? "Online" : value >= 50 ? "Degraded" : "Critical";

    return (
        <div className={`bh-integrity ${tier}`}>
            <div className="bh-integrity-track">
                <div className="bh-integrity-fill" style={{ width: `${value}%` }} />
            </div>
            {/* The word carries the state as well as the bar, so the meter is not
                purely a length-and-colour signal. */}
            <p className="bh-integrity-label">
                <span className="bh-integrity-word">{label}</span>
                <span className="bh-integrity-value">{value}%</span>
            </p>

        </div>
    );
}
