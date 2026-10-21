import type { JourneyConcept, JourneyPathResponse, JourneyTopic } from "../api/types.js";
import { ACTION, continueTo } from "../vocabulary.js";

/**
 * What the journey is telling the learner, stated in words rather than colour.
 *
 * THE PROBLEM THIS SOLVES. The map already draws four states -- charted worlds,
 * the one you orbit, the concepts under it, and the worlds ahead -- and a
 * first-time player could read every one of them and still not answer "when
 * does the next world open?". A padlock says "not yet". It does not say what
 * to do, and the learner has no way to find out except to keep playing and
 * watch.
 *
 * DERIVED, NOT AUTHORED. Every answer below is computed from the path the
 * server already sends. No new endpoint, no new field, and above all no new
 * rule: `findJourneyPath` decides what is current and what is locked, and this
 * only reads its output back in English. If the progression changes, this
 * follows it, because it has no opinion of its own.
 *
 * WHY IT IS PURE. The three screens that need it -- the map, the pre-game
 * entrance and the results -- would otherwise each grow their own copy of
 * "what is left", and the three would drift. One module, one set of tests, no
 * DOM.
 */

/** A topic's state as the learner meets it, which is not the same as the API's. */
export type TopicStanding = "complete" | "current" | "available" | "locked";

/**
 * Four states where the journey has three.
 *
 * The API says `locked` for everything the learner has not reached, which
 * lumps "next, as soon as you finish here" together with "fifteen worlds
 * away". The first is the one a learner is actually asking about, so it gets
 * its own word: AVAILABLE means nothing stands between here and there except
 * finishing the current topic.
 */
export function standingFor(topics: JourneyTopic[], slug: string): TopicStanding {
    const index = topics.findIndex((t) => t.slug === slug);

    if (index === -1) return "locked";

    const topic = topics[index]!;

    if (topic.state === "complete") return "complete";
    if (topic.state === "current") return "current";

    const currentIndex = topics.findIndex((t) => t.state === "current");

    // Nothing is current -- every topic is done -- so anything still locked is
    // waiting on content rather than on the learner.
    if (currentIndex === -1) return "locked";

    return index === currentIndex + 1 ? "available" : "locked";
}

/** What is still outstanding inside one topic, counted from real concept state. */
export interface TopicRemaining {
    concepts: number;
    /** The topic's cumulative checkpoint, when it has one and it is not passed. */
    checkpoint: boolean;
}

export function remainingIn(topic: JourneyTopic): TopicRemaining {
    return {
        concepts: topic.concepts.filter((c) => c.state !== "demonstrated").length,
        checkpoint: topic.challenge !== null && topic.challenge.state !== "demonstrated"
    };
}

/**
 * The sentence under a world the learner cannot enter yet.
 *
 * ONE STEP, NOT THE WHOLE CHAIN. For the next world it names exactly what is
 * left, because that is actionable. For anything further out it names the
 * world immediately before it and stops -- "finish Values, then Variables,
 * then Operators, then..." is a wall of text that answers a question nobody
 * asked. The learner only ever has one next thing to do.
 *
 * Returns null for a topic that is already open; the caller has nothing to say.
 */
export function unlockRequirement(topics: JourneyTopic[], slug: string): string | null {
    const standing = standingFor(topics, slug);

    if (standing === "complete" || standing === "current") return null;

    const index = topics.findIndex((t) => t.slug === slug);
    const previous = topics[index - 1];

    if (standing === "available" && previous) {
        const left = remainingIn(previous);
        const parts: string[] = [];

        if (left.concepts > 0) {
            parts.push(`${left.concepts} ${left.concepts === 1 ? "concept" : "concepts"}`);
        }

        if (left.checkpoint) parts.push("the checkpoint");

        // Everything in the previous topic is done and this one still has not
        // opened. Saying "0 concepts left" would be worse than saying nothing,
        // so fall through to naming the world instead.
        if (parts.length > 0) {
            return `Opens when you finish ${parts.join(" and ")} in ${previous.name}`;
        }
    }

    return previous ? `Opens after ${previous.name}` : null;
}

/**
 * Whether a world has only just become reachable.
 *
 * READ FROM PROGRESS, NOT FROM A TIMESTAMP. There is no "seen" flag anywhere
 * in the model and this does not add one: a world counts as newly open while
 * the learner has not yet cleared anything in it. That is true the moment it
 * opens and stops being true as soon as they start, which is the window the
 * marker is for -- and it survives a reload, which a transient animation does
 * not.
 */
export function isNewlyOpen(topic: JourneyTopic): boolean {
    if (topic.state !== "current") return false;

    /*
     * FINISHED HERE, NOT TOUCHED HERE.
     *
     * This used to require `rungs.cleared === 0` as well, which quietly made
     * the test about something else: rungs are cleared by EVIDENCE, and
     * evidence comes from Code Blitz and Bug Hunt, which deal across the
     * frontier rather than along the lesson path. A learner who had answered
     * one Variables question in a round therefore had `cleared > 0` in a world
     * they had never visited -- so the moment Variables opened, the map said
     * nothing and the arrival screen announced nothing. The unlock was real
     * and invisible, which is the worst of the three states to be in.
     *
     * Demonstrating a concept, by contrast, can only happen inside the world
     * it belongs to and only once that world is open, so it is a sound test of
     * "has the learner started here" and keeps the announcement from replaying
     * for somewhere they are already working.
     */
    return topic.concepts.every((c) => c.state !== "demonstrated");
}

/**
 * What is left in the world the learner is standing in, as one phrase.
 *
 * The counterpart of `unlockRequirement`: that one explains a world you cannot
 * enter, this one explains the world you are in. Same source, same counting, so
 * "3 concepts left" here and "opens when you finish 3 concepts" on the world
 * after it are the same fact said from two sides.
 */
export function openStanding(topic: JourneyTopic): string {
    const left = remainingIn(topic);
    const parts: string[] = [];

    if (left.concepts > 0) {
        parts.push(`${left.concepts} ${left.concepts === 1 ? "concept" : "concepts"} left`);
    }

    if (left.checkpoint) parts.push("then the checkpoint");

    return parts.length > 0 ? parts.join(", ") : "everything here is done";
}

/** Where a concept stands on its own ladder, for the one-line progress read. */
export function conceptProgress(concept: JourneyConcept): string | null {
    if (concept.rungs.playable === 0) return null;

    const { cleared, playable } = concept.rungs;

    if (cleared >= playable) return "ready to demonstrate";

    return `${cleared} of ${playable} stops done`;
}

/** The single next thing to do, named from state rather than guessed. */
export interface NextStep {
    label: string;
    href: string;
    /** The reason, in the learner's words. Shown beside the action, not instead. */
    because: string;
}

/**
 * What to do after a round.
 *
 * ORDERED BY WHAT THE LEARNER HAS EARNED, most specific first: a concept whose
 * ladder is complete is waiting to be demonstrated and nothing else should
 * compete with that; otherwise the ladder itself is the next thing; otherwise
 * the journey. It never offers to demonstrate a concept the server has not
 * said is finished, because `rungs` comes from the same evidence the server
 * demonstrates on.
 */
export function nextStepAfterRound(
    concept: { slug: string; name: string; rungs: { cleared: number; playable: number } } | null
): NextStep {
    if (!concept || concept.rungs.playable === 0) {
        return {
            label: ACTION.seeJourney,
            href: "/journey",
            because: "See where you are"
        };
    }

    if (concept.rungs.cleared >= concept.rungs.playable) {
        return {
            label: `Demonstrate ${concept.name}`,
            href: `/concept/${concept.slug}`,
            because: "You have cleared every stop on this concept"
        };
    }

    const left = concept.rungs.playable - concept.rungs.cleared;

    return {
        label: continueTo(concept.name),
        href: `/concept/${concept.slug}`,
        because: `${left} ${left === 1 ? "stop" : "stops"} left before you can demonstrate it`
    };
}

/**
 * Whether finishing this concept just opened a new world, and which.
 *
 * WHERE AN UNLOCK ACTUALLY HAPPENS, which is not where it looks like it does.
 * A Code Blitz round clears RUNGS; rungs let a concept be demonstrated;
 * demonstrating the last concept of a topic -- plus its checkpoint, where the
 * topic has one -- is what makes the topic complete and the next one current.
 * So the moment belongs to the arrival screen after a demonstration or a
 * checkpoint, and nowhere else. A round can never unlock a world, and a
 * results screen that claimed one would be lying.
 *
 * DETECTED FROM THE AFTER-STATE ALONE, with no before-snapshot and no new
 * server field. Two facts have to hold together:
 *
 *   the world the learner just finished is now `complete`
 *   a LATER world is current and has nothing done in it yet
 *
 * The second is what keeps the message honest when a learner goes back to
 * mop up a straggler concept in an earlier topic: that topic becomes complete,
 * but the world ahead is already underway, so nothing is announced.
 *
 * REPLAY IS IMPOSSIBLE BY CONSTRUCTION rather than by a flag. The arrival
 * screen renders on local state set by the write itself, so a refresh returns
 * the learner to the ladder and the celebration does not fire again. Nothing
 * is stored, so there is nothing to go stale.
 *
 * @param finishedSlug the concept just demonstrated, or the topic just checked
 */
export function worldJustUnlocked(
    topics: JourneyTopic[],
    finishedSlug: string
): JourneyTopic | null {
    const finished = topics.find(
        (t) => t.slug === finishedSlug || t.concepts.some((c) => c.slug === finishedSlug)
    );

    if (!finished || finished.state !== "complete") return null;

    const opened = topics.find((t) => isNewlyOpen(t));

    if (!opened || opened.order <= finished.order) return null;

    return opened;
}

/**
 * What still stands between the learner and the next world, for the screen
 * they see when they have NOT just unlocked it.
 *
 * Same derivation the map uses, aimed at the arrival instead: there is no
 * point telling someone "nice work" and leaving them to go and find out for
 * themselves how much of this world is left.
 */
export interface WorldStanding {
    world: JourneyTopic;
    remaining: TopicRemaining;
    /** Concepts demonstrated out of the total, for a real progress read. */
    done: number;
    total: number;
}

export function currentWorldStanding(topics: JourneyTopic[]): WorldStanding | null {
    const world = topics.find((t) => t.state === "current");

    if (!world) return null;

    return {
        world,
        remaining: remainingIn(world),
        done: world.concepts.filter((c) => c.state === "demonstrated").length,
        total: world.concepts.length
    };
}

/**
 * How far through a section the learner is, for the map's progress read.
 *
 * Counts STEPS -- the topic's concepts and, when it has one, its checkpoint --
 * because the checkpoint is required work and a section is not finished
 * without it (ConceptSteps lists it as a step for the same reason). A concept
 * counts only once it is demonstrated: opening a lesson, or clearing a rung in
 * a game, moves its own ladder but not this number.
 *
 * The label names concepts and the checkpoint separately, since "6 of 9" says
 * less to a learner than "5 of 8 concepts done, then the checkpoint".
 */
export interface SectionProgress {
    stepsDone: number;
    steps: number;
    label: string;
}

export function sectionProgress(topic: JourneyTopic): SectionProgress {
    const done = topic.concepts.filter((c) => c.state === "demonstrated").length;
    const total = topic.concepts.length;
    const hasCheckpoint = topic.challenge !== null && topic.challenge !== undefined;
    const checkpointDone = topic.challenge?.state === "demonstrated";

    const label =
        done === total && (!hasCheckpoint || checkpointDone)
            ? "Every step here is done"
            : done === total
              ? `All ${total} concepts done. The checkpoint is next`
              : `${done} of ${total} concepts done${hasCheckpoint ? ", then the checkpoint" : ""}`;

    return {
        stepsDone: done + (checkpointDone ? 1 : 0),
        steps: total + (hasCheckpoint ? 1 : 0),
        label
    };
}

/** The learner's one next step on the path. */
export interface NextAction {
    kind: "checkpoint" | "concept";
    /** What the step is called: the concept's name, or "<Topic> checkpoint". */
    name: string;
    href: string;
}

/**
 * The single next thing the path asks of this learner, or null when nothing is
 * left on it.
 *
 * ONE ANSWER FOR EVERY SCREEN. Home, the journey map, the arrival after a
 * concept and the world page each worked this out for themselves, in the same
 * three lines, and a fourth copy is how two screens come to disagree. This is
 * those three lines, once.
 *
 * NO RULE OF ITS OWN. The server's path already marks the first unfinished
 * step: a due checkpoint has state `current`, and otherwise `path.current` is
 * the concept (the server sets it to null while a checkpoint is due). This only
 * reads that back with a name and a route -- it never decides what is open.
 */
export function nextAction(path: JourneyPathResponse): NextAction | null {
    const checkpoint = path.topics.find((t) => t.challenge?.state === "current");

    if (checkpoint) {
        return { kind: "checkpoint", name: `${checkpoint.name} checkpoint`, href: `/challenge/${checkpoint.slug}` };
    }

    if (path.current) {
        return { kind: "concept", name: path.current.name, href: `/concept/${path.current.slug}` };
    }

    return null;
}

