-- Beginner practice for Variables, in both games that can carry it.
--
-- WHY THIS EXISTS. A learner who has just met variables was being handed, in
-- Bug Hunt, the EASIEST content the bank holds:
--
--     function greet(name) { ... return greeting + nmae; }      needs functions
--     function multiply(a, b) { const result = a + b; }         needs functions
--     function canVote(age) { return age > 18; }                functions + comparison
--     const cart = null; const count = cart.length;             null + properties
--     return trimmed.toUpperCase;                               string methods
--
-- All of them difficulty 1. Exactly one of the eight easiest incidents used
-- only ideas a Variables learner has met. The MECHANIC was never the problem --
-- finding a misspelt name is real debugging and Bug Hunt does it well -- the
-- content was written for people who already know JavaScript.
--
-- So neither game is being bent into a shape it was not designed for. Code
-- Blitz predicts; Bug Hunt finds the broken line. They are simply given work a
-- beginner can actually do.
--
-- EVERY ITEM IS TAGGED, to a concept the learner reaches in Variables and at a
-- rung that concept declares. Nothing here is "easy" by decree: it is
-- appropriate because the curriculum says the learner has arrived at it.

BEGIN;

CREATE OR REPLACE FUNCTION curriculum_difficulty(p_concept TEXT, p_demand TEXT)
RETURNS SMALLINT
LANGUAGE sql
AS $$
    SELECT (CASE WHEN d.display_order >= (SELECT display_order FROM demands WHERE slug = 'produce') THEN
        CASE t.tier WHEN 'beginner' THEN 2 WHEN 'intermediate' THEN 3 ELSE 4 END
      ELSE CASE t.tier WHEN 'beginner' THEN 1 WHEN 'intermediate' THEN 2 ELSE 3 END END)::SMALLINT
    FROM concepts c
    JOIN topics t ON t.id = c.topic_id
    CROSS JOIN demands d
    WHERE c.slug = p_concept AND d.slug = p_demand;
$$;

-- ════════════════════════════════════════════════ CODE BLITZ · predict ══
--
-- One idea per snippet, three lines at most, and the answer is always something
-- the learner can work out by reading top to bottom. Distractors are the
-- misconceptions a beginner actually holds: that the name prints instead of the
-- value, that reassignment adds rather than replaces, that quotes survive.

CREATE OR REPLACE FUNCTION seed_practice(
    p_ref TEXT, p_prompt TEXT, p_concept TEXT, p_demand TEXT, p_correct TEXT, p_wrong TEXT[]
)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_question BIGINT; v_challenge BIGINT; v_wrong TEXT; v_order INT := 1;
BEGIN
    -- IDENTITY FIRST, WORDING SECOND. p_ref names this question: authored
    -- once, never derived from its content, never edited afterwards, and
    -- namespaced by `source` -- questions_external_ref_idx is UNIQUE on
    -- (source, external_ref) and is what actually enforces one row per name.
    -- This replaces `WHERE prompt = p_prompt`, which five later seeds broke by
    -- rewriting stored prompts, so the guard stopped matching and every seed
    -- run inserted another copy.
    SELECT id INTO v_question
    FROM questions
    WHERE source = 'jolt-variables-practice' AND external_ref = p_ref;

    IF v_question IS NOT NULL THEN RETURN; END IF;

    -- ADOPTION for rows seeded before names existed: give the existing row the
    -- name rather than inserting beside it. Only rows with no name yet, so this
    -- can never take a question that already belongs to another.
    SELECT id INTO v_question
    FROM questions
    WHERE prompt = p_prompt AND source = 'jolt-variables-practice' AND external_ref IS NULL
    ORDER BY id  -- the oldest copy: the one learners have answered
    LIMIT 1;

    IF v_question IS NOT NULL THEN
        UPDATE questions SET external_ref = p_ref WHERE id = v_question;
        RETURN;
    END IF;

    INSERT INTO challenges (concept_id, demand_id, role, difficulty)
    SELECT c.id, d.id, 'practise', curriculum_difficulty(p_concept, p_demand)
    FROM concepts c, demands d
    WHERE c.slug = p_concept AND d.slug = p_demand
    RETURNING id INTO v_challenge;

    INSERT INTO questions (prompt, difficulty, topic, challenge_type, challenge_id, source, external_ref)
    VALUES (p_prompt, curriculum_difficulty(p_concept, p_demand), 'variables',
            'predict-output', v_challenge, 'jolt-variables-practice', p_ref)
    RETURNING id INTO v_question;

    INSERT INTO question_options (question_id, option_text, display_order, is_correct)
    VALUES (v_question, p_correct, v_order, TRUE);

    FOREACH v_wrong IN ARRAY p_wrong LOOP
        v_order := v_order + 1;
        INSERT INTO question_options (question_id, option_text, display_order, is_correct)
        VALUES (v_question, v_wrong, v_order, FALSE);
    END LOOP;
END;
$$;

-- Reading a name gives you its value.
SELECT seed_practice(
    'vars-001',
    E'What does this log?\n\nlet score = 10;\nconsole.log(score);',
    'reading-variables', 'predict', '10', ARRAY['score', '"10"', 'nothing']);

SELECT seed_practice(
    'vars-002',
    E'What does this log?\n\nlet name = "Tati";\nconsole.log(name);',
    'reading-variables', 'predict', 'Tati', ARRAY['name', '"Tati"', 'nothing']);

SELECT seed_practice(
    'vars-003',
    E'What does this log?\n\nlet a = 5;\nlet b = a;\nconsole.log(b);',
    'reading-variables', 'predict', '5', ARRAY['a', 'b', 'nothing']);

-- Reassignment replaces; it does not accumulate.
SELECT seed_practice(
    'vars-004',
    E'What does this log?\n\nlet score = 10;\nscore = 20;\nconsole.log(score);',
    'reassignment', 'predict', '20', ARRAY['10', '30', '"20"']);

SELECT seed_practice(
    'vars-005',
    E'What does this log?\n\nlet fuel = 100;\nfuel = 80;\nconsole.log(fuel);',
    'reassignment', 'predict', '80', ARRAY['100', '180', '20']);

SELECT seed_practice(
    'vars-006',
    E'What does this log?\n\nlet city = "Lagos";\ncity = "Accra";\nconsole.log(city);',
    'reassignment', 'predict', 'Accra', ARRAY['Lagos', 'LagosAccra', 'city']);

-- The right-hand side is worked out first, then stored.
SELECT seed_practice(
    'vars-007',
    E'What does this log?\n\nlet total = 5;\ntotal = total + 3;\nconsole.log(total);',
    'assignment', 'predict', '8', ARRAY['5', '3', '53']);

SELECT seed_practice(
    'vars-008',
    E'What does this log?\n\nlet count = 2;\ncount = count * 3;\nconsole.log(count);',
    'assignment', 'predict', '6', ARRAY['2', '3', '23']);

-- Declaring and using in the same breath.
-- Content as 029 rewrote it, so a re-run and a database seeded earlier agree.
SELECT seed_practice(
    'vars-009',
    E'What does this log?\n\nlet crew = 3;\nconsole.log(crew);',
    'initialization', 'predict', '3', ARRAY['crew', 'undefined', 'nothing']);

-- ═══════════════════════════════════════════════ BUG HUNT · diagnose ═══
--
-- The smallest real debugging there is: the program is three lines, it uses
-- only names and values, and the mistake is one a beginner makes on their first
-- day. No functions, no arrays, no methods, no null, no comparison.

CREATE OR REPLACE FUNCTION seed_bug_hunt_incident(
    p_slug TEXT, p_title TEXT, p_bug_report TEXT, p_error_log TEXT,
    p_theme TEXT, p_bug_category TEXT, p_challenge_type TEXT,
    p_code TEXT, p_hints TEXT[], p_difficulty INTEGER, p_options JSONB
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_id BIGINT; v_option JSONB;
BEGIN
    IF EXISTS (SELECT 1 FROM bug_hunt_incidents WHERE slug = p_slug) THEN RETURN; END IF;

    INSERT INTO bug_hunt_incidents
        (slug, title, bug_report, error_log, theme, bug_category,
         challenge_type, code, hints, difficulty)
    VALUES (p_slug, p_title, p_bug_report, p_error_log, p_theme, p_bug_category,
            p_challenge_type, p_code, p_hints, p_difficulty)
    RETURNING id INTO v_id;

    FOR v_option IN SELECT * FROM jsonb_array_elements(p_options) LOOP
        INSERT INTO bug_hunt_options (incident_id, option_text, line_number, is_correct, explanation)
        VALUES (v_id, v_option ->> 'text', (v_option ->> 'line')::INTEGER,
                (v_option ->> 'correct')::BOOLEAN, v_option ->> 'explanation');
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION attach_incident(p_slug TEXT, p_concept TEXT, p_demand TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_incident BIGINT; v_existing BIGINT; v_challenge BIGINT;
BEGIN
    SELECT id, challenge_id INTO v_incident, v_existing
    FROM bug_hunt_incidents WHERE slug = p_slug;

    IF v_incident IS NULL THEN RAISE EXCEPTION 'no incident %', p_slug; END IF;
    IF v_existing IS NOT NULL THEN RETURN; END IF;

    INSERT INTO challenges (concept_id, demand_id, role, difficulty)
    SELECT c.id, d.id, 'practise', curriculum_difficulty(p_concept, p_demand)
    FROM concepts c, demands d
    WHERE c.slug = p_concept AND d.slug = p_demand
    RETURNING id INTO v_challenge;

    UPDATE bug_hunt_incidents SET challenge_id = v_challenge WHERE id = v_incident;
END;
$$;

-- A name that does not exist. The first bug anyone ever writes.
SELECT seed_bug_hunt_incident(
    'misspelt-name-read', 'Scoreboard shows nothing',
    'The scoreboard should show 10, but the page is blank and the console has an error.',
    E'ReferenceError: scores is not defined', 'analytics', 'scope', 'find_line',
    E'let score = 10;\nconsole.log(scores);',
    ARRAY['Read the two names carefully. Are they the same word?',
          'One line creates a name. The other asks for a name that was never created.'],
    1,
    '[{"text": "let score = 10;", "line": 1, "correct": false,
       "explanation": "This line is fine -- it creates the name score and gives it the value 10."},
      {"text": "console.log(scores);", "line": 2, "correct": true,
       "explanation": "The name created above is score, not scores. JavaScript has never heard of scores, so it stops."}]'::JSONB);

SELECT attach_incident('misspelt-name-read', 'reading-variables', 'diagnose');

-- The name printed instead of the value.
SELECT seed_bug_hunt_incident(
    'quoted-name-printed', 'Fuel gauge reads the word fuel',
    'The gauge should show 100. It shows the word fuel instead.',
    NULL, 'analytics', 'scope', 'find_line',
    E'let fuel = 100;\nconsole.log("fuel");',
    ARRAY['What do the quotation marks do to the thing inside them?',
          'With quotes it is a piece of text. Without them it is a name.'],
    1,
    '[{"text": "let fuel = 100;", "line": 1, "correct": false,
       "explanation": "This is correct -- fuel is the name and 100 is the value."},
      {"text": "console.log(\"fuel\");", "line": 2, "correct": true,
       "explanation": "The quotes make this the text fuel rather than the name fuel. Remove them and it prints 100."}]'::JSONB);

SELECT attach_incident('quoted-name-printed', 'reading-variables', 'diagnose');

-- const refuses to move. Defined by what it will not do.
SELECT seed_bug_hunt_incident(
    'const-will-not-move', 'Checkout total will not update',
    'The total should change to 5 but the page crashes before it gets there.',
    E'TypeError: Assignment to constant variable.', 'payments', 'mutation', 'find_line',
    E'const total = 4;\ntotal = 5;\nconsole.log(total);',
    ARRAY['One of these two keywords promises the name will never point anywhere else.',
          'const means the name is fixed. Changing it later is the error.'],
    1,
    '[{"text": "const total = 4;", "line": 1, "correct": true,
       "explanation": "const promises this name will never be pointed at anything else, so line 2 is refused. Use let when the value needs to change."},
      {"text": "total = 5;", "line": 2, "correct": false,
       "explanation": "Reassigning is a perfectly normal thing to do -- it is the const on line 1 that forbids it."}]'::JSONB);

SELECT attach_incident('const-will-not-move', 'let-vs-const', 'diagnose');

-- Used before it exists.
SELECT seed_bug_hunt_incident(
    'read-before-declared', 'Crew count missing on the manifest',
    'The manifest should list 3 crew. It errors instead.',
    E'ReferenceError: Cannot access crew before initialization', 'profiles', 'scope', 'find_line',
    E'console.log(crew);\nlet crew = 3;',
    ARRAY['JavaScript reads a program from top to bottom.',
          'By the time line 1 runs, has the name been created yet?'],
    1,
    '[{"text": "console.log(crew);", "line": 1, "correct": true,
       "explanation": "This asks for crew before line 2 has created it. Move the declaration above this line."},
      {"text": "let crew = 3;", "line": 2, "correct": false,
       "explanation": "This line is correct in itself -- it is simply too late to help line 1."}]'::JSONB);

SELECT attach_incident('read-before-declared', 'reading-variables', 'diagnose');

-- The wrong name changed.
SELECT seed_bug_hunt_incident(
    'wrong-name-reassigned', 'Fuel never drops after the burn',
    'After the burn the fuel should read 80. It still reads 100.',
    NULL, 'inventory', 'mutation', 'find_line',
    E'let fuel = 100;\nlet spare = 100;\nspare = 80;\nconsole.log(fuel);',
    ARRAY['Which name is changed, and which name is printed?',
          'Line 3 changes one of the two names. Line 4 prints the other.'],
    1,
    '[{"text": "let spare = 100;", "line": 2, "correct": false,
       "explanation": "Creating spare is fine -- the trouble is which name line 3 changes."},
      {"text": "spare = 80;", "line": 3, "correct": true,
       "explanation": "This changes spare, but line 4 prints fuel. The burn should change fuel."},
      {"text": "console.log(fuel);", "line": 4, "correct": false,
       "explanation": "Printing fuel is exactly right -- fuel is what the gauge should show."}]'::JSONB);

SELECT attach_incident('wrong-name-reassigned', 'reassignment', 'diagnose');

-- The wrong side of the assignment.
--
-- Replaces a duplicate: seed 018 already ships `score + 5;` as
-- score-never-updated, and shipping the same program twice would mean a run
-- could deal the identical bug in two rounds.
SELECT seed_bug_hunt_incident(
    'assigned-wrong-way-round', 'Price collapses to the tax amount',
    'The price should end up at 12. It ends up at 2.',
    NULL, 'payments', 'mutation', 'find_line',
    E'let price = 10;\nlet tax = 2;\nprice = tax;\nconsole.log(price);',
    ARRAY['Line 3 points one name at another. Which way round does it go?',
          'The name on the left of the = is the one that changes.'],
    1,
    '[{"text": "let tax = 2;", "line": 2, "correct": false,
       "explanation": "The tax really is 2 -- that line is correct."},
      {"text": "price = tax;", "line": 3, "correct": true,
       "explanation": "This throws the price away and replaces it with the tax. To add them: price = price + tax."},
      {"text": "console.log(price);", "line": 4, "correct": false,
       "explanation": "Printing price is right -- it is what price now holds that is wrong."}]'::JSONB);

SELECT attach_incident('assigned-wrong-way-round', 'assignment', 'diagnose');

-- ── Values-level bugs ───────────────────────────────────────────────────
--
-- Reachable earlier than the Variables ones, so a learner who has practised
-- only console.log has something to debug. Every one is two lines and uses
-- nothing but printing and literals.

SELECT seed_bug_hunt_incident(
    'console-misspelt', 'Nothing appears in the console',
    'The greeting should print. The console is empty and shows an error instead.',
    E'ReferenceError: consol is not defined', 'api', 'scope', 'find_line',
    E'consol.log("Hello");',
    ARRAY['Read the word before the dot, letter by letter.',
          'The thing that prints is spelled console.'],
    1,
    '[{"text": "consol.log(\"Hello\");", "line": 1, "correct": true,
       "explanation": "It is console, with an e. JavaScript has never heard of consol, so it stops before printing anything."},
      {"text": "The quotation marks around Hello", "line": 1, "correct": false,
       "explanation": "The quotes are right: they mark Hello as text, and console.log prints text without them. The error names consol, the word before the dot."}]'::JSONB);

SELECT attach_incident('console-misspelt', 'console-output', 'diagnose');

SELECT seed_bug_hunt_incident(
    'quotes-around-sum', 'Invoice line shows a sum instead of a total',
    'The line should read 8. It reads 5 + 3 instead.',
    NULL, 'payments', 'type-coercion', 'find_line',
    E'console.log("5 + 3");',
    ARRAY['What do the quotation marks do to whatever is inside them?',
          'Inside quotes it is text to be printed, not a sum to be worked out.'],
    1,
    '[{"text": "console.log(\"5 + 3\");", "line": 1, "correct": true,
       "explanation": "The quotes make this the text 5 + 3. Remove them and JavaScript works the sum out first, printing 8."},
      {"text": "console.log is spelled wrong", "line": 1, "correct": false,
       "explanation": "console.log is correct here. Look at the quotation marks around the text instead."}]'::JSONB);

SELECT attach_incident('quotes-around-sum', 'expressions-produce-values', 'diagnose');

SELECT seed_bug_hunt_incident(
    'missing-closing-quote', 'Deploy fails before anything runs',
    'The whole file refuses to run and the editor highlights the last line.',
    E'SyntaxError: Invalid or unexpected token', 'api', 'scope', 'find_line',
    E'console.log("Ready);',
    ARRAY['Count the quotation marks on that line.',
          'A piece of text needs a quote at both ends.'],
    1,
    '[{"text": "console.log(\"Ready);", "line": 1, "correct": true,
       "explanation": "The text opens with a quote and never closes it, so JavaScript keeps reading and runs out of line."},
      {"text": "console.log is spelled wrong", "line": 1, "correct": false,
       "explanation": "console.log is correct here. Look at the quotation marks around the text instead."}]'::JSONB);

SELECT attach_incident('missing-closing-quote', 'console-output', 'diagnose');

SELECT seed_bug_hunt_incident(
    'name-instead-of-value', 'Manifest prints a word instead of a number',
    'The crew count should print 3. It prints the word crew.',
    NULL, 'profiles', 'scope', 'find_line',
    E'let crew = 3;\nconsole.log("crew");',
    ARRAY['Which of these two lines has quotation marks that should not be there?',
          'With quotes it is a piece of text. Without them it is the name.'],
    1,
    '[{"text": "let crew = 3;", "line": 1, "correct": false,
       "explanation": "This is correct -- crew is the name and 3 is the value it refers to."},
      {"text": "console.log(\"crew\");", "line": 2, "correct": true,
       "explanation": "The quotes turn this into the text crew. Drop them and it prints the value, 3."}]'::JSONB);

SELECT attach_incident('name-instead-of-value', 'console-output', 'diagnose');

SELECT seed_bug_hunt_incident(
    'joined-without-space', 'Status line runs two words together',
    'The status should read Fuel 100. It reads Fuel100.',
    NULL, 'inventory', 'type-coercion', 'find_line',
    E'let fuel = 100;\nconsole.log("Fuel" + fuel);',
    ARRAY['Joining two things puts them side by side with nothing between them.',
          'If a space is wanted, it has to be part of the text.'],
    1,
    '[{"text": "let fuel = 100;", "line": 1, "correct": false,
       "explanation": "This is fine -- fuel holds 100."},
      {"text": "console.log(\"Fuel\" + fuel);", "line": 2, "correct": true,
       "explanation": "Joining puts the two straight together. Put the space inside the text: \"Fuel \" + fuel."}]'::JSONB);

SELECT attach_incident('joined-without-space', 'expressions-produce-values', 'diagnose');

DROP FUNCTION attach_incident(TEXT, TEXT, TEXT);
DROP FUNCTION seed_bug_hunt_incident(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], INTEGER, JSONB);
DROP FUNCTION seed_practice(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]);
DROP FUNCTION curriculum_difficulty(TEXT, TEXT);

COMMIT;
