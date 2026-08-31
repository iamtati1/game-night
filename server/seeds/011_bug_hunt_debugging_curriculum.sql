-- Bug Hunt: a beginner debugging curriculum.
--
-- The bank was a set of bugs to find. This makes it a set of bugs that teach you
-- HOW to find one, which is a different thing. The incidents below follow a
-- deliberate progression, and the progression is the point:
--
--   Level 1  read the error       the runtime already told you the line
--   Level 2  read the code        the problem is visible once you look
--   Level 3  investigate          what would you log to find out?
--   Level 4  trace                which line first produces the wrong value
--   Level 5  fix                  the smallest correct change
--   Level 6  async                the same skills, one step harder
--
-- Level 3 is the one that does the most work. Every other level asks what is
-- wrong; that one asks what you would DO to find out, which is the actual skill
-- and the one nothing else in Jolt teaches. Its options are competing next
-- steps, and the wrong ones are all things a beginner genuinely reaches for --
-- logging the result you already know is wrong, or confirming the function ran.
--
-- Levels map onto the existing difficulty tiers rather than adding a column: 1-2
-- open a run untimed, 3-5 arrive once the clock is on.

BEGIN;

/** Same helper as 005 and 006, defined here so this file stands on its own. */
CREATE OR REPLACE FUNCTION seed_bug_hunt_incident(
    p_slug TEXT, p_title TEXT, p_bug_report TEXT, p_error_log TEXT,
    p_theme TEXT, p_bug_category TEXT, p_challenge_type TEXT,
    p_code TEXT, p_hints TEXT[], p_difficulty INTEGER, p_options JSONB
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_id BIGINT;
    v_option JSONB;
BEGIN
    IF EXISTS (SELECT 1 FROM bug_hunt_incidents WHERE slug = p_slug) THEN
        RETURN;
    END IF;

    INSERT INTO bug_hunt_incidents
        (slug, title, bug_report, error_log, theme, bug_category,
         challenge_type, code, hints, difficulty)
    VALUES (p_slug, p_title, p_bug_report, p_error_log, p_theme, p_bug_category,
            p_challenge_type, p_code, p_hints, p_difficulty)
    RETURNING id INTO v_id;

    FOR v_option IN SELECT * FROM jsonb_array_elements(p_options) LOOP
        INSERT INTO bug_hunt_options
            (incident_id, option_text, line_number, is_correct, explanation)
        VALUES (
            v_id,
            v_option ->> 'text',
            (v_option ->> 'line')::INTEGER,
            (v_option ->> 'correct')::BOOLEAN,
            v_option ->> 'explanation'
        );
    END LOOP;
END;
$$;


-- ===========================================================================
-- LEVEL 1 -- read the error. The runtime has already named the line.
-- ===========================================================================

SELECT seed_bug_hunt_incident(
    'read-error-null-property', 'Basket count crashes on an empty basket',
    'Opening the basket page throws instead of showing zero items.',
    'TypeError: Cannot read properties of null (reading ''length'')',
    'inventory', 'array-access', 'find_line',
$code$const cart = null;
const count = cart.length;
console.log(count);$code$,
    ARRAY[
        'The error message names the operation that failed: reading a property.',
        'Which line reads a property from something?',
        'cart is null, and null has no properties to read.'
    ], 1,
$opts$[
  {"text": "const count = cart.length;", "line": 2, "correct": true,
   "explanation": "Reading .length from null is what throws. The error even names the property, which is usually enough to find the line on its own."},
  {"text": "const cart = null;", "line": 1, "correct": false,
   "explanation": "Assigning null is perfectly legal. Nothing goes wrong until something tries to read from it."},
  {"text": "console.log(count);", "line": 3, "correct": false,
   "explanation": "This line never runs -- the program stopped on the line above. An error stops execution where it happens."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'read-error-not-a-function', 'Order total page fails to load',
    'The totals page throws as soon as it tries to calculate.',
    'TypeError: total is not a function',
    'payments', 'type-coercion', 'find_line',
$code$const total = 42;
const result = total();
console.log(result);$code$,
    ARRAY[
        'The error says something is not a function. What was called?',
        'Parentheses after a name mean "call this".',
        'total holds a number, and a number cannot be called.'
    ], 1,
$opts$[
  {"text": "const result = total();", "line": 2, "correct": true,
   "explanation": "The parentheses try to call total, but total is a number. Usually this means a variable and a function share a name, or the parentheses were not meant to be there."},
  {"text": "const total = 42;", "line": 1, "correct": false,
   "explanation": "Storing 42 is fine. The mistake is in what the next line tries to do with it."},
  {"text": "console.log(result);", "line": 3, "correct": false,
   "explanation": "Never reached. The throw on line 2 ends the program before this runs."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'read-error-method-case', 'Usernames are not being capitalised',
    'Saving a profile throws instead of storing the formatted name.',
    'TypeError: name.toUppercase is not a function',
    'profiles', 'type-coercion', 'find_line',
$code$const name = "ada";
const formatted = name.toUppercase();
console.log(formatted);$code$,
    ARRAY[
        'The error names the exact method it could not find.',
        'Compare the spelling in the error with the real method name.',
        'JavaScript method names are case-sensitive: it is toUpperCase.'
    ], 1,
$opts$[
  {"text": "const formatted = name.toUppercase();", "line": 2, "correct": true,
   "explanation": "The method is toUpperCase, with a capital C. A misspelled method is undefined, and calling undefined throws exactly this error."},
  {"text": "const name = \"ada\";", "line": 1, "correct": false,
   "explanation": "A perfectly ordinary string. Strings do have an uppercase method -- just not the one spelled on the next line."},
  {"text": "console.log(formatted);", "line": 3, "correct": false,
   "explanation": "Never reached, because line 2 threw first."}
]$opts$
);


-- ===========================================================================
-- LEVEL 2 -- read the code. No error, but the output is wrong.
-- ===========================================================================

SELECT seed_bug_hunt_incident(
    'read-code-logged-not-returned', 'Tax line is always undefined at checkout',
    'The tax line prints correctly in the console but shows as undefined on the receipt.',
    NULL,
    'payments', 'return-value', 'find_line',
$code$function priceWithTax(price) {
  const total = price * 1.2;
  console.log(total);
}$code$,
    ARRAY[
        'The value appears in the console, so it is being calculated correctly.',
        'What does this function hand back to whoever called it?',
        'Logging shows a value to you. Returning hands it to the code.'
    ], 1,
$opts$[
  {"text": "  console.log(total);", "line": 3, "correct": true,
   "explanation": "The function logs the total but never returns it, so the caller receives undefined. This should be return total -- logging and returning are not the same thing."},
  {"text": "  const total = price * 1.2;", "line": 2, "correct": false,
   "explanation": "The arithmetic is right, which is why the console shows the correct number. The value simply never leaves the function."},
  {"text": "function priceWithTax(price) {", "line": 1, "correct": false,
   "explanation": "The signature takes exactly what it needs. The problem is what the body does with the result."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'read-code-assignment-in-if', 'Every account shows as an administrator',
    'Ordinary users are seeing the admin dashboard.',
    NULL,
    'auth', 'comparison', 'find_line',
$code$function isAdmin(role) {
  if (role = "admin") {
    return true;
  }
  return false;
}$code$,
    ARRAY[
        'The function returns true for every role that goes in.',
        'Look very carefully at the operator inside the condition.',
        'A single = assigns; comparing needs ===.'
    ], 1,
$opts$[
  {"text": "  if (role = \"admin\") {", "line": 2, "correct": true,
   "explanation": "A single = assigns rather than compares. The assignment produces \"admin\", which is truthy, so the condition is always true."},
  {"text": "    return true;", "line": 3, "correct": false,
   "explanation": "Returning true is correct for an admin. The problem is that the line above lets everyone reach it."},
  {"text": "  return false;", "line": 5, "correct": false,
   "explanation": "This is the right fallback, but nothing ever gets this far."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'read-code-length-as-index', 'Last item in a report is always blank',
    'Every stock report ends with an empty value where the final item should be.',
    NULL,
    'inventory', 'off-by-one', 'find_line',
$code$const items = ["nuts", "bolts", "screws"];
const last = items[items.length];
console.log(last);$code$,
    ARRAY[
        'The array has three items. What are their index numbers?',
        'Indexes start at 0, so the last one is not the same as the count.',
        'items.length is 3, but the highest index is 2.'
    ], 1,
$opts$[
  {"text": "const last = items[items.length];", "line": 2, "correct": true,
   "explanation": "Indexes run 0 to length - 1, so items[3] is past the end and gives undefined. Use items[items.length - 1], or items.at(-1)."},
  {"text": "const items = [\"nuts\", \"bolts\", \"screws\"];", "line": 1, "correct": false,
   "explanation": "Three ordinary items. Nothing about the array itself is wrong."},
  {"text": "console.log(last);", "line": 3, "correct": false,
   "explanation": "This faithfully prints whatever the line above produced, which happens to be undefined."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'read-code-property-case', 'Greeting shows "Hi undefined"',
    'The welcome banner reads "Hi undefined" for every signed-in user.',
    NULL,
    'profiles', 'return-value', 'find_line',
$code$const user = { firstName: "Ada" };
const greeting = "Hi " + user.firstname;
console.log(greeting);$code$,
    ARRAY[
        'The object does have a name in it, so the data is not missing.',
        'Compare the property name where it is defined with where it is read.',
        'Property names are case-sensitive: firstName is not firstname.'
    ], 1,
$opts$[
  {"text": "const greeting = \"Hi \" + user.firstname;", "line": 2, "correct": true,
   "explanation": "The property is firstName. Reading a property that does not exist gives undefined rather than an error, which is why this fails quietly."},
  {"text": "const user = { firstName: \"Ada\" };", "line": 1, "correct": false,
   "explanation": "The object is fine and the name is there. The next line asks for it by a slightly different name."},
  {"text": "console.log(greeting);", "line": 3, "correct": false,
   "explanation": "Prints exactly what it was given. The string was already wrong by this point."}
]$opts$
);


-- ===========================================================================
-- LEVEL 3 -- investigate. Not "what is wrong" but "what would you check?"
-- ===========================================================================

SELECT seed_bug_hunt_incident(
    'investigate-types-concat', 'Order totals are being glued together',
    'A 5 and a 10 come out as 510 rather than 15. What should you inspect FIRST?',
    NULL,
    'payments', 'type-coercion', 'choose_patch',
$code$function add(a, b) {
  return a + b;
}
const result = add(5, "10");$code$,
    ARRAY[
        'The symptom is two numbers stuck together rather than added.',
        '+ joins strings and adds numbers, so the answer depends on the types.',
        'Check what a and b actually ARE before assuming they are numbers.'
    ], 2,
$opts$[
  {"text": "console.log(typeof a, typeof b);", "correct": true,
   "explanation": "The symptom -- joining instead of adding -- points straight at the types. This tells you which argument arrived as a string, which is the actual question."},
  {"text": "console.log(result);", "correct": false,
   "explanation": "You already know result is wrong. Logging it again confirms the symptom without moving you any closer to the cause."},
  {"text": "console.log(a + b);", "correct": false,
   "explanation": "This repeats the exact computation that is failing. It reproduces the problem rather than explaining it."},
  {"text": "console.log(\"add was called\");", "correct": false,
   "explanation": "Tells you the function ran, which was never in doubt. Useful when nothing happens at all, not when the answer is wrong."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'investigate-empty-filter', 'Active user list is always empty',
    'The dashboard shows no active users even though the API returns plenty. What should you inspect FIRST?',
    NULL,
    'profiles', 'comparison', 'choose_patch',
$code$const users = await getUsers();
const active = users.filter((u) => u.isActive);
console.log(active.length);$code$,
    ARRAY[
        'The list arrives full and leaves empty, so the filter rejects everything.',
        'A filter rejects everything when the test is never true for any item.',
        'Look at the real shape of one user before trusting the property name.'
    ], 2,
$opts$[
  {"text": "console.log(users[0]);", "correct": true,
   "explanation": "Looking at one real item shows you the actual property names. If the field is called active rather than isActive, u.isActive is undefined for every user and the filter keeps none."},
  {"text": "console.log(active);", "correct": false,
   "explanation": "You already know it is empty -- that is the bug report. This tells you nothing new."},
  {"text": "console.log(users.length);", "correct": false,
   "explanation": "Worth knowing, but the report already says the API returns plenty. It rules out the one thing you were not worried about."},
  {"text": "console.log(\"filtering users\");", "correct": false,
   "explanation": "Confirms the line ran. Presence is not the problem here; the data is."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'investigate-nan-total', 'Basket total shows NaN',
    'The basket total reads NaN once a certain item is added. What should you inspect FIRST?',
    NULL,
    'payments', 'type-coercion', 'choose_patch',
$code$let total = 0;
for (const item of items) {
  total += item.price;
}$code$,
    ARRAY[
        'NaN appears when arithmetic is done on something that is not a number.',
        'It only happens for certain items, so most of them are fine.',
        'You need to see the individual value each pass, not the running total.'
    ], 2,
$opts$[
  {"text": "console.log(item.price);", "correct": true,
   "explanation": "Logging inside the loop shows every price as it is added, so the one that is undefined or a string is immediately visible. NaN spreads, so the first bad value is what you need."},
  {"text": "console.log(total);", "correct": false,
   "explanation": "Once one NaN enters, every later total is NaN too. The final value tells you it broke, not where."},
  {"text": "console.log(items.length);", "correct": false,
   "explanation": "The count is not in question -- the report says it happens with a particular item, not with none."},
  {"text": "console.log(typeof total);", "correct": false,
   "explanation": "NaN is of type number, so this reports \"number\" and looks reassuring while the bug is still there."}
]$opts$
);


-- ===========================================================================
-- LEVEL 4 -- trace. Which line first produces the wrong value?
-- ===========================================================================

SELECT seed_bug_hunt_incident(
    'trace-accumulator-reset', 'Daily revenue equals the last order only',
    'The daily total always matches whatever the final order was, however many came before it.',
    NULL,
    'analytics', 'scope', 'find_line',
$code$const orders = [10, 20, 30];
let total = 0;
for (const amount of orders) {
  total = 0;
  total += amount;
}$code$,
    ARRAY[
        'Trace total through each pass of the loop: 0, then what?',
        'Something inside the loop undoes the work of the previous pass.',
        'An accumulator has to be reset OUTSIDE the loop, not inside it.'
    ], 3,
$opts$[
  {"text": "  total = 0;", "line": 4, "correct": true,
   "explanation": "Resetting inside the loop throws away everything accumulated so far, so only the final pass survives. This line belongs above the loop -- where line 2 already does it."},
  {"text": "  total += amount;", "line": 5, "correct": false,
   "explanation": "Adding the amount is exactly right. It is the line above that keeps wiping the result."},
  {"text": "let total = 0;", "line": 2, "correct": false,
   "explanation": "Initialising once before the loop is correct. The duplicate inside the loop is the problem."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'trace-average-precedence', 'Averages come out slightly too high',
    'Reported averages are consistently a little larger than a hand calculation gives.',
    NULL,
    'analytics', 'off-by-one', 'find_line',
$code$function average(numbers) {
  let sum = 0;
  for (const n of numbers) {
    sum += n;
  }
  return sum / numbers.length - 1;
}$code$,
    ARRAY[
        'The sum is built correctly -- trace it and you get the right total.',
        'Look at what happens to that total on the way out.',
        'Division happens before subtraction, so the - 1 applies to the result.'
    ], 3,
$opts$[
  {"text": "  return sum / numbers.length - 1;", "line": 6, "correct": true,
   "explanation": "The - 1 subtracts from the average rather than from the count, because division binds tighter. An average needs no - 1 at all here."},
  {"text": "    sum += n;", "line": 4, "correct": false,
   "explanation": "The accumulation is correct: trace it and the sum is right every time."},
  {"text": "  let sum = 0;", "line": 2, "correct": false,
   "explanation": "Starting from zero is right, and it is outside the loop where it belongs."}
]$opts$
);


-- ===========================================================================
-- LEVEL 5 -- fix. The smallest correct change.
-- ===========================================================================

SELECT seed_bug_hunt_incident(
    'fix-map-result-discarded', 'Names are never capitalised in the export',
    'The export still contains lowercase names even though the code maps over them.',
    NULL,
    'profiles', 'return-value', 'choose_patch',
$code$const names = ["ada", "grace"];
names.map((n) => n.toUpperCase());
console.log(names);$code$,
    ARRAY[
        'map does not change the array it is called on.',
        'It builds and returns a NEW array. Where does that array go?',
        'The result is thrown away because nothing catches it.'
    ], 3,
$opts$[
  {"text": "const upper = names.map((n) => n.toUpperCase());", "correct": true,
   "explanation": "map returns a new array and leaves the original alone, so the result has to be captured. Log upper rather than names afterwards."},
  {"text": "names.forEach((n) => n.toUpperCase());", "correct": false,
   "explanation": "forEach also discards return values, so this changes nothing either. It swaps one method that does not mutate for another."},
  {"text": "names.map((n) => n.toUpperCase);", "correct": false,
   "explanation": "Dropping the parentheses makes it worse: now each item maps to the function itself rather than to an uppercase string."},
  {"text": "names.sort((n) => n.toUpperCase());", "correct": false,
   "explanation": "sort reorders an array; it has nothing to do with transforming the values inside it."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'fix-loop-boundary', 'Report ends with a blank row',
    'Every generated report has one empty line at the bottom.',
    NULL,
    'inventory', 'off-by-one', 'choose_patch',
$code$for (let i = 0; i <= items.length; i++) {
  addRow(items[i]);
}$code$,
    ARRAY[
        'How many times does this loop run for a three-item array?',
        'The last pass reads an index that is past the end.',
        'Reading past the end gives undefined rather than throwing, so it fails quietly.'
    ], 3,
$opts$[
  {"text": "for (let i = 0; i < items.length; i++) {", "correct": true,
   "explanation": "< rather than <= stops the loop at the last real index. With <= it runs one extra pass and reads undefined."},
  {"text": "for (let i = 1; i <= items.length; i++) {", "correct": false,
   "explanation": "This fixes the extra pass at the end but skips the first item, since indexes start at 0. One bug for another."},
  {"text": "for (let i = 0; i <= items.length - 1; i++) {", "correct": false,
   "explanation": "This is actually correct, but it says the same thing as < items.length in a longer and less familiar way."},
  {"text": "for (let i = 0; i < items.length + 1; i++) {", "correct": false,
   "explanation": "Identical to the original: it still runs one pass too many."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'fix-mutates-caller-array', 'Adding to a basket changes the saved order',
    'Adding an item to a draft basket also modifies the order it was copied from.',
    NULL,
    'inventory', 'mutation', 'choose_patch',
$code$function addItem(list, item) {
  list.push(item);
  return list;
}$code$,
    ARRAY[
        'push changes the array it is called on.',
        'The caller passed in their own array, and it is the same array.',
        'Build a new array instead of changing the one you were given.'
    ], 3,
$opts$[
  {"text": "return [...list, item];", "correct": true,
   "explanation": "Spreading into a new array leaves the caller's untouched. Returning new data instead of editing what you were handed is the safer default."},
  {"text": "list = [...list, item]; return list;", "correct": false,
   "explanation": "Reassigning the parameter only repoints the local name. The caller still holds the original -- though at least it is no longer modified."},
  {"text": "return list.push(item);", "correct": false,
   "explanation": "Still mutates, and now returns the new length instead of the array."},
  {"text": "return list.concat();", "correct": false,
   "explanation": "Copies the list but never adds the item, so the new entry is lost entirely."}
]$opts$
);


-- ===========================================================================
-- LEVEL 6 -- the same skills, with async in the way.
-- ===========================================================================

SELECT seed_bug_hunt_incident(
    'async-missing-await', 'Profile page shows undefined for every name',
    'The name field is undefined even though the API returns the user correctly.',
    NULL,
    'api', 'async', 'find_line',
$code$async function loadName(id) {
  const user = fetchUser(id);
  return user.name;
}$code$,
    ARRAY[
        'fetchUser is asynchronous, so what does it hand back immediately?',
        'A Promise is not the value -- it is the promise of one.',
        'Reading .name from a Promise gives undefined rather than throwing.'
    ], 4,
$opts$[
  {"text": "  const user = fetchUser(id);", "line": 2, "correct": true,
   "explanation": "Without await, user is a Promise rather than the user. Promises have no name property, so reading it gives undefined quietly. It needs await fetchUser(id)."},
  {"text": "  return user.name;", "line": 3, "correct": false,
   "explanation": "Reading .name is the right intent. It fails because of what the line above put into user."},
  {"text": "async function loadName(id) {", "line": 1, "correct": false,
   "explanation": "Marking it async is correct and is what makes await available inside. The body just does not use it."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'async-unhandled-rejection', 'A failed save takes the whole page down',
    'When the save endpoint returns an error the interface stops responding instead of showing a message.',
    NULL,
    'api', 'async', 'choose_patch',
$code$async function save(data) {
  const res = await postData(data);
  return res.id;
}$code$,
    ARRAY[
        'What happens to this function if postData rejects?',
        'An await on a rejected promise throws, exactly like synchronous code.',
        'Nothing here catches that throw, so it escapes to the caller.'
    ], 4,
$opts$[
  {"text": "try { const res = await postData(data); return res.id; } catch { return null; }", "correct": true,
   "explanation": "await turns a rejection into a thrown error, so ordinary try/catch handles it. Returning null lets the caller show a message instead of breaking."},
  {"text": "const res = await postData(data).catch(() => null); return res.id;", "correct": false,
   "explanation": "The rejection is caught, but res is then null and reading res.id throws a TypeError instead. One failure swapped for another."},
  {"text": "const res = postData(data); return res.id;", "correct": false,
   "explanation": "Removing await does not handle the error -- it just means res is a Promise and res.id is undefined."},
  {"text": "return await postData(data).id;", "correct": false,
   "explanation": "This reads .id from the Promise before awaiting it, which is undefined, and still handles no error."}
]$opts$
);

SELECT seed_bug_hunt_incident(
    'async-promise-not-value', 'Dashboard totals show [object Promise]',
    'Every total on the dashboard renders as [object Promise] instead of a number.',
    NULL,
    'analytics', 'async', 'find_line',
$code$async function totals(ids) {
  const values = ids.map((id) => lookup(id));
  return values.reduce((a, b) => a + b, 0);
}$code$,
    ARRAY[
        'lookup is asynchronous. What does map collect?',
        'An array of Promises is not an array of numbers.',
        'Something has to wait for all of them before they can be added.'
    ], 4,
$opts$[
  {"text": "  const values = ids.map((id) => lookup(id));", "line": 2, "correct": true,
   "explanation": "map collects what lookup returns immediately, which is a Promise each time. Wrapping it in await Promise.all(...) turns them into the values."},
  {"text": "  return values.reduce((a, b) => a + b, 0);", "line": 3, "correct": false,
   "explanation": "The reduce is correct for an array of numbers. It receives Promises, which is why adding them produces text."},
  {"text": "async function totals(ids) {", "line": 1, "correct": false,
   "explanation": "Being async is right, and is what allows the await this function needs on the line below."}
]$opts$
);

DROP FUNCTION seed_bug_hunt_incident(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], INTEGER, JSONB);

COMMIT;
