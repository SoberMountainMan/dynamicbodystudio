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
  { file: 'dance-academy.html',  name: 'Dance Academy 2026', id: '1FAIpQLSebxWQdjCNynd54xYgWCmeKOJ2i01pqzXktQAQwulba8MgK1w' },
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
  // Twinkle Toes - one junk placeholder field.
  // NOTE 2026-10-08: the two entries that used to live here ("FILE upload, REQUIRED ... cannot
  // post a file cross-origin") were WRONG - those fields are DATES, which post fine. Removing
  // them from SKIP is the point: they are now reported as DEFECTS, because not posting them is
  // our gap, not a client blocker.
  '1FAIpQLSdEv2X_6RxEyls1uzopEZ9L0VUf2szAHLSz847LRCnrJPpUCA': {
    1964413680: 'Untitled radio whose only option is literally "Option 1" - a Google Forms '
              + 'default artifact, not a real question. Optional, so blank is fine. '
              + 'VICKY ACTION: delete the field.',
  },
};

// FB_PUBLIC_LOAD_DATA_ item types we care about.
// 9 = DATE, *not* file upload. VERIFIED 2026-10-08 against the published render: both
// entry.859802356 (studio) and entry.2009902291 (ballet) render as a "Date / yyyy/mm/dd"
// box, and they are the only type=9 items in the whole estate.
// This entry used to read 9:'FILE'. That one wrong constant invented a "required file upload"
// blocker that did not exist, and it held two finished pages back from parents for a month.
// Unknown codes print as their raw number ON PURPOSE - never guess a code from memory.
const TYPE = { 0:'SHORT', 1:'PARA', 2:'RADIO', 3:'DROPDOWN', 4:'CHECKBOX', 5:'LINEAR', 7:'GRID', 9:'DATE' };

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
  // The description (d[1][0]) is where the client puts DATES - e.g. "30 November - 19 December 2026".
  // We shipped a page for months without it, because this gate only ever read the question items.
  // Title is d[1][8]. Return both so every run prints them.
  // EMAIL COLLECTION IS A FORM-LEVEL SETTING, NOT A QUESTION. It renders as an "Email *" box
  // above question 1, so it NEVER appears in the item list above - and we shipped the academy
  // page for a month while the form REQUIRED it, which rejected every submission from it.
  //
  // Measured 2026-10-08, three forms, by rendering the published form and submitting it empty:
  //   d[1][10][6] === 3  -> the academy form. Renders a required "Email *" input; an empty
  //                         submit is refused with "Email * This is a required question"; the
  //                         real POST body carries `emailAddress`.
  //   d[1][10][6] === 1  -> studio and ballet. 0 email inputs, no such error.
  // Three samples is a thin basis for a constant, so an UNRECOGNISED value warns instead of
  // silently passing. That is the type=9 lesson: never let a guessed constant fail quietly.
  const emailFlag = data?.[1]?.[10]?.[6] ?? null;
  const EMAIL_FLAG_COLLECTS = 3;
  const EMAIL_FLAG_KNOWN = [1, 3];

  return {
    items: out,
    title: data?.[1]?.[8] ?? '',
    desc:  data?.[1]?.[0] ?? '',
    emailFlag,
    collectsEmail: emailFlag === EMAIL_FLAG_COLLECTS,
    emailFlagKnown: EMAIL_FLAG_KNOWN.includes(emailFlag),
  };
}

function postedFields(src) {
  // Every name="entry.NNNN..." in the prototype. Capture the FULL suffix, not just the
  // digits: a DATE question posts as entry.NNNN_year/_month/_day, so a digits-only match
  // cannot see it and would report a posted field as missing.
  const names = new Set();
  for (const mm of src.matchAll(/name=["']entry\.([0-9A-Za-z_]+)["']/g)) names.add(mm[1]);
  return names;
}

/**
 * Is this live question posted by the page?
 * DATE (type 9) is the special case: Google renders it as three hidden inputs
 * (_year/_month/_day) and never as a single entry.NNNN. Measured by rendering the real
 * form in headless Chrome and reading the input elements - see ORCHESTRATOR.md.
 * Returns { ok, detail } so a partial date (year but no month) is visible, not silent.
 */
function isPosted(posted, q) {
  if (q.type === 9) {
    const parts = ['_year', '_month', '_day'];
    const have = parts.filter((p) => posted.has(String(q.eid) + p));
    return {
      ok: have.length === 3,
      detail: have.length === 3 ? '' : `DATE posted as ${have.length}/3 parts (${have.map((h) => 'entry.' + q.eid + h).join(', ') || 'none'})`,
    };
  }
  return { ok: posted.has(String(q.eid)), detail: '' };
}

/** Which posted names belong to no live question (allowing for the date parts). */
function strayFields(posted, items) {
  const allowed = new Set();
  for (const q of items) {
    if (q.type === 9) { allowed.add(`${q.eid}_year`); allowed.add(`${q.eid}_month`); allowed.add(`${q.eid}_day`); }
    else allowed.add(String(q.eid));
  }
  return [...posted].filter((n) => !allowed.has(n)).map((n) => 'entry.' + n);
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

// Every string the status panel can actually DISPLAY. Taken from the panel's default
// <h2> and from each `head.innerHTML = '...'` assignment in the script - deliberately
// NOT from a plain text search, because the surrounding comments legitimately mention
// the old wording ("this page used to say ...") and a naive search would fail on them.
function panelHeadings(src) {
  const out = [];
  const m = src.match(/<div id=["']thanks["'][^>]*>[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/i);
  if (m) out.push(m[1]);
  for (const mm of src.matchAll(/head\.innerHTML\s*=\s*'([^']*)'/g)) out.push(mm[1]);
  return out.map((s) => s.replace(/\s+/g, ' ').trim());
}

// The ACTUAL preflight call, parsed out of the script - not a text search. A text search
// for 'no-cors' passes even when the real call says mode:'cors', because the surrounding
// comment mentions the correct value. That mutation survived the first version of this
// check, and it is not cosmetic: with mode:'cors' the probe is blocked by CORS, always
// rejects, and NO FORM COULD EVER BE SUBMITTED. Read the call, not the prose.
function preflightCall(src) {
  const m = src.match(/fetch\(\s*['"]([^'"]+)['"]\s*,\s*\{([^}]*)\}/);
  return m ? { url: m[1], opts: m[2] } : null;
}

/**
 * The name of the page's email input, or null if it has none.
 * Read from the input TAG, so attribute order does not matter - a check that only matched
 * `type` before `name` would silently report "no email field" for a valid input.
 */
function emailInputName(src) {
  const tag = src.match(/<input[^>]*type=["']email["'][^>]*>/i);
  if (!tag) return null;
  const n = tag[0].match(/name=["']([^"']*)["']/i);
  return n ? n[1] : '';
}

function standards(src, live) {
  const heads = panelHeadings(src);
  const pf = preflightCall(src);
  const emailName = emailInputName(src);

  // SUBMISSION-TRUST (owner 2026-10-08). A static page cannot know whether Google
  // accepted a submission: the hidden iframe fires onload for a rejection page and for
  // a failed load alike, and every cross-origin-readable property of the frame is
  // identical in both cases (measured, three cases, 2026-10-08). The panel therefore
  // must not claim receipt, and the page must do the two things that ARE possible:
  // refuse to submit when offline, and pre-flight the host with fetch(mode:'no-cors').
  const receiptClaim = /(thank you|thanks\b|is in\b|has been received|recorded|submitted)/i;

  const checks = {
    'title tag':        /<title>[^<]+<\/title>/.test(src),
    'viewport meta':    /name=["']viewport["']/.test(src),
    'posts to gforms':  /docs\.google\.com\/forms\/d\/e\/[^/]+\/formResponse/.test(src),
    'hidden iframe':    /<iframe[^>]+name=["']hidden_iframe["']/i.test(src),
    'onsubmit guard':   /onsubmit=["']return\s+\w+\(\)/i.test(src),
    // WAS 'fbzx token present'. fbzx is a PER-SESSION token, not a form constant - a value
    // baked into a static page is stale by definition, and a stale one gets the post
    // rejected. Measured 2026-10-08: two loads of the same form returned different tokens.
    // So the correct standard is now that we send NO fbzx at all.
    'no stale fbzx':    !/name=["']fbzx["']/.test(src),
    'fvv+pageHistory':  /name=["']fvv["']/.test(src) && /name=["']pageHistory["']/.test(src),
    'print css':        /@media\s+print/.test(src),

    // --- submission trust ------------------------------------------------------
    // No state of the panel may assert that the form was received.
    'panel: no receipt claim': heads.length >= 4 && !heads.some((h) => receiptClaim.test(h)),
    // The two states that must exist so a failure is never reported as success.
    'panel: refusal states':   /'offline'/.test(src) && /'unreachable'/.test(src) && /'unsure'/.test(src),
    // Refuse to submit with no connection at all.
    'offline guard':           /navigator\.onLine\s*===\s*false/.test(src),
    // Probe the POST host before submitting - the only real transport signal available.
    // Read from the parsed call, so the comment cannot satisfy it.
    'reachability preflight':  !!pf && /generate_204/.test(pf.url) && /no-cors/.test(pf.opts),

    // --- email collection (2026-10-08) -----------------------------------------
    // The form-level "Collect email addresses" setting is invisible to the item list, and
    // leaving it unposted rejected every academy submission. These two checks tie the page
    // to the form's actual setting, so it cannot silently drift again.
    'email: present iff the form wants it': !live || (live.collectsEmail === (emailName !== null)),
    'email: posted as emailAddress':        emailName === null || emailName === 'emailAddress',
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

    for (const q of live.items) {
      const p = isPosted(posted, q);
      if (!p.ok) {
        const line = `entry.${q.eid} [${TYPE[q.type] ?? q.type}] "${q.label.slice(0, 45)}"` +
                     `${q.required ? ' REQUIRED' : ''}` +
                     (q.options.length ? `  opts=${JSON.stringify(q.options)}` : '') +
                     (p.detail ? `\n         ${p.detail}` : '');
        if (skip[q.eid]) blockers.push(`${line}\n         SKIPPED ON PURPOSE: ${skip[q.eid]}`);
        else {
          // A DATE is postable from a static page - it is three hidden inputs, not a file.
          // So an unposted DATE is OUR bug, not a client one.
          const hint = q.type === 9
            ? `\n         DATE must post as entry.${q.eid}_year / _month / _day.`
            + ' A single entry.' + q.eid + '=YYYY-MM-DD is the PREFILL shape, not the submit shape.'
            : '';
          defects.push(line + hint);
        }
        continue;
      }
      matched++;
      // Option strings must match byte-for-byte or Google silently drops the answer.
      for (const o of q.options) {
        const vals = optionValues(src, q.eid);
        if (vals.size && !vals.has(o)) badOpts.push(`entry.${q.eid}: ${JSON.stringify(o)}`);
      }
    }

    const stray = strayFields(posted, live.items);

    console.log(`\n=== ${f.name} (${f.file}) ===`);
    console.log(`  form title : ${live.title}`);
    if (live.desc) console.log(`  description: ${live.desc.trim()}`);
    // Form-level email collection. Printed every run so a change on Google's side is VISIBLE
    // rather than silent - the flag value is the only place this setting is observable.
    console.log(`  email field: ${live.collectsEmail ? 'COLLECTED (required)' : 'not collected'}`
      + `  [d[1][10][6]=${live.emailFlag}]`
      + (live.emailFlagKnown ? '' : '   ** UNRECOGNISED FLAG VALUE - the mapping may have changed **'));

    // The client puts DATES in the description, not in a question. If it names a year the page
    // never mentions, the page is likely advertising the wrong season. Warning, not a failure:
    // a description may legitimately look ahead to next year.
    const descYears = [...new Set(live.desc.match(/\b20\d{2}\b/g) ?? [])];
    const missingYears = descYears.filter(y => !src.includes(y));
    if (missingYears.length) {
      console.log(`  WARNING    : form description names ${missingYears.join(', ')} - the page never does`);
    }

    console.log(`  fields matched : ${matched}/${live.items.length}`);
    console.log(`  stray ids      : ${stray.length ? stray.map(n => 'entry.' + n).join(', ') : 'none'}`);
    console.log(`  bad options    : ${badOpts.length}`);
    badOpts.forEach(b => console.log(`      BAD ${b}`));
    if (defects.length) {
      console.log(`  DEFECTS (not posted, my fault):`);
      defects.forEach(b => console.log(`      ! ${b}`));
    }
    if (blockers.length) {
      console.log(`  BLOCKERS (cannot be fixed in the page - needs a client/owner action):`);
      blockers.forEach(b => console.log(`      ~ ${b}`));
    }

    const std = standards(src, live);
    const failed = Object.entries(std).filter(([, v]) => !v).map(([k]) => k);
    console.log(`  standards      : ${Object.values(std).filter(Boolean).length}/${Object.keys(std).length}` +
                (failed.length ? `  FAIL:${JSON.stringify(failed)}` : ''));

    if (badOpts.length || stray.length || failed.length || defects.length) hardFail = true;
    summary.push({ name: f.name, matched, total: live.items.length, badOpts: badOpts.length,
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
