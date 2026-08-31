import { toNumber, toProgress, type GameRef, type Numeric, type Progress } from "./shared.js";

export type { GameRef, Progress };

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 50;

export interface HistorySession {
    id: string;
    game: GameRef;
    status: string;
    /** Stored value, including 0 for abandoned/in-progress games. The UI shows
     *  "—" for those; the API does not misreport what the row holds. */
    score: number;
    xpEarned: number;
    startedAt: string;
    /** COALESCE(completed_at, abandoned_at). null while in progress -- `status`
     *  already says which kind of ending it was. */
    endedAt: string | null;
    progress: Progress;
}

export interface Pagination {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
}

export interface HistoryPage {
    sessions: HistorySession[];
    pagination: Pagination;
}

export interface HistorySessionRow {
    id: string;
    game_slug: string;
    game_name: string;
    status: string;
    score: Numeric;
    xp_earned: Numeric;
    started_at: Date;
    ended_at: Date | null;
    total_units: Numeric;
    correct_count: Numeric;
    incorrect_count: Numeric;
    timed_out_count: Numeric;
    /** COUNT(*) OVER () -- the full match count, computed before LIMIT. */
    total_rows: Numeric;
}

export function toHistorySession(row: HistorySessionRow): HistorySession {
    return {
        id: row.id,
        game: { slug: row.game_slug, name: row.game_name },
        status: row.status,
        score: toNumber(row.score),
        xpEarned: toNumber(row.xp_earned),
        startedAt: row.started_at.toISOString(),
        endedAt: row.ended_at ? row.ended_at.toISOString() : null,
        progress: toProgress(row)
    };
}

/** True when rows exist beyond the one just returned. */
export function computeHasMore(offset: number, returned: number, total: number): boolean {
    return offset + returned < total;
}

/**
 * Shapes a page. `total` is passed in rather than read from the rows because
 * COUNT(*) OVER () produces no value at all when the page is empty -- an offset
 * past the end returns zero rows, so the count has to come from elsewhere.
 */
export function toHistoryPage(
    rows: HistorySessionRow[],
    limit: number,
    offset: number,
    total: number
): HistoryPage {
    const sessions = rows.map(toHistorySession);

    return {
        sessions,
        pagination: {
            limit,
            offset,
            total,
            hasMore: computeHasMore(offset, sessions.length, total)
        }
    };
}

/** Reads the total out of the first row, or null when the page came back empty. */
export function totalFromRows(rows: HistorySessionRow[]): number | null {
    return rows.length === 0 ? null : toNumber(rows[0]!.total_rows);
}
