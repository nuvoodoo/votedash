#!/usr/bin/env node
// Builds server/data/accounts.json from the election social-media directory.
// Usage: node tools/build-accounts.js <midterms-2026-social-accounts.xlsx>
'use strict';
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { STATES } = require('../server/civic');

const file = process.argv[2];
if (!file) { console.error('usage: build-accounts.js <xlsx>'); process.exit(1); }
const NAME_TO_CODE = Object.fromEntries(Object.entries(STATES).map(([k, v]) => [v.toLowerCase(), k]));
const wb = XLSX.readFile(file);
const cands = XLSX.utils.sheet_to_json(wb.Sheets['Candidates'], { defval: '' });
const media = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames.find((n) => /media/i.test(n))], { defval: '' });

function bskyHandle(v) {
  v = String(v || '').trim();
  if (!v) return '';
  const m = v.match(/bsky\.app\/profile\/([^/?#]+)/);
  return (m ? m[1] : v.replace(/^@/, '')).toLowerCase();
}
const out = [];
for (const r of cands) {
  const state = NAME_TO_CODE[String(r.State).toLowerCase()];
  const office = /senate/i.test(r.Office) ? 'senate' : 'house';
  let district = null;
  if (office === 'house') {
    const d = String(r.District);
    district = /at-?large/i.test(d) ? `${state}-AL` : (d.match(/(\d+)/) ? `${state}-${d.match(/(\d+)/)[1].padStart(2, '0')}` : null);
  }
  out.push({
    kind: 'candidate', name: r.Candidate, party: r.Party, state, office, district, race: r.Race,
    x: String(r['X handle'] || '').replace(/^@/, ''), bsky: bskyHandle(r.Bluesky), threads: String(r['Threads handle'] || '').replace(/^@/, ''),
  });
}
for (const r of media) {
  out.push({
    kind: 'media', name: r.Name, role: r.Role, outlet: r.Outlet, lean: r.Lean, category: r.Category,
    x: String(r['X handle'] || '').replace(/^@/, ''), bsky: bskyHandle(r.Bluesky || r['Bluesky handle']), threads: String(r['Threads handle'] || '').replace(/^@/, ''),
  });
}
const dest = path.join(__dirname, '..', 'server', 'data', 'accounts.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out));
console.log(`wrote ${out.length} accounts (${out.filter((a) => a.bsky).length} Bluesky, ${out.filter((a) => a.x).length} X) to ${dest}`);
