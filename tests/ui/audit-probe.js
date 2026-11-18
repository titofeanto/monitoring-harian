// Probe pemeriksa tata letak: dimuat oleh /__auditframe di jendela induk, mengukur dokumen iframe lalu menulis JSON ke <script id="audit">.
(function () {
  var f = document.querySelector('iframe');
  function run() {
    var w = f.contentWindow, d = f.contentDocument;
    var st = d.createElement('style'); st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}'; d.head.appendChild(st); // ukur posisi akhir, bukan di tengah animasi
    var out = { w: w.innerWidth, h: w.innerHeight };
    var cv = document.createElement('canvas'); cv.width = cv.height = 1; var cx = cv.getContext('2d', { willReadFrequently: true });
    function rgba(c) { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); var p = cx.getImageData(0, 0, 1, 1).data; return [p[0], p[1], p[2], p[3] / 255]; }
    function lum(c) { var a = [c[0], c[1], c[2]].map(function (v) { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * a[0] + .7152 * a[1] + .0722 * a[2]; }
    function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
    function over(top, bot) { var a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1]; }
    function sel(el) {
      var s = el.tagName.toLowerCase(); if (el.id) return s + '#' + el.id;
      var c = (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
      if (c) s += '.' + c; var p = el.parentElement;
      if (p && p !== d.body) { var pc = (typeof p.className === 'string' ? p.className : '').trim().split(/\s+/)[0]; s = (p.id ? '#' + p.id : p.tagName.toLowerCase() + (pc ? '.' + pc : '')) + '>' + s; }
      return s;
    }
    function vis(el) { var cs = w.getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') return false; var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
    function inertOrHidden(el) { for (var e = el; e && e !== d.documentElement; e = e.parentElement) { if (e.hidden || e.inert) return true; var cs = w.getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return true; } return false; }
    function clipped(el, W) {
      for (var p = el.parentElement; p && p !== d.body && p !== d.documentElement; p = p.parentElement) {
        var cs = w.getComputedStyle(p); if (cs.overflowX !== 'visible') { var r = p.getBoundingClientRect(); if (r.right <= W + 1 && r.left >= -1) return true; }
      } return false;
    }
    var W = w.innerWidth, all = Array.prototype.slice.call(d.body.querySelectorAll('*'));
    out.hscroll = d.documentElement.scrollWidth > W; out.scrollWidth = d.documentElement.scrollWidth;
    out.overflow = []; out.ellipsis = []; out.touch = []; out.small = []; out.contrast = [];
    var seen = {};
    function push(arr, el, extra) { var k = sel(el); if (seen[arr === out.overflow ? 'o' + k : arr === out.ellipsis ? 'e' + k : arr === out.touch ? 't' + k : arr === out.small ? 's' + k : 'c' + k]) return; seen[arr === out.overflow ? 'o' + k : arr === out.ellipsis ? 'e' + k : arr === out.touch ? 't' + k : arr === out.small ? 's' + k : 'c' + k] = 1; var o = { sel: k }; for (var i in extra) o[i] = extra[i]; arr.push(o); }
    all.forEach(function (el) {
      if (/^(SCRIPT|STYLE|PATH|LINE|CIRCLE|RECT|G|DEFS|SVG|POLYLINE|TITLE|BR|OPTION)$/i.test(el.tagName)) return;
      if (inertOrHidden(el)) return;
      if (!vis(el)) return;
      var r = el.getBoundingClientRect(), cs = w.getComputedStyle(el);
      if (r.right > W + 1 && !clipped(el, W) && cs.position !== 'fixed') push(out.overflow, el, { right: Math.round(r.right), w: Math.round(r.width) });
      if ((cs.overflow === 'hidden' || cs.overflowX === 'hidden') && cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) push(out.ellipsis, el, { sw: el.scrollWidth, cw: el.clientWidth, t: (el.textContent || '').trim().slice(0, 30) });
      if (W <= 1024 && /^(BUTTON|A|SELECT|INPUT|SUMMARY)$/.test(el.tagName) || (W <= 1024 && el.getAttribute('role') === 'tab')) {
        if (!(el.tagName === 'INPUT' && /hidden|checkbox|radio/.test(el.type)) && !el.disabled && (r.width < 44 || r.height < 44)) push(out.touch, el, { w: Math.round(r.width), h: Math.round(r.height), t: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24) });
      }
      var own = ''; for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3) own += n.nodeValue; own = own.trim();
      if (own) {
        var fs = parseFloat(cs.fontSize); if (fs < 12) push(out.small, el, { fs: fs, t: own.slice(0, 24) });
        if (!el.disabled) {
          var bg = [255, 255, 255, 1], chain = [], op = 1, minC = 99;
          for (var e = el; e && e.nodeType === 1; e = e.parentElement) { var c = w.getComputedStyle(e); op *= parseFloat(c.opacity); chain.push(c); }
          var base = null, grads = null;
          for (var i = 0; i < chain.length; i++) {
            var b = rgba(chain[i].backgroundColor);
            if (chain[i].backgroundImage && chain[i].backgroundImage !== 'none' && chain[i].backgroundImage.indexOf('gradient') >= 0) { var gs = (chain[i].backgroundImage.match(/rgba?\([^)]*\)/g) || []).map(rgba).filter(function (g) { return g[3] >= 1; }); if (gs.length) { grads = gs; break; } } /* gradien hanya dengan titik transparan (bayangan tepi tabel) bukan latar teks: pakai warna latar */
            if (b[3] > 0) { base = base ? over(base, b) : b; if (b[3] >= 1) break; }
          }
          var tc = rgba(cs.color); tc[3] *= op;
          var bgs = grads && grads.length ? grads.map(function (g) { return over(g, base || [255, 255, 255, 1]); }) : [base ? over(base, [255, 255, 255, 1]) : [255, 255, 255, 1]];
          bgs.forEach(function (b) { minC = Math.min(minC, ratio(over(tc, b), b)); });
          var big = fs >= 24 || (fs >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
          if (minC < (big ? 3 : 4.5) && tc[3] > .05) push(out.contrast, el, { r: Math.round(minC * 100) / 100, t: own.slice(0, 24) });
        }
      }
    });
    var side = d.querySelector('.side'), mb = d.querySelector('.menu-btn');
    if (side) { var sr = side.getBoundingClientRect(), scs = w.getComputedStyle(side), shown = scs.visibility !== 'hidden' && sr.right > 0 && sr.width > 0;
      out.side = { shown: shown, menuBtn: !!(mb && vis(mb)), ok: W >= 900 ? shown && !(mb && vis(mb)) : !shown && !!(mb && vis(mb)) }; }
    var top = d.querySelector('.top'); if (top) out.headFrac = Math.round(top.getBoundingClientRect().height / w.innerHeight * 100) / 100;
    var main = d.querySelector('main'); if (main) { var mr = main.getBoundingClientRect(); out.main = { w: Math.round(mr.width), l: Math.round(mr.left) }; }
    function ncols(el) { return el && vis(el) ? w.getComputedStyle(el).gridTemplateColumns.split(' ').length : 0; }
    var rkl = d.querySelector('.rk-list:not(.rkn-list)'), csl = d.querySelector('#csList');
    out.grid = { rk: ncols(rkl), cs: csl && csl.children.length ? ncols(csl) : 0, tiles: [] };
    d.querySelectorAll('.kpis,.tiles').forEach(function (g) { if (vis(g) && !inertOrHidden(g)) { var n = ncols(g); out.grid.tiles.push({ cols: n, kids: g.children.length, empty: n > g.children.length && g.children.length > 0 }); } });
    out.errs = (w.__errs || []).slice(0, 5);
    var s = document.createElement('script'); s.type = 'application/json'; s.id = 'audit'; s.textContent = JSON.stringify(out).replace(/</g, '\\u003c'); document.body.appendChild(s);
  }
  setTimeout(function () { try { run(); } catch (e) { var s = document.createElement('script'); s.type = 'application/json'; s.id = 'audit'; s.textContent = JSON.stringify({ fail: String(e && e.stack || e) }); document.body.appendChild(s); } }, 5000);
})();
