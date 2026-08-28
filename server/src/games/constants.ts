/**
 * Slugs are the contract between code and the games table. Referencing a slug
 * rather than a numeric id keeps application code stable across reseeds and
 * readable in logs.
 */
export const CODE_BLITZ = "code-blitz";
export const FLUSH = "flush";
export const REACTION = "reaction";
export const MEMORY = "memory";
export const BUG_HUNT = "bug-hunt";

/**
 * Every game the platform knows about. Used to reject an unknown :game path
 * parameter with a 404 rather than letting it silently match nothing, and to
 * assert in tests that each game has registered a session adapter.
 */
export const GAME_SLUGS = [CODE_BLITZ, FLUSH, REACTION, MEMORY, BUG_HUNT] as const;

export function isKnownGameSlug(slug: string): boolean {
    return (GAME_SLUGS as readonly string[]).includes(slug);
}
