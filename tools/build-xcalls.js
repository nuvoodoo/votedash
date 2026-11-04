#!/usr/bin/env node
// Builds server/data/xcalls.json: the time each outlet posted a race projection on X,
// so calls made before VoteDash read an outlet's own feed still have a time.
// Usage: TWITTERAPI_IO_KEY=... node tools/build-xcalls.js [snapshot-url]
'use strict';
const fs = require('fs');
const path = require('path');
const { verdict } = require('../server/calltimes');
const { STATES } = require('../server/civic');

const KEY = process.env.TWITTERAPI_IO_KEY;
if (!KEY) { console.error('TWITTERAPI_IO_KEY is required'); process.exit(1); }
const SNAP = process.argv[2] || 'https://votedash.net/api/snapshot';
const SINCE = '2026-11-03_22:00:00_UTC';
const OUTLETS = { CNN: 'CNN', CNNPolitics: 'CNN', NBCNews: 'NBC', FoxNews: 'Fox', ABC: 'ABC', CBSNews: 'CBS', Reuters: 'Reuters', AP: 'AP' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
function lastName(n) { const t = norm(n).split(' ').filter((w) => w.length > 1 && !/^(jr|sr|ii|iii|iv)$/.test(w)); return t[t.length - 1] || ''; }
const has = (text, w) => !!w && (' ' + norm(text) + ' ').includes(' ' + norm(w) + ' ');

// Races a post projects: the winner's or another candidate's name appears with the
// state (or the full candidate name), and any office the post names agrees.
// A projection or a result, not a speech, profile or recap.
const CALL_RE = /\bproject(?:s|ed|ion)?\b|decision desk|race call|\bwins\b|will win|has won|will defeat|\bdefeats\b|wins re-?election/i;
// Reaction coverage after a call (speeches, celebrations) is not the call itself.
const AFTER_RE = /celebrat|speech|cheer|supporters|addressed/i;
const NAMED_STATES = Object.values(STATES);
function racesFor(text, races) {
  if (!CALL_RE.test(text) || AFTER_RE.test(text)) return [];
  const named = NAMED_STATES.filter((st) => has(text, st));
  const office = /\bsenate\b/i.test(text) ? 'senate' : /governor|gubernatorial/i.test(text) ? 'governor' : /\bhouse\b|district|congress|\brep\./i.test(text) ? 'house' : null;
  return races.filter((r) => {
    if (office && !(office === r.cat || (office === 'house' && r.cat === 'delegate'))) return false;
    const st = STATES[r.state] || '';
    if (named.length && !named.includes(st)) return false;
    return r.cands.some((c) => c.n !== 'Write-in' && (has(text, c.n) || (has(text, lastName(c.n)) && has(text, st))));
  });
}

async function search(handle) {
  const cache = process.env.XCALLS_CACHE && path.join(process.env.XCALLS_CACHE, handle + '.json');
  if (cache && fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, 'utf8'));
  const out = [];
  let cursor = '';
  for (let page = 0; page < 40; page++) {
    const u = new URL('https://api.twitterapi.io/twitter/tweet/advanced_search');
    u.searchParams.set('query', `from:${handle} since:${SINCE}`);
    u.searchParams.set('queryType', 'Latest');
    if (cursor) u.searchParams.set('cursor', cursor);
    const res = await fetch(u, { headers: { 'X-API-Key': KEY } });
    if (res.status === 429) { await sleep(10000); page--; continue; }
    if (!res.ok) throw new Error(`${handle} HTTP ${res.status}`);
    const j = await res.json();
    for (const t of j.tweets || []) if (!t.isReply && !/^RT @/.test(t.text || '')) out.push({ text: t.text || '', ts: Date.parse(t.createdAt), url: t.url || `https://x.com/${handle}/status/${t.id}` });
    cursor = j.has_next_page ? j.next_cursor : '';
    await sleep(5200);
    if (!cursor) break;
  }
  if (cache) fs.writeFileSync(cache, JSON.stringify(out));
  return out;
}

(async () => {
  const snap = await (await fetch(SNAP)).json();
  const races = snap.races.filter((r) => r.winner && ['senate', 'governor', 'house', 'delegate'].includes(r.cat));
  const calls = {};
  for (const [handle, outlet] of Object.entries(OUTLETS)) {
    const posts = await search(handle);
    let kept = 0;
    for (const p of posts.sort((a, b) => a.ts - b.ts)) {
      const hits = racesFor(p.text, races);
      if (!hits.length || hits.length > 4) continue;
      for (const r of hits) {
        const title = p.text.replace(/\s*https:\/\/t\.co\/\w+/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
        const v = verdict(outlet, { title }, r);
        if (v === 'unverified') continue;
        const c = (calls[r.id] = calls[r.id] || {});
        if (c[outlet] && c[outlet].ts <= p.ts) continue;
        c[outlet] = { ts: p.ts, url: p.url, title };
        kept++;
      }
    }
    console.log(`${handle}: ${posts.length} posts, ${kept} race calls`);
  }
  const file = path.join(__dirname, '..', 'server', 'data', 'xcalls.json');
  fs.writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), since: SINCE, calls }, null, 1));
  console.log(`wrote ${Object.keys(calls).length} races to ${file}`);
})().catch((e) => { console.error(e); process.exit(1); });
