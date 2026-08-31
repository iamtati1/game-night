/**
 * Plays every game and captures the result.
 *
 *   npm run screenshots:login   (once -- see auth.mjs)
 *   npm run screenshots
 *
 * Deliberately a capture AND a QA run rather than a screenshotter. Driving the
 * real UI to a real gameplay state is most of the work either way, and while it
 * is there it can answer questions a screenshot cannot: whether the countdown
 * actually precedes the round, whether the clock was already running when the
 * first question arrived, whether anything hit the console.
 *
 * Every game is wrapped so one failure does not lose the rest of the run. What
 * could not be captured is reported at the end rather than silently missing.
 *
 * Everything here lands in docs/screenshots/, which is NOT inside public/ and so
 * is never built. These are the evidence for a QA report, not site assets. The
 * five frames the Game Floor actually shows are produced by recapture.mjs, which
 * is the only script allowed to write into public/.
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import { AUTH_STATE, BASE_URL, QA_SHOTS_DIR, VIEWPORT } from "./capture.config.mjs";

if (!existsSync(AUTH_STATE)) {
    console.error("\n  No saved session. Run `npm run screenshots:login` first.\n");
    process.exit(1);
}

mkdirSync(QA_SHOTS_DIR, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
    storageState: AUTH_STATE,
    viewport: VIEWPORT,
    deviceScaleFactor: 2
});

/** Everything the run learns, printed as a report at the end. */
const report = { shots: [], issues: [], console: [], failures: [] };

const page = await context.newPage();

page.on("console", (m) => {
    if (m.type() === "error") report.console.push(m.text().slice(0, 160));
});
page.on("pageerror", (e) => report.console.push(`pageerror: ${String(e).slice(0, 160)}`));

const shoot = async (name) => {
    await page.screenshot({ path: `${QA_SHOTS_DIR}${name}.png` });
    report.shots.push(name);
    console.log(`    captured ${name}.png`);
};

/** Leaves no run holding the single active-session slot for the next game. */
const abandonAll = async () => {
    await page.evaluate(async () => {
        for (const slug of ["code-blitz", "flush", "bug-hunt", "reaction", "memory"]) {
            await fetch(`/api/me/sessions/${slug}/abandon`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: "{}"
            }).catch(() => undefined);
        }
    });
};

const settle = (ms = 700) => page.waitForTimeout(ms);

/**
 * Starts a game and reports what the transition did.
 *
 * The countdown check is the one worth automating: it is invisible in a
 * screenshot and it is the thing most likely to regress, because serving a
 * question is what starts its clock.
 */
async function startAndTime(startText) {
    await page.getByRole("button", { name: startText }).click();

    const sawCountdown = await page
        .locator(".resume-count")
        .waitFor({ state: "visible", timeout: 2000 })
        .then(() => true)
        .catch(() => false);

    await page.locator(".resume-count").waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});

    return sawCountdown;
}

async function game(name, fn) {
    console.log(`\n  ${name}`);
    try {
        await abandonAll();
        await fn();
    } catch (err) {
        const message = String(err).split("\n")[0].slice(0, 180);
        console.log(`    FAILED: ${message}`);
        report.failures.push(`${name}: ${message}`);
    }
}

// ---------------------------------------------------------------- game floor

await game("Game Floor", async () => {
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await page.locator(".game-card").first().waitFor();
    await settle();
    await shoot("jolt-game-floor");

    const cards = await page.locator(".game-card").count();
    if (cards !== 5) report.issues.push(`Game Floor shows ${cards} cards, expected 5`);
});

// ---------------------------------------------------------------- code blitz

await game("Code Blitz", async () => {
    await page.goto(`${BASE_URL}/play`, { waitUntil: "networkidle" });
    await page.locator(".game-intro").waitFor();
    await settle();
    await shoot("jolt-code-blitz-intro");

    const sawCountdown = await startAndTime("Start blitz");
    if (!sawCountdown) report.issues.push("Code Blitz: no countdown between Start and round one");

    await page.locator(".game.blitz").waitFor({ timeout: 10000 });
    await settle();

    // Did the countdown eat the clock? The server reports what is left of the
    // 35s window; anything meaningfully short means it was already running.
    const remaining = await page.evaluate(async () => {
        const res = await fetch("/api/sessions/current", { credentials: "include" });
        const body = await res.json();

        return body?.question?.msRemaining ?? null;
    });

    if (remaining !== null && remaining < 33000) {
        report.issues.push(
            `Code Blitz: first question had ${remaining}ms of 35000ms left -- the clock ran during onboarding`
        );
    }
    console.log(`    first question clock: ${remaining}ms of 35000ms`);

    await shoot("jolt-code-blitz-gameplay");

    // Play it out. Any option finishes the run; the results screen is the shot.
    for (let i = 0; i < 12; i += 1) {
        if (page.url().includes("/results/")) break;

        const options = page.locator("button:has(.option-text)");
        if ((await options.count()) === 0) break;

        await options.first().click();
        await page.waitForTimeout(1400);
    }

    await page.waitForURL(/\/results\//, { timeout: 15000 });
    await settle(900);
    await shoot("jolt-code-blitz-results");
});

// -------------------------------------------------------------------- flush

await game("Flush", async () => {
    await page.goto(`${BASE_URL}/flush`, { waitUntil: "networkidle" });
    await page.locator(".game-intro").waitFor();
    await settle();
    await shoot("jolt-flush-intro");

    const sawCountdown = await startAndTime("Start flush");
    if (!sawCountdown) report.issues.push("Flush: no countdown between Start and round one");

    await page.locator(".board").waitFor({ timeout: 10000 });
    await settle();
    await shoot("jolt-flush-gameplay");
});

// ----------------------------------------------------------------- bug hunt

await game("Bug Hunt", async () => {
    await page.goto(`${BASE_URL}/bug-hunt`, { waitUntil: "networkidle" });
    await page.locator(".bh-briefing").waitFor();
    await settle();
    await shoot("jolt-bug-hunt-intro");

    await page.getByRole("button", { name: "Start hunt" }).click();

    // Bug Hunt announces each incident rather than counting in.
    const sawAlert = await page
        .locator(".bh-alert-beat")
        .waitFor({ state: "visible", timeout: 3000 })
        .then(() => true)
        .catch(() => false);

    if (!sawAlert) report.issues.push("Bug Hunt: no alert beat between Start and incident one");

    await page.locator(".bh-incident").waitFor({ timeout: 12000 });
    await settle(900);
    await shoot("jolt-bug-hunt-gameplay");

    // The opening tier is meant to be untimed; a visible clock here is a bug.
    const timed = await page.locator(".bh-incident .countdown, .bh-incident .timer").count();
    console.log(`    first incident timer elements: ${timed}`);
});

// ----------------------------------------------------------------- reaction

await game("Reaction", async () => {
    await page.goto(`${BASE_URL}/reaction`, { waitUntil: "networkidle" });
    await page.locator(".rx-intro").waitFor();
    await settle();
    await shoot("jolt-reaction-intro");

    await page.getByRole("button", { name: /Start/ }).first().click();

    // Wait for the signal, then react. The arena is the button.
    await page.locator(".rx-go").waitFor({ timeout: 15000 });
    await shoot("jolt-reaction-gameplay");

    await page.locator(".game.reaction button").first().click();
    await settle(900);
});

// ------------------------------------------------------------------- memory

await game("Memory", async () => {
    await page.goto(`${BASE_URL}/memory`, { waitUntil: "networkidle" });
    await page.locator(".mem-intro").waitFor();
    await settle();
    await shoot("jolt-memory-intro");

    const sawCountdown = await startAndTime("Start");
    if (!sawCountdown) report.issues.push("Memory: no countdown between Start and round one");

    await page.locator(".game.memory").waitFor({ timeout: 10000 });
    await page.waitForTimeout(1200);
    await shoot("jolt-memory-gameplay");
});

// ------------------------------------------------------------- responsive QA

console.log("\n  Responsive");
for (const [label, size] of [
    ["1024x768", { width: 1024, height: 768 }],
    ["mobile 390x844", { width: 390, height: 844 }]
]) {
    await page.setViewportSize(size);
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await page.locator(".game-card").first().waitFor();
    await settle();

    const m = await page.evaluate(() => {
        const h = document.documentElement;

        return {
            phantom: h.scrollHeight - h.offsetHeight,
            horizontal: h.scrollWidth > h.clientWidth,
            cards: document.querySelectorAll(".game-card").length
        };
    });

    console.log(
        `    ${label}: ${m.cards} cards, phantom scroll ${m.phantom}, horizontal ${m.horizontal}`
    );
    if (m.phantom !== 0) report.issues.push(`${label}: ${m.phantom}px of phantom scroll`);
    if (m.cards !== 5) report.issues.push(`${label}: ${m.cards} cards`);
}

await abandonAll();
await browser.close();

// ------------------------------------------------------------------- report

console.log(`\n  ${report.shots.length} screenshot(s) in client/docs/screenshots/ (not shipped)`);

if (report.failures.length) {
    console.log(`\n  ${report.failures.length} game(s) did not complete:`);
    for (const f of report.failures) console.log(`    - ${f}`);
}

if (report.issues.length) {
    console.log(`\n  ${report.issues.length} issue(s):`);
    for (const i of report.issues) console.log(`    - ${i}`);
} else {
    console.log("\n  No gameplay issues found.");
}

const consoleErrors = [...new Set(report.console)];
if (consoleErrors.length) {
    console.log(`\n  ${consoleErrors.length} distinct console error(s):`);
    for (const c of consoleErrors) console.log(`    - ${c}`);
} else {
    console.log("  No console errors.");
}

console.log("");
process.exit(report.failures.length > 0 ? 1 : 0);
