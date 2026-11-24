'use strict';
// "How Congress Works": a hub, then drill-down pages. Bill map and its eight steps, opening day in each chamber,
// one page per office and one per rule or term. Copy lives in civics-data.js; every number is computed here from the site's data.
const fs = require('fs');
const path = require('path');
const D = require('./data');
const H = require('./html');
const { esc, date, layout, personLink } = H;
const BM = require('./billmap');
const BV = require('./billviz');
const { SRC, IMG, STEPS, TERMS, OFFICES } = require('./civics-data');

const BASE = '/how-congress-works';
const NAV = [['', 'Overview'], ['bills', 'How a bill becomes law'], ['new-congress', 'A new Congress'], ['officers', 'Officers and officials'], ['rules', 'Rules and terms']];
const num = BM.num;
const PUBC = path.join(__dirname, '../../public/c');
const ver = f => { try { return fs.statSync(path.join(PUBC, f)).mtimeMs.toString(36).replace('.', ''); } catch { return '1'; } };
const ALL_TERMS = TERMS.flatMap(g => g.list.map(t => ({ ...t, g })));
const ALL_OFFICES = OFFICES.flatMap(g => g.list.map(o => ({ ...o, g })));
const term = id => ALL_TERMS.find(t => t.id === id), office = id => ALL_OFFICES.find(o => o.id === id), step = id => STEPS.find(s => s.id === id);
const url = { term: id => `${BASE}/rules/${id}`, office: id => `${BASE}/officers/${id}`, step: id => `${BASE}/bills/${id}` };

// ---------- icons (Lucide, ISC license) ----------
const IC = {
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  gavel: '<path d="m14.5 12.5-8 8a2.119 2.119 0 1 1-3-3l8-8"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/><path d="m21 11-8-8"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  chev: '<path d="m9 18 6-6-6-6"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  speech: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  list: '<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>',
  merge: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
  hash: '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>'
};
const ic = n => (IC[n] ? `<svg class="ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${IC[n]}</svg>` : H.icon(n));

// ---------- photographs ----------
let DIMS = null;
const dims = () => DIMS || (DIMS = (() => { try { return JSON.parse(fs.readFileSync(path.join(PUBC, 'hcw/dims.json'), 'utf8')); } catch { return {}; } })());
const hasImg = id => !!(id && IMG[id] && dims()[id]);
const fig = (id, cls = '') => (hasImg(id) ? `<figure class="hw-fig ${cls}"><img src="/c/hcw/${id}.webp" alt="${esc(IMG[id].alt)}" width="${dims()[id][0]}" height="${dims()[id][1]}" loading="lazy"><figcaption>${esc(IMG[id].cap)} <span>${esc(IMG[id].by)}</span></figcaption></figure>` : '');
const thumb = id => (hasImg(id) ? `<img class="hw-thumb" src="/c/hcw/${id}-s.webp" alt="" loading="lazy">` : '');

// ---------- shared page furniture ----------
const INDEX = () => [
  ...NAV.slice(1).map(([k, l]) => [l, 'Guide', `${BASE}/${k}`, '']),
  ['Opening day in the House', 'Guide', `${BASE}/new-congress/house`, 'Quorum call, election of the Speaker, oath, officers, rules'],
  ['Opening day in the Senate', 'Guide', `${BASE}/new-congress/senate`, 'Oath, quorum, President pro tempore, committees'],
  ...STEPS.map((s, i) => [`Step ${i + 1}: ${s.name}`, 'Bill step', url.step(s.id), s.short]),
  ...ALL_TERMS.map(t => [t.name, 'Term', url.term(t.id), t.short]),
  ...ALL_OFFICES.map(o => [o.name, 'Office', url.office(o.id), o.who ? `${o.who}. ${o.short}` : o.short])
];
const searchBox = (id, big) => `<form class="hw-search${big ? ' big' : ''}" role="search" action="/search"><label class="vh" for="${id}">Search how Congress works</label>${ic('search')}<input id="${id}" name="q" type="search" placeholder="${big ? 'Search terms, offices and steps: cloture, Parliamentarian, veto' : 'Find a term or office'}" autocomplete="off"><ul class="sugg hw-res" hidden></ul></form>`;
const subnav = cur => `<nav class="subnav hw-sub" aria-label="How Congress works"><div class="wrap">${NAV.map(([k, l]) => `<a href="${k ? `${BASE}/${k}` : BASE}"${k === cur ? ' aria-current="page"' : ''}>${l}</a>`).join('')}${cur ? searchBox('hwq') : ''}</div></nav>`;
const crumb = trail => `<p class="crumb hw-crumb">${[[BASE, 'How Congress works'], ...trail].map(([h, l]) => `<a href="${h}">${esc(l)}</a>`).join(ic('chev'))}</p>`;
const page = ({ cur, title, desc, p, body, scripts = '', image }) => layout({ title, desc, path: p, active: BASE, image,
  body: `${subnav(cur)}${body}<script type="application/json" id="hw-index">${JSON.stringify(INDEX()).replace(/</g, '\\u003c')}</script>`,
  scripts: `<script src="/c/hcw.js?v=${ver('hcw.js')}" defer></script>${scripts}` });
const pager = (list, i, href, label) => `<nav class="hw-pager" aria-label="More">${i > 0 ? `<a href="${href(list[i - 1])}"><small>Previous</small><b>${esc(label(list[i - 1]))}</b></a>` : '<span></span>'}${i < list.length - 1 ? `<a class="nx" href="${href(list[i + 1])}"><small>Next</small><b>${esc(label(list[i + 1]))}</b></a>` : ''}</nav>`;
const sources = keys => { const l = (keys || []).filter(k => SRC[k]); return l.length ? `<section class="hw-src"><h2>Sources</h2><ul>${l.map(k => `<li><a href="${SRC[k][1]}">${esc(SRC[k][0])}</a></li>`).join('')}</ul></section>` : ''; };
// a link tile: icon or thumbnail, name, one line
const tile = (href, o, extra = '') => `<a class="hw-tile" href="${href}"><span class="hw-ti">${ic(o.ic)}</span><span class="hw-tt"><b>${esc(o.name)}</b><small>${esc(o.short)}</small>${extra}</span>${ic('chev')}</a>`;
const related = (t, { skipTerms } = {}) => {
  const a = (t.related || t.terms || []).map(term).filter(Boolean), s = (t.steps || []).map(step).filter(Boolean), o = (t.offices || []).map(office).filter(Boolean);
  if (!a.length && !s.length && !o.length) return '';
  return `<section class="hw-rel"><h2>Related</h2><div class="hw-tiles">${skipTerms ? '' : a.map(x => tile(url.term(x.id), x)).join('')}${s.map(x => tile(url.step(x.id), { ...x, name: `Step ${STEPS.indexOf(x) + 1}: ${x.name}` })).join('')}${o.map(x => tile(url.office(x.id), x)).join('')}</div></section>`;
};

// ---------- this Congress's own record ----------
const RES = /^(hres|sres|hconres|sconres)\d/;
const allBills = () => (D.bills ? D.bills.bills : {});
const rolls = () => D.allRolls || [];
const firstDay = () => { const b = allBills().hres1 || allBills().sres1; return b ? b.introduced : null; };
function res(re, { day = false, type } = {}) {
  const d0 = firstDay();
  return Object.entries(allBills()).filter(([k, b]) => RES.test(k) && (!type || k.startsWith(type)) && /^passed/.test(b.stage) && re.test(b.title) && (!day || b.introduced === d0))
    .sort((a, b) => a[1].number - b[1].number).map(([k]) => k);
}
const blink = k => `<a href="/bill/${k}">${BV.label(k)}</a>`;
const join = a => (a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : a.join(''));
const rlink = (r, text) => `<a href="/vote/${r.k}">${esc(text)}</a>`;
const tally = r => (r.yea || r.nay ? ` ${r.yea} to ${r.nay}` : '');
const count = (re, ch) => rolls().filter(r => (!ch || r.chamber === ch) && re.test(r.question));
const inCongress = 'In the 119th Congress';
const live = html => (html ? `<p class="hw-live">${html}${/[.]$/.test(html) ? '' : '.'}</p>` : '');

// ---------- graphics ----------
// seats needed, drawn on the chamber's full membership
function seats(ch, n, label) {
  const tot = ch === 'S' ? 100 : 435, cols = ch === 'S' ? 20 : 29, rows = Math.ceil(tot / cols), c = 10, d = 7;
  const run = (a, b) => { let p = ''; for (let r = Math.floor(a / cols); r <= Math.floor((b - 1) / cols); r++) { const c0 = r === Math.floor(a / cols) ? a % cols : 0, c1 = r === Math.floor((b - 1) / cols) ? (b - 1) % cols + 1 : cols; p += `M${c0 * c},${r * c + d / 2}h${(c1 - c0) * c - (c - d)}`; } return p; };
  return `<figure class="hw-seats ${ch === 'S' ? 's' : 'h'}"><svg viewBox="0 0 ${cols * c - (c - d)} ${rows * c - (c - d)}" role="img" aria-label="${n} of ${tot} ${ch === 'S' ? 'senators' : 'House members'}"><path class="on" d="${run(0, n)}"/>${n < tot ? `<path class="off" d="${run(n, tot)}"/>` : ''}</svg><figcaption><b>${num(n)}</b> <span>of ${num(tot)} ${ch === 'S' ? 'senators' : 'representatives'}</span><em>${esc(label)}</em></figcaption></figure>`;
}
const flow = l => `<ol class="hw-flow">${l.map(([t, s]) => `<li><b>${esc(t)}</b>${s ? `<span>${esc(s)}</span>` : ''}</li>`).join('')}</ol>`;
// a split of a count into parts: [label, n, class]
const stack = (title, parts) => { const p = parts.filter(x => x[1] > 0), tot = p.reduce((a, x) => a + x[1], 0); return tot ? `<div class="hw-chart"><h3>${esc(title)}</h3><div class="hw-stack" role="img" aria-label="${esc(p.map(x => `${x[0]}: ${x[1]}`).join(', '))}">${p.map(x => `<i class="${x[2]}" style="flex:${x[1]}"></i>`).join('')}</div><ul class="hw-key">${p.map(x => `<li><i class="${x[2]}"></i><b>${num(x[1])}</b> ${esc(x[0])}</li>`).join('')}</ul></div>` : ''; };
// one roll call as yeas against nays, split by party
function voteBar(r, label) {
  const t = r.tally || {}, seg = (side) => ['R', 'D', 'I'].map(p => (t[p] && t[p][side] ? `<i class="f${p}" style="flex:${t[p][side]}" title="${t[p][side]} ${H.PARTY[p]}"></i>` : '')).join('');
  if (!(r.yea || r.nay)) return '';
  return `<a class="hw-vote" href="/vote/${r.k}"><span class="hw-vq">${esc(label || r.question.replace(/^On /, ''))}<em>${esc(r.result)}</em></span><span class="hw-vb"><span style="flex:${r.yea}">${seg('Y')}</span><span class="no" style="flex:${r.nay}">${seg('N')}</span></span><span class="hw-vn"><b>${r.yea}</b> yes<b>${r.nay}</b> no</span></a>`;
}

// what each term's record looks like this Congress: sentence and, where it splits cleanly, a chart
const T = () => { const B = BM.build(); return B ? B.T : null; };
const LIVE = {
  calendars: () => { const B = BM.build(); return B ? `<a href="${BM.listHref('h-reported')}">${num(B.n('h-reported'))} House bills</a> and <a href="${BM.listHref('s-reported')}">${num(B.n('s-reported'))} Senate bills</a> are waiting for a floor vote.` : ''; },
  'previous-question': () => { const a = count(/^On Ordering the Previous Question/, 'H'); return a.length ? `The House has held ${num(a.length)} roll calls on ordering the previous question.` : ''; },
  suspension: () => (T() && T().hSusp ? `${num(T().hSusp)} of the ${num(T().hPassed)} House bills that passed the House went through under suspension.` : ''),
  'discharge-petition': () => { const a = count(/^On Motion to Discharge/, 'H').sort((x, y) => y.date.localeCompare(x.date)); return a.length ? `The House has voted ${num(a.length)} times on a motion to discharge, most recently ${rlink(a[0], date(a[0].date))}.` : ''; },
  'motion-to-recommit': () => { const a = count(/^On Motion to Recommit/, 'H'), f = a.filter(r => /Failed/i.test(r.result)).length; return a.length ? `${num(a.length)} roll calls on a motion to recommit; ${num(f)} failed.` : ''; },
  'unanimous-consent': () => (T() && T().sQuiet ? `${num(T().sQuiet)} of the ${num(T().sPassed)} Senate bills that passed the Senate did so without a roll call.` : ''),
  filibuster: () => { const B = BM.build(), n = B ? B.n('s-blocked') + B.n('hs-blocked') : 0; return n ? `${num(n)} bills are stopped after a failed cloture vote: ${[['s-blocked', 'Senate bills'], ['hs-blocked', 'House-passed bills']].filter(([id]) => B.n(id)).map(([id, l]) => `<a href="${BM.listHref(id)}">${num(B.n(id))} ${l}</a>`).join(' and ')}.` : ''; },
  cloture: () => { const a = count(/Cloture/, 'S'); return a.length ? `${num(a.length)} cloture votes so far. <a href="/votes?kind=procedural">Procedural votes</a>.` : ''; },
  'nuclear-option': () => { const a = count(/^On the Decision of the Chair/, 'S').sort((x, y) => x.date.localeCompare(y.date)); return a.length ? `The Senate has voted ${num(a.length)} times on whether a ruling of the chair should stand: ${a.map(r => `${rlink(r, date(r.date))} (${esc(r.result.replace(/^Decision of Chair /, '').toLowerCase())})`).join(', ')}.` : ''; },
  'motion-to-proceed': () => { const a = count(/^On the Motion to Proceed/, 'S'), c = count(/^On Cloture on the Motion to Proceed/, 'S'); return a.length ? `${num(a.length)} roll calls on a motion to proceed${c.length ? `, and ${num(c.length)} cloture votes on one` : ''}.` : ''; },
  'executive-session': () => { const a = count(/^On the Nomination/, 'S'); return a.length ? `${num(a.length)} roll calls on confirming a nominee. <a href="/votes?kind=nomination">Nomination votes</a>.` : ''; },
  reconciliation: () => { const e = Object.entries(allBills()).filter(([, b]) => b.law && /reconciliation pursuant to/i.test(b.title)); return e.length ? e.map(([k, b]) => `<a href="/bill/${k}">${BV.label(k)}${b.short ? ', the ' + esc(b.short) : ''}</a>${b.lawNumber ? `, ${esc(b.lawNumber)}` : ''}`).join('; ') + '.' : ''; },
  'congressional-review-act': () => { const e = cra(); return e.length ? `${num(e.length)} disapproval resolutions introduced; ${num(e.filter(([, b]) => b.law).length)} became law.` : ''; },
  'conference-committee': () => { const B = BM.build(); return B && B.n('diff') ? `<a href="${BM.listHref('diff')}">${num(B.n('diff'))} bills</a> have passed both chambers and are not yet settled.` : ''; },
  veto: () => { const B = BM.build(); return B && B.n('vetoed') ? `<a href="${BM.listHref('vetoed')}">${num(B.n('vetoed'))} vetoes</a>, none overridden.` : ''; },
  resolutions: () => { const c = resCount(); return c.j ? `${num(c.j)} joint, ${num(c.c)} concurrent and ${num(c.s)} simple resolutions introduced. <a href="/tracker?kind=resolutions">Where the resolutions stand</a>.` : ''; },
  quorum: () => { const a = D.quorums || []; return a.length ? `House quorum calls: ${a.map(r => rlink(r, date(r.date))).join(', ')}.` : ''; }
};
const cra = () => Object.entries(allBills()).filter(([k, b]) => /^[hs]jres/.test(k) && /congressional disapproval under chapter 8 of title 5/i.test(b.title));
const resCount = () => { const c = {}; for (const k of Object.keys(allBills())) { const t = k.replace(/\d+$/, ''); c[t] = (c[t] || 0) + 1; } return { j: (c.hjres || 0) + (c.sjres || 0), c: (c.hconres || 0) + (c.sconres || 0), s: (c.hres || 0) + (c.sres || 0) }; };
const CHART = {
  suspension: () => (T() ? stack('How House bills passed the House', [['under suspension of the rules', T().hSusp, 'a'], ['another way', T().hPassed - T().hSusp, 'b']]) : ''),
  'unanimous-consent': () => (T() ? stack('How Senate bills passed the Senate', [['without a roll call', T().sQuiet, 'a'], ['by roll call', T().sPassed - T().sQuiet, 'b']]) : ''),
  cloture: () => { const a = count(/Cloture/, 'S'), ok = a.filter(r => /Agreed to/i.test(r.result)).length; return stack('Cloture votes', [['agreed to', ok, 'yes'], ['rejected', a.length - ok, 'no']]); },
  'motion-to-recommit': () => { const a = count(/^On Motion to Recommit/, 'H'), f = a.filter(r => /Failed/i.test(r.result)).length; return stack('Motions to recommit', [['failed', f, 'no'], ['passed', a.length - f, 'yes']]); },
  'nuclear-option': () => { const a = count(/^On the Decision of the Chair/, 'S'), n = a.filter(r => /Not Sustained/i.test(r.result)).length; return stack('Rulings of the chair put to a vote', [['upheld', a.length - n, 'a'], ['overturned', n, 'no']]); },
  'congressional-review-act': () => { const e = cra(), l = e.filter(([, b]) => b.law).length; return stack('Disapproval resolutions', [['became law', l, 'yes'], ['have not', e.length - l, 'b']]); },
  resolutions: () => { const c = resCount(); return stack('Resolutions introduced', [['simple', c.s, 'a'], ['joint', c.j, 'yes'], ['concurrent', c.c, 'b']]); },
  veto: () => count(/Objections of the President/).map(r => voteBar(r, `Override vote, ${date(r.date)}`)).join(''),
  'discharge-petition': () => count(/^On Motion to Discharge/, 'H').sort((x, y) => y.date.localeCompare(x.date)).slice(0, 3).map(r => voteBar(r, `Motion to discharge, ${date(r.date)}`)).join('')
};

// ---------------- overview ----------------
function hub() {
  const B = BM.build(), t = B && B.T;
  const bars = t ? [['Introduced', t.all], ['Past committee', t.hOut + t.sOut], ['Passed one chamber', t.hPassed + t.sPassed], ['Passed both', t.both], ['Became law', t.law]] : [];
  const rows = l => `<ul class="hw-links">${l.map(([h, n, s]) => `<li><a href="${h}"><b>${esc(n)}</b>${s ? `<small>${esc(s)}</small>` : ''}${ic('chev')}</a></li>`).join('')}</ul>`;
  const topic = (k, img, h, blurb, links, all) => `<section class="hw-topic"><a class="hw-topic-img" href="${BASE}/${k}" tabindex="-1" aria-hidden="true">${thumb(img)}</a><div><h2><a href="${BASE}/${k}">${h}</a></h2><p class="sub">${blurb}</p>${rows(links)}<p class="hw-all"><a href="${BASE}/${k}">${all}${ic('arrow')}</a></p></div></section>`;
  const pop = ['cloture', 'filibuster', 'discharge-petition', 'veto', 'reconciliation'].map(term).filter(Boolean);
  const body = `<div class="hw-hero"><div class="wrap hw-hero-in"><div><h1>How Congress works</h1>
    <p class="lede">How a bill moves, how each chamber organizes itself, who runs the place and what the procedure means, shown with this Congress\u2019s own bills and votes.</p>
    ${searchBox('hwq', true)}
    <p class="hw-pop"><span>Often looked up</span>${pop.map(x => `<a href="${url.term(x.id)}">${esc(x.name)}</a>`).join('')}<a href="${url.office('senate-parliamentarian')}">Senate Parliamentarian</a><a href="${BASE}/new-congress/house">Electing the Speaker</a></p></div>
    ${fig('capitol', 'hero')}</div></div>
  <div class="wrap hw-topics">
  ${t ? `<section class="hw-topic wide"><div><h2><a href="${BASE}/bills">How a bill becomes law</a></h2><p class="sub">All ${num(t.all)} bills of this Congress on one map, and the eight steps between an idea and a law.</p>
    <ul class="hw-funnel">${bars.map(([l, n]) => `<li><span>${l}</span><i style="width:${Math.max(0.6, n / t.all * 100).toFixed(2)}%"></i><b>${num(n)}</b></li>`).join('')}</ul>
    <p class="hw-all"><a class="btn" href="${BASE}/bills">Open the bill map</a></p></div>
    <div>${rail('')}</div></section>` : ''}
  ${topic('new-congress', 'house', 'How a new Congress organizes', 'Every two years the House starts from nothing. The Senate carries on.', [[`${BASE}/new-congress/house`, 'Opening day in the House', 'Quorum, Speaker, oath, officers, rules'], [`${BASE}/new-congress/senate`, 'Opening day in the Senate', 'Oath, quorum, officers, committees'], [`${BASE}/new-congress#before`, 'Before opening day', 'Leadership elections and the lame duck']], 'The whole timeline')}
  ${topic('officers', 'parliamentarian', 'Officers and officials', 'The people who run both chambers without casting a vote.', ['speaker', 'senate-parliamentarian', 'clerk', 'president-pro-tempore'].map(office).map(o => [url.office(o.id), o.name, o.short]), `All ${ALL_OFFICES.length} posts`)}
  ${topic('rules', 'senate', 'Rules and terms', 'The procedures that decide whether a bill ever gets a vote.', TERMS.map(g => [`${BASE}/rules#${g.id}`, g.group, `${g.list.length} terms`]), `All ${ALL_TERMS.length} terms`)}
  </div>`;
  return page({ cur: '', title: 'How Congress works', desc: 'How a bill becomes law, how the House and Senate organize a new Congress, who the officers are and what the procedural terms mean, shown with the bills and votes of the 119th Congress.', p: BASE, body, image: hasImg('capitol') ? `${H.SITE}/c/hcw/capitol.webp` : undefined });
}

// ---------------- how a bill becomes law ----------------
const here = (B, s) => s.st.reduce((a, [id]) => a + B.n(id), 0);
// the eight steps as a rail; cur: the step being read
function rail(cur) {
  const B = BM.build(); if (!B) return '';
  return `<ol class="hw-rail">${STEPS.map((s, i) => `<li${s.id === cur ? ' aria-current="step"' : ''}><a href="${url.step(s.id)}"><span class="hw-rn">${i + 1}</span><span class="hw-rt"><b>${esc(s.name)}</b><small>${num(here(B, s))} here now</small></span></a></li>`).join('')}</ol>`;
}
function bills() {
  const B = BM.build(); if (!B) return null;
  const t = B.T, cnt = { D: 0, R: 0, I: 0 };
  for (const y of B.yards) { cnt.D += y.p[0]; cnt.R += y.p[1]; cnt.I += y.p[2]; }
  const body = `<div class="wrap">${crumb([])}<h1>How a bill becomes law</h1>
  <p class="lede">Eight steps stand between an idea and a law. Of the ${num(t.all)} bills and joint resolutions introduced in the 119th Congress, ${num(t.law)} have made it through.</p>
  <h2 class="hw-h">The eight steps</h2>
  <div class="hw-tiles steps">${STEPS.map((s, i) => `<a class="hw-tile step" href="${url.step(s.id)}">${thumb(s.img) || `<span class="hw-ti">${ic(s.ic)}</span>`}<span class="hw-tt"><em>Step ${i + 1}</em><b>${esc(s.name)}</b><small>${esc(s.short)}</small><span class="hw-badge">${num(here(B, s))} here now</span></span></a>`).join('')}</div>
  <h2 class="hw-h" id="map">The map: every bill, where it stands today</h2>
  <p class="sub">Each square is one bill. Point at a square to see which, select a station to list its bills, or find one by number.</p>
  <div class="bm-tools">
    <form class="bm-find" action="/search" role="search"><label for="bmq">Find a bill on the map</label><input id="bmq" name="q" type="search" placeholder="H.R. 1, or words from the title" autocomplete="off"><ul class="sugg bm-res" hidden></ul></form>
    <div class="bm-area"><label for="bma">Highlight an issue</label><select id="bma"><option value="">All issues</option>${B.areas.map((a, i) => `<option value="${i + 1}">${esc(a)}</option>`).join('')}</select></div>
    <p class="bm-key">${[['D', 'Democratic sponsor'], ['R', 'Republican sponsor'], ['I', 'Independent sponsor']].filter(([k]) => cnt[k]).map(([k, l]) => `<span><i class="${k}"></i>${l}</span>`).join('')}</p>
  </div>
  <p class="bm-status" role="status" hidden></p>
  <div class="bm-wrap" data-v="${esc(D.bills.built || '')}">${B.svg}<div class="bm-tip" hidden></div></div>
  <p class="sub">Resolutions that only express an opinion or set a chamber\u2019s own rules never go to the President. <a href="/tracker?kind=resolutions">Where this Congress\u2019s resolutions stand</a>.</p></div>`;
  return page({ cur: 'bills', title: 'How a bill becomes law', desc: `Every bill of the 119th Congress on one map: ${num(t.all)} introduced, ${num(t.hPassed)} passed the House, ${num(t.sPassed)} passed the Senate, ${num(t.law)} became law.`, p: `${BASE}/bills`, body, scripts: `<script src="/c/billmap.js?v=${ver('billmap.js')}" defer></script>` });
}
function billStep(id) {
  const s = step(id), B = BM.build(); if (!s || !B) return null;
  const i = STEPS.indexOf(s), t = B.T, st = s.st.filter(([sid]) => B.n(sid)), max = Math.max(1, ...st.map(([sid]) => B.n(sid)));
  const keys = st.flatMap(([sid]) => BM.keysAt(sid)).map(k => [k, allBills()[k]]).sort((a, b) => (b[1].stageDate || '').localeCompare(a[1].stageDate || '')).slice(0, 6);
  const body = `<div class="wrap">${crumb([[`${BASE}/bills`, 'How a bill becomes law']])}
  <p class="hw-kick">Step ${i + 1} of ${STEPS.length}</p><h1>${esc(s.name)}</h1><p class="lede">${esc(s.short)}</p>
  ${rail(s.id)}
  <div class="hw-split"><div>
    <p class="hw-body">${esc(s.text)}</p>
    ${st.length ? `<h2>Where this Congress\u2019s bills are at this step</h2><ul class="hw-bars">${st.map(([sid, l]) => `<li><a href="${BM.listHref(sid)}"><span>${esc(l[0].toUpperCase() + l.slice(1))}</span><i class="${BM.ST[sid].kill ? 'no' : BM.ST[sid].law ? 'law' : ''}" style="width:${Math.max(0.8, B.n(sid) / max * 100).toFixed(1)}%"></i><b>${num(B.n(sid))}</b></a></li>`).join('')}</ul><p class="sub"><a href="${BASE}/bills?bill=${keys.length ? keys[0][0] : ''}#map">See these on the map</a></p>` : ''}
  </div>${fig(s.img) || (s.totals || []).length ? `<aside>${fig(s.img)}${(s.totals || []).length ? `<dl class="facts sm">${s.totals.map(([k, l]) => `<div><dt>${esc(l[0].toUpperCase() + l.slice(1))}</dt><dd>${num(t[k])}</dd></div>`).join('')}</dl>` : ''}</aside>` : ''}</div>
  ${keys.length ? `<h2>Latest to arrive here</h2><ul class="blist">${keys.map(([k, b]) => `<li><a href="/bill/${k}"><span class="bl">${BV.label(k)}${b.stageDate ? ` &nbsp;${date(b.stageDate)}` : ''}</span><b>${esc(b.short || b.title)}</b></a></li>`).join('')}</ul>` : ''}
  ${related({ terms: s.terms, offices: s.offices })}
  ${sources(s.src)}
  ${pager(STEPS, i, x => url.step(x.id), x => `Step ${STEPS.indexOf(x) + 1}: ${x.name}`)}</div>`;
  return page({ cur: 'bills', title: `${s.name}: how a bill becomes law, step ${i + 1}`, desc: `${s.short} ${num(here(B, s))} bills of the 119th Congress are at this step now.`, p: url.step(s.id), body });
}

// ---------------- a new Congress ----------------
function openingDay() {
  const d0 = firstDay(), dayR = rolls().filter(r => r.date === d0).sort((a, b) => (a.roll || 0) - (b.roll || 0));
  const q = (D.quorums || []).find(r => r.date === d0 && r.chamber === 'H');
  const spk = dayR.find(r => r.question === 'Election of the Speaker');
  const spkEl = D.leadership && D.leadership.elections.find(e => e.id === '119-house-speaker');
  const rules = res(/^Adopting the Rules of the House/, { day: true, type: 'hres' })[0];
  const rulesR = rules ? dayR.filter(r => (r.bill || '').toLowerCase() === rules) : [];
  const cmteH = res(/^Electing (a )?Members? to (a )?certain standing committees?/i, { type: 'hres' });
  const cmteS = res(/to constitute the (majority|minority) party's membership on certain committees/i, { type: 'sres' });
  const when = d0 ? date(d0, { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  const ppt = res(/elect.*President pro tempore/i, { day: true, type: 'sres' }), offs = res(/electing .* as (Secretary|Sergeant)/i, { day: true, type: 'sres' });
  const spkBars = spkEl && spkEl.result ? `<div class="hw-chart"><h3>The vote for Speaker, ${when}</h3><ul class="hw-bars plain">${spkEl.result.map(c => { const p = D.who(c.person); return `<li><span><span>${esc(c.name)}</span><i class="f${p ? p.party : ''}" style="width:${(c.votes / spkEl.result[0].votes * 100).toFixed(1)}%"></i><b>${c.votes}</b></span></li>`; }).join('')}</ul></div>` : '';
  const house = [
    ['The Clerk calls the House to order', 'gavel', 'At noon the Clerk of the outgoing House takes the chair. There is no Speaker and no member has been sworn in: every seat belongs to a member-elect. The Chaplain offers a prayer and the Clerk leads the Pledge of Allegiance.', '', ['clerk']],
    ['Quorum call', 'users', 'Members-elect record their presence, state by state, to establish that a majority of the House is there to do business.', live(q ? `<a href="/vote/${q.k}">The quorum call of ${when}</a>.` : ''), [], ['quorum']],
    ['Election of the Speaker', 'vote', 'The Clerk calls the roll and each member-elect answers aloud with a surname. Winning takes a majority of the votes cast for a person by name, not a majority of all 435 seats. The Clerk presides until a Speaker is chosen. The Constitution does not require the Speaker to be a member of the House, though every Speaker has been.',
      spkBars + live(spk ? `${rlink(spk, 'How every member voted')}.${spkEl ? ` <a href="/leadership/${spkEl.id}">The full count</a>.` : ''}` : ''), ['speaker'], ['motion-to-vacate']],
    ['The Speaker is sworn in, then swears in the House', 'check', 'After the Speaker-elect addresses the chamber, the Dean of the House, its longest-serving member, administers the oath of office. The new Speaker then administers the same oath to all the members at once.', ''],
    ['Officers are elected', 'briefcase', 'The House rules call for a Clerk, a Sergeant at Arms, a Chief Administrative Officer and a Chaplain to be elected at the start of each Congress, by resolution.', live(join(res(/^Electing officers of the House/, { day: true }).map(blink))), ['clerk', 'house-saa', 'cao', 'house-chaplain']],
    ['The Senate and the President are told', 'speech', 'Resolutions inform the Senate that the House has a quorum and a Speaker, and send a committee to tell the President that Congress has assembled.', live(join([...res(/inform the Senate that a quorum/i, { day: true }), ...res(/notify the President of the assembly/i, { day: true }), ...res(/inform the President of the election of the Speaker/i, { day: true })].map(blink)))],
    ['The rules are adopted', 'list', 'The House adopts its rules anew at the start of every Congress, in a single resolution that carries over the previous rules with the majority\u2019s changes. Changes to how a Speaker can be removed, how bills reach the floor and how committees work are all decided in this one vote.',
      (rulesR.length ? `<div class="hw-chart"><h3>The votes on ${BV.label(rules)}</h3>${rulesR.map(r => voteBar(r)).join('')}</div>` : '') + live(rules ? `${blink(rules)}, the rules of the 119th Congress.` : ''), [], ['previous-question', 'motion-to-vacate', 'special-rule']],
    ['Housekeeping and committees', 'calendar', 'A resolution fixes the hour the House meets each day, and the Speaker announces floor policies for the Congress. Committee seats are filled by further resolutions, on lists each party has drawn up, starting the same day and continuing for weeks.',
      live([join(res(/Fixing the daily hour of meeting/i, { day: true }).map(blink)), cmteH.length ? `${num(cmteH.length)} resolutions electing members to committees, the first ${blink(cmteH[0])}` : ''].filter(Boolean).join('; '))]
  ];
  const senate = [
    ['The Vice President calls the Senate to order', 'gavel', 'The Vice President, as President of the Senate, takes the chair. The Chaplain offers a prayer and the Senate recites the Pledge of Allegiance.', '', ['president-of-the-senate']],
    ['Senators are sworn in', 'check', 'The Vice President administers the oath to the senators elected or re-elected in November and to any newly appointed senators. The other two-thirds of the Senate are mid-term and already in office.', ''],
    ['Quorum call', 'users', 'The clerk calls the roll to establish that a majority of senators is present.', '', [], ['quorum']],
    ['Notices to the President and the House', 'speech', 'Resolutions tell the President and the House that the Senate has a quorum and is ready for business.', live(join([...res(/Inform the President .*quorum/i, { day: true, type: 'sres' }), ...res(/informing the House .*quorum/i, { day: true, type: 'sres' })].map(blink)))],
    ['President pro tempore and officers, when they change', 'briefcase', 'The Senate does not re-elect its officers every two years. It elects a new President pro tempore, Secretary of the Senate, Sergeant at Arms or party secretary only when an office falls vacant or the majority changes hands.',
      live([ppt.length ? `President pro tempore, ${join(ppt.map(blink))}` : '', offs.length ? `officers, ${join(offs.map(blink))}` : ''].filter(Boolean).join('; ')), ['president-pro-tempore', 'secretary-of-the-senate', 'senate-saa']],
    ['Hour of meeting and standing orders', 'clock', 'A resolution fixes the hour the Senate meets each day. By unanimous consent the Senate adopts its standing orders for the Congress and sets the date when bills may first be introduced.', live(join(res(/fixing the hour of daily meeting/i, { day: true, type: 'sres' }).map(blink))), [], ['unanimous-consent']],
    ['Committees are filled', 'users', 'Each party settles its own committee assignments. The Senate then adopts resolutions naming the majority\u2019s members and the minority\u2019s, usually later in January.', live(cmteS.length ? `${join(cmteS.slice(0, 2).map(blink))}, adopted ${date(allBills()[cmteS[0]].stageDate, { month: 'long', day: 'numeric', year: 'numeric' })}.` : '')]
  ];
  return { house, senate, when };
}
const chips = (offs, terms) => { const l = [...(offs || []).map(office).filter(Boolean).map(o => [url.office(o.id), o.name]), ...(terms || []).map(term).filter(Boolean).map(t => [url.term(t.id), t.name])]; return l.length ? `<p class="hw-chips">${l.map(([h, n]) => `<a href="${h}">${esc(n)}</a>`).join('')}</p>` : ''; };
const stepper = (l, cls) => `<ol class="hw-steps ${cls}">${l.map(([h, i, t, x, o, tm]) => `<li><span class="hw-si">${ic(i)}</span><h2>${h}</h2><p>${t}</p>${x || ''}${chips(o, tm)}</li>`).join('')}</ol>`;
function newCongress() {
  const O = openingDay(), elect = D.people.filter(p => p.status === 'elect');
  const moved = Object.entries(allBills()).find(([, b]) => /convening of the .*One Hundred Twentieth Congress/i.test(b.title));
  const card = (k, img, cls, h, n, t) => `<a class="hw-big ${cls}" href="${BASE}/new-congress/${k}">${thumb(img)}<span><em>${n} steps</em><b>${h}</b><small>${t}</small><span class="hw-go">Step by step${ic('arrow')}</span></span></a>`;
  const body = `<div class="wrap">${crumb([])}<h1>How a new Congress organizes</h1>
  <p class="lede">Every two years the House starts over: no Speaker, no rules, no committees. The Senate carries on, with two-thirds of its members and all of its rules still in place.</p>
  <ol class="hw-flow wide"><li><b>November</b><span>Election Day</span></li><li><b>November and December</b><span>Parties choose their leaders; the old Congress finishes</span></li><li><b>January 3, noon</b><span>Opening day in both chambers</span></li><li><b>January</b><span>Committees are filled and bills start to move</span></li></ol>
  <dl class="facts"><div><dt>A Congress begins</dt><dd class="nm">Noon, January 3</dd><dd class="s">of each odd-numbered year, under the 20th Amendment, unless a law sets another day</dd></div>
  ${moved ? `<div><dt>120th Congress</dt><dd class="nm"><a href="/bill/${moved[0]}">${BV.label(moved[0])}</a></dd><dd class="s">${esc(moved[1].title)}</dd></div>` : `<div><dt>120th Congress convenes</dt><dd class="nm">January 3, 2027</dd><dd class="s">at noon</dd></div>`}
  ${elect.length ? `<div><dt>New members in the 120th</dt><dd><a href="/incoming">${num(elect.length)}</a></dd><dd class="s">${num(elect.filter(p => p.chamber === 'H').length)} in the House, ${num(elect.filter(p => p.chamber === 'S').length)} in the Senate</dd></div>` : ''}
  ${O.when ? `<div><dt>119th Congress convened</dt><dd class="nm">${O.when}</dd></div>` : ''}</dl>
  <h2 class="hw-h">Opening day</h2>
  <div class="hw-bigs">${card('house', 'house', 'h', 'In the House', O.house.length, 'It starts from nothing: a quorum call, a Speaker, the oath, officers and a new set of rules.')}${card('senate', 'senate', 's', 'In the Senate', O.senate.length, 'A continuing body: one-third of senators take the oath and the rules stay as they were.')}</div>
  <h2 class="hw-h" id="before">Before opening day</h2>
  <div class="hw-terms">
    <div class="hw-term"><h3>The parties choose their leaders</h3><p>In the weeks after the election each party\u2019s members meet behind closed doors to elect floor leaders, whips and conference or caucus chairs, and the majority picks its nominee for Speaker. None of these votes takes place on the floor. <a href="/leadership">Who holds each post and how the votes went</a>.</p></div>
    <div class="hw-term"><h3>The old Congress finishes</h3><p>The outgoing Congress stays in office until the new one is sworn in. A session held after the election is a <a href="${url.term('lame-duck')}">lame-duck session</a>: members who lost or are retiring still vote. <a href="/schedule">What is on the floor now</a>.</p></div>
    <div class="hw-term"><h3>Unfinished bills expire</h3><p>Every bill that has not become law dies when a Congress ends, and has to be introduced again under a new number. <a href="${BASE}/bills">Where each of this Congress\u2019s bills stands</a>.</p></div>
  </div>${sources(['day1h', 'day1s', 'cons'])}</div>`;
  return page({ cur: 'new-congress', title: 'How a new Congress organizes', desc: 'What happens between the election and a working Congress: leadership elections, opening day in the House and Senate, officers, rules and committees.', p: `${BASE}/new-congress`, body });
}
function openingChamber(ch) {
  const O = openingDay(), h = ch === 'house';
  const body = `<div class="wrap">${crumb([[`${BASE}/new-congress`, 'A new Congress']])}
  <p class="hw-kick ${h ? 'h' : 's'}">Opening day</p><h1>${h ? 'Opening day in the House' : 'Opening day in the Senate'}</h1>
  <p class="lede">${h ? 'The House starts from nothing. Until it elects a Speaker it can do no other business, and until it adopts rules it has none of its own.' : 'The Senate is a continuing body. Senate Rule V keeps its rules in force from one Congress to the next unless the Senate changes them, so opening day is short.'}</p>
  <div class="hw-split"><div>${stepper(h ? O.house : O.senate, h ? 'h' : 's')}</div><aside>${fig(h ? 'house' : 'senate')}<p class="hw-aside"><b>${h ? 'In the Senate' : 'In the House'}</b> ${h ? 'the day is shorter: the rules carry over and only a third of senators take the oath.' : 'everything starts over: a Speaker, officers and rules all have to be chosen.'} <a href="${BASE}/new-congress/${h ? 'senate' : 'house'}">Opening day in the ${h ? 'Senate' : 'House'}</a></p></aside></div>
  ${sources([h ? 'day1h' : 'day1s', h ? 'speaker' : 'sr', 'cons'])}
  <nav class="hw-pager"><a href="${BASE}/new-congress"><small>Back to</small><b>A new Congress</b></a><a class="nx" href="${BASE}/new-congress/${h ? 'senate' : 'house'}"><small>Next</small><b>Opening day in the ${h ? 'Senate' : 'House'}</b></a></nav></div>`;
  return page({ cur: 'new-congress', title: h ? 'Opening day in the House' : 'Opening day in the Senate', desc: h ? 'The first day of a new House, step by step: the quorum call, the election of the Speaker, the oath, officers and the rules, with the votes of the 119th Congress.' : 'The first day of a new Senate, step by step: the oath, the quorum call, the President pro tempore, officers and committees, with the resolutions of the 119th Congress.', p: `${BASE}/new-congress/${ch}`, body });
}

// ---------------- officers and officials ----------------
// short office names for the who-chooses-whom diagram
const chipName = o => ({ cbo: 'CBO Director', gpo: 'GPO Director', 'president-of-the-senate': 'Vice President' })[o.id] || (/^Secretary/.test(o.name) ? o.name : o.name.replace(/ of the (House|Senate)$|^(House|Senate) /, ''));
const holder = o => { const cur = (D.leadership && D.leadership.current) || [], ld = o.leader && cur.find(c => o.leader.test(c.title)); return ld ? D.who(ld.person) : null; };
function officers() {
  const card = o => { const p = holder(o); return `<a class="hw-tile office" href="${url.office(o.id)}">${p && H.hasPortrait(p) ? H.portrait(p) : `<span class="hw-ti">${ic(o.ic)}</span>`}<span class="hw-tt"><b>${esc(o.name)}</b>${p ? `<em>${esc(H.title(p) + ' ' + p.name)}</em>` : o.who ? `<em>${esc(o.who)}${o.acting ? ', acting' : ''}</em>` : ''}<small>${esc(o.short)}</small></span>${ic('chev')}</a>`; };
  const body = `<div class="wrap">${crumb([])}<h1>Officers and officials</h1>
  <p class="lede">The people who run the House and Senate without casting a vote: clerks, parliamentarians, sergeants at arms and the agencies that answer to Congress.</p>
  <h2 class="hw-h">Who chooses whom</h2>
  <div class="hw-who-map">${OFFICES.map(g => `<div class="hw-pick ${g.cls}"><a class="hw-picker" href="#${g.id}">${esc(g.picker)}</a><span class="hw-arrow">${ic('arrow')}</span><ul>${g.list.map(o => `<li><a href="${url.office(o.id)}">${esc(chipName(o))}</a></li>`).join('')}</ul></div>`).join('')}</div>
  ${OFFICES.map(g => `<section class="hw-group ${g.cls}" id="${g.id}"><h2>${esc(g.group)}</h2><p class="sub">${esc(g.blurb)}</p><div class="hw-tiles">${g.list.map(card).join('')}</div></section>`).join('')}
  <h2 class="hw-h">Party leaders</h2><p>Majority and minority leaders, whips and conference chairs hold party posts, chosen by each party\u2019s own members in closed meetings. <a href="/leadership">Who holds each post and how they were elected</a>.</p></div>`;
  return page({ cur: 'officers', title: 'Officers and officials of Congress', desc: 'Who runs the House and Senate: the Clerk, the Parliamentarians, the Sergeants at Arms, the Secretary of the Senate, the party secretaries and the agencies that work for Congress.', p: `${BASE}/officers`, body });
}
const OFFICE_LIVE = {
  'senate-parliamentarian': () => LIVE['nuclear-option']()
};
function officePage(id) {
  const o = office(id); if (!o) return null;
  const i = ALL_OFFICES.indexOf(o), p = holder(o), el = o.elect ? res(o.elect, { type: 'sres' }).pop() : null;
  const x = [el ? `Elected by ${blink(el)}, ${date(allBills()[el].stageDate)}.` : '', OFFICE_LIVE[id] ? OFFICE_LIVE[id]() : ''].filter(Boolean);
  const body = `<div class="wrap">${crumb([[`${BASE}/officers`, 'Officers and officials'], [`${BASE}/officers#${o.g.id}`, o.g.group]])}
  <div class="hw-split"><div>
    <p class="hw-kick ${o.g.cls}">${esc(o.g.group)}</p><h1>${esc(o.name)}</h1><p class="lede">${esc(o.short)}</p>
    ${p ? `<div class="hw-holder">${personLink(p)}</div>` : o.who ? `<div class="hw-holder"><span class="hw-ti">${ic('users')}</span><span><small>${o.acting ? 'Acting' : 'Held by'}</small><b>${esc(o.who)}</b></span></div>` : ''}
    <p class="hw-body">${o.text}</p>
    ${o.how ? `<h2>How the post is filled</h2><div class="hw-chain"><span>${esc(o.g.picker)}</span>${ic('arrow')}<b>${esc(o.name)}</b></div><p>${o.how}.</p>` : ''}
  </div>${fig(o.img) || x.length ? `<aside>${fig(o.img)}${x.length ? `<h2>${inCongress}</h2>${x.map(live).join('')}` : ''}</aside>` : ''}</div>
  ${related({ terms: o.terms })}
  ${sources(o.src)}
  ${pager(ALL_OFFICES, i, y => url.office(y.id), y => y.name)}</div>`;
  return page({ cur: 'officers', title: o.name, desc: `${o.name}${o.who ? `, ${o.who}` : p ? `, ${p.name}` : ''}: ${o.short} ${o.how ? o.how + '.' : ''}`, p: url.office(o.id), body });
}

// ---------------- rules and terms ----------------
function rulesIndex() {
  const body = `<div class="wrap">${crumb([])}<h1>Rules and terms</h1>
  <p class="lede">The procedures that decide whether a bill gets a vote, in plain language, with how often each one has been used in the 119th Congress.</p>
  <div class="hw-filter"><label class="vh" for="hwf">Filter terms</label>${ic('search')}<input id="hwf" type="search" placeholder="Filter these ${ALL_TERMS.length} terms" autocomplete="off"></div>
  <nav class="stage-nav" aria-label="Groups">${TERMS.map(g => `<a href="#${g.id}">${esc(g.group)} <span class="cnt">${g.list.length}</span></a>`).join('')}</nav>
  ${TERMS.map(g => `<section class="hw-group ${g.cls}" id="${g.id}"><h2>${esc(g.group)}</h2><p class="sub">${esc(g.blurb)}</p><div class="hw-tiles">${g.list.map(t => `<a class="hw-tile" href="${url.term(t.id)}" data-k="${esc((t.name + ' ' + t.short + ' ' + (t.badge || '')).toLowerCase())}"><span class="hw-ti">${ic(t.ic)}</span><span class="hw-tt"><b>${esc(t.name)}</b><small>${esc(t.short)}</small>${t.badge ? `<span class="hw-badge">${esc(t.badge)}</span>` : ''}</span>${ic('chev')}</a>`).join('')}</div></section>`).join('')}
  <p class="hw-none" hidden>No term matches. Try the search at the top of the page.</p></div>`;
  return page({ cur: 'rules', title: 'Rules and terms of Congress', desc: 'Cloture, the filibuster, the Byrd rule, discharge petitions, suspension of the rules, holds, blue slips and more, explained in plain language with how often each was used in the 119th Congress.', p: `${BASE}/rules`, body });
}
function termPage(id) {
  const t = term(id); if (!t) return null;
  const i = ALL_TERMS.indexOf(t), lv = LIVE[id] ? LIVE[id]() : '', ch = CHART[id] ? CHART[id]() : '';
  const side = fig(t.img) || lv || ch ? `<aside>${fig(t.img)}${lv || ch ? `<h2>${inCongress}</h2>${ch}${live(lv)}` : ''}</aside>` : '';
  const body = `<div class="wrap">${crumb([[`${BASE}/rules`, 'Rules and terms'], [`${BASE}/rules#${t.g.id}`, t.g.group]])}
  <div class="hw-split"><div>
    <p class="hw-kick ${t.g.cls}">${esc(t.g.group)}</p><h1>${esc(t.name)}</h1><p class="lede">${esc(t.short)}</p>
    <p class="hw-body">${t.text}</p>
    ${t.flow ? `<h2>How it runs</h2>${flow(t.flow)}` : ''}
    ${t.need ? `<h2>${t.need.length > 1 ? 'The numbers' : 'The number'}</h2><div class="hw-needs">${t.need.map(([c, n, l]) => seats(c, n, l)).join('')}</div>` : ''}
  </div>${side}</div>
  ${related(t)}
  ${sources(t.src)}
  ${pager(ALL_TERMS, i, y => url.term(y.id), y => y.name)}</div>`;
  return page({ cur: 'rules', title: `${t.name}: what it means in Congress`, desc: `${t.short} ${t.text.replace(/<[^>]+>/g, '')}`.slice(0, 300), p: url.term(t.id), body });
}

// ---------------- routing, sitemap, search ----------------
function route(sub) {
  if (sub === '') return hub();
  if (sub === 'bills') return bills();
  if (sub === 'new-congress') return newCongress();
  if (sub === 'new-congress/house' || sub === 'new-congress/senate') return openingChamber(sub.slice(13));
  if (sub === 'officers') return officers();
  if (sub === 'rules') return rulesIndex();
  const m = /^(bills|officers|rules)\/([a-z-]+)$/.exec(sub);
  return m ? { bills: billStep, officers: officePage, rules: termPage }[m[1]](m[2]) : null;
}
const paths = () => [...new Set(INDEX().map(e => e[2]).concat(BASE))];
// matches for the site-wide search box
function suggest(q) {
  const n = D.norm(q); if (n.length < 3) return [];
  const terms = n.split(' ');
  return INDEX().filter(e => e[1] !== 'Guide').map(e => [e, D.norm(e[0]), D.norm(e[0] + ' ' + e[3])]).filter(([, , all]) => terms.every(t => all.includes(t)))
    .sort((a, b) => (b[1].startsWith(n) - a[1].startsWith(n)) || (b[1].includes(n) - a[1].includes(n))).slice(0, 3).map(([e]) => ({ t: e[1], l: e[0], s: 'How Congress works', u: e[2] }));
}

module.exports = { BASE, paths, page: route, suggest };
