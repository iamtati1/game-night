-- Finish the Tick -> Flush rename.
--
-- Migration 009 renamed the four tables, the games row, the indexes, the
-- triggers, and every constraint that 008 declared with an explicit
-- `CONSTRAINT tick_...` name. It could not rename what it never named:
-- PostgreSQL generates its own names for primary keys, for foreign keys
-- declared inline with REFERENCES, and -- as of PostgreSQL 17 -- for every
-- NOT NULL column. Those 37 objects kept the old prefix.
--
-- The statements below were generated from pg_constraint rather than written by
-- hand, so the list is the catalog's rather than someone's reading of 008.
--
-- Renames only. No table gains or loses a column, no constraint changes what it
-- permits, no row is read or written. Nothing outside the four flush_* tables is
-- touched -- flush_rounds_game_session_id_fkey is renamed on flush_rounds, which
-- does not affect game_sessions.
--
-- Wrapped in a transaction so all 37 apply or none do. A failure partway leaves
-- the database exactly as it was rather than half-renamed, which would be a
-- genuinely confusing state to diagnose.
--
-- Lesson for the next game's migration: name every constraint explicitly,
-- including primary and foreign keys. It costs a few characters and makes a
-- rename enumerable from the source instead of only from the catalog.

BEGIN;

ALTER TABLE flush_outputs RENAME CONSTRAINT tick_outputs_created_at_not_null TO flush_outputs_created_at_not_null;
ALTER TABLE flush_outputs RENAME CONSTRAINT tick_outputs_id_not_null TO flush_outputs_id_not_null;
ALTER TABLE flush_outputs RENAME CONSTRAINT tick_outputs_is_active_not_null TO flush_outputs_is_active_not_null;
ALTER TABLE flush_outputs RENAME CONSTRAINT tick_outputs_is_distractor_not_null TO flush_outputs_is_distractor_not_null;
ALTER TABLE flush_outputs RENAME CONSTRAINT tick_outputs_output_text_not_null TO flush_outputs_output_text_not_null;
ALTER TABLE flush_outputs RENAME CONSTRAINT tick_outputs_pkey TO flush_outputs_pkey;
ALTER TABLE flush_outputs RENAME CONSTRAINT tick_outputs_snippet_id_fkey TO flush_outputs_snippet_id_fkey;
ALTER TABLE flush_outputs RENAME CONSTRAINT tick_outputs_snippet_id_not_null TO flush_outputs_snippet_id_not_null;
ALTER TABLE flush_outputs RENAME CONSTRAINT tick_outputs_updated_at_not_null TO flush_outputs_updated_at_not_null;
ALTER TABLE flush_round_placements RENAME CONSTRAINT tick_round_placements_id_not_null TO flush_round_placements_id_not_null;
ALTER TABLE flush_round_placements RENAME CONSTRAINT tick_round_placements_is_correct_not_null TO flush_round_placements_is_correct_not_null;
ALTER TABLE flush_round_placements RENAME CONSTRAINT tick_round_placements_output_id_not_null TO flush_round_placements_output_id_not_null;
ALTER TABLE flush_round_placements RENAME CONSTRAINT tick_round_placements_output_text_not_null TO flush_round_placements_output_text_not_null;
ALTER TABLE flush_round_placements RENAME CONSTRAINT tick_round_placements_pkey TO flush_round_placements_pkey;
ALTER TABLE flush_round_placements RENAME CONSTRAINT tick_round_placements_placed_at_not_null TO flush_round_placements_placed_at_not_null;
ALTER TABLE flush_round_placements RENAME CONSTRAINT tick_round_placements_placement_index_not_null TO flush_round_placements_placement_index_not_null;
ALTER TABLE flush_round_placements RENAME CONSTRAINT tick_round_placements_round_id_not_null TO flush_round_placements_round_id_not_null;
ALTER TABLE flush_round_placements RENAME CONSTRAINT tick_round_placements_snippet_id_not_null TO flush_round_placements_snippet_id_not_null;
ALTER TABLE flush_rounds RENAME CONSTRAINT tick_rounds_correct_placements_not_null TO flush_rounds_correct_placements_not_null;
ALTER TABLE flush_rounds RENAME CONSTRAINT tick_rounds_display_order_not_null TO flush_rounds_display_order_not_null;
ALTER TABLE flush_rounds RENAME CONSTRAINT tick_rounds_game_session_id_fkey TO flush_rounds_game_session_id_fkey;
ALTER TABLE flush_rounds RENAME CONSTRAINT tick_rounds_game_session_id_not_null TO flush_rounds_game_session_id_not_null;
ALTER TABLE flush_rounds RENAME CONSTRAINT tick_rounds_id_not_null TO flush_rounds_id_not_null;
ALTER TABLE flush_rounds RENAME CONSTRAINT tick_rounds_pkey TO flush_rounds_pkey;
ALTER TABLE flush_rounds RENAME CONSTRAINT tick_rounds_prompt_text_not_null TO flush_rounds_prompt_text_not_null;
ALTER TABLE flush_rounds RENAME CONSTRAINT tick_rounds_snippet_id_fkey TO flush_rounds_snippet_id_fkey;
ALTER TABLE flush_rounds RENAME CONSTRAINT tick_rounds_snippet_id_not_null TO flush_rounds_snippet_id_not_null;
ALTER TABLE flush_rounds RENAME CONSTRAINT tick_rounds_status_not_null TO flush_rounds_status_not_null;
ALTER TABLE flush_rounds RENAME CONSTRAINT tick_rounds_total_outputs_not_null TO flush_rounds_total_outputs_not_null;
ALTER TABLE flush_snippets RENAME CONSTRAINT tick_snippets_created_at_not_null TO flush_snippets_created_at_not_null;
ALTER TABLE flush_snippets RENAME CONSTRAINT tick_snippets_difficulty_not_null TO flush_snippets_difficulty_not_null;
ALTER TABLE flush_snippets RENAME CONSTRAINT tick_snippets_id_not_null TO flush_snippets_id_not_null;
ALTER TABLE flush_snippets RENAME CONSTRAINT tick_snippets_is_active_not_null TO flush_snippets_is_active_not_null;
ALTER TABLE flush_snippets RENAME CONSTRAINT tick_snippets_pkey TO flush_snippets_pkey;
ALTER TABLE flush_snippets RENAME CONSTRAINT tick_snippets_prompt_not_null TO flush_snippets_prompt_not_null;
ALTER TABLE flush_snippets RENAME CONSTRAINT tick_snippets_source_not_null TO flush_snippets_source_not_null;
ALTER TABLE flush_snippets RENAME CONSTRAINT tick_snippets_updated_at_not_null TO flush_snippets_updated_at_not_null;

COMMIT;

-- Verification, outside the transaction. Every count must be 0.
SELECT 'constraints named tick_*' AS check, COUNT(*) AS remaining
FROM pg_constraint WHERE conname LIKE 'tick\_%'
UNION ALL
SELECT 'indexes named tick_*', COUNT(*)
FROM pg_indexes WHERE indexname LIKE 'tick\_%'
UNION ALL
SELECT 'triggers named tick_*', COUNT(*)
FROM pg_trigger WHERE tgname LIKE 'tick\_%'
UNION ALL
SELECT 'tables named tick_*', COUNT(*)
FROM pg_tables WHERE tablename LIKE 'tick\_%'
UNION ALL
SELECT 'games rows slugged tick', COUNT(*)
FROM games WHERE slug = 'tick';

-- And a positive check: the four tables should now carry 37 flush_* constraints
-- in addition to the 25 that migration 009 renamed.
SELECT conrelid::regclass AS table_name, COUNT(*) AS flush_constraints
FROM pg_constraint
WHERE conrelid::regclass::text LIKE 'flush\_%'
GROUP BY 1
ORDER BY 1;

SELECT
    count(*) AS remaining_tick_constraints
FROM pg_constraint
WHERE conname LIKE 'tick\_%';