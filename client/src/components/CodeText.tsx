import type { ReactNode } from "react";

/**
 * Renders `backticked` fragments as code.
 *
 * Curriculum prose names the actual identifier -- "the second line replaces what
 * `score` holds" -- and that name should look like code, because it is. The
 * explanations are written with backticks for exactly this reason, and showing
 * them raw was a playtest finding: the learner read literal backtick characters.
 *
 * Lifted out of MissionScene, which has always done this, so the encounter's
 * feedback and a mission's feedback read the same way.
 */
export function withCode(text: string): ReactNode[] {
    return text.split(/(`[^`]+`)/g).map((part, i) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
            <code key={i}>{part.slice(1, -1)}</code>
        ) : (
            part
        )
    );
}
