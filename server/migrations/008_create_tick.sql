-- Tick: predict the order in which console.log output appears.
--
-- Per-game round tables rather than a shared polymorphic table with a JSONB
-- payload. The strength of this schema is that invariants are enforced by the
-- database -- exactly-one-correct-option, the session state matrix, composite
-- foreign keys. A JSONB blob would move all of that back into application code.
-- The shared layer is game_sessions; each game specialises its own rounds.
--
-- Tick could not reuse questions/question_options: it needs MANY correct outputs
-- in a defined order, and question_options_one_active_correct_idx enforces
-- exactly one. Reusing that table would have meant dropping the constraint that
-- makes Code Blitz correct.

INSERT INTO games (slug, name, tagline)
VALUES ('tick', 'Tick', 'Predict the output order. The event loop is not on your side.');

-- ---------------------------------------------------------------- content ----

CREATE TABLE tick_snippets (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    prompt TEXT NOT NULL,

    -- Same provenance columns as questions (migration 006), so an importer can
    -- source snippets externally later without another migration.
    source TEXT NOT NULL DEFAULT 'internal',
    external_ref TEXT,

    -- Tick deals rounds in ascending difficulty, so a session ramps rather than
    -- being flat-random like Code Blitz. Stored rather than inferred from output
    -- count, because count is a poor proxy: a three-output microtask puzzle is
    -- harder than a five-output timer puzzle.
    difficulty SMALLINT NOT NULL DEFAULT 1,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT tick_snippets_difficulty_range
        CHECK (difficulty BETWEEN 1 AND 5),

    CONSTRAINT tick_snippets_prompt_not_blank
        CHECK (TRIM(prompt) <> ''),

    CONSTRAINT tick_snippets_prompt_max_length
        CHECK (LENGTH(prompt) <= 5000),

    CONSTRAINT tick_snippets_source_not_blank
        CHECK (TRIM(source) <> '')
);

-- Supports dealing a session's rounds in ascending difficulty.
CREATE INDEX tick_snippets_difficulty_idx
    ON tick_snippets (difficulty)
    WHERE is_active;

CREATE UNIQUE INDEX tick_snippets_external_ref_idx
    ON tick_snippets (source, external_ref)
    WHERE external_ref IS NOT NULL;

CREATE TRIGGER tick_snippets_updated_at
BEFORE UPDATE ON tick_snippets
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION update_updated_at();

CREATE TABLE tick_outputs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    snippet_id BIGINT NOT NULL
        REFERENCES tick_snippets(id) ON DELETE RESTRICT,

    output_text TEXT NOT NULL,

    -- 1-based position in the real output order. NULL for distractors: outputs
    -- that are offered as tiles but never actually printed.
    position INTEGER,

    is_distractor BOOLEAN NOT NULL DEFAULT FALSE,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT tick_outputs_text_not_blank
        CHECK (TRIM(output_text) <> ''),

    CONSTRAINT tick_outputs_text_max_length
        CHECK (LENGTH(output_text) <= 200),

    -- The core invariant: a real output has a position, a distractor does not.
    -- Without this, a distractor could claim position 2 and silently corrupt the
    -- expected sequence.
    CONSTRAINT tick_outputs_position_matches_kind
        CHECK (
            (is_distractor AND position IS NULL)
            OR (NOT is_distractor AND position IS NOT NULL AND position > 0)
        ),

    -- Composite-FK target, so a placement can be proven to belong to the same
    -- snippet as its round. Same pattern as question_options.
    CONSTRAINT tick_outputs_unique_id_snippet
        UNIQUE (snippet_id, id)
);

-- One output per position, counting active rows only -- so a badly-worded output
-- can be retired and replaced without its slot staying reserved. Same lesson as
-- question_options_active_display_order_idx.
CREATE UNIQUE INDEX tick_outputs_active_position_idx
    ON tick_outputs (snippet_id, position)
    WHERE is_active AND NOT is_distractor;

-- Two identical tiles would make the puzzle ill-defined: the player could not
-- tell which one belongs at which position, and either ordering would be
-- equally defensible. Enforced rather than left to whoever writes content.
CREATE UNIQUE INDEX tick_outputs_active_text_idx
    ON tick_outputs (snippet_id, output_text)
    WHERE is_active;

CREATE TRIGGER tick_outputs_updated_at
BEFORE UPDATE ON tick_outputs
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION update_updated_at();

-- ------------------------------------------------------------------ play ----

CREATE TABLE tick_rounds (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    game_session_id BIGINT NOT NULL
        REFERENCES game_sessions(id) ON DELETE CASCADE,

    snippet_id BIGINT NOT NULL
        REFERENCES tick_snippets(id) ON DELETE RESTRICT,

    display_order INTEGER NOT NULL,

    -- Snapshots, for the same reason session_questions snapshots its prompt:
    -- editing a snippet tomorrow must not rewrite a game played today.
    prompt_text TEXT NOT NULL,
    total_outputs INTEGER NOT NULL,

    status TEXT NOT NULL DEFAULT 'pending',

    served_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,

    -- How many placements were banked before the round ended. Points are derived
    -- from this and `status`, so there is no stored points column to drift.
    correct_placements INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT tick_rounds_display_order_positive
        CHECK (display_order > 0),

    CONSTRAINT tick_rounds_total_outputs_positive
        CHECK (total_outputs > 0),

    CONSTRAINT tick_rounds_correct_placements_range
        CHECK (correct_placements >= 0 AND correct_placements <= total_outputs),

    CONSTRAINT tick_rounds_status_valid
        CHECK (status IN ('pending', 'completed', 'failed', 'timed_out')),

    CONSTRAINT tick_rounds_unique_snippet
        UNIQUE (game_session_id, snippet_id),

    CONSTRAINT tick_rounds_unique_display_order
        UNIQUE (game_session_id, display_order),

    -- Composite-FK target for placements, mirroring tick_outputs above.
    CONSTRAINT tick_rounds_unique_id_snippet
        UNIQUE (id, snippet_id),

    -- State matrix. 'pending' covers both planned (served_at NULL) and in play.
    CONSTRAINT tick_rounds_pending_state
        CHECK (status <> 'pending' OR ended_at IS NULL),

    -- A completed round means every output was placed correctly.
    CONSTRAINT tick_rounds_completed_state
        CHECK (
            status <> 'completed'
            OR (served_at IS NOT NULL AND ended_at IS NOT NULL
                AND correct_placements = total_outputs)
        ),

    -- A failed round ended on a wrong placement, so it cannot be complete.
    CONSTRAINT tick_rounds_failed_state
        CHECK (
            status <> 'failed'
            OR (served_at IS NOT NULL AND ended_at IS NOT NULL
                AND correct_placements < total_outputs)
        ),

    CONSTRAINT tick_rounds_timed_out_state
        CHECK (
            status <> 'timed_out'
            OR (served_at IS NOT NULL AND ended_at IS NOT NULL)
        )
);

CREATE INDEX tick_rounds_snippet_id_idx
    ON tick_rounds (snippet_id, id);

CREATE TABLE tick_round_placements (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    round_id BIGINT NOT NULL,

    -- Denormalised so the two composite foreign keys below can prove that the
    -- placed output and the round refer to the same snippet.
    snippet_id BIGINT NOT NULL,

    output_id BIGINT NOT NULL,

    /** 1-based order in which the player clicked. */
    placement_index INTEGER NOT NULL,

    is_correct BOOLEAN NOT NULL,

    -- Snapshot of what the tile said when it was clicked.
    output_text TEXT NOT NULL,

    placed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT tick_placements_index_positive
        CHECK (placement_index > 0),

    CONSTRAINT tick_placements_text_not_blank
        CHECK (TRIM(output_text) <> ''),

    -- The placed output must belong to the round's snippet...
    CONSTRAINT tick_placements_output_fk
        FOREIGN KEY (snippet_id, output_id)
        REFERENCES tick_outputs (snippet_id, id)
        ON DELETE RESTRICT,

    -- ...and the snippet recorded here must be the round's actual snippet, so the
    -- two cannot disagree.
    CONSTRAINT tick_placements_round_fk
        FOREIGN KEY (round_id, snippet_id)
        REFERENCES tick_rounds (id, snippet_id)
        ON DELETE CASCADE,

    -- A tile cannot be placed twice, and a slot cannot be filled twice.
    CONSTRAINT tick_placements_unique_output
        UNIQUE (round_id, output_id),

    CONSTRAINT tick_placements_unique_index
        UNIQUE (round_id, placement_index)
);
