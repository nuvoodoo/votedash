// Builds server/congress/data/*.json from the raw public files in data/raw.
// Sources: unitedstates/congress-legislators, Voteview (HS119), FEC bulk (2022-2026),
// MIT Election Lab (Senate, House when present), VoteDash 2026 results snapshot.
'use strict';
const fs = require('fs');
const path = require('path');
const RAW = process.env.CONGRESS_RAW || path.join(__dirname, '../../data/raw');
const OUT = process.env.CONGRESS_OUT || path.join(__dirname, '../../server/congress/data');
fs.mkdirSync(OUT, { recursive: true });
const J = f => JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));
const exists = f => fs.existsSync(path.join(RAW, f));

function csv(file, sep = ',') {
  const txt = fs.readFileSync(path.join(RAW, file), 'utf8').replace(/\r/g, '');
  const lines = txt.split('\n').filter(Boolean);
  const parse = line => {
    if (sep !== ',') return line.split(sep).map(s => s.replace(/^"|"$/g, ''));
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; continue; }
      if (ch === ',' && !q) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur); return out;
  };
  const head = parse(lines[0]);
  return lines.slice(1).map(l => { const c = parse(l); const o = {}; head.forEach((h, i) => o[h] = c[i]); return o; });
}
function pipe(file, cols) {
  const txt = fs.readFileSync(path.join(RAW, file), 'latin1');
  return txt.split('\n').filter(Boolean).map(l => { const c = l.replace(/\r$/, '').split('|'); const o = {}; cols.forEach((h, i) => o[h] = c[i]); return o; });
}
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').trim();
const lastOf = s => { const p = norm(s).split(' ').filter(Boolean); return p[p.length - 1] || ''; };
const slugify = s => norm(s).replace(/[\s]+/g, '-').replace(/-+/g, '-');
const PARTY = { Democrat: 'D', Republican: 'R', Independent: 'I', Libertarian: 'L' };

// ---------- members ----------
const leg = J('legislators-current.json');
const social = Object.fromEntries(J('legislators-social-media.json').map(s => [s.id.bioguide, s.social]));
const offices = Object.fromEntries(J('legislators-district-offices.json').map(o => [o.id.bioguide, o.offices]));
const committees = J('committees-current.json');
const cmName = {};
for (const c of committees) {
  cmName[c.thomas_id] = { name: c.name, chamber: c.type, parent: null, url: c.url || null, minorityUrl: c.minority_url || null, jurisdiction: c.jurisdiction || null, phone: c.phone || null, address: c.address || null, youtube: c.youtube_id || null };
  for (const s of c.subcommittees || []) cmName[c.thomas_id + s.thomas_id] = { name: s.name, chamber: c.type, parent: c.thomas_id, phone: s.phone || null, address: s.address || null };
}
const memberships = {};
for (const [cid, list] of Object.entries(J('committee-membership-current.json'))) {
  for (const m of list) {
    if (!cmName[cid]) continue;
    (memberships[m.bioguide] ||= []).push({ id: cid, title: m.title || null, rank: m.rank, side: m.party });
  }
}

const members = leg.map(m => {
  const t = m.terms[m.terms.length - 1];
  const chamber = t.type === 'sen' ? 'S' : 'H';
  const first = m.terms.find(x => x.type === t.type);
  const name = m.name.official_full || `${m.name.nickname || m.name.first} ${m.name.last}`;
  return {
    id: m.id.bioguide, name, first: m.name.nickname || m.name.first, last: m.name.last,
    chamber, state: t.state, district: chamber === 'H' ? t.district : null,
    sclass: t.class || null, rank: t.state_rank || null,
    party: PARTY[t.party] || t.party[0], partyName: t.party, caucus: t.caucus ? PARTY[t.caucus] : null,
    delegate: chamber === 'H' && ['AS', 'GU', 'MP', 'PR', 'VI', 'DC'].includes(t.state),
    since: first.start, termEnd: t.end, birthday: m.bio.birthday || null, gender: m.bio.gender,
    url: t.url || null, contact: t.contact_form || null, office: t.address || null, phone: t.phone || null,
    terms: m.terms.map(x => ({ type: x.type, start: x.start, end: x.end, state: x.state, district: x.district ?? null, party: x.party })),
    social: social[m.id.bioguide] || {},
    districtOffices: (offices[m.id.bioguide] || []).map(o => ({ city: o.city, state: o.state, address: [o.address, o.suite].filter(Boolean).join(', '), zip: o.zip, phone: o.phone || null })),
    committees: (memberships[m.id.bioguide] || []).map(c => ({ id: c.id, name: cmName[c.id].name, parent: cmName[c.id].parent, title: c.title, rank: c.rank })),
    ids: { lis: m.id.lis || null, fec: m.id.fec || [], icpsr: m.id.icpsr || null, govtrack: m.id.govtrack || null, wikipedia: m.id.wikipedia || null, ballotpedia: m.id.ballotpedia || null, wikidata: m.id.wikidata || null, cspan: m.id.cspan || null },
    status: 'serving'
  };
});
const byId = Object.fromEntries(members.map(m => [m.id, m]));

// ---------- 2026 results: who returns, who leaves, who arrives ----------
const snap = J('snapshot.json');
const fedRaces = snap.races.filter(r => ['house', 'senate', 'delegate'].includes(r.cat) && r.scope === 'General');
const elect = [];
const words = s => norm(s).split(/[\s-]+/);
const firstOk = (a, b) => { const x = words(a)[0], y = words(b)[0]; return x === y || x[0] === y[0] && (x.startsWith(y) || y.startsWith(x)); };
const NICK = [['william', 'bill', 'will', 'billy'], ['robert', 'bob', 'rob', 'bobby'], ['gregory', 'greg'], ['luis', 'lou'], ['charles', 'chuck', 'charlie'], ['james', 'jim', 'jimmy', 'jamie'], ['michael', 'mike'], ['thomas', 'tom', 'tommy'], ['daniel', 'dan', 'danny'], ['david', 'dave'], ['edward', 'ed', 'ted', 'eddie'], ['joseph', 'joe'], ['anthony', 'tony'], ['richard', 'rick', 'dick', 'rich'], ['ronald', 'ron'], ['christopher', 'chris'], ['nicholas', 'nick'], ['patrick', 'pat'], ['steven', 'steve', 'stephen'], ['jeffrey', 'jeff'], ['andrew', 'andy', 'drew'], ['benjamin', 'ben'], ['samuel', 'sam'], ['timothy', 'tim'], ['matthew', 'matt'], ['donald', 'don'], ['john', 'jack', 'johnny'], ['katherine', 'kate', 'kathy', 'katie'], ['elizabeth', 'liz', 'beth', 'betsy'], ['susan', 'sue'], ['kenneth', 'ken'], ['gerald', 'jerry'], ['frederick', 'fred'], ['raymond', 'ray'], ['lawrence', 'larry'], ['zachary', 'zach'], ['alexander', 'alex'], ['jennifer', 'jen', 'jenn'], ['margaret', 'maggie', 'peggy'], ['abraham', 'abe'], ['douglas', 'doug'], ['bradley', 'brad'], ['randall', 'randy'], ['gabriel', 'gabe'], ['earl', 'buddy'], ['harold', 'hal'], ['henry', 'hank'], ['augustus', 'gus'], ['frank', 'francis']];
const nickEq = (x, y) => NICK.some(g => g.includes(x) && g.includes(y));
const samePerson = (a, b) => {
  if (lastOf(a) !== lastOf(b)) return false;
  const fa = words(a)[0], fb = words(b)[0], wa = words(a), wb = words(b);
  return firstOk(a, b) || nickEq(fa, fb) || (fa.length > 1 && wb.includes(fa)) || (fb.length > 1 && wa.includes(fb)) || wa.some(x => x.length > 1 && wb.some(y => nickEq(x, y)));
};
const sameName = (a, b) => lastOf(a) === lastOf(b) || words(a).includes(lastOf(b)) || words(b).includes(lastOf(a));
for (const r of fedRaces) {
  const chamber = r.cat === 'senate' ? 'S' : 'H';
  const dist = chamber === 'H' ? (r.district && /-(\d+)$/.test(r.district) ? +r.district.split('-')[1] : 0) : null;
  // a special Senate election is for an appointee's seat, whose appointment runs only until that election
  const special = chamber === 'S' && /\bSpecial\b/.test(r.name);
  const incumbents = members.filter(m => m.chamber === chamber && m.state === r.state && (chamber === 'S' ? (special ? m.termEnd < '2027-01-03' : m.termEnd.startsWith('2027')) : m.district === dist));
  const w = r.called ? r.winner : null;
  for (const inc of incumbents) {
    const kept = w && samePerson(w.n, inc.name);
    inc.race2026 = { id: r.id, won: !!kept, decided: !!w, pct: (r.cands.find(c => samePerson(c.n, inc.name)) || {}).pc ?? null, ran: r.cands.some(c => samePerson(c.n, inc.name)), ...(special ? { special: true } : {}) };
    if (w && !kept) inc.status = 'leaving';
  }
  if (!w) continue;
  if (incumbents.some(i => samePerson(w.n, i.name))) continue;
  // a House member re-elected in a redrawn district keeps one file
  const redrawn = chamber === 'H' && members.find(m => m.chamber === 'H' && m.state === r.state && m.district !== dist && samePerson(w.n, m.name));
  if (redrawn) { redrawn.newDistrict = dist; redrawn.redrawnRace = { id: r.id, pct: w.pc }; continue; }
  // a sitting member moving chambers keeps one file
  const mover = members.find(m => m.state === r.state && m.chamber !== chamber && samePerson(w.n, m.name));
  const rec = { chamber, state: r.state, district: dist, party: w.p, partyName: w.pf, name: w.n, raceId: r.id, pct: w.pc, votes: w.v, ...(special ? { special: true } : {}) };
  if (mover) { mover.elect = rec; continue; }
  elect.push(rec);
}
// House members who did not run for their seat and are not moving up are leaving
for (const m of members) {
  if (m.chamber === 'H' && m.race2026 && !m.race2026.ran && !m.elect) m.status = 'leaving';
  if (m.chamber === 'S' && m.race2026 && !m.race2026.ran) m.status = 'leaving';
  if (m.newDistrict != null) m.status = 'serving';
}

// ---------- FEC ----------
const WEB = ['CAND_ID', 'CAND_NAME', 'CAND_ICI', 'PTY_CD', 'PTY', 'TTL_RECEIPTS', 'TRANS_FROM_AUTH', 'TTL_DISB', 'TRANS_TO_AUTH', 'COH_BOP', 'COH_COP', 'CAND_CONTRIB', 'CAND_LOANS', 'OTHER_LOANS', 'CAND_LOAN_REPAY', 'OTHER_LOAN_REPAY', 'DEBTS', 'INDIV', 'ST', 'DIST', 'SPEC', 'PRIM', 'RUN', 'GEN', 'GEN_PCT', 'OTHER_CMTE', 'PARTY_CMTE', 'CVG_END', 'INDIV_REF', 'CMTE_REF'];
const CM = ['CMTE_ID', 'CMTE_NM', 'TRES', 'ST1', 'ST2', 'CITY', 'ST', 'ZIP', 'DSGN', 'TP', 'PTY', 'FREQ', 'ORG_TP', 'CONNECTED_ORG', 'CAND_ID'];
const PAS = ['CMTE_ID', 'AMNDT', 'RPT_TP', 'PGI', 'IMAGE', 'TP', 'ENTITY', 'NAME', 'CITY', 'ST', 'ZIP', 'EMPLOYER', 'OCC', 'DT', 'AMT', 'OTHER_ID', 'CAND_ID', 'TRAN_ID', 'FILE', 'MEMO_CD', 'MEMO_TEXT', 'SUB_ID'];
const CN = ['CAND_ID', 'NAME', 'PTY', 'YR', 'ST', 'OFFICE', 'DIST', 'ICI', 'STATUS', 'PCC'];
const cycles = [{ y: 2026, dir: '', web: 'weball26.txt' }, { y: 2024, dir: 'y24/', web: 'y24/weball24.txt' }, { y: 2022, dir: 'y22/', web: 'y22/weball22.txt' }];

// candidate ids for members-elect, matched on state, office, district and last name
const cn = pipe('cn.txt', CN);
for (const e of elect) {
  const c = cn.find(c => c.OFFICE === e.chamber && c.ST === e.state && (e.chamber === 'S' || +c.DIST === (e.district || 0)) && lastOf(c.NAME.split(',')[0]) === lastOf(e.name));
  e.fec = c ? [c.CAND_ID] : [];
}

const candOwner = {};
for (const m of members) for (const f of m.ids.fec) candOwner[f] = m.id;
elect.forEach((e, i) => { e.id = `elect-${e.state}${e.chamber === 'S' ? 'S' : e.district}`; for (const f of e.fec) candOwner[f] = e.id; });

const ORG = { C: 'Corporation', L: 'Labor union', M: 'Membership group', T: 'Trade association', V: 'Cooperative', W: 'Corporation' };
const committeesInfo = {};
for (const cy of [...cycles].reverse()) {
  for (const c of pipe(cy.dir + 'cm.txt', CM)) {
    committeesInfo[c.CMTE_ID] = {
      id: c.CMTE_ID, name: c.CMTE_NM, city: c.CITY, state: c.ST, org: c.CONNECTED_ORG && !/^(NONE|N\/?A|NO|UNKNOWN|\.|-)$/i.test(c.CONNECTED_ORG.trim()) ? c.CONNECTED_ORG.trim() : null,
      kind: c.DSGN === 'D' ? 'Leadership PAC' : c.TP === 'O' ? 'Super PAC' : c.TP === 'X' || c.TP === 'Y' || c.TP === 'Z' ? 'Party committee' : c.TP === 'V' || c.TP === 'W' ? 'Hybrid PAC' : (ORG[c.ORG_TP] || (c.TP === 'N' || c.TP === 'Q' ? 'PAC' : 'Committee')),
      party: c.PTY || null, sponsor: c.CAND_ID || null
    };
  }
}

const money = {};
const ieYear = {}; // person -> committee -> year -> [for, against]
const pacHist = {}; // 'person|committee' -> [[date, amount, cycle]] // owner -> {cycles:{}, pacs:{cmte:amt}, ieFor:{}, ieAgainst:{}}
const M$ = id => (money[id] ||= { cycles: {}, pacs: {}, ieFor: {}, ieAgainst: {} });
for (const cy of cycles) {
  for (const w of pipe(cy.web, WEB)) {
    const owner = candOwner[w.CAND_ID]; if (!owner) continue;
    const c = (M$(owner).cycles[cy.y] ||= { receipts: 0, indiv: 0, pac: 0, party: 0, self: 0, spent: 0, cash: 0, debt: 0, through: null });
    c.receipts += +w.TTL_RECEIPTS; c.indiv += +w.INDIV; c.pac += +w.OTHER_CMTE; c.party += +w.PARTY_CMTE;
    c.self += +w.CAND_CONTRIB + +w.CAND_LOANS; c.spent += +w.TTL_DISB; c.cash += +w.COH_COP; c.debt += +w.DEBTS;
    if (w.CVG_END) { const [mo, d, y] = w.CVG_END.split('/'); const iso = `${y}-${mo}-${d}`; if (!c.through || iso > c.through) c.through = iso; }
  }
  const txt = fs.readFileSync(path.join(RAW, cy.dir + 'itpas2.txt'), 'latin1');
  let start = 0;
  while (start < txt.length) {
    let end = txt.indexOf('\n', start); if (end < 0) end = txt.length;
    const line = txt.slice(start, end); start = end + 1;
    const c = line.split('|');
    const owner = candOwner[c[16]]; if (!owner) continue;
    if (c[19] === 'X') continue;
    const tp = c[5], amt = +c[14], cm = c[0];
    if (!amt) continue;
    const mm = M$(owner);
    if (tp === '24K' || tp === '24Z') {
      mm.pacs[cm] = (mm.pacs[cm] || 0) + amt;
      const dt = c[13] && c[13].length === 8 ? `${c[13].slice(4)}-${c[13].slice(0, 2)}-${c[13].slice(2, 4)}` : null;
      (pacHist[owner + '|' + cm] ||= []).push([dt, Math.round(amt), cy.y]);
    }
    else if (tp === '24E' || tp === '24A') {
      if (tp === '24E') mm.ieFor[cm] = (mm.ieFor[cm] || 0) + amt; else mm.ieAgainst[cm] = (mm.ieAgainst[cm] || 0) + amt;
      const yr = c[13] && c[13].length === 8 ? c[13].slice(4) : String(cy.y);
      const slot = ((ieYear[owner] ||= {})[cm] ||= {})[yr] ||= [0, 0];
      slot[tp === '24E' ? 0 : 1] += amt;
    }
  }
}
// funders: who each committee pays
const funders = {};
for (const [owner, mm] of Object.entries(money)) {
  for (const [cm, amt] of Object.entries(mm.pacs)) { const f = (funders[cm] ||= { given: {}, ieFor: {}, ieAgainst: {} }); f.given[owner] = amt; }
  for (const [cm, amt] of Object.entries(mm.ieFor)) { const f = (funders[cm] ||= { given: {}, ieFor: {}, ieAgainst: {} }); f.ieFor[owner] = amt; }
  for (const [cm, amt] of Object.entries(mm.ieAgainst)) { const f = (funders[cm] ||= { given: {}, ieFor: {}, ieAgainst: {} }); f.ieAgainst[owner] = amt; }
}

// ---------- votes ----------
const vvMembers = csv('HS119_members.csv').filter(r => r.chamber !== 'President');
const icpsrTo = {};
for (const r of vvMembers) {
  if (r.bioguide_id) icpsrTo[r.chamber[0] + r.icpsr] = r.bioguide_id;
  const m = byId[r.bioguide_id]; if (!m) continue;
  if (r.chamber[0] === m.chamber) { m.nominate = r.nominate_dim1 === '' ? null : +r.nominate_dim1; m.nominate2 = r.nominate_dim2 === '' ? null : +r.nominate_dim2; }
}
const rolls = csv('HS119_rollcalls.csv');
// Vote codes, one character per member in order[chamber]: Y yea, N nay, P present, X not voting,
// 0 not on this roll call (not yet or no longer a member, or the Speaker not voting).
// Each member's vote, party and the vote date come from the official House Clerk and Senate
// records (fetch-official-votes.js); Voteview fills in where no official record was fetched.
const legAll = new Map([...J('legislators-historical.json'), ...leg].map(m => [m.id.bioguide, m]));
const lisTo = new Map([...legAll.values()].filter(m => m.id.lis).map(m => [m.id.lis, m.id.bioguide]));
const OFFICIAL_WORD = { yea: 'Y', aye: 'Y', nay: 'N', no: 'N', present: 'P', 'not voting': 'X' };
// vote words that are a yes/no answer; anything else (a candidate's name) is a choice between candidates
const CHOICE_WORDS = new Set([...Object.keys(OFFICIAL_WORD), 'guilty', 'not guilty']);
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const isoOf = s => { let m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})/); if (m) return `${m[3]}-${String(MON[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`; m = s.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/); return m && MON[m[1].slice(0, 3).toLowerCase()] ? `${m[3]}-${String(MON[m[1].slice(0, 3).toLowerCase()]).padStart(2, '0')}-${m[2].padStart(2, '0')}` : null; };
const xtag = (s, n) => { const m = s.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`)); return m ? m[1].trim() : ''; };
function readOfficial(ch, session, clerk) {
  const f = path.join(RAW, 'official', `${ch}${session}-${clerk}.xml.gz`); if (!fs.existsSync(f)) return null;
  const x = require('zlib').gunzipSync(fs.readFileSync(f)).toString('utf8');
  const votes = [];
  if (ch === 'H') {
    for (const b of x.split('<recorded-vote>').slice(1)) {
      const leg = (b.match(/<legislator\b[^>]*>/) || [''])[0];
      const id = (leg.match(/name-id="([A-Z]\d{6})"/) || [])[1]; if (!id) continue;
      votes.push({ id, party: (leg.match(/party="([A-Z])"/) || [])[1] || null, state: (leg.match(/state="([A-Z]{2})"/) || [])[1] || null, v: xtag(b, 'vote') });
    }
    return { date: isoOf(xtag(x, 'action-date')), votes, question: xtag(x, 'vote-question'), type: xtag(x, 'vote-type') };
  }
  for (const b of x.split('<member>').slice(1)) { const id = lisTo.get(xtag(b, 'lis_member_id')); if (id) votes.push({ id, party: xtag(b, 'party') || null, v: xtag(b, 'vote_cast') }); }
  // the measure as the Senate numbers it: a nomination keeps its part number (PN11-13, not PN1113)
  const doc = x.match(/<document>[\s\S]*?<\/document>/), dt = doc && xtag(doc[0], 'document_type'), dn = doc && xtag(doc[0], 'document_number');
  return { date: isoOf(xtag(x, 'vote_date')), votes, nomination: dt === 'PN' && dn ? `PN${dn}` : null };
}
const official = {};
for (const r of rolls) { const o = readOfficial(r.chamber[0], +r.session, +r.clerk_rollnumber); if (o) official[r.chamber[0] + r.rollnumber] = o; }
const vvCodes = {}; // roll key -> bioguide -> code
{
  const txt = fs.readFileSync(path.join(RAW, 'HS119_votes.csv'), 'utf8');
  for (const line of txt.split('\n').slice(1)) {
    if (!line) continue;
    const [, chamber, roll, icpsr, code] = line.split(',');
    const ch = chamber[0];
    const bio = icpsrTo[ch + icpsr]; if (!bio) continue;
    const c = +code; // Voteview cast codes: 1-3 yea, 4-6 nay, 7-8 present, 9 not voting, 0 not a member
    const v = c >= 1 && c <= 3 ? 'Y' : c >= 4 && c <= 6 ? 'N' : c === 7 || c === 8 ? 'P' : c === 9 ? 'X' : null;
    if (v) (vvCodes[ch + roll] ||= {})[bio] = v;
  }
}
// House quorum calls: the Clerk numbers Voteview skips (roll call 1 of each session)
const quorumRecs = [];
for (const session of [1, 2]) {
  const have = new Set(rolls.filter(r => r.chamber[0] === 'H' && +r.session === session).map(r => +r.clerk_rollnumber));
  const top = Math.max(0, ...have);
  for (let n = 1; n < top; n++) { if (have.has(n)) continue; const o = readOfficial('H', session, n); if (o && /quorum/i.test(o.type)) quorumRecs.push({ session, n, o }); }
}
// members who voted in this Congress and have since left the chamber keep their place in the record
const former = {};
const recInfo = {}; // bioguide -> { party, state } as an official record lists them
for (const o of [...Object.values(official), ...quorumRecs.map(q => q.o)]) for (const v of o.votes) recInfo[v.id] ||= { party: v.party, state: v.state };
const order = { H: members.filter(m => m.chamber === 'H').map(m => m.id), S: members.filter(m => m.chamber === 'S').map(m => m.id) };
{
  const seen = { H: new Set(order.H), S: new Set(order.S) };
  const add = (ch, id) => { if (seen[ch].has(id)) return; seen[ch].add(id); order[ch].push(id); };
  for (const [k, o] of Object.entries(official)) for (const v of o.votes) add(k[0], v.id);
  for (const q of quorumRecs) for (const v of q.o.votes) add('H', v.id);
  for (const [k, by] of Object.entries(vvCodes)) for (const id of Object.keys(by)) add(k[0], id);
  const vvName = Object.fromEntries(vvMembers.filter(r => r.bioguide_id).map(r => [r.bioguide_id, r]));
  for (const ch of ['H', 'S']) for (const id of order[ch]) {
    if (byId[id] || former[id]) continue;
    const L = legAll.get(id), vv = vvName[id];
    const terms = L ? L.terms.filter(t => t.end >= '2025-01-03').map(x => ({ type: x.type, start: x.start, end: x.end, state: x.state, district: x.district ?? null, party: x.party })) : [];
    const t = terms.filter(x => (x.type === 'sen') === (ch === 'S')).pop();
    const name = L ? L.name.official_full || `${L.name.nickname || L.name.first} ${L.name.last}` : vv.bioname.replace(/^([^,]+), (.+)$/, '$2 $1').replace(/\b([A-Z])([A-Z]+)\b/g, (w, a, b) => a + b.toLowerCase());
    // someone only on a quorum call (elected, never sworn in) has no 119th term: their record entry gives state and party
    const rec = recInfo[id] || {};
    const state = t ? t.state : vv ? vv.state_abbrev : rec.state;
    former[id] = { id, former: true, name, last: L ? L.name.last : name.split(' ').pop(), chamber: ch, state, district: ch === 'H' ? (t ? t.district : vv ? +vv.district_code : null) : null,
      party: t ? PARTY[t.party] || t.party[0] : vv ? { 100: 'D', 200: 'R' }[vv.party_code] || 'I' : rec.party || 'I', delegate: ch === 'H' && ['AS', 'GU', 'MP', 'PR', 'VI', 'DC'].includes(state), left: t ? t.end : null, terms };
  }
}
const who = id => byId[id] || former[id];
const pos = { H: Object.fromEntries(order.H.map((id, i) => [id, i])), S: Object.fromEntries(order.S.map((id, i) => [id, i])) };
// party at the time of each vote, from the official records
const partySeen = {};
const rollcalls = rolls.map(r => {
  const ch = r.chamber[0];
  const k = `${ch}${r.rollnumber}`;
  const codes = Array(order[ch].length).fill('0');
  const vv = vvCodes[k] || {}, o = official[k];
  if (o) {
    // vote text outside yea/nay/present/not voting (candidate names for Speaker, guilty) keeps Voteview's reading
    for (const v of o.votes) { codes[pos[ch][v.id]] = OFFICIAL_WORD[v.v.toLowerCase()] || vv[v.id] || 'X'; if (v.party && o.date) (partySeen[v.id] ||= []).push([o.date, v.party]); }
  } else for (const [id, c] of Object.entries(vv)) codes[pos[ch][id]] = c;
  // a vote between named candidates (Election of the Speaker) keeps each member's candidate
  let choice = null;
  if (o && o.votes.some(v => !CHOICE_WORDS.has(v.v.toLowerCase()))) {
    const picks = {}, tally = new Map();
    for (const v of o.votes) if (!OFFICIAL_WORD[v.v.toLowerCase()]) { picks[v.id] = v.v; tally.set(v.v, (tally.get(v.v) || 0) + 1); }
    choice = { picks, totals: [...tally].sort((a, b) => b[1] - a[1]) };
  }
  const date = (o && o.date) || r.date;
  const yea = o ? codes.filter(c => c === 'Y').length : +r.yea_count, nay = o ? codes.filter(c => c === 'N').length : +r.nay_count;
  return { k, chamber: ch, roll: +r.rollnumber, clerk: +r.clerk_rollnumber, session: +r.session, date, bill: (o && o.nomination) || r.bill_number || null, result: r.vote_result, question: r.vote_question, desc: r.vote_desc || r.dtl_desc || '', req: r.majority_requirement, yea, nay, codes, ...(choice ? { choice } : {}), ...(o ? {} : { source: 'voteview' }) };
});
for (const [id, seen] of Object.entries(partySeen)) {
  const hist = []; for (const [d, p] of seen.sort((a, b) => a[0].localeCompare(b[0]))) if (!hist.length || hist[hist.length - 1][1] !== p) hist.push([d, p]);
  if (hist.length > 1) who(id).parties = hist;
}
const partyOn = (m, d) => { let p = m.party; if (m.parties) for (const [from, pt] of m.parties) if (from <= d) p = pt; return p === 'I' ? (m.caucus || 'D') : p; };
// party position per roll call and per-member stats
for (const rc of rollcalls) {
  const ids = order[rc.chamber]; const tally = { D: { Y: 0, N: 0 }, R: { Y: 0, N: 0 } };
  rc.codes.forEach((c, i) => { const p = partyOn(who(ids[i]), rc.date); if ((c === 'Y' || c === 'N') && tally[p]) tally[p][c]++; });
  rc.tally = tally;
  rc.partyPos = { D: tally.D.Y > tally.D.N ? 'Y' : tally.D.N > tally.D.Y ? 'N' : null, R: tally.R.Y > tally.R.N ? 'Y' : tally.R.N > tally.R.Y ? 'N' : null };
  rc.partyLine = rc.partyPos.D && rc.partyPos.R && rc.partyPos.D !== rc.partyPos.R;
  rc.codes = rc.codes.join('');
}
for (const ch of ['H', 'S']) {
  const ids = order[ch];
  const rcs = rollcalls.filter(r => r.chamber === ch);
  ids.forEach((id, i) => {
    const m = byId[id]; if (!m || m.chamber !== ch) return;
    let eligible = 0, cast = 0, missed = 0, withParty = 0, partyVotes = 0; const breaks = [];
    for (const rc of rcs) {
      const c = rc.codes[i]; if (c === '0') continue;
      eligible++;
      if (c === 'Y' || c === 'N') {
        cast++;
        if (rc.partyLine) { partyVotes++; if (c === rc.partyPos[partyOn(m, rc.date)]) withParty++; else breaks.push(rc.k); }
      } else missed++;
    }
    m.votes = { eligible, cast, missed, partyVotes, withParty, unity: partyVotes ? withParty / partyVotes : null, missedPct: eligible ? missed / eligible : null, breaks: breaks.reverse() };
  });
  // agreement with every colleague of the chamber
  const n = ids.length; const codes = rcs.map(r => r.codes);
  const sitting = i => byId[ids[i]] && byId[ids[i]].chamber === ch;
  for (let a = 0; a < n; a++) {
    if (!sitting(a)) continue;
    const scores = [];
    for (let b = 0; b < n; b++) {
      if (a === b || !sitting(b)) continue; let both = 0, same = 0;
      for (const s of codes) { const x = s[a], y = s[b]; if ((x === 'Y' || x === 'N') && (y === 'Y' || y === 'N')) { both++; if (x === y) same++; } }
      if (both >= 50) scores.push([ids[b], same / both]);
    }
    scores.sort((p, q) => q[1] - p[1]);
    const m = byId[ids[a]]; const p = m.party;
    m.votesLike = scores.slice(0, 6).map(([id, s]) => ({ id, agree: +s.toFixed(3) }));
    m.crossParty = scores.filter(([id]) => byId[id].party !== p && byId[id].party !== 'I').slice(0, 4).map(([id, s]) => ({ id, agree: +s.toFixed(3) }));
  }
}

// ---------- shared donors ----------
const owners = [...members.map(m => m.id), ...elect.map(e => e.id)];
const vec = {};
for (const id of owners) { const p = money[id]?.pacs || {}; const norm2 = Math.sqrt(Object.values(p).reduce((s, v) => s + v * v, 0)); if (norm2) vec[id] = { p, n: norm2 }; }
const vecIds = Object.keys(vec);
const sharedDonors = {};
for (const a of vecIds) {
  const res = [];
  for (const b of vecIds) {
    if (a === b) continue; let dot = 0, shared = 0;
    for (const [k, v] of Object.entries(vec[a].p)) if (vec[b].p[k]) { dot += v * vec[b].p[k]; shared++; }
    if (shared >= 5) res.push([b, dot / (vec[a].n * vec[b].n), shared]);
  }
  res.sort((x, y) => y[1] - x[1]);
  sharedDonors[a] = res.slice(0, 6).map(([id, s, n]) => ({ id, score: +s.toFixed(3), shared: n }));
}

// ---------- election history ----------
const history = {};
const pushH = (id, rec) => (history[id] ||= []).push(rec);
const sen = csv('senate-1976-2024.tab', '\t');
const house = exists('house-1976-2024.tab') && fs.statSync(path.join(RAW, 'house-1976-2024.tab')).size > 10000 ? csv('house-1976-2024.tab', fs.readFileSync(path.join(RAW, 'house-1976-2024.tab'), 'utf8').slice(0, 300).includes('\t') ? '\t' : ',') : [];
// members-elect have no terms yet, so only exact-name matches reach their earlier races
const medslPeople = [...members, ...elect.map(e => { const nm = e.name.replace(/,?\s+(Jr\.?|Sr\.?|II|III|IV)$/i, ''); return { id: e.id, name: e.name, first: nm.split(' ')[0], last: nm.split(' ').slice(-1)[0], terms: [], state: e.state, chamber: e.chamber }; })];
function addMedsl(rows, chamber) {
  const races = {};
  for (const r of rows) {
    if ((r.stage || '').toLowerCase() !== 'gen' || (r.mode && r.mode.toLowerCase() !== 'total')) continue;
    if ((r.runoff || '').toUpperCase() === 'TRUE') continue;
    if (!r.candidate || /^(other|writein|write-in|scattering|blank|void|over ?votes|under ?votes|all others|blanks)$/i.test(r.candidate) || /^none of these/i.test(r.candidate) || /\b(blank votes?|void votes?|scattering|scattered|over ?votes|under ?votes)\b/i.test(r.candidate)) continue;
    const k = `${r.year}|${r.state_po}|${chamber === 'H' ? +r.district + ((r.special || '').toUpperCase() === 'TRUE' ? 's' : '') : (r.special || '').toLowerCase()}`;
    (races[k] ||= []).push(r);
  }
  for (const [k, cands] of Object.entries(races)) {
    const [year, st, d] = k.split('|');
    // combine fusion lines for the same candidate
    const by = {};
    for (const c of cands) { if (!c.candidate || c.writein === 'TRUE' && false) continue; const n = /^[^,]+, [^,]+$/.test(c.candidate) ? c.candidate.split(', ')[1] + ' ' + c.candidate.split(', ')[0] : c.candidate; (by[n] ||= { name: n, votes: 0, party: c.party_simplified || c.party_detailed || c.party }).votes += +c.candidatevotes; const ps = c.party_simplified || c.party; if (ps === 'DEMOCRAT' || ps === 'REPUBLICAN') by[n].party = ps; }
    const total = +cands[0].totalvotes || Object.values(by).reduce((s, c) => s + c.votes, 0);
    const list = Object.values(by).sort((a, b) => b.votes - a.votes);
    for (const m of medslPeople) {
      if (m.state !== st) continue;
      const served = m.terms.some(t => (t.type === 'sen') === (chamber === 'S') && t.state === st && (chamber === 'S' || +t.district === parseInt(d) || (parseInt(d) === 0 && t.district === 0)));
      if (!served && !(m.chamber === chamber) && m.terms.length) continue;
      // a full-name match counts for Senate races anywhere in the state; an initial-only match, and any
      // House race, also needs the member to have held that seat (Linda vs Loretta Sanchez, two Danny Davises)
      const strong = list.find(c => samePerson(c.name, m.name));
      const weak = list.find(c => lastOf(c.name) === lastOf(m.last) && norm(c.name).split(' ')[0][0] === norm(m.first)[0]) || list.find(c => lastOf(c.name) === lastOf(m.last) && norm(c.name).includes(norm(m.first)));
      // a race for a seat never held (an early loss) needs the exact first and last name, at 25 or older
      const exact = list.find(c => lastOf(c.name) === lastOf(m.last) && norm(c.name).split(' ')[0] === norm(m.first).split(' ')[0]);
      const ofAge = !m.birthday || +year - +m.birthday.slice(0, 4) >= 25;
      const me = served ? strong || weak : chamber === 'H' ? (ofAge ? exact : null) : (ofAge ? strong : null);
      if (!me) continue;
      const opp = list.find(c => c !== me);
      pushH(m.id, { year: +year, chamber, state: st, district: chamber === 'H' ? +d : null, special: chamber === 'S' && d === 'true', pct: total ? me.votes / total : null, votes: me.votes, won: list[0] === me, opponent: opp ? { name: titleCase(opp.name), party: (opp.party || '')[0], pct: total ? opp.votes / total : null } : null, uncontested: !opp });
    }
  }
}
function titleCase(s) { return s.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase()).replace(/\bMc([a-z])/g, (_, c) => 'Mc' + c.toUpperCase()); }
addMedsl(sen, 'S');
if (house.length) addMedsl(house, 'H');
for (const r of fedRaces) {
  if (!r.called) continue;
  const chamber = r.cat === 'senate' ? 'S' : 'H';
  const dist = chamber === 'H' ? (/-(\d+)$/.test(r.district || '') ? +r.district.split('-')[1] : 0) : null;
  const total = r.cands.reduce((s, c) => s + (c.v || 0), 0);
  const ownersHere = [...members.filter(m => m.state === r.state), ...elect.filter(e => e.state === r.state && e.chamber === chamber && e.district === dist)];
  for (const o of ownersHere) {
    const nm = o.name;
    const me = r.cands.find(c => samePerson(c.n, nm)); if (!me) continue;
    if (o.chamber && o.chamber !== chamber && !(o.elect && o.elect.chamber === chamber)) continue;
    const opp = r.cands.find(c => c !== me);
    pushH(o.id, { year: 2026, chamber, state: r.state, district: dist, pct: total ? me.v / total : me.pc / 100, votes: me.v, won: !!me.w, opponent: opp ? { name: opp.n, party: opp.p, pct: total ? opp.v / total : opp.pc / 100 } : null, uncontested: !opp, raceId: r.id });
  }
}
// ---------- primaries, special elections, territory delegates ----------
// tools/congress/static/elections-extra.json, built by tools/congress/primaries/ (FEC 2012-2022, civicAPI 2024-2026)
const EX = JSON.parse(fs.readFileSync(path.join(__dirname, 'static/elections-extra.json'), 'utf8'));
const people0 = [...members, ...elect];
const fecOf = o => new Set([...((o.ids && o.ids.fec) || []), ...(o.fec || [])]);
const primaries = {};
for (const r of EX.primaries) {
  const owners = r.src === 'fec'
    ? people0.map(o => [o, r.c.find(c => c.f && fecOf(o).has(c.f))]).filter(([, c]) => c)
    : people0.filter(o => o.state === r.st).map(o => [o, r.c.find(c => samePerson(c.n, o.name))]).filter(([, c]) => c);
  for (const [o, me] of owners) {
    const opp = r.c.find(c => c !== me);
    (primaries[o.id] ||= []).push({ year: r.y, chamber: r.ch, state: r.st, district: r.d, special: !!r.sp, party: r.pt, pct: me.pc ?? null, votes: me.v ?? null, uncontested: !!me.u || r.c.length === 1, runoffPct: me.rpc ?? null, won: !!me.w, field: r.c.length, opponent: opp ? { name: opp.n, party: opp.p, pct: (me.rpc != null ? opp.rpc : opp.pc) ?? null } : null });
  }
}
for (const l of Object.values(primaries)) l.sort((a, b) => b.year - a.year || (a.special - b.special));
for (const r of EX.specials) {
  for (const o of people0.filter(o => o.state === r.st)) {
    const me = r.c.find(c => samePerson(c.n, o.name)); if (!me) continue;
    const ro = r.runoff && me.rv != null;
    const opp = ro ? r.c.find(c => c !== me && c.rv != null) : r.c.find(c => c !== me);
    pushH(o.id, { year: r.y, chamber: r.ch, state: r.st, district: r.d, special: true, runoff: ro, pct: ro ? me.rpc : me.pc, votes: ro ? me.rv : me.v, won: !!me.w, opponent: opp ? { name: opp.n, party: opp.p, pct: ro ? opp.rpc : opp.pc } : null, uncontested: !opp });
  }
}
// FEC general results fill races the MEDSL files lack (territory delegates, CT Senate 2022)
for (const r of EX.generals) {
  for (const o of people0.filter(o => o.state === r.st)) {
    const me = r.c.find(c => fecOf(o).has(c.f)); if (!me) continue;
    if ((history[o.id] || []).some(h => h.year === r.y && h.chamber === r.ch)) continue;
    const opp = r.c.find(c => c !== me && !/^(W|N)$/.test(c.p)) || null;
    pushH(o.id, { year: r.y, chamber: r.ch, state: r.st, district: r.d, special: !!r.sp, pct: me.pc, votes: me.v, won: me.w, opponent: opp ? { name: opp.n, party: (opp.p || '')[0], pct: opp.pc } : null, uncontested: !opp });
  }
}
for (const h of Object.values(history)) h.sort((a, b) => b.year - a.year);

// ---------- write ----------
const slugs = {};
const allPeople = [...members, ...elect.map(e => ({ ...e, status: 'elect', first: e.name.split(' ')[0], last: e.name.split(' ').slice(-1)[0] }))];
for (const p of allPeople) {
  let s = slugify(p.name); if (slugs[s]) s = `${s}-${p.state.toLowerCase()}`; slugs[s] = p.id; p.slug = s;
}
const top = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([id, amt]) => ({ id, amt: Math.round(amt) }));
for (const p of allPeople) {
  const mm = money[p.id];
  p.money = mm ? { cycles: mm.cycles, pacTotal: Math.round(Object.values(mm.pacs).reduce((s, v) => s + v, 0)), pacCount: Object.keys(mm.pacs).length, topPacs: top(mm.pacs, 25), ieFor: top(mm.ieFor, 10), ieAgainst: top(mm.ieAgainst, 10) } : null;
  p.sharedDonors = sharedDonors[p.id] || [];
  p.elections = history[p.id] || [];
  p.primaries = primaries[p.id] || [];
}
const usedCm = new Set();
for (const p of allPeople) if (p.money) for (const l of ['topPacs', 'ieFor', 'ieAgainst']) p.money[l].forEach(x => usedCm.add(x.id));
const funderOut = {};
for (const [cm, f] of Object.entries(funders)) {
  const info = committeesInfo[cm] || { id: cm, name: cm, kind: 'Committee' };
  const total = Object.values(f.given).reduce((s, v) => s + v, 0);
  const ie = Object.values(f.ieFor).reduce((s, v) => s + v, 0) + Object.values(f.ieAgainst).reduce((s, v) => s + v, 0);
  if (total < 1000 && ie < 1000) continue;
  funderOut[cm] = { ...info, slug: slugify(info.name).slice(0, 80) + '-' + cm.toLowerCase(), total: Math.round(total), ie: Math.round(ie), given: f.given, ieFor: f.ieFor, ieAgainst: f.ieAgainst };
}
fs.writeFileSync(path.join(OUT, 'people.json'), JSON.stringify(allPeople));
// House quorum calls (roll call 1 of each session): attendance, not votes. Voteview leaves them out, so they come
// from the Clerk's records alone; each member is present or not voting. They are kept apart from the roll calls so
// they count toward no voting record.
const quorums = quorumRecs.map(({ session, n, o }) => {
  const codes = Array(order.H.length).fill('0');
  for (const v of o.votes) codes[pos.H[v.id]] = OFFICIAL_WORD[v.v.toLowerCase()] || 'X';
  return { k: `HQ${session === 1 ? 2025 : 2026}-${n}`, chamber: 'H', roll: null, clerk: n, session, date: o.date, quorum: true, bill: null,
    result: '', question: o.question || 'Quorum call', desc: '', req: '', yea: 0, nay: 0, codes };
});
fs.writeFileSync(path.join(OUT, 'rollcalls.json'), JSON.stringify({ order, rollcalls, quorums }));
fs.writeFileSync(path.join(OUT, 'former.json'), JSON.stringify(Object.values(former)));
fs.writeFileSync(path.join(OUT, 'funders.json'), JSON.stringify(funderOut));
// compact: { person: { committee: [yyyymmdd, amount, yyyymmdd, amount, ...] } }, oldest first
const histOut = {};
for (const [k, v] of Object.entries(pacHist)) {
  v.sort((x, y) => (x[0] || '').localeCompare(y[0] || ''));
  const [pid, cm] = k.split('|');
  (histOut[pid] ||= {})[cm] = v.flatMap(([d, a]) => [d ? +d.replace(/-/g, '') : 0, a]);
}
fs.writeFileSync(path.join(OUT, 'pachistory.json'), JSON.stringify(histOut));
for (const p of Object.values(ieYear)) for (const c of Object.values(p)) for (const y of Object.keys(c)) c[y] = c[y].map(Math.round);
fs.writeFileSync(path.join(OUT, 'ieyear.json'), JSON.stringify(ieYear));
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({ built: new Date().toISOString(), congress: 119, committees: cmName, fecThrough: Object.fromEntries(cycles.map(c => [c.y, null])) }));
console.log('people', allPeople.length, 'serving', members.filter(m => m.status === 'serving').length, 'leaving', members.filter(m => m.status === 'leaving').length, 'elect', elect.length, 'movers', members.filter(m => m.elect).length);
console.log('rollcalls', rollcalls.length, 'funders', Object.keys(funderOut).length, 'with money', allPeople.filter(p => p.money).length, 'with history', allPeople.filter(p => p.elections.length).length);
for (const f of ['people', 'rollcalls', 'funders']) console.log(f, (fs.statSync(path.join(OUT, f + '.json')).size / 1e6).toFixed(1) + 'MB');
