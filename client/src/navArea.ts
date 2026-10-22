/**
 * Which nav area a route belongs to, so the bar can say where the learner is.
 *
 * Areas rather than exact paths: a game or its results are all "Games".
 * Without this the nav marked nothing at all.
 *
 * HOME IS ITS OWN AREA. The nav's first item is "Home" -- the place to come
 * back to and choose -- so it is marked on Home alone. Lessons, topics and
 * the journey are "learn": part of the course, not Home, so being in a lesson
 * does not light "Home".
 */
export type NavArea = "home" | "learn" | "games" | "skills" | "experiment" | "log";

const AREA_PREFIXES: [NavArea, string[]][] = [
    ["games", ["/play", "/code-blitz", "/flush", "/reaction", "/memory", "/bug-hunt", "/results/"]],
    ["experiment", ["/experiment"]],
    ["log", ["/history"]],
    ["skills", ["/skills"]],
    ["learn", ["/journey", "/concept/", "/practise/", "/world/", "/challenge/", "/learn/"]]
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
 *     Home     where you are and your next mission
 *     Learn    the guided topic journey
 *     Games    the five games
 *     Skills   what you can do and what to practise
 *
 * Experiment and the Log are not places in this sense -- one is a free
 * sandbox, the other your history -- so they sit with the account, secondary
 * by placement rather than hidden.
 */
export const PRIMARY_NAV = [
    { to: "/", label: "Home", icon: "home", area: "home" },
    { to: "/journey", label: "Learn", icon: "map", area: "learn" },
    { to: "/play", label: "Games", icon: "play", area: "games" },
    { to: "/skills", label: "Skills", icon: "skills", area: "skills" }
] as const satisfies readonly { to: string; label: string; icon: string; area: NavArea }[];

