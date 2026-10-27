/**
 * What a finished run counted for, beside the XP it earned.
 *
 * Code Blitz and Bug Hunt name the practice stops the server says the run
 * cleared. The other three games' results carry no such list, and without a
 * line the XP above the "Continue to …" button read as course progress.
 *
 * ONLY WHAT IS TRUE OF THE DATA.
 *   fun    Reaction and Memory record XP and no learning evidence.
 *   flush  The server decides `credited` as each round ends and does not keep
 *          it per round (KNOWN_LIMITATIONS), so the results cannot list which
 *          rounds counted; the round's own reveal said so at the time.
 */
export function CourseNote({ kind }: { kind: "fun" | "flush" }) {
    return (
        <p className="course-note">
            {kind === "fun"
                ? "Just for fun: this run earned XP and does not change your course."
                : "XP is for finishing the game and every order you complete. Course progress was shown round by round, on each reveal."}
        </p>
    );
}
