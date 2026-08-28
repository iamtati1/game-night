-- Bug Hunt: a live incident, a broken snippet, and a clock.
--
-- Three tables, the same division the other content-driven game uses: a bank
-- (bug_hunt_incidents), the choices belonging to each bank entry
-- (bug_hunt_options, mirroring flush_outputs and question_options), and the play
-- record (bug_hunt_rounds, mirroring flush_rounds and session_questions).
--
-- Deliberately no bug_hunt_sessions table. Session lifecycle -- ownership,
-- status, pause/resume, score, xp, the one-active-session-per-user index -- lives
-- on game_sessions and is shared by every game. A per-game sessions table would
-- fork all of it.
--
-- Wrapped in a transaction: the games row and the tables referencing it should
-- land together or not at all.

BEGIN;

INSERT INTO games (slug, name, tagline)
VALUES ('bug-hunt', 'Bug Hunt', 'Something is broken. Find it before the system does.');

CREATE TABLE bug_hunt_incidents (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- Stable handle for content work; the player never sees it.
    slug TEXT NOT NULL,

    -- The incident as the system reports it: a headline and the symptom, in the
    -- language of a service failing rather than of a question being asked.
    title TEXT NOT NULL,
    bug_report TEXT NOT NULL,

    -- Nullable on purpose. Plenty of real bugs throw nothing at all -- wrong
    -- total, duplicate notification, missing row -- and forcing a stack trace
    -- onto those would teach players to read for the trace instead of the code.
    error_log TEXT,

    -- Which service is failing. Narrative, but also the thing that stops five
    -- incidents in a row from feeling like the same incident recoloured.
    theme TEXT NOT NULL,

    -- What KIND of mistake this is. Drives the results screen's "strong today /
    -- keep practicing" line, which is the only part of the game that claims to
    -- know something about the player.
    bug_category TEXT NOT NULL,

    -- All four types are legal from day one so adding one later is content plus
    -- a client renderer, never a migration. Only the first two are seeded.
    challenge_type TEXT NOT NULL,

    code TEXT NOT NULL,
    code_language TEXT NOT NULL DEFAULT 'javascript',

    -- Ordered, always read whole, never queried by element -- the same shape
    -- argument memory_rounds.sequence makes, and the reason this is an array
    -- rather than a fourth table. Layered: each one narrows without answering.
    hints TEXT[] NOT NULL,

    -- Sessions deal incidents in ascending difficulty, so a run ramps. Stored
    -- rather than inferred from code length: a four-line closure bug is harder
    -- than a twelve-line off-by-one.
    difficulty SMALLINT NOT NULL DEFAULT 1,

    -- Same provenance columns as questions and flush_snippets, so an importer
    -- can source incidents externally later without another migration.
    source TEXT NOT NULL DEFAULT 'internal',
    external_ref TEXT,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT bug_hunt_incidents_slug_unique
        UNIQUE (slug),

    CONSTRAINT bug_hunt_incidents_slug_normalized
        CHECK (slug = LOWER(TRIM(slug)) AND TRIM(slug) <> ''),

    CONSTRAINT bug_hunt_incidents_difficulty_range
        CHECK (difficulty BETWEEN 1 AND 5),

    CONSTRAINT bug_hunt_incidents_challenge_type_valid
        CHECK (challenge_type IN ('find_line', 'choose_patch', 'diagnose', 'trace')),

    CONSTRAINT bug_hunt_incidents_theme_valid
        CHECK (theme IN (
            'auth', 'payments', 'profiles', 'inventory', 'messaging', 'analytics', 'api'
        )),

    CONSTRAINT bug_hunt_incidents_bug_category_valid
        CHECK (bug_category IN (
            'array-access', 'async', 'scope', 'mutation', 'comparison',
            'return-value', 'off-by-one', 'type-coercion'
        )),

    CONSTRAINT bug_hunt_incidents_title_not_blank
        CHECK (TRIM(title) <> '' AND LENGTH(title) <= 120),

    CONSTRAINT bug_hunt_incidents_bug_report_not_blank
        CHECK (TRIM(bug_report) <> '' AND LENGTH(bug_report) <= 500),

    CONSTRAINT bug_hunt_incidents_code_not_blank
        CHECK (TRIM(code) <> '' AND LENGTH(code) <= 4000),

    -- One to three, revealed in order. Zero would make the hint button a lie;
    -- more than three stops being a ladder and starts being the answer.
    CONSTRAINT bug_hunt_incidents_hints_length
        CHECK (array_length(hints, 1) BETWEEN 1 AND 3),

    CONSTRAINT bug_hunt_incidents_source_not_blank
        CHECK (TRIM(source) <> '')
);

CREATE TRIGGER bug_hunt_incidents_updated_at
BEFORE UPDATE ON bug_hunt_incidents
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION update_updated_at();

-- Supports dealing a session's incidents in ascending difficulty.
CREATE INDEX bug_hunt_incidents_difficulty_idx
    ON bug_hunt_incidents (difficulty)
    WHERE is_active;

CREATE UNIQUE INDEX bug_hunt_incidents_external_ref_idx
    ON bug_hunt_incidents (source, external_ref)
    WHERE external_ref IS NOT NULL;

CREATE TABLE bug_hunt_options (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    incident_id BIGINT NOT NULL
        REFERENCES bug_hunt_incidents(id) ON DELETE RESTRICT,

    option_text TEXT NOT NULL,

    -- Set for find_line (the option IS a line of the snippet), NULL for
    -- choose_patch (the option is a replacement expression). One table serves
    -- both challenge types because the only real difference is whether the
    -- choice points at a line or proposes one.
    line_number INTEGER,

    is_correct BOOLEAN NOT NULL DEFAULT FALSE,

    -- On EVERY option, not just the right one. A wrong pick that explains why it
    -- was wrong is the difference between a debugging game and a guessing game,
    -- and it is what the second attempt is supposed to be informed by.
    explanation TEXT NOT NULL,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT bug_hunt_options_text_not_blank
        CHECK (TRIM(option_text) <> '' AND LENGTH(option_text) <= 400),

    CONSTRAINT bug_hunt_options_explanation_not_blank
        CHECK (TRIM(explanation) <> '' AND LENGTH(explanation) <= 600),

    CONSTRAINT bug_hunt_options_line_number_positive
        CHECK (line_number IS NULL OR line_number > 0),

    -- Composite-FK target, so a submitted option can be PROVEN to belong to the
    -- incident the round is actually playing. Same pattern as question_options
    -- and flush_outputs; without it a player could post an option id from a
    -- different, easier incident.
    CONSTRAINT bug_hunt_options_unique_id_incident
        UNIQUE (incident_id, id)
);

CREATE TRIGGER bug_hunt_options_updated_at
BEFORE UPDATE ON bug_hunt_options
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION update_updated_at();

-- Exactly one active correct option per incident. Two would make the round
-- unscoreable; zero would make it unwinnable. Partial so a badly-worded option
-- can be retired and replaced without its slot staying reserved.
CREATE UNIQUE INDEX bug_hunt_options_one_correct_idx
    ON bug_hunt_options (incident_id)
    WHERE is_active AND is_correct;

-- Two identical choices would make the incident ill-defined: the player could
-- not tell them apart and either pick would be equally defensible.
CREATE UNIQUE INDEX bug_hunt_options_active_text_idx
    ON bug_hunt_options (incident_id, option_text)
    WHERE is_active;

CREATE TABLE bug_hunt_rounds (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    game_session_id BIGINT NOT NULL
        REFERENCES game_sessions(id) ON DELETE CASCADE,

    incident_id BIGINT NOT NULL
        REFERENCES bug_hunt_incidents(id) ON DELETE RESTRICT,

    display_order INTEGER NOT NULL,

    -- The round's own clock, computed from the incident's code when the session
    -- is planned and stored here so a served round carries its own timing --
    -- exactly memory_rounds.display_ms. One definition of how long incident
    -- three lasts.
    time_limit_ms INTEGER NOT NULL,

    status TEXT NOT NULL DEFAULT 'pending',

    -- Stamped when GET /sessions/current hands the incident over, not when the
    -- session is created. The deadline the player is given has to be the
    -- deadline they actually get.
    served_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,

    -- Every input to the score, and nothing else. attempts, hints_used and
    -- ended_at - served_at are the facts; points are derived from them. There is
    -- deliberately no score column here: a stored score can disagree with the
    -- round it came from, and then neither is trustworthy.
    attempts INTEGER NOT NULL DEFAULT 0,
    hints_used INTEGER NOT NULL DEFAULT 0,

    -- Denormalised so the composite FK below can prove that the chosen option
    -- and this round refer to the same incident.
    selected_option_id BIGINT,

    CONSTRAINT bug_hunt_rounds_display_order_positive
        CHECK (display_order > 0),

    CONSTRAINT bug_hunt_rounds_time_limit_positive
        CHECK (time_limit_ms > 0),

    -- Two attempts, enforced here as well as in the route. Unlimited guesses at
    -- four options is elimination, not debugging.
    CONSTRAINT bug_hunt_rounds_attempts_range
        CHECK (attempts BETWEEN 0 AND 2),

    -- Matches the 1..3 hints an incident may carry.
    CONSTRAINT bug_hunt_rounds_hints_range
        CHECK (hints_used BETWEEN 0 AND 3),

    CONSTRAINT bug_hunt_rounds_status_valid
        CHECK (status IN ('pending', 'resolved', 'failed')),

    CONSTRAINT bug_hunt_rounds_unique_display_order
        UNIQUE (game_session_id, display_order),

    -- The same incident may not appear twice in one run.
    CONSTRAINT bug_hunt_rounds_unique_incident
        UNIQUE (game_session_id, incident_id),

    -- Composite-FK target for the selected option.
    CONSTRAINT bug_hunt_rounds_unique_id_incident
        UNIQUE (id, incident_id),

    -- Deliberately MATCH SIMPLE (the default): when selected_option_id is NULL
    -- the check is skipped entirely, so pending and timed-out rounds are legal.
    -- MATCH FULL would reject them, because incident_id is NOT NULL and MATCH
    -- FULL requires all referencing columns to be NULL or none.
    CONSTRAINT bug_hunt_rounds_selected_option_fk
        FOREIGN KEY (incident_id, selected_option_id)
        REFERENCES bug_hunt_options (incident_id, id)
        ON DELETE RESTRICT,

    -- State matrix, one constraint per status so a violation names the state it
    -- broke. Same pattern as the other four games.
    --
    -- 'pending' covers planned (served_at NULL), in play (served_at set), and
    -- in play after one wrong attempt -- which is why attempts and hints_used
    -- are unconstrained here but ended_at is not.
    CONSTRAINT bug_hunt_rounds_pending_state
        CHECK (
            status <> 'pending'
            OR (ended_at IS NULL AND selected_option_id IS NULL)
        ),

    -- Resolved means a correct option was submitted, so there must be one, and
    -- it took at least one attempt.
    CONSTRAINT bug_hunt_rounds_resolved_state
        CHECK (
            status <> 'resolved'
            OR (
                served_at IS NOT NULL
                AND ended_at IS NOT NULL
                AND selected_option_id IS NOT NULL
                AND attempts >= 1
            )
        ),

    -- Failed covers both endings: two wrong attempts (selected_option_id set to
    -- the last wrong pick) and the deadline passing with none (still NULL). Only
    -- ended_at is common to both, so only ended_at is required.
    CONSTRAINT bug_hunt_rounds_failed_state
        CHECK (
            status <> 'failed'
            OR (served_at IS NOT NULL AND ended_at IS NOT NULL)
        )
);

-- Serves the RESTRICT check against incidents plus the composite FK above.
-- game_session_id needs no index of its own: it leads both unique constraints.
CREATE INDEX bug_hunt_rounds_incident_idx
    ON bug_hunt_rounds (incident_id, id);

-- Serves the RESTRICT check from the selected-option foreign key.
CREATE INDEX bug_hunt_rounds_selected_option_idx
    ON bug_hunt_rounds (selected_option_id)
    WHERE selected_option_id IS NOT NULL;

COMMIT;
