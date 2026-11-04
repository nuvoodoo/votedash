'use strict';
// Live Open Graph image: balance of power plus the Senate map, rendered from
// the same state the page uses. 1200x630 PNG, cached 60 seconds.

const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const FONT_DIR = path.join(__dirname, 'fonts');
const FONTS = ['IBMPlexSans-Regular.ttf', 'IBMPlexSans-SemiBold.ttf', 'IBMPlexSansCondensed-SemiBold.ttf'].map((f) => path.join(FONT_DIR, f));
const FIPS = { '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE','11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA','20':'KS','21':'KY','22':'LA','23':'ME','24':'MD','25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE','32':'NV','33':'NH','34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI','45':'SC','46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV','55':'WI','56':'WY' };
const C = { paper: '#F6F4EE', paper2: '#EDEAE1', ink: '#15181D', ink2: '#3B4048', steel: '#6E7681', dem: '#2458B3', rep: '#C9322B', ind: '#5C8E3E', amber: '#D48A00', leadD: '#8FAAD9', leadR: '#E2958F', leadI: '#A6C48F', empty: '#DCD8CC' };

let statePaths = null; // [{st, d}]
function loadStates() {
  if (statePaths) return statePaths;
  const topo = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'states-albers-10m.json'), 'utf8'));
  // Minimal TopoJSON decode (arcs -> rings) so no client library is needed here.
  const { scale, translate } = topo.transform;
  const arcs = topo.arcs.map((arc) => { let x = 0, y = 0; return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; }); });
  const ring = (idxs) => { let out = []; for (const i of idxs) { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; out = out.concat(out.length ? a.slice(1) : a); } return out; };
  const pathOf = (g) => {
    const polys = g.type === 'Polygon' ? [g.arcs] : g.arcs;
    return polys.map((poly) => poly.map((r) => 'M' + ring(r).map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L') + 'Z').join('')).join('');
  };
  statePaths = topo.objects.states.geometries.filter((g) => FIPS[g.id]).map((g) => ({ st: FIPS[g.id], d: pathOf(g) }));
  return statePaths;
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function fillFor(r) {
  if (!r) return C.paper2;
  if (r.winner) return r.winner.p === 'D' ? C.dem : r.winner.p === 'R' ? C.rep : r.winner.p === 'I' ? C.ind : C.steel;
  if (r.total > 0) { const a = r.cands.filter((c) => c.n !== 'Write-in')[0]; return a ? (a.p === 'D' ? C.leadD : a.p === 'R' ? C.leadR : a.p === 'I' ? C.leadI : '#B4B8BF') : C.empty; }
  return C.empty;
}

function bopRow(y, title, d, unit) {
  const W = 520, X = 60;
  const dw = (d.D / d.total) * W, rw = (d.R / d.total) * W, iw = (d.I / d.total) * W;
  const control = d.D >= d.majority ? 'Dem control' : d.R >= d.majority ? 'Rep control' : `${d.remaining} ${unit} uncalled`;
  return `
  <text x="${X}" y="${y}" font-family="IBM Plex Sans" font-weight="600" font-size="22" fill="${C.ink}">${title}</text>
  <text x="${X + W}" y="${y}" text-anchor="end" font-family="IBM Plex Sans" font-size="16" fill="${C.ink2}">${d.majority} for control</text>
  <text x="${X}" y="${y + 52}" font-family="IBM Plex Sans Condensed" font-weight="600" font-size="54" fill="${C.dem}">${d.D}</text>
  <text x="${X + W}" y="${y + 52}" text-anchor="end" font-family="IBM Plex Sans Condensed" font-weight="600" font-size="54" fill="${C.rep}">${d.R}</text>
  <rect x="${X}" y="${y + 62}" width="${W}" height="20" fill="${C.paper2}"/>
  <rect x="${X}" y="${y + 62}" width="${dw.toFixed(1)}" height="20" fill="${C.dem}"/>
  ${iw ? `<rect x="${(X + dw).toFixed(1)}" y="${y + 62}" width="${iw.toFixed(1)}" height="20" fill="${C.ind}"/>` : ''}
  <rect x="${(X + W - rw).toFixed(1)}" y="${y + 62}" width="${rw.toFixed(1)}" height="20" fill="${C.rep}"/>
  <rect x="${X + W / 2 - 1.5}" y="${y + 58}" width="3" height="28" fill="${C.ink}"/>
  <text x="${X}" y="${y + 104}" font-family="IBM Plex Sans" font-size="16" fill="${C.ink2}">${control}</text>`;
}

function buildSVG(civic) {
  const bop = civic.bop();
  const byState = {};
  for (const r of civic.races.values()) if (r.cat === 'senate' && !byState[r.state]) byState[r.state] = r;
  const states = loadStates();
  const updated = new Date(civic.status.lastOk || Date.now()).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET';
  // Map: 975x610 projected -> scale into 560x350 at right
  const sx = 560 / 975, sy = 350 / 610, s = Math.min(sx, sy);
  const mapX = 600, mapY = 150;
  const paths = states.map((p) => `<path d="${p.d}" fill="${fillFor(byState[p.st])}" stroke="#fff" stroke-width="1.2"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${C.paper}"/>
  <rect width="1200" height="92" fill="${C.ink}"/>
  <text x="60" y="60" font-family="IBM Plex Sans Condensed" font-weight="600" font-size="44" fill="#fff">Vote<tspan fill="${C.amber}">Dash</tspan></text>
  <circle cx="300" cy="50" r="8" fill="${C.amber}"/>
  <text x="318" y="58" font-family="IBM Plex Sans" font-weight="600" font-size="22" fill="#fff">Live</text>
  <text x="380" y="58" font-family="IBM Plex Sans" font-size="20" fill="#D6D9DE">2026 midterm results, updated ${esc(updated)}</text>
  <text x="1140" y="58" text-anchor="end" font-family="IBM Plex Sans" font-weight="600" font-size="22" fill="#fff">votedash.net</text>
  ${bopRow(150, 'Senate', bop.senate, 'seats')}
  ${bopRow(300, 'House', bop.house, 'seats')}
  ${bopRow(450, 'Governors', bop.governor, 'states')}
  <text x="${mapX}" y="138" font-family="IBM Plex Sans" font-weight="600" font-size="18" fill="${C.ink}">Senate map</text>
  <g transform="translate(${mapX},${mapY}) scale(${s.toFixed(4)})">${paths}</g>
  <g font-family="IBM Plex Sans" font-size="15" fill="${C.ink2}">
    <rect x="600" y="540" width="16" height="16" fill="${C.leadD}"/><text x="622" y="553">Dem leading</text>
    <rect x="730" y="540" width="16" height="16" fill="${C.dem}"/><text x="752" y="553">Dem called</text>
    <rect x="850" y="540" width="16" height="16" fill="${C.leadR}"/><text x="872" y="553">Rep leading</text>
    <rect x="975" y="540" width="16" height="16" fill="${C.rep}"/><text x="997" y="553">Rep called</text>
  </g>
  <text x="600" y="600" font-family="IBM Plex Sans" font-size="15" fill="${C.steel}">Results from civicAPI. Powered by Aileron Shift.</text>
</svg>`;
}

let cache = { ts: 0, png: null };
function render(civic) {
  if (cache.png && Date.now() - cache.ts < 60000) return cache.png;
  const svg = buildSVG(civic);
  const r = new Resvg(svg, { font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'IBM Plex Sans' } });
  const png = r.render().asPng();
  cache = { ts: Date.now(), png };
  return png;
}

module.exports = { render, buildSVG };
