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
const start = gateSrc.indexOf('function panelHeadings');
const end = gateSrc.indexOf('(async () => {');
if (start < 0 || end < 0) throw new Error('could not locate the functions in _gate.js');
const { panelHeadings, preflightCall, emailInputName, standards } = new Function(
  gateSrc.slice(start, end) + '\nreturn { panelHeadings, preflightCall, emailInputName, standards };'
)();

// The live facts each page is checked against. Measured from the published forms via
// d[1][10][6]: the academy form collects email, the other two do not.
const LIVE = {
  'enrol.html':         { collectsEmail: false, emailFlag: 1, emailFlagKnown: true, items: [], title: '', desc: '' },
  'dance-academy.html': { collectsEmail: true,  emailFlag: 3, emailFlagKnown: true, items: [], title: '', desc: '' },
  'twinkle-toes.html':  { collectsEmail: false, emailFlag: 1, emailFlagKnown: true, items: [], title: '', desc: '' },
};
const PAGES = Object.keys(LIVE);

const WATCHED = [
  'panel: no receipt claim', 'panel: refusal states', 'offline guard', 'reachability preflight',
  'email: present iff the form wants it', 'email: posted as emailAddress',
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
console.log(baselineOk && allCaught
  ? '\n  The standards are real: green on the shipped pages, red on every mutation.'
  : '\n  SOMETHING SURVIVED - investigate before trusting the gate.');
