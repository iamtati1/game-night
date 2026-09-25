-- Bug Hunt's first beginner slice: one variable that never changed.
--
-- WHAT THIS IS FOR. Bug Hunt's job is to teach debugging, and its current bank
-- opens on production incident reports -- a theme, a severity, a title, a bug
-- report and an error log, all of which a learner has to read before they reach
-- the code. This incident is written the other way round: the code IS the
-- problem statement, and every other field is either empty or one short line.
--
--     let score = 10;
--     score + 5;
--     console.log(score);
--
-- Expected 15, prints 10. Three lines, one idea, and the mismatch is visible
-- without knowing any debugging vocabulary.
--
-- WHY `assignment` AND `diagnose`. The concept was added in the foundational
-- curriculum pass and says "assignment evaluates everything on the right first,
-- then stores that single value under the name on the left". Line 2 does the
-- first half and not the second, which is exactly what this incident asks the
-- learner to notice. `assignment` declares diagnose, so the coordinate is real
-- rather than invented -- the composite foreign key would refuse it otherwise.
--
-- THE DISTRACTORS ARE MISCONCEPTIONS, following the standard in seed 017. Each
-- wrong line is one a beginner genuinely suspects, and each explanation says
-- why that line is fine rather than only that it is wrong.
--
-- The incident still carries `bug_category` because the column is NOT NULL with
-- a CHECK. See the note at the call site.
--
-- NO HINTS. An empty hint array is deliberate: a three-line snippet with one
-- idea in it has nothing left to hint at, and the Trace button would spend
-- integrity to tell the learner something they can already see.

BEGIN;

CREATE OR REPLACE FUNCTION seed_bug_hunt_incident(
    p_slug TEXT, p_title TEXT, p_bug_report TEXT, p_error_log TEXT,
    p_theme TEXT, p_bug_category TEXT, p_challenge_type TEXT,
    p_code TEXT, p_hints TEXT[], p_difficulty INTEGER, p_options JSONB
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_id BIGINT;
    v_option JSONB;
BEGIN
    IF EXISTS (SELECT 1 FROM bug_hunt_incidents WHERE slug = p_slug) THEN
        RETURN;
    END IF;

    INSERT INTO bug_hunt_incidents
        (slug, title, bug_report, error_log, theme, bug_category,
         challenge_type, code, hints, difficulty)
    VALUES (p_slug, p_title, p_bug_report, p_error_log, p_theme, p_bug_category,
            p_challenge_type, p_code, p_hints, p_difficulty)
    RETURNING id INTO v_id;

    FOR v_option IN SELECT * FROM jsonb_array_elements(p_options) LOOP
        INSERT INTO bug_hunt_options
            (incident_id, option_text, line_number, is_correct, explanation)
        VALUES (
            v_id,
            v_option ->> 'text',
            (v_option ->> 'line')::INTEGER,
            (v_option ->> 'correct')::BOOLEAN,
            v_option ->> 'explanation'
        );
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION curriculum_difficulty(p_concept TEXT, p_demand TEXT)
RETURNS SMALLINT LANGUAGE sql AS $$
    SELECT (CASE WHEN d.display_order >= (SELECT display_order FROM demands WHERE slug = 'produce') THEN
        CASE t.tier WHEN 'beginner' THEN 2 WHEN 'intermediate' THEN 3 ELSE 4 END
      ELSE CASE t.tier WHEN 'beginner' THEN 1 WHEN 'intermediate' THEN 2 ELSE 3 END END)::SMALLINT
    FROM concepts c JOIN topics t ON t.id = c.topic_id CROSS JOIN demands d
    WHERE c.slug = p_concept AND d.slug = p_demand;
$$;

SELECT seed_bug_hunt_incident(
    'score-never-updated',
    'Score stays at 10',
    'The score should be 15 after the bonus, but it prints 10.',
    NULL,
    -- theme is also from the pre-curriculum taxonomy, and its enum is a set of
    -- production surfaces. `analytics` is the nearest thing to a scoreboard.
    -- The beginner presentation does not render it.
    'analytics',
    -- bug_category is the pre-curriculum taxonomy and its enum has no
    -- `assignment`. `mutation` is the nearest legal value -- the value never
    -- changes -- and the authoritative answer now lives on the challenge this
    -- incident points at, which says assignment / diagnose. Migration 020 called
    -- this column out as the fragmentation the curriculum exists to replace; it
    -- is satisfied here, not relied on.
    'mutation',
    'find_line',
    E'let score = 10;\nscore + 5;\nconsole.log(score);',
    ARRAY[]::TEXT[],
    1,
    $j$[
      {"text": "let score = 10;", "line": 1, "correct": false,
       "explanation": "This line is fine. It creates score and gives it its starting value of 10, which is exactly what we wanted."},
      {"text": "score + 5;", "line": 2, "correct": true,
       "explanation": "score + 5 works out 15 — and then throws it away. Adding does not change score; the result has to be stored back into it with score = score + 5."},
      {"text": "console.log(score);", "line": 3, "correct": false,
       "explanation": "This line is fine. It faithfully prints whatever score holds — and score really does still hold 10, so the printing is not the problem."}
    ]$j$::JSONB
);

-- The introduction, so a learner can be shown `assignment` before being asked to
-- debug it. Without one the practise challenge below is role-withheld and the
-- incident is unreachable -- see curriculum/roles.ts.
INSERT INTO challenges (concept_id, demand_id, role, difficulty)
SELECT c.id, d.id, 'introduce', curriculum_difficulty('assignment', 'predict')
FROM concepts c, demands d
WHERE c.slug = 'assignment' AND d.slug = 'predict'
  AND NOT EXISTS (
      SELECT 1 FROM challenges ch
      WHERE ch.concept_id = c.id AND ch.role = 'introduce' AND ch.is_active
  );

-- The practice, and the incident that realises it.
CREATE OR REPLACE FUNCTION attach_incident(p_slug TEXT, p_concept TEXT, p_demand TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_incident  BIGINT;
    v_existing  BIGINT;
    v_challenge BIGINT;
BEGIN
    SELECT id, challenge_id INTO v_incident, v_existing
    FROM bug_hunt_incidents WHERE slug = p_slug;

    IF v_incident IS NULL THEN
        RAISE EXCEPTION 'no incident %', p_slug;
    END IF;

    IF v_existing IS NOT NULL THEN
        RETURN;
    END IF;

    INSERT INTO challenges (concept_id, demand_id, role, difficulty)
    SELECT c.id, d.id, 'practise', curriculum_difficulty(p_concept, p_demand)
    FROM concepts c, demands d
    WHERE c.slug = p_concept AND d.slug = p_demand
    RETURNING id INTO v_challenge;

    UPDATE bug_hunt_incidents SET challenge_id = v_challenge WHERE id = v_incident;
END;
$$;

SELECT attach_incident('score-never-updated', 'assignment', 'diagnose');

DROP FUNCTION attach_incident(TEXT, TEXT, TEXT);
DROP FUNCTION curriculum_difficulty(TEXT, TEXT);
DROP FUNCTION seed_bug_hunt_incident(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], INTEGER, JSONB);

COMMIT;
