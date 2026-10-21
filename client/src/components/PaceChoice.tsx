/**
 * Relaxed or timed: the pace of a curriculum game, chosen on its intro.
 *
 * RELAXED IS THE DEFAULT. These games are practice for what the learner is
 * studying, and the product rule is understanding before speed: a beginner
 * reading their third line of JavaScript should not be racing a bar. A relaxed
 * run has no clock and nothing times out. It is the same questions, the same
 * number of rounds, the same XP and the same progress -- only the speed bonus,
 * which belongs to the clock, is not paid.
 *
 * The clock is one tick away for anyone who wants it, and the choice is
 * remembered on this device (a convenience only: the server decides each run's
 * pace from the start request, and a missing preference simply means relaxed).
 *
 * Reaction does not use this. It is a speed game; a relaxed Reaction would be
 * a different game.
 */
interface PaceChoiceProps {
    timed: boolean;
    onChange: (timed: boolean) => void;
    /** What the clock is in this game, e.g. "18 seconds a question". */
    clock: string;
    /**
     * Whether this game pays a speed bonus when timed. Flush never does, so
     * neither choice may mention one there.
     */
    speedBonus?: boolean;
}

export function PaceChoice({ timed, onChange, clock, speedBonus = true }: PaceChoiceProps) {
    return (
        <div className="pace-choice">
            <label className="pace-toggle">
                <input type="checkbox" checked={timed} onChange={(e) => onChange(e.target.checked)} />
                <span>Play with the clock</span>
            </label>
            <p className="pace-explain" aria-live="polite">
                {timed
                    ? `${clock}.${speedBonus ? " Fast correct answers earn a speed bonus." : ""}`
                    : `No timer. Same questions and XP${speedBonus ? ", without the speed bonus." : "."}`}
            </p>
        </div>
    );
}
