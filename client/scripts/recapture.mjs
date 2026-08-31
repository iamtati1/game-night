/**
 * Recaptures the cards whose default frame was not worth showing.
 *
 *   node scripts/recapture.mjs                  # every exception below
 *   node scripts/recapture.mjs blitz flush      # just those
 *
 * capture.mjs takes whatever frame a game happens to be on when its main element
 * appears. That is the right default for a QA walk and the wrong answer for a
 * shop window: the first frame of a game is, almost by definition, the one where
 * nothing has happened yet.
 *
 * The Game Floor card is a ~487x132 window -- 3.7:1, about 213px of page height
 * at the card's zoom. That is room for two or three stacked elements, so each
 * frame here is chosen for what fits in that band, not for what looks best full
 * screen. Reaction and Memory already pass that bar (one huge GO, four coloured
 * symbols) and are the benchmark the rest are aimed at.
 *
 *   Code Blitz  wants a run in progress: streak lit, score up, clock full, and a
 *               question with its answers under it. Question one at score zero
 *               reads as a code viewer.
 *   Flush       wants outputs already predicted -- filled green slots against an
 *               empty numbered one -- so the card shows a puzzle mid-solve rather
 *               than a code panel.
 *   Bug Hunt    wants the incident itself: the symptom, "LOCATE THE FAULT", and
 *               the numbered source. The old frame was a bare code panel.
 *   Memory      wants the recall phase with most of the row placed. The `showing`
 *               phase is one symbol on an empty board.
 *   Reaction    already had the frame it wants -- one huge GO. It lives here
 *               anyway, because this is now the only script that writes into
 *               public/, and every card frame needs a way to be remade.
 *
 * The name filter matters because several of these frames are won rather than
 * computed -- Code Blitz needs two correct answers in a row, and the answers are
 * not knowable from the client. Re-running the whole file to fix one game would
 * gamble away frames that are already good.
 */
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { AUTH_STATE, BASE_URL, CARD_SHOTS, CARD_SHOTS_DIR, VIEWPORT } from "./capture.config.mjs";

if (!existsSync(AUTH_STATE)) {
    console.error("\n  No saved session. Run `npm run screenshots:login` first.\n");
    process.exit(1);
}

const only = process.argv.slice(2).map((a) => a.toLowerCase());
const wanted = (name) => only.length === 0 || only.includes(name);

const browser = await chromium.launch();
const context = await browser.newContext({
    storageState: AUTH_STATE,
    viewport: VIEWPORT,
    deviceScaleFactor: 2
});
const page = await context.newPage();

const problems = [];
page.on("console", (m) => m.type() === "error" && problems.push(m.text().slice(0, 140)));

const abandonAll = () =>
    page.evaluate(async () => {
        for (const slug of ["code-blitz", "flush", "bug-hunt", "reaction", "memory"]) {
            await fetch(`/api/me/sessions/${slug}/abandon`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: "{}"
            }).catch(() => undefined);
        }
    });

const shoot = async (name) => {
    if (!CARD_SHOTS.includes(name)) {
        throw new Error(`${name} is not a card frame -- public/ takes the five in CARD_SHOTS only`);
    }
    await page.screenshot({ path: `${CARD_SHOTS_DIR}${name}.png` });
    console.log(`    captured ${name}.png`);
};

/** Reports where the parts that matter landed, so the card crop can be set from
 *  measured geometry rather than guessed at. */
const geometry = async (selectors) => {
    const boxes = await page.evaluate((sels) => {
        const out = {};
        for (const [label, sel] of Object.entries(sels)) {
            const el = document.querySelector(sel);
            out[label] = el
                ? {
                      top: Math.round(el.getBoundingClientRect().top + window.scrollY),
                      bottom: Math.round(el.getBoundingClientRect().bottom + window.scrollY)
                  }
                : null;
        }
        return out;
    }, selectors);
    for (const [k, v] of Object.entries(boxes)) {
        console.log(`      ${k.padEnd(12)} ${v ? `${v.top}..${v.bottom}` : "-"}`);
    }
};

const start = async (path, introSel, buttonName) => {
    await page.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle" });
    await abandonAll();
    await page.reload({ waitUntil: "networkidle" });
    await page.locator(introSel).waitFor();
    await page.getByRole("button", { name: buttonName }).click();
    await page.locator(".resume-count").waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
};

// --------------------------------------------------------------- code blitz

if (wanted("blitz")) {
    console.log("\n  Code Blitz -- playing for a streak");
    try {
        // The streak badge needs two correct answers running, and the client is
        // never told which option is right -- the server scores, by design. So
        // this plays and watches rather than answering correctly, and takes more
        // than one run at it: at a 1-in-4 guess, a single run often never gets
        // two in a row. A run in progress (score on the board, clock full) is
        // kept as the fallback, because even that beats question one at zero.
        let best = 0; // 0 none, 1 score on the board, 2 streak lit
        for (let attempt = 1; attempt <= 3 && best < 2; attempt += 1) {
            console.log(`      attempt ${attempt}`);
            await start("/play", ".game-intro", "Start blitz");
            await page.locator(".game.blitz").waitFor({ timeout: 20000 });

            for (let q = 0; q < 10 && best < 2; q += 1) {
                const options = page.locator("button:has(.option-text)");
                if (!(await options.count())) break;

                await options.nth((q + attempt) % 4).click();
                // Feedback holds 900ms when correct, 1600ms when wrong.
                await page.waitForTimeout(1900);

                if (!(await page.locator("button:has(.option-text)").count())) break;

                const streak = (await page.locator(".blitz-streak").count()) > 0;
                const score = ((await page.locator(".score-value").first().textContent().catch(() => "")) ?? "").trim();
                const scored = Number(score) > 0;

                if (streak || (scored && best < 1)) {
                    await page.waitForTimeout(400);
                    await geometry({
                        streak: ".blitz-streak",
                        question: ".game.blitz h1",
                        code: ".game.blitz pre",
                        option1: "button:has(.option-text)"
                    });
                    await shoot("jolt-code-blitz-gameplay");
                    best = streak ? 2 : 1;
                    console.log(`      q${q + 2}: ${streak ? "STREAK" : `score ${score}`} -- captured`);
                }
            }
        }
        if (best === 0) console.log("      never got on the board -- frame left unchanged");
        else if (best === 1) console.log("      kept a scoring run; no streak came up");
    } catch (err) {
        console.log(`    FAILED: ${String(err).split("\n")[0].slice(0, 160)}`);
    }
}

// -------------------------------------------------------------------- flush

if (wanted("flush")) {
    console.log("\n  Flush -- predicting outputs");
    try {
        await start("/flush", ".game-intro", "Start flush");
        await page.locator(".flush-stage").waitFor({ timeout: 30000 });
        // .flush-stage exists during the reveal between rounds too, where the rack
        // is gone and every slot reads empty. Waiting for a placeable tile is what
        // actually means "a round is running and it is my turn".
        await page.locator(".rack button:not([disabled])").first().waitFor({ timeout: 30000 });
        await page.waitForTimeout(600);

        // Place all but the last output. Filled green slots against one empty
        // numbered slot is the picture of a prediction in progress; an untouched
        // board and a full rack is the same picture as the briefing.
        // Stop by the board's own "N left" counter, not by the rack. The rack can
        // hold decoys, so counting tiles overshot and completed the round -- which
        // clears the rack and swaps the board for the reveal, the one state this
        // frame must not be in.
        const slotsLeft = async () => {
            const text = (await page.locator(".board-count").first().textContent().catch(() => "")) ?? "";
            const n = parseInt(text.trim(), 10);
            return Number.isNaN(n) ? 0 : n;
        };

        for (let i = 0; i < 8; i += 1) {
            if ((await slotsLeft()) <= 1) break;
            const tiles = page.locator(".rack button:not([disabled])");
            if (!(await tiles.count())) break;
            await tiles.first().click();
            await page.waitForTimeout(700);
        }
        await page.waitForTimeout(400);
        console.log(`      ${await slotsLeft()} slot(s) left, ${await page.locator(".rack button").count()} tile(s) in the rack`);
        await geometry({ board: ".board", stake: ".stake", rack: ".rack" });
        await shoot("jolt-flush-gameplay");
    } catch (err) {
        console.log(`    FAILED: ${String(err).split("\n")[0].slice(0, 160)}`);
    }
}

// ----------------------------------------------------------------- bug hunt

if (wanted("bughunt")) {
    console.log("\n  Bug Hunt -- the incident");
    try {
        await start("/bug-hunt", ".bh-briefing", "Start hunt");
        await page.locator(".bh-incident").waitFor({ timeout: 20000 });
        // Let the alert beat clear so the incident is fully settled.
        await page.waitForTimeout(1200);
        await geometry({
            incident: ".bh-incident",
            title: ".bh-incident-title",
            report: ".bh-bug-report",
            code: ".bh-code",
            actions: ".bh-actions"
        });
        await shoot("jolt-bug-hunt-gameplay");
    } catch (err) {
        console.log(`    FAILED: ${String(err).split("\n")[0].slice(0, 160)}`);
    }
}

// ----------------------------------------------------------------- reaction

if (wanted("reaction")) {
    console.log("\n  Reaction -- the GO signal");
    try {
        await start("/reaction", ".rx-intro", /Start/);
        // The arena only says GO once the wait has elapsed, and the wait is
        // deliberately unpredictable -- so this waits for the element rather than
        // for a duration. Capture before clicking: the click is the reaction, and
        // the frame after it is a number, not a signal.
        await page.locator(".rx-go").waitFor({ timeout: 20000 });
        await shoot("jolt-reaction-gameplay");
    } catch (err) {
        console.log(`    FAILED: ${String(err).split("\n")[0].slice(0, 160)}`);
    }
}

// ------------------------------------------------------------------- memory

if (wanted("memory")) {
    console.log("\n  Memory -- the recall phase");
    try {
        await start("/memory", ".mem-intro", "Start");
        await page.locator(".mem-bank").waitFor({ timeout: 30000 });
        await page.waitForTimeout(600);

        // Fill most of the row. A row of coloured symbols reads as a game in
        // play; one symbol beside three empty outlines reads as a form nobody
        // filled in. Stopping one short keeps it mid-answer.
        const symbols = page.locator(".mem-bank button");
        const slots = await page.locator(".mem-slot").count();
        const bank = await symbols.count();
        const place = Math.max(0, Math.min(slots - 1, bank));
        console.log(`      ${slots} slot(s), ${bank} symbol(s) -- placing ${place}`);

        for (let i = 0; i < place; i += 1) {
            await symbols.nth(i % bank).click();
            await page.waitForTimeout(280);
        }
        await page.waitForTimeout(450);
        await shoot("jolt-memory-gameplay");
    } catch (err) {
        console.log(`    FAILED: ${String(err).split("\n")[0].slice(0, 160)}`);
    }
}

await abandonAll();
await browser.close();

if (problems.length) console.log(`\n  console errors: ${[...new Set(problems)].join(" | ")}`);
console.log("");
