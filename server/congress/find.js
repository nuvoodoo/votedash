'use strict';
// Find your representatives by ZIP code or street address.
// ZIP -> current districts from the Census ZCTA relationship file (zips.json);
// points -> 119th and 120th districts from Census TIGERweb; addresses via the Census geocoder.
const fs = require('fs');
const path = require('path');
const D = require('./data');
const ZIPS = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/zips.json'), 'utf8'));
const FIPS = { '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY', '60': 'AS', '66': 'GU', '69': 'MP', '72': 'PR', '78': 'VI' };
const TIGER = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer';
const cache = new Map();

async function getJSON(url, ms = 9000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': 'VoteDash/1.0' } }); return r.ok ? await r.json() : null; } catch { return null; } finally { clearTimeout(t); }
}
const geoidToDist = g => { const st = FIPS[g.slice(0, 2)]; const n = +g.slice(2); return st ? [st, n === 98 ? 0 : n] : null; };
async function districtAt(lon, lat, layer) { // layer 4 = 119th, 0 = 120th
  const j = await getJSON(`${TIGER}/${layer}/query?geometry=${lon},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=GEOID&returnGeometry=false&f=json`);
  const f = j && j.features && j.features[0];
  return f ? geoidToDist(f.attributes.GEOID) : null;
}

// who holds a seat now, and who holds it from January 3, 2027
const house = (st, d) => D.people.filter(p => p.chamber === 'H' && p.status !== 'elect' && p.state === st && (p.district === d || (p.delegate && d === 0)));
const senate = st => D.people.filter(p => p.chamber === 'S' && p.status !== 'elect' && p.state === st);
function house2027(st, d) {
  return D.people.find(p => p.status === 'elect' && p.chamber === 'H' && p.state === st && p.district === d)
    || D.people.find(p => p.elect && p.elect.chamber === 'H' && p.elect.state === st && p.elect.district === d)
    || D.people.find(p => p.chamber === 'H' && p.status !== 'elect' && p.state === st && p.newDistrict === d)
    || D.people.find(p => p.chamber === 'H' && p.status === 'serving' && p.newDistrict == null && p.state === st && (p.district === d || (p.delegate && d === 0)) && (!p.race2026 || p.race2026.won))
    || null;
}
function senate2027(st) {
  return [...D.people.filter(p => p.chamber === 'S' && p.status === 'serving' && p.state === st && !p.elect),
    ...D.people.filter(p => p.status === 'elect' && p.chamber === 'S' && p.state === st),
    ...D.people.filter(p => p.elect && p.elect.chamber === 'S' && p.elect.state === st)];
}

async function byZip(zip) {
  const z = ZIPS[zip]; if (!z) return { error: 'zip' };
  const st = z.d[0][0];
  let next = null;
  if (z.p) { const k = 'z' + zip; next = cache.has(k) ? cache.get(k) : await districtAt(z.p[0], z.p[1], 0); if (next) cache.set(k, next); }
  return { kind: 'zip', zip, state: st, now: z.d.map(([s, d, share]) => ({ st: s, d, share })), next: z.d.length === 1 && next ? next : null, split: z.d.length > 1 };
}
async function byAddress(addr) {
  const k = 'a' + addr.toLowerCase(); if (cache.has(k)) return cache.get(k);
  const j = await getJSON(`https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=${encodeURIComponent(addr)}&benchmark=Public_AR_Current&vintage=Current_Current&layers=54&format=json`, 12000);
  const m = j && j.result && j.result.addressMatches && j.result.addressMatches[0];
  if (!m) return { error: 'address' };
  const cd = (m.geographies['120th Congressional Districts'] || [])[0];
  const next = cd ? geoidToDist(cd.GEOID) : await districtAt(m.coordinates.x, m.coordinates.y, 0);
  const now = await districtAt(m.coordinates.x, m.coordinates.y, 4);
  if (!now && !next) return { error: 'address' };
  const r = { kind: 'address', matched: m.matchedAddress, state: (now || next)[0], now: now ? [{ st: now[0], d: now[1], share: 1 }] : [], next, split: false };
  cache.set(k, r); if (cache.size > 5000) cache.delete(cache.keys().next().value);
  return r;
}
module.exports = { byZip, byAddress, house, senate, house2027, senate2027, ZIPS };
