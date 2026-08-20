import { pool } from "../db.js";

export interface Game {
    id: string;
    slug: string;
    name: string;
    tagline: string | null;
}

interface GameRow {
    id: string;
    slug: string;
    name: string;
    tagline: string | null;
}

export async function findGameBySlug(slug: string): Promise<Game | null> {
    const result = await pool.query<GameRow>(
        `SELECT id, slug, name, tagline FROM games WHERE slug = $1 AND is_active`,
        [slug]
    );

    return result.rows[0] ?? null;
}

export async function listActiveGames(): Promise<Game[]> {
    const result = await pool.query<GameRow>(
        `SELECT id, slug, name, tagline FROM games WHERE is_active ORDER BY id`
    );

    return result.rows;
}
