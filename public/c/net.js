// Money and votes network for one member (d3-force).
(function () {
  'use strict';
  var el = document.getElementById('net'); if (!el || !window.d3) return;
  var css = getComputedStyle(document.documentElement);
  var col = { D: css.getPropertyValue('--dem'), R: css.getPropertyValue('--rep'), I: css.getPropertyValue('--ind'), L: css.getPropertyValue('--ind'), f: css.getPropertyValue('--docket') };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  fetch('/api/graph/' + el.dataset.id).then(function (r) { return r.json(); }).then(function (g) {
    var W = el.clientWidth, H = el.clientHeight;
    var svg = d3.select(el).append('svg').attr('viewBox', [0, 0, W, H]);
    var root = svg.append('g');
    svg.call(d3.zoom().scaleExtent([0.4, 3]).on('zoom', function (e) { root.attr('transform', e.transform); }));
    var maxMoney = d3.max(g.links.filter(function (l) { return l.k === 'money'; }), function (l) { return l.w; }) || 1;
    var links = g.links.map(function (l) { return { source: l.s, target: l.t, w: l.w, k: l.k }; });
    var nodes = g.nodes.map(function (n) { return Object.assign({}, n); });
    var center = nodes.find(function (n) { return n.center; }); if (center) { center.fx = W / 2; center.fy = H / 2; }
    var sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(function (d) { return d.id; }).distance(function (l) { return l.k === 'votes' ? 150 : 120; }).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-760))
      .force('collide', d3.forceCollide(48))
      .force('x', d3.forceX(W / 2).strength(0.04)).force('y', d3.forceY(H / 2).strength(0.06));
    var lk = root.append('g').selectAll('line').data(links).join('line')
      .attr('class', function (l) { return 'lk ' + l.k; })
      .attr('stroke-width', function (l) { return l.k === 'money' ? 1 + 7 * Math.sqrt(l.w / maxMoney) : 1 + 5 * Math.max(0, (l.w - 0.6) / 0.4); });
    var nd = root.append('g').selectAll('g').data(nodes).join('g').attr('class', 'nd').attr('tabindex', 0).attr('role', 'link')
      .attr('aria-label', function (d) { return d.name + ', ' + d.label; })
      .on('click', function (e, d) { location.href = d.url; })
      .on('keydown', function (e, d) { if (e.key === 'Enter') location.href = d.url; })
      .call(d3.drag().on('start', function (e, d) { if (!e.active) sim.alphaTarget(0.2).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', function (e, d) { d.fx = e.x; d.fy = e.y; })
        .on('end', function (e, d) { if (!e.active) sim.alphaTarget(0); if (!d.center) { d.fx = null; d.fy = null; } }));
    nd.each(function (d) {
      var g2 = d3.select(this), r = d.center ? 30 : d.t === 'p' ? 20 : 9;
      if (d.t === 'p') {
        var id = 'clip-' + d.id;
        g2.append('clipPath').attr('id', id).append('circle').attr('r', r);
        g2.append('circle').attr('r', r + 3).attr('fill', col[d.party] || col.I);
        if (d.img) g2.append('image').attr('href', d.img).attr('x', -r).attr('y', -r * 1.15).attr('width', r * 2).attr('height', r * 2.45).attr('clip-path', 'url(#' + id + ')').attr('preserveAspectRatio', 'xMidYMin slice');
      } else g2.append('rect').attr('x', -r).attr('y', -r).attr('width', r * 2).attr('height', r * 2).attr('rx', 2).attr('fill', col.f);
      g2.append('text').attr('y', r + 15).attr('text-anchor', 'middle').text(d.name.length > 30 ? d.name.slice(0, 28) + '…' : d.name);
      g2.append('title').text(d.name + ', ' + d.label);
    });
    function tick() {
      lk.attr('x1', function (d) { return d.source.x; }).attr('y1', function (d) { return d.source.y; }).attr('x2', function (d) { return d.target.x; }).attr('y2', function (d) { return d.target.y; });
      nd.attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; });
    }
    sim.on('tick', tick);
    if (reduce) { sim.stop(); for (var i = 0; i < 300; i++) sim.tick(); tick(); }
    document.querySelectorAll('[data-net]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.dataset.net;
        document.querySelectorAll('[data-net]').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        lk.style('display', function (l) { return k === 'all' || l.k === k ? null : 'none'; });
        var keep = new Set([center && center.id]);
        links.forEach(function (l) { if (k === 'all' || l.k === k) { keep.add(l.source.id); keep.add(l.target.id); } });
        nd.style('display', function (d) { return keep.has(d.id) ? null : 'none'; });
        // ?show=money|votes is the shareable link for this view
        var u = new URL(location.href); if (k === 'all') u.searchParams.delete('show'); else u.searchParams.set('show', k); history.replaceState(null, '', u);
      });
    });
    var show = new URLSearchParams(location.search).get('show'), sb = show && document.querySelector('[data-net="' + show + '"]');
    if (sb) sb.click();
  });
})();
