// Fetches 119th Congress bills from the Congress.gov API and writes
// server/congress/data/bills.json (bills, byMember, issues, rollcallBill).
// Every raw response is cached under data/raw/congress-gov/, so reruns only
// fetch what is missing. Requires DATA_GOV_KEY in ../votedash.env (outside the repo).
// Usage: node tools/congress/fetch-bills.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const CACHE = path.join(ROOT, 'data/raw/congress-gov');
const OUT = path.join(ROOT, 'server/congress/data');
const ENV_FILE = path.join(ROOT, '../votedash.env');
const BASE = 'https://api.congress.gov/v3';
const CONGRESS = 119;
const MIN_INTERVAL_MS = 760; // ~4,700 requests/hour, under the 5,000/hour limit
const MAX_TRIES = 7;
const WORKERS = 16; // requests in flight; start times are still spaced by MIN_INTERVAL_MS

const TYPES = ['hr', 's', 'hres', 'sres', 'hjres', 'sjres', 'hconres', 'sconres'];
const URL_PATH = {
  hr: 'house-bill', s: 'senate-bill', hres: 'house-resolution', sres: 'senate-resolution',
  hjres: 'house-joint-resolution', sjres: 'senate-joint-resolution',
  hconres: 'house-concurrent-resolution', sconres: 'senate-concurrent-resolution',
};

function readKey() {
  const line = fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/).find(l => /^\s*DATA_GOV_KEY\s*=/.test(l));
  const key = line && line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
  if (!key) throw new Error('DATA_GOV_KEY not found in ' + ENV_FILE);
  return key;
}
const KEY = readKey();

const sleep = ms => new Promise(r => setTimeout(r, ms));
const stats = { network: 0, cached: 0, retries: 0, notFound: [], failed: [] };
let nextSlot = 0;
const t0 = Date.now();

// Cache file for an API path + offset, e.g. bill/119/hr/1181/subjects.o0.json
const cacheFile = (p, offset) => path.join(CACHE, p.replace(/^\//, '') + (offset == null ? '' : `.o${offset}`) + '.json');

// GET one API path. Returns parsed JSON, or {__status:404,...} for not found (cached too),
// or null if every retry failed (not cached, so a rerun tries again).
async function get(p, params = {}, offset) {
  const file = cacheFile(p, offset);
  if (fs.existsSync(file)) { stats.cached++; return JSON.parse(fs.readFileSync(file, 'utf8')); }
  const qs = new URLSearchParams({ ...params, ...(offset != null ? { offset: String(offset) } : {}), format: 'json' });
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    const slot = Math.max(Date.now(), nextSlot);
    nextSlot = slot + MIN_INTERVAL_MS;
    if (slot > Date.now()) await sleep(slot - Date.now());
    let status = 0, retryAfter = 0, body = null;
    try {
      qs.set('api_key', KEY);
      const res = await fetch(`${BASE}${p}?${qs}`, { signal: AbortSignal.timeout(60000) });
      qs.delete('api_key');
      stats.network++;
      status = res.status;
      retryAfter = Number(res.headers.get('retry-after')) || 0;
      if (status === 200) body = await res.json();
      else if (status === 404) body = { __status: 404, ...(await res.json().catch(() => ({}))) };
      else await res.text().catch(() => '');
    } catch (e) {
      qs.delete('api_key');
      status = 'network: ' + (e.name || 'error');
    }
    if (body) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(body));
      if (body.__status === 404) stats.notFound.push(p);
      if (stats.network % 200 === 0) progress();
      return body;
    }
    if (typeof status === 'number' && status !== 429 && status < 500) {
      stats.failed.push(`${p}${offset != null ? ' offset ' + offset : ''}: HTTP ${status}`);
      return null;
    }
    stats.retries++;
    const backoff = Math.max(retryAfter * 1000, 5000 * 2 ** (attempt - 1));
    console.log(`  retry ${attempt}/${MAX_TRIES} ${p} (${status}), waiting ${Math.round(backoff / 1000)}s`);
    if (attempt < MAX_TRIES) await sleep(backoff);
  }
  stats.failed.push(`${p}${offset != null ? ' offset ' + offset : ''}: retries exhausted`);
  return null;
}

// GET every page of a paginated list; returns the concatenated items, or null if any page failed.
async function getAll(p, listKey) {
  const items = [];
  for (let offset = 0; ; offset += 250) {
    const j = await get(p, { limit: '250' }, offset);
    if (!j || j.__status) return null;
    const page = typeof listKey === 'function' ? listKey(j) : j[listKey];
    items.push(...(page || []));
    if (!j.pagination || !j.pagination.next || !(page || []).length) return items;
  }
}

// Run fn over items with WORKERS concurrent workers.
async function pool(items, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: WORKERS }, async () => {
    while (next < items.length) { const i = next++; await fn(items[i], i); }
  }));
}

let phase = '';
function progress() {
  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`  [${mins} min] ${phase} network=${stats.network} cached=${stats.cached} retries=${stats.retries} failed=${stats.failed.length}`);
}

const keyOf = (type, number) => `${String(type).toLowerCase()}${Number(number)}`;
const VOTEVIEW_BILL = /^(HR|S|HRES|SRES|HJRES|SJRES|HCONRES|SCONRES)(\d+)$/;

function shortTitle(titles) {
  const shorts = (titles || [])
    .filter(t => /short title/i.test(t.titleType || '') && !/portions/i.test(t.titleType || '') && t.title)
    .map(t => t.title.trim());
  if (!shorts.length) return null;
  return shorts.sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
}

// Actions oldest first. chamber: Senate/House from the source system; Library of Congress
// actions of type President/Veto/BecameLaw are attributed to the President.
const SOURCE_CHAMBER = { 0: 'Senate', 1: 'House', 2: 'House' };
function cleanActions(acts) {
  const out = acts.map((a, i) => {
    const ss = a.sourceSystem || {};
    const code = ss.code != null ? Number(ss.code) : null;
    const name = ss.name || '';
    let chamber = SOURCE_CHAMBER[code] || (name === 'Senate' ? 'Senate' : /^House/.test(name) ? 'House' : null);
    if (code === 9) chamber = ['President', 'Veto', 'BecameLaw'].includes(a.type) ? 'President' : 'Library of Congress';
    const o = { date: a.actionDate || null, text: a.text || null, type: a.type || null, code: a.actionCode || null, chamber, source: code };
    if (Array.isArray(a.recordedVotes) && a.recordedVotes.length)
      o.recordedVotes = a.recordedVotes.map(v => ({ chamber: v.chamber || null, rollNumber: v.rollNumber ?? null, date: v.date || null, url: v.url || null }));
    o._i = i; o._t = (a.actionDate || '') + 'T' + (a.actionTime || '');
    return o;
  });
  // API order is newest first; sort ascending by date/time, ties keep reverse API order.
  out.sort((x, y) => x._t.localeCompare(y._t) || y._i - x._i);
  return out.map(({ _i, _t, ...o }) => o);
}

// Stage from actions. Library of Congress (source 9) action codes / texts:
// 1000 "Introduced in House", 8000 "Passed/agreed to in House", 17000 "Passed/agreed to in Senate",
// 28000 "Presented to President", 36000 "Became Public Law"; failure, veto, referral and
// reporting are matched on the action text and type.
const RANK = { introduced: 0, committee: 1, reported: 2, 'passed-house': 3, 'passed-senate': 3, 'passed-both': 4, 'to-president': 5, vetoed: 6, law: 7 };
function stageOf(type, actions, isLaw) {
  const first = re => { const a = actions.find(re); return a ? a.date : null; };
  const last = re => { let d = null; for (const a of actions) if (re(a)) d = a.date; return d; };
  const loc = a => a.source === 9;
  const T = (a, r) => r.test(a.text || '');
  const house = last(a => loc(a) && (a.code === '8000' || T(a, /^Passed\/agreed to in House/i)));
  const senate = last(a => loc(a) && (a.code === '17000' || T(a, /^Passed\/agreed to in Senate/i)));
  const law = first(a => (loc(a) && a.code === '36000') || (a.type === 'BecameLaw' && T(a, /became (public|private) law/i)));
  const veto = last(a => a.type === 'Veto' || T(a, /^Vetoed by President/i));
  const presented = last(a => (loc(a) && a.code === '28000') || T(a, /^Presented to President/i));
  const failed = last(a => loc(a) && T(a, /^Failed of passage\/not agreed to in (House|Senate)/i));
  const reported = first(a => a.type === 'Committee' && T(a, /\breported\b/i) && !T(a, /ordered to be reported/i));
  const referred = first(a => (a.type === 'IntroReferral' || a.type === 'Committee') && T(a, /referred to/i));
  const resolved = last(a => loc(a) && a.type === 'ResolvingDifferences');
  const intro = first(a => a.type === 'IntroReferral') || (actions[0] && actions[0].date) || null;
  let st;
  if (isLaw || law) st = { stage: 'law', date: law || presented };
  else if (veto && (!presented || veto >= presented)) st = { stage: 'vetoed', date: veto };
  else if (presented) st = { stage: 'to-president', date: presented };
  else if (house && senate) st = { stage: 'passed-both', date: [house, senate, resolved].filter(Boolean).sort().pop() };
  else if (house) st = { stage: 'passed-house', date: house };
  else if (senate) st = { stage: 'passed-senate', date: senate };
  else if (reported) st = { stage: 'reported', date: reported };
  else if (referred) st = { stage: 'committee', date: referred };
  else st = { stage: 'introduced', date: intro };
  // A failed passage vote after the latest progress ends the bill there.
  if (failed && RANK[st.stage] < RANK['passed-both'] && (!st.date || failed >= st.date)) st = { stage: 'failed', date: failed };
  if (type === 'hres' || type === 'sres') st.agreed = st.stage === 'passed-house' || st.stage === 'passed-senate';
  if (type === 'hconres' || type === 'sconres') st.agreed = st.stage === 'passed-both';
  return st;
}

async function main() {
  const people = JSON.parse(fs.readFileSync(path.join(OUT, 'people.json'), 'utf8'));
  const { rollcalls } = JSON.parse(fs.readFileSync(path.join(OUT, 'rollcalls.json'), 'utf8'));
  const members = people.filter(m => m.id && !String(m.id).startsWith('elect-')).map(m => m.id);
  console.log(`members (non-elect): ${members.length}; roll calls: ${rollcalls.length}`);

  // 1. Member sponsored / cosponsored legislation (119th only, bills only).
  phase = 'members';
  const memberLists = {};
  const memberFailed = [];
  const billKeys = new Map(); // key -> {type, number}
  const addBill = (type, number) => { const k = keyOf(type, number); if (!billKeys.has(k)) billKeys.set(k, { type: String(type).toLowerCase(), number: Number(number) }); return k; };
  let membersDone = 0;
  await pool(members, async id => {
    const entry = {};
    for (const [field, ep, listKey] of [['sponsored', 'sponsored-legislation', 'sponsoredLegislation'], ['cosponsored', 'cosponsored-legislation', 'cosponsoredLegislation']]) {
      const items = await getAll(`/member/${id}/${ep}`, listKey);
      if (!items) { memberFailed.push(`${id} ${field}`); continue; }
      const keys = [];
      for (const it of items) {
        if (Number(it.congress) !== CONGRESS || it.amendmentNumber || !it.type || !it.number) continue;
        if (!TYPES.includes(String(it.type).toLowerCase())) continue;
        const k = addBill(it.type, it.number);
        if (!keys.includes(k)) keys.push(k);
      }
      entry[field] = keys;
    }
    memberLists[id] = entry;
    if (++membersDone % 25 === 0) { phase = `members ${membersDone}/${members.length}`; progress(); }
  });

  // Roll call bills.
  const rcRaw = {};
  for (const rc of rollcalls) {
    const m = rc.bill && VOTEVIEW_BILL.exec(rc.bill);
    if (m) rcRaw[rc.k] = addBill(m[1], m[2]);
  }

  // 2. Bill detail, subjects and titles.
  const keys = [...billKeys.keys()];
  console.log(`distinct bills to fetch: ${keys.length}`);
  const bills = {};
  await pool(keys, async (k, i) => {
    if (i % 250 === 0) { phase = `bills ${i}/${keys.length}`; progress(); }
    const { type, number } = billKeys.get(k);
    const base = `/bill/${CONGRESS}/${type}/${number}`;
    const d = await get(base);
    if (!d || d.__status || !d.bill) return;
    const b = d.bill;
    const subj = await getAll(`${base}/subjects`, j => (j.subjects && j.subjects.legislativeSubjects) || []);
    const titles = await getAll(`${base}/titles`, 'titles');
    const acts = await getAll(`${base}/actions`, 'actions');
    const comms = await getAll(`${base}/committees`, 'committees');
    const actions = acts ? cleanActions(acts) : null;
    const law = Array.isArray(b.laws) && b.laws.length > 0;
    const st = actions ? stageOf(type, actions, law) : null;
    const latest = b.latestAction && (b.latestAction.actionDate || b.latestAction.text)
      ? { date: b.latestAction.actionDate || null, text: b.latestAction.text || null } : null;
    bills[k] = {
      type: b.type,
      number: Number(b.number),
      title: b.title || null,
      short: titles ? shortTitle(titles) : null,
      policyArea: (b.policyArea && b.policyArea.name) || null,
      subjects: subj ? subj.map(s => s.name).filter(Boolean) : null,
      sponsor: (b.sponsors && b.sponsors[0] && b.sponsors[0].bioguideId) || null,
      // Congress.gov omits the cosponsors block when a bill has none.
      cosponsors: b.cosponsors ? (b.cosponsors.count ?? null) : 0,
      introduced: b.introducedDate || null,
      latest,
      law,
      lawNumber: law && b.laws[0].type && b.laws[0].number ? `${b.laws[0].type} ${b.laws[0].number}` : null,
      ...(b.relatedBills && b.relatedBills.count != null ? { relatedBills: b.relatedBills.count } : {}),
      stage: st ? st.stage : null,
      stageDate: st ? st.date : null,
      ...(st && st.agreed !== undefined ? { agreed: st.agreed } : {}),
      actions,
      committees: comms ? comms.map(c => ({
        name: c.name || null, chamber: c.chamber || null, systemCode: c.systemCode || null,
        activities: (c.activities || []).map(a => ({ name: a.name || null, date: a.date || null })),
      })) : null,
      url: `https://www.congress.gov/bill/${CONGRESS}th-congress/${URL_PATH[type]}/${number}`,
    };
  });

  // 3. Assemble.
  const byIntro = (a, b) => (bills[b].introduced || '').localeCompare(bills[a].introduced || '') || a.localeCompare(b);
  const byMember = {};
  let droppedRefs = 0;
  for (const id of members) {
    if (!memberLists[id]) continue;
    const e = {};
    for (const f of ['sponsored', 'cosponsored']) {
      if (!memberLists[id][f]) continue;
      const have = memberLists[id][f].filter(k => bills[k]);
      droppedRefs += memberLists[id][f].length - have.length;
      e[f] = have.sort(byIntro);
    }
    byMember[id] = e;
  }
  const rollcallBill = {};
  for (const [rk, bk] of Object.entries(rcRaw)) if (bills[bk]) rollcallBill[rk] = bk;
  const issues = {};
  for (const b of Object.values(bills)) {
    if (!b.policyArea) continue;
    (issues[b.policyArea] ||= { bills: 0, rollcalls: [] }).bills++;
  }
  for (const rc of rollcalls) {
    const bk = rollcallBill[rc.k];
    const pa = bk && bills[bk].policyArea;
    if (pa) issues[pa].rollcalls.push(rc.k);
  }
  const sortedIssues = Object.fromEntries(Object.entries(issues).sort((a, b) => b[1].bills - a[1].bills || a[0].localeCompare(b[0])));

  const ordered = Object.fromEntries(Object.entries(bills).sort(([a, x], [b, y]) =>
    TYPES.indexOf(x.type.toLowerCase()) - TYPES.indexOf(y.type.toLowerCase()) || x.number - y.number));
  const out = { built: new Date().toISOString(), bills: ordered, byMember, issues: sortedIssues, rollcallBill };
  const outFile = path.join(OUT, 'bills.json');
  fs.writeFileSync(outFile, JSON.stringify(out));

  // 4. Counts.
  const bv = Object.values(bills);
  const count = (f) => bv.filter(f).length;
  const byType = {};
  for (const b of bv) byType[b.type] = (byType[b.type] || 0) + 1;
  const rcWithBill = rollcalls.filter(r => r.bill).length;
  const rcMappable = Object.keys(rcRaw).length;
  console.log('\n=== bills.json ===');
  console.log(`file: ${outFile} (${(fs.statSync(outFile).size / 1048576).toFixed(2)} MB)`);
  console.log(`bills: ${bv.length}  by type: ${JSON.stringify(byType)}`);
  console.log(`  with policyArea: ${count(b => b.policyArea)}  with subjects>0: ${count(b => b.subjects && b.subjects.length)}  subjects null (fetch failed): ${count(b => b.subjects === null)}`);
  console.log(`  with short title: ${count(b => b.short)}  laws: ${count(b => b.law)}  sponsor null: ${count(b => !b.sponsor)}`);
  console.log(`byMember: ${Object.keys(byMember).length}/${members.length} members; member list failures: ${memberFailed.length}${memberFailed.length ? ' ' + memberFailed.join(', ') : ''}`);
  console.log(`  bill refs dropped (bill not fetched): ${droppedRefs}`);
  console.log(`issues: ${Object.keys(sortedIssues).length}`);
  const stages = {};
  for (const b of bv) stages[b.stage] = (stages[b.stage] || 0) + 1;
  console.log(`stages: ${JSON.stringify(stages)}  agreed resolutions: ${count(b => b.agreed)}  actions null: ${count(b => b.actions === null)}  committees null: ${count(b => b.committees === null)}`);
  console.log(`rollcalls with a bill string: ${rcWithBill}; mappable: ${rcMappable}; in rollcallBill: ${Object.keys(rollcallBill).length}`);
  console.log(`requests: network=${stats.network} cached=${stats.cached} retries=${stats.retries}`);
  console.log(`not found (404): ${stats.notFound.length}${stats.notFound.length ? ' ' + stats.notFound.slice(0, 50).join(', ') : ''}`);
  console.log(`failed: ${stats.failed.length}${stats.failed.length ? '\n  ' + stats.failed.slice(0, 50).join('\n  ') : ''}`);
  console.log(`run time: ${((Date.now() - t0) / 60000).toFixed(1)} min`);
}

main().catch(e => { console.error(e); process.exit(1); });
