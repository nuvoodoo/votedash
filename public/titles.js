/* Page titles and descriptions, shared by the server (head tags) and the browser (document.title). */
(function (root) {
  'use strict';
  const SITE = 'VoteDash';
  const HOME = 'VoteDash: Live 2026 Midterm Results';
  const CAT = { senate: 'Senate', house: 'House', governor: 'Governor', ballot: 'Ballot Measure', statewide: 'Statewide Office', legislature: 'State Legislature', southbay: 'South Bay' };
  const PARTY = { D: 'Democrat', R: 'Republican', I: 'Independent' };
  const pct = (n) => `${Math.round((n || 0) * 10) / 10}%`;
  const real = (r) => (r.cands || []).filter((c) => c.n !== 'Write-in');
  const isMeasure = (r) => r.cat === 'ballot' || real(r).every((c) => /^(yes|no)$/i.test(c.n));
  const who = (c) => (PARTY[c.p] ? `${c.n} (${c.p})` : c.n);

  function race(r) {
    // Shares from the vote counts themselves, so they always add up.
    const sum = real(r).reduce((t, c) => t + (c.v || 0), 0);
    const cs = real(r).map((c) => ({ ...c, pc: sum ? (100 * (c.v || 0)) / sum : 0 })).sort((a, b) => b.pc - a.pc);
    const a = cs[0], b = cs[1];
    const counted = (r.total || 0) > 0;
    const inPct = r.pct > 0 ? `, ${Math.round(r.pct)}% in` : '';
    const w = r.winner && cs.find((c) => c.n === r.winner.n);
    let head, desc;
    if (isMeasure(r)) {
      head = w ? `${r.name}: ${/^yes$/i.test(w.n) ? 'Passes' : 'Fails'}` : counted && a ? `${r.name}: ${a.n} Leads${inPct}` : `${r.name}: Live Results`;
      desc = w ? `${r.name} ${/^yes$/i.test(w.n) ? 'passes' : 'fails'}, ${pct(w.pc)} ${w.n}.` : counted && a ? `${a.n} leads ${pct(a.pc)} on ${r.name}${r.pct > 0 ? ` with ${Math.round(r.pct)}% reporting` : ''}.` : `Live results for ${r.name}.`;
    } else {
      const other = w ? cs.find((c) => c.n !== w.n) : b;
      head = w ? `${r.name} 2026 Results: ${who(w)} Wins` : counted && a ? `${r.name} 2026 Results: ${who(a)} Leads${inPct}` : `${r.name} 2026 Live Results`;
      desc = w ? `${w.n}${PARTY[w.p] ? ', ' + PARTY[w.p] + ',' : ''} wins ${r.name} with ${pct(w.pc)}${other ? ` to ${pct(other.pc)} for ${other.n}` : ''}.`
        : counted && a ? `${a.n} leads ${b ? `${b.n} ${pct(a.pc)} to ${pct(b.pc)}` : `with ${pct(a.pc)}`} in ${r.name}${r.pct > 0 ? `, ${Math.round(r.pct)}% reporting` : ''}.`
          : `Live results for ${r.name}.`;
    }
    return { title: `${head} | ${SITE}`, desc };
  }

  function page(path, races) {
    const m = path.match(/^\/race\/(\d+)/);
    if (m) { const r = races && races.get(Number(m[1])); return r ? race(r) : null; }
    if (/^\/calls\b/.test(path)) return { title: `Who Called It: 2026 Midterm Race Calls Ranked | ${SITE}`, desc: 'Every outlet and forecaster ranked by who called each 2026 midterm race first and right, with a timeline for every race.' };
    if (/^\/feed\b/.test(path)) return { title: `Live Election Feed: Race Calls, News and Exit Polls | ${SITE}`, desc: 'Race calls, news, exit polls and candidate posts from election night 2026, as they happen.' };
    const b = path.match(/^\/board\/([a-z]+)/);
    if (b && CAT[b[1]]) return { title: `${CAT[b[1]]} Results 2026: Live Map and Race Calls | ${SITE}`, desc: `Live 2026 ${CAT[b[1]]} results, race by race, with calls from every outlet.` };
    return null;
  }

  const api = { HOME, race, page };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.VDTitles = api;
})(this);
