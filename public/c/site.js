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
          svg.querySelectorAll('circle[data-id]').forEach(function (cir) {
            if (!cir.dataset.party) cir.dataset.party = (cir.getAttribute('class') || '').replace(' tip-on', '');
            cir.setAttribute('class', mode === 'vote' ? 'v' + (data[c][cir.dataset.id] || '0') : mode === 'caucus' ? 'c' + (cir.dataset.c || 'none' + cir.dataset.p) : cir.dataset.party);
          });
        });
      });
    });
  }

  // seat tooltips: hover with a mouse, tap on touch (a second tap or the link opens the file)
  var VOTE = { vY: 'Voted yea', vN: 'Voted nay', vP: 'Voted present', v0: 'Did not vote' };
  var tip = null, tipFor = null, lastPointer = 'mouse';
  function hideTip() { if (tip) tip.remove(); tip = null; if (tipFor) tipFor.classList.remove('tip-on'); tipFor = null; }
  function showTip(c, x, y, touch) {
    hideTip(); tipFor = c; c.classList.add('tip-on');
    tip = document.createElement('div'); tip.className = 'seat-tip' + (touch ? '' : ' mouse'); tip.setAttribute('role', 'tooltip');
    var cls = c.getAttribute('class') || '', vote = (cls.match(/\bv[YNP0]\b/) || [])[0];
    var html = (c.dataset.i ? '<img src="/portraits/s/' + c.dataset.id + '.webp" alt="">' : '<span></span>') + '<div><b></b><small class="ts"></small>' + (c.dataset.cn ? '<small class="tc"></small>' : '') + (vote ? '<small class="tv"></small>' : '') + '</div>';
    var a = c.closest('a'); if (a) html += '<a href="' + a.getAttribute('href') + '">Open their file</a>';
    tip.innerHTML = html;
    tip.querySelector('b').textContent = c.dataset.n || '';
    tip.querySelector('.ts').textContent = c.dataset.s || '';
    if (c.dataset.cn) tip.querySelector('.tc').textContent = c.dataset.cn;
    if (vote) tip.querySelector('.tv').textContent = VOTE[vote];
    document.body.appendChild(tip);
    var w = tip.offsetWidth, h = tip.offsetHeight, sx = window.scrollX, sy = window.scrollY;
    var left = Math.min(Math.max(8, x + 14), document.documentElement.clientWidth - w - 8), top = y - h - 12; if (top < 8) top = y + 18;
    tip.style.left = (left + sx) + 'px'; tip.style.top = (top + sy) + 'px';
  }
  document.addEventListener('pointerdown', function (e) { lastPointer = e.pointerType; }, true);
  document.querySelectorAll('svg.seats').forEach(function (svg) {
    svg.addEventListener('pointermove', function (e) { if (e.pointerType !== 'mouse') return; var c = e.target.closest('circle[data-id]'); if (!c) return hideTip(); if (c !== tipFor) showTip(c, e.clientX, e.clientY, false); });
    svg.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hideTip(); });
    svg.addEventListener('click', function (e) {
      var c = e.target.closest('circle[data-id]'); if (!c || lastPointer === 'mouse') return;
      if (tipFor !== c) { e.preventDefault(); var r = c.getBoundingClientRect(); showTip(c, r.left + r.width / 2, r.top, true); }
    });
  });
  document.addEventListener('click', function (e) { if (tip && !e.target.closest('.seat-tip') && !e.target.closest('svg.seats')) hideTip(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideTip(); });
  window.addEventListener('scroll', function () { if (tip && tip.classList.contains('mouse')) hideTip(); }, { passive: true });

  // state picker submits on change
  document.querySelectorAll('select[data-autosubmit]').forEach(function (s) { s.addEventListener('change', function () { s.form.submit(); }); });
})();
