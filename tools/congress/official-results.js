// 2026 general election results from each state's own election authority, replacing the election-night count
// (civicAPI/CNN, archive/2026) race by race. States certify on their own schedules (late November to mid-December),
// so this runs every night: a state's file is applied once the state itself labels it official, and until then the
// election-night count stands (an unofficial state file can still be partial).
//
// Reads <raw>/snapshot.json, downloads each state's files into <raw>/official-results/, and writes the snapshot back
// with each matched race's candidates replaced by the state's: names, votes, and write-in lines as the state counts
// them. Each patched race carries `official: { name, url, label, asOf }`. A state whose file cannot be read keeps
// its previous counts.
//
// Adapters cover the states whose file can be read by a script and whose official status can be read from the
// state's own data or file. A state that publishes its official results only as PDFs or behind a browser check
// needs an adapter written when it certifies.
// Usage: node tools/congress/official-results.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAW = process.env.CONGRESS_RAW || path.join(__dirname, '../../data/raw');
const DIR = path.join(RAW, 'official-results');
const UA = 'Mozilla/5.0 (compatible; VoteDash/1.0; +https://votedash.net/about)';

async function get(url, name) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(120e3), redirect: 'follow' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.length) throw new Error('empty');
      const file = path.join(DIR, name);
      fs.writeFileSync(file + '.tmp', buf); fs.renameSync(file + '.tmp', file);
      return { buf, file, modified: r.headers.get('last-modified') };
    } catch (e) { if (i === 2) throw new Error(`${url}: ${e.message}`); await new Promise(res => setTimeout(res, 5000 * (i + 1))); }
  }
}
const iso = d => (d ? new Date(d) : new Date()).toISOString().slice(0, 10);
const tx = a => Array.isArray(a) ? ((a.find(x => x.languageId === 'en') || a[0] || {}).text || '') : (a || '');
const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15 };
function districtOf(t) {
  const d = t.match(/District\s*(?:No\.?\s*)?(\d+)|(\d+)(?:st|nd|rd|th)\s+District|\((\d+)\)\s+District/i); if (d) return +(d[1] || d[2] || d[3]);
  const w = t.match(new RegExp(`\\b(${Object.keys(ORD).join('|')})\\s+District`, 'i')); return w ? ORD[w[1].toLowerCase()] : 0;
}
const isSenate = t => /^(Member,\s+)?(U\.?\s?S\.?\s+|United States\s+)?Senat(e|or)( in Congress)?$/i.test(t.trim());
const isHouse = t => /\b(House of Representatives|U\.?\s?S\.?\s+House|Representative (in|to) Congress|U\.?\s?S\.?\s+Representative|United States Representative)\b/i.test(t) && !/Delegates|State House/i.test(t);
// minimal CSV row split (quoted fields with commas and newlines)
function csv(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(f); f = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += ch;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
// minimal XLSX sheet reader: rows of { column letter: value }
function xlsxSheet(file, sheetName) {
  const read = p => execFileSync('unzip', ['-p', file, p], { maxBuffer: 64e6 }).toString('utf8');
  const ss = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => [...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(x => x[1]).join(''));
  const rid = (read('xl/workbook.xml').match(new RegExp(`<sheet [^>]*name="${sheetName}"[^>]*r:id="(rId\\d+)"`)) || [])[1];
  const target = (read('xl/_rels/workbook.xml.rels').match(new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`)) || [])[1];
  const x = read('xl/' + target.replace(/^\/?xl\//, ''));
  return [...x.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)].map(r => Object.fromEntries([...r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)]
    .map(c => { const v = (c[3] || '').match(/<v>([^<]*)<\/v>/); return [c[1], v ? (/t="s"/.test(c[2]) ? ss[+v[1]] : v[1]) : '']; })));
}

// Each adapter's load() returns { races: [{ ch: 'H'|'S', district, cands: [{ n, p, v }] }], label, asOf };
// district: the House district number, 0 at large or for a delegate, null for the Senate.
const enhancedVoting = (name, url, page) => ({
  name, page,
  async load(st) {
    const { buf } = await get(url, `${st}.json`);
    const j = JSON.parse(buf.toString('utf8'));
    const races = [];
    for (const b of j.ballotItems || []) {
      const t = tx(b.name); const ch = isSenate(t) ? 'S' : isHouse(t) ? 'H' : null;
      if (!ch || !b.summaryResults) continue;
      races.push({ ch, district: ch === 'H' ? districtOf(t) : null,
        cands: b.summaryResults.ballotOptions.map(o => ({ n: tx(o.name).replace(/(\s*\([^)]*\))+\s*$/, '').trim(), p: o.isWriteIn ? 'WRI' : ((o.party && o.party.abbreviation) || '').toUpperCase(), v: o.voteCount || 0 })) });
    }
    return { races, label: j.election && j.election.isOfficialResults ? 'official' : 'unofficial', asOf: iso(j.election && j.election.lastUpdated) };
  },
});
const ADAPTERS = {
  // Florida Division of Elections: tab-delimited, a row per county and candidate; write-ins are only the qualified
  // write-in candidates (party WRI), the way the state counts them
  FL: {
    name: 'Florida Division of Elections', page: 'https://floridaelectionwatch.gov/FederalOffices',
    async load(st) {
      const { buf, modified } = await get('https://flelectionfiles.floridados.gov/enightfilespublic/20261103_ElecResultsFL.txt', `${st}.txt`);
      const rows = buf.toString('utf8').replace(/\r/g, '').split('\n').filter(Boolean).map(l => l.split('\t'));
      const h = rows[0], c = n => h.indexOf(n); const races = new Map();
      for (const r of rows.slice(1)) {
        const code = r[c('RaceCode')]; if (code !== 'USR' && code !== 'USS') continue;
        const ch = code === 'USS' ? 'S' : 'H', district = ch === 'H' ? +r[c('Juris1num')].trim() : null, k = ch + district;
        if (!races.has(k)) races.set(k, { ch, district, by: new Map() });
        const n = [r[c('CanNameFirst')], r[c('CanNameMiddle')], r[c('CanNameLast')]].map(s => (s || '').trim()).filter(Boolean).join(' ');
        const by = races.get(k).by; const x = by.get(n) || { n, p: r[c('PartyCode')], v: 0 }; x.v += +r[c('CanVotes')] || 0; by.set(n, x);
      }
      // the Elections Canvassing Commission certified the federal results Nov 17; the file is its count
      return { races: [...races.values()].map(r => ({ ch: r.ch, district: r.district, cands: [...r.by.values()] })), label: 'official', asOf: iso(modified) };
    },
  },
  AZ: enhancedVoting('Arizona Secretary of State', 'https://app.enhancedvoting.com/results/public/api/elections/Arizona/110326GeneralElection/data', 'https://app.enhancedvoting.com/results/public/Arizona/110326GeneralElection'),
  GA: enhancedVoting('Georgia Secretary of State', 'https://results.sos.ga.gov/results/public/api/elections/Georgia/11032026GeneralAndSpecialElection/data', 'https://results.sos.ga.gov/results/public/Georgia/elections/11032026GeneralAndSpecialElection'),
  ID: enhancedVoting('Idaho Secretary of State', 'https://results.voteidaho.gov/results/public/api/elections/id/nov2026/data', 'https://results.voteidaho.gov/results/public/id/elections/nov2026'),
  RI: enhancedVoting('Rhode Island Department of State', 'https://electionresults.ri.gov/results/public/api/elections/rhodeisland/2026StatewideGeneralElection/data', 'https://electionresults.ri.gov/results/public/rhodeisland/elections/2026StatewideGeneralElection'),
  UT: enhancedVoting('Utah Lieutenant Governor, Elections Office', 'https://electionresults.utah.gov/results/public/api/elections/utah/General11032026/data', 'https://electionresults.utah.gov/results/public/utah/elections/General11032026'),
  VA: enhancedVoting('Virginia Department of Elections', 'https://enr.elections.virginia.gov/results/public/api/elections/virginia/2026-November-General/data', 'https://enr.elections.virginia.gov/results/public/virginia/elections/2026-November-General'),
  WA: enhancedVoting('Washington Secretary of State', 'https://results.votewa.gov/results/public/api/elections/washington/20261103/data', 'https://results.votewa.gov/results/public/washington/elections/20261103'),
  // Indiana Election Division: certified flag in settings.json
  IN: {
    name: 'Indiana Election Division', page: 'https://enr.indianavoters.in.gov/',
    async load(st) {
      const s = JSON.parse((await get('https://enr.indianavoters.in.gov/site/data/settings.json', `${st}-settings.json`)).buf.toString('utf8')).Root;
      const j = JSON.parse((await get('https://enr.indianavoters.in.gov/site/data/OffCatC_1005_B.json', `${st}.json`)).buf.toString('utf8'));
      const list = [].concat(j.Root.StatewideSummary.Race || []);
      return { label: s.Certified === 'T' ? 'official' : 'unofficial', asOf: iso(s.WriteTime),
        races: list.filter(r => isHouse(r.OFFICE_TITLE) || isSenate(r.OFFICE_TITLE)).map(r => ({ ch: isSenate(r.OFFICE_TITLE) ? 'S' : 'H', district: isSenate(r.OFFICE_TITLE) ? null : districtOf(r.OFFICE_TITLE),
          cands: [].concat(r.Candidates.Candidate).map(c => ({ n: c.NAME_ON_BALLOT.replace(/\s*\(W\/I\)\s*$/, ''), p: /\(W\/I\)/.test(c.NAME_ON_BALLOT) ? 'WRI' : c.PARTY, v: +c.TOTAL || 0 })) })) };
    },
  },
  // North Dakota Secretary of State: results and choice names come from two calls; isOfficial on the results
  ND: {
    name: 'North Dakota Secretary of State', page: 'https://resultsnd.sos.nd.gov/#election=348',
    async load(st) {
      const r = JSON.parse((await get('https://api.resultsnd.sos.nd.gov/Contest/GetContestResults?cId=north-dakota&electionID=348&contestType=SW', `${st}.json`)).buf.toString('utf8'));
      const l = JSON.parse((await get('https://api.resultsnd.sos.nd.gov/Contest/GetContestSearchList?cid=north-dakota&electionID=348', `${st}-names.json`)).buf.toString('utf8'));
      const names = l.response.contests, res = r.response.contests, races = [];
      for (const [id, meta] of Object.entries(names)) {
        const t = meta.contestName || ''; const ch = isSenate(t) ? 'S' : isHouse(t) ? 'H' : null; if (!ch || !res[id]) continue;
        const cands = [...res[id].choices, ...(res[id].writeInChoices || [])].map(c => { const m = meta.choices[c.choiceID] || {}; const n = (m.name || '').replace(/\s+/g, ' ').trim();
          return { n: /^write-?in$/i.test(n) ? 'Write-in' : n, p: /^write-?in$/i.test(n) ? 'WRI' : (m.partyID || '').trim(), v: c.totalVotes || 0 }; });
        races.push({ ch, district: ch === 'H' ? 0 : null, cands });
      }
      return { races, label: r.isOfficial ? 'official' : 'unofficial', asOf: iso(r.lastUpdated) };
    },
  },
  // Vermont Secretary of State: per-town rows for each office, summed here; isOfficial in the election index
  VT: {
    name: 'Vermont Secretary of State', page: 'https://electionresults.vermont.gov/',
    async load(st) {
      const idx = JSON.parse((await get('https://static.electionresults.vermont.gov/elections/elections.json', `${st}-index.json`)).buf.toString('utf8'));
      const list = [].concat(idx.elections || idx.d || idx);
      const e = list.find(x => JSON.stringify(x).includes('68d61e96-1d28-4210-8c1d-8e90512ae105'));
      const official = !!(e && (e.isOfficial || e.io || /official/i.test(JSON.stringify(e).match(/"[^"]*[Ss]tatus[^"]*":"[^"]*"/) || '')));
      const raw = (await get('https://static.electionresults.vermont.gov/elections/68d61e96-1d28-4210-8c1d-8e90512ae105-f-20261117185828.json', `${st}.json`)).buf.toString('utf8');
      const docs = raw.split(/(?<=\})\s*(?=\{"d")/).map(s => JSON.parse(s));
      const races = [];
      for (const doc of docs) for (const part of doc.d || []) for (const o of part.o || []) {
        if (!isHouse(o.on) && !isSenate(o.on)) continue;
        // the STATE WIDE row is the statewide total (the other rows are towns); write-in names are one line
        const sw = (o.cs || []).find(t => /^STATE\s*WIDE$/i.test((t.tn || '').trim())); if (!sw) continue;
        const cands = (sw.rc || []).map(c => ({ n: titleCase(c.cn), p: (c.pn || '').slice(0, 3).toUpperCase(), v: c.vc || 0 }));
        const wi = (sw.wc || []).reduce((a, c) => a + (c.vc || 0), 0);
        if (wi) cands.push({ n: 'Write-in', p: 'WRI', v: wi });
        races.push({ ch: isSenate(o.on) ? 'S' : 'H', district: isSenate(o.on) ? null : 0, cands });
      }
      return { races, label: official ? 'official' : 'unofficial', asOf: '2026-11-17' };
    },
  },
  // Wyoming Secretary of State: the official summary workbook (file names carry OFFICIAL), Total row per office
  WY: {
    name: 'Wyoming Secretary of State', page: 'https://sos.wyo.gov/Elections/Docs/2026/GeneralResults.aspx',
    async load(st) {
      const { file } = await get('https://sos.wyo.gov/Elections/Docs/2026/Results/General/2026_Wyoming_General_Results.zip', `${st}.zip`);
      const inner = execFileSync('unzip', ['-Z1', file]).toString().split(/\r?\n/).find(n => /Summaries.*OFFICIAL\.xlsx$/i.test(n));
      if (!inner) return { races: [], label: 'unofficial' };
      const xl = path.join(DIR, `${st}-summary.xlsx`); fs.writeFileSync(xl, execFileSync('unzip', ['-p', file, inner], { maxBuffer: 64e6 }));
      const rows = xlsxSheet(xl, 'Statewide Candidates');
      const officeRow = rows.find(r => Object.values(r).some(v => /United States (Senator|Representative)/i.test(v)));
      const nameRow = rows[rows.indexOf(officeRow) + 1], total = rows.find(r => /^Total$/i.test((r.A || '').trim()));
      const cols = Object.keys(nameRow).sort((a, b) => a.length - b.length || a.localeCompare(b));
      const races = [];
      for (const [col, office] of Object.entries(officeRow)) {
        if (!/United States (Senator|Representative)/i.test(office)) continue;
        const start = cols.indexOf(col); const cands = [];
        for (let i = start; i < cols.length; i++) {
          if (i > start && officeRow[cols[i]]) break;
          const n = (nameRow[cols[i]] || '').replace(/\s+/g, ' ').trim(); if (!n || /^(Over|Under)votes$/i.test(n)) continue;
          const pm = n.match(/\(([A-Z])\)$/);
          cands.push({ n: /^Write-?Ins?$/i.test(n) ? 'Write-in' : n.replace(/\s*\([A-Z]\)$/, ''), p: /^Write-?Ins?$/i.test(n) ? 'WRI' : pm ? pm[1] : '', v: +total[cols[i]] || 0 });
        }
        races.push({ ch: /Senator/i.test(office) ? 'S' : 'H', district: /Senator/i.test(office) ? null : 0, cands });
      }
      return { races, label: 'official', asOf: '2026-11-09' };
    },
  },
  // Guam Election Commission: official results CSV, one row per precinct and a COUNTY TOTALS row
  GU: {
    name: 'Guam Election Commission', page: 'https://gec.guam.gov/2026-general-election-official-results/',
    async load(st) {
      const rows = csv((await get('https://drive.google.com/uc?export=download&id=1yhawYqOqiEooYNxBv1G2tnSD27MF5QRR', `${st}.csv`)).buf.toString('utf8'));
      const ix = rows[0].map((h, i) => h === 'Delegate to Congress' ? i : -1).filter(i => i >= 0);
      const tot = rows.find(r => /COUNTY TOTALS/i.test(r.join(' ')));
      const cands = ix.map(i => ({ h: rows[1][i].replace(/\s+/g, ' ').trim(), v: +tot[i] || 0 })).filter(c => !/^(Over|Under)/i.test(c.h))
        .map(c => { const m = c.h.match(/^(REP|DEM)\s+(.+?),\s*(.+)$/); return m ? { n: `${m[3]} ${m[2][0]}${m[2].slice(1).toLowerCase()}`, p: m[1], v: c.v } : { n: 'Write-in', p: 'WRI', v: c.v }; });
      return { races: [{ ch: 'H', district: 0, cands }], label: 'official', asOf: '2026-11-21' };
    },
  },
};
function titleCase(s) { return s.toLowerCase().replace(/(^|[\s"'-])([a-z])/g, (m, a, b) => a + b.toUpperCase()); }

const PARTY = { DEM: 'D', REP: 'R', D: 'D', R: 'R', NPA: 'I', IND: 'I', I: 'I', WRI: 'W', LIB: 'L', L: 'L', GRE: 'G', DEMOCRATIC: 'D', REPUBLICAN: 'R' };
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const lastOf = s => { const w = norm(s).split(' ').filter(x => !/^(jr|sr|ii|iii|iv)$/.test(x)); return w[w.length - 1] || ''; };

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  const snapFile = path.join(RAW, 'snapshot.json');
  const snap = JSON.parse(fs.readFileSync(snapFile, 'utf8'));
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  const report = [];
  for (const [st, a] of Object.entries(ADAPTERS)) {
    if (only && !only.includes(st)) continue;
    let got;
    try { got = await a.load(st); } catch (e) { report.push(`${st}: kept previous counts (${e.message.slice(0, 120)})`); continue; }
    if (got.label !== 'official') { report.push(`${st}: not official yet (${got.asOf || 'no date'})`); continue; }
    let patched = 0;
    for (const o of got.races) {
      const r = snap.races.find(x => x.state === st && x.scope === 'General' && (o.ch === 'S' ? x.cat === 'senate'
        : ['house', 'delegate'].includes(x.cat) && (/-(\d+)$/.test(x.district || '') ? +x.district.split('-')[1] : 0) === o.district));
      if (!r) continue;
      const cands = o.cands.filter(c => c.v > 0 || !/write/i.test(c.n + ' ' + c.p)); // an empty write-in line is no candidate
      const total = cands.reduce((s, c) => s + c.v, 0); if (!total) continue;
      const old = r.cands;
      r.cands = cands.sort((x, y) => y.v - x.v).map(c => {
        const m = old.find(x => lastOf(x.n) === lastOf(c.n) && x.p === (PARTY[c.p] || x.p)) || old.find(x => lastOf(x.n) === lastOf(c.n));
        return { ...(m || {}), n: m ? m.n : c.n, p: m ? m.p : PARTY[c.p] || c.p, v: c.v, pc: +(c.v / total * 100).toFixed(4), w: m ? !!m.w : false };
      });
      r.winner = r.cands.find(c => c.w) || r.winner;
      r.total = total; r.pct = 100;
      r.official = { name: a.name, url: a.page, label: got.label, asOf: got.asOf };
      patched++;
    }
    report.push(`${st}: ${patched} of ${got.races.length} races from ${a.name} (${got.label}, ${got.asOf})`);
  }
  fs.writeFileSync(snapFile, JSON.stringify(snap));
  console.log('official results:', report.join('; '));
})();
