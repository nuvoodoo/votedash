'use strict';
// Loads the built JSON in server/congress/data and indexes it for the pages.
const fs = require('fs');
const path = require('path');
const BUNDLED = path.join(__dirname, 'data');
// nightly rebuilds land in CONGRESS_DATA (persistent disk); use whichever copy was built last
let DIR = BUNDLED;
function pickDir() {
  const d = process.env.CONGRESS_DATA; if (!d || !fs.existsSync(path.join(d, 'people.json'))) return BUNDLED;
  const built = dir => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')).built || ''; } catch { return ''; } };
  return built(d) > built(BUNDLED) ? d : BUNDLED;
}
const load = (f, optional) => {
  const p = path.join(DIR, f);
  if (!fs.existsSync(p)) { if (optional) return null; throw new Error('missing ' + p); }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
};

const STATES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia', PR: 'Puerto Rico', GU: 'Guam', VI: 'U.S. Virgin Islands', AS: 'American Samoa', MP: 'Northern Mariana Islands' };

const D = {};
function build() {
  DIR = pickDir();
  const people = load('people.json');
  const { order, rollcalls } = load('rollcalls.json');
  const funders = load('funders.json');
  const meta = load('meta.json');
  const bills = load('bills.json', true);
  const speeches = load('speeches.json', true);
  const industries = load('industries.json', true);
  const lobbying = load('lobbying.json', true);
  const record = load('record.json', true);
  const leadership = load('leadership.json', true);
  const pacHistory = load('pachistory.json', true) || {};
  const ieYear = load('ieyear.json', true) || {};
  const caucuses = load('caucuses.json', true);
  const approval = load('approval.json', true);
  const polls = load('polls.json', true);
  const postmortem = load('postmortem.json', true);

  const byId = new Map(people.map(p => [p.id, p]));
  const bySlug = new Map(people.map(p => [p.slug, p]));
  const rcByK = new Map(rollcalls.map(r => [r.k, r]));
  const fundersById = new Map(Object.entries(funders));
  const fundersBySlug = new Map(Object.values(funders).map(f => [f.slug, f]));

  // industry lookups
  const indName = new Map(); const sectorOf = new Map(); const sectors = [];
  if (industries) for (const s of industries.sectors) { sectors.push(s); for (const i of s.industries) { indName.set(i.id, i.name); sectorOf.set(i.id, s); } }
  const industryOf = id => industries && industries.committees[id] ? industries.committees[id].industry : null;

  // money by industry for each person, and totals per industry
  const industryTotals = new Map();
  const givenTo = new Map();
  for (const f of fundersById.values()) for (const [pid, amt] of Object.entries(f.given)) { if (!givenTo.has(pid)) givenTo.set(pid, {}); givenTo.get(pid)[f.id] = amt; }
  for (const p of people) {
    if (!p.money) continue;
    const byInd = {};
    for (const [cm, amt] of Object.entries(givenTo.get(p.id) || {})) {
      const ind = industryOf(cm); if (!ind) continue;
      byInd[ind] = (byInd[ind] || 0) + amt;
      const t = industryTotals.get(ind) || { id: ind, total: 0, D: 0, R: 0, I: 0, recipients: {} };
      t.total += amt; t[p.party] = (t[p.party] || 0) + amt; t.recipients[p.id] = (t.recipients[p.id] || 0) + amt;
      industryTotals.set(ind, t);
    }
    p.money.byIndustry = Object.entries(byInd).sort((a, b) => b[1] - a[1]);
  }

  // seat order per chamber: current members by DW-NOMINATE
  const seated = ch => people.filter(p => p.chamber === ch && p.status !== 'elect' && !p.delegate)
    .sort((a, b) => (a.nominate ?? partyMid(a.party)) - (b.nominate ?? partyMid(b.party)));
  const chambers = { H: seated('H'), S: seated('S') };
  const rcPos = { H: new Map(order.H.map((id, i) => [id, i])), S: new Map(order.S.map((id, i) => [id, i])) };

  const states = {};
  for (const p of people) (states[p.state] ||= []).push(p);

  // search index
  const search = [];
  for (const p of people) search.push({ t: 'person', key: norm(`${p.name} ${p.first} ${p.last} ${STATES[p.state] || ''} ${p.state}${p.district ?? ''}`), p });
  for (const f of fundersById.values()) if (f.total + f.ie >= 10000) search.push({ t: 'funder', key: norm(`${f.name} ${f.org || ''}`), f });
  if (bills) for (const [k, b] of Object.entries(bills.bills)) search.push({ t: 'bill', key: norm(`${k} ${b.type}${b.number} ${b.type} ${b.number} ${b.short || ''} ${b.title}`), k, b });

  Object.assign(D, { postmortem, approval, polls, ieYear, dataDir: DIR, caucuses, pacHistory, leadership, givenTo, people, byId, bySlug, order, rollcalls, rcByK, rcPos, funders: fundersById, fundersBySlug, meta, bills, speeches, industries, indName, sectorOf, sectors, industryOf, industryTotals, lobbying, record, chambers, states, search, STATES });
  D.recentRolls = { H: rollcalls.filter(r => r.chamber === 'H').sort(byDate), S: rollcalls.filter(r => r.chamber === 'S').sort(byDate) };
  D.allRolls = [...rollcalls].sort(byDate);
}
function byDate(a, b) { return b.date.localeCompare(a.date) || b.roll - a.roll; }
function partyMid(p) { return p === 'D' ? -0.38 : p === 'R' ? 0.5 : 0; }
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
build();
D.norm = norm;
D.reload = build;
module.exports = D;
