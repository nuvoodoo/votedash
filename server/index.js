'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Civic } = require('./civic');
const { News } = require('./news');
const { Social } = require('./social');

const PORT = Number(process.env.PORT || 8080);
const SOCIAL_TOKEN = process.env.SOCIAL_TOKEN || '';
const PUBLIC = path.join(__dirname, '..', 'public');
const VERSION = process.env.BUILD_VERSION || String(Date.now()).slice(-6);

// ---- SSE hub -------------------------------------------------------------
const clients = new Set();
function broadcast(event, payload) {
  if (!clients.size) return;
  const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    if (res.writableEnded || res.destroyed) { clients.delete(res); continue; }
    res.write(frame);
  }
}

const civic = new Civic((ev, payload) => {
  if (ev === 'races') { snapshotDirty = true; broadcast('races', { ...payload, ts: Date.now() }); }
  else if (ev === 'calls') { feedCalls(payload); }
  else if (ev === 'ready') { snapshotDirty = true; broadcast('reload', { ts: Date.now() }); news.poll().catch(() => {}); }
});
const news = new News(civic, (ev, payload) => { snapshotDirty = true; broadcast(ev, payload); });
const social = new Social((ev, payload) => { snapshotDirty = true; broadcast(ev, payload); });

// civicAPI winner flips become feed items too.
function feedCalls(items) {
  const fresh = items.map((c) => ({ id: `civic:${c.race_id}:${c.ts}`, ...c, race_name: civic.races.get(c.race_id)?.name || null }));
  news.items = fresh.concat(news.items).slice(0, 500);
  for (const c of items) {
    const r = civic.races.get(c.race_id);
    if (r && r.winner) {
      const b = (news.calls[c.race_id] = news.calls[c.race_id] || {});
      b.civicAPI = { ts: c.ts, url: c.url, title: c.title };
    } else if (news.calls[c.race_id]) delete news.calls[c.race_id].civicAPI;
  }
  snapshotDirty = true;
  broadcast('feed', { items: fresh, calls: news.calls });
}

// ---- snapshot cache ------------------------------------------------------
let snapshotDirty = true;
let snapshotGz = null, snapshotRaw = null, snapshotTs = 0;
function buildSnapshot() {
  if (!snapshotDirty && snapshotRaw && Date.now() - snapshotTs < 5000) return;
  const body = {
    ts: Date.now(),
    version: VERSION,
    status: { civic: civic.status, news: news.status, social: social.status, clients: clients.size },
    bop: civic.bop(),
    national: civic.national,
    forecastTotals: {
      senate: civic.forecasts.senate?.totals || null,
      house: civic.forecasts.house?.totals || null,
      governor: civic.forecasts.governor?.totals || null,
    },
    races: civic.snapshotRows(),
    feed: news.items.slice(0, 300),
    calls: news.calls,
    social: social.list().slice(0, 200),
  };
  snapshotRaw = Buffer.from(JSON.stringify(body));
  snapshotGz = zlib.gzipSync(snapshotRaw, { level: 6 });
  snapshotTs = Date.now();
  snapshotDirty = false;
}

// ---- helpers -------------------------------------------------------------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };

function sendJSON(req, res, obj, { raw, gz } = {}) {
  const acceptGz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  const r = raw || Buffer.from(JSON.stringify(obj));
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' };
  if (acceptGz) {
    headers['content-encoding'] = 'gzip';
    const g = gz || zlib.gzipSync(r, { level: 6 });
    headers['content-length'] = g.length;
    res.writeHead(200, headers); res.end(g);
  } else {
    headers['content-length'] = r.length;
    res.writeHead(200, headers); res.end(r);
  }
}

function sendFile(req, res, file) {
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found'); }
    const ext = path.extname(file);
    const headers = { 'content-type': MIME[ext] || 'application/octet-stream' };
    headers['cache-control'] = ext === '.html' ? 'no-cache' : 'public, max-age=300';
    if (ext === '.html') data = Buffer.from(data.toString('utf8').replace(/__V__/g, VERSION));
    if (/\bgzip\b/.test(req.headers['accept-encoding'] || '') && /\.(html|js|css|svg)$/.test(ext)) {
      headers['content-encoding'] = 'gzip';
      data = zlib.gzipSync(data);
    }
    headers['content-length'] = data.length;
    res.writeHead(200, headers); res.end(data);
  });
}

function readBody(req, limit = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ---- server --------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }

    if (p === '/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no', 'access-control-allow-origin': '*',
      });
      res.write(`retry: 3000\nevent: hello\ndata: ${JSON.stringify({ ts: Date.now(), version: VERSION })}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (p === '/api/snapshot') { buildSnapshot(); return sendJSON(req, res, null, { raw: snapshotRaw, gz: snapshotGz }); }

    if (p.startsWith('/api/race/')) {
      const id = Number(p.split('/')[3]);
      if (!id) { res.writeHead(400); return res.end('bad id'); }
      try { return sendJSON(req, res, await civic.detail(id)); }
      catch (e) { res.writeHead(502, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: e.message })); }
    }

    if (p === '/api/social/ingest' && req.method === 'POST') {
      const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!SOCIAL_TOKEN || auth !== SOCIAL_TOKEN) { res.writeHead(401); return res.end('unauthorized'); }
      const body = await readBody(req);
      const n = social.ingest(body, req.headers['content-type']);
      return sendJSON(req, res, { ok: true, added: n, total: social.items.size });
    }

    if (p === '/api/status') return sendJSON(req, res, { civic: civic.status, news: news.status, social: social.status, clients: clients.size, races: civic.races.size, version: VERSION });

    // static + SPA routes
    if (p === '/' || p.startsWith('/race/') || p === '/feed' || p === '/board') return sendFile(req, res, path.join(PUBLIC, 'index.html'));
    const safe = path.normalize(p).replace(/^(\.\.[/\\])+/, '');
    const file = path.join(PUBLIC, safe);
    if (file.startsWith(PUBLIC) && fs.existsSync(file) && fs.statSync(file).isFile()) return sendFile(req, res, file);
    res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found');
  } catch (e) {
    console.error(req.method, p, e);
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('error');
  }
});

// SSE heartbeat keeps proxies from closing idle streams.
setInterval(() => { for (const res of clients) { if (res.writableEnded) clients.delete(res); else res.write(': ping\n\n'); } }, 20000);
// Periodic clock tick so every client shows a fresh "updated" time and BOP.
setInterval(() => broadcast('tick', { ts: Date.now(), bop: civic.bop(), status: { civic: civic.status.lastOk, err: civic.status.lastError } }), 15000);

server.keepAliveTimeout = 65000;
server.listen(PORT, () => {
  console.log(`VoteDash listening on ${PORT} v${VERSION}`);
  news.start();
  civic.start().catch((e) => console.error('fatal start', e));
});
