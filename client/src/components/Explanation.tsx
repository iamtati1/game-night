import { explanationParts } from "../games/explanation.js";
import { withCode } from "./CodeText.js";

/**
 * An answer's explanation, led by its rule (games/explanation.ts).
 *
 * The lead is emphasised so a learner who reads one sentence reads the right
 * one. A third sentence or more sits in a native <details>: keyboard and
 * screen-reader operable with no script, and closed by default, because it
 * is the part most learners skip.
 */
export function Explanation({ text, className }: { text: string; className: string }) {
    const { lead, rest, more } = explanationParts(text);

    return (
        <div className={`explain ${className}`}>
            <p className="explain-lead">{withCode(lead)}</p>
            {rest && <p>{withCode(rest)}</p>}
            {more && (
                <details className="explain-more">
                    <summary>More on why</summary>
                    <p>{withCode(more)}</p>
                </details>
            )}
        </div>
    );
}
