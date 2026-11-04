#!/usr/bin/env node
// Watches the election social-media agent's spreadsheet and posts new rows to
// VoteDash. Usage:
//   node tools/social-sync.js <path-to.csv|.xlsx> [https://votedash.net] [token]
// Token can also come from SOCIAL_TOKEN. Runs until stopped; re-sends when the
// file changes.
'use strict';
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
const base = (process.argv[3] || process.env.VOTEDASH_URL || 'https://votedash.net').replace(/\/$/, '');
const token = process.argv[4] || process.env.SOCIAL_TOKEN;
if (!file || !token) { console.error('usage: social-sync.js <file.csv|xlsx> [base-url] [token]'); process.exit(1); }

function readRows() {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.csv') return { body: fs.readFileSync(file), type: 'text/csv' };
  if (ext === '.json') return { body: fs.readFileSync(file), type: 'application/json' };
  // xlsx: needs `npm i xlsx` in tools/
  const XLSX = require('xlsx');
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  return { body: Buffer.from(JSON.stringify({ items: rows })), type: 'application/json' };
}

let lastHash = '';
async function sync() {
  try {
    if (!fs.existsSync(file)) { console.log(new Date().toISOString(), 'waiting for', file); return; }
    const { body, type } = readRows();
    const h = require('crypto').createHash('md5').update(body).digest('hex');
    if (h === lastHash) return;
    const res = await fetch(`${base}/api/social/ingest`, { method: 'POST', headers: { 'content-type': type, authorization: `Bearer ${token}` }, body });
    const txt = await res.text();
    console.log(new Date().toISOString(), res.status, txt.slice(0, 120));
    if (res.ok) lastHash = h;
  } catch (e) { console.error('sync', e.message); }
}
sync();
fs.watchFile(file, { interval: 5000 }, sync);
setInterval(sync, 30000);
