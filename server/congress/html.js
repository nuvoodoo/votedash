'use strict';
const D = require('./data');
const fs = require('fs');
const path = require('path');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SITE = 'https://votedash.net';
const PARTY = { D: 'Democrat', R: 'Republican', I: 'Independent', L: 'Libertarian' };
const ord = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

function money(n, exact) {
  if (n == null) return '';
  const a = Math.abs(n), sign = n < 0 ? '-' : '';
  if (exact) return sign + '$' + Math.round(a).toLocaleString('en-US');
  if (a >= 1e9) return sign + '$' + (a / 1e9).toFixed(1) + 'B';
  if (a >= 1e6) return sign + '$' + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
  if (a >= 1e3) return sign + '$' + Math.round(a / 1e3) + 'K';
  return sign + '$' + Math.round(a);
}
const pct = (x, d = 0) => x == null ? '' : (x * 100).toFixed(d) + '%';
const date = (iso, opts = { month: 'short', day: 'numeric', year: 'numeric' }) => iso ? new Date(iso + (iso.length === 10 ? 'T12:00:00Z' : '')).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts }) : '';
const age = b => { if (!b) return null; const d = new Date(b), n = new Date(); let a = n.getUTCFullYear() - d.getUTCFullYear(); if (n < new Date(Date.UTC(n.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))) a--; return a; };

function seatLabel(p) {
  const st = D.STATES[p.state] || p.state;
  if (p.chamber === 'S') return `${st}`;
  if (p.delegate) return `${st}`;
  return p.district === 0 ? `${st} at-large` : `${st} ${ord(p.district)}`;
}
function title(p) {
  if (p.status === 'elect') return p.chamber === 'S' ? 'Sen.-elect' : 'Rep.-elect';
  return p.chamber === 'S' ? 'Sen.' : p.delegate ? 'Del.' : 'Rep.';
}
const short = p => `${p.party}-${p.state}${p.chamber === 'H' ? '-' + (p.district === 0 ? 'AL' : p.district) : ''}`;
const href = p => `/m/${p.slug}`;
const hasPortrait = p => p.status !== 'elect' && fs.existsSync(path.join(__dirname, '../../public/portraits/s', p.id + '.webp'));
const portrait = (p, size = 's', cls = '') => hasPortrait(p) ? `<img class="pt ${cls}" src="/portraits/${size}/${p.id}.webp" alt="${esc(p.name)}" width="${size === 's' ? 120 : 360}" height="${size === 's' ? 147 : 440}" loading="lazy">` : '';
const chip = p => `<span class="pc p${p.party}" title="${PARTY[p.party] || p.party}">${p.party}</span>`;

function personLink(p, extra = '') {
  return `<a class="who" href="${href(p)}">${portrait(p)}<span><b>${esc(title(p))} ${esc(p.name)}</b><small>${chip(p)} ${esc(seatLabel(p))}${extra}</small></span></a>`;
}

// ---- seat chart ----
function seatPositions(n, ch) {
  const rows = ch === 'S' ? 5 : 11, r0 = ch === 'S' ? 140 : 92, r1 = 288;
  const radii = []; for (let i = 0; i < rows; i++) radii.push(r0 + (r1 - r0) * i / (rows - 1));
  const tot = radii.reduce((a, b) => a + b, 0); let left = n; const pts = [];
  radii.forEach((r, i) => {
    const k = i === rows - 1 ? left : Math.round(n * r / tot); left -= k;
    for (let j = 0; j < k; j++) { const a = Math.PI - Math.PI * (j + 0.5) / k; pts.push({ a, x: 300 + r * Math.cos(a), y: 296 - r * Math.sin(a) }); }
  });
  return pts.sort((p, q) => q.a - p.a);
}
const posCache = {};
// fill(p) -> class name; returns <svg>
function seatChart(ch, fill, { highlight, label, linked = true } = {}) {
  const list = D.chambers[ch];
  const pts = posCache[ch + list.length] ||= seatPositions(list.length, ch);
  const r = ch === 'S' ? 10.5 : 7.4;
  const dots = list.map((p, i) => {
    const c = fill(p); const hl = highlight && highlight === p.id;
    const sq = r * 2 + 1.4, cx = pts[i].x, cy = pts[i].y;
    const dot = `<rect class="sq" data-p="${p.party}" x="${(cx - sq / 2).toFixed(1)}" y="${(cy - sq / 2).toFixed(1)}" width="${sq.toFixed(1)}" height="${sq.toFixed(1)}" rx="1.5"/><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${hl ? r + 2 : r - 1.6}" class="${c}${hl ? ' hl' : ''}" data-id="${p.id}" data-p="${p.party}" data-n="${esc(title(p) + ' ' + p.name)}" data-s="${esc(PARTY[p.party] + ', ' + seatLabel(p))}"${hasPortrait(p) ? ' data-i="1"' : ''}${caucusAttr(p)}></circle>`;
    return linked ? `<a href="${href(p)}" tabindex="-1">${dot}</a>` : dot;
  }).join('');
  return `<svg class="seats s${ch}" viewBox="0 0 600 304" role="img" aria-label="${esc(label || (ch === 'S' ? 'Senate' : 'House') + ' seat chart')}">${dots}</svg>`;
}
const partyFill = p => 'f' + p.party;
// ideological caucus for shading and tooltips (caucuses.json, optional)
const CAUCUS_ORDER = ['freedom', 'rsc', 'mainstreet', 'progressive', 'newdem', 'bluedog', 'problemsolvers'];
function caucusOf(p) { const m = D.caucuses && D.caucuses.members[p.id]; if (!m) return null; return CAUCUS_ORDER.find(c => m.includes(c)) || null; }
function caucusAttr(p) {
  const m = D.caucuses && D.caucuses.members[p.id]; if (!m || !m.length) return '';
  const names = m.map(id => (D.caucuses.caucuses.find(c => c.id === id) || {}).name).filter(Boolean);
  const top = caucusOf(p);
  return `${top ? ` data-c="${top}"` : ''} data-cn="${esc(names.join(', '))}"`;
}

// ---- layout ----
const NAV = [['/find', 'Your reps'], ['/members', 'Members'], ['/committees', 'Committees'], ['/leadership', 'Leaders'], ['/schedule', 'Schedule'], ['/tracker', 'Bills'], ['/votes', 'Votes'], ['/money', 'Money'], ['/incoming', 'Incoming']];
function layout({ title: t, desc, path: p, body, active, jsonld, scripts = '', noindex }) {
  const url = SITE + (p || '/');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t ? t + ' | VoteDash' : 'VoteDash: every member of Congress, how they vote and who funds them')}</title>
<meta name="description" content="${esc(desc || 'Votes, money, elections, speeches and records for every member of the U.S. House and Senate, plus the members-elect of the 120th Congress.')}">
<link rel="canonical" href="${url}">${noindex ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:type" content="website"><meta property="og:site_name" content="VoteDash"><meta property="og:title" content="${esc(t || 'VoteDash')}"><meta property="og:description" content="${esc(desc || 'Every member of Congress, how they vote and who funds them.')}"><meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#17232C">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500;6..72,600;6..72,700&family=Public+Sans:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/c/site.css?v=${vOf('site.css')}">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
</head><body>
<a class="skip" href="#main">Skip to content</a>
<header class="mast"><div class="wrap mast-in">
  <a class="logo" href="/" aria-label="VoteDash home">Vote<span>Dash</span></a>
  <nav class="nav" aria-label="Sections">${NAV.map(([h, l]) => `<a href="${h}"${active === h ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
  <form class="qs" action="/search" role="search"><label for="qs" class="vh">Search Congress</label><input id="qs" name="q" type="search" placeholder="Name, ZIP or bill" autocomplete="off" data-suggest><button type="submit">Search</button></form>
</div></header>
<main id="main">${body}</main>
<footer class="foot"><div class="wrap foot-in">
  <div><a class="logo" href="/">Vote<span>Dash</span></a><p>Every member of the 119th Congress and the members-elect of the 120th: how they vote, who funds them and what is on their record.</p></div>
  <div><h2>Sources</h2><p>Members and committees: congress-legislators project. Votes and voting scores: Voteview, UCLA. Campaign finance: Federal Election Commission. Bills: Congress.gov. Speeches: Congressional Record via GovInfo. Lobbying: LDA.gov. Election results: MIT Election Data and Science Lab and civicAPI. Portraits: Government Publishing Office.</p></div>
  <div><h2>Elsewhere</h2><p><a href="/2026/">2026 midterm results</a><br><a href="/about">How VoteDash works</a></p></div>
</div><div class="wrap fine">Data updated ${date(D.meta.built.slice(0, 10))}.</div></footer>
<script src="/c/site.js?v=${vOf('site.js')}" defer></script>${scripts}
</body></html>`;
}
const PUBC = path.join(__dirname, '../../public/c');
const vOf = f => { try { return fs.statSync(path.join(PUBC, f)).mtimeMs.toString(36).replace('.', ''); } catch { return '1'; } };

module.exports = { caucusOf, CAUCUS_ORDER, esc, money, pct, date, age, ord, PARTY, seatLabel, title, short, href, portrait, hasPortrait, chip, personLink, seatChart, partyFill, layout, SITE };
