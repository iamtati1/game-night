-- Making the right answer unguessable from its shape.
--
-- THE DEFECT, found by measuring rather than by reading: 31 of 32 `explain`
-- rungs could be cleared by picking the longest option, and 7 of 11 `repair`
-- rungs too. A learner could demonstrate `explain` across the whole curriculum
-- without reading a single question. That is exactly the shortcut the evidence
-- model exists to prevent, and it was sitting in the content the whole time.
--
-- THE CAUSE WAS THIS CODEBASE'S OWN STANDARD. Every topic's contract test
-- asserts that an explain answer is longer than 25 characters -- "a mechanism
-- takes a clause, not a word" -- while the distractors were written as short
-- dismissals. A rule meant to raise quality became a tell.
--
-- A SECOND TELL, found in the same pass: the distractors nearly all began
-- "Because ..." and the correct option did not, so the odd one out was the
-- answer. Both are fixed here.
--
-- WHAT CHANGED, AND WHAT DID NOT. No question, no explanation and no correct
-- ANSWER changed meaning. The correct option is trimmed to the same grain as
-- the distractors -- the full mechanism still lives in the explanation, which
-- is what a learner reads after choosing -- and "Because " is stripped from
-- the distractors so every option reads the same way. Nothing was padded, and
-- no distractor was made longer to hide the answer: that would be gaming the
-- measurement rather than fixing the content.
--
-- The invariant is asserted in `encounter.test.ts`, which fails if any demand
-- with eight or more questions answers to "pick the longest" more than half
-- the time.
--
-- IDENTIFIED BY NAME, NOT BY ROW ID. This file first targeted `WHERE id = 1280`
-- and `question_id = 312` -- surrogate ids that are only right on a database
-- built in exactly the order this was written against. Any other build order
-- (a seed that inserts one row fewer earlier on) moved every id, and these
-- updates wrote one question's distractors onto another. Each statement now
-- names its question by (source, external_ref) and a distractor by the text
-- it replaces, so it lands on the right row or on none -- and a re-run, where
-- the old text is already gone, changes nothing.

BEGIN;

UPDATE question_options o SET option_text = '14 is the correct total of those three numbers'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-values-completion' AND q.external_ref = 'values-completion-002'
   AND o.option_text = 'Because 14 is the correct total of those three numbers';
UPDATE question_options o SET option_text = 'console.log reads the numbers from right to left'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-values-completion' AND q.external_ref = 'values-completion-002'
   AND o.option_text = 'Because console.log reads the numbers from right to left';
UPDATE question_options o SET option_text = 'addition is always worked out last in JavaScript'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-values-completion' AND q.external_ref = 'values-completion-002'
   AND o.option_text = 'Because addition is always worked out last in JavaScript';
UPDATE question_options SET option_text = 'multiplication is worked out before addition'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-values-completion' AND external_ref = 'values-completion-002');
UPDATE question_options o SET option_text = 'console.log adds up any numbers it is given'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-values-completion' AND q.external_ref = 'values-completion-004'
   AND o.option_text = 'Because console.log adds up any numbers it is given';
UPDATE question_options o SET option_text = 'JavaScript never displays mathematical symbols'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-values-completion' AND q.external_ref = 'values-completion-004'
   AND o.option_text = 'Because JavaScript never displays mathematical symbols';
UPDATE question_options o SET option_text = '10 is shorter to display than 5 + 5'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-values-completion' AND q.external_ref = 'values-completion-004'
   AND o.option_text = 'Because 10 is shorter to display than 5 + 5';
UPDATE question_options SET option_text = 'the expression is replaced by its value first'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-values-completion' AND external_ref = 'values-completion-004');
UPDATE question_options o SET option_text = 'null is older than undefined'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-values-completion' AND q.external_ref = 'values-completion-009'
   AND o.option_text = 'Because null is older than undefined';
UPDATE question_options o SET option_text = 'only one of them can be displayed'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-values-completion' AND q.external_ref = 'values-completion-009'
   AND o.option_text = 'Because only one of them can be displayed';
UPDATE question_options o SET option_text = 'they report the same type as each other'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-values-completion' AND q.external_ref = 'values-completion-009'
   AND o.option_text = 'Because they report the same type as each other';
UPDATE question_options SET option_text = 'null is chosen on purpose; undefined is not'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-values-completion' AND external_ref = 'values-completion-009');
UPDATE question_options o SET option_text = 'subtraction is always worked out before addition'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-operators-completion' AND q.external_ref = 'type-coercion-explain-01'
   AND o.option_text = 'Because subtraction is always worked out before addition';
UPDATE question_options o SET option_text = '"5" is really a number and the quotes are ignored'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-operators-completion' AND q.external_ref = 'type-coercion-explain-01'
   AND o.option_text = 'Because "5" is really a number and the quotes are ignored';
UPDATE question_options o SET option_text = 'JavaScript rounds the result of subtraction'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-operators-completion' AND q.external_ref = 'type-coercion-explain-01'
   AND o.option_text = 'Because JavaScript rounds the result of subtraction';
UPDATE question_options SET option_text = '`+` can join text, so it does; `-` can only subtract'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-operators-completion' AND external_ref = 'type-coercion-explain-01');
UPDATE question_options o SET option_text = '`===` is stricter about whitespace inside the quotes'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-operators-completion' AND q.external_ref = 'equality-explain-01'
   AND o.option_text = 'Because `===` is stricter about whitespace inside the quotes';
UPDATE question_options o SET option_text = '`==` is older and has a bug that was never fixed'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-operators-completion' AND q.external_ref = 'equality-explain-01'
   AND o.option_text = 'Because `==` is older and has a bug that was never fixed';
UPDATE question_options o SET option_text = '`===` compares how the values are stored in memory'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-operators-completion' AND q.external_ref = 'equality-explain-01'
   AND o.option_text = 'Because `===` compares how the values are stored in memory';
UPDATE question_options SET option_text = '`==` converts the types first; `===` compares them too'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-operators-completion' AND external_ref = 'equality-explain-01');
UPDATE question_options o SET option_text = '`&&` only ever reads the value on its left'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-operators-completion' AND q.external_ref = 'logical-operators-explain-01'
   AND o.option_text = 'Because `&&` only ever reads the value on its left';
UPDATE question_options o SET option_text = 'false is treated as the end of the line'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-operators-completion' AND q.external_ref = 'logical-operators-explain-01'
   AND o.option_text = 'Because false is treated as the end of the line';
UPDATE question_options o SET option_text = 'the second value has not been declared yet'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-operators-completion' AND q.external_ref = 'logical-operators-explain-01'
   AND o.option_text = 'Because the second value has not been declared yet';
UPDATE question_options SET option_text = 'a false on the left settles `&&`, so it stops there'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-operators-completion' AND external_ref = 'logical-operators-explain-01');
UPDATE question_options o SET option_text = 'text is always truthy, empty or not'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-operators-completion' AND q.external_ref = 'truthy-falsy-explain-01'
   AND o.option_text = 'Because text is always truthy, empty or not';
UPDATE question_options o SET option_text = 'the word false is spelled correctly inside the quotes'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-operators-completion' AND q.external_ref = 'truthy-falsy-explain-01'
   AND o.option_text = 'Because the word false is spelled correctly inside the quotes';
UPDATE question_options o SET option_text = 'only numbers can be falsy'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-operators-completion' AND q.external_ref = 'truthy-falsy-explain-01'
   AND o.option_text = 'Because only numbers can be falsy';
UPDATE question_options SET option_text = 'any non-empty piece of text is truthy'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-operators-completion' AND external_ref = 'truthy-falsy-explain-01');
UPDATE question_options SET option_text = 'Move the fuel check out of the docked if'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-control-flow-completion' AND external_ref = 'nested-conditions-repair-01');
UPDATE question_options SET option_text = 'Store it: name = name.toUpperCase();'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-strings-completion' AND external_ref = 'string-immutability-repair-01');
UPDATE question_options o SET option_text = 'while loops have no built-in limit on the number of passes'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-loops-completion' AND q.external_ref = 'while-loops-explain-01'
   AND o.option_text = 'Because while loops have no built-in limit on the number of passes';
UPDATE question_options o SET option_text = 'the condition is only checked once, at the start'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-loops-completion' AND q.external_ref = 'while-loops-explain-01'
   AND o.option_text = 'Because the condition is only checked once, at the start';
UPDATE question_options o SET option_text = 'a while loop has no step of its own'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-loops-completion' AND q.external_ref = 'while-loops-explain-01'
   AND o.option_text = 'Because a while loop has no step of its own';
UPDATE question_options SET option_text = 'nothing inside the loop changes the condition'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-loops-completion' AND external_ref = 'while-loops-explain-01');
UPDATE question_options o SET option_text = 'a loop is not allowed to finish after an if has run'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-loops-completion' AND q.external_ref = 'break-continue-explain-01'
   AND o.option_text = 'Because a loop is not allowed to finish after an if has run';
UPDATE question_options o SET option_text = 'break makes the loop condition false'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-loops-completion' AND q.external_ref = 'break-continue-explain-01'
   AND o.option_text = 'Because break makes the loop condition false';
UPDATE question_options o SET option_text = 'the loop would otherwise never stop'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-loops-completion' AND q.external_ref = 'break-continue-explain-01'
   AND o.option_text = 'Because the loop would otherwise never stop';
UPDATE question_options SET option_text = 'the remaining passes cannot change the answer'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-loops-completion' AND external_ref = 'break-continue-explain-01');
UPDATE question_options o SET option_text = 'console.log sends its value somewhere that cannot be read back'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-functions-completion' AND q.external_ref = 'return-values-explain-01'
   AND o.option_text = 'Because console.log sends its value somewhere that cannot be read back';
UPDATE question_options o SET option_text = 'printing happens after the function has finished'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-functions-completion' AND q.external_ref = 'return-values-explain-01'
   AND o.option_text = 'Because printing happens after the function has finished';
UPDATE question_options o SET option_text = 'a variable can only hold what a function returns'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-functions-completion' AND q.external_ref = 'return-values-explain-01'
   AND o.option_text = 'Because a variable can only hold what a function returns';
UPDATE question_options SET option_text = 'the call becomes whatever was returned'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-functions-completion' AND external_ref = 'return-values-explain-01');
UPDATE question_options o SET option_text = 'an if without an else is faster to run'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-functions-completion' AND q.external_ref = 'guard-clauses-explain-01'
   AND o.option_text = 'Because an if without an else is faster to run';
UPDATE question_options o SET option_text = 'else may only be used once in a function'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-functions-completion' AND q.external_ref = 'guard-clauses-explain-01'
   AND o.option_text = 'Because else may only be used once in a function';
UPDATE question_options o SET option_text = 'the guard changes the condition for the rest of the function'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-functions-completion' AND q.external_ref = 'guard-clauses-explain-01'
   AND o.option_text = 'Because the guard changes the condition for the rest of the function';
UPDATE question_options SET option_text = 'the return ends it, so what follows is the other case'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-functions-completion' AND external_ref = 'guard-clauses-explain-01');
UPDATE question_options o SET option_text = 'functions are always run last in JavaScript'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-functions-completion' AND q.external_ref = 'functions-as-values-explain-01'
   AND o.option_text = 'Because functions are always run last in JavaScript';
UPDATE question_options o SET option_text = 'the function is copied into the other function'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-functions-completion' AND q.external_ref = 'functions-as-values-explain-01'
   AND o.option_text = 'Because the function is copied into the other function';
UPDATE question_options o SET option_text = 'a function cannot run until it has been stored somewhere'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-functions-completion' AND q.external_ref = 'functions-as-values-explain-01'
   AND o.option_text = 'Because a function cannot run until it has been stored somewhere';
UPDATE question_options o SET option_text = 'the braces hide it from the lines above them'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-scope-completion' AND q.external_ref = 'block-vs-function-scope-explain-01'
   AND o.option_text = 'Because the braces hide it from the lines above them';
UPDATE question_options o SET option_text = '`let` may only be read once after it is set'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-scope-completion' AND q.external_ref = 'block-vs-function-scope-explain-01'
   AND o.option_text = 'Because `let` may only be read once after it is set';
UPDATE question_options o SET option_text = 'a variable is removed as soon as it has been used'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-scope-completion' AND q.external_ref = 'block-vs-function-scope-explain-01'
   AND o.option_text = 'Because a variable is removed as soon as it has been used';
UPDATE question_options SET option_text = 'the block is the variable''s whole lifetime'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-scope-completion' AND external_ref = 'block-vs-function-scope-explain-01');
UPDATE question_options o SET option_text = '`let` is not hoisted and `var` is'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-scope-completion' AND q.external_ref = 'hoisting-tdz-explain-01'
   AND o.option_text = 'Because `let` is not hoisted and `var` is';
UPDATE question_options o SET option_text = '`undefined` is simply what any unset variable holds'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-scope-completion' AND q.external_ref = 'hoisting-tdz-explain-01'
   AND o.option_text = 'Because `undefined` is simply what any unset variable holds';
UPDATE question_options o SET option_text = '`var` is older and JavaScript is more forgiving about it'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-scope-completion' AND q.external_ref = 'hoisting-tdz-explain-01'
   AND o.option_text = 'Because `var` is older and JavaScript is more forgiving about it';
UPDATE question_options SET option_text = 'both exist from the start; only `let` refuses to be read'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-scope-completion' AND external_ref = 'hoisting-tdz-explain-01');
UPDATE question_options o SET option_text = 'the outer function keeps running quietly in the background'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-scope-completion' AND q.external_ref = 'closures-explain-01'
   AND o.option_text = 'Because the outer function keeps running quietly in the background';
UPDATE question_options o SET option_text = 'the value was copied into the inner function when it was made'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-scope-completion' AND q.external_ref = 'closures-explain-01'
   AND o.option_text = 'Because the value was copied into the inner function when it was made';
UPDATE question_options o SET option_text = '`return` keeps the outer function''s variables alive for one more call'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-scope-completion' AND q.external_ref = 'closures-explain-01'
   AND o.option_text = 'Because `return` keeps the outer function''s variables alive for one more call';
UPDATE question_options SET option_text = 'it captured the variable itself, not a copy of its value'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-scope-completion' AND external_ref = 'closures-explain-01');
UPDATE question_options o SET option_text = '`let` copies the value into the function as it is created'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-scope-completion' AND q.external_ref = 'loop-variable-capture-explain-01'
   AND o.option_text = 'Because `let` copies the value into the function as it is created';
UPDATE question_options o SET option_text = '`let` stops the loop variable from changing'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-scope-completion' AND q.external_ref = 'loop-variable-capture-explain-01'
   AND o.option_text = 'Because `let` stops the loop variable from changing';
UPDATE question_options o SET option_text = 'a `var` is reassigned once more after the loop ends'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-scope-completion' AND q.external_ref = 'loop-variable-capture-explain-01'
   AND o.option_text = 'Because a `var` is reassigned once more after the loop ends';
UPDATE question_options SET option_text = '`let` gives each pass its own binding; `var` gives one'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-scope-completion' AND external_ref = 'loop-variable-capture-explain-01');
UPDATE question_options SET option_text = 'Copy it: `let copy = [...original];`'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-arrays-completion' AND external_ref = 'array-mutation-repair-01');
UPDATE question_options o SET option_text = 'arrays are always mutable and const only applies to numbers'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-arrays-completion' AND q.external_ref = 'array-mutation-explain-01'
   AND o.option_text = 'Because arrays are always mutable and const only applies to numbers';
UPDATE question_options o SET option_text = 'push is allowed to bypass const'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-arrays-completion' AND q.external_ref = 'array-mutation-explain-01'
   AND o.option_text = 'Because push is allowed to bypass const';
UPDATE question_options o SET option_text = 'const only takes effect once the array has items in it'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-arrays-completion' AND q.external_ref = 'array-mutation-explain-01'
   AND o.option_text = 'Because const only takes effect once the array has items in it';
UPDATE question_options SET option_text = 'const fixes the name, not the contents'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-arrays-completion' AND external_ref = 'array-mutation-explain-01');
UPDATE question_options o SET option_text = 'it copies only the first item'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-arrays-completion' AND q.external_ref = 'array-copy-spread-explain-01'
   AND o.option_text = 'Because it copies only the first item';
UPDATE question_options o SET option_text = 'it copies the items but not the length'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-arrays-completion' AND q.external_ref = 'array-copy-spread-explain-01'
   AND o.option_text = 'Because it copies the items but not the length';
UPDATE question_options o SET option_text = 'the copy can be read but not changed'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-arrays-completion' AND q.external_ref = 'array-copy-spread-explain-01'
   AND o.option_text = 'Because the copy can be read but not changed';
UPDATE question_options SET option_text = 'only the outer list is copied'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-arrays-completion' AND external_ref = 'array-copy-spread-explain-01');
UPDATE question_options o SET option_text = 'arrays can never be compared with ==='
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-arrays-completion' AND q.external_ref = 'array-reference-identity-explain-01'
   AND o.option_text = 'Because arrays can never be compared with ===';
UPDATE question_options o SET option_text = 'the items are compared one at a time and that always fails'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-arrays-completion' AND q.external_ref = 'array-reference-identity-explain-01'
   AND o.option_text = 'Because the items are compared one at a time and that always fails';
UPDATE question_options o SET option_text = 'the comparison checks the length first and then gives up'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-arrays-completion' AND q.external_ref = 'array-reference-identity-explain-01'
   AND o.option_text = 'Because the comparison checks the length first and then gives up';
UPDATE question_options SET option_text = 'it asks if they are the same list, not if they match'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-arrays-completion' AND external_ref = 'array-reference-identity-explain-01');
UPDATE question_options SET option_text = 'Remove the braces so the arrow returns'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-array-methods-completion' AND external_ref = 'map-repair-01');
UPDATE question_options o SET option_text = 'forEach must always be the last method in a chain'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-array-methods-completion' AND q.external_ref = 'for-each-explain-01'
   AND o.option_text = 'Because forEach must always be the last method in a chain';
UPDATE question_options o SET option_text = 'forEach changes the original list and chaining needs a copy'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-array-methods-completion' AND q.external_ref = 'for-each-explain-01'
   AND o.option_text = 'Because forEach changes the original list and chaining needs a copy';
UPDATE question_options o SET option_text = 'forEach finishes after the rest of the chain has run'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-array-methods-completion' AND q.external_ref = 'for-each-explain-01'
   AND o.option_text = 'Because forEach finishes after the rest of the chain has run';
UPDATE question_options SET option_text = 'it hands back undefined, so there is nothing to chain'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-array-methods-completion' AND external_ref = 'for-each-explain-01');
UPDATE question_options o SET option_text = 'an empty list counts as holding one invisible item'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-array-methods-completion' AND q.external_ref = 'find-some-every-explain-01'
   AND o.option_text = 'Because an empty list counts as holding one invisible item';
UPDATE question_options o SET option_text = 'every returns true whenever nothing could be tested'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-array-methods-completion' AND q.external_ref = 'find-some-every-explain-01'
   AND o.option_text = 'Because every returns true whenever nothing could be tested';
UPDATE question_options o SET option_text = 'an empty list is itself truthy'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-array-methods-completion' AND q.external_ref = 'find-some-every-explain-01'
   AND o.option_text = 'Because an empty list is itself truthy';
UPDATE question_options SET option_text = 'no item fails the test, which is all it checks'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-array-methods-completion' AND external_ref = 'find-some-every-explain-01');
UPDATE question_options o SET option_text = 'the starting value tells reduce how many items to expect'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-array-methods-completion' AND q.external_ref = 'reduce-explain-01'
   AND o.option_text = 'Because the starting value tells reduce how many items to expect';
UPDATE question_options o SET option_text = 'an empty list would otherwise return an empty list'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-array-methods-completion' AND q.external_ref = 'reduce-explain-01'
   AND o.option_text = 'Because an empty list would otherwise return an empty list';
UPDATE question_options o SET option_text = 'the starting value is what reduce compares each item against'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-array-methods-completion' AND q.external_ref = 'reduce-explain-01'
   AND o.option_text = 'Because the starting value is what reduce compares each item against';
UPDATE question_options SET option_text = 'with no items and no starting value, there is no answer'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-array-methods-completion' AND external_ref = 'reduce-explain-01');
UPDATE question_options SET option_text = 'Pass a comparator: (a, b) => a - b'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-array-methods-completion' AND external_ref = 'sort-repair-01');
UPDATE question_options o SET option_text = 'a copy would lose the comparator'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-array-methods-completion' AND q.external_ref = 'sort-explain-01'
   AND o.option_text = 'Because a copy would lose the comparator';
UPDATE question_options o SET option_text = 'sort returns a new list and the old one is thrown away'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-array-methods-completion' AND q.external_ref = 'sort-explain-01'
   AND o.option_text = 'Because sort returns a new list and the old one is thrown away';
UPDATE question_options o SET option_text = 'the comparator is allowed to change the items'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-array-methods-completion' AND q.external_ref = 'sort-explain-01'
   AND o.option_text = 'Because the comparator is allowed to change the items';
UPDATE question_options SET option_text = 'it rearranges the list it was called on'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-array-methods-completion' AND external_ref = 'sort-explain-01');
UPDATE question_options o SET option_text = 'it stops at the first item that is not a list'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-array-methods-completion' AND q.external_ref = 'flat-explain-01'
   AND o.option_text = 'Because it stops at the first item that is not a list';
UPDATE question_options o SET option_text = 'the deepest level is always kept'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-array-methods-completion' AND q.external_ref = 'flat-explain-01'
   AND o.option_text = 'Because the deepest level is always kept';
UPDATE question_options o SET option_text = 'it only flattens lists holding numbers'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-array-methods-completion' AND q.external_ref = 'flat-explain-01'
   AND o.option_text = 'Because it only flattens lists holding numbers';
UPDATE question_options SET option_text = 'it lifts one level unless told otherwise'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-array-methods-completion' AND external_ref = 'flat-explain-01');
UPDATE question_options o SET option_text = '.c is only reached when .b succeeds, by coincidence'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-objects-completion' AND q.external_ref = 'optional-chaining-explain-01'
   AND o.option_text = 'Because .c is only reached when .b succeeds, by coincidence';
UPDATE question_options o SET option_text = 'undefined quietly answers any property with undefined'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-objects-completion' AND q.external_ref = 'optional-chaining-explain-01'
   AND o.option_text = 'Because undefined quietly answers any property with undefined';
UPDATE question_options o SET option_text = 'the chain is read from right to left'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-objects-completion' AND q.external_ref = 'optional-chaining-explain-01'
   AND o.option_text = 'Because the chain is read from right to left';
UPDATE question_options SET option_text = 'it stops the whole chain, not just that step'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-objects-completion' AND external_ref = 'optional-chaining-explain-01');
UPDATE question_options SET option_text = 'Copy it: `let copy = { ...settings };`'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-objects-completion' AND external_ref = 'object-references-repair-01');
UPDATE question_options o SET option_text = 'objects are too large to copy automatically'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-objects-completion' AND q.external_ref = 'object-references-explain-01'
   AND o.option_text = 'Because objects are too large to copy automatically';
UPDATE question_options o SET option_text = 'only arrays are copied when assigned'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-objects-completion' AND q.external_ref = 'object-references-explain-01'
   AND o.option_text = 'Because only arrays are copied when assigned';
UPDATE question_options o SET option_text = 'the copy happens later, when a property is first changed'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-objects-completion' AND q.external_ref = 'object-references-explain-01'
   AND o.option_text = 'Because the copy happens later, when a property is first changed';
UPDATE question_options SET option_text = 'the name holds a reference, and that is what is copied'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-objects-completion' AND external_ref = 'object-references-explain-01');
UPDATE question_options o SET option_text = 'catch has not finished handling the error until finally runs'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-errors-completion' AND q.external_ref = 'try-catch-explain-01'
   AND o.option_text = 'Because catch has not finished handling the error until finally runs';
UPDATE question_options o SET option_text = 'finally always runs before catch'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-errors-completion' AND q.external_ref = 'try-catch-explain-01'
   AND o.option_text = 'Because finally always runs before catch';
UPDATE question_options o SET option_text = 'the error is thrown again unless finally stops it'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-errors-completion' AND q.external_ref = 'try-catch-explain-01'
   AND o.option_text = 'Because the error is thrown again unless finally stops it';
UPDATE question_options SET option_text = 'finally is for work that must happen either way'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-errors-completion' AND external_ref = 'try-catch-explain-01');
UPDATE question_options o SET option_text = 'the top line is the first function the program ran'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-errors-completion' AND q.external_ref = 'stack-traces-explain-01'
   AND o.option_text = 'Because the top line is the first function the program ran';
UPDATE question_options o SET option_text = 'the most recently written code is the most likely to be wrong'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-errors-completion' AND q.external_ref = 'stack-traces-explain-01'
   AND o.option_text = 'Because the most recently written code is the most likely to be wrong';
UPDATE question_options o SET option_text = 'the lines below it belong to the language rather than to your program'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-errors-completion' AND q.external_ref = 'stack-traces-explain-01'
   AND o.option_text = 'Because the lines below it belong to the language rather than to your program';
UPDATE question_options SET option_text = 'it is where execution actually was when it failed'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-errors-completion' AND external_ref = 'stack-traces-explain-01');
UPDATE question_options SET option_text = 'Make one change that tests the hypothesis'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-errors-completion' AND external_ref = 'debugging-strategy-repair-01');
UPDATE question_options o SET option_text = 'several changes take longer to type'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-errors-completion' AND q.external_ref = 'debugging-strategy-explain-01'
   AND o.option_text = 'Because several changes take longer to type';
UPDATE question_options o SET option_text = 'JavaScript only applies the first change it finds'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-errors-completion' AND q.external_ref = 'debugging-strategy-explain-01'
   AND o.option_text = 'Because JavaScript only applies the first change it finds';
UPDATE question_options o SET option_text = 'the computer checks changes in the order they were made'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-errors-completion' AND q.external_ref = 'debugging-strategy-explain-01'
   AND o.option_text = 'Because the computer checks changes in the order they were made';
UPDATE question_options SET option_text = 'each run answers one question, ruling something out'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-errors-completion' AND external_ref = 'debugging-strategy-explain-01');
UPDATE question_options o SET option_text = 'the browser re-reads the HTML file after every change'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-dom-completion' AND q.external_ref = 'element-properties-explain-01'
   AND o.option_text = 'Because the browser re-reads the HTML file after every change';
UPDATE question_options o SET option_text = 'textContent is written back to the HTML automatically'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-dom-completion' AND q.external_ref = 'element-properties-explain-01'
   AND o.option_text = 'Because textContent is written back to the HTML automatically';
UPDATE question_options o SET option_text = 'querySelector returns a copy that is kept in step'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-dom-completion' AND q.external_ref = 'element-properties-explain-01'
   AND o.option_text = 'Because querySelector returns a copy that is kept in step';
UPDATE question_options SET option_text = 'the element you hold is the page, not a copy'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-dom-completion' AND external_ref = 'element-properties-explain-01');
UPDATE question_options o SET option_text = 'the parent''s listener is copied onto each of its children'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-dom-completion' AND q.external_ref = 'event-order-explain-01'
   AND o.option_text = 'Because the parent''s listener is copied onto each of its children';
UPDATE question_options o SET option_text = 'clicking a child counts as clicking the parent as well'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-dom-completion' AND q.external_ref = 'event-order-explain-01'
   AND o.option_text = 'Because clicking a child counts as clicking the parent as well';
UPDATE question_options o SET option_text = 'listeners always run in the order they were added'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-dom-completion' AND q.external_ref = 'event-order-explain-01'
   AND o.option_text = 'Because listeners always run in the order they were added';
UPDATE question_options SET option_text = 'the event travels back up through the ancestors'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-dom-completion' AND external_ref = 'event-order-explain-01');
UPDATE question_options o SET option_text = 'each element holds a list of every other element'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-dom-completion' AND q.external_ref = 'dom-as-tree-explain-01'
   AND o.option_text = 'Because each element holds a list of every other element';
UPDATE question_options o SET option_text = 'document.querySelector can be called on any element'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-dom-completion' AND q.external_ref = 'dom-as-tree-explain-01'
   AND o.option_text = 'Because document.querySelector can be called on any element';
UPDATE question_options o SET option_text = 'the elements are really stored in one flat list'
  FROM questions q WHERE q.id = o.question_id
   AND q.source = 'jolt-dom-completion' AND q.external_ref = 'dom-as-tree-explain-01'
   AND o.option_text = 'Because the elements are really stored in one flat list';
UPDATE question_options SET option_text = 'every element knows its parent and its children'
  WHERE is_correct AND is_active AND question_id =
        (SELECT id FROM questions WHERE source = 'jolt-dom-completion' AND external_ref = 'dom-as-tree-explain-01');
COMMIT;
