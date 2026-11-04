'use strict';
// Usage tracking: page views, unique visitors, live viewers over time, top
// races, referrers, countries, device class. In memory, seeded from the
// running server across deploys, kept for the last 48 hours.

const crypto = require('crypto');

const KEEP_MS = 48 * 60 * 60 * 1000;
const MIN = 60 * 1000;

class Usage {
  constructor() {
    this.start = Date.now();
    this.minutes = new Map(); // minuteTs -> { v: views, u: Set(visitor), c: peak concurrent }
    this.visitors = new Map(); // id -> { f: first, l: last, v: views, co: country, m: mobile }
    this.pages = new Map(); // path -> count
    this.races = new Map(); // race id -> count
    this.refs = new Map(); // referrer host -> count
    this.countries = new Map();
    this.samples = []; // [ts, concurrent]
    this.salt = crypto.randomBytes(8).toString('hex');
  }

  visitorId(req) {
    const ip = (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const ua = req.headers['user-agent'] || '';
    return crypto.createHash('sha1').update(this.salt + '|' + ip + '|' + ua).digest('hex').slice(0, 16);
  }

  hit(req, kind, raceId) {
    const now = Date.now();
    const ua = req.headers['user-agent'] || '';
    if (/bot|crawl|spider|slurp|facebookexternalhit|twitterbot|preview|curl|python-requests/i.test(ua)) return;
    const id = this.visitorId(req);
    const co = (req.headers['cf-ipcountry'] || '').toUpperCase() || null;
    const mobile = /Mobi|Android|iPhone|iPad/i.test(ua);
    const m = Math.floor(now / MIN) * MIN;
    const bucket = this.minutes.get(m) || { v: 0, u: new Set(), c: 0 };
    bucket.v++; bucket.u.add(id); this.minutes.set(m, bucket);
    const vis = this.visitors.get(id) || { f: now, l: now, v: 0, co, m: mobile };
    vis.l = now; vis.v++; if (co) vis.co = co; this.visitors.set(id, vis);
    this.pages.set(kind, (this.pages.get(kind) || 0) + 1);
    if (raceId) this.races.set(raceId, (this.races.get(raceId) || 0) + 1);
    const ref = req.headers.referer || req.headers.referrer;
    if (ref) { try { const h = new URL(ref).hostname.replace(/^www\./, ''); if (!/votedash/.test(h)) this.refs.set(h, (this.refs.get(h) || 0) + 1); } catch (e) { /* ignore */ } }
    if (co) this.countries.set(co, (this.countries.get(co) || 0) + 1);
  }

  sample(concurrent) {
    const now = Date.now();
    this.samples.push([now, concurrent]);
    const m = Math.floor(now / MIN) * MIN;
    const bucket = this.minutes.get(m) || { v: 0, u: new Set(), c: 0 };
    bucket.c = Math.max(bucket.c, concurrent); this.minutes.set(m, bucket);
    this.prune(now);
  }

  prune(now) {
    for (const k of this.minutes.keys()) if (now - k > KEEP_MS) this.minutes.delete(k);
    for (const [k, v] of this.visitors) if (now - v.l > KEEP_MS) this.visitors.delete(k);
    while (this.samples.length && now - this.samples[0][0] > KEEP_MS) this.samples.shift();
  }

  report(civic, concurrent) {
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000, hourAgo = now - 60 * MIN;
    const mins = [...this.minutes.entries()].sort((a, b) => a[0] - b[0]);
    const sum = (from, f) => mins.filter(([k]) => k >= from).reduce((s, [, b]) => s + f(b), 0);
    const uniques = (from) => { const s = new Set(); for (const [k, b] of mins) if (k >= from) for (const id of b.u) s.add(id); return s.size; };
    const top = (map, n, label) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ k: label ? label(k) : k, v }));
    const vis = [...this.visitors.values()];
    const active = vis.filter((v) => now - v.l < 5 * MIN).length;
    return {
      now, since: this.start, concurrent, active5m: active,
      peak24h: Math.max(0, ...mins.filter(([k]) => k >= dayAgo).map(([, b]) => b.c)),
      views: { hour: sum(hourAgo, (b) => b.v), day: sum(dayAgo, (b) => b.v), all: sum(0, (b) => b.v) },
      uniques: { hour: uniques(hourAgo), day: uniques(dayAgo), all: this.visitors.size },
      mobileShare: vis.length ? Math.round(100 * vis.filter((v) => v.m).length / vis.length) : 0,
      returning: vis.filter((v) => v.v >= 5).length,
      series: mins.filter(([k]) => k >= dayAgo).map(([k, b]) => [k, b.v, b.u.size, b.c]),
      pages: top(this.pages, 12),
      races: top(this.races, 15, (id) => (civic.races.get(Number(id)) || {}).name || `race ${id}`),
      referrers: top(this.refs, 12),
      countries: top(this.countries, 12),
    };
  }

  // Seeding: carry history across deploys from the running server.
  dump() {
    return {
      start: this.start,
      minutes: [...this.minutes.entries()].map(([k, b]) => [k, b.v, [...b.u], b.c]),
      visitors: [...this.visitors.entries()],
      pages: [...this.pages.entries()], races: [...this.races.entries()], refs: [...this.refs.entries()], countries: [...this.countries.entries()],
      samples: this.samples, salt: this.salt,
    };
  }
  load(d) {
    if (!d || !d.minutes) return;
    this.start = d.start || this.start; this.salt = d.salt || this.salt;
    this.minutes = new Map(d.minutes.map(([k, v, u, c]) => [k, { v, u: new Set(u), c }]));
    this.visitors = new Map(d.visitors); this.pages = new Map(d.pages); this.races = new Map(d.races); this.refs = new Map(d.refs); this.countries = new Map(d.countries);
    this.samples = d.samples || [];
  }
}

module.exports = { Usage };
