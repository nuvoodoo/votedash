'use strict';
// Prediction markets on congressional outcomes, from two public exchanges.
// Matched to bills, leadership races and process questions; when both exchanges
// price the same outcome, the probabilities are averaged. Exchanges are not named on the site.
const D = require('./data');
const UA = { 'User-Agent': 'VoteDash/1.0 (+https://votedash.net/about)' };
const ABOUT = /(Senate|House|Congress|Speaker|filibuster|cloture|shutdown|veto|reconciliation|\bAct\b|\bbill\b|nominee|Majority Leader|Minority Leader|impeach|war powers|debt ceiling|appropriation)/i;
const NOT = /(win the (Senate|House)|Midterm|popular vote|turnout|seats|winner\?|primary|governor|state (senate|house)|house of delegates|\bmayor\b|Trump on \$|Belichick|billionaire|New Mexico penalty|state income tax|Onion Futures|National Popular Vote)/i;

async function json(url) { try { const r = await fetch(url, { headers: UA }); return r.ok ? await r.json() : null; } catch { return null; } }
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

async function exchangeA() {
  const qs = ['bill', 'Act becomes law', 'Senate', 'House', 'Congress', 'Speaker', 'filibuster', 'shutdown', 'veto', 'reconciliation', 'nominee', 'Majority Leader', 'impeach', 'war powers'];
  const seen = new Map();
  for (const q of qs) {
    const j = await json(`https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(q)}&limit_per_type=25&events_status=active`);
    for (const e of (j && j.events) || []) if (!seen.has(e.id) && !e.closed && ABOUT.test(e.title) && !NOT.test(e.title)) seen.set(e.id, e);
  }
  const out = [];
  for (const e of seen.values()) {
    const ev = (e.markets && e.markets.length) ? e : await json(`https://gamma-api.polymarket.com/events/${e.id}`);
    for (const m of (ev && ev.markets) || []) {
      if (m.closed || m.active === false) continue;
      let prices; try { prices = JSON.parse(m.outcomePrices || '[]').map(Number); } catch { continue; }
      const vol = +m.volume || 0; if (!prices.length || vol < 1000) continue;
      const multi = (ev.markets || []).length > 1;
      out.push({ ex: 'a', event: e.title, question: m.question, outcome: multi ? (m.groupItemTitle || m.question) : 'Yes', prob: prices[0], ends: m.endDate || null });
    }
  }
  return out;
}
async function exchangeB() {
  let cur = '', all = [];
  for (let i = 0; i < 25; i++) {
    const j = await json(`https://api.elections.kalshi.com/trade-api/v2/events?status=open&limit=200${cur ? '&cursor=' + cur : ''}`);
    if (!j) break; all = all.concat(j.events || []); cur = j.cursor; if (!cur) break;
  }
  const hits = all.filter(e => /Politics|Elections/i.test(e.category || '') && ABOUT.test(e.title) && !NOT.test(e.title));
  const out = [];
  for (const e of hits) {
    const j = await json(`https://api.elections.kalshi.com/trade-api/v2/markets?event_ticker=${e.event_ticker}&limit=100`);
    const ms = ((j && j.markets) || []).filter(m => m.status === 'active');
    for (const m of ms) {
      const bid = +m.yes_bid_dollars || 0, ask = +m.yes_ask_dollars || 0, last = +m.last_price_dollars || 0;
      const prob = bid > 0 && ask > 0 ? (bid + ask) / 2 : last;
      if (!(+m.volume_fp >= 1000)) continue;
      out.push({ ex: 'b', event: e.title, question: ms.length > 1 ? `${e.title} ${m.yes_sub_title}` : e.title, outcome: ms.length > 1 ? m.yes_sub_title : 'Yes', prob, ends: m.close_time || null });
    }
  }
  return out;
}

// match market lines to site targets
function personOf(name) {
  const n = norm(name).split(' '); const last = n[n.length - 1];
  const c = D.people.filter(p => norm(p.last).split(' ').pop() === last && (n.length < 2 || norm(p.first)[0] === n[0][0] || norm(p.name).includes(n[0])));
  return c.length === 1 ? c[0] : c.find(p => p.status !== 'elect') || null;
}
function billFor(text) {
  const m = text.match(/\b((?:[A-Z][A-Za-z0-9.&'-]*\s){0,6}Act)\b/); if (!m || !D.bills) return null;
  const name = norm(m[1]); if (name.split(' ').length < 2) return null;
  const order = { law: 7, 'to-president': 6, vetoed: 6, 'passed-both': 5, 'passed-house': 4, 'passed-senate': 4, reported: 3, failed: 2, committee: 1, introduced: 0 };
  let best = null;
  for (const [k, b] of Object.entries(D.bills.bills)) {
    const t = norm(b.short || b.title || ''); if (!t) continue;
    if (t === name || t.startsWith(name + ' of') || t.startsWith(name + ' 20')) if (!best || (order[b.stage] || 0) > (order[best[1].stage] || 0)) best = [k, b];
  }
  return best ? best[0] : null;
}
function target(l) {
  const t = l.event;
  if (/next Speaker/i.test(t)) return { kind: 'leader', race: 'speaker' };
  if (/Senate Majority Leader|Senate Leader/i.test(t)) return { kind: 'leader', race: 'senate-leader' };
  const bill = billFor(l.question) || billFor(t);
  if (bill) return { kind: 'bill', bill };
  // process questions: only legislative and procedural outcomes, never election results
  if (/(LIV Golf|Brazil|STF|Lee Jae|Korea|Colorado|Hochul|data center moratorium|Spanish|Spain|Canada|Parliament|state legislature|governor)/i.test(t + ' ' + l.question)) return null;
  if (!/(Congress|House|Senate|Speaker|filibuster|government shutdown|shutdown|veto|Trump|Cabinet|federal|reconciliation|impeach)/i.test(t + ' ' + l.question)) return null;
  if (/(becomes? law|pass|veto|overrid|shutdown|filibuster|cloture|nuclear option|confirm|impeach|reconciliation|war powers|debt (ceiling|limit)|first ballot|salar|appropriation|funding|sign)/i.test(t + ' ' + l.question)
    && !/(race|election|win the|seat|candidate|perform|within \d|third-place|closer|margin|popular vote|primary|Spanish|governor|mayor|referendum)/i.test(t + ' ' + l.question)) return { kind: 'process' };
  return null;
}
function topicOf(t) {
  if (/shutdown/i.test(t)) return 'Government shutdown';
  if (/impeach/i.test(t)) return 'Impeachment';
  if (/override/i.test(t)) return 'Veto overrides';
  if (/veto/i.test(t)) return 'Vetoes';
  if (/filibuster|nuclear option|cloture/i.test(t)) return 'The filibuster';
  if (/confirm|nominee/i.test(t)) return 'Confirmations';
  if (/reconciliation/i.test(t)) return 'Reconciliation';
  if (/Speaker/i.test(t)) return 'Speaker election';
  return 'Legislation';
}
const RACE = { speaker: 'Next Speaker of the House', 'senate-leader': 'Next Senate majority leader' };

let M = { bills: {}, leaders: {}, process: [], members: {}, updated: null };
const last = { a: [], b: [] };
async function refresh() {
  const [a0, b0] = await Promise.all([exchangeA(), exchangeB()]);
  // keep each exchange's last good pull when a refresh comes back short
  const a = a0.length >= Math.min(20, last.a.length * 0.6) ? (last.a = a0) : last.a;
  const b = b0.length >= Math.min(20, last.b.length * 0.6) ? (last.b = b0) : last.b;
  const lines = [...a, ...b].filter(l => l.prob >= 0 && l.prob <= 1);
  const groups = new Map();
  for (const l of lines) {
    const tg = target(l); if (!tg) continue;
    let key, label, person = null;
    if (tg.kind === 'leader') { person = personOf(l.outcome); key = `L|${tg.race}|${person ? person.id : norm(l.outcome)}`; label = person ? person.name : l.outcome; }
    else { const q = l.question.replace(/\?$/, ''); key = `${tg.kind}|${tg.bill || ''}|${norm(q)}`; label = q; }
    const g = groups.get(key) || { tg, label, person, probs: [], ends: l.ends }; g.probs.push(l.prob); groups.set(key, g);
  }
  const next = { bills: {}, leaders: {}, process: [], members: {}, updated: new Date().toISOString() };
  for (const g of groups.values()) {
    const prob = g.probs.reduce((s, v) => s + v, 0) / g.probs.length;
    const row = { label: g.label, prob, n: g.probs.length, ends: g.ends };
    if (g.tg.kind === 'bill') (next.bills[g.tg.bill] ||= []).push(row);
    else if (g.tg.kind === 'leader') {
      (next.leaders[g.tg.race] ||= []).push({ ...row, person: g.person ? g.person.id : null });
      if (g.person) (next.members[g.person.id] ||= []).push({ label: RACE[g.tg.race], prob });
    } else next.process.push({ ...row, topic: topicOf(row.label) });
  }
  for (const k of Object.keys(next.leaders)) next.leaders[k] = next.leaders[k].filter(r => r.prob >= 0.005).sort((x, y) => y.prob - x.prob);
  for (const k of Object.keys(next.bills)) next.bills[k].sort((x, y) => (x.ends || '').localeCompare(y.ends || ''));
  next.process.sort((x, y) => y.prob - x.prob);
  if (lines.length) M = next;
  return { lines: lines.length, bills: Object.keys(next.bills).length, leaders: Object.keys(next.leaders), process: next.process.length };
}
const get = () => M;
const set = m => { if (m && m.updated) M = m; };
module.exports = { refresh, get, set, RACE };
