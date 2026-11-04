'use strict';
// CNN results feed (politics.api.cnn.io): Senate, House and governor races with
// vote totals, percent reporting and CNN's own projections. Second live source
// for federal and governor races; CNN projections become CNN call tags.

const BASE = 'https://politics.api.cnn.io/results/national-races';
const UA = 'VoteDash/1.0 (+https://votedash.net)';

class CNN {
  constructor(civic, news, emitFeed) {
    this.civic = civic; this.news = news; this.emitFeed = emitFeed;
    this.status = { last: null, lastError: null, applied: 0, calls: 0 };
    this.seen = new Set();
    this.started = false;
  }

  raceFor(race, kind) {
    const st = race.stateAbbreviation;
    const rs = [...this.civic.races.values()];
    if (kind === 'SG') {
      const special = /special/i.test(race.raceTitle || '') || /S[13]$/.test(race.ecKey || '');
      const sen = rs.filter((r) => r.cat === 'senate' && r.state === st);
      return sen.find((r) => /special/i.test(r.name) === special) || sen[0] || null;
    }
    if (kind === 'GG') return rs.find((r) => r.cat === 'governor' && r.state === st) || null;
    const n = Number(race.jurisdictionCode || 0);
    const d = `${st}-${String(n).padStart(2, '0')}`;
    return rs.find((r) => (r.cat === 'house' || r.cat === 'delegate') && r.district === d) || rs.find((r) => (r.cat === 'house' || r.cat === 'delegate') && r.state === st && r.district === `${st}-AL`) || null;
  }

  async pollKind(kind) {
    const res = await fetch(`${BASE}/2026-${kind}.json`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`${kind} HTTP ${res.status}`);
    const arr = await res.json();
    const fresh = [];
    let applied = 0;
    for (const race of arr) {
      const r = this.raceFor(race, kind); if (!r) continue;
      const cands = (race.candidates || []).map((c) => ({ n: c.fullName, v: Number(c.voteNum || 0), p: c.candidatePartyCode }));
      const ts = Date.parse(race.voteTimestamp) || Date.now();
      if (cands.some((c) => c.v > 0) && this.civic.applyAlt(r.id, 'CNN', cands, { ts, pct: Number(race.percentReporting || 0) })) applied++;
      const w = (race.candidates || []).find((c) => c.winner);
      if (w && (race.status === 'W' || race.editorialStatus === 'called')) {
        const key = `${r.id}:${w.fullName}`;
        if (!r.winner) this.civic.applyCall(r.id, w.fullName, 'CNN');
        if (!this.seen.has(key)) {
          this.seen.add(key);
          const c = (this.news.calls[r.id] = this.news.calls[r.id] || {});
          const url = `https://www.cnn.com/election/2026/results/${race.stateNameSlug}`;
          if (!c.CNN) c.CNN = { ts, url, title: `CNN projects ${w.fullName} wins ${r.name}` };
          this.civic.applyCall(r.id, w.fullName, 'CNN');
          fresh.push({ id: `cnn:${r.id}:${w.candidateId}`, kind: 'call', outlet: 'CNN', title: `CNN projects ${w.fullName} wins ${r.name}`, url, ts, race_id: r.id, race_name: r.name });
        }
      }
    }
    return { fresh, applied };
  }

  async poll() {
    let applied = 0, fresh = [];
    for (const kind of ['SG', 'GG', 'HG']) {
      try { const r = await this.pollKind(kind); applied += r.applied; fresh = fresh.concat(r.fresh); }
      catch (e) { this.status.lastError = e.message; console.error('cnn', e.message); }
    }
    const first = !this.started; this.started = true;
    this.status = { ...this.status, last: new Date().toISOString(), applied, calls: this.seen.size };
    if (fresh.length) this.emitFeed({ items: first ? [] : fresh, calls: this.news.calls });
  }

  start() {
    const run = () => this.poll().catch((e) => { this.status.lastError = e.message; });
    run();
    setInterval(run, Number(process.env.POLL_CNN_MS || 60000));
  }
}

module.exports = { CNN };
