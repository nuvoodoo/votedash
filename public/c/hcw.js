// How Congress Works: section search and the filter on index pages.
(function () {
  'use strict';
  var src = document.getElementById('hw-index'); if (!src) return;
  var IDX = JSON.parse(src.textContent).map(function (e) { return { t: e[0], k: e[1], u: e[2], s: e[3], n: (e[0] + ' ' + e[3]).toLowerCase(), h: e[0].toLowerCase() }; });
  function find(q) {
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean); if (!terms.length) return [];
    return IDX.filter(function (e) { return terms.every(function (t) { return e.n.indexOf(t) >= 0; }); })
      .sort(function (a, b) { return (b.h.indexOf(terms[0]) === 0) - (a.h.indexOf(terms[0]) === 0) || (b.h.indexOf(terms[0]) >= 0) - (a.h.indexOf(terms[0]) >= 0); }).slice(0, 8);
  }
  [].forEach.call(document.querySelectorAll('.hw-search'), function (form) {
    var inp = form.querySelector('input'), list = form.querySelector('.hw-res'), items = [], idx = -1;
    function close() { list.hidden = true; idx = -1; }
    function paint() { [].forEach.call(list.querySelectorAll('a'), function (a, i) { a.setAttribute('aria-selected', i === idx ? 'true' : 'false'); }); }
    inp.addEventListener('input', function () {
      items = find(inp.value.trim()); list.textContent = ''; idx = -1;
      if (!items.length) return close();
      items.forEach(function (e) {
        var li = document.createElement('li'), a = document.createElement('a'), sp = document.createElement('span'), b = document.createElement('b'), sm = document.createElement('small');
        a.href = e.u; b.textContent = e.t; sm.textContent = e.k + (e.s ? ': ' + e.s : ''); sp.appendChild(b); sp.appendChild(sm); a.appendChild(sp); li.appendChild(a); list.appendChild(li);
      });
      list.hidden = false;
    });
    inp.addEventListener('keydown', function (e) {
      if (list.hidden) return;
      if (e.key === 'ArrowDown') { idx = Math.min(idx + 1, items.length - 1); paint(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { idx = Math.max(idx - 1, -1); paint(); e.preventDefault(); }
      else if (e.key === 'Escape') close();
    });
    // Enter opens the highlighted or first match; with no match the form falls through to the site search
    form.addEventListener('submit', function (e) { var hit = items[idx >= 0 ? idx : 0]; if (hit) { e.preventDefault(); location.href = hit.u; } });
    document.addEventListener('click', function (e) { if (!form.contains(e.target)) close(); });
  });
  var f = document.getElementById('hwf');
  if (f) f.addEventListener('input', function () {
    var q = f.value.trim().toLowerCase(), any = false;
    [].forEach.call(document.querySelectorAll('.hw-tile[data-k]'), function (a) { var on = !q || a.getAttribute('data-k').indexOf(q) >= 0; a.hidden = !on; if (on) any = true; });
    [].forEach.call(document.querySelectorAll('.hw-group'), function (g) { g.hidden = !g.querySelector('.hw-tile:not([hidden])'); });
    var none = document.querySelector('.hw-none'); if (none) none.hidden = any;
  });
})();
