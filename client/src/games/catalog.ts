/**
 * What Jolt knows about its games.
 *
 * This is the client's single source of truth for game presentation: names,
 * hooks, categories, accents and the shape of one run. Nothing in the UI should
 * hardcode a game name or description -- it comes from here, so adding a game is
 * one entry rather than a hunt through JSX.
 *
 * Why not the database: `games` holds slug, name, tagline and is_active, but
 * there is no endpoint serving it, and it models none of the presentation
 * metadata below (category, accent, intensity, the card's visual motif). Adding
 * columns and an endpoint would be a schema and API change in service of a
 * branding task. The shape here is deliberately close to what `GET /api/games`
 * would return, so hydrating it from the server later is a swap, not a rewrite.
 *
 * `shape` is not marketing copy -- the numbers are the real rules, read off
 * QUESTIONS_PER_SESSION / QUESTION_TIME_LIMIT_MS and FLUSH_ROUNDS_PER_SESSION /
 * FLUSH_ROUND_TIME_LIMIT_MS. If a rule changes, this line has to change with it.
 */

/** Slugs are the contract between the client, the routes and the API. Naming them
 *  once here keeps "code-blitz" from being retyped at every call site. */
export const CODE_BLITZ = "code-blitz";
export const FLUSH = "flush";
export const REACTION = "reaction";
export const MEMORY = "memory";
export const BUG_HUNT = "bug-hunt";

export type GameStatus = "live";

/** Which abstract preview the card draws. Each one is a reduction of the real
 *  game screen, so the two cards cannot read as the same game recoloured. */
export type GameMotif = "blitz" | "flush" | "reaction" | "memory" | "bughunt";

export interface GameEntry {
    slug: string;
    name: string;
    /** One line, in the player's language, about what the game asks of them. */
    hook: string;
    category: string;
    /** Drives --card-accent, so each game keeps the identity it has in play. */
    accent: string;
    status: GameStatus;
    path: string;
    /** The real shape of one run. */
    shape: string;
    /** 1-3, a reading of pace rather than difficulty. */
    intensity: number;
    /** What one scoring unit is called. Code Blitz counts questions, Flush counts
     *  rounds -- and both the game card and the pause screen need the word, so it
     *  belongs here rather than hardcoded at each site. */
    unit: string;
    /** The instinct this game actually tests. Read off the mechanic, not invented:
     *  it is what the player is being asked to be good at. */
    instinct: string;
    motif: GameMotif;
    /**
     * A real screenshot of this game mid-play, shown on its card.
     *
     * Absent means the card falls back to its hand-drawn preview, which is what
     * Flush does: the capture run reached its briefing but not its board, so
     * there is no honest gameplay frame to show yet. An abstraction is a better
     * answer than the wrong picture.
     *
     * Captured by `npm run screenshots` -- see client/scripts/capture.mjs.
     */
    screenshot?: string;
}

/* Order is the landing page's spatial composition, not an accident of when each
   game was built: two rows of two, then Memory alone at the foot of the space.
   Nothing reads this array for anything but display order -- history and results
   look games up by slug -- so this is presentation, not data. */
export const GAMES: GameEntry[] = [
    {
        slug: CODE_BLITZ,
        name: "Code Blitz",
        hook: "Read the code. Call the output. Beat the clock.",
        category: "Code",
        accent: "#8b5cf6",
        status: "live",
        path: "/play",
        shape: "10 questions · 35s each",
        intensity: 3,
        instinct: "Technical recall, fast",
        unit: "Question",
        motif: "blitz",
        screenshot: "/screenshots/jolt-code-blitz-gameplay.png"
    },
    {

        slug: FLUSH,
        name: "Flush",
        hook: "Predict what prints, in order. One wrong call ends the round.",
        category: "Logic",
        accent: "#f0a94a",
        status: "live",
        path: "/flush",
        shape: "5 rounds · 20s + 10s per output",
        intensity: 2,
        instinct: "Prediction and sequencing",
        unit: "Round",
        motif: "flush",
        screenshot: "/screenshots/jolt-flush-gameplay.png"
    },
    {

        slug: BUG_HUNT,
        name: "Bug Hunt",
        hook: "Something is broken. Find it before the system does.",
        category: "Debugging",
        // Alert amber: the only game framed as a thing going wrong, and the one
        // colour on the platform that already means "look here".
        accent: "#f97316",
        status: "live",
        path: "/bug-hunt",
        shape: "10 hunts · easy start, hard finish",
        intensity: 3,
        instinct: "Reading code under pressure",
        unit: "Incident",
        motif: "bughunt",
        screenshot: "/screenshots/jolt-bug-hunt-gameplay.png"
    },
    {

        slug: REACTION,
        name: "Reaction",
        hook: "Wait for the signal. Beat your own reflexes.",
        category: "Reflexes",
        // Electric cyan is Jolt's own colour, and Reaction is the game the brand
        // is named after -- a jolt is exactly what the signal is.
        accent: "#22d3ee",
        status: "live",
        path: "/reaction",
        shape: "5 rounds · milliseconds count",
        intensity: 1,
        instinct: "Reaction speed and impulse control",
        unit: "Round",
        motif: "reaction",
        screenshot: "/screenshots/jolt-reaction-gameplay.png"
    },
    {

        slug: MEMORY,
        name: "Memory",
        hook: "Watch the sequence. Hold it. Play it back.",
        category: "Recall",
        // Soft violet: the one game that asks you to slow down and hold something,
        // so it reads calmer than Reaction's electric cyan.
        accent: "#a78bfa",
        status: "live",
        path: "/memory",
        shape: "5 rounds · 4 to 8 symbols",
        intensity: 2,
        instinct: "Working memory and recall",
        unit: "Round",
        motif: "memory",
        screenshot: "/screenshots/jolt-memory-gameplay.png"
    }
];

export const LIVE_GAMES = GAMES.filter((g) => g.status === "live");

export function gameBySlug(slug: string): GameEntry | undefined {
    return GAMES.find((g) => g.slug === slug);
}
