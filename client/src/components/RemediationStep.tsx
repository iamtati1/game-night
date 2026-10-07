import { useState } from "react";
import type { LessonStep } from "../games/lessons.js";
import { withCode } from "./CodeText.js";

/**
 * One authored repair question, judged here rather than on the server.
 *
 * NOTHING THIS SCREEN DOES IS EVIDENCE. Getting the repair right does not clear
 * a rung, record a completion, or touch progress in any way -- it only returns
 * the learner to the question they missed. The rung is cleared by answering THAT
 * question, judged by the server, exactly as before. A repair that counted would
 * let a learner clear a rung without ever solving the thing they got wrong.
 *
 * That is also why it is safe to judge in the browser: the answer being in the
 * page costs nothing when the outcome is worth nothing.
 */
export function RemediationStep({
    step,
    onSolved
}: {
    step: LessonStep;
    /** The learner repaired the idea and is ready to go back. */
    onSolved: () => void;
}) {
    const [chosen, setChosen] = useState<number | null>(null);

    const picked = chosen === null ? null : step.choices[chosen]!;
    const right = picked?.correct === true;

    return (
        <div className="remediation">
            <p className="remediation-label">A simpler one first</p>

            <p className="lesson-ask">{withCode(step.ask)}</p>

            {step.code && (
                <pre className="lesson-code">
                    <code>{step.code}</code>
                </pre>
            )}

            <ul className="lesson-choices">
                {step.choices.map((choice, i) => (
                    <li key={choice.text}>
                        <button
                            className={
                                picked && choice.correct
                                    ? "lesson-choice is-answer"
                                    : picked && i === chosen
                                      ? "lesson-choice is-wrong"
                                      : "lesson-choice"
                            }
                            disabled={picked !== null}
                            onClick={() => setChosen(i)}
                        >
                            {choice.text}
                        </button>
                    </li>
                ))}
            </ul>

            {picked && (
                <div className={`lesson-feedback ${right ? "right" : "wrong"}`} role="status">
                    <p className="lesson-feedback-head">{right ? "Yes" : "Not quite"}</p>
                    <p className="lesson-feedback-body">
                        {withCode(right ? step.confirm : (picked.feedback ?? step.confirm))}
                    </p>

                    {right ? (
                        <button className="button primary big" onClick={onSolved}>
                            Back to the question
                        </button>
                    ) : (
                        <button className="button primary big" onClick={() => setChosen(null)}>
                            Try this one again
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
