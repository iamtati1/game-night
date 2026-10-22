import { useCallback, useMemo, useState } from "react";
import { runLittleJs } from "../games/littleJs.js";
import type { AskScene, Scene, SceneLesson as SceneLessonData } from "../games/scenes.js";
import { Planet } from "../world/Planet.js";

/**
 * Plays a scene lesson: one beat on screen at a time, and nothing explained
 * before the learner has caused it.
 *
 * WHY ONE SCENE PER SCREEN. The previous lesson form put the teaching, the
 * notice line and the first question on one page, so a beginner met four new
 * ideas before choosing anything. Here a scene is the unit: it asks one thing,
 * and the next scene does not exist until this one is done.
 *
 * THE MOTION IS THE TEACHING. Output does not sit next to the code waiting to be
 * read — it is absent until the learner presses RUN, and then it arrives, from
 * the direction of the code, after a beat of "running". That delay is the point:
 * it makes the output a CONSEQUENCE rather than a caption. Everything is behind
 * prefers-reduced-motion, where the same states appear without the travel.
 */
export function SceneLesson({
    lesson,
    onFinish,
    busy
}: {
    lesson: SceneLessonData;
    /** Called once the closing scene is answered. */
    onFinish: (neededRetry: boolean) => void;
    busy: boolean;
}) {
    const [index, setIndex] = useState(0);
    /** Whether this run scene's output has been produced yet. */
    const [ran, setRan] = useState(false);
    const [running, setRunning] = useState(false);
    const [chosen, setChosen] = useState<number | null>(null);
    /** What the learner typed into an edit scene's slot. */
    const [draft, setDraft] = useState("");
    const [retrying, setRetrying] = useState(false);
    const [neededRetry, setNeededRetry] = useState(false);

    const scene = lesson.scenes[index];

    /**
     * Running is three beats, not one.
     *
     *     1. the code lights up      — this line is the thing doing something
     *     2. a pulse travels down    — it is going somewhere
     *     3. the result lands        — and this is where it went
     *
     * Instant output reads as a caption printed beside the code. The delay is
     * what makes it read as a CONSEQUENCE, and the travel is what makes the
     * relationship between the two legible without anyone explaining it. This is
     * the animation doing the teaching rather than decorating it.
     *
     * 900ms total: long enough to follow, short enough that pressing RUN again
     * is not a chore. Reduced motion collapses it to a single beat — the states
     * still differ, they just stop travelling.
     */
    const run = useCallback(() => {
        const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

        setRunning(true);

        window.setTimeout(() => {
            setRunning(false);
            setRan(true);
        }, reduced ? 120 : 900);
    }, []);

    const next = useCallback(() => {
        setRan(false);
        setRunning(false);
        setChosen(null);
        setRetrying(false);
        setDraft("");

        if (index + 1 < lesson.scenes.length) {
            setIndex(index + 1);
            return;
        }

        onFinish(neededRetry);
    }, [index, lesson.scenes.length, neededRetry, onFinish]);

    if (!scene) return null;

    return (
        <section className="scene">
            {/* Always on screen, always answering "what am I learning?". It also
                names the PLACE — Values is a topic today and is meant to become
                somewhere the learner goes. Keeping the topic in the frame from
                the first lesson means that later change is a visual one rather
                than a new concept to introduce. */}
            <header className="scene-place">
                {/* The same planet art the map uses, at badge size. A lesson is
                    somewhere you ARE, and carrying its world into the header is
                    what connects this screen to the station you launched from. */}
                <Planet slug={lesson.place.toLowerCase()} state="here" size={26} />
                <span className="scene-place-topic">{lesson.place}</span>
                <span className="scene-place-sep" aria-hidden="true">
                    /
                </span>
                <span className="scene-place-lesson">{lesson.title}</span>
            </header>

            <SceneProgress current={index} total={lesson.scenes.length} />

            {scene.kind === "moment" && (
                <div className="scene-moment">
                    {scene.eyebrow && <p className="scene-eyebrow">{scene.eyebrow}</p>}
                    <h2 className="scene-moment-head">{scene.headline}</h2>
                    {scene.lines.map((line) => (
                        <p className="scene-moment-line" key={line}>
                            {line}
                        </p>
                    ))}
                    <button className="button primary big" onClick={next} disabled={busy}>
                        {scene.action}
                    </button>
                </div>
            )}

            {scene.kind === "edit" && (
                <EditBeat
                    scene={scene}
                    draft={draft}
                    setDraft={setDraft}
                    ran={ran}
                    running={running}
                    onRun={run}
                    onNext={next}
                    busy={busy}
                />
            )}

            {scene.kind === "run" && (
                <RunBeat
                    scene={scene}
                    ran={ran}
                    running={running}
                    onRun={run}
                    onNext={next}
                    busy={busy}
                />
            )}

            {scene.kind === "reveal" && (
                <div className="scene-reveal">
                    <h2 className="scene-headline">{scene.headline}</h2>
                    <pre className="scene-code is-quiet">
                        <code>{scene.code}</code>
                    </pre>
                    <dl className="scene-parts">
                        {scene.parts.map((part) => (
                            <div className="scene-part" key={part.piece}>
                                <dt>
                                    <code>{part.piece}</code>
                                </dt>
                                <dd>{part.means}</dd>
                            </div>
                        ))}
                    </dl>
                    <button className="button primary big" onClick={next} disabled={busy}>
                        Got it
                    </button>
                </div>
            )}

            {scene.kind === "ask" && (
                <AskBeat
                    scene={retrying && scene.retry ? { ...scene.retry, kind: "ask" } : scene}
                    parent={scene}
                    chosen={chosen}
                    retrying={retrying}
                    busy={busy}
                    onChoose={setChosen}
                    onAdvance={() => {
                        const shown =
                            retrying && scene.retry ? { ...scene.retry, kind: "ask" as const } : scene;
                        const wrong = chosen !== null && !shown.choices[chosen]?.correct;

                        if (wrong && !retrying && scene.retry) {
                            setRetrying(true);
                            setChosen(null);
                            setNeededRetry(true);
                            return;
                        }

                        next();
                    }}
                />
            )}
        </section>
    );
}

/**
 * The scene where the learner changes the code themselves -- and can keep
 * changing it.
 *
 * The slot is a single input sitting inside the code line, styled as part of it
 * rather than as a form field, so what they are editing reads as the program,
 * not as a box next to the program.
 *
 * REALLY RUN. The line is executed by littleJs, the same sandboxed interpreter
 * the missions and the Experiment page use (no eval, a step budget), so what
 * appears is what JavaScript does with what they typed -- including when what
 * they typed breaks the line: a stray quote mark gets JavaScript's own complaint,
 * worded for a beginner, which is a real thing to discover. It used to echo the
 * typed text back, which was only true for well-formed input.
 *
 * AS MANY TIMES AS THEY LIKE. Cause and effect is learnt by repeating it: change
 * the word, run, see it follow. The slot stays editable after a run and the run
 * button stays, so the loop is the learner's to repeat; Next moves on when they
 * are ready. Nothing is scored, timed or recorded.
 */
function EditBeat({
    scene,
    draft,
    setDraft,
    ran,
    running,
    onRun,
    onNext,
    busy
}: {
    scene: Extract<Scene, { kind: "edit" }>;
    draft: string;
    setDraft: (value: string) => void;
    ran: boolean;
    running: boolean;
    onRun: () => void;
    onNext: () => void;
    busy: boolean;
}) {
    const typed = draft === "" ? scene.initial : draft;
    const [before, after] = scene.template.split("{slot}");
    /** The version last run: the result describes this, not the live draft. */
    const [executed, setExecuted] = useState<string | null>(null);

    const result = useMemo(
        () => (executed === null ? null : runLittleJs(`${before}${executed}${after}`)),
        [executed, before, after]
    );
    const changedSinceRun = executed !== null && typed !== executed;

    const runIt = () => {
        setExecuted(typed);
        onRun();
    };

    return (
        <>
            <p className="scene-invite">{scene.invite}</p>

            <div className="scene-stage">
                <p className={`scene-code scene-editable${running ? " is-running" : ""}`}>
                    <span>{before}</span>
                    <input
                        className="scene-slot"
                        value={draft}
                        placeholder={scene.initial}
                        aria-label={scene.hint}
                        maxLength={24}
                        size={Math.max(typed.length, 5)}
                        disabled={running}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && !running && !busy) runIt();
                        }}
                    />
                    <span>{after}</span>
                </p>

                {(running || ran) && (
                    <p
                        className={`scene-arrow${running ? " is-travelling" : ""}`}
                        aria-hidden="true"
                    >
                        ↓
                    </p>
                )}

                <div className="scene-console" aria-live="polite">
                    <span className="scene-console-tag">console</span>
                    {ran && result && !running ? (
                        result.error ? (
                            <p className="scene-console-error">{result.error}</p>
                        ) : (
                            <pre className="scene-output">
                                <code>{result.output.join("\n")}</code>
                            </pre>
                        )
                    ) : (
                        <p className="scene-console-empty">
                            {running ? "running…" : "nothing yet"}
                        </p>
                    )}
                </div>
            </div>

            {!ran ? (
                <button
                    className="button primary big scene-run"
                    onClick={runIt}
                    disabled={running || busy}
                >
                    {running ? "Running…" : "▶  Run your version"}
                </button>
            ) : (
                <>
                    {!running && result && (
                        <p className="scene-after">
                            {result.error
                                ? "That line could not run. Put the quote marks back around your word and run it again."
                                : scene.after}
                        </p>
                    )}
                    <div className="scene-edit-actions">
                        <button
                            className={`button ${changedSinceRun ? "primary" : "ghost"} big`}
                            onClick={runIt}
                            disabled={running || busy}
                        >
                            {changedSinceRun ? "▶  Run your change" : "▶  Run it again"}
                        </button>
                        <button
                            className={`button ${changedSinceRun ? "ghost" : "primary"} big`}
                            onClick={onNext}
                            disabled={running || busy || Boolean(result?.error)}
                        >
                            Next
                        </button>
                    </div>
                </>
            )}
        </>
    );
}

/** Where the learner is, as beats rather than a percentage. */
function SceneProgress({ current, total }: { current: number; total: number }) {
    return (
        <ol className="scene-beats" aria-label={`Step ${current + 1} of ${total}`}>
            {Array.from({ length: total }, (_, i) => (
                <li
                    key={i}
                    className={`scene-beat${i < current ? " is-done" : ""}${
                        i === current ? " is-now" : ""
                    }`}
                />
            ))}
        </ol>
    );
}

function RunBeat({
    scene,
    ran,
    running,
    onRun,
    onNext,
    busy
}: {
    scene: Extract<Scene, { kind: "run" }>;
    ran: boolean;
    running: boolean;
    onRun: () => void;
    onNext: () => void;
    busy: boolean;
}) {
    return (
        <>
            <p className="scene-invite">{scene.invite}</p>

            <div className="scene-stage">
                <pre className={`scene-code${running ? " is-running" : ""}`}>
                    <code>{scene.code}</code>
                </pre>

                {/* The arrow exists only once something has travelled along it. */}
                {(running || ran) && (
                    <p
                        className={`scene-arrow${running ? " is-travelling" : ""}`}
                        aria-hidden="true"
                    >
                        ↓
                    </p>
                )}

                <div className="scene-console">
                    <span className="scene-console-tag">console</span>
                    {ran ? (
                        <pre className="scene-output">
                            <code>{scene.output}</code>
                        </pre>
                    ) : (
                        <p className="scene-console-empty">
                            {running ? "running…" : "nothing yet"}
                        </p>
                    )}
                </div>
            </div>

            {!ran ? (
                <button
                    className="button primary big scene-run"
                    onClick={onRun}
                    disabled={running || busy}
                >
                    {running ? "Running…" : "▶  Run it"}
                </button>
            ) : (
                <>
                    <p className="scene-after">{scene.after}</p>
                    <button className="button primary big" onClick={onNext} disabled={busy}>
                        Next
                    </button>
                </>
            )}
        </>
    );
}

function AskBeat({
    scene,
    parent,
    chosen,
    retrying,
    busy,
    onChoose,
    onAdvance
}: {
    scene: AskScene;
    parent: AskScene;
    chosen: number | null;
    retrying: boolean;
    busy: boolean;
    onChoose: (i: number) => void;
    onAdvance: () => void;
}) {
    const answered = chosen !== null;
    const picked = answered ? scene.choices[chosen] : null;
    const right = picked?.correct === true;

    return (
        <>
            <p className="scene-ask">{scene.ask}</p>

            {scene.code && (
                <pre className="scene-code is-quiet">
                    <code>{scene.code}</code>
                </pre>
            )}

            <ol className="scene-choices">
                {scene.choices.map((choice, i) => (
                    <li key={choice.text}>
                        <button
                            className={`scene-choice${
                                answered && i === chosen ? (right ? " is-right" : " is-wrong") : ""
                            }${answered && choice.correct ? " is-answer" : ""}`}
                            disabled={answered || busy}
                            onClick={() => onChoose(i)}
                        >
                            <code>{choice.text}</code>
                        </button>
                    </li>
                ))}
            </ol>

            {answered && (
                <div className={`scene-feedback ${right ? "right" : "wrong"}`} role="status">
                    <p className="scene-feedback-head">{right ? "Yes" : "Not quite"}</p>
                    <p className="scene-feedback-body">
                        {right ? scene.confirm : (picked?.feedback ?? scene.confirm)}
                    </p>
                    {right && scene.aside && <p className="scene-aside">{scene.aside}</p>}
                </div>
            )}

            {answered && (
                <button className="button primary big" onClick={onAdvance} disabled={busy}>
                    {!right && !retrying && parent.retry ? "Try another" : "Next"}
                </button>
            )}
        </>
    );
}
