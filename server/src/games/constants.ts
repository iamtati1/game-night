/**
 * Slugs are the contract between code and the games table. Referencing a slug
 * rather than a numeric id keeps application code stable across reseeds and
 * readable in logs.
 */
export const CODE_BLITZ = "code-blitz";
export const FLUSH = "flush";
