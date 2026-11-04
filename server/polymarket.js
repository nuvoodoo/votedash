'use strict';
// Polymarket prices for Senate and governor winner markets and chamber control.
// Public Gamma API, no key. Prices are trader odds, kept apart from results.

const fs = require('fs');
const path = require('path');

const API = 'https://gamma-api.polymarket.com/markets';

function loadMap() {
  const p = path.join(__dirname, 'data', 'polymarket.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

class Polymarket {
  constructor(civic, emit) {
    this.civic = civic; this.emit = emit;
    this.map = loadMap();
    this.prices = {}; // market id -> { yes, vol, ts }
    this.data = { races: {}, control: {}, ts: null };
    this.status = { markets: 0, last: null, lastError: null };
  }

  marketIds() {
    const ids = [];
    if (!this.map) return ids;
    for (const cat of ['senate', 'governor']) for (const st in this.map[cat]) for (const m of this.map[cat][st].markets) ids.push(m.id);
    for (const k in this.map.control) for (const m of this.map.control[k].markets) ids.push(m.id);
    return ids;
  }

  async fetchBatch(ids) {
    const u = API + '?limit=100&' + ids.map((i) => 'id=' + encodeURIComponent(i)).join('&');
    const res = await fetch(u, { signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'VoteDash/1.0 (+https://votedash.net)' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arr = await res.json();
    for (const m of arr) {
      let yes = null;
      try { yes = Number(JSON.parse(m.outcomePrices)[0]); } catch (e) { /* ignore */ }
      if (yes == null || Number.isNaN(yes)) continue;
      this.prices[String(m.id)] = { yes, vol: Math.round(m.volumeNum || m.volume || 0), closed: !!m.closed, ts: Date.now() };
    }
  }

  raceIdFor(cat, st) {
    for (const r of this.civic.races.values()) if (r.cat === cat && r.state === st) return r.id;
    return null;
  }

  rebuild() {
    const races = {}, control = {};
    for (const cat of ['senate', 'governor']) {
      for (const st in this.map[cat]) {
        const ev = this.map[cat][st];
        const entry = { url: `https://polymarket.com/event/${ev.slug}`, title: ev.title, vol: 0, ts: 0 };
        let any = false;
        for (const m of ev.markets) {
          const p = this.prices[String(m.id)];
          if (!p) continue;
          any = true;
          entry[m.party] = Math.round(p.yes * 1000) / 10;
          entry.vol += p.vol; entry.ts = Math.max(entry.ts, p.ts);
        }
        if (!any) continue;
        const rid = this.raceIdFor(cat, st);
        if (rid) races[rid] = entry;
      }
    }
    for (const k in this.map.control) {
      const ev = this.map.control[k];
      const entry = { url: `https://polymarket.com/event/${ev.slug}`, title: ev.title, vol: 0, ts: 0 };
      let any = false;
      for (const m of ev.markets) {
        const p = this.prices[String(m.id)];
        if (!p) continue;
        any = true; entry[m.party] = Math.round(p.yes * 1000) / 10; entry.vol += p.vol; entry.ts = Math.max(entry.ts, p.ts);
      }
      if (any) control[k] = entry;
    }
    const next = { races, control, ts: Date.now() };
    const changed = JSON.stringify({ r: next.races, c: next.control }) !== JSON.stringify({ r: this.data.races, c: this.data.control });
    this.data = next;
    if (changed) this.emit('polymarket', next);
  }

  async poll() {
    const ids = this.marketIds();
    for (let i = 0; i < ids.length; i += 40) await this.fetchBatch(ids.slice(i, i + 40));
    this.status = { markets: Object.keys(this.prices).length, last: new Date().toISOString(), lastError: null };
    this.rebuild();
  }

  start() {
    if (!this.map) { console.log('polymarket: no market map'); return; }
    const run = () => this.poll().catch((e) => { this.status.lastError = e.message; console.error('polymarket', e.message); });
    run();
    setInterval(run, Number(process.env.POLL_PM_MS || 45000));
  }
}

module.exports = { Polymarket };
