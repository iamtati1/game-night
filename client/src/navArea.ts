/**
 * Which nav area a route belongs to, so the bar can say where the learner is.
 *
 * Areas rather than exact paths: a game or its results are all "Games".
 * Without this the nav marked nothing at all.
 *
 * HOME IS HOME/LEARN. The guided journey is reached from Home (its mission
 * panel and "See your journey"), not from a tab of its own, so the journey,
 * topics and lessons all light "Home": being in a lesson is being in the
 * course, and the course starts at Home.
 *
 * PROFILE holds the account and its settings, and the Log with it.
 */
export type NavArea = "home" | "games" | "skills" | "profile" | "experiment";

const AREA_PREFIXES: [NavArea, string[]][] = [
    ["games", ["/play", "/code-blitz", "/flush", "/reaction", "/memory", "/bug-hunt", "/results/"]],
    ["experiment", ["/experiment"]],
    ["profile", ["/profile", "/history"]],
    ["skills", ["/skills"]],
    ["home", ["/journey", "/concept/", "/practise/", "/world/", "/challenge/", "/learn/"]]
];

export function navAreaFor(pathname: string): NavArea | null {
    if (pathname === "/") return "home";

    for (const [area, prefixes] of AREA_PREFIXES) {
        if (prefixes.some((p) => (p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`)))) {
            return area;
        }
    }

    return null;
}

/**
 * THE FOUR PLACES, in order. One list, read by the header on a wide screen and
 * by the bottom bar on a phone, so the two can never disagree about what the
 * places are or what they are called.
 *
 *     Home     your next mission, and the guided topic journey from it
 *     Games    the five game islands
 *     Skills   honest evidence of what you understand
 *     Profile  your account, settings and Log
 *
 * Experiment is not a place in this sense -- it is a free sandbox -- so it
 * sits beside the account, secondary by placement rather than hidden.
 */
export const PRIMARY_NAV = [
    { to: "/", label: "Home", icon: "home", area: "home" },
    { to: "/play", label: "Games", icon: "play", area: "games" },
    { to: "/skills", label: "Skills", icon: "skills", area: "skills" },
    { to: "/profile", label: "Profile", icon: "profile", area: "profile" }
] as const satisfies readonly { to: string; label: string; icon: string; area: NavArea }[];
