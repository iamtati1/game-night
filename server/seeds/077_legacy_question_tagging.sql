-- Tagging ten legacy questions as curriculum practice.
--
-- WHAT THIS IS, AND WHAT IT IS NOT. Every question below already exists, is
-- already active and is already playable; 234 of them carry challenge_id IS
-- NULL and reach Code Blitz through the transitional hatch in eligibility.ts,
-- roles.ts and frontier.ts. An untagged question is dealable but can never
-- clear a rung, because every arm of CLEARED_RUNGS_CTE joins through
-- questions.challenge_id. This seed gives ten of them a rung to stand on.
--
-- NO CONTENT IS EDITED. No prompt, option, correct answer, explanation,
-- difficulty or topic is touched. The only column written is
-- questions.challenge_id, plus the challenge rows that column points at. The
-- stale `topic` values stay as they are -- questions.topic is read only when a
-- question has no challenge (see question_journey in curriculum/journey.ts), so
-- once tagged it stops being consulted and correcting it is a separate job.
--
-- WHY THESE TEN. Each was checked against the concept's own objective and the
-- demand's own meaning rather than against questions.topic, which is
-- unreliable: q156 and q164 are labelled `arrays` and are string questions, and
-- q207 is labelled `conditionals`, a slug that is not a curriculum topic at all.
-- Each was also checked against the content already on its target rung, which
-- is what ruled out the obvious-looking candidates -- the
-- `const total = 4; total = 5` question is the same code as the authored
-- let-vs-const question with one variable renamed, and tagging it would have
-- put two copies of one lesson on one rung.
--
-- ALLOWED KNOWLEDGE was checked per target topic -- the rule seed 033 states
-- for Operators and operatorsTopic.test.ts enforces: a question on an
-- Operators rung may not use `if`, a function, a method call, brackets or a
-- loop. That rule is why the equality/diagnose candidate is NOT here. It
-- declares a function and branches with `if` -- four and one topics early --
-- so the one empty rung a legacy question could have filled stays empty until
-- something is authored for it. Every one of the 38 authored Values questions
-- is likewise a bare `console.log(expression)` with no variable, because Values
-- precedes Variables, which is why the two `typeof` candidates that open with
-- `const` are not here either.
--
-- RUNG COVERAGE IS UNCHANGED. None of these fills an empty rung; each deepens
-- a rung that already holds one to three questions, with the case its existing
-- content does not cover. That is what a learner working through Variables to
-- Strings actually runs out of first.
--
-- DIFFICULTY IS DERIVED, never typed in, exactly as seeds 015, 016 and 019 do
-- it. The helpers are declared here and dropped at the end, matching seed 015:
-- they exist for this file's run only, and seed 015 drops the same two names,
-- so a later seed cannot depend on them by accident.
--
-- CONVERGENT. attach_question_challenge returns without doing anything when
-- the question already carries a challenge, so a second run is a no-op rather
-- than a duplicate.

BEGIN;

-- Identical to the body in seeds 015 and 019. Repeated rather than left behind
-- by one of them because both drop it, which is the house pattern: a seed
-- declares the helpers it needs and takes them away again.
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

-- Identical to the body in seed 015. Keyed on the prompt, which is the natural
-- key the rest of the seeds use and which is unique across all 507 questions.
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

-- q8 · initialization · predict
-- the uninitialised case; the rung's only question covers the positive one.
SELECT attach_question_challenge(
    E'What does this log?\n\nlet x;\nconsole.log(x);',
    'initialization', 'predict', 'practise');

-- q6 · type-coercion · predict
-- the `-` half of the rule; the rung only has `+`.
SELECT attach_question_challenge(
    E'What does this log?\n\nconsole.log("5" - 3);',
    'type-coercion', 'predict', 'practise');

-- q32 · truthy-falsy · predict
-- `"0"` truthy, the opposite of the rung's only question (`""` falsy).
SELECT attach_question_challenge(
    E'What does this log?\n\nconsole.log(Boolean("0"));',
    'truthy-falsy', 'predict', 'practise');

-- q207 · logical-operators · predict
-- `||` where the rung only has `&&`.
SELECT attach_question_challenge(
    E'What does this log?\n\nconst isAdmin = false;\nconst isOwner = true;\n\nconsole.log(isAdmin || isOwner);',
    'logical-operators', 'predict', 'practise');

-- q167 · assignment-operators · predict
-- chains `+=` then `++`; the rung's question is `+=` alone.
SELECT attach_question_challenge(
    E'What does this log?\n\nlet n = 5;\nn += 3;\nn++;\nconsole.log(n);',
    'assignment-operators', 'predict', 'practise');

-- q155 · string-concatenation · predict
-- the explicit space literal, which the existing question deliberately omits.
SELECT attach_question_challenge(
    E'What does this log?\n\nconst first = "Ada";\nconst last = "Lovelace";\nconsole.log(first + " " + last);',
    'string-concatenation', 'predict', 'practise');

-- q156 · string-length · predict
-- `.length` read off a variable, then used in arithmetic.
SELECT attach_question_challenge(
    E'What does this log?\n\nconst name = "Ada";\nconsole.log(name.length + 1);',
    'string-length', 'predict', 'practise');

-- q61 · template-literals · predict
-- the working interpolation; the existing question is the quoting failure.
SELECT attach_question_challenge(
    E'What does this log?\n\nconst name = "Ada";\nconsole.log(`Hi ${name}, you have ${2 + 3} messages`);',
    'template-literals', 'predict', 'practise');

-- q162 · string-methods · predict
-- `replace` changes only the first match.
SELECT attach_question_challenge(
    E'What does this log?\n\nconst path = "a-b-c";\nconsole.log(path.replace("-", "+"));',
    'string-methods', 'predict', 'practise');

-- q164 · string-methods · predict
-- `String.includes` returning a boolean.
SELECT attach_question_challenge(
    E'What does this log?\n\nconst email = "ada@example.com";\nconsole.log(email.includes("@"));',
    'string-methods', 'predict', 'practise');

-- Drop the helpers, matching seeds 013, 015 and 019: they exist for this
-- file's run only and leaving them behind would let a later seed depend on
-- them by accident.
DROP FUNCTION attach_question_challenge(TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION curriculum_difficulty(TEXT, TEXT);

COMMIT;
