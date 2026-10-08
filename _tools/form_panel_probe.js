/**
 * Probe the form status panel. NOTHING here creates a row: the two states that would
 * post real data are never exercised (see TEST-FORM-RECIPE.md - that needs a throwaway
 * copy of the form).
 *
 * Cases:
 *   OFFLINE      navigator.onLine false            -> expect "Not sent ... offline"
 *   PROBE FAILS  every request to docs.google.com dies -> expect "Not sent ... could not reach"
 *   POST FAILS   probe OK, but the POST itself dies    -> RESIDUAL, see note below
 *   POST STALLS  probe OK, POST never answered         -> expect "could not confirm"
 *
 * The POST-FAILS case is the honest limit of a static page: if Google is reachable for a
 * GET but the POST specifically fails, the hidden iframe fires onload on the browser's
 * error page and no cross-origin-readable signal distinguishes that from a real reply.
 * It is measured here so the limit is known rather than assumed.
 */
const path = require('path');
const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..');

async function fillRequired(page, formId) {
  return page.evaluate((fid) => {
    const form = document.getElementById(fid);
    const fire = (el, t) => el.dispatchEvent(new Event(t, { bubbles: true }));
    const set = (el, v) => {
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (!el.checked) { el.checked = true; fire(el, 'change'); fire(el, 'input'); }
      } else { el.value = v; fire(el, 'input'); fire(el, 'change'); }
    };
    const groups = {};
    for (const r of form.querySelectorAll('input[type=radio]')) (groups[r.name] ||= []).push(r);
    for (const n of Object.keys(groups)) set(groups[n][0]);
    for (const el of form.querySelectorAll('input, select, textarea')) {
      if (el.type === 'radio' || el.type === 'hidden') continue;
      if (el.type === 'checkbox') { set(el); continue; }
      if (el.tagName === 'SELECT') { if (el.options.length > 1) { el.selectedIndex = 1; fire(el, 'change'); } continue; }
      if (el.tagName === 'TEXTAREA') { set(el, 'probe'); continue; }
      if (el.type === 'email') { set(el, 'probe@example.com'); continue; }
      if (el.type === 'tel') { set(el, '0615875852'); continue; }
      if (el.type === 'number') { set(el, '1'); continue; }
      if (el.type === 'date') { set(el, '2026-10-08'); continue; }
      if (el.type === 'text') { set(el, 'probe'); continue; }
    }
    for (const id of ['popia', 'reg']) { const el = document.getElementById(id); if (el) set(el); }
    const indem = document.getElementById('d6'); if (indem) set(indem, 'Yes I accept');
    const invalid = [...form.querySelectorAll('input, select, textarea')]
      .filter((el) => el.willValidate && !el.checkValidity())
      .map((el) => (el.name || el.id || el.type));
    return { valid: form.checkValidity(), invalid: invalid.slice(0, 6) };
  }, formId);
}

const panelState = (page) => page.evaluate(() => {
  const t = document.getElementById('thanks');
  return {
    shown: t && getComputedStyle(t).display !== 'none',
    head: (document.getElementById('thanksHead') || {}).textContent || '',
  };
});

async function run(file, formId, label, setup, waitMs) {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('file:///' + path.join(ROOT, file).replace(/\\/g, '/'),
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  // Wait for the page's own submit handler to exist. Without this, requestSubmit() can fire
  // before the inline script has parsed, and the form submits natively - a probe that
  // silently measures a different code path than the one it means to test.
  await page.waitForFunction(() => typeof window.submitForm === 'function', { timeout: 20000 });

  const seen = { probe: 0, post: 0 };
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    const isProbe = /generate_204/.test(u);
    const isPost = /formResponse/.test(u);
    if (isProbe) seen.probe++;
    if (isPost) seen.post++;
    if (setup.abortAll && (isProbe || isPost)) return r.abort();
    if (setup.abortPost && isPost) return r.abort();
    if (setup.stallPost && isPost) return;      // never answered
    r.continue();
  });

  const fill = await fillRequired(page, formId);
  if (setup.offline) await page.setOfflineMode(true);
  await page.evaluate((fid) => { document.getElementById(fid).requestSubmit(); }, formId);
  await new Promise((r) => setTimeout(r, waitMs));

  const st = await panelState(page);
  await browser.close();

  console.log(`\n=== ${label}  (${file}) ===`);
  console.log(`  validation passed   : ${fill.valid}${fill.invalid.length ? '  (still invalid: ' + fill.invalid.join(',') + ')' : ''}`);
  console.log(`  probe requests      : ${seen.probe}   post requests: ${seen.post}`);
  console.log(`  panel shown         : ${st.shown}`);
  console.log(`  heading             : ${st.head.trim()}`);
  return st;
}

(async () => {
  const cases = [
    ['enrol.html', 'enrol', 'OFFLINE', { offline: true }, 3000],
    ['dance-academy.html', 'dda', 'OFFLINE', { offline: true }, 3000],
    ['twinkle-toes.html', 'tt', 'OFFLINE', { offline: true }, 3000],
    ['enrol.html', 'enrol', 'PROBE FAILS (network-layer)', { abortAll: true }, 4000],
    ['enrol.html', 'enrol', 'POST FAILS (probe OK) - residual', { abortPost: true }, 4000],
    ['enrol.html', 'enrol', 'POST STALLS (15s guard)', { stallPost: true }, 20000],
  ];
  for (const c of cases) await run(...c);
  console.log('\nNo row was created in any case.');
})();
