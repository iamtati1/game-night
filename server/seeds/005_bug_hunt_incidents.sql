-- Bug Hunt content. Twenty incidents, four at each difficulty.
--
-- Every runtime claim in here was executed in Node before it was written down.
-- That check earned its keep immediately: two incidents drafted for this bank
-- were simply wrong and were cut rather than shipped.
--
--   * "mutable default argument" -- a Python bug. JavaScript re-evaluates a
--     default expression on every call, so `function add(x, cart = [])` does
--     NOT share the array between calls. There is no bug to find.
--   * "parseInt without a radix" -- obsolete. parseInt("08") returned 0 under
--     ES3's octal rule; every engine since ES5 returns 8. Asking a player to
--     "spot" it would be teaching them something false.
--
-- Distractors are the sharpest part of this game. Each one is a real mistake a
-- real developer makes on this exact code -- a line that genuinely looks
-- suspicious, or a patch that genuinely looks like it would help. A distractor
-- nobody would pick teaches nothing and turns four options into two.
--
-- Every option carries an explanation, including the wrong ones, because the
-- second attempt is meant to be spent on what the first one told you.
--
-- Hints narrow without answering: hint one points at the neighbourhood, hint two
-- at the mechanism, hint three at the line. Only the explanation names the fix.
--
-- Safe to re-run: skips incidents that already exist.

CREATE OR REPLACE FUNCTION seed_bug_hunt_incident(
    p_slug TEXT,
    p_title TEXT,
    p_bug_report TEXT,
    p_error_log TEXT,
    p_theme TEXT,
    p_bug_category TEXT,
    p_challenge_type TEXT,
    p_code TEXT,
    p_hints TEXT[],
    -- INTEGER rather than SMALLINT for the same reason seed_flush uses it: a
    -- bare SQL literal is typed integer and PostgreSQL will not implicitly
    -- narrow it during overload resolution, so every call site would fail with
    -- "function does not exist". The INSERT assignment-casts to the column.
    p_difficulty INTEGER,
    -- [{"text": ..., "line": ..., "correct": ..., "explanation": ...}, ...]
    p_options JSONB
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_id BIGINT;
    v_opt JSONB;
BEGIN
    IF EXISTS (SELECT 1 FROM bug_hunt_incidents WHERE slug = p_slug) THEN
        RETURN;
    END IF;

    INSERT INTO bug_hunt_incidents
        (slug, title, bug_report, error_log, theme, bug_category,
         challenge_type, code, hints, difficulty)
    VALUES
        (p_slug, p_title, p_bug_report, p_error_log, p_theme, p_bug_category,
         p_challenge_type, p_code, p_hints, p_difficulty)
    RETURNING id INTO v_id;

    FOR v_opt IN SELECT * FROM jsonb_array_elements(p_options) LOOP
        INSERT INTO bug_hunt_options
            (incident_id, option_text, line_number, is_correct, explanation)
        VALUES (
            v_id,
            v_opt->>'text',
            CASE WHEN v_opt->>'line' IS NULL THEN NULL ELSE (v_opt->>'line')::INTEGER END,
            COALESCE((v_opt->>'correct')::BOOLEAN, FALSE),
            v_opt->>'explanation'
        );
    END LOOP;
END;
$$;

-- ============================================================ DIFFICULTY 1

SELECT seed_bug_hunt_incident(
    'profile-undefined-name',
    'Profile service returning incomplete data',
    'Opening certain profiles crashes the page instead of showing "user not found".',
    'TypeError: Cannot read properties of undefined (reading ''name'')',
    'profiles', 'array-access', 'find_line',
$code$function getDisplayName(users, id) {
  const user = users.find(u => u.id === id);
  return user.name;
}$code$,
    ARRAY[
        'The trace says something is undefined. Which value could be?',
        'What does Array.prototype.find() return when nothing matches?',
        'Line 3 assumes find() succeeded. It does not always.'
    ],
    1,
$opts$[
  {"text": "const user = users.find(u => u.id === id);", "line": 2, "correct": false,
   "explanation": "This line is fine. find() with a strict equality predicate is the right way to look a user up -- it just isn't guaranteed to find one."},
  {"text": "return user.name;", "line": 3, "correct": true,
   "explanation": "find() returns undefined when no element matches, and reading .name off undefined throws. The line needs to handle the miss -- return user?.name ?? null, or guard with if (!user)."},
  {"text": "function getDisplayName(users, id) {", "line": 1, "correct": false,
   "explanation": "The signature is fine. Taking the collection and the id as parameters is exactly right; nothing here causes the crash."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'cart-quantity-string',
    'Checkout totals wrong for multi-item carts',
    'Adding one more of an item makes the quantity read 21 instead of 3.',
    NULL,
    'payments', 'type-coercion', 'choose_patch',
$code$function addOne(item) {
  const current = item.quantity;   // "2", read from a form field
  return { ...item, quantity: current + 1 };
}$code$,
    ARRAY[
        'The result 21 is not arithmetic. What else produces "21" from 2 and 1?',
        'Form fields hand back strings, not numbers.',
        '+ concatenates when either side is a string.'
    ],
    1,
$opts$[
  {"text": "return { ...item, quantity: Number(current) + 1 };", "correct": true,
   "explanation": "current is the string \"2\", so \"2\" + 1 concatenates to \"21\". Converting to a number first makes + do arithmetic. Number(\"2\") + 1 is 3."},
  {"text": "return { ...item, quantity: current + \"1\" };", "correct": false,
   "explanation": "This makes it worse -- now both sides are strings, so it always concatenates. The result would be \"21\" every time rather than only sometimes."},
  {"text": "return { ...item, quantity: current++ };", "correct": false,
   "explanation": "++ does coerce to a number, but the postfix form returns the value BEFORE incrementing, so the quantity would never change. It also mutates a const."},
  {"text": "return { ...item, quantity: +1 + current };", "correct": false,
   "explanation": "Flipping the operands does not help. + still concatenates when either operand is a string, so this yields \"12\"."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'inventory-count-overflow',
    'Inventory report ends with a blank row',
    'Every stock report has one extra empty line at the bottom.',
    NULL,
    'inventory', 'off-by-one', 'find_line',
$code$function stockLines(items) {
  const lines = [];
  for (let i = 0; i <= items.length; i++) {
    lines.push(items[i]);
  }
  return lines;
}$code$,
    ARRAY[
        'One extra row means one extra pass.',
        'For an array of length 3, what are the valid indexes?',
        'Look at the comparison in the loop condition.'
    ],
    1,
$opts$[
  {"text": "const lines = [];", "line": 2, "correct": false,
   "explanation": "Fine. Starting from an empty array and pushing is a perfectly normal way to build this up."},
  {"text": "for (let i = 0; i <= items.length; i++) {", "line": 3, "correct": true,
   "explanation": "<= runs one iteration too many. Valid indexes stop at length - 1, so the last pass reads items[items.length], which is undefined -- the blank row. It should be i < items.length."},
  {"text": "lines.push(items[i]);", "line": 4, "correct": false,
   "explanation": "This line does exactly what it should. It pushes undefined only because the loop hands it an out-of-range index."},
  {"text": "return lines;", "line": 6, "correct": false,
   "explanation": "Returning the built array is correct. The extra row is already in it by the time this runs."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'login-validator-no-return',
    'Login accepting invalid email addresses',
    'Accounts are being created with addresses that clearly are not emails.',
    NULL,
    'auth', 'return-value', 'find_line',
$code$function isValidEmail(address) {
  if (!address.includes('@')) {
    false;
  }
  return true;
}$code$,
    ARRAY[
        'The check itself is right. Something about it has no effect.',
        'What does the body of the if statement actually do?',
        'An expression on its own line is evaluated and discarded.'
    ],
    1,
$opts$[
  {"text": "if (!address.includes('@')) {", "line": 2, "correct": false,
   "explanation": "The condition is correct -- an address with no @ is not valid. The problem is what happens inside the block, not the test."},
  {"text": "false;", "line": 3, "correct": true,
   "explanation": "This evaluates false and throws it away. Without return, execution falls straight through to line 5, so the function returns true for every input. It needs to be return false."},
  {"text": "return true;", "line": 5, "correct": false,
   "explanation": "This is the correct final line for a validator -- reaching it should mean every check passed. The bug is that the failing branch never stops execution from getting here."}
]$opts$
);

-- ============================================================ DIFFICULTY 2

SELECT seed_bug_hunt_incident(
    'api-map-no-return',
    'API returning a list of nulls',
    'GET /api/orders responds with the right number of entries, but every one is null.',
    NULL,
    'api', 'return-value', 'choose_patch',
$code$function toSummaries(orders) {
  return orders.map(order => {
    const total = order.items.length;
    { id: order.id, total };
  });
}$code$,
    ARRAY[
        'The count is right, so map is running once per order.',
        'What value does each callback hand back?',
        'A block-bodied arrow function returns undefined unless told otherwise.'
    ],
    2,
$opts$[
  {"text": "return { id: order.id, total };", "correct": true,
   "explanation": "The arrow function has a block body, so it returns undefined unless something is returned explicitly. That is why the array has the right length and no content."},
  {"text": "orders.forEach(order => ({ id: order.id, total: order.items.length }));", "correct": false,
   "explanation": "forEach always returns undefined, so the function would return undefined instead of an array. map is the right tool here; the callback just isn't returning."},
  {"text": "return orders.map(order => order.items.length);", "correct": false,
   "explanation": "This returns numbers rather than summary objects. It removes the nulls but also removes the id, so the endpoint's contract breaks."},
  {"text": "return [...orders].map(order => { { id: order.id } });", "correct": false,
   "explanation": "Copying the array changes nothing -- the callback still has a block body with no return, so every entry is still undefined."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'notify-indexof-zero',
    'First subscriber never receives notifications',
    'Everyone on a channel gets notified except whoever joined first.',
    NULL,
    'messaging', 'comparison', 'find_line',
$code$function isSubscribed(channel, userId) {
  if (channel.members.indexOf(userId)) {
    return true;
  }
  return false;
}$code$,
    ARRAY[
        'It fails for exactly one position in the list. Which one?',
        'What number does indexOf return for the first element?',
        'That number is falsy.'
    ],
    2,
$opts$[
  {"text": "if (channel.members.indexOf(userId)) {", "line": 2, "correct": true,
   "explanation": "indexOf returns 0 for the first element, and 0 is falsy -- so the first member always fails the test. It needs an explicit comparison, indexOf(userId) !== -1, or better, members.includes(userId)."},
  {"text": "return true;", "line": 3, "correct": false,
   "explanation": "Correct for the branch it is in. Reaching it should mean the user was found; the bug is that the first member never reaches it."},
  {"text": "return false;", "line": 5, "correct": false,
   "explanation": "The right fallback. The problem is that the first member falls through to here rather than that here is wrong."},
  {"text": "function isSubscribed(channel, userId) {", "line": 1, "correct": false,
   "explanation": "The signature is fine -- taking the channel and the user id is exactly what this needs."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'analytics-last-event',
    'Analytics dashboard shows no most-recent event',
    'The "last event" tile is permanently blank even for very active accounts.',
    NULL,
    'analytics', 'array-access', 'choose_patch',
$code$function lastEvent(events) {
  if (events.length === 0) return null;
  return events[events.length];
}$code$,
    ARRAY[
        'The guard for the empty case is already right.',
        'For a 3-element array, which index holds the last item?',
        'events[3] is one past the end.'
    ],
    2,
$opts$[
  {"text": "return events[events.length - 1];", "correct": true,
   "explanation": "Indexes run 0 to length - 1, so the last element is at length - 1. events[events.length] is always one past the end, which is undefined."},
  {"text": "return events[events.length].value;", "correct": false,
   "explanation": "This makes it worse. The index is still out of range, so this now throws a TypeError instead of quietly returning undefined."},
  {"text": "return events.pop();", "correct": false,
   "explanation": "pop() does return the last element, but it also REMOVES it. Reading a dashboard tile would destroy the event it just displayed."},
  {"text": "return events.slice(-1);", "correct": false,
   "explanation": "Close, but slice returns an ARRAY containing the last element, not the element itself. The tile would render [object Object]. slice(-1)[0] or at(-1) would work."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'profile-rank-string-compare',
    'Leaderboard ordering wrong above rank 9',
    'Rank 10 sorts as though it were smaller than rank 9.',
    NULL,
    'profiles', 'comparison', 'find_line',
$code$function isHigherRank(a, b) {
  const rankA = a.rank;
  const rankB = b.rank;
  return rankA > rankB;
}
// a.rank and b.rank arrive from the API as strings: "10" and "9".$code$,
    ARRAY[
        'It only misbehaves once ranks reach two digits.',
        'What are these values actually holding?',
        'Comparing two strings with > compares them character by character.'
    ],
    2,
$opts$[
  {"text": "return rankA > rankB;", "line": 4, "correct": true,
   "explanation": "Both operands are strings, so > compares them lexicographically: \"10\" > \"9\" is false because \"1\" sorts before \"9\". Converting first -- Number(rankA) > Number(rankB) -- fixes it."},
  {"text": "const rankA = a.rank;", "line": 2, "correct": false,
   "explanation": "Reading the property is not the problem. It could convert here instead, but the line as written is a plain, correct read."},
  {"text": "const rankB = b.rank;", "line": 3, "correct": false,
   "explanation": "Same as the line above -- a straightforward read. Only the comparison misinterprets what it got."},
  {"text": "function isHigherRank(a, b) {", "line": 1, "correct": false,
   "explanation": "A two-argument comparator is the right shape for this. Nothing in the signature causes the ordering bug."}
]$opts$
);

-- ============================================================ DIFFICULTY 3

SELECT seed_bug_hunt_incident(
    'payment-missing-await',
    'Payments marked complete before they settle',
    'Orders flip to "paid" instantly, then some of them silently fail minutes later.',
    NULL,
    'payments', 'async', 'find_line',
$code$async function settle(order) {
  const charge = chargeCard(order.total);
  await recordAttempt(order.id);
  return { id: order.id, status: charge.status };
}$code$,
    ARRAY[
        'One of these two calls is treated differently from the other.',
        'chargeCard is async. What does calling it actually give you?',
        'A Promise has no .status -- reading it yields undefined immediately.'
    ],
    3,
$opts$[
  {"text": "const charge = chargeCard(order.total);", "line": 2, "correct": true,
   "explanation": "Without await, charge is a pending Promise rather than the result. charge.status is undefined, so the order records a status nobody checked, and the real charge settles later unobserved. It needs await chargeCard(...)."},
  {"text": "await recordAttempt(order.id);", "line": 3, "correct": false,
   "explanation": "This one is correct -- it is awaited. It is here precisely to show that the author knew how to await and missed one."},
  {"text": "return { id: order.id, status: charge.status };", "line": 4, "correct": false,
   "explanation": "The shape of the return is right. It reads undefined only because line 2 handed it a Promise instead of a result."},
  {"text": "async function settle(order) {", "line": 1, "correct": false,
   "explanation": "The function is correctly declared async -- that is what makes await legal inside it. The bug is a missing await, not a missing keyword here."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'inventory-sort-mutates',
    'Warehouse list reorders itself after viewing a report',
    'Opening the "cheapest first" report permanently reorders the main inventory list.',
    NULL,
    'inventory', 'mutation', 'choose_patch',
$code$function cheapestFirst(items) {
  return items.sort((a, b) => a.price - b.price);
}$code$,
    ARRAY[
        'The report itself is correct. Something else changes as a side effect.',
        'What does Array.prototype.sort() do to the array it is called on?',
        'sort() sorts in place and returns the same array reference.'
    ],
    3,
$opts$[
  {"text": "return [...items].sort((a, b) => a.price - b.price);", "correct": true,
   "explanation": "sort() sorts in place and returns the SAME array, so the caller's list is reordered too. Spreading into a new array first sorts a copy and leaves the original alone. (toSorted() does the same thing natively.)"},
  {"text": "return items.slice().reverse().sort((a, b) => a.price - b.price);", "correct": false,
   "explanation": "slice() does copy, so this fixes the mutation -- but the reverse() is pointless work before a full sort, and it makes the intent much harder to read. Right idea, wrong execution."},
  {"text": "return items.sort((a, b) => b.price - a.price);", "correct": false,
   "explanation": "This flips the order to most-expensive-first and still mutates the caller's array. It changes the wrong thing entirely."},
  {"text": "items.sort((a, b) => a.price - b.price); return items;", "correct": false,
   "explanation": "Identical behaviour to the original, just spread across two statements. The array is still sorted in place."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'auth-foreach-async',
    'Bulk user import reports success before it finishes',
    'The importer says "0 failures" immediately, then failures appear in the logs afterwards.',
    NULL,
    'auth', 'async', 'choose_patch',
$code$async function importAll(users) {
  const failed = [];
  users.forEach(async (user) => {
    try { await createUser(user); }
    catch { failed.push(user.email); }
  });
  return failed;
}$code$,
    ARRAY[
        'The failures are real -- they just arrive after the answer does.',
        'forEach is given an async callback. What does forEach do with the Promise it returns?',
        'forEach discards return values, so nothing waits for these.'
    ],
    3,
$opts$[
  {"text": "for (const user of users) { try { await createUser(user); } catch { failed.push(user.email); } }", "correct": true,
   "explanation": "forEach ignores the Promise each async callback returns, so importAll returns while every createUser is still in flight and failed is still empty. A for...of loop actually awaits each iteration."},
  {"text": "await users.forEach(async (user) => { await createUser(user); });", "correct": false,
   "explanation": "forEach returns undefined, and awaiting undefined resolves immediately. This looks like it waits and does not."},
  {"text": "users.map(async (user) => { await createUser(user); });", "correct": false,
   "explanation": "map at least collects the Promises, but nothing awaits the array it produces -- so this has exactly the same bug. await Promise.all(users.map(...)) would work."},
  {"text": "users.forEach((user) => { createUser(user).catch(() => failed.push(user.email)); });", "correct": false,
   "explanation": "Dropping async does not change anything: the calls are still unawaited and failed is still returned empty. It just hides the await that made the problem visible."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'messaging-var-closure',
    'Scheduled reminders all fire for the same conversation',
    'Scheduling reminders for three conversations sends all three to the last one.',
    NULL,
    'messaging', 'scope', 'find_line',
$code$function scheduleAll(conversations) {
  for (var i = 0; i < conversations.length; i++) {
    setTimeout(() => {
      remind(conversations[i]);
    }, 1000);
  }
}$code$,
    ARRAY[
        'The callbacks are correct. What they read has changed by the time they run.',
        'When the timeouts fire, the loop has already finished. What is i then?',
        'var is function-scoped -- every callback closes over one shared binding.'
    ],
    3,
$opts$[
  {"text": "for (var i = 0; i < conversations.length; i++) {", "line": 2, "correct": true,
   "explanation": "var creates ONE binding for the whole function, so all three callbacks share it. By the time they run, the loop has ended and i equals conversations.length. Changing var to let gives each iteration its own binding."},
  {"text": "remind(conversations[i]);", "line": 4, "correct": false,
   "explanation": "This line does the right thing -- it just reads i too late. It reads the shared binding after the loop has finished with it."},
  {"text": "setTimeout(() => {", "line": 3, "correct": false,
   "explanation": "Deferring the work is the intent, not the bug. The same code with let instead of var behaves correctly."},
  {"text": "}, 1000);", "line": 5, "correct": false,
   "explanation": "The delay is irrelevant. Any delay at all -- even 0 -- would show the same problem, because the loop finishes before any callback runs."}
]$opts$
);

-- ============================================================ DIFFICULTY 4

SELECT seed_bug_hunt_incident(
    'analytics-reduce-async',
    'Event totals recorded as [object Promise]',
    'The nightly rollup writes a total that is not a number.',
    NULL,
    'analytics', 'async', 'choose_patch',
$code$async function totalWeight(events) {
  return events.reduce(async (sum, event) => {
    const weight = await lookupWeight(event.type);
    return (await sum) + weight;
  }, Promise.resolve(0));
}$code$,
    ARRAY[
        'The accumulator is being handled carefully. The result still is not a number.',
        'What type does an async callback always return?',
        'reduce hands back whatever the last callback returned -- here, a Promise.'
    ],
    4,
$opts$[
  {"text": "let sum = 0; for (const event of events) { sum += await lookupWeight(event.type); } return sum;", "correct": true,
   "explanation": "An async callback always returns a Promise, so reduce hands back a Promise -- and because totalWeight is async, returning it wraps a Promise the caller must unwrap twice. A plain for...of loop awaits each lookup and returns a real number."},
  {"text": "return await events.reduce(async (sum, event) => (await sum) + await lookupWeight(event.type), Promise.resolve(0));", "correct": false,
   "explanation": "This one actually does work, but it awaits each lookup strictly in sequence while looking like it does not, and the double await on the accumulator is exactly the pattern that caused the confusion. Correct-by-accident is not a fix."},
  {"text": "return events.reduce((sum, event) => sum + lookupWeight(event.type), 0);", "correct": false,
   "explanation": "Removing async removes the awaits too, so this adds Promises to a number and produces NaN. Worse than the original, which at least had the right values inside the wrapper."},
  {"text": "return Promise.all(events.map(e => lookupWeight(e.type)));", "correct": false,
   "explanation": "This returns an array of weights rather than their total. The concurrency is an improvement, but it answers a different question -- it never sums anything."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'api-mutates-caller-object',
    'Saving preferences changes settings the user did not touch',
    'Applying a theme preference also overwrites the defaults for every later request.',
    NULL,
    'api', 'mutation', 'find_line',
$code$const DEFAULTS = { theme: 'system', density: 'comfortable' };

function withPreferences(overrides) {
  const settings = DEFAULTS;
  Object.assign(settings, overrides);
  return settings;
}$code$,
    ARRAY[
        'It is not the first request that breaks -- it is every one after it.',
        'What does line 4 actually copy?',
        'Assigning an object copies the reference, not the object.'
    ],
    4,
$opts$[
  {"text": "const settings = DEFAULTS;", "line": 4, "correct": true,
   "explanation": "This copies the REFERENCE, so settings and DEFAULTS are the same object. The Object.assign on the next line therefore writes straight into the shared defaults, permanently. It needs a copy: { ...DEFAULTS }."},
  {"text": "Object.assign(settings, overrides);", "line": 5, "correct": false,
   "explanation": "Object.assign is doing exactly what it is meant to -- merging into its first argument. The damage comes from that first argument being the shared DEFAULTS object rather than a copy."},
  {"text": "const DEFAULTS = { theme: 'system', density: 'comfortable' };", "line": 1, "correct": false,
   "explanation": "A module-level defaults object is a perfectly normal pattern. It is only dangerous because something later writes into it."},
  {"text": "return settings;", "line": 6, "correct": false,
   "explanation": "Returning the merged settings is correct. By this point the shared object has already been overwritten."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'payments-float-cents',
    'Refund totals off by a fraction of a penny',
    'Reconciliation flags refunds as mismatched by amounts like 0.00000000000000004.',
    NULL,
    'payments', 'type-coercion', 'choose_patch',
$code$function refundTotal(lines) {
  return lines.reduce((sum, line) => sum + line.amount, 0);
}
// refundTotal([{ amount: 0.1 }, { amount: 0.2 }]) -> 0.30000000000000004$code$,
    ARRAY[
        'The arithmetic is right. The representation is not.',
        'Binary floating point cannot represent 0.1 exactly.',
        'Money is usually held in the smallest unit -- integer cents.'
    ],
    4,
$opts$[
  {"text": "return lines.reduce((sum, line) => sum + Math.round(line.amount * 100), 0) / 100;", "correct": true,
   "explanation": "Doubles cannot represent 0.1 or 0.2 exactly, so the error accumulates. Summing in integer cents keeps every intermediate value exact and converts back only once at the end."},
  {"text": "return Number(lines.reduce((sum, line) => sum + line.amount, 0).toFixed(2));", "correct": false,
   "explanation": "Rounding at the end hides small errors but does not prevent them -- the drift still accumulates inside the loop, and with enough lines it can exceed half a cent and round the wrong way."},
  {"text": "return lines.reduce((sum, line) => sum + parseFloat(line.amount), 0);", "correct": false,
   "explanation": "parseFloat produces the same double. If amount is already a number this changes nothing at all."},
  {"text": "return lines.reduce((sum, line) => Math.round(sum + line.amount), 0);", "correct": false,
   "explanation": "This rounds to whole units on every step, so 0.1 + 0.2 becomes 0. It destroys the amounts rather than preserving their precision."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'inventory-splice-skip',
    'Recall removes only some of the affected items',
    'Recalling a batch leaves some of the recalled items still in stock.',
    NULL,
    'inventory', 'off-by-one', 'find_line',
$code$function removeRecalled(items, batch) {
  for (let i = 0; i < items.length; i++) {
    if (items[i].batch === batch) {
      items.splice(i, 1);
    }
  }
  return items;
}$code$,
    ARRAY[
        'It works until two affected items sit next to each other.',
        'What happens to the indexes after splice removes an element?',
        'Everything shifts down by one, but i still goes up by one.'
    ],
    4,
$opts$[
  {"text": "items.splice(i, 1);", "line": 4, "correct": true,
   "explanation": "Removing element i shifts every later element down one, so the next item lands at index i -- but the loop then increments i and skips it. With two adjacent matches, the second survives. Iterating backwards, or using filter, avoids it."},
  {"text": "for (let i = 0; i < items.length; i++) {", "line": 2, "correct": false,
   "explanation": "A standard forward loop is fine on its own. It only becomes wrong in combination with removing elements from the array it is walking."},
  {"text": "if (items[i].batch === batch) {", "line": 3, "correct": false,
   "explanation": "The match test is correct -- strict equality on the batch is exactly what a recall needs."},
  {"text": "return items;", "line": 7, "correct": false,
   "explanation": "Returning the mutated array is consistent with what this function is trying to do. The survivors are already in it."}
]$opts$
);

-- ============================================================ DIFFICULTY 5
--
-- Boss-tier. These are not longer than the others -- they are the ones where the
-- symptom and the cause sit in different places, so the trace points somewhere
-- the fix does not go.

SELECT seed_bug_hunt_incident(
    'auth-token-refresh-race',
    'Users signed out at random during long sessions',
    'Two requests refreshing at the same moment leave the session holding a token that was already replaced.',
    NULL,
    'auth', 'async', 'find_line',
$code$async function refreshToken(session) {
  const current = await store.get(session.id);
  if (!isExpired(current)) return current;
  const fresh = await identityProvider.renew(current);
  await store.set(session.id, fresh);
  return fresh;
}$code$,
    ARRAY[
        'Nothing here is wrong in isolation. Run it twice at once.',
        'There is a gap between reading the token and writing the new one.',
        'Both callers read the same value before either has written.'
    ],
    5,
$opts$[
  {"text": "const current = await store.get(session.id);", "line": 2, "correct": true,
   "explanation": "This is the start of a read-modify-write with no lock. Two concurrent refreshes both read the same expired token, both renew, and the slower write clobbers the faster one -- leaving a token the provider has already invalidated. The read and the write have to be one atomic step, or the refresh has to be de-duplicated per session."},
  {"text": "if (!isExpired(current)) return current;", "line": 3, "correct": false,
   "explanation": "The early return is correct and is what keeps this cheap in the common case. It does not create the race -- the race exists whenever two callers get past it together."},
  {"text": "const fresh = await identityProvider.renew(current);", "line": 4, "correct": false,
   "explanation": "Renewing is properly awaited and is exactly what should happen here. The problem is that two callers can be inside this line simultaneously with the same input."},
  {"text": "await store.set(session.id, fresh);", "line": 5, "correct": false,
   "explanation": "The write itself is fine and correctly awaited. It is the losing half of the race, not the cause of it -- it overwrites a token that another caller had already stored."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'messaging-double-send',
    'Some recipients receive every notification twice',
    'Users with email enabled get two copies -- the second one unformatted, with the raw template still in it.',
    NULL,
    'messaging', 'return-value', 'find_line',
$code$async function notify(user, message) {
  const body = render(message);
  if (user.prefers.email) {
    await sendEmail(user, body);
  }
  if (user.prefers.push) {
    await sendPush(user, body);
  }
  await sendEmail(user, message);
}$code$,
    ARRAY[
        'It only affects users with a particular combination of preferences.',
        'Count how many times each channel can be reached in one call.',
        'The last line runs unconditionally.'
    ],
    5,
$opts$[
  {"text": "await sendEmail(user, message);", "line": 9, "correct": true,
   "explanation": "A leftover from before render() existed: it is unguarded, so anyone with email enabled gets a second copy, and it passes the raw message rather than body -- which is why the duplicate is unformatted. It should be deleted, not guarded."},
  {"text": "await sendEmail(user, body);", "line": 4, "correct": false,
   "explanation": "This is the legitimate email send -- correctly guarded, and correctly passing the rendered body. Removing it would leave only the unguarded send, which ignores preferences entirely."},
  {"text": "if (user.prefers.email) {", "line": 3, "correct": false,
   "explanation": "This guard is correct and is doing its job. The duplicate does not come from this branch running twice; it comes from a second, unguarded send further down."},
  {"text": "if (user.prefers.push) {", "line": 6, "correct": false,
   "explanation": "Push is guarded correctly and is only ever sent once. The report mentions push only because affected users tend to have both channels on."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'analytics-shared-accumulator',
    'Every region reports identical figures',
    'The regional breakdown shows the same totals for all regions, matching the global total.',
    NULL,
    'analytics', 'mutation', 'choose_patch',
$code$function groupByRegion(events) {
  const empty = { count: 0, revenue: 0 };
  const groups = {};
  for (const event of events) {
    groups[event.region] ??= empty;
    groups[event.region].count += 1;
    groups[event.region].revenue += event.revenue;
  }
  return groups;
}$code$,
    ARRAY[
        'Identical figures suggest the regions are not actually separate.',
        'How many objects does this function create in total?',
        'Every region is assigned the same object.'
    ],
    5,
$opts$[
  {"text": "groups[event.region] ??= { count: 0, revenue: 0 };", "correct": true,
   "explanation": "empty is created once, so every region is assigned a reference to the SAME object and they all accumulate into it. Building a fresh object per region gives each one its own state."},
  {"text": "groups[event.region] ??= Object.freeze(empty);", "correct": false,
   "explanation": "Freezing shares the same object AND makes the increments fail -- silently in sloppy mode, or throwing in strict mode. It turns a wrong answer into no answer."},
  {"text": "groups[event.region] = empty;", "correct": false,
   "explanation": "Dropping ??= means every event resets the region to the shared object, which is the original bug plus a new one. The sharing is untouched."},
  {"text": "const empty = () => ({ count: 0, revenue: 0 }); groups[event.region] ??= empty;", "correct": false,
   "explanation": "Right instinct -- a factory does produce distinct objects -- but this assigns the FUNCTION rather than calling it. Every group would be a function, and += on it yields NaN. It needs empty()."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'payments-retry-scope',
    'Payment retries all report the first attempt number',
    'The retry log shows "attempt 4" four times instead of attempts 1 through 4.',
    NULL,
    'payments', 'scope', 'choose_patch',
$code$function scheduleRetries(order) {
  const pending = [];
  for (var attempt = 1; attempt <= 4; attempt++) {
    pending.push(
      delay(attempt * 1000).then(() => log(`attempt ${attempt}`))
    );
  }
  return Promise.all(pending);
}$code$,
    ARRAY[
        'The delays are staggered correctly. Only the reported number is wrong.',
        'When does the template literal actually read attempt?',
        'All four callbacks share one binding, and the loop has finished by then.'
    ],
    5,
$opts$[
  {"text": "for (let attempt = 1; attempt <= 4; attempt++) {", "correct": true,
   "explanation": "var has one function-scoped binding shared by all four callbacks, and by the time any of them runs the loop has finished with attempt at 5. let gives each iteration its own binding, so each callback closes over its own value. Note delay(attempt * 1000) is evaluated immediately, which is why the timing was already right."},
  {"text": "for (var attempt = 1; attempt <= 4; attempt++) { const n = attempt; pending.push(delay(n * 1000).then(() => log(`attempt ${attempt}`))); }", "correct": false,
   "explanation": "It captures a per-iteration copy in n but then still logs attempt, so the message is unchanged. The fix has to be used by the line that actually reads the value."},
  {"text": "pending.push(delay(attempt * 1000).then(() => log(`attempt ${pending.length + 1}`)));", "correct": false,
   "explanation": "By the time any callback runs, all four entries are already in pending, so every one of them reports 5. It swaps one shared mutable value for another."},
  {"text": "return Promise.all(pending.map((p, i) => p.then(() => log(`attempt ${i + 1}`))));", "correct": false,
   "explanation": "This does produce the right numbers, but it logs each attempt TWICE -- the original .then is still attached and still fires. Adding a second logger does not remove the first."}
]$opts$
);

-- The helper is a seeding tool, not part of the schema. Dropping it keeps the
-- database surface to the three tables the game actually uses.
DROP FUNCTION seed_bug_hunt_incident(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], INTEGER, JSONB
);
