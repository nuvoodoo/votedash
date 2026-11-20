'use strict';
// VoteDash Congress directory. Server-rendered pages from server/congress/data;
// the 2026 election dashboard is served as a frozen static archive under /2026/.
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const D = require('./congress/data');
const P = require('./congress/pages');
const LV = require('./congress/live');

const PORT = process.env.PORT || 8080;
const PUB = path.join(__dirname, '../public');
const ARCHIVE = path.join(__dirname, '../archive');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.geojson': 'application/json' };

function send(req, res, status, body, type = 'text/html; charset=utf-8', cache = 'public, max-age=300') {
  const h = { 'Content-Type': type, 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' };
  if (body.length > 1024 && /gzip/.test(req.headers['accept-encoding'] || '') && !/image\/(webp|png|jpeg)/.test(type)) { body = zlib.gzipSync(body); h['Content-Encoding'] = 'gzip'; h.Vary = 'Accept-Encoding'; }
  res.writeHead(status, h); res.end(req.method === 'HEAD' ? undefined : body);
}
function file(req, res, root, rel, cache) {
  const p = path.normalize(path.join(root, rel));
  if (!p.startsWith(root)) return false;
  let f = p;
  try { if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); } catch { return false; }
  if (!fs.existsSync(f)) return false;
  send(req, res, 200, fs.readFileSync(f), TYPES[path.extname(f)] || 'application/octet-stream', cache);
  return true;
}
const html = (req, res, body, status = 200) => send(req, res, status, Buffer.from(body));
const json = (req, res, obj) => send(req, res, 200, Buffer.from(JSON.stringify(obj)), 'application/json', 'public, max-age=300');

http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    let p = decodeURIComponent(url.pathname);
    if (p.length > 1 && p.endsWith('/') && !p.startsWith('/2026')) { res.writeHead(301, { Location: p.slice(0, -1) + url.search }); return res.end(); }
    if (p === '/healthz' || p === '/readyz') return send(req, res, 200, Buffer.from('ok'), 'text/plain', 'no-store');
    if (p === '/2026') { res.writeHead(301, { Location: '/2026/' }); return res.end(); }
    if (p.startsWith('/2026/')) { if (file(req, res, ARCHIVE, p, 'public, max-age=3600')) return; return html(req, res, P.notFound(), 404); }
    if (p.startsWith('/c/') || p.startsWith('/portraits/') || p === '/favicon.svg') { if (file(req, res, PUB, p, p.startsWith('/portraits/') ? 'public, max-age=604800' : 'public, max-age=86400')) return; return send(req, res, 404, Buffer.from('not found'), 'text/plain'); }
    // old dashboard URLs move to the archive
    let m;
    if ((m = p.match(/^\/(race\/\d+|board(\/[\w-]+)?|feed|calls)$/))) { res.writeHead(301, { Location: `/2026/${m[1]}/` }); return res.end(); }

    if (p === '/') return html(req, res, P.home());
    if (p === '/schedule') return html(req, res, P.schedule());
    if (p === '/leadership') { const b = P.leadership(); return b ? html(req, res, b) : html(req, res, P.notFound(), 404); }
    if ((m = p.match(/^\/leadership\/([\w-]+)$/))) { const b = P.leaderElection(m[1]); return b ? html(req, res, b) : html(req, res, P.notFound(), 404); }
    if (p === '/tracker') return html(req, res, P.tracker(url.searchParams));
    if (p === '/committees') return html(req, res, P.committees());
    if ((m = p.match(/^\/committee\/([a-z0-9]+)$/))) { const b = P.committee(m[1]); return b ? html(req, res, b) : html(req, res, P.notFound(), 404); }
    if (p === '/members') return html(req, res, P.members(url.searchParams));
    if (p === '/incoming') return html(req, res, P.incoming());
    if (p === '/votes') return html(req, res, P.votes(url.searchParams));
    if (p === '/money') return html(req, res, P.moneyP());
    if (p === '/about') return html(req, res, P.about());
    if (p === '/search') { const r = P.search(url.searchParams); if (r && r.redirect) { res.writeHead(302, { Location: r.redirect }); return res.end(); } return html(req, res, r); }
    if (p === '/find') { P.find(url.searchParams).then(b => html(req, res, b)).catch(e => { console.error(e); send(req, res, 500, Buffer.from('Server error'), 'text/plain', 'no-store'); }); return; }
    if (p === '/issues') { const b = P.issues(); return b ? html(req, res, b) : html(req, res, P.notFound(), 404); }
    if (p === '/sitemap.xml') return send(req, res, 200, Buffer.from(P.sitemap()), 'application/xml');
    if (p === '/robots.txt') return send(req, res, 200, Buffer.from('User-agent: *\nAllow: /\nSitemap: https://votedash.net/sitemap.xml\n'), 'text/plain');
    if (p === '/api/suggest') return json(req, res, P.suggest(url.searchParams.get('q') || ''));
    if ((m = p.match(/^\/api\/graph\/([\w-]+)$/))) { const pp = D.byId.get(m[1]); return pp ? json(req, res, P.graph(pp)) : html(req, res, P.notFound(), 404); }
    if ((m = p.match(/^\/m\/([\w-]+)(\/(votes|speeches|network))?$/))) {
      const pp = D.bySlug.get(m[1]); if (!pp) return html(req, res, P.notFound(), 404);
      if (!m[3]) return html(req, res, P.member(pp));
      if (m[3] === 'votes') return pp.votes ? html(req, res, P.memberVotes(pp, +url.searchParams.get('page') || 1)) : html(req, res, P.notFound(), 404);
      if (m[3] === 'speeches') { const b = P.memberSpeeches(pp); return b ? html(req, res, b) : html(req, res, P.notFound(), 404); }
      return html(req, res, P.network(pp));
    }
    if ((m = p.match(/^\/state\/([a-z]{2})$/))) { const b = P.stateP(m[1].toUpperCase()); return b ? html(req, res, b) : html(req, res, P.notFound(), 404); }
    if ((m = p.match(/^\/vote\/([HS]\d+)$/))) { const rc = D.rcByK.get(m[1]); return rc ? html(req, res, P.vote(rc)) : html(req, res, P.notFound(), 404); }
    if ((m = p.match(/^\/bill\/([a-z]+\d+)$/))) { const b = P.bill(m[1]); return b ? html(req, res, b) : html(req, res, P.notFound(), 404); }
    if ((m = p.match(/^\/f\/([\w-]+)$/))) { const f = D.fundersBySlug.get(m[1]); return f ? html(req, res, P.funder(f)) : html(req, res, P.notFound(), 404); }
    if ((m = p.match(/^\/industry\/([\w-]+)$/))) { const b = P.industry(m[1]); return b ? html(req, res, b) : html(req, res, P.notFound(), 404); }
    if ((m = p.match(/^\/issue\/([\w-]+)$/))) { const b = P.issue(m[1]); return b ? html(req, res, b) : html(req, res, P.notFound(), 404); }
    return html(req, res, P.notFound(), 404);
  } catch (e) {
    console.error(req.url, e);
    send(req, res, 500, Buffer.from('Server error'), 'text/plain', 'no-store');
  }
}).listen(PORT, () => { console.log('VoteDash Congress on', PORT); if (process.env.LIVE !== '0') LV.start(); });
