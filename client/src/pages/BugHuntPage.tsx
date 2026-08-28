import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "../api/client.js";
import type {
    BugHuntCurrentResponse,
    BugHuntDiagnosisResponse,
    BugHuntHintResponse,
    BugHuntIncident,
    BugHuntLiveResponse,
    ResumableResponse
} from "../api/types.js";
import { ActiveGameConflict } from "../components/ActiveGameConflict.js";
import { Countdown } from "../components/Countdown.js";
import { PausedRun } from "../components/PausedRun.js";
import { ResumeCountdown } from "../components/ResumeCountdown.js";
import { RoundProgress } from "../components/RoundProgress.js";
import { BUG_HUNT, gameBySlug } from "../games/catalog.js";
import { INTEGRITY_COSTS } from "../games/bugHuntIntegrity.js";
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
 * The alert beat before an incident is fetched.
 *
 * Deliberately BEFORE the request, not after. GET /sessions/current is what
 * stamps served_at, so an alert shown once the incident is in hand would run the
 * player's clock down while they read it -- the same three seconds per unit that
 * Code Blitz and Flush were losing. The trade is that this beat cannot name the
 * incident it is announcing; the incident screen's own header does that, for
 * free, once the clock is legitimately running.
 */
export const ALERT_MS = 1900;

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
    const [busy, setBusy] = useState(false);

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
            later(then, ALERT_MS);
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

    // Arrive: show a paused run if one is held, otherwise offer the briefing.
    useEffect(() => {
        let active = true;

        void (async () => {
            try {
                const open = await api.get<ResumableResponse>("/api/me/sessions/resumable");
                const held = open.sessions.find(
                    (s) => s.game.slug === BUG_HUNT && s.status === "paused"
                );

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
            setResuming(false);
            setPaused(false);

            try {
                // POST /sessions serves the first incident, which stamps its
                // clock. So the alert has to be on screen before this call, not
                // after the response lands.

                const data = await api.post<BugHuntCurrentResponse>("/api/bug-hunt/sessions", {
                    fresh
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

                setError(
                    err instanceof ApiError ? err.detailText : "Could not reach the incident feed"
                );
            } finally {
                setBusy(false);
            }
        },
        [applyLive, navigate]
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
            setError(err instanceof ApiError ? err.detailText : "Lost contact with the system");
        }
    }, [applyLive, later, navigate]);

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
            setIncident((prev) => (prev ? { ...prev, hintsUsed: data.hintsUsed } : prev));
            // A trace costs integrity, so the meter has to move now rather than
            // waiting for the next diagnosis to reveal what it already cost.
            setIntegrity(data.systemIntegrity);
        } catch (err) {
            setError(err instanceof ApiError ? err.detailText : "No trace available");
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
            setError(err instanceof ApiError ? err.detailText : "The patch could not be applied");
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

        const next = (incident?.incidentNumber ?? 0) + 1;

        later(
            () => announce(next, next === (incident?.totalIncidents ?? 5), () => void pullNext()),
            FAILURE_MS
        );
    }, [announce, incident, later, pullNext]);

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
            setError(err instanceof ApiError ? err.detailText : "Could not pause the run");
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

    if (error) {
        return (
            <section className="panel narrow">
                <h1>Connection lost</h1>
                <p className="form-error" role="alert">
                    {error}
                </p>
                <button className="button primary" onClick={() => window.location.reload()}>
                    Reconnect
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
            <Briefing busy={busy} onStart={() => announce(1, false, () => void start(false))} />
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

function Briefing({ busy, onStart }: { busy: boolean; onStart: () => void }) {
    return (
        <section className="bh-briefing">
            <p className="bh-alert" role="status">
                <span className="bh-alert-dot" aria-hidden="true" />
                System alert
            </p>

            <h1 className="bh-title">Bug Hunt</h1>
            <p className="bh-tagline">Five incidents detected across production.</p>

            <dl className="bh-brief-stats">
                <div>
                    <dt>Incidents</dt>
                    <dd>5</dd>
                </div>
                <div>
                    <dt>System integrity</dt>
                    <dd>100%</dd>
                </div>
                <div>
                    <dt>Per incident</dt>
                    <dd>2 attempts</dd>
                </div>
            </dl>

            {/* Two lines. Anything longer is a manual, and nobody reads a manual
                to start a game they can learn by playing one round of. */}
            <ol className="bh-rules">
                <li>Read the failing code and find what is actually wrong.</li>
                <li>Stuck? Pull a trace — it costs points, not your attempt.</li>
            </ol>

            <button className="button primary big" disabled={busy} onClick={onStart}>
                {busy ? "Connecting…" : "Start hunt"}
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
    onPause
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
                            <span className="bh-streak-n">{streak}</span>
                        </p>
                    )}

                    <p className="bh-score">
                        <span className="bh-score-value">{score}</span>
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

            {unsupported ? (
                // Loud, not silent. Rendering the wrong interaction would leave the
                // player unable to answer and reasonably blaming themselves.
                <p className="form-error" role="alert">
                    This incident type is not supported by this version of Bug Hunt.
                </p>
            ) : incident.challengeType === "find_line" ? (
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
                    />
                </>
            )}

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
                Locate the fault <span className="bh-legend-sub">— which line is causing this?</span>
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
                                    <input
                                        className="visually-hidden"
                                        type="radio"
                                        name="bh-line"
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

/** choose_patch: the snippet is context, the patches are the decision. */
function PatchChoices({
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
    return (
        <fieldset className="bh-patches" disabled={disabled}>
            <legend className="bh-patches-legend">
                Deploy a patch{" "}
                <span className="bh-legend-sub">— which change will stabilise the service?</span>
            </legend>

            {incident.options.map((option) => {
                const isSelected = selected === option.id;

                return (
                    <label
                        key={option.id}
                        className={`bh-patch${isSelected ? " selected" : ""}`}
                    >
                        <input
                            className="visually-hidden"
                            type="radio"
                            name="bh-patch"
                            checked={isSelected}
                            onChange={() => onSelect(option.id)}
                        />
                        <span className="bh-patch-mark" aria-hidden="true">
                            {isSelected ? "▸" : ""}
                        </span>
                        <code>{option.text}</code>
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
    const heading =
        feedback.outcome === "resolved"
            ? "Patch successful"
            : feedback.outcome === "retry"
              ? "Patch rejected"
              : feedback.timedOut
                ? "Incident unresolved — out of time"
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

            <p className="bh-feedback-voice">
                <span className="bh-voice-tag">System</span>
                {voice}
            </p>

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

            {feedback.explanation && <p className="bh-explanation">{feedback.explanation}</p>}

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
