-- Code Blitz question bank. Safe to re-run: skips if the prompt already exists.
-- Each block inserts one question plus its four options in a single statement,
-- so a question can never land without its options.

CREATE OR REPLACE FUNCTION seed_question(
    p_prompt TEXT,
    p_a TEXT, p_b TEXT, p_c TEXT, p_d TEXT,
    p_correct INTEGER
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_question_id BIGINT;
BEGIN
    IF EXISTS (SELECT 1 FROM questions WHERE prompt = p_prompt) THEN
        RETURN;
    END IF;

    INSERT INTO questions (prompt) VALUES (p_prompt) RETURNING id INTO v_question_id;

    INSERT INTO question_options (question_id, option_text, display_order, is_correct)
    VALUES (v_question_id, p_a, 1, p_correct = 1),
           (v_question_id, p_b, 2, p_correct = 2),
           (v_question_id, p_c, 3, p_correct = 3),
           (v_question_id, p_d, 4, p_correct = 4);
END;
$$;

SELECT seed_question(
    E'What does this log?\n\nconsole.log(typeof null);',
    '"object"', '"null"', '"undefined"', 'ReferenceError', 1);

SELECT seed_question(
    E'What does this log?\n\nconst nums = [2, 4, 6];\nconsole.log(nums.map(n => n * 2));',
    '[2, 4, 6]', '[4, 8, 12]', '[2, 4, 6, 2, 4, 6]', 'undefined', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(0.1 + 0.2 === 0.3);',
    'true', 'false', 'NaN', 'TypeError', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log([10, 9, 1].sort());',
    '[1, 9, 10]', '[1, 10, 9]', '[10, 9, 1]', '[9, 10, 1]', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(1 + "1");',
    '2', '"11"', 'NaN', 'TypeError', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log("5" - 3);',
    '2', '"53"', 'NaN', 'TypeError', 1);

SELECT seed_question(
    E'What does this log?\n\nconsole.log([..."abc"]);',
    '"abc"', '["abc"]', '["a", "b", "c"]', '[97, 98, 99]', 3);

SELECT seed_question(
    E'What does this log?\n\nlet x;\nconsole.log(x);',
    'null', 'undefined', '0', 'ReferenceError', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log([1, 2] + [3, 4]);',
    '[1, 2, 3, 4]', '"1,23,4"', '10', 'TypeError', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log([1, 2, 3].filter(n => n > 1).length);',
    '1', '2', '3', '0', 2);

SELECT seed_question(
    'What is the average time complexity of binary search on a sorted array?',
    'O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 2);

SELECT seed_question(
    E'What does this log?\n\nconsole.log(Array.isArray([]));',
    'true', 'false', 'undefined', 'TypeError', 1);

SELECT seed_question(
    E'What does this log?\n\nconst a = { n: 1 };\nconst b = a;\nb.n = 2;\nconsole.log(a.n);',
    '1', '2', 'undefined', 'TypeError', 2);

DROP FUNCTION seed_question(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER);

SELECT COUNT(*) AS active_questions FROM questions WHERE is_active;
