import { describe, expect, it } from "vitest";
import { GAME_ADAPTERS, adapterFor } from "./adapters.js";
import { CODE_BLITZ, FLUSH, GAME_SLUGS } from "../games/constants.js";

describe("every game registers a session adapter", () => {
    // This is the test the registry exists for. A switch statement inside
    // resumePausedSession would fail silently for a game whose branch was
    // forgotten: the clock would never shift, so the player would resume into a
    // unit that expired while they were away, and nothing would throw.
    it("covers every known slug", () => {
        expect(Object.keys(GAME_ADAPTERS).sort()).toEqual([...GAME_SLUGS].sort());
    });

    it("registers both halves for each game", () => {
        for (const slug of GAME_SLUGS) {
            const adapter = adapterFor(slug);

            expect(adapter, slug).not.toBeNull();
            expect(typeof adapter!.shiftClock, `${slug}.shiftClock`).toBe("function");
            expect(typeof adapter!.scoreSoFar, `${slug}.scoreSoFar`).toBe("function");
        }
    });

    it("does not invent an adapter for an unknown game", () => {
        expect(adapterFor("solitaire")).toBeNull();
    });

    it("keys adapters by the shared slug constants, not string literals", () => {
        expect(GAME_ADAPTERS[CODE_BLITZ]).toBeDefined();
        expect(GAME_ADAPTERS[FLUSH]).toBeDefined();
    });
});
