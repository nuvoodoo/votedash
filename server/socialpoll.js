'use strict';
const { partyCode } = require('./civic');
// Polls Bluesky's public API for every account in server/data/accounts.json
// that has a Bluesky handle, and feeds new posts into the social store.

const fs = require('fs');
const path = require('path');

const BSKY = 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed';
const MAX_AGE_MS = 36 * 60 * 60 * 1000;

function loadAccounts() {
  const p = path.join(__dirname, 'data', 'accounts.json');
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

class SocialPoll {
  constructor(civic, social) {
    this.civic = civic;
    this.social = social;
    this.accounts = loadAccounts().filter((a) => a.bsky);
    this.status = { accounts: this.accounts.length, last: null, ok: 0, failed: 0, posts: 0 };
  }

  raceFor(a) {
    if (a.kind !== 'candidate') return null;
    for (const r of this.civic.races.values()) {
      if (a.office === 'senate' && r.cat === 'senate' && r.state === a.state) return r;
      if (a.office === 'house' && (r.cat === 'house' || r.cat === 'delegate') && r.district === a.district) return r;
    }
    return null;
  }

  async fetchAccount(a) {
    const url = `${BSKY}?actor=${encodeURIComponent(a.bsky)}&limit=15&filter=posts_no_replies`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'VoteDash/1.0 (+https://votedash.net)' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const race = this.raceFor(a);
    const now = Date.now();
    const items = [];
    for (const f of j.feed || []) {
      const p = f.post; if (!p || !p.record) continue;
      if (f.reason) continue; // reposts
      const ts = Date.parse(p.record.createdAt || p.indexedAt);
      if (!ts || now - ts > MAX_AGE_MS) continue;
      const rkey = p.uri.split('/').pop();
      const text = p.record.text || '';
      const img = p.embed && p.embed.images && p.embed.images[0] ? p.embed.images[0].thumb : (p.embed && p.embed.external && p.embed.external.thumb) || '';
      items.push({
        id: p.uri,
        author: p.author.displayName || a.name,
        handle: p.author.handle,
        platform: 'Bluesky',
        text,
        url: `https://bsky.app/profile/${p.author.handle}/post/${rkey}`,
        ts,
        avatar: p.author.avatar || '',
        image: img,
        tag: a.kind === 'candidate' ? `${a.party}${race ? ', ' + race.name : ''}` : [a.outlet, a.role].filter(Boolean).join(', '),
        kind: a.kind,
        party: a.kind === 'candidate' ? partyCode(a.party) : null,
        tier: a.kind === 'media' || a.office === 'senate' ? 'A' : 'B',
        race_id: race ? race.id : null,
        race_name: race ? race.name : null,
      });
    }
    return items;
  }

  async cycle() {
    const queue = [...this.accounts];
    let ok = 0, failed = 0, posts = 0;
    const worker = async () => {
      while (queue.length) {
        const a = queue.shift();
        try {
          const items = await this.fetchAccount(a);
          ok++;
          if (items.length) posts += this.social.ingestItems(items);
        } catch (e) { failed++; }
        await new Promise((r) => setTimeout(r, 150));
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    this.status = { ...this.status, last: new Date().toISOString(), ok, failed, posts, total: this.social.items.size };
  }

  start() {
    if (!this.accounts.length) { console.log('socialpoll: no Bluesky accounts'); return; }
    const run = () => this.cycle().catch((e) => console.error('socialpoll', e.message));
    run();
    setInterval(run, Number(process.env.POLL_SOCIAL_MS || 120000));
  }
}

module.exports = { SocialPoll, loadAccounts };
