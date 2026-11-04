'use strict';
// "Who called it": every race call we hold, in time order, scored by which
// sources called the eventual winner first. Polymarket appears as the moment its
// winner market reached 55% and stayed there, kept apart from the calls.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const GAMMA = 'https://gamma-api.polymarket.com/markets';
const CLOB = 'https://clob.polymarket.com/prices-history';
const UA = { 'user-agent': 'VoteDash/1.0 (+https://votedash.net)' };
const ELECTION_DAY = Date.parse('2026-11-03T10:00:00Z'); // polls open in the East
const PM_LINE = 0.55;
const MIN_RACES = 10; // scored races a source needs to be ranked
// CNN and Pollgebra calls already made when we began reading those sources carry
// the time we first saw them, not the time of the call; only later calls are timed.
const TIMED_FROM = { CNN: Date.parse('2026-11-04T05:08:00Z'), Pollgebra: Date.parse('2026-11-04T05:08:00Z') };

function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
function lastName(n) { const t = norm(n).split(' ').filter((w) => w.length > 1 && !/^(jr|sr|ii|iii|iv)$/.test(w)); return t[t.length - 1] || ''; }
function hasWord(text, w) { return !!w && (' ' + norm(text) + ' ').includes(' ' + w + ' '); }

// Which candidate a call names, and whether it matches the race's winner:
// 'accurate', 'wrong', or 'unverified' (a headline that does not name a winner on its own).
function verdict(src, call, race) {
  const w = race.winner;
  const cands = race.cands.filter((c) => c.n !== 'Write-in');
  const title = String(call.title || '');
  if (src === 'Pollgebra') {
    const p = /for the Democrat/.test(title) ? 'D' : /for the Republican/.test(title) ? 'R' : /for the independent/.test(title) ? 'I' : null;
    if (!p) return 'unverified';
    return p === w.p ? 'accurate' : 'wrong';
  }
  const m = title.match(/^(?:CNN |Decision Desk HQ )?projects (.+?) wins\b/) || (src === 'civicAPI' && title.match(/^(.+?) \([A-Z]+\) wins\b/));
  if (m) {
    const ln = lastName(m[1]);
    if (lastName(w.n) === ln || norm(m[1]) === norm(w.n)) return 'accurate';
    return cands.some((c) => lastName(c.n) === ln) ? 'wrong' : 'unverified';
  }
  // Outlet headlines: the candidate a win verb follows, else the only candidate
  // named, else the party a flip or hold is credited to.
  const t = ' ' + norm(title) + ' ';
  const winner = cands.find((c) => { const ln = lastName(c.n); return ln && (new RegExp(` (?:race|seat|district) for (?:\\w+ ){0,2}${ln} `).test(t) || new RegExp(` ${ln} (?:\\w+ ){0,2}(?:wins?|won|elected|re elected|reelected|projected|defeats?|defeating|beats?|ousts?|unseats?|flips?|holds?|keeps?|retains?|victory) `).test(t)); });
  if (winner) return winner.n === w.n ? 'accurate' : 'wrong';
  const named = cands.filter((c) => hasWord(title, lastName(c.n)));
  if (named.length === 1 && named[0].n === w.n && WIN_RE.test(t)) return 'accurate';
  if (!named.length) {
    const p = / (?:democrats?|blue) (?:\w+ ){0,3}(?:flips?|flip|holds?|hold|keeps?|wins?|win|secure) | flip blue /.test(t) ? 'D' : / (?:republicans?|gop|red) (?:\w+ ){0,3}(?:flips?|flip|holds?|hold|keeps?|wins?|win|secure) | flip red /.test(t) ? 'R' : null;
    if (p) return p === w.p ? 'accurate' : 'unverified';
  }
  return 'unverified';
}
const WIN_RE = / (?:wins?|won|elected|projected|defeats?|beats?|victory|flips?) /;

class CallTimes {
  constructor(civic, news) {
    this.civic = civic; this.news = news;
    const p = path.join(__dirname, 'data', 'polymarket.json');
    this.pmMap = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
    this.tokens = {}; // market id -> yes token id
    this.pm = {}; // race id -> { ts, pre, url }
    this.payload = null; this.payloadTs = 0;
    this.status = { last: null, lastError: null, pmRaces: 0 };
  }

  pmEvents() {
    const out = [];
    if (!this.pmMap) return out;
    for (const cat of ['senate', 'governor']) for (const st in this.pmMap[cat]) out.push({ cat, st, ev: this.pmMap[cat][st] });
    return out;
  }

  // Yes-token ids for every mapped market, open or resolved (Gamma lists those separately).
  async loadTokens() {
    const ids = [];
    for (const { ev } of this.pmEvents()) for (const m of ev.markets) if (!this.tokens[m.id]) ids.push(m.id);
    for (let i = 0; i < ids.length; i += 40) {
      for (const closed of ['true', 'false']) {
        const u = `${GAMMA}?limit=100&closed=${closed}&` + ids.slice(i, i + 40).map((x) => 'id=' + x).join('&');
        const res = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) });
        if (!res.ok) throw new Error(`gamma HTTP ${res.status}`);
        for (const m of await res.json()) { try { this.tokens[String(m.id)] = JSON.parse(m.clobTokenIds)[0]; } catch (e) { /* no token */ } }
      }
    }
  }

  // When the winner's market reached 55% and held it through the first accurate call.
  // Already at 55% or more when Election Day began: pre.
  async pmSignal(race, ev, firstCall) {
    const mk = ev.markets.find((m) => m.party === race.winner.p);
    const tok = mk && this.tokens[mk.id];
    if (!tok) return null;
    const end = Math.floor((firstCall || Date.now()) / 1000) + 3600;
    const u = `${CLOB}?market=${tok}&startTs=${Math.floor(ELECTION_DAY / 1000)}&endTs=${end}&fidelity=1`;
    const res = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`clob HTTP ${res.status}`);
    const h = ((await res.json()).history || []).filter((x) => x && x.t && x.p != null).sort((a, b) => a.t - b.t);
    if (!h.length) return null;
    const until = firstCall ? firstCall / 1000 : Infinity;
    let start = null;
    for (const x of h) {
      if (x.t > until && start != null) break;
      if (x.p >= PM_LINE) { if (start == null) start = x.t; } else start = null;
    }
    if (start == null) return null;
    const url = `https://polymarket.com/event/${ev.slug}`;
    return start === h[0].t ? { ts: ELECTION_DAY, pre: true, url } : { ts: start * 1000, pre: false, url };
  }

  raceFor(cat, st) {
    const all = [...this.civic.races.values()].filter((r) => r.cat === cat && r.state === st && r.winner);
    return all.find((r) => !/special/i.test(r.name)) || all[0] || null;
  }

  races() {
    const out = [];
    for (const [id, calls] of Object.entries(this.news.calls)) {
      const race = this.civic.races.get(Number(id));
      if (!race || !race.winner) continue;
      const list = Object.entries(calls).filter(([src, c]) => c && c.ts && c.ts >= (TIMED_FROM[src] || 0))
        .map(([src, c]) => ({ src, ts: c.ts, url: c.url, title: String(c.title || '').slice(0, 160), v: verdict(src, c, race) }));
      if (!list.length) continue;
      list.sort((a, b) => a.ts - b.ts);
      out.push({ id: race.id, name: race.name, cat: race.cat, state: race.state, district: race.district, winner: { n: race.winner.n, p: race.winner.p }, calls: list, pm: this.pm[race.id] || null });
    }
    return out;
  }

  async refreshPM() {
    if (!this.pmMap) return;
    await this.loadTokens();
    const byRace = new Map(this.races().map((r) => [r.id, r]));
    let n = 0, err = null;
    for (const { cat, st, ev } of this.pmEvents()) {
      const race = this.raceFor(cat, st);
      if (!race) continue;
      const r = byRace.get(race.id);
      const first = r && r.calls.find((c) => c.v === 'accurate');
      try {
        const s = await this.pmSignal(race, ev, first && first.ts);
        if (s) { this.pm[race.id] = s; n++; } else delete this.pm[race.id];
      } catch (e) { err = e.message; }
    }
    this.status = { last: new Date().toISOString(), lastError: err, pmRaces: n };
    this.payload = null;
  }

  // Each race with two or more accurate calls hands out points by order: first 100,
  // last 0, the rest spaced by how many accurate calls came after. A wrong call
  // scores 0. A source's score is its mean over the races it called.
  build() {
    if (this.payload && Date.now() - this.payloadTs < 30000) return this.payload;
    const races = this.races();
    const src = {};
    const S = (k) => (src[k] = src[k] || { src: k, pts: 0, races: 0, firsts: 0, wrong: 0, behind: [], called: 0 });
    let scored = 0;
    for (const r of races) {
      for (const c of r.calls) S(c.src).called++;
      const ok = r.calls.filter((c) => c.v === 'accurate');
      for (const c of r.calls) if (c.v === 'wrong') { const s = S(c.src); s.races++; s.wrong++; c.pts = 0; }
      if (ok.length < 2) continue;
      scored++;
      r.scored = true;
      const t0 = ok[0].ts;
      for (const c of ok) {
        const pts = (100 * ok.filter((x) => x.ts > c.ts).length) / (ok.length - 1);
        const s = S(c.src);
        s.races++; s.pts += pts; c.pts = Math.round(pts);
        if (c.ts === t0) s.firsts++; else s.behind.push(c.ts - t0);
      }
    }
    const board = Object.values(src).map((s) => {
      const b = s.behind.sort((x, y) => x - y);
      return { src: s.src, score: s.races ? Math.round((s.pts / s.races) * 10) / 10 : 0, races: s.races, firsts: s.firsts, wrong: s.wrong, called: s.called, medianBehind: b.length ? b[Math.floor(b.length / 2)] : 0, ranked: s.races >= MIN_RACES };
    }).sort((a, b) => b.ranked - a.ranked || b.score - a.score || b.firsts - a.firsts);
    // Polymarket against the first accurate call, in the races it priced.
    const leads = [];
    let priced = 0, before = 0, preDay = 0;
    for (const r of races) {
      if (!r.pm) continue;
      const f = r.calls.find((c) => c.v === 'accurate');
      if (!f) continue;
      priced++;
      if (r.pm.pre) preDay++;
      if (r.pm.ts <= f.ts) before++;
      if (!r.pm.pre) leads.push(f.ts - r.pm.ts);
    }
    leads.sort((x, y) => x - y);
    const pm = { races: priced, beforeCall: before, preDay, nightRaces: leads.length, medianLead: leads.length ? leads[Math.floor(leads.length / 2)] : null, line: PM_LINE * 100 };
    this.payload = { ts: Date.now(), electionDay: ELECTION_DAY, minRaces: MIN_RACES, scoredRaces: scored, board, pm, races };
    this.payloadTs = Date.now();
    this.raw = Buffer.from(JSON.stringify(this.payload));
    this.gz = zlib.gzipSync(this.raw, { level: 6 });
    return this.payload;
  }

  start() {
    const run = () => this.refreshPM().catch((e) => { this.status.lastError = e.message; console.error('calltimes', e.message); });
    setTimeout(run, 20000);
    setInterval(run, Number(process.env.POLL_CALLTIMES_MS || 300000));
  }
}

module.exports = { CallTimes, verdict };
