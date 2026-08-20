import { describe, expect, it } from "vitest";
import {
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    computeHasMore,
    toHistoryPage,
    toHistorySession,
    totalFromRows,
    type HistorySessionRow
} from "./history.js";
import { historyQuerySchema } from "./schemas.js";

function row(overrides: Partial<HistorySessionRow> = {}): HistorySessionRow {
    return {
        id: "31",
        game_slug: "code-blitz",
        game_name: "Code Blitz",
        status: "completed",
        score: 450,
        xp_earned: 55,
        started_at: new Date("2026-08-20T02:05:11.021Z"),
        ended_at: new Date("2026-08-20T02:07:48.442Z"),
        total_units: "10",
        correct_count: "3",
        incorrect_count: "7",
        timed_out_count: "0",
        total_rows: "23",
        ...overrides
    };
}

describe("toHistorySession", () => {
    it("coerces Postgres count strings into numbers", () => {
        const session = toHistorySession(row());

        expect(session.progress).toEqual({ total: 10, correct: 3, incorrect: 7, timedOut: 0 });
    });

    it("attaches the game the session belongs to", () => {
        // Game-agnostic shape: Code Blitz counts questions, Tick will count
        // rounds, and the response looks identical either way.
        const session = toHistorySession(row({ game_slug: "tick", game_name: "Tick" }));

        expect(session.game).toEqual({ slug: "tick", name: "Tick" });
    });

    it("serializes timestamps as ISO strings", () => {
        const session = toHistorySession(row());

        expect(session.startedAt).toBe("2026-08-20T02:05:11.021Z");
        expect(session.endedAt).toBe("2026-08-20T02:07:48.442Z");
    });

    it("leaves endedAt null while a game is in progress", () => {
        const session = toHistorySession(row({ status: "in_progress", ended_at: null }));

        expect(session.endedAt).toBeNull();
        expect(session.startedAt).not.toBeNull();
    });

    it("returns the stored score for an abandoned game rather than nulling it", () => {
        // The row genuinely holds 0. Rendering that as a dash is the UI's job --
        // the API must not misreport what the database contains. This differs
        // from stats.bestScore, where MAX() over zero rows is genuinely unknown.
        const session = toHistorySession(
            row({ status: "abandoned", score: 0, xp_earned: 0, ended_at: new Date("2026-08-20T02:30:00.000Z") })
        );

        expect(session.score).toBe(0);
        expect(session.xpEarned).toBe(0);
    });

    it("keeps every numeric field a number, never a string", () => {
        const session = toHistorySession(row());

        for (const key of ["score", "xpEarned"] as const) {
            expect(typeof session[key], `${key} must be numeric`).toBe("number");
        }

        for (const [key, value] of Object.entries(session.progress)) {
            expect(typeof value, `progress.${key} must be numeric`).toBe("number");
        }
    });
});

describe("computeHasMore", () => {
    it("is true when the page does not reach the total", () => {
        expect(computeHasMore(0, 10, 23)).toBe(true);
    });

    it("is false on the exact last page", () => {
        expect(computeHasMore(20, 3, 23)).toBe(false);
    });

    it("is false past the end", () => {
        expect(computeHasMore(200, 0, 23)).toBe(false);
    });

    it("is false for a player with no games", () => {
        expect(computeHasMore(0, 0, 0)).toBe(false);
    });
});

describe("totalFromRows", () => {
    it("reads the window count from the first row", () => {
        expect(totalFromRows([row(), row()])).toBe(23);
    });

    it("returns null for an empty page, because COUNT(*) OVER () produced no row", () => {
        // This is why the query falls back to a separate COUNT: an offset past
        // the end and a brand-new player both come back with zero rows, and they
        // need different UI.
        expect(totalFromRows([])).toBeNull();
    });
});

describe("toHistoryPage", () => {
    it("assembles rows with accurate pagination metadata", () => {
        const page = toHistoryPage([row(), row({ id: "30" })], 10, 0, 23);

        expect(page.sessions).toHaveLength(2);
        expect(page.pagination).toEqual({ limit: 10, offset: 0, total: 23, hasMore: true });
    });

    it("reports an accurate total even when the page is empty", () => {
        const page = toHistoryPage([], 10, 200, 23);

        expect(page.sessions).toEqual([]);
        expect(page.pagination).toEqual({ limit: 10, offset: 200, total: 23, hasMore: false });
    });
});

describe("historyQuerySchema", () => {
    it("defaults an absent limit and offset", () => {
        const parsed = historyQuerySchema.parse({});
        expect(parsed).toEqual({ limit: DEFAULT_PAGE_SIZE, offset: 0 });
    });

    it("coerces numeric strings, since query params are always strings", () => {
        expect(historyQuerySchema.parse({ limit: "25", offset: "50" })).toEqual({
            limit: 25,
            offset: 50
        });
    });

    it("rejects a non-numeric limit instead of passing NaN to the database", () => {
        expect(historyQuerySchema.safeParse({ limit: "abc" }).success).toBe(false);
    });

    it("rejects a limit above the maximum", () => {
        expect(historyQuerySchema.safeParse({ limit: String(MAX_PAGE_SIZE + 1) }).success).toBe(false);
    });

    it("rejects zero, a negative offset, and fractional values", () => {
        expect(historyQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
        expect(historyQuerySchema.safeParse({ offset: "-1" }).success).toBe(false);
        expect(historyQuerySchema.safeParse({ limit: "2.5" }).success).toBe(false);
    });

    it("accepts the boundary values", () => {
        expect(historyQuerySchema.parse({ limit: "1", offset: "0" })).toEqual({ limit: 1, offset: 0 });
        expect(historyQuerySchema.parse({ limit: String(MAX_PAGE_SIZE) }).limit).toBe(MAX_PAGE_SIZE);
    });
});
