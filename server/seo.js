'use strict';
// Search: sitemap.xml, robots.txt, canonical URLs and server-rendered page content,
// so crawlers see each race's results and every race link without running app.js.

const ORIGIN = 'https://votedash.net';
const BOARDS = ['lacounty', 'senate', 'house', 'governor', 'ballot', 'statewide', 'legislature'];
const PARTY = { D: 'D', R: 'R', I: 'I' };

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtN = (n) => Number(n || 0).toLocaleString('en-US');
const fmtPct = (n) => `${(Math.round((n || 0) * 10) / 10).toFixed(1)}%`;
const real = (r) => (r.cands || []).filter((c) => c.n !== 'Write-in');

// Board tab a race belongs to (same grouping as the board).
function boardOf(r) {
  if (r.cat === 'state-senate' || r.cat === 'state-house') return 'legislature';
  if (r.cat === 'delegate') return 'house';
  if (BOARDS.includes(r.cat)) return r.cat;
  return r.sb ? 'lacounty' : null;
}

function sitemap(races) {
  const day = new Date().toISOString().slice(0, 10);
  const url = (loc, lastmod, freq, pri) => `<url><loc>${ORIGIN}${loc}</loc><lastmod>${lastmod}</lastmod><changefreq>${freq}</changefreq><priority>${pri}</priority></url>`;
  const out = [url('/', day, 'hourly', '1.0'), url('/calls', day, 'hourly', '0.8'), url('/feed', day, 'hourly', '0.5')];
  for (const b of BOARDS) out.push(url(`/board/${b}`, day, 'hourly', '0.8'));
  for (const r of races.values()) out.push(url(`/race/${r.id}`, r.upd ? new Date(r.upd).toISOString() : day, 'hourly', r.cat === 'senate' || r.cat === 'governor' || r.cat === 'house' ? '0.7' : '0.5'));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${out.join('\n')}\n</urlset>\n`;
}

const robots = () => `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /events\nDisallow: /users\n\nSitemap: ${ORIGIN}/sitemap.xml\n`;

// The one URL each page is indexed under; null for a page that does not exist.
function canonical(p, races) {
  const m = p.match(/^\/race\/(\d+)\/?$/);
  if (m) return races.has(Number(m[1])) ? `/race/${m[1]}` : null;
  if (p === '/' || p === '/board' || p === '/board/') return '/';
  const b = p.match(/^\/board\/([a-z]+)\/?$/);
  if (b) return b[1] === 'southbay' ? '/board/lacounty' : BOARDS.includes(b[1]) ? `/board/${b[1]}` : null;
  if (p === '/calls' || p === '/feed') return p;
  if (p.startsWith('/feed/')) return '/feed';
  return null;
}

function raceDetail(r) {
  const cs = real(r).slice().sort((a, b) => (b.v || 0) - (a.v || 0));
  const total = cs.reduce((s, c) => s + (c.v || 0), 0);
  const board = boardOf(r);
  const meta = [`<span><b>${Math.round(r.pct || 0)}%</b> reporting</span>`];
  if (total) meta.push(`<span><b>${fmtN(total)}</b> votes cast</span>`);
  if (total && cs[1]) meta.push(`<span>Margin <b>${fmtN(cs[0].v - cs[1].v)} votes</b> (${(Math.round((100 * (cs[0].v - cs[1].v) / total) * 10) / 10).toFixed(1)} pts)</span>`);
  if (r.rating) meta.push(`<span>Rating <b>${esc(r.rating)}</b></span>`);
  if (r.open) meta.push('<span><b>Open seat</b></span>');
  const rows = cs.map((c) => `<tr${c.w ? ' class="w"' : ''}><td class="cn p-${esc(c.p)}">${esc(c.n)}<span class="party">${esc(c.pf || '')}</span>${c.inc ? '<span class="inc">Incumbent</span>' : ''}</td><td class="cb"></td><td class="cv">${fmtN(c.v)}</td><td class="cp">${total ? fmtPct((100 * c.v) / total) : ''}</td></tr>`).join('');
  return `<a class="back" href="${board ? `/board/${board}` : '/'}">Back to board</a>`
    + `<h1>${esc(r.name)}</h1><div class="meta">${meta.join('')}</div>`
    + (r.winner ? `<div class="call-banner"><span class="lead">${esc(r.winner.n)} wins${r.callSrc ? ', projected by ' + esc(r.callSrc) : ''}.</span></div>` : '')
    + `<table class="cands"><tbody>${rows}</tbody></table>`
    + `<p><a href="/calls">Who called it: every source ranked</a></p>`;
}

function boardRows(cat, races) {
  const key = cat === 'lacounty' ? (r) => !!r.sb : (r) => boardOf(r) === cat;
  const rows = [...races.values()].filter(key).sort((a, b) => String(a.stateName).localeCompare(String(b.stateName)) || String(a.district || '').localeCompare(String(b.district || ''), undefined, { numeric: true }) || a.name.localeCompare(b.name));
  return rows.map((r) => {
    const cs = real(r).slice().sort((a, b) => (b.v || 0) - (a.v || 0));
    const total = cs.reduce((s, c) => s + (c.v || 0), 0);
    const [a, b] = cs;
    const lead = total && a ? cs.slice(0, 2).map((c) => `<div class="cand-line${c.w ? ' w' : ''}"><span class="nm p-${esc(c.p)}">${esc(c.n)}${PARTY[c.p] ? ` (${c.p})` : ''}</span><span class="pc">${fmtPct((100 * c.v) / total)}</span></div>`).join('') + `<div class="tot">${fmtN(total)} votes</div>` : '';
    const margin = total && a && b ? `<span class="p-${esc(a.p)}">${esc(a.p)} +${((100 * (a.v - b.v)) / total).toFixed(1)}</span><span class="mv">+${fmtN(a.v - b.v)}</span>` : '';
    return `<tr><td><span class="race-name"><a href="/race/${r.id}">${esc(r.name)}</a></span>${r.winner ? `<span class="race-sub"><span class="called-note">Winner: ${esc(r.winner.n)}</span></span>` : ''}</td><td class="leader">${lead}</td><td class="num margin">${margin}</td><td class="num pct">${Math.round(r.pct || 0)}%</td><td class="calls"></td></tr>`;
  }).join('');
}

function callsBoard(d) {
  const items = d.board.filter((b) => b.ranked).map((b, i) => `<li class="ct-row"><span class="ct-rank">${i + 1}</span><span class="ct-src">${esc(b.src)}</span><span class="ct-score"><b>${b.score.toFixed(1)}</b></span></li>`).join('');
  return `<div class="ct-head"><h1>Who called it</h1><p class="ct-dek">Ranked by who called the winner first across ${fmtN(d.scoredRaces)} races called by two or more sources.</p></div><ol class="ct-board">${items}</ol>`;
}

// Fills the page's own containers; app.js replaces them on load.
const cache = new Map();
function render(html, p, races, calls) {
  const canon = canonical(p, races);
  html = html.replace(/(<link rel="canonical" href=")[^"]*/, `$1${ORIGIN}${canon || p}`);
  if (!canon) return { status: 404, html: html.replace('<meta name="robots" content="index,follow">', '<meta name="robots" content="noindex">') };
  const m = canon.match(/^\/race\/(\d+)$/);
  if (m) {
    const r = races.get(Number(m[1]));
    return { status: 200, html: html
      .replace('<section class="board" id="board" aria-label="Race board">', '<section class="board" id="board" aria-label="Race board" hidden>')
      .replace('<section class="detail" id="detail" hidden aria-live="polite"></section>', `<section class="detail" id="detail" aria-live="polite">${raceDetail(r)}</section>`) };
  }
  if (canon === '/calls' && calls) {
    return { status: 200, html: html
      .replace('<section class="board" id="board" aria-label="Race board">', '<section class="board" id="board" aria-label="Race board" hidden>')
      .replace('<section class="calls-view" id="calls" hidden aria-label="Who called it"></section>', `<section class="calls-view" id="calls" aria-label="Who called it">${callsBoard(calls)}</section>`) };
  }
  const cat = canon === '/' ? 'senate' : canon.startsWith('/board/') ? canon.slice(7) : null;
  if (cat) {
    const c = cache.get(cat);
    let rows = c && Date.now() - c.ts < 30000 ? c.rows : null;
    if (!rows) { rows = boardRows(cat, races); cache.set(cat, { ts: Date.now(), rows }); }
    html = html.replace('<tbody id="race-rows"></tbody>', `<tbody id="race-rows">${rows}</tbody>`);
  }
  return { status: 200, html };
}

module.exports = { sitemap, robots, render, canonical };
