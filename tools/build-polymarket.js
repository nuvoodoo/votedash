#!/usr/bin/env node
// Matches Senate and governor races to Polymarket "Election Winner" events and
// writes server/data/polymarket.json. Run again if Polymarket adds markets.
'use strict';
const fs = require('fs');
const path = require('path');
const { STATES } = require('../server/civic');

const SEN = 'AK AL AR CO DE FL GA IA ID IL KS KY LA MA ME MI MN MS MT NC NE NH NJ NM OH OK OR RI SC SD TN TX VA WV WY'.split(' ');
const GOV = 'AK AL AR AZ CA CO CT FL GA HI IA ID IL KS MA MD ME MI MN NE NH NM NV NY OH OK OR PA RI SC SD TN TX VT WI WY'.split(' ');

async function search(q) {
  const r = await fetch('https://gamma-api.polymarket.com/public-search?q=' + encodeURIComponent(q) + '&limit_per_type=8');
  const j = await r.json();
  return (j.events || []).filter((e) => !e.closed);
}
function pick(events, re) { return events.find((e) => re.test(e.title.trim())); }
function compact(e) {
  return {
    slug: e.slug, title: e.title,
    markets: (e.markets || []).filter((m) => /democrat|republican|independent/i.test(m.question) && m.outcomePrices)
      .map((m) => ({ id: m.id, slug: m.slug, q: m.question, party: /democrat/i.test(m.question) ? 'D' : /republican/i.test(m.question) ? 'R' : 'I' })),
  };
}

(async () => {
  const out = { senate: {}, governor: {}, control: {} };
  for (const st of SEN) {
    const name = STATES[st];
    const ev = await search(`${name} Senate Election Winner`);
    const e = pick(ev, new RegExp(`^${name} (Special )?Senate (Special )?Election Winner$`, 'i')) || pick(ev, new RegExp(`^${name} .*Senate.*Winner$`, 'i'));
    if (e) out.senate[st] = compact(e); else console.error('no senate market', st, ev.map((x) => x.title).slice(0, 4));
  }
  for (const st of GOV) {
    const name = STATES[st];
    const ev = await search(`${name} Governor Election Winner`);
    const e = pick(ev, new RegExp(`^${name} Governor Election Winner$`, 'i')) || pick(ev, new RegExp(`^${name} .*Governor.*Winner$`, 'i'));
    if (e) out.governor[st] = compact(e); else console.error('no gov market', st, ev.map((x) => x.title).slice(0, 4));
  }
  for (const [k, q] of [['senate', 'Which party will win the Senate in 2026?'], ['house', 'Which party will win the House in 2026?']]) {
    const ev = await search(q);
    const e = ev.find((x) => x.title === q);
    if (e) out.control[k] = { slug: e.slug, title: e.title, markets: (e.markets || []).filter((m) => /democratic party|republican party/i.test(m.question)).map((m) => ({ id: m.id, slug: m.slug, q: m.question, party: /democratic/i.test(m.question) ? 'D' : 'R' })) };
    else console.error('no control market', k);
  }
  const dest = path.join(__dirname, '..', 'server', 'data', 'polymarket.json');
  fs.writeFileSync(dest, JSON.stringify(out));
  console.log(`senate ${Object.keys(out.senate).length}, governor ${Object.keys(out.governor).length}, control ${Object.keys(out.control).length} -> ${dest}`);
})();
