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

BEGIN;

UPDATE question_options SET option_text = '14 is the correct total of those three numbers' WHERE id = 1280;
UPDATE question_options SET option_text = 'console.log reads the numbers from right to left' WHERE id = 1281;
UPDATE question_options SET option_text = 'addition is always worked out last in JavaScript' WHERE id = 1282;
UPDATE question_options SET option_text = 'multiplication is worked out before addition'
  WHERE question_id = 312 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'console.log adds up any numbers it is given' WHERE id = 1288;
UPDATE question_options SET option_text = 'javaScript never displays mathematical symbols' WHERE id = 1289;
UPDATE question_options SET option_text = '10 is shorter to display than 5 + 5' WHERE id = 1290;
UPDATE question_options SET option_text = 'the expression is replaced by its value first'
  WHERE question_id = 314 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'null is older than undefined' WHERE id = 1308;
UPDATE question_options SET option_text = 'only one of them can be displayed' WHERE id = 1309;
UPDATE question_options SET option_text = 'they report the same type as each other' WHERE id = 1310;
UPDATE question_options SET option_text = 'null is chosen on purpose; undefined is not'
  WHERE question_id = 319 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'subtraction is always worked out before addition' WHERE id = 1328;
UPDATE question_options SET option_text = '"5" is really a number and the quotes are ignored' WHERE id = 1329;
UPDATE question_options SET option_text = 'javaScript rounds the result of subtraction' WHERE id = 1330;
UPDATE question_options SET option_text = '`+` can join text, so it does; `-` can only subtract'
  WHERE question_id = 324 AND is_correct AND is_active;
UPDATE question_options SET option_text = '`===` is stricter about whitespace inside the quotes' WHERE id = 1332;
UPDATE question_options SET option_text = '`==` is older and has a bug that was never fixed' WHERE id = 1333;
UPDATE question_options SET option_text = '`===` compares how the values are stored in memory' WHERE id = 1334;
UPDATE question_options SET option_text = '`==` converts the types first; `===` compares them too'
  WHERE question_id = 325 AND is_correct AND is_active;
UPDATE question_options SET option_text = '`&&` only ever reads the value on its left' WHERE id = 1340;
UPDATE question_options SET option_text = 'false is treated as the end of the line' WHERE id = 1341;
UPDATE question_options SET option_text = 'the second value has not been declared yet' WHERE id = 1342;
UPDATE question_options SET option_text = 'a false on the left settles `&&`, so it stops there'
  WHERE question_id = 327 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'text is always truthy, empty or not' WHERE id = 1352;
UPDATE question_options SET option_text = 'the word false is spelled correctly inside the quotes' WHERE id = 1353;
UPDATE question_options SET option_text = 'only numbers can be falsy' WHERE id = 1354;
UPDATE question_options SET option_text = 'any non-empty piece of text is truthy'
  WHERE question_id = 330 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'Move the fuel check out of the docked if'
  WHERE question_id = 339 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'Store it: name = name.toUpperCase();'
  WHERE question_id = 356 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'while loops have no built-in limit on the number of passes' WHERE id = 1476;
UPDATE question_options SET option_text = 'the condition is only checked once, at the start' WHERE id = 1477;
UPDATE question_options SET option_text = 'a while loop has no step of its own' WHERE id = 1478;
UPDATE question_options SET option_text = 'nothing inside the loop changes the condition'
  WHERE question_id = 361 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'a loop is not allowed to finish after an if has run' WHERE id = 1500;
UPDATE question_options SET option_text = 'break makes the loop condition false' WHERE id = 1501;
UPDATE question_options SET option_text = 'the loop would otherwise never stop' WHERE id = 1502;
UPDATE question_options SET option_text = 'the remaining passes cannot change the answer'
  WHERE question_id = 367 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'console.log sends its value somewhere that cannot be read back' WHERE id = 1540;
UPDATE question_options SET option_text = 'printing happens after the function has finished' WHERE id = 1541;
UPDATE question_options SET option_text = 'a variable can only hold what a function returns' WHERE id = 1542;
UPDATE question_options SET option_text = 'the call becomes whatever was returned'
  WHERE question_id = 377 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'an if without an else is faster to run' WHERE id = 1548;
UPDATE question_options SET option_text = 'else may only be used once in a function' WHERE id = 1549;
UPDATE question_options SET option_text = 'the guard changes the condition for the rest of the function' WHERE id = 1550;
UPDATE question_options SET option_text = 'the return ends it, so what follows is the other case'
  WHERE question_id = 379 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'functions are always run last in JavaScript' WHERE id = 1568;
UPDATE question_options SET option_text = 'the function is copied into the other function' WHERE id = 1569;
UPDATE question_options SET option_text = 'a function cannot run until it has been stored somewhere' WHERE id = 1570;
UPDATE question_options SET option_text = 'the braces hide it from the lines above them' WHERE id = 1580;
UPDATE question_options SET option_text = '`let` may only be read once after it is set' WHERE id = 1581;
UPDATE question_options SET option_text = 'a variable is removed as soon as it has been used' WHERE id = 1582;
UPDATE question_options SET option_text = 'the block is the variable''s whole lifetime'
  WHERE question_id = 387 AND is_correct AND is_active;
UPDATE question_options SET option_text = '`let` is not hoisted and `var` is' WHERE id = 1592;
UPDATE question_options SET option_text = '`undefined` is simply what any unset variable holds' WHERE id = 1593;
UPDATE question_options SET option_text = '`var` is older and JavaScript is more forgiving about it' WHERE id = 1594;
UPDATE question_options SET option_text = 'both exist from the start; only `let` refuses to be read'
  WHERE question_id = 390 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'the outer function keeps running quietly in the background' WHERE id = 1612;
UPDATE question_options SET option_text = 'the value was copied into the inner function when it was made' WHERE id = 1613;
UPDATE question_options SET option_text = '`return` keeps the outer function''s variables alive for one more call' WHERE id = 1614;
UPDATE question_options SET option_text = 'it captured the variable itself, not a copy of its value'
  WHERE question_id = 395 AND is_correct AND is_active;
UPDATE question_options SET option_text = '`let` copies the value into the function as it is created' WHERE id = 1628;
UPDATE question_options SET option_text = '`let` stops the loop variable from changing' WHERE id = 1629;
UPDATE question_options SET option_text = 'a `var` is reassigned once more after the loop ends' WHERE id = 1630;
UPDATE question_options SET option_text = '`let` gives each pass its own binding; `var` gives one'
  WHERE question_id = 399 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'Copy it: `let copy = [...original];`'
  WHERE question_id = 406 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'arrays are always mutable and const only applies to numbers' WHERE id = 1660;
UPDATE question_options SET option_text = 'push is allowed to bypass const' WHERE id = 1661;
UPDATE question_options SET option_text = 'const only takes effect once the array has items in it' WHERE id = 1662;
UPDATE question_options SET option_text = 'const fixes the name, not the contents'
  WHERE question_id = 407 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'it copies only the first item' WHERE id = 1668;
UPDATE question_options SET option_text = 'it copies the items but not the length' WHERE id = 1669;
UPDATE question_options SET option_text = 'the copy can be read but not changed' WHERE id = 1670;
UPDATE question_options SET option_text = 'only the outer list is copied'
  WHERE question_id = 409 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'arrays can never be compared with ===' WHERE id = 1688;
UPDATE question_options SET option_text = 'the items are compared one at a time and that always fails' WHERE id = 1689;
UPDATE question_options SET option_text = 'the comparison checks the length first and then gives up' WHERE id = 1690;
UPDATE question_options SET option_text = 'it asks if they are the same list, not if they match'
  WHERE question_id = 414 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'Remove the braces so the arrow returns'
  WHERE question_id = 419 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'forEach must always be the last method in a chain' WHERE id = 1724;
UPDATE question_options SET option_text = 'forEach changes the original list and chaining needs a copy' WHERE id = 1725;
UPDATE question_options SET option_text = 'forEach finishes after the rest of the chain has run' WHERE id = 1726;
UPDATE question_options SET option_text = 'it hands back undefined, so there is nothing to chain'
  WHERE question_id = 423 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'an empty list counts as holding one invisible item' WHERE id = 1748;
UPDATE question_options SET option_text = 'every returns true whenever nothing could be tested' WHERE id = 1749;
UPDATE question_options SET option_text = 'an empty list is itself truthy' WHERE id = 1750;
UPDATE question_options SET option_text = 'no item fails the test, which is all it checks'
  WHERE question_id = 429 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'the starting value tells reduce how many items to expect' WHERE id = 1760;
UPDATE question_options SET option_text = 'an empty list would otherwise return an empty list' WHERE id = 1761;
UPDATE question_options SET option_text = 'the starting value is what reduce compares each item against' WHERE id = 1762;
UPDATE question_options SET option_text = 'with no items and no starting value, there is no answer'
  WHERE question_id = 432 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'Pass a comparator: (a, b) => a - b'
  WHERE question_id = 435 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'a copy would lose the comparator' WHERE id = 1776;
UPDATE question_options SET option_text = 'sort returns a new list and the old one is thrown away' WHERE id = 1777;
UPDATE question_options SET option_text = 'the comparator is allowed to change the items' WHERE id = 1778;
UPDATE question_options SET option_text = 'it rearranges the list it was called on'
  WHERE question_id = 436 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'it stops at the first item that is not a list' WHERE id = 1784;
UPDATE question_options SET option_text = 'the deepest level is always kept' WHERE id = 1785;
UPDATE question_options SET option_text = 'it only flattens lists holding numbers' WHERE id = 1786;
UPDATE question_options SET option_text = 'it lifts one level unless told otherwise'
  WHERE question_id = 438 AND is_correct AND is_active;
UPDATE question_options SET option_text = '.c is only reached when .b succeeds, by coincidence' WHERE id = 1836;
UPDATE question_options SET option_text = 'undefined quietly answers any property with undefined' WHERE id = 1837;
UPDATE question_options SET option_text = 'the chain is read from right to left' WHERE id = 1838;
UPDATE question_options SET option_text = 'it stops the whole chain, not just that step'
  WHERE question_id = 451 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'Copy it: `let copy = { ...settings };`'
  WHERE question_id = 456 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'objects are too large to copy automatically' WHERE id = 1860;
UPDATE question_options SET option_text = 'only arrays are copied when assigned' WHERE id = 1861;
UPDATE question_options SET option_text = 'the copy happens later, when a property is first changed' WHERE id = 1862;
UPDATE question_options SET option_text = 'the name holds a reference, and that is what is copied'
  WHERE question_id = 457 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'catch has not finished handling the error until finally runs' WHERE id = 1904;
UPDATE question_options SET option_text = 'finally always runs before catch' WHERE id = 1905;
UPDATE question_options SET option_text = 'the error is thrown again unless finally stops it' WHERE id = 1906;
UPDATE question_options SET option_text = 'finally is for work that must happen either way'
  WHERE question_id = 468 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'the top line is the first function the program ran' WHERE id = 1916;
UPDATE question_options SET option_text = 'the most recently written code is the most likely to be wrong' WHERE id = 1917;
UPDATE question_options SET option_text = 'the lines below it belong to the language rather than to your program' WHERE id = 1918;
UPDATE question_options SET option_text = 'it is where execution actually was when it failed'
  WHERE question_id = 471 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'Make one change that tests the hypothesis'
  WHERE question_id = 473 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'several changes take longer to type' WHERE id = 1928;
UPDATE question_options SET option_text = 'javaScript only applies the first change it finds' WHERE id = 1929;
UPDATE question_options SET option_text = 'the computer checks changes in the order they were made' WHERE id = 1930;
UPDATE question_options SET option_text = 'each run answers one question, ruling something out'
  WHERE question_id = 474 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'the browser re-reads the HTML file after every change' WHERE id = 1944;
UPDATE question_options SET option_text = 'textContent is written back to the HTML automatically' WHERE id = 1945;
UPDATE question_options SET option_text = 'querySelector returns a copy that is kept in step' WHERE id = 1946;
UPDATE question_options SET option_text = 'the element you hold is the page, not a copy'
  WHERE question_id = 478 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'the parent''s listener is copied onto each of its children' WHERE id = 1964;
UPDATE question_options SET option_text = 'clicking a child counts as clicking the parent as well' WHERE id = 1965;
UPDATE question_options SET option_text = 'listeners always run in the order they were added' WHERE id = 1966;
UPDATE question_options SET option_text = 'the event travels back up through the ancestors'
  WHERE question_id = 483 AND is_correct AND is_active;
UPDATE question_options SET option_text = 'each element holds a list of every other element' WHERE id = 1972;
UPDATE question_options SET option_text = 'document.querySelector can be called on any element' WHERE id = 1973;
UPDATE question_options SET option_text = 'the elements are really stored in one flat list' WHERE id = 1974;
UPDATE question_options SET option_text = 'every element knows its parent and its children'
  WHERE question_id = 485 AND is_correct AND is_active;
COMMIT;
