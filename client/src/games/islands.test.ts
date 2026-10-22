import { describe, expect, it } from "vitest";
import type { GameStatus } from "../components/GameCard.js";
import { BUG_HUNT, CODE_BLITZ, FLUSH, LIVE_GAMES, MEMORY, REACTION } from "./catalog.js";
import { islandsFor, recommendedIsland } from "./islands.js";

/** Islands mirror each game's real readiness; nothing is invented. */

const ready = (counts: boolean): GameStatus => ({ kind: "ready", text: "Ready to play.", counts });
const needs: GameStatus = { kind: "needs", text: "Opens at 3 puzzles on ideas you’ve learned (1 so far).", counts: true };

const STATUSES = {
    [CODE_BLITZ]: ready(true),
    [FLUSH]: needs,
    [BUG_HUNT]: ready(true),
    [REACTION]: ready(false),
    [MEMORY]: ready(false)
};

const none = () => null;

describe("islands", () => {
    it("draws a game in mist only when its readiness says it cannot deal a run", () => {
        const islands = islandsFor({ games: LIVE_GAMES, statuses: STATUSES, resumeFor: none });
        const state = Object.fromEntries(islands.map((i) => [i.game.slug, i.state]));

        expect(state).toEqual({
            [CODE_BLITZ]: "ready",
            [FLUSH]: "misty",
            [BUG_HUNT]: "ready",
            [REACTION]: "ready",
            [MEMORY]: "ready"
        });
    });

    it("keeps a misted island reachable, named for what it opens to", () => {
        const flush = islandsFor({ games: LIVE_GAMES, statuses: STATUSES, resumeFor: none }).find((i) => i.game.slug === FLUSH)!;
        expect(flush.action).toBe("See how to open it");
        expect(flush.actionLabel).toBe("Flush: how to open");
    });

    it("says which games count and which are just for fun", () => {
        const islands = islandsFor({ games: LIVE_GAMES, statuses: STATUSES, resumeFor: none });
        expect(islands.filter((i) => i.counts === false).map((i) => i.game.slug).sort()).toEqual([MEMORY, REACTION].sort());
    });

    it("claims nothing about readiness when it is not known", () => {
        const islands = islandsFor({ games: LIVE_GAMES, statuses: null, resumeFor: none });
        expect(islands.every((i) => i.state === "unknown" && i.counts === null && i.status === null)).toBe(true);
    });

    it("offers a run in progress back, even on a game that would otherwise be misty", () => {
        const islands = islandsFor({
            games: LIVE_GAMES,
            statuses: STATUSES,
            resumeFor: (slug) => (slug === FLUSH ? { unitsDone: 1, unitsTotal: 3, score: 40 } : null)
        });
        const flush = islands.find((i) => i.game.slug === FLUSH)!;
        expect(flush.state).toBe("resume");
        expect(flush.action).toBe("Continue your run");
    });
});

describe("the recommended island", () => {
    it("is a run in progress first", () => {
        const islands = islandsFor({
            games: LIVE_GAMES,
            statuses: STATUSES,
            resumeFor: (slug) => (slug === BUG_HUNT ? { unitsDone: 2, unitsTotal: 6, score: 300 } : null)
        });
        expect(recommendedIsland(islands)).toEqual({ slug: BUG_HUNT, why: "You have a run in progress" });
    });

    it("is otherwise Code Blitz, the game that practises the current lesson", () => {
        const islands = islandsFor({ games: LIVE_GAMES, statuses: STATUSES, resumeFor: none });
        expect(recommendedIsland(islands)?.slug).toBe(CODE_BLITZ);
    });

    it("is never Reaction or Memory, which count for nothing", () => {
        const islands = islandsFor({
            games: LIVE_GAMES.filter((g) => g.slug === REACTION || g.slug === MEMORY),
            statuses: STATUSES,
            resumeFor: none
        });
        expect(recommendedIsland(islands)).toBeNull();
    });
});
