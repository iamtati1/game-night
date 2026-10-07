import { useCallback, useMemo, useState } from "react";
import { Planet } from "../world/Planet.js";
import { Ship } from "../world/Ship.js";
import { attempt, type Mission } from "../games/missions.js";
import { withCode } from "./CodeText.js";
import { CodeEditor, ConsoleOutput } from "./CodeStage.js";

/**
 * The demonstration that closes a topic.
 *
 * Everything the learner has done up to here has asked them to say what code
 * does. This asks them to make code do something -- and it is the only place in
 * Jolt where they type JavaScript and watch it actually run.
 *
 * THE SCREEN HAS ONE INSTRUCTION, ONE EDITOR, ONE BUTTON. No score, no timer,
 * no attempt counter, no progress percentage. A learner who is stuck should be
 * looking at their code and the one sentence telling them what to try next --
 * not at anything measuring them.
 *
 * FAILURE IS A NOTE, NOT A VERDICT. `check` returns the single next thing to
 * try, phrased specifically, and the Run button stays exactly where it was.
 * Nothing is deducted and nothing is locked. The only record a miss leaves is
 * `neededRetry`, which exists to make later practice better.
 */
export function MissionScene({
    mission,
    busy,
    onFinish
}: {
    mission: Mission;
    busy: boolean;
    /** Called once every movement is satisfied. */
    onFinish: (neededRetry: boolean) => void;
}) {
    const [index, setIndex] = useState(0);
    const movement = mission.movements[index]!;

    const [source, setSource] = useState(movement.starter);
    const [result, setResult] = useState<ReturnType<typeof attempt> | null>(null);
    const [running, setRunning] = useState(false);
    const [neededRetry, setNeededRetry] = useState(false);

    const solved = result?.ok === true;

    /**
     * Running is two beats, not one: the code lights while it runs, then the
     * output lands. Instant output reads as a caption printed beside the code;
     * the delay is what makes it read as a consequence of pressing the button.
     * Collapsed to a single frame under reduced motion.
     */
    const run = useCallback(() => {
        const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

        setRunning(true);

        window.setTimeout(
            () => {
                const outcome = attempt(movement, source);

                setResult(outcome);
                setRunning(false);

                if (!outcome.ok) setNeededRetry(true);
            },
            reduced ? 0 : 420
        );
    }, [movement, source]);

    const next = useCallback(() => {
        if (index + 1 < mission.movements.length) {
            const following = mission.movements[index + 1]!;

            setIndex(index + 1);
            setSource(following.starter);
            setResult(null);

            return;
        }

        onFinish(neededRetry);
    }, [index, mission.movements, neededRetry, onFinish]);

    // The console shows what the program printed, even when the movement was
    // not satisfied -- seeing your own wrong output is most of the lesson.
    const printed = useMemo(() => result?.run.output ?? [], [result]);

    return (
        <section className="mission">
            <header className="scene-place">
                <Planet slug={mission.topic} state="here" size={26} />
                <span className="scene-place-topic">{mission.place}</span>
                <span className="scene-place-sep" aria-hidden="true">
                    /
                </span>
                <span className="scene-place-lesson">{mission.title}</span>
            </header>

            <ol className="scene-beats" aria-label={`Step ${index + 1} of ${mission.movements.length}`}>
                {mission.movements.map((_, i) => (
                    <li
                        key={i}
                        className={`scene-beat${i < index ? " is-done" : ""}${
                            i === index ? " is-now" : ""
                        }`}
                    />
                ))}
            </ol>

            <p className="scene-ask">{withCode(movement.brief)}</p>

            <div className="mission-stage">
                <CodeEditor
                    id="mission-code"
                    label="Your code"
                    value={source}
                    onChange={setSource}
                    busy={running}
                    disabled={running || solved}
                />

                <ConsoleOutput lines={printed} busy={running} />
            </div>

            {/* The note, when there is one. Never labelled "wrong". */}
            {result && !result.ok && result.note && (
                <div className="mission-note" role="status">
                    <p className="mission-note-body">{withCode(result.note)}</p>
                </div>
            )}

            {solved && (
                <div className="mission-note is-solved" role="status">
                    <p className="mission-note-body">{withCode(movement.after)}</p>
                </div>
            )}

            {solved ? (
                <button className="button primary big" onClick={next} disabled={busy}>
                    {index + 1 < mission.movements.length ? "Next" : "Finish the check"}
                </button>
            ) : (
                <button
                    className="button primary big mission-run"
                    onClick={run}
                    disabled={running || busy}
                >
                    {running ? "Running…" : "▶  Run it"}
                </button>
            )}

            {/* The craft is present throughout, doing nothing, waiting. It
                departs on the Journey map once this is finished. */}
            <div className="mission-craft" aria-hidden="true">
                <Ship size={34} rotate={0} />
            </div>
        </section>
    );
}
