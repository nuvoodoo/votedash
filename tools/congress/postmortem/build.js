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

const out = { built: new Date().toISOString(), electionDate: '2026-11-03',
  seats: { H: { before: hBefore, after: hAfter }, S: { before: sBefore, after: sAfter } },
  counts: { flips: flips.length, defeated: defeated.length, primaryLosers: primaryLosers.filter(x => x.sameSeat).length, newcomers },
  flips, defeated, primaryLosers, close, caucuses, ballot, ballotMoney,
  votes: { summary: voteSummary, splits, keyLaws },
  money: { totals, spenders: spenders.slice(0, 25), industries: industries.slice(0, 20), costly, outspent, losingSpenders },
};
fs.writeFileSync(path.join(OUT, 'postmortem.json'), JSON.stringify(out));
console.log('postmortem', JSON.stringify({ seats: out.seats, counts: out.counts, fecMatched: fecToRace.size, races: raceRows.length, splits: splits.length, keyLaws: keyLaws.length, spenders: spenders.length, totals }));
