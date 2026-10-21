-- The `recognise` rung for Variables, in curriculum order.
--
-- Five of the eight Variables concepts declared `recognise` and had nothing
-- playable at it, which blocked the path at concept #1: a learner walking
-- Variables in order could not finish the first thing they met.
--
-- WHAT RECOGNITION IS, AND IS NOT. Prediction asks what code will do.
-- Recognition asks the learner to look at something already in front of them and
-- say which part is the thing being named. It is the shallowest rung for a
-- reason -- it comes before you can reason about behaviour -- and the questions
-- are deliberately easy. A recognition question that requires tracing is a
-- prediction question wearing the wrong label.
--
-- THE HARD CONSTRAINT: ALLOWED KNOWLEDGE. Each question uses only what a learner
-- has met by the time they reach that concept. Variables #1 has seen the Values
-- topic and nothing else, so its distractors are `console.log`, literals and
-- names -- not bare assignment, which is concept #4. `const` appears only at
-- #7, where it is the point. Nothing here reaches forward to make a distractor
-- harder; a distractor the learner cannot parse teaches nothing.
--
-- TYPE `match-concept`, which questions.challenge_type has always allowed and
-- nothing has used. Recognition is picking the construct that matches an idea,
-- which is what that type was named for -- so there is no new type and no
-- migration.
--
-- DISTRACTORS ARE NEAR-MISSES, not noise. Each wrong option is a line that does
-- something real and adjacent -- prints the name as text, uses a name instead of
-- creating one, creates a name without a value. The mistake each one represents
-- is what the explanation addresses.

BEGIN;

CREATE OR REPLACE FUNCTION seed_recognise(
    p_ref TEXT, p_prompt TEXT, p_concept TEXT, p_correct TEXT, p_wrong TEXT[], p_why TEXT
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
    WHERE source = 'jolt-variables-recognise' AND external_ref = p_ref;

    IF v_question IS NOT NULL THEN RETURN; END IF;

    -- ADOPTION for rows seeded before names existed: give the existing row the
    -- name rather than inserting beside it. Only rows with no name yet, so this
    -- can never take a question that already belongs to another.
    SELECT id INTO v_question
    FROM questions
    WHERE prompt = p_prompt AND source = 'jolt-variables-recognise' AND external_ref IS NULL
    ORDER BY id  -- the oldest copy: the one learners have answered
    LIMIT 1;

    IF v_question IS NOT NULL THEN
        UPDATE questions SET external_ref = p_ref WHERE id = v_question;
        RETURN;
    END IF;

    INSERT INTO challenges (concept_id, demand_id, role, difficulty)
    SELECT c.id, d.id, 'practise', 1
    FROM concepts c, demands d
    WHERE c.slug = p_concept AND d.slug = 'recognise'
    RETURNING id INTO v_challenge;

    INSERT INTO questions
        (prompt, difficulty, topic, challenge_type, challenge_id, source, explanation, external_ref)
    VALUES (p_prompt, 1, 'variables', 'match-concept', v_challenge,
            'jolt-variables-recognise', p_why, p_ref)
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

-- 1 · variables-name-values. The name and the value are two separate things,
-- which is the whole concept. Naming the parts comes before using them.
SELECT seed_recognise(
    'vars-recognise-001',
    E'Which part of this line is the name?\n\nlet fuel = 100;',
    'variables-name-values', 'fuel', ARRAY['100', 'let', '='],
    'The name is the word you choose: `fuel`. `100` is the value it holds, `let` is the instruction to create a name, and `=` is what puts the value into it.');

-- 2 · declaration. Creating a name, versus using one that already exists.
SELECT seed_recognise(
    'vars-recognise-002',
    E'Which line brings a new name into existence?',
    'declaration', 'let crew = 4;',
    ARRAY['console.log(crew);', 'console.log("crew");', 'crew'],
    'Only `let` creates a name. `console.log(crew)` uses a name that must already exist, `console.log("crew")` prints the word itself, and `crew` on its own creates nothing.');

-- 3 · initialization. Created WITH a value, versus created empty.
SELECT seed_recognise(
    'vars-recognise-003',
    E'Which line creates a name and gives it a value at the same time?',
    'initialization', 'let fuel = 100;',
    ARRAY['let fuel;', 'console.log(fuel);', 'console.log("fuel = 100");'],
    '`let fuel = 100;` does both at once. `let fuel;` creates the name but leaves it holding nothing yet, and the two `console.log` lines only display things.');

-- 5 · reading-variables. Using the value a name holds, versus the word itself.
SELECT seed_recognise(
    'vars-recognise-004',
    E'Which line displays the value that `fuel` is holding?',
    'reading-variables', 'console.log(fuel);',
    ARRAY['console.log("fuel");', 'let fuel = 80;', 'console.log("Fuel: 80");'],
    'Writing `fuel` without quotes looks up what it holds. With quotes you get the word `fuel` itself, and typing `80` into a message does not read the name at all.');

-- 7 · let-vs-const. What const actually refuses.
SELECT seed_recognise(
    'vars-recognise-005',
    E'Which line creates a name that cannot be given a different value later?',
    'let-vs-const', 'const crew = 5;',
    ARRAY['let crew = 5;', 'crew = 5;', 'console.log(crew);'],
    'A `const` name keeps the value it was created with. `let` creates a name that can be given a new one, `crew = 5;` gives a value to a name that already exists, and `console.log` only displays.');

DROP FUNCTION seed_recognise(TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT);

COMMIT;
