// VoteDash Congress: search suggestions, seat-chart color modes, small form helpers.
(function () {
  'use strict';
  // search suggestions
  document.querySelectorAll('input[data-suggest]').forEach(function (inp) {
    var form = inp.form; if (!form) return;
    var list = document.createElement('ul'); list.className = 'sugg'; list.hidden = true; list.setAttribute('role', 'listbox');
    list.id = inp.id + '-sugg'; inp.setAttribute('aria-controls', list.id); inp.setAttribute('aria-autocomplete', 'list');
    form.appendChild(list);
    var t, idx = -1, items = [];
    function close() { list.hidden = true; idx = -1; inp.setAttribute('aria-expanded', 'false'); }
    function paint() { [].forEach.call(list.querySelectorAll('a'), function (a, i) { a.setAttribute('aria-selected', i === idx ? 'true' : 'false'); }); }
    inp.addEventListener('input', function () {
      clearTimeout(t); var q = inp.value.trim(); if (q.length < 2) return close();
      t = setTimeout(function () {
        fetch('/api/suggest?q=' + encodeURIComponent(q)).then(function (r) { return r.json(); }).then(function (res) {
          items = res; idx = -1;
          if (!res.length) return close();
          list.innerHTML = res.map(function (r) {
            return '<li role="option"><a href="' + r.u + '">' + (r.img ? '<img src="' + r.img + '" alt="">' : '') + '<span><b></b><small></small></span></a></li>';
          }).join('');
          [].forEach.call(list.querySelectorAll('li'), function (li, i) { li.querySelector('b').textContent = res[i].l; li.querySelector('small').textContent = res[i].t + ', ' + res[i].s; });
          list.hidden = false; inp.setAttribute('aria-expanded', 'true');
        }).catch(close);
      }, 120);
    });
    inp.addEventListener('keydown', function (e) {
      if (list.hidden) return;
      if (e.key === 'ArrowDown') { idx = Math.min(idx + 1, items.length - 1); paint(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { idx = Math.max(idx - 1, -1); paint(); e.preventDefault(); }
      else if (e.key === 'Enter' && idx >= 0) { location.href = items[idx].u; e.preventDefault(); }
      else if (e.key === 'Escape') close();
    });
    document.addEventListener('click', function (e) { if (!form.contains(e.target)) close(); });
  });

  // seat chart: party or latest vote
  var ch = document.querySelector('[data-chamber]');
  if (ch) {
    var data = JSON.parse(document.getElementById('vote-data').textContent);
    ch.querySelectorAll('[data-mode]').forEach(function (b) {
      b.addEventListener('click', function () {
        var mode = b.dataset.mode;
        ch.querySelectorAll('[data-mode]').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        ch.querySelectorAll('[data-key]').forEach(function (k) { k.hidden = k.dataset.key !== mode; });
        ch.querySelectorAll('[data-vote-cap]').forEach(function (k) { k.hidden = mode !== 'vote'; });
        ch.querySelectorAll('svg.seats').forEach(function (svg) {
          var c = svg.classList.contains('sH') ? 'H' : 'S';
          svg.querySelectorAll('circle').forEach(function (cir) {
            if (!cir.dataset.party) cir.dataset.party = cir.getAttribute('class');
            cir.setAttribute('class', mode === 'vote' ? 'v' + (data[c][cir.dataset.id] || '0') : cir.dataset.party);
          });
        });
      });
    });
  }

  // state picker submits on change
  document.querySelectorAll('select[data-autosubmit]').forEach(function (s) { s.addEventListener('change', function () { s.form.submit(); }); });
})();
