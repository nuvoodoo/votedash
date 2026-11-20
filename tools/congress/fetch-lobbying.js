// Lobbying (LDA) for the organizations behind connected PACs -> server/congress/data/lobbying.json
// Source: Lobbying Disclosure Act REST API. lda.senate.gov/api/v1 now answers 503 (site retired);
// the same API is served at https://lda.gov/api/v1/. Anonymous access: 15 requests/minute, 25 rows/page.
// Every API response is cached under data/raw/lda/ so reruns cost no requests.
// Usage: node tools/congress/fetch-lobbying.js   (LDA_API_KEY env var optional: 120 requests/minute)
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '../..');
const CACHE = path.join(ROOT, 'data/raw/lda');
const OUT = path.join(ROOT, 'server/congress/data/lobbying.json');
const API = 'https://lda.gov/api/v1/';
const SEARCH_UI = 'https://lda.gov/filings/public/filing/search/?client_name=';
const YEARS = ['2025', '2026'];
const KINDS = new Set(['Corporation', 'Trade association', 'Labor union', 'Membership group', 'Cooperative']);
const MIN = 25000;
const MAX_PAGES = 40; // a name query returning more than 1,000 filings is too generic to trust; logged as a failure
const KEY = process.env.LDA_API_KEY || '';
const GAP_MS = KEY ? 600 : 4200;

fs.mkdirSync(CACHE, { recursive: true });

// ---------- name normalization ----------
const SUFFIX = new Set(['INC', 'INCORPORATED', 'CORP', 'CORPORATION', 'CO', 'COMPANY', 'COMPANIES', 'LLC', 'L L C', 'LP', 'LLP', 'PLC', 'LTD', 'LIMITED', 'NA', 'PC', 'PLLC', 'SE', 'AG', 'NV', 'SA']);
function norm(s) {
  if (!s) return '';
  let t = ' ' + s.toUpperCase() + ' ';
  t = t.replace(/\([^)]*\)/g, ' ');                                   // parentheticals: (ABA), (FKA ...), (THE)
  t = t.replace(/\b(F\/?K\/?A|FORMERLY( KNOWN AS)?)\b.*$/, ' ');        // trailing former names
  t = t.replace(/&/g, ' AND ').replace(/['’]/g, '').replace(/[^A-Z0-9 ]+/g, ' ');
  t = t.replace(/\b(AND|ON BEHALF OF) (ITS|THEIR) (AFFILIATES|SUBSIDIARIES|AFFILIATED COMPANIES)\b.*$/, ' ');
  t = t.replace(/\bAND (AFFILIATES|SUBSIDIARIES)\b.*$/, ' ');
  t = t.replace(/\bU S A\b/g, 'USA').replace(/\bU S\b/g, 'US').replace(/\bL L C\b/g, 'LLC').replace(/\bL P\b/g, 'LP').replace(/\bN A\b/g, 'NA');
  let w = t.split(/\s+/).filter(Boolean);
  if (w[0] === 'THE') w.shift();
  while (w.length > 1 && (SUFFIX.has(w[w.length - 1]) || w[w.length - 1] === 'THE')) w.pop();
  return w.join(' ');
}
// Org name for a committee: FEC connected organization, else derived from the committee's own name
// ("AMERICAN PETROLEUM INSTITUTE POLITICAL ACTION COMMITTEE (API PAC)" -> "AMERICAN PETROLEUM INSTITUTE").
const PAC_WORDS = /\b(POLITICAL ACTION COMMITTEE|POLITICAL ACTION CMTE|SEPARATE SEGREGATED FUND|POLITICAL (ACTION )?FUND|FEDERAL PAC|EMPLOYEES?( POLITICAL)?( ACTION)?( COMMITTEE)?|EMPLOYEE PAC|PAC|POLITICAL VICTORY FUND|POLITICAL EDUCATION COMMITTEE|GOOD GOVERNMENT (FUND|COMMITTEE)|FUND FOR EFFECTIVE GOVERNMENT|INC\.? PAC)\b.*$/;
function orgName(c) {
  const o = c.org && !/^(NONE|N\/?A|NA|NOT APPLICABLE|SAME|-)$/i.test(c.org.trim()) ? c.org : null;
  let base = o || c.name;
  const derived = !o;
  base = base.toUpperCase().replace(/\([^)]*\)/g, ' ');
  const cut = base.replace(PAC_WORDS, ' ').replace(/[\s,.-]+$/, '').trim();
  if (derived && cut === base.trim()) return null;   // committee name has no PAC wording to strip: nothing reliable to derive
  if (!cut) return null;
  return { raw: cut, derived };
}

// ---------- HTTP with cache + throttle ----------
let last = 0, requests = 0, cacheHits = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url) {
  const file = path.join(CACHE, crypto.createHash('sha1').update(url).digest('hex') + '.json');
  if (fs.existsSync(file)) { cacheHits++; return JSON.parse(fs.readFileSync(file, 'utf8')); }
  for (let attempt = 0; attempt < 8; attempt++) {
    const wait = last + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now(); requests++;
    let res;
    try { res = await fetch(url, { headers: Object.assign({ Accept: 'application/json', 'User-Agent': 'votedash-congress-directory' }, KEY ? { Authorization: 'Token ' + KEY } : {}) }); }
    catch (e) { await sleep(10000 * (attempt + 1)); continue; }
    if (res.status === 429) { const ra = +res.headers.get('retry-after') || 60; console.log('  429, waiting', ra, 's'); await sleep((ra + 1) * 1000); continue; }
    if (res.status >= 500) { await sleep(15000 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(res.status + ' ' + url);
    const j = await res.json();
    fs.writeFileSync(file, JSON.stringify({ url, j }));
    return { url, j };
  }
  throw new Error('gave up ' + url);
}

// ---------- filings for one org ----------
const BILL = /(?<![\w.])(H\.?\s?R\.?|S\.?|H\.?\s?RES\.?|S\.?\s?RES\.?|H\.?\s?J\.?\s?RES\.?|S\.?\s?J\.?\s?RES\.?|H\.?\s?CON\.?\s?RES\.?|S\.?\s?CON\.?\s?RES\.?)\s?(\d{1,5})\b/gi;
function bills(text) {
  const out = new Set();
  if (!text) return out;
  for (const m of text.matchAll(BILL)) {
    const p = m[1].toUpperCase().replace(/[\s.]/g, '');
    const label = { HR: 'H.R.', S: 'S.', HRES: 'H.Res.', SRES: 'S.Res.', HJRES: 'H.J.Res.', SJRES: 'S.J.Res.', HCONRES: 'H.Con.Res.', SCONRES: 'S.Con.Res.' }[p];
    if (!label) continue;
    if (p === 'S' && !/^S\.\s?\d/i.test(m[0])) continue;   // bare "S 123" is too ambiguous; require "S." form
    if (p === 'HR' && !/^H\.?\s?R\./i.test(m[0]) && !/^HR\s?\d/i.test(m[0])) continue;
    out.add(label + ' ' + +m[2]);
  }
  return out;
}

async function filingsFor(query) {
  const rows = [];
  let url = API + 'filings/?' + new URLSearchParams({ client_name: query, filing_dt_posted_after: '2025-01-01', ordering: 'dt_posted', page_size: '25' });
  let pages = 0, count = 0;
  while (url) {
    const { j } = await get(url);
    count = j.count; pages++;
    if (count > MAX_PAGES * 25) return { error: 'too generic (' + count + ' filings)' };
    rows.push(...j.results);
    url = j.next;
  }
  return { rows, count };
}

function summarize(target, rows) {
  const mine = rows.filter(r => YEARS.includes(String(r.filing_year)) && norm(r.client && r.client.name) === target);
  if (!mine.length) return null;
  // quarterly reports only; an amendment replaces the earlier report for the same registrant/client/quarter
  const latest = new Map();
  for (const r of mine) {
    const q = (r.filing_type.match(/[1-4]/) || [])[0];
    if (!q || r.filing_type === 'RR' || r.filing_type === 'RA') continue;
    const k = r.registrant.id + '|' + r.client.id + '|' + r.filing_year + '|' + q;
    const prev = latest.get(k);
    if (!prev || r.dt_posted > prev.dt_posted) latest.set(k, r);
  }
  const reports = [...latest.values()];
  // spend per year: self-filers report total expenses (which already include payments to outside firms),
  // so when the client files for itself that year its expenses are used; otherwise outside-firm income is summed.
  const spend = {};
  for (const y of YEARS) {
    const ry = reports.filter(r => String(r.filing_year) === y);
    if (!ry.length) continue;
    const self = ry.filter(r => r.client.client_self_select);
    const src = self.length ? self.map(r => r.expenses) : ry.map(r => r.income);
    const nums = src.filter(v => v != null).map(Number);
    if (nums.length) spend[y] = Math.round(nums.reduce((a, b) => a + b, 0));
  }
  const issues = new Map(), billSet = new Set();
  for (const r of reports) {
    const seen = new Set();
    for (const a of r.lobbying_activities || []) {
      if (a.general_issue_code && !seen.has(a.general_issue_code)) {
        seen.add(a.general_issue_code);
        const e = issues.get(a.general_issue_code) || { code: a.general_issue_code, name: a.general_issue_code_display, filings: 0 };
        e.filings++; issues.set(a.general_issue_code, e);
      }
      for (const b of bills(a.description)) billSet.add(b);
    }
  }
  const billSort = (a, b) => a.split(' ')[0].localeCompare(b.split(' ')[0]) || +a.split(' ')[1] - +b.split(' ')[1];
  const registrants = [...new Set(reports.filter(r => !r.client.client_self_select).map(r => r.registrant.name.trim()))].sort();
  const out = {
    client: mine.map(r => r.client.name.trim()).sort((a, b) => mine.filter(r => r.client.name.trim() === b).length - mine.filter(r => r.client.name.trim() === a).length)[0],
    clientIds: [...new Set(mine.map(r => r.client.id))].sort((a, b) => a - b),
  };
  if (Object.keys(spend).length) out.spend = spend;
  if (issues.size) out.issues = [...issues.values()].sort((a, b) => b.filings - a.filings || a.code.localeCompare(b.code));
  if (billSet.size) out.bills = [...billSet].sort(billSort);
  if (registrants.length) out.registrants = registrants;
  out.url = SEARCH_UI + encodeURIComponent(out.client);
  return out;
}

(async () => {
  const t0 = Date.now();
  const funders = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/congress/data/funders.json'), 'utf8'));
  const targets = new Map(); // normalized org -> { raw, derived, committees: [] }
  let noOrg = 0, considered = 0;
  for (const c of Object.values(funders)) {
    if ((c.total || 0) + (c.ie || 0) < MIN || !KINDS.has(c.kind)) continue;
    considered++;
    const o = orgName(c);
    const n = o && norm(o.raw);
    // a derived name needs two words or more; one-word leftovers ("PARRY") are too thin to match on
    if (!n || n.length < 3 || (o.derived && n.split(' ').length < 2)) { noOrg++; continue; }
    const t = targets.get(n) || { raw: o.raw, derived: o.derived, committees: [] };
    if (!o.derived) { t.raw = o.raw; t.derived = false; }
    t.committees.push(c.id);
    targets.set(n, t);
  }
  if (process.env.DRY) { for (const [n, t] of targets) console.log(n, '<=', t.raw, t.derived ? '(from name)' : ''); return; }
  console.log('committees considered', considered, 'without a usable org name', noOrg, 'distinct orgs', targets.size);

  const byCommittee = {}, failures = [], matched = [];
  let i = 0;
  const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null; // test a subset; output file is then partial
  for (const [n, t] of [...targets].sort((a, b) => a[0].localeCompare(b[0])).filter(([n]) => !only || only.test(n))) {
    i++;
    let r;
    // search on the suffix-free name so "EXXON MOBIL CORP" and "EXXON MOBIL CORPORATION" both come back;
    // if that is too generic ("SOUTHERN"), search on the full organization name instead
    const rawQ = t.raw.replace(/[^A-Za-z0-9&' -]+/g, ' ').replace(/\s+/g, ' ').trim();
    try { r = await filingsFor(n); if (r.error && rawQ.toUpperCase() !== n) r = await filingsFor(rawQ); } catch (e) { failures.push({ org: t.raw, error: e.message }); continue; }
    if (r.error) { failures.push({ org: t.raw, error: r.error }); continue; }
    const s = summarize(n, r.rows);
    if (i % 25 === 0) console.log(i + '/' + targets.size, 'matched', matched.length, 'requests', requests, 'cached', cacheHits, Math.round((Date.now() - t0) / 60000) + 'min');
    if (!s) continue;
    matched.push({ org: t.raw, derived: t.derived, client: s.client, committees: t.committees });
    for (const id of t.committees) byCommittee[id] = s;
  }
  fs.writeFileSync(OUT, JSON.stringify({ built: new Date().toISOString(), byCommittee }));
  const report = { orgs: targets.size, matchedOrgs: matched.length, committees: Object.keys(byCommittee).length, requests, cacheHits, failures, minutes: +((Date.now() - t0) / 60000).toFixed(1), matched };
  fs.writeFileSync(path.join(CACHE, '_report.json'), JSON.stringify(report, null, 1));
  console.log('done', JSON.stringify({ orgs: report.orgs, matchedOrgs: report.matchedOrgs, committees: report.committees, requests, cacheHits, failures: failures.length, minutes: report.minutes }));
  console.log('lobbying.json', (fs.statSync(OUT).size / 1e6).toFixed(2) + 'MB');
})();
