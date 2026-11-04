'use strict';
// civicAPI ingest: polls every election-day race in the General and Statewide
// scopes, normalises rows for the wire, diffs them, and reports calls.

const BASE = 'https://civicapi.org/api/v2';
const DATE = process.env.ELECTION_DATE || '2026-11-03';

const STATES = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',
  FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',
  LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',
  MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',
  ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',
  TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
  DC:'District of Columbia',GU:'Guam',VI:'U.S. Virgin Islands',MP:'Northern Mariana Islands',AS:'American Samoa',PR:'Puerto Rico',
};
const TERRITORIES = new Set(['GU', 'VI', 'MP', 'AS', 'PR', 'DC']);

// Seats not on the ballot tonight. Verified 2026-11-03 against civicAPI's
// national aggregate races (87528 Senate, 87535 Governors): Senate D 34 / R 31,
// Governors D 6 / R 8. The House is entirely on the ballot.
const HOLDOVERS = {
  senate: { D: 34, R: 31, I: 0, total: 100, majority: 51 },
  house: { D: 0, R: 0, I: 0, total: 435, majority: 218 },
  governor: { D: 6, R: 8, I: 0, total: 50, majority: 26 },
};

// South Bay (Los Angeles County) races, keyed by civicAPI race id -> tile label.
const SOUTHBAY = {
  182063:'El Segundo', 182062:'El Segundo',
  182070:'Hawthorne', 182068:'Hawthorne', 182069:'Hawthorne', 182071:'Hawthorne', 182219:'Hawthorne',
  182089:'Lawndale', 182088:'Lawndale', 182087:'Lawndale', 182234:'Lawndale', 182233:'Lawndale',
  182170:'Los Angeles',
  182093:'Manhattan Beach',
  182072:'Hermosa Beach', 182073:'Hermosa Beach',
  182123:'Redondo Beach',
  182281:'Torrance',
  182115:'Palos Verdes Estates', 182116:'Palos Verdes Estates',
  182124:'Rolling Hills',
  182122:'Rancho Palos Verdes', 182121:'Rancho Palos Verdes',
  182034:'Carson', 182035:'Carson', 182031:'Carson', 182032:'Carson', 182033:'Carson',
  182255:'PV Peninsula schools', 182292:'PV Peninsula schools',
  182002:'LA County', 182000:'LA County', 182001:'LA County', 182003:'LA County', 182004:'LA County', 182005:'LA County', 182006:'LA County',
  182313:'Water and colleges', 182314:'Water and colleges', 182240:'Water and colleges', 182241:'Water and colleges', 182242:'Water and colleges',
  86986:'Congress', 86994:'Congress', 86995:'Congress',
};
// LA County legislative districts on the ballot (tools: Wikipedia district articles matched against LA County city names).
try {
  for (const d of JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'data', 'la-legislature.json'), 'utf8'))) {
    SOUTHBAY[d.id] = d.type === 'State Senate' ? 'State Senate, LA County' : 'Assembly, LA County';
  }
} catch (e) { /* none */ }
const SOUTHBAY_TILES = [
  ['El Segundo',0,0],['Hawthorne',1,0],['Lawndale',2,0],['Los Angeles',3,0],
  ['Manhattan Beach',0,1],['Hermosa Beach',1,1],['Redondo Beach',2,1],['Torrance',3,1],
  ['Palos Verdes Estates',0,2],['Rolling Hills',1,2],['Rancho Palos Verdes',2,2],['Carson',3,2],
  ['PV Peninsula schools',0,3],['LA County',1,3],['Water and colleges',2,3],['Congress',3,3],
  ['State Senate, LA County',0,4],['Assembly, LA County',1,4],
];

// Incumbents running tonight (Senate by state, House by district), from the
// Ballotpedia-sourced directory. SC is overridden: the sheet mis-flags a
// candidate who shares the sitting senator's surname.
const fs = require('fs');
const path = require('path');
let INCUMBENTS = { senate: {}, house: {} };
try { INCUMBENTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'incumbents.json'), 'utf8')); } catch (e) { /* none */ }
INCUMBENTS.senate.SC = [];
// Sitting senators the sheet missed who are on tonight's ballot (verified against candidate lists).
INCUMBENTS.senate.FL = ['Ashley Moody'];
INCUMBENTS.senate.OH = ['Jon Husted'];
INCUMBENTS.senate.RI = ['John F. Reed'];
function nameKey(n) {
  const toks = String(n || '').toLowerCase().replace(/["“”().,']/g, ' ').split(/\s+/).filter((t) => t && t.length > 1 && !/^(jr|sr|ii|iii|iv|dr|mr|mrs|ms)$/.test(t));
  return { first: toks[0] || '', last: toks[toks.length - 1] || '' };
}
function sameName(a, b) {
  const x = nameKey(a), y = nameKey(b);
  if (!x.last || x.last !== y.last) return false;
  return x.first === y.first || x.first.startsWith(y.first) || y.first.startsWith(x.first);
}

function partyCode(p) {
  if (!p) return 'O';
  if (/^dem/i.test(p)) return 'D';
  if (/^rep/i.test(p)) return 'R';
  if (/^ind/i.test(p)) return 'I';
  return 'O';
}

function category(r) {
  const t = r.type || r.election_type || '';
  if (r.province === 'US') return 'national';
  if (t === 'State Senate') return 'state-senate';
  if (t === 'State House') return 'state-house';
  if ((r.election_type || '') === 'Local' || (r.election_scope || '') === 'Local') return 'local';
  if (t === 'US Senate') return 'senate';
  if (t === 'House of Representatives') return 'house';
  if (t === 'Delegate') return 'delegate';
  if (t === 'Governor') return 'governor';
  if (/referendum|proposition|ballot measure|^statewide$/i.test(t)) return 'ballot';
  if (t === 'State Senate') return 'state-senate';
  if (t === 'State House') return 'state-house';
  return 'statewide';
}

async function getJSON(url, { tries = 3, timeout = 90000 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeout),
        headers: { 'user-agent': 'VoteDash/1.0 (+https://votedash.net)', accept: 'application/json' },
      });
      const text = await res.text();
      if (!res.ok || !text.startsWith('{') && !text.startsWith('[')) {
        throw new Error(`HTTP ${res.status} ${text.slice(0, 60)}`);
      }
      return JSON.parse(text);
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

class Civic {
  constructor(emit) {
    this.emit = emit; // (event, payload)
    this.races = new Map(); // id -> row
    this.sig = new Map(); // id -> signature
    this.national = {}; // senate/house/governor aggregate rows
    this.forecasts = { senate: null, house: null, governor: null };
    this.status = { lastGeneral: null, lastStatewide: null, lastError: null, lastOk: null };
    this.detailCache = new Map(); // id -> {ts, data}
    this.firstLoad = true;
  }

  rating(cat, state, district) {
    const f = this.forecasts;
    if (cat === 'senate' && f.senate) return f.senate.states?.[state]?.rating || null;
    if (cat === 'governor' && f.governor) return f.governor.states?.[state]?.rating || null;
    if (cat === 'house' && f.house && district) return f.house.states?.[district]?.rating || null;
    return null;
  }

  normalise(r) {
    const cat = category(r);
    const cands = (r.candidates || [])
      .map((c) => ({
        n: c.name,
        p: partyCode(c.party),
        pf: c.party || '',
        v: c.votes || 0,
        pc: c.percent || 0,
        w: !!c.winner,
        inc: !!c.incumbent,
        c: c.color || null,
      }))
      .sort((a, b) => b.v - a.v || (a.n === 'Write-in' ? 1 : 0) - (b.n === 'Write-in' ? 1 : 0));
    const total = cands.reduce((s, c) => s + c.v, 0);
    let open = null;
    if (cat === 'senate' || cat === 'house' || cat === 'delegate') {
      const list = cat === 'senate' ? INCUMBENTS.senate[r.province] : INCUMBENTS.house[r.district];
      const names = Array.isArray(list) ? list : []; // seats absent from the directory have no incumbent running
      for (const c of cands) if (names.some((n) => sameName(n, c.n))) c.inc = true;
      open = !cands.some((c) => c.inc);
    }
    const fc = this.forecasts;
    const seat = cat === 'senate' ? fc.senate?.states?.[r.province] : cat === 'governor' ? fc.governor?.states?.[r.province] : cat === 'house' ? fc.house?.states?.[r.district] : null;
    const incParty = seat && seat.incumbent_party ? seat.incumbent_party : null;
    return {
      id: r.id,
      cat,
      type: r.type,
      state: r.province,
      stateName: STATES[r.province] || r.province,
      district: r.district || null,
      name: r.election_name,
      scope: r.election_type,
      pct: r.percent_reporting ?? 0,
      total,
      rating: this.rating(cat, r.province, r.district),
      called: cands.some((c) => c.w),
      open,
      incParty,
      winner: cands.find((c) => c.w) || null,
      territory: TERRITORIES.has(r.province),
      sb: SOUTHBAY[r.id] || null,
      cands,
    };
  }

  signature(row) {
    return `${row.pct}|${row.cands.map((c) => `${c.v}:${c.w ? 1 : 0}`).join(',')}`;
  }

  applyRaces(list, scopeTag) {
    const changed = [];
    const calls = [];
    for (const raw of list) {
      const row = this.normalise(raw);
      if (row.cat === 'national') {
        this.national[row.type] = { ...row, seats: (raw.candidates || []).map((c) => ({ p: partyCode(c.party), seats: c.seats || 0 })) };
        continue;
      }
      const sig = this.signature(row);
      const prev = this.races.get(row.id);
      if (prev && this.sig.get(row.id) === sig && prev.rating === row.rating) continue;
      if (prev) {
        const prevW = prev.winner ? prev.winner.n : null;
        const nowW = row.winner ? row.winner.n : null;
        if (prevW !== nowW) {
          calls.push({
            kind: 'call',
            outlet: 'civicAPI',
            race_id: row.id,
            title: nowW
              ? `${nowW} (${row.winner.p}) wins ${row.name}`
              : `Call withdrawn in ${row.name}`,
            url: `https://civicapi.org/results/elections/${row.id}`,
            ts: Date.now(),
          });
        }
      }
      this.races.set(row.id, row);
      this.sig.set(row.id, sig);
      changed.push(row);
    }
    if (changed.length && !this.firstLoad) this.emit('races', { rows: changed, bop: this.bop() });
    if (calls.length) this.emit('calls', calls);
    return changed.length;
  }

  bop() {
    const out = {};
    for (const cat of ['senate', 'house', 'governor']) {
      const h = HOLDOVERS[cat];
      const won = { D: 0, R: 0, I: 0, O: 0 };
      let onBallot = 0;
      for (const r of this.races.values()) {
        if (r.cat !== cat) continue;
        if (cat === 'governor' && r.territory) continue;
        onBallot++;
        if (r.winner) won[r.winner.p] = (won[r.winner.p] || 0) + 1;
      }
      const called = won.D + won.R + won.I + won.O;
      out[cat] = {
        hold: { D: h.D, R: h.R, I: h.I },
        won,
        D: h.D + won.D,
        R: h.R + won.R,
        I: h.I + won.I + won.O,
        onBallot,
        remaining: onBallot - called,
        total: h.total,
        majority: h.majority,
      };
    }
    return out;
  }

  async pollScope(scope) {
    const extra = scope === 'CALocal' ? '&province=CA&election_type=Local' : scope === 'LocalSenate' ? '&election_type=Local&limit=50000' : `&election_type=${scope}`;
    const url = `${BASE}/race/search?startDate=${DATE}&endDate=${DATE}&country=US${extra}${scope === 'LocalSenate' ? '' : '&limit=5000'}`;
    const data = await getJSON(url, scope === 'LocalSenate' ? { tries: 2, timeout: 240000 } : {});
    if (!data || !Array.isArray(data.races)) throw new Error('bad search payload');
    if (scope === 'LocalSenate') return data.races.filter((r) => r.type === 'State Senate' || SOUTHBAY[r.id]);
    return scope === 'CALocal' ? data.races.filter((r) => SOUTHBAY[r.id]) : data.races;
  }

  async pollForecasts() {
    for (const ch of ['senate', 'house', 'governor']) {
      try {
        this.forecasts[ch] = await getJSON(`${BASE}/forecast/${ch}/2026/civicapi`, { tries: 2 });
      } catch (e) {
        console.error('forecast', ch, e.message);
      }
    }
    // re-attach ratings
    for (const r of this.races.values()) r.rating = this.rating(r.cat, r.state, r.district);
  }

  async detail(id) {
    const c = this.detailCache.get(id);
    if (c && Date.now() - c.ts < 15000) return c.data;
    const raw = await getJSON(`${BASE}/race/${id}`, { tries: 2, timeout: 30000 });
    const data = {
      id,
      name: raw.election_name,
      type: raw.election_type,
      state: raw.province,
      district: raw.district,
      polls_open: raw.polls_open,
      polls_close: raw.polls_close,
      pct: raw.percent_reporting ?? 0,
      registered: raw.registered_voters,
      updated: raw.last_updated,
      disputed: !!raw.is_disputed,
      cands: (raw.candidates || []).map((c) => ({
        n: c.name, p: partyCode(c.party), pf: c.party || '', v: c.votes || 0, pc: c.percent || 0, w: !!c.winner, inc: !!c.incumbent,
      })).map((c) => { const list = raw.election_type === 'US Senate' ? INCUMBENTS.senate[raw.province] : INCUMBENTS.house[raw.district]; if (Array.isArray(list) && list.some((n) => sameName(n, c.n))) c.inc = true; return c; }).sort((a, b) => b.v - a.v),
      regions: Object.values(raw.region_results || {}).map((g) => ({
        name: g.name, type: g.type, fips: g.fips || null, pct: g.percent_reporting ?? 0,
        cands: (g.candidates || []).map((c) => ({ n: c.name, p: partyCode(c.party), v: c.votes || 0, pc: c.percent || 0 })),
      })),
    };
    this.detailCache.set(id, { ts: Date.now(), data });
    return data;
  }

  // Seed from the running production server so a fresh container starts with
  // the last known results instead of an empty board.
  async seedFrom(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const snap = await res.json();
    if (!snap.races || !snap.races.length) throw new Error('empty snapshot');
    // Rows are seeded without signatures so the first live poll re-normalises every one.
    for (const row of snap.races) this.races.set(row.id, row);
    if (snap.national) this.national = snap.national;
    this.status.lastOk = snap.status?.civic?.lastOk || new Date().toISOString();
    return snap;
  }

  async start() {
    this.pollForecasts().catch(() => {});
    const loop = async (scope, every, key) => {
      for (;;) {
        const t0 = Date.now();
        try {
          const list = await this.pollScope(scope);
          const n = this.applyRaces(list, scope);
          console.log(`poll ${scope}: ${list.length} races, ${n} changed, ${Date.now() - t0}ms`);
          this.status[key] = new Date().toISOString();
          this.status.lastOk = this.status[key];
          this.status.lastError = null;
        } catch (e) {
          this.status.lastError = `${scope}: ${e.message}`;
          console.error('poll', scope, e.message);
        }
        const wait = Math.max(3000, every - (Date.now() - t0));
        await new Promise((r) => setTimeout(r, wait));
      }
    };
    // First General load before serving diffs; Statewide loads in its own loop.
    const seedUrl = process.env.SEED_URL || '';
    if (seedUrl && !this.races.size) {
      try { const snap = await this.seedFrom(seedUrl); console.log(`seeded ${this.races.size} races from ${seedUrl}`); this.seed = snap; } catch (e) { console.error('seed', e.message); }
    }
    console.log('initial General load');
    try { this.applyRaces(await this.pollScope('General'), 'General'); this.status.lastGeneral = new Date().toISOString(); this.status.lastOk = this.status.lastGeneral; } catch (e) { console.error('init General', e.message); }
    this.firstLoad = false;
    this.emit('ready', {});
    loop('General', Number(process.env.POLL_GENERAL_MS || 20000), 'lastGeneral');
    loop('Statewide', Number(process.env.POLL_STATEWIDE_MS || 45000), 'lastStatewide');
    setTimeout(() => loop('CALocal', Number(process.env.POLL_LOCAL_MS || 45000), 'lastLocal'), 5000);
    setTimeout(() => loop('LocalSenate', Number(process.env.POLL_LOCAL_SENATE_MS || 300000), 'lastLocalSenate'), 20000);
    setInterval(() => this.pollForecasts().catch(() => {}), 10 * 60 * 1000);
  }

  snapshotRows() {
    return [...this.races.values()];
  }
}

module.exports = { Civic, STATES, HOLDOVERS, partyCode, SOUTHBAY_TILES };
