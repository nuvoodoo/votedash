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
      const line = (c) => c ? `<div class="tl"><span class="p-${c.p}">${c.w ? '✓ ' : ''}${c.n} (${c.p})</span><b>${fmtPct(c.pc)}</b></div>` : '';
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
      const t = sv('text', { x: c[0], y: c[1] + 4, class: 'lbl' }); t.textContent = st; lg.appendChild(t);
    }
    svg.appendChild(lg);
    // small-state column
    const col = sv('g', { class: 'small' });
    SMALL.forEach((st, i) => {
      const y = 150 + i * 36;
      const rect = sv('rect', { x: 985, y, width: 30, height: 30, class: 'st sq', 'data-state': st, tabindex: '0', role: 'button' });
      rect.setAttribute('aria-label', st);
      col.appendChild(rect);
      const t = sv('text', { x: 1022, y: y + 20, class: 'lbl side' }); t.textContent = st; col.appendChild(t);
      register(rect, null, st);
    });
    svg.appendChild(col);
    return svg;
  }

  // ---- House cartogram ----------------------------------------------------
  function buildCartogram() {
    const T = 90, PAD = 4, COLS = 11, ROWS = 8;
    const svg = sv('svg', { viewBox: `0 0 ${COLS * T} ${ROWS * T}`, class: 'carto', role: 'img', 'aria-label': 'House districts by state' });
    for (const st in GRID) {
      const [cx, cy] = GRID[st];
      const x0 = cx * T + PAD, y0 = cy * T + PAD, w = T - PAD * 2;
      const tile = sv('g', { class: 'tile', 'data-state': st });
      const bg = sv('rect', { x: x0, y: y0, width: w, height: w, class: 'tile-bg', 'data-state': st, tabindex: '0', role: 'button' });
      bg.setAttribute('aria-label', `${st} House districts`);
      tile.appendChild(bg);
      const label = sv('text', { x: x0 + 5, y: y0 + 13, class: 'tile-lbl' }); label.textContent = st; tile.appendChild(label);
      const rs = racesFor(st, 'house').sort((a, b) => (a.district || '').localeCompare(b.district || '', undefined, { numeric: true }));
      const n = rs.length;
      if (n) {
        const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
        const areaY = y0 + 17, areaH = w - 21, areaW = w - 8;
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
      if (cat === 'house') {
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
    legend.innerHTML = cat === 'house' || headline
      ? '<span><i class="sw lead D"></i>Dem leading</span><span><i class="sw called D"></i>Dem called</span><span><i class="sw lead R"></i>Rep leading</span><span><i class="sw called R"></i>Rep called</span><span><i class="sw lead I"></i>Ind</span><span><i class="sw empty"></i>No results yet</span>'
      : '<span><i class="sw has"></i>Has races tonight</span><span>Click a state to filter the board</span>';
    note.textContent = cat === 'house' ? 'Each square is one district. Click a square for the race, or a state for its list.' : headline ? 'Click a state to open its race.' : '';
  }

  function bind(svg) {
    svg.addEventListener('mousemove', (e) => {
      const t = e.target;
      if (t.dataset.race) { const r = ctx.races.get(Number(t.dataset.race)); if (r) showTip(e, tipHTML([r])); return; }
      const st = t.dataset.state;
      if (!st) return hideTip();
      const cat = ctx.cat === 'house' ? 'house' : ctx.cat;
      const rs = racesFor(st, cat);
      if (!rs.length) return showTip(e, `<div class="tr"><div class="tn">${st}</div><div class="tl muted">No ${cat === 'house' ? 'House' : ''} races tonight</div></div>`);
      showTip(e, cat === 'house' ? `<div class="tr"><div class="tn">${st}: ${rs.length} districts</div><div class="tm">${rs.filter((r) => r.winner).length} called</div></div>` : tipHTML(rs.slice(0, 4)));
    });
    svg.addEventListener('mouseleave', hideTip);
    const act = (t) => {
      if (t.dataset.race) { ctx.onOpen(Number(t.dataset.race)); return; }
      const st = t.dataset.state; if (!st) return;
      if (ctx.cat === 'senate' || ctx.cat === 'governor') {
        const rs = racesFor(st, ctx.cat);
        if (rs.length === 1) ctx.onOpen(rs[0].id); else if (rs.length) ctx.onState(st);
      } else ctx.onState(st);
    };
    svg.addEventListener('click', (e) => act(e.target));
    svg.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(e.target); } });
  }

  async function render(next) {
    Object.assign(ctx, next);
    if (!container) {
      container = document.getElementById('map');
      tip = container.querySelector('.map-tip'); legend = container.querySelector('.map-legend'); note = container.querySelector('.map-note');
    }
    await load();
    const mode = ctx.cat === 'house' ? 'carto' : 'geo';
    const countSig = mode === 'carto' ? [...ctx.races.values()].filter((r) => r.cat === 'house' || r.cat === 'delegate').length : 0;
    if (mode !== lastMode || (mode === 'carto' && countSig !== render.lastCount)) {
      shapeByRace = new Map(); shapeByState = new Map();
      if (svgEl) svgEl.remove();
      svgEl = mode === 'carto' ? buildCartogram() : buildStateMap();
      container.querySelector('.map-stage').appendChild(svgEl);
      bind(svgEl);
      lastMode = mode; render.lastCount = countSig;
    }
    paint();
  }
  function update(next) { if (!svgEl) return; Object.assign(ctx, next || {}); paint(); }

  window.VoteMap = { render, update };
})();
