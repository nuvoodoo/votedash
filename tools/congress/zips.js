// ZIP (ZCTA) -> 119th congressional districts with land share, plus an interior point.
// Sources: Census 2020 ZCTA-to-CD119 relationship file and 2020 ZCTA Gazetteer.
'use strict';
const fs = require('fs');
const path = require('path');
const RAW = path.join(__dirname, '../../data/raw');
const FIPS = { '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY', '60': 'AS', '66': 'GU', '69': 'MP', '72': 'PR', '78': 'VI' };
const out = {};
const rel = fs.readFileSync(path.join(RAW, 'cd119_zcta.txt'), 'utf8').replace(/^﻿/, '').split(/\r?\n/).slice(1);
for (const l of rel) {
  const c = l.split('|'); const zip = c[8]; if (!zip) continue;
  const st = FIPS[c[1].slice(0, 2)]; if (!st) continue;
  const d = +c[1].slice(2); const dist = d === 98 || d === 0 ? 0 : d;
  const share = +c[15] / (+c[10] || 1);
  (out[zip] ||= { d: [] }).d.push([st, dist, +share.toFixed(3)]);
}
const gaz = fs.readFileSync(path.join(RAW, '2020_Gaz_zcta_national.txt'), 'utf8').split(/\r?\n/).slice(1);
for (const l of gaz) { const c = l.trim().split(/\s+/); if (out[c[0]]) out[c[0]].p = [+(+c[6]).toFixed(5), +(+c[5]).toFixed(5)]; }
for (const z of Object.values(out)) z.d = z.d.filter(x => x[2] >= 0.005 || z.d.length === 1).sort((a, b) => b[2] - a[2]);
fs.writeFileSync(path.join(__dirname, '../../server/congress/data/zips.json'), JSON.stringify(out));
const multi = Object.values(out).filter(z => z.d.length > 1).length;
console.log('zips', Object.keys(out).length, 'split', multi, 'with point', Object.values(out).filter(z => z.p).length);
