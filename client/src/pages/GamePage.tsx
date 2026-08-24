import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "../api/client.js";
import { activeGameFrom } from "../api/types.js";
import type {
    AnswerResponse,
    CurrentQuestionResponse,
    ResumableResponse,
    ServedQuestion,
    StartSessionResponse
} from "../api/types.js";
import { ActiveGameConflict } from "../components/ActiveGameConflict.js";
import { Countdown } from "../components/Countdown.js";
import { PausedRun } from "../components/PausedRun.js";
import { CODE_BLITZ } from "../games/catalog.js";
import { RoundProgress } from "../components/RoundProgress.js";
import { splitPrompt } from "../games/prompt.js";

const QUESTION_TIME_LIMIT_MS = 30_000;
/**
 * How long the result stays on screen before the next question arrives.
 *
 * Deliberately not one number. Dwell should scale with how much there is to
 * read: a correct answer carries no new information beyond "yes", so holding the
 * player there is dead time in a game called Blitz. A wrong answer names the
 * answer they missed, and that is the whole teaching moment -- cutting it short
 * to hit a uniform budget would throw away the reason the reveal exists.
 */
const DWELL_MS: Record<Feedback["outcome"], number> = {
    correct: 900,
    incorrect: 1600,
    timed_out: 1400
};

/** Exit animation. Short enough to read as one motion with the entrance. */
const EXIT_MS = 170;

interface Feedback {
    outcome: "correct" | "incorrect" | "timed_out";
    correctOption: string;
    pointsAwarded: number;
    selectedOptionId: string | null;
}

/**
 * How one option should read once the answer is in.
 *
 * The distinction that matters is between `chosen-correct` and `revealed`: before
 * this, both got the same `.correct` class, so "I knew that" and "that was the
 * answer I missed" looked identical. A player could not tell their own success
 * from the game correcting them, which is the single most important thing a
 * feedback moment has to communicate.
 */
type OptionState = "chosen-correct" | "chosen-incorrect" | "revealed" | "muted" | "";

function optionStateFor(
    feedback: Feedback | null,
    option: { id: string; text: string }
): OptionState {
    if (!feedback) {
        return "";
    }

    const chosen = feedback.selectedOptionId === option.id;
    // correctOption is empty when the countdown lapsed rather than the player
    // answering: GET /api/sessions/current does not carry the answer to the
    // question that just expired. Guarding on it keeps an empty string from
    // matching an option and revealing the wrong row.
    const isAnswer = feedback.correctOption !== "" && feedback.correctOption === option.text;

    if (chosen && isAnswer) return "chosen-correct";
    if (chosen) return "chosen-incorrect";
    if (isAnswer) return "revealed";

    return "muted";
}

/** Decorative only -- the banner below carries the same meaning as text. */
const OPTION_GLYPH: Record<OptionState, string> = {
    "chosen-correct": "\u2713",
    "chosen-incorrect": "\u2715",
    revealed: "\u2713",
    muted: "",
    "": ""
};

export function GamePage() {
    const navigate = useNavigate();
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [paused, setPaused] = useState(false);
    /** Where a paused run stopped. Set either from live state when the player
     *  pauses, or from the server when they arrive back on a paused run. */
    const [pausedInfo, setPausedInfo] = useState<{
        unit: string;
        current: number;
        total: number;
        score: number;
    } | null>(null);
    const [question, setQuestion] = useState<ServedQuestion | null>(null);
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const [runningScore, setRunningScore] = useState(0);
    const [conflict, setConflict] = useState<{ slug: string; name: string } | null>(null);
    /** Bumped after abandoning, to re-run the start effect. */
    const [attempt, setAttempt] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    /** Bumped once per adjudicated question. Used purely as a React key so the
     *  award and score animations replay on a repeat of the same value -- two
     *  correct answers worth +130 in a row must animate twice, not once. */
    const [beat, setBeat] = useState(0);

    // Guards against the countdown firing while an answer is already in flight
    // or feedback is on screen.
    const settling = useRef(false);

    /** True while the current question is animating out. */
    const [leaving, setLeaving] = useState(false);

    /**
     * Every pending timeout, so unmounting cannot leave one running.
     *
     * This matters more than tidiness: the sequencing timers call navigate() when
     * a game ends, so one surviving an unmount would redirect a player who had
     * already left the page.
     */
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

    const finish = useCallback(
        (id: string) => {
            navigate(`/results/${id}`, { replace: true });
        },
        [navigate]
    );

    async function handlePause() {
        if (!sessionId || busy) return;

        setBusy(true);

        try {
            await api.post("/api/me/sessions/code-blitz/pause");

            if (question) {
                setPausedInfo({
                    unit: "Question",
                    current: question.questionNumber,
                    total: question.totalQuestions,
                    score: runningScore
                });
            }

            setPaused(true);
        } catch (err) {
            setError(
                err instanceof ApiError
                    ? err.detailText
                    : "Could not pause the game"
            );
        } finally {
            setBusy(false);
        }
    }

    async function handleResume() {
        setError(null);
        setBusy(true);

        try {
            const data = await api.post<StartSessionResponse>("/api/sessions");

            setSessionId(data.sessionId ?? null);
            setQuestion(data.question ?? null);
            setRunningScore(data.scoreSoFar ?? 0);
            setPausedInfo(null);
            setPaused(false);
        } catch (err) {
            setError(
                err instanceof ApiError
                    ? err.detailText
                    : "Could not resume the game"
            );
        } finally {
            setBusy(false);
        }
    }

    // Start, resume, or -- if the player paused this run -- stop and ask.
    useEffect(() => {
        let active = true;

        void (async () => {
            // POST /api/sessions means "start or resume", so arriving on a paused
            // run silently un-paused it and restarted the clock. A pause is a
            // decision; only the player gets to undo it.
            try {
                const open = await api.get<ResumableResponse>("/api/me/sessions/resumable");
                const heldRun = open.sessions.find(
                    (s) => s.game.slug === CODE_BLITZ && s.status === "paused"
                );

                if (!active) return;

                if (heldRun) {
                    setPausedInfo({
                        unit: "Question",
                        current: Math.min(heldRun.unitsDone + 1, heldRun.unitsTotal),
                        total: heldRun.unitsTotal,
                        score: heldRun.score
                    });
                    setPaused(true);
                    return;
                }
            } catch {
                // A failed probe must never stop someone playing: fall through and
                // start the run the way this page always did.
            }

            if (!active) return;

            await api
                .post<StartSessionResponse>("/api/sessions")
                .then((data) => {
                    if (!active) return;

                    if (data.session) {
                        finish(data.session.id);
                        return;
                    }

                    setSessionId(data.sessionId ?? null);
                    setQuestion(data.question ?? null);
                    // Resuming mid-game restores the real banked score rather than
                    // restarting a local tally at zero.
                    setRunningScore(data.scoreSoFar ?? 0);
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

                    setError(
                        err instanceof ApiError ? err.detailText : "Could not start a game"
                    );
                });
        })();

        return () => {
            active = false;
        };
    }, [finish, attempt]);

    const advance = useCallback(
        (next: ServedQuestion | null, complete: boolean, id: string | null) => {
            if (complete && id) {
                finish(id);
                return;
            }

            setQuestion(next);
            settling.current = false;
        },
        [finish]
    );

    async function submit(optionId: string) {
        if (!sessionId || !question || settling.current) return;

        settling.current = true;
        setBusy(true);

        try {
            const result = await api.post<AnswerResponse>(`/api/sessions/${sessionId}/answers`, {
                sessionQuestionId: question.sessionQuestionId,
                selectedOptionId: optionId
            });

            setRunningScore(result.scoreSoFar);
            setBeat((n) => n + 1);
            setFeedback({
                outcome: result.outcome,
                correctOption: result.correctOption,
                pointsAwarded: result.pointsAwarded,
                selectedOptionId: optionId
            });

            // Hold the result, animate the question out, then swap. Three beats
            // rather than one abrupt replacement.
            later(() => {
                setLeaving(true);

                later(() => {
                    setLeaving(false);
                    setFeedback(null);
                    advance(result.question, result.complete, result.session?.id ?? sessionId);
                }, EXIT_MS);
            }, DWELL_MS[result.outcome]);
        } catch (err) {
            settling.current = false;
            setError(err instanceof ApiError ? err.detailText : "Could not submit your answer");
        } finally {
            setBusy(false);
        }
    }

    // When the clock runs out, ask the server for the current question. It
    // adjudicates the expired one as timed_out and hands back the next.
    const onExpire = useCallback(async () => {
        if (settling.current) return;

        settling.current = true;

        try {
            const data = await api.get<CurrentQuestionResponse>("/api/sessions/current");

            if (data.complete && data.session) {
                finish(data.session.id);
                return;
            }

            setRunningScore(data.scoreSoFar ?? 0);
            setBeat((n) => n + 1);
            setFeedback({
                outcome: "timed_out",
                correctOption: "",
                pointsAwarded: 0,
                selectedOptionId: null
            });

            later(() => {
                setLeaving(true);

                later(() => {
                    setLeaving(false);
                    setFeedback(null);
                    setQuestion(data.question ?? null);
                    settling.current = false;
                }, EXIT_MS);
            }, DWELL_MS.timed_out);
        } catch (err) {
            settling.current = false;
            setError(err instanceof ApiError ? err.detailText : "Lost track of the game");
        }
    }, [finish]);

    // Number keys 1-4 answer the question -- it is called Blitz for a reason.
    useEffect(() => {
        function onKey(event: KeyboardEvent) {
            if (!question || settling.current) return;

            const index = Number(event.key) - 1;

            if (Number.isInteger(index) && index >= 0 && index < question.options.length) {
                void submit(question.options[index]!.id);
            }
        }

        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });

    if (conflict) {
        return (
            <ActiveGameConflict
                activeGame={conflict}
                wantedGame="Code Blitz"
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
                <h1>Game interrupted</h1>
                <p className="form-error" role="alert">
                    {error}
                </p>
                <button className="button primary" onClick={() => window.location.reload()}>
                    Try again
                </button>
            </section>
        );
    }

    if (paused) {
        return (
            <PausedRun
                slug={CODE_BLITZ}
                progress={pausedInfo}
                score={pausedInfo?.score ?? runningScore}
                busy={busy}
                onResume={() => void handleResume()}
            />
        );
    }

    if (!question) {
        return <p className="muted center">Dealing your questions…</p>;
    }

    return (
        <section className="game blitz">
            {/* Names the game, reports the score, offers the exit. Three things,
                so the player always knows where they are and how to leave. */}
            <header className="hud">
                <span className="hud-title">Code Blitz</span>

                {/* The award floats out of the score rather than sitting beside it,
                    so the number the player watches is the one that moves. */}
                <span className="score-slot">
                    <span className="hud-label">Score</span>
                    <span className="score" aria-live="polite">
                        <span key={`s${beat}`} className="score-value">
                            {runningScore}
                        </span>
                    </span>
                    {feedback?.outcome === "correct" && feedback.pointsAwarded > 0 && (
                        <span key={`a${beat}`} className="score-award" aria-hidden="true">
                            +{feedback.pointsAwarded}
                        </span>
                    )}
                </span>

                <button
                    className="button ghost small"
                    onClick={() => void handlePause()}
                    disabled={busy || feedback !== null}
                >
                    Pause
                </button>
            </header>

            <RoundProgress
                current={question.questionNumber}
                total={question.totalQuestions}
            />

            <Countdown
                deadlineAt={question.deadlineAt}
                totalMs={QUESTION_TIME_LIMIT_MS}
                onExpire={onExpire}
            />

            {/* Keyed on the question, so React remounts it and the entrance
                animation replays without any state to reset. `leaving` drives the
                exit. Only opacity and transform move, so neither can reflow the
                page mid-answer. */}
            <div
                key={question.sessionQuestionId}
                className={`play-stage${leaving ? " leaving" : ""}`}
            >
                {(() => {
                    const { question: ask, code } = splitPrompt(question.prompt);

                    return (
                        <>
                            {/* The question is a question. It reads in the UI face,
                                at reading size -- monospace was making prose look
                                like output the player had to parse. */}
                            <h1 className="ask">{ask}</h1>
                            {code && <pre className="prompt">{code}</pre>}
                        </>
                    );
                })()}

                <ul className={`options${feedback?.outcome === "timed_out" ? " lapsed" : ""}`}>
                    {question.options.map((option, index) => {
                        const state = optionStateFor(feedback, option);
                        const glyph = OPTION_GLYPH[state];

                        return (
                            <li key={option.id}>
                                <button
                                    className={`option${state ? ` ${state}` : ""}`}
                                    onClick={() => void submit(option.id)}
                                    disabled={busy || feedback !== null}
                                >
                                    <kbd>{index + 1}</kbd>
                                    <span className="option-text">{option.text}</span>
                                    {glyph && (
                                        <span className="option-glyph" aria-hidden="true">
                                            {glyph}
                                        </span>
                                    )}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </div>

            <div className="feedback" role="status">
                {feedback?.outcome === "correct" && (
                    <p className="tag correct">Correct · +{feedback.pointsAwarded}</p>
                )}
                {feedback?.outcome === "incorrect" && (
                    <p className="tag incorrect">Not quite — {feedback.correctOption}</p>
                )}
                {/* No answer is named here on purpose: the timeout path learns of the
                    lapse from GET /api/sessions/current, whose response does not carry
                    the expired question's answer. Naming one would mean inventing it. */}
                {feedback?.outcome === "timed_out" && (
                    <p className="tag timeout lapsed-tag">Time&rsquo;s up</p>
                )}
            </div>
        </section>
    );
}
