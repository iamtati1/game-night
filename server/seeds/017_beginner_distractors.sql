-- The distractor standard, and the first questions written to it.
--
-- THE STANDARD, in one line:
--
--     A wrong answer must be something a learner could genuinely believe.
--
-- Not a misspelling, not a shuffled variant of the right answer, not a value
-- picked because it looks different. Each distractor should name a specific
-- misconception, and the explanation should say why that belief is wrong rather
-- than only restating the correct answer. A question written this way tells us
-- something when it is missed; one written the other way tells us nothing.
--
--     BAD    "string" · "String" · "strng" · "text"
--            three of those are noise; missing it means nothing
--
--     GOOD   "string" · "number" · "integer" · "value"
--            "number"  -- read the digits and not the quotes
--            "integer" -- brought a type name from another language
--            "value"   -- thinks typeof reports a category, not a type
--
-- SCOPE. Two questions, at the very start of the journey, where the current bank
-- is thinnest -- `values` is topic 1 and had a single question in it. The
-- existing bank is NOT rewritten here: seed_js_question deliberately leaves the
-- options of an existing question alone, because they are keyed by position and
-- rewriting them would orphan any session_questions row that cites one. Bringing
-- old questions up to this standard means retiring and replacing them, which is
-- its own slice.
--
-- These are also deliberately untagged. They are journey content -- topic
-- `values`, which the journey gate reads -- not curriculum challenges. Tagging
-- content to concepts is the separate pass this slice does not start.

BEGIN;

/** Same helper as seeds 008 and 010, defined here so this file stands alone. */
CREATE OR REPLACE FUNCTION seed_js_question(
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
        VALUES (v_id, v_option ->> 'text', v_pos, (v_option ->> 'correct')::BOOLEAN);
    END LOOP;
END;
$$;

-- Quotes make it a string, however numeric the characters look. The single most
-- common first-week misreading, and the reason "number" is here.
SELECT seed_js_question(
    E'What does this log?\n\nconst age = "25";\n\nconsole.log(typeof age);',
    1,
    'values',
    'Quotes make it a string. The characters inside happen to be digits, but typeof reports how the value is stored, not what it looks like — "25" is text and 25 is a number. JavaScript has no separate "integer" type; whole numbers and decimals are both `number`. And typeof always names a type, never a category like "value".',
    $j$[
        {"text": "\"string\"", "correct": true},
        {"text": "\"number\"", "correct": false},
        {"text": "\"integer\"", "correct": false},
        {"text": "\"value\"", "correct": false}
    ]$j$::JSONB
);

-- The mirror image: no quotes, so it really is a number. Paired with the one
-- above so meeting both teaches the distinction from each side.
SELECT seed_js_question(
    E'What does this log?\n\nconst score = 25;\n\nconsole.log(typeof score);',
    1,
    'values',
    'No quotes, so this is a number. Compare it with `"25"`, which is a string of two digit characters — the value on screen looks the same, and the type is not. `typeof` returns the type''s name as a lowercase string, which is why the answer is "number" rather than Number.',
    $j$[
        {"text": "\"number\"", "correct": true},
        {"text": "\"string\"", "correct": false},
        {"text": "\"Number\"", "correct": false},
        {"text": "\"int\"", "correct": false}
    ]$j$::JSONB
);

DROP FUNCTION seed_js_question(TEXT, INTEGER, TEXT, TEXT, JSONB);

COMMIT;
