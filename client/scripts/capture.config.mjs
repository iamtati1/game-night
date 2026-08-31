/** Shared between the login helper and the capture run. */

export const BASE_URL = process.env.JOLT_URL ?? "http://localhost:5173";

/** One viewport for every primary screenshot, so the set reads as one product. */
export const VIEWPORT = { width: 1440, height: 900 };

/** A live session cookie. Gitignored -- see .gitignore. */
export const AUTH_STATE = new URL("../.auth/state.json", import.meta.url).pathname;

/**
 * Two destinations, because they have different jobs and only one of them ships.
 *
 * CARD_SHOTS_DIR is inside public/, so Vite copies it verbatim into dist. Only
 * the five frames the Game Floor actually references belong here -- every file
 * added to it is downloaded by real visitors.
 *
 * QA_SHOTS_DIR is outside public/ and is therefore never built. The full walk in
 * capture.mjs writes here: intro screens, results screens, the game floor. Those
 * are evidence for a human reading a report, not assets. They previously sat in
 * public/ and shipped 2.9MB of images nothing on the site could reach.
 */
export const CARD_SHOTS_DIR = new URL("../public/screenshots/", import.meta.url).pathname;

export const QA_SHOTS_DIR = new URL("../docs/screenshots/", import.meta.url).pathname;

/** The five frames the cards reference, keyed the way catalog.ts names them.
 *  Anything not in this list does not belong in CARD_SHOTS_DIR. */
export const CARD_SHOTS = [
    "jolt-code-blitz-gameplay",
    "jolt-flush-gameplay",
    "jolt-bug-hunt-gameplay",
    "jolt-reaction-gameplay",
    "jolt-memory-gameplay"
];

/** Slugs in the order the capture walks them, matching the Game Floor. */
export const GAMES = ["code-blitz", "flush", "bug-hunt", "reaction", "memory"];
