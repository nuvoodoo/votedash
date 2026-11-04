'use strict';
// Social stream store. Items arrive from tools/social-sync.js, which watches
// the election social-media agent's spreadsheet and posts rows here.

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).filter((r) => r.some((c) => c.trim())).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
}

function pick(o, ...keys) {
  for (const k of keys) if (o[k] != null && String(o[k]).trim() !== '') return String(o[k]).trim();
  return '';
}

function normalise(o) {
  const url = pick(o, 'url', 'link', 'post_url', 'permalink', 'tweet_url');
  const text = pick(o, 'text', 'content', 'post', 'body', 'message', 'tweet');
  if (!text) return null; // account rows without a post are not stream items
  const tsRaw = pick(o, 'ts', 'timestamp', 'time', 'date', 'created_at', 'posted_at', 'datetime');
  const ts = tsRaw ? (Date.parse(tsRaw) || Number(tsRaw) || Date.now()) : Date.now();
  return {
    id: pick(o, 'id', 'post_id') || url || `${text.slice(0, 40)}|${ts}`,
    author: pick(o, 'author', 'name', 'display_name', 'account_name', 'account'),
    handle: pick(o, 'handle', 'username', 'screen_name', 'user').replace(/^@/, ''),
    platform: pick(o, 'platform', 'network', 'source') || 'X',
    text,
    url,
    ts,
    avatar: pick(o, 'avatar', 'avatar_url', 'profile_image'),
    tag: pick(o, 'tag', 'category', 'role', 'party'),
  };
}

class Social {
  constructor(emit) {
    this.emit = emit;
    this.items = new Map();
    this.status = { last: null, count: 0 };
  }

  ingest(payload, contentType) {
    let rows = [];
    if (/csv/i.test(contentType || '')) rows = parseCSV(payload.toString('utf8'));
    else {
      const j = JSON.parse(payload.toString('utf8'));
      rows = Array.isArray(j) ? j : j.items || j.rows || [];
    }
    const fresh = [];
    for (const r of rows) {
      const it = normalise(r);
      if (!it) continue;
      const prev = this.items.get(it.id);
      if (prev && prev.text === it.text) continue;
      this.items.set(it.id, it);
      fresh.push(it);
    }
    // keep newest 400
    const all = [...this.items.values()].sort((a, b) => b.ts - a.ts).slice(0, 400);
    this.items = new Map(all.map((i) => [i.id, i]));
    this.status = { last: new Date().toISOString(), count: this.items.size };
    if (fresh.length) this.emit('social', { items: fresh.sort((a, b) => b.ts - a.ts) });
    return fresh.length;
  }

  list() {
    return [...this.items.values()].sort((a, b) => b.ts - a.ts);
  }
}

module.exports = { Social };
