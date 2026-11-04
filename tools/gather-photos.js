#!/usr/bin/env node
// Finds candidate photos on Wikipedia / Wikimedia Commons: the article's lead
// image (usually the official portrait) and a second photo of the person
// speaking or with voters. Writes server/data/photos.json keyed by
// "<raceId>|<candidate name>" with thumbnail URLs and attribution.
//
// Usage: node tools/gather-photos.js [senate,governor,house,local] [--limit N]
'use strict';
const fs = require('fs');
const path = require('path');

const SNAP = process.env.VOTEDASH_URL || 'https://votedash.net';
const OUT = path.join(__dirname, '..', 'server', 'data', 'photos.json');
const UA = 'VoteDash/1.0 (https://votedash.net; russgilbert@gmail.com) photo-gatherer';
const cats = (process.argv[2] || 'senate,governor').split(',');
const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity;
const RETRY = process.argv.includes('--retry');
const STATE_NAMES = { AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'District of Columbia' };

const ACCOUNTS = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server', 'data', 'accounts.json'), 'utf8')); } catch (e) { return []; } })();
function siteFor(c, race) {
  const toks = nameTokens(c.n); const last = toks[toks.length - 1], first = toks[0];
  const a = ACCOUNTS.find((x) => x.kind === 'candidate' && x.site && x.state === race.state && (race.cat === 'senate' ? x.office === 'senate' : x.district === race.district) && (() => { const t = nameTokens(x.name); return t[t.length - 1] === last && (t[0] === first || t[0].startsWith(first) || first.startsWith(t[0])); })());
  return a ? a.site : null;
}
async function campaignPhoto(c, race) {
  const site = siteFor(c, race); if (!site) return null;
  let html;
  try {
    const r = await fetch(site, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null; html = await r.text();
  } catch (e) { return null; }
  const base = site;
  const abs = (u) => { try { return new URL(u, base).href; } catch (e) { return null; } };
  const cands = [];
  for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/gi)) cands.push({ u: abs(m[1]), why: 'share image' });
  for (const m of html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/gi)) cands.push({ u: abs(m[1]), why: 'share image' });
  const toks = nameTokens(c.n); const last = toks[toks.length - 1];
  for (const m of html.matchAll(/<img[^>]+>/gi)) {
    const tag = m[0]; const src = (tag.match(/\s(?:data-src|src)=["']([^"']+)["']/i) || [])[1]; const alt = (tag.match(/\salt=["']([^"']*)["']/i) || [])[1] || '';
    if (!src || /\.svg|logo|icon|sprite|pixel|badge/i.test(src + alt)) continue;
    if (alt.toLowerCase().includes(last) || src.toLowerCase().includes(last)) cands.push({ u: abs(src), why: 'named photo' });
  }
  for (const k of cands) {
    if (!k.u || !/^https?:/.test(k.u)) continue;
    try {
      const h = await fetch(k.u, { method: 'GET', headers: { 'user-agent': 'Mozilla/5.0 VoteDash/1.0', range: 'bytes=0-0' }, signal: AbortSignal.timeout(10000) });
      const ct = h.headers.get('content-type') || '';
      if (/^image\/(jpeg|png|webp)/.test(ct)) return { url: k.u, credit: `Campaign website (${new URL(site).hostname})`, license: 'Campaign photo', page: site, why: k.why };
    } catch (e) { /* next */ }
  }
  return null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(host, params) {
  const u = new URL(`https://${host}/w/api.php`);
  for (const k in params) u.searchParams.set(k, params[k]);
  u.searchParams.set('format', 'json');
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(u, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
      if (r.status === 429) { await sleep(5000); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) { if (i === 2) throw e; await sleep(1500); }
  }
}
const clean = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
function licenseOk(meta) {
  const l = (meta.LicenseShortName && meta.LicenseShortName.value) || '';
  return /public domain|cc0|cc by|cc-by|attribution|GFDL|PD/i.test(l) && !/non-?commercial|nc\b|nd\b/i.test(l);
}
async function fileInfo(title) {
  const j = await api('commons.wikimedia.org', { action: 'query', titles: title, prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: 800 });
  const p = Object.values(j.query?.pages || {})[0];
  const ii = p && p.imageinfo && p.imageinfo[0];
  if (!ii || !/image\/(jpeg|png|webp)/.test(ii.mime)) return null;
  const m = ii.extmetadata || {};
  if (!licenseOk(m)) return null;
  return {
    url: ii.thumburl || ii.url, full: ii.url, w: ii.thumbwidth || ii.width, h: ii.thumbheight || ii.height,
    credit: clean(m.Artist && m.Artist.value) || clean(m.Credit && m.Credit.value) || 'Wikimedia Commons',
    license: clean(m.LicenseShortName && m.LicenseShortName.value), page: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
  };
}
function nameTokens(n) { return n.toLowerCase().replace(/["“”().,']/g, ' ').split(/\s+/).filter((t) => t.length > 1 && !/^(jr|sr|ii|iii|iv|dr)$/.test(t)); }

const NICK = { john: ['jack', 'johnny'], jack: ['john'], william: ['bill', 'billy', 'will'], bill: ['william'], robert: ['bob', 'rob', 'bobby'], bob: ['robert'], richard: ['dick', 'rick', 'rich'], rick: ['richard'], james: ['jim', 'jimmy'], jim: ['james'], edward: ['ed', 'eddie', 'ted'], ed: ['edward'], thomas: ['tom', 'tommy'], tom: ['thomas'], daniel: ['dan', 'danny'], dan: ['daniel'], michael: ['mike'], mike: ['michael'], joseph: ['joe'], joe: ['joseph'], charles: ['chuck', 'charlie'], anthony: ['tony'], elizabeth: ['liz', 'beth'], katherine: ['kathy', 'kate', 'katie'], margaret: ['peggy', 'meg'], christopher: ['chris'], chris: ['christopher'], jonathan: ['jon'], jon: ['jonathan'], benjamin: ['ben'], ben: ['benjamin'], andrew: ['andy', 'drew'], andy: ['andrew'], steven: ['steve'], stephen: ['steve'], steve: ['steven', 'stephen'], timothy: ['tim'], tim: ['timothy'], matthew: ['matt'], matt: ['matthew'], gregory: ['greg'], greg: ['gregory'], patrick: ['pat'], nicholas: ['nick'], samuel: ['sam'], donald: ['don'], ronald: ['ron'], raymond: ['ray'], kenneth: ['ken'], douglas: ['doug'], lawrence: ['larry'], theodore: ['ted'], frederick: ['fred'], alexander: ['alex'], jennifer: ['jen', 'jenny'], deborah: ['deb', 'debbie'], susan: ['sue'], patricia: ['pat', 'patty'], rebecca: ['becky'], cynthia: ['cindy', 'cinde'], jacqueline: ['jackie'] };
function firstMatches(a, b) { if (a === b || a.startsWith(b) || b.startsWith(a)) return true; return (NICK[a] || []).includes(b) || (NICK[b] || []).includes(a); }
async function findArticle(c, race) {
  const st = STATE_NAMES[race.state] || race.state;
  const office = race.cat === 'senate' ? 'senator' : race.cat === 'governor' ? 'governor' : race.cat === 'house' ? 'representative' : 'politician';
  const toks = nameTokens(c.n);
  const last = toks[toks.length - 1], first = toks[0];
  const short = `${first} ${last}`;
  const queries = [`"${c.n}" ${st} ${office}`, `${short} ${st} ${office}`, `${short} politician`];
  const POL = /politic|senator|representative|governor|congress|mayor|council|attorney|candidate|legislat|assembly|election|judge|sheriff|businessman|businesswoman|activist|lawyer|physician|veteran|secretary|treasurer|auditor|commissioner|official|party/;
  for (const q of queries) {
    const j = await api('en.wikipedia.org', { action: 'query', list: 'search', srsearch: q, srlimit: 6, srnamespace: 0 });
    for (const hit of j.query?.search || []) {
      const t = hit.title.toLowerCase();
      const tt = nameTokens(hit.title.replace(/\(.*\)/, ''));
      if (!t.includes(last)) continue;
      const tfirst = tt[0] || '';
      if (!(firstMatches(tfirst, first) || first.length <= 3)) continue;
      const snippet = clean(hit.snippet).toLowerCase();
      const exact = tt[tt.length - 1] === last && firstMatches(tfirst, first);
      if (!exact && !POL.test(snippet + ' ' + t)) continue;
      if (exact && !POL.test(snippet + ' ' + t) && !snippet.includes(st.toLowerCase())) continue;
      return hit.title;
    }
    await sleep(150);
  }
  return null;
}

async function portraitFor(title) {
  const j = await api('en.wikipedia.org', { action: 'query', titles: title, prop: 'pageimages|pageprops', piprop: 'name', ppprop: 'disambiguation' });
  const p = Object.values(j.query?.pages || {})[0];
  if (!p || p.pageprops?.disambiguation !== undefined) return null;
  if (!p.pageimage) return null;
  return fileInfo('File:' + p.pageimage);
}

async function actionFor(c, portraitFile) {
  const toks = nameTokens(c.n);
  const q = `"${toks[0]} ${toks[toks.length - 1]}" (speaking OR speaks OR speech OR rally OR town hall OR voters OR campaign OR event)`;
  const j = await api('commons.wikimedia.org', { action: 'query', list: 'search', srsearch: q, srnamespace: 6, srlimit: 8 });
  for (const hit of j.query?.search || []) {
    if (portraitFile && hit.title === portraitFile) continue;
    if (!/\.(jpe?g|png|webp)$/i.test(hit.title)) continue;
    const t = hit.title.toLowerCase();
    if (!t.includes(toks[toks.length - 1])) continue;
    if (/portrait|headshot|official|seal|logo|signature|map/.test(t)) continue;
    const info = await fileInfo(hit.title);
    if (info && info.w >= 400) return info;
    await sleep(150);
  }
  return null;
}

(async () => {
  const snap = await (await fetch(`${SNAP}/api/snapshot`, { headers: { 'user-agent': UA } })).json();
  const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  const races = snap.races.filter((r) => cats.includes(r.cat) || (cats.includes('local') && r.sb));
  let done = 0, found = 0, action = 0, skipped = 0;
  for (const r of races) {
    for (const c of r.cands) {
      if (c.n === 'Write-in' || !/^[DRI]$/.test(c.p) && r.cat !== 'local') continue;
      const key = `${r.id}|${c.n}`;
      if (out[key] && !(RETRY && !out[key].portrait && !out[key].campaign)) { skipped++; continue; }
      if (done >= LIMIT) break;
      done++;
      try {
        const title = await findArticle(c, r);
        let portrait = null, act = null;
        if (title) { portrait = await portraitFor(title); await sleep(200); act = await actionFor(c, portrait ? decodeURIComponent(portrait.page.split('/wiki/')[1]) : null); }
        const campaign = await campaignPhoto(c, r);
        out[key] = { article: title ? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}` : null, portrait: portrait || null, action: act || null, campaign: campaign || null, t: Date.now() };
        if (portrait || campaign) found++; if (act) action++;
        if (done % 10 === 0) { fs.writeFileSync(OUT, JSON.stringify(out)); console.log(`${done} checked, ${found} portraits, ${action} action photos`); }
      } catch (e) { console.error('err', key, e.message); }
      await sleep(250);
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`done: ${done} checked, ${found} portraits, ${action} action photos, ${skipped} already had entries -> ${OUT}`);
})();
