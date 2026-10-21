import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { runLittleJs, show, type RunResult } from "../games/littleJs.js";
import { CodeEditor, ConsoleOutput } from "../components/CodeStage.js";
import { withCode } from "../components/CodeText.js";
import { Ship } from "../world/Ship.js";

import { usePageTitle } from "../usePageTitle.js";
import { ACTION } from "../vocabulary.js";
/**
 * EXPERIMENT. Type JavaScript, run it, change it, run it again.
 *
 * The third thing a learner can do with code in Jolt, and the only one with no
 * consequences:
 *
 *   Experiment    free. Nothing is judged, nothing is recorded.
 *   Practice      a movement with a brief, judged on the concept.
 *   Demonstrate   the same, and it clears a rung and becomes evidence.
 *
 * NOTHING HERE TALKS TO THE SERVER. There is no import of the API client in
 * this file and no network call on any path through it -- that is what makes
 * the promise keepable rather than merely intended. Running cannot clear a
 * rung, record a demonstration, award a point or move the learner, because
 * there is nothing here that could.
 *
 * THE SAME INTERPRETER AS EVERYTHING ELSE. `runLittleJs` is the one that runs
 * graded movements, with the same allowlist and the same refusals. A construct
 * the curriculum has not reached is still refused by name here -- the
 * playground is a place to try things, not a way around the sandbox.
 */

/* Enough to show what the place is for, and short enough to delete. */
const STARTER = `let score = 10;

score = score + 5;

score;`;

export function PlaygroundPage() {
    usePageTitle("Experiment");
    const [source, setSource] = useState(STARTER);
    const [result, setResult] = useState<RunResult | null>(null);
    const [running, setRunning] = useState(false);
    const [runs, setRuns] = useState(0);

    /*
     * Two beats, as the mission editor has: the code lights, then the output
     * lands. Instant output reads as a caption printed beside the code; the
     * pause is what makes it read as a consequence of pressing the button.
     */
    const run = useCallback(() => {
        const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

        setRunning(true);

        window.setTimeout(
            () => {
                setResult(runLittleJs(source));
                setRunning(false);
                setRuns((n) => n + 1);
            },
            reduced ? 0 : 260
        );
    }, [source]);

    return (
        <section className="lesson playground">
            <p className="lesson-eyebrow">experiment · nothing is marked here</p>
            <h1 className="lesson-title">Try JavaScript</h1>
            <p className="lesson-why">
                Change the code, run it, and see what happens. Nothing here is graded and
                nothing is recorded: it is yours to break.
            </p>

            <div className="mission-stage">
                <CodeEditor
                    id="playground-code"
                    label="Your code"
                    value={source}
                    onChange={setSource}
                    busy={running}
                    minRows={8}
                />

                <ConsoleOutput
                    lines={result?.output ?? []}
                    busy={running}
                    empty="nothing printed"
                    extra={
                        /*
                         * The value of the last line, shown the way a console
                         * would. Separate from printed output because they are
                         * different things: one is what the program SAID, this
                         * is what the last line WAS.
                         */
                        result?.hasValue ? (
                            <p className="playground-value">
                                <span className="playground-value-tag">value</span>
                                <code>{show(result.value)}</code>
                            </p>
                        ) : null
                    }
                />
            </div>

            {/*
             * The error, in the interpreter's own words. Not remediation, not
             * a hint, not a judgement -- a learner who broke something on
             * purpose should be told plainly what broke.
             */}
            {result?.error && (
                <div className="mission-note playground-error" role="status">
                    <p className="mission-note-body">
                        {result.errorName && (
                            <span className="playground-error-kind">{result.errorName}</span>
                        )}
                        {/* The interpreter writes `names` in backticks, and a
                            learner should see code rather than the marks. */}
                        {withCode(result.error)}
                    </p>

                    {result.trace.length > 0 && (
                        <p className="playground-trace">
                            {result.trace.map((frame) => `at ${frame}`).join("  ·  ")}
                        </p>
                    )}
                </div>
            )}

            <button className="button primary big mission-run" onClick={run} disabled={running}>
                {running ? "Running…" : runs === 0 ? "▶  Run it" : "▶  Run it again"}
            </button>

            <p className="playground-back">
                <Link to="/journey">{ACTION.seeJourney}</Link>
            </p>

            <div className="mission-craft" aria-hidden="true">
                <Ship size={34} rotate={0} />
            </div>
        </section>
    );
}
