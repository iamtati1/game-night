import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import type { TopicStandingResponse } from "../api/types.js";

/**
 * Where the learner stands on one topic, as a list they can read in a glance.
 *
 *     ✓ Names Refer to Values
 *     ✓ Declaring a Variable
 *     → Giving a Variable Its First Value
 *     ○ Assigning a Value
 *
 * PROGRESS AS UNDERSTANDING, NOT AS POINTS. The score on this screen says how
 * the run went; this says what the learner is actually working through. Both
 * belong, and neither substitutes for the other -- which is why XP is untouched
 * and this sits beside it rather than replacing it.
 *
 * The objective is shown for the current concept only. Every row carrying one
 * would be a wall of text on a results screen, and the only one the learner is
 * about to act on is the one they are on.
 *
 * Renders nothing at all if the request fails or the topic is unknown. A
 * progress panel is not worth an error message on the screen where someone has
 * just finished playing.
 */
export function TopicStanding({ topic }: { topic: string }) {
    const [standing, setStanding] = useState<TopicStandingResponse | null>(null);

    useEffect(() => {
        let active = true;

        void (async () => {
            try {
                const data = await api.get<TopicStandingResponse>(
                    `/api/curriculum/topics/${topic}/standing`
                );

                if (active) setStanding(data);
            } catch {
                // Silent: see the note above.
            }
        })();

        return () => {
            active = false;
        };
    }, [topic]);

    if (!standing || standing.concepts.length === 0) {
        return null;
    }

    return (
        <div className="standing">
            <p className="review-head">Your {standing.topic.replace(/-/g, " ")} journey</p>

            <ol className="standing-list">
                {standing.concepts.map((c) => (
                    <li key={c.slug} className={`standing-step is-${c.status}`}>
                        <span className="standing-mark" aria-hidden="true">
                            {c.status === "done" ? "✓" : c.status === "current" ? "→" : "○"}
                        </span>
                        <span className="standing-name">{c.name}</span>
                    </li>
                ))}
            </ol>

            {standing.current && (
                <p className="next-up">
                    <span className="next-label">Now</span> {standing.current.objective}
                </p>
            )}
        </div>
    );
}
