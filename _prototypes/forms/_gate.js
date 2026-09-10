/**
 * Consolidated verification gate - dynamicbodystudio branded forms.
 *
 * ANSWERS TWO QUESTIONS ONLY:
 *   1. Does each prototype POST every field Vicky's live Google Form actually has?
 *   2. Does each prototype obey the static-hosting contract (hidden iframe etc)?
 *
 * READ ONLY. It scrapes the public form definition JSON. It never submits anything.
 *
 * Run:  node _gate.js
 * Exit: 0 = all green (or only known blockers), 1 = a real defect found.
 *
 * WHY THIS EXISTS:
 *   Google hides most entry ids inside a JS blob (FB_PUBLIC_LOAD_DATA_). Grepping the
 *   raw HTML for "entry.NNNN" only finds multiple-choice fields, so it silently
 *   under-reports. A form can look complete and still drop half the answers.
 */

const FORMS = [
  { file: 'enrol.html',          name: 'Studio enrolment',     id: '1FAIpQLScUjlphaXJ6ksgb_6ytG1qITaeXotwPHDWMG0FdgS-SIDGBfg' },
  { file: 'dance-academy.html',  name: 'Dance Academy (2025)', id: '1FAIpQLSebxWQdjCNynd54xYgWCmeKOJ2i01pqzXktQAQwulba8MgK1w' },
  { file: 'twinkle-toes.html',   name: 'Twinkle Toes Ballet',  id: '1FAIpQLSdEv2X_6RxEyls1uzopEZ9L0VUf2szAHLSz847LRCnrJPpUCA' },
];

const ROOT = 'C:/WildLogic/dynamicbodystudio/';

/**
 * Deliberate, DOCUMENTED omissions: formId -> { entryId: reason }.
 *
 * A skip only belongs here if (a) it cannot be posted from a static page, or
 * (b) the field is junk - and (c) the reason is ALSO written into the prototype
 * as an HTML comment and into ORCHESTRATOR.md. Three places, same reason.
 * Anything listed here is an open action for Vicky, not a closed decision.
 */
const SKIP = {
  // Studio enrolment - required file upload
  '1FAIpQLScUjlphaXJ6ksgb_6ytG1qITaeXotwPHDWMG0FdgS-SIDGBfg': {
    859802356: 'FILE upload, REQUIRED in her form. Cannot post a file cross-origin. '
             + 'VICKY ACTION: make optional, else submissions may be rejected.',
  },
  // Twinkle Toes - required file upload + a junk placeholder field
  '1FAIpQLSdEv2X_6RxEyls1uzopEZ9L0VUf2szAHLSz847LRCnrJPpUCA': {
    2009902291: 'FILE upload, REQUIRED in her form. Cannot post a file cross-origin. '
              + 'VICKY ACTION: make optional, else submissions may be rejected.',
    1964413680: 'Untitled radio whose only option is literally "Option 1" - a Google Forms '
              + 'default artifact, not a real question. Optional, so blank is fine. '
              + 'VICKY ACTION: delete the field.',
  },
};

// FB_PUBLIC_LOAD_DATA_ item types we care about.
const TYPE = { 0:'SHORT', 1:'PARA', 2:'RADIO', 3:'DROPDOWN', 4:'CHECKBOX', 5:'LINEAR', 9:'FILE', 7:'GRID' };

async function liveFields(id) {
  const res = await fetch(`https://docs.google.com/forms/d/e/${id}/viewform`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${id}`);
  const html = await res.text();

  const m = html.match(/var FB_PUBLIC_LOAD_DATA_ = (.*?);\s*<\/script>/s);
  if (!m) throw new Error(`no FB_PUBLIC_LOAD_DATA_ for ${id}`);
  const data = JSON.parse(m[1]);

  const items = data?.[1]?.[1] ?? [];
  const out = [];
  for (const it of items) {
    if (!Array.isArray(it)) continue;
    const label = it[1] ?? '(untitled)';
    const type  = it[3];
    const q     = it[4]?.[0] ?? [];
    const eid   = q[0];
    const opts  = (q[1] ?? []).map(o => o[0]).filter(v => v && typeof v === 'string');
    const req   = !!(q[2] & 1);
    if (typeof eid === 'number') out.push({ eid, label, type, required: req, options: opts });
  }
  return out;
}

function postedFields(src) {
  // every name="entry.NNNN" in the prototype
  const names = new Set();
  for (const mm of src.matchAll(/name=["']entry\.(\d+)["']/g)) names.add(Number(mm[1]));
  return names;
}

function optionValues(src, eid) {
  const vals = new Set();
  // value="X" on any input/option belonging to this entry
  const re = new RegExp(`<input[^>]*name=["']entry\\.${eid}["'][^>]*>`, 'g');
  for (const tag of src.match(re) ?? []) {
    const v = tag.match(/value=["']([^"']*)["']/);
    if (v) vals.add(v[1]);
  }
  const sel = src.match(new RegExp(`<select[^>]*name=["']entry\\.${eid}["'][^>]*>([\\s\\S]*?)</select>`));
  if (sel) for (const mm of sel[1].matchAll(/value=["']([^"']*)["']/g)) vals.add(mm[1]);
  return vals;
}

function standards(src) {
  const checks = {
    'title tag':        /<title>[^<]+<\/title>/.test(src),
    'viewport meta':    /name=["']viewport["']/.test(src),
    'posts to gforms':  /docs\.google\.com\/forms\/d\/e\/[^/]+\/formResponse/.test(src),
    'hidden iframe':    /<iframe[^>]+name=["']hidden_iframe["']/i.test(src),
    'onsubmit guard':   /onsubmit=["']return\s+\w+\(\)/i.test(src),
    'fbzx token':       /name=["']fbzx["']\s+value=["']-?\d+["']/.test(src),
    'fvv+pageHistory':  /name=["']fvv["']/.test(src) && /name=["']pageHistory["']/.test(src),
    'print css':        /@media\s+print/.test(src),
  };
  return checks;
}

(async () => {
  let hardFail = false;
  const summary = [];

  for (const f of FORMS) {
    const src = require('fs').readFileSync(ROOT + f.file, 'utf8');
    let live;
    try {
      live = await liveFields(f.id);
    } catch (e) {
      console.log(`\n${f.name}: CANNOT VERIFY - ${e.message}`);
      hardFail = true;
      continue;
    }

    const posted = postedFields(src);
    const blockers = [];   // FILE upload - cannot be posted from a static page; needs Vicky
    const defects  = [];   // anything else we should have posted but did not - my fault
    const badOpts = [];
    let matched = 0;

    const skip = SKIP[f.id] ?? {};

    for (const q of live) {
      if (!posted.has(q.eid)) {
        const line = `entry.${q.eid} [${TYPE[q.type] ?? q.type}] "${q.label.slice(0, 45)}"` +
                     `${q.required ? ' REQUIRED' : ''}` +
                     (q.options.length ? `  opts=${JSON.stringify(q.options)}` : '');
        if (skip[q.eid]) blockers.push(`${line}\n         SKIPPED ON PURPOSE: ${skip[q.eid]}`);
        else defects.push(line);   // not in SKIP = I have no excuse, this is my bug
        continue;
      }
      matched++;
      // Option strings must match byte-for-byte or Google silently drops the answer.
      for (const o of q.options) {
        const vals = optionValues(src, q.eid);
        if (vals.size && !vals.has(o)) badOpts.push(`entry.${q.eid}: ${JSON.stringify(o)}`);
      }
    }

    const stray = [...posted].filter(n => !live.some(q => q.eid === n));

    console.log(`\n=== ${f.name} (${f.file}) ===`);
    console.log(`  fields matched : ${matched}/${live.length}`);
    console.log(`  stray ids      : ${stray.length ? stray.map(n => 'entry.' + n).join(', ') : 'none'}`);
    console.log(`  bad options    : ${badOpts.length}`);
    badOpts.forEach(b => console.log(`      BAD ${b}`));
    if (defects.length) {
      console.log(`  DEFECTS (not posted, my fault):`);
      defects.forEach(b => console.log(`      ! ${b}`));
    }
    if (blockers.length) {
      console.log(`  BLOCKERS (FILE upload - needs Vicky, not fixable here):`);
      blockers.forEach(b => console.log(`      ~ ${b}`));
    }

    const std = standards(src);
    const failed = Object.entries(std).filter(([, v]) => !v).map(([k]) => k);
    console.log(`  standards      : ${Object.values(std).filter(Boolean).length}/${Object.keys(std).length}` +
                (failed.length ? `  FAIL:${JSON.stringify(failed)}` : ''));

    if (badOpts.length || stray.length || failed.length || defects.length) hardFail = true;
    summary.push({ name: f.name, matched, total: live.length, badOpts: badOpts.length,
                   stray: stray.length, std: `${Object.values(std).filter(Boolean).length}/${Object.keys(std).length}`,
                   defects: defects.length, blockers: blockers.length });
  }

  // hub
  const hub = require('fs').readFileSync(ROOT + 'forms.html', 'utf8');
  // Only relative links are checkable on disk. Absolute URLs are canonical/og:url
  // metadata pointing at the not-yet-deployed page - NOT navigation, not a defect.
  const links = [...hub.matchAll(/href=["']([^"']+\.html)["']/g)]
    .map(m => m[1])
    .filter(l => !/^(https?:|mailto:|tel:|#)/.test(l));
  const missing = links.filter(l => !require('fs').existsSync(ROOT + l));
  console.log(`\n=== forms.html (hub) ===`);
  console.log(`  links: ${links.length}  missing: ${missing.length ? missing.join(', ') : 'none'}`);
  if (missing.length) hardFail = true;

  console.log('\n--- SUMMARY ---');
  summary.forEach(s => console.log(
    `  ${s.name.padEnd(22)} ${String(s.matched).padStart(2)}/${s.total} fields  badOpts=${s.badOpts}  stray=${s.stray}  std=${s.std}  defects=${s.defects}  blockers=${s.blockers}`));

  console.log(hardFail
    ? '\nGATE: FAIL - code defects present'
    : '\nGATE: PASS - no code defects (blockers listed above are owner/client actions)');
  process.exit(hardFail ? 1 : 0);
})();
