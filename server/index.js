'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Civic, SOUTHBAY_TILES } = require('./civic');
const { News } = require('./news');
const { Social } = require('./social');
const { SocialPoll } = require('./socialpoll');
const { XPoll } = require('./xpoll');
const { Polymarket } = require('./polymarket');
const { Pollgebra } = require('./pollgebra');
const { LAVote } = require('./lavote');
const { CNN } = require('./cnn');
const { CallTimes } = require('./calltimes');
const { Usage } = require('./usage');
const usage = new Usage();
const USERS_KEY = process.env.USERS_KEY || '';
const og = require('./og');
const titles = require('../public/titles');
// Candidate photos (tools/gather-photos.js). Served as one cached map.
let photosRaw = null, photosGz = null, photosMtime = 0;
let photosRemote = null; // latest manifest pulled from PHOTOS_URL, so new photos ship without a deploy
async function pullPhotos() {
  const u = process.env.PHOTOS_URL; if (!u) return;
  try {
    const r = await fetch(u + (u.includes('?') ? '&' : '?') + 't=' + Date.now(), { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'VoteDash/1.0' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const txt = await r.text(); JSON.parse(txt);
    if (txt !== photosRemote) { photosRemote = txt; photosRaw = null; console.log('photos manifest updated', txt.length, 'bytes'); }
  } catch (e) { console.error('photos pull', e.message); }
}
pullPhotos(); setInterval(pullPhotos, 5 * 60 * 1000);
function photosPayload() {
  const p = path.join(__dirname, 'data', 'photos.json');
  let st = null; try { st = fs.statSync(p); } catch (e) { st = { mtimeMs: 0 }; }
  if (!photosRaw || st.mtimeMs !== photosMtime) {
    let all = {};
    if (photosRemote) all = JSON.parse(photosRemote); else if (st.mtimeMs) all = JSON.parse(fs.readFileSync(p, 'utf8')); else return null;
    const slim = {};
    for (const k in all) { const v = all[k]; if (!v || v.none) continue; const o = {}; for (const f of ['portrait', 'action', 'campaign']) if (v[f]) o[f] = { url: v[f].url, credit: v[f].credit, license: v[f].license, page: v[f].page }; if (v.article) o.article = v.article; if (Object.keys(o).length) slim[k] = o; }
    photosRaw = Buffer.from(JSON.stringify(slim)); photosGz = zlib.gzipSync(photosRaw); photosMtime = st.mtimeMs;
  }
  return { raw: photosRaw, gz: photosGz };
}

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
  else if (ev === 'ready') {
    if (process.env.SEED_URL && USERS_KEY) {
      fetch(process.env.SEED_URL.replace(/\/api\/snapshot.*/, '') + '/api/usage-dump?key=' + encodeURIComponent(USERS_KEY), { signal: AbortSignal.timeout(15000) })
        .then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) { usage.load(d); console.log('usage seeded', usage.visitors.size, 'visitors'); } }).catch(() => {});
    }
    if (civic.seed) {
      const sn = civic.seed; civic.seed = null;
      if (Array.isArray(sn.feed) && !news.items.length) { news.items = sn.feed; for (const it of sn.feed) news.seen.add(it.id); }
      if (sn.calls && !Object.keys(news.calls).length) news.calls = sn.calls;
      if (Array.isArray(sn.social) && !social.items.size) social.ingestItems(sn.social);
      console.log(`seeded feed ${news.items.length}, social ${social.items.size}`);
    }
    snapshotDirty = true; broadcast('reload', { ts: Date.now() }); news.poll().catch(() => {}); socialPoll.start(); xPoll.start(); polymarket.start(); pollgebra.start(); lavote.start(); cnn.start(); callTimes.start();
  }
});
const news = new News(civic, (ev, payload) => { snapshotDirty = true; broadcast(ev, payload); });
const social = new Social((ev, payload) => { snapshotDirty = true; broadcast(ev, payload); });
const socialPoll = new SocialPoll(civic, social);
const xPoll = new XPoll(civic, social, process.env.TWITTERAPI_IO_KEY || '', news, (payload) => { news.items = payload.items.concat(news.items).slice(0, 500); snapshotDirty = true; broadcast('feed', payload); });
const polymarket = new Polymarket(civic, (ev, payload) => { snapshotDirty = true; broadcast(ev, payload); });
const lavote = new LAVote(civic);
const cnn = new CNN(civic, news, (payload) => { if (payload.items.length) news.items = payload.items.concat(news.items).slice(0, 500); snapshotDirty = true; broadcast('feed', payload); });
const pollgebra = new Pollgebra(civic, news, (payload) => { if (payload.items.length) news.items = payload.items.concat(news.items).slice(0, 500); snapshotDirty = true; broadcast('feed', payload); });
const callTimes = new CallTimes(civic, news);

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
    status: { civic: civic.status, news: news.status, social: social.status, socialPoll: socialPoll.status, xPoll: xPoll.status, polymarket: polymarket.status, pollgebra: pollgebra.status, lavote: lavote.status, cnn: cnn.status, clients: clients.size },
    bop: civic.bop(),
    national: civic.national,
    forecastTotals: {
      senate: civic.forecasts.senate?.totals || null,
      house: civic.forecasts.house?.totals || null,
      governor: civic.forecasts.governor?.totals || null,
    },
    races: civic.snapshotRows(),
    southBayTiles: SOUTHBAY_TILES,
    polymarket: polymarket.data,
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

function sendFile(req, res, file, transform) {
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found'); }
    const ext = path.extname(file);
    const headers = { 'content-type': MIME[ext] || 'application/octet-stream' };
    headers['cache-control'] = /\.(html|js|css)$/.test(ext) ? 'no-cache' : 'public, max-age=300';
    if (ext === '.html') data = Buffer.from((transform || ((h) => h))(data.toString('utf8').replace(/__V__/g, VERSION)));
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

// Each page's own title, description and share tags in the served HTML.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function pageHead(html, p) {
  const m = titles.page(p, civic.races);
  if (!m) return html;
  const t = esc(m.title), d = esc(m.desc), u = esc('https://votedash.net' + p);
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${d}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${t}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${d}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${u}`)
    .replace(/(<meta name="twitter:title" content=")[^"]*/, `$1${t}`)
    .replace(/(<meta name="twitter:description" content=")[^"]*/, `$1${d}`);
}

// ---- server --------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
    // Readiness: only take traffic once the race index exists.
    if (p === '/readyz') { const ok = civic.races.size > 0; res.writeHead(ok ? 200 : 503, { 'content-type': 'text/plain' }); return res.end(ok ? 'ready' : 'loading'); }

    if (p === '/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no', 'access-control-allow-origin': '*',
      });
      res.write(`retry: 3000\nevent: hello\ndata: ${JSON.stringify({ ts: Date.now(), version: VERSION })}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (p === '/og.png') {
      try { const png = og.render(civic); res.writeHead(200, { 'content-type': 'image/png', 'content-length': png.length, 'cache-control': 'public, max-age=60' }); return res.end(png); }
      catch (e) { console.error('og', e.message); res.writeHead(500); return res.end('og error'); }
    }
    if (p === '/og.svg') { res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-cache' }); return res.end(og.buildSVG(civic)); }
    if (p === '/api/photos') { const pp = photosPayload(); if (!pp) return sendJSON(req, res, {}); return sendJSON(req, res, null, { raw: pp.raw, gz: pp.gz }); }
    if (p === '/api/usage' || p === '/api/usage-dump') {
      if (!USERS_KEY || url.searchParams.get('key') !== USERS_KEY) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found'); }
      return sendJSON(req, res, p === '/api/usage' ? usage.report(civic, clients.size) : usage.dump());
    }
    if (p === '/users' || p === '/users/') {
      if (!USERS_KEY || url.searchParams.get('key') !== USERS_KEY) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found'); }
      return sendFile(req, res, path.join(PUBLIC, 'users.html'));
    }
    if (p === '/api/calls') { callTimes.build(); return sendJSON(req, res, null, { raw: callTimes.raw, gz: callTimes.gz }); }
    if (p === '/api/snapshot') { buildSnapshot(); return sendJSON(req, res, null, { raw: snapshotRaw, gz: snapshotGz }); }

    if (p === '/api/view') { const rm = (url.searchParams.get('p') || '').match(/^\/race\/(\d+)/); const vp = url.searchParams.get('p') || ''; usage.hit(req, rm ? 'race' : vp.startsWith('/feed') ? 'feed' : vp.startsWith('/board/') ? 'board:' + vp.split('/')[2] : 'home', rm ? Number(rm[1]) : null); res.writeHead(204); return res.end(); }
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

    if (p === '/api/status') return sendJSON(req, res, { civic: civic.status, news: news.status, social: social.status, socialPoll: socialPoll.status, xPoll: xPoll.status, polymarket: polymarket.status, pollgebra: pollgebra.status, lavote: lavote.status, cnn: cnn.status, callTimes: callTimes.status, clients: clients.size, races: civic.races.size, version: VERSION });

    // static + SPA routes
    if (p === '/' || p.startsWith('/race/') || p === '/feed' || p.startsWith('/feed/') || p === '/board' || p.startsWith('/board/') || p === '/calls') {
      const rm = p.match(/^\/race\/(\d+)/);
      usage.hit(req, rm ? 'race' : p.startsWith('/feed') ? 'feed' : p.startsWith('/board/') ? 'board:' + p.split('/')[2] : 'home', rm ? Number(rm[1]) : null);
      return sendFile(req, res, path.join(PUBLIC, 'index.html'), (h) => pageHead(h, p));
    }
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
setInterval(() => usage.sample(clients.size), 60000);
// Periodic clock tick so every client shows a fresh "updated" time and BOP.
setInterval(() => broadcast('tick', { ts: Date.now(), bop: civic.bop(), status: { civic: civic.status.lastOk, err: civic.status.lastError } }), 15000);

server.keepAliveTimeout = 65000;
server.listen(PORT, () => {
  console.log(`VoteDash listening on ${PORT} v${VERSION}`);
  news.start();
  civic.start().catch((e) => console.error('fatal start', e));
});
