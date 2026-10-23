/**
 * One icon language.
 *
 * Every icon here is drawn on the same 24-unit grid, with the same 1.8 stroke,
 * round caps and round joins, and none of them are filled. That consistency is
 * the entire point: the app previously mixed text arrows, a tick character, a
 * circle character and an emoji, which is four visual languages in one nav.
 *
 * Stroke inherits `currentColor`, so an icon is coloured by the thing it sits
 * in and never needs a variant.
 */
export type IconName =
    | "home"
    | "map"
    | "play"
    | "log"
    | "spark"
    | "lock"
    | "check"
    | "arrow"
    | "exit"
    | "sound-on"
    | "sound-off"
    | "skills"
    | "profile"
    | "sun"
    | "moon";

const PATHS: Record<IconName, string> = {
    // A world with an orbit, not a house. Home in Jolt is where you are in the
    // universe, and the nav should say the same thing the page does.
    home: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M3.2 14.5c5 2.2 12.6 2.2 17.6 0",
    // A route between two points.
    map: "M4 20c3-1.5 4-5 2.5-8S5 6 8 4 M8 4l2 2 M20 4c-3 1.5-4 5-2.5 8S19 18 16 20 M16 20l-2-2",
    // A controller-free play mark: a triangle in a soft square reads as "a game"
    // without borrowing a console's iconography.
    play: "M4.5 7a2.5 2.5 0 0 1 2.5-2.5h10A2.5 2.5 0 0 1 19.5 7v10a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 17Z M10 9.2 15 12l-5 2.8Z",
    log: "M5 4.5h14 M5 9.5h14 M5 14.5h9 M5 19.5h6",
    spark: "M12 3.5 13.9 9 19.5 12 13.9 15 12 20.5 10.1 15 4.5 12 10.1 9Z",
    lock: "M7 10.5V8a5 5 0 0 1 10 0v2.5 M5.5 10.5h13v9h-13Z",
    check: "M5 12.5 10 17.5 19.5 7",
    arrow: "M4.5 12h14 M13 6.5 18.5 12 13 17.5",
    exit: "M14 4.5H6.5v15H14 M11 12h9.5 M17 8.5 20.5 12 17 15.5",
    // A speaker with sound waves, and the same speaker struck through: the
    // marks every learner already knows for "sound".
    "sound-on": "M4 9.5h3.5L12 5.5v13l-4.5-4H4Z M15.5 9a4 4 0 0 1 0 6 M18 6.5a7.5 7.5 0 0 1 0 11",
    "sound-off": "M4 9.5h3.5L12 5.5v13l-4.5-4H4Z M16 9.5l5 5 M21 9.5l-5 5",
    // A trunk with branches: the skill tree. Distinct in shape from the map's
    // route and the spark, so the bottom bar never relies on its label alone.
    skills: "M12 20.5v-15 M12 15.5l-5.5-4 M12 10.5l5.5-4 M6.5 11.5v-3 M17.5 6.5v-2.5",
    // A head and shoulders: the account. Open strokes like the rest.
    profile: "M12 4a3.75 3.75 0 1 0 0 7.5A3.75 3.75 0 0 0 12 4Z M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5",
    // The theme switch: a sun for the light theme, a crescent for the dark.
    sun: "M12 8a4 4 0 1 0 0.01 0 M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5.6 5.6l1.4 1.4 M17 17l1.4 1.4 M5.6 18.4 7 17 M17 7l1.4-1.4",
    moon: "M19.5 14.5A7.5 7.5 0 1 1 9.5 4.5a6 6 0 0 0 10 10Z"
};

interface IconProps {
    name: IconName;
    size?: number;
    className?: string;
}

export function Icon({ name, size = 20, className }: IconProps) {
    return (
        <svg
            className={className ? `icon ${className}` : "icon"}
            viewBox="0 0 24 24"
            width={size}
            height={size}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d={PATHS[name]} />
        </svg>
    );
}
