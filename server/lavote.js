'use strict';
// Los Angeles County Registrar-Recorder results (results.lavote.gov) for the
// South Bay and LA races. Contest structure every 10 minutes, live counters
// every 2 minutes. Only contests counted entirely in LA County are applied.

const ELECTION_ID = Number(process.env.LAVOTE_ELECTION_ID || 4348);
const BASE = 'https://results.lavote.gov/ElectionResults';
const UA = 'VoteDash/1.0 (+https://votedash.net; russgilbert@gmail.com)';

const ORD = (n) => n;
function districtNo(title) { const m = title.match(/(\d+)(?:st|nd|rd|th) District/i); return m ? Number(m[1]) : null; }

class LAVote {
  constructor(civic) {
    this.civic = civic;
    this.contests = []; // [{id,title,group,shared,measure,cands:[{id,name,party}]}]
    this.status = { structure: null, counters: null, lastError: null, matched: 0, applied: 0, asOf: null };
    this.map = new Map(); // contest id -> race id
  }

  async get(path) {
    const r = await fetch(`${BASE}/${path}?electionID=${ELECTION_ID}`, { headers: { 'user-agent': UA, accept: 'application/json', referer: 'https://results.lavote.gov/' }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return JSON.parse(await r.text());
  }

  norm(s) { return String(s || '').toLowerCase().replace(/general municipal election|special municipal election|california|^city of |governing board member|member,? board of (directors|trustees)|,|-|\(|\)|\./g, ' ').replace(/\s+/g, ' ').trim(); }

  raceFor(c) {
    const t = c.title;
    const races = [...this.civic.races.values()].filter((r) => r.sb || (r.state === 'CA' && (r.cat === 'house' || r.cat === 'state-senate' || r.cat === 'state-house')));
    let m;
    if ((m = t.match(/UNITED STATES REPRESENTATIVE, (\d+)/i))) return races.find((r) => r.cat === 'house' && r.district === `CA-${m[1].padStart(2, '0')}`) || null;
    if ((m = t.match(/STATE SENATOR, (\d+)/i))) return races.find((r) => r.cat === 'state-senate' && r.district === `CA-SD-${m[1]}`) || null;
    if ((m = t.match(/STATE ASSEMBLY, (\d+)/i))) return races.find((r) => r.cat === 'state-house' && r.district === `CA-AD-${m[1]}`) || null;
    if (/COUNTY MEASURE ([A-Z]+)/i.test(t)) { const l = t.match(/COUNTY MEASURE ([A-Z]+)/i)[1]; return races.find((r) => new RegExp(`Los Angeles County Measure ${l}$`, 'i').test(r.name)) || null; }
    if (/^SHERIFF/i.test(t)) return races.find((r) => /Los Angeles County Sheriff/i.test(r.name)) || null;
    if ((m = t.match(/JUDGE OF THE SUPERIOR COURT.*?(?:OFFICE NO\.?|Office No\.?)\s*(\d+)/i))) return races.find((r) => new RegExp(`Superior Court Judge Office No\\. ${m[1]}$`, 'i').test(r.name)) || null;
    if ((m = t.match(/MEASURE ([A-Z]{1,4})$/i))) {
      const city = (t.match(/^CITY OF ([A-Z .]+?) (GENERAL|SPECIAL)/i) || [])[1];
      if (city) return races.find((r) => new RegExp(`City of ${city.replace(/\s+/g, ' ')} Measure ${m[1]}$`, 'i').test(r.name)) || null;
    }
    // Generic: the distinctive words must match in both directions, so a Lawndale
    // race can never take Saugus numbers.
    const STOP = new Set(['city', 'of', 'member', 'members', 'the', 'council', 'general', 'special', 'municipal', 'election', 'district', 'governing', 'board', 'trustee', 'trustees', 'area', 'no', 'school', 'unified', 'directors', 'division', 'seat', 'measure', 'county', 'los', 'angeles', 'community', 'college', 'member', 'office', 'water', 'library', 'union', 'high', 'elementary', 'and']);
    const keyOf = (str) => new Set(this.norm(str).split(' ').filter((w) => w && !STOP.has(w)));
    const nt = keyOf(t);
    if (!nt.size) return null;
    const same = (a, b) => a.size === b.size && [...a].every((w) => b.has(w));
    const hits = [];
    for (const r of races) {
      if (r.cat === 'house' || r.cat === 'state-senate' || r.cat === 'state-house') continue;
      if (same(keyOf(r.name), nt)) hits.push(r);
    }
    return hits.length === 1 ? hits[0] : null;
  }

  async loadStructure() {
    const j = await this.get('GetElectionData');
    const groups = (j.Data && j.Data.ContestGroups) || [];
    this.contests = [];
    this.map = new Map();
    for (const g of groups) {
      for (const c of g.Contests || []) {
        const shared = /shared with/i.test(c.AdditionalText || '');
        const contest = { id: c.ID, title: c.Title, group: g.Name, shared, measure: c.Type === 'Measure', precincts: c.PrecinctCount || 0, cands: (c.Candidates || []).map((x) => ({ id: x.ID, name: x.Name, party: x.Party })) };
        this.contests.push(contest);
      }
    }
    this.status.structure = new Date().toISOString();
    this.rematch();
  }

  // Races arrive from civicAPI on their own schedule, so match contests to races on every pass.
  rematch() {
    this.map = new Map();
    const used = new Map();
    for (const c of this.contests) {
      if (c.shared) continue;
      const r = this.raceFor(c);
      if (!r) continue;
      if (used.has(r.id)) { this.map.delete(used.get(r.id)); continue; } // ambiguous: drop both
      used.set(r.id, c.id); this.map.set(c.id, r.id);
    }
    this.status.matched = this.map.size;
  }

  async pollCounters() {
    if (!this.contests.length) return;
    this.rematch();
    const j = await this.get('GetCounterData');
    const byRef = new Map();
    for (const x of j.Data || []) if (x.ReferenceType === 'CAND') byRef.set(x.ReferenceID, x.Value);
    const asOf = Date.parse((j.TimeStamp || '') + ' PST') || Date.now();
    this.status.asOf = j.TimeStamp || null;
    let applied = 0;
    for (const c of this.contests) {
      const rid = this.map.get(c.id); if (!rid) continue;
      const alt = c.cands.map((x) => ({ n: x.name, v: Number(byRef.get(x.id) || 0) }));
      if (!alt.some((x) => x.v > 0)) continue;
      if (this.civic.applyAlt(rid, 'LA County', alt, { ts: asOf })) applied++;
    }
    this.status.counters = new Date().toISOString();
    this.status.applied = applied;
  }

  start() {
    const safe = (fn, name) => fn().catch((e) => { this.status.lastError = `${name}: ${e.message}`; console.error('lavote', name, e.message); });
    safe(() => this.loadStructure().then(() => this.pollCounters()), 'structure');
    setInterval(() => safe(() => this.loadStructure(), 'structure'), 10 * 60 * 1000);
    setInterval(() => safe(() => this.pollCounters(), 'counters'), Number(process.env.POLL_LAVOTE_MS || 120000));
  }
}

module.exports = { LAVote };
