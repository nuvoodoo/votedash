// Builds server/congress/data/speeches.json: every House and Senate floor speech
// (Congressional Record granule where the member is tagged SPEAKING) by each current
// member in the 119th Congress, from GovInfo.
//
// Route: /published (CREC packages by dateIssued) -> /packages/{pkg}/mods (one call per
// daily package; lists every granule with granuleClass, title and congMember role) ->
// granule HTML text (www.govinfo.gov/content) for word counts and excerpts.
// Extensions of Remarks and the Daily Digest are skipped (not floor speech).
// Raw responses are cached gzipped under data/raw/govinfo/ so reruns are incremental.
//
// Usage: node tools/congress/fetch-speeches.js [--no-html] [--refresh-days=N]
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '../..');
const RAW = path.join(process.env.CONGRESS_RAW || path.join(ROOT, 'data/raw'), 'govinfo');
const OUT = path.join(process.env.CONGRESS_OUT || path.join(ROOT, 'server/congress/data'), 'speeches.json');
const PEOPLE = path.join(process.env.CONGRESS_OUT || path.join(ROOT, 'server/congress/data'), 'people.json');
const ENV = path.join(ROOT, '../votedash.env');
const START = '2025-01-03';
const MAX_ITEMS = 60;
const EXCERPT = 280;
const args = process.argv.slice(2);
const NO_HTML = args.includes('--no-html');
const REFRESH_DAYS = +((args.find(a => a.startsWith('--refresh-days=')) || '').split('=')[1] || 14);

const KEY = (() => {
  if (process.env.DATA_GOV_KEY) return process.env.DATA_GOV_KEY;
  const line = fs.readFileSync(ENV, 'utf8').split(/\r?\n/).find(l => l.startsWith('DATA_GOV_KEY='));
  if (!line) throw new Error('DATA_GOV_KEY missing from votedash.env');
  return line.slice('DATA_GOV_KEY='.length).trim().replace(/^"|"$/g, '');
})();

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const redact = u => u.replace(/api_key=[^&]+/, 'api_key=KEY');
const gzWrite = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', zlib.gzipSync(s)); fs.renameSync(f + '.tmp', f); };
const gzRead = f => zlib.gunzipSync(fs.readFileSync(f)).toString('utf8');

// ---------- HTTP with retry + api.data.gov throttle ----------
let apiRemaining = Infinity;
const stats = { api: 0, html: 0, retries: 0, failures: [] };
async function get(url, { api = false } = {}) {
  const full = api ? url + (url.includes('?') ? '&' : '?') + 'api_key=' + KEY : url;
  for (let attempt = 0; attempt < 7; attempt++) {
    if (api && apiRemaining < 100) { log('rate limit low (' + apiRemaining + '), pausing 5 min'); await sleep(300000); apiRemaining = Infinity; }
    let res;
    try {
      res = await fetch(full, { headers: { 'User-Agent': 'votedash-congress-fetch/1.0' }, signal: AbortSignal.timeout(90000) });
    } catch (e) {
      stats.retries++; await sleep(2000 * 2 ** attempt); continue;
    }
    if (api) { const rem = res.headers.get('x-ratelimit-remaining'); if (rem != null) apiRemaining = +rem; stats.api++; } else stats.html++;
    if (res.ok) return res.text();
    if (res.status === 429 || res.status >= 500) {
      stats.retries++;
      const wait = res.status === 429 ? 60000 * (attempt + 1) : 3000 * 2 ** attempt;
      log('HTTP ' + res.status + ' ' + redact(url) + ' retry in ' + wait / 1000 + 's');
      await sleep(wait); continue;
    }
    throw new Error('HTTP ' + res.status + ' ' + redact(url));
  }
  throw new Error('gave up ' + redact(url));
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

// ---------- 1. package list ----------
async function listPackages(end) {
  let url = `https://api.govinfo.gov/published/${START}/${end}?collection=CREC&pageSize=1000&offsetMark=*`;
  const pkgs = [];
  while (url) {
    const j = JSON.parse(await get(url, { api: true }));
    pkgs.push(...j.packages);
    url = j.nextPage ? j.nextPage.replace(/[?&]api_key=[^&]+/, '') : null;
  }
  fs.mkdirSync(RAW, { recursive: true });
  fs.writeFileSync(path.join(RAW, 'published.json'), JSON.stringify(pkgs, null, 1));
  return pkgs.filter(p => p.dateIssued >= START).sort((a, b) => a.dateIssued.localeCompare(b.dateIssued));
}

// ---------- 2. package MODS ----------
const MODS_INDEX = path.join(RAW, 'mods-index.json');
async function fetchMods(pkgs) {
  const idx = fs.existsSync(MODS_INDEX) ? JSON.parse(fs.readFileSync(MODS_INDEX, 'utf8')) : {};
  const recent = new Date(Date.now() - REFRESH_DAYS * 864e5).toISOString().slice(0, 10);
  const need = pkgs.filter(p => {
    const f = path.join(RAW, 'mods', p.packageId + '.xml.gz');
    if (!fs.existsSync(f)) return true;
    // lastModified changes for old packages too (re-renders), so only refresh recent issues
    return p.dateIssued >= recent && idx[p.packageId] !== p.lastModified;
  });
  log(`MODS: ${pkgs.length} packages, ${need.length} to fetch`);
  let done = 0;
  await pool(need, 4, async p => {
    try {
      const xml = await get(`https://api.govinfo.gov/packages/${p.packageId}/mods`, { api: true });
      gzWrite(path.join(RAW, 'mods', p.packageId + '.xml.gz'), xml);
      idx[p.packageId] = p.lastModified;
    } catch (e) { stats.failures.push('mods ' + p.packageId + ': ' + e.message); }
    if (++done % 25 === 0) { log(`MODS ${done}/${need.length} (api remaining ${apiRemaining})`); fs.writeFileSync(MODS_INDEX, JSON.stringify(idx)); }
  });
  fs.writeFileSync(MODS_INDEX, JSON.stringify(idx));
}

const unxml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
function parseMods(pkgId) {
  const f = path.join(RAW, 'mods', pkgId + '.xml.gz');
  if (!fs.existsSync(f)) return null;
  const xml = gzRead(f);
  const out = [];
  for (const part of xml.split('<relatedItem type="constituent"').slice(1)) {
    const cls = (part.match(/<granuleClass>([^<]+)/) || [])[1];
    if (cls !== 'HOUSE' && cls !== 'SENATE') continue;
    const g = (part.match(/<accessId>([^<]+)/) || [])[1];
    const date = (part.match(/<granuleDate>([^<]+)/) || [])[1];
    const title = (part.match(/<titleInfo>\s*<title>([^<]*)<\/title>/) || [])[1];
    const speakers = [];
    for (const m of part.matchAll(/<congMember ([^>]*)>([\s\S]*?)<\/congMember>/g)) {
      if (!/role="SPEAKING"/.test(m[1])) continue;
      const id = (m[1].match(/bioGuideId="([^"]+)"/) || [])[1];
      const parsed = (m[2].match(/<name type="parsed">([^<]*)/) || [])[1];
      if (id || parsed) speakers.push({ id: id || null, parsed: parsed ? unxml(parsed).trim() : null });
    }
    if (!g || !date) continue;
    out.push({ pkg: pkgId, g, date, chamber: cls === 'SENATE' ? 'Senate' : 'House', title: title ? unxml(title).trim() : null, speakers });
  }
  return out;
}

// ---------- 3. granule HTML: speaker turns ----------
const htmlPath = (pkg, g) => path.join(RAW, 'htm', pkg, g + '.htm.gz');
async function fetchHtml(list) {
  const need = list.filter(x => !fs.existsSync(htmlPath(x.pkg, x.g)));
  log(`HTML: ${list.length} granules, ${need.length} to fetch`);
  let done = 0;
  const t0 = Date.now();
  await pool(need, 6, async x => {
    try {
      const h = await get(`https://www.govinfo.gov/content/pkg/${x.pkg}/html/${x.g}.htm`);
      gzWrite(htmlPath(x.pkg, x.g), h);
    } catch (e) { stats.failures.push('html ' + x.g + ': ' + e.message); }
    if (++done % 500 === 0) {
      const rate = done / ((Date.now() - t0) / 1000);
      log(`HTML ${done}/${need.length} (${rate.toFixed(1)}/s, ~${Math.round((need.length - done) / rate / 60)} min left)`);
    }
  });
}

const unhtml = s => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
const NAME = String.raw`\p{Lu}(?:\p{Ll}{1,2}\p{Lu})?[\p{Lu}\p{M}'’\-]*`; // CRUZ, McGOVERN, DeLAURO, LaLOTA
const PERSON = String.raw`(?:Mr|Ms|Mrs|Miss|Dr)\.\s+${NAME}(?:\s+(?:${NAME}|de|la|del|of\s+\p{Lu}\p{L}+(?:\s+\p{Lu}\p{L}+)?))*\.`;
const OFFICER = String.raw`The\s+(?:[A-Za-z]+\s+){0,4}?(?:OFFICER|SPEAKER|PRESIDENT|CHAIR|CHAIRMAN|CHAIRWOMAN|CLERK|[Cc]lerk|CHAPLAIN|Chaplain)\b[^.]{0,60}\.`;
const LABEL = new RegExp(`^(?:${PERSON}|${OFFICER})(?:\\s|$)`, 'u');
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Paragraphs of the granule text: a paragraph starts on a line indented exactly two spaces.
function paragraphs(html) {
  const pre = (html.match(/<pre>([\s\S]*?)<\/pre>/) || [])[1];
  if (pre == null) return null;
  const lines = unhtml(pre).replace(/\r/g, '').split('\n');
  const paras = [];
  let cur = null;
  for (const line of lines) {
    if (/^\s*\[\[Page [^\]]+\]\]\s*$/.test(line) || /^\s*\{time\}/.test(line)) continue;
    if (/^\[(Congressional Record|Senate|House of Representatives|Pages? [^\]]+|Extensions of Remarks)/.test(line) || /^From the Congressional Record Online/.test(line)) continue;
    if (!line.trim()) { cur = null; continue; }
    if (/^ {2}\S/.test(line)) { cur = { text: line.trim() }; paras.push(cur); continue; }
    if (/^ {3,}\S/.test(line)) { cur = null; paras.push({ text: line.trim(), heading: true }); continue; }
    if (cur) cur.text += ' ' + line.trim(); else { cur = { text: line.trim() }; paras.push(cur); }
  }
  return paras;
}

// All of one speaker's turns in a granule (label stripped). withLead: the granule opens
// mid-turn (Senate speeches split into topic granules), so unlabeled leading text is theirs.
function turnsFor(paras, label, withLead) {
  const own = new RegExp(`^${esc(label)}\\.(?:\\s|$)`, 'iu');
  const turns = [];
  let cur = withLead ? [] : null;
  if (cur) turns.push(cur);
  for (const p of paras) {
    if (p.heading) continue;
    const t = p.text;
    if (own.test(t)) { cur = [t.replace(own, '').trim()]; turns.push(cur); continue; }
    if (LABEL.test(t)) { cur = null; continue; }
    if (INSERTED.test(t)) { cur = null; continue; } // what follows is printed material, not remarks
    if (cur && !/^\(.*\)$/.test(t)) cur.push(t);
  }
  return turns.map(parts => parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
}
// Label of the last turn in a granule, and whether the granule opens with unlabeled speech.
const LABEL_CAP = new RegExp(`^(${PERSON}|${OFFICER})(?:\\s|$)`, 'u');
function lastLabel(paras) {
  let last = null;
  for (const p of paras) { if (p.heading) continue; const m = p.text.match(LABEL_CAP); if (m) last = m[1].replace(/\.$/, ''); }
  return last;
}
function opensUnlabeled(paras) {
  const first = paras.find(p => !p.heading && !/^\(.*\)$/.test(p.text));
  return !!first && !LABEL.test(first.text);
}
const wordCount = s => (s.match(/\S+/g) || []).length;
const INSERTED = /^There being no objection, the .{0,200}?ordered to be printed in the Record/i;

// Clerical sections of the Record: tagged with members but not floor remarks.
const CLERICAL = new RegExp('^(?:' + [
  'PRAYER', 'PLEDGE OF ALLEGIANCE', 'ADJOURNMENT', 'RECESS', 'MORNING BUSINESS', 'QUORUM CALL', 'EXECUTIVE CALENDAR',
  'NOMINATIONS', 'CONFIRMATIONS', 'WITHDRAWALS?', 'APPOINTMENTS?', 'LEAVE OF ABSENCE',
].join('|') + ')$|^(?:' + [
  'MESSAGES? FROM THE (?:HOUSE|SENATE|PRESIDENT)', '(?:EXECUTIVE )?REPORTS? OF COMMITTEES?', 'SUBMITTED RESOLUTIONS',
  'ADDITIONAL COSPONSORS', 'AMENDMENTS SUBMITTED', 'TEXT OF AMENDMENTS', 'TEXT OF (?:SENATE|HOUSE) AMENDMENT',
  'STATEMENTS ON (?:INTRODUCED BILLS|SUBMITTED RESOLUTIONS)', 'INTRODUCTION OF BILLS', 'PUBLIC BILLS AND RESOLUTIONS',
  'CONS?TITUTIONAL\\W?AUTHORITY', 'EXECUTIVE COMMUNICATIONS', 'PETITIONS AND MEMORIALS', 'MEMORIALS',
  'AUTHORITY FOR COMMITTEES', 'PRIVILEGES? OF THE FLOOR', 'NOTICES? OF (?:HEARING|INTENT)', 'ENROLLED BILLS?',
  '(?:HOUSE |SENATE )?ENROLLED', 'MEASURES (?:PLACED|READ|REFERRED|DISCHARGED)', 'ORDERS? FOR ', 'DISCHARGE PETITIONS?',
  'EXPENDITURE REPORTS?', 'REPORTS? OF COMMITTEES? ON', 'SENATE COMMITTEE MEETINGS', 'DAILY DIGEST', 'FOREIGN TRAVEL',
  'CHANGE OF REFERENCE', 'REPORTS?, MEMORIALS', 'INTRODUCED BILLS',
].join('|') + ')', 'i');

// A turn is a speech when it has at least 40 words and is not a short procedural request.
const PROCEDURAL = /^(?:(?:Mr\.|Madam) (?:President|Speaker|Chair(?:man|woman)?),?\s*)?(?:I ask unanimous consent|I move|I suggest the absence|I yield|I reserve|I call up|I send (?:an|a) |I make a point|I raise a point|I demand|I withdraw|I object|I note the absence|I ask for the yeas|on behalf of the leader|I have \d+ requests)/i;
const substantive = t => { const n = wordCount(t); return n >= 40 && !(n < 100 && PROCEDURAL.test(t)); };

// CREC typesetting quotes ``like this'' -> “like this”.
const quotes = s => s.replace(/``/g, '“').replace(/''/g, '”');

// Sentence case for ALL-CAPS titles; bill names (… ACT) get title case; names after
// "death of", "honoring", "tribute to" etc. are capitalized.
const KEEP_UPPER = new Set('US USA UN EU NATO NASA FBI CIA ICE DHS DOD DOJ DOE DOT EPA FEMA FAA FCC FDA FTC IRS NIH CDC VA HUD USDA SNAP WIC TSA CBP NDAA AI II III IV VI VII VIII IX XI XII LGBTQ COVID DC NFL NBA MLB NCAA HBCU HBCUS PFAS ROTC POW MIA ESPN CEO GOP DEI ATF DEA NSA NOAA OPM OMB GAO CBO SBA SEC NLRB EEOC USPS TPS DACA CHIPS NIL WNBA NHL NASCAR AFL CIO JFK MLK UAW STEM UFC OSHA HIV AIDS PTSD ALS USMCA IRA CR NFIP NWS NPS BLM NIST NSF ARPA SCOTUS'.split(' '));
const PROPER = new Set(('alabama alaska arizona arkansas california colorado connecticut delaware florida georgia hawaii idaho illinois indiana iowa kansas kentucky louisiana maine maryland massachusetts michigan minnesota mississippi missouri montana nebraska nevada ohio oklahoma oregon pennsylvania tennessee texas utah vermont virginia washington wisconsin wyoming carolina dakota hampshire jersey mexico york rhode island puerto rico guam samoa mariana ' +
  'january february march april june july august september october november december monday tuesday wednesday thursday friday saturday sunday ' +
  'america american americans congress congressional senate house capitol constitution medicare medicaid christmas thanksgiving easter hanukkah passover ramadan juneteenth columbus ' +
  'israel israeli iran iranian ukraine ukrainian russia russian china chinese taiwan venezuela venezuelan cuba cuban gaza hamas hezbollah syria korea korean japan india mexican canada canadian greenland panama haiti haitian africa african europe european armenia armenian ' +
  'angeles francisco diego antonio jose chicago houston dallas miami atlanta phoenix detroit boston philadelphia seattle denver orleans vegas baltimore pittsburgh nashville memphis milwaukee cleveland cincinnati tampa orlando austin portland ' +
  'trump biden obama lincoln reagan kennedy washington jefferson god christian jewish catholic muslim hispanic latino asian arctic atlantic pacific gulf mississippi').split(' '));
const MINOR = new Set('a an and as at but by for from in into nor of on or per the to vs via with'.split(' '));
const NAME_LEAD = /\b(?:death|life|memory|honor|legacy|passing|nomination|confirmation|retirement|career|service) of$|\b(?:honoring|remembering|recognizing|congratulating|celebrating|commemorating|tribute to|thanking|welcoming|introducing)$/i;
function fixTitle(t) {
  if (!t) return t;
  t = quotes(t.replace(/\s+/g, ' ').trim());
  if (/\p{Ll}/u.test(t)) return t; // already mixed case
  const actTitle = /\bACT\b(?: OF \d{4})?(?:\W|$)/.test(t) && !/\bACTS?\s+(?:OF|ON)\s+(?!\d)/.test(t);
  const words = t.split(' ');
  let nameRun = false, prev = '';
  return words.map((w, i) => {
    const core = w.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, '');
    const lc = w.toLowerCase();
    const cap = s => s.replace(/\p{L}/u, c => c.toUpperCase()).replace(/([-“.])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/^(\p{L}['’])(\p{L})/u, (m, a, b) => a + b.toUpperCase());
    let out;
    if (KEEP_UPPER.has(core.replace(/['’]S$/, '')) || /\d/.test(core) && /^[A-Z\d.-]+$/.test(core) || /^(?:[A-Z]\.)+[A-Z]?\.?$/.test(core)) out = w;
    else if (i === 0 || /[:.!?]$/.test(prev)) out = cap(lc);
    else if (actTitle && !MINOR.has(core.toLowerCase())) out = cap(lc);
    else if (nameRun && !MINOR.has(core.toLowerCase())) out = cap(lc);
    else if (PROPER.has(core.toLowerCase().replace(/['’]s$/, ''))) out = cap(lc);
    else if (/^(?:new|north|south|west|east|san|los|las|el|st\.?)$/i.test(core) && PROPER.has((words[i + 1] || '').toLowerCase().replace(/[^\p{L}]+/gu, ''))) out = cap(lc);
    else out = lc;
    // a name follows "death of", "honoring", … and runs until a minor word or punctuation
    const next = (words[i + 1] || '').replace(/^[^\p{L}]+/u, '').toLowerCase();
    if (NAME_LEAD.test(words.slice(0, i + 1).join(' '))) nameRun = !!next && !MINOR.has(next.replace(/[^\p{L}]+$/u, ''));
    else if (nameRun && (/[,;:]$/.test(w) || MINOR.has(next.replace(/[^\p{L}]+$/u, '')))) nameRun = false;
    prev = w;
    return out;
  }).join(' ');
}

function excerptOf(s) {
  s = quotes(s);
  if (s.length <= EXCERPT) return s;
  const cut = s.slice(0, EXCERPT);
  const sp = cut.lastIndexOf(' ');
  return (sp > EXCERPT * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:]+$/, '') + '…';
}

// ---------- main ----------
(async () => {
  const t0 = Date.now();
  const people = JSON.parse(fs.readFileSync(PEOPLE, 'utf8'));
  const ids = new Set(people.filter(p => (p.status === 'serving' || p.status === 'leaving') && p.id && !p.id.startsWith('elect-')).map(p => p.id));
  log(`members: ${ids.size}`);

  const today = new Date().toISOString().slice(0, 10);
  const pkgs = (await listPackages(today)).filter(p => !p.congress || p.congress === '119');
  await fetchMods(pkgs);

  // GovInfo occasionally omits bioGuideId on a speaker tag: resolve the parsed label ("Mrs. McCLAIN DELANEY")
  // to a current member of that chamber only when exactly one member has that surname.
  const fold = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const surname = {};
  for (const p of people) if (ids.has(p.id)) (surname[(p.chamber === 'S' ? 'Senate' : 'House') + '|' + fold(p.last)] ||= []).push(p.id);
  const byName = (label, chamber) => {
    const m = (label || '').match(/^(?:Mr|Ms|Mrs|Miss|Dr)\.\s+(.+?)(?:\s+of\s+.+)?$/);
    const hit = m && surname[chamber + '|' + fold(m[1])];
    return hit && hit.length === 1 ? hit[0] : null;
  };
  const byMember = {};
  let through = null;
  for (const p of pkgs) {
    const grans = parseMods(p.packageId);
    if (!grans) continue;
    if (!through || p.dateIssued > through) through = p.dateIssued;
    const prevOf = {};
    for (const gr of grans) {
      gr.prev = prevOf[gr.chamber] || null; // granule before it on the same chamber's floor
      prevOf[gr.chamber] = gr;
      for (const sp of gr.speakers) {
        const sid = sp.id || byName(sp.parsed, gr.chamber);
        if (!ids.has(sid)) continue;
        const list = (byMember[sid] ||= new Map());
        if (!list.has(gr.g)) list.set(gr.g, { ...gr, label: sp.parsed });
      }
    }
  }
  const pageKey = g => { const m = g.match(/Pg[A-Z](\d+)(?:-(\d+))?/); return m ? +m[1] * 1000 + (+m[2] || 0) : 0; };
  const sorted = {};
  for (const [id, map] of Object.entries(byMember)) {
    sorted[id] = [...map.values()].sort((a, b) => b.date.localeCompare(a.date) || pageKey(b.g) - pageKey(a.g));
  }

  if (!NO_HTML) {
    const uniq = new Map();
    for (const list of Object.values(sorted)) for (const x of list) {
      uniq.set(x.g, x);
      if (x.prev && x.prev.speakers.length) uniq.set(x.prev.g, x.prev);
    }
    await fetchHtml([...uniq.values()]);
  }

  const parasCache = new Map();
  const paras = x => {
    if (parasCache.has(x.g)) return parasCache.get(x.g);
    const f = htmlPath(x.pkg, x.g);
    const v = fs.existsSync(f) ? paragraphs(gzRead(f)) : null;
    parasCache.set(x.g, v);
    if (parasCache.size > 3000) parasCache.delete(parasCache.keys().next().value);
    return v;
  };
  const sameLabel = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

  // Remarks by the member in granule x: array of turns, [] = tagged but no remarks of theirs
  // in the text (bill lists, roll calls, report filings), null = text unavailable.
  function remarks(x) {
    const ps = paras(x);
    if (!ps || !x.label) return null;
    let lead = false;
    if (opensUnlabeled(ps)) {
      const pp = x.prev && paras(x.prev);
      lead = pp ? sameLabel(lastLabel(pp), x.label) : x.speakers.length === 1;
    }
    return turnsFor(ps, x.label, lead);
  }

  const result = {};
  let withText = 0, noText = 0, dropped = 0, membersWithWords = 0;
  const droppedLog = [];
  for (const [id, list] of Object.entries(sorted)) {
    let words = 0, complete = !NO_HTML, count = 0;
    const items = [];
    for (const x of list) {
      if (x.title && CLERICAL.test(x.title)) { dropped++; droppedLog.push('clerical ' + id + ' ' + x.g + ' | ' + x.title); continue; }
      const turns = NO_HTML ? null : remarks(x);
      const speech = turns && turns.find(substantive);
      if (turns && !speech) { dropped++; droppedLog.push((turns.length ? 'procedural ' : 'no-turn ') + id + ' ' + x.g + ' ' + x.label + ' | ' + x.title); continue; }
      count++;
      if (turns) { withText++; words += turns.reduce((n, t) => n + wordCount(t), 0); }
      else { noText++; complete = false; }
      if (items.length < MAX_ITEMS) {
        const it = { date: x.date };
        if (x.title) it.title = fixTitle(x.title);
        it.chamber = x.chamber;
        it.granule = x.g;
        it.url = `https://www.govinfo.gov/content/pkg/${x.pkg}/html/${x.g}.htm`;
        if (speech) it.excerpt = excerptOf(speech);
        items.push(it);
      }
    }
    if (!count) continue;
    if (complete) membersWithWords++;
    result[id] = { count, words: complete ? words : null, items };
  }

  const out = { built: new Date().toISOString(), through, byMember: result };
  fs.writeFileSync(OUT, JSON.stringify(out));
  const total = Object.values(result).reduce((n, m) => n + m.count, 0);
  log(`wrote ${path.relative(ROOT, OUT)}: ${Object.keys(result).length} members, ${total} speeches, through ${through}, ${(fs.statSync(OUT).size / 1048576).toFixed(2)} MB`);
  log(`speeches with text: ${withText}, without text: ${noText}; dropped ${dropped} tagged granules with no remarks by the member; members with full word totals: ${membersWithWords}`);
  if (!NO_HTML) fs.writeFileSync(path.join(RAW, 'dropped.txt'), droppedLog.join('\n'));
  log(`requests: api ${stats.api}, html ${stats.html}, retries ${stats.retries}, failures ${stats.failures.length}`);
  if (stats.failures.length) { fs.writeFileSync(path.join(RAW, 'failures.txt'), stats.failures.join('\n')); stats.failures.slice(0, 20).forEach(f => log('  ' + f)); }
  log(`run time ${((Date.now() - t0) / 60000).toFixed(1)} min`);
})().catch(e => { console.error(e); process.exit(1); });
