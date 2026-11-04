'use strict';
const DDHQ = require('./ddhq');
const { partyCode } = require('./civic');
// Polls X through twitterapi.io: batched "from:" searches with a since filter so
// only new posts are fetched. Free tier allows one request per 5 seconds.

const { loadAccounts } = require('./socialpoll');

const API = 'https://api.twitterapi.io';
const BATCH = 20;
const SPACING_MS = Number(process.env.XPOLL_SPACING_MS || 5200);
const MAX_PAGES = 3;

function sinceStr(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}_${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}_UTC`;
}

class XPoll {
  constructor(civic, social, key, news, emitFeed) {
    this.civic = civic; this.social = social; this.key = key; this.news = news; this.emitFeed = emitFeed;
    const all = loadAccounts().filter((a) => a.x);
    this.byHandle = new Map(all.map((a) => [a.x.toLowerCase(), a]));
    const tierA = all.filter((a) => a.kind === 'media' || a.office === 'senate');
    const tierB = all.filter((a) => !(a.kind === 'media' || a.office === 'senate'));
    const chunk = (arr) => { const out = []; for (let i = 0; i < arr.length; i += BATCH) out.push(arr.slice(i, i + BATCH)); return out; };
    const A = chunk(tierA).map((h, i) => ({ id: `A${i}`, tier: 'A', handles: h.map((a) => a.x), since: Date.now() - 30 * 60 * 1000 }));
    const B = chunk(tierB).map((h, i) => ({ id: `B${i}`, tier: 'B', handles: h.map((a) => a.x), since: Date.now() - 30 * 60 * 1000 }));
    // Rotation: tier A twice per cycle, interleaved with tier B.
    const half = Math.ceil(B.length / 2);
    this.rotation = [...A, ...B.slice(0, half), ...A, ...B.slice(half)];
    this.pos = 0;
    this.status = { accounts: all.length, batches: A.length + B.length, cycleSeconds: Math.round(this.rotation.length * SPACING_MS / 1000), last: null, requests: 0, posts: 0, errors: 0, lastError: null, credits: null };
  }

  raceFor(a) {
    if (a.kind !== 'candidate') return null;
    for (const r of this.civic.races.values()) {
      if (a.office === 'senate' && r.cat === 'senate' && r.state === a.state) return r;
      if (a.office === 'house' && (r.cat === 'house' || r.cat === 'delegate') && r.district === a.district) return r;
    }
    return null;
  }

  async get(path, params) {
    const u = new URL(API + path);
    for (const k in params) u.searchParams.set(k, params[k]);
    const res = await fetch(u, { headers: { 'X-API-Key': this.key }, signal: AbortSignal.timeout(30000) });
    this.status.requests++;
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 80)}`);
    return JSON.parse(text);
  }

  toItem(t) {
    const a = this.byHandle.get((t.author?.userName || '').toLowerCase());
    if (!a) return null;
    if (t.isReply) return null;
    if (/^RT @/.test(t.text || '')) return null;
    const race = this.raceFor(a);
    const ts = Date.parse(t.createdAt);
    const media = (t.extendedEntities && t.extendedEntities.media) || (t.entities && t.entities.media) || [];
    const img = media[0] && (media[0].media_url_https || media[0].mediaUrlHttps) || '';
    return {
      id: `x:${t.id}`,
      author: t.author?.name || a.name,
      handle: t.author?.userName || a.x,
      platform: 'X',
      text: (t.text || '').replace(/\s*https:\/\/t\.co\/\w+$/g, '').trim(),
      url: t.url || `https://x.com/${a.x}/status/${t.id}`,
      ts: ts || Date.now(),
      avatar: t.author?.profilePicture || '',
      image: img,
      tag: a.kind === 'candidate' ? `${a.party}${race ? ', ' + race.name : ''}` : [a.outlet, a.role].filter(Boolean).join(', '),
      kind: a.kind,
      party: a.kind === 'candidate' ? partyCode(a.party) : null,
      tier: a.kind === 'media' || a.office === 'senate' ? 'A' : 'B',
      race_id: race ? race.id : null,
      race_name: race ? race.name : null,
    };
  }

  async pollBatch(b) {
    const query = `(${b.handles.map((h) => `from:${h}`).join(' OR ')}) since:${sinceStr(b.since - 60000)}`;
    let cursor = '', pages = 0, newest = b.since;
    const items = [];
    do {
      const params = { query, queryType: 'Latest' };
      if (cursor) params.cursor = cursor;
      const j = await this.get('/twitter/tweet/advanced_search', params);
      for (const t of j.tweets || []) {
        const it = this.toItem(t);
        if (it) { items.push(it); if (it.ts > newest) newest = it.ts; }
      }
      cursor = j.has_next_page ? j.next_cursor : '';
      pages++;
      if (cursor) await new Promise((r) => setTimeout(r, SPACING_MS));
    } while (cursor && pages < MAX_PAGES);
    b.since = newest;
    if (items.length) this.status.posts += this.social.ingestItems(items);
    this.ddhq(items);
  }

  // Decision Desk HQ projections become DDHQ race calls and set the winner when civicAPI has not.
  // Runs on every new batch and as a rescan of everything held, so parser fixes reach older posts.
  ddhq(items) {
    if (!this.news) return;
    const fresh = [];
    for (const it of items) {
      if ((it.handle || '').toLowerCase() !== 'decisiondeskhq') continue;
      const p = DDHQ.parse(it.text);
      if (!p) continue;
      for (const race of DDHQ.findRaces(p, this.civic.races)) {
        const w = DDHQ.findWinner(p, race);
        if (w && !race.winner) this.civic.applyCall(race.id, w.n, 'DDHQ');
        const c = (this.news.calls[race.id] = this.news.calls[race.id] || {});
        if (c.DDHQ) continue;
        c.DDHQ = { ts: it.ts, url: it.url, title: p.head.slice(0, 140) };
        fresh.push({ id: 'ddhq:' + race.id, kind: 'call', outlet: 'DDHQ', title: p.head.slice(0, 160), url: it.url, ts: it.ts, race_id: race.id, race_name: race.name });
      }
    }
    if (fresh.length) this.emitFeed({ items: fresh, calls: this.news.calls });
  }

  // On boot, pull every DDHQ projection since polls opened so no call is missed across restarts.
  async backfillDDHQ() {
    const since = process.env.DDHQ_SINCE || '2026-11-03_10:00:00_UTC';
    let cursor = '', pages = 0;
    const all = [];
    do {
      const params = { query: 'from:DecisionDeskHQ projects since:' + since, queryType: 'Latest' };
      if (cursor) params.cursor = cursor;
      const j = await this.get('/twitter/tweet/advanced_search', params);
      for (const t of j.tweets || []) all.push({ handle: 'DecisionDeskHQ', text: t.text || '', url: t.url || 'https://x.com/DecisionDeskHQ/status/' + t.id, ts: Date.parse(t.createdAt) || Date.now() });
      cursor = j.has_next_page ? j.next_cursor : '';
      pages++;
      if (cursor) await new Promise((r) => setTimeout(r, SPACING_MS));
    } while (cursor && pages < 25);
    this.ddhq(all.sort((a, b) => a.ts - b.ts));
    this.status.ddhqBackfill = { posts: all.length, at: new Date().toISOString() };
  }

  async loop() {
    for (;;) {
      const b = this.rotation[this.pos % this.rotation.length];
      this.pos++;
      const t0 = Date.now();
      try {
        await this.pollBatch(b);
        this.status.last = new Date().toISOString();
      } catch (e) {
        this.status.errors++; this.status.lastError = e.message;
        if (/429/.test(e.message)) await new Promise((r) => setTimeout(r, 10000));
      }
      if (this.pos % 6 === 0) this.ddhq([...this.social.items.values()].filter((i) => i.platform === 'X'));
      if (this.pos % 50 === 0) this.get('/oapi/my/info', {}).then((j) => { this.status.credits = j; }).catch(() => {});
      const wait = Math.max(500, SPACING_MS - (Date.now() - t0));
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  start() {
    if (!this.key) { console.log('xpoll: no TWITTERAPI_IO_KEY'); return; }
    if (!this.byHandle.size) { console.log('xpoll: no X accounts'); return; }
    this.backfillDDHQ().catch((e) => { this.status.lastError = 'ddhq backfill: ' + e.message; }).finally(() => this.loop().catch((e) => console.error('xpoll fatal', e)));
  }
}

module.exports = { XPoll };
