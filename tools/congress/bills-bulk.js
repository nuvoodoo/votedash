// Builds server/congress/data/bills.json from GovInfo BILLSTATUS bulk XML (119th Congress).
// Download: https://www.govinfo.gov/bulkdata/BILLSTATUS/119/{type}/BILLSTATUS-119-{type}.zip
// into data/raw/billstatus/{type}/ (see tools/congress/README or the deploy notes).
'use strict';
const fs = require('fs');
const path = require('path');
const RAW = path.join(__dirname, '../../data/raw/billstatus');
const OUT = path.join(__dirname, '../../server/congress/data');
const TYPES = ['hr', 's', 'hres', 'sres', 'hjres', 'sjres', 'hconres', 'sconres'];

const dec = s => (s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const tag = (x, t) => { const m = x.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)); return m ? dec(m[1]) : ''; };
// top-level section of <bill> (4-space indent) so nested amendment actions are not mixed in
const sec = (x, name) => { const a = x.indexOf(`\n    <${name}>`); if (a < 0) return ''; const b = x.indexOf(`\n    </${name}>`, a); return b < 0 ? '' : x.slice(a, b); };
const items = (s, indent) => s.split(`\n${' '.repeat(indent)}<item>`).slice(1);

const { rollcalls } = JSON.parse(fs.readFileSync(path.join(OUT, 'rollcalls.json'), 'utf8'));
const rcKey = new Map(rollcalls.map(r => [`${r.chamber}${r.session}-${r.clerk}`, r.k]));
const people = JSON.parse(fs.readFileSync(path.join(OUT, 'people.json'), 'utf8'));
const current = new Set(people.filter(p => p.status !== 'elect').map(p => p.id));

const SHORT_PRI = [/as enacted/i, /as passed/i, /as reported/i, /as introduced/i, /short title/i];
const bills = {}, byMember = {}, issues = {}, rollcallBill = {};
const stageCount = {};
const t0 = Date.now();
for (const type of TYPES) {
  const dir = path.join(RAW, type); if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.xml')) continue;
    const x = fs.readFileSync(path.join(dir, f), 'utf8');
    const number = +tag(x, 'number'); const key = type + number;
    const title = (x.match(/\n    <title>([\s\S]*?)<\/title>/) || [])[1];
    // short title
    let short = null;
    const tItems = items(sec(x, 'titles'), 6).map(it => ({ t: tag(it, 'titleType'), v: tag(it, 'title') }));
    for (const re of SHORT_PRI) { const c = tItems.filter(i => /short/i.test(i.t) && re.test(i.t) && !/portions/i.test(i.t)); if (c.length) { short = c.sort((a, b) => a.v.length - b.v.length)[0].v; break; } }
    const sponsor = tag(sec(x, 'sponsors'), 'bioguideId') || null;
    const cos = items(sec(x, 'cosponsors'), 6).filter(it => !/<sponsorshipWithdrawnDate>/.test(it)).map(it => tag(it, 'bioguideId')).filter(Boolean);
    const policyArea = tag(sec(x, 'policyArea'), 'name') || null;
    const subjects = items(sec(x, 'subjects').split('<legislativeSubjects>')[1] || '', 8).map(it => tag(it, 'name')).filter(Boolean);
    const laws = items(sec(x, 'laws'), 6).map(it => `${tag(it, 'type')} ${tag(it, 'number')}`);
    const la = sec(x, 'latestAction');
    // actions, oldest first, de-duplicated
    const seen = new Set(); const actions = [];
    for (const it of items(sec(x, 'actions'), 6).reverse()) {
      const date = tag(it, 'actionDate'), text = tag(it, 'text'), atype = tag(it, 'type'), src = tag(it.split('<sourceSystem>')[1] || '', 'name');
      const k = date + '|' + text; if (seen.has(k)) continue; seen.add(k);
      const chamber = /House/.test(src) ? 'House' : /Senate/.test(src) ? 'Senate' : atype === 'President' || atype === 'BecameLaw' || atype === 'Veto' ? 'President' : null;
      const votes = (it.split('<recordedVote>').slice(1)).map(v => ({ chamber: tag(v, 'chamber'), rollNumber: +tag(v, 'rollNumber'), session: +tag(v, 'sessionNumber'), date: tag(v, 'date').slice(0, 10), url: tag(v, 'url') }));
      for (const v of votes) { const rk = rcKey.get(`${v.chamber[0]}${v.session}-${v.rollNumber}`); if (rk && !rollcallBill[rk]) rollcallBill[rk] = key; }
      actions.push({ date, text, type: atype, chamber, ...(votes.length ? { recordedVotes: votes } : {}) });
    }
    const committees = items(sec(x, 'committees'), 6).map(it => ({ name: tag(it, 'name'), chamber: tag(it, 'chamber'), systemCode: tag(it, 'systemCode'),
      activities: items(it.split('<activities>')[1] || '', 10).map(a => ({ name: tag(a, 'name'), date: tag(a, 'date') })).filter(a => a.name && a.name !== 'Unknown') }));
    // stage
    const has = re => actions.filter(a => re.test(a.text));
    const last = l => l.length ? l[l.length - 1].date : null;
    const pH = has(/Passed\/agreed to in House|^On passage Passed|^Passed House|Agreed to in House/), pS = has(/Passed\/agreed to in Senate|Passed Senate|Agreed to in Senate/);
    let stage = 'introduced', stageDate = tag(x, 'introducedDate');
    const set = (s, d) => { stage = s; if (d) stageDate = d; };
    if (has(/Referred to/i).length) set('committee', last(has(/Referred to/i)));
    if (has(/^Reported |Reported by|Ordered to be Reported|Placed on (the )?(Union|House) Calendar|Placed on Senate Legislative Calendar/i).length) set('reported', last(has(/^Reported |Reported by|Ordered to be Reported|Placed on (the )?(Union|House) Calendar|Placed on Senate Legislative Calendar/i)));
    if (has(/Failed of passage|Failed passage|Motion to proceed .* not agreed to/i).length && !pH.length && !pS.length) set('failed', last(has(/Failed of passage|Failed passage/i)));
    if (pH.length) set('passed-house', last(pH));
    if (pS.length) set('passed-senate', last(pS));
    if (pH.length && pS.length) set('passed-both', last(pH) > last(pS) ? last(pH) : last(pS));
    if (has(/Presented to President/i).length) set('to-president', last(has(/Presented to President/i)));
    const veto = has(/Vetoed by President|Pocket Vetoed/i);
    if (veto.length) set('vetoed', last(veto));
    if (laws.length || has(/Became Public Law|Became Private Law/i).length) set('law', last(has(/Became (Public|Private) Law/i)) || stageDate);
    stageCount[stage] = (stageCount[stage] || 0) + 1;
    bills[key] = {
      type: type.toUpperCase(), number, title: dec(title), short: short && short !== dec(title) ? short : null, policyArea, subjects,
      sponsor, cosponsors: cos.length, introduced: tag(x, 'introducedDate'), latest: la ? { date: tag(la, 'actionDate'), text: tag(la, 'text') } : null,
      law: stage === 'law', lawNumber: laws[0] || null, stage, stageDate, ...(/^(hres|sres|hconres|sconres)/.test(type) && /passed/.test(stage) ? { agreed: true } : {}),
      url: tag(x, 'legislationUrl'), actions, committees
    };
    if (sponsor && current.has(sponsor)) (byMember[sponsor] ||= { sponsored: [], cosponsored: [] }).sponsored.push(key);
    for (const c of cos) if (current.has(c)) (byMember[c] ||= { sponsored: [], cosponsored: [] }).cosponsored.push(key);
    if (policyArea) (issues[policyArea] ||= { bills: 0, rollcalls: [] }).bills++;
  }
}
for (const [rk, bk] of Object.entries(rollcallBill)) { const a = bills[bk] && bills[bk].policyArea; if (a) issues[a].rollcalls.push(rk); }
for (const id of current) byMember[id] ||= { sponsored: [], cosponsored: [] };
fs.writeFileSync(path.join(OUT, 'bills.json'), JSON.stringify({ built: new Date().toISOString(), source: 'GovInfo BILLSTATUS bulk data', bills, byMember, issues, rollcallBill }));
console.log('bills', Object.keys(bills).length, 'issues', Object.keys(issues).length, 'rollcalls linked', Object.keys(rollcallBill).length, 'secs', ((Date.now() - t0) / 1000).toFixed(1));
console.log('stages', JSON.stringify(stageCount));
console.log('size MB', (fs.statSync(path.join(OUT, 'bills.json')).size / 1e6).toFixed(1));
