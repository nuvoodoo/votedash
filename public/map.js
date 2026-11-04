/* VoteDash map: Albers state map for statewide races, tile cartogram for House districts. */
(function () {
  'use strict';
  const FIPS = { '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE','11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA','20':'KS','21':'KY','22':'LA','23':'ME','24':'MD','25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE','32':'NV','33':'NH','34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI','45':'SC','46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV','55':'WI','56':'WY','72':'PR' };
  const SMALL = ['VT', 'NH', 'MA', 'RI', 'CT', 'NJ', 'DE', 'MD', 'DC'];
  // Tile grid (col,row) for the House cartogram.
  const GRID = {
    AK:[0,0], ME:[10,0],
    VT:[9,1], NH:[10,1],
    WA:[0,2], ID:[1,2], MT:[2,2], ND:[3,2], MN:[4,2], IL:[5,2], WI:[6,2], MI:[7,2], NY:[8,2], RI:[9,2], MA:[10,2],
    OR:[0,3], NV:[1,3], WY:[2,3], SD:[3,3], IA:[4,3], IN:[5,3], OH:[6,3], PA:[7,3], NJ:[8,3], CT:[9,3],
    CA:[0,4], UT:[1,4], CO:[2,4], NE:[3,4], MO:[4,4], KY:[5,4], WV:[6,4], VA:[7,4], MD:[8,4], DE:[9,4],
    AZ:[1,5], NM:[2,5], KS:[3,5], AR:[4,5], TN:[5,5], NC:[6,5], SC:[7,5], DC:[8,5],
    OK:[3,6], LA:[4,6], MS:[5,6], AL:[6,6], GA:[7,6],
    HI:[0,7], TX:[3,7], FL:[8,7],
  };
  const SVGNS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs) => { const n = document.createElementNS(SVGNS, tag); for (const k in attrs || {}) n.setAttribute(k, attrs[k]); return n; };
  const fmtPct = (n) => `${(Math.round((n || 0) * 10) / 10).toFixed(1)}%`;

  const VER = (document.currentScript && (document.currentScript.src.match(/[?&]v=([^&]+)/) || [])[1]) || '1';
  let topo = null, features = null, centroids = {};
  let container, tip, legend, svgEl, note;
  let ctx = { cat: 'senate', races: new Map(), calls: {}, stateFilter: null, onOpen: () => {}, onState: () => {} };
  let pctEls = {}; // state -> text element for percent counted
  let shapeByRace = new Map(); // race id -> [elements]
  let shapeByState = new Map(); // state -> [elements]
  let lastMode = null;

  function ringPath(ring) { return 'M' + ring.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L') + 'Z'; }
  function geoPath(g) {
    if (g.type === 'Polygon') return g.coordinates.map(ringPath).join('');
    if (g.type === 'MultiPolygon') return g.coordinates.map((poly) => poly.map(ringPath).join('')).join('');
    return '';
  }
  function centroidOf(g) {
    let best = null, bestArea = -1;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const poly of polys) {
      const ring = poly[0]; let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
      for (const p of ring) { if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0]; if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1]; }
      const area = (maxx - minx) * (maxy - miny);
      if (area > bestArea) { bestArea = area; best = [(minx + maxx) / 2, (miny + maxy) / 2]; }
    }
    return best;
  }

  async function load() {
    if (topo) return;
    const r = await fetch(`/data/states-albers-10m.json?v=${VER}`);
    if (!r.ok) throw new Error(`geometry ${r.status}`);
    topo = await r.json();
    features = topojson.feature(topo, topo.objects.states).features.filter((f) => FIPS[f.id] && f.id !== '72');
    for (const f of features) centroids[FIPS[f.id]] = centroidOf(f.geometry);
    // nudge a few label positions
    const nudge = { FL: [12, 0], LA: [-8, 0], MI: [12, 18], ID: [0, 20], AK: [0, 0], HI: [0, 0], CA: [-6, 0], NY: [8, 0], VA: [8, 0], NC: [6, 0], MD: [0, 0] };
    for (const k in nudge) if (centroids[k]) centroids[k] = [centroids[k][0] + nudge[k][0], centroids[k][1] + nudge[k][1]];
  }

  function racesFor(state, cat) {
    const out = [];
    if (cat === 'southbay') { for (const r of ctx.races.values()) if (r.sb === state) out.push(r); return out; }
    for (const r of ctx.races.values()) {
      const c = r.cat === 'state-senate' || r.cat === 'state-house' ? 'legislature' : r.cat === 'delegate' ? 'house' : r.cat;
      if (c === cat && r.state === state) out.push(r);
    }
    return out;
  }
  function leader(r) {
    const c = r.cands.filter((x) => x.n !== 'Write-in');
    return { a: c[0], b: c[1] };
  }
  function fillFor(r) {
    if (!r) return { cls: 'none' };
    if (r.winner) return { cls: 'called ' + r.winner.p };
    if (r.total > 0) { const { a } = leader(r); return { cls: 'lead ' + (a ? a.p : 'O') }; }
    return { cls: 'empty' };
  }
  function tipHTML(rs) {
    return rs.map((r) => {
      const { a, b } = leader(r);
      const calls = Object.keys(ctx.calls[r.id] || {}).filter((k) => k !== 'civicAPI');
      const line = (c) => c ? `<div class="tl"><span class="p-${c.p}">${c.w ? '✓ ' : ''}${c.n} (${c.p})${c.inc ? ' <i class="tinc">Inc</i>' : ''}</span><b>${fmtPct(c.pc)}</b></div>` : '';
      return `<div class="tr"><div class="tn">${r.name}${r.rating ? ` <span class="tr-rating">${r.rating}</span>` : ''}</div>${r.total > 0 ? line(a) + line(b) : '<div class="tl muted">No votes reported</div>'}<div class="tm">${Math.round(r.pct)}% reporting${calls.length ? ` · called by ${calls.join(', ')}` : ''}</div></div>`;
    }).join('');
  }
  function showTip(e, html) {
    tip.innerHTML = html; tip.hidden = false;
    const box = container.getBoundingClientRect();
    let x = e.clientX - box.left + 14, y = e.clientY - box.top + 14;
    if (x + tip.offsetWidth > box.width - 8) x = e.clientX - box.left - tip.offsetWidth - 14;
    if (y + tip.offsetHeight > box.height - 8) y = Math.max(0, e.clientY - box.top - tip.offsetHeight - 14);
    tip.style.left = `${x}px`; tip.style.top = `${y}px`;
  }
  function hideTip() { tip.hidden = true; }

  function register(el, r, state) {
    if (r) { if (!shapeByRace.has(r.id)) shapeByRace.set(r.id, []); shapeByRace.get(r.id).push(el); }
    if (!shapeByState.has(state)) shapeByState.set(state, []);
    shapeByState.get(state).push(el);
  }

  // ---- state map ----------------------------------------------------------
  function buildStateMap() {
    const svg = sv('svg', { viewBox: '0 0 1060 610', class: 'geo', role: 'img', 'aria-label': 'United States map' });
    const g = sv('g');
    for (const f of features) {
      const st = FIPS[f.id];
      const p = sv('path', { d: geoPath(f.geometry), class: 'st', 'data-state': st, tabindex: '0', role: 'button' });
      p.setAttribute('aria-label', st);
      g.appendChild(p);
      register(p, null, st);
    }
    svg.appendChild(g);
    // labels
    const lg = sv('g', { class: 'labels', 'aria-hidden': 'true' });
    for (const f of features) {
      const st = FIPS[f.id]; if (SMALL.includes(st)) continue;
      const c = centroids[st]; if (!c) continue;
      const t = sv('text', { x: c[0], y: c[1] + 1, class: 'lbl' }); t.textContent = st; lg.appendChild(t);
      const pt = sv('text', { x: c[0], y: c[1] + 13, class: 'lbl pct', 'data-pct': st }); lg.appendChild(pt);
      pctEls[st] = pt;
    }
    svg.appendChild(lg);
    // small-state column
    const col = sv('g', { class: 'small' });
    SMALL.forEach((st, i) => {
      const y = 150 + i * 36;
      const rect = sv('rect', { x: 985, y, width: 30, height: 30, class: 'st sq', 'data-state': st, tabindex: '0', role: 'button' });
      rect.setAttribute('aria-label', st);
      col.appendChild(rect);
      const t = sv('text', { x: 1022, y: y + 14, class: 'lbl side' }); t.textContent = st; col.appendChild(t);
      const pt = sv('text', { x: 1022, y: y + 27, class: 'lbl side pct', 'data-pct': st }); col.appendChild(pt);
      pctEls[st] = pt;
      register(rect, null, st);
    });
    svg.appendChild(col);
    return svg;
  }

  // ---- Tile cartograms (House by state, South Bay by city) ----------------
  function buildCartogram() {
    const tiles = Object.keys(GRID).map((st) => ({ key: st, label: st, cx: GRID[st][0], cy: GRID[st][1], rs: racesFor(st, 'house').sort((a, b) => (a.district || '').localeCompare(b.district || '', undefined, { numeric: true })) }));
    return buildTiles(tiles, 11, 8, 90, 'House districts by state', 'carto');
  }
  function buildSouthBay() {
    const defs = ctx.southBayTiles || [];
    const tiles = defs.map(([label, cx, cy]) => ({ key: label, label, cx, cy, rs: [...ctx.races.values()].filter((r) => r.sb === label).sort((a, b) => a.name.localeCompare(b.name)) }));
    return buildTiles(tiles, 4, 4, 150, 'South Bay races by city', 'carto sb');
  }
  function buildTiles(tiles, COLS, ROWS, T, aria, cls) {
    const PAD = 4;
    const svg = sv('svg', { viewBox: `0 0 ${COLS * T} ${ROWS * T}`, class: cls, role: 'img', 'aria-label': aria });
    for (const tdef of tiles) {
      const st = tdef.key;
      const x0 = tdef.cx * T + PAD, y0 = tdef.cy * T + PAD, w = T - PAD * 2;
      const tile = sv('g', { class: 'tile', 'data-state': st });
      const bg = sv('rect', { x: x0, y: y0, width: w, height: w, class: 'tile-bg', 'data-state': st, tabindex: '0', role: 'button' });
      bg.setAttribute('aria-label', `${tdef.label} races`);
      tile.appendChild(bg);
      const label = sv('text', { x: x0 + 5, y: y0 + 13, class: 'tile-lbl' }); label.textContent = tdef.label; tile.appendChild(label);
      const sb = /(^| )sb( |$)/.test(cls);
      const pt = sv('text', sb ? { x: x0 + 5, y: y0 + 26, class: 'tile-lbl pct sbpct', 'data-pct': st } : { x: x0 + w - 5, y: y0 + 13, class: 'tile-lbl pct', 'data-pct': st }); tile.appendChild(pt);
      pctEls[st] = pt;
      const rs = tdef.rs;
      const n = rs.length;
      if (n) {
        const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
        const areaY = y0 + (sb ? 30 : 17), areaH = w - (sb ? 34 : 21), areaW = w - 8;
        const cell = Math.min(areaW / cols, areaH / rows);
        const gap = cell > 8 ? 1.5 : 0.8;
        const offX = x0 + 4 + (areaW - cols * cell) / 2, offY = areaY + (areaH - rows * cell) / 2;
        rs.forEach((r, i) => {
          const c = i % cols, rr = Math.floor(i / cols);
          const rect = sv('rect', { x: offX + c * cell + gap / 2, y: offY + rr * cell + gap / 2, width: cell - gap, height: cell - gap, class: 'cell', 'data-race': r.id, tabindex: '0', role: 'button' });
          rect.setAttribute('aria-label', r.name);
          tile.appendChild(rect);
          register(rect, r, st);
        });
      }
      svg.appendChild(tile);
    }
    return svg;
  }

  // ---- colouring ----------------------------------------------------------
  function paint() {
    const cat = ctx.cat;
    const headline = cat === 'senate' || cat === 'governor';
    for (const [st, els] of shapeByState) {
      if (cat === 'house' || cat === 'southbay') {
        for (const el of els) {
          if (el.classList.contains('tile-bg')) { el.classList.toggle('selected', ctx.stateFilter === st); continue; }
          const r = ctx.races.get(Number(el.dataset.race));
          el.setAttribute('class', 'cell ' + fillFor(r).cls);
        }
        continue;
      }
      const rs = racesFor(st, cat);
      let cls;
      if (headline) cls = fillFor(rs[0]).cls;
      else cls = rs.length ? 'has' : 'none';
      for (const el of els) {
        el.setAttribute('class', (el.classList.contains('sq') ? 'st sq ' : 'st ') + cls + (ctx.stateFilter === st ? ' selected' : ''));
      }
    }
    for (const st in pctEls) {
      const rs = racesFor(st, cat);
      let txt = '';
      if (rs.length) {
        const avg = rs.reduce((a, r) => a + (r.pct || 0), 0) / rs.length;
        txt = `${Math.round(avg)}%`;
      }
      pctEls[st].textContent = txt;
    }
    if (zoom) updateZoomBar();
    legend.innerHTML = cat === 'house' || cat === 'southbay' || headline
      ? '<span><i class="sw lead D"></i>Dem leading</span><span><i class="sw called D"></i>Dem called</span><span><i class="sw lead R"></i>Rep leading</span><span><i class="sw called R"></i>Rep called</span><span><i class="sw lead I"></i>Ind</span><span><i class="sw empty"></i>No results yet</span>'
      : '<span><i class="sw has"></i>Has races tonight</span><span>Click a state to filter the board</span>';
    note.textContent = cat === 'house' ? 'Each square is one district. Click a square for the race, or a state for its list.' : cat === 'southbay' ? 'Each square is one race. Click a square to open it, or a city for its list.' : headline ? 'Click a state to open its race.' : '';
  }


  // ---- State zoom (counties) ----------------------------------------------
  const ABBR_TO_FIPS = Object.fromEntries(Object.entries(FIPS).map(([k, v]) => [v, k]));
  let countyTopo = null, countyFeats = null;
  const countyPaths = {}; // state -> [{id,name,d}]
  const stateBBox = {};
  let zoom = null; // { st, raceId, detail, g, timer }
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  async function loadCounties() {
    if (countyTopo) return;
    const r = await fetch(`/data/counties-albers-10m.json?v=${VER}`);
    if (!r.ok) throw new Error(`counties ${r.status}`);
    countyTopo = await r.json();
    countyFeats = topojson.feature(countyTopo, countyTopo.objects.counties).features;
  }
  function bboxOf(g) {
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const poly of polys) for (const p of poly[0]) { if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0]; if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1]; }
    return [minx, miny, maxx, maxy];
  }
  function countiesFor(st) {
    if (countyPaths[st]) return countyPaths[st];
    const pre = ABBR_TO_FIPS[st];
    countyPaths[st] = countyFeats.filter((f) => String(f.id).startsWith(pre)).map((f) => ({ id: String(f.id), name: f.properties.name, d: geoPath(f.geometry) }));
    return countyPaths[st];
  }
  function tweenViewBox(svg, to, ms) {
    const from = svg.getAttribute('viewBox').split(/\s+/).map(Number);
    if (reduced || !ms) { svg.setAttribute('viewBox', to.join(' ')); return; }
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      svg.setAttribute('viewBox', from.map((v, i) => v + (to[i] - v) * e).join(' '));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function leaderOf(cands) {
    const c = (cands || []).filter((x) => x.n !== 'Write-in').sort((a, b) => b.v - a.v);
    return c[0] && c[0].v > 0 ? c[0] : null;
  }
  function paintCounties() {
    if (!zoom || !zoom.g) return;
    const byFips = {};
    if (zoom.detail) for (const r of zoom.detail.regions || []) if (r.fips) byFips[r.fips] = r;
    for (const el of zoom.g.querySelectorAll('.cty')) {
      const r = byFips[el.dataset.fips];
      const lead = r ? leaderOf(r.cands) : null;
      el.setAttribute('class', 'cty ' + (lead ? 'lead ' + lead.p : r ? 'empty' : 'none'));
    }
  }
  async function refreshZoomDetail() {
    if (!zoom || !zoom.raceId) return;
    try {
      const res = await fetch(`/api/race/${zoom.raceId}`, { cache: 'no-store' });
      if (res.ok && zoom) { zoom.detail = await res.json(); paintCounties(); updateZoomBar(); }
    } catch (e) { /* keep last */ }
  }
  function updateZoomBar() {
    const bar = container.querySelector('.map-zoom');
    if (!zoom) { bar.hidden = true; return; }
    bar.hidden = false;
    const r = zoom.raceId ? ctx.races.get(zoom.raceId) : null;
    const pct = zoom.detail ? Math.round(zoom.detail.pct) : r ? Math.round(r.pct) : null;
    bar.querySelector('.zoom-title').textContent = r ? r.name : (STATE_NAMES[zoom.st] || zoom.st);
    bar.querySelector('.zoom-sub').textContent = r ? `${pct}% reporting${r.winner ? ', ' + r.winner.n + ' wins' : ''}` : 'Counties';
    bar.querySelector('.zoom-open').hidden = !r;
  }
  async function zoomTo(st) {
    if (!svgEl || lastMode !== 'geo') return;
    await loadCounties();
    const feat = features.find((f) => FIPS[f.id] === st);
    if (!feat) return;
    if (!stateBBox[st]) stateBBox[st] = bboxOf(feat.geometry);
    const [minx, miny, maxx, maxy] = stateBBox[st];
    const w = maxx - minx, h = maxy - miny, pad = Math.max(w, h) * 0.08;
    // keep aspect close to the base map (1060x610)
    let vw = w + pad * 2, vh = h + pad * 2;
    const ar = 1060 / 610;
    if (vw / vh < ar) vw = vh * ar; else vh = vw / ar;
    const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
    clearZoom(false);
    const headline = ctx.cat === 'senate' || ctx.cat === 'governor';
    const rs = headline ? racesFor(st, ctx.cat) : [];
    zoom = { st, raceId: rs.length ? rs[0].id : null, detail: null, g: null, timer: null };
    const g = sv('g', { class: 'counties' });
    for (const c of countiesFor(st)) {
      const p = sv('path', { d: c.d, class: 'cty none', 'data-fips': c.id, 'data-name': c.name });
      g.appendChild(p);
    }
    zoom.g = g;
    svgEl.insertBefore(g, svgEl.querySelector('.labels'));
    svgEl.classList.add('zoomed');
    for (const el of shapeByState.get(st) || []) el.classList.add('zoom-target');
    tweenViewBox(svgEl, [cx - vw / 2, cy - vh / 2, vw, vh], 450);
    updateZoomBar();
    if (zoom.raceId) { refreshZoomDetail(); zoom.timer = setInterval(refreshZoomDetail, 30000); }
  }
  function clearZoom(animate) {
    if (!zoom) return;
    if (zoom.timer) clearInterval(zoom.timer);
    if (zoom.g) zoom.g.remove();
    for (const el of svgEl.querySelectorAll('.zoom-target')) el.classList.remove('zoom-target');
    svgEl.classList.remove('zoomed');
    zoom = null;
    if (animate !== false) tweenViewBox(svgEl, [0, 0, 1060, 610], 350);
    updateZoomBar();
  }
  const STATE_NAMES = { AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'District of Columbia' };

  function bind(svg) {
    svg.addEventListener('mousemove', (e) => {
      const t = e.target;
      if (t.dataset.fips && zoom) {
        const r = zoom.detail && (zoom.detail.regions || []).find((x) => x.fips === t.dataset.fips);
        if (!r) return showTip(e, `<div class="tr"><div class="tn">${t.dataset.name}</div><div class="tl muted">No results yet</div></div>`);
        const c = (r.cands || []).filter((x) => x.n !== 'Write-in').sort((a, b) => b.v - a.v).slice(0, 2);
        return showTip(e, `<div class="tr"><div class="tn">${r.name}</div>${c.map((x) => `<div class="tl"><span class="p-${x.p}">${x.n} (${x.p})</span><b>${x.v.toLocaleString('en-US')} (${fmtPct(x.pc)})</b></div>`).join('')}<div class="tm">${Math.round(r.pct)}% reporting</div></div>`);
      }
      if (t.dataset.race) { const r = ctx.races.get(Number(t.dataset.race)); if (r) showTip(e, tipHTML([r])); return; }
      const st = t.dataset.state;
      if (!st) return hideTip();
      const cat = ctx.cat;
      const rs = racesFor(st, cat);
      if (!rs.length) return showTip(e, `<div class="tr"><div class="tn">${st}</div><div class="tl muted">No ${cat === 'house' ? 'House' : ''} races tonight</div></div>`);
      showTip(e, cat === 'house' ? `<div class="tr"><div class="tn">${st}: ${rs.length} districts</div><div class="tm">${rs.filter((r) => r.winner).length} called</div></div>` : cat === 'southbay' ? `<div class="tr"><div class="tn">${st}: ${rs.length} race${rs.length === 1 ? '' : 's'}</div><div class="tm">${rs.filter((r) => r.winner).length} called</div></div>` : tipHTML(rs.slice(0, 4)));
    });
    svg.addEventListener('mouseleave', hideTip);
    const act = (t) => {
      if (t.dataset.race) { ctx.onOpen(Number(t.dataset.race)); return; }
      if (t.dataset.fips) return;
      const st = t.dataset.state; if (!st) return;
      if (lastMode === 'geo') {
        if (zoom && zoom.st === st) { clearZoom(); ctx.onState(null); return; }
        zoomTo(st).catch(() => {});
        ctx.onState(st);
        return;
      }
      ctx.onState(st);
    };
    svg.addEventListener('click', (e) => act(e.target));
    svg.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(e.target); } });
  }

  async function render(next) {
    Object.assign(ctx, next);
    if (!container) {
      container = document.getElementById('map');
      tip = container.querySelector('.map-tip'); legend = container.querySelector('.map-legend'); note = container.querySelector('.map-note');
      container.querySelector('.zoom-back').addEventListener('click', () => { clearZoom(); ctx.onState(null); });
      container.querySelector('.zoom-open').addEventListener('click', () => { if (zoom && zoom.raceId) ctx.onOpen(zoom.raceId); });
    }
    await load();
    const mode = ctx.cat === 'house' ? 'carto' : ctx.cat === 'southbay' ? 'sb' : 'geo';
    const countSig = mode === 'carto' ? [...ctx.races.values()].filter((r) => r.cat === 'house' || r.cat === 'delegate').length : mode === 'sb' ? [...ctx.races.values()].filter((r) => r.sb).length : 0;
    if (mode !== lastMode || (mode !== 'geo' && countSig !== render.lastCount)) {
      zoom = null; shapeByRace = new Map(); shapeByState = new Map(); pctEls = {};
      if (svgEl) svgEl.remove();
      svgEl = mode === 'carto' ? buildCartogram() : mode === 'sb' ? buildSouthBay() : buildStateMap();
      container.querySelector('.map-stage').appendChild(svgEl);
      bind(svgEl);
      lastMode = mode; render.lastCount = countSig;
      updateZoomBar();
    }
    if (zoom && !ctx.stateFilter) clearZoom();
    paint();
  }
  function update(next) { if (!svgEl) return; Object.assign(ctx, next || {}); paint(); }

  window.VoteMap = { render, update };
})();
