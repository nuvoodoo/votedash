// 2026 election post-mortem: writes server/congress/data/postmortem.json.
// Inputs: data/raw/snapshot.json (2026 results), FEC 2026 bulk files in data/raw (cn, cm, weball26, itpas2),
// the built people/rollcalls/bills/caucuses/industries/funders data, and tools/congress/static/ballot-2026*.json.
'use strict';
const fs = require('fs');
const path = require('path');
const RAW = process.env.CONGRESS_RAW || path.join(__dirname, '../../../data/raw');
const OUT = process.env.CONGRESS_OUT || path.join(__dirname, '../../../server/congress/data');
const STATIC = path.join(__dirname, '../static');
const J = (dir, f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const lines = f => fs.readFileSync(path.join(RAW, f), 'latin1').split('\n').filter(Boolean).map(l => l.replace(/\r$/, '').split('|'));

const snap = J(RAW, 'snapshot.json');
const people = J(OUT, 'people.json');
const { order, rollcalls } = J(OUT, 'rollcalls.json');
const bills = J(OUT, 'bills.json');
const cauc = J(OUT, 'caucuses.json');
const ind = J(OUT, 'industries.json');
const funders = J(OUT, 'funders.json');
const byId = new Map(people.map(p => [p.id, p]));
const current = people.filter(p => p.status !== 'elect');

const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').trim();
const SUFFIX = /\b(jr|sr|ii|iii|iv)\b/g;
const lastOf = n => norm(n).replace(SUFFIX, '').trim().split(' ').pop();
const firstOf = n => norm(n).split(' ')[0];

// ---------- races ----------
const fed = snap.races.filter(r => ['house', 'senate'].includes(r.cat));
const distOf = r => r.cat === 'senate' ? null : (/-(\d+)$/.test(r.district || '') ? +r.district.split('-')[1] : 0);
const seatOf = r => r.cat === 'senate' ? `${r.stateName} Senate` : `${r.state}-${distOf(r) || 'AL'}`;
const personFor = (r, c) => {
  const ch = r.cat === 'senate' ? 'S' : 'H';
  const pool = people.filter(p => (p.status === 'elect' ? p.chamber === ch && p.state === r.state : p.state === r.state));
  return pool.find(p => norm(p.name) === norm(c.n)) || pool.find(p => lastOf(p.name) === lastOf(c.n) && firstOf(p.name)[0] === firstOf(c.n)[0]) || null;
};
const decided = fed.filter(r => r.called && r.cands.length);
const raceRows = decided.map(r => {
  const cs = [...r.cands].filter(c => !/^write-?in/i.test(c.n)).sort((a, b) => b.v - a.v);
  const w = cs.find(c => c.w) || cs[0], ru = cs.find(c => c !== w) || null;
  const tot = cs.reduce((s, c) => s + c.v, 0);
  // prior party: the feed's incumbent party, else the current holder tied to this race, else the district's current member
  const holders = current.filter(p => p.race2026 && p.race2026.id === r.id);
  const seatHolder = r.cat === 'house' ? current.find(p => p.chamber === 'H' && p.state === r.state && (p.district || 0) === distOf(r)) : null;
  const incParty = r.incParty || (holders[0] && holders[0].party) || (seatHolder && seatHolder.party) || null;
  return { id: r.id, ch: r.cat === 'senate' ? 'S' : 'H', st: r.state, d: distOf(r), seat: seatOf(r), open: !!r.open, incParty, w, ru, tot, cs,
    margin: ru && tot ? (w.v - ru.v) / tot : null };
});

// ---------- seats ----------
const cnt = l => l.reduce((o, x) => (o[x] = (o[x] || 0) + 1, o), {});
const hBefore = cnt(current.filter(p => p.chamber === 'H' && !p.delegate).map(p => p.party));
hBefore.vacant = 435 - Object.values(hBefore).reduce((a, b) => a + b, 0);
const hRaces = fed.filter(r => r.cat === 'house');
const hAfter = cnt(raceRows.filter(r => r.ch === 'H').map(r => r.w.p));
hAfter.undecided = hRaces.filter(r => !r.called).length;
const sBefore = cnt(current.filter(p => p.chamber === 'S').map(p => p.party));
const holdovers = current.filter(p => p.chamber === 'S' && p.termEnd > '2027-01-04');
const sAfter = cnt([...holdovers.map(p => p.party), ...raceRows.filter(r => r.ch === 'S').map(r => r.w.p)]);
sAfter.undecided = fed.filter(r => r.cat === 'senate' && !r.called).length;

// ---------- candidates ----------
const slugOf = p => p ? p.slug : null;
const flips = raceRows.filter(r => r.incParty && r.w.p !== r.incParty).map(r => {
  const wp = personFor(snap.races.find(x => x.id === r.id), r.w);
  const inc = current.find(p => p.race2026 && p.race2026.id === r.id && p.race2026.ran && !p.race2026.won);
  return { ch: r.ch, seat: r.seat, from: r.incParty, to: r.w.p, winner: r.w.n, winnerSlug: slugOf(wp), pct: r.w.pc, margin: r.margin, defeated: inc ? inc.name : null, defeatedSlug: slugOf(inc), open: r.open };
}).sort((a, b) => a.ch.localeCompare(b.ch) * -1 || a.seat.localeCompare(b.seat));
const seatLbl = p => p.chamber === 'S' ? `${p.state} Senate` : `${p.state}-${p.district || 'AL'}`;
const defeated = current.filter(p => p.race2026 && p.race2026.ran && p.race2026.decided && !p.race2026.won).map(p => {
  const r = raceRows.find(x => x.id === p.race2026.id);
  const wp = r && personFor(snap.races.find(x => x.id === r.id), r.w);
  return { name: p.name, slug: p.slug, party: p.party, ch: p.chamber, seat: r ? r.seat : seatLbl(p), pct: p.race2026.pct, winner: r ? r.w.n : null, winnerParty: r ? r.w.p : null, winnerSlug: slugOf(wp), sameParty: r ? r.w.p === p.party : false };
}).sort((a, b) => a.ch.localeCompare(b.ch) * -1 || a.seat.localeCompare(b.seat));
const primaryLosers = current.flatMap(p => (p.primaries || []).filter(x => x.year === 2026 && !x.won && !x.special).map(x => ({
  name: p.name, slug: p.slug, party: p.party, seat: x.chamber === 'S' ? `${x.state} Senate` : `${x.state}-${x.district || 'AL'}`, sameSeat: x.chamber === p.chamber,
  pct: x.runoffPct ?? x.pct, runoff: x.runoffPct != null, winner: x.opponent ? x.opponent.name : null }))).sort((a, b) => b.sameSeat - a.sameSeat || a.seat.localeCompare(b.seat));
const close = raceRows.filter(r => r.margin != null).sort((a, b) => a.margin - b.margin).slice(0, 15).map(r => ({ ch: r.ch, seat: r.seat, winner: r.w.n, winnerParty: r.w.p, winnerSlug: slugOf(personFor(snap.races.find(x => x.id === r.id), r.w)), runnerUp: r.ru.n, runnerUpParty: r.ru.p, votes: r.w.v - r.ru.v, margin: r.margin, flip: !!(r.incParty && r.w.p !== r.incParty) }));
const newcomers = people.filter(p => p.status === 'elect').length;

// ---------- caucuses ----------
const fate = p => {
  if (p.chamber === 'S' && !(p.termEnd <= '2027-01-04')) return 'notUp';
  if (p.race2026 && p.race2026.ran) return p.race2026.won ? 'reElected' : p.race2026.decided ? 'lostGeneral' : 'undecided';
  if (p.elect) return 'otherOffice';
  const pr = (p.primaries || []).filter(x => x.year === 2026 && !x.special);
  if (pr.some(x => !x.won && x.chamber === p.chamber)) return 'lostPrimary';
  if (pr.length) return 'otherOffice';
  return 'retired';
};
const caucuses = cauc.caucuses.map(c => {
  const ms = Object.entries(cauc.members).filter(([, l]) => l.includes(c.id)).map(([id]) => byId.get(id)).filter(p => p && p.status !== 'elect');
  const f = cnt(ms.map(fate));
  const lost = ms.filter(p => ['lostGeneral', 'lostPrimary'].includes(fate(p))).map(p => ({ name: p.name, slug: p.slug, how: fate(p) }));
  return { id: c.id, name: c.name, party: c.party, members: ms.length, reElected: f.reElected || 0, lostGeneral: f.lostGeneral || 0, lostPrimary: f.lostPrimary || 0, otherOffice: f.otherOffice || 0, retired: f.retired || 0, lost };
});

// ---------- ballot measures ----------
const ISSUES = [['abortion', 'Abortion'], ['voting', 'Voting rules and voter ID'], ['gender', 'Transgender policy'], ['tax', 'Taxes'], ['elections', 'Primaries, maps and campaign money'], ['direct', 'Ballot measure rules'], ['crime', 'Crime and bail'], ['immigration', 'Immigration and foreign adversaries'], ['guns', 'Guns and hunting'], ['drugs', 'Marijuana'], ['gambling', 'Sports betting'], ['labor', 'Wages and unions'], ['rights', 'Civil rights and religion'], ['housing', 'Housing'], ['health', 'Health care'], ['edu', 'Schools'], ['env', 'Water, land and energy'], ['culture', 'Patriotic and cultural'], ['gov', 'Government and courts']];
const SUPER = { CO: 55, FL: 60, NH: 66.7 };
const measures = J(STATIC, 'ballot-2026.json').map(m => ({ ...m, needed: !m.passed && m.yes > 50 ? SUPER[m.st] || null : null }));
const ballot = ISSUES.map(([id, label]) => { const ms = measures.filter(m => m.issue === id).sort((a, b) => a.st.localeCompare(b.st)); return { id, label, passed: ms.filter(m => m.passed).length, failed: ms.filter(m => !m.passed).length, measures: ms }; }).filter(g => g.measures.length);
const ballotMoney = J(STATIC, 'ballot-2026-money.json').map(x => { const m = measures.find(y => y.st === x.st && y.title === x.title); return m ? { ...x, label: m.label, passed: m.passed, yes: m.yes } : null; }).filter(Boolean)
  .sort((a, b) => (b.support + b.oppose) - (a.support + a.oppose));

// ---------- how the defeated voted ----------
const ran = current.filter(p => p.race2026 && p.race2026.ran && p.race2026.decided);
const lostIds = new Set(ran.filter(p => !p.race2026.won).map(p => p.id)), wonIds = new Set(ran.filter(p => p.race2026.won).map(p => p.id));
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const grp = (set, party) => { const ps = [...set].map(id => byId.get(id)).filter(p => p.party === party && p.votes); return { n: ps.length, unity: avg(ps.map(p => p.votes.unity)), nominate: avg(ps.filter(p => p.nominate != null).map(p => p.nominate)) }; };
const voteSummary = { R: { lost: grp(lostIds, 'R'), won: grp(wonIds, 'R') }, D: { lost: grp(lostIds, 'D'), won: grp(wonIds, 'D') } };
const PASS = /Passage|Concur|Conference Report|On the Joint Resolution|Suspend the Rules and Pass|Override/i;
const voteRows = [];
for (const r of rollcalls) {
  if (!PASS.test(r.question)) continue;
  const ids = order[r.chamber], g = { LR: [0, 0], WR: [0, 0], WD: [0, 0] };
  [...r.codes].forEach((c, i) => {
    if (c !== 'Y' && c !== 'N') return; const id = ids[i], p = byId.get(id); if (!p) return;
    const k = p.party === 'R' ? (lostIds.has(id) ? 'LR' : wonIds.has(id) ? 'WR' : null) : (wonIds.has(id) ? 'WD' : null);
    if (k) g[k][c === 'Y' ? 0 : 1]++;
  });
  const y = a => a[0] + a[1] ? a[0] / (a[0] + a[1]) : null;
  if (g.LR[0] + g.LR[1] < 10) continue;
  const bk = bills.rollcallBill && bills.rollcallBill[r.k], b = bk && bills.bills[bk];
  if (!b) continue;
  voteRows.push({ k: r.k, ch: r.chamber, date: r.date, bill: bk, label: b.short || b.title, law: !!b.law, lostR: y(g.LR), wonR: y(g.WR), wonD: y(g.WD), yea: r.yea, nay: r.nay, n: g.LR[0] + g.LR[1] });
}
const splits = voteRows.filter(v => Math.abs(v.lostR - v.wonR) >= 0.15).sort((a, b) => Math.abs(b.lostR - b.wonR) - Math.abs(a.lostR - a.wonR)).slice(0, 12);
const keyLaws = voteRows.filter(v => v.law && Math.min(v.yea, v.nay) / (v.yea + v.nay) >= 0.3).sort((a, b) => a.date.localeCompare(b.date));

// ---------- money ----------
const cn = lines('cn.txt').filter(c => c[3] === '2026' && (c[5] === 'H' || c[5] === 'S'));
const receipts = new Map(lines('weball26.txt').map(w => [w[0], +w[5] || 0]));
const cmName = new Map(lines('cm.txt').map(c => [c[0], c[1]]));
const fecToRace = new Map(); // FEC id -> { race, cand }
for (const r of raceRows) {
  for (const c of r.cs) {
    const pool = cn.filter(x => x[4] === r.st && x[5] === r.ch && (r.ch === 'S' || +x[6] === (r.d || 0) || (r.d === 0 && +x[6] <= 1)));
    const lname = lastOf(c.n), f0 = firstOf(c.n)[0];
    const hits = pool.filter(x => { const [ln, fn = ''] = x[1].split(','); const L = norm(ln); return (L === lname || L.split(' ').includes(lname) || L.replace(/ /g, '') === lname.replace(/-/g, '')) && (!fn.trim() || norm(fn)[0] === f0 || pool.filter(y => norm(y[1].split(',')[0]) === L).length === 1); });
    const p = personFor(snap.races.find(x => x.id === r.id), c);
    const ids = new Set(hits.map(h => h[0]));
    if (p) for (const f of (p.ids && p.ids.fec) || p.fec || []) if (cn.some(x => x[0] === f && x[4] === r.st && x[5] === r.ch)) ids.add(f);
    for (const id of ids) fecToRace.set(id, { race: r, cand: c });
  }
}
const raceMoney = new Map(raceRows.map(r => [r.id, { cand: new Map(), ieFor: new Map(), ieAgainst: new Map() }]));
const add = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
for (const [id, { race, cand }] of fecToRace) add(raceMoney.get(race.id).cand, cand.n, receipts.get(id) || 0);
const spend = new Map(); // cmte -> { contrib, ie, win, lose }
const indTot = new Map(); // industry -> { win, lose }
for (const c of lines('itpas2.txt')) {
  if (c[19] === 'X') continue;
  const tp = c[5], amt = +c[14], hit = fecToRace.get(c[16]);
  if (!amt || !hit || !['24K', '24Z', '24E', '24A'].includes(tp)) continue;
  const { race, cand } = hit;
  if (!race.ru) continue;
  const isW = cand === race.w;
  const good = tp === '24A' ? !isW : isW;
  const s = spend.get(c[0]) || { contrib: 0, ie: 0, win: 0, lose: 0 }; spend.set(c[0], s);
  if (tp === '24K' || tp === '24Z') s.contrib += amt; else s.ie += amt;
  s[good ? 'win' : 'lose'] += amt;
  const rm = raceMoney.get(race.id);
  if (tp === '24E') add(rm.ieFor, cand.n, amt); else if (tp === '24A') add(rm.ieAgainst, cand.n, amt);
  if (tp === '24K' || tp === '24Z') { const io = ind.committees[c[0]]; if (io) { const t = indTot.get(io.industry) || { win: 0, lose: 0 }; indTot.set(io.industry, t); t[good ? 'win' : 'lose'] += amt; } }
}
const fundById = funders;
const indName = new Map(ind.sectors.flatMap(s => s.industries.map(i => [i.id, i.name])));
const spenders = [...spend.entries()].map(([id, s]) => ({ id, name: (fundById[id] && fundById[id].name) || cmName.get(id) || id, slug: fundById[id] ? fundById[id].slug : null, total: Math.round(s.win + s.lose), contrib: Math.round(s.contrib), ie: Math.round(s.ie), win: Math.round(s.win), lose: Math.round(s.lose) }))
  .sort((a, b) => b.total - a.total);
const industries = [...indTot.entries()].map(([id, t]) => ({ id, name: indName.get(id) || id, win: Math.round(t.win), lose: Math.round(t.lose) })).filter(x => x.win + x.lose >= 250000).sort((a, b) => (b.win + b.lose) - (a.win + a.lose));
const side = (rm, c, other) => (rm.cand.get(c.n) || 0) + (rm.ieFor.get(c.n) || 0) + (other ? rm.ieAgainst.get(other.n) || 0 : 0);
const raceSpend = raceRows.filter(r => r.ru).map(r => {
  const rm = raceMoney.get(r.id);
  const cand = [...rm.cand.values()].reduce((a, b) => a + b, 0), outside = [...rm.ieFor.values(), ...rm.ieAgainst.values()].reduce((a, b) => a + b, 0);
  return { ch: r.ch, seat: r.seat, winner: r.w.n, winnerParty: r.w.p, winnerSlug: slugOf(personFor(snap.races.find(x => x.id === r.id), r.w)), loser: r.ru.n, loserParty: r.ru.p, loserSlug: slugOf(personFor(snap.races.find(x => x.id === r.id), r.ru)), margin: r.margin,
    cand: Math.round(cand), outside: Math.round(outside), total: Math.round(cand + outside), winSide: Math.round(side(rm, r.w, r.ru)), loseSide: Math.round(side(rm, r.ru, r.w)) };
});
const costly = [...raceSpend].sort((a, b) => b.total - a.total).slice(0, 15);
const outspent = raceSpend.filter(r => r.loseSide > r.winSide && r.loseSide >= 1e6).sort((a, b) => b.loseSide - a.loseSide).slice(0, 15);
const losingSpenders = spenders.filter(s => s.lose >= 1e6).sort((a, b) => b.lose - a.lose).slice(0, 15);
const totals = { all: raceSpend.reduce((s, r) => s + r.total, 0), losing: raceSpend.reduce((s, r) => s + r.loseSide, 0) };

// ---------- pro-Israel PACs: every 2026 House/Senate dollar, primaries included ----------
const EX = J(STATIC, 'elections-extra.json');
const ISRAEL = new Set([...Object.entries(ind.committees).filter(([, v]) => v.industry === 'pro-israel').map(([k]) => k),
  'C00490649', 'C00687657', 'C00712844', 'C00720128', 'C00755991', 'C00761965', 'C00922781']);
const ISRAEL_NAMES = { AIPAC: 'AIPAC and United Democracy Project', C00528554: 'RJC Victory Fund', C00710848: 'DMFI PAC (Democratic Majority for Israel)', C00815753: 'J Street Action Fund', C00441949: 'J Street PAC', C00345132: 'Republican Jewish Coalition PAC', C00127811: 'U.S. Israel PAC', C00247403: 'NORPAC', C00139659: 'JACPAC' };
const ISRAEL_GROUP = { C00797670: 'AIPAC', C00799031: 'AIPAC' }; // AIPAC PAC + its super PAC, United Democracy Project
const cnById = new Map(cn.map(c => [c[0], c]));
const nameOfCn = c => { const [ln, fn = ''] = c[1].split(','); return { last: norm(ln).replace(SUFFIX, '').trim(), f0: norm(fn)[0] || '' }; };
const sameName = (c, n) => { const a = nameOfCn(c), L = lastOf(n); return (a.last === L || a.last.split(' ').includes(L) || a.last.replace(/ /g, '') === L.replace(/-/g, '')) && (!a.f0 || firstOf(n)[0] === a.f0); };
const partyOf = c => c[2] === 'DEM' ? 'D' : c[2] === 'REP' ? 'R' : 'O';
const pName = n => n.replace(/\b([a-z])/g, m => m.toUpperCase());
const outcome = (pgi, c) => { // true = won that contest, false = lost, null = not decided / not found
  const st = c[4], ch = c[5], d = +c[6] || 0, k = pgi[0];
  const seatOk = x => x.st === st && x.ch === ch && (ch === 'S' || (x.d || 0) === d || (d <= 1 && (x.d || 0) <= 1));
  if (k === 'G') { const h = fecToRace.get(c[0]); if (h) return h.cand === h.race.w; const r = raceRows.find(x => x.st === st && x.ch === ch && (ch === 'S' || x.d === d)); return r ? (r.cs.some(x => sameName(c, x.n)) ? sameName(c, r.w.n) : false) : null; }
  if (k === 'S') { const r = EX.specials.find(x => x.y >= 2025 && seatOk(x) && x.c.some(y => sameName(c, y.n))); return r ? !!r.c.find(y => sameName(c, y.n)).w : null; }
  const pts = ch === 'S' ? [partyOf(c), 'T2'] : [partyOf(c), 'T2'];
  const rows = EX.primaries.filter(x => x.y === 2026 && seatOk(x) && (pts.includes(x.pt) || !x.pt));
  for (const r of rows) { const y = r.c.find(z => sameName(c, z.n)); if (y) return !!y.w; }
  return null;
};
const isr = new Map(); const isrCand = new Map(); let allCmte = 0, allIe = 0, allPrimIe = 0;
for (const c of lines('itpas2.txt')) {
  if (c[19] === 'X') continue;
  const tp = c[5], amt = +c[14], cd = cnById.get(c[16]);
  if (!amt || !cd || !['24K', '24Z', '24E', '24A'].includes(tp) || !/2026$/.test(c[3] || '')) continue;
  allCmte += amt; if (tp === '24E' || tp === '24A') { allIe += amt; if (c[3][0] !== 'G') allPrimIe += amt; }
  if (!ISRAEL.has(c[0])) continue;
  const pgi = (c[3] || 'P')[0], against = tp === '24A', pt = partyOf(cd);
  const won = outcome(pgi, cd), good = won == null ? null : against ? !won : won;
  const g = ISRAEL_GROUP[c[0]] || c[0];
  const s = isr.get(g) || { ids: new Set(), total: 0, contrib: 0, ie: 0, primary: 0, primIe: 0, forD: 0, forR: 0, againstD: 0, againstR: 0, other: 0, win: 0, lose: 0, open: 0 }; isr.set(g, s);
  s.ids.add(c[0]); s.total += amt; s[tp === '24K' || tp === '24Z' ? 'contrib' : 'ie'] += amt; if (pgi !== 'G') { s.primary += amt; if (tp === '24E' || tp === '24A') s.primIe += amt; }
  if (pt === 'O') s.other += amt; else s[(against ? 'against' : 'for') + pt] += amt;
  s[good == null ? 'open' : good ? 'win' : 'lose'] += amt;
  const ck = c[16] + '|' + pgi; const t = isrCand.get(ck) || { id: c[16], name: pName(cd[1].split(',').reverse().join(' ').trim().toLowerCase()), p: pt, seat: cd[5] === 'S' ? `${cd[4]} Senate` : `${cd[4]}-${+cd[6] || 'AL'}`, stage: pgi === 'G' ? 'General' : pgi === 'S' ? 'Special' : 'Primary', forAmt: 0, againstAmt: 0, won }; isrCand.set(ck, t);
  t[against ? 'againstAmt' : 'forAmt'] += amt;
}
// AIPAC PAC's bundled (earmarked) contributions forwarded to candidates: tools/congress/postmortem/aipac-earmarks.js
const cclCand = new Map(lines('ccl.txt').filter(c => c[2] === '2026').map(c => [c[3], c[0]]));
const EARM = fs.existsSync(path.join(RAW, 'aipac-earmarks.json')) ? J(RAW, 'aipac-earmarks.json') : [];
for (const e of EARM) {
  if (!/^EARMARK/i.test(e.desc || '') || !e.amt) continue;
  const cd = cnById.get(e.cid) || cnById.get(cclCand.get(e.rid)); if (!cd) continue;
  const pgi = /^G/.test(e.el || '') ? 'G' : /^S/.test(e.el || '') ? 'S' : /^G/.test(e.el || '') ? 'G' : 'P', amt = e.amt, pt = partyOf(cd);
  const won = outcome(pgi, cd);
  const s = isr.get('AIPAC'); s.total += amt; s.bundled = (s.bundled || 0) + amt; if (pgi !== 'G') s.primary += amt;
  if (pt === 'O') s.other += amt; else s['for' + pt] += amt;
  s[won == null ? 'open' : won ? 'win' : 'lose'] += amt;
  const ck = cd[0] + '|' + pgi; const t = isrCand.get(ck) || { id: cd[0], name: pName(cd[1].split(',').reverse().join(' ').trim().toLowerCase()), p: pt, seat: cd[5] === 'S' ? `${cd[4]} Senate` : `${cd[4]}-${+cd[6] || 'AL'}`, stage: pgi === 'G' ? 'General' : pgi === 'S' ? 'Special' : 'Primary', forAmt: 0, againstAmt: 0, won }; isrCand.set(ck, t);
  t.forAmt += amt; t.bundled = (t.bundled || 0) + amt;
}
const R0 =o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v) : v]));
const israelRows = [...isr.entries()].map(([g, s]) => R0({ name: ISRAEL_NAMES[g] || (fundById[g] && fundById[g].name) || cmName.get(g) || g, label: true, slug: (fundById[g === 'AIPAC' ? 'C00799031' : g] || {}).slug || null, ...s, ids: undefined }))
  .filter(s => s.total >= 50000).sort((a, b) => b.total - a.total);
const israelSum = R0(israelRows.reduce((o, s) => { for (const k of ['total', 'contrib', 'ie', 'bundled', 'primary', 'primIe', 'forD', 'forR', 'againstD', 'againstR', 'win', 'lose', 'open']) o[k] = (o[k] || 0) + (s[k] || 0); return o; }, {}));
const israel = { sum: israelSum, all: Math.round(allCmte), allIe: Math.round(allIe), allPrimIe: Math.round(allPrimIe), groups: israelRows,
  targets: [...isrCand.values()].map(t => { const pp = people.find(p => (p.ids && p.ids.fec || p.fec || []).includes(t.id)); return R0({ ...t, name: pp ? pp.name : t.name.replace(/\b(Jr|Sr|Ii|Iii|Iv)\b\.?/g, '').replace(/\s[A-Z]\.?(?=\s|$)/g, '').replace(/\s+/g, ' ').trim(), slug: slugOf(pp) }); }).filter(t => t.forAmt + t.againstAmt >= 250000).sort((a, b) => (b.forAmt + b.againstAmt) - (a.forAmt + a.againstAmt)).slice(0, 20) };

// ---------- progressives: DSA, Justice Democrats, Our Revolution, WFP, CPC PAC, CPC members, socialist lines ----------
const PF = fs.existsSync(path.join(STATIC, 'progressives-2026.json')) ? J(STATIC, 'progressives-2026.json') : { candidates: [] };
const nameEq = (a, b) => norm(a) === norm(b) || (lastOf(a) === lastOf(b) && firstOf(a)[0] === firstOf(b)[0]);
const seatKey = (st, ch, d) => ch === 'S' ? `${st} Senate` : `${st}-${d || 'AL'}`;
const progs = new Map(); // seat|name -> record
const addProg = (o, g) => {
  const k = [...progs.keys()].find(x => { const r = progs.get(x); return r.seat === seatKey(o.st, o.ch, o.d) && nameEq(r.name, o.name); }) || seatKey(o.st, o.ch, o.d) + '|' + o.name;
  const r = progs.get(k) || { name: o.name, st: o.st, ch: o.ch, d: o.ch === 'S' ? null : (o.d || 0), seat: seatKey(o.st, o.ch, o.d), groups: [], line: null }; progs.set(k, r);
  for (const x of [].concat(g)) if (x && !r.groups.includes(x)) r.groups.push(x);
  return r;
};
for (const c of PF.candidates) addProg(c, c.groups);
for (const [id, l] of Object.entries(cauc.members)) {
  const p = byId.get(id); if (!l.includes('progressive') || !p || p.status === 'elect') continue;
  if (!(p.race2026 && p.race2026.ran) && !(p.primaries || []).some(x => x.year === 2026 && !x.special && x.chamber === p.chamber)) continue;
  addProg({ name: p.name, st: p.state, ch: p.chamber, d: p.district || 0 }, 'CPCM');
}
const LEFT_LINE = /socialis|working families|working class|green|peace and freedom|psl|workers/i;
for (const r of fed) for (const c of r.cands) if (LEFT_LINE.test(c.pf || '') && !/national socialist/i.test(c.pf)) {
  const o = addProg({ name: c.n, st: r.state, ch: r.cat === 'senate' ? 'S' : 'H', d: distOf(r) }, 'LINE'); o.line = c.pf;
}
const demPrim = EX.primaries.filter(x => x.y === 2026 && (x.pt === 'D' || x.pt === 'T2'));
const primFor = (st, ch, d, n) => { for (const r of demPrim) { if (r.st !== st || r.ch !== ch || (ch === 'H' && (r.d || 0) !== (d || 0))) continue; const c = r.c.find(z => nameEq(z.n, n)); if (c) return { r, c }; } return null; };
const genFor = (st, ch, d, n) => { const r = raceRows.find(x => x.st === st && x.ch === ch && (ch === 'S' || x.d === (d || 0))); if (!r) return null; const c = r.cs.find(z => nameEq(z.n, n)); return c ? { r, c } : null; };
const isInc = (st, ch, d, n) => current.some(p => p.state === st && p.chamber === ch && (ch === 'S' || (p.district || 0) === (d || 0)) && nameEq(p.name, n));
const twoParty = (r, c) => { const o = r.cs.filter(x => x !== c && x.p === 'R').reduce((s, x) => s + x.v, 0); return c.v + o ? c.v / (c.v + o) : null; };
const progList = [...progs.values()].map(o => {
  const pr = primFor(o.st, o.ch, o.d, o.name), ge = genFor(o.st, o.ch, o.d, o.name);
  const pp = personFor({ cat: o.ch === 'S' ? 'senate' : 'house', state: o.st }, { n: o.name });
  return { ...o, slug: slugOf(pp), inc: isInc(o.st, o.ch, o.d, o.name),
    prim: pr ? { won: !!pr.c.w, pct: pr.c.rpc ?? pr.c.pc, field: pr.r.c.filter(z => z.pc >= 0.05).length, t2: pr.r.pt === 'T2' } : null,
    gen: ge ? { won: ge.c === ge.r.w, pct: ge.c.pc, party: ge.c.p, rating: snap.races.find(x => x.id === ge.r.id).rating, tp: ge.c.p === 'D' ? twoParty(ge.r, ge.c) : null } : null };
}).filter(o => o.prim || o.gen);
const progNames = new Set(progList.map(o => o.seat + '|' + norm(o.name)));
const isProg = (seat, n) => progNames.has(seat + '|' + norm(n)) || progList.some(o => o.seat === seat && nameEq(o.name, n));
// primaries: candidates with at least 10% of the vote in a Democratic (or top-two) primary with two or more such candidates
const primRows = [];
for (const r of demPrim) {
  const seat = seatKey(r.st, r.ch, r.d), field = r.c.filter(z => z.pc >= 0.10 && (r.pt === 'D' || z.p === 'D'));
  if (field.length < 2) continue;
  for (const c of field) primRows.push({ prog: isProg(seat, c.n), inc: isInc(r.st, r.ch, r.d, c.n), won: !!c.w });
}
const rate = l => ({ n: l.length, won: l.filter(x => x.won).length });
const primary = { prog: rate(primRows.filter(x => x.prog)), other: rate(primRows.filter(x => !x.prog)),
  progInc: rate(primRows.filter(x => x.prog && x.inc)), otherInc: rate(primRows.filter(x => !x.prog && x.inc)),
  progChal: rate(primRows.filter(x => x.prog && !x.inc)), otherChal: rate(primRows.filter(x => !x.prog && !x.inc)) };
// general: Democratic nominees by pre-election rating
const RATINGS = ['Safe D', 'Likely D', 'Lean D', 'Tilt D', 'Tossup', 'Tilt R', 'Lean R', 'Likely R', 'Safe R'];
const genRows = raceRows.map(r => { const c = r.cs.find(x => x.p === 'D'); if (!c) return null; return { prog: isProg(r.seat, c.n), rating: snap.races.find(x => x.id === r.id).rating, won: c === r.w, tp: twoParty(r, c) }; }).filter(Boolean);
const general = RATINGS.map(rt => { const g = genRows.filter(x => x.rating === rt), a = l => { const v = l.map(x => x.tp).filter(x => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  const P = g.filter(x => x.prog), O = g.filter(x => !x.prog); return { rating: rt, prog: { ...rate(P), share: a(P) }, other: { ...rate(O), share: a(O) } }; }).filter(x => x.prog.n);
const GROUPS = [['DSA', 'Democratic Socialists of America'], ['JD', 'Justice Democrats'], ['OR', 'Our Revolution'], ['WFP', 'Working Families Party'], ['CPC', 'Progressive Caucus PAC'], ['CPCM', 'Progressive Caucus members'], ['LINE', 'Socialist and left party lines']];
const byGroup = GROUPS.map(([id, label]) => { const l = progList.filter(o => o.groups.includes(id)); return { id, label, n: l.length, primWon: l.filter(o => o.prim && o.prim.won).length, primLost: l.filter(o => o.prim && !o.prim.won).length, genWon: l.filter(o => o.gen && o.gen.won).length, genLost: l.filter(o => o.gen && !o.gen.won && o.gen.party === 'D').length + l.filter(o => o.gen && !o.gen.won && o.gen.party !== 'D').length }; }).filter(g => g.n);
const ISS = fs.existsSync(path.join(STATIC, 'progressive-issues-2026.json')) ? J(STATIC, 'progressive-issues-2026.json') : [];
for (const o of progList) { const i = ISS.find(x => x.found && x.seat === o.seat && nameEq(x.name, o.name)); if (i) { o.issues = i.issues; o.top = i.top || []; o.site = i.website || null; } }
const withIss = progList.filter(o => o.issues);
const issueCounts = Object.entries(withIss.reduce((m, o) => { for (const k of o.issues) m[k] = (m[k] || 0) + 1; return m; }, {})).map(([id, n]) => ({ id, n, top: withIss.filter(o => (o.top || []).includes(id)).length,
  won: withIss.filter(o => o.issues.includes(id) && ((o.gen && o.gen.won) || (!o.gen && o.prim && o.prim.won))).length })).sort((a, b) => b.n - a.n);
const progressive = { groups: byGroup, primary, general, candidates: progList.sort((a, b) => a.seat.localeCompare(b.seat)),
  platforms: PF.platforms || [], issues: { sites: withIss.length, counts: issueCounts } };

const out = { built: new Date().toISOString(), electionDate: '2026-11-03',
  seats: { H: { before: hBefore, after: hAfter }, S: { before: sBefore, after: sAfter } },
  counts: { flips: flips.length, defeated: defeated.length, primaryLosers: primaryLosers.filter(x => x.sameSeat).length, newcomers },
  flips, defeated, primaryLosers, close, caucuses, ballot, ballotMoney,
  votes: { summary: voteSummary, splits, keyLaws },
  money: { totals, spenders: spenders.slice(0, 25), industries: industries.slice(0, 20), costly, outspent, losingSpenders },
  israel, progressive,
};
fs.writeFileSync(path.join(OUT, 'postmortem.json'), JSON.stringify(out));
console.log('postmortem', JSON.stringify({ seats: out.seats, counts: out.counts, fecMatched: fecToRace.size, races: raceRows.length, splits: splits.length, keyLaws: keyLaws.length, spenders: spenders.length, totals }));
