/** Shared between the login helper and the capture run. */

export const BASE_URL = process.env.JOLT_URL ?? "http://localhost:5173";

/** One viewport for every primary screenshot, so the set reads as one product. */
export const VIEWPORT = { width: 1440, height: 900 };

/** A live session cookie. Gitignored -- see .gitignore. */
export const AUTH_STATE = new URL("../.auth/state.json", import.meta.url).pathname;

export const SHOTS_DIR = new URL("../public/screenshots/", import.meta.url).pathname;

/** Slugs in the order the capture walks them, matching the Game Floor. */
export const GAMES = ["code-blitz", "flush", "bug-hunt", "reaction", "memory"];
