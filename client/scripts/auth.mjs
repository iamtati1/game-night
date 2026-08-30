/**
 * Saves a logged-in browser session for the capture script to reuse.
 *
 *   npm run screenshots:login
 *
 * Opens a real browser window at the login page and waits. You type your own
 * credentials into it; this script never reads the form, never sees what you
 * typed, and stores nothing but the session cookie the server hands back.
 *
 * That separation is the whole reason this is two scripts rather than one with
 * a --user flag: nothing in the repository, and nobody running it, ever has to
 * handle a password.
 *
 * The saved state is a live session cookie, which is why .auth/ is gitignored.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { AUTH_STATE, BASE_URL, VIEWPORT } from "./capture.config.mjs";

const TIMEOUT_MS = 5 * 60 * 1000;

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: VIEWPORT });
const page = await context.newPage();

console.log(`\n  Opening ${BASE_URL}/login`);
console.log("  Log in in the window that just opened. This script is waiting.\n");

await page.goto(`${BASE_URL}/login`);

// Polls the API rather than watching the DOM: the only thing that actually
// matters is whether the server considers this session authenticated.
const start = Date.now();
let authenticated = false;

while (Date.now() - start < TIMEOUT_MS) {
    authenticated = await page
        .evaluate(async () => {
            const res = await fetch("/api/users/me", { credentials: "include" });

            return res.status === 200;
        })
        .catch(() => false);

    if (authenticated) break;

    await page.waitForTimeout(1000);
}

if (!authenticated) {
    console.error("\n  Timed out waiting for a login. Nothing was saved.\n");
    await browser.close();
    process.exit(1);
}

mkdirSync(dirname(AUTH_STATE), { recursive: true });
await context.storageState({ path: AUTH_STATE });

console.log(`  Signed in. Session saved to ${AUTH_STATE}`);
console.log("  Run `npm run screenshots` to capture.\n");

await browser.close();
