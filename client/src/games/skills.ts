import type { ConceptPracticeRecord, JourneyConcept, JourneyPathResponse, JourneyTopic } from "../api/types.js";
import { stepsFor } from "../components/ConceptSteps.js";

/**
 * The Skills hub's reading of the path: what each skill's state is, what the
 * learner has shown, and what is worth practising next.
 *
 * EVERYTHING HERE IS DERIVED FROM GET /api/curriculum/path. No percentages, no
 * confidence scores, nothing the server does not record. The four states map
 * one-to-one onto evidence:
 *
 *     demonstrated   a concept_demonstrations row exists     (state "demonstrated")
 *     practised      at least one stop cleared, not yet shown (rungs.cleared > 0)
 *     learning       the current concept, nothing cleared yet (state "current")
 *     locked         not open, nothing cleared                (state "locked")
 *
 * "Practised" is deliberately weaker than "demonstrated": clearing a stop is
 * practice evidence, and only /demonstrate turns a concept into a shown skill.
 *
 * `neededRetry` is recorded by the client when the learner needed a second
 * attempt on the way to demonstrating. It is shown as "worth a revisit" -- an
 * invitation, never a grade.
 */

export type SkillState = "demonstrated" | "practised" | "learning" | "locked";

export interface Skill {
    slug: string;
    name: string;
    objective: string;
    state: SkillState;
    /** Stops cleared and stops that exist, straight from the server. */
    cleared: number;
    playable: number;
    neededRetry: boolean;
    /** Why a locked skill is locked, in the same words the topic page uses. */
    reason: string | null;
    /** Where the learner can work on this skill now, or null when it is locked. */
    href: string | null;
    /** What the learner has answered on it; null when the record did not load. */
    practice: PracticeReading | null;
}

/* ------------------------------------------------------------ the record --
 *
 * GET /api/curriculum/practice-record counts every graded attempt on content
 * tagged to a concept: Code Blitz answers (a timeout is not right), Bug Hunt
 * incidents, Flush rounds. It is not evidence and moves nothing; the four
 * states above stay the path's. What it adds is how the practice has gone,
 * and only where there is enough of it to say:
 *
 *     accuracy        shown from ACCURACY_FROM answers; below that, counts only
 *     needs practice  the last RECENT answers are in, and NEEDS_PRACTICE_AT_MOST
 *                     or fewer of them were right
 *     trend           ten answers in, and the last five differ from the five
 *                     before by TREND_STEP or more right answers
 *
 * A LOCKED skill is never flagged and shows no trend, only its counts. Code
 * Blitz deals questions from concepts ahead of the learner, so a locked skill
 * can have answers, but it cannot be practised yet and a "needs practice"
 * there would point at a door that does not open.
 *
 * One right answer is never called a strength: strengths stay the
 * demonstrated skills, which the server gates on every stop being cleared.
 * And one skill is never both: a demonstrated skill whose recent answers need
 * work is listed under practise next, not under strengths.
 */
export const ACCURACY_FROM = 5;
export const RECENT = 5;
export const NEEDS_PRACTICE_AT_MOST = 2;
export const TREND_STEP = 2;

export interface PracticeReading {
    attempts: number;
    correct: number;
    /** Whole percent, or null under ACCURACY_FROM answers. */
    accuracy: number | null;
    /** The last RECENT answers, once there are that many. */
    recent: { attempts: number; correct: number } | null;
    needsPractice: boolean;
    trend: { direction: "up" | "down"; recent: number; earlier: number } | null;
}

/** The reading for a skill: counts always, the flag and the trend only when it is open. */
function readingFor(record: ConceptPracticeRecord | undefined, open: boolean): PracticeReading {
    const reading = practiceReading(record);

    return open ? reading : { ...reading, needsPractice: false, trend: null };
}

export function practiceReading(record: ConceptPracticeRecord | undefined): PracticeReading {
    if (!record || record.attempts === 0) {
        return { attempts: 0, correct: 0, accuracy: null, recent: null, needsPractice: false, trend: null };
    }

    const full = (w: { attempts: number }) => w.attempts >= RECENT;
    const recent = full(record.recent) ? record.recent : null;
    const change = record.recent.correct - record.earlier.correct;
    const trend =
        recent && full(record.earlier) && Math.abs(change) >= TREND_STEP
            ? { direction: change > 0 ? ("up" as const) : ("down" as const), recent: record.recent.correct, earlier: record.earlier.correct }
            : null;

    return {
        attempts: record.attempts,
        correct: record.correct,
        accuracy: record.attempts >= ACCURACY_FROM ? Math.round((100 * record.correct) / record.attempts) : null,
        recent,
        needsPractice: recent !== null && recent.correct <= NEEDS_PRACTICE_AT_MOST,
        trend
    };
}

export interface SkillTopic {
    slug: string;
    name: string;
    state: JourneyTopic["state"];
    skills: Skill[];
    /** The topic's checkpoint, when it has one. */
    checkpoint: { state: "demonstrated" | "current" | "locked"; href: string | null } | null;
    demonstrated: number;
}

export function skillStateOf(concept: JourneyConcept): SkillState {
    if (concept.state === "demonstrated") return "demonstrated";
    if (concept.rungs.cleared > 0) return "practised";
    if (concept.state === "current") return "learning";
    return "locked";
}

/**
 * @param record the learner's practice record, or null when it could not be
 *               loaded: then every skill's `practice` is null and nothing
 *               about attempts is said.
 */
export function skillTopics(path: JourneyPathResponse, record: ConceptPracticeRecord[] | null = null): SkillTopic[] {
    const bySlug = new Map((record ?? []).map((r) => [r.slug, r]));

    return path.topics.map((topic) => {
        const reasons = new Map(stepsFor(topic).map((step) => [step.key, step.reason]));

        const skills = topic.concepts.map((concept): Skill => {
            const state = skillStateOf(concept);
            // A concept is open to work on when the server says it is not
            // locked. A locked concept with practice from elsewhere is still
            // locked: its lesson will not open yet.
            const open = concept.state !== "locked";

            return {
                slug: concept.slug,
                name: concept.name,
                objective: concept.objective,
                state,
                cleared: Math.min(concept.rungs.cleared, concept.rungs.playable),
                playable: concept.rungs.playable,
                neededRetry: concept.neededRetry,
                reason: open ? null : (reasons.get(concept.slug) ?? null),
                href: open ? `/concept/${concept.slug}` : null,
                practice: record ? readingFor(bySlug.get(concept.slug), open) : null
            };
        });

        return {
            slug: topic.slug,
            name: topic.name,
            state: topic.state,
            skills,
            checkpoint: topic.challenge
                ? {
                      state: topic.challenge.state,
                      href: topic.challenge.state === "locked" ? null : `/challenge/${topic.slug}`
                  }
                : null,
            demonstrated: skills.filter((s) => s.state === "demonstrated").length
        };
    });
}

export interface SkillSummary {
    /** Skills shown without needing a second attempt, most advanced first. */
    strengths: Skill[];
    /** The skill in progress, then shown skills that needed a second attempt. */
    practiseNext: { skill: Skill; why: string }[];
    counts: Record<SkillState, number>;
    /** Across the record: answers, right answers, and skills with any answer. Null without a record. */
    answered: { attempts: number; correct: number; skills: number } | null;
}

const MAX_LISTED = 3;

export function skillSummary(path: JourneyPathResponse, record: ConceptPracticeRecord[] | null = null): SkillSummary {
    const all = skillTopics(path, record).flatMap((t) => t.skills);

    /* First: open skills whose recent answers say they need work, because
       that is the most specific thing the record can say. */
    const struggling = all
        .filter((s) => s.href !== null && s.practice?.needsPractice)
        .map((skill) => ({
            skill,
            why: `Needs more practice: ${skill.practice!.recent!.correct} of your last ${RECENT} right`
        }));
    const flagged = new Set(struggling.map((s) => s.skill.slug));

    const strengths = all
        .filter((s) => s.state === "demonstrated" && !s.neededRetry && !s.practice?.needsPractice)
        .reverse()
        .slice(0, MAX_LISTED);

    const inProgress = all
        .filter((s) => (s.state === "learning" || s.state === "practised") && s.href !== null && !flagged.has(s.slug))
        .map((skill) => ({
            skill,
            why:
                skill.playable === 0
                    ? "Taught in its lesson"
                    : skill.cleared >= skill.playable
                      ? "Every stop done: ready to show it"
                      : `${skill.playable - skill.cleared} of ${skill.playable} stops left`
        }));

    const revisit = all
        .filter((s) => s.state === "demonstrated" && s.neededRetry && !flagged.has(s.slug))
        .reverse()
        .map((skill) => ({ skill, why: "Shown after a second try: worth a revisit" }));

    const counts: Record<SkillState, number> = { demonstrated: 0, practised: 0, learning: 0, locked: 0 };
    for (const s of all) counts[s.state] += 1;

    const practisedSkills = all.filter((s) => (s.practice?.attempts ?? 0) > 0);

    return {
        strengths,
        practiseNext: [...struggling, ...inProgress, ...revisit].slice(0, MAX_LISTED),
        counts,
        answered: record
            ? {
                  attempts: practisedSkills.reduce((n, s) => n + s.practice!.attempts, 0),
                  correct: practisedSkills.reduce((n, s) => n + s.practice!.correct, 0),
                  skills: practisedSkills.length
              }
            : null
    };
}

/** The words for each state, shown beside the icon so colour never carries it alone. */
export const SKILL_STATE_LABEL: Record<SkillState, string> = {
    demonstrated: "Demonstrated",
    practised: "Practised",
    learning: "Learning now",
    locked: "Locked"
};
