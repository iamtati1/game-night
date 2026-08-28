import { describe, expect, it } from "vitest";
import {
    TIMER_LABELS,
    alertLine,
    debriefLine,
    failedLine,
    recoverableLine,
    resolvedLine,
    retryLine,
    runPhase,
    severityLabel
} from "./bugHuntVoice.js";

describe("the system's voice is deterministic", () => {
    it("says the same thing for the same moment, every time", () => {
        // Randomness here would make the lines untestable and would mean a player
        // replaying an incident meets a different system.
        expect(alertLine(2, false)).toBe(alertLine(2, false));
        expect(resolvedLine(3, 1)).toBe(resolvedLine(3, 1));
        expect(retryLine(4)).toBe(retryLine(4));
    });

    it("does not repeat itself across a five-incident run", () => {
        const alerts = [1, 2, 3, 4].map((n) => alertLine(n, false));

        expect(new Set(alerts).size).toBe(alerts.length);
    });

    it("never runs off the end of a list", () => {
        for (const n of [0, 1, 7, 99, -3]) {
            expect(alertLine(n, false), `alert ${n}`).toBeTruthy();
            expect(retryLine(n), `retry ${n}`).toBeTruthy();
            expect(resolvedLine(n, 1), `resolved ${n}`).toBeTruthy();
            expect(failedLine(n, false), `failed ${n}`).toBeTruthy();
        }
    });
});

describe("the voice fits the moment", () => {
    it("opens the run rather than continuing one that has not started", () => {
        // Incident one was saying "Another one." before anything had gone wrong,
        // which reads as a continuation of nothing.
        expect(alertLine(1, false)).not.toMatch(/another|escalated/i);
        expect(alertLine(1, false)).toMatch(/just started failing/i);
        // And the second really is another one.
        expect(alertLine(2, false)).toMatch(/another one/i);
    });

    it("gives the boss its own alert, whatever its number", () => {
        expect(alertLine(5, true)).not.toBe(alertLine(5, false));
        expect(alertLine(5, true)).toMatch(/everything goes/i);
    });

    it("acknowledges a streak instead of repeating a plain win", () => {
        expect(resolvedLine(1, 1)).not.toMatch(/row|straight|five for five/i);
        expect(resolvedLine(1, 3)).toMatch(/row|straight/i);
    });

    it("distinguishes running out of time from being wrong", () => {
        expect(failedLine(1, true)).toMatch(/time/i);
        expect(failedLine(1, false)).not.toMatch(/out of time/i);
    });

    it("offers a way forward after a loss", () => {
        expect(recoverableLine()).toMatch(/keep going/i);
    });

    it("is honest in the debrief rather than flattering", () => {
        expect(debriefLine(5, 5)).toMatch(/every service/i);
        expect(debriefLine(3, 5)).not.toBe(debriefLine(5, 5));
        expect(debriefLine(0, 5)).toMatch(/rough/i);
    });

    it("stays short enough to actually be read", () => {
        // A paragraph mid-incident is read once and skipped forever after.
        const every = [
            ...[1, 2, 3, 4, 5].map((n) => alertLine(n, false)),
            alertLine(5, true),
            ...[1, 2, 3].map((n) => resolvedLine(n, 1)),
            ...[3, 4, 5].map((s) => resolvedLine(1, s)),
            ...[1, 2, 3].map((n) => retryLine(n)),
            failedLine(1, true),
            failedLine(1, false),
            recoverableLine(),
            debriefLine(5, 5),
            debriefLine(3, 5),
            debriefLine(0, 5)
        ];

        for (const line of every) {
            expect(line.length, `too long: "${line}"`).toBeLessThanOrEqual(90);
        }
    });
});

describe("severity", () => {
    it("turns the stored 1-5 into something a player can act on", () => {
        expect(severityLabel(1)).toBe("Routine");
        expect(severityLabel(5)).toBe("Critical");
    });

    it("clamps rather than returning undefined", () => {
        expect(severityLabel(0)).toBe("Routine");
        expect(severityLabel(99)).toBe("Critical");
    });
});

describe("timer wording", () => {
    it("covers exactly the tiers Countdown produces", () => {
        // Countdown picks calm/warn/urgent. A missing key would render nothing
        // at the moment the clock matters most.
        expect(Object.keys(TIMER_LABELS).sort()).toEqual(["calm", "urgent", "warn"]);
    });

    it("escalates rather than repeating itself", () => {
        expect(new Set(Object.values(TIMER_LABELS)).size).toBe(3);
        expect(TIMER_LABELS.urgent).toMatch(/imminent/i);
    });
});

describe("run phases", () => {
    it("names where the player is rather than only numbering it", () => {
        expect(runPhase(1, 10)).toMatch(/warming/i);
        expect(runPhase(5, 10)).toMatch(/sharp/i);
        expect(runPhase(8, 10)).toMatch(/deeper/i);
    });

    it("always calls the last hunt the final one", () => {
        // Whatever the run length, the closing hunt is the closing hunt.
        expect(runPhase(10, 10)).toMatch(/final/i);
        expect(runPhase(5, 5)).toMatch(/final/i);
    });

    it("gives the opening three hunts the gentlest framing", () => {
        for (const hunt of [1, 2, 3]) {
            expect(runPhase(hunt, 10), `hunt ${hunt}`).toMatch(/warming/i);
        }

        expect(runPhase(4, 10)).not.toMatch(/warming/i);
    });
});
