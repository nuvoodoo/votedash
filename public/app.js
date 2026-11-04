/* VoteDash front end. Snapshot over HTTP, diffs over SSE, polling fallback. */
(function () {
  'use strict';
  const $ = (s, el) => (el || document).querySelector(s);
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    for (const k of kids) if (k != null) n.append(k);
    return n;
  };
  const app = (n, ...kids) => { for (const k of kids) if (k != null) n.append(k); return n; };
  const fmtN = (n) => (n || 0).toLocaleString('en-US');
  const fmtPct = (n) => `${(Math.round((n || 0) * 10) / 10).toFixed(1)}%`;
  // Times in the viewer's own zone, labelled with its short name (PST, ET, GMT+1).
  const TZ = (() => { try { const p = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date()).find((x) => x.type === 'timeZoneName'); return p ? p.value : ''; } catch (e) { return ''; } })();
  const fmtTime = (ts) => new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }) + (TZ ? ' ' + TZ : '');
  const fmtShort = (ts) => new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const PARTY = { D: 'Dem', R: 'Rep', I: 'Ind', O: '' };
  const OUTLET_ORDER = ['DDHQ', 'AP', 'CNN', 'NBC', 'Fox', 'NYT', 'ABC', 'CBS', 'Reuters', 'Pollgebra', 'civicAPI'];

  const state = {
    races: new Map(), bop: null, feed: [], social: [], calls: {}, forecastTotals: null,
    cat: 'senate', q: '', stateFilter: null, sbKind: 'all', pm: { races: {}, control: {} }, uncalled: false, sort: 'state', feedTab: 'all', view: 'board', raceId: null,
    lastTs: 0, sse: null, stale: false, unseenFeed: 0,
  };

  // ---- routing ----------------------------------------------------------
  // URL scheme: /  |  /board/{lacounty|senate|house|governor|ballot|statewide|legislature}?state=GA&kind=measures&city=Hawthorne&uncalled=1&sort=margin
  //             (the LA County tab is the 'southbay' category inside; /board/southbay still opens it and keeps its URL)
  //             /race/{id}  |  /feed/{all|call|news|exitpoll|social}
  const CATS = ['senate', 'house', 'governor', 'ballot', 'statewide', 'legislature', 'southbay'];
  const FEEDS = ['all', 'call', 'news', 'exitpoll', 'social'];
  function route() {
    const path = location.pathname, qs = new URLSearchParams(location.search);
    const m = path.match(/^\/race\/(\d+)/);
    state.raceId = m ? Number(m[1]) : null;
    const f = path.match(/^\/feed(?:\/([a-z]+))?/);
    state.view = f ? 'feed' : /^\/calls\b/.test(path) ? 'calls' : 'board';
    if (f && FEEDS.includes(f[1] || '')) state.feedTab = f[1];
    const b = path.match(/^\/board\/([a-z]+)/);
    if (b && b[1] === 'lacounty') { state.cat = 'southbay'; state.sbSlug = 'lacounty'; }
    else if (b && CATS.includes(b[1])) { state.cat = b[1]; if (b[1] === 'southbay') state.sbSlug = 'southbay'; }
    if (!state.raceId) {
      state.stateFilter = qs.get('state') || qs.get('city') || null;
      state.sbKind = ['all', 'measures', 'offices'].includes(qs.get('kind') || '') ? qs.get('kind') : 'all';
      state.uncalled = qs.get('uncalled') === '1';
      if (['state', 'pct', 'margin', 'updated'].includes(qs.get('sort') || '')) state.sort = qs.get('sort');
      $('#uncalled').checked = state.uncalled; $('#sort').value = state.sort;
    }
    document.body.dataset.view = state.view;
    document.querySelectorAll('[data-nav]').forEach((a) => a.setAttribute('aria-current', a.dataset.nav === state.view ? 'page' : 'false'));
    if (state.view === 'feed') { state.unseenFeed = 0; renderBadge(); renderFeed(); }
    renderMain();
  }
  function boardURL() {
    const qs = new URLSearchParams();
    if (state.stateFilter) qs.set(state.cat === 'southbay' ? 'city' : 'state', state.stateFilter);
    if (state.cat === 'southbay' && state.sbKind !== 'all') qs.set('kind', state.sbKind);
    if (state.uncalled) qs.set('uncalled', '1');
    if (state.sort !== 'state') qs.set('sort', state.sort);
    const q = qs.toString();
    return `/board/${state.cat === 'southbay' ? state.sbSlug || 'lacounty' : state.cat}${q ? '?' + q : ''}`;
  }
  function syncURL(replace) {
    const url = state.raceId ? `/race/${state.raceId}` : state.view === 'feed' ? `/feed/${state.feedTab}` : state.view === 'calls' ? '/calls' : boardURL();
    if (url === location.pathname + location.search) return;
    history[replace ? 'replaceState' : 'pushState'](null, '', url);
  }
  function go(path) { history.pushState(null, '', path); route(); try { navigator.sendBeacon ? navigator.sendBeacon('/api/view?p=' + encodeURIComponent(path)) : fetch('/api/view?p=' + encodeURIComponent(path)); } catch (e) { /* ignore */ } }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-nav]');
    if (a) { e.preventDefault(); const h = a.getAttribute('href'); go(h === '/feed' ? `/feed/${state.feedTab}` : h === '/board' ? boardURL() : h); }
  });
  window.addEventListener('popstate', route);

  // ---- data -------------------------------------------------------------
  async function loadSnapshot() {
    const r = await fetch('/api/snapshot', { cache: 'no-store' });
    const s = await r.json();
    if (!s.races.length && state.races.size) { setTimeout(() => loadSnapshot().catch(() => {}), 5000); return; } // keep last results
    state.races = new Map(s.races.map((x) => [x.id, x]));
    state.southBayTiles = s.southBayTiles || state.southBayTiles; if (s.polymarket && s.polymarket.ts) state.pm = s.polymarket; state.bop = s.bop; if (s.feed.length || !state.feed.length) state.feed = s.feed; if (s.social.length || !state.social.length) state.social = s.social; state.calls = Object.keys(s.calls || {}).length ? s.calls : state.calls; state.forecastTotals = s.forecastTotals || state.forecastTotals;
    state.lastTs = s.status?.civic?.lastOk ? Date.parse(s.status.civic.lastOk) : s.ts;
    renderAll();
    if (!s.races.length) setTimeout(() => loadSnapshot().catch(() => {}), 5000);
  }

  function applyRaces(rows) {
    const flash = [];
    for (const r of rows) { state.races.set(r.id, r); flash.push(r.id); }
    return flash;
  }

  function connect() {
    if (state.sse) state.sse.close();
    const es = new EventSource('/events');
    state.sse = es;
    es.addEventListener('hello', () => { setStale(false); });
    es.addEventListener('reload', () => { loadSnapshot().catch(() => {}); });
    es.addEventListener('races', (e) => {
      const d = JSON.parse(e.data);
      const ids = applyRaces(d.rows);
      state.bop = d.bop; state.lastTs = d.ts; setStale(false);
      renderBop(); renderUpdated();
      patchRows(ids);
      if (state.raceId && ids.includes(state.raceId)) renderDetail(true);
    });
    es.addEventListener('tick', (e) => {
      const d = JSON.parse(e.data);
      if (d.bop) { state.bop = d.bop; renderBop(); }
      if (d.status && d.status.civic) state.lastTs = Date.parse(d.status.civic);
      setStale(false); renderUpdated();
    });
    es.addEventListener('feed', (e) => {
      const d = JSON.parse(e.data);
      state.calls = d.calls || state.calls;
      prependFeed(d.items.map((i) => ({ ...i, _new: true })));
      // calls change the "Called by" column
      patchRows(d.items.filter((i) => i.race_id).map((i) => i.race_id));
      if (state.raceId && d.items.some((i) => i.race_id === state.raceId)) renderDetail(true);
    });
    es.addEventListener('polymarket', (e) => {
      state.pm = JSON.parse(e.data); renderBop();
      patchRows(Object.keys(state.pm.races).map(Number));
      if (state.raceId && state.pm.races[state.raceId]) renderDetail(false);
    });
    es.addEventListener('social', (e) => {
      const d = JSON.parse(e.data);
      const seen = new Set(state.social.map((s) => s.id));
      const fresh = d.items.filter((s) => !seen.has(s.id)).map((s) => ({ ...s, kind: 'social', _new: true }));
      state.social = fresh.concat(state.social).slice(0, 300);
      if (fresh.length) { if (state.view !== 'feed') state.unseenFeed += fresh.length; renderFeed(); renderBadge(); }
    });
    es.onerror = () => { setStale(true); };
  }

  // Polling fallback: if no SSE message in 70s, refetch snapshot.
  let lastMsg = Date.now();
  ['races', 'tick', 'feed', 'social', 'hello', 'reload', 'polymarket'].forEach((ev) => document.addEventListener(ev, () => {}));
  setInterval(() => {
    if (!state.sse || state.sse.readyState === 2 || Date.now() - lastMsg > 70000) {
      loadSnapshot().then(() => { lastMsg = Date.now(); }).catch(() => setStale(true));
      if (!state.sse || state.sse.readyState === 2) connect();
    }
  }, 30000);
  const origConnect = connect;
  connect = function () { origConnect(); state.sse.onmessage = null; ['races', 'tick', 'feed', 'social', 'hello', 'reload'].forEach((ev) => state.sse.addEventListener(ev, () => { lastMsg = Date.now(); })); };

  function setStale(v) { state.stale = v; $('#live').classList.toggle('stale', v); renderUpdated(); }
  function renderUpdated() {
    const t = $('#updated');
    t.textContent = state.lastTs ? (state.stale ? 'reconnecting, last ' : 'updated ') + fmtTime(state.lastTs) : 'connecting';
    if (state.lastTs) t.setAttribute('datetime', new Date(state.lastTs).toISOString());
  }

  // ---- helpers ----------------------------------------------------------
  function catOf(r) {
    if (r.cat === 'state-senate' || r.cat === 'state-house') return 'legislature';
    if (r.cat === 'delegate') return 'house';
    return r.cat;
  }
  function leaderInfo(r) {
    const c = r.cands.filter((x) => x.n !== 'Write-in');
    const a = c[0], b = c[1];
    const margin = a && b ? a.pc - b.pc : a ? a.pc : 0;
    return { a, b, margin };
  }
  function ratingClass(rt) {
    if (!rt) return '';
    if (/toss/i.test(rt)) return 'T';
    if (/\bD$/.test(rt)) return 'D';
    if (/\bR$/.test(rt)) return 'R';
    return '';
  }
  function raceLabel(r) {
    if (r.cat === 'house' || r.cat === 'delegate') return `${r.stateName} ${r.district ? r.district.split('-')[1] === 'AL' ? 'at large' : 'District ' + Number(r.district.split('-')[1]) : ''}`.trim();
    if (r.cat === 'senate') return `${r.stateName} Senate`;
    if (r.cat === 'governor') return `${r.stateName} Governor`;
    if (r.cat === 'local') return r.name.replace(/^California /, '').replace(/^City of /, '');
    return r.name;
  }
  function pmChip(r, full) {
    const m = state.pm && state.pm.races[r.id]; if (!m) return null;
    const parts = ['D', 'R', 'I'].filter((p) => m[p] != null).map((p) => el('span', { class: 'p-' + p }, `${p} ${Math.round(m[p])}%`));
    const a = el('a', { class: 'pm-chip', href: m.url, target: '_blank', rel: 'noopener', title: `Polymarket: ${m.title}. Trader odds, not results.` }, el('span', { class: 'pm-lbl' }, 'Polymarket'));
    parts.forEach((p) => a.append(p));
    if (full && m.vol) a.append(el('span', { class: 'pm-vol' }, `$${(m.vol / 1e6).toFixed(1)}M`));
    return a;
  }
  function callTags(r, withCivic) {
    const c = state.calls[r.id] || {};
    const out = [];
    const keys = Object.keys(c).sort((x, y) => (OUTLET_ORDER.indexOf(x) + 1 || 99) - (OUTLET_ORDER.indexOf(y) + 1 || 99));
    for (const k of keys) {
      if (k === 'civicAPI' && !withCivic) continue;
      out.push(el('a', { class: 'call-tag' + (k === 'civicAPI' ? ' civic' : k === 'Pollgebra' ? ' pg' : k === 'DDHQ' ? ' ddhq' : ''), href: c[k].url, target: '_blank', rel: 'noopener', title: `${c[k].title} (${fmtShort(c[k].ts)})` }, k));
    }
    return out;
  }
  // Bar colour: party for partisan candidates; nonpartisan ones (and Yes/No) get neutral
  // colours that stay with the candidate as the count moves (alphabetical, Yes and No fixed).
  function barClass(cands, c) {
    if (c.p !== 'O') return c.p;
    if (/^yes$/i.test(c.n)) return 'n1';
    if (/^no$/i.test(c.n)) return 'n2';
    const names = cands.filter((x) => x.p === 'O').map((x) => x.n).sort();
    return 'n' + ((names.indexOf(c.n) % 4) + 1);
  }
  function barFor(cands, h) {
    const bar = el('div', { class: 'bar', 'aria-hidden': 'true' });
    const total = cands.reduce((s, c) => s + c.v, 0) || 1;
    for (const c of cands) if (c.v > 0) bar.append(el('i', { class: barClass(cands, c), style: `width:${(c.v / total) * 100}%` }));
    return bar;
  }

  // ---- balance of power -------------------------------------------------
  function renderBop() {
    const b = state.bop; if (!b) return;
    const box = $('#bop'); box.innerHTML = '';
    const defs = [['senate', 'Senate', 'seats'], ['house', 'House', 'seats'], ['governor', 'Governors', 'states']];
    for (const [k, title, unit] of defs) {
      const d = b[k]; if (!d) continue;
      const dw = (d.D / d.total) * 100, rw = (d.R / d.total) * 100, iw = (d.I / d.total) * 100;
      const dh = (d.hold.D / d.total) * 100, rh = (d.hold.R / d.total) * 100;
      const control = d.D >= d.majority ? 'D' : d.R >= d.majority ? 'R' : null;
      app(box, el('div', { class: 'bop-row' },
        el('div', { class: 'bop-title' }, el('h2', null, title), el('span', { class: 'need' }, `${d.majority} for control`)),
        el('div', { class: 'bop-nums' },
          el('div', { class: 'bop-num d' }, String(d.D), el('small', null, `Dem${k === 'senate' ? ' + Ind' : ''}${control === 'D' ? ', control' : ''}`)),
          d.remaining > 0 ? el('div', { class: 'bop-mid' }, String(d.remaining), el('small', null, 'uncalled')) : null,
          el('div', { class: 'bop-num r' }, String(d.R), el('small', { style: 'text-align:right' }, `Rep${control === 'R' ? ', control' : ''}`))),
        el('div', { class: 'bop-bar', role: 'img', 'aria-label': `${title}: Democrats ${d.D}, Republicans ${d.R}, ${d.remaining} ${unit} uncalled` },
          el('div', { class: 'fill d', style: `width:${dw}%` }),
          el('div', { class: 'fill d hold', style: `width:${dh}%` }),
          iw ? el('div', { class: 'fill i', style: `left:${dw}%;width:${iw}%` }) : null,
          el('div', { class: 'fill r', style: `width:${rw}%` }),
          el('div', { class: 'fill r hold', style: `width:${rh}%` }),
          el('div', { class: 'line' })),
        el('div', { class: 'bop-foot' },
          el('span', null, el('b', null, String(d.remaining)), ` of ${d.onBallot} ${unit} uncalled`),
          el('span', null, k === 'house' ? '' : `Not up tonight: D ${d.hold.D}, R ${d.hold.R}`),
          state.pm.control && state.pm.control[k] ? el('a', { class: 'pm-chip', href: state.pm.control[k].url, target: '_blank', rel: 'noopener', title: 'Polymarket odds of control. Trader odds, not results.' }, el('span', { class: 'pm-lbl' }, 'Polymarket'), el('span', { class: 'p-D' }, `D ${Math.round(state.pm.control[k].D)}%`), el('span', { class: 'p-R' }, `R ${Math.round(state.pm.control[k].R)}%`)) : null)));
    }
  }

  // ---- board ------------------------------------------------------------
  function filtered() {
    const q = state.q.trim().toLowerCase();
    let rows = state.cat === 'southbay' ? [...state.races.values()].filter((r) => r.sb) : [...state.races.values()].filter((r) => catOf(r) === state.cat);
    if (state.stateFilter) rows = rows.filter((r) => (state.cat === 'southbay' ? r.sb : r.state) === state.stateFilter);
    if (state.cat === 'southbay' && state.sbKind !== 'all') rows = rows.filter((r) => (/referendum|proposition|ballot measure/i.test(r.type) ? 'measures' : 'offices') === state.sbKind);
    if (state.uncalled) rows = rows.filter((r) => !r.called);
    if (q) rows = rows.filter((r) => `${r.name} ${r.stateName} ${r.state} ${r.district || ''} ${r.cands.map((c) => c.n).join(' ')}`.toLowerCase().includes(q));
    const key = {
      state: (a, b) => a.stateName.localeCompare(b.stateName) || (a.district || '').localeCompare(b.district || '', undefined, { numeric: true }) || a.name.localeCompare(b.name),
      pct: (a, b) => b.pct - a.pct,
      margin: (a, b) => (a.total ? Math.abs(leaderInfo(a).margin) : 999) - (b.total ? Math.abs(leaderInfo(b).margin) : 999),
      updated: (a, b) => b.total - a.total,
    }[state.sort];
    return rows.sort(key);
  }

  const rowEls = new Map();
  function buildRow(r) {
    const tr = el('tr', { 'data-id': r.id, tabindex: '-1' });
    tr.addEventListener('click', (e) => { if (e.target.closest('a')) return; go(`/race/${r.id}`); });
    fillRow(tr, r);
    return tr;
  }
  function fillRow(tr, r) {
    tr.innerHTML = '';
    const { a, b, margin } = leaderInfo(r);
    const nameCell = el('td', null,
      el('span', { class: 'race-name' }, el('button', { type: 'button', onclick: () => go(`/race/${r.id}`) }, raceLabel(r))),
      el('span', { class: 'race-sub' },
        state.cat === 'southbay' && r.sb ? el('span', null, r.sb) : null,
        (r.cat === 'house' || r.cat === 'senate' || r.cat === 'governor') ? null : el('span', null, r.type === r.name ? '' : r.type),
        r.rating ? el('span', { class: 'rating ' + ratingClass(r.rating) }, r.rating) : null,
        r.open ? el('span', { class: 'open-seat' }, 'Open seat') : null,
        r.cat === 'governor' && r.incParty ? el('span', { class: 'open-seat' }, `Seat held by ${r.incParty}`) : null,
        r.called && r.winner ? el('span', { class: 'called-note' }, `Winner: ${r.winner.n}${r.callSrc ? ' (' + r.callSrc + ')' : ''}`) : null,
        pmChip(r, false),
        r.upd ? el('span', { class: 'upd', title: 'Last change to this race on VoteDash' }, `Updated ${fmtShort(r.upd)}`) : null,
        r.src && r.src !== 'civicAPI' ? el('span', { class: 'src-tag', title: `Vote counts from ${r.src}` }, r.src) : null));
    const leadCell = el('td', { class: 'leader' });
    if (r.total > 0 && a) {
      app(leadCell, 
        el('div', { class: 'cand-line' + (a.w ? ' w' : '') }, el('span', { class: 'nm p-' + a.p }, `${a.n}${PARTY[a.p] ? ' (' + a.p + ')' : ''}`, a.inc ? el('span', { class: 'inc-tag' }, 'Incumbent') : null), el('span', { class: 'pc' }, fmtPct(a.pc))),
        b ? el('div', { class: 'cand-line' + (b.w ? ' w' : '') }, el('span', { class: 'nm p-' + b.p }, `${b.n}${PARTY[b.p] ? ' (' + b.p + ')' : ''}`, b.inc ? el('span', { class: 'inc-tag' }, 'Incumbent') : null), el('span', { class: 'pc' }, fmtPct(b.pc))) : null,
        barFor(r.cands));
    } else {
      app(leadCell, el('div', { class: 'cand-line' }, el('span', { class: 'nm', style: 'color:var(--ink-2)' }, r.cands.filter((c) => c.n !== 'Write-in').slice(0, 3).map((c) => `${c.n}${PARTY[c.p] ? ' (' + c.p + ')' : ''}${c.inc ? ' [Inc]' : ''}`).join(', ') || 'No candidates listed')), el('div', { class: 'cand-line' }, el('span', { class: 'nm', style: 'color:var(--ink-2)' }, 'No votes reported')));
    }
    const marginCell = el('td', { class: 'num margin' }, r.total > 0 && b ? el('span', { class: 'p-' + a.p }, `${a.p} +${(Math.round(margin * 10) / 10).toFixed(1)}`) : '');
    const pctCell = el('td', { class: 'num pct' }, `${Math.round(r.pct)}%`, el('span', { class: 'pbar', 'aria-hidden': 'true' }, el('i', { style: `width:${Math.min(100, r.pct)}%` })));
    const callCell = el('td', { class: 'calls' }, ...callTags(r, true));
    app(tr, nameCell, leadCell, marginCell, pctCell, callCell);
  }
  function renderBoard() {
    const rows = filtered();
    const tb = $('#race-rows'); tb.innerHTML = ''; rowEls.clear();
    const frag = document.createDocumentFragment();
    for (const r of rows) { const tr = buildRow(r); rowEls.set(r.id, tr); app(frag, tr); }
    app(tb, frag);
    $('#empty').hidden = rows.length > 0;
    $('#map-clear').hidden = !state.stateFilter;
    const sbBar = $('#sb-bar'); sbBar.hidden = state.cat !== 'southbay';
    if (state.cat === 'southbay') {
      const sel = $('#sb-city'); const cities = (state.southBayTiles || []).map((t) => t[0]);
      if (sel.options.length !== cities.length + 1) { sel.innerHTML = '<option value="">All cities</option>' + cities.map((c) => `<option value="${c}">${c}</option>`).join(''); }
      sel.value = state.stateFilter || '';
      $('#sb-kind').querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', b.dataset.kind === state.sbKind ? 'true' : 'false'));
    }
    if (window.VoteMap) VoteMap.render({ cat: state.cat, races: state.races, calls: state.calls, stateFilter: state.stateFilter, southBayTiles: state.southBayTiles,
      onOpen: (id) => go(`/race/${id}`),
      onState: (st) => { state.stateFilter = st === null ? null : (state.stateFilter === st ? null : st); renderBoard(); syncURL(); } }).catch(() => {});
    $('#cat-tabs').querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', b.dataset.cat === state.cat ? 'true' : 'false'));
  }
  function patchRows(ids) {
    let resort = false;
    for (const id of ids) {
      const tr = rowEls.get(id); const r = state.races.get(id);
      if (!tr || !r) { if (r && catOf(r) === state.cat) resort = true; continue; }
      fillRow(tr, r);
      tr.classList.add('flash'); setTimeout(() => tr.classList.remove('flash'), 1500);
      if (state.sort !== 'state' || (state.uncalled && r.called)) resort = true;
    }
    if (resort) renderBoard(); else if (window.VoteMap) VoteMap.update({ races: state.races, calls: state.calls });
  }

  // ---- detail -----------------------------------------------------------
  let detailData = null, detailFor = null, regionSort = { key: 'name', dir: 1 };
  async function renderDetail(refresh) {
    const box = $('#detail'); const r = state.races.get(state.raceId);
    $('#board').hidden = true; box.hidden = false;
    if (!r) { box.innerHTML = ''; app(box, el('button', { class: 'back', type: 'button', onclick: () => { state.raceId = null; go(boardURL()); } }, 'Back to board'), el('p', { class: 'empty' }, 'Race not found.')); return; }
    if (window.VDTitles) document.title = VDTitles.race(r).title; // follows the count and the call
    if (detailFor !== r.id) { detailData = null; detailFor = r.id; regionSort = { key: 'name', dir: 1 }; }
    const draw = () => {
      box.innerHTML = '';
      const d = detailData;
      const cands = (d ? d.cands : r.cands);
      const c = state.calls[r.id] || {};
      const callKeys = Object.keys(c);
      app(box, el('button', { class: 'back', type: 'button', onclick: () => { state.raceId = null; go(boardURL()); } }, 'Back to board'));
      app(box, el('h1', null, r.name));
      const meta = el('div', { class: 'meta' },
        el('span', null, el('b', null, `${Math.round(d ? d.pct : r.pct)}%`), ' reporting'),
        r.upd ? el('span', null, 'Last update ', el('b', null, fmtTime(r.upd))) : null,
        r.src && r.src !== 'civicAPI' ? el('span', null, 'Counts from ', el('b', null, r.src), r.srcTs ? ` as of ${fmtShort(r.srcTs)}` : '') : null,
        r.rating ? el('span', null, 'Rating ', el('b', null, r.rating)) : null,
        r.open ? el('span', null, el('b', null, 'Open seat')) : null,
        r.incParty && (r.open || r.cat === 'governor') ? el('span', null, 'Seat held by ', el('b', null, r.incParty)) : null,
        d && d.polls_close ? el('span', null, 'Polls close ', el('b', null, fmtShort(d.polls_close))) : null,
        d && d.updated ? el('span', null, 'civicAPI updated ', el('b', null, fmtTime(d.updated))) : null,
        d && d.registered ? el('span', null, 'Registered ', el('b', null, fmtN(d.registered))) : null,
        d && d.disputed ? el('span', null, el('b', null, 'Disputed')) : null,
        pmChip(r, true));
      app(box, meta);
      if (r.winner || callKeys.length) {
        app(box, el('div', { class: 'call-banner' },
          el('span', { class: 'lead' }, r.winner ? `${r.winner.n} wins${r.callSrc ? ', projected by ' + r.callSrc : ''}.` : 'Called by'),
          r.winner && callKeys.length ? el('span', null, 'Called by') : null,
          ...callTags(r, true)));
      }
      const ctBox = el('div', { class: 'ct-detail' });
      app(box, ctBox);
      loadCalls().then((cd) => {
        const rr = cd.races.find((x) => x.id === r.id);
        if (!rr || !ctBox.isConnected || ctEvents(rr).length < 2) return;
        ctBox.replaceChildren(el('h2', null, 'Who called it'), raceTimeline(rr), el('a', { class: 'ct-all', href: '/calls', onclick: (e) => { e.preventDefault(); go('/calls'); } }, 'Every source ranked'));
      }).catch(() => {});
      const tbl = el('table', { class: 'cands' }, el('tbody'));
      const tb = tbl.firstChild; const totalV = cands.reduce((s, x) => s + x.v, 0) || 1;
      for (const x of cands) {
        app(tb, el('tr', { class: x.w ? 'w' : '' },
          el('td', { class: 'cn p-' + x.p }, x.n, el('span', { class: 'party' }, x.pf || ''), x.inc ? el('span', { class: 'inc' }, 'Incumbent') : null),
          el('td', { class: 'cb' }, el('div', { class: 'bar' }, el('i', { class: barClass(cands, x), style: `width:${(x.v / totalV) * 100}%` }))),
          el('td', { class: 'cv' }, fmtN(x.v)),
          el('td', { class: 'cp' }, fmtPct(x.pc))));
      }
      app(box, tbl);
      if (d && d.regions && d.regions.length) {
        const top2 = cands.slice(0, 2);
        app(box, el('h2', null, `${d.regions[0].type || 'Region'} results`));
        const th = (label, key, num) => { const h = el('th', { scope: 'col', class: num ? 'num' : '' }, label + (regionSort.key === key ? (regionSort.dir > 0 ? ' ▲' : ' ▼') : '')); h.addEventListener('click', () => { regionSort = { key, dir: regionSort.key === key ? -regionSort.dir : 1 }; draw(); }); return h; };
        const rt = el('table', { class: 'regions' }, el('thead', null, el('tr', null, th('Name', 'name'), th('In', 'pct', true), ...top2.map((x) => { const h = th(x.n, 'c' + x.n, true); h.classList.add('p-' + x.p); return h; }), th('Margin', 'margin', true))), el('tbody'));
        const rb = rt.lastChild;
        const regs = d.regions.map((g) => { const m = {}; for (const x of g.cands) m[x.n] = x; const a = m[top2[0]?.n] || { v: 0, pc: 0 }, b = m[top2[1]?.n] || { v: 0, pc: 0 }; return { g, a, b, margin: a.pc - b.pc }; });
        regs.sort((x, y) => { const k = regionSort.key; let v = 0; if (k === 'name') v = x.g.name.localeCompare(y.g.name); else if (k === 'pct') v = x.g.pct - y.g.pct; else if (k === 'margin') v = x.margin - y.margin; else if (k.startsWith('c')) { const n = k.slice(1); v = (n === top2[0].n ? x.a.v - y.a.v : x.b.v - y.b.v); } return v * regionSort.dir; });
        for (const { g, a, b, margin } of regs) {
          const lead = g.pct > 0 || a.v || b.v ? (a.v > b.v ? top2[0] : b.v > a.v ? top2[1] : null) : null;
          app(rb, el('tr', null, el('td', null, g.name), el('td', { class: 'num' }, `${Math.round(g.pct)}%`), el('td', { class: 'num' }, `${fmtN(a.v)} (${fmtPct(a.pc)})`), el('td', { class: 'num' }, `${fmtN(b.v)} (${fmtPct(b.pc)})`), el('td', { class: 'num ' + (lead ? 'lead-' + lead.p : '') }, lead ? `${lead.p} +${Math.abs(Math.round(margin * 10) / 10).toFixed(1)}` : '')));
        }
        app(box, rt);
      } else if (!d) {
        app(box, el('p', { class: 'empty' }, 'Loading county results.'));
      }
      const related = state.feed.filter((i) => i.race_id === r.id).concat(state.social.filter((i) => i.race_id === r.id).map((i) => ({ ...i, kind: 'social' }))).sort((a, b) => b.ts - a.ts);
      if (related.length) { app(box, el('h2', null, 'In the feed')); const ol = el('ol', { class: 'feed-list' }); related.slice(0, 20).forEach((i) => ol.append(feedItem(i))); app(box, ol); }
      app(box, el('p', { class: 'civic-link' }, el('a', { href: `https://civicapi.org/results/elections/${r.id}`, target: '_blank', rel: 'noopener' }, 'This race on civicAPI')));
    };
    draw();
    if (!detailData || refresh) {
      try {
        const res = await fetch(`/api/race/${r.id}`, { cache: 'no-store' });
        if (res.ok && state.raceId === r.id) { detailData = await res.json(); draw(); }
      } catch (e) { /* keep summary view */ }
    }
  }

  // ---- feed -------------------------------------------------------------
  const ICONS = {
    X: '<svg viewBox="0 0 24 24" width="16" height="16" aria-label="X" role="img"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
    Bluesky: '<svg viewBox="0 0 24 24" width="16" height="16" aria-label="Bluesky" role="img"><path fill="currentColor" d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364-4.668.69-4.672 6.49.015 6.8-2.1.2-3.9 1.1-4.6 2.3 0 0 .35 1.04 2.35 1.04 1.9 0 4.4-1.1 6.2-4.5 1.8 3.4 4.3 4.5 6.2 4.5 2 0 2.35-1.04 2.35-1.04-.7-1.2-2.5-2.1-4.6-2.3 4.687-.31 4.683-6.11.015-6.8 2.67.296 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.479 0-.69-.139-1.86-.902-2.203-.659-.299-1.664-.621-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z"/></svg>',
  };
  function platformIcon(p) { const s = el('span', { class: 'plat', html: ICONS[p] || '' }); if (!ICONS[p]) s.textContent = p || ''; return s; }
  function feedItem(i) {
    const li = el('li', { class: i.kind + (i._new ? ' new' : '') + (i.kind === 'social' ? ' p-' + (i.party || 'N') : '') });
    if (i.kind === 'social') {
      app(li, 
        el('div', { class: 'who' }, platformIcon(i.platform), el('span', { class: 'outlet' }, i.author || i.handle || i.platform), i.handle ? el('span', { class: 'handle' }, '@' + i.handle) : null, el('time', { datetime: new Date(i.ts).toISOString() }, fmtShort(i.ts))),
        i.tag ? el('div', { class: 'tag' }, i.tag) : null,
        el('p', { class: 'txt' }, i.text || ''),
        i.image ? el('img', { class: 'post-img', src: i.image, alt: '', loading: 'lazy' }) : null,
        el('div', { class: 'links' }, i.url ? el('a', { class: 'race-link', href: i.url, target: '_blank', rel: 'noopener' }, 'Open post') : null, i.race_id ? el('button', { class: 'race-link', type: 'button', onclick: () => go(`/race/${i.race_id}`) }, i.race_name || 'Open race') : null));
      return li;
    }
    const kindLabel = { call: 'Call', exitpoll: 'Exit poll', news: 'News' }[i.kind] || i.kind;
    app(li, 
      el('div', { class: 'who' }, el('span', { class: 'outlet' }, i.outlet || 'News'), el('span', { class: 'kind ' + i.kind }, kindLabel), el('time', { datetime: new Date(i.ts).toISOString() }, fmtShort(i.ts))),
      el('a', { class: 'ttl', href: i.url, target: '_blank', rel: 'noopener' }, i.title),
      i.race_id ? el('button', { class: 'race-link', type: 'button', onclick: () => go(`/race/${i.race_id}`) }, i.race_name || 'Open race') : null);
    setTimeout(() => li.classList.remove('new'), 4000);
    return li;
  }
  function feedRows() {
    let items = state.feedTab === 'social' ? state.social.map((s) => ({ ...s, kind: 'social' })) : state.feedTab === 'all' ? state.feed.concat(state.social.filter((s) => s.tier !== 'B').map((s) => ({ ...s, kind: 'social' }))) : state.feed.filter((i) => i.kind === state.feedTab);
    return items.sort((a, b) => b.ts - a.ts).slice(0, 200);
  }
  function renderFeed() {
    const list = $('#feed-list'); list.innerHTML = '';
    const items = feedRows();
    const frag = document.createDocumentFragment();
    items.forEach((i) => app(frag, feedItem(i)));
    app(list, frag);
    $('#feed-empty').hidden = items.length > 0;
    $('#feed-tabs').querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', b.dataset.feed === state.feedTab ? 'true' : 'false'));
  }
  function prependFeed(items) {
    const seen = new Set(state.feed.map((i) => i.id));
    const fresh = items.filter((i) => !seen.has(i.id));
    if (!fresh.length) return;
    state.feed = fresh.concat(state.feed).slice(0, 400);
    if (state.view !== 'feed') state.unseenFeed += fresh.length;
    renderFeed(); renderBadge();
  }
  function renderBadge() { const b = $('#feed-badge'); b.hidden = !state.unseenFeed; b.textContent = state.unseenFeed > 99 ? '99+' : String(state.unseenFeed); }

  // ---- who called it ----------------------------------------------------
  // /calls: sources ranked by who called the winner first, then every race's calls on a time track.
  const CT = { data: null, at: 0, loading: null, cat: 'all', q: '', sort: 'recent', shown: 30 };
  function loadCalls(force) {
    if (CT.loading) return CT.loading;
    if (!force && CT.data && Date.now() - CT.at < 60000) return Promise.resolve(CT.data);
    CT.loading = fetch('/api/calls', { cache: 'no-store' }).then((r) => r.json()).then((d) => { CT.data = d; CT.at = Date.now(); return d; }).finally(() => { CT.loading = null; });
    return CT.loading;
  }
  setInterval(() => { if (state.view === 'calls' && !state.raceId) loadCalls(true).then(renderCalls).catch(() => {}); }, 60000);
  const srcClass = (k) => (k === 'civicAPI' ? ' civic' : k === 'Pollgebra' ? ' pg' : k === 'DDHQ' ? ' ddhq' : k === 'Polymarket' ? ' pm' : '');
  function fmtDur(ms) {
    const m = Math.round(Math.abs(ms) / 60000);
    if (m < 1) return 'under 1 min';
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h} h ${r} min` : `${h} h`;
  }
  const ctCat = (r) => (r.cat === 'senate' ? 'senate' : r.cat === 'house' || r.cat === 'delegate' ? 'house' : r.cat === 'governor' ? 'governor' : 'other');
  // Calls that count on the track: accurate and wrong ones; headlines that name no winner stay off.
  const ctEvents = (r) => r.calls.filter((c) => c.v !== 'unverified');

  // Polymarket at 55% or more before Election Day began sits pinned at the left edge, off the time scale.
  function raceTimeline(r) {
    const calls = ctEvents(r);
    const timed = calls.filter((c) => !c.pre);
    const okTimed = timed.filter((c) => c.v === 'accurate');
    const first = okTimed.length ? okTimed[0].ts : null;
    const pts = timed.length ? timed.map((c) => c.ts) : calls.map((c) => c.ts);
    const t0 = Math.min(...pts), t1 = Math.max(...pts), span = Math.max(t1 - t0, 60000);
    const pos = (ts) => ((ts - t0) / span) * 100;
    const track = el('div', { class: 'ct-track' + (calls.some((c) => c.pre) ? ' pre' : '') });
    const marks = [];
    calls.forEach((c) => marks.push({ c, x: c.pre ? 0 : pos(c.ts), label: c.src === 'Polymarket' ? c.title + (c.pre ? ' before Election Day' : ` at ${fmtShort(c.ts)}`) : `${c.src} ${c.v === 'wrong' ? 'called the wrong candidate' : 'called it'} at ${fmtShort(c.ts)}` }));
    marks.sort((a, b) => a.x - b.x);
    const lanes = [];
    for (const m of marks) {
      let lane = lanes.findIndex((x) => m.x - x >= 6);
      if (lane < 0) { lane = lanes.length < 3 ? lanes.length : lanes.indexOf(Math.min(...lanes)); }
      lanes[lane] = m.x;
      const node = m.c.src === 'Polymarket'
        ? el('span', { class: 'ct-mark pm' + (m.c.pre ? ' pre' : '') + (m.c.v === 'wrong' ? ' wrong' : ''), title: m.label, 'aria-hidden': 'true' })
        : el('span', { class: 'ct-mark call' + srcClass(m.c.src) + (m.c.v === 'wrong' ? ' wrong' : ''), title: m.label, 'aria-hidden': 'true' }, m.c.src.slice(0, 1));
      node.style.left = `${m.x}%`; node.style.bottom = `${lane * 20 - 8}px`; if (lane) node.style.setProperty('--stem', `${lane * 20 - 8}px`);
      track.append(node);
    }
    track.style.height = `${Math.max(1, lanes.length) * 20}px`;
    const axis = el('div', { class: 'ct-axis' }, el('span', null, fmtShort(t0) + (TZ ? ' ' + TZ : '')), t1 > t0 ? el('span', null, fmtShort(t1)) : null);
    const seq = el('ol', { class: 'ct-seq' });
    let n = 0;
    for (const c of calls) {
      const right = c.v === 'accurate';
      if (right) n++;
      app(seq, el('li', { class: 'ct-step' + (right ? '' : ' wrong') },
        el('span', { class: 'ct-pos' }, right ? String(n) : '×'),
        el('a', { class: 'call-tag' + srcClass(c.src), href: c.url, target: '_blank', rel: 'noopener', title: c.title }, c.src),
        el('span', { class: 'ct-when' }, c.pre ? 'before Election Day' : fmtShort(c.ts)),
        el('span', { class: 'ct-delta' }, !right ? (c.src === 'Polymarket' ? 'favored the loser' : 'wrong candidate') : c.pre ? '55%+ going in' : c.ts === first ? 'first' : c.ts < first ? `${fmtDur(first - c.ts)} early` : `+${fmtDur(c.ts - first)}`)));
    }
    const notes = calls.filter((c) => c.note).map((c) => el('p', { class: 'ct-note' }, el('b', null, c.src + ': '), c.note));
    return el('div', { class: 'ct-line' }, track, axis, seq, ...notes);
  }

  function raceCard(r) {
    const w = r.winner;
    return el('article', { class: 'ct-race' },
      el('header', null,
        el('a', { class: 'ct-name', href: `/race/${r.id}`, onclick: (e) => { e.preventDefault(); go(`/race/${r.id}`); } }, r.name),
        el('span', { class: 'ct-win' }, el('i', { class: 'sw ' + (w.p || 'O'), 'aria-hidden': 'true' }), w.n)),
      raceTimeline(r));
  }

  function boardRow(b, rank) {
    return el('li', { class: 'ct-row' + (b.ranked ? '' : ' unranked') },
      el('span', { class: 'ct-rank' }, rank ? String(rank) : ''),
      el('span', { class: 'ct-src' }, el('span', { class: 'call-tag' + srcClass(b.src) }, b.src)),
      el('span', { class: 'ct-score' }, el('b', null, b.score.toFixed(1)), el('span', { class: 'ct-bar', 'aria-hidden': 'true' }, el('i', { style: `width:${b.score}%` }))),
      el('span', { class: 'ct-stats' },
      el('span', { class: 'ct-stat' }, el('b', null, fmtN(b.firsts)), el('small', null, 'first')),
      el('span', { class: 'ct-stat' }, el('b', null, fmtN(b.races)), el('small', null, 'scored')),
      el('span', { class: 'ct-stat' }, el('b', null, b.medianBehind ? '+' + fmtDur(b.medianBehind) : 'none'), el('small', null, 'behind')),
      el('span', { class: 'ct-stat' + (b.wrong ? ' bad' : '') }, el('b', null, fmtN(b.wrong)), el('small', null, 'wrong'))));
  }

  function renderCalls() {
    const box = $('#calls');
    const d = CT.data;
    if (!d) { box.replaceChildren(el('h1', null, 'Who called it'), el('p', { class: 'empty' }, 'Loading calls…')); loadCalls().then(renderCalls).catch(() => {}); return; }
    const head = el('div', { class: 'ct-head' },
      el('h1', null, 'Who called it'),
      el('p', { class: 'ct-dek' }, `Ranked by who called the winner first. In each of the ${fmtN(d.scoredRaces)} races called by two or more sources, the first source to call the winner gets 100 points and the last gets 0; a call for the wrong candidate scores 0. A source's score is its average.`));
    const ranked = d.board.filter((b) => b.ranked), rest = d.board.filter((b) => !b.ranked && b.races);
    const cols = el('li', { class: 'ct-row ct-cols', 'aria-hidden': 'true' }, el('span', null, '#'), el('span', null, 'Source'), el('span', null, 'Score'), el('span', null, 'First'), el('span', null, 'Scored'), el('span', null, 'Behind first'), el('span', null, 'Wrong'));
    const list = el('ol', { class: 'ct-board' }, cols, ...ranked.map((b, i) => boardRow(b, i + 1)));
    const extra = rest.length ? el('div', { class: 'ct-rest' }, el('h3', null, `Fewer than ${d.minRaces} scored races`), el('ol', { class: 'ct-board' }, ...rest.map((b) => boardRow(b, 0)))) : null;
    const pm = d.pm && d.pm.races ? el('aside', { class: 'ct-pmcard' },
      el('div', { class: 'ct-pmhead' }, el('span', { class: 'ct-dia', 'aria-hidden': 'true' }), el('b', null, 'Polymarket 55%+')),
      el('p', null, el('b', null, `${d.pm.beforeCall} of ${d.pm.races}`), ' priced races had the winner at 55% or better before anyone called it.'),
      el('p', null, el('b', null, fmtN(d.pm.preDay)), ' were there before Election Day began.', ...(d.pm.nightRaces ? [' The other ', el('b', null, fmtN(d.pm.nightRaces)), ' crossed on election night, a median ', el('b', null, fmtDur(d.pm.medianLead)), ' ahead of the first call.'] : []))) : null;

    const tabs = el('div', { class: 'tabs small', role: 'tablist', 'aria-label': 'Race type' },
      ...[['all', 'All'], ['senate', 'Senate'], ['house', 'House'], ['governor', 'Governors'], ['other', 'Other races']].map(([k, label]) =>
        el('button', { role: 'tab', type: 'button', 'aria-selected': CT.cat === k ? 'true' : 'false', onclick: () => { CT.cat = k; CT.shown = 30; renderCalls(); } }, label)));
    const q = el('input', { type: 'search', placeholder: 'State, district, or candidate', value: CT.q, autocomplete: 'off' });
    q.addEventListener('input', () => { CT.q = q.value; CT.shown = 30; drawList(); });
    const sort = el('select', null, ...[['recent', 'Latest first call'], ['sources', 'Most sources'], ['spread', 'Longest from first to last call']].map(([k, label]) => { const o = el('option', { value: k }, label); if (CT.sort === k) o.selected = true; return o; }));
    sort.addEventListener('change', () => { CT.sort = sort.value; drawList(); });
    const controls = el('div', { class: 'ct-controls' }, tabs, el('div', { class: 'controls' }, el('label', { class: 'search' }, el('span', { class: 'vh' }, 'Find a race'), q), el('label', { class: 'sort' }, el('span', { class: 'vh' }, 'Sort'), sort)));
    const listBox = el('div', { class: 'ct-races' });
    function drawList() {
      const needle = CT.q.trim().toLowerCase();
      let rows = d.races.filter((r) => ctEvents(r).length >= 2 && (CT.cat === 'all' || ctCat(r) === CT.cat) && (!needle || (r.name + ' ' + r.winner.n + ' ' + (r.district || '')).toLowerCase().includes(needle)));
      const firstTs = (r) => (ctEvents(r)[0] || { ts: 0 }).ts;
      const spread = (r) => { const t = ctEvents(r).map((c) => c.ts); return Math.max(...t) - Math.min(...t); };
      rows.sort(CT.sort === 'sources' ? (a, b) => ctEvents(b).length - ctEvents(a).length || firstTs(b) - firstTs(a) : CT.sort === 'spread' ? (a, b) => spread(b) - spread(a) : (a, b) => firstTs(b) - firstTs(a));
      listBox.replaceChildren(...rows.slice(0, CT.shown).map(raceCard));
      if (!rows.length) listBox.append(el('p', { class: 'empty' }, 'No races match.'));
      if (rows.length > CT.shown) listBox.append(el('button', { class: 'ct-more', type: 'button', onclick: () => { CT.shown += 30; drawList(); } }, `Show more (${fmtN(rows.length - CT.shown)} left)`));
    }
    drawList();
    box.replaceChildren(head, el('div', { class: 'ct-top' }, el('div', { class: 'ct-boardwrap' }, list, extra), pm), el('h2', { class: 'ct-h2' }, 'Race by race'), controls, listBox);
  }

  // ---- main -------------------------------------------------------------
  function renderMain() {
    const r0 = state.raceId && state.races.get(state.raceId);
    const calls = !state.raceId && state.view === 'calls';
    const meta = window.VDTitles && (r0 ? VDTitles.race(r0) : VDTitles.page(location.pathname));
    document.title = meta ? meta.title : 'VoteDash: Live 2026 Midterm Results';
    $('#calls').hidden = !calls;
    if (state.raceId) { renderDetail(false); }
    else if (calls) { $('#detail').hidden = true; $('#board').hidden = true; detailFor = null; renderCalls(); }
    else { $('#detail').hidden = true; $('#board').hidden = false; detailFor = null; renderBoard(); }
  }
  function renderAll() { renderBop(); renderUpdated(); renderFeed(); renderMain(); }

  // ---- controls ---------------------------------------------------------
  $('#sb-kind').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.sbKind = b.dataset.kind; renderBoard(); syncURL(); });
  $('#sb-city').addEventListener('change', (e) => { state.stateFilter = e.target.value || null; renderBoard(); syncURL(); });
  $('#map-clear').addEventListener('click', () => { state.stateFilter = null; renderBoard(); syncURL(); });
  $('#cat-tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.cat = b.dataset.cat; state.stateFilter = null; state.sbKind = 'all'; if (state.raceId) { state.raceId = null; go(boardURL()); } else { renderBoard(); syncURL(); } });
  $('#feed-tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.feedTab = b.dataset.feed; renderFeed(); if (state.view === 'feed') syncURL(); });
  $('#q').addEventListener('input', (e) => { state.q = e.target.value; renderBoard(); });
  $('#uncalled').addEventListener('change', (e) => { state.uncalled = e.target.checked; renderBoard(); syncURL(true); });
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; renderBoard(); syncURL(true); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadSnapshot().catch(() => {}); });

  // Theme
  const themeBtn = $('#theme-btn');
  function applyTheme() {
    const dark = document.documentElement.dataset.theme === 'dark';
    themeBtn.querySelector('span').textContent = dark ? 'Light' : 'Dark';
    themeBtn.setAttribute('aria-pressed', dark ? 'true' : 'false');
    document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#0B0D10' : '#15181D');
  }
  themeBtn.addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    document.documentElement.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('vd-theme', dark ? 'light' : 'dark'); } catch (e) { /* ignore */ }
    applyTheme();
  });
  applyTheme();
  route();
  loadSnapshot().then(connect).catch(() => { setStale(true); setTimeout(() => loadSnapshot().then(connect), 5000); });
})();
