-- Pacing tiers for the Values and Variables questions.
--
-- THE DEFECT THIS FIXES. questions.difficulty is Code Blitz's PACING ramp --
-- which slot of the curve a question fills, and how much clock it carries. It
-- was never authored per question: every content seed wrote one constant for
-- the whole file, so jolt-values-practice is all 1, jolt-strings-completion
-- all 2, and every seed from loops onward all 3. Retiring the untagged bank in
-- seed 079 removed the only content with a real spread, and a beginner's
-- entire reachable pool became 70 questions at tier 1 and one at tier 2.
--
-- difficultyCurve then asks each of the ten slots for a tier, nearestTier
-- collapses every one of them onto 1, and the round the entrance promises --
-- `difficulty climbs` -- is flat. journey.test.ts has been failing on exactly
-- that, and is meant to: the curve is wrong, not the assertion.
--
-- THREE NUMBERS, STILL THREE MEANINGS. Nothing here touches the other two.
--
--   questions.difficulty    Code Blitz pacing. This column, and only this one.
--   challenges.difficulty   the learning frontier, f(tier, demand), read by
--                           withinFrontier. Untouched.
--   demands.display_order   what kind of thinking the rung asks for. Untouched.
--
-- A higher pacing tier does not widen eligibility: no selection predicate
-- reads this column. It changes which slot a question can fill, nothing else.
--
-- TIERED BY COGNITIVE DEMAND, ONE QUESTION AT A TIME, not by demand label and
-- not by counting lines. Both shortcuts were tried against the content and
-- both misplaced questions:
--
--   1  the answer is visible, or one substitution away. No state to carry.
--   2  carry a value through one change, chain two operations, or make a type
--      discrimination.
--   3  the answer is not in the code -- find where it departs from intent,
--      track several names at once, or state a mechanism.
--
-- The four explain questions SPLIT 2/2 under that reading, which is the
-- clearest case against the formula. q312 and q314 name a single evaluation
-- rule the learner has just computed, so they sit at 2; q319 and q486 ask for
-- intent and for the binding-versus-value distinction, so they sit at 3.
-- Assigning explain -> 3 wholesale would have put two of the gentlest
-- questions in Values into the hardest slots of a beginner's first round.
--
-- TIER 4 IS RESERVED. Nothing in the beginner topics earns it.
--
-- THREE QUESTIONS ARE DELIBERATELY ABSENT. q1, q8 and q73 carry
-- source = 'internal': they are legacy rows that seed 077 tagged, not authored
-- content. frontier.test.ts guarantees that no pre-existing legacy question's
-- pacing difficulty has moved, scoped to sources that are not jolt-%, and
-- re-tiering them would break that guarantee for a cosmetic gain. They stay
-- where they are. The resulting spread is 40 / 20 / 11 rather than the
-- 38 / 22 / 11 the audit proposed before that exclusion was applied.
--
-- VALUES AND VARIABLES ONLY. Operators and Strings have the same flaw and are
-- deliberately out of scope.
--
-- CONVERGENT. Every statement writes a constant to rows matched by prompt, so
-- a second run selects the same rows and writes the same values. Nothing is
-- inserted, so nothing can duplicate.

BEGIN;

/* ── tier 2 ─────────────────────────────────────────────────────────── */

-- q302 · arithmetic-operators · predict · 1 -> 2
-- precedence: two steps, with 20 a live wrong answer
UPDATE questions SET difficulty = 2, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'What does this log?\n\nconsole.log(2 + 3 * 4);'
   AND difficulty <> 2;

-- q303 · arithmetic-operators · predict · 1 -> 2
-- precedence, brackets first
UPDATE questions SET difficulty = 2, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'What does this log?\n\nconsole.log((2 + 3) * 4);'
   AND difficulty <> 2;

-- q306 · arithmetic-operators · predict · 1 -> 2
-- same precedence, left to right
UPDATE questions SET difficulty = 2, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'What does this log?\n\nconsole.log(6 / 2 * 3);'
   AND difficulty <> 2;

-- q307 · arithmetic-operators · predict · 1 -> 2
-- two operations chained
UPDATE questions SET difficulty = 2, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'What does this log?\n\nconsole.log(5 + 5 - 4);'
   AND difficulty <> 2;

-- q312 · arithmetic-operators · explain · 1 -> 2
-- one rule, named rather than computed
UPDATE questions SET difficulty = 2, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'Why does console.log(2 + 3 * 4) display 14?'
   AND difficulty <> 2;

-- q269 · expressions-produce-values · predict · 1 -> 2
-- two operations chained
UPDATE questions SET difficulty = 2, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'What does this log?\n\nconsole.log(4 + 5 - 3);'
   AND difficulty <> 2;

-- q270 · expressions-produce-values · predict · 1 -> 2
-- two operations chained
UPDATE questions SET difficulty = 2, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'What does this log?\n\nconsole.log(2 * 2 * 2);'
   AND difficulty <> 2;

-- q314 · expressions-produce-values · explain · 1 -> 2
-- one rule, named rather than computed
UPDATE questions SET difficulty = 2, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'Why does console.log(5 + 5) display 10 rather than 5 + 5?'
   AND difficulty <> 2;

-- q281 · variables-name-values · predict · 1 -> 2
-- the value travels through an intermediate name
UPDATE questions SET difficulty = 2, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'What does this log?\n\nlet port = "Mars";\nlet home = port;\nconsole.log(home);'
   AND difficulty <> 2;

-- q283 · declaration · predict · 1 -> 2
-- the value travels through an intermediate name
UPDATE questions SET difficulty = 2, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'What does this log?\n\nlet cargo = 12;\nlet cargo2 = cargo;\nconsole.log(cargo2);'
   AND difficulty <> 2;

-- q284 · declaration · predict · 1 -> 2
-- the value travels through an intermediate name
UPDATE questions SET difficulty = 2, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'What does this log?\n\nlet ship = "Aurora";\nlet backup = ship;\nconsole.log(backup);'
   AND difficulty <> 2;

-- q277 · assignment · predict · 1 -> 2
-- reassignment that reads its own current value
UPDATE questions SET difficulty = 2, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'What does this log?\n\nlet total = 5;\ntotal = total + 3;\nconsole.log(total);'
   AND difficulty <> 2;

-- q278 · assignment · predict · 1 -> 2
-- reassignment that reads its own current value
UPDATE questions SET difficulty = 2, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'What does this log?\n\nlet count = 2;\ncount = count * 3;\nconsole.log(count);'
   AND difficulty <> 2;

-- q273 · reading-variables · predict · 1 -> 2
-- the value travels through an intermediate name
UPDATE questions SET difficulty = 2, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'What does this log?\n\nlet a = 5;\nlet b = a;\nconsole.log(b);'
   AND difficulty <> 2;

-- q274 · reassignment · predict · 1 -> 2
-- a value traced across a reassignment
UPDATE questions SET difficulty = 2, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'What does this log?\n\nlet score = 10;\nscore = 20;\nconsole.log(score);'
   AND difficulty <> 2;

-- q275 · reassignment · predict · 1 -> 2
-- a value traced across a reassignment
UPDATE questions SET difficulty = 2, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'What does this log?\n\nlet fuel = 100;\nfuel = 80;\nconsole.log(fuel);'
   AND difficulty <> 2;

-- q276 · reassignment · predict · 1 -> 2
-- a value traced across a reassignment
UPDATE questions SET difficulty = 2, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'What does this log?\n\nlet city = "Lagos";\ncity = "Accra";\nconsole.log(city);'
   AND difficulty <> 2;

-- q286 · let-vs-const · predict · 1 -> 2
-- const plus a trace to an error
UPDATE questions SET difficulty = 2, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'What happens when this runs?\n\nconst total = 10;\ntotal = total + 1;\nconsole.log(total);'
   AND difficulty <> 2;

-- q287 · let-vs-const · predict · 1 -> 2
-- const plus a trace to an error
UPDATE questions SET difficulty = 2, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'What happens when this runs?\n\nconst crew = 5;\ncrew = 6;\nconsole.log(crew);'
   AND difficulty <> 2;

-- q288 · let-vs-const · predict · 1 -> 2
-- four lines, two names, a const decoy and a reassignment
UPDATE questions SET difficulty = 2, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'What does this log?\n\nlet seats = 4;\nconst rows = 2;\nseats = 6;\nconsole.log(seats);'
   AND difficulty <> 2;

/* ── tier 3 ─────────────────────────────────────────────────────────── */

-- q529 · console-output · diagnose · 1 -> 3
-- symptom to line; a bracket-less call runs silently
UPDATE questions SET difficulty = 3, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'This is meant to print 1, then 2, then 3. It prints 1, then 3. Which line is the cause?\n\nconsole.log(1);\nconsole.log;\nconsole.log(3);'
   AND difficulty <> 3;

-- q530 · expressions-produce-values · diagnose · 1 -> 3
-- the quoted expression never collapses
UPDATE questions SET difficulty = 3, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'Both lines are meant to print 10. The first does, and the second prints 5 + 5. Which line is the cause?\n\nconsole.log(2 + 8);\nconsole.log("5 + 5");'
   AND difficulty <> 3;

-- q531 · assignment · diagnose · 1 -> 3
-- the fault is a MISSING store, not a wrong one
UPDATE questions SET difficulty = 3, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'count is meant to end at 3 and ends at 1. Which line is the cause?\n\nlet count = 1;\ncount + 2;\nconsole.log(count);'
   AND difficulty <> 3;

-- q532 · reading-variables · diagnose · 1 -> 3
-- the cause is the copy, not the later change
UPDATE questions SET difficulty = 3, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'b is meant to follow a, and prints 5 after a has changed to 9. Which line is the cause?\n\nlet a = 5;\nlet b = a;\na = 9;\nconsole.log(b);'
   AND difficulty <> 3;

-- q533 · reassignment · diagnose · 1 -> 3
-- the fault is ordering, not any line's content
UPDATE questions SET difficulty = 3, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'fuel is meant to print 80 and prints 100. Which line is the cause?\n\nlet fuel = 100;\nconsole.log(fuel);\nfuel = 80;'
   AND difficulty <> 3;

-- q534 · let-vs-const · diagnose · 1 -> 3
-- the error throws on line 3; the cause is line 1
UPDATE questions SET difficulty = 3, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'This stops with an error on the third line. Which line is the cause?\n\nconst score = 0;\nconsole.log(score);\nscore = 10;'
   AND difficulty <> 3;

-- q319 · null-vs-undefined · explain · 1 -> 3
-- intent, not mechanism -- the most abstract idea in Values
UPDATE questions SET difficulty = 3, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'Why are null and undefined not interchangeable?'
   AND difficulty <> 3;

-- q486 · let-vs-const · explain · 2 -> 3
-- binding versus value, the subtlest distinction in Variables
UPDATE questions SET difficulty = 3, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'Why does `const total = 10; total = total + 1;` fail, when the same lines with `let` do not?'
   AND difficulty <> 3;

-- q289 · variable-state · predict · 1 -> 3
-- two names, a reassignment, then arithmetic on both
UPDATE questions SET difficulty = 3, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'What does this log?\n\nlet fuel = 100;\nlet spare = 40;\nfuel = 60;\nconsole.log(fuel + spare);'
   AND difficulty <> 3;

-- q290 · variable-state · predict · 1 -> 3
-- a copy, then the source changes
UPDATE questions SET difficulty = 3, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'What does this log?\n\nlet a = 2;\nlet b = a;\na = 9;\nconsole.log(b);'
   AND difficulty <> 3;

-- q291 · variable-state · predict · 1 -> 3
-- two names, a reassignment, then a decoy reassignment
UPDATE questions SET difficulty = 3, updated_at = CURRENT_TIMESTAMP
 WHERE prompt = E'What does this log?\n\nlet total = 10;\nlet bonus = 5;\ntotal = total + bonus;\nbonus = 0;\nconsole.log(total);'
   AND difficulty <> 3;

COMMIT;
