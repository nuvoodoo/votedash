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
  // one unbroken party field behind the seats: oversized discs that merge across rows and neighbors
  const fr = ch === 'S' ? 23 : 11.5;
  const field = list.map((p, i) => `<circle class="fld" data-p="${p.party}" cx="${pts[i].x.toFixed(1)}" cy="${pts[i].y.toFixed(1)}" r="${fr}"/>`).join('');
  const dots = list.map((p, i) => {
    const c = fill(p); const hl = highlight && highlight === p.id;
    const dot = `<circle cx="${pts[i].x.toFixed(1)}" cy="${pts[i].y.toFixed(1)}" r="${hl ? r + 2 : r - 0.8}" class="${c}${hl ? ' hl' : ''}" data-id="${p.id}" data-p="${p.party}" data-n="${esc(title(p) + ' ' + p.name)}" data-s="${esc(PARTY[p.party] + ', ' + seatLabel(p))}"${hasPortrait(p) ? ' data-i="1"' : ''}${caucusAttr(p)}></circle>`;
    return linked ? `<a href="${href(p)}" tabindex="-1">${dot}</a>` : dot;
  }).join('');
  return `<svg class="seats s${ch}" viewBox="0 0 600 304" role="img" aria-label="${esc(label || (ch === 'S' ? 'Senate' : 'House') + ' seat chart')}"><g class="field">${field}</g>${dots}</svg>`;
}
const partyFill = p => 'f' + p.party;
// ideological caucus for shading and tooltips (caucuses.json, optional)
const CAUCUS_ORDER = ['freedom', 'rsc', 'mainstreet', 'progressive', 'newdem', 'bluedog', 'problemsolvers'];
function caucusOf(p) { const m = D.caucuses && D.caucuses.members[p.id]; if (!m) return null; return CAUCUS_ORDER.find(c => m.includes(c)) || null; }
function caucusAttr(p) {
  const m = D.caucuses && D.caucuses.members[p.id]; if (!m || !m.length) return '';
  const names = m.map(id => (D.caucuses.caucuses.find(c => c.id === id) || {}).name).filter(Boolean);
  const top = caucusOf(p);
  return `${top ? ` data-c="${top}"` : ''} data-cs="${m.join(' ')}" data-cn="${esc(names.join(', '))}"`;
}

// ---- layout ----
const NAV = [['/find', 'Your reps'], ['/members', 'Members'], ['/committees', 'Committees'], ['/leadership', 'Leaders'], ['/schedule', 'Schedule'], ['/tracker', 'Bills'], ['/votes', 'Votes'], ['/money', 'Money'], ['/incoming', 'Incoming'], ['/2026-post-mortem', '2026 results']];

// Icons: Lucide (ISC license), inline, stroke = currentColor
const ICONS = {
  dollar: '<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  check: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  x: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  scale: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  landmark: '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
  briefcase: '<rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
  swap: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  vote: '<path d="m9 12 2 2 4-4"/><path d="M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7Z"/><path d="M22 19H2"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>',
  file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>',
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
};
const icon = (n, cls = '') => ICONS[n] ? `<svg class="ic ${cls}" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[n]}</svg>` : '';
// stat-box labels get an icon by what they measure; good and bad outcomes are tinted
const DT_ICON = [[/lost|losing|failed|defeated/i, 'x', 'ic-bad'], [/won|went its way|re-elected|passed|winning side|winners/i, 'check', 'ic-good'], [/effectiveness|rank/i, 'trophy'], [/flipped/i, 'swap'],
  [/outside spending|super pac/i, 'megaphone'], [/lobbying/i, 'briefcase'], [/raised|spent|given|money|from pacs|donor|cash/i, 'dollar'], [/with (their )?party|party/i, 'users'],
  [/vote|roll call|missed/i, 'vote'], [/house|senate|seat|congress|members/i, 'landmark'], [/measure|ballot/i, 'flag'], [/bill/i, 'file'], [/speech/i, 'mic'], [/term|since|next up|age/i, 'calendar']];
const dtIcons = body => body.replace(/<dl class="facts[^"]*">[\s\S]*?<\/dl>/g, blk => blk.replace(/<dt>([^<]{2,80})<\/dt>/g, (m, t) => { const r = DT_ICON.find(([re]) => re.test(t)); return r ? `<dt>${icon(r[1], r[2] || '')}<span>${t}</span></dt>` : m; }));
function layout({ title: t, desc, path: p, body, active, jsonld, scripts = '', noindex, image }) {
  // off-site links open in a new tab
  body = body.replace(/<a ([^>]*?)href="(https?:\/\/(?!votedash\.net)[^"]+)"([^>]*)>/g, (m, pre, url, post) => {
    if (/target=/.test(pre + post)) return m;
    return `<a ${pre.replace(/\s*rel="[^"]*"/, '')}href="${url}"${post.replace(/\s*rel="[^"]*"/, '')} target="_blank" rel="noopener">`;
  });
  body = dtIcons(body);
  const url = SITE + (p || '/');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t ? t + ' | VoteDash' : 'VoteDash: every member of Congress, how they vote and who funds them')}</title>
<meta name="description" content="${esc(desc || 'Votes, money, elections, speeches and records for every member of the U.S. House and Senate, plus the members-elect of the 120th Congress.')}">
<link rel="canonical" href="${url}">${noindex ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:type" content="${jsonld && JSON.stringify(jsonld).includes('"ProfilePage"') ? 'profile' : 'website'}"><meta property="og:site_name" content="VoteDash"><meta property="og:title" content="${esc(t || 'VoteDash')}"><meta property="og:description" content="${esc(desc || 'Every member of Congress, how they vote and who funds them.')}"><meta property="og:url" content="${url}">
${image ? `<meta property="og:image" content="${image}"><meta name="twitter:image" content="${image}">` : ''}<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${esc(t || 'VoteDash')}"><meta name="twitter:description" content="${esc(desc || 'Every member of Congress, how they vote and who funds them.')}">
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

module.exports = { icon,  caucusOf, CAUCUS_ORDER, esc, money, pct, date, age, ord, PARTY, seatLabel, title, short, href, portrait, hasPortrait, chip, personLink, seatChart, partyFill, layout, SITE };
