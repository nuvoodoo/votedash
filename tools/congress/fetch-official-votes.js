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
// Voteview leaves out House quorum calls (roll call 1 of each session): add every Clerk number it skips
for (const session of [1, 2]) {
  const have = new Set(rolls.filter(r => r.ch === 'H' && r.session === session).map(r => r.clerk));
  const top = Math.max(0, ...have);
  for (let n = 1; n < top; n++) if (!have.has(n)) rolls.push({ ch: 'H', session, clerk: n, date: rolls.find(r => r.ch === 'H' && r.session === session && r.clerk > n).date });
}

const url = r => r.ch === 'H'
  ? `https://clerk.house.gov/evs/${r.session === 1 ? 2025 : 2026}/roll${String(r.clerk).padStart(3, '0')}.xml`
  : `https://www.senate.gov/legislative/LIS/roll_call_votes/vote119${r.session}/vote_119_${r.session}_${String(r.clerk).padStart(5, '0')}.xml`;
const file = r => path.join(DIR, `${r.ch}${r.session}-${r.clerk}.xml.gz`);
const cutoff = new Date(Date.now() - REFRESH_DAYS * 864e5).toISOString().slice(0, 10);

// clerk.house.gov and senate.gov both answer 403 to a burst of requests and keep refusing for
// some minutes, so each site gets one request at a time with a pause, a refused request waits
// longer each time, and a site that keeps refusing is left for the next run instead of
// spending the rest of the step on it (the build uses Voteview for anything not on disk).
const PAUSE = 300, WAITS = [20e3, 60e3, 120e3], GIVE_UP = 3;
async function get(u) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30e3) });
      if (res.status === 404) return { status: 404 };
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      if (!/<(rollcall-vote|roll_call_vote)\b/.test(text)) throw new Error('not a roll call record');
      return { text };
    } catch (e) { if (i === WAITS.length) return { error: e.message }; await new Promise(r => setTimeout(r, WAITS[i])); }
  }
}

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  const todo = rolls.filter(r => !fs.existsSync(file(r)) || r.date >= cutoff);
  let ok = 0, missing = 0, failed = 0, skipped = 0;
  const t0 = Date.now();
  async function worker(queue) {
    let refusedInRow = 0;
    while (queue.length) {
      if (refusedInRow >= GIVE_UP) { skipped += queue.length; console.error(`official vote: ${new URL(url(queue[0])).host} keeps refusing, ${queue.length} left for the next run`); break; }
      const r = queue.shift();
      const out = await get(url(r));
      if (out.text) { fs.writeFileSync(file(r) + '.tmp', zlib.gzipSync(out.text)); fs.renameSync(file(r) + '.tmp', file(r)); ok++; refusedInRow = 0; }
      else if (out.status) { missing++; refusedInRow = 0; }
      else { failed++; refusedInRow++; console.error('official vote', url(r), out.error); }
      await new Promise(res => setTimeout(res, PAUSE));
    }
  }
  await Promise.all([worker(todo.filter(r => r.ch === 'H')), worker(todo.filter(r => r.ch === 'S'))]);
  console.log(`official votes: ${rolls.length} roll calls, ${todo.length} fetched (${ok} saved, ${missing} not available, ${failed} failed, ${skipped} skipped) in ${Math.round((Date.now() - t0) / 1000)}s`);
})();
