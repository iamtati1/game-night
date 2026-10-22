import type { JourneyConcept, JourneyPathResponse, JourneyTopic } from "../api/types.js";
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

export function skillTopics(path: JourneyPathResponse): SkillTopic[] {
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
                href: open ? `/concept/${concept.slug}` : null
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
}

const MAX_LISTED = 3;

export function skillSummary(path: JourneyPathResponse): SkillSummary {
    const all = skillTopics(path).flatMap((t) => t.skills);

    const strengths = all
        .filter((s) => s.state === "demonstrated" && !s.neededRetry)
        .reverse()
        .slice(0, MAX_LISTED);

    const inProgress = all
        .filter((s) => (s.state === "learning" || s.state === "practised") && s.href !== null)
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
        .filter((s) => s.state === "demonstrated" && s.neededRetry)
        .reverse()
        .map((skill) => ({ skill, why: "Shown after a second try: worth a revisit" }));

    const counts: Record<SkillState, number> = { demonstrated: 0, practised: 0, learning: 0, locked: 0 };
    for (const s of all) counts[s.state] += 1;

    return {
        strengths,
        practiseNext: [...inProgress, ...revisit].slice(0, MAX_LISTED),
        counts
    };
}

/** The words for each state, shown beside the icon so colour never carries it alone. */
export const SKILL_STATE_LABEL: Record<SkillState, string> = {
    demonstrated: "Demonstrated",
    practised: "Practised",
    learning: "Learning now",
    locked: "Locked"
};
