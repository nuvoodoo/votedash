// Downloads AIPAC PAC's 2026 Schedule B (earmarked contributions it forwarded to candidates) from the FEC API
// into data/raw/aipac-earmarks.json. Needs DATA_GOV_KEY in the environment or ../votedash.env.
'use strict';
const fs = require('fs'), path = require('path');
const envF = path.join(__dirname, '../../../../votedash.env');
const KEY = process.env.DATA_GOV_KEY || (fs.existsSync(envF) && (fs.readFileSync(envF, 'utf8').match(/DATA_GOV_KEY=["']?([^\s"']+)/) || [])[1]);
const OUT = path.join(__dirname, '../../../data/raw/aipac-earmarks.json');
(async () => {
  const PART = OUT + '.part';
  let { rows = [], last = {} } = fs.existsSync(PART) ? JSON.parse(fs.readFileSync(PART, 'utf8')) : {};
  for (;;) {
    const q = new URLSearchParams({ committee_id: 'C00797670', two_year_transaction_period: '2026', per_page: '100', sort: 'disbursement_date', api_key: KEY, ...last });
    // waits out the API's hourly rate limit instead of failing
    let d; for (let t = 0; t < 100000; t++) { const r = await fetch('https://api.open.fec.gov/v1/schedules/schedule_b/?' + q).catch(() => null); if (r && r.ok) { d = await r.json(); break; } await new Promise(s => setTimeout(s, r && r.status === 429 ? 60000 : 5000)); }
    if (!d) throw new Error('FEC API failed');
    for (const r of d.results) rows.push({ rid: r.recipient_committee_id, cid: r.candidate_id, rn: r.recipient_name, amt: r.disbursement_amount, dt: r.disbursement_date, line: r.line_number, desc: r.disbursement_description, memo: r.memoed_subtotal, el: r.election_type });
    const li = d.pagination.last_indexes; if (!d.results.length || !li) break;
    last = { last_index: li.last_index, last_disbursement_date: li.last_disbursement_date };
    fs.writeFileSync(PART, JSON.stringify({ rows, last }));
    if (rows.length % 2000 < 100) console.log(rows.length, '/', d.pagination.count);
  }
  fs.writeFileSync(OUT, JSON.stringify(rows)); fs.unlinkSync(PART); console.log('done', rows.length);
})();
