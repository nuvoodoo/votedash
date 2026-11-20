// Renders a sample of the site into a self-contained folder for an Artifact preview.
// Usage: node tools/congress/preview.js <outDir>  (server must be running on PORT, default 8090)
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(process.argv[2] || 'preview-out');
const BASE = `http://127.0.0.1:${process.env.PORT || 8090}`;
const ROOT = path.join(__dirname, '../..');

const pages = ['/', '/schedule', '/members?chamber=S', '/incoming', '/votes', '/money', '/about',
  '/vote/S927', '/vote/S926', '/vote/S925', '/vote/H686', '/vote/S924', '/vote/H685', '/vote/H684', '/vote/S923', '/vote/H600',
  '/m/ted-cruz', '/m/ted-cruz/votes', '/m/ted-cruz/network', '/m/alexandria-ocasio-cortez', '/m/nancy-pelosi', '/m/jon-ossoff', '/m/mike-johnson',
  '/m/charles-e-schumer', '/m/bernard-sanders', '/m/john-fetterman', '/m/hakeem-s-jeffries', '/m/john-thune', '/m/lisa-murkowski', '/m/thomas-massie',
  '/m/james-talarico', '/state/tx', '/state/ny', '/f/exxon-mobil-corporation-political-action-committee-exxonmobil-pac-c00121368', '/industry/oil-gas', '/issues'];
const fileOf = p => p === '/' ? 'home.html' : p.slice(1).replace(/[/?=&]/g, '-') + '.html';

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const got = new Map();
  for (const p of pages) { const r = await fetch(BASE + p); if (r.ok) got.set(p, await r.text()); }
  const have = new Set(got.keys());
  const assets = new Set(['c/site.css', 'c/site.js', 'c/net.js']);
  for (const [p, html] of got) {
    let h = html.replace(/(href|src)="(\/[^"#]*)(#[^"]*)?"/g, (m, attr, u, hash = '') => {
      if (u.startsWith('/c/') || u.startsWith('/portraits/') || u === '/favicon.svg') { const a = u.split('?')[0].slice(1); assets.add(a); return `${attr}="${a}"`; }
      if (attr === 'href' && u === '/members') return `href="members-chamber-S.html"`;
      if (attr === 'href' && have.has(u)) return `href="${fileOf(u)}${hash}"`;
      if (attr === 'href' && have.has(u.split('?')[0]) && !u.includes('?')) return `href="${fileOf(u)}${hash}"`;
      if (attr === 'href') return `href="${u.startsWith('/2026') ? 'https://votedash.net' + u : '#'}" data-off`;
      return m;
    });
    h = h.replace(/action="\/search"/g, 'action="#"');
    fs.writeFileSync(path.join(OUT, fileOf(p)), h);
  }
  // network graph data
  const g = await (await fetch(BASE + '/api/graph/C001098')).json();
  fs.writeFileSync(path.join(OUT, 'graph-C001098.json'), JSON.stringify(g));
  for (const a of assets) {
    const src = path.join(ROOT, 'public', a); if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(path.join(OUT, a)), { recursive: true });
    let buf = fs.readFileSync(src);
    if (a === 'c/net.js') buf = Buffer.from(buf.toString().replace("fetch('/api/graph/' + el.dataset.id)", "fetch('graph-' + el.dataset.id + '.json')"));
    if (a === 'c/site.css') buf = Buffer.from(buf.toString() + '\na[data-off]{pointer-events:none;color:inherit;text-decoration:none}\n');
    fs.writeFileSync(path.join(OUT, a), buf);
  }
  // main page: the artifact wraps it in its own skeleton
  const home = fs.readFileSync(path.join(OUT, 'home.html'), 'utf8')
    .replace(/^<!doctype html><html lang="en"><head>/i, '').replace('</head><body>', '').replace(/<\/body><\/html>\s*$/, '');
  fs.writeFileSync(path.join(OUT, 'index.html'), home);
  console.log('pages', got.size, 'assets', assets.size, 'files', fs.readdirSync(OUT, { recursive: true }).length);
})();
