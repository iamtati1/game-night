-- The first three complete-code questions.
--
-- Three, not thirty. The mechanic is unplayed: nobody knows yet whether
-- assembling tokens feels like thinking or like typing, whether 45 seconds is
-- generous or tight, or whether a four-token gap is tedious on a phone. Writing
-- a batch before finding that out would mean rewriting a batch.
--
-- One of each shape the design calls for: a method decision, a loop condition,
-- and a value/return question where the ORDER of the tokens is the lesson.
--
-- THE EXPECTED-RESULT CONVENTION. A complete-code prompt must state its target
-- output, in the form "so it logs: <result>", on the instruction line. The player
-- needs it -- you cannot build towards an answer you have not been shown -- and
-- the content tests parse it to check that the declared assembly really produces
-- what the question claims. Multiple logged lines are written comma-separated,
-- which is how the tests join them.

CREATE OR REPLACE FUNCTION seed_complete_code(
    p_prompt TEXT,
    p_difficulty INTEGER,
    p_topic TEXT,
    p_explanation TEXT,
    -- Each entry is {"text": ...} for a distractor, or {"text": ..., "pos": n}
    -- for a token that belongs in the answer at position n.
    p_options JSONB
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_id BIGINT;
    v_option JSONB;
    v_pos INTEGER := 0;
BEGIN
    -- Converges rather than skipping, matching seeds 008, 010 and 012.
    IF EXISTS (SELECT 1 FROM questions WHERE prompt = p_prompt) THEN
        UPDATE questions
        SET difficulty = p_difficulty, topic = p_topic, explanation = p_explanation,
            challenge_type = 'complete-code'
        WHERE prompt = p_prompt;
        RETURN;
    END IF;

    INSERT INTO questions (prompt, difficulty, topic, explanation, challenge_type)
    VALUES (p_prompt, p_difficulty, p_topic, p_explanation, 'complete-code')
    RETURNING id INTO v_id;

    FOR v_option IN SELECT * FROM jsonb_array_elements(p_options) LOOP
        v_pos := v_pos + 1;

        INSERT INTO question_options
            (question_id, option_text, display_order, is_correct, answer_position)
        VALUES (
            v_id,
            v_option->>'text',
            v_pos,
            (v_option ? 'pos'),
            CASE WHEN v_option ? 'pos' THEN (v_option->>'pos')::INTEGER END
        );
    END LOOP;
END;
$$;

-- ════════════════ 1 · method decision · array-methods > filter ════════════════

SELECT seed_complete_code(
    E'Complete the code so it logs: ["Ada", "Kit"]\n\nconst people = [\n  { name: "Ada", age: 36 },\n  { name: "Sam", age: 12 },\n  { name: "Kit", age: 18 }\n];\n\nconst adults = people.filter((p) => p.age /*?*/);\nconsole.log(adults.map((p) => p.name));',
    3, 'array-methods',
    'Kit is exactly 18, so the boundary is the whole question: >= keeps Kit and > drops him. The = option is the classic slip -- p.age = 18 is an assignment, not a comparison, and it returns 18, which is truthy, so every person is kept.',
    $j$[
      {"text": ">=", "pos": 1},
      {"text": "18", "pos": 2},
      {"text": ">"},
      {"text": "21"},
      {"text": "="}
    ]$j$::JSONB);

-- ══════════════════ 2 · loop condition · loops > loop-conditions ══════════════════

SELECT seed_complete_code(
    E'Complete the loop so it logs: "a", "b", "c"\n\nconst items = ["a", "b", "c"];\n\nfor (let i = 0; i /*?*/; i++) {\n  console.log(items[i]);\n}',
    2, 'loops',
    'length counts the items, so the last valid index is length - 1. Stopping at < length visits every item exactly once; <= length runs one pass too many and reads past the end, which logs undefined.',
    $j$[
      {"text": "<", "pos": 1},
      {"text": "items.length", "pos": 2},
      {"text": "<="},
      {"text": "0"},
      {"text": "items.length + 1"}
    ]$j$::JSONB);

-- ═══════════ 3 · value and return, order is the lesson · scope > closures ═══════════

SELECT seed_complete_code(
    E'Complete the counter so it logs: 2\n\nfunction makeCounter() {\n  let n = 0;\n  return () => /*?*/;\n}\n\nconst next = makeCounter();\nnext();\nconsole.log(next());',
    4, 'scope',
    'Both ++n and n++ increment, but they return different things: ++n increments first and returns the new value, n++ returns the old one. After two calls n is 2 either way -- only ++n reports it.',
    $j$[
      {"text": "++", "pos": 1},
      {"text": "n", "pos": 2},
      {"text": "--"},
      {"text": "n + 1"}
    ]$j$::JSONB);

DROP FUNCTION seed_complete_code(TEXT, INTEGER, TEXT, TEXT, JSONB);
