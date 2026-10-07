-- The remaining Values explanations.
--
-- The remediation loop begins "wrong -> explanation", and on the very FIRST
-- concept a learner meets it began "wrong -> nothing": console-output's six
-- questions carried no explanation, and neither did four of the expression
-- questions or two of the boolean ones. Seed 025 filled Variables; this fills
-- what Values still had missing, so the loop has something to say wherever a
-- learner is standing when they get something wrong.
--
-- Same standard as seed 025: explain the REASONING, name the misconception the
-- distractors are built from, stay inside taught grammar, and stay short enough
-- to read in the moment. Nothing here restates the correct option.
--
-- Matched by id is deliberately avoided -- ids differ between a freshly seeded
-- database and a long-lived one. Matched on the prompt, scoped to the concept,
-- for the reason seed 029 records.

BEGIN;

CREATE OR REPLACE FUNCTION explain_values(p_like TEXT, p_concept TEXT, p_why TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    UPDATE questions q
    SET explanation = p_why
    FROM challenges ch, concepts c
    WHERE q.challenge_id = ch.id AND ch.concept_id = c.id
      AND c.slug = p_concept AND q.prompt LIKE p_like;
END;
$$;

-- console-output · what console.log does, and what quotes are for
SELECT explain_values('%console.log("Hello");%', 'console-output',
    'console.log displays whatever sits inside its brackets. The quotes mark where the text begins and ends in the code, so they are not part of the value and are not displayed.');
SELECT explain_values('%console.log(5);%', 'console-output',
    'A number needs no quotes. console.log displays the value it was given, which here is the number 5.');
SELECT explain_values('%console.log("JavaScript");%', 'console-output',
    'The whole piece of text inside the quotes is one value, and it is displayed exactly as written -- without the quotes themselves.');
SELECT explain_values('%console.log("5");%', 'console-output',
    'This one is text that happens to be a digit. It displays the same as the number 5 would, which is exactly why the quotes matter more than they look.');
SELECT explain_values('%console.log(42);%', 'console-output',
    'The value inside the brackets is displayed as it is. Nothing is added, removed or rounded on the way out.');
SELECT explain_values('%console.log("hello world");%', 'console-output',
    'The space is part of the text, so it survives. Everything between the quotes is one single value.');

-- expressions-produce-values · the expression is worked out FIRST
SELECT explain_values('%console.log(5 + 5);%', 'expressions-produce-values',
    'The sum is worked out before anything is displayed, so console.log never sees `5 + 5` -- it only ever sees the single value that produced.');
SELECT explain_values('%console.log(2 * 3);%', 'expressions-produce-values',
    'Two numbers multiplied produce one number. That one value is what reaches console.log; the digits are never placed side by side.');
SELECT explain_values('%console.log(10 - 4);%', 'expressions-produce-values',
    'Subtraction collapses two numbers into one, and that single result is what gets displayed.');
SELECT explain_values('%console.log(7 + 3);%', 'expressions-produce-values',
    'An expression is replaced by the value it produces before anything else happens, so what is displayed is the sum rather than the sum written out.');

-- booleans · the two values, and the word that impersonates one
SELECT explain_values('%console.log(false);%', 'booleans',
    'false is a value in its own right, not a word. It is displayed without quotes because there were never any quotes -- that is what makes it a boolean.');
SELECT explain_values('%console.log("false");%', 'booleans',
    'This is text that happens to spell the word. It displays identically to the boolean, which is exactly the trap: once printed you cannot tell them apart, and the quotes in the code are the only clue.');

DROP FUNCTION explain_values(TEXT, TEXT, TEXT);

COMMIT;
