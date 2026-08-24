interface JoltLogoProps {
    /** Hides the wordmark, leaving the bolt. Used where space is tight. */
    markOnly?: boolean;
}

/**
 * The Jolt wordmark.
 *
 * A bolt and a word, and no more than that -- the type does the work. The bolt is
 * inline SVG rather than an asset so it inherits currentColor and needs no
 * network request or build step.
 */
export function JoltLogo({ markOnly = false }: JoltLogoProps) {
    return (
        <span className="jolt-logo">
            <svg
                className="jolt-bolt"
                viewBox="0 0 24 24"
                width="20"
                height="20"
                aria-hidden="true"
                focusable="false"
            >
                <path d="M13.5 2 4 13.2h6.2L9.6 22 20 10.4h-6.4L13.5 2Z" fill="currentColor" />
            </svg>
            {!markOnly && <span className="jolt-word">JOLT</span>}
        </span>
    );
}
