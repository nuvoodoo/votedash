'use strict';
const D = require('./data');
const H = require('./html');
const { esc, money, pct, date, age, ord, PARTY, seatLabel, title, short, href, portrait, chip, personLink, seatChart, partyFill, layout, SITE } = H;

const VOTE_WORD = { Y: 'Yea', N: 'Nay', P: 'Present', 0: 'Not voting' };
const billLabel = k => { const m = /^([a-z]+)(\d+)$/.exec(k || ''); if (!m) return k; const t = { hr: 'H.R.', s: 'S.', hres: 'H.Res.', sres: 'S.Res.', hjres: 'H.J.Res.', sjres: 'S.J.Res.', hconres: 'H.Con.Res.', sconres: 'S.Con.Res.' }[m[1]] || m[1].toUpperCase(); return `${t} ${m[2]}`; };
const rcBillKey = rc => D.bills && D.bills.rollcallBill[rc.k] || (rc.bill ? rc.bill.toLowerCase() : null);
function rcTitle(rc) {
  const bk = rcBillKey(rc); const b = bk && D.bills && D.bills.bills[bk];
  const name = b ? (b.short || b.title) : rc.desc;
  return name ? name : rc.question;
}
const cycleNow = 2026;
const lastCycle = p => { const c = p.money && p.money.cycles; if (!c) return null; const y = c[cycleNow] ? cycleNow : Math.max(...Object.keys(c).map(Number)); return { y, ...c[y] }; };
const codeFor = (p, rc) => { const i = D.rcPos[rc.chamber].get(p.id); return i == null ? null : rc.codes[i]; };

// ---------------- home ----------------
function home() {
  const latestH = D.recentRolls.H[0], latestS = D.recentRolls.S[0];
  const voteMap = rc => Object.fromEntries(D.order[rc.chamber].map((id, i) => [id, rc.codes[i]]));
  const n = { H: D.chambers.H.length, S: D.chambers.S.length };
  const count = (ch, pty) => D.chambers[ch].filter(p => p.party === pty).length;
  const elect = D.people.filter(p => p.status === 'elect');
  const leaving = D.people.filter(p => p.status === 'leaving');
  const raisedTop = D.people.filter(p => p.status !== 'elect' && lastCycle(p)).sort((a, b) => lastCycle(b).receipts - lastCycle(a).receipts).slice(0, 8);
  const outside = [...D.funders.values()].sort((a, b) => b.ie - a.ie).slice(0, 8);
  const rolls = D.allRolls.slice(0, 8);
  const body = `
<section class="hero"><div class="wrap">
  <h1>Every member of Congress, seated by how they vote</h1>
  <p class="lede">${n.H} representatives and ${n.S} senators, ordered left to right by their voting record. Open any seat for their votes, money, elections, speeches and record.</p>
  <form class="bigsearch" action="/search" role="search"><label for="hq" class="vh">Search members, states, PACs and bills</label><input id="hq" name="q" type="search" placeholder="Name, ZIP code, PAC or bill" autocomplete="off" data-suggest><button type="submit">Search</button></form>
  <div class="chamber" data-chamber>
    <div class="ch-tools">
      <div class="seg" role="group" aria-label="Color seats by">
        <button type="button" aria-pressed="true" data-mode="party">Party</button>
        ${D.caucuses ? '<button type="button" aria-pressed="false" data-mode="caucus">Caucus</button>' : ''}
        <button type="button" aria-pressed="false" data-mode="vote">Latest vote</button>
      </div>
      <p class="ch-key" data-key="party"><span><i class="fD"></i>Democrat</span><span><i class="fR"></i>Republican</span><span><i class="fI"></i>Independent</span></p>
      ${D.caucuses ? `<p class="ch-key cau-key" data-key="caucus" hidden>${[['freedom', 'Freedom Caucus'], ['rsc', 'Republican Study Committee'], ['mainstreet', 'Main Street'], ['noneR', 'Other Republicans'], ['progressive', 'Progressive Caucus'], ['newdem', 'New Democrats'], ['bluedog', 'Blue Dogs'], ['noneD', 'Other Democrats']].map(([k, l]) => `<a href="${k.startsWith('none') ? `/members?party=${k.slice(4)}` : `/caucus/${k}`}" data-cau="${k}"><i class="c${k}"></i>${l}</a>`).join('')}</p>` : ''}
      <p class="ch-key" data-key="vote" hidden><span><i class="vY"></i>Yea</span><span><i class="vN"></i>Nay</span><span><i class="v0"></i>Not voting</span></p>
    </div>
    <div class="ch-grid">
      <figure><figcaption><a href="/members?chamber=H">House</a> <span>${count('H', 'R')} R, ${count('H', 'D')} D</span></figcaption>${seatChart('H', partyFill)}<p class="ch-vote" data-vote-cap hidden><a href="/vote/${latestH.k}">${esc(latestH.question)}: ${esc(rcTitle(latestH))}</a>, ${date(latestH.date)}</p></figure>
      <figure><figcaption><a href="/members?chamber=S">Senate</a> <span>${count('S', 'R')} R, ${count('S', 'D')} D, ${count('S', 'I')} I</span></figcaption>${seatChart('S', partyFill)}<p class="ch-vote" data-vote-cap hidden><a href="/vote/${latestS.k}">${esc(latestS.question)}: ${esc(rcTitle(latestS))}</a>, ${date(latestS.date)}</p></figure>
    </div>
    <div class="ch-axis"><span>Most liberal</span><span>Most conservative</span></div>
    <script type="application/json" id="vote-data">${JSON.stringify({ H: voteMap(latestH), S: voteMap(latestS) })}</script>
  </div>
</div></section>
${comingUp()}

<section class="band"><div class="wrap cols">
  <div class="col-main">
    <h2><a href="/votes">Latest roll calls</a></h2>
    <ol class="rolls">${rolls.map(rollRow).join('')}</ol>
  </div>
  <aside class="col-side">
    <h2><a href="/money">Most raised this cycle</a></h2>
    <ol class="rank">${raisedTop.map(p => `<li>${personLink(p)}<b class="amt">${money(lastCycle(p).receipts)}</b></li>`).join('')}</ol>
  </aside>
</div></section>

<section class="band alt"><div class="wrap">
  <h2><a href="/incoming">The 120th Congress takes office January 3, 2027</a></h2>
  <p class="sub">${elect.length + D.people.filter(p => p.elect).length} new members won seats on November 3. ${leaving.length} current members leave office.</p>
  <ul class="faces">${elect.filter(p => p.chamber === 'S').concat(D.people.filter(p => p.elect && p.elect.chamber === 'S')).map(p => `<li>${electCard(p)}</li>`).join('')}</ul>
  <p><a class="more" href="/incoming">See all ${elect.length + D.people.filter(p => p.elect).length} members-elect</a></p>
</div></section>

<section class="band"><div class="wrap cols">
  <div class="col-main">
    <h2>Find your delegation</h2>
    ${tileMap()}
  </div>
  <aside class="col-side">
    <h2><a href="/money#outside">Biggest outside spenders</a></h2>
    <ol class="rank">${outside.map(f => `<li><a href="/f/${f.slug}">${leanDot(f.id)}<b>${esc(nice(f.name))}</b><small>${esc(f.kind)}</small></a><b class="amt">${money(f.ie)}</b></li>`).join('')}</ol>
  </aside>
</div></section>`;
  return layout({ body, path: '/', jsonld: { '@context': 'https://schema.org', '@type': 'WebSite', name: 'VoteDash', url: SITE, potentialAction: { '@type': 'SearchAction', target: SITE + '/search?q={q}', 'query-input': 'required name=q' } } });
}

function electCard(p) {
  const e = p.status === 'elect' ? p : { ...p.elect, slug: p.slug, id: p.id };
  return `<a class="elect" href="/m/${p.slug}"><b>${esc(p.name)}</b><small>${chip(e)} ${esc(e.chamber === 'S' ? D.STATES[e.state] : e.state + '-' + (e.district || 'AL'))}${e.pct ? ', ' + e.pct.toFixed(1) + '%' : ''}</small></a>`;
}

// what kind of vote: leadership, nomination, passage, amendment or procedural
const KINDS = [['passage', 'Passage'], ['procedural', 'Procedural'], ['amendment', 'Amendments'], ['nomination', 'Nominations'], ['leadership', 'Leadership']];
function rcKind(rc) {
  if (rc._kind) return rc._kind;
  const q = rc.question || '', d = (rc.desc || '') + ' ' + rcTitle(rc), b = rc.bill || '';
  let k;
  if (/Election of the Speaker|vacate/i.test(q + ' ' + d)) k = 'leadership';
  else if (/Nomination/i.test(q) || /^PN/i.test(b)) k = 'nomination';
  else if (/Cloture|Motion to Proceed|Recommit|Previous Question|Table|Adjourn|Refer|Commit|Point of Order|Decision of the Chair|Reconsider|Discharge|Consideration of the Resolution|Instruct|Retaining|^On the Motion$|Waive/i.test(q)) k = 'procedural';
  else if (/Agreeing to the Resolution|On the Resolution/i.test(q) && /providing for (the )?consideration|waiving|providing for proceedings/i.test(d)) k = 'procedural';
  else if (/Amendment/i.test(q) && !/Concur/i.test(q)) k = 'amendment';
  else k = 'passage';
  return (rc._kind = k);
}
const KIND_LABEL = Object.fromEntries(KINDS.map(([k, l]) => [k, l.replace(/s$/, '')]));
function rollRow(rc) {
  const t = rc.tally; const tot = rc.yea + rc.nay || 1;
  return `<li><a href="/vote/${rc.k}">
    <span class="rr-meta"><span class="vk vk-${rcKind(rc)}">${KIND_LABEL[rcKind(rc)]}</span> ${rc.chamber === 'H' ? 'House' : 'Senate'} roll call ${rc.clerk}, ${date(rc.date)}</span>
    <b>${esc(rcTitle(rc))}</b>
    <span class="rr-q">${esc(rc.question)}${rcBillKey(rc) ? ', ' + billLabel(rcBillKey(rc)) : ''}. <em class="res ${/pass|agreed|confirmed|adopted/i.test(rc.result) ? 'ok' : 'no'}">${esc(rc.result)}</em> ${rc.yea}-${rc.nay}</span>
    <span class="bar" aria-hidden="true"><i class="vY" style="width:${(rc.yea / tot * 100).toFixed(1)}%"></i><i class="vN" style="width:${(rc.nay / tot * 100).toFixed(1)}%"></i></span>
    <span class="rr-p">D ${t.D.Y}-${t.D.N}, R ${t.R.Y}-${t.R.N}</span>
  </a></li>`;
}

// US tile grid (row, col)
const TILES = { AK: [0, 0], ME: [0, 11], VT: [1, 10], NH: [1, 11], WA: [2, 1], ID: [2, 2], MT: [2, 3], ND: [2, 4], MN: [2, 5], IL: [2, 6], WI: [2, 7], MI: [2, 8], NY: [2, 9], RI: [2, 10], MA: [2, 11], OR: [3, 1], NV: [3, 2], WY: [3, 3], SD: [3, 4], IA: [3, 5], IN: [3, 6], OH: [3, 7], PA: [3, 8], NJ: [3, 9], CT: [3, 10], CA: [4, 1], UT: [4, 2], CO: [4, 3], NE: [4, 4], MO: [4, 5], KY: [4, 6], WV: [4, 7], VA: [4, 8], MD: [4, 9], DE: [4, 10], AZ: [5, 2], NM: [5, 3], KS: [5, 4], AR: [5, 5], TN: [5, 6], NC: [5, 7], SC: [5, 8], DC: [5, 9], OK: [6, 4], LA: [6, 5], MS: [6, 6], AL: [6, 7], GA: [6, 8], HI: [7, 0], TX: [7, 4], FL: [7, 8] };
function tileMap() {
  return `<div class="tiles" role="list">${Object.entries(TILES).map(([st, [r, c]]) => {
    const ms = (D.states[st] || []).filter(p => p.status !== 'elect');
    const d = ms.filter(p => p.party === 'D' || p.caucus === 'D').length, rr = ms.filter(p => p.party === 'R').length;
    const lean = d + rr ? (rr - d) / (d + rr) : 0;
    return `<a role="listitem" href="/state/${st.toLowerCase()}" style="grid-row:${r + 1};grid-column:${c + 1};--lean:${lean.toFixed(2)}" class="tile ${lean > 0.2 ? 'tR' : lean < -0.2 ? 'tD' : 'tM'}" aria-label="${esc(D.STATES[st])}: ${rr} Republicans, ${d} Democrats"><b>${st}</b><small>${rr}R ${d}D</small></a>`;
  }).join('')}</div>`;
}
const SMALL = new Set(['of', 'and', 'the', 'for', 'to', 'in', 'on', 'at', 'by', 'a', 'an', 'or']);
const ACR = new Set(['pac', 'llc', 'llp', 'usa', 'ii', 'iii', 'iv', 'nra', 'afl', 'cio', 'afscme', 'ibew', 'seiu', 'uaw', 'nea', 'aft', 'ups', 'ibm', 'cvs', 'hca', 'bnsf', 'csx', 'kbr', 'aipac', 'nrcc', 'nrsc', 'dccc', 'dscc', 'rnc', 'dnc', 'lgbtq', 'aflac', 'nar', 'ama', 'aba', 'ana', 'ncta', 'gop', 'us',
  'udp', 'afp', 'cva', 'usi', 'dmfi', 'rjc', 'norpac', 'jacpac', 'fipac', 'naacp', 'aarp', 'ahip', 'phrma', 'aclu', 'nfib', 'nab', 'aia', 'bae', 'ge', 'gm', 'hmp', 'slf', 'clf', 'smp', 'emily', 'nrdc', 'lcv', 'afge', 'nnu', 'cwa', 'iam', 'ufcw', 'usw', 'iuoe', 'nalc', 'apwu', 'nfl', 'nba', 'mlb', 'nhl', 'ncaa', 'nyc', 'dc', 'pa', 'ny', 'nj', 'tx', 'fl', 'nc', 'va', 'az', 'wi', 'mn', 'nv', 'nh',
  'ai', 'ipac', 'aapc', 'acec', 'agc', 'nahb', 'ncba', 'nmha', 'npga', 'nrf', 'nrecaa', 'nrhc', 'abc', 'cbs', 'nbc', 'att', 'kpmg', 'pwc', 'ey', 'jpmorgan', 'bny', 'ubs', 'td', 'hsbc', 'tiaa', 'usaa', 'bp', 'fmc', 'ppg', 'adm', 'cme', 'ice', 'nasdaq', 'nyse', 'cpa', 'aicpa', 'aha', 'acp', 'aoa', 'apa', 'ada', 'asa', 'acs', 'nfu', 'afbf', 'eaa', 'aopa', 'nbaa', 'lpa', 'alpa', 'afa', 'twu', 'atu', 'iatse', 'sag', 'aftra', 'wga', 'mpa', 'riaa', 'nmpa', 'ncpa', 'nacds', 'pcma', 'bio', 'advamed', 'gpha', 'ama-pac']);
// consonant pairs that start English words; a short word starting with any other pair is read as an acronym (DMFI, JSTREET is not short)
const ONSET = new Set(['bl', 'br', 'ch', 'cl', 'cr', 'dr', 'dw', 'fl', 'fr', 'gl', 'gn', 'gr', 'kn', 'ph', 'pl', 'pr', 'ps', 'sc', 'sh', 'sk', 'sl', 'sm', 'sn', 'sp', 'st', 'sw', 'th', 'tr', 'tw', 'wh', 'wr', 'qu', 'kr', 'sch', 'scr', 'shr', 'spl', 'spr', 'str', 'thr']);
const NOT_ACR = new Set(['dr', 'mr', 'mrs', 'ms', 'jr', 'sr', 'st', 'mt', 'ft', 'the', 'and', 'of', 'for', 'first', 'state', 'gold', 'multi', 'fire', 'pace', 'fed', 'rheem', 'cmte', 'fund', 'party', 'joint', 'great', 'new', 'old', 'west', 'east', 'north', 'south', 'one', 'free', 'tulip', 'wood', 'elbit', 'or']);
['maga', 'pseg', 'ak', 'ar', 'az', 'ct', 'dc', 'fl', 'ga', 'ia', 'ks', 'ky', 'md', 'mi', 'mn', 'mo', 'ms', 'mt', 'nc', 'nd', 'nh', 'nj', 'nm', 'nv', 'ny', 'pa', 'ri', 'sc', 'sd', 'tn', 'tx', 'ut', 'va', 'vt', 'wa', 'wi', 'wv', 'wy'].forEach(w => ACR.add(w));
const looksAcronym = w => w.length <= 5 && (!/[aeiouy]/.test(w) || (/^[^aeiouy]{2}/.test(w) && !ONSET.has(w.slice(0, 2)) && !ONSET.has(w.slice(0, 3))));
const FIX = [[/\bJstreetpac\b/g, 'JStreetPAC'], [/\bJ Street PAC\b/g, 'J Street PAC'], [/\bEmily's List\b/gi, "EMILY's List"], [/\bAt&t\b/gi, 'AT&T'], [/\bInc\b\.?/g, 'Inc.'], [/\bCo\b\.?(?=$|[\s,])/g, 'Co.'], [/\bCorp\b\.?/g, 'Corp.'], [/\bLtd\b\.?/g, 'Ltd.']];
const nice = s => !s ? '' : s !== s.toUpperCase() ? s : FIX.reduce((t, [re, r]) => t.replace(re, r), s.toLowerCase().split(/(\s+|[-/(),.&'"])/).map((w, i, a) => {
  if (!/[a-z]/.test(w) || /\d/.test(w)) return w;
  if (a[i - 1] === "'" && w === 's') return w;
  if (NOT_ACR.has(w) && !ACR.has(w)) return i > 0 && a[i - 1] !== '(' && SMALL.has(w) ? w : w[0].toUpperCase() + w.slice(1);
  // the abbreviation a group puts in parentheses or quotes after its name: (UDP), ('RJC')
  if ((a[i - 1] === '(' || ((a[i - 1] === "'" || a[i - 1] === '"') && a[i - 2] === '(')) && w.length <= 6) return w.toUpperCase();
  if (i > 0 && SMALL.has(w)) return w;
  if (ACR.has(w) || looksAcronym(w)) return w.toUpperCase();
  return w[0].toUpperCase() + w.slice(1);
}).join('').replace(/\bMc([a-z])/g, (_, c) => 'Mc' + c.toUpperCase()).replace(/\b\w{1,2}&\w{1,2}\b/g, m => m.toUpperCase()));

// ---------------- member ----------------
// profile tabs: each has its own URL, /m/{slug}/{tab}; the profile itself (/m/{slug}) shows every section
const TABS = [['elections', 'Elections'], ['coming-up', 'Coming Up'], ['markets', 'Prediction Markets'], ['polling', 'Polling'], ['votes', 'Votes'], ['money', 'Money'], ['bills', 'Bills'], ['speeches', 'Speeches'], ['record', 'Record'], ['connections', 'Connections']];
const TAB_IDS = new Set(TABS.map(t => t[0]));
function tabHtml(p, id, q, full) {
  switch (id) {
    case 'elections': return electionsSec(p);
    case 'coming-up': return comingFor(p);
    case 'markets': return (MKT.get().members[p.id] || []).length ? `<h2>Prediction markets</h2><p class="sub">Market-implied chances, updated every 10 minutes.</p>${pmRows(MKT.get().members[p.id])}` : '';
    case 'polling': return memberPolling(p);
    case 'votes': return full ? votesFull(p, +q.get('page') || 1) : votesSec(p);
    case 'money': return full ? moneySec(p, yearOf(q), `${href(p)}/money`, '', true) : moneySec(p, yearOf(q));
    case 'bills': return billsSec(p, full);
    case 'speeches': return speechesSec(p, full);
    case 'record': return recordSec(p);
    case 'connections': return connectionsSec(p);
  }
  return '';
}
// title and description for each tab's own page
function tabSeo(p, id, q) {
  const n = `${title(p)} ${p.name}`, v = p.votes, y = yearOf(q);
  const bm = D.bills && D.bills.byMember[p.id], sp = D.speeches && D.speeches.byMember[p.id], rec = D.record && D.record.byPerson[p.id];
  const page = id === 'votes' ? +q.get('page') || 1 : 1;
  switch (id) {
    case 'elections': return [`${n}: election results`, `Every general election and primary ${p.name} (${short(p)}) has run in, with vote share, opponents and results.`];
    case 'coming-up': return [`${n}: coming up in Congress`, `Floor action scheduled on bills ${p.name} sponsors or cosponsors, and upcoming hearings of their committees.`];
    case 'markets': return [`${n}: prediction market odds`, `Market-implied chances for ${p.name} (${short(p)}) from prediction markets, updated every 10 minutes.`];
    case 'polling': return [`${n}: approval rating and polls`, `Favorability and job approval polling for ${p.name} (${short(p)}).`];
    case 'votes': return [`${n}: voting record${page > 1 ? `, page ${page}` : ''}`, `How ${p.name} (${short(p)}) voted on every roll call in the 119th Congress${v ? `: ${v.cast} votes cast, ${pct(v.unity, 0)} with their party, ${pct(v.missedPct, 1)} missed` : ''}.`];
    case 'money': return [`${n}: campaign donors and industries${y ? `, ${y}` : ''}`, `Who funds ${p.name} (${short(p)}): FEC receipts by cycle, top PAC donors, top industries and outside spending for and against them ${y ? `in ${y}` : 'since 2021'}.`];
    case 'bills': return [`Bills sponsored by ${n}`, `${bm ? `${bm.sponsored.length} bills sponsored and ${bm.cosponsored.length} cosponsored` : 'Bills sponsored'} by ${p.name} (${short(p)}) in the 119th Congress, with status and policy areas.`];
    case 'speeches': return [`${n}: floor speeches`, `${sp ? sp.count + ' floor speeches' : 'Floor speeches'} by ${p.name} (${short(p)}) in the Congressional Record this Congress.`];
    case 'record': return [`${n}: ethics, legal and controversies`, `${rec ? `${rec.length} ${rec.length === 1 ? 'item' : 'items'}` : 'Items'} on ${p.name}'s record: ${[...new Set((rec || []).map(x => (KIND[x.kind] || x.kind).toLowerCase()))].join(', ')}.`];
    case 'connections': return [`${n}: allies, shared donors and cross-party votes`, `Members of Congress who vote most like ${p.name}, share the most PAC donors with them, and are closest to them across the aisle.`];
  }
}
function member(p, q, tab) {
  if (tab && !TAB_IDS.has(tab)) return null;
  const chamberName = p.chamber === 'S' ? 'Senate' : 'House';
  const role = p.status === 'elect' ? `${p.chamber === 'S' ? 'Senator-elect' : 'Representative-elect'}, ${seatLabel(p)}${p.chamber === 'H' && !p.delegate ? ' District' : ''}`
    : `${p.chamber === 'S' ? (p.rank === 'senior' ? 'Senior senator' : p.rank === 'junior' ? 'Junior senator' : 'Senator') + ' from ' + D.STATES[p.state] : p.delegate ? 'Delegate from ' + D.STATES[p.state] : 'Representative, ' + seatLabel(p) + ' District'}`;
  const cy = lastCycle(p);
  const v = p.votes;
  const status = statusLine(p);
  const sections = [];
  const nav = [['', 'Overview']];
  const add = (id, html) => { if (html) sections.push(`<section id="${id}" class="sec">${html}</section>`); };

  if (!tab) add('overview', overview(p, cy));
  for (const [id, label] of TABS) {
    const h = tabHtml(p, id, q, id === tab);
    if (!h) continue;
    nav.push([id, label]);
    if (!tab || id === tab) add(id, h);
  }
  if (tab && !sections.length) return { redirect: href(p) };

  const body = `
<article class="profile">
<header class="ph"><div class="wrap ph-in">
  ${portrait(p, 'w', 'ph-pt')}
  <div class="ph-txt">
    ${leaderRoles(p.id).length ? `<p class="ph-lead"><a href="/leadership">${esc(leaderRoles(p.id).map(c => c.title).join(', '))}</a></p>` : ''}
    <p class="ph-role">${chip(p)} ${esc(PARTY[p.party] || p.partyName)}${p.caucus && p.caucus !== p.party ? `, caucuses with ${PARTY[p.caucus]}s` : ''}</p>
    <h1>${esc(p.name)}</h1>
    <p class="ph-seat">${esc(role)}${p.since && p.status !== 'elect' ? `. In the ${chamberName} since ${new Date(firstInChamber(p)).getUTCFullYear()}` : ''}${p.birthday ? `. Age ${age(p.birthday)}` : ''}.</p>
    ${(() => { const m = D.caucuses && D.caucuses.members[p.id]; if (!m || !m.length) return ''; return `<p class="ph-cau">${m.map(id => { const c = D.caucuses.caucuses.find(x => x.id === id); return c ? `<a href="/caucus/${id}" class="cau c${H.caucusOf({ id: p.id }) === id ? id : ''}">${esc(c.name)}</a>` : ''; }).join('')}</p>`; })()}
    ${status ? `<p class="ph-status">${status}</p>` : ''}
    <p class="ph-act">${p.url ? `<a class="btn" href="${esc(p.url)}" rel="noopener">Official website</a>` : ''}${p.contact ? `<a class="btn ghost" href="${esc(p.contact)}" rel="noopener">Contact their office</a>` : ''}${p.status !== 'elect' ? `<a class="btn ghost" href="/compare?a=${p.slug}">Compare</a>` : ''}${p.phone ? `<span class="ph-phone">${esc(p.phone)}</span>` : ''}</p>
    ${(() => { const l = contactLinks(p).filter(([n]) => n !== 'Official website' && n !== 'Contact form'); return l.length ? `<p class="ph-links">${l.map(([n, u]) => `<a href="${esc(u)}" rel="noopener">${esc(n)}</a>`).join('')}</p>` : ''; })()}
  </div>
  ${p.status !== 'elect' && p.nominate != null && !p.delegate ? `<figure class="ph-seatmap">${seatChart(p.chamber, q => q.id === p.id ? 'f' + q.party : 'fx', { highlight: p.id, label: `${p.name}'s seat among ${chamberName} colleagues, ordered by voting record` })}<figcaption>${seatPhrase(p)}</figcaption></figure>` : ''}
</div>
<nav class="subnav" aria-label="${esc(p.name)}"><div class="wrap">${nav.map(([id, l]) => `<a href="${id ? `${href(p)}/${id}` : href(p)}"${(id || null) === (tab || null) ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</div></nav>
</header>
<div class="wrap pb">
  <div class="pb-main">${sections.join('')}</div>
  <aside class="pb-rail">${rail(p)}</aside>
</div>
</article>`;
  const nm = `${title(p)} ${p.name}`;
  const [tTitle, tDesc] = tab ? tabSeo(p, tab, q) : [`${nm} (${short(p)}): votes, donors and record`, `${nm} (${short(p)}), ${role}: ${v ? `${v.cast} votes cast, ${pct(v.unity, 0)} with their party, ` : ''}${cy ? `${money(cy.receipts)} raised in the ${cy.y} cycle, ` : ''}top donors, election results, bills, speeches and record.`];
  const yq = tab === 'money' && yearOf(q) ? '?year=' + yearOf(q) : tab === 'votes' && +q.get('page') > 1 ? '?page=' + +q.get('page') : '';
  const path = (tab ? `${href(p)}/${tab}` : href(p)) + yq, img = H.hasPortrait(p) ? `${SITE}/portraits/w/${p.id}.webp` : null;
  const person = { '@type': 'Person', '@id': SITE + href(p) + '#person', name: p.name, jobTitle: role, url: SITE + href(p), image: img || undefined, birthDate: p.birthday || undefined,
    affiliation: PARTY[p.party] ? { '@type': 'PoliticalParty', name: PARTY[p.party] + ' Party' } : undefined,
    memberOf: p.status === 'elect' ? undefined : { '@type': 'GovernmentOrganization', name: `United States ${chamberName}` },
    sameAs: [p.url, /^[A-Z]\d{6}$/.test(p.id) ? `https://bioguide.congress.gov/search/bio/${p.id}` : null, p.ids && p.ids.wikipedia ? 'https://en.wikipedia.org/wiki/' + encodeURIComponent(p.ids.wikipedia.replace(/ /g, '_')) : null].filter(Boolean) };
  const crumbs = [['Members', '/members'], [p.name, href(p)], ...(tab ? [[TABS.find(t => t[0] === tab)[1], `${href(p)}/${tab}`]] : [])];
  const jsonld = { '@context': 'https://schema.org', '@graph': [
    { '@type': tab ? 'WebPage' : 'ProfilePage', '@id': SITE + path, url: SITE + path, name: tTitle, description: tDesc, [tab ? 'about' : 'mainEntity']: { '@id': person['@id'] } },
    person,
    { '@type': 'BreadcrumbList', itemListElement: crumbs.map(([n, u], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: SITE + u })) }] };
  return layout({ title: tTitle, desc: tDesc, path, body, active: '/members', image: img, jsonld });
}
function firstInChamber(p) { const t = p.terms.find(t => (t.type === 'sen') === (p.chamber === 'S')); return t.start; }
function statusLine(p) {
  if (p.status === 'elect') return `Won ${p.chamber === 'S' ? 'the Senate seat' : 'the seat'} on November 3, 2026${p.pct ? ` with ${p.pct.toFixed(1)}%` : ''}. Takes office January 3, 2027.`;
  if (p.elect) return `Elected to the ${p.elect.chamber === 'S' ? 'Senate' : 'House'} from ${D.STATES[p.elect.state]} on November 3, 2026${p.elect.pct ? ` with ${p.elect.pct.toFixed(1)}%` : ''}. Takes that seat January 3, 2027.`;
  if (p.newDistrict != null) return `Re-elected in the redrawn ${ord(p.newDistrict)} District on November 3, 2026${p.redrawnRace && p.redrawnRace.pct ? ` with ${p.redrawnRace.pct.toFixed(1)}%` : ''}.`;
  if (p.status === 'leaving') return p.race2026 && p.race2026.ran ? `Lost re-election on November 3, 2026${p.race2026.pct != null ? ` with ${p.race2026.pct.toFixed(1)}%` : ''}. Leaves office January 3, 2027.` : `Did not seek re-election in 2026. Leaves office January 3, 2027.`;
  if (p.race2026 && p.race2026.won) return `Re-elected November 3, 2026${p.race2026.pct != null ? ` with ${p.race2026.pct.toFixed(1)}%` : ''}.`;
  if (p.chamber === 'S') return `Next up for election in ${new Date(p.termEnd).getUTCFullYear() - 1}.`;
  return '';
}
function seatPhrase(p) {
  const list = D.chambers[p.chamber]; const i = list.findIndex(q => q.id === p.id); if (i < 0) return '';
  const n = list.length; const libRank = i + 1, conRank = n - i;
  return libRank <= conRank ? `${ord(libRank)} most liberal of ${n}` : `${ord(conRank)} most conservative of ${n}`;
}

function overview(p, cy) {
  const v = p.votes; const facts = [];
  if (v && v.unity != null) facts.push([pct(v.unity, 1), 'votes with party', `On ${v.partyVotes} party-line roll calls`]);
  if (v && v.missedPct != null) facts.push([pct(v.missedPct, 1), 'votes missed', `${v.missed} of ${v.eligible} roll calls`]);
  if (cy) facts.push([money(cy.receipts), `raised, ${cy.y - 1}-${String(cy.y).slice(2)}`, cy.receipts ? `${pct(cy.pac / cy.receipts)} from PACs` : '']);
  const bm = D.bills && D.bills.byMember[p.id]; if (bm) facts.push([String(bm.sponsored.length), 'bills sponsored', `${bm.cosponsored.length} cosponsored`]);
  const sp = D.speeches && D.speeches.byMember[p.id]; if (sp) facts.push([String(sp.count), 'floor speeches', 'This Congress']);
  const rec = D.record && D.record.byPerson[p.id]; if (rec) facts.push([String(rec.length), rec.length === 1 ? 'item on the record' : 'items on the record', 'Ethics, legal, censure']);
  if (!facts.length) return '';
  return `<h2 class="vh">Overview</h2><dl class="facts">${facts.map(([n, l, s]) => `<div><dt>${esc(l)}</dt><dd>${esc(n)}</dd>${s ? `<dd class="s">${esc(s)}</dd>` : ''}</div>`).join('')}</dl>`;
}

function votesSec(p) {
  if (!p.votes || p.status === 'elect') return '';
  const rolls = D.recentRolls[p.chamber];
  const recent = []; for (const rc of rolls) { const c = codeFor(p, rc); if (c == null) continue; if (c === '0' && !wasIn(p, rc)) continue; recent.push([rc, c]); if (recent.length >= 12) break; }
  const breaks = p.votes.breaks.slice(0, 8).map(k => D.rcByK.get(k));
  return `<h2>Votes</h2>
  <p class="sub">${p.votes.cast} votes cast in the 119th Congress. Party-line votes are roll calls where most Democrats and most Republicans voted on opposite sides.</p>
  ${breaks.length ? `<h3>Broke with their party</h3><p class="sub">${times(p.votes.partyVotes - p.votes.withParty)} on party-line votes.</p><ul class="vlist">${breaks.map(rc => vrow(rc, codeFor(p, rc), true)).join('')}</ul>` : `<h3>Broke with their party</h3><p class="sub">Never on a party-line vote this Congress.</p>`}
  <h3>Recent votes</h3><ul class="vlist">${recent.map(([rc, c]) => vrow(rc, c)).join('')}</ul>
  <p><a class="more" href="${href(p)}/votes">All ${p.votes.eligible} votes</a></p>`;
}
const times = n => n === 1 ? 'Once' : n === 2 ? 'Twice' : `${n} times`;
const wasIn = (p, rc) => p.terms.some(t => (t.type === 'sen') === (rc.chamber === 'S') && t.start <= rc.date && t.end >= rc.date);
function vrow(rc, c, flag) {
  return `<li class="${flag ? 'brk' : ''}"><span class="vc v${c}">${VOTE_WORD[c]}</span><a href="/vote/${rc.k}"><b>${esc(rcTitle(rc))}</b><small>${esc(rc.question)}, ${date(rc.date)}. ${esc(rc.result)} ${rc.yea}-${rc.nay}</small></a></li>`;
}

// ---- money by year ----
const YEARS = [2026, 2025, 2024, 2023, 2022, 2021];
const cycleOf = y => y + (y % 2);
const cyLabel = cy => `${cy - 1}-${String(cy).slice(2)}`;
const yearOf = q => { const y = q && +q.get('year'); return YEARS.includes(y) ? y : null; };
function yearNav(base, y, anchor = '') {
  return `<nav class="seg sm years" aria-label="Year">${[[null, 'All Years'], ...YEARS.map(v => [v, String(v)])].map(([v, l]) => `<a href="${base}${v ? (base.includes('?') ? '&' : '?') + 'year=' + v : ''}${anchor}" aria-pressed="${y === v}">${l}</a>`).join('')}</nav>`;
}
// per-year indexes built from the dated contribution files, cached per data build
const viewCache = new Map();
function view(y) {
  const key = D.meta.built + '|' + y; if (viewCache.has(key)) return viewCache.get(key);
  if (viewCache.size > 14) viewCache.clear();
  const ys = String(y); const givenTo = new Map(), givenBy = new Map(), ieFor = new Map(), ieAg = new Map(), ieP = new Map();
  for (const [pid, cms] of Object.entries(D.pacHistory)) for (const [cm, arr] of Object.entries(cms)) {
    let t = 0; for (let i = 0; i < arr.length; i += 2) if (String(arr[i]).slice(0, 4) === ys) t += arr[i + 1];
    if (!t) continue;
    if (!givenTo.has(pid)) givenTo.set(pid, {}); givenTo.get(pid)[cm] = t;
    if (!givenBy.has(cm)) givenBy.set(cm, {}); givenBy.get(cm)[pid] = t;
  }
  for (const [pid, cms] of Object.entries(D.ieYear)) for (const [cm, yrs] of Object.entries(cms)) {
    const v = yrs[ys]; if (!v) continue;
    if (!ieP.has(pid)) ieP.set(pid, { for: {}, against: {} });
    if (v[0]) { ieP.get(pid).for[cm] = v[0]; if (!ieFor.has(cm)) ieFor.set(cm, {}); ieFor.get(cm)[pid] = v[0]; }
    if (v[1]) { ieP.get(pid).against[cm] = v[1]; if (!ieAg.has(cm)) ieAg.set(cm, {}); ieAg.get(cm)[pid] = v[1]; }
  }
  const ind = new Map(), byInd = new Map();
  for (const [pid, cms] of givenTo) {
    const p = D.byId.get(pid); if (!p) continue; const bi = {};
    for (const [cm, amt] of Object.entries(cms)) {
      const k = D.industryOf(cm); if (!k) continue; bi[k] = (bi[k] || 0) + amt;
      const t = ind.get(k) || { id: k, total: 0, D: 0, R: 0, I: 0, recipients: {} };
      t.total += amt; t[p.party === 'R' ? 'R' : p.party === 'D' ? 'D' : 'I'] += amt; t.recipients[pid] = (t.recipients[pid] || 0) + amt; ind.set(k, t);
    }
    byInd.set(pid, Object.entries(bi).sort((a, b) => b[1] - a[1]));
  }
  const v = { y, cycle: cycleOf(y), givenTo, givenBy, ieFor, ieAg, ieP, ind, byInd };
  viewCache.set(key, v); return v;
}
const topOf = (o, n) => Object.entries(o || {}).sort((a, b) => b[1] - a[1]).slice(0, n).map(([id, amt]) => ({ id, amt }));
// money raised by source, all cycles or one cycle
function sources(p, cy) {
  const s = { indiv: 0, pac: 0, party: 0, self: 0, receipts: 0 };
  for (const [y, c] of Object.entries((p.money && p.money.cycles) || {})) { if (cy && +y !== cy) continue; for (const k of Object.keys(s)) s[k] += c[k] || 0; }
  s.other = Math.max(0, s.receipts - s.indiv - s.pac - s.party - s.self);
  return s;
}
const shareOf = (p, amt, cy) => { const r = sources(p, cy).receipts; return r > 0 ? (amt / r * 100 < 0.1 ? '<0.1%' : (amt / r * 100).toFixed(amt / r < 0.01 ? 2 : 1) + '%') : ''; };
function sourcesPie(p, cy) {
  const s = sources(p, cy); if (!(s.receipts > 0)) return '';
  const parts = [['indiv', 'Individuals'], ['pac', 'PACs'], ['party', 'Party committees'], ['self', 'Self-funded'], ['other', 'Other receipts']].filter(([k]) => s[k] > 0);
  const tot = parts.reduce((a, [k]) => a + s[k], 0); const R = 70, r = 42, C = 80;
  let a0 = -Math.PI / 2;
  const arcs = parts.map(([k]) => {
    const f = s[k] / tot; if (f >= 0.9999) return `<circle cx="${C}" cy="${C}" r="${(R + r) / 2}" fill="none" stroke-width="${R - r}" class="ms-${k}"/>`;
    const a1 = a0 + f * 2 * Math.PI; const big = f > 0.5 ? 1 : 0;
    const pt = (rad, a) => `${(C + rad * Math.cos(a)).toFixed(2)},${(C + rad * Math.sin(a)).toFixed(2)}`;
    const d = `M${pt(R, a0)}A${R},${R} 0 ${big} 1 ${pt(R, a1)}L${pt(r, a1)}A${r},${r} 0 ${big} 0 ${pt(r, a0)}Z`; a0 = a1;
    return `<path d="${d}" class="ms-${k}"/>`;
  }).join('');
  return `<h3>Where the money comes from${cy ? `, ${cyLabel(cy)} cycle` : ''}</h3><div class="pie"><svg viewBox="0 0 160 160" role="img" aria-label="Sources of campaign money">${arcs}<text x="${C}" y="${C - 2}" text-anchor="middle" class="pie-n">${money(s.receipts)}</text><text x="${C}" y="${C + 14}" text-anchor="middle" class="pie-l">${cy ? cyLabel(cy) : 'since 2021'}</text></svg>
  <ul class="pie-k">${parts.map(([k, l]) => `<li><i class="m-${k}"></i><span>${l}</span><b>${s[k] / tot < 0.001 ? '<0.1' : (s[k] / tot * 100).toFixed(1)}%</b><small>${money(s[k])}</small></li>`).join('')}</ul></div>`;
}
// one member's history with one PAC
function pacHist(pid, cm) {
  const h = (D.pacHistory[pid] || {})[cm]; if (!h) return [];
  const out = []; for (let i = 0; i < h.length; i += 2) { const d = String(h[i]); out.push({ date: d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : null, amt: h[i + 1] }); }
  return out;
}
function pacCell(p, f) { return `<a href="/f/${f.slug}">${leanDot(f.id)}${esc(nice(f.name))}</a>${histDetails(p.id, f.id)}`; }
function histDetails(pid, cm) {
  const h = pacHist(pid, cm);
  const byCy = {}; for (const x of h) { const y = x.date ? +x.date.slice(0, 4) : null; const cy = y ? y + (y % 2) : 'Undated'; byCy[cy] = (byCy[cy] || 0) + x.amt; }
  if (!h.length) return '';
  const yrs = h.filter(x => x.date).map(x => x.date.slice(0, 4));
  return `<details class="ph-hist"><summary>${h.length} contribution${h.length === 1 ? '' : 's'}${yrs.length ? `, ${yrs[0] === yrs[yrs.length - 1] ? yrs[0] : `${yrs[0]} to ${yrs[yrs.length - 1]}`}` : ''}</summary>
    <p class="cyt">${Object.entries(byCy).map(([cy, a]) => `<span>${typeof cy === 'string' && cy === 'Undated' ? 'Undated' : `${cy - 1}-${String(cy).slice(2)}`}: <b>${money(a, true)}</b></span>`).join('')}</p>
    <ol class="tx">${h.slice().reverse().map(x => `<li><time>${x.date ? date(x.date) : 'Undated'}</time><b>${money(x.amt, true)}</b></li>`).join('')}</ol></details>`;
}
function moneySec(p, y, base = href(p), anchor = '#money', full = false) {
  const m = p.money; if (!m) return '';
  const V = y ? view(y) : null, cy = y ? cycleOf(y) : null;
  const cycles = Object.entries(m.cycles).filter(([c]) => !cy || +c === cy).sort((a, b) => b[0] - a[0]);
  const max = Math.max(...cycles.map(([, c]) => c.receipts), 1);
  // The money tab's own page lists every PAC; the profile shows the top 25 and links there.
  const pacs = full ? topOf(y ? V.givenTo.get(p.id) : D.givenTo.get(p.id), Infinity) : y ? topOf(V.givenTo.get(p.id), 25) : m.topPacs;
  const pacTotal = y ? Object.values(V.givenTo.get(p.id) || {}).reduce((a, b) => a + b, 0) : m.pacTotal;
  const pacCount = y ? Object.keys(V.givenTo.get(p.id) || {}).length : m.pacCount;
  const ind = (y ? V.byInd.get(p.id) || [] : m.byIndustry || []).slice(0, 8);
  const indMax = ind.length ? ind[0][1] : 1;
  const ieF = y ? topOf((V.ieP.get(p.id) || {}).for, 10) : m.ieFor, ieA = y ? topOf((V.ieP.get(p.id) || {}).against, 10) : m.ieAgainst;
  const when = y ? `in ${y}` : 'since 2021';
  return `<h2>Money</h2>
  ${yearNav(base, y, anchor)}
  <p class="sub">Campaign committee receipts reported to the FEC. Cycles run two years, ending on Election Day${y ? `; ${y} falls in the ${cyLabel(cy)} cycle` : ''}.</p>
  ${cycles.length ? `<div class="cyc">${cycles.map(([cyc, c]) => `<div class="cy"><div class="cy-h"><b>${cyLabel(+cyc)}</b><span>${money(c.receipts)} raised${c.through ? `, through ${date(c.through)}` : ''}</span></div>
    <div class="stack" style="width:${Math.max(2, c.receipts / max * 100).toFixed(1)}%" aria-hidden="true">${[['indiv', 'Individuals'], ['pac', 'PACs'], ['party', 'Party'], ['self', 'Self']].map(([k]) => c[k] > 0 ? `<i class="m-${k}" style="flex:${c[k]}"></i>` : '').join('')}</div>
    <p class="cy-k"><span><i class="m-indiv"></i>Individuals ${money(c.indiv)}</span><span><i class="m-pac"></i>PACs ${money(c.pac)}</span>${c.party ? `<span><i class="m-party"></i>Party ${money(c.party)}</span>` : ''}${c.self ? `<span><i class="m-self"></i>Self-funded ${money(c.self)}</span>` : ''}<span>Cash on hand ${money(c.cash)}</span></p></div>`).join('')}</div>` : ''}
  ${sourcesPie(p, cy)}
  ${ind.length ? `<h3>Top industries</h3><p class="sub">PAC contributions ${when}, grouped by the industry behind each PAC.</p><ul class="hbars">${ind.map(([id, amt]) => `<li><a href="/industry/${id}${y ? '?year=' + y : ''}">${esc(D.indName.get(id))}</a><span class="hb"><i style="width:${(amt / indMax * 100).toFixed(1)}%"></i></span><b>${money(amt)}</b></li>`).join('')}</ul>` : ''}
  ${pacs.length ? `<h3 id="pacs">${full ? 'PAC donors' : 'Top PAC donors'}</h3><p class="sub">${pacCount} PACs gave ${money(pacTotal)} ${when}. Share is each PAC's part of everything ${esc(p.name)} raised ${cy ? `in the ${cyLabel(cy)} cycle` : 'since 2021'}. Open a row for every contribution.${full && pacCount > pacs.length ? ` ${(pacCount - pacs.length).toLocaleString('en-US')} more PAC${pacCount - pacs.length === 1 ? '' : 's'} gave less than $1,000 to all of Congress combined and ${pacCount - pacs.length === 1 ? 'is' : 'are'} not listed.` : ''}</p>
  <div class="tbl"><table class="pacs"><thead><tr><th>PAC</th><th>Connected to</th><th class="n">Given</th><th class="n">Share</th></tr></thead><tbody>${pacs.map(x => ({ ...x, f: D.funders.get(x.id) })).filter(x => x.f).map(x => `<tr><td>${pacCell(p, x.f)}</td><td>${esc(nice(x.f.org) || '')}<small class="kd">${esc(x.f.kind)}</small></td><td class="n">${money(x.amt, true)}</td><td class="n">${shareOf(p, x.amt, cy)}</td></tr>`).join('')}</tbody></table></div>
  ${!full && pacCount > pacs.length ? `<p><a class="more" href="${href(p)}/money${y ? '?year=' + y : ''}#pacs">All ${pacCount.toLocaleString('en-US')} PACs</a></p>` : ''}` : ''}
  ${ieF.length || ieA.length ? `<h3>Outside spending ${when}</h3><div class="two">
    ${ieF.length ? `<div><h4>Spent to help them</h4><ol class="rank sm">${ieF.slice(0, 6).map(x => fundRow(x)).join('')}</ol></div>` : ''}
    ${ieA.length ? `<div><h4>Spent to defeat them</h4><ol class="rank sm">${ieA.slice(0, 6).map(x => fundRow(x)).join('')}</ol></div>` : ''}</div>` : ''}
  ${y && !cycles.length && !pacs.length && !ieF.length && !ieA.length ? `<p class="sub">No FEC money records for ${esc(p.name)} in ${y}.</p>` : ''}`;
}
function fundRow(x) { const f = D.funders.get(x.id); return f ? `<li><a href="/f/${f.slug}">${leanDot(f.id)}<b>${esc(nice(f.name))}</b><small>${esc(f.kind)}</small></a><b class="amt">${money(x.amt)}</b></li>` : ''; }

function electionsSec(p) {
  const e = p.elections || [], pr = p.primaries || [];
  if (!e.length && !pr.length) return '';
  const pts = [...e].reverse().filter(x => x.pct != null && !x.special);
  const minY = Math.min(...pts.map(x => x.year)), maxY = Math.max(...pts.map(x => x.year));
  const W = 640, Hh = 180, pad = 34;
  const X = y => pad + (maxY === minY ? (W - 2 * pad) / 2 : (y - minY) / (maxY - minY) * (W - 2 * pad));
  const Y = v => Hh - 24 - (v - 0.2) / 0.8 * (Hh - 44);
  const chart = pts.length > 1 ? `<svg class="echart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Vote share by election year">
    <line x1="${pad}" x2="${W - pad}" y1="${Y(0.5)}" y2="${Y(0.5)}" class="ln50"/><text x="${pad - 6}" y="${Y(0.5) + 4}" class="tk" text-anchor="end">50%</text>
    <polyline points="${pts.map(x => `${X(x.year).toFixed(1)},${Y(Math.max(0.2, x.pct)).toFixed(1)}`).join(' ')}" class="lnp p${p.party}"/>
    ${pts.map((x, i) => `<circle cx="${X(x.year).toFixed(1)}" cy="${Y(Math.max(0.2, x.pct)).toFixed(1)}" r="4.5" class="f${p.party}"/>${i % Math.ceil(pts.length / 9) === 0 || i === pts.length - 1 ? `<text x="${X(x.year).toFixed(1)}" y="${Hh - 6}" class="tk" text-anchor="middle">${x.year}</text>` : ''}`).join('')}
  </svg>` : '';
  const seat = x => (x.chamber === 'S' ? 'Senate' : 'House ' + x.state + '-' + (x.district || 'AL')) + (x.special ? ' special' : '');
  const PRIM = { D: 'Democratic primary', R: 'Republican primary' };
  const primLabel = x => (PRIM[x.party] || (x.state === 'AK' ? 'Top-four primary' : 'Top-two primary')) + ', ' + seat(x);
  const general = e.length ? `<h3>General elections</h3>${chart}
  <div class="tbl"><table><thead><tr><th>Year</th><th>Race</th><th class="n">Share</th><th>Opponent</th><th>Result</th></tr></thead><tbody>
  ${e.map(x => `<tr><td>${x.year}</td><td>${seat(x)}</td><td class="n">${x.pct != null ? pct(x.pct, 1) : ''}</td><td>${x.uncontested ? 'Unopposed' : x.opponent ? `${esc(x.opponent.name)} (${esc(x.opponent.party || '')})${x.opponent.pct != null ? ', ' + pct(x.opponent.pct, 1) : ''}` : ''}</td><td>${x.won ? 'Won' : 'Lost'}${x.runoff ? ' runoff' : ''}${x.raceId && x.year === 2026 ? ` <a href="/2026/race/${x.raceId}/">results</a>` : ''}</td></tr>`).join('')}
  </tbody></table></div>` : '';
  const primaries = pr.length ? `<h3>Primaries</h3>
  <div class="tbl"><table><thead><tr><th>Year</th><th>Race</th><th class="n">Share</th><th>Top rival</th><th>Result</th></tr></thead><tbody>
  ${pr.map(x => `<tr><td>${x.year}</td><td>${primLabel(x)}</td><td class="n">${x.pct != null && !x.uncontested ? pct(x.pct, 1) + (x.runoffPct != null ? `<br><small>runoff ${pct(x.runoffPct, 1)}</small>` : '') : ''}</td><td>${x.uncontested ? 'Unopposed' : x.opponent ? `${esc(x.opponent.name)}${x.party === 'T2' && x.opponent.party ? ` (${esc(x.opponent.party)})` : ''}${x.opponent.pct != null ? ', ' + pct(x.opponent.pct, 1) : ''}${x.field > 2 ? `<br><small>${x.field} candidates</small>` : ''}` : ''}</td><td>${x.won ? (x.party === 'T2' ? 'Advanced' : 'Won') : 'Lost'}${x.runoffPct != null ? ' runoff' : ''}</td></tr>`).join('')}
  </tbody></table></div>` : '';
  return `<h2>Elections</h2>${general}${primaries}${raceSpendersSec(p)}`;
}

function billsSec(p, full) {
  const bm = D.bills && D.bills.byMember[p.id]; if (!bm || !bm.sponsored.length) return '';
  const all = bm.sponsored.map(k => [k, D.bills.bills[k]]).filter(([, b]) => b).sort((a, b) => (b[1].law - a[1].law) || (b[1].cosponsors - a[1].cosponsors)), list = full ? all : all.slice(0, 10);
  const areas = {}; for (const k of bm.sponsored) { const a = D.bills.bills[k] && D.bills.bills[k].policyArea; if (a) areas[a] = (areas[a] || 0) + 1; }
  const topAreas = Object.entries(areas).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return `<h2>Bills</h2><p class="sub">${bm.sponsored.length} sponsored and ${bm.cosponsored.length} cosponsored in the 119th Congress.</p>
  ${topAreas.length ? `<p class="tags">${topAreas.map(([a, n]) => `<a href="/issue/${slugIssue(a)}">${esc(a)} <b>${n}</b></a>`).join('')}</p>` : ''}
  <ul class="blist">${list.map(([k, b]) => `<li><a href="/bill/${k}"><span class="bl">${billLabel(k)}</span><b>${esc(b.short || b.title)}</b><small>${b.law ? 'Became law. ' : ''}${esc(b.latest ? b.latest.text : '')}${b.cosponsors ? ` ${b.cosponsors} cosponsors.` : ''}</small></a></li>`).join('')}</ul>${full ? (bm.cosponsored.length ? `<h3>Cosponsored</h3><ul class="blist">${bm.cosponsored.map(k => [k, D.bills.bills[k]]).filter(([, b]) => b).map(([k, b]) => `<li><a href="/bill/${k}"><span class="bl">${billLabel(k)}</span><b>${esc(b.short || b.title)}</b><small>${b.law ? 'Became law. ' : ''}${esc(b.latest ? b.latest.text : '')}</small></a></li>`).join('')}</ul>` : '') : all.length > 10 || bm.cosponsored.length ? `<p><a class="more" href="${href(p)}/bills">All ${bm.sponsored.length} sponsored and ${bm.cosponsored.length} cosponsored bills</a></p>` : ''}`;
}
const clip = (t, n = 158) => t.length > n ? t.slice(0, t.lastIndexOf(' ', n - 1)) + '…' : t;
const slugIssue = a => a.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function speechesSec(p, full) {
  const sp = D.speeches && D.speeches.byMember[p.id]; if (!sp || !sp.count) return '';
  const n = full ? sp.items.length : 8;
  return `<h2>Speeches</h2><p class="sub">${sp.count} floor speeches in the Congressional Record this Congress.</p>
  <ul class="slist">${sp.items.slice(0, n).map(s => `<li><a href="${esc(s.url)}" rel="noopener"><b>${esc(s.title)}</b><small>${esc(s.chamber)}, ${date(s.date)}</small>${s.excerpt ? `<q>${esc(s.excerpt)}</q>` : ''}</a></li>`).join('')}</ul>
  ${!full && sp.items.length > 8 ? `<p><a class="more" href="${href(p)}/speeches">All speeches</a></p>` : ''}`;
}

const KIND = { ethics: 'Ethics', legal: 'Legal', censure: 'Censure', investigation: 'Investigation', 'campaign-finance': 'Campaign finance', 'stock-trading': 'Stock trading', other: 'Other' };
function recordSec(p) {
  const r = D.record && D.record.byPerson[p.id]; if (!r || !r.length) return '';
  return `<h2>Record</h2><ul class="rec">${r.map(x => `<li><p class="rec-k"><span class="kind">${esc(KIND[x.kind] || x.kind)}</span>${x.status ? `<span class="st">${esc(x.status)}</span>` : ''}<time>${esc(x.date)}</time></p><h3>${esc(x.title)}</h3><p>${esc(x.summary)}</p><p class="poll-src">${x.sources.map(s => `<a href="${esc(s.url)}" rel="noopener">${esc(s.name)}</a>`).join(' ')}</p></li>`).join('')}</ul>`;
}

function connectionsSec(p) {
  const like = (p.votesLike || []).map(x => [D.byId.get(x.id), x.agree]).filter(([q]) => q);
  const cross = (p.crossParty || []).map(x => [D.byId.get(x.id), x.agree]).filter(([q]) => q);
  const sd = (p.sharedDonors || []).map(x => [D.byId.get(x.id), x]).filter(([q]) => q);
  if (!like.length && !sd.length) return '';
  return `<h2>Connections</h2>
  <div class="two">
   ${like.length ? `<div><h3>Votes most like</h3><ol class="rank sm">${like.map(([q, a]) => `<li>${personLink(q)}<b class="amt">${pct(a, 1)}</b></li>`).join('')}</ol></div>` : ''}
   ${sd.length ? `<div><h3>Shares the most donors with</h3><ol class="rank sm">${sd.map(([q, x]) => `<li>${personLink(q)}<b class="amt">${x.shared} PACs</b></li>`).join('')}</ol></div>` : ''}
   ${cross.length ? `<div><h3>Closest across the aisle</h3><ol class="rank sm">${cross.map(([q, a]) => `<li>${personLink(q)}<b class="amt">${pct(a, 1)}</b></li>`).join('')}</ol></div>` : ''}
  </div>
  <p><a class="btn" href="${href(p)}/network">Open the money and votes network</a></p>`;
}

function rail(p) {
  const out = [];
  const facts = [];
  if (p.birthday) facts.push(['Born', date(p.birthday, { month: 'long', day: 'numeric', year: 'numeric' })]);
  if (p.office) facts.push(['Washington office', p.office]);
  if (p.phone) facts.push(['Phone', p.phone]);
  if (p.terms && p.terms.length && p.status !== 'elect') {
    const h = p.terms.filter(t => t.type === 'rep'), s = p.terms.filter(t => t.type === 'sen');
    if (s.length) facts.push(['Senate service', `${s[0].start.slice(0, 4)} to present`]);
    if (h.length) facts.push(['House service', `${h[0].start.slice(0, 4)} to ${p.chamber === 'H' ? 'present' : h[h.length - 1].end.slice(0, 4)}`]);
  }
  if (facts.length) out.push(`<section><h2>Facts</h2><dl class="kv">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></section>`);
  const cm = (p.committees || []).filter(c => !c.parent);
  if (cm.length) out.push(`<section><h2><a href="/committees">Committees</a></h2><ul class="plain">${cm.map(c => `<li><a href="/committee/${c.id.toLowerCase()}">${esc(c.name.replace(/^(House|Senate) Committee on /, '').replace(/^(Senate|House) /, ''))}</a>${c.title ? `, <b>${esc(c.title)}</b>` : ''}${(p.committees || []).filter(x => x.parent === c.id).length ? `<br><small>${(p.committees || []).filter(x => x.parent === c.id).map(x => `<a href="/committee/${x.id.toLowerCase()}">${esc(x.name)}</a>`).join(', ')}</small>` : ''}</li>`).join('')}</ul></section>`);
  const links = [];
  if (p.status !== 'elect') links.push(['Congress.gov', `https://www.congress.gov/member/${p.id}`]);
  for (const f of (p.ids && p.ids.fec) || p.fec || []) links.push([`FEC ${f}`, `https://www.fec.gov/data/candidate/${f}/`]);
  if (p.ids && p.ids.wikipedia) links.push(['Wikipedia', 'https://en.wikipedia.org/wiki/' + encodeURIComponent(p.ids.wikipedia.replace(/ /g, '_'))]);
  if (p.ids && p.ids.ballotpedia) links.push(['Ballotpedia', 'https://ballotpedia.org/' + encodeURIComponent(p.ids.ballotpedia.replace(/ /g, '_'))]);
  if (p.ids && p.ids.govtrack) links.push(['GovTrack', `https://www.govtrack.us/congress/members/${p.ids.govtrack}`]);
  if (p.ids && p.ids.cspan) links.push(['C-SPAN', `https://www.c-span.org/person/?${p.ids.cspan}`]);
  const so = p.social || {};
  if (so.twitter) links.push(['X', `https://x.com/${so.twitter}`]);
  if (so.facebook) links.push(['Facebook', `https://www.facebook.com/${so.facebook}`]);
  if (so.instagram) links.push(['Instagram', `https://www.instagram.com/${so.instagram}`]);
  if (so.youtube_id) links.push(['YouTube', `https://www.youtube.com/channel/${so.youtube_id}`]);
  if (links.length) out.push(`<section><h2>Elsewhere</h2><ul class="plain links">${links.map(([l, u]) => `<li><a href="${esc(u)}" rel="noopener">${esc(l)}</a></li>`).join('')}</ul></section>`);
  const off = p.districtOffices || [];
  if (off.length) out.push(`<section><h2>Offices at home</h2><ul class="plain">${off.slice(0, 6).map(o => `<li><b>${esc(o.city)}</b><br>${esc(o.address)}${o.phone ? `<br>${esc(o.phone)}` : ''}</li>`).join('')}</ul></section>`);
  const same = (D.states[p.state] || []).filter(q => q.id !== p.id && q.status !== 'elect' && (q.chamber === 'S' || p.chamber === 'S' || true)).sort((a, b) => (a.chamber === 'S' ? 0 : 1) - (b.chamber === 'S' ? 0 : 1)).slice(0, 6);
  if (same.length) out.push(`<section><h2><a href="/state/${p.state.toLowerCase()}">${esc(D.STATES[p.state])} delegation</a></h2><ul class="plain ppl">${same.map(q => `<li>${personLink(q)}</li>`).join('')}</ul></section>`);
  return out.join('');
}

// full vote history
function votesFull(p, page) {
  if (!p.votes) return '';
  const rolls = D.recentRolls[p.chamber].filter(rc => codeFor(p, rc) != null && (codeFor(p, rc) !== '0' || wasIn(p, rc)));
  const per = 100, pages = Math.ceil(rolls.length / per); page = Math.min(Math.max(1, page), pages || 1);
  const list = rolls.slice((page - 1) * per, page * per);
  const party = p.party === 'I' ? (p.caucus || 'D') : p.party;
  return `<h2>Votes</h2><p class="sub">${rolls.length} roll calls in the 119th Congress, newest first. Amber marks a vote against the majority of their party on a party-line roll call.</p>
  <ul class="vlist">${list.map(rc => { const c = codeFor(p, rc); return vrow(rc, c, rc.partyLine && (c === 'Y' || c === 'N') && c !== rc.partyPos[party]); }).join('')}</ul>
  ${pager(`${href(p)}/votes`, page, pages)}`;
}
function pager(base, page, pages) {
  if (pages <= 1) return '';
  const u = n => `${base}${base.includes('?') ? '&' : '?'}page=${n}`;
  return `<nav class="pager" aria-label="Pages">${page > 1 ? `<a href="${u(page - 1)}">Newer</a>` : '<span></span>'}<span>Page ${page} of ${pages}</span>${page < pages ? `<a href="${u(page + 1)}">Older</a>` : '<span></span>'}</nav>`;
}

// network page (client renders the graph from /api/graph)
function network(p) {
  const body = `<div class="wrap"><p class="crumb"><a href="${href(p)}">${esc(p.name)}</a></p><h1>${esc(p.name)}: money and votes network</h1>
  <p class="sub">PACs that fund ${esc(p.name)}, the colleagues those same PACs fund, and the members who vote most alike. Line weight follows dollars or vote agreement. Select any circle to open it.</p>
  <div class="net-tools seg" role="group" aria-label="Show"><button type="button" aria-pressed="true" data-net="all">Money and Votes</button><button type="button" aria-pressed="false" data-net="money">Money</button><button type="button" aria-pressed="false" data-net="votes">Votes</button></div>
  <div class="net" id="net" data-id="${p.id}" role="img" aria-label="Network graph"></div>
  <p class="ch-key"><span><i class="fD"></i>Democrat</span><span><i class="fR"></i>Republican</span><span><i class="fI"></i>Independent</span><span><i class="fPac"></i>PAC</span></p></div>`;
  return layout({ title: `${title(p)} ${p.name}: money and votes network`, desc: `The PACs that fund ${p.name} (${short(p)}), the other members those PACs fund, and the colleagues who vote most like them, as an interactive network.`, path: `${href(p)}/network`, body, active: '/members', scripts: '<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script><script src="/c/net.js?v=4" defer></script>' });
}
function graph(p) {
  const nodes = new Map(); const links = [];
  const addP = (q, center) => { if (!nodes.has(q.id)) nodes.set(q.id, { id: q.id, t: 'p', name: q.name, party: q.party, label: short(q), url: href(q), img: H.hasPortrait(q) ? `/portraits/s/${q.id}.webp` : null, center: !!center }); };
  addP(p, true);
  const pacs = (p.money ? p.money.topPacs.slice(0, 10) : []).map(x => D.funders.get(x.id)).filter(Boolean);
  for (const f of pacs) {
    nodes.set(f.id, { id: f.id, t: 'f', name: nice(f.name), label: f.kind, url: `/f/${f.slug}` });
    links.push({ s: p.id, t: f.id, w: f.given[p.id], k: 'money' });
  }
  for (const x of (p.sharedDonors || []).slice(0, 6)) {
    const q = D.byId.get(x.id); if (!q) continue; addP(q);
    for (const f of pacs) if (f.given[q.id]) links.push({ s: q.id, t: f.id, w: f.given[q.id], k: 'money' });
  }
  for (const x of [...(p.votesLike || []).slice(0, 5), ...(p.crossParty || []).slice(0, 3)]) {
    const q = D.byId.get(x.id); if (!q) continue; addP(q); links.push({ s: p.id, t: q.id, w: x.agree, k: 'votes' });
  }
  return { nodes: [...nodes.values()], links };
}

// ---------------- lists ----------------
function members(q) {
  const ch = q.get('chamber'), pty = q.get('party'), st = (q.get('state') || '').toUpperCase(), status = q.get('status');
  let list = D.people.filter(p => p.status !== 'elect');
  if (ch === 'H' || ch === 'S') list = list.filter(p => p.chamber === ch);
  if (['D', 'R', 'I'].includes(pty)) list = list.filter(p => p.party === pty);
  if (D.STATES[st]) list = list.filter(p => p.state === st);
  if (status === 'leaving') list = list.filter(p => p.status === 'leaving');
  const sort = q.get('sort') || 'name';
  const sorters = {
    name: (a, b) => a.last.localeCompare(b.last),
    since: (a, b) => (a.since || '').localeCompare(b.since || ''),
    state: (a, b) => a.state.localeCompare(b.state) || (a.chamber === 'S' ? -1 : 1) || (a.district || 0) - (b.district || 0),
    unity: (a, b) => (a.votes?.unity ?? 2) - (b.votes?.unity ?? 2),
    missed: (a, b) => (b.votes?.missedPct ?? -1) - (a.votes?.missedPct ?? -1),
    raised: (a, b) => (lastCycle(b)?.receipts ?? -1) - (lastCycle(a)?.receipts ?? -1),
    ideology: (a, b) => (a.nominate ?? 0) - (b.nominate ?? 0)
  };
  list.sort(sorters[sort] || sorters.name);
  const qs = (k, v) => { const u = new URLSearchParams(q); if (v == null) u.delete(k); else u.set(k, v); u.delete('page'); const s = u.toString(); return '/members' + (s ? '?' + s : ''); };
  const filt = (k, opts) => `<div class="seg sm" role="group" aria-label="${k}">${opts.map(([v, l]) => `<a href="${qs(k, v)}" aria-pressed="${(q.get(k) || null) === v}">${l}</a>`).join('')}</div>`;
  const th = (k, l, n) => `<th${n ? ' class="n"' : ''}><a href="${qs('sort', k)}"${sort === k ? ' aria-current="true"' : ''}>${l}</a></th>`;
  const body = `<div class="wrap"><h1>Members of the 119th Congress</h1>
  <div class="filters">${filt('chamber', [[null, 'Both'], ['H', 'House'], ['S', 'Senate']])}${filt('party', [[null, 'All Parties'], ['D', 'Democrats'], ['R', 'Republicans'], ['I', 'Independents']])}${filt('status', [[null, 'Everyone'], ['leaving', 'Leaving office']])}
  <form class="stf" action="/members"><label for="st" class="vh">State</label><select id="st" name="state" data-autosubmit><option value="">All states</option>${Object.entries(D.STATES).map(([k, v]) => `<option value="${k}"${st === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>${['chamber', 'party', 'status', 'sort'].filter(k => q.get(k)).map(k => `<input type="hidden" name="${k}" value="${esc(q.get(k))}">`).join('')}<noscript><button>Show</button></noscript></form></div>
  <p class="sub">${list.length} members</p>
  <div class="tbl"><table class="mtable"><thead><tr>${th('name', 'Member')}${th('since', 'Since')}${th('ideology', 'Voting score', 1)}${th('unity', 'With party', 1)}${th('missed', 'Missed', 1)}${th('raised', 'Raised this cycle', 1)}</tr></thead><tbody>
  ${list.map(p => `<tr><td>${personLink(p, p.status === 'leaving' ? ', leaving' : '')}</td><td>${p.since ? p.since.slice(0, 4) : ''}</td><td class="n">${p.nominate != null ? p.nominate.toFixed(2) : ''}</td><td class="n">${pct(p.votes?.unity, 1)}</td><td class="n">${pct(p.votes?.missedPct, 1)}</td><td class="n">${money(lastCycle(p)?.receipts)}</td></tr>`).join('')}
  </tbody></table></div><p class="sub">Voting score is DW-NOMINATE from Voteview, from -1 (most liberal) to +1 (most conservative).</p></div>`;
  return layout({ title: 'Members of Congress', desc: 'Every senator and representative with voting record, party loyalty, attendance and fundraising.', path: '/members', body, active: '/members' });
}

function stateP(st) {
  const ms = (D.states[st] || []); if (!ms.length) return null;
  const cur = ms.filter(p => p.status !== 'elect');
  const sen = cur.filter(p => p.chamber === 'S'), rep = cur.filter(p => p.chamber === 'H').sort((a, b) => a.district - b.district);
  const inc = [...ms.filter(p => p.status === 'elect'), ...D.people.filter(p => p.elect && p.elect.state === st)];
  const body = `<div class="wrap"><h1>${esc(D.STATES[st])} in Congress</h1>
  <h2>Senators</h2><ul class="cards">${sen.map(p => `<li>${personLink(p, statusTag(p))}</li>`).join('')}</ul>
  <h2>Representatives</h2><ul class="cards">${rep.map(p => `<li>${personLink(p, statusTag(p))}</li>`).join('')}</ul>
  ${inc.length ? `<h2>Members-elect</h2><ul class="faces">${inc.map(p => `<li>${electCard(p)}</li>`).join('')}</ul>` : ''}</div>`;
  return layout({ title: `${D.STATES[st]} congressional delegation`, desc: `${D.STATES[st]}'s ${sen.length} senators and ${rep.length} representatives${inc.length ? ` plus ${inc.length} members-elect` : ''}: votes, money, elections and records for each.`, path: `/state/${st.toLowerCase()}`, body, active: '/members' });
}
const statusTag = p => p.status === 'leaving' ? ', leaving' : p.elect ? `, ${p.elect.chamber === 'S' ? 'senator' : 'rep.'}-elect` : '';

function incoming() {
  const el = [...D.people.filter(p => p.status === 'elect'), ...D.people.filter(p => p.elect)];
  const S = el.filter(p => (p.elect || p).chamber === 'S'), Hh = el.filter(p => (p.elect || p).chamber === 'H').sort((a, b) => (a.elect || a).state.localeCompare((b.elect || b).state));
  const leaving = D.people.filter(p => p.status === 'leaving');
  const lost = leaving.filter(p => p.race2026 && p.race2026.ran), retiring = leaving.filter(p => !(p.race2026 && p.race2026.ran));
  const cnt = (l, pt) => l.filter(p => (p.elect || p).party === pt).length;
  const body = `<div class="wrap"><h1>The incoming 120th Congress</h1>
  <p class="lede">Members-elect won on November 3, 2026 and take office January 3, 2027.</p>
  <h2>New senators <span class="cnt">${S.length}: ${cnt(S, 'D')} D, ${cnt(S, 'R')} R${cnt(S, 'I') ? `, ${cnt(S, 'I')} I` : ''}</span></h2><ul class="faces">${S.map(p => `<li>${electCard(p)}</li>`).join('')}</ul>
  <h2>New representatives <span class="cnt">${Hh.length}: ${cnt(Hh, 'D')} D, ${cnt(Hh, 'R')} R</span></h2><ul class="faces">${Hh.map(p => `<li>${electCard(p)}</li>`).join('')}</ul>
  <div class="two"><div><h2>Lost re-election <span class="cnt">${lost.length}</span></h2><ul class="plain ppl">${lost.map(p => `<li>${personLink(p)}</li>`).join('')}</ul></div>
  <div><h2>Retiring or ran for another office <span class="cnt">${retiring.length}</span></h2><ul class="plain ppl">${retiring.map(p => `<li>${personLink(p)}</li>`).join('')}</ul></div></div></div>`;
  return layout({ title: 'The incoming 120th Congress', desc: 'Every senator-elect and representative-elect from the 2026 midterms, and the members leaving office.', path: '/incoming', body, active: '/incoming' });
}

// ---------------- votes ----------------
function votes(q) {
  const ch = q.get('chamber'); const page = +q.get('page') || 1;
  let list = D.allRolls; if (ch === 'H' || ch === 'S') list = list.filter(r => r.chamber === ch);
  if (q.get('partyline') === '0') list = list.filter(r => !r.partyLine);
  const kind = q.get('kind'); if (KINDS.some(([k]) => k === kind)) list = list.filter(r => rcKind(r) === kind);
  const per = 40, pages = Math.ceil(list.length / per);
  const qs = (k, v) => { const u = new URLSearchParams(q); if (v == null) u.delete(k); else u.set(k, v); u.delete('page'); const s = u.toString(); return '/votes' + (s ? '?' + s : ''); };
  const body = `<div class="wrap narrow"><h1>Roll call votes</h1>
  <div class="filters"><div class="seg sm" role="group" aria-label="Chamber">${[[null, 'Both'], ['H', 'House'], ['S', 'Senate']].map(([v, l]) => `<a href="${qs('chamber', v)}" aria-pressed="${(q.get('chamber') || null) === v}">${l}</a>`).join('')}</div>
  <div class="seg sm" role="group" aria-label="Type of vote">${[[null, 'All Types'], ...KINDS].map(([v, l]) => `<a href="${qs('kind', v)}" aria-pressed="${(q.get('kind') || null) === v}">${l}</a>`).join('')}</div>
  <div class="seg sm" role="group" aria-label="Partisanship">${[[null, 'All Votes'], ['0', 'Bipartisan']].map(([v, l]) => `<a href="${qs('partyline', v)}" aria-pressed="${(q.get('partyline') || null) === v}">${l}</a>`).join('')}</div></div>
  <p class="sub">${list.length} roll calls in the 119th Congress.</p>
  <ol class="rolls">${list.slice((page - 1) * per, page * per).map(rollRow).join('')}</ol>${pager(qs('page', null), page, pages)}</div>`;
  return layout({ title: 'Roll call votes', desc: 'Every House and Senate roll call vote in the 119th Congress, with party splits, results and how each member voted.', path: '/votes', body, active: '/votes' });
}
function vote(rc) {
  const ids = D.order[rc.chamber]; const map = Object.fromEntries(ids.map((id, i) => [id, rc.codes[i]]));
  const bk = rcBillKey(rc); const b = bk && D.bills && D.bills.bills[bk];
  const groups = { Y: [], N: [], P: [], 0: [] };
  for (const [id, c] of Object.entries(map)) { const p = D.byId.get(id); if (!p || (c === '0' && !wasIn(p, rc))) continue; groups[c].push(p); }
  const byParty = pt => ['Y', 'N', 'P', '0'].map(c => groups[c].filter(p => p.party === pt).length);
  const defectors = [...groups.Y, ...groups.N].filter(p => { const pt = p.party === 'I' ? (p.caucus || 'D') : p.party; return rc.partyLine && rc.partyPos[pt] && map[p.id] !== rc.partyPos[pt]; });
  const ch = rc.chamber === 'H' ? 'House' : 'Senate';
  const body = `<div class="wrap"><p class="crumb"><a href="/votes?chamber=${rc.chamber}">${ch} votes</a></p>
  <h1>${esc(rcTitle(rc))}</h1>
  <p class="lede">${esc(rc.question)}${bk ? `, <a href="/bill/${bk}">${billLabel(bk)}</a>` : ''}. ${ch} roll call ${rc.clerk}, ${date(rc.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}. <span class="vk vk-${rcKind(rc)}">${KIND_LABEL[rcKind(rc)]} vote</span></p>
  <p class="verdict"><b class="res ${/pass|agreed|confirmed|adopted/i.test(rc.result) ? 'ok' : 'no'}">${esc(rc.result)}</b> <span>${rc.yea} yea, ${rc.nay} nay${groups.P.length ? `, ${groups.P.length} present` : ''}, ${groups[0].length} not voting. Required: ${esc(rc.req)}.</span></p>
  ${qHelp(rc.question) ? `<p class="qhelp">${esc(qHelp(rc.question))}</p>` : ''}
  <div class="cols"><div class="col-main"><figure class="vote-seats">${seatChart(rc.chamber, p => 'v' + (map[p.id] || '0'), { label: `${ch} seats colored by vote` })}<figcaption class="ch-key"><span><i class="vY"></i>Yea</span><span><i class="vN"></i>Nay</span><span><i class="vP"></i>Present</span><span><i class="v0"></i>Not voting</span></figcaption></figure></div>
  <aside class="col-side"><div class="tbl"><table><thead><tr><th>Party</th><th class="n">Yea</th><th class="n">Nay</th><th class="n"><abbr title="Present">Pres.</abbr></th><th class="n"><abbr title="Not voting">NV</abbr></th></tr></thead><tbody>
  ${['D', 'R', 'I'].filter(pt => byParty(pt).some(Boolean)).map(pt => `<tr><td>${chip({ party: pt })} ${PARTY[pt]}s</td>${byParty(pt).map(n => `<td class="n">${n}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
  ${b ? `<h2>The bill</h2><p>${esc(b.title)}</p><p class="sub">${b.policyArea ? `<a href="/issue/${slugIssue(b.policyArea)}">${esc(b.policyArea)}</a>. ` : ''}${b.latest ? `Latest action ${date(b.latest.date)}: ${esc(b.latest.text)}` : ''}</p><p><a href="${esc(b.url)}" rel="noopener">${billLabel(bk)} on Congress.gov</a></p>` : ''}</aside></div>
  ${b ? voteInProcess(rc, bk, b) : ''}
  ${defectors.length ? `<h2>Voted against their party <span class="cnt">${defectors.length}</span></h2><ul class="cards">${defectors.map(p => `<li>${personLink(p, ', ' + VOTE_WORD[map[p.id]].toLowerCase())}</li>`).join('')}</ul>` : ''}
  <h2>How every member voted</h2><div class="vgroups">${['Y', 'N', 'P', '0'].filter(c => groups[c].length).map(c => `<details${c === 'Y' || c === 'N' ? '' : ''}><summary>${VOTE_WORD[c]} <span class="cnt">${groups[c].length}</span></summary><ul class="names">${groups[c].sort((a, b) => a.state.localeCompare(b.state) || a.last.localeCompare(b.last)).map(p => `<li><a href="${href(p)}">${esc(p.name)}</a> <small>${short(p)}</small></li>`).join('')}</ul></details>`).join('')}</div></div>`;
  return layout({ title: `${rcTitle(rc)}: ${ch} vote ${rc.roll}`, desc: `${ch} roll call ${rc.roll} on ${date(rc.date)}: ${rc.question}, ${rc.result} ${rc.yea}-${rc.nay}. How every member voted.`, path: `/vote/${rc.k}`, body, active: '/votes' });
}
// ---------------- bill tracker ----------------
const STAGE_ORDER = ['introduced', 'committee', 'reported', 'passed-house', 'passed-senate', 'passed-both', 'to-president', 'law'];
function stageOf(k, b) {
  if (b.stage) return b.stage;
  const t = (b.latest && b.latest.text) || '';
  if (b.law || /Became Public Law|Signed by President/i.test(t)) return 'law';
  if (/Vetoed/i.test(t)) return 'vetoed';
  if (/Presented to President/i.test(t)) return 'to-president';
  if (/Resolving differences|Message on Senate action sent to the House|Message on House action received in Senate/i.test(t)) return 'passed-both';
  if (/Passed Senate|Agreed to in Senate|passed Senate/i.test(t)) return 'passed-senate';
  if (/Passed House|Agreed to in House|On passage Passed|passed House/i.test(t)) return 'passed-house';
  if (/Reported|Ordered to be Reported|Placed on (the )?(Union|House|Senate Legislative) Calendar/i.test(t)) return 'reported';
  if (/Referred to/i.test(t)) return 'committee';
  return 'introduced';
}
const isRes = k => /^(hres|sres)/.test(k);
const isCon = k => /^(hconres|sconres)/.test(k);
const fromSenate = k => /^s/.test(k);
function steps(k) {
  const first = fromSenate(k) ? 'Senate' : 'House', second = fromSenate(k) ? 'House' : 'Senate';
  if (isRes(k)) return [['introduced', 'Introduced'], ['committee', 'In committee'], ['reported', 'Reported'], [`passed-${first.toLowerCase()}`, `Agreed to in the ${first}`]];
  const s = [['introduced', 'Introduced'], ['committee', 'In committee'], ['reported', 'Reported'], [`passed-${first.toLowerCase()}`, `Passed the ${first}`], [`passed-${second.toLowerCase()}`, `Passed the ${second}`]];
  if (isCon(k)) return s;
  return s.concat([['to-president', 'To the President'], ['law', 'Became law']]);
}
function stageIndex(k, st) {
  const sx = steps(k).map(x => x[0]);
  if (st === 'passed-both') return sx.length > 5 ? 4 : sx.length - 1;
  if (st === 'vetoed') return 5;
  const i = sx.indexOf(st);
  if (i >= 0) return i;
  // the other chamber passed it first (e.g. a House bill the Senate passed): count the first-chamber step as done
  if (st === 'passed-house' || st === 'passed-senate') return 3;
  if (st === 'failed') return 2;
  return 0;
}
function track(k, b) {
  const st = stageOf(k, b); const sx = steps(k); const at = stageIndex(k, st);
  return `<ol class="track" aria-label="Progress of ${esc(billLabel(k))}">${sx.map(([id, l], i) => `<li class="${i < at ? 'done' : i === at ? (st === 'vetoed' ? 'stop' : st === 'failed' ? 'stop' : 'now') : ''}"><span>${esc(i === at && st === 'vetoed' ? 'Vetoed' : i === at && st === 'failed' ? 'Failed' : l)}</span></li>`).join('')}</ol>`;
}
function bill(k) {
  const b = D.bills && D.bills.bills[k]; if (!b) return null;
  const sp = D.byId.get(b.sponsor);
  const rcs = D.allRolls.filter(r => rcBillKey(r) === k);
  const acts = (b.actions || []).slice().reverse();
  const cms = (b.committees || []);
  const body = `<div class="wrap narrow"><p class="crumb"><a href="/tracker">Bill tracker</a>, ${billLabel(k)}${b.policyArea ? `, <a href="/issue/${slugIssue(b.policyArea)}">${esc(b.policyArea)}</a>` : ''}</p><h1>${esc(b.short || b.title)}</h1>
  ${b.short && b.short !== b.title ? `<p class="lede">${esc(b.title)}</p>` : ''}
  ${track(k, b)}
  <p>${b.lawNumber ? `<b>${esc(b.lawNumber)}.</b> ` : b.law ? '<b>Became law.</b> ' : ''}Introduced ${date(b.introduced)}${b.cosponsors ? ` with ${b.cosponsors} cosponsors` : ''}. ${b.latest ? `Latest action ${date(b.latest.date)}: ${esc(b.latest.text)}` : ''}</p>
  ${schedNote(k)}
  ${pmSection('Prediction markets', MKT.get().bills[k])}
  ${sp ? `<h2>Sponsor</h2><div class="cards one">${personLink(sp)}</div>` : ''}
  ${cms.length ? `<h2>Committees</h2><ul class="plain">${cms.map(c => { const id = (c.systemCode || '').toUpperCase().replace(/00$/, ''); const has = D.meta.committees[id]; return `<li>${has ? `<a href="/committee/${id.toLowerCase()}">${esc(c.name)}</a>` : esc(c.name)}${(c.activities || []).length ? `<br><small>${esc(c.activities.map(a => `${a.name} ${date((a.date || '').slice(0, 10))}`).join(', '))}</small>` : ''}</li>`; }).join('')}</ul>` : ''}
  ${rcs.length ? `<h2>Roll call votes</h2><ol class="rolls">${rcs.map(rollRow).join('')}</ol>` : ''}
  ${billStory(k, b)}
  ${b.subjects && b.subjects.length ? `<h2>Subjects</h2><p class="tags">${b.subjects.slice(0, 20).map(s => `<span>${esc(s)}</span>`).join('')}</p>` : ''}
  <p><a class="btn" href="${esc(b.url)}" rel="noopener">Read the bill on Congress.gov</a></p></div>`;
  return layout({ title: `${billLabel(k)}: ${b.short || b.title}`, desc: clip(`${billLabel(k)}, ${b.title}.${b.law ? ' Became law.' : b.latest ? ' Latest: ' + b.latest.text : ''} Sponsor, ${b.cosponsors || 0} cosponsors, votes and status.`), path: `/bill/${k}`, body, active: '/issues' });
}

// ---------------- money ----------------
function moneyP(q) {
  const y = yearOf(q), V = y ? view(y) : null, cy = y ? cycleOf(y) : null;
  const when = y ? `in ${y}` : 'since 2021';
  const cur = D.people.filter(p => p.status !== 'elect');
  const rc = p => cy ? (p.money && p.money.cycles[cy] ? p.money.cycles[cy].receipts : 0) : (lastCycle(p) ? lastCycle(p).receipts : 0);
  const raised = cur.filter(p => rc(p) > 0).sort((a, b) => rc(b) - rc(a)).slice(0, 15);
  const givenOf = f => y ? (V.givenBy.get(f.id) || {}) : f.given;
  const totalOf = f => Object.values(givenOf(f)).reduce((a, b) => a + b, 0);
  const pacs = [...D.funders.values()].map(f => [f, y ? totalOf(f) : f.total]).filter(([, t]) => t > 0).sort((a, b) => b[1] - a[1]).slice(0, 20);
  const ieOf = f => y ? Object.values(V.ieFor.get(f.id) || {}).reduce((a, b) => a + b, 0) + Object.values(V.ieAg.get(f.id) || {}).reduce((a, b) => a + b, 0) : f.ie;
  const ie = [...D.funders.values()].map(f => [f, ieOf(f)]).filter(([, t]) => t > 0).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const inds = [...(y ? V.ind : D.industryTotals).values()].sort((a, b) => b.total - a.total).slice(0, 20);
  const im = inds.length ? inds[0].total : 1;
  const body = `<div class="wrap"><h1>Money in Congress${y ? `, ${y}` : ''}</h1><p class="lede">Who funds the members of Congress, from FEC filings for the 2022, 2024 and 2026 cycles.</p>
  ${yearNav('/money', y)}
  ${inds.length ? `<h2>Industries</h2><p class="sub">PAC contributions to current members and members-elect ${when}, by industry. Bar color shows the split between Democrats and Republicans.</p><ul class="hbars ind">${inds.map(t => `<li><a href="/industry/${t.id}${y ? '?year=' + y : ''}">${esc(D.indName.get(t.id))}</a><span class="hb split" style="width:${(t.total / im * 100).toFixed(1)}%"><i class="fD" style="flex:${t.D || 0}"></i><i class="fI" style="flex:${t.I || 0}"></i><i class="fR" style="flex:${t.R || 0}"></i></span><b>${money(t.total)}</b></li>`).join('')}</ul>` : ''}
  <div class="cols"><div class="col-main">${pacs.length ? `<h2>Biggest PAC givers ${when}</h2><div class="tbl"><table><thead><tr><th>PAC</th><th>Kind</th><th class="n">To members</th><th>Split</th></tr></thead><tbody>
  ${pacs.map(([f, t]) => `<tr><td><a href="/f/${f.slug}${y ? '?year=' + y : ''}">${leanDot(f.id)}${esc(nice(f.name))}</a></td><td>${esc(f.kind)}</td><td class="n">${money(t)}</td><td>${splitBar(split(givenOf(f)))}</td></tr>`).join('')}</tbody></table></div>` : ''}</div>
  <aside class="col-side">${raised.length ? `<h2>Most raised, ${cy ? `${cyLabel(cy)} cycle` : 'this cycle'}</h2><ol class="rank">${raised.map(p => `<li>${personLink(p)}<b class="amt">${money(rc(p))}</b></li>`).join('')}</ol>` : ''}</aside></div>
  ${ie.length ? `<h2 id="outside">Biggest outside spenders ${when}</h2><p class="sub">Independent expenditures for or against current members and members-elect.</p>
  <div class="tbl"><table><thead><tr><th>Group</th><th>Kind</th><th class="n">Spent</th><th>Biggest target</th></tr></thead><tbody>
  ${ie.map(([f, amt]) => { const forO = y ? V.ieFor.get(f.id) || {} : f.ieFor, agO = y ? V.ieAg.get(f.id) || {} : f.ieAgainst; const t = Object.entries({ ...forO, ...prefix(agO) }).sort((a, b) => b[1] - a[1])[0]; const tp = t && D.byId.get(t[0].replace(/^-/, '')); return `<tr><td><a href="/f/${f.slug}${y ? '?year=' + y : ''}">${leanDot(f.id)}${esc(nice(f.name))}</a></td><td>${esc(f.kind)}</td><td class="n">${money(amt)}</td><td>${tp ? `${t[0].startsWith('-') ? 'Against' : 'For'} <a href="${href(tp)}${y ? '?year=' + y : ''}#money">${esc(tp.name)}</a>` : ''}</td></tr>`; }).join('')}</tbody></table></div>` : ''}</div>`;
  return layout({ title: y ? `Money in Congress, ${y}` : 'Money in Congress', desc: `Who funds Congress${y ? ` in ${y}` : ''}: the biggest PACs, industries and outside spenders behind current members and members-elect, from FEC filings.`, path: '/money' + (y ? '?year=' + y : ''), body, active: '/money' });
}
const prefix = o => Object.fromEntries(Object.entries(o).map(([k, v]) => ['-' + k, v]));
function split(given) { const s = { D: 0, R: 0, I: 0 }; for (const [id, amt] of Object.entries(given)) { const p = D.byId.get(id); if (p) s[p.party === 'R' ? 'R' : p.party === 'D' ? 'D' : 'I'] += amt; } return s; }
function splitBar(s) { const t = s.D + s.R + s.I || 1; return `<span class="split mini" title="${pct(s.D / t)} to Democrats, ${pct(s.R / t)} to Republicans"><i class="fD" style="flex:${s.D}"></i><i class="fI" style="flex:${s.I}"></i><i class="fR" style="flex:${s.R}"></i></span><small>${pct(s.D / t)} D</small>`; }

// the member's result in that cycle's House or Senate race: general election, else a lost primary; null when not found
function raceResult(p, yr) {
  const g = (p.elections || []).filter(x => x.year === yr).pop(); if (g) return !!g.won;
  return (p.primaries || []).some(x => x.year === yr && !x.won && !x.special) ? false : null;
}
const resTag = w => w == null ? '' : `<em class="res ${w ? 'ok' : 'no'}">${w ? 'Won' : 'Lost'}</em>`;
// race difficulty: pre-election rating for general elections, the result's margin for primaries and specials
const DIFF_TIP = { Safe: 'Safe: not competitive', Likely: 'Likely: a clear favorite', Lean: 'Lean: competitive', Tilt: 'Tilt: highly competitive', Tossup: 'Tossup: either side could win' };
const difChip = (cat, rating, stage) => cat ? `<span class="dif d-${cat.toLowerCase()}" title="${esc(DIFF_TIP[cat] || cat)}${stage && !/General|Special/.test(stage) ? ', by the primary margin' : ''}">${esc(/General|Special/.test(stage || '') && rating ? rating : cat)}</span>` : '';
const effLine = (f, short) => f && f.eff != null && f.rank ? `${pct(f.eff)}${short ? '' : ' difficulty-weighted win rate'}, #${f.rank.toLocaleString('en-US')} of ${f.of.toLocaleString('en-US')}` : '';
function raceSpendersSec(p) {
  const R = D.pmRaces, keys = R && R.personRaces && R.personRaces[p.id]; if (!keys || !keys.length) return '';
  const blocks = keys.map(k => { const l = R.raceSpenders[k] || []; if (!l.length) return ''; const [seat, stage] = k.split('|');
    return `<h4>${esc(seat)}, 2026 ${esc(stage.toLowerCase())}</h4><div class="tbl"><table><thead><tr><th>PAC</th><th class="n">Effectiveness</th><th>Spent</th><th class="n">Amount</th></tr></thead><tbody>${l.map(x => `<tr><td>${x.sl ? `<a href="/f/${x.sl}">${leanDot(x.id)}${esc(nice(x.n))}</a>` : esc(nice(x.n))}</td><td class="n">${x.e != null && x.rk ? `${pct(x.e)} <small>#${x.rk.toLocaleString('en-US')}</small>` : ''}</td><td>${x.sd === 'A' ? 'Against' : 'For'} ${esc(x.c || '')}</td><td class="n">${money(x.a)}</td></tr>`).join('')}</tbody></table></div>`; }).filter(Boolean);
  return blocks.length ? `<h3>PACs in the 2026 race</h3><p class="sub">PACs that gave or spent in the race, ranked by their 2026 difficulty-weighted win rate across all races: wins in tossups count ten times wins in safe seats.</p>${blocks.join('')}` : '';
}
// About block shared by funder, caucus, committee and industry pages: a paragraph, then website, Wikipedia and social links
const LINKS = [['site', 'globe', 'Website'], ['wikipedia', 'wiki', 'Wikipedia'], ['x', 'xlogo', 'X'], ['facebook', 'facebook', 'Facebook'], ['instagram', 'instagram', 'Instagram'], ['youtube', 'youtube', 'YouTube'], ['bluesky', 'bluesky', 'Bluesky'], ['threads', 'threads', 'Threads'], ['linkedin', 'linkedin', 'LinkedIn']];
function aboutBlock(a, text) {
  const t = (a && a.about) || text; if (!t && !a) return '';
  const all = { ...(a && a.socials), site: a && a.site, wikipedia: a && a.wikipedia };
  const links = LINKS.filter(([k]) => all[k]).map(([k, ic, l]) => `<a href="${esc(all[k])}" rel="noopener">${H.icon(ic)}${l}</a>`);
  if (!t && !links.length) return '';
  return `<div class="f-about">${t ? `<p>${esc(t)}</p>` : ''}${links.length ? `<p class="f-links">${links.join('')}</p>` : ''}</div>`;
}
// plain-language explanation of a PAC built from its FEC record, for funders without a written one
const KIND_OF = { Corporation: 'a company', 'Trade association': 'a trade association', 'Labor union': 'a labor union', 'Membership group': 'a membership organization', Cooperative: 'a cooperative' };
// the member behind a campaign committee (FEC candidate id) or a leadership PAC (FEC sponsor ids in tools/congress/static/leadership-sponsors.json)
function leaderOf(f) {
  const ids = [f.sponsor, ...((D.leadershipSponsors || {})[f.id] || [])].filter(Boolean);
  return ids.length ? D.people.find(x => (x.ids && x.ids.fec || []).some(c => ids.includes(c))) || null : null;
}
function funderText(f) {
  const n = nice(f.name), org = f.org ? nice(f.org.replace(/\s*\([^)]*\)/g, '')) : '', ind = D.industryOf(f.id), inds = ind ? D.indName.get(ind) : '';
  const p = leaderOf(f), who = p ? `${p.chamber === 'S' ? 'Sen.' : 'Rep.'} ${p.name}` : '';
  let a;
  if (KIND_OF[f.kind] && !org) a = `${n} is a political action committee sponsored by ${KIND_OF[f.kind]}${inds ? ` in the ${inds.toLowerCase()} field` : ''}. It collects voluntary contributions from the organization's employees or members and gives them to candidates.`;
  else if (KIND_OF[f.kind]) a = `${n.replace(/\s+-\s+.*$/, '')} is the political action committee of ${org}, ${KIND_OF[f.kind]}${inds ? ` in the ${inds.toLowerCase()} field` : ''}. It collects voluntary contributions from the organization's employees or members and gives them to candidates.`;
  else if (f.kind === 'Leadership PAC') a = `${n} is ${who ? `the leadership PAC of ${who}` : 'a leadership PAC'}, a committee a member of Congress uses to give money to other candidates and party allies.`;
  else if (f.kind === 'Committee' && who) a = `${n} is the campaign committee of ${who}, which also gives to other candidates.`;
  else if (f.kind === 'Super PAC') a = `${n} is a super PAC: it can raise unlimited sums from people, companies and unions, and spends it independently of candidates.`;
  else if (f.kind === 'Hybrid PAC') a = `${n} is a hybrid PAC, with one account that gives to candidates and a separate account that raises unlimited money for independent spending.`;
  else if (f.kind === 'Party committee') a = `${n} is a ${f.party === 'REP' ? 'Republican' : f.party === 'DEM' ? 'Democratic' : ''} party committee.`.replace('a  party', 'a party');
  else if (f.kind === 'PAC') a = `${n} is a political action committee that raises money from individuals and gives it to candidates.`;
  else return '';
  const g = f.total || 0, ie = f.ie || 0;
  const m = g && ie ? `Since 2021 it has given ${money(g)} to members of Congress and spent ${money(ie)} on outside spending for or against them.` : g ? `Since 2021 it has given ${money(g)} to members of Congress.` : ie ? `Since 2021 it has spent ${money(ie)} on outside spending for or against members of Congress.` : '';
  const l = leanOf(f.id), when = l && (l.since === 'since 2021' ? 'since 2021' : 'in 2025-26');
  const ln = !l ? '' : l.step === 'n' ? `It splits its money between the parties: ${pct(1 - l.sh)} helped Democrats and ${pct(l.sh)} Republicans ${when}.` : l.sh > 0.5 ? `${pct(l.sh)} of its money ${when} helped Republicans.` : `${pct(1 - l.sh)} of its money ${when} helped Democrats.`;
  return [a, m, ln].filter(Boolean).join(' ');
}

// ---------------- PAC lean: which party its money helped ----------------
// Democratic side = gifts to Democrats (and independents who caucus with them) + outside spending for them or against Republicans; Republican side the mirror.
const LEAN = new Map();
function leanOf(id) {
  if (id === 'AIPAC') id = 'C00799031';
  if (LEAN.has(id)) return LEAN.get(id);
  // 2025-26 money from the post-mortem build, where primary spending counts for the party whose primary it was;
  // otherwise gifts and outside spending on members since 2021
  const ps = D.postmortem && D.postmortem.funderScores && D.postmortem.funderScores[id];
  const f = D.funders.get(id); let d = 0, r = 0, since = '2025-26';
  if (ps && ps.ld + ps.lr > 0) { d = ps.ld; r = ps.lr; }
  else if (f) { since = 'since 2021';
    const side = pid => { const p = D.byId.get(pid); if (!p) return null; const k = p.party === 'I' ? (p.caucus || 'D') : p.party; return k === 'D' || k === 'R' ? k : null; };
    for (const [pid, a] of Object.entries(f.given || {})) { const k = side(pid); if (k === 'D') d += a; else if (k === 'R') r += a; }
    for (const [pid, a] of Object.entries(f.ieFor || {})) { const k = side(pid); if (k === 'D') d += a; else if (k === 'R') r += a; }
    for (const [pid, a] of Object.entries(f.ieAgainst || {})) { const k = side(pid); if (k === 'D') r += a; else if (k === 'R') d += a; }
  }
  const t = d + r, sh = t ? r / t : null;
  const step = sh == null ? null : sh >= 0.9 ? 'r3' : sh >= 0.7 ? 'r2' : sh > 0.55 ? 'r1' : sh >= 0.45 ? 'n' : sh > 0.3 ? 'd1' : sh > 0.1 ? 'd2' : 'd3';
  const label = sh == null ? '' : step === 'n' ? `Splits its money: ${pct(1 - sh)} Democratic, ${pct(sh)} Republican` : sh > 0.5 ? `${pct(sh)} of its money helped Republicans` : `${pct(1 - sh)} of its money helped Democrats`;
  const o = t ? { d, r, sh, step, label, since } : null; LEAN.set(id, o); return o;
}
const leanDot = id => { const l = leanOf(id); return l ? `<i class="ln ln-${l.step}" role="img" aria-label="${l.label}" title="${l.label}"></i>` : ''; };
const leanKey = () => `<p class="ln-key" aria-hidden="true"><span>Dot shows who a PAC's money helped:</span><span><i class="ln ln-d3"></i><i class="ln ln-d2"></i><i class="ln ln-d1"></i> Democrats</span><span><i class="ln ln-n"></i> Both</span><span><i class="ln ln-r1"></i><i class="ln ln-r2"></i><i class="ln ln-r3"></i> Republicans</span><span>Darker means more one-sided.</span></p>`;
function leanTrack(id) {
  const l = leanOf(id); if (!l) return '';
  return `<div class="ln-track"><p class="ln-h">Who its money helped, ${l.since}</p><div class="ln-bar" role="img" aria-label="${l.label}"><span class="ln-mark ln-${l.step}" style="left:${(l.sh * 100).toFixed(1)}%"></span></div>
  <p class="ln-ends"><span class="ln-dem">${pct(1 - l.sh)} Democrats <small>${money(l.d)}</small></span><span class="ln-rep">${pct(l.sh)} Republicans <small>${money(l.r)}</small></span></p></div>`;
}
function funder(f, q) {
  const y = yearOf(q), V = y ? view(y) : null, cy = y ? cycleOf(y) : null;
  const given = y ? V.givenBy.get(f.id) || {} : f.given, ieFor = y ? V.ieFor.get(f.id) || {} : f.ieFor, ieAgainst = y ? V.ieAg.get(f.id) || {} : f.ieAgainst;
  const gTotal = Object.values(given).reduce((a, b) => a + b, 0), ieTotal = Object.values(ieFor).reduce((a, b) => a + b, 0) + Object.values(ieAgainst).reduce((a, b) => a + b, 0);
  const when = y ? `in ${y}` : 'since 2021';
  const s = split(given); const t = s.D + s.R + s.I;
  const rec = Object.entries(given).map(([id, amt]) => [D.byId.get(id), amt]).filter(([p]) => p).sort((a, b) => b[1] - a[1]);
  const ind = D.industryOf(f.id); const lob = D.lobbying && D.lobbying.byCommittee[f.id];
  // 2026 scores come from the post-mortem build, which scores every candidate contest, members or not
  const rcy = cy || 2026, sc = rcy === 2026 && D.postmortem && D.postmortem.funderScores ? D.postmortem.funderScores[f.id] : null;
  const iel = (o, l) => { const e = Object.entries(o).map(([id, amt]) => [D.byId.get(id), amt]).filter(([p]) => p).sort((a, b) => b[1] - a[1]); const li = ([p, a]) => `<li>${personLink(p)}<span class="ra">${resTag(raceResult(p, cy || 2026))}<b class="amt">${money(a)}</b></span></li>`; return e.length ? `<div><h3>${l}</h3><ol class="rank sm">${e.slice(0, 12).map(li).join('')}</ol>${e.length > 12 ? `<p><a class="more" href="/f/${f.slug}/recipients${y ? '?year=' + y : ''}#outside">All ${e.length}</a></p>` : ''}</div>` : ''; };
  const body = `<div class="wrap"><p class="crumb"><a href="/money">Money</a>${ind ? `, <a href="/industry/${ind}">${esc(D.indName.get(ind))}</a>` : ''}</p>
  <h1>${esc(nice(f.name))}</h1>
  <p class="lede">${esc(f.kind)}${f.org ? ` connected to ${esc(nice(f.org))}` : ''}${f.city ? `, ${esc(nice(f.city))}, ${esc(f.state)}` : ''}. FEC committee <a href="https://www.fec.gov/data/committee/${f.id}/" rel="noopener">${f.id}</a>.</p>
  ${aboutBlock(D.funderAbout[f.id], funderText(f))}
  ${leanTrack(f.id)}
  ${yearNav('/f/' + f.slug, y)}
  ${(() => { // 2026 scorecard: every 2026 House and Senate candidate it spent on, scored by the contest each dollar went to; filter by stage
    if (!sc || !(sc.win + sc.lose)) return '';
    const L = (D.pmRaces && D.pmRaces.funderRaces[f.id]) || [], isGen = x => /General|Special/.test(x.st);
    const bet = x => `${money(x.a)} ${x.sd === 'A' ? 'against' : 'for'} ${esc(x.n)}, ${esc(x.s)} ${esc(x.st.toLowerCase())}`;
    const SC = [['all', 'All Races', sc, L, `${rcy} races`], ['gen', 'General Elections', sc.st && sc.st.g, L.filter(isGen), `${rcy} general elections`], ['prim', 'Primaries', sc.st && sc.st.p, L.filter(x => !isGen(x)), `${rcy} primaries`]];
    const card = ([k, , c, l, what], i) => { if (!c || !(c.win + c.lose)) return '';
      const spent = c.win + c.lose + (c.open || 0), bigW = l.find(x => x.g === true), bigL = l.find(x => x.g === false);
      return `<div data-scope-panel="${k}"${i ? ' hidden' : ''}><dl class="facts f-sc">
  <div><dt>Spent on ${what}</dt><dd>${money(spent)}</dd><dd class="s">PAC gifts and outside spending for or against House and Senate candidates</dd></div>
  <div><dt>Races that went its way</dt><dd>${c.won} of ${c.races}</dd><dd class="mt"><span class="mt-bar" role="img" aria-label="${c.won} won, ${c.races - c.won} lost"><i class="fW" style="flex:${c.won}"></i><i class="fL" style="flex:${c.races - c.won}"></i></span></dd><dd class="s">${pct(c.won / c.races)} of the races it put money into</dd></div>
  <div><dt>Money on the winning side</dt><dd>${pct(c.win / (c.win + c.lose))}</dd><dd class="mt"><span class="mt-bar" role="img" aria-label="${money(c.win)} on winners, ${money(c.lose)} on losers"><i class="fW" style="flex:${c.win}"></i><i class="fL" style="flex:${c.lose}"></i></span></dd><dd class="s">${money(c.win)} on winners, ${money(c.lose)} on losers</dd></div>
  ${c.eff != null && c.rank ? `<div><dt>Race effectiveness rank</dt><dd>#${c.rank.toLocaleString('en-US')} <small>of ${c.of.toLocaleString('en-US')}</small></dd><dd class="mt"><span class="mt-pct" role="img" aria-label="Better than ${pct(1 - c.rank / c.of)} of PACs"><i style="left:${((1 - c.rank / c.of) * 100).toFixed(1)}%"></i></span></dd><dd class="s">Better than ${pct(1 - c.rank / c.of)} of PACs. ${pct(c.eff)} of races won, each race weighted by how competitive it was</dd></div>` : ''}
  ${c.meff != null && c.mrank ? `<div><dt>Money effectiveness rank</dt><dd>#${c.mrank.toLocaleString('en-US')} <small>of ${c.mof.toLocaleString('en-US')}</small></dd><dd class="mt"><span class="mt-pct" role="img" aria-label="Better than ${pct(1 - c.mrank / c.mof)} of PACs"><i style="left:${((1 - c.mrank / c.mof) * 100).toFixed(1)}%"></i></span></dd><dd class="s">Better than ${pct(1 - c.mrank / c.mof)} of PACs. ${pct(c.meff)} of its money won, each dollar weighted by how competitive its race was</dd></div>` : ''}
  </dl>${bigW || bigL ? `<p class="sub f-sc-n">${bigL ? `Biggest losing bet: ${bet(bigL)}.` : ''}${bigW ? ` Biggest winning bet: ${bet(bigW)}.` : ''}</p>` : ''}</div>`; };
    const has = SC.filter(([, , c]) => c && c.win + c.lose);
    return `<h2 class="f-sc-h">${rcy} scorecard</h2>
  <div class="f-scw">${has.length > 1 ? `<div class="seg sm pm-scope" role="group" aria-label="Which elections" data-scope-tabs>${SC.map(([k, l, c], i) => c && c.win + c.lose ? `<button type="button" aria-pressed="${i ? 'false' : 'true'}" data-scope="${k}">${l}</button>` : '').join('')}</div>` : ''}
  <ul class="poll-key pm-key"><li><span class="k fW" aria-hidden="true"></span>Went its way</li><li><span class="k fL" aria-hidden="true"></span>Did not</li></ul>
  ${SC.map(card).join('')}</div>`; })()}
  <dl class="facts f-sc">${t ? `<div><dt>Given to members</dt><dd>${money(gTotal)}</dd><dd class="s">${rec.length} recipients ${when}</dd></div><div><dt>To Democrats</dt><dd>${pct(s.D / t)}</dd><dd class="s">${money(s.D)}</dd></div><div><dt>To Republicans</dt><dd>${pct(s.R / t)}</dd><dd class="s">${money(s.R)}</dd></div>` : ''}${ieTotal ? `<div><dt>Outside spending on members</dt><dd>${money(ieTotal)}</dd><dd class="s">For and against members of Congress ${when}</dd></div>` : ''}${lob && lob.spend && (lob.spend['2025'] || lob.spend['2026']) ? `<div><dt>Lobbying, 2025-26</dt><dd>${money((lob.spend['2025'] || 0) + (lob.spend['2026'] || 0))}</dd><dd class="s">Lobbying Disclosure Act filings</dd></div>` : ''}</dl>
  ${rec.length ? `<h2>Recipients</h2><p class="sub">Share is the gift's part of everything that member raised ${cy ? `in the ${cyLabel(cy)} cycle` : 'since 2021'}. Open a row for every contribution.</p><div class="tbl"><table class="pacs"><thead><tr><th>Member</th><th class="n">Given</th><th class="n">Share</th><th>${rcy} race</th></tr></thead><tbody>${rec.slice(0, 80).map(([p, a]) => `<tr><td>${personLink(p)}${histDetails(p.id, f.id)}</td><td class="n">${money(a, true)}</td><td class="n">${shareOf(p, a, cy)}</td><td>${resTag(raceResult(p, rcy))}</td></tr>`).join('')}</tbody></table></div>${rec.length > 80 ? `<p><a class="more" href="/f/${f.slug}/recipients${y ? '?year=' + y : ''}">All ${rec.length} recipients</a></p>` : ''}` : ''}
  ${(() => { const L = rcy === 2026 && D.pmRaces && D.pmRaces.funderRaces[f.id]; if (!L || !L.length) return '';
    return `<h2>2026 races</h2><p class="sub">The races it put the most money into, with each race's difficulty: the pre-election rating for general elections, the margin for primaries. The effectiveness score weights each race by difficulty, from Safe (0.1) to Tossup (1.0).${sc && sc.rankG ? ` General elections: #${sc.rankG.toLocaleString('en-US')} of ${sc.ofG.toLocaleString('en-US')}.` : ''}${sc && sc.rankP ? ` Primaries: #${sc.rankP.toLocaleString('en-US')} of ${sc.ofP.toLocaleString('en-US')}.` : ''}</p>
    <div class="tbl"><table><thead><tr><th>Candidate</th><th>Race</th><th>Difficulty</th><th class="n">Spent</th><th>Result</th></tr></thead><tbody>${L.map(x => `<tr><td>${x.p === 'D' || x.p === 'R' ? chip({ party: x.p }) : ''} ${x.sl ? `<a href="/m/${x.sl}">${esc(x.n)}</a>` : esc(x.n)}<br><small>${x.sd === 'A' ? 'against' : 'for'}</small></td><td>${esc(x.s)}<br><small>${esc(x.st)}</small></td><td>${difChip(x.k, x.r, x.st)}</td><td class="n">${money(x.a)}</td><td>${x.g == null ? '' : `<em class="res ${x.g ? 'ok' : 'no'}">${x.g ? 'Went its way' : 'Did not'}</em>`}</td></tr>`).join('')}</tbody></table></div>`; })()}
  ${Object.keys(ieFor).length || Object.keys(ieAgainst).length ? `<h2>Outside spending ${when}</h2><div class="two">${iel(ieFor, 'To help')}${iel(ieAgainst, 'To defeat')}</div>` : ''}
  ${y && !rec.length && !ieTotal ? `<p class="sub">No contributions or outside spending for members in ${y}.</p>` : ''}
  ${lob && (lob.issues || []).length ? `<h2>What ${esc(nice(lob.client))} lobbies on</h2><p class="tags">${lob.issues.slice(0, 20).map(i => `<span>${esc(i.name)} <b>${i.filings}</b></span>`).join('')}</p>${lob.bills && lob.bills.length ? `<p class="sub">Bills named in filings: ${lob.bills.slice(0, 20).map(esc).join(', ')}.</p>` : ''}<p><a href="${esc(lob.url)}" rel="noopener">Lobbying filings on LDA.gov</a></p>` : ''}</div>`;
  return layout({ title: nice(f.name), desc: `${nice(f.name)} (${f.kind}): ${money(f.total)} to members of Congress, ${t ? pct(s.R / t) + ' to Republicans' : ''}.`, path: `/f/${f.slug}` + (y ? '?year=' + y : ''), body, active: '/money' });
}
// every member a PAC gave to or spent for or against, for the drill-down link on the PAC page
function funderRecipients(f, q) {
  const y = yearOf(q), V = y ? view(y) : null, cy = y ? cycleOf(y) : null, rcy = cy || 2026, when = y ? `in ${y}` : 'since 2021';
  const given = y ? V.givenBy.get(f.id) || {} : f.given, ieFor = y ? V.ieFor.get(f.id) || {} : f.ieFor, ieAgainst = y ? V.ieAg.get(f.id) || {} : f.ieAgainst;
  const list = o => Object.entries(o).map(([id, amt]) => [D.byId.get(id), amt]).filter(([p]) => p).sort((a, b) => b[1] - a[1]);
  const rec = list(given), hf = list(ieFor), ha = list(ieAgainst);
  const ol = (l, h) => l.length ? `<h3>${h} <span class="cnt">${l.length}</span></h3><ol class="rank sm">${l.map(([p, a]) => `<li>${personLink(p)}<span class="ra">${resTag(raceResult(p, rcy))}<b class="amt">${money(a)}</b></span></li>`).join('')}</ol>` : '';
  const body = `<div class="wrap"><p class="crumb"><a href="/f/${f.slug}${y ? '?year=' + y : ''}">${esc(nice(f.name))}</a></p>
  <h1>Who ${esc(nice(f.name))} funds</h1>
  ${yearNav('/f/' + f.slug + '/recipients', y)}
  ${rec.length ? `<h2>Recipients <span class="cnt">${rec.length}</span></h2><p class="sub">Contributions to members of Congress ${when}, largest first. Open a row for every contribution.</p><div class="tbl"><table class="pacs"><thead><tr><th>Member</th><th class="n">Given</th><th class="n">Share</th><th>${rcy} race</th></tr></thead><tbody>${rec.map(([p, a]) => `<tr><td>${personLink(p)}${histDetails(p.id, f.id)}</td><td class="n">${money(a, true)}</td><td class="n">${shareOf(p, a, cy)}</td><td>${resTag(raceResult(p, rcy))}</td></tr>`).join('')}</tbody></table></div>` : ''}
  ${hf.length || ha.length ? `<h2 id="outside">Outside spending ${when}</h2><div class="two"><div>${ol(hf, 'To help')}</div><div>${ol(ha, 'To defeat')}</div></div>` : ''}
  </div>`;
  return layout({ title: `Who ${nice(f.name)} funds${y ? `, ${y}` : ''}`, desc: `Every member of Congress ${nice(f.name)} gave to or spent for or against ${when}: ${rec.length} recipients${hf.length + ha.length ? `, ${hf.length + ha.length} outside spending targets` : ''}.`, path: `/f/${f.slug}/recipients` + (y ? '?year=' + y : ''), body, active: '/money' });
}
function industry(id, q) {
  const y = yearOf(q); if (!D.industryTotals.get(id)) return null;
  const t = (y ? view(y).ind.get(id) : D.industryTotals.get(id)) || { id, total: 0, D: 0, R: 0, I: 0, recipients: {} };
  const when = y ? `in ${y}` : 'since 2021';
  const sec = D.sectorOf.get(id);
  const rec = Object.entries(t.recipients).map(([pid, a]) => [D.byId.get(pid), a]).filter(([p]) => p).sort((a, b) => b[1] - a[1]);
  const ptot = f => y ? Object.values(view(y).givenBy.get(f.id) || {}).reduce((a, b) => a + b, 0) : f.total;
  const pacs = [...D.funders.values()].filter(f => D.industryOf(f.id) === id).map(f => [f, ptot(f)]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const body = `<div class="wrap"><p class="crumb"><a href="/money">Money</a>${sec ? `, ${esc(sec.name)}` : ''}</p><h1>${esc(D.indName.get(id))}${y ? `, ${y}` : ''}</h1>
  ${aboutBlock(D.industryAbout[id])}
  ${yearNav('/industry/' + id, y)}
  ${t.total ? `<dl class="facts"><div><dt>Given to members</dt><dd>${money(t.total)}</dd><dd class="s">PAC contributions ${when}</dd></div><div><dt>To Democrats</dt><dd>${pct(t.D / t.total)}</dd></div><div><dt>To Republicans</dt><dd>${pct(t.R / t.total)}</dd></div></dl>` : `<p class="sub">No PAC contributions from this industry to members in ${y}.</p>`}
  <div class="cols"><div class="col-main"><h2>Top recipients</h2><ol class="rank">${rec.slice(0, 20).map(([p, a]) => `<li>${personLink(p)}<b class="amt">${money(a)}</b></li>`).join('')}</ol></div>
  <aside class="col-side"><h2>PACs in this industry ${when}</h2><ol class="rank sm">${pacs.slice(0, 25).map(([f, v]) => `<li><a href="/f/${f.slug}${y ? '?year=' + y : ''}">${leanDot(f.id)}<b>${esc(nice(f.name))}</b><small>${esc(nice(f.org) || f.kind)}</small></a><b class="amt">${money(v)}</b></li>`).join('')}</ol></aside></div></div>`;
  return layout({ title: `${D.indName.get(id)} money in Congress`, desc: `${D.indName.get(id)} PAC money ${when}: ${t.total ? `${money(t.total)} to members of Congress, ${pct(t.D / t.total)} to Democrats and ${pct(t.R / t.total)} to Republicans. ` : ''}Top recipients and PACs.`, path: `/industry/${id}` + (y ? '?year=' + y : ''), body, active: '/money' });
}

// ---------------- issues ----------------
function issues() {
  if (!D.bills) return null;
  const list = Object.entries(D.bills.issues).sort((a, b) => b[1].bills - a[1].bills);
  const body = `<div class="wrap"><h1>Issues</h1><p class="lede">Every bill in the 119th Congress sorted into its Congress.gov policy area, with the roll calls taken on each.</p>
  <ul class="issues">${list.map(([a, x]) => `<li><a href="/issue/${slugIssue(a)}"><b>${esc(a)}</b><small>${x.bills} bills${x.rollcalls.length ? `, ${x.rollcalls.length} roll calls` : ''}</small></a></li>`).join('')}</ul></div>`;
  return layout({ title: 'Issues before Congress', desc: 'Every bill in the 119th Congress sorted by policy area, from health and taxes to defense and immigration, with the roll calls taken on each.', path: '/issues', body, active: '/issues' });
}
function issue(slug) {
  if (!D.bills) return null;
  const e = Object.entries(D.bills.issues).find(([a]) => slugIssue(a) === slug); if (!e) return null;
  const [name, x] = e;
  const bl = Object.entries(D.bills.bills).filter(([, b]) => b.policyArea === name).sort((a, b) => (b[1].law - a[1].law) || (b[1].cosponsors - a[1].cosponsors));
  const sponsors = {}; for (const [, b] of bl) if (b.sponsor) sponsors[b.sponsor] = (sponsors[b.sponsor] || 0) + 1;
  const topS = Object.entries(sponsors).map(([id, n]) => [D.byId.get(id), n]).filter(([p]) => p).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const rcs = x.rollcalls.map(k => D.rcByK.get(k)).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
  const body = `<div class="wrap"><p class="crumb"><a href="/issues">Issues</a></p><h1>${esc(name)}</h1>
  <p class="lede">${bl.length} bills in the 119th Congress${bl.filter(([, b]) => b.law).length ? `, ${bl.filter(([, b]) => b.law).length} signed into law` : ''}.</p>
  <div class="cols"><div class="col-main">${issuePolling(name)}${rcs.length ? `<h2>Roll call votes</h2><ol class="rolls">${rcs.map(rollRow).join('')}</ol>` : ''}
  <h2>Bills with the most support</h2><ul class="blist">${bl.slice(0, 25).map(([k, b]) => `<li><a href="/bill/${k}"><span class="bl">${billLabel(k)}</span><b>${esc(b.short || b.title)}</b><small>${b.law ? 'Became law. ' : ''}${b.cosponsors} cosponsors.</small></a></li>`).join('')}</ul></div>
  <aside class="col-side"><h2>Most active sponsors</h2><ol class="rank sm">${topS.map(([p, n]) => `<li>${personLink(p)}<b class="amt">${n} bills</b></li>`).join('')}</ol></aside></div></div>`;
  return layout({ title: `${name} in Congress`, desc: `${name} in the 119th Congress: the bills with the most support, roll call votes and the members who sponsor the most.`, path: `/issue/${slug}`, body, active: '/issues' });
}

// ---------------- search ----------------
function searchRun(q, limit = 40) {
  const n = D.norm(q); if (!n) return [];
  const terms = n.split(' ');
  const billish = /^(h ?r|s|h ?res|s ?res|h ?j ?res|s ?j ?res)\s*\d+$/.test(n) ? n.replace(/\s+/g, '') : null;
  const out = [];
  for (const it of D.search) {
    if (billish && it.t === 'bill' && it.k === billish) { out.push([0, it]); continue; }
    if (!terms.every(t => it.key.includes(t))) continue;
    let score = it.t === 'person' ? 1 : it.t === 'funder' ? 2 : 3;
    if (it.t === 'person' && D.norm(it.p.last) === n) score = 0.5;
    if (it.t === 'person' && it.p.state.toLowerCase() === n) score = 0.8;
    out.push([score, it]);
  }
  out.sort((a, b) => a[0] - b[0] || (b[1].f ? b[1].f.total : 0) - (a[1].f ? a[1].f.total : 0));
  return out.slice(0, limit).map(x => x[1]);
}
function search(q) {
  const qq = (q.get('q') || '').trim();
  if (/^\d{5}(-\d{4})?$/.test(qq)) return { redirect: '/find?q=' + qq.slice(0, 5) };
  const st = Object.entries(D.STATES).find(([k, v]) => D.norm(v) === D.norm(qq) || k.toLowerCase() === qq.toLowerCase());
  const res = searchRun(qq);
  const ppl = res.filter(r => r.t === 'person'), fs = res.filter(r => r.t === 'funder'), bs = res.filter(r => r.t === 'bill');
  const body = `<div class="wrap narrow"><h1>${qq ? `Results for “${esc(qq)}”` : 'Search'}</h1>
  <form class="bigsearch" action="/search" role="search"><label for="sq" class="vh">Search</label><input id="sq" name="q" type="search" value="${esc(qq)}" autocomplete="off" data-suggest><button type="submit">Search</button></form>
  ${st ? `<p class="hit"><a class="btn" href="/state/${st[0].toLowerCase()}">${esc(st[1])} delegation</a></p>` : ''}
  ${ppl.length ? `<h2>Members</h2><ul class="cards">${ppl.map(r => `<li>${personLink(r.p, statusTag(r.p))}</li>`).join('')}</ul>` : ''}
  ${fs.length ? `<h2>PACs and groups</h2><ol class="rank sm">${fs.map(r => `<li><a href="/f/${r.f.slug}">${leanDot(r.f.id)}<b>${esc(nice(r.f.name))}</b><small>${esc(r.f.kind)}${r.f.org ? ', ' + esc(nice(r.f.org)) : ''}</small></a><b class="amt">${money(r.f.total || r.f.ie)}</b></li>`).join('')}</ol>` : ''}
  ${bs.length ? `<h2>Bills</h2><ul class="blist">${bs.map(r => `<li><a href="/bill/${r.k}"><span class="bl">${billLabel(r.k)}</span><b>${esc(r.b.short || r.b.title)}</b></a></li>`).join('')}</ul>` : ''}
  ${qq && !res.length && !st ? `<p>Nothing matches “${esc(qq)}”. Try a last name, a state, a company or a bill number such as H.R. 1.</p>` : ''}</div>`;
  return layout({ title: qq ? `Search: ${qq}` : 'Search', path: '/search', body, noindex: true });
}
function suggest(q) {
  if (/^\d{5}$/.test(q.trim()) && F.ZIPS[q.trim()]) { const z = F.ZIPS[q.trim()]; return [{ t: 'ZIP code', l: `Your representatives for ${q.trim()}`, s: D.STATES[z.d[0][0]], u: '/find?q=' + q.trim() }]; }
  const st = Object.entries(D.STATES).find(([k, v]) => D.states[k] && (D.norm(v) === D.norm(q) || (q.length === 2 && k === q.toUpperCase()) || (q.length > 2 && D.norm(v).startsWith(D.norm(q)))));
  const head = st ? [{ t: 'State', l: `${st[1]} delegation`, s: `${D.states[st[0]].filter(p => p.status !== 'elect').length} members`, u: `/state/${st[0].toLowerCase()}` }] : [];
  return head.concat(searchRun(q, 8 - head.length).map(r => r.t === 'person' ? { t: 'Member', l: `${title(r.p)} ${r.p.name}`, s: short(r.p), u: href(r.p), img: H.hasPortrait(r.p) ? `/portraits/s/${r.p.id}.webp` : null }
    : r.t === 'funder' ? { t: r.f.kind, l: nice(r.f.name), s: money(r.f.total || r.f.ie), u: `/f/${r.f.slug}` }
      : { t: 'Bill', l: r.b.short || r.b.title, s: billLabel(r.k), u: `/bill/${r.k}` }));
}

// ---------------- schedule ----------------
const LV = require('./live');
const ET = { timeZone: 'America/New_York' };
const dayLabel = iso => new Date(iso).toLocaleDateString('en-US', { ...ET, weekday: 'long', month: 'long', day: 'numeric' });
const timeLabel = iso => new Date(iso).toLocaleTimeString('en-US', { ...ET, hour: 'numeric', minute: '2-digit' }) + ' ET';
const weekLabel = wd => `Week of ${date(wd, { month: 'long', day: 'numeric' })}`;
function billInline(text) {
  return esc(text).replace(LV.BILL_RE, m => { const k = LV.billKey(m); return k && D.bills && D.bills.bills[k] ? `<a href="/bill/${k}">${m}</a>` : m; });
}
function votesOnBill(k, since) { return D.allRolls.filter(r => rcBillKey(r) === k && (!since || r.date >= since)); }
function floorItem(i, since) {
  const b = i.key && D.bills && D.bills.bills[i.key]; const sp = b && D.byId.get(b.sponsor);
  const done = i.key ? votesOnBill(i.key, since) : [];
  return `<li><div class="fi"><span class="bl">${esc(i.num || '')}</span>${i.key && b ? `<a href="/bill/${i.key}"><b>${esc(b.short || i.text)}</b></a>` : `<b>${esc(i.text)}</b>`}
    ${sp ? `<small>Sponsor: <a href="${href(sp)}">${esc(title(sp) + ' ' + sp.name)}</a> ${chip(sp)}</small>` : ''}</div>
    ${done.length ? `<a class="fi-done" href="/vote/${done[0].k}"><em class="res ${/pass|agreed|confirmed|adopted/i.test(done[0].result) ? 'ok' : 'no'}">${esc(done[0].result)}</em> ${done[0].yea}-${done[0].nay}</a>` : '<span class="fi-wait">No roll call yet</span>'}</li>`;
}
function meetingRow(m) {
  const bills = m.bills.map(k => D.bills && D.bills.bills[k] ? `<a href="/bill/${k}">${billLabel(k)}</a>` : billLabel(k));
  return `<li class="mt"><time>${timeLabel(m.date)}</time><div><b><a href="${esc(m.url)}" rel="noopener">${esc(m.title)}</a></b>
    <small>${esc(m.committees.map(c => c.name).join(', '))}${m.where ? `. ${esc(m.where)}` : ''}${m.status && m.status !== 'Scheduled' ? `. <span class="st-flag">${esc(m.status)}</span>` : ''}</small>
    ${bills.length ? `<small>Bills: ${bills.join(', ')}</small>` : ''}</div></li>`;
}
function byDay(list) { const g = new Map(); for (const m of list) { const d = m.date.slice(0, 10) && dayLabel(m.date); if (!g.has(d)) g.set(d, []); g.get(d).push(m); } return g; }
function schedule() {
  const L = LV.L; const meet = LV.upcomingMeetings(14);
  const recent = D.allRolls.slice(0, 10);
  const hs = L.house.map(w => `<div class="wk"><h3>${weekLabel(w.week)} <a class="poll-src" href="${esc(w.url)}" rel="noopener">Majority Leader floor schedule</a></h3>${w.cats.map(c => `<h4>${esc(c.name)}</h4><ul class="floor">${c.items.map(i => floorItem(i, w.week)).join('')}</ul>`).join('')}</div>`).join('');
  const ss = L.senate.map(s => `<div class="sday"><h3>${s.date ? dayLabel(s.date + 'T17:00:00Z') : esc(s.title)} <a class="poll-src" href="${esc(s.url)}" rel="noopener">Senate floor schedule</a></h3>${s.paras.map(p => `<p>${billInline(p)}</p>`).join('')}</div>`).join('');
  const ms = [...byDay(meet)].map(([d, list]) => `<h3>${esc(d)}</h3><ul class="mts">${list.map(meetingRow).join('')}</ul>`).join('');
  const body = `<div class="wrap"><h1>This week in Congress</h1>
  <p class="lede">What the House and Senate plan to take up, the committee hearings ahead and the latest roll calls. Updated every 10 minutes from the House Majority Leader, the Senate floor schedule, Congress.gov and the House and Senate clerks.</p>
  <div class="cols"><div class="col-main">
    ${hs ? `<section class="sched"><h2>House floor</h2>${hs}</section>` : ''}
    ${ss ? `<section class="sched"><h2>Senate floor</h2>${ss}</section>` : ''}
    ${ms ? `<section class="sched"><h2>Committee hearings and markups</h2>${ms}</section>` : ''}
  </div>
  <aside class="col-side"><h2><a href="/votes">Latest roll calls</a></h2><ol class="rolls compact">${recent.map(rollRow).join('')}</ol></aside></div></div>`;
  return layout({ title: 'This week in Congress', desc: 'The House and Senate floor schedules, upcoming committee hearings and the latest roll call votes.', path: '/schedule', body, active: '/schedule' });
}
function comingUp() {
  const items = LV.floorItems(); const meet = LV.upcomingMeetings(7); const s = LV.L.senate[0];
  if (!items.length && !meet.length && !s) return '';
  const thisWeek = LV.L.house[0];
  const open = items.filter(i => i.week === (thisWeek && thisWeek.week) && !(i.key && votesOnBill(i.key, i.week).length)).slice(0, 5);
  return `<section class="band"><div class="wrap cols"><div class="col-main"><h2><a href="/schedule">Coming up in Congress</a></h2>
  ${s ? `<div class="sday"><h3>Senate, ${s.date ? dayLabel(s.date + 'T17:00:00Z') : ''}</h3><p>${billInline(s.paras.slice(0, 2).join(' '))}</p></div>` : ''}
  ${open.length ? `<h3>Still to come on the House floor this week</h3><ul class="floor">${open.map(i => floorItem(i, i.week)).join('')}</ul>` : ''}
  <p><a class="more" href="/schedule">Full schedule</a></p></div>
  <aside class="col-side">${meet.length ? `<h2>Next hearings</h2><ul class="mts">${meet.slice(0, 5).map(m => meetingRow(m).replace('<time>', `<time>${esc(new Date(m.date).toLocaleDateString('en-US', { ...ET, weekday: 'short' }))} `)).join('')}</ul>` : ''}</aside></div></section>`;
}
function comingFor(p) {
  if (p.status === 'elect') return '';
  const bm = D.bills && D.bills.byMember[p.id]; const mine = new Set(bm ? [...bm.sponsored, ...bm.cosponsored] : []);
  const floor = LV.floorItems().filter(i => i.key && mine.has(i.key) && !votesOnBill(i.key, i.week).length);
  const sen = []; for (const s of LV.L.senate) for (const b of (s.paras.join(' ').match(LV.BILL_RE) || [])) { const k = LV.billKey(b); if (k && mine.has(k) && !sen.includes(k)) sen.push(k); }
  const meet = LV.meetingsFor(p, 21);
  if (!floor.length && !sen.length && !meet.length) return '';
  const role = k => bm && bm.sponsored.includes(k) ? 'Sponsor' : 'Cosponsor';
  return `<h2>Coming up</h2>
  ${floor.length ? `<h3>On the House floor</h3><ul class="floor">${floor.map(i => floorItem(i, i.week).replace('<span class="bl">', `<span class="bl">${role(i.key)}, `)).join('')}</ul>` : ''}
  ${sen.length ? `<h3>On the Senate floor</h3><ul class="blist">${sen.map(k => { const b = D.bills.bills[k]; return `<li><a href="/bill/${k}"><span class="bl">${role(k)}, ${billLabel(k)}</span><b>${esc(b ? b.short || b.title : billLabel(k))}</b></a></li>`; }).join('')}</ul>` : ''}
  ${meet.length ? `<h3>Their committees meet</h3><ul class="mts">${meet.slice(0, 6).map(m => meetingRow(m).replace('<time>', `<time>${esc(new Date(m.date).toLocaleDateString('en-US', { ...ET, month: 'short', day: 'numeric' }))}, `)).join('')}</ul>` : ''}
  <p><a class="more" href="/schedule">Full schedule</a></p>`;
}
function schedNote(k) {
  const s = LV.scheduledBills().get(k); if (!s) return '';
  const when = s.week ? weekLabel(s.week).toLowerCase() : s.date ? dayLabel(s.date + 'T17:00:00Z') : '';
  return `<p class="ph-status">Scheduled: ${esc(s.where)}${when ? `, ${esc(when)}` : ''}. <a href="/schedule">See the schedule</a></p>`;
}

// ---------------- tracker page ----------------
const STAGE_HELP = [
  ['Introduced', 'A member of the House or Senate files the bill and it gets a number: H.R. for House bills, S. for Senate bills. Any member can introduce one; others sign on as cosponsors.'],
  ['In committee', 'The Speaker or the Senate presiding officer refers the bill to the committees that cover its subject. Committees hold hearings, then a markup where members amend the text and vote on whether to report it. Most bills never leave committee.'],
  ['Reported', 'The committee sends the bill to the full chamber with a written report, and it goes on the calendar. Party leaders decide whether and when it reaches the floor.'],
  ['First chamber vote', 'In the House, the Rules Committee writes a rule setting debate time and allowed amendments, and the House votes on that rule before the bill. Less contested bills come up under suspension of the rules, which needs a two-thirds vote. In the Senate, most bills need 60 votes for cloture to end debate before a final simple-majority vote.'],
  ['Second chamber vote', 'The other chamber has to pass the same text. It can take up the bill as passed, amend it, or pass its own version.'],
  ['Resolving differences', 'When the two versions differ, the chambers send amendments back and forth until they agree, or appoint a conference committee to write one version that both chambers then vote on.'],
  ['The President', 'The President has 10 days, not counting Sundays, to sign or veto. Congress can override a veto with two-thirds of both chambers. A bill left unsigned becomes law after 10 days unless Congress has adjourned, which makes it a pocket veto.'],
  ['Law', 'A signed bill becomes a public law with a number such as Public Law 119-21.']
];
const BV = require('./billviz');
function tracker(q) {
  if (!D.bills) return null;
  const F = BV.flow(q);
  const res = q.get('kind') === 'resolutions';
  const body = `<div class="wrap"><h1>Bill tracker</h1>
  <p class="lede">How far every ${res ? 'resolution' : 'bill'} of the 119th Congress has gone. Each box shows how many reached that step and how many are sitting there now. Select a step to search the ${res ? 'resolutions' : 'bills'} in it.</p>
  <div class="filters">${BV.filterBar('/tracker', q)}</div>
  <div class="flow-wrap">${F.svg}</div>
  ${F.side.length ? `<p class="flow-side">${F.side.map(([s, v]) => `<a href="/tracker/${s.id}${F.qs}"><b>${v.toLocaleString('en-US')}</b> ${esc(s.name.toLowerCase())}</a>`).join('')}</p>` : ''}
  ${pmProcess()}
  <ol class="process">${STAGE_HELP.map(([h, t], i) => `<li><div class="pr-n">${(() => { const id = ['introduced', 'committee', 'reported', 'passed-one', 'passed-both', null, 'to-president', 'law'][i]; return id && F.steps.some(x => x.id === id) ? `<a href="/tracker/${id}${F.qs}"><b>${(F.at[id] || 0).toLocaleString('en-US')}</b><span>here now</span></a>` : ''; })()}</div><div><h2>${esc(h)}</h2><p>${esc(t)}</p></div></li>`).join('')}</ol>
  <h2>Votes along the way</h2><p>Many roll calls are procedural: they decide whether and how a bill is debated rather than whether it passes. <a href="/votes?kind=procedural">Procedural votes</a>, <a href="/votes?kind=passage">passage votes</a>, <a href="/votes?kind=nomination">nominations</a> and <a href="/votes?kind=leadership">leadership votes</a>. <a href="/issues">Browse bills by issue</a>.</p></div>`;
  return layout({ title: 'Bill tracker', desc: 'How a bill becomes law, step by step, and where every bill in the 119th Congress stands.', path: '/tracker', body, active: '/tracker' });
}
function trackerStage(stage, q) {
  if (!D.bills) return null;
  const R = BV.finder(stage, q); if (!R) return null;
  const { st, list, areas, page, pages, per } = R;
  const keep = ['kind', 'origin'].filter(k => q.get(k)).map(k => `<input type="hidden" name="${k}" value="${esc(q.get(k))}">`).join('');
  const qs = (k, v) => { const u = new URLSearchParams(q); if (v == null) u.delete(k); else u.set(k, v); u.delete('page'); const s = u.toString(); return `/tracker/${stage}` + (s ? '?' + s : ''); };
  const body = `<div class="wrap"><p class="crumb"><a href="/tracker${(() => { const u = new URLSearchParams(); for (const k of ['kind', 'origin']) if (q.get(k)) u.set(k, q.get(k)); const s = u.toString(); return s ? '?' + s : ''; })()}">Bill tracker</a></p>
  <h1>${esc(st.name)}</h1><p class="lede">${esc(st.help)} ${list.length.toLocaleString('en-US')} ${q.get('kind') === 'resolutions' ? 'resolutions' : 'bills'} match.</p>
  <nav class="stage-nav" aria-label="Steps">${[...BV.STEPS, ...BV.SIDE].map(s => `<a href="/tracker/${s.id}${(() => { const u = new URLSearchParams(q); u.delete('page'); const x = u.toString(); return x ? '?' + x : ''; })()}"${s.id === stage ? ' aria-current="page"' : ''}>${esc(s.short || s.name)}</a>`).join('')}</nav>
  <div class="filters">${BV.filterBar('/tracker/' + stage, q)}</div>
  <form class="finder" action="/tracker/${stage}">${keep}
    <label for="fq">Search</label><input id="fq" name="q" type="search" value="${esc(R.text)}" placeholder="Title, number or subject">
    <label for="fa">Issue</label><select id="fa" name="area"><option value="">All issues</option>${areas.map(a => `<option${a === R.area ? ' selected' : ''}>${esc(a)}</option>`).join('')}</select>
    <label for="fp">Sponsor</label><select id="fp" name="party"><option value="">Any party</option><option value="D"${R.party === 'D' ? ' selected' : ''}>Democrat</option><option value="R"${R.party === 'R' ? ' selected' : ''}>Republican</option><option value="I"${R.party === 'I' ? ' selected' : ''}>Independent</option></select>
    <label for="fs">Sort</label><select id="fs" name="sort"><option value="recent"${R.sort === 'recent' ? ' selected' : ''}>Latest step first</option><option value="cosponsors"${R.sort === 'cosponsors' ? ' selected' : ''}>Most cosponsors</option><option value="oldest"${R.sort === 'oldest' ? ' selected' : ''}>Oldest first</option></select>
    <button type="submit">Find bills</button></form>
  <ul class="blist finder-list">${list.slice((page - 1) * per, page * per).map(([k, b]) => { const sp = D.byId.get(b.sponsor); return `<li><a href="/bill/${k}"><span class="bl">${BV.label(k)}${b.policyArea ? ` &nbsp;${esc(b.policyArea)}` : ''}</span><b>${esc(b.short || b.title)}</b><small>${sp ? `${esc(title(sp) + ' ' + sp.name)} (${short(sp)}). ` : ''}${b.cosponsors ? `${b.cosponsors} cosponsors. ` : ''}${b.latest ? `${date(b.latest.date)}: ${esc(b.latest.text)}` : ''}</small>${track(k, b)}</a></li>`; }).join('')}</ul>
  ${pager(qs('page', null), page, pages)}</div>`;
  return layout({ title: `${st.name}: bill tracker`, desc: `${list.length} bills ${st.name.toLowerCase()} in the 119th Congress.`, path: `/tracker/${stage}`, body, active: '/tracker', noindex: !!(R.text || R.area || R.party) });
}
// ---------------- compare two members ----------------
function compare(q) {
  const a = D.bySlug.get(q.get('a') || ''), b = D.bySlug.get(q.get('b') || '');
  const opts = sel => ['S', 'H'].map(ch => `<optgroup label="${ch === 'S' ? 'Senate' : 'House'}">${D.people.filter(p => p.status !== 'elect' && p.chamber === ch).sort((x, y) => x.last.localeCompare(y.last)).map(p => `<option value="${p.slug}"${sel && sel.id === p.id ? ' selected' : ''}>${esc(p.last + ', ' + p.first)} (${short(p)})</option>`).join('')}</optgroup>`).join('');
  const picker = `<form class="cmp-pick" action="/compare"><label for="ca">First member</label><select id="ca" name="a">${a ? '' : '<option value="">Choose a member</option>'}${opts(a)}</select><label for="cb">Second member</label><select id="cb" name="b">${b ? '' : '<option value="">Choose a member</option>'}${opts(b)}</select>${yearOf(q) ? `<input type="hidden" name="year" value="${yearOf(q)}">` : ''}<button type="submit">Compare</button></form>`;
  if (!a || !b || a.id === b.id) {
    const body = `<div class="wrap"><h1>Compare members</h1><p class="lede">Pick two members of Congress to see where they agree and differ: positions, votes, money and committees.</p>${picker}</div>`;
    return layout({ title: 'Compare members of Congress', desc: 'Pick any two members of Congress to compare their votes, positions, money, committees and caucuses side by side.', path: '/compare', body, active: '/members' });
  }
  const y = yearOf(q), V = y ? view(y) : null, cy = y ? cycleOf(y) : null, when = y ? `in ${y}` : 'since 2021';
  const side = (pa, pb) => `<div class="cmp-two"><div>${pa}</div><div>${pb}</div></div>`;
  // votes
  let votesHtml = '';
  if (a.chamber === b.chamber && a.votes && b.votes) {
    const pos = D.rcPos[a.chamber]; const ia = pos.get(a.id), ib = pos.get(b.id); let both = 0, same = 0; const diff = [], crossAgree = [];
    for (const rc of D.recentRolls[a.chamber]) { const x = rc.codes[ia], z = rc.codes[ib]; if (!'YN'.includes(x) || !'YN'.includes(z)) continue; both++; if (x === z) { same++; if (rc.partyLine && a.party !== b.party) crossAgree.push([rc, x]); } else diff.push([rc, x, z]); }
    votesHtml = `<section class="sec"><h2>Voting record</h2><dl class="facts"><div><dt>Voted the same way</dt><dd>${both ? pct(same / both, 1) : ''}</dd><dd class="s">On ${both.toLocaleString('en-US')} roll calls both cast a vote</dd></div><div><dt>Disagreed</dt><dd>${(both - same).toLocaleString('en-US')}</dd><dd class="s">Roll calls</dd></div>${a.party !== b.party ? `<div><dt>Agreed across party lines</dt><dd>${crossAgree.length}</dd><dd class="s">Party-line votes where they sided together</dd></div>` : ''}</dl>
    ${diff.length ? `<h3>Where they split, most recent first</h3><div class="tbl"><table class="cmp-v"><thead><tr><th>Vote</th><th>${esc(a.last)}</th><th>${esc(b.last)}</th></tr></thead><tbody>${diff.slice(0, 15).map(([rc, x, z]) => `<tr><td><a href="/vote/${rc.k}">${esc(rcTitle(rc))}</a><small>${esc(rc.question)}, ${date(rc.date)}. ${esc(rc.result)}</small></td><td><span class="vc v${x}">${VOTE_WORD[x]}</span></td><td><span class="vc v${z}">${VOTE_WORD[z]}</span></td></tr>`).join('')}</tbody></table></div>` : ''}
    ${crossAgree.length ? `<h3>Where they crossed party lines together</h3><ul class="vlist">${crossAgree.slice(0, 8).map(([rc, x]) => vrow(rc, x)).join('')}</ul>` : ''}</section>`;
  } else votesHtml = `<section class="sec"><h2>Voting record</h2><p class="sub">They serve in different chambers, so they never vote on the same roll call. Their records side by side:</p>${side(statBlock(a), statBlock(b))}</section>`;
  // positions
  const cau = p => (D.caucuses && D.caucuses.members[p.id]) || [];
  const cn = id => (D.caucuses.caucuses.find(c => c.id === id) || {}).name;
  const sharedCau = cau(a).filter(x => cau(b).includes(x));
  const cms = p => (p.committees || []).filter(c => !c.parent).map(c => c.id);
  const sharedCm = cms(a).filter(x => cms(b).includes(x));
  const bmA = D.bills && D.bills.byMember[a.id], bmB = D.bills && D.bills.byMember[b.id];
  const setA = new Set(bmA ? [...bmA.sponsored, ...bmA.cosponsored] : []); const sharedBills = bmB ? [...new Set([...bmB.sponsored, ...bmB.cosponsored])].filter(k => setA.has(k)) : [];
  const posHtml = `<section class="sec"><h2>Positions</h2>
    ${a.nominate != null && b.nominate != null ? `<div class="cmp-scale"><div class="cs-bar"><span class="cs-mark p${a.party}" style="left:${((a.nominate + 1) / 2 * 100).toFixed(1)}%"><b>${esc(a.last)}</b></span><span class="cs-mark p${b.party} lo" style="left:${((b.nominate + 1) / 2 * 100).toFixed(1)}%"><b>${esc(b.last)}</b></span></div><div class="ch-axis"><span>Most liberal</span><span>Most conservative</span></div><p class="sub">Voting scores (DW-NOMINATE): ${esc(a.last)} ${a.nominate.toFixed(2)}, ${esc(b.last)} ${b.nominate.toFixed(2)}.</p></div>` : ''}
    ${side(`<h3>${esc(a.name)}</h3><p class="cmp-tags">${cau(a).map(id => `<a class="cau${sharedCau.includes(id) ? ' shared' : ''}" href="/caucus/${id}">${esc(cn(id))}</a>`).join('')}</p>`, `<h3>${esc(b.name)}</h3><p class="cmp-tags">${cau(b).map(id => `<a class="cau${sharedCau.includes(id) ? ' shared' : ''}" href="/caucus/${id}">${esc(cn(id))}</a>`).join('')}</p>`)}
    ${sharedCm.length ? `<h3>Committees they share</h3><p class="cmp-tags">${sharedCm.map(id => `<a class="cau shared" href="/committee/${id.toLowerCase()}">${esc((D.meta.committees[id] || {}).name || id)}</a>`).join('')}</p>` : ''}
    ${sharedBills.length ? `<h3>Bills both sponsored or cosponsored <span class="cnt">${sharedBills.length}</span></h3><ul class="blist">${sharedBills.map(k => [k, D.bills.bills[k]]).filter(([, x]) => x).sort((x, z) => (z[1].latest?.date || '').localeCompare(x[1].latest?.date || '')).slice(0, 10).map(([k, x]) => `<li><a href="/bill/${k}"><span class="bl">${billLabel(k)}</span><b>${esc(x.short || x.title)}</b><small>${esc(BV.stageWord(x.stage))}</small></a></li>`).join('')}</ul>` : ''}</section>`;
  // money
  const given = p => (y ? V.givenTo.get(p.id) : D.givenTo.get(p.id)) || {};
  const ga = given(a), gb = given(b);
  const sharedPacs = Object.keys(ga).filter(cm => gb[cm]).map(cm => [D.funders.get(cm), ga[cm], gb[cm]]).filter(([f]) => f).sort((x, z) => (z[1] + z[2]) - (x[1] + x[2]));
  const totA = Object.values(ga).reduce((s, v) => s + v, 0), totB = Object.values(gb).reduce((s, v) => s + v, 0);
  const shareBy = (g, list) => { const t = Object.values(g).reduce((s, v) => s + v, 0); const sh = list.reduce((s, [, x]) => s + x, 0); return t ? sh / t : 0; };
  const indOf = p => (y ? V.byInd.get(p.id) : p.money && p.money.byIndustry) || [];
  const moneyHtml = `<section class="sec" id="money"><h2>Money</h2>${yearNav(`/compare?a=${a.slug}&b=${b.slug}`, y, '#money')}
    ${side(moneyBlock(a, cy, totA, when), moneyBlock(b, cy, totB, when))}
    ${sharedPacs.length ? `<h3>PACs funding both <span class="cnt">${sharedPacs.length}</span></h3><p class="sub">${pct(shareBy(ga, sharedPacs.map(([f, x]) => [f, x])), 0)} of ${esc(a.last)}'s PAC money and ${pct(shareBy(gb, sharedPacs.map(([f, , z]) => [f, z])), 0)} of ${esc(b.last)}'s came from PACs that gave to both ${when}.</p>
    <div class="tbl"><table><thead><tr><th>PAC</th><th class="n">To ${esc(a.last)}</th><th class="n">To ${esc(b.last)}</th></tr></thead><tbody>${sharedPacs.slice(0, 20).map(([f, x, z]) => `<tr><td><a href="/f/${f.slug}${y ? '?year=' + y : ''}">${leanDot(f.id)}${esc(nice(f.name))}</a><small class="kd">${esc(nice(f.org) || f.kind)}</small></td><td class="n">${money(x, true)}</td><td class="n">${money(z, true)}</td></tr>`).join('')}</tbody></table></div>` : `<p class="sub">No PAC gave to both ${when}.</p>`}
    <h3>Top industries</h3>${side(indList(indOf(a)), indList(indOf(b)))}</section>`;
  const body = `<div class="wrap"><p class="crumb"><a href="/compare">Compare members</a></p>
    <div class="cmp-head">${[a, b].map(p => `<a href="${href(p)}" class="cmp-who">${portrait(p, 'w', 'cmp-pt')}<span><b>${esc(p.name)}</b><small>${chip(p)} ${esc(PARTY[p.party])}, ${esc(seatLabel(p))}${p.chamber === 'H' && !p.delegate ? ' District' : ''}</small></span></a>`).join('<span class="cmp-vs">and</span>')}</div>
    ${picker}${posHtml}${votesHtml}${moneyHtml}</div>`;
  return layout({ title: `${a.name} and ${b.name} compared`, desc: `Where ${a.name} and ${b.name} agree and differ: votes, money, committees and caucuses.`, path: `/compare?a=${a.slug}&b=${b.slug}`, body, active: '/members' });
}
function statBlock(p) { const v = p.votes || {}; return `<h3>${esc(p.name)}</h3><dl class="kv"><dt>With party</dt><dd>${pct(v.unity, 1)}</dd><dt>Missed votes</dt><dd>${pct(v.missedPct, 1)}</dd><dt>Voting score</dt><dd>${p.nominate != null ? p.nominate.toFixed(2) : ''}</dd></dl>`; }
function moneyBlock(p, cy, pacTot, when) { const s = sources(p, cy); return `<h3>${esc(p.name)}</h3><dl class="kv"><dt>Raised${cy ? `, ${cyLabel(cy)}` : ', since 2021'}</dt><dd>${money(s.receipts)}</dd><dt>From individuals</dt><dd>${s.receipts ? pct(s.indiv / s.receipts) : ''}</dd><dt>From PACs</dt><dd>${s.receipts ? pct(s.pac / s.receipts) : ''}</dd><dt>PAC gifts ${when}</dt><dd>${money(pacTot)}</dd>${s.self ? `<dt>Self-funded</dt><dd>${money(s.self)}</dd>` : ''}</dl>`; }
function indList(list) { const l = list.filter(([k]) => k !== 'leadership-pacs').slice(0, 6); const m = l.length ? l[0][1] : 1; return l.length ? `<ul class="hbars">${l.map(([k, v]) => `<li><a href="/industry/${k}">${esc(D.indName.get(k))}</a><span class="hb"><i style="width:${(v / m * 100).toFixed(1)}%"></i></span><b>${money(v)}</b></li>`).join('')}</ul>` : ''; }

// a roll call placed in its bill's process: the stage track, the timeline, and the steps around this vote
function voteInProcess(rc, k, b) {
  const acts = (b.actions || []).map(a => ({ ...a, c: BV.classify(a) }));
  const mine = acts.findIndex(a => (a.recordedVotes || []).some(v => v.chamber[0] === rc.chamber && v.rollNumber === rc.clerk && v.session === rc.session));
  const major = acts.map((a, i) => ({ a, i })).filter(({ a, i }) => a.c.kind !== 'minor' || i === mine);
  const at = major.findIndex(x => x.i === mine);
  const around = at >= 0 ? major.slice(Math.max(0, at - 3), at + 4) : major.slice(-6);
  return `<h2>Where this vote fits</h2><p class="sub">${esc(qHelp(rc.question) ? rc.question : 'This roll call')} on <a href="/bill/${k}">${billLabel(k)}</a>, which is now ${esc(BV.stageWord(b.stage))}.</p>
  ${track(k, b)}
  <ol class="hist steps-around">${around.map(({ a, i }) => `<li class="${i === mine ? 'this' : ''}"><time>${date(a.date)}</time><ul><li class="h-${a.c.kind}">${a.c.label ? `<span class="hk">${esc(a.c.label)}</span>` : ''}${i === mine ? '<b>This vote.</b> ' : ''}${esc(a.text)}</li></ul></li>`).join('')}</ol>
  <p><a class="more" href="/bill/${k}">Full timeline of ${billLabel(k)}</a></p>`;
}
function billStory(k, b) {
  const F = BV.fate(k, b);
  const acts = (b.actions || []).map(a => ({ ...a, c: BV.classify(a) }));
  const byDay = new Map(); for (const a of [...acts].reverse()) { if (!byDay.has(a.date)) byDay.set(a.date, []); byDay.get(a.date).push(a); }
  const rel = F.rel.slice(0, 12);
  return `${acts.length ? `<h2>Timeline</h2><figure class="tl-fig">${BV.timeline(k, b)}<figcaption class="ch-key"><span><i class="k-pass"></i>Passed</span><span><i class="k-kill"></i>Failed, tabled or vetoed</span><span><i class="k-law"></i>Became law</span><span><i class="k-step"></i>Other steps</span></figcaption></figure>` : ''}
  ${F.out.length ? `<h2>What happened to it</h2><ul class="fate">${F.out.map(x => `<li class="${x.cls}"><b>${x.html ? x.text : esc(x.text)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</li>`).join('')}</ul>` : ''}
  ${rel.length ? `<h2>Related bills</h2><ul class="blist">${rel.map(r => `<li><a href="/bill/${r.key}"><span class="bl">${BV.label(r.key)} &nbsp;${esc(r.rel.join(', '))}</span><b>${esc(r.b.short || r.b.title)}</b><small>${esc(BV.stageWord(r.b.stage))}</small></a></li>`).join('')}</ul>` : ''}
  ${byDay.size ? `<h2>Full history</h2><ol class="hist">${[...byDay].map(([d, list]) => `<li><time>${date(d, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</time><ul>${list.map(a => `<li class="h-${a.c.kind}">${a.c.label ? `<span class="hk">${esc(a.c.label)}</span>` : ''}${a.chamber ? `<b>${esc(a.chamber)}.</b> ` : ''}${esc(a.text)}${(a.recordedVotes || []).map(v => { const rk = D.rcByK && [...D.rcByK.values()].find(r => r.chamber === v.chamber[0] && r.clerk === v.rollNumber && r.session === v.session); return rk ? ` <a href="/vote/${rk.k}">Roll call ${v.rollNumber}</a>` : ''; }).join('')}</li>`).join('')}</ul></li>`).join('')}</ol>` : ''}`;
}
// plain-language help for the vote question
const QHELP = [
  [/Cloture/i, 'Cloture ends debate in the Senate. It takes three-fifths of senators, usually 60, for legislation, and a simple majority for nominations. Without it, a filibuster can block a final vote.'],
  [/Motion to Proceed/i, 'A vote on whether the Senate will begin debating the measure.'],
  [/Recommit|Commit/i, 'A motion to send the bill back to committee, usually offered by the minority as a last chance to change it. Voting no keeps the bill moving.'],
  [/Previous Question/i, 'A vote to end debate on a House rule and move to adopt it. The minority votes no to try to offer its own amendment; it almost always follows party lines.'],
  [/Suspend the Rules/i, 'A fast-track used for less contested bills: debate is limited, no amendments are allowed and passage takes two-thirds of those voting.'],
  [/Table/i, 'A motion to table sets a measure or motion aside, which usually kills it.'],
  [/Discharge/i, 'A motion to pull a measure out of committee and bring it to the floor without the committee acting.'],
  [/Concur/i, 'A vote to accept the other chamber\'s changes. If it passes, both chambers have agreed on the same text.'],
  [/Objections of the President/i, 'A vote to override a presidential veto. It needs two-thirds of both chambers.'],
  [/Election of the Speaker/i, 'Members vote aloud by name for Speaker. Winning takes a majority of those voting for a person by name.'],
  [/Nomination/i, 'A Senate vote to confirm the President\'s nominee. Confirmation takes a simple majority.'],
  [/Point of Order|Decision of the Chair/i, 'A challenge to a ruling by the presiding officer on whether something follows the chamber\'s rules.'],
  [/Agreeing to the Resolution/i, 'In the House this is often the vote on a rule, which sets the terms of debate for a bill before the bill itself comes up.']
];
const qHelp = q => { const h = QHELP.find(([re]) => re.test(q || '')); return h ? h[1] : ''; };

// ---------------- polling ----------------
// one 100% bar split into parts; text stays in ink, colour keys sit beside it
function pollBar(parts) {
  const tot = parts.reduce((a, x) => a + x.v, 0) || 1;
  return `<div class="poll"><div class="poll-bar" role="img" aria-label="${esc(parts.map(x => `${x.l} ${x.v}%`).join(', '))}">${parts.filter(x => x.v > 0).map(x => `<i class="${x.c}" style="width:${(x.v / tot * 100).toFixed(1)}%"></i>`).join('')}</div>
  <ul class="poll-key">${parts.map(x => `<li><span class="k ${x.c}" aria-hidden="true"></span>${esc(x.l)} <b>${x.v}%</b></li>`).join('')}</ul></div>`;
}
const pollSrc = (o, extra) => `<p class="poll-src"><a href="${o.url}">${esc(o.pollster)}</a>, ${esc(o.dates)}, ${o.n.toLocaleString('en-US')} ${esc(o.pop)}${o.moe ? `, margin of error ±${o.moe} points` : ''}.${extra || ''}</p>`;
const PARTYWORD = { D: 'Democrats', R: 'Republicans', I: 'Independents' };
function memberPolling(p) {
  const out = [];
  const fav = D.polls && D.polls.favorability[p.id];
  if (fav) {
    const now = fav[0];
    out.push(`<h3>Nationally</h3><p class="sub">Overall opinion of ${esc(p.name)} among all U.S. adults.</p>
    ${pollBar([{ l: 'Favorable', v: now.fav, c: 'yes' }, { l: 'Never heard of', v: now.unheard, c: 'ns' }, { l: 'Unfavorable', v: now.unfav, c: 'no' }])}
    ${fav.length > 1 ? `<div class="tbl"><table class="poll-trend"><thead><tr><th>Survey</th><th class="n">Favorable</th><th class="n">Unfavorable</th><th class="n">Never heard of</th></tr></thead><tbody>${fav.map(r => `<tr><td>${esc(r.dates)}</td><td class="n">${r.fav}%</td><td class="n">${r.unfav}%</td><td class="n">${r.unheard}%</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${pollSrc(D.polls.pew, ` <a href="${D.polls.pew.topline}">Full questionnaire and results</a>.`)}`);
  }
  const a = D.approval && D.approval.members[p.id];
  if (a) {
    const cur = `${p.state}-${String(p.district || 1).padStart(2, '0')}`;
    const seat = p.chamber === 'S' ? D.STATES[p.state] : a.place === cur ? `the ${seatLabel(p)} District` : a.place;
    out.push(`<h3>In ${esc(seat)}</h3><p class="sub">Job approval among adults in ${p.chamber === 'S' ? 'the state' : 'the district'}.</p>
    ${pollBar([{ l: 'Approve', v: a.approve, c: 'yes' }, { l: 'Not sure', v: a.unsure, c: 'ns' }, { l: 'Disapprove', v: a.disapprove, c: 'no' }])}
    ${a.byParty ? `<ul class="pm poll-party">${['D', 'I', 'R'].map(k => `<li><span class="pm-l">${PARTYWORD[k]}</span><span class="pm-bar" aria-hidden="true"><i style="width:${a.byParty[k]}%"></i></span><b>${a.byParty[k]}%</b></li>`).join('')}</ul><p class="sub">Approval by the respondent's own party.</p>` : ''}
    <p class="poll-src"><a href="${D.approval.url}">Cooperative Election Study</a>, ${a.years.join(' and ')} surveys, ${a.n.toLocaleString('en-US')} respondents in ${p.chamber === 'S' ? esc(D.STATES[p.state]) : 'the district'}${p.chamber === 'S' ? '' : ', small-area estimate'}, margin of error ±${a.moe} points.</p>
    ${a.byYear ? `<h4>Year by year</h4><p class="sub">Each year's Cooperative Election Study on its own, ${a.byYear[a.byYear.length - 1].year} to ${a.byYear[0].year}, same seat. Years with a margin of error over 10 points are left out.</p>
    <div class="tbl"><table class="poll-trend"><thead><tr><th>Survey</th><th class="n">Approve</th><th class="n">Disapprove</th><th class="n">Not sure</th><th class="n">Respondents</th><th class="n">Margin</th></tr></thead><tbody>${a.byYear.map(r => `<tr><td>${r.year}</td><td class="n">${r.approve}%</td><td class="n">${r.disapprove}%</td><td class="n">${r.unsure}%</td><td class="n">${r.n.toLocaleString('en-US')}</td><td class="n">±${r.moe}</td></tr>`).join('')}</tbody></table></div>
    ${a.byYear.some(r => r.year === 2019) ? '<p class="sub">In 2019 about half as many people answered "not sure" about every member as in later years, so approve and disapprove both run higher that year.</p>' : ''}` : ''}`);
  }
  return out.length ? `<h2>Polling</h2>${out.join('')}` : '';
}
function congressPolling() {
  const P = D.polls; if (!P) return '';
  const c = P.congress, d = P.demPlans;
  return `<section class="pm-sec"><h2>${esc(c.label)}</h2>${pollBar([{ l: 'Approve', v: c.approve, c: 'yes' }, { l: 'Disapprove or no opinion', v: 100 - c.approve, c: 'ns' }])}
  <ul class="pm poll-party">${['R', 'I', 'D'].map(k => `<li><span class="pm-l">${PARTYWORD[k]}</span><span class="pm-bar" aria-hidden="true"><i style="width:${c.byParty[k]}%"></i></span><b>${c.byParty[k]}%</b></li>`).join('')}</ul>
  ${pollSrc(c)}
  <h2>Democratic leaders' plans</h2><p class="sub">Approval of ${esc(d.label.charAt(0).toLowerCase() + d.label.slice(1))}.</p>${pollBar([{ l: 'Approve', v: d.approve, c: 'yes' }, { l: 'Disapprove', v: d.disapprove, c: 'no' }])}
  ${pollSrc(P.pew)}</section>`;
}
function issuePolling(area) {
  const P = D.polls; if (!P) return '';
  const it = P.issues.items.find(x => x.area === area); if (!it) return '';
  const [t, dm, nd] = it.v;
  return `<section class="pm-sec"><h2>Polling: ${esc(it.label.toLowerCase())}</h2><p class="sub">${esc(P.issues.question)}</p>
  ${pollBar([{ l: P.issues.options[0], v: t, c: 'rp' }, { l: P.issues.options[2], v: nd, c: 'ns' }, { l: P.issues.options[1], v: dm, c: 'dm' }])}
  ${pollSrc(P.pew)}</section>`;
}

// ---------------- prediction markets ----------------
const MKT = require('./markets');
const pmPct = v => v < 0.01 ? '<1%' : v > 0.99 ? '>99%' : `${Math.round(v * 100)}%`;
function pmRows(rows, link) {
  return `<ul class="pm">${rows.map(r => `<li><span class="pm-l">${link ? link(r) : esc(r.label)}</span><span class="pm-bar" aria-hidden="true"><i style="width:${Math.max(1, r.prob * 100).toFixed(1)}%"></i></span><b>${pmPct(r.prob)}</b></li>`).join('')}</ul>`;
}
function pmSection(title, rows, link) { return rows && rows.length ? `<section class="pm-sec"><h2>${esc(title)}</h2><p class="sub">Market-implied chances, updated every 10 minutes.</p>${pmRows(rows, link)}</section>` : ''; }
const raceLink = r => { const p = r.person && D.byId.get(r.person); return p ? `<a href="${href(p)}">${esc(p.name)}</a>` : esc(r.label); };
function pmProcess() {
  const M = MKT.get(); if (!M.process.length) return '';
  const by = new Map(); for (const r of M.process) { if (!by.has(r.topic)) by.set(r.topic, []); by.get(r.topic).push(r); }
  return `<section class="pm-sec"><h2>Prediction markets</h2><p class="sub">Market-implied chances on what Congress does next, updated every 10 minutes.</p><div class="pm-grid">${[...by].map(([t, rows]) => `<div><h3>${esc(t)}</h3>${pmRows(rows.sort((a, b) => (a.ends || '').localeCompare(b.ends || '') || b.prob - a.prob).slice(0, 5))}</div>`).join('')}</div></section>`;
}

// ---------------- money for a group of members (caucus, committee) ----------------
// Same filters and drill-downs as a member's money section, summed over the group.
function groupMoney(ms, q, base, what) {
  const y = yearOf(q), V = y ? view(y) : null, cy = y ? cycleOf(y) : null;
  const when = y ? `in ${y}` : 'since 2021';
  const ids = new Set(ms.map(p => p.id));
  const src = { indiv: 0, pac: 0, party: 0, self: 0, receipts: 0, other: 0 };
  const perMember = [];
  const pacs = new Map(), inds = new Map(), ieF = new Map(), ieA = new Map();
  for (const p of ms) {
    const s = sources(p, cy); for (const k of Object.keys(src)) src[k] += s[k] || 0;
    const given = (y ? V.givenTo.get(p.id) : D.givenTo.get(p.id)) || {};
    let pacSum = 0;
    for (const [cm, amt] of Object.entries(given)) {
      pacSum += amt;
      const e = pacs.get(cm) || { total: 0, members: [] }; e.total += amt; e.members.push([p, amt]); pacs.set(cm, e);
    }
    const bi = (y ? V.byInd.get(p.id) : p.money && p.money.byIndustry) || [];
    for (const [k, v] of bi) { const e = inds.get(k) || { total: 0, members: [] }; e.total += v; e.members.push([p, v]); inds.set(k, e); }
    if (y) { const ie = V.ieP.get(p.id) || { for: {}, against: {} };
      for (const [cm, v] of Object.entries(ie.for)) { const e = ieF.get(cm) || { total: 0, members: [] }; e.total += v; e.members.push([p, v]); ieF.set(cm, e); }
      for (const [cm, v] of Object.entries(ie.against)) { const e = ieA.get(cm) || { total: 0, members: [] }; e.total += v; e.members.push([p, v]); ieA.set(cm, e); } }
    perMember.push({ p, raised: s.receipts, pacSum, top: bi[0] ? bi[0][0] : null });
  }
  if (!y) for (const f of D.funders.values()) {
    for (const [pid, v] of Object.entries(f.ieFor)) if (ids.has(pid)) { const e = ieF.get(f.id) || { total: 0, members: [] }; e.total += v; e.members.push([D.byId.get(pid), v]); ieF.set(f.id, e); }
    for (const [pid, v] of Object.entries(f.ieAgainst)) if (ids.has(pid)) { const e = ieA.get(f.id) || { total: 0, members: [] }; e.total += v; e.members.push([D.byId.get(pid), v]); ieA.set(f.id, e); }
  }
  const pacTotal = [...pacs.values()].reduce((a, e) => a + e.total, 0);
  const share = amt => src.receipts > 0 ? (amt / src.receipts * 100 < 0.1 ? '<0.1%' : (amt / src.receipts * 100).toFixed(amt / src.receipts < 0.01 ? 2 : 1) + '%') : '';
  const yq = y ? '?year=' + y : '';
  const whoGot = list => `<details class="ph-hist"><summary>${list.length} member${list.length === 1 ? '' : 's'}</summary><ol class="tx">${list.sort((a, b) => b[1] - a[1]).map(([p, v]) => `<li><a href="${href(p)}${yq}#money">${esc(p.name)}</a><b>${money(v, true)}</b></li>`).join('')}</ol></details>`;
  const topP = [...pacs.entries()].map(([cm, e]) => [D.funders.get(cm), e]).filter(([f]) => f).sort((a, b) => b[1].total - a[1].total).slice(0, 25);
  const topI = [...inds.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 10); const im = topI.length ? topI[0][1].total : 1;
  const ieRows = (m, l) => { const r = [...m.entries()].map(([cm, e]) => [D.funders.get(cm), e]).filter(([f]) => f).sort((a, b) => b[1].total - a[1].total).slice(0, 8);
    return r.length ? `<div><h4>${l}</h4><ol class="rank sm">${r.map(([f, e]) => `<li><div><a href="/f/${f.slug}${yq}">${leanDot(f.id)}<b>${esc(nice(f.name))}</b></a><small>${esc(f.kind)}</small>${whoGot(e.members)}</div><b class="amt">${money(e.total)}</b></li>`).join('')}</ol></div>` : ''; };
  const ieTotal = [...ieF.values(), ...ieA.values()].reduce((a, e) => a + e.total, 0);
  perMember.sort((a, b) => b.raised - a.raised);
  // funding pie
  const parts = [['indiv', 'Individuals'], ['pac', 'PACs'], ['party', 'Party committees'], ['self', 'Self-funded'], ['other', 'Other receipts']].filter(([k]) => src[k] > 0);
  const tot = parts.reduce((a, [k]) => a + src[k], 0); let pie = '';
  if (tot > 0) {
    const R = 70, r = 42, C = 80; let a0 = -Math.PI / 2;
    const arcs = parts.map(([k]) => { const f = src[k] / tot; if (f >= 0.9999) return `<circle cx="${C}" cy="${C}" r="${(R + r) / 2}" fill="none" stroke-width="${R - r}" class="ms-${k}"/>`;
      const a1 = a0 + f * 2 * Math.PI, big = f > 0.5 ? 1 : 0, pt = (rad, a) => `${(C + rad * Math.cos(a)).toFixed(2)},${(C + rad * Math.sin(a)).toFixed(2)}`;
      const d = `M${pt(R, a0)}A${R},${R} 0 ${big} 1 ${pt(R, a1)}L${pt(r, a1)}A${r},${r} 0 ${big} 0 ${pt(r, a0)}Z`; a0 = a1; return `<path d="${d}" class="ms-${k}"/>`; }).join('');
    pie = `<h3>Where the members' money comes from${cy ? `, ${cyLabel(cy)} cycle` : ''}</h3><div class="pie"><svg viewBox="0 0 160 160" role="img" aria-label="Sources of the members' campaign money">${arcs}<text x="${C}" y="${C - 2}" text-anchor="middle" class="pie-n">${money(src.receipts)}</text><text x="${C}" y="${C + 14}" text-anchor="middle" class="pie-l">${cy ? cyLabel(cy) : 'since 2021'}</text></svg>
    <ul class="pie-k">${parts.map(([k, l]) => `<li><i class="m-${k}"></i><span>${l}</span><b>${src[k] / tot < 0.001 ? '<0.1' : (src[k] / tot * 100).toFixed(1)}%</b><small>${money(src[k])}</small></li>`).join('')}</ul></div>`;
  }
  return `<section id="money" class="sec"><h2>Money</h2>
  ${yearNav(base, y, '#money')}
  <p class="sub">Campaign money of the ${ms.length} ${esc(what)} members, from FEC filings. Fundraising totals are reported per two-year cycle${y ? `; ${y} falls in the ${cyLabel(cy)} cycle` : ''}.</p>
  <dl class="facts"><div><dt>Raised by members</dt><dd>${money(src.receipts)}</dd><dd class="s">${cy ? `${cyLabel(cy)} cycle` : 'Since 2021'}</dd></div><div><dt>From PACs ${when}</dt><dd>${money(pacTotal)}</dd><dd class="s">${pacs.size} PACs</dd></div>${ieTotal ? `<div><dt>Outside spending ${when}</dt><dd>${money(ieTotal)}</dd><dd class="s">For and against members</dd></div>` : ''}</dl>
  ${pie}
  ${topI.length ? `<h3>Top industries ${when}</h3><p class="sub">PAC contributions to members, grouped by the industry behind each PAC. Open a row to see which members received it.</p><ul class="hbars drill">${topI.map(([k, e]) => `<li><a href="/industry/${k}${yq}">${esc(D.indName.get(k))}</a><span class="hb"><i style="width:${(e.total / im * 100).toFixed(1)}%"></i></span><b>${money(e.total)}</b>${whoGot(e.members)}</li>`).join('')}</ul>` : ''}
  ${topP.length ? `<h3>Top PAC donors ${when}</h3><p class="sub">Share is each PAC's part of everything these members raised ${cy ? `in the ${cyLabel(cy)} cycle` : 'since 2021'}. Open a row for the members it funded.</p>
  <div class="tbl"><table class="pacs"><thead><tr><th>PAC</th><th>Connected to</th><th class="n">Given</th><th class="n">Share</th></tr></thead><tbody>${topP.map(([f, e]) => `<tr><td><a href="/f/${f.slug}${yq}">${leanDot(f.id)}${esc(nice(f.name))}</a>${whoGot(e.members)}</td><td>${esc(nice(f.org) || '')}<small class="kd">${esc(f.kind)}</small></td><td class="n">${money(e.total, true)}</td><td class="n">${share(e.total)}</td></tr>`).join('')}</tbody></table></div>` : ''}
  ${ieF.size || ieA.size ? `<h3>Outside spending ${when}</h3><div class="two">${ieRows(ieF, 'Spent to help members')}${ieRows(ieA, 'Spent to defeat members')}</div>` : ''}
  <h3>Money by member</h3><div class="tbl"><table><thead><tr><th>Member</th><th class="n">Raised${cy ? `, ${cyLabel(cy)}` : ''}</th><th class="n">From PACs ${when}</th><th>Top industry</th></tr></thead><tbody>${perMember.map(r => `<tr><td>${personLink(r.p)}</td><td class="n">${r.raised ? money(r.raised) : ''}</td><td class="n">${r.pacSum ? money(r.pacSum) : ''}</td><td>${r.top ? `<a href="/industry/${r.top}${yq}">${esc(D.indName.get(r.top))}</a>` : ''}</td></tr>`).join('')}</tbody></table></div></section>`;
}

// ---------------- caucuses ----------------
function caucusPage(id, q) {
  const C = D.caucuses && D.caucuses.caucuses.find(c => c.id === id); if (!C) return null;
  const ms = D.people.filter(p => (D.caucuses.members[p.id] || []).includes(id));
  const ids = new Set(ms.map(p => p.id));
  const parties = ['R', 'D', 'I'].map(pt => [pt, ms.filter(p => p.party === pt).length]).filter(([, n]) => n);
  // voting record: how the caucus voted on each roll call, and where it split from its party
  const rows = [];
  for (const rc of D.allRolls) {
    const order = D.order[rc.chamber]; let y = 0, n = 0;
    order.forEach((pid, i) => { if (!ids.has(pid)) return; const c = rc.codes[i]; if (c === 'Y') y++; else if (c === 'N') n++; });
    if (y + n < 3) continue;
    const pos = y > n ? 'Y' : n > y ? 'N' : null;
    const pt = C.party === 'R' || C.party === 'D' ? C.party : null;
    const partyPos = pt && rc.partyPos ? rc.partyPos[pt] : null;
    rows.push({ rc, y, n, pos, cohesion: Math.max(y, n) / (y + n), breaks: !!(pos && partyPos && pos !== partyPos) });
  }
  const avgCoh = rows.length ? rows.reduce((a, r) => a + r.cohesion, 0) / rows.length : null;
  const breaks = rows.filter(r => r.breaks);
  const unity = ms.filter(p => p.votes && p.votes.unity != null);
  const avgUnity = unity.length ? unity.reduce((a, p) => a + p.votes.unity, 0) / unity.length : null;
  const ch = ms.some(p => p.chamber === 'H') ? 'H' : 'S';
  const body = `<div class="wrap"><p class="crumb"><a href="/">Seat chart</a>, caucuses</p><h1>${esc(C.name)}</h1>
  <p class="lede">${ms.length} members of the ${ch === 'H' ? 'House' : 'Senate'}${ms.some(p => p.chamber === 'S') && ms.some(p => p.chamber === 'H') ? ' and Senate' : ''}${parties.length > 1 ? `: ${parties.map(([pt, n]) => `${n} ${PARTY[pt]}${n === 1 ? '' : 's'}`).join(', ')}` : ''}. Member list from <a href="${esc(C.source.url)}" rel="noopener">${esc(C.source.name.replace(/\s*\([^)]*\)\s*$/, ''))}</a>.</p>
  ${aboutBlock(D.caucusAbout[id])}
  <figure class="vote-seats">${seatChart(ch, p => ids.has(p.id) ? 'f' + p.party : 'fx', { label: `${C.name} members in the ${ch === 'H' ? 'House' : 'Senate'}` })}</figure>
  <dl class="facts">${avgCoh != null ? `<div><dt>Votes together</dt><dd>${pct(avgCoh, 1)}</dd><dd class="s">Average share voting with the caucus majority</dd></div>` : ''}${avgUnity != null ? `<div><dt>With their party</dt><dd>${pct(avgUnity, 1)}</dd><dd class="s">Average party loyalty of members</dd></div>` : ''}${breaks.length ? `<div><dt>Broke with party</dt><dd>${breaks.length}</dd><dd class="s">Roll calls where most of the caucus voted against most of its party</dd></div>` : ''}</dl>
  <div class="cols"><div class="col-main">
  ${breaks.length ? `<h2>Where the caucus split from its party</h2><ol class="rolls">${breaks.slice(0, 12).map(r => rollRow(r.rc).replace('</a></li>', `<span class="rr-p">Caucus ${r.y}-${r.n}</span></a></li>`)).join('')}</ol>` : ''}
  <h2>Recent votes</h2><ol class="rolls">${rows.slice(0, 15).map(r => rollRow(r.rc).replace('</a></li>', `<span class="rr-p">Caucus ${r.y}-${r.n}</span></a></li>`)).join('')}</ol>
  </div><aside class="col-side">
  <h2>Members <span class="cnt">${ms.length}</span></h2><ol class="rank sm">${ms.sort((a, b) => a.last.localeCompare(b.last)).map(p => `<li>${personLink(p)}</li>`).join('')}</ol>
  </aside></div>${groupMoney(ms, q, '/caucus/' + id, C.name)}</div>`;
  return layout({ title: C.name, desc: `${C.name}: ${ms.length} members, how they vote together and who funds them.`, path: `/caucus/${id}`, body, active: '/members' });
}

// ---------------- leadership ----------------
const leaderRoles = id => D.leadership ? D.leadership.current.filter(c => c.person === id) : [];
function leadership() {
  const Ld = D.leadership; if (!Ld) return null;
  const card = c => { const p = D.byId.get(c.person); return p ? `<li><span class="lt">${esc(c.title)}</span>${personLink(p)}</li>` : ''; };
  const grp = (ch, pt) => Ld.current.filter(c => c.chamber === ch && (pt === undefined || c.party === pt));
  const sec = ch => { const top = Ld.current.filter(c => c.chamber === ch && !c.party); const R = grp(ch, 'R'), Dm = grp(ch, 'D');
    return `<h2>${ch}</h2>${top.length ? `<ul class="leaders top">${top.map(card).join('')}</ul>` : ''}<div class="two">${R.length ? `<div><h3>Republicans</h3><ul class="leaders">${R.map(card).join('')}</ul></div>` : ''}${Dm.length ? `<div><h3>Democrats</h3><ul class="leaders">${Dm.map(card).join('')}</ul></div>` : ''}</div>`; };
  const els = [...Ld.elections].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const by = c => els.filter(e => e.congress === c);
  const elRow = e => `<li class="el"><p class="rec-k"><span class="kind">${esc(e.body)}</span><time>${date(e.date)}</time>${e.method ? `<span>${esc(e.method)}</span>` : ''}</p>
    <h3><a href="/leadership/${esc(e.id)}">${esc(e.office)}${e.result.length ? `: ${esc((e.result.find(r => r.won) || {}).name || '')}` : ''}</a></h3><p>${esc(e.summary)}</p>
    ${e.result.length ? `<p class="tally">${e.result.map(r => `${r.won ? '<b>' : ''}${esc(r.name)}${r.votes != null ? ` ${r.votes}` : ''}${r.won ? '</b>' : ''}`).join(', ')}</p>` : ''}</li>`;
  const body = `<div class="wrap"><h1>Congressional leadership</h1><p class="lede">Who runs the House and Senate and each party's caucus, and how they were chosen. Party leaders are picked in closed caucus and conference votes; the Speaker is then elected on the House floor by name.</p>
  <div class="cols"><div class="col-main">${sec('House')}${sec('Senate')}</div>
  <aside class="col-side">${congressPolling()}${Object.entries(MKT.get().leaders).map(([race, rows]) => pmSection(`Prediction markets: ${MKT.RACE[race].toLowerCase()}`, rows.slice(0, 6), raceLink)).join('')}${by(120).length ? `<h2>Leadership elections for the 120th Congress</h2><ul class="els">${by(120).map(elRow).join('')}</ul>` : ''}
  ${by(119).length ? `<h2>119th Congress</h2><ul class="els">${by(119).map(elRow).join('')}</ul>` : ''}</aside></div></div>`;
  return layout({ title: 'Congressional leadership', desc: 'The Speaker, party leaders and whips of the House and Senate, and every leadership election, including caucus nominations and the Speaker vote.', path: '/leadership', body, active: '/leadership' });
}
function leaderElection(id) {
  const e = D.leadership && D.leadership.elections.find(x => x.id === id); if (!e) return null;
  const rv = e.rollcall && e.rollcall.votes;
  let chart = '';
  if (rv) {
    const names = {}; for (const v of Object.values(rv)) names[v] = (names[v] || 0) + 1;
    const ranked = Object.entries(names).sort((a, b) => b[1] - a[1]);
    const partyOfName = n => { const r = e.result.find(x => x.name === n || (x.name && n.startsWith(x.name.split(' ').pop()))); const p = r && r.person && D.byId.get(r.person); return p ? p.party : null; };
    const cls = {}; ranked.forEach(([n]) => { const pt = partyOfName(n); cls[n] = /^(present|not voting)$/i.test(n) ? 'v0' : pt ? 'f' + pt : 'cC'; });
    chart = `<figure class="vote-seats">${seatChart('H', p => rv[p.id] ? cls[rv[p.id]] : 'v0', { label: 'House seats colored by vote for Speaker' })}<figcaption class="ch-key">${ranked.map(([n, c]) => `<span><i class="${cls[n]}"></i>${esc(n)} ${c}</span>`).join('')}</figcaption></figure>
    <h2>How each member voted</h2><div class="vgroups">${ranked.map(([n]) => `<details><summary>${esc(n)} <span class="cnt">${names[n]}</span></summary><ul class="names">${Object.entries(rv).filter(([, v]) => v === n).map(([pid]) => D.byId.get(pid)).filter(Boolean).sort((a, b) => a.state.localeCompare(b.state) || a.last.localeCompare(b.last)).map(p => `<li><a href="${href(p)}">${esc(p.name)}</a> <small>${short(p)}</small></li>`).join('')}</ul></details>`).join('')}</div>`;
  }
  const body = `<div class="wrap"><p class="crumb"><a href="/leadership">Leadership</a></p><h1>${esc(e.office)}</h1>
  <p class="lede">${esc(e.body)}, ${date(e.date, { month: 'long', day: 'numeric', year: 'numeric' })}${e.method ? `, ${esc(e.method)}` : ''}.</p>
  <p>${esc(e.summary)}</p>
  ${e.result.length ? `<div class="tbl"><table><thead><tr><th>Candidate</th><th class="n">Votes</th><th>Result</th></tr></thead><tbody>${e.result.map(r => { const p = r.person && D.byId.get(r.person); return `<tr><td>${p ? personLink(p) : esc(r.name)}</td><td class="n">${r.votes ?? ''}</td><td>${r.won ? 'Elected' : ''}</td></tr>`; }).join('')}</tbody></table></div>` : ''}
  ${chart}
  <p class="poll-src">${e.sources.map(s => `<a href="${esc(s.url)}" rel="noopener">${esc(s.name)}</a>`).join(' ')}</p></div>`;
  return layout({ title: `${e.office}, ${e.body}`, desc: clip(`The election for ${e.office} of the ${e.body}: candidates, vote counts and results.`), path: `/leadership/${e.id}`, body, active: '/leadership' });
}

// ---------------- committees ----------------
const CM = () => D.meta.committees;
const cmSlug = id => id.toLowerCase();
const cmShort = n => n.replace(/^(House|Senate|Joint) (Committee|Select Committee|Permanent Select Committee) on /, '').replace(/^(House|Senate) /, '');
function cmMembers(id) {
  const out = [];
  for (const p of D.people) { if (p.status === 'elect') continue; const c = (p.committees || []).find(c => c.id === id); if (c) out.push({ p, title: c.title, rank: c.rank }); }
  return out.sort((a, b) => (a.rank || 99) - (b.rank || 99));
}
function cmLeaders(list) {
  const chair = list.find(m => /^chair/i.test(m.title || ''));
  const rank = list.find(m => /ranking/i.test(m.title || ''));
  return { chair, rank };
}
function committees() {
  const all = Object.entries(CM()).filter(([, c]) => !c.parent);
  const group = ch => all.filter(([, c]) => c.chamber === ch).sort((a, b) => cmShort(a[1].name).localeCompare(cmShort(b[1].name)));
  const meet = LV.upcomingMeetings(14);
  const row = ([id, c]) => {
    const ms = cmMembers(id); const { chair, rank } = cmLeaders(ms);
    const next = meet.find(m => m.committees.some(x => x.code.replace(/00$/, '') === id));
    return `<li><a href="/committee/${cmSlug(id)}"><b>${esc(cmShort(c.name))}</b><small>${ms.length} members${chair ? `. Chair: ${esc(chair.p.name)} (${chair.p.party})` : ''}${rank ? `. Ranking member: ${esc(rank.p.name)} (${rank.p.party})` : ''}</small>${next ? `<small class="nx">Meets ${esc(new Date(next.date).toLocaleDateString('en-US', { ...ET, weekday: 'short', month: 'short', day: 'numeric' }))}</small>` : ''}</a></li>`;
  };
  const body = `<div class="wrap"><h1>Committees</h1><p class="lede">Most of the work on a bill happens in committee: hearings, amendments and the vote to send it to the floor. Open a committee for its members, subcommittees, upcoming hearings and the industries that fund its members.</p>
  <div class="two"><div><h2>House</h2><ul class="cmlist">${group('house').map(row).join('')}</ul></div><div><h2>Senate</h2><ul class="cmlist">${group('senate').map(row).join('')}</ul>
  ${group('joint').length ? `<h2>Joint</h2><ul class="cmlist">${group('joint').map(row).join('')}</ul>` : ''}</div></div></div>`;
  return layout({ title: 'Congressional committees', desc: 'Every House, Senate and joint committee: members, leaders, subcommittees, hearings and the money behind its members.', path: '/committees', body, active: '/committees' });
}
function committee(slug, q) {
  const id = slug.toUpperCase(); const c = CM()[id]; if (!c) return null;
  const parent = c.parent ? CM()[c.parent] : null;
  const ms = cmMembers(id); const { chair, rank } = cmLeaders(ms);
  const subs = Object.entries(CM()).filter(([, x]) => x.parent === id);
  const meet = LV.upcomingMeetings(21).filter(m => m.committees.some(x => x.code === id || x.code.replace(/00$/, '') === id));
  const sides = ['R', 'D', 'I'].map(pt => [pt, ms.filter(m => m.p.party === pt)]).filter(([, l]) => l.length);
  const bl = D.bills ? Object.entries(D.bills.bills).filter(([, b]) => (b.committees || []).some(x => (x.systemCode || '').toUpperCase().replace(/00$/, '') === id || (x.systemCode || '').toUpperCase() === id)) : [];
  const reported = bl.filter(([, b]) => (b.committees || []).some(x => (x.activities || []).some(a => /reported|markup/i.test(a.name)))).sort((a, b) => (b[1].latest?.date || '').localeCompare(a[1].latest?.date || ''));
  const body = `<div class="wrap"><p class="crumb"><a href="/committees">Committees</a>${parent ? `, <a href="/committee/${cmSlug(c.parent)}">${esc(cmShort(parent.name))}</a>` : ''}</p>
  <h1>${esc(parent ? `${cmShort(parent.name)}: ${c.name}` : c.name)}</h1>
  ${c.jurisdiction ? `<p class="lede">${esc(c.jurisdiction.length > 420 ? c.jurisdiction.slice(0, c.jurisdiction.lastIndexOf('.', 420) + 1) || c.jurisdiction.slice(0, 420) : c.jurisdiction)}</p>` : ''}
  ${aboutBlock(D.committeeAbout[id])}
  <dl class="facts">${chair ? `<div><dt>Chair</dt><dd class="nm"><a href="${href(chair.p)}">${esc(chair.p.name)}</a></dd><dd class="s">${short(chair.p)}</dd></div>` : ''}${rank ? `<div><dt>Ranking member</dt><dd class="nm"><a href="${href(rank.p)}">${esc(rank.p.name)}</a></dd><dd class="s">${short(rank.p)}</dd></div>` : ''}<div><dt>Members</dt><dd>${ms.length}</dd><dd class="s">${sides.map(([pt, l]) => `${l.length} ${pt}`).join(', ')}</dd></div>${bl.length ? `<div><dt>Bills referred</dt><dd>${bl.length}</dd><dd class="s">${reported.length} acted on</dd></div>` : ''}</dl>
  <div class="cols"><div class="col-main">
  ${meet.length ? `<h2>Upcoming hearings and markups</h2><ul class="mts">${meet.map(m => meetingRow(m).replace('<time>', `<time>${esc(new Date(m.date).toLocaleDateString('en-US', { ...ET, month: 'short', day: 'numeric' }))}, `)).join('')}</ul>` : ''}
  <h2>Members</h2><div class="two">${sides.map(([pt, l]) => `<div><h3>${PARTY[pt]}s</h3><ol class="rank sm">${l.map(m => `<li>${personLink(m.p, m.title ? `, ${esc(m.title)}` : '')}</li>`).join('')}</ol></div>`).join('')}</div>
  ${reported.length ? `<h2>Bills it has acted on</h2><ul class="blist">${reported.slice(0, 15).map(([k, b]) => `<li><a href="/bill/${k}"><span class="bl">${billLabel(k)}</span><b>${esc(b.short || b.title)}</b><small>${esc(b.latest ? b.latest.text : '')}</small></a></li>`).join('')}</ul>` : ''}
  </div><aside class="col-side">
  ${subs.length ? `<h2>Subcommittees</h2><ul class="plain">${subs.map(([sid, x]) => `<li><a href="/committee/${cmSlug(sid)}">${esc(x.name)}</a></li>`).join('')}</ul>` : ''}
  ${c.url || c.phone ? `<h2>Contact</h2><ul class="plain">${c.url ? `<li><a href="${esc(c.url)}" rel="noopener">Committee website</a></li>` : ''}${c.minorityUrl ? `<li><a href="${esc(c.minorityUrl)}" rel="noopener">Minority website</a></li>` : ''}${c.phone ? `<li>${esc(c.phone)}</li>` : ''}${c.address ? `<li>${esc(c.address)}</li>` : ''}</ul>` : ''}
  </aside></div>${groupMoney(ms.map(m => m.p), q, '/committee/' + slug, c.name)}</div>`;
  return layout({ title: c.name, desc: `${c.name}: members, chair and ranking member, subcommittees, hearings and the industries that fund its members.`, path: `/committee/${slug}`, body, active: '/committees' });
}

// ---------------- find your representatives ----------------
const F = require('./find');
function contactLinks(p) {
  const l = [];
  if (p.url) l.push(['Official website', p.url]);
  if (p.contact) l.push(['Contact form', p.contact]);
  if (p.ids && p.ids.wikipedia) l.push(['Wikipedia', 'https://en.wikipedia.org/wiki/' + encodeURIComponent(p.ids.wikipedia.replace(/ /g, '_'))]);
  const so = p.social || {};
  if (so.twitter) l.push(['X', `https://x.com/${so.twitter}`]);
  if (so.facebook) l.push(['Facebook', `https://www.facebook.com/${so.facebook}`]);
  if (so.instagram) l.push(['Instagram', `https://www.instagram.com/${so.instagram}`]);
  if (so.youtube_id) l.push(['YouTube', `https://www.youtube.com/channel/${so.youtube_id}`]);
  return l;
}
function repCard(p, note, extra) {
  const links = contactLinks(p);
  return `<article class="rep">${portrait(p, 'w', 'rep-pt')}<div class="rep-b">
    <p class="rep-r">${chip(p.status === 'elect' ? p : (note === 'next' && p.elect ? p.elect : p))} ${esc(note === 'next' && p.elect ? (p.elect.chamber === 'S' ? 'Senator-elect' : 'Representative-elect') : p.status === 'elect' ? (p.chamber === 'S' ? 'Senator-elect' : 'Representative-elect') : p.chamber === 'S' ? 'Senator' : p.delegate ? 'Delegate' : 'Representative')}${p.status === 'elect' || (note === 'next' && p.elect) ? ', takes office January 3, 2027' : ''}</p>
    <h3><a href="${href(p)}">${esc(p.name)}</a></h3>
    <p class="rep-s">${esc(PARTY[p.party] || p.partyName || '')}${p.chamber === 'H' || (p.elect && p.elect.chamber === 'H') ? `, ${esc(seatLabel(note === 'next' && p.elect ? p.elect : p.newDistrict != null && note === 'next' ? { ...p, district: p.newDistrict } : p))}${(p.chamber === 'H' && !p.delegate) || (p.elect && p.elect.chamber === 'H') ? ' District' : ''}` : ''}${p.status === 'leaving' && note !== 'next' ? '. Leaves office January 3, 2027' : ''}</p>
    ${p.phone && note !== 'next' ? `<p class="rep-ph">${esc(p.phone)}</p>` : ''}
    ${extra ? `<p class="rep-x">${esc(extra)}</p>` : ''}
    ${links.length ? `<p class="rep-l">${links.map(([l, u]) => `<a href="${esc(u)}" rel="noopener">${esc(l)}</a>`).join('')}</p>` : ''}
    <p><a class="btn ghost" href="${href(p)}">Votes, money and record</a></p></div></article>`;
}
async function find(q) {
  const raw = (q.get('q') || q.get('zip') || q.get('address') || '').trim();
  let r = null;
  if (/^\d{5}(-\d{4})?$/.test(raw)) r = await F.byZip(raw.slice(0, 5));
  else if (raw.length > 6) r = await F.byAddress(raw);
  let res = '';
  if (r && r.error) res = `<p class="err">${r.error === 'zip' ? `${esc(raw)} is not a residential ZIP code in the Census map. Enter your street address instead, for example 100 Main St, Springfield, IL 62701.` : `The Census address finder could not match “${esc(raw)}”. Check the street number and add the city, state and ZIP code.`}</p>`;
  else if (r) {
    const st = D.STATES[r.state];
    const nowH = r.now.flatMap(x => F.house(x.st, x.d).map(p => ({ p, x })));
    const sen = F.senate(r.state);
    const nh = r.next ? F.house2027(r.next[0], r.next[1]) : null;
    const sen27 = F.senate2027(r.state);
    const changes = (nh && !nowH.some(h => h.p.id === nh.id)) || sen27.some(p => !sen.some(s => s.id === p.id));
    res = `<p class="found">${r.kind === 'zip' ? `ZIP code ${esc(r.zip)}, ${esc(st)}` : esc(r.matched)}${r.split ? `. This ZIP code is split between ${r.now.length} House districts; your street address decides which is yours.` : ''}</p>
    ${r.split ? `<form class="bigsearch" action="/find"><label for="fa" class="vh">Street address</label><input id="fa" name="q" type="search" placeholder="Street address, city, state" autocomplete="street-address"><button type="submit">Find my district</button></form>` : ''}
    <h2>Representing you now</h2>
    <div class="reps">${nowH.map(({ p, x }) => repCard(p, null, r.split ? `${pct(x.share)} of this ZIP code's land area is in this district.` : '')).join('')}${sen.map(p => repCard(p)).join('')}</div>
    ${changes ? `<h2>From January 3, 2027</h2><p class="sub">The 120th Congress, elected November 3, 2026${r.next && r.next[1] !== (r.now[0] || {}).d ? `. Your House district becomes the ${esc(seatLabel({ chamber: 'H', state: r.next[0], district: r.next[1] }))} District under the new map` : ''}.</p>
    <div class="reps">${nh ? repCard(nh, 'next') : ''}${sen27.map(p => repCard(p, 'next')).join('')}</div>` : ''}`;
  }
  const body = `<div class="wrap"><h1>Find your representatives</h1>
  <p class="lede">Enter a ZIP code or street address to see your House member and senators, how to reach them, and who takes those seats in January.</p>
  <form class="bigsearch" action="/find" role="search"><label for="fq" class="vh">ZIP code or street address</label><input id="fq" name="q" type="search" value="${esc(raw)}" placeholder="ZIP code or street address" autocomplete="postal-code"><button type="submit">Find</button></form>
  ${res}</div>`;
  return layout({ title: 'Find your representatives', desc: 'Look up your U.S. representative and senators by ZIP code or address, with contact details, websites and social accounts.', path: '/find', body, active: '/find', noindex: !!raw });
}

function about() {
  const body = `<div class="wrap narrow prose"><h1>How VoteDash works</h1>
  <p>VoteDash collects public records on every member of the U.S. House and Senate and the members-elect of the 120th Congress, and puts them on one page per person.</p>
  <h2>Votes</h2><p>Every roll call of the 119th Congress comes from Voteview at UCLA, which also publishes DW-NOMINATE, the standard measure of where each member's voting record falls from liberal (-1) to conservative (+1). Seat charts order members by that score. A party-line vote is a roll call where a majority of Democrats and a majority of Republicans voted on opposite sides; party loyalty is the share of those votes cast with the member's party majority. Independents are counted with the party they caucus with.</p>
  <h2>Money</h2><p>Fundraising totals come from the Federal Election Commission's candidate summary files for the 2022, 2024 and 2026 cycles. PAC donors are direct contributions from political committees to the member's campaign. Outside spending is independent expenditures reported for or against the member. Industries are assigned from each PAC's connected organization.</p>
  <h2>Connections</h2><p>"Votes most like" is the share of roll calls where two members of the same chamber cast the same yea or nay, over at least 50 shared votes. "Shares the most donors" compares the PACs funding each member, weighted by dollars.</p>
  <h2>Elections</h2><p>Results through 2024 come from the MIT Election Data and Science Lab. 2026 results come from the VoteDash election-night count, archived at <a href="/2026/">votedash.net/2026</a>.</p>
  <h2>Bills, speeches and lobbying</h2><p>Bills, cosponsors and policy areas come from the Congress.gov API. Floor speeches come from the Congressional Record on GovInfo. Lobbying comes from Lobbying Disclosure Act filings on LDA.gov.</p>
  <h2>Record</h2><p>Each item on a member's record links to the official document or news report it is drawn from: House and Senate ethics committees, court and Justice Department records, censure resolutions and major news organizations.</p></div>`;
  return layout({ title: 'How VoteDash works', desc: 'Where VoteDash gets its data (Congress.gov, the FEC, Voteview, the Congressional Record and election results) and how each number on the site is built.', path: '/about', body });
}
// every outside source the site is built from, grouped by what it supplies
function bibliography() {
  const polls = D.polls || {};
  const pollRefs = [];
  for (const v of Object.values(polls)) if (v && v.url && v.pollster && !pollRefs.some(r => r[2] === v.url)) pollRefs.push([v.pollster, v.label || 'National survey', v.url, `${v.pop || 'Survey'}, ${v.dates}`]);
  const S = [
    ['Members and committees', [
      ['@unitedstates project', 'congress-legislators', 'https://github.com/unitedstates/congress-legislators', 'Members, terms, committee assignments, district offices, social accounts and ID crosswalks'],
      ['U.S. Government Publishing Office', 'Guide to House and Senate Members', 'https://memberguide.gpo.gov/', 'Official portraits'],
      ['Congressional Black Caucus', 'Membership', 'https://cbc.house.gov/membership/', 'Caucus roster'],
      ['Congressional Hispanic Caucus', 'Members', 'https://chc.house.gov/members', 'Caucus roster'],
      ['Congressional Asian Pacific American Caucus', 'Membership', 'https://capac.house.gov/membership', 'Caucus roster'],
      ['Congressional Progressive Caucus', 'Caucus Members', 'https://progressives.house.gov/caucus-members', 'Caucus roster'],
      ['New Democrat Coalition', 'Members', 'https://newdemocratcoalition.house.gov/members', 'Caucus roster'],
      ['Blue Dog Coalition', 'Members', 'https://bluedogs-gluesenkampperez.house.gov/members', 'Caucus roster'],
      ['Problem Solvers Caucus', 'Caucus Members', 'https://problemsolverscaucus.house.gov/about/caucus-members.htm', 'Caucus roster'],
      ['Republican Main Street Caucus', 'Membership', 'https://mainstreetcaucus.house.gov/membership', 'Caucus roster'],
      ['Congressional Hispanic Conference', 'Members', 'https://hispanicconference-gonzales.house.gov/members', 'Caucus roster'],
      ['Wikipedia', 'Freedom Caucus; Republican Study Committee; Congressional Hispanic Conference', 'https://en.wikipedia.org/wiki/Freedom_Caucus', 'Rosters for caucuses that publish none'],
    ]],
    ['Votes', [
      ['Lewis, Poole, Rosenthal, Boche, Rudkin and Sonnet (UCLA)', 'Voteview: Congressional Roll-Call Votes Database', 'https://voteview.com/data', 'Every roll call of the 119th Congress, member votes and DW-NOMINATE scores'],
      ['Office of the Clerk, U.S. House of Representatives', 'Roll Call Votes', 'https://clerk.house.gov/Votes', 'Same-day House roll calls'],
      ['U.S. Senate', 'Roll Call Votes, 119th Congress', 'https://www.senate.gov/legislative/votes_new.htm', 'Same-day Senate roll calls'],
    ]],
    ['Bills, schedule and speeches', [
      ['U.S. Government Publishing Office', 'GovInfo Bulk Data: Bill Status (BILLSTATUS)', 'https://www.govinfo.gov/bulkdata/BILLSTATUS', 'Bills, sponsors, cosponsors, actions and policy areas'],
      ['Library of Congress', 'Congress.gov API', 'https://api.congress.gov/', 'Committee meetings and hearings'],
      ['U.S. Government Publishing Office', 'Congressional Record (CREC) on GovInfo', 'https://www.govinfo.gov/app/collection/crec', 'Floor speeches'],
      ['Office of the Clerk, U.S. House of Representatives', 'House Floor Activities and Bills This Week', 'https://docs.house.gov/floor/', 'House floor schedule'],
      ['Senate Democrats', 'Senate Floor Schedule', 'https://www.democrats.senate.gov/floor/senate-schedule', 'Senate floor schedule'],
    ]],
    ['Money and lobbying', [
      ['Federal Election Commission', 'Bulk Data', 'https://www.fec.gov/data/browse-data/?tab=bulk-data', 'Candidate summaries 2022-2026, committee master files, candidate-committee linkages, PAC contributions, individual contributions and independent expenditures'],
      ['Federal Election Commission', 'OpenFEC API', 'https://api.open.fec.gov/developers/', 'Committee disbursements'],
      ['Wikidata', 'Wikidata', 'https://www.wikidata.org/', 'PAC websites and social accounts'],
      ['U.S. Senate and U.S. House of Representatives', 'Lobbying Disclosure Act filings, LDA.gov', 'https://lda.gov/', 'Lobbying clients, registrants, issues and spending'],
    ]],
    ['Elections', [
      ['MIT Election Data and Science Lab', 'U.S. House 1976-2024', 'https://doi.org/10.7910/DVN/IG0UN2', 'House general election results'],
      ['MIT Election Data and Science Lab', 'U.S. Senate statewide 1976-2024', 'https://doi.org/10.7910/DVN/PEJ5QU', 'Senate general election results'],
      ['Federal Election Commission', 'Federal Elections 2012-2022', 'https://www.fec.gov/introduction-campaign-finance/election-results-and-voting-information/', 'Primary and general election results'],
      ['civicAPI', 'civicAPI', 'https://civicapi.org/', 'Primaries, special elections and 2026 results'],
      ['Ballotpedia', 'Ballotpedia', 'https://ballotpedia.org/', '2026 ballot measures'],
    ]],
    ['Polling', [
      ['Cooperative Election Study (Harvard University)', 'Cumulative CES Common Content', 'https://doi.org/10.7910/DVN/II2DB6', 'Member approval by state and district, 2019-2025'],
      ...pollRefs,
    ]],
    ['Find your representatives', [
      ['U.S. Census Bureau', 'TIGERweb', 'https://tigerweb.geo.census.gov/', 'Congressional district boundaries'],
      ['U.S. Census Bureau', 'Census Geocoder', 'https://geocoding.geo.census.gov/geocoder/', 'Street address lookup'],
      ['U.S. Census Bureau', 'Gazetteer Files and Relationship Files (ZCTA to 119th Congressional District)', 'https://www.census.gov/geographies/reference-files/time-series/geo/relationship-files.html', 'ZIP code lookup'],
    ]],
    ['Record and markets', [
      ['Wikipedia', 'Member articles', 'https://en.wikipedia.org/', 'Record items, each linked to the official document or news report it cites'],
      ['Kalshi', 'Kalshi Trade API', 'https://kalshi.com/', 'Election market odds'],
      ['Polymarket', 'Polymarket', 'https://polymarket.com/', 'Election market odds'],
    ]],
    ['2026 election-night dashboard', [
      ['civicAPI', 'civicAPI', 'https://civicapi.org/', 'Live vote counts'],
      ['CNN', '2026 Election Results', 'https://www.cnn.com/election/2026', 'Live vote counts and race calls'],
      ['Decision Desk HQ', 'Race projections', 'https://decisiondeskhq.com/', 'Race calls'],
      ['Los Angeles County Registrar-Recorder/County Clerk', 'Election Results', 'https://results.lavote.gov/', 'Los Angeles County results'],
      ['Polymarket', 'Polymarket', 'https://polymarket.com/', 'Market odds and call times'],
      ['Pollgebra', 'Pollgebra', 'https://pollgebra.com/', 'Model calls'],
    ]],
  ];
  const body = `<div class="wrap narrow prose"><h1>Bibliography</h1>
  <p>Every outside source VoteDash is built from, grouped by what it supplies. How each number is calculated is on <a href="/about">How VoteDash works</a>.</p>
  ${S.map(([h, refs]) => `<h2>${esc(h)}</h2><ul class="bib">${refs.map(([who, what, u, use]) => `<li>${esc(who)}. <a href="${esc(u)}"><cite>${esc(what)}</cite></a>. ${esc(use)}.</li>`).join('')}</ul>`).join('\n  ')}</div>`;
  return layout({ title: 'Bibliography', desc: 'Every data source behind VoteDash: Voteview, the FEC, Congress.gov, GovInfo, LDA.gov, the MIT Election Lab, the Cooperative Election Study, the Census Bureau and more.', path: '/bibliography', body });
}
function notFound() { return layout({ title: 'Page not found', body: `<div class="wrap narrow"><h1>That page isn't here</h1><p>Search for a member, state, PAC or bill.</p><form class="bigsearch" action="/search"><label for="nq" class="vh">Search</label><input id="nq" name="q" type="search" data-suggest><button>Search</button></form></div>`, noindex: true }); }

// sitemap index plus one sitemap per kind of page; cached per data build
let SM = null;
function sitemaps() {
  if (SM && SM.built === D.meta.built) return SM;
  const lm = (D.meta.built || new Date().toISOString()).slice(0, 10);
  // cheap checks for which member tabs have content (coming-up and markets change too often to list)
  const has = {
    elections: p => (p.elections || []).length || (p.primaries || []).length, polling: p => memberPolling(p), votes: p => p.votes, money: p => p.money,
    bills: p => D.bills && D.bills.byMember[p.id] && D.bills.byMember[p.id].sponsored.length, speeches: p => D.speeches && D.speeches.byMember[p.id] && D.speeches.byMember[p.id].count,
    record: p => D.record && (D.record.byPerson[p.id] || []).length, connections: p => (p.votesLike || []).length || (p.sharedDonors || []).length };
  const tabsOf = p => Object.keys(has).filter(id => has[id](p));
  const groups = {
    pages: [...'/ /leadership /tracker /find /committees /schedule /members /votes /money /issues /incoming /compare /about /bibliography'.split(' '), ...PM_TABS.map(([k]) => k ? '/2026-post-mortem/' + k : '/2026-post-mortem'),
      ...(D.caucuses ? D.caucuses.caucuses.map(c => `/caucus/${c.id}`) : []), ...Object.keys(D.STATES).filter(s => D.states[s]).map(s => `/state/${s.toLowerCase()}`), ...Object.keys(D.meta.committees).map(c => `/committee/${c.toLowerCase()}`),
      ...(D.leadership && D.leadership.elections ? D.leadership.elections.map(e => `/leadership/${e.id}`) : []), ...(D.bills ? [...BV.STEPS, ...BV.SIDE].map(st => `/tracker/${st.id}`) : [])],
    members: D.people.flatMap(p => [href(p), ...tabsOf(p).map(id => `${href(p)}/${id}`), ...(p.status !== 'elect' ? [`${href(p)}/network`] : [])]),
    votes: D.rollcalls.map(r => `/vote/${r.k}`),
    bills: D.bills ? Object.keys(D.bills.bills).map(k => `/bill/${k}`) : [],
    money: [...[...D.funders.values()].filter(f => f.total + f.ie >= 25000).map(f => `/f/${f.slug}`), ...[...D.industryTotals.keys()].map(i => `/industry/${i}`), ...(D.bills ? Object.keys(D.bills.issues).map(a => `/issue/${slugIssue(a)}`) : [])],
  };
  const urlset = l => `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${l.map(x => `<url><loc>${SITE}${x.replace(/&/g, '&amp;')}</loc><lastmod>${lm}</lastmod></url>`).join('')}</urlset>`;
  const files = {};
  for (const [k, l] of Object.entries(groups)) for (let i = 0; i * 40000 < l.length; i++) files[`${k}${i ? '-' + (i + 1) : ''}.xml`] = urlset(l.slice(i * 40000, (i + 1) * 40000));
  const index = `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Object.keys(files).map(f => `<sitemap><loc>${SITE}/sitemaps/${f}</loc><lastmod>${lm}</lastmod></sitemap>`).join('')}</sitemapindex>`;
  SM = { built: D.meta.built, index, files, counts: Object.fromEntries(Object.entries(groups).map(([k, l]) => [k, l.length])) };
  return SM;
}
function sitemap() { return sitemaps().index; }
function sitemapFile(name) { return sitemaps().files[name] || null; }
function llms() {
  const c = sitemaps().counts;
  return `# VoteDash

> VoteDash (https://votedash.net) is a free reference on every member of the U.S. Congress: how they vote, who funds them, their election results, bills, floor speeches and record, plus the members-elect of the 120th Congress and a 2026 midterm election review.

## Sections
- [Members of Congress](${SITE}/members): all ${D.people.length} current members and members-elect. Each has a profile at /m/{slug} and tab pages at /m/{slug}/{tab}, tabs: elections, polling, votes, money, bills, speeches, record, connections.
- [Find your representatives](${SITE}/find): by ZIP code or address.
- [Roll call votes](${SITE}/votes): every House and Senate roll call in the 119th Congress, at /vote/{id}.
- [Bills](${SITE}/tracker): every bill in the 119th Congress at /bill/{type}{number}, by stage at /tracker/{stage}.
- [Issues](${SITE}/issues): bills and votes by policy area, at /issue/{slug}.
- [Money](${SITE}/money): PACs at /f/{slug}, industries at /industry/{id}; contributions, outside spending and 2026 win rates.
- [Committees](${SITE}/committees) at /committee/{code}, caucuses at /caucus/{id}, [Leadership](${SITE}/leadership), [Schedule](${SITE}/schedule).
- [The 2026 midterms](${SITE}/2026-post-mortem): seats, flips, candidates, caucuses, ballot measures, money, pro-Israel PACs and progressives, each at /2026-post-mortem/{tab}.
- [Compare two members](${SITE}/compare?a={slug}&b={slug}).

## Data sources
Congress.gov and the unitedstates/congress-legislators project (members, bills, committees), House Clerk and Senate roll call records, Voteview (DW-NOMINATE ideology scores), the Federal Election Commission (fundraising, PAC contributions, independent expenditures), the Congressional Record (floor speeches), Lobbying Disclosure Act filings, MIT Election Data and Science Lab and FEC federal election results (election history), and 2026 results as reported on election night and after.

## Sitemaps
${SITE}/sitemap.xml indexes ${Object.values(c).reduce((a, b) => a + b, 0).toLocaleString('en-US')} URLs: ${Object.entries(c).map(([k, n]) => `${k} ${n.toLocaleString('en-US')}`).join(', ')}.
`;
}

// ---------------- 2026 post-mortem ----------------
const PM_TABS = [['', 'Overview'], ['seats', 'Seats'], ['candidates', 'Candidates'], ['caucuses', 'Caucuses'], ['ballot', 'Ballot Measures'], ['votes', 'How They Voted'], ['money', 'Money'], ['israel', 'Pro-Israel PACs'], ['progressives', 'Progressives']];
const PM_SECS = { seats: ['results', 'flips'], candidates: ['candidates'], caucuses: ['caucuses'], ballot: ['ballot'], votes: ['votes'], money: ['money'], israel: ['israel'], progressives: ['progressives'] };
function postMortem(tab = '') {
  const X = D.postmortem; if (!X) return null;
  const TAB = PM_TABS.find(t => t[0] === tab); if (!TAB) return null;
  const pl = (name, slug) => slug ? `<a href="/m/${slug}">${esc(name)}</a>` : esc(name);
  const pc = p => ['D', 'R', 'I'].includes(p) ? chip({ party: p }) : '';
  const W = { D: 'Democrats', R: 'Republicans', I: 'Independents' };
  const S = X.seats, hB = S.H.before, hA = S.H.after, sB = S.S.before, sA = S.S.after;
  const seatBar = (o, total) => {
    const parts = [['D', 'Democrats', 'dm'], ['I', 'Independents', 'ns'], ['vacant', 'Vacant', 'ns'], ['undecided', 'Undecided', 'ns'], ['R', 'Republicans', 'rp']].filter(([k]) => o[k]);
    return `<div class="poll"><div class="poll-bar" role="img" aria-label="${esc(parts.map(([k, l]) => `${l} ${o[k]}`).join(', '))}">${parts.map(([k, , c]) => `<i class="${c}" style="width:${(o[k] / total * 100).toFixed(2)}%"></i>`).join('')}</div>
    <ul class="poll-key">${parts.map(([k, l, c]) => `<li><span class="k ${c}" aria-hidden="true"></span>${l} <b>${o[k]}</b></li>`).join('')}</ul></div>`;
  };
  const sec = [], nav = [];
  const secMap = {};
  const add = (id, label, html) => { if (!html) return; nav.push([id, label]); secMap[id] = `<section id="${id}" class="sec">${html}</section>`; };
  const facts = items => `<dl class="facts pm-kpi">${items.filter(Boolean).map(([dt, dd, sub]) => `<div><dt>${dt}</dt><dd>${dd}</dd>${sub ? `<dd class="s">${sub}</dd>` : ''}</div>`).join('')}</dl>`;
  const mini = (rows, max) => `<div class="pm-mini">${rows.map(([l, v, shown, cls]) => `<div><span>${l}</span><span class="pm-track"><i class="${cls || ''}" style="width:${Math.max(1, v / (max || 1) * 100).toFixed(1)}%"></i></span><b>${shown}</b></div>`).join('')}</div>`;
  const OUTK = `<ul class="poll-key pm-key"><li><span class="k fW" aria-hidden="true"></span>Re-elected</li><li><span class="k fL" aria-hidden="true"></span>Lost general</li><li><span class="k fLp" aria-hidden="true"></span>Lost primary</li><li><span class="k ns" aria-hidden="true"></span>Left: ran for other office or retired</li></ul>`;
  const outBar = c => { const o = c.otherOffice + c.retired; return `<span class="mt-bar" role="img" aria-label="${c.reElected} re-elected, ${c.lostGeneral} lost the general, ${c.lostPrimary} lost a primary, ${o} left"><i class="fW" style="flex:${c.reElected}"></i><i class="fL" style="flex:${c.lostGeneral}"></i><i class="fLp" style="flex:${c.lostPrimary}"></i><i class="ns" style="flex:${o}"></i></span>`; };
  const outRows = list => `<div class="pm-mini pm-out">${list.map(c => `<div><span>${c.link || esc(c.name)}</span>${outBar(c)}<b>${c.reElected} won <small>${c.lostGeneral + c.lostPrimary} lost</small></b></div>`).join('')}</div>`;
  const full = (label, n, html) => `<details class="pm-more"><summary><b>${label}</b>${n != null ? ` <span class="cnt">${n}</span>` : ''}</summary>${html}</details>`;
  const dH = hA.D - hB.D, dS = sA.D - sB.D;
  const lede = `Democrats gained ${dH} House seats and ${dS} Senate seats on November 3, 2026. ${X.counts.defeated} members lost the general election, ${X.counts.primaryLosers} lost renomination, and ${X.counts.newcomers} members-elect take office January 3, 2027.`;

  add('results', 'Results', `<h2>The new Congress</h2>
  <div class="two"><div><h3>House</h3><p class="sub">119th Congress</p>${seatBar(hB, 435)}<p class="sub">120th Congress</p>${seatBar(hA, 435)}</div>
  <div><h3>Senate</h3><p class="sub">119th Congress</p>${seatBar(sB, 100)}<p class="sub">120th Congress</p>${seatBar(sA, 100)}<p class="sub">Both independents caucus with Democrats.</p></div></div>`);

  const fl = X.flips;
  const flipDir = fl.reduce((o, f) => (o[f.from + f.to] = (o[f.from + f.to] || 0) + 1, o), {});
  const waffle = list => `<div class="pm-waffle" role="img" aria-label="${esc(Object.entries(flipDir).map(([k, n]) => `${n} from ${W[k[0]]} to ${W[k[1]]}`).join(', '))}">${[...list].sort((a, b) => a.to.localeCompare(b.to) || b.ch.localeCompare(a.ch)).map(f => `<i class="${f.to === 'D' ? 'dm' : f.to === 'R' ? 'rp' : 'ns'}${f.ch === 'S' ? ' sen' : ''}" title="${esc(f.seat)}: ${W[f.from]} to ${W[f.to]}"></i>`).join('')}</div>
  <ul class="poll-key"><li><span class="k dm" aria-hidden="true"></span>Flipped to Democrats</li><li><span class="k rp" aria-hidden="true"></span>Flipped to Republicans</li><li><span class="k sen" aria-hidden="true"></span>Senate seat</li></ul>`;
  add('flips', 'Flipped seats', `<h2>Flipped seats <span class="cnt">${fl.length}</span></h2>
  <p class="sub">${Object.entries(flipDir).map(([k, n]) => `${n} from ${W[k[0]].toLowerCase()} to ${W[k[1]].toLowerCase()}`).join(', ')}. Each square is one seat.</p>
  ${waffle(fl)}
  ${full('All flipped seats', fl.length, `<div class="tbl"><table><thead><tr><th>Seat</th><th>Change</th><th>Winner</th><th class="n">Share</th><th class="n">Margin</th><th>Defeated incumbent</th></tr></thead><tbody>
  ${fl.map(f => `<tr><td>${esc(f.seat)}</td><td>${pc(f.from)} to ${pc(f.to)}</td><td>${pl(f.winner, f.winnerSlug)}</td><td class="n">${f.pct != null ? f.pct.toFixed(1) + '%' : ''}</td><td class="n">${f.margin != null ? pct(f.margin, 1) : ''}</td><td>${f.defeated ? pl(f.defeated, f.defeatedSlug) : 'Open seat'}</td></tr>`).join('')}
  </tbody></table></div>`)}`);

  const df = X.defeated, pls = X.primaryLosers;
  const dfP = p => df.filter(x => x.party === p).length, other = pls.filter(x => !x.sameSeat).length;
  // head-to-head bar: the member's share against the winner's, party colors, 50% tick
  const pcls = p => p === 'D' ? 'dm' : p === 'R' ? 'rp' : 'ns';
  const h2h = (lp, l, wp, w, lbl) => l == null ? '' : `<span class="h2h" role="img" aria-label="${esc(lbl)}"><i class="${pcls(lp)}" style="width:${(l * 100).toFixed(1)}%"></i><i class="${pcls(wp)} w" style="width:${w != null ? (w * 100).toFixed(1) : 0}%"></i><b class="h50"></b></span><small class="h2h-n"><span>${(l * 100).toFixed(1)}%</span><span>${w != null ? (w * 100).toFixed(1) + '%' : ''}</span></small>`;
  const pairs = df.reduce((o, x) => { const k = `${x.party}>${x.winnerParty || '?'}`; o[k] = (o[k] || 0) + 1; return o; }, {});
  const PW = { D: 'Democrats', R: 'Republicans', I: 'independents' };
  const pairLine = Object.entries(pairs).sort((a, b) => b[1] - a[1]).map(([k, n]) => { const [a1, b1] = k.split('>'); return `<li><span class="k ${pcls(a1)}" aria-hidden="true"></span><b>${n}</b> ${PW[a1] || ''} lost to ${a1 === b1 ? 'fellow ' : ''}${PW[b1] || 'others'}</li>`; }).join('');
  const cMax = Math.max(...X.close.map(c => c.margin));
  add('candidates', 'Candidates', `<h2>Members who lost <span class="cnt">${df.length + pls.filter(x => x.sameSeat).length}</span></h2>
  ${facts([X.counts.reElected ? ['Re-elected', X.counts.reElected, 'members who ran again and won'] : null, ['Lost the general election', df.length, `${dfP('R')} Republicans, ${dfP('D')} Democrats`], ['Lost renomination', pls.filter(x => x.sameSeat).length, 'in their own seat'], other ? ['Lost a bid for another office', other, 'in a primary'] : null, X.close[0] ? ['Closest race', pct(X.close[0].margin, 2), `${esc(X.close[0].seat)}, ${X.close[0].votes.toLocaleString('en-US')} votes`] : null])}
  <h3>In the general election</h3>
  <ul class="poll-key pm-pairs">${pairLine}</ul>
  <p class="sub">Each bar shows the member's share of the vote, from the left, against the winner's, from the right. The tick marks 50%.</p>
  <div class="tbl"><table class="pm-h2h"><thead><tr><th>Member</th><th>Seat</th><th>Vote share</th><th>Lost to</th></tr></thead><tbody>
  ${df.map(x => `<tr><td>${pc(x.party)} ${pl(x.name, x.slug)}</td><td>${esc(x.seat)}</td><td>${h2h(x.party, x.pct != null ? x.pct / 100 : null, x.winnerParty, x.winnerPct != null ? x.winnerPct / 100 : null, `${x.name} ${x.pct}%, ${x.winner || ''} ${x.winnerPct != null ? x.winnerPct + '%' : ''}`)}</td><td>${x.winner ? `${pc(x.winnerParty)} ${pl(x.winner, x.winnerSlug)}` : ''}</td></tr>`).join('')}
  </tbody></table></div>
  <h3>In the primary</h3>
  <div class="tbl"><table class="pm-h2h"><thead><tr><th>Member</th><th>Race</th><th>Vote share</th><th>Nominee</th></tr></thead><tbody>
  ${pls.map(x => `<tr><td>${pc(x.party)} ${pl(x.name, x.slug)}</td><td>${esc(x.seat)}${x.sameSeat ? '' : '<br><small>sought another office</small>'}${x.runoff ? '<br><small>runoff</small>' : ''}</td><td>${h2h(x.party, x.pct, x.winnerParty || x.party, x.winnerPct, `${x.name} ${x.pct != null ? pct(x.pct, 1) : ''}, ${x.winner || ''} ${x.winnerPct != null ? pct(x.winnerPct, 1) : ''}`)}</td><td>${x.winner ? `${pc(x.winnerParty || x.party)} ${esc(x.winner)}` : ''}</td></tr>`).join('')}
  </tbody></table></div>
  <h3>Closest races</h3>
  <p class="sub">The narrowest margins of the general election. Shorter bars are closer races.</p>
  <div class="tbl"><table class="pm-h2h"><thead><tr><th>Seat</th><th>Winner</th><th>Runner-up</th><th>Margin</th></tr></thead><tbody>
  ${X.close.map(c => `<tr><td>${esc(c.seat)}${c.flip ? ` <span class="flip">${H.icon('swap')}flipped</span>` : ''}</td><td>${pc(c.winnerParty)} ${pl(c.winner, c.winnerSlug)}</td><td>${pc(c.runnerUpParty)} ${esc(c.runnerUp)}</td><td><span class="mgn" role="img" aria-label="${pct(c.margin, 2)} margin"><i class="${pcls(c.winnerParty)}" style="width:${Math.max(2, c.margin / cMax * 100).toFixed(1)}%"></i></span><small class="h2h-n"><span>${pct(c.margin, 2)}</span><span>${c.votes.toLocaleString('en-US')} votes</span></small></td></tr>`).join('')}
  </tbody></table></div>`);

  const cs = [...X.caucuses].sort((a, b) => (b.lostGeneral + b.lostPrimary) / b.members - (a.lostGeneral + a.lostPrimary) / a.members);
  add('caucuses', 'Caucuses', `<h2>Caucuses</h2>
  <p class="sub">What happened to each caucus's members in 2026, ordered by the share who lost.</p>
  ${OUTK}
  ${outRows(cs.map(c => ({ ...c, link: `${pc(c.party)} <a href="/caucus/${c.id}">${esc(c.name)}</a>` })))}
  ${full('Full table', null, `<div class="tbl"><table><thead><tr><th>Caucus</th><th class="n">Members</th><th class="n">Re-elected</th><th class="n">Lost general</th><th class="n">Lost primary</th><th class="n">Ran for other office</th><th class="n">Retired</th><th class="n">Lost</th></tr></thead><tbody>
  ${cs.map(c => `<tr><td>${pc(c.party)} <a href="/caucus/${c.id}">${esc(c.name)}</a></td><td class="n">${c.members}</td><td class="n">${c.reElected}</td><td class="n">${c.lostGeneral}</td><td class="n">${c.lostPrimary}</td><td class="n">${c.otherOffice}</td><td class="n">${c.retired}</td><td class="n">${pct((c.lostGeneral + c.lostPrimary) / c.members)}</td></tr>`).join('')}
  </tbody></table></div>`)}
  ${full('Who lost, by caucus', null, cs.filter(c => c.lost.length).map(c => `<p class="pm-lost"><b>${esc(c.name)}:</b> ${c.lost.map(x => `${pl(x.name, x.slug)}${x.how === 'lostPrimary' ? ' (primary)' : ''}`).join(', ')}</p>`).join(''))}`);

  const OPEN = new Set(['abortion', 'voting', 'gender', 'tax', 'elections', 'direct', 'crime', 'immigration', 'guns', 'drugs', 'labor', 'rights']);
  const mRow = m => `<tr><td>${m.st}</td><td>${esc(m.label)}<br><small>${esc(m.title)}</small></td><td>${m.passed ? 'Passed' : 'Failed'}${m.needed ? `<br><small>needed ${m.needed}%</small>` : ''}</td><td class="n">${m.yes.toFixed(1)}%</td></tr>`;
  const mTable = ms => `<div class="tbl"><table><thead><tr><th>State</th><th>Measure</th><th>Result</th><th class="n">Yes</th></tr></thead><tbody>${ms.map(mRow).join('')}</tbody></table></div>`;
  const BM = X.ballotMoney;
  add('ballot', 'Ballot measures', `<h2>Ballot measures <span class="cnt">${X.ballot.reduce((s, g) => s + g.measures.length, 0)}</span></h2>
  <p class="sub">Statewide measures decided in 2026, grouped by issue. Open an issue for its measures.</p>
  ${facts([['Measures', X.ballot.reduce((s, g) => s + g.measures.length, 0)], ['Passed', X.ballot.reduce((s, g) => s + g.passed, 0)], ['Failed', X.ballot.reduce((s, g) => s + g.failed, 0)]])}
  <ul class="poll-key pm-key"><li><span class="k fW" aria-hidden="true"></span>Passed</li><li><span class="k fL" aria-hidden="true"></span>Failed</li></ul>
  ${X.ballot.map(g => `<details class="pm-more"><summary class="pm-issue"><b>${esc(g.label)}</b><span class="pm-track"><span class="hb split" role="img" aria-label="${g.passed} passed, ${g.failed} failed" style="width:${((g.passed + g.failed) / Math.max(...X.ballot.map(x => x.passed + x.failed)) * 100).toFixed(1)}%"><i class="fW" style="flex:${g.passed}"></i><i class="fL" style="flex:${g.failed}"></i></span></span><span class="cnt">${g.passed} passed, ${g.failed} failed</span></summary>${mTable(g.measures)}</details>`).join('')}
  ${BM.length ? `<h3>Most expensive ballot fights</h3>
  <div class="tbl"><table><thead><tr><th>Measure</th><th class="n">For</th><th class="n">Against</th><th>Result</th></tr></thead><tbody>
  ${BM.map(b => `<tr><td>${esc(b.label)}<br><small>${b.st} ${esc(b.title)}</small></td><td class="n">${money(b.support)}</td><td class="n">${money(b.oppose)}</td><td>${b.passed ? 'Passed' : 'Failed'}${(b.support > b.oppose) !== b.passed ? '<br><small>bigger spender lost</small>' : ''}</td></tr>`).join('')}
  </tbody></table></div>` : ''}`);

  const V = X.votes, R = V.summary.R;
  const vRow = v => `<tr><td><a href="/vote/${v.k}">${esc(v.label)}</a><br><small>${v.ch === 'S' ? 'Senate' : 'House'}, ${date(v.date)}${v.law ? ', became law' : ''}</small></td><td class="n">${pct(v.lostR)}</td><td class="n">${pct(v.wonR)}</td><td class="n">${pct(v.wonD)}</td></tr>`;
  const vHead = '<thead><tr><th>Vote</th><th class="n">Defeated Republicans</th><th class="n">Re-elected Republicans</th><th class="n">Re-elected Democrats</th></tr></thead>';
  add('votes', 'How they voted', `<h2>How the defeated voted</h2>
  <p class="sub">${R.lost.n} of the ${X.counts.defeated} members who lost the general election were Republicans. Their 119th Congress record against the ${R.won.n} Republicans who won.</p>
  <h3>Votes with their party</h3>
  ${mini([['Defeated Republicans', R.lost.unity - 0.85, pct(R.lost.unity, 1), 'rp'], ['Re-elected Republicans', R.won.unity - 0.85, pct(R.won.unity, 1), 'rp']], 0.15)}
  <p class="sub">Scale starts at 85%.</p>
  <h3>Ideology score</h3>
  ${mini([['Defeated Republicans', R.lost.nominate, R.lost.nominate.toFixed(2), 'rp'], ['Re-elected Republicans', R.won.nominate, R.won.nominate.toFixed(2), 'rp']], 1)}
  <p class="sub">DW-NOMINATE, from 0 (center) to 1 (most conservative).</p>
  ${full('Table', null, `<div class="tbl"><table><thead><tr><th></th><th class="n">Defeated Republicans</th><th class="n">Re-elected Republicans</th></tr></thead><tbody>
  <tr><td>Votes with their party</td><td class="n">${pct(R.lost.unity, 1)}</td><td class="n">${pct(R.won.unity, 1)}</td></tr>
  <tr><td>Ideology score (DW-NOMINATE; higher is more conservative)</td><td class="n">${R.lost.nominate.toFixed(2)}</td><td class="n">${R.won.nominate.toFixed(2)}</td></tr>
  </tbody></table></div>`)}
  <h3>Where defeated Republicans broke from the rest</h3>
  <p class="sub">Share voting yes on final passage.</p>
  <div class="tbl"><table>${vHead}<tbody>${V.splits.map(vRow).join('')}</tbody></table></div>
  <details class="pm-more"><summary><b>Contested laws</b> <span class="cnt">${V.keyLaws.length}</span></summary><p class="sub">Final votes on bills that became law with at least 30% voting no.</p>
  <div class="tbl"><table>${vHead}<tbody>${V.keyLaws.map(vRow).join('')}</tbody></table></div></details>`);

  const M = X.money;
  const fl2 = f => f.slug ? `<a href="/f/${f.slug}">${leanDot(f.id)}${esc(nice(f.name))}</a>` : esc(nice(f.name));
  const winBar = (w, l, max) => `<span class="hb split" style="width:${((w + l) / max * 100).toFixed(1)}%" role="img" aria-label="${pct(w / (w + l))} backed winners"><i class="fW" style="flex:${w}"></i><i class="fL" style="flex:${l}"></i></span>`;
  const SCOPES = [['all', 'All Races', 'primaries and general elections together'], ['gen', 'General Elections', 'general and special elections'], ['prim', 'Primaries', 'primaries, runoffs and conventions']];
  const scopePanel = ([k, , what], i) => { const sc = (M.scopes || {})[k]; if (!sc) return ''; const spMax = Math.max(1, ...sc.spenders.map(s => s.total)), inMax = Math.max(1, ...sc.industries.map(s => s.win + s.lose));
    return `<div data-scope-panel="${k}"${i ? ' hidden' : ''}>
  ${(() => { const T = sc.totals || {}; const rows = [['D', k === 'prim' ? 'Democratic primaries' : 'Democratic side'], ['R', k === 'prim' ? 'Republican primaries' : 'Republican side'], ['O', k === 'prim' ? 'Other primaries' : 'Independents and others']].filter(([p]) => T[p]);
    const all = rows.reduce((o, [p]) => ({ win: o.win + T[p].win, lose: o.lose + T[p].lose }), { win: 0, lose: 0 });
    const tr = (l, t, b) => `<tr><td>${b ? `<b>${l}</b>` : l}</td><td class="n">${money(t.win + t.lose)}</td><td class="n">${money(t.win)}</td><td class="n">${money(t.lose)}</td><td class="n">${pct(t.win / (t.win + t.lose))}</td></tr>`;
    return `<h3>Totals</h3>
  <p class="sub">PAC contributions and outside spending in ${what}, by whether the money backed the winner.${k === 'prim' ? '' : ' A party\'s side counts money spent for its candidates and against their opponents' + (k === 'all' ? ', plus all money in its primaries.' : '.')}</p>
  <div class="tbl"><table><thead><tr><th></th><th class="n">Spent</th><th class="n">Backed winners</th><th class="n">Backed losers</th><th class="n">On winners</th></tr></thead><tbody>
  ${rows.map(([p, l]) => tr(l, T[p])).join('')}${tr('All', all, true)}</tbody></table></div>`; })()}
  ${(() => { const E = (M.effective || {})[{ all: 'a', gen: 'g', prim: 'p' }[k]] || []; if (!E.length) return '';
    return `<h3>Most effective PACs</h3><p class="sub">Difficulty-weighted win rate in ${what}: each race a PAC put money into counts by how competitive it was, from Safe (0.1) to Tossup (1.0). Ranked with a pull toward 50% for PACs with few hard races; PACs with at least 5 decided races and $50K.</p>
    <ol class="pm-eff">${E.slice(0, 15).map(x => `<li>${fl2(x)}<span class="pm-track"><i class="fW" style="width:${(x.eff * 100).toFixed(1)}%"></i></span><b>${pct(x.eff)} <small>${x.won} of ${x.n} races</small></b></li>`).join('')}</ol>`; })()}
  <h3>Biggest spenders</h3>
  <p class="sub">PAC contributions and independent expenditures for or against 2026 House and Senate candidates in ${what}. Each dollar is scored by the result of the contest it was spent on.</p>
  <ul class="hbars pm-sp">${sc.spenders.map(s => `<li>${fl2(s)}${winBar(s.win, s.lose, spMax)}<b>${money(s.total)} <small>${pct(s.win / s.total)} on winners</small></b></li>`).join('')}</ul>
  <h3>Industries</h3>
  <p class="sub">PAC contributions to candidates in ${what}, by the industry behind each PAC.</p>
  <ul class="hbars pm-sp">${sc.industries.map(s => `<li><a href="/industry/${s.id}">${esc(s.name)}</a>${winBar(s.win, s.lose, inMax)}<b>${money(s.win + s.lose)} <small>${pct(s.win / (s.win + s.lose))} on winners</small></b></li>`).join('')}</ul>
  ${(sc.winning || []).length ? `<h3>Biggest winning bets</h3>
  <p class="sub">Spenders with the most money behind winning candidates in ${what}.</p>
  <div class="tbl"><table><thead><tr><th>Spender</th><th class="n">Behind winners</th><th class="n">Behind losers</th></tr></thead><tbody>
  ${sc.winning.map(s => `<tr><td>${fl2(s)}</td><td class="n">${money(s.win)}</td><td class="n">${money(s.lose)}</td></tr>`).join('')}
  </tbody></table></div>` : ''}
  <h3>Biggest losing bets</h3>
  <p class="sub">Spenders with the most money behind losing candidates in ${what}.</p>
  <div class="tbl"><table><thead><tr><th>Spender</th><th class="n">Behind losers</th><th class="n">Behind winners</th></tr></thead><tbody>
  ${sc.losing.map(s => `<tr><td>${fl2(s)}</td><td class="n">${money(s.lose)}</td><td class="n">${money(s.win)}</td></tr>`).join('')}
  </tbody></table></div></div>`; };
  const scopeBlock = leanKey() + `<div class="seg sm pm-scope" role="group" aria-label="Which elections" data-scope-tabs>${SCOPES.map(([k, l], i) => `<button type="button" aria-pressed="${i ? 'false' : 'true'}" data-scope="${k}">${l}</button>`).join('')}</div>${SCOPES.map(scopePanel).join('')}`;
  const rRow = r => `<tr><td>${esc(r.seat)}</td><td>${pc(r.winnerParty)} ${pl(r.winner, r.winnerSlug)}</td><td class="n">${money(r.winSide)}</td><td>${pc(r.loserParty)} ${pl(r.loser, r.loserSlug)}</td><td class="n">${money(r.loseSide)}</td><td class="n">${money(r.total)}</td></tr>`;
  const rHead = '<thead><tr><th>Race</th><th>Winner</th><th class="n">Behind winner</th><th>Runner-up</th><th class="n">Behind runner-up</th><th class="n">Total</th></tr></thead>';
  add('money', 'Money', `<h2>Money</h2>
  <p class="sub">Candidate fundraising plus outside spending in 2026 House and Senate general-election races: ${money(M.totals.all)} in all, ${money(M.totals.losing)} of it behind candidates who lost. "Behind" a candidate counts their own fundraising, outside spending for them and outside spending against their opponent.</p>
  <ul class="poll-key pm-key"><li><span class="k fW" aria-hidden="true"></span>Backed the winner</li><li><span class="k fL" aria-hidden="true"></span>Backed the loser</li></ul>
  ${scopeBlock}
  <h3>General-election races</h3>
  <p class="sub">Candidate fundraising plus outside spending, race by race.</p>
  <h4>Costliest races</h4>
  <div class="tbl"><table>${rHead}<tbody>${M.costly.map(rRow).join('')}</tbody></table></div>
  <h4>Outspent the winner and lost</h4>
  <p class="sub">Races where more money stood behind the runner-up than the winner.</p>
  <div class="tbl"><table>${rHead}<tbody>${M.outspent.map(rRow).join('')}</tbody></table></div>
`);

  const I = X.israel;
  if (I && I.groups.length) {
    const S = I.sum, dec = S.win + S.lose, iMax = Math.max(...I.groups.map(g => g.win + g.lose));
    const share = (a, b) => !b ? '' : a / b < 0.001 ? '<0.1%' : `${(a / b * 100).toFixed(1)}%`;
    const gl = g => g.slug ? `<a href="/f/${g.slug}">${leanDot(g.id)}${esc(g.name)}</a>` : esc(g.name);
    const cell = v => `<td class="n">${v ? money(v) : ''}</td>`;
    const res = t => t.won == null ? '' : t.stage === 'Primary' && /^(CA|WA)-/.test(t.seat) ? (t.won ? 'Advanced' : 'Eliminated') : t.won ? 'Won' : 'Lost';
    const hit = t => t.won == null ? '' : (t.forAmt >= t.againstAmt) === t.won ? 'Yes' : 'No';
    add('israel', 'Pro-Israel PACs', `<h2>Pro-Israel PACs</h2>
  <p class="sub">AIPAC, its super PAC United Democracy Project and ${I.groups.length - 1} other pro-Israel PACs spent ${money(S.total)} on 2026 House and Senate candidates${S.bundled ? `, counting ${money(S.bundled)} in donations bundled through AIPAC PAC` : ''}. ${share(S.primary, S.total)} of it went into primaries, and ${share(S.forD + S.againstD, S.total)} into Democratic races.</p>
  <dl class="facts"><div><dt>Spent</dt><dd>${money(S.total)}</dd><dd class="s">${money(S.contrib)} given, ${S.bundled ? `${money(S.bundled)} bundled, ` : ''}${money(S.ie)} in outside spending</dd></div><div><dt>Share of all PAC and super PAC money</dt><dd>${share(S.total - (S.bundled || 0), I.all)}</dd><dd class="s">of ${money(I.all)} in House and Senate races</dd></div><div><dt>Share of primary outside spending</dt><dd>${share(S.primIe, I.allPrimIe)}</dd><dd class="s">of ${money(I.allPrimIe)}</dd></div><div><dt>On winners</dt><dd>${share(S.win, dec)}</dd><dd class="s">${money(S.lose)} on losers</dd></div></dl>
  <h3>By party</h3>
  <p class="sub">Money spent for and against candidates of each party, primaries and general elections together.${S.bundled ? " AIPAC's row includes donations bundled through AIPAC PAC; the share column covers PAC and super PAC money only." : ''}</p>
  <div class="tbl"><table><thead><tr><th>Group</th><th class="n">For Democrats</th><th class="n">Against Democrats</th><th class="n">For Republicans</th><th class="n">Against Republicans</th><th class="n">Total</th><th class="n">Share of all PAC money</th></tr></thead><tbody>
  ${I.groups.map(g => `<tr><td>${gl(g)}</td>${cell(g.forD)}${cell(g.againstD)}${cell(g.forR)}${cell(g.againstR)}<td class="n">${money(g.total)}</td><td class="n">${share(g.total - (g.bundled || 0), I.all)}</td></tr>`).join('')}
  <tr><td><b>All pro-Israel PACs</b></td>${cell(S.forD)}${cell(S.againstD)}${cell(S.forR)}${cell(S.againstR)}<td class="n"><b>${money(S.total)}</b></td><td class="n"><b>${share(S.total - (S.bundled || 0), I.all)}</b></td></tr></tbody></table></div>
  <h3>Wins and losses</h3>
  <p class="sub">A dollar counts as a win when the candidate it backed won, or the candidate it opposed lost, in the contest it was spent on.</p>
  <ul class="poll-key pm-key"><li><span class="k fW" aria-hidden="true"></span>Backed the winner</li><li><span class="k fL" aria-hidden="true"></span>Backed the loser</li></ul>
  <ul class="hbars pm-sp">${I.groups.filter(g => g.win + g.lose).map(g => `<li>${gl(g)}${winBar(g.win, g.lose, iMax)}<b>${money(g.win + g.lose)} <small>${share(g.win, g.win + g.lose)} on winners</small></b></li>`).join('')}</ul>
  <h3>Biggest targets</h3>
  <div class="tbl"><table><thead><tr><th>Candidate</th><th>Race</th><th class="n">Spent for</th>${S.bundled ? '<th class="n">Bundled</th>' : ''}<th class="n">Spent against</th><th>Result</th><th>Got its way</th></tr></thead><tbody>
  ${I.targets.map(t => `<tr><td>${pc(t.p)} ${pl(t.name, t.slug)}</td><td>${esc(t.seat)}<br><small>${t.stage}</small></td>${cell(t.forAmt - (t.bundled || 0))}${S.bundled ? cell(t.bundled) : ''}${cell(t.againstAmt)}<td>${res(t)}</td><td>${hit(t)}</td></tr>`).join('')}
  </tbody></table></div>`);
  }

  const G = X.progressive;
  if (G && G.candidates.length) {
    const pc1 = (a, b) => b ? `${Math.round(a / b * 100)}%` : '';
    const sh = v => v == null ? '' : `${(v * 100).toFixed(1)}%`;
    const pp = v => v == null ? '' : `${(v * 100).toFixed(1)}%`;
    const P = G.primary, ISS = { m4a: 'Medicare for All', climate: 'Climate and Green New Deal', housing: 'Housing and rent', costs: 'Cost of living', taxrich: 'Taxing the wealthy', labor: 'Unions and wages', gaza: 'Gaza and aid to Israel', ice: 'Ending ICE deportations', corpmoney: 'Money in politics', studentdebt: 'Student debt and free college', abortion: 'Abortion rights', childcare: 'Childcare and paid leave', police: 'Policing and public safety', democracy: 'Democracy and voting rights', aipac: 'Refusing AIPAC money', crypto_ai: 'Crypto, AI and big tech money', jobs: 'Federal jobs guarantee', education: 'Public schools', guns: 'Gun safety', veterans: 'Veterans', immigration_reform: 'Path to citizenship', antitrust: 'Monopolies and price gouging' };
    const endorsed = G.candidates.filter(o => o.groups.some(g => !['CPCM', 'LINE'].includes(g)));
    const res = o => o.gen ? (o.gen.won ? 'Won general' : 'Lost general') : o.prim ? (o.prim.won ? (o.prim.t2 ? 'Advanced' : 'Won primary') : 'Lost primary') : '';
    const GL = Object.fromEntries(G.groups.map(g => [g.id, g.id === 'CPCM' ? 'CPC member' : g.id === 'LINE' ? 'Left party line' : g.id]));
    const lines = G.candidates.filter(o => o.groups.includes('LINE') && o.gen).sort((a, b) => b.gen.pct - a.gen.pct).slice(0, 10);
    const iMax = G.issues.counts.length ? G.issues.counts[0].n : 1;
    add('progressives', 'Progressives', `<h2>Progressives and socialists</h2>
  <p class="sub">${endorsed.length} candidates endorsed by the Democratic Socialists of America, Justice Democrats, Our Revolution, the Working Families Party or the Progressive Caucus PAC, plus Progressive Caucus members who ran again and candidates on socialist and other left party lines.</p>
  <dl class="facts"><div><dt>Progressive challengers and open-seat candidates</dt><dd>${pc1(P.progChal.won, P.progChal.n)}</dd><dd class="s">won ${P.progChal.won} of ${P.progChal.n} contested primaries</dd></div><div><dt>Other Democratic challengers and open-seat candidates</dt><dd>${pc1(P.otherChal.won, P.otherChal.n)}</dd><dd class="s">won ${P.otherChal.won} of ${P.otherChal.n}</dd></div><div><dt>Progressive incumbents</dt><dd>${pc1(P.progInc.won, P.progInc.n)}</dd><dd class="s">won ${P.progInc.won} of ${P.progInc.n} contested primaries</dd></div><div><dt>Other Democratic incumbents</dt><dd>${pc1(P.otherInc.won, P.otherInc.n)}</dd><dd class="s">won ${P.otherInc.won} of ${P.otherInc.n}</dd></div></dl>
  <p class="sub">Contested primaries are Democratic and top-two primaries where two or more Democrats each won at least 10% of the vote.</p>
  <h3>General election, by pre-election rating</h3>
  <p class="sub">Democratic nominees' average share of the two-party vote, with seats won.</p>
  <div class="tbl"><table><thead><tr><th>Rating</th><th class="n">Progressive nominees</th><th class="n">Vote share</th><th class="n">Other Democrats</th><th class="n">Vote share</th></tr></thead><tbody>
  ${G.general.map(r => `<tr><td>${esc(r.rating)}</td><td class="n">${r.prog.won} of ${r.prog.n}</td><td class="n">${sh(r.prog.share)}</td><td class="n">${r.other.won} of ${r.other.n}</td><td class="n">${sh(r.other.share)}</td></tr>`).join('')}
  </tbody></table></div>
  ${(() => { const F = G.finance; if (!F) return ''; const row = (l, x) => `<tr><td>${l}</td><td class="n">${x.n}</td><td class="n">${x.medRaised != null ? money(x.medRaised) : ''}</td><td class="n">${x.pacShare != null ? sh(x.pacShare) : ''}</td><td class="n">${x.targeted}</td><td class="n">${money(x.ieAgainst)}</td><td class="n">${money(x.ieFor)}</td></tr>`;
    const spl = (l, k) => l.length ? `<div class="tbl"><table><thead><tr><th>Spender</th><th class="n">${k === 'against' ? 'Against' : 'For'} progressives</th><th class="n">In primaries</th><th class="n">Candidates</th></tr></thead><tbody>${l.map(x => `<tr><td>${fl2(x)}</td><td class="n">${money(x[k])}</td><td class="n">${money(k === 'against' ? x.primAgainst : x.primFor)}</td><td class="n">${x.cands}</td></tr>`).join('')}</tbody></table></div>` : '';
    return `<h3>Money</h3>
  <p class="sub">Fundraising and outside spending for candidates in contested Democratic primaries, from FEC filings. Outside spending here counts primary spending only.</p>
  <div class="tbl"><table><thead><tr><th>Candidates</th><th class="n">Ran</th><th class="n">Median raised</th><th class="n">From PACs</th><th class="n">Targeted by outside money</th><th class="n">Outside spending against</th><th class="n">Outside spending for</th></tr></thead><tbody>
  ${row('Progressive challengers and open-seat candidates', F.progChal)}${row('Other Democratic challengers and open-seat candidates', F.otherChal)}${row('Progressive incumbents', F.progInc)}${row('Other Democratic incumbents', F.otherInc)}
  </tbody></table></div>
  <h4>Biggest outside spenders against endorsed progressives</h4>
  <p class="sub">Primaries and general elections together; the primary share is broken out.</p>
  ${spl(F.against, 'against')}
  <h4>Biggest outside spenders for endorsed progressives</h4>
  ${spl(F.for, 'for')}`; })()}
  <h3>By endorsing group</h3>
  <div class="tbl"><table><thead><tr><th>Group</th><th class="n">Candidates</th><th class="n">Won primary</th><th class="n">Lost primary</th><th class="n">Won general</th><th class="n">Lost general</th></tr></thead><tbody>
  ${G.groups.map(g => `<tr><td>${esc(g.label)}</td><td class="n">${g.n}</td><td class="n">${g.id === 'LINE' ? '' : g.primWon}</td><td class="n">${g.id === 'LINE' ? '' : g.primLost}</td><td class="n">${g.genWon}</td><td class="n">${g.genLost}</td></tr>`).join('')}
  </tbody></table></div>
  ${G.issues.counts.length ? `<h3>What they ran on</h3>
  <p class="sub">Issues ${G.issues.sites} endorsed candidates campaigned on, from their campaign sites and campaign coverage, by how many ran on each one.</p>
  <ul class="hbars">${G.issues.counts.filter(i => ISS[i.id] && i.n >= 3).map(i => `<li><span>${esc(ISS[i.id])}</span><span class="hb"><i style="width:${(i.n / iMax * 100).toFixed(1)}%"></i></span><b>${i.n} <small>${pc1(i.n, G.issues.sites)}, ${i.won} won</small></b></li>`).join('')}</ul>` : ''}
  ${G.platforms.length ? `<h3>The groups' platforms</h3>${G.platforms.map(p => `<details class="pm-more"><summary><b>${esc(p.group)}</b></summary><ul>${p.planks.map(x => `<li>${esc(x)}</li>`).join('')}</ul>${p.source ? `<p class="sub"><a href="${esc(p.source)}" target="_blank" rel="noopener">Source</a></p>` : ''}</details>`).join('')}` : ''}
  ${lines.length ? `<h3>Socialist and left party lines</h3><p class="sub">Best general-election results for candidates outside the two major parties on the left.</p>
  <div class="tbl"><table><thead><tr><th>Candidate</th><th>Party line</th><th>Race</th><th class="n">Vote</th></tr></thead><tbody>${lines.map(o => `<tr><td>${esc(o.name)}</td><td>${esc(o.line)}</td><td>${esc(o.seat)}</td><td class="n">${o.gen.pct.toFixed(1)}%</td></tr>`).join('')}</tbody></table></div>` : ''}
  <details class="pm-more" open><summary><b>All endorsed candidates</b> <span class="cnt">${endorsed.length}</span></summary>
  <p class="sub">Each candidate's primary and general-election opponents, with vote shares, and the candidate's fundraising.</p>
  <div class="tbl"><table class="pm-cands"><thead><tr><th>Candidate</th><th>Race</th><th>Endorsed by</th><th>Primary</th><th>General</th><th class="n">Raised</th></tr></thead><tbody>
  ${endorsed.map(o => `<tr><td>${pc(o.gen ? o.gen.party : 'D')} ${pl(o.name, o.slug)}${o.inc ? ' <small class="kd">Incumbent</small>' : ''}</td><td>${esc(o.seat)}</td><td>${o.groups.map(g => GL[g] || g).join(', ')}</td>
    <td>${o.prim ? `<b>${o.prim.won ? (o.prim.t2 ? 'Advanced' : 'Won') : 'Lost'}</b> ${pp(o.prim.pct)}${o.prim.opp && o.prim.opp.length ? `<br><small>vs ${o.prim.opp.map(x => `${esc(x.n)}${o.prim.t2 && x.p ? ` (${esc(x.p)})` : ''} ${pp(x.pct)}`).join(', ')}</small>` : ''}` : ''}</td>
    <td>${o.gen ? `<b>${o.gen.won ? 'Won' : 'Lost'}</b> ${o.gen.pct != null ? o.gen.pct.toFixed(1) + '%' : ''}${o.gen.opp && o.gen.opp.length ? `<br><small>vs ${o.gen.opp.map(x => `${esc(x.n)}${x.p ? ` (${esc(x.p)})` : ''} ${x.pct != null ? x.pct.toFixed(1) + '%' : ''}`).join(', ')}</small>` : ''}` : ''}</td>
    <td class="n">${o.money && o.money.raised != null ? money(o.money.raised) : ''}</td></tr>`).join('')}
  </tbody></table></div></details>`);
  }

  // ---------- overview: headline numbers and one card per tab ----------
  const base = '/2026-post-mortem', href2 = k => k ? `${base}/${k}` : base;
  const card = (k, title, big, sub, viz) => `<article class="pm-card"><h2><a href="${href2(k)}">${title}</a></h2><p class="pm-big">${big}</p>${sub ? `<p class="sub">${sub}</p>` : ''}${viz || ''}<p class="pm-open"><a href="${href2(k)}">${esc(PM_TABS.find(t => t[0] === k)[1])}<span aria-hidden="true"> →</span></a></p></article>`;
  const MT = (M.scopes && M.scopes.all && M.scopes.all.totals) || {}, onW = t => t ? t.win / (t.win + t.lose) : 0;
  const I0 = X.israel && X.israel.sum, G0 = X.progressive && X.progressive.primary;
  const csTop = cs.slice(0, 4);
  const bTot = X.ballot.reduce((a, g) => a + g.measures.length, 0), bPass = X.ballot.reduce((a, g) => a + g.passed, 0);
  const keyIss = X.ballot.filter(g => ['abortion', 'voting', 'gender'].includes(g.id));
  const overview = `${facts([['House', `${dH > 0 ? '+' : ''}${dH} D`, `${hA.D} D, ${hA.R} R${hA.undecided ? `, ${hA.undecided} undecided` : ''}`], ['Senate', `${dS > 0 ? '+' : ''}${dS} D`, `${sA.D} D, ${sA.R} R${sA.I ? `, ${sA.I} I` : ''}`], ['Seats flipped', fl.length, Object.entries(flipDir).map(([k, n]) => `${n} ${k[0]} to ${k[1]}`).join(', ')], ['Members who lost', df.length + pls.filter(x => x.sameSeat).length, `${df.length} general, ${pls.filter(x => x.sameSeat).length} primary`], MT.D ? ['PAC and super PAC money', money(Object.values(MT).reduce((a, t) => a + t.win + t.lose, 0)), `${pct(Object.values(MT).reduce((a, t) => a + t.win, 0) / Object.values(MT).reduce((a, t) => a + t.win + t.lose, 0))} backed winners`] : null])}
  <div class="pm-cards">
  ${card('seats', 'The new Congress', `+${dH} House, +${dS} Senate`, 'Seats after the election, 120th Congress.', `<p class="pm-lab">House</p>${seatBar(hA, 435)}<p class="pm-lab">Senate</p>${seatBar(sA, 100)}`)}
  ${card('seats', 'Flipped seats', fl.length, 'Each square is one seat that changed party.', waffle(fl))}
  ${card('candidates', 'Members who ran again', `${X.counts.reElected} won, ${df.length + pls.filter(x => x.sameSeat).length} lost`, '', mini([['Re-elected', X.counts.reElected, X.counts.reElected, 'fW'], ['Lost the general', df.length, `${df.length} <small>${dfP('R')} R, ${dfP('D')} D</small>`, 'fL'], ['Lost renomination', pls.filter(x => x.sameSeat).length, pls.filter(x => x.sameSeat).length, 'fLp']], X.counts.reElected))}
  ${card('caucuses', 'Caucuses: won and lost', csTop[0] ? pct((csTop[0].lostGeneral + csTop[0].lostPrimary) / csTop[0].members) : '', csTop[0] ? `of the ${esc(csTop[0].name)} lost, the most of any caucus.` : '', outRows(csTop))}
  ${card('ballot', 'Ballot measures', `${bPass} of ${bTot} passed`, 'Selected issues:', `<ul class="poll-key pm-key"><li><span class="k fW" aria-hidden="true"></span>Passed</li><li><span class="k fL" aria-hidden="true"></span>Failed</li></ul><div class="pm-mini">${keyIss.map(g => `<div><span>${esc(g.label)}</span><span class="pm-track"><span class="hb split" role="img" aria-label="${g.passed} passed, ${g.failed} failed" style="width:100%"><i class="fW" style="flex:${g.passed}"></i><i class="fL" style="flex:${g.failed}"></i></span></span><b>${g.passed}–${g.failed}</b></div>`).join('')}</div>`)}
  ${card('votes', 'How the defeated voted', pct(R.lost.unity, 1), 'Party-line votes by defeated Republicans, against re-elected Republicans. Scale starts at 85%.', mini([['Defeated', R.lost.unity - 0.85, pct(R.lost.unity, 1), 'rp'], ['Re-elected', R.won.unity - 0.85, pct(R.won.unity, 1), 'rp']], 0.15))}
  ${MT.D && MT.R ? card('money', 'Money', `${pct(onW(MT.D))} vs ${pct(onW(MT.R))}`, 'Share of PAC and super PAC money that backed winners, Democratic side against Republican side.', mini([['Democratic side', onW(MT.D), pct(onW(MT.D)), 'dm'], ['Republican side', onW(MT.R), pct(onW(MT.R)), 'rp']], 1)) : ''}
  ${I0 ? card('israel', 'Pro-Israel PACs', money(I0.total), `${pct(I0.primary / I0.total)} of it spent in primaries.`, mini([['Backed winners', I0.win / (I0.win + I0.lose), pct(I0.win / (I0.win + I0.lose)), 'fW'], ['Backed losers', I0.lose / (I0.win + I0.lose), pct(I0.lose / (I0.win + I0.lose)), 'fL']], 1)) : ''}
  ${G0 && G0.progChal.n ? card('progressives', 'Progressives', pct(G0.progChal.won / G0.progChal.n), 'Primary win rate for progressive challengers and open-seat candidates, against other Democrats.', mini([['Progressives', G0.progChal.won / G0.progChal.n, `${G0.progChal.won} of ${G0.progChal.n}`, 'dm'], ['Other Democrats', G0.otherChal.won / G0.otherChal.n, `${G0.otherChal.won} of ${G0.otherChal.n}`, 'ns']], 1)) : ''}
  </div>`;
  const tabNav = `<nav class="subnav pm-tabs" aria-label="2026 midterms"><div class="wrap">${PM_TABS.filter(([k]) => !k || (PM_SECS[k] || []).some(id => secMap[id])).map(([k, l]) => `<a href="${href2(k)}"${k === tab ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</div></nav>`;
  const order = PM_TABS.filter(([k]) => !k || (PM_SECS[k] || []).some(id => secMap[id])), at = order.findIndex(t => t[0] === tab), nx = order[at + 1];
  const content = tab ? (PM_SECS[tab] || []).map(id => secMap[id] || '').join('') : overview;
  const body = `<div class="wrap pm-head"><p class="crumb">Election results</p><h1>${tab ? `<a href="${base}" class="pm-h1">The 2026 midterms</a>` : 'The 2026 midterms'}</h1>${tab ? '' : `<p class="lede">${lede}</p>`}</div>
${tabNav}
<div class="wrap pmort${tab ? '' : ' pm-ov'}">${content}${nx ? `<p class="pm-next"><a href="${href2(nx[0])}">Next: ${esc(nx[1])}<span aria-hidden="true"> →</span></a></p>` : ''}</div>`;
  return layout({ title: tab ? `${TAB[1]}: the 2026 midterms` : 'The 2026 midterms: winners, losers, ballot measures and money', desc: lede, path: href2(tab), body, active: base });
}

module.exports = { funderRecipients, sitemapFile, llms, postMortem, compare, trackerStage, caucusPage, leadership, leaderElection, tracker, committees, committee, find, contactLinks, schedule, home, member, network, graph, members, stateP, incoming, votes, vote, bill, moneyP, funder, industry, issues, issue, search, suggest, about, bibliography, notFound, sitemap };
