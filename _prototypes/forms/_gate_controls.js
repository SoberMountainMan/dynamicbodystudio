/**
 * Prove the new submission-trust standards CAN FAIL.
 *
 * An unproven check is decoration. This pulls the REAL panelHeadings() and standards()
 * out of _prototypes/forms/_gate.js (not a reimplementation), then runs them against the
 * real pages and against mutated copies of the real pages. Nothing on disk is modified.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

const gateSrc = fs.readFileSync(path.join(ROOT, '_prototypes', 'forms', '_gate.js'), 'utf8');
const start = gateSrc.indexOf('function panelHeadings');
const end = gateSrc.indexOf('(async () => {');
if (start < 0 || end < 0) throw new Error('could not locate the functions in _gate.js');
const { panelHeadings, standards, preflightCall } = new Function(
  gateSrc.slice(start, end) + '\nreturn { panelHeadings, standards, preflightCall };'
)();

console.log('\n--- what the gate actually parsed out of each page ---');
for (const p of ['enrol.html', 'twinkle-toes.html', 'dance-academy.html']) {
  const s = fs.readFileSync(path.join(ROOT, p), 'utf8');
  const pf = preflightCall(s);
  console.log(`  ${p.padEnd(22)} url=${pf ? pf.url : 'NOT FOUND'}  opts=${pf ? pf.opts.trim() : '-'}`);
  console.log(`  ${''.padEnd(22)} headings=${JSON.stringify(panelHeadings(s))}`);
}

const PAGES = ['enrol.html', 'twinkle-toes.html', 'dance-academy.html'];
const NEW = ['panel: no receipt claim', 'panel: refusal states', 'offline guard', 'reachability preflight'];

function report(label, src) {
  const std = standards(src);
  const failed = NEW.filter((k) => !std[k]);
  const total = Object.keys(std).length;
  const pass = Object.values(std).filter(Boolean).length;
  console.log(`  ${label.padEnd(46)} ${pass}/${total}  ${failed.length ? 'FAIL -> ' + failed.join('; ') : 'all new checks pass'}`);
  return failed;
}

console.log('\n=== BASELINE (real pages, unmutated) ===');
let baselineOk = true;
for (const p of PAGES) {
  const failed = report(p, fs.readFileSync(path.join(ROOT, p), 'utf8'));
  if (failed.length) baselineOk = false;
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
];

console.log('\n=== CONTROLS (mutations of the REAL pages) ===');
console.log('  Each mutation must produce a FAIL. A survivor means the check is decoration.\n');
let allCaught = true;
for (const p of PAGES) {
  const original = fs.readFileSync(path.join(ROOT, p), 'utf8');
  for (const [name, fn] of MUTATIONS) {
    const mutated = fn(original);
    if (mutated === original) {
      console.log(`  ${p} :: ${name.padEnd(40)} !! MUTATION DID NOT APPLY (check the regex, not the gate)`);
      allCaught = false;
      continue;
    }
    const failed = report(`${p} :: ${name}`, mutated);
    if (!failed.length) allCaught = false;
  }
}

console.log(`\n=== VERDICT ===`);
console.log(`  baseline clean      : ${baselineOk}`);
console.log(`  every mutation caught: ${allCaught}`);
console.log(baselineOk && allCaught
  ? '\n  The new standards are real: green on the shipped pages, red on every mutation.'
  : '\n  SOMETHING SURVIVED - investigate before trusting the gate.');
