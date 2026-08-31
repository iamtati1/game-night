interface RoundProgressProps {
    /** 1-based position in the session. */
    current: number;
    total: number;
    /** "Question" for Code Blitz, "Round" for Flush. */
    unit?: string;
}

/**
 * Where the player is in the session, as a headline rather than a caption.
 *
 * The pips exist because "4 / 10" is a fact the player has to read, while a row
 * of filled and empty dots is one they can take in without looking directly at
 * it -- which is what matters when the thing they are actually looking at is a
 * code snippet on a clock.
 *
 * They carry no correctness information on purpose. Colouring past pips by
 * right/wrong would turn a progress indicator into a running scold, and the
 * score already reports how it is going.
 */
export function RoundProgress({ current, total, unit = "Question" }: RoundProgressProps) {
    return (
        <div className="round-progress">
            <p className="round-label">
                {unit} <strong>{current}</strong>
                <span className="round-of">/ {total}</span>
            </p>

            {/* aria-hidden: the label above already states the position, so the
                dots would only repeat it one element at a time. */}
            <ol className="pips" aria-hidden="true">
                {Array.from({ length: total }, (_, i) => {
                    const n = i + 1;
                    const state = n < current ? "done" : n === current ? "current" : "";

                    return <li key={n} className={`pip${state ? ` ${state}` : ""}`} />;
                })}
            </ol>
        </div>
    );
}
