import { lessonFor, type LessonStep } from "./lessons.js";

/**
 * The repair a learner is offered after getting a database question wrong.
 *
 * WHY THIS IS A LOOKUP AND NOT CONTENT. `lessons.ts` has carried an authored
 * `retry` on its steps since before the encounter existed: a NEIGHBOURING
 * question at the same rung, written so that repeating the original would not
 * do -- repetition rewards guessing, where a near-miss asks whether the
 * explanation landed. Every taught concept has at least one.
 *
 * Nothing new is authored here and nothing is copied. The database still decides
 * which concept the learner is on, which rung they are at, what the original
 * question is, and whether they got it right. This only answers one question the
 * database cannot: which already-written exercise repairs THIS misunderstanding.
 *
 * CONCEPT-BOUND BY CONSTRUCTION. The remediation comes from the lesson for the
 * concept the learner is already on, so it cannot introduce an unrelated idea.
 * It cannot reach forward either, for the same reason the lesson cannot: both
 * are authored against the same position in the path. A test asserts the
 * forward-dependency rule holds for remediation exactly as it does for
 * curriculum questions.
 *
 * THE RUNG IS PREFERRED, THE CONCEPT IS REQUIRED. A repair at the same demand is
 * the closest match, so it is tried first. Failing that, any authored retry on
 * the same concept is still a simpler related problem at a rung the learner has
 * already reached -- which is what the loop asks for -- and is better than
 * offering nothing. What is never done is leaving the concept.
 */
export function remediationFor(concept: string, demand: string): LessonStep | null {
    const lesson = lessonFor(concept);

    if (!lesson) {
        return null;
    }

    const atRung = lesson.steps.find((s) => s.demand === demand && s.retry);

    if (atRung?.retry) {
        return atRung.retry;
    }

    return lesson.steps.find((s) => s.retry)?.retry ?? null;
}
