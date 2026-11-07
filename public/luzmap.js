/* LuzMap — renderer compartido (proyector y vista previa del celular).
   Sin dependencias. JS compatible con navegadores Android viejos (sin ?. ni ??). */
(function (global) {
  'use strict';

  var EFFECTS = [
    ['solid', 'Color fijo'], ['pulse', 'Respiración'], ['strobe', 'Estroboscópico'],
    ['sweep', 'Barrido de luz'], ['fill', 'Llenado'], ['gradient', 'Degradé animado'],
    ['rainbow', 'Arcoíris'], ['outline', 'Borde'], ['trace', 'Trazo (dibuja el contorno)'],
    ['image', 'Imagen'], ['video', 'Video'], ['black', 'Negro (máscara)']
  ];

  var CSS = [
    '.lz-root{position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;background:#000}',
    '.lz-zone{position:absolute;left:0;top:0;transform-origin:0 0;overflow:hidden;will-change:transform}',
    '.lz-in{position:absolute;overflow:hidden}',
    '.lz-fx{position:absolute;left:0;top:0;right:0;bottom:0}',
    '.lz-fx img,.lz-fx video{width:100%;height:100%;display:block}',
    '.fx-solid,.fx-pulse,.fx-strobe,.fx-rainbow{background:var(--c1)}',
    '.fx-black{background:#000}',
    '.fx-pulse{animation:lzPulse var(--dur) ease-in-out var(--delay) infinite}',
    '.fx-strobe{animation:lzStrobe var(--dur) steps(1,end) var(--delay) infinite}',
    '.fx-rainbow{animation:lzHue var(--dur) linear var(--delay) infinite}',
    '.fx-gradient{background-size:300% 300%;animation:lzGrad var(--dur) linear var(--delay) infinite}',
    '.lz-band{position:absolute;animation-duration:var(--dur);animation-delay:var(--delay);animation-iteration-count:infinite;animation-timing-function:ease-in-out}',
    '.lz-band.h{top:0;bottom:0;width:45%;left:0;background:linear-gradient(90deg,transparent,var(--c1),transparent);animation-name:lzSweepX}',
    '.lz-band.v{left:0;right:0;height:45%;top:0;background:linear-gradient(180deg,transparent,var(--c1),transparent);animation-name:lzSweepY}',
    '.lz-fillbar{position:absolute;left:0;top:0;right:0;bottom:0;background:var(--c1);animation-duration:var(--dur);animation-delay:var(--delay);animation-iteration-count:infinite;animation-timing-function:ease-in-out}',
    '.lz-fillbar.h{transform-origin:0 50%;animation-name:lzFillX}',
    '.lz-fillbar.v{transform-origin:50% 100%;animation-name:lzFillY}',
    '.rev{animation-direction:reverse!important}',
    '.lz-svg{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:visible}',
    '.lz-trace{animation:lzTrace var(--dur) linear var(--delay) infinite}',
    '@keyframes lzPulse{0%,100%{opacity:.04}50%{opacity:1}}',
    '@keyframes lzStrobe{0%{opacity:1}50%{opacity:0}}',
    '@keyframes lzHue{from{filter:hue-rotate(0deg)}to{filter:hue-rotate(360deg)}}',
    '@keyframes lzGrad{0%{background-position:0% 0%}100%{background-position:100% 100%}}',
    '@keyframes lzSweepX{from{transform:translateX(-110%)}to{transform:translateX(230%)}}',
    '@keyframes lzSweepY{from{transform:translateY(230%)}to{transform:translateY(-110%)}}',
    '@keyframes lzFillX{0%{transform:scaleX(0);opacity:1}65%{transform:scaleX(1);opacity:1}100%{transform:scaleX(1);opacity:0}}',
    '@keyframes lzFillY{0%{transform:scaleY(0);opacity:1}65%{transform:scaleY(1);opacity:1}100%{transform:scaleY(1);opacity:0}}',
    '@keyframes lzTrace{0%{stroke-dashoffset:100}50%{stroke-dashoffset:0}100%{stroke-dashoffset:-100}}'
  ].join('\n');

  function injectCSS() {
    if (document.getElementById('lz-css')) return;
    var s = document.createElement('style'); s.id = 'lz-css'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ---- Homografía: rectángulo (0,0,w,h) -> cuadrilátero arbitrario ----
  function adj(m) {
    return [m[4]*m[8]-m[5]*m[7], m[2]*m[7]-m[1]*m[8], m[1]*m[5]-m[2]*m[4],
            m[5]*m[6]-m[3]*m[8], m[0]*m[8]-m[2]*m[6], m[2]*m[3]-m[0]*m[5],
            m[3]*m[7]-m[4]*m[6], m[1]*m[6]-m[0]*m[7], m[0]*m[4]-m[1]*m[3]];
  }
  function mulMM(a, b) {
    var c = [], i, j, k, s;
    for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) {
      s = 0; for (k = 0; k < 3; k++) s += a[3*i+k] * b[3*k+j]; c[3*i+j] = s;
    }
    return c;
  }
  function mulMV(m, v) {
    return [m[0]*v[0]+m[1]*v[1]+m[2]*v[2], m[3]*v[0]+m[4]*v[1]+m[5]*v[2], m[6]*v[0]+m[7]*v[1]+m[8]*v[2]];
  }
  function basis(p) { // p: 4 puntos [[x,y]...]
    var m = [p[0][0], p[1][0], p[2][0], p[0][1], p[1][1], p[2][1], 1, 1, 1];
    var v = mulMV(adj(m), [p[3][0], p[3][1], 1]);
    return mulMM(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
  }
  function matrix3d(w, h, q) { // q en orden TL, TR, BR, BL (px)
    var src = basis([[0, 0], [w, 0], [0, h], [w, h]]);
    var dst = basis([q[0], q[1], q[3], q[2]]);
    var t = mulMM(dst, adj(src));
    for (var i = 0; i < 9; i++) t[i] = t[i] / t[8];
    var m = [t[0], t[3], 0, t[6], t[1], t[4], 0, t[7], 0, 0, 1, 0, t[2], t[5], 0, t[8]];
    return 'matrix3d(' + m.map(function (x) { return +x.toFixed(10); }).join(',') + ')';
  }
  function dist(a, b) { var dx = a[0]-b[0], dy = a[1]-b[1]; return Math.sqrt(dx*dx + dy*dy); }

  function contentKey(z) {
    var o = {}; for (var k in z) if (k !== 'pts' && k !== 'name') o[k] = z[k];
    return JSON.stringify(o);
  }

  function buildContent(z, mediaBase) {
    var fx = document.createElement('div');
    var type = z.fx || 'solid';
    fx.className = 'lz-fx fx-' + type;
    var dur = Math.max(0.1, +z.dur || 2), delay = +z.delay || 0;
    fx.style.setProperty('--c1', z.c1 || '#ffffff');
    fx.style.setProperty('--c2', z.c2 || '#0044ff');
    fx.style.setProperty('--dur', dur + 's');
    fx.style.setProperty('--delay', (-delay) + 's'); // negativo = desfasado sin esperar
    var dir = z.dir || 'lr';
    var horiz = dir === 'lr' || dir === 'rl';
    var rev = dir === 'rl' || dir === 'tb';
    if (type === 'sweep' || type === 'fill') {
      var b = document.createElement('div');
      b.className = (type === 'sweep' ? 'lz-band ' : 'lz-fillbar ') + (horiz ? 'h' : 'v') + (rev ? ' rev' : '');
      fx.appendChild(b);
    } else if (type === 'gradient') {
      var ang = { lr: '90deg', rl: '270deg', tb: '180deg', bt: '0deg' }[dir] || '90deg';
      fx.style.background = 'linear-gradient(' + ang + ',' + (z.c1 || '#fff') + ',' + (z.c2 || '#04f') + ',' + (z.c1 || '#fff') + ')';
      fx.style.backgroundSize = '300% 300%';
    } else if (type === 'image' && z.src) {
      var img = document.createElement('img');
      img.src = mediaBase + z.src; img.style.objectFit = fitCss(z.fit);
      fx.appendChild(img);
    } else if (type === 'video' && z.src) {
      var v = document.createElement('video');
      v.src = mediaBase + z.src; v.muted = true; v.loop = true; v.autoplay = true;
      v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
      v.style.objectFit = fitCss(z.fit);
      v.playbackRate = Math.max(0.25, Math.min(4, +z.rate || 1));
      fx.appendChild(v);
      setTimeout(function () { var p = v.play(); if (p && p.catch) p.catch(function () {}); }, 0);
    }
    return fx;
  }
  function fitCss(f) { return f === 'contain' ? 'contain' : f === 'stretch' ? 'fill' : 'cover'; }

  var SVGNS = 'http://www.w3.org/2000/svg';

  function Renderer(container, opts) {
    injectCSS();
    opts = opts || {};
    this.mediaBase = opts.mediaBase || '';
    this.root = document.createElement('div');
    this.root.className = 'lz-root';
    container.appendChild(this.root);
    this.svg = document.createElementNS(SVGNS, 'svg');
    this.svg.setAttribute('class', 'lz-svg');
    container.appendChild(this.svg);
    this.items = {};
  }

  Renderer.prototype.render = function (state, W, H) {
    var self = this, seen = {};
    var zones = (state && state.zones) || [];
    var black = state && state.blackout;
    this.svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var scale = W / 1280;

    zones.forEach(function (z, idx) {
      seen[z.id] = true;
      var it = self.items[z.id];
      var key = contentKey(z);
      var shape = z.shape === 'poly' ? 'poly' : 'quad';
      if (!it || it.shape !== shape) {
        if (it) self.remove(z.id);
        it = { shape: shape, key: null };
        it.el = document.createElement('div');
        it.el.className = 'lz-zone';
        it.inner = document.createElement('div');
        it.inner.className = 'lz-in';
        it.el.appendChild(it.inner);
        it.line = document.createElementNS(SVGNS, 'polygon');
        it.line.setAttribute('pathLength', '100');
        it.line.setAttribute('fill', 'none');
        it.line.setAttribute('stroke-linejoin', 'round');
        self.svg.appendChild(it.line);
        self.items[z.id] = it;
      }
      // orden de capas = orden del array
      if (self.root.children[idx] !== it.el) self.root.insertBefore(it.el, self.root.children[idx] || null);

      var isLine = z.fx === 'outline' || z.fx === 'trace';
      if (it.key !== key) {
        it.inner.innerHTML = '';
        if (!isLine) it.inner.appendChild(buildContent(z, self.mediaBase));
        it.key = key;
        var dur = Math.max(0.1, +z.dur || 2);
        it.line.setAttribute('class', z.fx === 'trace' ? 'lz-trace' : '');
        it.line.style.setProperty('--dur', dur + 's');
        it.line.style.setProperty('--delay', (-(+z.delay || 0)) + 's');
        it.line.setAttribute('stroke', z.c1 || '#fff');
        it.line.setAttribute('stroke-dasharray', z.fx === 'trace' ? '100 100' : 'none');
      }
      var visible = !black && z.on !== false;
      var op = z.opacity == null ? 1 : +z.opacity;
      it.el.style.display = visible && !isLine ? '' : 'none';
      it.el.style.opacity = op;
      it.line.style.display = visible && isLine ? '' : 'none';
      it.line.style.opacity = op;
      it.line.setAttribute('stroke-width', ((+z.width || 6) * scale).toFixed(2));
      if (z.glow) it.line.style.filter = 'drop-shadow(0 0 ' + (8 * scale) + 'px ' + (z.c1 || '#fff') + ')';
      else it.line.style.filter = '';

      var px = (z.pts || []).map(function (p) { return [p[0] * W, p[1] * H]; });
      it.line.setAttribute('points', px.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '));

      if (shape === 'quad' && px.length === 4) {
        var w = Math.max(2, (dist(px[0], px[1]) + dist(px[3], px[2])) / 2);
        var h = Math.max(2, (dist(px[0], px[3]) + dist(px[1], px[2])) / 2);
        it.el.style.width = w + 'px'; it.el.style.height = h + 'px';
        it.el.style.clipPath = ''; it.el.style.webkitClipPath = '';
        it.el.style.transform = matrix3d(w, h, px);
        it.inner.style.left = '0'; it.inner.style.top = '0';
        it.inner.style.width = '100%'; it.inner.style.height = '100%';
      } else {
        var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        px.forEach(function (p) { minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); });
        it.el.style.transform = 'none';
        it.el.style.width = W + 'px'; it.el.style.height = H + 'px';
        var cp = 'polygon(' + px.map(function (p) { return p[0].toFixed(1) + 'px ' + p[1].toFixed(1) + 'px'; }).join(',') + ')';
        it.el.style.clipPath = cp; it.el.style.webkitClipPath = cp;
        it.inner.style.left = minX + 'px'; it.inner.style.top = minY + 'px';
        it.inner.style.width = Math.max(1, maxX - minX) + 'px'; it.inner.style.height = Math.max(1, maxY - minY) + 'px';
      }
    });
    Object.keys(this.items).forEach(function (id) { if (!seen[id]) self.remove(id); });
  };

  Renderer.prototype.remove = function (id) {
    var it = this.items[id]; if (!it) return;
    var vids = it.el.getElementsByTagName('video');
    for (var i = 0; i < vids.length; i++) { vids[i].pause(); vids[i].removeAttribute('src'); vids[i].load(); }
    if (it.el.parentNode) it.el.parentNode.removeChild(it.el);
    if (it.line.parentNode) it.line.parentNode.removeChild(it.line);
    delete this.items[id];
  };

  // Conexión en vivo (Server-Sent Events) con reconexión automática del navegador
  function connect(onState) {
    var es = new EventSource('/events');
    es.onmessage = function (ev) { try { var d = JSON.parse(ev.data); onState(d.state, d.from); } catch (e) {} };
    return es;
  }

  global.LuzMap = { Renderer: Renderer, EFFECTS: EFFECTS, connect: connect, matrix3d: matrix3d };
})(window);
