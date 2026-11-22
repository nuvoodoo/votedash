'use strict';
// Live feeds: House floor schedule, Senate floor schedule, committee meetings,
// and roll calls newer than the Voteview build. Refreshed in the background.
const fs = require('fs');
const os = require('os');
const path = require('path');
const D = require('./data');
const MK = require('./markets');

const KEY = process.env.DATA_GOV_KEY || readEnvKey();
const CACHE = process.env.LIVE_CACHE || path.join(os.tmpdir(), 'votedash-live.json');
const UA = 'Mozilla/5.0 (compatible; VoteDash/1.0; +https://votedash.net/about)';
const L = { house: [], houseStatus: null, senate: [], meetings: {}, fresh: [], updated: null, sources: {} };
// last success / failure per upstream host, for /api/data-status (the crew's watch reads it)
function mark(url, err) { let h; try { h = new URL(url).host; } catch { return; } const s = L.sources[h] || (L.sources[h] = {}); if (err) { s.fail = new Date().toISOString(); s.error = String(err); } else s.ok = new Date().toISOString(); }
function readEnvKey() { try { const t = fs.readFileSync(path.join(__dirname, '../../../votedash.env'), 'utf8'); const m = t.match(/^DATA_GOV_KEY=(.+)$/m); return m ? m[1].trim() : null; } catch { return null; } }

async function get(url, type = 'text') {
  for (let i = 0; i < 3; i++) {
    try {
      // a hung request would hold the refresh lock and freeze every feed until restart
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30e3) });
      if (r.status === 404) { mark(url); return null; }
      if (!r.ok) throw new Error(r.status);
      const out = type === 'json' ? await r.json() : await r.text();
      mark(url); return out;
    } catch (e) { if (i === 2) { mark(url, e.message); console.error('live fetch', url.replace(/api_key=[^&]+/, 'api_key=x'), e.message); return null; } await new Promise(r => setTimeout(r, 1500 * (i + 1))); }
  }
}
const dec = s => (s || '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’').replace(/&#8216;|&lsquo;/g, '‘').replace(/&#8220;|&ldquo;/g, '“').replace(/&#8221;|&rdquo;/g, '”').replace(/&#8211;|&ndash;/g, '-').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function isoDate(s) {
  s = (s || '').trim(); let m;
  if ((m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})/))) return `${m[3]}-${String(MON[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if ((m = s.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/))) { const mo = MON[m[1].slice(0, 3).toLowerCase()]; if (mo) return `${m[3]}-${String(mo).padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
  if ((m = s.match(/([a-z]+)-(\d{1,2})-(\d{4})$/))) { const mo = MON[m[1].slice(0, 3)]; if (mo) return `${m[3]}-${String(mo).padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
  return null;
}
const tag = (x, t) => { const m = x.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`)); return m ? dec(m[1]).trim() : ''; };

// "H.R. 7254", "H.R.2347", "S. 123", "H.Con.Res. 93" -> "hr7254"
function billKey(s) {
  const m = /\b(H\.?\s?R|S|H\.?\s?Res|S\.?\s?Res|H\.?\s?J\.?\s?Res|S\.?\s?J\.?\s?Res|H\.?\s?Con\.?\s?Res|S\.?\s?Con\.?\s?Res)\.?\s?(\d+)\b/i.exec(s || '');
  return m ? m[1].toLowerCase().replace(/[^a-z]/g, '') + m[2] : null;
}
const BILL_RE = /\b(?:H\.\s?R\.|S\.|H\.\s?Res\.|S\.\s?Res\.|H\.\s?J\.\s?Res\.|S\.\s?J\.\s?Res\.|H\.\s?Con\.\s?Res\.|S\.\s?Con\.\s?Res\.)\s?\d+/g;

// Monday of the week in Eastern time, as YYYYMMDD
function mondayOf(d) {
  const et = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = (et.getDay() + 6) % 7; et.setDate(et.getDate() - day);
  return `${et.getFullYear()}${String(et.getMonth() + 1).padStart(2, '0')}${String(et.getDate()).padStart(2, '0')}`;
}

async function markets() { await MK.refresh(); }
// Is the House sitting? The Clerk's floor proceedings for the session end with the latest legislative day, its
// newest action first; an adjournment (H61000) names the next meeting date.
async function houseStatus() {
  const y = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).slice(0, 4));
  const x = await get(`https://clerk.house.gov/floor/HDoc-119-${y === 2025 ? 1 : 2}-FloorProceedings.xml`);
  if (!x || !x.includes('<legislative_day ')) return;
  const last = x.split('<legislative_day ').pop();
  const a = last.match(/act-id="(\w+)"[\s\S]*?<action_description>([\s\S]*?)<\/action_description>/); if (!a) return;
  const adjourned = a[1] === 'H61000';
  const next = adjourned ? isoDate((a[2].match(/on ([A-Za-z]+ \d{1,2}, \d{4})/) || [])[1]) : null;
  L.houseStatus = { adjourned, next, checked: new Date().toISOString() };
}
async function houseFloor() {
  const weeks = [mondayOf(new Date()), mondayOf(new Date(Date.now() + 7 * 864e5))];
  const out = [];
  for (const w of weeks) {
    const x = await get(`https://docs.house.gov/floor/Download.aspx?file=/billsthisweek/${w}/${w}.xml`);
    if (!x || !x.includes('<floorschedule')) continue;
    const cats = [];
    for (const c of x.split('<category ').slice(1)) {
      const name = (c.match(/type="([^"]+)"/) || [])[1];
      const items = c.split('<floor-item ').slice(1).filter(it => /remove-date=""/.test(it)).map(it => {
        const num = tag(it, 'legis-num'); const text = tag(it, 'floor-text').replace(/,\s*$/, '');
        const doc = (it.match(/doc-url="([^"]+)"/) || [])[1] || null;
        return { num, key: billKey(num), text, doc };
      }).filter(i => i.num || i.text);
      if (items.length) cats.push({ name: dec(name), items });
    }
    const wd = `${w.slice(0, 4)}-${w.slice(4, 6)}-${w.slice(6)}`;
    out.push({ week: wd, cats, url: `https://docs.house.gov/floor/Default.aspx?date=${wd}` });
  }
  if (out.length) L.house = out;
}

async function senateFloor() {
  const list = await get('https://www.democrats.senate.gov/floor/senate-schedule');
  if (!list) return;
  const links = [...new Set(list.match(/https:\/\/www\.democrats\.senate\.gov\/\d{4}\/\d{2}\/\d{2}\/schedule-for-[a-z0-9-]+/g) || [])].slice(0, 2);
  const out = [];
  for (const u of links) {
    const h = await get(u); if (!h) continue;
    const i = h.indexOf('js-press-release'); if (i < 0) continue;
    const end = h.indexOf('</div>', i);
    const paras = h.slice(h.indexOf('>', i) + 1, end).split(/<\/p>/).map(p => dec(p.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()).filter(p => p && p.length > 1);
    const title = dec((h.match(/<title>([^<|]+)/) || [])[1] || '').trim();
    out.push({ title, date: isoDate(u), paras, url: u });
  }
  if (out.length) L.senate = out;
}

async function meetings() {
  if (!KEY) return;
  const cutoff = Date.now() - 45 * 864e5; const today = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  for (let off = 0; off < 2000; off += 250) {
    const j = await get(`https://api.congress.gov/v3/committee-meeting/119?limit=250&offset=${off}&format=json&api_key=${KEY}`, 'json');
    const rows = j && j.committeeMeetings; if (!rows || !rows.length) break;
    for (const r of rows) {
      const c = L.meetings[r.eventId];
      if (c && c.updateDate === r.updateDate) continue;
      const d = await get(`${r.url.replace('?format=json', '')}?format=json&api_key=${KEY}`, 'json');
      const m = d && d.committeeMeeting; if (!m) continue;
      const docs = (m.meetingDocuments || []);
      const bills = [...new Set(docs.map(x => billKey(x.name)).filter(Boolean).concat((m.relatedItems && m.relatedItems.bills || []).map(b => (b.type || '').toLowerCase() + b.number)))];
      L.meetings[r.eventId] = {
        id: r.eventId, updateDate: r.updateDate, chamber: m.chamber, date: m.date, title: (m.title || '').trim(), type: m.type, status: m.meetingStatus,
        committees: (m.committees || []).map(c => ({ name: c.name, code: (c.systemCode || '').toUpperCase() })),
        where: m.location ? [m.location.building, m.location.room].filter(Boolean).join(', ') : null,
        bills, video: (m.videos || [])[0] ? m.videos[0].url : null,
        url: `https://www.congress.gov/event/119th-congress/${(m.chamber || '').toLowerCase()}-event/${r.eventId}`
      };
    }
    if (Math.max(...rows.map(r => Date.parse(r.updateDate))) < cutoff || off >= 750) break;
  }
  for (const [id, m] of Object.entries(L.meetings)) if (!m.date || m.date.slice(0, 10) < today) delete L.meetings[id];
}

// roll calls after the last one in the build
const WORD = { yea: 'Y', aye: 'Y', nay: 'N', no: 'N', present: 'P', 'not voting': 'X' };
async function freshVotes() {
  const lis = new Map(D.people.filter(p => p.ids && p.ids.lis).map(p => [p.ids.lis, p.id]));
  const add = [];
  for (const ch of ['H', 'S']) {
    const built = D.rollcalls.filter(r => r.chamber === ch && !r.fresh).sort((a, b) => b.roll - a.roll)[0];
    if (!built) continue;
    const have = new Set(D.rollcalls.filter(r => r.chamber === ch).map(r => r.session + '-' + r.clerk));
    const year = built.session === 1 ? 2025 : 2026;
    for (let n = built.clerk + 1; n < built.clerk + 60; n++) {
      if (have.has(built.session + '-' + n)) continue;
      const url = ch === 'H' ? `https://clerk.house.gov/evs/${year}/roll${String(n).padStart(3, '0')}.xml` : `https://www.senate.gov/legislative/LIS/roll_call_votes/vote119${built.session}/vote_119_${built.session}_${String(n).padStart(5, '0')}.xml`;
      const x = await get(url);
      if (!x || x.length < 300) break;
      const codes = Array(D.order[ch].length).fill('0'); const pos = D.rcPos[ch];
      let date, question, result, bill, desc, nomination = null, req = '1/2';
      if (ch === 'H') {
        for (const b of x.split('<recorded-vote>').slice(1)) { const id = (b.match(/name-id="([A-Z]\d{6})"/) || [])[1]; const i = id && pos.get(id); if (i != null) codes[i] = WORD[tag(b, 'vote').toLowerCase()] || '0'; }
        date = isoDate(tag(x, 'action-date'));
        question = tag(x, 'vote-question'); result = tag(x, 'vote-result'); bill = billKey(tag(x, 'legis-num').replace(/^H R /, 'H.R. ').replace(/^H RES /, 'H.Res. ').replace(/^S /, 'S. ')); desc = tag(x, 'vote-desc');
        if (/2\/3/.test(tag(x, 'vote-type'))) req = '2/3';
      } else {
        for (const b of x.split('<member>').slice(1)) { const id = lis.get(tag(b, 'lis_member_id')); const i = id && pos.get(id); if (i != null) codes[i] = WORD[tag(b, 'vote_cast').toLowerCase()] || '0'; }
        date = isoDate(tag(x, 'vote_date'));
        question = tag(x, 'question'); result = tag(x, 'vote_result'); bill = billKey(tag(x, 'document_name')); desc = tag(x, 'vote_document_text') || tag(x, 'vote_title'); req = tag(x, 'majority_requirement') || '1/2';
        // a nomination keeps the Senate's part number (PN11-13)
        if (tag(x, 'document_type') === 'PN' && tag(x, 'document_number')) nomination = 'PN' + tag(x, 'document_number');
      }
      const yea = codes.filter(c => c === 'Y').length, nay = codes.filter(c => c === 'N').length;
      if (!date) break;
      add.push(finish({ k: ch + (built.roll + (n - built.clerk)), chamber: ch, roll: built.roll + (n - built.clerk), clerk: n, session: built.session, date, bill: bill ? bill.toUpperCase() : nomination, billKey: bill, result, question, desc, req, yea, nay, codes, fresh: true, source: url }));
    }
  }
  if (add.length) merge(add);
}
function finish(rc) {
  const ids = D.order[rc.chamber]; const tally = { D: { Y: 0, N: 0 }, R: { Y: 0, N: 0 } };
  rc.codes.forEach((c, i) => { const m = D.who(ids[i]); if (!m) return; const pt = D.partyOn(m, rc.date); const p = pt === 'I' ? (m.caucus || 'D') : pt; if ((c === 'Y' || c === 'N') && tally[p]) tally[p][c]++; });
  rc.tally = tally;
  rc.partyPos = { D: tally.D.Y > tally.D.N ? 'Y' : tally.D.N > tally.D.Y ? 'N' : null, R: tally.R.Y > tally.R.N ? 'Y' : tally.R.N > tally.R.Y ? 'N' : null };
  rc.partyLine = !!(rc.partyPos.D && rc.partyPos.R && rc.partyPos.D !== rc.partyPos.R);
  rc.codes = rc.codes.join('');
  return rc;
}
function merge(add) {
  const keep = D.rollcalls.filter(r => !add.some(a => a.k === r.k));
  D.rollcalls = keep.concat(add);
  for (const r of add) D.rcByK.set(r.k, r);
  const byDate = (a, b) => b.date.localeCompare(a.date) || b.roll - a.roll;
  D.recentRolls = { H: D.rollcalls.filter(r => r.chamber === 'H').sort(byDate), S: D.rollcalls.filter(r => r.chamber === 'S').sort(byDate) };
  D.allRolls = [...D.rollcalls].sort(byDate);
  L.fresh = D.rollcalls.filter(r => r.fresh);
  D.reconcileBills(add);
}

function save() { try { fs.writeFileSync(CACHE, JSON.stringify({ meetings: L.meetings, house: L.house, houseStatus: L.houseStatus, senate: L.senate, fresh: L.fresh, markets: MK.get(), updated: L.updated })); } catch (e) { console.error('live save', e.message); } }
function restore() {
  try {
    const j = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    Object.assign(L, { meetings: j.meetings || {}, house: j.house || [], houseStatus: j.houseStatus || null, senate: j.senate || [], updated: j.updated || null });
    MK.set(j.markets);
    const builtMax = { H: 0, S: 0 }; for (const r of D.rollcalls) if (!r.fresh) builtMax[r.chamber] = Math.max(builtMax[r.chamber], r.roll);
    const f = (j.fresh || []).filter(r => r.roll > builtMax[r.chamber] && r.codes.length === D.order[r.chamber].length);
    if (f.length) merge(f);
  } catch { /* first run */ }
}

let running = false;
async function refresh() {
  if (running) return; running = true;
  try {
    for (const f of [houseFloor, houseStatus, senateFloor, freshVotes, markets, meetings]) { try { await f(); } catch (e) { console.error('live', f.name, e); } }
    L.updated = new Date().toISOString();
    save();
  } catch (e) { console.error('live refresh', e); }
  running = false;
}
function start() {
  restore();
  refresh();
  setInterval(refresh, 10 * 60 * 1000).unref();
}

// lookups for pages
function upcomingMeetings(days = 14) {
  const now = new Date(Date.now() - 3 * 3600e3).toISOString(); const until = new Date(Date.now() + days * 864e5).toISOString();
  return Object.values(L.meetings).filter(m => m.date >= now && m.date <= until).sort((a, b) => a.date.localeCompare(b.date));
}
function meetingsFor(p, days = 21) {
  const codes = new Set((p.committees || []).map(c => c.id.toUpperCase()));
  return upcomingMeetings(days).filter(m => m.committees.some(c => codes.has(c.code) || codes.has(c.code.replace(/00$/, ''))));
}
function floorItems() { const out = []; for (const w of L.house) for (const c of w.cats) for (const i of c.items) out.push({ ...i, week: w.week, cat: c.name }); return out; }
function scheduledBills() {
  const m = new Map();
  for (const i of floorItems()) if (i.key) m.set(i.key, { where: 'House floor', week: i.week });
  for (const s of L.senate) for (const p of s.paras) for (const b of p.match(BILL_RE) || []) { const k = billKey(b); if (k && !m.has(k)) m.set(k, { where: 'Senate floor', date: s.date }); }
  for (const mt of upcomingMeetings(21)) for (const k of mt.bills) if (!m.has(k)) m.set(k, { where: mt.committees[0] ? mt.committees[0].name : 'Committee', date: mt.date.slice(0, 10), meeting: mt.id });
  return m;
}

module.exports = { L, start, refresh, upcomingMeetings, meetingsFor, floorItems, scheduledBills, billKey, BILL_RE };
