/**
 * Prove the gate's standards CAN FAIL.
 *
 * An unproven check is decoration. This pulls the REAL panelHeadings() / preflightCall() /
 * emailInputName() / standards() out of _prototypes/forms/_gate.js (not a reimplementation),
 * then runs them against the real pages and against mutated copies of the real pages.
 * Nothing on disk is modified.
 *
 * Run: node _prototypes/forms/_gate_controls.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

const gateSrc = fs.readFileSync(path.join(ROOT, '_prototypes', 'forms', '_gate.js'), 'utf8');
// Slice from the FIRST helper standards() depends on, not from panelHeadings(). Slicing too
// late silently drops helpers: pageTag() sat above the old start point, so the field-cap
// standard could never run here and its mutations "survived" - a harness bug that looks
// exactly like a passing check.
const start = gateSrc.indexOf('function postedFields');
const end = gateSrc.indexOf('(async () => {');
if (start < 0 || end < 0) throw new Error('could not locate the functions in _gate.js');
const { panelHeadings, preflightCall, emailInputName, standards } = new Function(
  gateSrc.slice(start, end) + '\nreturn { panelHeadings, preflightCall, emailInputName, standards };'
)();

// The live facts each page is checked against. Measured from the published forms via
// d[1][10][6]: the academy form collects email, the other two do not. The academy's item
// list carries the ONE field-level cap in the estate - the indemnity, max 10 characters
// (q[4] = [[6,202,["10"]]]). Without it in here the field-cap standard cannot fire, and its
// mutations would pass no matter what the page said.
const LIVE = {
  'enrol.html':         { collectsEmail: false, emailFlag: 1, emailFlagKnown: true, items: [], title: '', desc: '' },
  'dance-academy.html': { collectsEmail: true,  emailFlag: 3, emailFlagKnown: true, title: '', desc: '',
                          items: [{ eid: 903878165, label: 'Indemnity', type: 1, required: true, options: [], maxLen: 10 }] },
  'twinkle-toes.html':  { collectsEmail: false, emailFlag: 1, emailFlagKnown: true, items: [], title: '', desc: '' },
};
const PAGES = Object.keys(LIVE);

const WATCHED = [
  'panel: no receipt claim', 'panel: refusal states', 'offline guard', 'reachability preflight',
  'email: present iff the form wants it', 'email: posted as emailAddress',
  'field caps: page respects the form limit',
];

function report(label, src, live) {
  const std = standards(src, live);
  const failed = WATCHED.filter((k) => !std[k]);
  const pass = Object.values(std).filter(Boolean).length;
  console.log(`  ${label.padEnd(54)} ${pass}/${Object.keys(std).length}  `
    + (failed.length ? 'FAIL -> ' + failed.join('; ') : 'ok'));
  return failed;
}

console.log('\n--- what the gate parses out of each page ---');
for (const p of PAGES) {
  const s = fs.readFileSync(path.join(ROOT, p), 'utf8');
  const pf = preflightCall(s);
  console.log(`  ${p}`);
  console.log(`     email input : ${JSON.stringify(emailInputName(s))}`);
  console.log(`     preflight   : ${pf ? pf.url + '  [' + pf.opts.trim() + ']' : 'NOT FOUND'}`);
  console.log(`     headings    : ${panelHeadings(s).length}`);
}

console.log('\n=== BASELINE (real pages, unmutated) ===');
let baselineOk = true;
for (const p of PAGES) {
  if (report(p, fs.readFileSync(path.join(ROOT, p), 'utf8'), LIVE[p]).length) baselineOk = false;
}
console.log(`  baseline clean: ${baselineOk}`);

const MUTATIONS = [
  ['heading reverted to a receipt claim', (s) => s.replace(
    /<h2 id="thanksHead">[^<]*<\/h2>/,
    '<h2 id="thanksHead">Thank you &mdash; your form is in.</h2>')],
  ['receipt claim re-added via script', (s) => s.replace(
    /head\.innerHTML = 'Not sent &mdash; you appear to be offline';/,
    "head.innerHTML = 'Thank you - your enrolment has been received';")],
  ['offline guard removed', (s) => s.replace(/if\(navigator\.onLine === false\)\{/g, 'if(false){')],
  ['reachability preflight removed', (s) => s.replace(/generate_204/g, 'generate_999')],
  ['no-cors mode dropped', (s) => s.replace(/mode: 'no-cors'/g, "mode: 'cors'")],
  ['unreachable state removed', (s) => s.replace(/'unreachable'/g, "'gone'")],
  // email collection - the third cause of the failed submission
  ['email input removed', (s) => s.replace(/[ \t]*<input type="email"[^>]*>\n/, '')],
  ['email renamed off emailAddress', (s) => s.replace(/name="emailAddress"/g, 'name="email"')],
  ['email name attribute removed', (s) => s.replace(/ name="emailAddress"/g, '')],
  // The other direction: a form that does NOT collect email must not grow an email field.
  ['email added where the form wants none', (s) => s.replace(
    /<form id="([a-z]+)" method="post"/,
    '<form id="$1" method="post"><input type="email" name="emailAddress" required>')],
  // field caps - the FOURTH cause of the failed submission. The academy indemnity is capped
  // at 10 characters by the form; the page asked for a 12-character phrase, so Google
  // rejected every academy submission with a 400. Both directions must be caught.
  ['field cap ignored (maxlength exceeds the form limit)', (s) => s.replace(
    /maxlength="10"/g, 'maxlength="99"')],
  ['field cap dropped entirely (no maxlength)', (s) => s.replace(
    / required maxlength="10" placeholder="I ACCEPT"/, ' required placeholder="I ACCEPT"')],
];

console.log('\n=== CONTROLS (mutations of the REAL pages) ===');
console.log('  Every applicable mutation must produce a FAIL. A survivor = decoration.\n');
let allCaught = true;
const caughtBy = new Map(MUTATIONS.map(([n]) => [n, 0]));

for (const p of PAGES) {
  const original = fs.readFileSync(path.join(ROOT, p), 'utf8');
  for (const [name, fn] of MUTATIONS) {
    const mutated = fn(original);
    if (mutated === original) continue;                 // not applicable to this page
    const failed = report(`${p} :: ${name}`, mutated, LIVE[p]);
    if (failed.length) caughtBy.set(name, caughtBy.get(name) + 1);
  }
}

console.log('\n  mutation coverage across the three pages:');
for (const [n, c] of caughtBy) {
  console.log(`    ${c > 0 ? 'caught' : '*** SURVIVED ***'}  ${String(c).padStart(2)}x  ${n}`);
  if (c === 0) allCaught = false;
}

console.log('\n=== VERDICT ===');
console.log(`  baseline clean       : ${baselineOk}`);
console.log(`  every mutation caught: ${allCaught}`);

// --- the OTHER direction: a guard must not cry wolf --------------------------------
// A check that fails a correct page gets switched off, so a false failure is its own
// defect. The field-cap standard reads a rule KIND it can interpret (202 = maximum
// character count, known by measurement). The owner is changing the indemnity to a
// MINIMUM of 1 - an unrecognised kind. Reading that "1" as "max 1 character" would fail
// the real page. This asserts the opposite, permanently, so the guard cannot regress
// into a false alarm.
const NO_FALSE_FAIL = [
  ['rule kind 203 (a minimum) value ["1"]', { maxLen: null, unknownRule: { kind: 203, value: '["1"]' } }],
  ['rule kind 999 (unknown)',               { maxLen: null, unknownRule: { kind: 999, value: '["x"]' } }],
  ['no rule at all',                        {}],
];
const CAP = 'field caps: page respects the form limit';
let noFalseFails = true;
console.log('\n=== MUST NOT FAIL (a guard that cries wolf gets switched off) ===');
for (const [label, item] of NO_FALSE_FAIL) {
  const live = Object.assign({}, LIVE['dance-academy.html'], {
    items: [Object.assign({ eid: 903878165, label: 'Indemnity', type: 1, required: true, options: [] }, item)],
  });
  const src = fs.readFileSync(path.join(ROOT, 'dance-academy.html'), 'utf8');
  const ok = standards(src, live)[CAP] === true;
  if (!ok) noFalseFails = false;
  console.log(`  ${ok ? 'ok  ' : '*** FALSE FAIL ***'}  ${label}`);
}

console.log(baselineOk && allCaught && noFalseFails
  ? '\n  The standards are real: green on the shipped pages, red on every mutation, and quiet on rules they cannot read.'
  : '\n  SOMETHING SURVIVED OR A FALSE FAIL APPEARED - investigate before trusting the gate.');
