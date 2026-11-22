// Downloads the official roll call record for every 119th Congress vote in the Voteview roll call
// list: the House Clerk XML and the Senate LIS XML. These are the record of each member's vote,
// party and the vote date; Voteview is the fallback where a record cannot be fetched.
// Cached gzipped under <raw>/official/. Records are corrected for some days after a vote, so
// anything from the last 60 days is fetched again on every run.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const RAW = process.env.CONGRESS_RAW || path.join(__dirname, '../../data/raw');
const DIR = path.join(RAW, 'official');
const UA = 'Mozilla/5.0 (compatible; VoteDash/1.0; +https://votedash.net/about)';
const REFRESH_DAYS = 60;

const lines = fs.readFileSync(path.join(RAW, 'HS119_rollcalls.csv'), 'utf8').split('\n').filter(Boolean);
const head = lines[0].split(',');
const col = n => head.indexOf(n);
const rolls = lines.slice(1).map(l => l.split(',')).map(c => ({ ch: c[col('chamber')][0], session: +c[col('session')], clerk: +c[col('clerk_rollnumber')], date: c[col('date')] }));

const url = r => r.ch === 'H'
  ? `https://clerk.house.gov/evs/${r.session === 1 ? 2025 : 2026}/roll${String(r.clerk).padStart(3, '0')}.xml`
  : `https://www.senate.gov/legislative/LIS/roll_call_votes/vote119${r.session}/vote_119_${r.session}_${String(r.clerk).padStart(5, '0')}.xml`;
const file = r => path.join(DIR, `${r.ch}${r.session}-${r.clerk}.xml.gz`);
const cutoff = new Date(Date.now() - REFRESH_DAYS * 864e5).toISOString().slice(0, 10);

async function get(u) {
  // senate.gov answers 403 when requests come too fast, so a 403 waits and tries again
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30e3) });
      if (res.status === 404) return { status: 404 };
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      if (!/<(rollcall-vote|roll_call_vote)\b/.test(text)) throw new Error('not a roll call record');
      return { text };
    } catch (e) { if (i === 3) return { error: e.message }; await new Promise(r => setTimeout(r, 15000 * (i + 1))); }
  }
}

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  const todo = rolls.filter(r => !fs.existsSync(file(r)) || r.date >= cutoff);
  let ok = 0, missing = 0, failed = 0;
  const t0 = Date.now();
  // one queue per site: the Clerk takes four at a time, the Senate one at a time with a pause
  async function worker(queue, pause) {
    while (queue.length) {
      const r = queue.shift();
      const out = await get(url(r));
      if (out.text) { fs.writeFileSync(file(r) + '.tmp', zlib.gzipSync(out.text)); fs.renameSync(file(r) + '.tmp', file(r)); ok++; }
      else if (out.status) missing++;
      else { failed++; console.error('official vote', url(r), out.error); }
      if (pause) await new Promise(res => setTimeout(res, pause));
    }
  }
  const house = todo.filter(r => r.ch === 'H'), senate = todo.filter(r => r.ch === 'S');
  await Promise.all([...Array.from({ length: 4 }, () => worker(house, 0)), worker(senate, 250)]);
  console.log(`official votes: ${rolls.length} roll calls, ${todo.length} fetched (${ok} saved, ${missing} not available, ${failed} failed) in ${Math.round((Date.now() - t0) / 1000)}s`);
})();
