import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "../api/client.js";
import { activeGameFrom } from "../api/types.js";
import type {
    AnswerResponse,
    CurrentQuestionResponse,
    ServedQuestion,
    StartSessionResponse
} from "../api/types.js";
import { ActiveGameConflict } from "../components/ActiveGameConflict.js";
import { Countdown } from "../components/Countdown.js";

const QUESTION_TIME_LIMIT_MS = 30_000;
const FEEDBACK_MS = 1400;

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

    // Start (or resume) a game on mount.
    useEffect(() => {
        let active = true;

        api.post<StartSessionResponse>("/api/sessions")
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
                const held = err instanceof ApiError ? activeGameFrom(err.body) : null;

                if (held) {
                    setConflict(held);
                    return;
                }

                setError(err instanceof ApiError ? err.detailText : "Could not start a game");
            });

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

            setTimeout(() => {
                setFeedback(null);
                advance(result.question, result.complete, result.session?.id ?? sessionId);
            }, FEEDBACK_MS);
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

            setTimeout(() => {
                setFeedback(null);
                setQuestion(data.question ?? null);
                settling.current = false;
            }, FEEDBACK_MS);
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
            <section className="panel narrow">
                <p className="eyebrow">GAME PAUSED</p>

                <h1>Code Blitz</h1>

                <p className="muted">
                    Your progress is saved.
                </p>

                <div className="panel-actions">
                    <button
                        className="button primary"
                        onClick={() => void handleResume()}
                        disabled={busy}
                    >
                        Resume
                    </button>
                </div>
            </section>
        );
    }

    if (!question) {
        return <p className="muted center">Dealing your questions…</p>;
    }

    return (
        <section className="game">
            <header className="game-bar">
                <span className="progress">
                    Question {question.questionNumber} of {question.totalQuestions}
                </span>
                {/* The award floats out of the score rather than sitting beside it,
                    so the number the player watches is the one that moves. */}
                <span className="score-slot">
                    <span className="score" aria-live="polite">
                        <span key={`s${beat}`} className="score-value">
                            {runningScore}
                        </span>{" "}
                        pts
                    </span>
                    {feedback?.outcome === "correct" && feedback.pointsAwarded > 0 && (
                        <span key={`a${beat}`} className="score-award" aria-hidden="true">
                            +{feedback.pointsAwarded}
                        </span>
                    )}
                </span>

                <button
                    className="button"
                    onClick={() => void handlePause()}
                    disabled={busy || feedback !== null}
                >
                    Pause
                </button>
            </header>

            <Countdown
                deadlineAt={question.deadlineAt}
                totalMs={QUESTION_TIME_LIMIT_MS}
                onExpire={onExpire}
            />

            <pre className="prompt">{question.prompt}</pre>

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
                    <p className="tag timeout">Out of time</p>
                )}
            </div>
        </section>
    );
}
