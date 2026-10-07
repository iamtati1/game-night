/**
 * The editor and the console, shared by everything in Jolt that runs code.
 *
 * LIFTED OUT OF MissionScene, which had the only editor in the client. The
 * Experiment playground needs the same textarea and the same console panel,
 * and a second copy of either would be two things to keep in step -- so these
 * are the one editor and the one console, used by both.
 *
 * WHAT IS NOT HERE. No Run button, no judging, no interpreter call. A
 * demonstration grades what was typed and a playground does not, so the thing
 * that differs between them stays with the caller. These two components only
 * know how to show code being written and output coming back.
 */
import type { ReactNode } from "react";

export function CodeEditor({
    id,
    label,
    value,
    onChange,
    busy = false,
    disabled = false,
    minRows = 4
}: {
    id: string;
    label: string;
    value: string;
    onChange: (next: string) => void;
    /** Lights the editor while the code runs. */
    busy?: boolean;
    disabled?: boolean;
    minRows?: number;
}) {
    return (
        <>
            <label className="mission-editor-label" htmlFor={id}>
                {label}
            </label>
            <textarea
                id={id}
                className={`mission-editor${busy ? " is-running" : ""}`}
                value={value}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                rows={Math.max(minRows, value.split("\n").length + 1)}
                disabled={disabled}
                onChange={(event) => onChange(event.target.value)}
            />
        </>
    );
}

/**
 * What came back.
 *
 * `lines` is whatever the program printed. `extra` is for anything a caller
 * wants under it -- the playground puts the value of the last expression
 * there, which a graded movement has no use for.
 */
export function ConsoleOutput({
    lines,
    busy = false,
    empty = "nothing yet",
    extra
}: {
    lines: readonly string[];
    busy?: boolean;
    empty?: string;
    extra?: ReactNode;
}) {
    return (
        <div className="scene-console">
            <span className="scene-console-tag">console</span>

            {lines.length > 0 ? (
                <pre className="scene-output">
                    <code>{lines.join("\n")}</code>
                </pre>
            ) : (
                <p className="scene-console-empty">{busy ? "running…" : empty}</p>
            )}

            {extra}
        </div>
    );
}
