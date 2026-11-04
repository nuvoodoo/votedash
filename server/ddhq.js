'use strict';
// Parser for Decision Desk HQ projection posts. Their format is fixed:
//   "Decision Desk HQ projects {winner} wins the {ST} {office} {election}"
// office: "US Senate", "US House 9", "Governor", any other statewide office, or a ballot question.

const { STATES } = require('./civic');

const RE = /^Decision Desk HQ projects (.+?) wins the ([A-Z]{2}) (.+?)\s*$/;
const TAIL = /\s+(?:Special\s+)?(?:General Election|General|Election|Runoff|Nonpartisan Ballot Question|Ballot Question|Special Election)$/i;
const BALLOT_ID = /\b(Question|Amendment|Proposition|Prop|Issue|Measure|Initiative)\s+(?:No\.?\s*)?([A-Z0-9-]+)\b/i;

function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9À-ɏ]+/g, ' ').trim(); }
function lastName(n) { const t = norm(n).split(' ').filter((w) => w.length > 1 && !/^(jr|sr|ii|iii|iv)$/.test(w)); return t[t.length - 1] || ''; }

function parse(text) {
  const head = String(text || '').split('\n')[0].replace(/\s+/g, ' ').trim();
  const m = head.match(RE);
  if (!m) return null;
  const st = m[2];
  if (!STATES[st]) return null;
  const rest = m[3];
  const special = /\bSpecial\b/i.test(rest);
  const office = rest.replace(TAIL, '').trim();
  let kind = 'other', district = null, mm;
  if (/^U\.?S\.? Senate\b/i.test(office)) kind = 'senate';
  else if ((mm = office.match(/^U\.?S\.? House (\d+|At[- ]Large|AL)\b/i))) { kind = 'house'; district = /^\d+$/.test(mm[1]) ? `${st}-${mm[1].padStart(2, '0')}` : `${st}-AL`; }
  else if (/^Governor$/i.test(office)) kind = 'governor';
  return { head, winner: m[1].trim(), st, office, kind, district, special };
}

// The race(s) on our board for a parsed projection. Returns an array (a ballot
// measure can be listed in two civicAPI scopes), empty when there is no single match.
function findRaces(p, races) {
  const all = [...races.values()];
  if (p.kind === 'senate') {
    const sen = all.filter((r) => r.cat === 'senate' && r.state === p.st);
    const r = sen.find((x) => /special/i.test(x.name) === p.special) || (sen.length === 1 ? sen[0] : null);
    return r ? [r] : [];
  }
  if (p.kind === 'house') { const r = all.find((x) => (x.cat === 'house' || x.cat === 'delegate') && x.district === p.district); return r ? [r] : []; }
  if (p.kind === 'governor') { const r = all.find((x) => x.cat === 'governor' && x.state === p.st); return r ? [r] : []; }
  const pool = all.filter((r) => r.state === p.st && !['senate', 'house', 'governor', 'state-senate', 'state-house'].includes(r.cat));
  const id = p.office.match(BALLOT_ID);
  if (id) {
    const key = norm(id[1].replace(/^Prop$/i, 'Proposition') + ' ' + id[2]);
    const hits = pool.filter((r) => (' ' + norm(r.name) + ' ').includes(' ' + key + ' '));
    return new Set(hits.map((r) => r.name)).size === 1 ? hits : [];
  }
  const want = norm(p.office).split(' ').filter((w) => w.length > 2 && !['the', 'and', 'for', 'state'].includes(w));
  const hits = pool.filter((r) => { const n = norm(r.name); return want.length && want.every((w) => n.includes(w)); });
  return hits.length === 1 ? hits : [];
}

function findWinner(p, race) {
  const w = norm(p.winner);
  const cands = race.cands.filter((c) => c.n !== 'Write-in');
  const exact = cands.find((c) => norm(c.n) === w);
  if (exact) return exact;
  if (w === 'yes' || w === 'no') return null;
  const ln = lastName(p.winner);
  const byLast = cands.filter((c) => lastName(c.n) === ln);
  if (byLast.length === 1) return byLast[0];
  const first = w.split(' ')[0];
  return byLast.find((c) => norm(c.n).startsWith(first)) || null;
}

module.exports = { parse, findRaces, findWinner };
