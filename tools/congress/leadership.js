// Leadership of both chambers and the four party conferences/caucuses, and how leaders were chosen.
//
//   node tools/congress/leadership.js
//
// Curated items live in tools/congress/leadership-items.json:
//   sourceSets: { key: { name, url, date } }        shared citations, referenced by key
//   current:    [ { chamber, party, title, person, since, sources: [key] } ]
//   elections:  [ { id, date, chamber, body, office, congress, method, public, result, summary,
//                   rollcall?, sources: [key] } ]
// For an election with rollcall.clerk set, the House Clerk XML is fetched (cached in data/raw/leadership),
// and result, summary and rollcall.votes ({ bioguide: vote as recorded }) are filled from it.
// Current roles are cross-checked against congress-legislators leadership_roles (warnings only).
// Output: server/congress/data/leadership.json
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const RAW = path.join(ROOT, 'data/raw/leadership');
const ITEMS = path.join(__dirname, 'leadership-items.json');
const PEOPLE = path.join(ROOT, 'server/congress/data/people.json');
const LEGIS = path.join(ROOT, 'data/raw/legislators-current.json');
const OUT = path.join(ROOT, 'server/congress/data/leadership.json');
const UA = 'VoteDash-congress-directory/1.0 (leadership builder)';
fs.mkdirSync(RAW, { recursive: true });

const CHAMBERS = new Set(['House', 'Senate']);
const PARTIES = new Set(['R', 'D', null]);
const METHODS = new Set(['secret ballot', 'voice vote', 'unanimous consent', 'roll call', 'acclamation', null]);
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

const errors = [];
const warn = [];
const fail = (where, msg) => errors.push(`${where}: ${msg}`);

async function clerkXml(year, roll) {
  const file = path.join(RAW, `h${year}-roll${String(roll).padStart(3, '0')}.xml`);
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  const url = `https://clerk.house.gov/evs/${year}/roll${String(roll).padStart(3, '0')}.xml`;
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const t = await r.text();
  fs.writeFileSync(file, t);
  return t;
}

const unxml = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();

function parseRoll(xml) {
  const question = unxml((xml.match(/<vote-question>([\s\S]*?)<\/vote-question>/) || [])[1] || '');
  const result = unxml((xml.match(/<vote-result>([\s\S]*?)<\/vote-result>/) || [])[1] || '');
  const totals = [...xml.matchAll(/<totals-by-candidate>\s*<candidate>([\s\S]*?)<\/candidate>\s*<candidate-total>(\d+)<\/candidate-total>/g)]
    .map(m => ({ candidate: unxml(m[1]), total: +m[2] }));
  const votes = {};
  const label = {}; // "Johnson (LA)" -> bioguide, from the legislator element text
  for (const m of xml.matchAll(/<recorded-vote>\s*<legislator([^>]*)>([\s\S]*?)<\/legislator>\s*<vote>([\s\S]*?)<\/vote>/g)) {
    const id = (m[1].match(/name-id="([^"]+)"/) || [])[1];
    if (!id) continue;
    votes[id] = unxml(m[3]);
    label[unxml(m[2])] = id;
  }
  return { question, result, totals, votes, label };
}

(async () => {
  const items = JSON.parse(fs.readFileSync(ITEMS, 'utf8'));
  const people = JSON.parse(fs.readFileSync(PEOPLE, 'utf8'));
  const legis = JSON.parse(fs.readFileSync(LEGIS, 'utf8'));
  const byId = new Map(people.map(p => [p.id, p]));
  const known = new Set([...byId.keys(), ...legis.map(l => l.id.bioguide)]);
  const nameOf = id => (byId.get(id) || {}).name || (legis.find(l => l.id.bioguide === id) || { name: {} }).name.official_full || id;

  const src = (keys, where, withDate) => {
    if (!Array.isArray(keys) || !keys.length) { fail(where, 'no sources'); return []; }
    return keys.map(k => {
      const s = items.sourceSets[k];
      if (!s) { fail(where, `unknown source key ${k}`); return null; }
      if (!/^https:\/\//.test(s.url)) fail(where, `bad url for ${k}`);
      return withDate ? { name: s.name, url: s.url, date: s.date || null } : { name: s.name, url: s.url };
    }).filter(Boolean);
  };

  // ---------- current ----------
  const current = items.current.map((c, i) => {
    const where = `current[${i}] ${c.title}`;
    if (!CHAMBERS.has(c.chamber)) fail(where, 'bad chamber');
    if (!PARTIES.has(c.party)) fail(where, 'bad party');
    if (!c.title) fail(where, 'no title');
    if (!known.has(c.person)) fail(where, `unknown person ${c.person}`);
    if (c.since !== null && !DATE_RX.test(c.since)) fail(where, 'bad since');
    return { chamber: c.chamber, party: c.party, title: c.title, person: c.person, since: c.since, sources: src(c.sources, where, false) };
  });

  // cross-check against congress-legislators leadership_roles (open roles only)
  const curIds = new Set(current.map(c => c.person));
  for (const l of legis) for (const r of l.leadership_roles || []) {
    if (r.end) continue;
    if (!curIds.has(l.id.bioguide)) warn.push(`congress-legislators lists ${l.id.bioguide} ${l.name.official_full} as "${r.title}" but no current item has this person`);
  }

  // ---------- elections ----------
  const ids = new Set();
  const elections = [];
  for (const [i, e] of items.elections.entries()) {
    const where = `elections[${i}] ${e.id}`;
    if (!e.id || ids.has(e.id)) fail(where, 'missing or duplicate id');
    ids.add(e.id);
    if (!DATE_RX.test(e.date || '')) fail(where, 'bad date');
    if (!CHAMBERS.has(e.chamber)) fail(where, 'bad chamber');
    if (!e.body || !e.office) fail(where, 'missing body/office');
    if (![119, 120].includes(e.congress)) fail(where, 'bad congress');
    if (!METHODS.has(e.method)) fail(where, 'bad method');
    if (typeof e.public !== 'boolean') fail(where, 'public must be boolean');
    if (e.public && e.body !== 'House floor' && e.body !== 'Senate floor') fail(where, 'public is only for floor votes');

    const out = {
      id: e.id, date: e.date, chamber: e.chamber, body: e.body, office: e.office, congress: e.congress,
      method: e.method, public: e.public, result: e.result || [], summary: e.summary || '',
      rollcall: e.rollcall || null, sources: src(e.sources, where, true),
    };

    if (out.rollcall && out.rollcall.clerk) {
      const rc = out.rollcall;
      const roll = parseRoll(await clerkXml(rc.year, rc.clerk));
      if (!/Election of the Speaker/i.test(roll.question)) fail(where, `roll ${rc.clerk} is "${roll.question}", not the Speaker election`);
      out.result = roll.totals.filter(t => t.total > 0 && t.candidate !== 'Present' && t.candidate !== 'Not Voting')
        .sort((a, b) => b.total - a.total)
        .map(t => {
          const person = roll.label[t.candidate] || null;
          if (!person) warn.push(`${where}: could not map candidate "${t.candidate}" to a member`);
          // the winner is the candidate the Clerk records as the vote result
          return { person, name: person ? nameOf(person) : t.candidate, votes: t.total, won: t.candidate === roll.result };
        });
      const counted = Object.keys(roll.votes).length;
      const sum = roll.totals.reduce((s, t) => s + t.total, 0);
      if (counted !== sum) warn.push(`${where}: ${counted} recorded votes vs ${sum} in totals`);
      rc.votes = roll.votes;
      if (!out.summary) {
        const [w, ...rest] = out.result;
        const present = roll.totals.find(t => t.candidate === 'Present')?.total || 0;
        const nv = roll.totals.find(t => t.candidate === 'Not Voting')?.total || 0;
        out.summary = `${w.name} was elected Speaker on the first ballot with ${w.votes} votes; ` +
          rest.map(r => `${r.name} received ${r.votes}`).join(', ') +
          `. ${present} members answered present and ${nv} did not vote.`;
      }
    }

    if (out.result.length) {
      for (const [k, r] of out.result.entries()) {
        if (r.person !== null && !known.has(r.person)) fail(where, `result[${k}] unknown person ${r.person}`);
        if (!r.name) fail(where, `result[${k}] no name`);
        if (r.votes !== null && !Number.isInteger(r.votes)) fail(where, `result[${k}] bad votes`);
        if (typeof r.won !== 'boolean') fail(where, `result[${k}] won must be boolean`);
      }
    } else if (!/^Scheduled for /.test(out.summary)) fail(where, 'empty result must be a scheduled item ("Scheduled for ...")');
    if (!out.summary) fail(where, 'no summary');
    elections.push(out);
  }
  elections.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  for (const w of warn) console.warn('warn:', w);
  if (errors.length) { for (const e of errors) console.error('error:', e); process.exit(1); }

  fs.writeFileSync(OUT, JSON.stringify({ built: new Date().toISOString(), current, elections }, null, 1));
  const by = k => elections.filter(e => e.congress === k).length;
  console.log(`leadership.json: ${current.length} current roles, ${elections.length} elections (119th: ${by(119)}, 120th: ${by(120)}, scheduled: ${elections.filter(e => !e.result.length).length})`);
})().catch(e => { console.error(e); process.exit(1); });
