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

export function GamePage() {
    const navigate = useNavigate();
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [question, setQuestion] = useState<ServedQuestion | null>(null);
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const [runningScore, setRunningScore] = useState(0);
    const [conflict, setConflict] = useState<{ slug: string; name: string } | null>(null);
    /** Bumped after abandoning, to re-run the start effect. */
    const [attempt, setAttempt] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    // Guards against the countdown firing while an answer is already in flight
    // or feedback is on screen.
    const settling = useRef(false);

    const finish = useCallback(
        (id: string) => {
            navigate(`/results/${id}`, { replace: true });
        },
        [navigate]
    );

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

    if (!question) {
        return <p className="muted center">Dealing your questions…</p>;
    }

    return (
        <section className="game">
            <header className="game-bar">
                <span className="progress">
                    Question {question.questionNumber} of {question.totalQuestions}
                </span>
                <span className="score" aria-live="polite">
                    {runningScore} pts
                </span>
            </header>

            <Countdown
                deadlineAt={question.deadlineAt}
                totalMs={QUESTION_TIME_LIMIT_MS}
                onExpire={onExpire}
            />

            <pre className="prompt">{question.prompt}</pre>

            <ul className="options">
                {question.options.map((option, index) => {
                    const chosen = feedback?.selectedOptionId === option.id;
                    const isAnswer =
                        feedback !== null && feedback.correctOption === option.text;

                    let state = "";
                    if (feedback) {
                        if (isAnswer) state = " correct";
                        else if (chosen) state = " incorrect";
                    }

                    return (
                        <li key={option.id}>
                            <button
                                className={`option${state}`}
                                onClick={() => void submit(option.id)}
                                disabled={busy || feedback !== null}
                            >
                                <kbd>{index + 1}</kbd>
                                <span>{option.text}</span>
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
                {feedback?.outcome === "timed_out" && <p className="tag timeout">Out of time</p>}
            </div>
        </section>
    );
}
