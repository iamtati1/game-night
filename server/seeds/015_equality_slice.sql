-- The first curriculum vertical slice: operators > equality.
--
-- Proves one concept can flow all the way down:
--
--     curriculum.ts          equality, demands predict/diagnose/repair/explain
--          -> concepts, demands, concept_demands     (seed 014, generated)
--          -> challenges                             (here)
--          -> questions.challenge_id                 (here, Code Blitz)
--          -> bug_hunt_incidents.challenge_id        (here, Bug Hunt)
--
-- Three of the four declared demands get content. `explain` deliberately gets
-- none: the demand asks the learner to GIVE the mechanism, and every game Jolt
-- has resolves to selection, ordering, assembly or a fast binary. Picking the
-- right explanation from four is `recognise` wearing a different hat, and
-- tagging it `explain` would stretch the definition rather than meet it. The
-- curriculum already tolerates an unfilled affordance -- `demands` is what a
-- concept CAN be practised at, not what content exists for.
--
-- WHY CHALLENGES ARE CREATED HERE AND NOT BY THE GENERATOR. A challenge is the
-- curriculum metadata of ONE playable exercise, 1:1. generate-curriculum.ts
-- projects client/src/games/curriculum.ts, which knows nothing about questions
-- or incidents -- it cannot know how many exist, so it cannot generate their
-- challenges. Challenges belong with the content they describe.
--
-- IDEMPOTENCY. Seeds carry no ledger and run every time. `challenges` has no
-- natural key -- nothing but `id` is unique, deliberately, because many
-- exercises legitimately share one (concept, demand, role). So the content row's
-- own challenge_id is the guard: if it is already set, the helpers below do
-- nothing. That makes the content the anchor, which is the right way round under
-- a model where the challenge describes the content rather than owning it.

-- ─────────────────────────────────────────────────────────────── helpers ──

-- The difficulty derivation, in SQL, mirroring difficultyFor() in curriculum.ts:
--
--     difficulty = f(topic.tier, demand.display_order)
--     produce (order 4) and deeper are the "deep" half of the ladder
--
-- Read from the projected curriculum rather than passed in, so a challenge
-- cannot be given a difficulty the curriculum would not derive. This is NOT
-- questions.difficulty (Code Blitz pacing) and NOT bug_hunt_incidents.difficulty
-- (that game's own ramp) -- three columns, three meanings, no shared semantics.
CREATE OR REPLACE FUNCTION curriculum_difficulty(p_concept TEXT, p_demand TEXT)
RETURNS SMALLINT LANGUAGE sql STABLE AS $$
    SELECT (CASE
        WHEN d.display_order >= (SELECT display_order FROM demands WHERE slug = 'produce') THEN
            CASE t.tier WHEN 'beginner' THEN 2 WHEN 'intermediate' THEN 3 ELSE 4 END
        ELSE
            CASE t.tier WHEN 'beginner' THEN 1 WHEN 'intermediate' THEN 2 ELSE 3 END
    END)::SMALLINT
    FROM concepts c
    JOIN topics t ON t.id = c.topic_id
    CROSS JOIN demands d
    WHERE c.slug = p_concept AND d.slug = p_demand;
$$;

-- Creates the challenge for one Code Blitz question and links it.
--
-- Returns silently when the question is already linked, which is what makes a
-- second seed run a no-op instead of a duplicate. Raises when the question does
-- not exist, because that means the seed order is wrong and a silent skip would
-- hide it until someone wondered where the challenge went.
CREATE OR REPLACE FUNCTION attach_question_challenge(
    p_prompt TEXT, p_concept TEXT, p_demand TEXT, p_role TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_question BIGINT;
    v_existing BIGINT;
    v_challenge BIGINT;
BEGIN
    SELECT id, challenge_id INTO v_question, v_existing
    FROM questions WHERE prompt = p_prompt;

    IF v_question IS NULL THEN
        RAISE EXCEPTION 'no question with that prompt -- seed it before attaching a challenge';
    END IF;

    IF v_existing IS NOT NULL THEN
        RETURN;
    END IF;

    INSERT INTO challenges (concept_id, demand_id, role, difficulty)
    SELECT c.id, d.id, p_role, curriculum_difficulty(p_concept, p_demand)
    FROM concepts c CROSS JOIN demands d
    WHERE c.slug = p_concept AND d.slug = p_demand
    RETURNING id INTO v_challenge;

    IF v_challenge IS NULL THEN
        RAISE EXCEPTION 'no concept_demands pair for % / %', p_concept, p_demand;
    END IF;

    UPDATE questions SET challenge_id = v_challenge WHERE id = v_question;
END;
$$;

-- The same, for a Bug Hunt incident, keyed on its slug.
CREATE OR REPLACE FUNCTION attach_incident_challenge(
    p_slug TEXT, p_concept TEXT, p_demand TEXT, p_role TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_incident BIGINT;
    v_existing BIGINT;
    v_challenge BIGINT;
BEGIN
    SELECT id, challenge_id INTO v_incident, v_existing
    FROM bug_hunt_incidents WHERE slug = p_slug;

    IF v_incident IS NULL THEN
        RAISE EXCEPTION 'no incident %, seed it before attaching a challenge', p_slug;
    END IF;

    IF v_existing IS NOT NULL THEN
        RETURN;
    END IF;

    INSERT INTO challenges (concept_id, demand_id, role, difficulty)
    SELECT c.id, d.id, p_role, curriculum_difficulty(p_concept, p_demand)
    FROM concepts c CROSS JOIN demands d
    WHERE c.slug = p_concept AND d.slug = p_demand
    RETURNING id INTO v_challenge;

    IF v_challenge IS NULL THEN
        RAISE EXCEPTION 'no concept_demands pair for % / %', p_concept, p_demand;
    END IF;

    UPDATE bug_hunt_incidents SET challenge_id = v_challenge WHERE id = v_incident;
END;
$$;

-- Bug Hunt content helper. Every Bug Hunt seed defines its own copy and drops it
-- at the end -- 005, 006 and 011 all do -- so this file follows that convention
-- rather than depending on a function a previous seed happens to have left
-- behind. Copied verbatim from seed 011.
--
-- Note it SKIPS when the slug exists rather than converging. That is existing
-- behaviour and deliberately not changed here; it is also why both incidents
-- below use slugs nothing else has taken.
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

-- Code Blitz content helper, identical in shape to seed_reasoning_question in
-- seed 012 -- converges on the prompt, leaves options alone because they are
-- keyed by position and rewriting them would orphan a session_questions row.
CREATE OR REPLACE FUNCTION seed_equality_question(
    p_prompt TEXT,
    p_difficulty INTEGER,
    p_topic TEXT,
    p_explanation TEXT,
    p_options JSONB
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_id BIGINT;
    v_option JSONB;
    v_pos INTEGER := 0;
BEGIN
    IF EXISTS (SELECT 1 FROM questions WHERE prompt = p_prompt) THEN
        UPDATE questions
        SET difficulty = p_difficulty, topic = p_topic, explanation = p_explanation
        WHERE prompt = p_prompt;
        RETURN;
    END IF;

    INSERT INTO questions (prompt, difficulty, topic, explanation)
    VALUES (p_prompt, p_difficulty, p_topic, p_explanation)
    RETURNING id INTO v_id;

    FOR v_option IN SELECT * FROM jsonb_array_elements(p_options) LOOP
        v_pos := v_pos + 1;
        INSERT INTO question_options (question_id, option_text, display_order, is_correct)
        VALUES (v_id, v_option->>'text', v_pos, (v_option->>'correct')::BOOLEAN);
    END LOOP;
END;
$$;

-- ══════════════════ equality · predict · Code Blitz ══════════════════
--
-- Both comparisons are on screen at once, so the learner cannot answer from a
-- half-memory of "=== is the strict one" -- they have to say what each ONE does
-- to the same pair of values. `==` converts and finds them equal; `===` checks
-- the types first and stops. Getting one right and the other wrong lands on a
-- distractor, which is the point.
--
-- questions.difficulty is 2 here: that is Code Blitz PACING, not curriculum
-- difficulty. The challenge's derived difficulty is 1 (beginner tier at the
-- predict rung), and the two numbers are unrelated by design.

SELECT seed_equality_question(
    E'What does this log?\n\nconst stored = "7";\nconst typed = 7;\n\nconsole.log(stored == typed);\nconsole.log(stored === typed);',
    2, 'operators',
    'Loose equality converts before it compares, so the string "7" becomes the number 7 and the values match. Strict equality checks the types first -- string is not number -- and answers false without ever looking at the values.',
    $j$[
      {"text": "true\nfalse", "correct": true},
      {"text": "false\ntrue", "correct": false},
      {"text": "true\ntrue", "correct": false},
      {"text": "false\nfalse", "correct": false}
    ]$j$::JSONB);

SELECT attach_question_challenge(
    E'What does this log?\n\nconst stored = "7";\nconst typed = 7;\n\nconsole.log(stored == typed);\nconsole.log(stored === typed);',
    'equality', 'predict', 'practise');

-- ══════════════════ equality · diagnose · Bug Hunt ══════════════════
--
-- A route reads an id from the URL, so it arrives as a string, and the lookup
-- compares it strictly against numeric ids. Nothing throws -- find() simply
-- returns undefined -- so the failure surfaces one line later as a 404 for a
-- user that plainly exists. The prompt never says "== vs ===": the learner has
-- to notice the types differ before the operator matters.

SELECT seed_bug_hunt_incident(
    'order-lookup-string-id',
    'Order lookup returns not-found for orders that exist',
    'Support can see order 4417 in the admin panel, but opening /orders/4417 shows "Order not found". It happens for every order, not just this one.',
    NULL,
    'payments', 'comparison', 'find_line',
$code$function findOrder(orders, requestedId) {
  const match = orders.find((order) => order.id === requestedId);

  if (!match) {
    return { status: 404, body: "Order not found" };
  }

  return { status: 200, body: match };
}

// called from the router:
findOrder(allOrders, request.params.orderId);$code$,
    ARRAY[
        'Nothing throws -- the lookup simply never matches. What could make a comparison always fail?',
        'Where does requestedId come from, and what type is a URL parameter?',
        'order.id is a number. Compare its type with the type of requestedId.'
    ],
    2,
$opts$[
  {"text": "const match = orders.find((order) => order.id === requestedId);", "line": 2, "correct": true,
   "explanation": "requestedId comes from request.params, so it is the string \"4417\" while order.id is the number 4417. Strict equality compares types before values, so it is false for every order and find() returns undefined. The comparison needs the two sides to be the same type before it can mean anything."},
  {"text": "if (!match) {", "line": 4, "correct": false,
   "explanation": "This guard is correct. find() genuinely returns undefined when nothing matches, and checking for that before using the result is exactly right -- it is reporting the problem, not causing it."},
  {"text": "return { status: 404, body: \"Order not found\" };", "line": 5, "correct": false,
   "explanation": "A 404 is the right response for an order that truly is not there. The bug is that the lookup above never finds one, not that this branch is wrong."},
  {"text": "return { status: 200, body: match };", "line": 8, "correct": false,
   "explanation": "This line never runs in the failing case, so it cannot be the cause. It is also correct as written."}
]$opts$
);

SELECT attach_incident_challenge('order-lookup-string-id', 'equality', 'diagnose', 'practise');

-- ══════════════════ equality · repair · Bug Hunt ══════════════════
--
-- The mirror case, and deliberately the harder direction: here loose equality is
-- the bug, not the fix. A deliberate "no selection" sentinel of null is compared
-- with ==, which treats null and undefined as equal -- so an absent field is
-- silently read as a deliberate clearing. The learner has to know that == has
-- one specific coercion rule for null/undefined, and that === is what
-- distinguishes them.
--
-- choose_patch rather than find_line, because the demand is `repair`: the
-- learner produces the correction, not its location.

SELECT seed_bug_hunt_incident(
    'profile-clear-field-null',
    'Editing one profile field wipes the others',
    'Users report that changing only their display name blanks out their bio and location. The API is supposed to clear a field only when the client sends null for it explicitly.',
    NULL,
    'profiles', 'comparison', 'choose_patch',
$code$function applyUpdate(profile, patch) {
  for (const field of ["displayName", "bio", "location"]) {
    if (patch[field] == null) {
      profile[field] = "";
    } else {
      profile[field] = patch[field];
    }
  }

  return profile;
}$code$,
    ARRAY[
        'A patch that omits a field should leave it alone. What does patch[field] give you for a field that is not in the object?',
        'Loose equality has one special rule involving null. Which other value does it treat as equal?',
        'The guard needs to catch a deliberate null but not an absent field.'
    ],
    3,
$opts$[
  {"text": "if (patch[field] === null) {", "line": 3, "correct": true,
   "explanation": "An omitted field reads as undefined, and == treats null and undefined as equal -- so every field the client did not send took the clearing branch. Strict equality distinguishes them, so only an explicit null clears the field and an absent one falls through to the else branch untouched."},
  {"text": "if (patch[field] == undefined) {", "line": 3, "correct": false,
   "explanation": "This is the same comparison written the other way round. == still treats null and undefined as equal, so an omitted field is caught exactly as before and the bug is unchanged."},
  {"text": "if (!patch[field]) {", "line": 3, "correct": false,
   "explanation": "This makes it worse. Every falsy value now clears the field, so a legitimately empty string -- or a bio of \"0\" -- would be treated as a request to clear rather than as a value."},
  {"text": "if (patch[field] == null && field in patch) {", "line": 3, "correct": false,
   "explanation": "This does fix the symptom, but by adding a second check to work around the first one being wrong. The comparison itself is still conflating null and undefined; === says what is meant in one condition."}
]$opts$
);

SELECT attach_incident_challenge('profile-clear-field-null', 'equality', 'repair', 'practise');

-- Drop the helpers, matching seed 013: they exist for this file's run only and
-- leaving them behind would let a later seed depend on them by accident.
DROP FUNCTION attach_question_challenge(TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION attach_incident_challenge(TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION seed_equality_question(TEXT, INTEGER, TEXT, TEXT, JSONB);
DROP FUNCTION seed_bug_hunt_incident(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], INTEGER, JSONB);
DROP FUNCTION curriculum_difficulty(TEXT, TEXT);
