// Builds server/congress/data/caucuses.json: membership of the main ideological and identity
// caucuses of the 119th Congress, matched to bioguide ids in people.json.
// Sources: each caucus's official roster page; Wikipedia where no official roster is published.
// Raw pages are cached under data/raw/caucuses/ (pass --refresh to re-download).
// Usage: node tools/congress/caucuses.js [--refresh] [--verbose]
'use strict';
const fs = require('fs');
const path = require('path');
const RAW = path.join(process.env.CONGRESS_RAW || path.join(__dirname, '../../data/raw'), 'caucuses');
const OUT = process.env.CONGRESS_OUT || path.join(__dirname, '../../server/congress/data');
const REFRESH = process.argv.includes('--refresh');
const VERBOSE = process.argv.includes('--verbose'); // print every non-exact match for review
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';

const STATES = { Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY', 'District of Columbia': 'DC', 'Puerto Rico': 'PR', Guam: 'GU', 'Virgin Islands': 'VI', 'American Samoa': 'AS', 'Northern Mariana Islands': 'MP' };
const stateCode = s => { s = (s || '').replace(/^the\s+/i, '').trim(); return STATES[s] || (/^[A-Z]{2}$/.test(s) ? s : null); };
const dnum = s => (s == null || /AL|large/i.test(s) ? 0 : parseInt(s, 10));

const ent = s => s.replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&rsquo;/g, "'").replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const lines = html => ent(html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '\n'))
  .split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
const between = (arr, from, to) => { const a = arr.indexOf(from); const b = arr.indexOf(to, a + 1); return arr.slice(a + 1, b < 0 ? undefined : b); };
const stripTitle = s => s.replace(/^(Rep|Sen|Del|Mr|Ms|Mrs|Dr)\.\s*/i, '').trim();

async function get(file, url) {
  const f = path.join(RAW, file);
  if (!REFRESH && fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
  const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  const t = await r.text();
  fs.writeFileSync(f, t);
  return t;
}
// date an official page was downloaded (cache file mtime, local time)
const fetched = file => fs.statSync(path.join(RAW, file)).mtime.toLocaleDateString('en-CA');
// Wikipedia: current wikitext plus the revision id, so the source URL is a permalink.
async function wiki(title) {
  const api = `https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content|ids|timestamp&rvslots=main&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(title)}`;
  const j = JSON.parse(await get(`wiki-${title.replace(/\W+/g, '_')}.json`, api));
  const rev = j.query.pages[0].revisions[0];
  return { text: rev.slots.main.content, url: `https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(j.query.pages[0].title.replace(/ /g, '_'))}&oldid=${rev.revid}`, date: rev.timestamp.slice(0, 10) };
}
// Rows of a Wikipedia member table: district cell "[[...|XX-NN]]" and member cell "{{sortname|First|Last}}".
function wikiTable(text, heading) {
  const a = text.indexOf(heading); if (a < 0) throw new Error(`no "${heading}"`);
  const t = text.slice(a, text.indexOf('|}', a));
  const out = [];
  for (const row of t.split(/\n\|-/).slice(1)) {
    const d = row.match(/\|([A-Z]{2})-(AL|\d+)\]\]/); const n = row.match(/\{\{sortname\|([^|}]+)\|([^|}]+)/);
    if (d && n) out.push({ name: `${n[1]} ${n[2]}`, state: d[1], district: dnum(d[2]), chamber: 'H' });
  }
  return out;
}

// ---- roster parsers: each returns [{ name, state?, district?, chamber? }] ----
const CAUCUSES = [
  { id: 'freedom', name: 'House Freedom Caucus', party: 'R', kind: 'ideological',
    async load() { const w = await wiki('Freedom Caucus'); return { src: { name: 'Wikipedia, "Freedom Caucus" member list (caucus publishes no official roster)', url: w.url, date: w.date }, list: wikiTable(w.text, '=== Current members ===') }; } },
  { id: 'rsc', name: 'Republican Study Committee', party: 'R', kind: 'ideological',
    async load() {
      const w = await wiki('Republican Study Committee');
      const a = w.text.indexOf('=== Current members ==='); const sec = w.text.slice(a, w.text.indexOf('\n==', a + 30));
      const list = [...sec.matchAll(/^\*\s*\[\[(?:[^\]|]*\|)?([^\]]+)\]\]\s*\(([A-Z]{2})-(AL|\d+)\)/gm)].map(m => ({ name: m[1], state: m[2], district: dnum(m[3]), chamber: 'H' }));
      return { src: { name: 'Wikipedia, "Republican Study Committee" member list (official roster unpublished since January 2025)', url: w.url, date: w.date }, list };
    } },
  { id: 'mainstreet', name: 'Republican Main Street Caucus', party: 'R', kind: 'ideological',
    async load() {
      const url = 'https://mainstreetcaucus.house.gov/membership';
      const L = lines(await get('mainstreet.html', url)); const list = [];
      L.forEach((l, i) => { const m = l.match(/^(.+?)\s?'s (?:(\d+)\w*|At Large) District$/); if (m && /^Rep\./.test(L[i - 1])) list.push({ name: stripTitle(L[i - 1]).replace(/\s*M\.D\.$/, ''), state: stateCode(m[1]), district: m[2] ? +m[2] : 0, chamber: 'H' }); });
      return { src: { name: 'Main Street Caucus, Membership', url, date: fetched('mainstreet.html') }, list };
    } },
  { id: 'problemsolvers', name: 'Problem Solvers Caucus', party: 'both', kind: 'ideological',
    async load() {
      const url = 'https://problemsolverscaucus.house.gov/about/caucus-members.htm';
      const list = []; const seen = new Set();
      for (const l of lines(await get('problemsolvers.html', url))) { const m = l.match(/^(.+?)\s+\(([A-Z]{2})-(AL|\d+)\)$/); if (m && !seen.has(l)) { seen.add(l); list.push({ name: stripTitle(m[1]), state: m[2], district: dnum(m[3]), chamber: 'H' }); } }
      return { src: { name: 'Problem Solvers Caucus, Caucus Members', url, date: fetched('problemsolvers.html') }, list };
    } },
  { id: 'progressive', name: 'Congressional Progressive Caucus', party: 'D', kind: 'ideological',
    async load() {
      const url = 'https://progressives.house.gov/caucus-members';
      const L = lines(await get('progressive.html', url)); const list = [];
      for (let i = 1; i < L.length; i++) {
        let loc = L[i]; if (/ of$/.test(loc)) loc += ' ' + L[i + 1];
        let m;
        if ((m = loc.match(/^U\.S\. Senator for (.+)$/))) list.push({ name: L[i - 1], state: stateCode(m[1]), chamber: 'S' });
        else if ((m = loc.match(/^(\d+)\w* District of (.+)$/))) list.push({ name: L[i - 1], state: stateCode(m[2]), district: +m[1], chamber: 'H' });
        else if ((m = loc.match(/^Representing (.+)$/)) || (m = loc.match(/^(.+) District at Large$/))) list.push({ name: L[i - 1], state: stateCode(m[1]), district: 0, chamber: 'H' });
      }
      return { src: { name: 'Congressional Progressive Caucus, Caucus Members', url, date: fetched('progressive.html') }, list };
    } },
  { id: 'newdem', name: 'New Democrat Coalition', party: 'D', kind: 'ideological',
    async load() {
      const url = 'https://newdemocratcoalition.house.gov/members';
      const h = await get('newdem.html', url);
      const body = h.slice(h.indexOf('class="leadership__state"')); // member section only (leadership block above repeats names)
      const list = [];
      for (const card of body.split('leadership__list-item').slice(1)) {
        const d = card.match(/leadership__district">\s*<span[^>]*value="([^"]+)"[^>]*>[^<]*<\/span>([^<]*)/); const n = card.match(/leadership__member-name">\s*(?:<a[^>]*>)?([^<]+)/);
        const dd = ent(d ? d[2] : '').match(/(\d+|AL)/); // Puerto Rico's card has no district
        if (d && n) list.push({ name: ent(n[1]).replace(/\s+/g, ' ').trim(), state: stateCode(d[1]), district: dd ? dnum(dd[1]) : undefined, chamber: 'H' });
      }
      return { src: { name: 'New Democrat Coalition, Members', url, date: fetched('newdem.html') }, list };
    } },
  { id: 'bluedog', name: 'Blue Dog Coalition', party: 'D', kind: 'ideological',
    async load() {
      const url = 'https://bluedogs-gluesenkampperez.house.gov/members';
      const L = between(lines(await get('bluedog.html', url)), 'Our Chairs', 'Search again');
      return { src: { name: 'Blue Dog Coalition, Members', url, date: fetched('bluedog.html') }, list: L.filter(l => l !== 'Members').map(l => ({ name: stripTitle(l), chamber: 'H' })) };
    } },
  { id: 'cbc', name: 'Congressional Black Caucus', party: 'D', kind: 'identity',
    async load() {
      const url = 'https://cbc.house.gov/membership/';
      const L = lines(await get('cbc.html', url)); const list = [];
      L.forEach((l, i) => { const t = l.match(/^(Rep|Sen|Del)\. (.+)$/); const m = (L[i + 1] || '').match(/\b[DRI]-([A-Z]{2})(?:-(\d+))?$/); if (t && m) list.push({ name: t[2], state: m[1], district: t[1] === 'Sen' ? undefined : (m[2] ? +m[2] : 0), chamber: t[1] === 'Sen' ? 'S' : 'H' }); });
      return { src: { name: 'Congressional Black Caucus, Membership', url, date: fetched('cbc.html') }, list };
    } },
  { id: 'chc', name: 'Congressional Hispanic Caucus', party: 'D', kind: 'identity',
    async load() {
      const url = 'https://chc.house.gov/members';
      const L = between(lines(await get('chc.html', url)), 'CHC Leadership', 'Copyright');
      const list = L.filter(l => !/Chair|Whip|^Freshman Representative$|^Members$/.test(l)).map(l => ({ name: stripTitle(l).replace(/,?\s+Jr\.?$/, ''), chamber: /^Sen\./.test(l) ? 'S' : 'H' }));
      return { src: { name: 'Congressional Hispanic Caucus, Members', url, date: fetched('chc.html') }, list };
    } },
  { id: 'hispanicconf', name: 'Congressional Hispanic Conference', party: 'R', kind: 'identity',
    async load() {
      const url = 'https://hispanicconference-gonzales.house.gov/members';
      const L = lines(await get('hispanicconf.html', url)); const list = [];
      L.forEach((l, i) => { const m = l.match(/^([A-Z]{2})-(\d+)\w* District$/); if (m && /^Visit Member/.test(L[i - 1])) list.push({ name: L[i - 3], state: m[1], district: +m[2], chamber: 'H' }); });
      return { src: { name: 'Congressional Hispanic Conference, Members', url, date: fetched('hispanicconf.html') }, list };
    } },
  { id: 'capac', name: 'Congressional Asian Pacific American Caucus', party: 'D', kind: 'identity',
    async load() {
      const url = 'https://capac.house.gov/membership';
      // full members only: Leadership + Executive Board; associate members are listed separately and left out
      const L = between(lines(await get('capac.html', url)), 'Leadership', 'Senate Associate Members'); const list = [];
      const role = /Chair|Whip|^Freshman Representative$|^Executive Board Members$/;
      L.forEach((l, i) => {
        let m, name = role.test(L[i - 1] || '') ? L[i - 2] : L[i - 1];
        if ((m = l.match(/^([A-Z]{2}) (\d+)$/))) list.push({ name, state: m[1], district: +m[2], chamber: 'H' });
        else if (stateCode(l) && /^Sen\./.test(name || '')) list.push({ name: stripTitle(name), state: stateCode(l), chamber: 'S' });
      });
      return { src: { name: 'CAPAC, Membership (full members; associate members excluded)', url, date: fetched('capac.html') }, list };
    } },
];

// ---- matching ----
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
const people = JSON.parse(fs.readFileSync(path.join(OUT, 'people.json'), 'utf8')).filter(p => !/^elect-/.test(p.id));
const NICK = { lou: 'luis' }; // nicknames used on rosters but absent from people.json
for (const p of people) {
  p._last = norm(p.last).replace(/ (jr|sr|ii|iii|iv)$/, '');
  // compound surnames ("Hernández Rivera") are often shortened to their first word on rosters
  p._lasts = [p._last]; const w = p._last.split(' ')[0]; if (w !== p._last && w.length > 3) p._lasts.push(w);
  // given names: first, quoted nickname, and every other token of the full name that is not the surname
  const lastToks = new Set(p._last.split(' '));
  const firsts = [p.first, ...(p.name.match(/"([^"]+)"/g) || []), ...norm(p.name.replace(/"[^"]*"/g, '')).split(' ').filter(t => !lastToks.has(t) && !/^(jr|sr|ii|iii|iv)$/.test(t))];
  p._firsts = new Set(firsts.flatMap(f => norm(f).split(' ')).filter(f => f.length > 1));
}
const hasLast = (p, n) => p._lasts.some(l => ` ${n} `.includes(` ${l} `));
const hasFirst = (p, n) => n.split(' ').some(t => p._firsts.has(t) || p._firsts.has(NICK[t]));

function match(r) {
  const n = norm(r.name);
  let pool = people.filter(p => (!r.chamber || p.chamber === r.chamber) && hasLast(p, n));
  if (r.state) pool = pool.filter(p => p.state === r.state);
  if (pool.length > 1 && r.district != null) { const d = pool.filter(p => p.district === r.district); if (d.length) pool = d; }
  if (pool.length > 1) pool = pool.filter(p => hasFirst(p, n));
  if (pool.length !== 1) return null;
  const p = pool[0];
  // without state + district agreement, also require the first name/nickname to agree
  if (!(r.state && r.district != null && p.district === r.district) && !hasFirst(p, n)) return null;
  return p;
}

(async () => {
  const t0 = Date.now();
  fs.mkdirSync(RAW, { recursive: true });
  const caucuses = [], members = {}, report = [];
  for (const c of CAUCUSES) {
    const { src, list } = await c.load();
    if (!list.length) throw new Error(`${c.id}: roster parsed empty`);
    const ids = new Set(), unmatched = [];
    for (const r of list) {
      const p = match(r);
      if (p && VERBOSE && (norm(r.name) !== norm(p.name) || r.state !== p.state || r.district !== p.district)) console.log(`  ${c.id}: "${r.name}" ${r.state || '?'}-${r.district ?? '?'} -> ${p.id} ${p.name} ${p.state}-${p.district ?? ''}`);
      if (p) ids.add(p.id); else unmatched.push(`${r.name}${r.state ? ` (${r.state}${r.district != null ? '-' + r.district : ''})` : ''}`); }
    for (const id of ids) (members[id] = members[id] || []).push(c.id);
    caucuses.push({ id: c.id, name: c.name, party: c.party, kind: c.kind, size: ids.size, source: src });
    report.push({ id: c.id, roster: list.length, matched: ids.size, unmatched });
  }
  fs.writeFileSync(path.join(OUT, 'caucuses.json'), JSON.stringify({ built: new Date().toISOString(), caucuses, members }));
  for (const r of report) console.log(`${r.id.padEnd(15)} roster ${String(r.roster).padStart(3)}  matched ${String(r.matched).padStart(3)}${r.unmatched.length ? '  UNMATCHED: ' + r.unmatched.join('; ') : ''}`);
  console.log(`members with any caucus: ${Object.keys(members).length}; ${((Date.now() - t0) / 1000).toFixed(1)}s`);
})().catch(e => { console.error(e); process.exit(1); });
