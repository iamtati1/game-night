-- Completing Strings: fifteen question rungs across seven concepts.
--
-- Fourth topic built to the Values template. Three more rungs --
-- string-concatenation / produce, string-methods / produce and
-- template-literals / produce -- are code-writing movements registered by seed
-- 039, because each is distinguished from its neighbour by HOW the text was
-- built rather than by what was printed.
--
-- `littleJs` gained `.length`, position access and a fixed table of string
-- methods for this topic. Template literals it already had. Every snippet below
-- is code the learner could paste into the editor and run.
--
-- ALLOWED KNOWLEDGE at Strings is Values + Variables + Operators + Control
-- Flow, plus whatever earlier Strings concepts have taught. No arrays, objects,
-- functions or loops. Position access with square brackets belongs to
-- `string-indexing` here and NOT to arrays, which come five topics later.
--
-- TWO THINGS THE TOPIC KEEPS COMING BACK TO, because both are the source of
-- real bugs rather than trivia: counting starts at zero, and a string method
-- never edits the text it was called on.

BEGIN;

CREATE OR REPLACE FUNCTION seed_str(
    p_concept TEXT, p_demand TEXT, p_prompt TEXT,
    p_correct TEXT, p_wrong TEXT[], p_why TEXT
)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_question BIGINT; v_challenge BIGINT; v_wrong TEXT; v_order INT := 1; v_type TEXT;
BEGIN
    SELECT id INTO v_question FROM questions WHERE prompt = p_prompt;
    IF v_question IS NOT NULL THEN RETURN; END IF;

    v_type := CASE WHEN p_demand IN ('recognise', 'recall', 'explain')
                   THEN 'match-concept' ELSE 'predict-output' END;

    INSERT INTO challenges (concept_id, demand_id, role, difficulty)
    SELECT c.id, d.id, 'practise',
           CASE WHEN d.display_order >= (SELECT display_order FROM demands WHERE slug='produce')
                THEN 3 ELSE 2 END
    FROM concepts c, demands d
    WHERE c.slug = p_concept AND d.slug = p_demand
    RETURNING id INTO v_challenge;

    INSERT INTO questions
        (prompt, difficulty, topic, challenge_type, challenge_id, source, explanation)
    VALUES (p_prompt, 2, 'strings', v_type, v_challenge, 'jolt-strings-completion', p_why)
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

/* ── 1 · string-literals ────────────────────────────────────────────────── */

SELECT seed_str('string-literals', 'recognise',
    E'Which of these is text?',
    '"7"', ARRAY['7', 'true', '7.5'],
    'The quotes are what make it text. Without them `7` is a number you can do arithmetic with, and `true` is a boolean -- three different kinds of value that can all look similar once printed.');

SELECT seed_str('string-literals', 'predict',
    E'What does this log?\n\nconsole.log("3" + "4");',
    '34', ARRAY['7', '"34"', '12'],
    'Both sides are text, so `+` joins rather than adds. The quotes mark where each piece begins and ends in the code -- they are not part of the value and are not printed.');

/* ── 2 · string-concatenation ───────────────────────────────────────────── */

SELECT seed_str('string-concatenation', 'predict',
    E'What does this log?\n\nlet first = "Nova";\nlet second = "Drift";\nconsole.log(first + second);',
    'NovaDrift', ARRAY['Nova Drift', 'first second', 'NovaDrift '],
    'Nothing put a space there. Joining puts the pieces end to end exactly as given, so a gap has to be joined in as its own piece of text.');

SELECT seed_str('string-concatenation', 'diagnose',
    E'This should read "Bays: 4" but the number never appears.\n\nlet bays = 4;\nconsole.log("Bays: bays");\n\nWhich line is the cause?',
    'console.log("Bays: bays");',
    ARRAY['let bays = 4;', 'the quotes around Bays:', 'nothing -- it works'],
    'The name ended up INSIDE the quotes, so it is printed as the letters b-a-y-s rather than looked up. Anything between quotes is text, whatever it spells.');

/* ── 3 · string-length ──────────────────────────────────────────────────── */

SELECT seed_str('string-length', 'predict',
    E'What does this log?\n\nconsole.log("Jolt ".length);',
    '5', ARRAY['4', '1', '6'],
    'A space is a character like any other, and there is one after the t. `.length` counts characters rather than words.');

SELECT seed_str('string-length', 'diagnose',
    E'This is meant to reject empty input, but it rejects everything.\n\nlet name = "Tati";\nif (name.length > 10) {\n  console.log("Too long");\n} else {\n  console.log("Empty");\n}\n\nWhich line is the cause?',
    'if (name.length > 10) {',
    ARRAY['let name = "Tati";', 'console.log("Empty");', 'console.log("Too long");'],
    'The condition asks the wrong question. Checking for empty means comparing against 0, not 10 -- as written, every name shorter than eleven characters falls into the else and is called empty.');

/* ── 4 · string-indexing ────────────────────────────────────────────────── */

SELECT seed_str('string-indexing', 'recognise',
    E'Which one reaches the FIRST character of this text?\n\nlet word = "Jolt";',
    'word[0]', ARRAY['word[1]', 'word.length', 'word.first'],
    'Counting starts at zero, so the first character sits at position 0. `word[1]` is the second one, and `.length` counts the characters rather than reaching one.');

SELECT seed_str('string-indexing', 'predict',
    E'What does this log?\n\nlet word = "Jolt";\nconsole.log(word[1]);',
    'o', ARRAY['J', 'Jo', 'l'],
    'Position 0 holds the J, so position 1 is the second character. One position gives exactly one character.');

/* ── 5 · string-methods ─────────────────────────────────────────────────── */

SELECT seed_str('string-methods', 'recall',
    E'Which method removes the spaces from both ends of a piece of text?',
    '.trim()', ARRAY['.slice()', '.toLowerCase()', '.replace()'],
    '`.trim()` takes whitespace off each end and leaves the middle alone. `.slice()` cuts by position wherever you ask, and the other two change letters rather than spacing.');

SELECT seed_str('string-methods', 'predict',
    E'What does this log?\n\nconsole.log("  Jolt  ".trim().length);',
    '4', ARRAY['8', '6', '5'],
    'The trim runs first and hands back new text with both ends removed; only then is that counted. Reading left to right is the same order it runs in.');

/* ── 6 · template-literals ──────────────────────────────────────────────── */

SELECT seed_str('template-literals', 'recognise',
    E'Which one is a template literal?',
    '`Hi ${name}`', ARRAY['"Hi " + name', '"Hi ${name}"', 'Hi ${name}'],
    'Backticks are what make it a template. With ordinary quotes the `${ }` is printed exactly as written, and joining with `+` gets the same result a different way.');

SELECT seed_str('template-literals', 'predict',
    E'What does this log?\n\nlet name = "Tati";\nconsole.log("Hi ${name}");',
    'Hi ${name}', ARRAY['Hi Tati', 'Hi', 'Hi name'],
    'These are ordinary quotes, not backticks, so nothing is filled in and the characters are printed as written. This is a common typo, and swapping the quotes for backticks is the whole fix.');

/* ── 7 · string-immutability ────────────────────────────────────────────── */

SELECT seed_str('string-immutability', 'predict',
    E'What does this log?\n\nlet word = "  hi  ";\nword.trim();\nconsole.log(word.length);',
    '6', ARRAY['2', '0', '4'],
    '`.trim()` produced trimmed text and nothing kept it, so `word` still holds what it always held. String methods hand back new text rather than editing the old.');

SELECT seed_str('string-immutability', 'diagnose',
    E'The name is supposed to end up capitalised, and never does.\n\nlet name = "tati";\nname.toUpperCase();\nconsole.log(name);\n\nWhich line is the cause?',
    'name.toUpperCase();',
    ARRAY['let name = "tati";', 'console.log(name);', 'nothing -- it works'],
    'That line ran and produced `TATI`, and then threw it away. The method is not wrong; catching its result is what is missing.');

SELECT seed_str('string-immutability', 'repair',
    E'let name = "tati";\nname.toUpperCase();\nconsole.log(name);\n\nThis prints tati. Which change makes it print TATI?',
    'Store the result: name = name.toUpperCase();',
    ARRAY['Move the toUpperCase call after the log',
          'Declare name with const instead of let',
          'Call toUpperCase twice'],
    'The repair is to keep what the method handed back. Nothing about the original line is broken -- its result simply had nowhere to go, so storing it back into `name` is the whole fix.');

DROP FUNCTION seed_str(TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT);

COMMIT;
