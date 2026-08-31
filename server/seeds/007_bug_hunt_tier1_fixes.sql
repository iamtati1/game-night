-- Bug Hunt tier 1: two correctness fixes.
--
-- Corrective UPDATEs rather than edits to 006, because seed_bug_hunt_incident
-- skips a slug that already exists -- editing 006 would fix new databases and
-- leave every existing one wrong. Running 006 then 007 converges on the same
-- content either way.
--
-- Options are deactivated rather than deleted. bug_hunt_rounds.selected_option_id
-- points at them, so a delete would either fail on the foreign key or take real
-- play history with it. is_active is what gameplay filters on, so retiring is
-- enough to take an option out of play while leaving past runs readable.

BEGIN;

/**
 * Replaces an incident's active option set, and optionally its code.
 *
 * Idempotent by comparison rather than by a ledger: if the active options already
 * are the requested set, it returns without touching anything, so re-running this
 * file does not stack up generations of retired options.
 */
CREATE OR REPLACE FUNCTION fix_bug_hunt_incident(
    p_slug TEXT,
    p_code TEXT,
    p_options JSONB
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_id BIGINT;
    v_current TEXT[];
    v_wanted TEXT[];
    v_option JSONB;
BEGIN
    SELECT id INTO v_id FROM bug_hunt_incidents WHERE slug = p_slug;

    IF v_id IS NULL THEN
        RAISE EXCEPTION 'No Bug Hunt incident with slug %', p_slug;
    END IF;

    SELECT ARRAY(
        SELECT option_text FROM bug_hunt_options
        WHERE incident_id = v_id AND is_active ORDER BY option_text
    ) INTO v_current;

    SELECT ARRAY(
        SELECT jsonb_array_elements(p_options) ->> 'text' ORDER BY 1
    ) INTO v_wanted;

    IF v_current = v_wanted THEN
        RETURN;
    END IF;

    IF p_code IS NOT NULL THEN
        UPDATE bug_hunt_incidents SET code = p_code WHERE id = v_id;
    END IF;

    UPDATE bug_hunt_options SET is_active = FALSE
    WHERE incident_id = v_id AND is_active;

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

-- ---------------------------------------------------------------------------
-- 1. can-vote-boundary had THREE correct answers.
--
--    `age >= 18` and `age > 18 || age === 18` are the same predicate written two
--    ways, and `age > 17` is the same again for any integer age. Only one of the
--    four options was actually wrong, so a player who reasoned correctly could
--    still be marked wrong -- in the untimed tier that exists to build
--    confidence.
--
--    The replacements are all unambiguously wrong for the reported symptom
--    (18-year-olds refused), while staying the kind of thing someone might
--    genuinely reach for. Two of them are the same trap in different clothes: the
--    ternary and the && both look like a fix and leave 18 refused.
--
--    Every distractor is checked by executing it -- see content.test.ts. That
--    check earned its place immediately: the first replacement written here was
--    `age > 16`, which is too permissive but does admit 18, so it fixed the
--    reported symptom and would have reintroduced the exact defect being fixed.

SELECT fix_bug_hunt_incident(
    'can-vote-boundary',
    NULL,
    $j$[
      {"text": "return age >= 18;", "correct": true,
       "explanation": "The boundary belongs inside the check. `>=` admits exactly 18, which is what \"eighteen and over\" means."},
      {"text": "return age > 18 ? true : false;", "correct": false,
       "explanation": "This restyles the comparison without changing it. `age > 18` still refuses 18, so the bug survives the rewrite -- the ternary only wraps it."},
      {"text": "return age >= 19;", "correct": false,
       "explanation": "Moves the boundary the wrong way. 18 is still refused, and now the rule reads as nineteen-and-over."},
      {"text": "return age > 18 && age >= 18;", "correct": false,
       "explanation": "The right check was added but the old one was left beside it. With &&, the stricter half still decides, so 18 is refused exactly as before."}
    ]$j$::JSONB
);

-- ---------------------------------------------------------------------------
-- 2. The tier-1 positional tell.
--
--    greet-name-typo, multiply-wrong-operator and uppercase-not-called were all
--    the same three-line shape: a signature, one statement, a closing brace --
--    offered as exactly three options. The bug could only ever be the middle
--    line, so all three were answerable correctly without reading any code.
--    Tier 1 is untimed precisely so a player learns to read, and it was teaching
--    them to count instead.
--
--    Each now has a real second statement, so no option is a brace, every
--    distractor is a line that could plausibly hold the bug, and the answer is
--    no longer always in the middle. The bug itself is unchanged and still the
--    obvious one once the code is actually read, so difficulty 1 still holds.

SELECT fix_bug_hunt_incident(
    'greet-name-typo',
    E'function greet(name) {\n  const greeting = "Hello ";\n  return greeting + nmae;\n}',
    $j$[
      {"text": "return greeting + nmae;", "line": 3, "correct": true,
       "explanation": "nmae is a typo for name. Nothing by that name was ever declared, so the reference throws."},
      {"text": "const greeting = \"Hello \";", "line": 2, "correct": false,
       "explanation": "A perfectly good constant, spelled correctly and used correctly on the line below."},
      {"text": "function greet(name) {", "line": 1, "correct": false,
       "explanation": "The signature takes exactly the parameter the function needs. The mistake is in the line that spells it differently."}
    ]$j$::JSONB
);

SELECT fix_bug_hunt_incident(
    'multiply-wrong-operator',
    E'function multiply(a, b) {\n  const result = a + b;\n  return result;\n}',
    $j$[
      {"text": "const result = a + b;", "line": 2, "correct": true,
       "explanation": "The function is called multiply and it is adding. 3 and 4 gave 7, which is the sum -- the operator is the bug."},
      {"text": "return result;", "line": 3, "correct": false,
       "explanation": "Returns whatever was computed above. It is faithful to the line before it, which is where the wrong number comes from."},
      {"text": "function multiply(a, b) {", "line": 1, "correct": false,
       "explanation": "Two parameters is right for multiplication. The name even tells you what the body was supposed to do."}
    ]$j$::JSONB
);

SELECT fix_bug_hunt_incident(
    'uppercase-not-called',
    E'function normalise(code) {\n  const trimmed = code.trim();\n  return trimmed.toUpperCase;\n}',
    $j$[
      {"text": "return trimmed.toUpperCase;", "line": 3, "correct": true,
       "explanation": "Missing parentheses. Without them this returns the function itself rather than calling it, which is why the product code renders as source."},
      {"text": "const trimmed = code.trim();", "line": 2, "correct": false,
       "explanation": "trim() is called properly -- note the parentheses this line has and the one below does not."},
      {"text": "function normalise(code) {", "line": 1, "correct": false,
       "explanation": "The signature is fine. The value it produces is mishandled two lines down."}
    ]$j$::JSONB
);

DROP FUNCTION fix_bug_hunt_incident(TEXT, TEXT, JSONB);

COMMIT;
