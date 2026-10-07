import type { TeachBlock } from "../games/lessons.js";

/**
 * The worked examples, shown before anything is asked.
 *
 * Extracted from LessonPage so the encounter can teach with the SAME markup and
 * the same authored content rather than a second copy of either. It is
 * presentation only: no state, no progression, no decisions. The caller says
 * what comes after.
 *
 * SEE IT, THEN UNDERSTAND IT. Each block shows real code, the real output it
 * produces, one line about what happened, and -- where the author wrote them --
 * which piece is which. A beginner asked to imagine what a line prints is
 * already being tested, so nothing here is described rather than shown.
 */
export function ConceptTeaching({
    teach,
    notice
}: {
    teach: readonly TeachBlock[];
    /** The one thing to notice, which the questions then test. */
    notice: string;
}) {
    return (
        <>
            <div className="lesson-teach">
                {teach.map((block) => (
                    <div className="lesson-example" key={block.code}>
                        <pre className="lesson-code">
                            <code>{block.code}</code>
                        </pre>

                        {block.output !== undefined && (
                            <div className="lesson-output">
                                <span className="lesson-output-tag">displays</span>
                                <pre>
                                    <code>{block.output}</code>
                                </pre>
                            </div>
                        )}

                        <p className="lesson-note">{block.note}</p>

                        {block.parts && (
                            <dl className="lesson-parts">
                                {block.parts.map((part) => (
                                    <div className="lesson-part" key={part.piece}>
                                        <dt>
                                            <code>{part.piece}</code>
                                        </dt>
                                        <dd>{part.means}</dd>
                                    </div>
                                ))}
                            </dl>
                        )}
                    </div>
                ))}
            </div>

            <p className="lesson-notice">
                <span className="lesson-notice-tag">Notice</span>
                {notice}
            </p>
        </>
    );
}
