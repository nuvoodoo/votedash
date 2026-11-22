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
  return { name: p.name, slug: p.slug, party: p.party, ch: p.chamber, seat: r ? r.seat : seatLbl(p), pct: p.race2026.pct, winner: r ? r.w.n : null, winnerParty: r ? r.w.p : null, winnerPct: r ? r.w.pc : null, winnerSlug: slugOf(wp), sameParty: r ? r.w.p === p.party : false };
}).sort((a, b) => a.ch.localeCompare(b.ch) * -1 || a.seat.localeCompare(b.seat));
const primaryLosers = current.flatMap(p => (p.primaries || []).filter(x => x.year === 2026 && !x.won && !x.special).map(x => ({
  name: p.name, slug: p.slug, party: p.party, seat: x.chamber === 'S' ? `${x.state} Senate` : `${x.state}-${x.district || 'AL'}`, sameSeat: x.chamber === p.chamber,
  pct: x.runoffPct ?? x.pct, runoff: x.runoffPct != null, winner: x.opponent ? x.opponent.name : null, winnerParty: x.opponent ? x.opponent.party || null : null, winnerPct: x.opponent && x.opponent.pct != null ? x.opponent.pct : null }))).sort((a, b) => b.sameSeat - a.sameSeat || a.seat.localeCompare(b.seat));
const close = raceRows.filter(r => r.margin != null).sort((a, b) => a.margin - b.margin).slice(0, 15).map(r => ({ ch: r.ch, seat: r.seat, winner: r.w.n, winnerParty: r.w.p, winnerSlug: slugOf(personFor(snap.races.find(x => x.id === r.id), r.w)), runnerUp: r.ru.n, runnerUpParty: r.ru.p, votes: r.w.v - r.ru.v, margin: r.margin, wPct: r.tot ? r.w.v / r.tot : null, ruPct: r.tot ? r.ru.v / r.tot : null, flip: !!(r.incParty && r.w.p !== r.incParty) }));
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
// two candidate records of one candidate can report the same principal committee: count that committee once
const pccOf = new Map(cn.map(c => [c[0], c[9]])), counted = new Set();
for (const [id, { race, cand }] of fecToRace) {
  const k = `${race.id}|${cand.n}|${pccOf.get(id) || id}`; if (counted.has(k)) continue; counted.add(k);
  add(raceMoney.get(race.id).cand, cand.n, receipts.get(id) || 0);
}
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
const nameOfCn = c => { const [ln, fn = ''] = c[1].split(','); return { last: norm(ln).replace(SUFFIX, '').trim(), given: norm(fn).replace(SUFFIX, '').split(' ').filter(Boolean) }; };
// last name, plus any given name's initial: FEC lists "MOORE, FELIX BARRY" for Barry Moore
const lastOk = (a, L) => a.last === L || a.last.split(' ').includes(L) || a.last.replace(/ /g, '') === L.replace(/-/g, '') || a.given.slice(1).includes(L); // "ARENHOLZ, ASHLEY HINSON"
const sameName = (c, n) => { const a = nameOfCn(c), L = lastOf(n); return lastOk(a, L) && (!a.given.length || a.given.some(g => g[0] === firstOf(n)[0])); };
// last name alone when it is the only one in the contest ("KRISHNAMOORTHI, S")
const nameIn = (c, list) => list.find(y => sameName(c, y.n)) || (l => l.length === 1 ? l[0] : null)(list.filter(y => lastOk(nameOfCn(c), lastOf(y.n))));
const partyOf = c => c[2] === 'DEM' ? 'D' : c[2] === 'REP' ? 'R' : 'O';
const pName = n => n.replace(/\b(the hon|hon|mr|mrs|ms|dr|jr|sr|ii|iii|iv)\b\.?/g, '').replace(/\s+/g, ' ').trim().replace(/\b([a-z])/g, m => m.toUpperCase());
// FEC candidate id -> our person record, for clean names and links
const personByFec = new Map(); for (const p of people) for (const f of (p.ids && p.ids.fec) || p.fec || []) personByFec.set(f, p);
const candName = cd => { const p = personByFec.get(cd[0]); return p ? p.name : pName(cd[1].split(',').reverse().join(' ').trim().toLowerCase()); };
// race difficulty: general elections by pre-election rating; primaries and specials by the result's margin
const DIFF_W = { Tossup: 1, Tilt: 0.8, Lean: 0.6, Likely: 0.3, Safe: 0.1 };
const raceRating = new Map(snap.races.map(x => [x.id, x.rating]));
const seatK = (st, ch, d) => ch === 'S' ? `${st} Senate` : `${st}-${d || 'AL'}`;
const marginCat = m => m == null ? null : m < 0.05 ? 'Tossup' : m < 0.10 ? 'Tilt' : m < 0.20 ? 'Lean' : m < 0.35 ? 'Likely' : 'Safe';
const rowMargin = (list, t2) => { const v = list.map(z => z.rpc ?? z.pc ?? 0).sort((a, b) => b - a); return t2 ? (v.length > 2 ? v[1] - v[2] : 1) : (v.length > 1 ? v[0] - v[1] : 1); };
let LAST = null; // the contest outcome() last resolved: { seat, stage, cat, rating, margin }
const outcome = (pgi, c) => { // true = won that contest, false = lost, null = not decided / not found
  LAST = null;
  const st = c[4], ch = c[5], d = +c[6] || 0, k = pgi[0];
  // the candidate's own seat first, then any seat in the state (a House member running for Senate keeps the House FEC id)
  const seatOk = x => x.ch === ch && (ch === 'S' || (x.d || 0) === d || (d <= 1 && (x.d || 0) <= 1));
  const pick = (list, has) => list.find(x => x.st === st && seatOk(x) && has(x)) || list.find(x => x.st === st && has(x));
  const genInfo = r => { const rating = raceRating.get(r.id) || null; LAST = { seat: r.seat, stage: 'General', rating, cat: rating ? rating.split(' ')[0] : marginCat(r.margin), margin: r.margin }; };
  const gen = () => { const h = fecToRace.get(c[0]); if (h) { genInfo(h.race); return h.cand === h.race.w; } const r = pick(raceRows, x => nameIn(c, x.cs)); if (!r) return null; genInfo(r); return nameIn(c, r.cs) === r.w; };
  if (k === 'G') return gen();
  if (k === 'S') { const r = pick(EX.specials.filter(x => x.y >= 2025), x => nameIn(c, x.c)); if (!r) return gen(); const m = rowMargin(r.c, false); LAST = { seat: seatK(r.st, r.ch, r.d), stage: 'Special', cat: marginCat(m), margin: m }; return !!nameIn(c, r.c).w; }
  const pts = [partyOf(c), 'T2'];
  const r = pick(EX.primaries.filter(x => x.y === 2026 && (pts.includes(x.pt) || !x.pt)), x => nameIn(c, x.c));
  if (r) { const m = rowMargin(r.c, r.pt === 'T2'); LAST = { seat: seatK(r.st, r.ch, r.d), stage: r.pt === 'T2' ? 'Top-two primary' : 'Primary', cat: marginCat(m), margin: m }; return !!nameIn(c, r.c).w; }
  // no primary on file: a 2026 general-election nominee won it unopposed
  const gr = pick(raceRows, x => nameIn(c, x.cs)); if (!gr) return null;
  LAST = { seat: gr.seat, stage: 'Primary', cat: 'Safe', margin: 1, unopposed: true }; return true;
};
const isr = new Map(); const isrCand = new Map(); let allCmte = 0, allIe = 0, allPrimIe = 0;
const outMemo = new Map(), infoMemo = new Map(), raceSp = new Map(), funderScores = {}, indAll = new Map(), ieByCand = new Map(), sideTot = {};
for (const c of lines('itpas2.txt')) {
  if (c[19] === 'X') continue;
  const tp = c[5], amt = +c[14], cd = cnById.get(c[16]);
  if (!amt || !cd || !['24K', '24Z', '24E', '24A'].includes(tp) || !/2026$/.test(c[3] || '')) continue;
  allCmte += amt; if (tp === '24E' || tp === '24A') { allIe += amt; if (c[3][0] !== 'G') allPrimIe += amt; }
  const pgi = (c[3] || 'P')[0], against = tp === '24A', pt = partyOf(cd);
  const ok = pgi + cd[0]; if (!outMemo.has(ok)) { outMemo.set(ok, outcome(pgi, cd)); infoMemo.set(ok, LAST); }
  const info = infoMemo.get(ok);
  const won = outMemo.get(ok), good = won == null ? null : against ? !won : won;
  // every committee's 2026 score, for the funder pages
  const fs0 = funderScores[c[0]] || (funderScores[c[0]] = { win: 0, lose: 0, open: 0, _r: new Map(), _c: new Map() });
  fs0[good == null ? 'open' : good ? 'win' : 'lose'] += amt;
  fs0[tp === '24K' || tp === '24Z' ? 'contrib' : 'ie'] = (fs0[tp === '24K' || tp === '24Z' ? 'contrib' : 'ie'] || 0) + amt;
  const sc = pgi === 'G' || pgi === 'S' ? 'g' : 'p', kind = tp === '24K' || tp === '24Z' ? 'contrib' : 'ie';
  // totals by the party a dollar helped: for a candidate, or against the other party's candidate
  // in a primary, money against a candidate still helps a candidate of the same party
  const side = sc === 'p' || !against ? pt : pt === 'D' ? 'R' : pt === 'R' ? 'D' : 'O';
  for (const k of ['a', sc]) { const T = sideTot[k] || (sideTot[k] = {}); const t = T[side] || (T[side] = { win: 0, lose: 0, open: 0 }); t[good == null ? 'open' : good ? 'win' : 'lose'] += amt; }
  if (side === 'D' || side === 'R') { const L = fs0._l || (fs0._l = { D: 0, R: 0 }); L[side] += amt; }
  const fsc = fs0[sc] || (fs0[sc] = { win: 0, lose: 0, contrib: 0, ie: 0 }); fsc[good == null ? 'open' : good ? 'win' : 'lose'] = (fsc[good == null ? 'open' : good ? 'win' : 'lose'] || 0) + amt; fsc[kind] += amt;
  if (kind === 'contrib' && good != null) { const io = ind.committees[c[0]]; if (io) for (const key of [io.industry, sc + '|' + io.industry]) { const t = indAll.get(key) || { win: 0, lose: 0 }; indAll.set(key, t); t[good ? 'win' : 'lose'] += amt; } }
  if (kind === 'ie') { const m = ieByCand.get(cd[0]) || new Map(); ieByCand.set(cd[0], m); const x = m.get(c[0]) || { for: 0, against: 0, p: 0, g: 0, pA: 0, pF: 0 }; m.set(c[0], x); x[against ? 'against' : 'for'] += amt; x[sc] += amt; if (sc === 'p') x[against ? 'pA' : 'pF'] += amt; }
  const ck0 = cd[0] + '|' + pgi + '|' + (against ? 'A' : 'F');
  if (good != null) fs0._r.set(ck0, { good, w: DIFF_W[info && info.cat] || 0.1, sc });
  { const x = fs0._c.get(ck0) || { cand: cd[0], name: candName(cd), slug: (personByFec.get(cd[0]) || {}).slug || null, p: pt, seat: info ? info.seat : seatK(cd[4], cd[5], +cd[6] || 0), stage: info ? info.stage : pgi === 'G' ? 'General' : 'Primary', cat: info ? info.cat : null, rating: info ? info.rating || null : null, side: against ? 'against' : 'for', amt: 0, good }; fs0._c.set(ck0, x); x.amt += amt; }
  if (info) { const rk = info.seat + '|' + info.stage, m = raceSp.get(rk) || new Map(); raceSp.set(rk, m); const kk = c[0] + '|' + cd[0] + '|' + (against ? 'A' : 'F'); const x = m.get(kk) || { cm: c[0], cand: cd[0], p: pt, side: against ? 'against' : 'for', amt: 0 }; m.set(kk, x); x.amt += amt; }
  if (!ISRAEL.has(c[0])) continue;
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
// source: the AIPAC rows of the FEC individual-contributions bulk file (indiv26), extracted by aipac-earmarks-bulk.sh:
// contributions earmarked through AIPAC PAC (OTHER_ID C00797670) as reported by the recipient campaigns
const EARM = fs.existsSync(path.join(RAW, 'aipac-earmarks.txt'))
  ? lines('aipac-earmarks.txt').filter(c => c[0] !== 'C00797670' && c[18] !== 'X').map(c => ({ rid: c[0], amt: +c[14], el: c[3] || 'P', desc: 'EARMARK' }))
  : fs.existsSync(path.join(RAW, 'aipac-earmarks.json')) ? J(RAW, 'aipac-earmarks.json') : [];
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
// biggest spenders and industries over every 2026 contest, each dollar judged by the contest it was spent on;
// scopes: all contests, general elections (with specials), primaries (with runoffs and conventions)
const mkScope = sc => {
  const sel = s => sc === 'a' ? s : s[sc] || { win: 0, lose: 0, contrib: 0, ie: 0 };
  const sp = Object.entries(funderScores).map(([id, s0]) => { const s = sel(s0); return { id, name: (fundById[id] && fundById[id].name) || cmName.get(id) || id, slug: fundById[id] ? fundById[id].slug : null,
    total: Math.round(s.win + s.lose), contrib: Math.round(s.contrib || 0), ie: Math.round(s.ie || 0), win: Math.round(s.win), lose: Math.round(s.lose) }; }).filter(x => x.total > 0).sort((a, b) => b.total - a.total);
  const ins = [...indAll.entries()].filter(([k]) => sc === 'a' ? !k.includes('|') : k.startsWith(sc + '|')).map(([k, t]) => { const id = k.replace(/^[gp]\|/, ''); return { id, name: indName.get(id) || id, win: Math.round(t.win), lose: Math.round(t.lose) }; })
    .filter(x => x.win + x.lose >= 250000).sort((a, b) => (b.win + b.lose) - (a.win + a.lose));
  const T = sideTot[sc] || {}; const totals = Object.fromEntries(['D', 'R', 'O'].filter(k => T[k]).map(k => [k, { win: Math.round(T[k].win), lose: Math.round(T[k].lose), open: Math.round(T[k].open) }]));
  return { totals, spenders: sp.slice(0, 25), industries: ins.slice(0, 20), losing: sp.filter(x => x.lose >= 1e6).sort((a, b) => b.lose - a.lose).slice(0, 15), winning: sp.filter(x => x.win >= 1e6).sort((a, b) => b.win - a.win).slice(0, 15) };
};
const scopes = { all: mkScope('a'), gen: mkScope('g'), prim: mkScope('p') };
const nameOfCm = id => (fundById[id] && fundById[id].name) || cmName.get(id) || id, slugOfCm = id => fundById[id] ? fundById[id].slug : null;
// eff = difficulty-weighted win rate; rankScore pulls it toward 50% by 3 tossups' worth of weight, so a perfect record in a few safe seats ranks below a strong record in many hard races
const effOf = (r, sc) => { const l = sc ? r.filter(x => x.sc === sc) : r, W = l.reduce((a, x) => a + x.w, 0), G = l.reduce((a, x) => a + (x.good ? x.w : 0), 0); return { n: l.length, won: l.filter(x => x.good).length, w: Math.round(W * 10) / 10, eff: W ? G / W : null, rs: (G + 1.5) / (W + 3) }; };
const MIN_RACES = 5;
const funderRaces = {};
for (const [k, v] of Object.entries(funderScores)) {
  const r = [...v._r.values()];
  const e = { a: effOf(r), g: effOf(r, 'g'), p: effOf(r, 'p') };
  // money effectiveness: each decided race counts by dollars spent x difficulty
  const C = [...v._c.values()].filter(x => x.good != null), stg = x => /General|Special/.test(x.stage) ? 'g' : 'p';
  const meOf = sc => { const l = sc ? C.filter(x => stg(x) === sc) : C, W = l.reduce((a, x) => a + x.amt * (DIFF_W[x.cat] || 0.1), 0); return W ? l.reduce((a, x) => a + (x.good ? x.amt * (DIFF_W[x.cat] || 0.1) : 0), 0) / W : null; };
  const me = { a: meOf(), g: meOf('g'), p: meOf('p') };
  if (v.win + v.lose >= 50000) funderRaces[k] = [...v._c.values()].sort((a, b) => b.amt - a.amt).slice(0, 25).map(x => { const o = { c: x.cand, n: x.name, sl: x.slug, p: x.p, s: x.seat, st: x.stage, k: x.cat, sd: x.side === 'against' ? 'A' : 'F', a: Math.round(x.amt), g: x.good }; if (x.rating) o.r = x.rating; return o; });
  funderScores[k] = { ld: v._l ? Math.round(v._l.D) : 0, lr: v._l ? Math.round(v._l.R) : 0, win: Math.round(v.win), lose: Math.round(v.lose), open: Math.round(v.open), races: r.length, won: r.filter(x => x.good).length, eff: e.a.eff, effW: e.a.w, _m: me, _e: e, _d: { g: v.g || { win: 0, lose: 0 }, p: v.p || { win: 0, lose: 0 } } };
}
// rank: difficulty-weighted win rate among committees with at least MIN_RACES decided races and $50K behind them
const effective = {};
for (const sc of ['a', 'g', 'p']) {
  const pool = Object.entries(funderScores).filter(([, f]) => { const e = f._e[sc], d = sc === 'a' ? f : f._d[sc]; return e.n >= MIN_RACES && e.eff != null && d.win + d.lose >= 50000; })
    .sort((x, y) => y[1]._e[sc].rs - x[1]._e[sc].rs || y[1]._e[sc].w - x[1]._e[sc].w);
  pool.forEach(([id, f], i) => { f['rank' + sc] = i + 1; f['of' + sc] = pool.length; });
  const mpool = pool.filter(([, f]) => f._m[sc] != null).sort((x, y) => y[1]._m[sc] - x[1]._m[sc] || (y[1].win + y[1].lose) - (x[1].win + x[1].lose));
  mpool.forEach(([id, f], i) => { f['mrank' + sc] = i + 1; f['mof' + sc] = mpool.length; });
  effective[sc] = pool.slice(0, 25).map(([id, f]) => { const e = f._e[sc], d = sc === 'a' ? f : f._d[sc]; return { id, name: nameOfCm(id), slug: slugOfCm(id), eff: e.eff, n: e.n, won: e.won, w: e.w, spent: Math.round(d.win + d.lose) }; });
}
// per-stage scorecards for the PAC page filter: g = general and special elections, p = primaries, runoffs and conventions
for (const f of Object.values(funderScores)) { f.st = {}; for (const k of ['g', 'p']) { const d = f._d[k], e = f._e[k]; if (!(d.win + d.lose)) continue; f.st[k] = { meff: f._m[k], mrank: f['mrank' + k] || null, mof: f['mof' + k] || null, win: Math.round(d.win), lose: Math.round(d.lose), open: Math.round(d.open || 0), races: e.n, won: e.won, eff: e.eff, rank: f['rank' + k] || null, of: f['of' + k] || null }; } }
for (const f of Object.values(funderScores)) { f.meff = f._m.a; f.mrank = f.mranka || null; f.mof = f.mofa || null; for (const k of ['mranka', 'mofa', 'mrankg', 'mofg', 'mrankp', 'mofp', '_m']) delete f[k]; f.rank = f.ranka || null; f.of = f.ofa || null; f.rankG = f.rankg || null; f.ofG = f.ofg || null; f.rankP = f.rankp || null; f.ofP = f.ofp || null; for (const k of ['ranka', 'ofa', 'rankg', 'ofg', 'rankp', 'ofp', '_e', '_d']) delete f[k]; }
const raceSpenders = {};
for (const [rk, m] of raceSp) {
  const byCm = new Map(); for (const x of m.values()) { const t = byCm.get(x.cm) || { id: x.cm, amt: 0, parts: [] }; byCm.set(x.cm, t); t.amt += x.amt; t.parts.push(x); }
  raceSpenders[rk] = [...byCm.values()].filter(t => t.amt >= 1000).map(t => { const f = funderScores[t.id] || {}; const top = t.parts.sort((a, b) => b.amt - a.amt)[0]; const cn0 = cnById.get(top.cand);
    return { id: t.id, n: nameOfCm(t.id), sl: slugOfCm(t.id), a: Math.round(t.amt), sd: top.side === 'against' ? 'A' : 'F', c: cn0 ? candName(cn0) : null, p: top.p, e: f.eff ?? null, rk: f.rank || null }; })
    .sort((a, b) => (a.rk || 1e9) - (b.rk || 1e9) || b.a - a.a).slice(0, 15);
}
// each person's 2026 contests, for the race lists on member pages
const personRaces = {};
const addPR = (p, k) => { if (!p || !raceSpenders[k]) return; const l = personRaces[p.id] || (personRaces[p.id] = []); if (!l.includes(k)) l.push(k); };
for (const r of raceRows) for (const c of r.cs) addPR(personFor(snap.races.find(x => x.id === r.id), c), r.seat + '|General');
for (const p of people) for (const x of (p.primaries || []).filter(x => x.year === 2026)) {
  const seat = seatK(x.state, x.chamber, x.district || 0);
  for (const st of x.special ? ['Special'] : ['Primary', 'Top-two primary']) addPR(p, seat + '|' + st);
}
fs.writeFileSync(path.join(OUT, 'pm-races.json'), JSON.stringify({ funderRaces, raceSpenders, personRaces }));
const R0 = o =>Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v) : v]));
const israelRows = [...isr.entries()].map(([g, s]) => R0({ id: g, name: ISRAEL_NAMES[g] || (fundById[g] && fundById[g].name) || cmName.get(g) || g, label: true, slug: (fundById[g === 'AIPAC' ? 'C00799031' : g] || {}).slug || null, ...s, ids: undefined }))
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
const wb = new Map(lines('weball26.txt').map(w => [w[0], { raised: +w[5] || 0, indiv: +w[17] || 0, pac: +w[25] || 0 }]));
const fecIdFor = (st, ch, d, n) => { const pool = cn.filter(c => c[4] === st && c[2] !== 'REP'); const at = pool.filter(c => c[5] === ch && (ch === 'S' || (+c[6] || 0) === (d || 0)));
  const best = rows => { const h = rows.filter(c => sameName(c, n)); const l = h.length ? h : (x => x.length ? x : [])(rows.filter(c => lastOk(nameOfCn(c), lastOf(n)))); const ids = l.length && new Set(l.map(c => nameOfCn(c).last)).size === 1 ? l : []; return ids.sort((a, b) => ((wb.get(b[0]) || {}).raised || 0) - ((wb.get(a[0]) || {}).raised || 0))[0]; };
  const hit = best(at) || best(pool); return hit ? hit[0] : null; };
const nameIn2 = (n, rows) => rows.find(c => sameName(c, n)) || (l => l.length === 1 ? l[0] : null)(rows.filter(c => lastOk(nameOfCn(c), lastOf(n))));
const moneyOf = id => { if (!id) return null; const w = wb.get(id) || { raised: null, indiv: null, pac: null }; let f = 0, ag = 0, pf = 0, pa = 0; for (const x of (ieByCand.get(id) || new Map()).values()) { f += x.for; ag += x.against; pf += x.pF; pa += x.pA; } return { raised: w.raised == null ? null : Math.round(w.raised), indiv: w.indiv == null ? null : Math.round(w.indiv), pac: w.pac == null ? null : Math.round(w.pac), ieFor: Math.round(f), ieAgainst: Math.round(ag), primFor: Math.round(pf), primAgainst: Math.round(pa) }; };
const opp = (list, c, k) => [...list].filter(x => x !== c && !/^write-?in/i.test(x.n)).sort((a, b) => b.v - a.v).slice(0, k).map(x => ({ n: x.n, p: x.p, pct: x.rpc ?? x.pc, w: !!x.w }));
const progList = [...progs.values()].map(o => {
  const pr = primFor(o.st, o.ch, o.d, o.name), ge = genFor(o.st, o.ch, o.d, o.name), fid = fecIdFor(o.st, o.ch, o.d, o.name);
  const pp = personFor({ cat: o.ch === 'S' ? 'senate' : 'house', state: o.st }, { n: o.name });
  return { ...o, slug: slugOf(pp), inc: isInc(o.st, o.ch, o.d, o.name),
    fec: fid, money: moneyOf(fid),
    prim: pr ? { won: !!pr.c.w, pct: pr.c.rpc ?? pr.c.pc, field: pr.r.c.filter(z => z.pc >= 0.05).length, t2: pr.r.pt === 'T2', opp: opp(pr.r.c, pr.c, 3) } : null,
    gen: ge ? { won: ge.c === ge.r.w, pct: ge.c.pc, party: ge.c.p, opp: opp(ge.r.cs, ge.c, 2).map(x => ({ ...x, pct: x.pct })), rating: snap.races.find(x => x.id === ge.r.id).rating, tp: ge.c.p === 'D' ? twoParty(ge.r, ge.c) : null } : null };
}).filter(o => o.prim || o.gen);
const progNames = new Set(progList.map(o => o.seat + '|' + norm(o.name)));
const isProg = (seat, n) => progNames.has(seat + '|' + norm(n)) || progList.some(o => o.seat === seat && nameEq(o.name, n));
// primaries: candidates with at least 10% of the vote in a Democratic (or top-two) primary with two or more such candidates
const primRows = [];
for (const r of demPrim) {
  const seat = seatKey(r.st, r.ch, r.d), field = r.c.filter(z => z.pc >= 0.10 && (r.pt === 'D' || z.p === 'D'));
  if (field.length < 2) continue;
  for (const c of field) { const id = fecIdFor(r.st, r.ch, r.d, c.n); primRows.push({ prog: isProg(seat, c.n), inc: isInc(r.st, r.ch, r.d, c.n), won: !!c.w, m: moneyOf(id) }); }
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
// money in contested Democratic primaries: progressive vs other candidates
const med = a => { const v = a.filter(x => x != null).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : null; };
const mStats = l => { const m = l.map(x => x.m).filter(Boolean), mr = m.filter(x => x.raised != null); const R = mr.reduce((s, x) => s + x.raised, 0);
  return { n: m.length, medRaised: med(mr.map(x => x.raised)), pacShare: R ? mr.reduce((s, x) => s + x.pac, 0) / R : null, ieFor: m.reduce((s, x) => s + x.primFor, 0), ieAgainst: m.reduce((s, x) => s + x.primAgainst, 0), targeted: m.filter(x => x.primAgainst > 0).length }; };
const finance = { progChal: mStats(primRows.filter(x => x.prog && !x.inc)), otherChal: mStats(primRows.filter(x => !x.prog && !x.inc)),
  progInc: mStats(primRows.filter(x => x.prog && x.inc)), otherInc: mStats(primRows.filter(x => !x.prog && x.inc)) };
// outside spending on endorsed progressive candidates, by spender
const endorsedIds = new Set(progList.filter(o => o.fec && o.groups.some(g => !['CPCM', 'LINE'].includes(g))).map(o => o.fec));
const bySp = new Map();
for (const id of endorsedIds) for (const [cm, x] of (ieByCand.get(id) || new Map())) { const t = bySp.get(cm) || { for: 0, against: 0, pA: 0, pF: 0, cands: new Set() }; bySp.set(cm, t); t.for += x.for; t.against += x.against; t.pA += x.pA; t.pF += x.pF; t.cands.add(id); }
const spRow = ([cm, t]) => ({ id: cm, name: (fundById[cm] && fundById[cm].name) || cmName.get(cm) || cm, slug: fundById[cm] ? fundById[cm].slug : null, for: Math.round(t.for), against: Math.round(t.against), primFor: Math.round(t.pF), primAgainst: Math.round(t.pA), cands: t.cands.size });
finance.against = [...bySp].filter(([, t]) => t.against > 0).map(spRow).sort((a, b) => b.against - a.against).slice(0, 12);
finance.for = [...bySp].filter(([, t]) => t.for > 0).map(spRow).sort((a, b) => b.for - a.for).slice(0, 12);
const progressive = { finance, groups: byGroup, primary, general, candidates: progList.sort((a, b) => a.seat.localeCompare(b.seat)),
  platforms: PF.platforms || [], issues: { sites: withIss.length, counts: issueCounts } };

const out = { built: new Date().toISOString(), electionDate: '2026-11-03',
  seats: { H: { before: hBefore, after: hAfter }, S: { before: sBefore, after: sAfter } },
  counts: { reElected: current.filter(p => p.race2026 && p.race2026.ran && p.race2026.won).length, flips: flips.length, defeated: defeated.length, primaryLosers: primaryLosers.filter(x => x.sameSeat).length, newcomers },
  flips, defeated, primaryLosers, close, caucuses, ballot, ballotMoney,
  votes: { summary: voteSummary, splits, keyLaws },
  money: { totals, scopes, effective, spenders: scopes.all.spenders, industries: scopes.all.industries, costly, outspent, losingSpenders: scopes.all.losing },
  israel, progressive, funderScores,
};
fs.writeFileSync(path.join(OUT, 'postmortem.json'), JSON.stringify(out));
console.log('postmortem', JSON.stringify({ seats: out.seats, counts: out.counts, fecMatched: fecToRace.size, races: raceRows.length, splits: splits.length, keyLaws: keyLaws.length, spenders: spenders.length, totals }));
