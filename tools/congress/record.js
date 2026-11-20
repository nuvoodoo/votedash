// Record (ethics, legal, censure, investigations, controversies) for each member / member-elect.
//
//   node tools/congress/record.js leads   fetch Wikipedia articles (cached in data/raw/record/wiki),
//                                         write data/raw/record/leads.json: per person, the matching
//                                         sections and keyword paragraphs with their cited references
//   node tools/congress/record.js check   HTTP-check every source URL in record-items.json
//                                         (cached in data/raw/record/urlcheck.json)
//   node tools/congress/record.js build   validate record-items.json against people.json and the URL
//                                         check, write server/congress/data/record.json
//
// The items themselves are curated by hand in tools/congress/record-items.json:
//   { "<person id>": [ { date, kind, title, summary, status, sources: [ { name, url, date } ] } ] }
// An item is published only if every field validates and at least one source URL returned HTTP 200.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const RAW = path.join(ROOT, 'data/raw/record');
const WIKI = path.join(RAW, 'wiki');
const PEOPLE = path.join(ROOT, 'server/congress/data/people.json');
const ITEMS = path.join(__dirname, 'record-items.json');
const OUT = path.join(ROOT, 'server/congress/data/record.json');
const UA = 'VoteDash-congress-directory/1.0 (record builder)';
fs.mkdirSync(WIKI, { recursive: true });

const KINDS = new Set(['ethics', 'legal', 'censure', 'investigation', 'campaign-finance', 'stock-trading', 'other']);
const STATUSES = new Set(['open', 'closed', 'convicted', 'acquitted', 'dismissed', 'settled', 'cleared', null]);
const HEAD_RX = /controvers|ethic|legal|investigat|scandal|censure|reprimand|indict|lawsuit|litigation|stock|trading|arrest|criminal|allegation|misconduct|campaign finance|fraud|conviction|trial|charges|harass|bribe|impeach/i;
const TEXT_RX = /\b(indicted|indictment|censured|censure resolution|reprimand(ed)?|Office of Congressional (Ethics|Conduct)|House (Committee on )?Ethics Committee|Ethics Committee|Senate Ethics|STOCK Act|pleaded guilty|convicted|acquitted|arrested|charged with|lawsuit against|sued|FEC (fine|complaint)|Federal Election Commission|subpoena|FBI|Department of Justice investigation|grand jury)\b/i;

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, opts = {}) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, ...(opts.headers || {}) }, redirect: 'follow', signal: AbortSignal.timeout(opts.timeout || 30000), method: opts.method || 'GET' });
      if (r.status === 429 || r.status >= 500) { await sleep(2000 * (i + 1)); if (i < 3) continue; }
      return r;
    } catch (e) { if (i === 3) throw e; await sleep(1500 * (i + 1)); }
  }
}

// ---------- Wikipedia ----------
async function getJson(url) {
  for (let i = 0; i < 6; i++) {
    const t = await (await get(url)).text();
    try { return JSON.parse(t); } catch { await sleep(5000 * (i + 1)); }
  }
  throw new Error('no JSON from ' + url);
}
const wfile = t => path.join(WIKI, t.replace(/[^\w.-]+/g, '_') + '.json');
async function wikiBatch(titles) {
  const todo = titles.filter(t => !fs.existsSync(wfile(t)));
  for (let i = 0; i < todo.length; i += 50) {
    const chunk = todo.slice(i, i + 50);
    const u = 'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&prop=revisions&rvprop=content|timestamp&rvslots=main&titles=' + encodeURIComponent(chunk.join('|'));
    const j = await getJson(u);
    const redir = Object.fromEntries((j.query.redirects || []).concat(j.query.normalized || []).map(r => [r.to, r.from]));
    for (const pg of j.query.pages) {
      let from = pg.title; while (redir[from]) from = redir[from];
      const rev = pg.revisions && pg.revisions[0];
      fs.writeFileSync(wfile(from), JSON.stringify({ title: pg.title, ts: rev && rev.timestamp, text: rev ? rev.slots.main.content : null }));
    }
    process.stdout.write(`wiki ${Math.min(i + 50, todo.length)}/${todo.length}\r`);
    await sleep(1500);
  }
}
async function wikiSearch(q) {
  const f = path.join(WIKI, 'search_' + q.replace(/[^\w.-]+/g, '_') + '.json');
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  const u = 'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&list=search&srlimit=3&srsearch=' + encodeURIComponent(q);
  const j = await getJson(u);
  const out = (j.query.search || []).map(s => s.title);
  fs.writeFileSync(f, JSON.stringify(out));
  await sleep(1200);
  return out;
}

function refsIn(text) {
  const out = [];
  const rx = /<ref[^>/]*>([\s\S]*?)<\/ref>/g; let m;
  while ((m = rx.exec(text))) {
    const body = m[1];
    const f = k => { const mm = body.match(new RegExp('\\|\\s*' + k + '\\s*=\\s*([^|}]*)', 'i')); return mm ? mm[1].trim() : null; };
    const url = f('url') || (body.match(/https?:\/\/[^\s|\]}]+/) || [])[0] || null;
    if (url) out.push({ url, title: f('title'), work: f('work') || f('website') || f('newspaper') || f('publisher') || f('agency'), date: f('date'), archive: f('archive-url') });
  }
  return out;
}
const plain = s => s.replace(/<ref[^>/]*>[\s\S]*?<\/ref>|<ref[^>]*\/>/g, '').replace(/\{\{[^{}]*\}\}/g, '')
  .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1').replace(/'''?/g, '').replace(/\s+/g, ' ').trim();

function sections(text) {
  const out = []; const rx = /^(={2,5})\s*(.+?)\s*\1\s*$/gm; let m, last = { head: '(lead)', level: 1, start: 0 };
  while ((m = rx.exec(text))) { out.push({ ...last, body: text.slice(last.start, m.index) }); last = { head: m[2], level: m[1].length, start: rx.lastIndex }; }
  out.push({ ...last, body: text.slice(last.start) });
  return out;
}

async function leads() {
  const people = JSON.parse(fs.readFileSync(PEOPLE, 'utf8'));
  const titleOf = {};
  for (const p of people) {
    let t = p.ids && p.ids.wikipedia;
    if (!t) {
      const hits = await wikiSearch(`${p.name} politician ${p.state}`);
      t = hits.find(h => { const last = p.name.split(' ').pop().toLowerCase(); return h.toLowerCase().includes(last); }) || null;
    }
    if (t) titleOf[p.id] = t;
  }
  await wikiBatch([...new Set(Object.values(titleOf))]);
  const out = {};
  for (const p of people) {
    const t = titleOf[p.id]; if (!t || !fs.existsSync(wfile(t))) continue;
    const w = JSON.parse(fs.readFileSync(wfile(t), 'utf8'));
    if (!w.text) continue;
    if (!p.ids?.wikipedia && !/politician|Republican|Democrat|elected|legislat|House of Representatives|Senate/i.test(w.text.slice(0, 4000))) continue;
    const hits = [];
    for (const s of sections(w.text)) {
      if (/^(References|External links|Notes|See also|Electoral history|Further reading)$/i.test(s.head)) continue;
      const headHit = HEAD_RX.test(s.head);
      const paras = s.body.split(/\n\s*\n/).filter(pp => headHit || TEXT_RX.test(plain(pp)));
      if (!paras.length) continue;
      hits.push({ section: s.head, headHit, paras: paras.map(pp => ({ text: plain(pp), refs: refsIn(pp) })) });
    }
    if (hits.length) out[p.id] = { name: p.name, status: p.status, chamber: p.chamber, state: p.state, wiki: w.title, wikiTs: w.ts, hits };
  }
  fs.writeFileSync(path.join(RAW, 'leads.json'), JSON.stringify(out, null, 1));
  console.log(`\nleads: ${Object.keys(out).length} people, ${Object.values(out).filter(o => o.hits.some(h => h.headHit)).length} with a matching section`);
}

// ---------- URL check ----------
const CHECK = path.join(RAW, 'urlcheck.json');
async function check() {
  const items = JSON.parse(fs.readFileSync(ITEMS, 'utf8'));
  const cache = fs.existsSync(CHECK) ? JSON.parse(fs.readFileSync(CHECK, 'utf8')) : {};
  const urls = [...new Set(Object.values(items).flat().flatMap(i => i.sources.map(s => s.url)))].filter(u => !cache[u] || cache[u].status !== 200);
  let n = 0;
  const work = urls.slice();
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (work.length) {
      const u = work.shift();
      let status = 0;
      try {
        const r = await get(u, { timeout: 25000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', Accept: 'text/html,application/xhtml+xml,application/pdf,*/*' } });
        status = r.status; try { await r.body?.cancel(); } catch {}
      } catch (e) { status = 0; }
      cache[u] = { status, at: new Date().toISOString() };
      if (++n % 25 === 0) console.log(`checked ${n}/${urls.length}`);
    }
  }));
  fs.writeFileSync(CHECK, JSON.stringify(cache, null, 1));
  const bad = Object.entries(cache).filter(([u, c]) => c.status !== 200 && urls.includes(u));
  console.log(`\nchecked ${urls.length}; not 200: ${bad.length}`);
  for (const [u, c] of bad) console.log(c.status, u);
}

// ---------- build ----------
function build() {
  const people = new Map(JSON.parse(fs.readFileSync(PEOPLE, 'utf8')).map(p => [p.id, p]));
  const items = JSON.parse(fs.readFileSync(ITEMS, 'utf8'));
  const cache = fs.existsSync(CHECK) ? JSON.parse(fs.readFileSync(CHECK, 'utf8')) : {};
  const byPerson = {}; const errors = []; let dropped = 0;
  for (const [id, list] of Object.entries(items)) {
    if (id.startsWith('_')) continue;
    if (!people.has(id)) { errors.push(`${id}: not in people.json`); continue; }
    const keep = [];
    for (const it of list) {
      const where = `${id} "${it.title}"`;
      if (!/^\d{4}-\d{2}(-\d{2})?$/.test(it.date || '')) errors.push(`${where}: bad date`);
      if (!KINDS.has(it.kind)) errors.push(`${where}: bad kind`);
      if (!STATUSES.has(it.status === undefined ? null : it.status)) errors.push(`${where}: bad status`);
      if (!it.title || !it.summary) errors.push(`${where}: missing title/summary`);
      const sources = (it.sources || []).filter(s => s.name && /^https:\/\//.test(s.url) && /^\d{4}-\d{2}(-\d{2})?$/.test(s.date || '') && cache[s.url]?.status === 200);
      if (!sources.length) { dropped++; console.warn(`dropped (no verified source): ${where}`); continue; }
      keep.push({ date: it.date, kind: it.kind, title: it.title, summary: it.summary, status: it.status ?? null,
        sources: sources.map(s => ({ name: s.name, url: s.url, date: s.date })) });
    }
    if (keep.length) byPerson[id] = keep.sort((a, b) => b.date.localeCompare(a.date));
  }
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  fs.writeFileSync(OUT, JSON.stringify({ built: new Date().toISOString(), byPerson }, null, 1));
  const n = Object.values(byPerson).reduce((a, l) => a + l.length, 0);
  console.log(`record.json: ${Object.keys(byPerson).length} people, ${n} items, ${dropped} dropped`);
}

const cmd = process.argv[2];
({ leads, check, build }[cmd] || (() => { console.log('usage: record.js leads|check|build'); }))();
