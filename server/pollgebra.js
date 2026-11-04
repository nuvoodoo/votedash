'use strict';
// Pollgebra (pollgebra.com, CC BY 4.0): a math-based race caller. Its summary
// endpoint lists every seat its model has called; those become "Pollgebra"
// call tags and feed items here.

const URL = 'https://pollgebra.com/api/national/summary';

class Pollgebra {
  constructor(civic, news, emitFeed) {
    this.civic = civic; this.news = news; this.emitFeed = emitFeed;
    this.status = { last: null, lastError: null, calls: 0 };
    this.seen = new Set();
  }

  raceFor(seat) {
    const st = seat.state;
    if (seat.chamber === 'senate') {
      const special = /S[13]$/.test(seat.seatId); // class 2 is the regular 2026 seat; FL/OH specials carry another class
      for (const r of this.civic.races.values()) {
        if (r.cat !== 'senate' || r.state !== st) continue;
        if (special === /special/i.test(r.name)) return r;
      }
      for (const r of this.civic.races.values()) if (r.cat === 'senate' && r.state === st) return r;
    } else if (seat.chamber === 'house') {
      const d = `${st}-${seat.district === '00' ? 'AL' : seat.district}`;
      for (const r of this.civic.races.values()) if ((r.cat === 'house' || r.cat === 'delegate') && r.district === d) return r;
    } else {
      for (const r of this.civic.races.values()) if (r.cat === 'governor' && r.state === st) return r;
    }
    return null;
  }

  async poll() {
    const res = await fetch(URL, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'VoteDash/1.0 (+https://votedash.net)' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const fresh = [];
    const groups = [j.decided?.house, j.decided?.senate, j.decided?.governors].filter(Boolean);
    for (const g of groups) {
      for (const seat of g.seats || []) {
        if (seat.holdover || seat.reason !== 'called') continue;
        const r = this.raceFor(seat);
        if (!r) continue;
        const key = `${r.id}:${seat.party}`;
        if (this.seen.has(key)) continue;
        this.seen.add(key);
        const ts = Date.parse(j.generatedAt) || Date.now();
        const c = (this.news.calls[r.id] = this.news.calls[r.id] || {});
        if (!c.Pollgebra) c.Pollgebra = { ts, url: 'https://pollgebra.com/', title: `Pollgebra calls ${r.name} for ${seat.party === 'D' ? 'the Democrat' : seat.party === 'R' ? 'the Republican' : 'the independent'}` };
        fresh.push({ id: `pg:${r.id}:${seat.party}`, kind: 'call', outlet: 'Pollgebra', title: c.Pollgebra.title, url: 'https://pollgebra.com/', ts, race_id: r.id, race_name: r.name });
      }
    }
    this.status = { last: new Date().toISOString(), lastError: null, calls: this.seen.size };
    // Calls present at the first cycle are history, not news: tag the races but do not post them to the feed.
    const first = !this.started; this.started = true;
    if (fresh.length) this.emitFeed({ items: first ? [] : fresh, calls: this.news.calls });
  }

  start() {
    const run = () => this.poll().catch((e) => { this.status.lastError = e.message; console.error('pollgebra', e.message); });
    run();
    setInterval(run, Number(process.env.POLL_PG_MS || 60000));
  }
}

module.exports = { Pollgebra };
