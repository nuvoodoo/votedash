'use strict';
// The path of a bill: every bill and joint resolution of the Congress drawn as one square at the station it has reached.
// Server-rendered SVG; public/c/billmap.js adds hover, search and issue highlighting from /api/billmap.json.
const D = require('./data');
const { esc, title, short } = require('./html');

const LAW = /^(hr|s|hjres|sjres)\d/;
const label = k => { const m = /^([a-z]+)(\d+)$/.exec(k); return `${{ hr: 'H.R.', s: 'S.', hjres: 'H.J.Res.', sjres: 'S.J.Res.' }[m[1]]} ${m[2]}`; };
const num = n => n.toLocaleString('en-US');
const pctOf = (a, b) => { if (!b) return ''; const p = a / b * 100; return (p > 0 && p < 1 ? p.toFixed(1) : Math.round(p)) + '%'; };

// name: label on the map. full + help: heading and lede of the station's bill list (/tracker/{id}). list: an existing tracker step with the same bills.
const STATIONS = [
  { id: 'h-intro', name: 'Not yet referred', full: 'House bills not yet referred', help: 'Introduced in the House and waiting to be referred to a committee.' },
  { id: 'h-cmte', name: 'In committee, no action', full: 'House bills in committee with no action', help: 'Referred to a House committee, with no hearing, markup or vote recorded.' },
  { id: 'h-heard', name: 'Hearing or markup held', full: 'House bills with a hearing or markup', help: 'A House committee or subcommittee held a hearing or a markup on the bill and has not reported it.' },
  { id: 'h-reported', name: 'Awaiting a floor vote', full: 'House bills awaiting a floor vote', help: 'Reported by a House committee or placed on a House calendar, with no vote on passage yet.' },
  { id: 'h-failed', name: 'Failed a floor vote', full: 'House bills that failed a floor vote', help: 'Voted down on the House floor.', kill: true },
  { id: 'hs-recv', name: 'Received', full: 'House-passed bills received in the Senate', help: 'Passed the House and received in the Senate, which has not referred them to a committee or put them on its calendar.' },
  { id: 'hs-cmte', name: 'In committee', full: 'House-passed bills in Senate committee', help: 'Passed the House and referred to a Senate committee.' },
  { id: 'hs-cal', name: 'On the calendar', full: 'House-passed bills on the Senate calendar', help: 'Passed the House and reported by a Senate committee or placed on the Senate calendar.' },
  { id: 'hs-blocked', name: 'Filibustered', full: 'House-passed bills filibustered in the Senate', help: 'Passed the House, then fell short of the 60 votes needed for cloture in the Senate.', kill: true },
  { id: 'hs-failed', name: 'Failed a floor vote', full: 'House-passed bills that failed in the Senate', help: 'Passed the House, then voted down on the Senate floor.', kill: true },
  { id: 's-intro', name: 'Not yet referred', full: 'Senate bills not yet referred', help: 'Introduced in the Senate and waiting to be referred to a committee.' },
  { id: 's-cmte', name: 'In committee, no action', full: 'Senate bills in committee with no action', help: 'Referred to a Senate committee, with no hearing, markup or vote recorded.' },
  { id: 's-heard', name: 'Hearing or markup held', full: 'Senate bills with a hearing or markup', help: 'A Senate committee or subcommittee held a hearing or a markup on the bill and has not reported it.' },
  { id: 's-reported', name: 'Awaiting a floor vote', full: 'Senate bills awaiting a floor vote', help: 'Reported by a Senate committee or placed on the Senate calendar, with no vote on passage yet.' },
  { id: 's-blocked', name: 'Filibustered', full: 'Senate bills filibustered', help: 'A cloture vote to end debate fell short of 60 votes, and the bill has not passed the Senate.', kill: true },
  { id: 's-failed', name: 'Failed a floor vote', full: 'Senate bills that failed a floor vote', help: 'Voted down on the Senate floor.', kill: true },
  { id: 'sh-recv', name: 'Held at the desk', full: 'Senate-passed bills held at the House desk', help: 'Passed the Senate and received in the House, which has not referred them to a committee or put them on a calendar.' },
  { id: 'sh-cmte', name: 'In committee', full: 'Senate-passed bills in House committee', help: 'Passed the Senate and referred to a House committee.' },
  { id: 'sh-cal', name: 'On the calendar', full: 'Senate-passed bills on a House calendar', help: 'Passed the Senate and reported by a House committee or placed on a House calendar.' },
  { id: 'sh-failed', name: 'Failed a floor vote', full: 'Senate-passed bills that failed in the House', help: 'Passed the Senate, then voted down on the House floor.', kill: true },
  { id: 'diff', name: 'Resolving differences', list: 'passed-both' },
  { id: 'pres', name: 'On the President’s desk', list: 'to-president' },
  { id: 'vetoed', name: 'Vetoed', list: 'vetoed', kill: true },
  { id: 'law', name: 'Became law', list: 'law', law: true }
];
const ST = Object.fromEntries(STATIONS.map(s => [s.id, s]));
const station = id => (ST[id] && ST[id].full ? ST[id] : null);
const listHref = id => `/tracker/${ST[id].list || id}`;

const CLOTURE = /cloture .*not invoked/i, FAILED = /Failed of passage|On passage Failed|pass the bill.* Failed/i;
function stationOf(k, b) {
  const o = /^s/.test(k) ? 's' : 'h', s = b.stage, A = b.actions || [];
  if (s === 'law') return 'law';
  if (s === 'vetoed') return 'vetoed';
  if (s === 'to-president') return 'pres';
  if (s === 'passed-both') return 'diff';
  if (s === 'passed-house' || s === 'passed-senate') {
    const here = s === 'passed-house' ? 'House' : 'Senate', X = here === 'House' ? 'Senate' : 'House', p = o + X[0].toLowerCase();
    const passed = new RegExp(`Passed/agreed to in ${here}|Passed ${here}|On passage Passed`);
    let pi = -1; A.forEach((a, i) => { if (passed.test(a.text)) pi = i; });
    const after = A.slice(pi + 1).filter(a => a.chamber === X || a.text.includes(' in ' + X));
    const t = re => after.some(a => re.test(a.text));
    if (t(CLOTURE)) return p + '-blocked';
    if (t(FAILED)) return p + '-failed';
    if (t(/Placed on (the )?(Senate Legislative|Union|House) Calendar|rdered to be [Rr]eported|Reported by/)) return p + '-cal';
    if (t(/[Rr]eferred to/)) return p + '-cmte';
    return p + '-recv';
  }
  const t = re => A.some(a => re.test(a.text));
  if (s === 'failed') return o === 's' && t(CLOTURE) && !t(FAILED) ? 's-blocked' : o + '-failed';
  if (o === 's' && t(CLOTURE)) return 's-blocked';
  if (s === 'reported') return o + '-reported';
  if (s === 'committee') return o + (t(/Hearings? Held|Mark-?up|Forwarded by Subcommittee/i) || (b.committees || []).some(c => c.activities.some(a => /Hearings|Markup/.test(a.name))) ? '-heard' : '-cmte');
  return o + '-intro';
}

// ---------- layout ----------
const P = 5, PAD = 6, HB = 30, GAP = 12, W = 1280;
const HC = 134, SC = 76, XH = 30, XS = 800;            // columns of squares and left edge, House and Senate
const yardW = cols => cols * P - 1 + 2 * PAD;
const CXH = XH + yardW(HC) / 2, CXS = XS + yardW(SC) / 2, CX = W / 2;
const MINI = 36;                                        // squares across a dead-end yard
const pipeW = n => Math.max(2, Math.min(64, Math.sqrt(n) * 0.6));
const PORDER = { D: 0, R: 1, I: 2 };
const TORDER = { hr: 0, hjres: 1, s: 0, sjres: 1 };

let cache = { src: null, out: null };
function build() {
  if (!D.bills) return null;
  if (cache.src === D.bills) return cache.out;
  const bills = D.bills.bills, at = {}, party = {};
  for (const [k, b] of Object.entries(bills)) {
    if (!LAW.test(k)) continue;
    const id = stationOf(k, b); if (!ST[id]) continue;
    const sp = D.who(b.sponsor); party[k] = sp && PORDER[sp.party] != null ? sp.party : 'I';
    (at[id] ||= []).push(k);
  }
  const key = k => { const m = /^([a-z]+)(\d+)$/.exec(k); return [PORDER[party[k]], TORDER[m[1]], +m[2]]; };
  for (const l of Object.values(at)) l.sort((a, b) => { const x = key(a), y = key(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; });
  const n = id => (at[id] || []).length;
  const sum = ids => ids.reduce((a, id) => a + n(id), 0);
  const areas = [...new Set(Object.keys(party).map(k => bills[k].policyArea).filter(Boolean))].sort();
  const aCode = a => String.fromCharCode(48 + (a ? areas.indexOf(a) + 1 : 0));   // one character per bill; '0' is no policy area

  const J = ['diff', 'pres', 'vetoed', 'law'];
  const fromH = id => at[id] ? at[id].filter(k => /^h/.test(k)).length : 0;
  const T = {
    h: sum(['h-intro', 'h-cmte', 'h-heard', 'h-reported', 'h-failed', 'hs-recv', 'hs-cmte', 'hs-cal', 'hs-blocked', 'hs-failed']) + J.reduce((a, id) => a + fromH(id), 0),
    s: sum(['s-intro', 's-cmte', 's-heard', 's-reported', 's-blocked', 's-failed', 'sh-recv', 'sh-cmte', 'sh-cal', 'sh-failed']) + J.reduce((a, id) => a + n(id) - fromH(id), 0)
  };
  T.all = T.h + T.s;
  T.hBoth = J.reduce((a, id) => a + fromH(id), 0); T.sBoth = sum(J) - T.hBoth; T.both = sum(J);
  T.hPassed = sum(['hs-recv', 'hs-cmte', 'hs-cal', 'hs-blocked', 'hs-failed']) + T.hBoth;
  T.sPassed = sum(['sh-recv', 'sh-cmte', 'sh-cal', 'sh-failed']) + T.sBoth;
  T.hOut = T.hPassed + sum(['h-reported', 'h-failed']); T.sOut = T.sPassed + sum(['s-reported', 's-blocked', 's-failed']);
  T.toPres = sum(['pres', 'vetoed', 'law']); T.law = n('law');
  // how each bill passed its own chamber: House bills under suspension of the rules, Senate bills without a recorded vote
  T.hSusp = 0; T.sQuiet = 0;
  for (const [id, keys] of Object.entries(at)) { if (!/^(hs|sh)-/.test(id) && !J.includes(id)) continue;
    for (const k of keys) { const sen = /^s/.test(k), re = sen ? /^Passed\/agreed to in Senate/ : /^Passed\/agreed to in House/, a = [...bills[k].actions].reverse().find(x => re.test(x.text)); if (!a) continue;
      if (sen) { if (!/Yea-Nay Vote|votes in the affirmative/.test(a.text)) T.sQuiet++; } else if (/suspend the rules/.test(a.text)) T.hSusp++; } }
  const lawBy = { D: 0, R: 0, I: 0 }; for (const k of at.law || []) lawBy[party[k]]++;

  const yards = []; let svg = '', lastW = 0;
  // one station: heading, count and its squares; returns the height used (0 when no bill is there)
  function yard(id, x, y, cols, track) {
    const keys = at[id]; if (!keys) return 0;
    const st = ST[id], rows = Math.ceil(keys.length / cols), w = yardW(rows === 1 ? keys.length : cols), bh = rows * P - 1 + 2 * PAD, gx = x + PAD, gy = y + HB + PAD;
    const cnt = { D: 0, R: 0, I: 0 }; for (const k of keys) cnt[party[k]]++;
    let dots = '', i0 = 0;
    for (const pt of ['D', 'R', 'I']) {
      const i1 = i0 + cnt[pt]; if (i1 === i0) continue;
      let d = '';
      for (let r = Math.floor(i0 / cols); r <= Math.floor((i1 - 1) / cols); r++) {
        const c0 = r === Math.floor(i0 / cols) ? i0 % cols : 0, c1 = r === Math.floor((i1 - 1) / cols) ? (i1 - 1) % cols + 1 : cols;
        d += `M${gx + c0 * P},${gy + r * P + 2}h${(c1 - c0) * P - 1}`;
      }
      dots += `<path class="bm-d ${pt}" d="${d}"/>`; i0 = i1;
    }
    svg += `<a href="${listHref(id)}" class="bm-st${st.kill ? ' kill' : ''}${st.law ? ' law' : ''}${cols === MINI ? ' mini' : ''}" data-st="${id}"><title>${esc(st.full || st.name)}: ${num(keys.length)}</title>
      ${w < 320 ? `<text class="bm-name" x="${x}" y="${y + 21}">${esc(st.name)}<tspan class="bm-n" dx="10">${num(keys.length)}</tspan></text>` : `<text class="bm-name" x="${x}" y="${y + 21}">${esc(st.name)}</text><text class="bm-n" x="${x + w}" y="${y + 21}" text-anchor="end">${num(keys.length)}</text>`}
      <rect class="bm-box" x="${x}" y="${y + HB}" width="${w}" height="${bh}" rx="4"/>${track ? `<rect class="bm-edge ${track}" x="${x}" y="${y + HB}" width="3" height="${bh}" rx="1.5"/>` : ''}${dots}</a>`;
    yards.push({ id, x: gx, y: gy, c: cols, k: keys, a: keys.map(k => aCode(bills[k].policyArea)).join(''), p: [cnt.D, cnt.R, cnt.I] });
    lastW = w;
    return HB + bh;
  }
  const pipe = (cls, d, n) => { svg += `<path class="bm-pipe ${cls}" d="${d}" stroke-width="${pipeW(n).toFixed(1)}"/>`; };
  const pill = (cls, cx, y, name, n, share) => {
    const w = 380, h = 46;
    svg += `<g class="bm-pill ${cls}"><rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="23"/><text class="bm-pname" x="${cx - w / 2 + 22}" y="${y + 29}">${esc(name)}</text><text class="bm-pn" x="${cx + w / 2 - 22}" y="${y + 31}" text-anchor="end">${num(n)}<tspan class="bm-pp" dx="8">${share}</tspan></text></g>`;
    return h;
  };

  // chamber heads
  let y = 0;
  for (const [x, cols, name, tot, cls] of [[XH, HC, 'House', T.h, 'h'], [XS, SC, 'Senate', T.s, 's']]) {
    svg += `<g class="bm-head ${cls}"><text class="bm-kick" x="${x}" y="22">${name.toUpperCase()}</text><text class="bm-big" x="${x}" y="68">${num(tot)}</text><text class="bm-sub" x="${x}" y="92">bills and joint resolutions introduced</text><rect class="bm-rule" x="${x}" y="104" width="${yardW(cols)}" height="3" rx="1.5"/></g>`;
  }
  y = 118;
  // origin chamber: rows line up across the two columns
  const pair = (a, b) => { const h = Math.max(yard(a, XH, y, HC, 'h'), yard(b, XS, y, SC, 's')); if (h) y += h + GAP; };
  pair('h-intro', 's-intro'); pair('h-cmte', 's-cmte'); pair('h-heard', 's-heard');
  // out of committee
  let g = 58;
  pipe('h', `M${CXH},${y - GAP + 2}V${y + g - 2}`, T.hOut); pipe('s', `M${CXS},${y - GAP + 2}V${y + g - 2}`, T.sOut);
  svg += `<text class="bm-note" x="${CXH + pipeW(T.hOut) / 2 + 12}" y="${y + 22}">${num(T.hOut)} made it past committee, ${pctOf(T.hOut, T.h)}</text>`;
  svg += `<text class="bm-note" x="${CXS - pipeW(T.sOut) / 2 - 12}" y="${y + 46}" text-anchor="end">${num(T.sOut)} made it past committee, ${pctOf(T.sOut, T.s)}</text>`;
  y += g;
  pair('h-reported', 's-reported');
  // the floor: dead ends beside the pipe
  const hKill = ['h-failed'].filter(n), sKill = ['s-blocked', 's-failed'].filter(n), mh = HB + P - 1 + 2 * PAD;
  g = 34 + Math.max(hKill.length, sKill.length, 1) * (mh + 8);
  pipe('h', `M${CXH},${y - GAP + 2}V${y + g - 2}`, T.hPassed); pipe('s', `M${CXS},${y - GAP + 2}V${y + g - 2}`, T.sPassed);
  hKill.forEach((id, i) => { const x = CXH - 34 - yardW(MINI), yy = y + 8 + i * (mh + 8); yard(id, x, yy, MINI); svg += `<path class="bm-kp" d="M${CXH},${yy + HB + 8}H${x + lastW + 2}"/>`; });
  sKill.forEach((id, i) => { const x = CXS + 34, yy = y + 8 + i * (mh + 8); svg += `<path class="bm-kp" d="M${CXS},${yy + HB + 8}H${x - 2}"/>`; yard(id, x, yy, MINI); });
  svg += `<text class="bm-note" x="${CXH + pipeW(T.hPassed) / 2 + 14}" y="${y + 30}">${num(T.hSusp)} of them under suspension of the rules</text>`;
  svg += `<text class="bm-note" x="${CXS - pipeW(T.sPassed) / 2 - 14}" y="${y + 30}" text-anchor="end">${num(T.sQuiet)} of them without a roll call</text>`;
  y += g;
  y += Math.max(pill('h', CXH, y, 'Passed the House', T.hPassed, pctOf(T.hPassed, T.h)), pill('s', CXS, y, 'Passed the Senate', T.sPassed, pctOf(T.sPassed, T.s)));
  // crossing: each bill goes to the other chamber
  g = 150;
  pipe('h', `M${CXH},${y + 2}C${CXH},${y + g * 0.62} ${CXS},${y + g * 0.38} ${CXS},${y + g - 2}`, T.hPassed);
  pipe('s', `M${CXS},${y + 2}C${CXS},${y + g * 0.62} ${CXH},${y + g * 0.38} ${CXH},${y + g - 2}`, T.sPassed);
  y += g;
  svg += `<g class="bm-head2"><text class="bm-kick s" x="${XH}" y="${y + 18}">IN THE HOUSE</text><text class="bm-sub" x="${XH}" y="${y + 40}">${num(T.sPassed - T.sBoth)} Senate-passed bills waiting</text><text class="bm-kick h" x="${XS}" y="${y + 18}">IN THE SENATE</text><text class="bm-sub" x="${XS}" y="${y + 40}">${num(T.hPassed - T.hBoth)} House-passed bills waiting</text></g>`;
  y += 50;
  // second chamber: stations stack, dead ends side by side as minis
  const stack = (ids, x, cols, track) => {
    let yy = y, mx = x;
    for (const id of ids) { if (!n(id)) continue;
      if (ST[id].kill) { const h = yard(id, mx, yy, MINI, track); mx += yardW(MINI) + 16; if (mx + yardW(MINI) > x + yardW(cols)) { mx = x; yy += h + GAP; } }
      else { yy += yard(id, x, yy, cols, track) + GAP; }
    }
    return mx > x ? yy + mh + GAP : yy;
  };
  const yl = stack(['sh-recv', 'sh-cmte', 'sh-cal', 'sh-failed'], XH, HC, 's'), yr = stack(['hs-recv', 'hs-cmte', 'hs-cal', 'hs-blocked', 'hs-failed'], XS, SC, 'h');
  // both chambers
  const ym = Math.max(yl, yr); g = 120;
  pipe('s', `M${CXH},${yl - GAP + 2}V${ym - GAP}C${CXH},${ym + g * 0.6} ${CX - 8},${ym + g * 0.4} ${CX - 8},${ym + g - 2}`, T.sBoth);
  pipe('h', `M${CXS},${yr - GAP + 2}V${ym - GAP}C${CXS},${ym + g * 0.6} ${CX + 8},${ym + g * 0.4} ${CX + 8},${ym + g - 2}`, T.hBoth);
  y = ym + g;
  y += pill('j', CX, y, 'Passed both chambers', T.both, pctOf(T.both, T.all));
  const XJ = CX - yardW(SC) / 2;
  if (n('diff')) { y += 14; y += yard('diff', XJ, y, SC) + GAP; }
  g = 40; pipe('j', `M${CX},${y - GAP + 2}V${y + g - 2}`, T.toPres); svg += `<text class="bm-note" x="${CX + 16}" y="${y + g / 2 + 3}">${num(T.toPres)} sent to the President</text>`; y += g;
  if (n('pres')) y += yard('pres', XJ, y, SC) + GAP;
  g = n('vetoed') ? mh + 34 : 40; pipe('j', `M${CX},${y - GAP + 2}V${y + g - 2}`, T.law);
  if (n('vetoed')) { const x = CX + 34; svg += `<path class="bm-kp" d="M${CX},${y + 8 + HB + 8}H${x - 2}"/>`; yard('vetoed', x, y + 8, MINI); }
  y += g;
  y += yard('law', XJ, y, SC);
  svg += `<text class="bm-fin" x="${CX}" y="${y + 34}" text-anchor="middle">${num(T.law)} of ${num(T.all)} became law: ${pctOf(T.law, T.all)}</text>`;
  svg += `<text class="bm-note" x="${CX}" y="${y + 58}" text-anchor="middle">${[['R', 'Republican'], ['D', 'Democrat'], ['I', 'independent']].filter(([k]) => lawBy[k]).map(([k, l]) => `${num(lawBy[k])} sponsored by ${l}s`).join(', ')}</text>`;
  y += 76;

  const out = {
    svg: `<svg class="bmap" viewBox="0 0 ${W} ${y}" role="img" aria-label="Where the ${num(T.all)} bills and joint resolutions of the 119th Congress stand, from introduction to law">${svg}<g class="bm-hl"></g><rect class="bm-cur" width="${P + 3}" height="${P + 3}" rx="1.5" hidden/></svg>`,
    T, n, areas, yards,
    json: JSON.stringify({ p: P, areas, yards })
  };
  cache = { src: D.bills, out };
  return out;
}

// which station holds a bill, for the search box and the hover card
function where(k) { const b = D.bills && D.bills.bills[k]; if (!b || !LAW.test(k)) return null; const id = stationOf(k, b); return ST[id] ? id : null; }
function tip(k) {
  const id = where(k); if (!id) return null;
  const b = D.bills.bills[k], sp = D.who(b.sponsor), st = ST[id];
  return { k, l: label(k), t: b.short || b.title, s: sp ? `${title(sp)} ${sp.name} (${short(sp)})` : '', at: st.full || st.name, d: b.latest ? b.latest.date : '', a: b.latest ? b.latest.text : '', law: b.lawNumber || '' };
}
function find(q) {
  const nq = D.norm(q); if (!nq || !D.bills) return [];
  const exact = /^(h ?r|s|h ?j ?res|s ?j ?res)\s*\d+$/.test(nq) ? nq.replace(/\s+/g, '') : null, terms = nq.split(' ');
  const out = [];
  for (const it of D.search) {
    if (it.t !== 'bill' || !LAW.test(it.k)) continue;
    if (exact ? it.k === exact : terms.every(t => it.key.includes(t))) { out.push(it.k); if (out.length === 8) break; }
  }
  return out.map(tip).filter(Boolean);
}
const keysAt = id => { const B = build(); return B ? (B.yards.find(y => y.id === id) || { k: [] }).k : []; };

module.exports = { STATIONS, ST, station, stationOf, listHref, build, tip, find, keysAt, label, num, pctOf };
