/**
 * gen_og_cards.js - branded 1200x630 share cards for dynamicbodystudio.co.za
 *
 * WHY GENERATED, NOT STOCK OR AI:
 *   These cards carry exact dates, exact fees and the brand mark. An AI-generated image
 *   garbles text; a stock photo carries a licence and says nothing about the studio.
 *   Rendering the real HTML gives pixel-exact type and reuses the site's own palette.
 *
 * Run (VERIFY - the default; writes nothing into the repo):
 *   NODE_PATH="C:/Users/User/.workbuddy-ai/binaries/node/workspace/node_modules" \
 *     node _tools/gen_og_cards.js
 *
 * Run (PUBLISH - rewrites assets/og/*.png):
 *   NODE_PATH="C:/Users/User/.workbuddy-ai/binaries/node/workspace/node_modules" \
 *     node _tools/gen_og_cards.js --write
 *
 * Output: assets/og/*.png  (1200x630, the OG/Twitter ratio)
 *
 * VERIFY MUST NOT PUBLISH - this is why the default changed on 2026-10-08.
 * The script used to screenshot straight into assets/og/, so merely CHECKING the
 * cards rewrote the shipped files. That is a verification step with a side effect
 * on the deliverable, and it bit us: home.png is not byte-reproducible (it has two
 * render outcomes ~1 LSB apart in the decorative gradient - see the DRIFT note in
 * the report), so a gate run would silently flip the file that was live, leaving a
 * confusing "why did this change?" diff and a dirty tree that a later `git add -A`
 * would ship. Rendering into a scratch directory instead makes the gate read-only,
 * which is what a gate is supposed to be. Publishing is now an explicit flag.
 *
 * Wiring the meta tags is a separate step (see the WIRING block at the bottom).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'og');

// Declared here, not with the other asset paths further down: CARDS (below) needs the
// academy path at module-evaluation time, and a `const` referenced before its
// declaration throws at once ("Cannot access 'ACADEMY_LOGO' before initialization") -
// --check does not catch this, because it is true syntax and an execution-order fault.
const ACADEMY_LOGO = path.join(ROOT, 'assets', 'dance-academy-logo.png');

// VERIFY BY DEFAULT, PUBLISH ON REQUEST. A gate that rewrites the artifact it is
// checking cannot tell you whether the artifact is good - it only tells you what it
// just wrote. See the header note.
const PUBLISH = process.argv.includes('--write');
const RENDER_DIR = path.join(ROOT, '_tmp_og_render');

// ---------------------------------------------------------------------------
// The cards. One per shareable page.
// accent: 'blue' for studio/pilates, 'pink' for dance. Palette is read from the
// site's own :root, not invented - see index.html lines 22-26.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// The cards. One per shareable page.
//
// EVERGREEN BY DESIGN - owner decision 2026-10-08. These carry NO year, NO date and
// NO open/closed state. Reasoning, and it is not cosmetic:
//   * The intake date already lives in THREE places on the site (home banner, academy
//     hero, hub card) and all three must move together. A dated card makes it four.
//   * Social platforms cache an image by URL. A page we can correct in a minute; a
//     cached card we cannot. A card still reading "2026 intake now open" in January
//     2027 is worse than a card with no date at all.
//   * A card's job is to earn the click. The page it links to always carries the
//     current season, and that is the only place that should.
// The annual routine therefore does NOT touch assets/og/. If you add a date here,
// the gate below will fail the build - that is deliberate.
// ---------------------------------------------------------------------------
const CARDS = [
  {
    out: 'home.png',
    kicker: 'Dorchester Heights \u00b7 East London',
    title: 'The Dynamic Body Studio',
    sub: 'Reformer Pilates, Barre, Pound and more',
    cta: 'Enrol online',
    accent: 'blue',
  },
  {
    out: 'enrol.png',
    kicker: 'Enrol online',
    title: 'Join the studio',
    sub: 'Dance Academy \u00b7 Twinkle Toes Ballet \u00b7 Studio classes',
    cta: 'Start here',
    accent: 'pink',
  },
  {
    out: 'studio.png',
    kicker: 'Studio enrolment',
    title: 'Pilates classes',
    sub: 'Tell us your goals and we will place you in the right class',
    cta: 'Enrol at the studio',
    accent: 'blue',
  },
  {
    out: 'dance-academy.png',
    kicker: 'Annual intake',
    title: 'Dynamic Dance Academy',
    sub: 'Classical, Tap, Hip hop, Contemporary and more \u00b7 ages 4 to 18',
    cta: 'Enrol a dancer',
    // TEAL, not pink - see the PALETTE note. Pink on this card reads as girls' ballet
    // for a school that enrols boys and girls across four styles.
    accent: 'teal',
    // The academy has its own mark. `ownMark` swaps the logo AND switches the CSS
    // sizing rule (stacked lockup, sized by height) - see LOGO_CSS above.
    logo: ACADEMY_LOGO,
    ownMark: true,
  },
  {
    out: 'twinkle-toes.png',
    kicker: 'Ballet for the little ones',
    title: 'Twinkle Toes Ballet',
    sub: 'Ballet for our youngest dancers \u00b7 East London',
    cta: 'Ask about the next intake',
    accent: 'pink',
  },
];

// Which page uses which card. Checked by the share-preview gate below, so a page
// pointing at the wrong card - or at the old logo - fails the build.
const PAGES = {
  'index.html': 'home.png',
  'forms.html': 'enrol.png',
  'enrol.html': 'studio.png',
  'dance-academy.html': 'dance-academy.png',
  'twinkle-toes.html': 'twinkle-toes.png',
};

// ---------------------------------------------------------------------------
// CONTROLS - prove the layout gate can fail before trusting it.
// An unproven check is decoration.
//   OG_CARD_CONTROL_LONG=6   repeat the headline until it MUST overflow the frame
//   OG_CARD_CONTROL_LOGO=1   reinstate the squashed-logo CSS that caused the bug
//   OG_CARD_CONTROL_DATED=1  put a season back into a card, as the old version had
// All are expected to produce FAIL. If any passes, the gate is not working.
// ---------------------------------------------------------------------------
if (process.env.OG_CARD_CONTROL_DATED) {
  CARDS[3].sub = '30 November \u2013 19 December 2026 \u00b7 Registration day 21 November';
}
if (process.env.OG_CARD_CONTROL_LONG) {
  const n = Math.max(1, Number(process.env.OG_CARD_CONTROL_LONG) || 6);
  const filler = Array.from({ length: n }, () => 'Longword').join(' ');
  CARDS.forEach((c) => { c.title = c.title + ' ' + filler; });
}
const LOGO_CSS = process.env.OG_CARD_CONTROL_LOGO
  ? '.logo{height:76px;width:auto;margin-bottom:auto}'   // the bug, verbatim
  : '.logo{width:404px;height:auto;align-self:flex-start;margin-bottom:auto}'
  // The academy card carries the ACADEMY mark instead of the studio lockup. It is a
  // stacked lockup (250x169, ~1.48:1) where the studio one is a wide 3.9:1 lockup, so it
  // gets its own sizing: size by HEIGHT and let width follow, otherwise it consumes the
  // whole headline row. align-self:flex-start is still load-bearing (see above).
  // Height is 130, not 150: at 150 the academy card's subline sat only 10px off the
  // footer rule (the other cards sit at 33-77px), which reads as a near-collision even
  // though it technically passes. The gate can measure a gap but not whether it looks
  // right, so this number comes from looking at the render.
  + '\n.logo.academy{height:130px;width:auto;align-self:flex-start;margin-bottom:auto}';

const PALETTE = {
  blue: '#68ADD9',
  blueSoft: '#93B1D4',
  pink: '#E75B98',
  pinkSoft: '#ED8FB6',
  // NEUTRAL ACCENT (owner 2026-10-09). The academy card was pink, which reads as
  // "girls' ballet" - wrong for a school that teaches classical, tap, hip hop and
  // contemporary to ages 4 to 18, boys and girls alike. A pink card on the academy
  // page quietly narrows the intake the page exists to fill. Teal reads as
  // stage/dance without gendering the audience; pink stays on Twinkle Toes, where
  // the audience genuinely is mostly girls.
  teal: '#3FA8A0',
  tealSoft: '#7FC9C3',
  charcoal: '#5D5F5E',
  ink: '#333333',
  bg: '#FEFEFE',
};

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const WIDE_LOGO = path.join(ROOT, 'Dynamic Studios-Transparent.png');

// ---------------------------------------------------------------------------
// Assets as data: URIs. A file:// reference races document.fonts.ready; a data
// URI removes the race entirely and makes the render offline-deterministic.
// ---------------------------------------------------------------------------
// A SHORT UA gets the LEGACY Google Fonts CSS: one @font-face per family, no
// `/* latin */` subset comments, no unicode-range - so subset parsing silently
// finds nothing. Send a full modern Chrome UA to get the subsetted stylesheet.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                 + '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function fetchBuf(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': BROWSER_UA } }, (r) => {
      if (r.statusCode !== 200) return reject(new Error(`HTTP ${r.statusCode} for ${url}`));
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

/**
 * Pull only the `latin` @font-face blocks and dedupe by file URL.
 * Google serves the SAME variable file for several declared weights, so dedupe
 * by src and widen the weight range instead of embedding the same bytes twice.
 */
async function loadFonts() {
  const cssUrl = 'https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,400;6..96,600'
               + '&family=DM+Sans:wght@400;500;700&display=swap';
  const css = (await fetchBuf(cssUrl)).toString('utf8');

  const blocks = [];
  const re = /\/\*\s*([a-z0-9-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const subset = m[1];
    if (subset !== 'latin') continue;               // latin-ext/cyrillic are dead weight here
    const body = m[2];
    const fam = (body.match(/font-family:\s*'([^']+)'/) || [])[1];
    const wght = (body.match(/font-weight:\s*(\d+)/) || [])[1];
    const url = (body.match(/url\((https:[^)]+\.woff2)\)/) || [])[1];
    if (fam && wght && url) blocks.push({ fam, wght: Number(wght), url });
  }
  if (!blocks.length) throw new Error('no latin @font-face blocks parsed');

  // dedupe by family+url, keeping the weight range that file covers
  const byKey = new Map();
  for (const b of blocks) {
    const key = b.fam + '|' + b.url;
    const cur = byKey.get(key);
    if (cur) {
      cur.min = Math.min(cur.min, b.wght);
      cur.max = Math.max(cur.max, b.wght);
    } else {
      byKey.set(key, { fam: b.fam, url: b.url, min: b.wght, max: b.wght });
    }
  }

  const faces = [];
  for (const f of byKey.values()) {
    const buf = await fetchBuf(f.url);
    faces.push({
      fam: f.fam,
      range: f.min === f.max ? String(f.min) : `${f.min} ${f.max}`,
      b64: buf.toString('base64'),
      bytes: buf.length,
    });
  }
  return faces;
}

function dataUri(file) {
  return 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
}

// ---------------------------------------------------------------------------
// The card markup. Kept as plain concatenation rather than one big template
// literal: a stray backtick inside a comment silently terminates the string.
// ---------------------------------------------------------------------------
function cardHtml(card, faces, logoSrc) {
  // A card may carry its OWN mark. The academy has its own branding and its own page,
  // so its card must not show the studio lockup - a shared preview image under a
  // different brand is the same error as a shared page heading.
  // `logoSrc` is already resolved per card by the caller; `isAcademy` only decides
  // which sizing rule applies (see the LOGO_CSS note - the two marks have wildly
  // different aspect ratios and one rule cannot serve both).
  const logoClass = card.ownMark ? 'logo academy' : 'logo';
  // Resolve the accent by NAME, not by a blue/pink binary - the academy needs a third
  // accent and the old ternary would have silently painted it blue.
  const accentKey = PALETTE[card.accent] ? card.accent : 'blue';
  const softKey = accentKey + 'Soft';
  const accent = PALETTE[accentKey];
  const accentSoft = PALETTE[softKey] || PALETTE.blueSoft;
  const fontCss = faces.map((f) =>
    "@font-face{font-family:'" + f.fam + "';font-style:normal;font-weight:" + f.range
    + ";src:url(data:font/woff2;base64," + f.b64 + ") format('woff2');font-display:block}"
  ).join('\n');

  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<style>',
    fontCss,
    '*{margin:0;padding:0;box-sizing:border-box}',
    'html,body{width:1200px;height:630px;overflow:hidden}',
    'body{font-family:\'DM Sans\',system-ui,sans-serif;color:' + PALETTE.charcoal + ';background:' + PALETTE.bg + ';position:relative}',
    // soft brand wash: two off-canvas radial blobs, low opacity, so the card is not flat white
    '.blob{position:absolute;border-radius:50%;filter:blur(0px)}',
    '.blob.p{width:620px;height:620px;right:-190px;top:-260px;background:radial-gradient(circle at 50% 50%,'
      + hexA(accent, .20) + ' 0%,' + hexA(accent, .05) + ' 55%,rgba(255,255,255,0) 72%)}',
    '.blob.b{width:520px;height:520px;left:-170px;bottom:-240px;background:radial-gradient(circle at 50% 50%,'
      + hexA(accentSoft, .22) + ' 0%,' + hexA(accentSoft, .05) + ' 55%,rgba(255,255,255,0) 72%)}',
    // a single accent bar down the left edge: the only hard-edged brand mark
    '.edge{position:absolute;left:0;top:0;bottom:0;width:14px;background:linear-gradient(180deg,'
      + accent + ' 0%,' + accentSoft + ' 100%)}',
    '.card{position:relative;z-index:2;height:100%;padding:64px 72px 56px 86px;display:flex;flex-direction:column}',
    // align-self:flex-start is load-bearing. A flex column container defaults to
    // align-items:stretch, which overrides width:auto and forces the image to the
    // full content width - a 1617x415 lockup rendered as 1042x76, squashed to
    // 13.7:1 against its natural 3.9:1. Size it by WIDTH and let height follow.
    LOGO_CSS,
    '.kicker{font-size:22px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:'
      + accent + ';margin-bottom:18px}',
    // Headline box = the full content width (1200 - 86 left - 72 right = 1042). It was
    // 900, which wrapped "The Dynamic Body Studio" (995px) and "Dynamic Dance Academy"
    // (984px) to two lines while every other card sat on one - an inconsistent set, and
    // two extra lines steal the space the subline needs. Every shipped title is under
    // 1042px at this size (measured 2026-10-09: 995 / 558 / 551 / 984 / 760), so one box
    // serves them all and the set reads alike. The font size is NOT reduced - the type
    // stays 82px and the box simply stops clipping it early.
    'h1{font-family:\'Bodoni Moda\',Georgia,serif;font-weight:600;font-size:82px;line-height:1.06;'
      + 'letter-spacing:-.01em;color:' + PALETTE.ink + ';max-width:1042px}',
    '.sub{font-size:27px;font-weight:400;line-height:1.45;color:' + PALETTE.charcoal + ';margin-top:22px;max-width:860px}',
    '.foot{margin-top:auto;padding-top:26px;border-top:2px solid ' + hexA(PALETTE.charcoal, .16) + ';'
      + 'display:flex;justify-content:space-between;align-items:baseline;font-size:23px;font-weight:500}',
    '.foot .site{color:' + PALETTE.ink + '}',
    '.foot .cta{color:' + accent + ';font-weight:700}',
    '</style></head><body>',
    '<div class="edge"></div><div class="blob p"></div><div class="blob b"></div>',
    '<div class="card">',
    '<img class="' + logoClass + '" src="' + logoSrc + '" alt="">',
    '<div class="kicker">' + esc(card.kicker) + '</div>',
    '<h1 id="h">' + esc(card.title) + '</h1>',
    '<div class="sub" id="s">' + esc(card.sub) + '</div>',
    '<div class="foot"><span class="site">dynamicbodystudio.co.za</span>'
      + '<span class="cta">' + esc(card.cta) + '</span></div>',
    '</div></body></html>',
  ].join('\n');
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function hexA(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// ---------------------------------------------------------------------------
// Render + gate
// ---------------------------------------------------------------------------
function pngSize(buf) {
  if (buf.slice(1, 4).toString() !== 'PNG') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

(async () => {
  const puppeteer = require('puppeteer-core');
  if (!fs.existsSync(CHROME)) throw new Error('Chrome not found at ' + CHROME);
  if (!fs.existsSync(WIDE_LOGO)) throw new Error('wide logo lockup not found at ' + WIDE_LOGO);
  fs.mkdirSync(PUBLISH ? OUT_DIR : RENDER_DIR, { recursive: true });

  const faces = await loadFonts();
  console.log('fonts embedded:');
  faces.forEach((f) => console.log(`  ${f.fam.padEnd(14)} weight ${f.range.padEnd(8)} ${f.bytes} B`));
  const logoSrc = dataUri(WIDE_LOGO);
  console.log(`logo embedded : ${fs.statSync(WIDE_LOGO).size} B  (studio lockup, shared)`);
  if (!fs.existsSync(ACADEMY_LOGO)) throw new Error('academy logo not found at ' + ACADEMY_LOGO);
  console.log(`              : ${fs.statSync(ACADEMY_LOGO).size} B  (academy mark, dance-academy.png only)`);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none', '--force-color-profile=srgb'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });

  const report = [];
  let failed = false;

  for (const card of CARDS) {
    // Resolve the mark PER CARD. A card that names its own logo gets it; everything
    // else falls back to the studio lockup.
    const cardLogo = card.logo ? dataUri(card.logo) : logoSrc;
    const html = cardHtml(card, faces, cardLogo);
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    // Measure what the browser ACTUALLY produced. A count cannot see a collision,
    // so record the geometry the layout gate below needs.
    //
    // NOTE: do NOT gate on document.body.scrollWidth. The decorative blobs sit
    // deliberately off-canvas and overflow:hidden clips them, so scrollWidth is
    // always > 1200 and every card would "fail" for no reason - a check reading
    // the wrong pixel. Gate on the TEXT boxes staying inside the frame instead.
    const m = await page.evaluate(() => {
      const h = document.getElementById('h');
      const s = document.getElementById('s');
      const f = document.querySelector('.foot');
      const hr = h.getBoundingClientRect(), sr = s.getBoundingClientRect(), fr = f.getBoundingClientRect();

      const outOfFrame = [];
      const logoEl = document.querySelector('.logo');
      const lr = logoEl.getBoundingClientRect();
      const named = { h1: hr, sub: sr, foot: fr, logo: lr };
      for (const [name, r] of Object.entries(named)) {
        if (r.left < 0 || r.top < 0 || r.right > 1200 || r.bottom > 630) {
          outOfFrame.push(`${name} ${Math.round(r.left)},${Math.round(r.top)}..${Math.round(r.right)},${Math.round(r.bottom)}`);
        }
      }

      // A box can sit perfectly in frame while the IMAGE inside it is squashed.
      // That is exactly what happened: the logo box measured 1042x76 for a
      // 1617x415 source, and the position check above saw nothing wrong.
      // Compare the rendered aspect against the source aspect.
      const logoAspect = lr.width / lr.height;
      const naturalAspect = logoEl.naturalWidth / logoEl.naturalHeight;
      const logoAspectDrift = Math.abs(logoAspect - naturalAspect) / naturalAspect;
      const logoDistorted = logoAspectDrift > 0.02;

      // fonts actually applied, not merely requested
      const usedH = getComputedStyle(h).fontFamily;
      const bodoniLoaded = document.fonts.check("600 82px 'Bodoni Moda'");
      const dmLoaded = document.fonts.check("400 27px 'DM Sans'");

      return {
        hBottom: Math.round(hr.bottom), sBottom: Math.round(sr.bottom), footTop: Math.round(fr.top),
        lines: Math.round(hr.height / parseFloat(getComputedStyle(h).lineHeight)),
        fontSize: parseFloat(getComputedStyle(h).fontSize),
        collide: sr.bottom > fr.top,
        outOfFrame,
        logoAspectDrift: Number(logoAspectDrift.toFixed(4)),
        logoDistorted,
        logoBox: `${Math.round(lr.width)}x${Math.round(lr.height)}`,
        usedH,
        bodoniLoaded,
        dmLoaded,
      };
    });

    // Always render into scratch, then copy into the repo ONLY if the bytes differ.
    // Screenshotting straight into assets/og/ in --write mode rewrote every card on
    // every publish, so publishing a one-card change also churned home.png's gradient
    // (the two 1-LSB states) and left a two-file diff where one file was intended.
    // Comparing first means --write touches exactly the cards that changed.
    const file = path.join(RENDER_DIR, card.out);
    await page.screenshot({ path: file, type: 'png', clip: { x: 0, y: 0, width: 1200, height: 630 } });

    const committed = path.join(OUT_DIR, card.out);
    let wrote = false;
    if (PUBLISH) {
      const before = fs.existsSync(committed) ? fs.readFileSync(committed) : null;
      if (!before || !before.equals(fs.readFileSync(file))) {
        fs.copyFileSync(file, committed);
        wrote = true;
      }
    }

    // DRIFT, not failure. home.png is not byte-reproducible: it has two render
    // outcomes about 1 LSB apart inside the decorative radial-gradient blob (measured
    // 2026-10-08 - 4 consecutive runs gave cd563597,cd563597,dd89d5a6,cd563597 while
    // the other four cards were identical every time; the two states differ in 21581
    // pixels, max channel delta 1, all inside the blob's own geometry - re-measured
    // 2026-10-09 at 23053 subpixels, max delta 1, same signature). That is
    // sub-perceptual and NOT a defect, so it must not fail the build - but it must be
    // VISIBLE, because it is the reason a card can differ from the committed file for
    // no apparent reason. Report it; never silently rewrite the asset.
    let drift = '';
    if (!PUBLISH && fs.existsSync(committed)) {
      const a = fs.readFileSync(committed), b = fs.readFileSync(file);
      if (!a.equals(b)) {
        const dims = pngSize(b);
        drift = dims && dims.w === 1200 && dims.h === 630
          ? `render differs from assets/og (${a.length}B vs ${b.length}B - expected 1-LSB gradient drift)`
          : 'render differs from assets/og AND is the wrong size';
      }
    }

    const size = pngSize(fs.readFileSync(file));
    const reasons = [];

    // EVERGREEN POLICY (owner 2026-10-08). A card must not carry a year, a month name or a
    // date. Social platforms cache the image by URL, so a dated card goes stale and cannot be
    // corrected quickly - "2026 intake now open" still showing in January 2027 is worse than
    // no date at all. The season belongs on the page, which is always current. The annual
    // routine must not need to touch assets/og/.
    const cardText = [card.kicker, card.title, card.sub, card.cta].join(' | ');
    const yearHit = cardText.match(/\b(19|20)\d{2}\b/);
    const monthHit = cardText.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\b/i);
    if (yearHit) reasons.push(`NOT EVERGREEN - card text names a year: "${yearHit[0]}"`);
    if (monthHit) reasons.push(`NOT EVERGREEN - card text names a month: "${monthHit[0]}"`);
    if (!size || size.w !== 1200 || size.h !== 630) reasons.push(`size ${size ? size.w + 'x' + size.h : 'not a PNG'}`);
    if (m.collide) reasons.push('subline collides with footer');
    if (m.outOfFrame.length) reasons.push('out of frame: ' + m.outOfFrame.join('; '));
    if (m.logoDistorted) reasons.push(`logo distorted: box ${m.logoBox}, aspect drift ${(m.logoAspectDrift * 100).toFixed(1)}%`);
    if (m.lines > 3) reasons.push(`${m.lines} headline lines`);
    if (!m.bodoniLoaded) reasons.push('Bodoni Moda did not load');
    if (!m.dmLoaded) reasons.push('DM Sans did not load');
    const ok = reasons.length === 0;
    if (!ok) failed = true;

    report.push({
      out: card.out, ...m, w: size ? size.w : 0, h: size ? size.h : 0,
      bytes: fs.statSync(file).size, ok, reasons, drift, wrote,
    });
  }

  // All rendering is DONE at this point. Closing Chrome has hung indefinitely in this
  // environment (measured 2026-10-09: the launch takes 500ms and all five cards render,
  // but `await browser.close()` never resolves, so the process was killed by the caller
  // and the ENTIRE report was lost to an unflushed buffer - a run that had already
  // succeeded looked like a hang with no output). Never let teardown eat the result:
  // report first, then try to close, and exit explicitly either way.
  const closeWithTimeout = (ms) => Promise.race([
    browser.close().catch(() => {}),
    new Promise((r) => setTimeout(r, ms)),
  ]);
  await closeWithTimeout(5000);

  console.log('\n--- CARDS ---');
  console.log('  file                 size        logoBox    drift  headPx  lines  gap   bytes   verdict');
  for (const r of report) {
    const gap = r.footTop - r.sBottom;
    console.log(`  ${r.out.padEnd(20)} ${String(r.w + 'x' + r.h).padEnd(11)} ${r.logoBox.padEnd(10)} `
      + `${String((r.logoAspectDrift * 100).toFixed(1) + '%').padEnd(6)} ${String(r.fontSize).padEnd(7)} `
      + `${String(r.lines).padEnd(6)} ${String(gap).padEnd(5)} ${String(r.bytes).padEnd(7)} ${r.ok ? 'OK' : 'FAIL'}`);
    if (!r.ok) r.reasons.forEach((x) => console.log(`        ! ${x}`));
  }

  // Say plainly which mode this was, so nobody reads a green run as "published".
  if (PUBLISH) {
    const n = report.filter((r) => r.wrote).length;
    console.log(`\nWROTE     ${path.relative(ROOT, OUT_DIR).replace(/\\/g, '/')}/  (--write)  `
      + `${n} of ${report.length} card(s) changed`);
    report.filter((r) => r.wrote).forEach((r) => console.log(`    + ${r.out}`));
    if (!n) console.log('    (no card differed - nothing written)');
  } else {
    console.log(`\nVERIFY ONLY - nothing written to the repo. Renders in `
      + `${path.relative(ROOT, RENDER_DIR).replace(/\\/g, '/')}/  (pass --write to publish)`);
  }

  const drifted = report.filter((r) => r.drift);
  if (drifted.length) {
    console.log('  drift vs committed asset (sub-perceptual, informational):');
    drifted.forEach((r) => console.log(`    ~ ${r.out.padEnd(20)} ${r.drift}`));
  }

  console.log('\nfonts actually applied in the render:');
  report.forEach((r) => console.log(`  ${r.out.padEnd(20)} ${r.usedH.split(',')[0].replace(/"/g, '')}  `
    + `bodoni=${r.bodoniLoaded} dm=${r.dmLoaded}`));

  // -------------------------------------------------------------------------
  // Share-preview gate: every page must point at the right card, at 1200x630,
  // declare summary_large_image, and keep its preview text evergreen.
  // -------------------------------------------------------------------------
  console.log('\n--- SHARE PREVIEW PER PAGE ---');
  for (const [page, card] of Object.entries(PAGES)) {
    const src = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const tag = (re) => (src.match(re) || [])[1];
    const want = `https://dynamicbodystudio.co.za/assets/og/${card}`;
    const got = tag(/<meta property="og:image" content="([^"]+)"/);
    const problems = [];
    if (got !== want) problems.push(`og:image is ${got || 'MISSING'} (want ${want})`);
    if (tag(/<meta property="og:image:width" content="([^"]+)"/) !== '1200') problems.push('og:image:width not 1200');
    if (tag(/<meta property="og:image:height" content="([^"]+)"/) !== '630') problems.push('og:image:height not 630');
    if (tag(/<meta name="twitter:card" content="([^"]+)"/) !== 'summary_large_image') problems.push('twitter:card not summary_large_image');

    // evergreen preview text - same rule as the cards, same reason
    const text = ['og:title', 'og:description', 'og:image:alt']
      .map((k) => tag(new RegExp(`<meta property="?${k}"? content="([^"]+)"`)) || '').join(' | ');
    const y = text.match(/\b(19|20)\d{2}\b/);
    const mo = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i);
    if (y) problems.push(`preview text names a year: "${y[0]}"`);
    if (mo) problems.push(`preview text names a month: "${mo[0]}"`);

    if (problems.length) failed = true;
    console.log(`  ${page.padEnd(20)} -> ${card.padEnd(20)} ${problems.length ? 'FAIL' : 'OK'}`);
    problems.forEach((x) => console.log(`        ! ${x}`));
  }

  // -------------------------------------------------------------------------
  // BRANDING PER PAGE. The academy has its own mark, so its page must actually
  // show it - a header still carrying the studio lockup, or a favicon still
  // pointing at it, is the same bug as a card showing the wrong logo, just in a
  // place this gate was not looking. The check reads the SHIPPED page, not the
  // generator's intent, because those can disagree silently.
  // -------------------------------------------------------------------------
  console.log('\n--- PAGE BRANDING ---');
  const BRAND = [
    {
      page: 'dance-academy.html',
      want: 'assets/dance-academy-logo.png',
      mustNot: 'Dynamic Studios-Transparent.png',
      label: 'academy mark',
    },
  ];
  for (const b of BRAND) {
    const src = fs.readFileSync(path.join(ROOT, b.page), 'utf8');
    const problems = [];
    // the mark must appear in BOTH the header brand and the icon links
    const inHeader = /<div class="brand">[\s\S]*?<\/div>/.test(src)
      && (src.match(/<div class="brand">[\s\S]*?<\/div>/) || [''])[0].includes(b.want);
    if (!inHeader) problems.push(`header .brand does not reference ${b.want}`);
    const iconLinks = src.match(/<link rel="(?:icon|apple-touch-icon)"[^>]*>/g) || [];
    const iconsRight = iconLinks.length > 0 && iconLinks.every((l) => l.includes(b.want));
    if (!iconsRight) problems.push(`icon link(s) do not all point at ${b.want} (${iconLinks.length} found)`);
    // the studio lockup must NOT be the header mark on this page
    const brandBlock = (src.match(/<div class="brand">[\s\S]*?<\/div>/) || [''])[0];
    if (b.mustNot && brandBlock.includes(b.mustNot)) {
      problems.push(`header .brand still carries the studio lockup (${b.mustNot})`);
    }
    if (problems.length) failed = true;
    console.log(`  ${b.page.padEnd(20)} ${b.label.padEnd(14)} ${problems.length ? 'FAIL' : 'OK'}`);
    problems.forEach((x) => console.log(`        ! ${x}`));
  }

  console.log(failed ? '\nCARDS: FAIL' : '\nCARDS: PASS');
  // Explicit exit: a dangling Chrome or a stray timer would otherwise keep the process
  // alive after the report is printed, which reads as a hang.
  process.exit(failed ? 1 : 0);
})();

// ---------------------------------------------------------------------------
// WIRING (done separately, per page):
//   <meta property="og:image" content="https://dynamicbodystudio.co.za/assets/og/<card>.png">
//   <meta property="og:image:width"  content="1200">
//   <meta property="og:image:height" content="630">
//   <meta property="og:image:alt"    content="...">
//   <meta name="twitter:card" content="summary_large_image">
// summary_large_image is the point: the site currently declares `summary`, which
// renders a small square thumbnail and throws away most of the card.
// ---------------------------------------------------------------------------
