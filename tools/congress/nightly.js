// Nightly rebuild of the Congress data, run by the server in a child process.
// Downloads fresh public data (bulk files only), rebuilds into <home>/congress-next,
// validates it, then swaps it in as <home>/congress. Curated files (record, leadership,
// lobbying, zips) carry over from the current data. Exit code 0 = new data is live.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HOME = process.env.CONGRESS_HOME || '/data';
const RAW = path.join(HOME, 'raw');
const LIVE = path.join(HOME, 'congress');
const NEXT = path.join(HOME, 'congress-next');
const PREV = path.join(HOME, 'congress-prev');
const REPO = path.join(__dirname, '../..');
const BUNDLED = path.join(REPO, 'server/congress/data');
const log = (...a) => console.log(new Date().toISOString(), '[nightly]', ...a);
const steps = [];

async function download(url, dest, { ifMissing } = {}) {
  if (ifMissing && fs.existsSync(dest) && fs.statSync(dest).size > 0) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'VoteDash/1.0 (+https://votedash.net/about)' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.length) throw new Error('empty');
      fs.writeFileSync(dest + '.part', buf); fs.renameSync(dest + '.part', dest);
      return true;
    } catch (e) { if (i === 3) throw new Error(`${url}: ${e.message}`); await new Promise(r => setTimeout(r, 4000 * i)); }
  }
}
const unzip = (zip, dir) => { fs.mkdirSync(dir, { recursive: true }); execFileSync('unzip', ['-oq', zip, '-d', dir]); };
function run(script, args = []) {
  const t = Date.now();
  execFileSync(process.execPath, ['--max-old-space-size=1400', path.join(__dirname, script), ...args], { stdio: 'inherit', timeout: 40 * 60e3, env: { ...process.env, CONGRESS_RAW: RAW, CONGRESS_OUT: NEXT } });
  steps.push([script, Math.round((Date.now() - t) / 1000)]);
}
const count = (dir, f, fn) => { try { return fn(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); } catch { return 0; } };

(async () => {
  const t0 = Date.now();
  fs.mkdirSync(RAW, { recursive: true });
  if (!fs.existsSync(path.join(LIVE, 'people.json'))) { log('seeding from bundled data'); fs.cpSync(BUNDLED, LIVE, { recursive: true }); }
  fs.rmSync(NEXT, { recursive: true, force: true });
  fs.cpSync(LIVE, NEXT, { recursive: true });
  // hand-curated or slow-to-build files always come from the deployed code
  for (const f of ['record.json', 'leadership.json', 'lobbying.json', 'zips.json', 'approval.json', 'polls.json', 'postmortem.json', 'pm-races.json']) if (fs.existsSync(path.join(BUNDLED, f))) fs.copyFileSync(path.join(BUNDLED, f), path.join(NEXT, f));

  log('downloading');
  const gh = 'https://unitedstates.github.io/congress-legislators/';
  for (const f of ['legislators-current', 'legislators-historical', 'legislators-social-media', 'legislators-district-offices', 'committees-current', 'committee-membership-current']) await download(`${gh}${f}.json`, path.join(RAW, f + '.json'));
  for (const f of ['members', 'rollcalls', 'votes']) await download(`https://voteview.com/static/data/out/${f}/HS119_${f}.csv`, path.join(RAW, `HS119_${f}.csv`));
  const fec = 'https://www.fec.gov/files/bulk-downloads/';
  for (const [z, f] of [['weball26', 'weball26.txt'], ['cn26', 'cn.txt'], ['cm26', 'cm.txt'], ['pas226', 'itpas2.txt']]) { await download(`${fec}2026/${z}.zip`, path.join(RAW, 'zip', z + '.zip')); unzip(path.join(RAW, 'zip', z + '.zip'), RAW); }
  for (const [y, d] of [['2024', 'y24'], ['2022', 'y22']]) {
    for (const z of [`pas2${y.slice(2)}`, `weball${y.slice(2)}`, `cm${y.slice(2)}`]) {
      const zp = path.join(RAW, 'zip', z + '.zip');
      if (await download(`${fec}${y}/${z}.zip`, zp, { ifMissing: true }) || !fs.existsSync(path.join(RAW, d, z.startsWith('pas2') ? 'itpas2.txt' : z.startsWith('cm') ? 'cm.txt' : `weball${y.slice(2)}.txt`))) unzip(zp, path.join(RAW, d));
    }
  }
  for (const f of ['house-1976-2024.tab', 'senate-1976-2024.tab']) fs.copyFileSync(path.join(__dirname, 'static', f), path.join(RAW, f));
  fs.copyFileSync(path.join(REPO, 'archive/2026/api/snapshot.json'), path.join(RAW, 'snapshot.json'));
  for (const t of ['hr', 's', 'hres', 'sres', 'hjres', 'sjres', 'hconres', 'sconres']) {
    const zp = path.join(RAW, 'zip', `BILLSTATUS-119-${t}.zip`);
    await download(`https://www.govinfo.gov/bulkdata/BILLSTATUS/119/${t}/BILLSTATUS-119-${t}.zip`, zp);
    fs.rmSync(path.join(RAW, 'billstatus', t), { recursive: true, force: true });
    unzip(zp, path.join(RAW, 'billstatus', t));
  }
  steps.push(['download', Math.round((Date.now() - t0) / 1000)]);

  run('fetch-official-votes.js');

  log('building');
  run('build.js');
  run('bills-bulk.js');
  run('industries.js');
  // caucus rosters come from many house.gov and caucus sites; one refusing must not cost the night
  try { run('caucuses.js', ['--refresh']); } catch (e) { log('caucuses step failed, keeping current caucuses:', e.message); steps.push(['caucuses.js', 'kept previous']); }
  // A full Congressional Record fetch (empty cache) can outlast the step timeout. The cache is
  // written as it goes, so a cut-off run still advances; keep the current speeches.json.
  try { run('fetch-speeches.js'); } catch (e) { log('speeches step did not finish, keeping current speeches:', e.message); steps.push(['fetch-speeches.js', 'kept previous']); }

  // validate against the data now live
  const checks = [
    ['people', count(NEXT, 'people.json', a => a.length), count(LIVE, 'people.json', a => a.length), 0.97],
    ['roll calls', count(NEXT, 'rollcalls.json', j => j.rollcalls.length), count(LIVE, 'rollcalls.json', j => j.rollcalls.length), 1],
    ['bills', count(NEXT, 'bills.json', j => Object.keys(j.bills).length), count(LIVE, 'bills.json', j => Object.keys(j.bills).length), 0.98],
    ['PACs', count(NEXT, 'funders.json', j => Object.keys(j).length), count(LIVE, 'funders.json', j => Object.keys(j).length), 0.9],
    ['speakers', count(NEXT, 'speeches.json', j => Object.keys(j.byMember).length), count(LIVE, 'speeches.json', j => Object.keys(j.byMember).length), 0.95]
  ];
  const bad = checks.filter(([, n, o, f]) => !(n > 0 && n >= Math.floor(o * f)));
  if (bad.length) throw new Error('validation failed: ' + bad.map(([k, n, o]) => `${k} ${n} vs ${o}`).join(', '));

  fs.rmSync(PREV, { recursive: true, force: true });
  fs.renameSync(LIVE, PREV);
  fs.renameSync(NEXT, LIVE);
  const res = { ok: true, finished: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), steps, counts: Object.fromEntries(checks.map(([k, n]) => [k, n])) };
  fs.writeFileSync(path.join(HOME, 'last-run.json'), JSON.stringify(res));
  log('done', JSON.stringify(res));
})().catch(e => {
  log('FAILED', e.message);
  try { fs.writeFileSync(path.join(HOME, 'last-run.json'), JSON.stringify({ ok: false, finished: new Date().toISOString(), error: e.message, steps })); } catch {}
  process.exit(1);
});
