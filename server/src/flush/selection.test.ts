import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RECENT_SESSIONS_AVOIDED } from "./queries.js";
import { RECENT_SESSIONS_AVOIDED as BLITZ_LOOKBACK } from "../game/queries.js";

const QUERIES = readFileSync(new URL("./queries.ts", import.meta.url), "utf8");
const deal = QUERIES.slice(
    QUERIES.indexOf("export async function createSessionWithRounds"),
    QUERIES.indexOf("export async function listRounds")
);

describe("Flush deals snippets the player has not just seen", () => {
    it("prefers unseen snippets", () => {
        expect(deal).toMatch(/WITH recent AS/);
        expect(deal).toMatch(
            /ORDER BY \(s\.id IN \(SELECT snippet_id FROM recent\)\) ASC, RANDOM\(\)/
        );
    });

    it("prefers rather than filters, so five rounds are always dealt", () => {
        // A NOT IN would leave a player who has worked through the bank unable to
        // start a game. Ordering degrades: unseen first, seen after.
        expect(deal).not.toMatch(/NOT IN \(SELECT snippet_id FROM recent\)/);
        expect(deal).toMatch(/LIMIT \$2/);
    });

    it("keeps the difficulty ramp intact", () => {
        // Recency decides which snippets are candidates; difficulty still decides
        // the order they are played in. Losing this would flatten the session.
        expect(deal).toMatch(/ROW_NUMBER\(\) OVER \(ORDER BY picked\.difficulty, picked\.shuffle\)/);
    });

    it("scopes the lookback to this player and this game", () => {
        expect(deal).toMatch(/gs\.user_id = \$3/);
        expect(deal).toMatch(/gs\.game_id = \(SELECT id FROM games WHERE slug = \$4\)/);
        expect(deal).toMatch(/gs\.id <> \$1/);
    });

    it("uses the same lookback as Code Blitz", () => {
        // Two games disagreeing about how long a player's memory is assumed to be
        // would be an arbitrary difference a player could feel but not explain.
        expect(RECENT_SESSIONS_AVOIDED).toBe(BLITZ_LOOKBACK);
    });
});
