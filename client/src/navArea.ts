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
export type NavArea = "home" | "learn" | "games" | "experiment" | "log";

const AREA_PREFIXES: [NavArea, string[]][] = [
    ["games", ["/play", "/code-blitz", "/flush", "/reaction", "/memory", "/bug-hunt", "/results/"]],
    ["experiment", ["/experiment"]],
    ["log", ["/history"]],
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
