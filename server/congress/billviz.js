'use strict';
// Bill tracker flow chart, stage finder and per-bill timeline (server-rendered SVG).
const D = require('./data');
const { esc, date, href, chip, personLink, title, short, PARTY } = require('./html');

const LAW_TYPES = /^(hr|s|hjres|sjres)\d/;          // can become law
const RES_TYPES = /^(hres|sres|hconres|sconres)\d/;  // resolutions
const label = k => { const m = /^([a-z]+)(\d+)$/.exec(k); const t = { hr: 'H.R.', s: 'S.', hres: 'H.Res.', sres: 'S.Res.', hjres: 'H.J.Res.', sjres: 'S.J.Res.', hconres: 'H.Con.Res.', sconres: 'S.Con.Res.' }[m[1]]; return `${t} ${m[2]}`; };
const origin = k => /^s/.test(k) ? 'Senate' : 'House';

// where a bill stands, in tracker steps
const STEPS = [
  { id: 'introduced', name: 'Introduced', short: 'Introduced', help: 'A member files the bill and it gets a number.' },
  { id: 'committee', name: 'In committee', short: 'Committee', help: 'Referred to the committees that cover its subject. Most bills stop here.' },
  { id: 'reported', name: 'Reported by committee', short: 'Reported', help: 'The committee voted to send it to the full chamber.' },
  { id: 'passed-one', name: 'Passed one chamber', short: 'One chamber', help: 'Passed the House or the Senate; the other chamber has not.' },
  { id: 'passed-both', name: 'Passed both chambers', short: 'Both chambers', help: 'Both chambers passed it; final text may still need to be agreed.' },
  { id: 'to-president', name: 'Sent to the President', short: 'President', help: 'Presented for signature or veto.' },
  { id: 'law', name: 'Became law', short: 'Law', help: 'Signed, or became law without a signature.' }
];
const SIDE = [
  { id: 'failed', name: 'Failed a floor vote', help: 'Voted down in the House or Senate.' },
  { id: 'vetoed', name: 'Vetoed', help: 'Vetoed by the President, with no successful override.' }
];
function stepOf(b) {
  const s = b.stage;
  if (s === 'passed-house' || s === 'passed-senate') return 'passed-one';
  return s; // introduced, committee, reported, passed-both, to-president, law, failed, vetoed
}
const REACHED = { introduced: 0, committee: 1, reported: 2, 'passed-one': 3, 'passed-both': 4, 'to-president': 5, law: 6, failed: 2, vetoed: 5 };

function pool(q) {
  const kind = q.get('kind') === 'resolutions' ? 'resolutions' : 'bills';
  const ch = q.get('origin');
  return Object.entries(D.bills.bills).filter(([k]) => (kind === 'bills' ? LAW_TYPES : RES_TYPES).test(k) && (!ch || origin(k) === ch));
}

// ---------- flow chart ----------
function flow(q) {
  const list = pool(q); const total = list.length || 1;
  const at = {}, reached = STEPS.map(() => 0);
  for (const [, b] of list) { const s = stepOf(b); at[s] = (at[s] || 0) + 1; const r = REACHED[s] ?? 0; for (let i = 0; i <= r; i++) reached[i]++; }
  const resolutions = q.get('kind') === 'resolutions';
  const steps = resolutions ? STEPS.slice(0, 5) : STEPS;
  const W = 1100, gap = 34, n = steps.length, cw = (W - gap * (n - 1)) / n, top = 30, bh = 128;
  const sideNodes = resolutions ? [] : [['failed', 2, 'Failed a floor vote'], ['vetoed', n - 2, 'Vetoed']].filter(([id]) => at[id]);
  const Hh = top + bh + 60 + (sideNodes.length ? 110 : 0);
  let svg = `<svg class="flow" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="How far the ${list.length.toLocaleString('en-US')} ${resolutions ? 'resolutions' : 'bills'} of the 119th Congress have gone">
    <defs><marker id="fa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" class="fl-ah"/></marker><marker id="fk" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" class="fl-ahk"/></marker></defs>`;
  const qs = (() => { const u = new URLSearchParams(q); u.delete('page'); const x = u.toString(); return x ? '?' + x : ''; })();
  const qs2 = qs;
  steps.forEach((st, i) => {
    const x = i * (cw + gap), v = reached[i], stay = at[st.id] || 0, share = v / total;
    if (i > 0) { const pv = reached[i - 1]; const pct = pv ? (v / pv * 100) : 0;
      svg += `<g class="fl-conv"><line x1="${x - gap + 2}" y1="${top + bh / 2}" x2="${x - 3}" y2="${top + bh / 2}" marker-end="url(#fa)"/><text x="${x - gap / 2}" y="${top + bh / 2 - 9}" text-anchor="middle">${pct < 1 && pct > 0 ? '<1' : Math.round(pct)}%</text></g>`; }
    svg += `<a href="/tracker/${st.id}${qs2}" class="fl-step"><title>${esc(st.name)}: ${v.toLocaleString('en-US')} reached this step (${(share * 100).toFixed(1)}% of all), ${stay.toLocaleString('en-US')} are here now</title>
      <rect class="fl-box" x="${x}" y="${top}" width="${cw}" height="${bh}" rx="8"/>
      <text class="fl-name" x="${x + 12}" y="${top + 24}">${esc(st.short)}</text>
      <text class="fl-num" x="${x + 12}" y="${top + 58}">${v.toLocaleString('en-US')}</text>
      <rect class="fl-track" x="${x + 12}" y="${top + 74}" width="${cw - 24}" height="6" rx="3"/><rect class="fl-bar" x="${x + 12}" y="${top + 74}" width="${Math.max(3, (cw - 24) * share).toFixed(1)}" height="6" rx="3"/>
      <text class="fl-pct" x="${x + 12}" y="${top + 98}">${share < 0.001 ? '<0.1' : (share * 100).toFixed(share < 0.1 ? 1 : 0)}% of all</text>
      <text class="fl-stay" x="${x + 12}" y="${top + bh + 24}">${stay.toLocaleString('en-US')} here now</text></a>`;
  });
  sideNodes.forEach(([id, from, name]) => {
    const fx = from * (cw + gap) + cw / 2, y = top + bh + 50, w = cw + 30, x = Math.min(W - w, fx - w / 2 + 40);
    svg += `<g class="fl-kconv"><path d="M${fx},${top + bh + 32} L${fx},${y - 3}" marker-end="url(#fk)"/></g>
      <a href="/tracker/${id}${qs2}" class="fl-step fl-side"><title>${name}: ${at[id]}</title><rect class="fl-kbox" x="${x}" y="${y}" width="${w}" height="54" rx="8"/><text class="fl-kname" x="${x + 12}" y="${y + 22}">${name}</text><text class="fl-knum" x="${x + 12}" y="${y + 44}">${at[id].toLocaleString('en-US')} bills</text></a>`;
  });
  svg += `</svg>`;
  const side = [];
  return { svg, side, total: list.length, at, reached, steps, qs };
}

function filterBar(base, q, keep = []) {
  const make = (k, v) => { const u = new URLSearchParams(q); if (v == null) u.delete(k); else u.set(k, v); u.delete('page'); const s = u.toString(); return base + (s ? '?' + s : ''); };
  const seg = (k, opts, lab) => `<div class="seg sm" role="group" aria-label="${lab}">${opts.map(([v, l]) => `<a href="${make(k, v)}" aria-pressed="${(q.get(k) || null) === v}">${l}</a>`).join('')}</div>`;
  return seg('kind', [[null, 'Bills'], ['resolutions', 'Resolutions']], 'Kind') + seg('origin', [[null, 'Both Chambers'], ['House', 'House'], ['Senate', 'Senate']], 'Chamber of origin');
}

// ---------- stage finder ----------
function finder(stage, q) {
  const st = STEPS.find(s => s.id === stage) || SIDE.find(s => s.id === stage); if (!st) return null;
  const text = (q.get('q') || '').trim().toLowerCase(), area = q.get('area') || '', party = q.get('party') || '', sort = q.get('sort') || 'recent';
  let list = pool(q).filter(([, b]) => stepOf(b) === stage);
  const areas = [...new Set(list.map(([, b]) => b.policyArea).filter(Boolean))].sort();
  if (area) list = list.filter(([, b]) => b.policyArea === area);
  if (party) list = list.filter(([, b]) => { const p = D.byId.get(b.sponsor); return p && p.party === party; });
  if (text) list = list.filter(([k, b]) => (label(k) + ' ' + k + ' ' + (b.short || '') + ' ' + b.title + ' ' + (b.subjects || []).join(' ')).toLowerCase().includes(text));
  const sorters = { recent: (a, b) => (b[1].stageDate || '').localeCompare(a[1].stageDate || ''), cosponsors: (a, b) => (b[1].cosponsors || 0) - (a[1].cosponsors || 0), oldest: (a, b) => (a[1].introduced || '').localeCompare(b[1].introduced || '') };
  list.sort(sorters[sort] || sorters.recent);
  const per = 40, pages = Math.max(1, Math.ceil(list.length / per)), page = Math.min(Math.max(1, +q.get('page') || 1), pages);
  return { st, list, areas, page, pages, per, text, area, party, sort };
}

// ---------- per-bill timeline ----------
function classify(a) {
  const t = a.text || '';
  if (/Became Public Law|Became Private Law/i.test(t)) return { kind: 'law', lane: 'President', label: 'Became law' };
  if (/Signed by President/i.test(t)) return { kind: 'law', lane: 'President', label: 'Signed' };
  if (/Pocket Vetoed|Vetoed by President/i.test(t)) return { kind: 'kill', lane: 'President', label: 'Vetoed' };
  if (/Presented to President/i.test(t)) return { kind: 'step', lane: 'President', label: 'Sent to the President' };
  if (/over veto/i.test(t)) return { kind: /Failed/i.test(t) ? 'kill' : 'pass', lane: a.chamber === 'Senate' ? 'Senate' : 'House', label: /Failed/i.test(t) ? 'Veto override failed' : 'Veto overridden' };
  if (/Failed of passage|Failed passage|not agreed to in (House|Senate)/i.test(t)) return { kind: 'kill', lane: /Senate/.test(t) ? 'Senate' : 'House', label: 'Failed' };
  if (/Cloture (motion )?on .* not invoked|Cloture not invoked/i.test(t)) return { kind: 'kill', lane: 'Senate', label: 'Cloture failed' };
  if (/Cloture (motion )?on .* invoked|Cloture invoked/i.test(t)) return { kind: 'step', lane: 'Senate', label: 'Cloture invoked' };
  if (/^(?!Motion to reconsider).*\b(measure|resolution|bill)\b.*laid on the table/i.test(t) || /^Motion to table (the measure|the bill) agreed/i.test(t)) return { kind: 'kill', lane: a.chamber === 'Senate' ? 'Senate' : 'House', label: 'Tabled' };
  if (/Passed\/agreed to in House|^Passed House|On passage Passed|Agreed to in House/i.test(t)) return { kind: 'pass', lane: 'House', label: 'Passed the House' };
  if (/Passed\/agreed to in Senate|Passed Senate|Agreed to in Senate/i.test(t)) return { kind: 'pass', lane: 'Senate', label: 'Passed the Senate' };
  if (/Resolving differences|Conference report|concur/i.test(t)) return { kind: 'step', lane: a.chamber === 'Senate' ? 'Senate' : 'House', label: 'Resolving differences' };
  if (/Rules Committee Resolution .* Reported to House|Rule (H\. Res\.|provides)/i.test(t)) return { kind: 'step', lane: 'House', label: 'Rule for debate' };
  if (/Motion to proceed/i.test(t)) return { kind: 'step', lane: 'Senate', label: 'Motion to proceed' };
  if (/Reported|Ordered to be Reported|Placed on .*Calendar/i.test(t)) return { kind: 'step', lane: 'Committee', label: /Ordered to be Reported/i.test(t) ? 'Committee approved' : /Calendar/i.test(t) ? 'On the calendar' : 'Reported' };
  if (/Hearings? held|Markup|Subcommittee/i.test(t)) return { kind: 'minor', lane: 'Committee', label: /Markup/i.test(t) ? 'Markup' : 'Hearing' };
  if (/Referred to/i.test(t)) return { kind: 'minor', lane: 'Committee', label: 'Referred' };
  if (/Introduced in/i.test(t) || a.type === 'IntroReferral') return { kind: 'start', lane: a.chamber === 'Senate' ? 'Senate' : 'House', label: 'Introduced' };
  return { kind: 'minor', lane: a.chamber === 'Senate' ? 'Senate' : a.chamber === 'President' ? 'President' : 'House', label: '' };
}
const LANES = ['Committee', 'House', 'Senate', 'President'];
function timeline(k, b) {
  const acts = (b.actions || []).filter(a => a.date).map(a => ({ ...a, c: classify(a) }));
  if (!acts.length) return '';
  const t0 = Date.parse(b.introduced || acts[0].date), t1 = Math.max(Date.parse(acts[acts.length - 1].date), t0 + 864e5 * 30);
  const W = 1000, L = 96, R = 20, laneH = 46, top = 26, Hh = top + laneH * LANES.length + 34;
  const X = d => L + (Date.parse(d) - t0) / (t1 - t0) * (W - L - R);
  let s = `<svg class="tline" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Timeline of ${esc(label(k))}">`;
  LANES.forEach((ln, i) => { const y = top + i * laneH; s += `<rect class="tl-lane" x="${L}" y="${y + 6}" width="${W - L - R}" height="${laneH - 12}" rx="3"/><text class="tl-ln" x="${L - 10}" y="${y + laneH / 2 + 4}" text-anchor="end">${ln}</text>`; });
  // month ticks
  const d0 = new Date(t0); for (let m = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1)); m.getTime() <= t1; m.setUTCMonth(m.getUTCMonth() + 1)) {
    const x = L + (m.getTime() - t0) / (t1 - t0) * (W - L - R); const lab = m.getUTCMonth() === 0 ? String(m.getUTCFullYear()) : m.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    s += `<line class="tl-tick" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${top}" y2="${top + laneH * LANES.length}"/>${(t1 - t0) / 864e5 < 400 || m.getUTCMonth() % 3 === 0 ? `<text class="tl-tl" x="${x.toFixed(1)}" y="${Hh - 10}" text-anchor="middle">${lab}</text>` : ''}`;
  }
  // path through the major events
  const major = acts.filter(a => a.c.kind !== 'minor');
  const pts = major.map(a => [X(a.date), top + LANES.indexOf(a.c.lane) * laneH + laneH / 2]);
  if (pts.length > 1) s += `<polyline class="tl-path" points="${pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}"/>`;
  for (const a of acts) {
    const x = X(a.date), y = top + LANES.indexOf(a.c.lane) * laneH + laneH / 2;
    const tip = `<title>${esc(date(a.date))}: ${esc(a.text)}</title>`;
    if (a.c.kind === 'minor') s += `<circle class="tl-minor" cx="${x.toFixed(1)}" cy="${y}" r="3">${tip}</circle>`;
    else if (a.c.kind === 'kill') s += `<g class="tl-kill" transform="translate(${x.toFixed(1)},${y})"><circle r="9"/><path d="M-4,-4L4,4M4,-4L-4,4"/>${tip}</g>`;
    else if (a.c.kind === 'law') s += `<g class="tl-law" transform="translate(${x.toFixed(1)},${y})"><rect x="-8" y="-8" width="16" height="16" rx="2" transform="rotate(45)"/>${tip}</g>`;
    else s += `<circle class="tl-${a.c.kind}" cx="${x.toFixed(1)}" cy="${y}" r="${a.c.kind === 'pass' ? 8 : 6}">${tip}</circle>`;
  }
  s += `</svg>`;
  return s;
}
// what happened to it, including identical and related bills that moved on
function fate(k, b) {
  const out = [];
  const acts = (b.actions || []).map(a => ({ ...a, c: classify(a) }));
  for (const a of acts) if (a.c.kind === 'kill') out.push({ cls: 'kill', text: `${a.c.label}, ${date(a.date)}`, sub: a.text });
  const lastMajor = [...acts].reverse().find(a => a.c.kind !== 'minor');
  if (!['law', 'vetoed', 'failed'].includes(b.stage) && lastMajor) {
    const months = Math.round((Date.now() - Date.parse(lastMajor.date)) / (30.4 * 864e5));
    if (months >= 3) out.push({ cls: 'still', text: `No major action since ${date(lastMajor.date)} (${months} months)`, sub: `Last step: ${lastMajor.c.label || lastMajor.text}` });
  }
  const rel = (b.related || []).map(r => ({ ...r, b: D.bills.bills[r.key] })).filter(r => r.b);
  const ORDER = { law: 7, 'to-president': 6, vetoed: 6, 'passed-both': 5, 'passed-house': 4, 'passed-senate': 4, reported: 3, failed: 2, committee: 1, introduced: 0 };
  const moved = rel.filter(r => (ORDER[r.b.stage] || 0) > (ORDER[b.stage] || 0)).sort((x, y) => (ORDER[y.b.stage] || 0) - (ORDER[x.b.stage] || 0));
  for (const r of moved.slice(0, 6)) {
    const kind = r.rel.includes('Identical bill') ? 'Identical bill' : r.rel.includes('Procedurally related') ? 'Procedurally related' : 'Related bill';
    out.push({ cls: 'moved', text: `${kind} <a href="/bill/${r.key}">${esc(label(r.key))}</a> ${r.b.stage === 'law' ? `became ${esc(r.b.lawNumber || 'law')}` : `went further: ${esc(stageWord(r.b.stage))}`}`, sub: r.b.short || r.b.title, html: true });
  }
  return { out, rel };
}
function stageWord(s) { return ({ law: 'became law', 'to-president': 'sent to the President', vetoed: 'vetoed', 'passed-both': 'passed both chambers', 'passed-house': 'passed the House', 'passed-senate': 'passed the Senate', reported: 'reported by committee', failed: 'failed a floor vote', committee: 'in committee', introduced: 'introduced' })[s] || s; }

module.exports = { STEPS, SIDE, flow, finder, filterBar, timeline, fate, classify, stepOf, label, stageWord };
