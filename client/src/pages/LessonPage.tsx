import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client.js";
import { challengeFor, lessonFor, type LessonStep } from "../games/lessons.js";
import { missionFor } from "../games/missions.js";
import { MissionScene } from "../components/MissionScene.js";
import { sceneLessonFor } from "../games/scenes.js";
import { SceneLesson } from "../components/SceneLesson.js";
import { ConceptComplete } from "../components/ConceptComplete.js";
import { ConceptTeaching } from "../components/ConceptTeaching.js";

/**
 * One concept's lesson: teach, then ask, then answer back.
 *
 *     TEACH  →  step 1  →  step 2  →  …  →  demonstrated
 *                  ↓ wrong
 *              feedback → retry → on
 *
 * NOT TIMED, NOT SCORED, NOT DEALT. There is no clock, no points and no XP here,
 * and the steps are walked in the order they were authored rather than shuffled
 * by a curve. Learning happens before pressure; the games are where pressure
 * belongs.
 *
 * A WRONG ANSWER IS PART OF THE LESSON, not a failure of it. The chosen option
 * carries feedback naming the misconception that leads to it, and the retry is a
 * NEIGHBOURING question rather than the same one again — repeating it rewards
 * guessing, where a near-miss asks whether the explanation landed. Getting a
 * retry wrong explains once more and moves on: being stuck teaches nothing.
 */
/**
 * Renders a lesson OR a topic challenge — the same interaction either way, which
 * is why they share a component and a content type. `topic` in the route means a
 * challenge; `concept` means a lesson. Only where completion is reported differs.
 */
export function LessonPage() {
    const { concept, topic } = useParams<{ concept?: string; topic?: string }>();
    const navigate = useNavigate();
    const lesson = useMemo(
        () => (topic ? challengeFor(topic) : lessonFor(concept ?? null)),
        [concept, topic]
    );

    /** Which authored step we are on. */
    const [index, setIndex] = useState(0);
    /** Reading the teaching, before any question. */
    /**
     * Challenges open straight on the first question: they have no worked
     * examples, and a teach screen with nothing on it is a click for nothing.
     */
    const [phase, setPhase] = useState<"teach" | "ask">("teach");
    /** Set once the learner has answered the step in front of them. */
    const [chosen, setChosen] = useState<number | null>(null);
    /** True while showing the retry of the current step rather than the step. */
    const [retrying, setRetrying] = useState(false);
    /** Recorded for the whole lesson, reported once at the end. */
    const [neededRetry, setNeededRetry] = useState(false);
    const [done, setDone] = useState(false);
    const [busy, setBusy] = useState(false);

    const step: LessonStep | null = useMemo(() => {
        if (!lesson) return null;

        const authored = lesson.steps[index];

        if (!authored) return null;

        return retrying && authored.retry ? { ...authored.retry } : authored;
    }, [lesson, index, retrying]);

    /**
     * Records the completion.
     *
     * Takes the retry flag as an argument rather than reading state: the scene
     * player knows whether a retry happened at the moment it finishes, and a
     * setState would not have flushed by the time this ran.
     */
    const finishWith = useCallback(
        async (retried: boolean) => {
            const done = lesson ?? sceneLessonFor(concept ?? null);

            if (!done) return;

            setBusy(true);

            try {
                await api.post(
                    lesson?.challengeFor
                        ? `/api/curriculum/topics/${lesson.challengeFor}/challenge`
                        : `/api/curriculum/concepts/${"concept" in done ? done.concept : concept}/demonstrate`,
                    { neededRetry: retried }
                );
            } catch {
                // The lesson still happened.
            }

            setDone(true);
            setBusy(false);
        },
        [lesson, concept]
    );

    /**
     * The mission that closes this topic, if one is authored.
     *
     * A topic with a mission is completed by TWO pieces of evidence, not one:
     * the quiz shows the learner can say what code does, the mission shows they
     * can make code do something. They are different capabilities and Jolt asks
     * for both -- so finishing the quiz hands over to the mission rather than
     * recording the topic.
     */
    const mission = useMemo(() => (topic ? missionFor(topic) : null), [topic]);
    const [quizDone, setQuizDone] = useState(false);

    const finish = useCallback(async () => {
        if (!lesson) return;

        setBusy(true);

        try {
            await api.post(
                lesson.challengeFor
                    ? `/api/curriculum/topics/${lesson.challengeFor}/challenge`
                    : `/api/curriculum/concepts/${lesson.concept}/demonstrate`,
                { neededRetry }
            );
        } catch {
            // The lesson still happened. Losing the record is worth a silent
            // retry next time, not an error page over a finished lesson.
        }

        setDone(true);
        setBusy(false);
    }, [lesson, neededRetry]);

    /**
     * Finishing the quiz half. Records nothing on its own -- the topic is only
     * recorded once the mission is passed too, because passing half of the
     * evidence is not the capability.
     */
    const finishQuiz = useCallback(() => {
        if (mission) {
            setQuizDone(true);
            return;
        }

        void finish();
    }, [mission, finish]);

    const advance = useCallback(() => {
        if (!lesson || !step) return;

        const authored = lesson.steps[index]!;
        const wasWrong = chosen !== null && !step.choices[chosen]?.correct;

        // Wrong, and this step has a retry we have not shown yet.
        if (wasWrong && !retrying && authored.retry) {
            setRetrying(true);
            setChosen(null);
            setNeededRetry(true);
            return;
        }

        setRetrying(false);
        setChosen(null);

        if (index + 1 < lesson.steps.length) {
            setIndex(index + 1);
            return;
        }

        finishQuiz();
    }, [lesson, step, index, chosen, retrying, finishQuiz]);

    // The interactive form, where one exists. A concept with a scene lesson gets
    // the scene player; the other twenty keep the prose form, and completion is
    // reported identically either way — the progression layer never learns which
    // shape the learner walked.
    const scenes = useMemo(() => (topic ? null : sceneLessonFor(concept ?? null)), [concept, topic]);

    // Quiz passed, mission still to go. `neededRetry` carries across both
    // halves: struggling anywhere in the topic is one fact about the learner,
    // not two.
    if (mission && quizDone && !done) {
        return (
            <MissionScene
                mission={mission}
                busy={busy}
                onFinish={(retried) => {
                    // finishWith takes the value rather than reading state:
                    // setNeededRetry would not have flushed by the time the
                    // request is built, and this is the one fact the request
                    // carries. Combined with the quiz half, because struggling
                    // anywhere in the topic is one fact about the learner.
                    const struggled = neededRetry || retried;

                    setNeededRetry(struggled);
                    void finishWith(struggled);
                }}
            />
        );
    }

    if (scenes) {
        if (done) {
            return <ConceptComplete concept={scenes.concept} />;
        }

        return (
            <SceneLesson
                lesson={scenes}
                busy={busy}
                onFinish={(retried) => {
                    setNeededRetry(retried);
                    void finishWith(retried);
                }}
            />
        );
    }

    if (!lesson) {
        return (
            <section className="panel narrow">
                <p className="muted">There is no lesson written for that yet.</p>
                <Link className="button primary" to="/journey">
                    Back to your journey
                </Link>
            </section>
        );
    }

    if (done) {
        // Challenges close a topic rather than a concept, so they keep the plain
        // confirmation; ConceptComplete speaks in terms of one capability.
        if (lesson.concept) {
            return <ConceptComplete concept={lesson.concept} />;
        }

        return (
            <section className="complete">
                <p className="complete-mark" aria-hidden="true">
                    ✓
                </p>
                <p className="complete-label">Topic complete</p>
                <h1 className="complete-capability">{lesson.title}</h1>
                <p className="complete-points">
                    <span className="complete-plus">+75</span> points
                </p>
                <button
                    className="button primary big"
                    onClick={() => navigate("/journey")}
                >
                    See what is next
                </button>
            </section>
        );
    }

    // Derived rather than pushed into state during render: a challenge has no
    // worked examples, so its teach phase does not exist rather than being
    // skipped by a setState the renderer would have to run twice for.
    const showing = lesson.teach.length === 0 ? "ask" : phase;

    if (showing === "teach") {
        return (
            <section className="lesson">
                <p className="lesson-eyebrow">
                    {(lesson.challengeFor ?? lesson.concept ?? "").replace(/-/g, " ")}
                </p>
                <h1 className="lesson-title">{lesson.title}</h1>
                <p className="lesson-why">{lesson.why}</p>

                <ConceptTeaching teach={lesson.teach} notice={lesson.notice} />

                <button className="button primary big" onClick={() => setPhase("ask")}>
                    Got it — try one
                </button>
            </section>
        );
    }

    const answered = chosen !== null;
    const picked = answered ? step!.choices[chosen]! : null;
    const right = picked?.correct === true;

    return (
        <section className="lesson">
            <p className="lesson-eyebrow">
                {lesson.title}
                <span className="lesson-progress">
                    {index + 1} / {lesson.steps.length}
                </span>
            </p>

            <p className="lesson-ask">{step!.ask}</p>

            {step!.code && (
                <pre className="lesson-code">
                    <code>{step!.code}</code>
                </pre>
            )}

            <ol className="lesson-choices">
                {step!.choices.map((choice, i) => (
                    <li key={choice.text}>
                        <button
                            className={`lesson-choice${
                                answered && i === chosen ? (right ? " is-right" : " is-wrong") : ""
                            }${answered && choice.correct ? " is-answer" : ""}`}
                            disabled={answered}
                            onClick={() => setChosen(i)}
                        >
                            <code>{choice.text}</code>
                        </button>
                    </li>
                ))}
            </ol>

            {answered && (
                <div className={`lesson-feedback ${right ? "right" : "wrong"}`} role="status">
                    <p className="lesson-feedback-head">
                        {right ? "Yes" : "Not quite"}
                    </p>
                    <p className="lesson-feedback-body">
                        {right ? step!.confirm : (picked?.feedback ?? step!.confirm)}
                    </p>

                    {/* The next idea, introduced while the learner is looking at
                        an example of it rather than sprung on them as a question
                        two steps later. Only after a correct answer: a learner
                        who just got it wrong has one thing to absorb already. */}
                    {right && step!.aside && (
                        <p className="lesson-aside">{step!.aside}</p>
                    )}
                </div>
            )}

            {answered && (
                <button className="button primary big" disabled={busy} onClick={advance}>
                    {!right && !retrying && lesson.steps[index]!.retry
                        ? "Try a similar one"
                        : index + 1 < lesson.steps.length
                          ? "Next"
                          : "Finish"}
                </button>
            )}
        </section>
    );
}
