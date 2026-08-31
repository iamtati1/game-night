-- Rename the second game from Tick to Flush.
--
-- Forward-only, per the migration rule: 008 has already been applied, so it is
-- left as an accurate record of what it did. Renaming rather than rewriting also
-- means no database rebuild, so existing accounts and game history survive.
--
-- This renames identifiers only. No table gains or loses a column, no constraint
-- changes what it permits, and no data is altered except the games row's slug
-- and display name.

UPDATE games
SET slug = 'flush',
    name = 'Flush',
    tagline = 'Predict what runs next. The event loop is not on your side.'
WHERE slug = 'tick';

-- ------------------------------------------------------------- tables -------

ALTER TABLE tick_snippets        RENAME TO flush_snippets;
ALTER TABLE tick_outputs         RENAME TO flush_outputs;
ALTER TABLE tick_rounds          RENAME TO flush_rounds;
ALTER TABLE tick_round_placements RENAME TO flush_round_placements;

-- --------------------------------------------------------- constraints -------
-- RENAME TO on a table does not rename its constraints, so each is renamed
-- explicitly. Otherwise a violation on flush_rounds would report a constraint
-- called tick_rounds_status_valid, which is exactly the kind of stale naming
-- that makes debugging confusing months later.

ALTER TABLE flush_snippets RENAME CONSTRAINT tick_snippets_difficulty_range  TO flush_snippets_difficulty_range;
ALTER TABLE flush_snippets RENAME CONSTRAINT tick_snippets_prompt_not_blank  TO flush_snippets_prompt_not_blank;
ALTER TABLE flush_snippets RENAME CONSTRAINT tick_snippets_prompt_max_length TO flush_snippets_prompt_max_length;
ALTER TABLE flush_snippets RENAME CONSTRAINT tick_snippets_source_not_blank  TO flush_snippets_source_not_blank;

ALTER TABLE flush_outputs RENAME CONSTRAINT tick_outputs_text_not_blank         TO flush_outputs_text_not_blank;
ALTER TABLE flush_outputs RENAME CONSTRAINT tick_outputs_text_max_length        TO flush_outputs_text_max_length;
ALTER TABLE flush_outputs RENAME CONSTRAINT tick_outputs_position_matches_kind  TO flush_outputs_position_matches_kind;
ALTER TABLE flush_outputs RENAME CONSTRAINT tick_outputs_unique_id_snippet      TO flush_outputs_unique_id_snippet;

ALTER TABLE flush_rounds RENAME CONSTRAINT tick_rounds_display_order_positive    TO flush_rounds_display_order_positive;
ALTER TABLE flush_rounds RENAME CONSTRAINT tick_rounds_total_outputs_positive    TO flush_rounds_total_outputs_positive;
ALTER TABLE flush_rounds RENAME CONSTRAINT tick_rounds_correct_placements_range  TO flush_rounds_correct_placements_range;
ALTER TABLE flush_rounds RENAME CONSTRAINT tick_rounds_status_valid              TO flush_rounds_status_valid;
ALTER TABLE flush_rounds RENAME CONSTRAINT tick_rounds_unique_snippet            TO flush_rounds_unique_snippet;
ALTER TABLE flush_rounds RENAME CONSTRAINT tick_rounds_unique_display_order      TO flush_rounds_unique_display_order;
ALTER TABLE flush_rounds RENAME CONSTRAINT tick_rounds_unique_id_snippet         TO flush_rounds_unique_id_snippet;
ALTER TABLE flush_rounds RENAME CONSTRAINT tick_rounds_pending_state             TO flush_rounds_pending_state;
ALTER TABLE flush_rounds RENAME CONSTRAINT tick_rounds_completed_state           TO flush_rounds_completed_state;
ALTER TABLE flush_rounds RENAME CONSTRAINT tick_rounds_failed_state              TO flush_rounds_failed_state;
ALTER TABLE flush_rounds RENAME CONSTRAINT tick_rounds_timed_out_state           TO flush_rounds_timed_out_state;

ALTER TABLE flush_round_placements RENAME CONSTRAINT tick_placements_index_positive  TO flush_placements_index_positive;
ALTER TABLE flush_round_placements RENAME CONSTRAINT tick_placements_text_not_blank  TO flush_placements_text_not_blank;
ALTER TABLE flush_round_placements RENAME CONSTRAINT tick_placements_output_fk       TO flush_placements_output_fk;
ALTER TABLE flush_round_placements RENAME CONSTRAINT tick_placements_round_fk        TO flush_placements_round_fk;
ALTER TABLE flush_round_placements RENAME CONSTRAINT tick_placements_unique_output   TO flush_placements_unique_output;
ALTER TABLE flush_round_placements RENAME CONSTRAINT tick_placements_unique_index    TO flush_placements_unique_index;

-- ------------------------------------------------------------ indexes -------

ALTER INDEX tick_snippets_difficulty_idx    RENAME TO flush_snippets_difficulty_idx;
ALTER INDEX tick_snippets_external_ref_idx  RENAME TO flush_snippets_external_ref_idx;
ALTER INDEX tick_outputs_active_position_idx RENAME TO flush_outputs_active_position_idx;
ALTER INDEX tick_outputs_active_text_idx    RENAME TO flush_outputs_active_text_idx;
ALTER INDEX tick_rounds_snippet_id_idx      RENAME TO flush_rounds_snippet_id_idx;

-- ----------------------------------------------------------- triggers -------

ALTER TRIGGER tick_snippets_updated_at ON flush_snippets RENAME TO flush_snippets_updated_at;
ALTER TRIGGER tick_outputs_updated_at  ON flush_outputs  RENAME TO flush_outputs_updated_at;

-- Verification: nothing in the schema should still be named tick.
SELECT 'tables' AS kind, COUNT(*) AS remaining
FROM pg_tables WHERE tablename LIKE 'tick%'
UNION ALL
SELECT 'constraints', COUNT(*) FROM pg_constraint WHERE conname LIKE 'tick%'
UNION ALL
SELECT 'indexes', COUNT(*) FROM pg_indexes WHERE indexname LIKE 'tick%'
UNION ALL
SELECT 'triggers', COUNT(*) FROM pg_trigger WHERE tgname LIKE 'tick%'
UNION ALL
SELECT 'games rows', COUNT(*) FROM games WHERE slug = 'tick';
