// Primary results for 2024-2026 and special elections for 2025-2026 from civicAPI, merged with
// the FEC 2012-2022 files from fec.py into tools/congress/static/elections-extra.json:
// { primaries, specials, generals } (generals: FEC 2012-2022, a fallback where MEDSL lacks a race).
// Same shape as fec.py: [{y, ch, st, d, pt, sp?, src, c: [{n, p, v, pc, u?, rv?, rpc?, w}]}]
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..', '..');
const BASE = 'https://civicapi.org/api/v2';

async function racesBetween(a, b) {
  const out = [];
  for (let off = 0; ; off += 5000) {
    const j = await (await fetch(`${BASE}/race/search?startDate=${a}&endDate=${b}&country=US&limit=5000&offset=${off}`)).json();
    const rs = j.races || [];
    out.push(...rs);
    if (rs.length < 5000) return out;
  }
}

(async () => {
  const raw = [];
  for (const y of [2024, 2025, 2026]) for (const [a, b] of [['01-01', '04-30'], ['05-01', '06-30'], ['07-01', '10-20'], ...(y === 2025 ? [['10-21', '12-31']] : [])]) raw.push(...await racesBetween(`${y}-${a}`, `${y}-${b}`));
  const fed = raw.filter(r => /\bUS (House|Senate)\b/.test(r.election_name) && /Primary|Runoff/.test(r.election_name) && !/General/.test(r.election_name));
  // special general elections, and their runoffs (a runoff with no party in its name)
  const specials = new Map();
  const spRaw = raw.filter(r => /\bUS (House|Senate)\b/.test(r.election_name) && !/Primary|Democratic|Republican|DFL/.test(r.election_name) && /Special|Runoff/.test(r.election_name) && r.election_date >= '2025');
  for (const r of spRaw.sort((a, b) => a.election_date.localeCompare(b.election_date))) {
    const nm = r.election_name, ch = /US Senate/.test(nm) ? 'S' : 'H';
    const dm = nm.match(/US House (\d+)/) || String(r.district || '').match(/-(\d+)$/);
    const d = ch === 'S' ? null : dm ? +dm[1] : 0;
    const k = [r.election_date.slice(0, 4), ch, r.province, d].join('|');
    const cands = r.candidates.filter(c => !/^write-?ins?$/i.test(c.name.trim()));
    const total = cands.reduce((s, c) => s + (c.votes || 0), 0);
    if (!total) continue;
    if (/Runoff/.test(nm)) {
      const sp = specials.get(k) || specials.get([+k.split('|')[0] - 1, ...k.split('|').slice(1)].join('|')); if (!sp || cands.length < 2) continue;
      for (const x of cands) { const m = sp.c.find(c => c.n === x.name.trim()); if (m) { m.rv = x.votes; m.rpc = +(x.votes / total).toFixed(4); } }
      const top = sp.c.filter(c => c.rv != null).sort((a, b) => b.rv - a.rv)[0];
      if (top) sp.c.forEach(c => { c.w = c === top; });
      sp.runoff = true;
      continue;
    }
    specials.set(k, { y: +k.split('|')[0], ch, st: r.province, d, c: cands.map(x => ({ n: x.name.trim(), p: (x.party || '')[0], v: x.votes, pc: +(x.votes / total).toFixed(4), w: !!x.winner })).sort((a, b) => b.v - a.v) });
  }
  for (const sp of specials.values()) if (sp.runoff) sp.c.sort((a, b) => ((b.rv || 0) - (a.rv || 0)) || (b.v - a.v)); else if (sp.c.filter(c => c.w).length !== 1) sp.c.forEach((c, i) => { c.w = i === 0 && c.pc > 0.5; });
  const races = new Map(), runoffs = [];
  for (const r of fed) {
    const nm = r.election_name;
    const ch = /US Senate/.test(nm) ? 'S' : 'H';
    const dm = nm.match(/US House (\d+)/) || String(r.district || '').match(/-(\d+)$/);
    const d = ch === 'S' ? null : dm ? +dm[1] : 0;
    const pt = /Democratic|DFL/.test(nm) ? 'D' : /Republican/.test(nm) ? 'R' : 'T2';
    const sp = /Special/.test(nm);
    const y = +r.election_date.slice(0, 4);
    const cands = r.candidates.filter(c => !/^write-?ins?$/i.test(c.name.trim()) && !/^(uncommitted|none of these)/i.test(c.name));
    if (!cands.length) continue;
    const total = cands.reduce((s, c) => s + (c.votes || 0), 0);
    const k = [y, ch, r.province, d, pt, sp].join('|');
    if (/Runoff/.test(nm)) { runoffs.push({ k, cands, total }); continue; }
    if (!total && cands.length > 1) continue; // results not in
    const c = cands.map(x => ({ n: x.name.trim(), p: pt === 'T2' ? (x.party || '')[0] : pt, ...(total ? { v: x.votes, pc: +(x.votes / total).toFixed(4) } : {}), ...(!total ? { u: true } : {}), w: !!x.winner || !total }));
    if (pt === 'T2' && !c.some(x => x.w)) c.sort((a, b) => (b.v || 0) - (a.v || 0)).slice(0, 2).forEach(x => { x.w = true; });
    if (pt !== 'T2' && !c.some(x => x.w) && total) c.sort((a, b) => b.v - a.v)[0].w = true;
    races.set(k, { y, ch, st: r.province, d, pt, ...(sp ? { sp: true } : {}), src: 'civic', c });
  }
  for (const { k, cands, total } of runoffs) {
    const race = races.get(k); if (!race || !total || cands.length < 2) continue;
    for (const x of cands) { const m = race.c.find(c => c.n === x.name.trim()); if (m) { m.rv = x.votes; m.rpc = +(x.votes / total).toFixed(4); } }
    const top = race.c.filter(c => c.rv != null).sort((a, b) => b.rv - a.rv)[0];
    if (top) race.c.forEach(c => { c.w = c === top; });
  }
  for (const r of races.values()) r.c.sort((a, b) => ((b.rv || 0) - (a.rv || 0)) || ((b.v || 0) - (a.v || 0)));
  const fec = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/raw/primaries-fec.json'), 'utf8'));
  const all = [...fec, ...races.values()];
  const generals = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/raw/generals-fec.json'), 'utf8'));
  fs.writeFileSync(path.join(__dirname, '../static/elections-extra.json'), JSON.stringify({ primaries: all, specials: [...specials.values()], generals }));
  console.log('specials', [...specials.values()].map(s => `${s.y} ${s.st}-${s.d ?? 'S'} ${s.c.filter(c => c.w).map(c => c.n).join('/')}`).join('; '));
  const by = {}; for (const r of all) by[r.y] = (by[r.y] || 0) + 1;
  console.log('races by year', by);
})();
