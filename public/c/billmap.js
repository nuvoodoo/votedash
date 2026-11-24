// Bill map: hover and click a square, find a bill, highlight an issue.
(function () {
  'use strict';
  var svg = document.querySelector('svg.bmap'); if (!svg) return;
  var wrap = svg.parentNode, tipEl = wrap.querySelector('.bm-tip'), cur = svg.querySelector('.bm-cur'), hl = svg.querySelector('.bm-hl');
  var status = document.querySelector('.bm-status'), inp = document.getElementById('bmq'), res = document.querySelector('.bm-res'), sel = document.getElementById('bma');
  var NS = 'http://www.w3.org/2000/svg', M = null, tips = {}, over = null, ring = null;
  var calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  fetch('/api/billmap.json?v=' + encodeURIComponent(wrap.getAttribute('data-v') || '')).then(function (r) { return r.json(); }).then(function (m) {
    M = m; M.at = {};
    m.yards.forEach(function (y) { y.rows = Math.ceil(y.k.length / y.c); y.k.forEach(function (k, i) { M.at[k] = [y, i]; }); });
    var k = new URLSearchParams(location.search).get('bill'); if (k && M.at[k]) locate(k, false, true);
  });

  function point(e) { var p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
  function hit(e) {
    if (!M) return null; var p = point(e), s = M.p;
    for (var j = 0; j < M.yards.length; j++) {
      var y = M.yards[j];
      if (p.x < y.x - 0.5 || p.y < y.y - 0.5 || p.x >= y.x + y.c * s || p.y >= y.y + y.rows * s) continue;
      var i = Math.floor((p.y - y.y + 0.5) / s) * y.c + Math.floor((p.x - y.x + 0.5) / s);
      return i >= 0 && i < y.k.length ? { y: y, i: i, k: y.k[i] } : null;
    }
    return null;
  }
  function cell(y, i) { return [y.x + (i % y.c) * M.p, y.y + Math.floor(i / y.c) * M.p]; }
  function info(k) { return tips[k] || (tips[k] = fetch('/api/billmap/tip?k=' + k).then(function (r) { return r.json(); })); }
  function day(iso) { return iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : ''; }

  svg.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    var h = hit(e);
    if (!h) { over = null; cur.setAttribute('hidden', ''); tipEl.hidden = true; svg.style.cursor = ''; return; }
    var c = cell(h.y, h.i), box = wrap.getBoundingClientRect();
    cur.setAttribute('x', c[0] - 2); cur.setAttribute('y', c[1] - 2); cur.removeAttribute('hidden'); svg.style.cursor = 'pointer';
    var x = e.clientX - box.left + wrap.scrollLeft, yy = e.clientY - box.top;
    tipEl.style.left = (x + 350 > wrap.scrollLeft + box.width ? x - 334 : x + 14) + 'px'; tipEl.style.top = (yy + 16) + 'px';
    if (over === h.k) return; over = h.k;
    tipEl.hidden = true;
    info(h.k).then(function (t) {
      if (over !== t.k) return;
      tipEl.textContent = '';
      [['b', t.l], ['span', t.t], ['small', t.s], ['small', t.at + (t.d ? ', latest action ' + day(t.d) : '')]].forEach(function (r) { if (!r[1]) return; var el = document.createElement(r[0]); el.textContent = r[1]; tipEl.appendChild(el); });
      tipEl.hidden = false;
    });
  });
  svg.addEventListener('pointerleave', function () { over = null; cur.setAttribute('hidden', ''); tipEl.hidden = true; });
  svg.addEventListener('click', function (e) {
    var h = hit(e); if (!h) return;
    e.preventDefault();
    if (e.pointerType === 'mouse' || e.pointerType === undefined) location.href = '/bill/' + h.k; else locate(h.k, true);
  });

  // put a ring on one bill and say where it is
  function locate(k, stay, jump) {
    var at = M && M.at[k]; if (!at) return;
    var c = cell(at[0], at[1]);
    if (!ring) { ring = document.createElementNS(NS, 'circle'); ring.setAttribute('class', 'bm-ring'); ring.setAttribute('r', 13); svg.appendChild(ring); }
    ring.setAttribute('cx', c[0] + 2); ring.setAttribute('cy', c[1] + 2);
    if (!stay) {
      var r = svg.getBoundingClientRect(), sc = r.width / svg.viewBox.baseVal.width;
      window.scrollTo({ top: window.scrollY + r.top + c[1] * sc - window.innerHeight / 2, behavior: calm || jump ? 'auto' : 'smooth' });
      wrap.scrollLeft = Math.max(0, c[0] * sc - wrap.clientWidth / 2);
    }
    info(k).then(function (t) {
      status.textContent = '';
      var a = document.createElement('a'); a.href = '/bill/' + t.k; a.textContent = t.l + ': ' + t.t;
      status.appendChild(a); status.appendChild(document.createTextNode(' On the map: ' + t.at + (t.law ? ', ' + t.law : '') + (t.d ? '. Latest action ' + day(t.d) + '.' : '.')));
      status.hidden = false;
    });
  }

  // find a bill
  if (inp && res) {
    var timer, found = [];
    var close = function () { res.hidden = true; };
    var pick = function (t) { close(); inp.value = t.l; locate(t.k); };
    inp.form.addEventListener('submit', function (e) { if (found.length) { e.preventDefault(); pick(found[0]); } });
    inp.addEventListener('input', function () {
      clearTimeout(timer); var q = inp.value.trim(); if (q.length < 2) { found = []; return close(); }
      timer = setTimeout(function () {
        fetch('/api/billmap/find?q=' + encodeURIComponent(q)).then(function (r) { return r.json(); }).then(function (list) {
          found = list; res.textContent = ''; if (!list.length) return close();
          list.forEach(function (t) {
            tips[t.k] = Promise.resolve(t);
            var li = document.createElement('li'), a = document.createElement('a'), sp = document.createElement('span'), b = document.createElement('b'), sm = document.createElement('small');
            a.href = '/bill/' + t.k; b.textContent = t.t; sm.textContent = t.l + ', ' + t.at; sp.appendChild(b); sp.appendChild(sm); a.appendChild(sp); li.appendChild(a); res.appendChild(li);
            a.addEventListener('click', function (e) { e.preventDefault(); pick(t); });
          });
          res.hidden = false;
        }).catch(close);
      }, 140);
    });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    document.addEventListener('click', function (e) { if (!inp.form.contains(e.target)) close(); });
  }

  // highlight one policy area
  if (sel) sel.addEventListener('change', function () {
    hl.textContent = ''; svg.classList.toggle('dim', !!sel.value);
    if (!sel.value || !M) { status.hidden = true; return; }
    var code = String.fromCharCode(48 + +sel.value), d = ['', '', ''], total = 0, law = 0;
    M.yards.forEach(function (y) {
      for (var i = 0; i < y.k.length; i++) {
        if (y.a[i] !== code) continue;
        var c = cell(y, i), pt = i < y.p[0] ? 0 : i < y.p[0] + y.p[1] ? 1 : 2;
        d[pt] += 'M' + c[0] + ',' + c[1] + 'h4v4h-4z'; total++; if (y.id === 'law') law++;
      }
    });
    ['D', 'R', 'I'].forEach(function (pt, i) { if (!d[i]) return; var p = document.createElementNS(NS, 'path'); p.setAttribute('class', 'bm-h ' + pt); p.setAttribute('d', d[i]); hl.appendChild(p); });
    status.textContent = sel.options[sel.selectedIndex].text + ': ' + total.toLocaleString('en-US') + (total === 1 ? ' bill' : ' bills') + ', ' + law.toLocaleString('en-US') + ' became law.';
    status.hidden = false;
  });
})();
