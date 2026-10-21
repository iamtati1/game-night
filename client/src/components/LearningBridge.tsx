import type { ReactNode } from "react";

/**
 * Why this game, now.
 *
 * THE GAP IT FILLS. A learner arrives at Code Blitz from a lesson about, say,
 * reassignment, and the entrance tells them "Read it. Call it." -- true of the
 * game, and silent about the lesson. Nothing on the screen connects the two,
 * so the game reads as a thing beside the course rather than part of it.
 *
 * Both lines come from the curriculum's own `name` and `objective`, from
 * /api/curriculum/path -- the same answer the map and Home give. Nothing is
 * authored per game-and-concept pair.
 *
 * ABSENT RATHER THAN EMPTY. With no current concept -- a learner who has
 * demonstrated everything reachable -- this renders nothing. A bridge with one
 * end missing is worse than no bridge.
 */
export interface LearningBridgeProps {
    concept: { name: string; objective: string } | null;
    children?: ReactNode;
}

/*
 * ONE LINE, NOT A CARD (readability pass). This used to be a boxed table above
 * the game's own intro -- "You are learning", the concept, "This game
 * practices: Technical recall, fast" and "Watch for" -- which put two headings
 * on one screen and called a relaxed, untimed run "fast". It now sits inside
 * GameIntro, under the title, as the concept and what to watch for.
 */
export function LearningBridge({ concept, children }: LearningBridgeProps) {
    if (!concept) return null;

    return (
        <div className="learning-bridge" aria-label="What this practises">
            <p className="learning-bridge-concept">
                Practicing <strong>{concept.name}</strong>
            </p>
            <p className="learning-bridge-goal">Watch for: {concept.objective}</p>
            {children}
        </div>
    );
}
