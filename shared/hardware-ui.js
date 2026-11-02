/* INTERACTIONS — Hardware UI core.
   The generic half of tools/patch/shared/patch-core.js: the DOM builder, knob/cable geometry
   math, value formatting and anime.js motion helpers — extracted so the knob/cable/port/
   led-bypass/param-control widgets can be used outside the patch-bay app, without its node-graph
   data model (node types, topo-sort, patch state). That app-specific half stays in
   tools/patch/shared/patch-core.js, untouched — this file doesn't replace it, tools/patch keeps
   using its own window.Patch exactly as before.

   Pairs with shared/hardware-ui.css (same --t8-* tokens as shared/tape08-tokens.css /
   shared/tokens.css[data-theme="t8"] — load one of those first) and the component factories in
   shared/hardware-ui.js's HWUI.ui namespace, defined further down this same file.
   Classic script (not a module), so it also works from file://. Load order:
     <link rel="stylesheet" href="../../shared/tokens.css">         (or tape08-tokens.css)
     <link rel="stylesheet" href="../../shared/hardware-ui.css">
     <script src="…/vendor/anime.umd.min.js"></script>              (optional — degrades to instant)
     <script src="../../shared/hardware-ui.js"></script>
*/
(function () {
  'use strict';

  // ── colours (mirror shared/tokens.css's [data-theme="t8"] block; SVG attributes set via
  // JS can't reliably read CSS custom properties the way inline `style` can) ──
  const C = {
    ground: '#161618', panel: '#1D1D20',
    ink: '#ECE8DE', ink2: '#8C8981', dim: '#8A877F',
    line4: 'rgba(236,232,222,0.16)',
    accent: '#E8B04A', rec: '#FF4D5E', loop: '#5BE39A', solo: '#5CC8E0'
  };

  // ── cable kinds (generic enough for any patch-cord-style connector, not just audio) ──
  const KC = { audio: 'rgba(236,232,222,0.6)', sc: C.solo, feedback: C.loop, illegal: C.rec };

  // ── value formatting + knob geometry (identical to patch-core.js's versions) ──
  function fmt(kind, v) {
    if (kind === 'db') { const x = -24 + v * 36; return (x > 0.05 ? '+' : x < -0.05 ? '−' : '') + Math.abs(x).toFixed(1) + 'dB'; }
    if (kind === 'pct') return Math.round(v * 100) + '%';
    if (kind === 'ms') return Math.round(1 + v * v * 1999) + 'ms';
    if (kind === 'ratio') return (1 + v * 19).toFixed(1) + ':1';
    if (kind === 'hz') { const f = 20 * Math.pow(1000, v); return f >= 1000 ? (f / 1000).toFixed(1) + 'k' : Math.round(f) + ''; }
    if (kind === 'pan') return v < 0.48 ? 'L' + Math.round((0.5 - v) * 200) : v > 0.52 ? 'R' + Math.round((v - 0.5) * 200) : 'C';
    return v.toFixed(2);
  }
  function zero(kind) { return kind === 'db' ? 24 / 36 : kind === 'pan' ? 0.5 : 0; }
  function arcPath(a, b) {
    if (Math.abs(b - a) < 0.002) return 'M0 0';
    const lo = Math.min(a, b), hi = Math.max(a, b), r = 18;
    const s = (135 + 270 * lo) * Math.PI / 180, e = (135 + 270 * hi) * Math.PI / 180;
    return 'M' + (22 + r * Math.cos(s)).toFixed(2) + ' ' + (22 + r * Math.sin(s)).toFixed(2) +
      ' A18 18 0 ' + (270 * (hi - lo) > 180 ? 1 : 0) + ' 1 ' +
      (22 + r * Math.cos(e)).toFixed(2) + ' ' + (22 + r * Math.sin(e)).toFixed(2);
  }
  function knobGeom(kind, v) {
    const a = (135 + 270 * v) * Math.PI / 180;
    return { track: arcPath(0, 1), arc: arcPath(zero(kind), v), px: (22 + 10 * Math.cos(a)).toFixed(2), py: (22 + 10 * Math.sin(a)).toFixed(2) };
  }
  function cablePath(x1, y1, x2, y2) {
    const dx = Math.max(50, Math.abs(x2 - x1) * 0.5);
    return 'M' + x1 + ' ' + y1 + ' C' + (x1 + dx) + ' ' + y1 + ' ' + (x2 - dx) + ' ' + y2 + ' ' + x2 + ' ' + y2;
  }

  // ── tiny DOM builder: h('div', {class, style, onClick}, ...children) ──
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SVG_TAGS = new Set(['svg', 'path', 'circle', 'line', 'rect', 'g']);
  function h(tag, props, ...kids) {
    const el = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
    for (const k in props || {}) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'style' && typeof v === 'object') { for (const sk in v) el.style.setProperty(sk.startsWith('--') ? sk : sk.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), v[sk]); }
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    kids.flat(Infinity).forEach((c) => { if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return el;
  }

  // ── motion (anime.js v4, optional) — every tween goes through animate(); if anime.js
  // is missing or the viewer prefers reduced motion, the end state is applied at once. ──
  const reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const RESERVED = new Set(['duration', 'delay', 'ease', 'loop', 'alternate', 'autoplay', 'composition', 'modifier', 'frameRate', 'playbackRate',
    'onBegin', 'onUpdate', 'onRender', 'onLoop', 'onComplete', 'onPause']);
  function moving() { return !!window.anime && !(reduceMQ && reduceMQ.matches); }
  function animate(target, params) {
    if (moving()) return window.anime.animate(target, params);
    const isEl = target && target.nodeType === 1;
    for (const k in params) {
      if (RESERVED.has(k)) continue;
      let v = params[k]; if (Array.isArray(v)) v = v[v.length - 1];
      if (typeof v === 'function') continue;
      if (isEl) { if (k === 'opacity') target.style.opacity = ''; else target.style.transform = ''; }
      else target[k] = v;
    }
    if (params.onUpdate) params.onUpdate();
    if (params.onComplete) params.onComplete();
    return null;
  }
  function stop(target) { if (window.anime) window.anime.remove(target); }
  function spring(bounce, ms) { return window.anime ? window.anime.spring({ bounce: bounce, duration: ms }) : 'outQuad'; }
  function stagger(ms, o) { return window.anime ? window.anime.stagger(ms, o) : 0; }
  function fadeOut(el, done) {
    animate(el, { opacity: [1, 0], scale: [1, 0.94], duration: 220, ease: 'inQuad', onComplete: () => { el.remove(); if (done) done(); } });
  }
  function pop(el, amt) { animate(el, { scale: [amt || 1.3, 1], duration: 520, ease: spring(0.45, 520) }); }

  window.HWUI = { C, KC, fmt, zero, arcPath, knobGeom, cablePath, h, moving, animate, stop, spring, stagger, fadeOut, pop, ui: {} };
})();

/* ── KNOB: 270° rotary readout drawn in a 44×44 box. Ported verbatim from
   tools/patch/components/knob/knob.js, decoupled from window.Patch → window.HWUI.
   HWUI.ui.knob({ kind, v, color, variant: 'mini' | 'full', size, onInput, aria })
     → { el, update({ kind, v, color }, { instant }), value }
   With onInput the knob becomes a slider: drag vertically, or use the arrow keys. */
(function (P) {
  'use strict';
  const { h, C } = P;
  const V = {
    mini: { size: 30, track: 2, arc: 3, cap: 1.6, tick: false },
    full: { size: 46, track: 1.5, arc: 2, cap: 1.2, tick: true }
  };
  const clamp = (v) => Math.min(1, Math.max(0, v));

  P.ui.knob = function (o) {
    const v = V[o.variant || 'mini'], size = o.size || v.size;
    const track = h('path', { fill: 'none', stroke: 'rgba(236,232,222,0.16)', 'stroke-width': v.track });
    const arc = h('path', { fill: 'none', stroke: o.color || C.ink, 'stroke-width': v.arc, 'stroke-linecap': 'butt' });
    const ptr = h('line', { x1: 22, y1: 22, stroke: C.ink, 'stroke-width': v.cap, 'stroke-linecap': 'round' });
    const el = h('svg', { class: 'p-knob', width: size, height: size, viewBox: '0 0 44 44', 'aria-hidden': o.onInput ? null : 'true' },
      track, arc,
      v.tick && h('line', { x1: 22, y1: 1, x2: 22, y2: 4, stroke: C.dim, 'stroke-width': 1 }),
      h('circle', { cx: 22, cy: 22, r: 10, fill: C.ground, stroke: C.ink, 'stroke-width': v.cap }),
      ptr);

    let kind = o.kind || 'pct', target = o.v;
    const shown = { v: o.v };
    function draw() {
      const g = P.knobGeom(kind, shown.v);
      track.setAttribute('d', g.track); arc.setAttribute('d', g.arc);
      ptr.setAttribute('x2', g.px); ptr.setAttribute('y2', g.py);
      if (o.onInput) el.setAttribute('aria-valuetext', P.fmt(kind, target));
    }
    function update(n, opts) {
      if (n.kind) kind = n.kind;
      if (n.color) arc.setAttribute('stroke', n.color);
      if (n.v == null || n.v === target) { draw(); return; }
      target = n.v;
      if (opts && opts.instant) { P.stop(shown); shown.v = n.v; draw(); }
      else P.animate(shown, { v: n.v, duration: 460, ease: 'outExpo', onUpdate: draw });
    }

    if (o.onInput) {
      el.classList.add('live');
      el.setAttribute('role', 'slider'); el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', o.aria || 'Knob');
      el.setAttribute('aria-valuemin', '0'); el.setAttribute('aria-valuemax', '100');
      const set = (nv) => { nv = clamp(nv); update({ v: nv }, { instant: true }); el.setAttribute('aria-valuenow', Math.round(nv * 100)); o.onInput(nv); };
      let drag = null;
      el.addEventListener('pointerdown', (e) => { drag = { y: e.clientY, v: target }; el.setPointerCapture(e.pointerId); el.classList.add('grab'); e.preventDefault(); });
      el.addEventListener('pointermove', (e) => { if (drag) set(drag.v + (drag.y - e.clientY) / (e.shiftKey ? 600 : 160)); });
      const end = () => { drag = null; el.classList.remove('grab'); };
      el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
      el.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 0.1 : 0.01;
        const d = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: 0.1, PageDown: -0.1 }[e.key];
        if (e.key === 'Home') { set(0); e.preventDefault(); } else if (e.key === 'End') { set(1); e.preventDefault(); }
        else if (d) { set(target + d); e.preventDefault(); }
      });
      el.setAttribute('aria-valuenow', Math.round(o.v * 100));
    }
    draw();
    return { el, update, get value() { return target; } };
  };
})(window.HWUI);

/* ── CABLE: one patch cord, an SVG <g> with a fat invisible hit path and the visible stroke.
   Ported verbatim from tools/patch/components/cable/cable.js.
   HWUI.ui.cable({ onClick }) → { el, update({ d, kind, selected, audition }), drawIn(delay), leave() }
   kind: 'audio' | 'sc' | 'feedback' | 'illegal' | 'ghost'. drawIn() strokes the cable on from
   its output end — needs an SVG ancestor with a real layout size (getTotalLength). */
(function (P) {
  'use strict';
  const { h, KC, C } = P;
  const COLOR = Object.assign({}, KC, { ghost: C.accent });

  P.ui.cable = function (o) {
    o = o || {};
    const hit = h('path', { class: 'p-cable-hit', fill: 'none', stroke: 'transparent', 'stroke-width': 16 });
    const vis = h('path', { class: 'p-cable-vis', fill: 'none', 'stroke-linecap': 'round' });
    const el = h('g', { class: 'p-cable' }, hit, vis);
    if (o.onClick) hit.addEventListener('click', (e) => { e.stopPropagation(); o.onClick(); });
    else hit.style.pointerEvents = 'none';

    let st = {}, drawing = false;
    function paint() {
      const k = st.kind || 'audio';
      vis.style.stroke = st.selected ? C.accent : COLOR[k];
      vis.style.strokeWidth = st.selected ? 2.5 : k === 'audio' ? 1.5 : 1.8;
      el.classList.toggle('sel', !!st.selected);
      if (drawing) return;
      const dash = k === 'sc' ? '6 5' : k === 'feedback' ? '8 6' : k === 'ghost' ? '3 5' : st.audition ? '10 4' : 'none';
      vis.style.strokeDasharray = dash;
      vis.classList.toggle('flow', (!!st.audition && k !== 'illegal') || k === 'ghost');
    }
    function update(n) {
      if (n.d && n.d !== st.d) { hit.setAttribute('d', n.d); vis.setAttribute('d', n.d); }
      st = Object.assign({}, st, n);
      paint();
    }
    function drawIn(delay) {
      if (!P.moving() || !st.d) return;
      const len = vis.getTotalLength();
      const p = { o: len };
      drawing = true;
      vis.classList.remove('flow');
      vis.style.strokeDasharray = len + ' ' + len;
      vis.style.strokeDashoffset = len;
      P.animate(p, {
        o: 0, delay: delay || 0, duration: 620, ease: 'outQuart',
        onUpdate: () => { vis.style.strokeDashoffset = p.o; },
        onComplete: () => { drawing = false; vis.style.strokeDashoffset = ''; paint(); }
      });
    }
    function leave() { P.animate(el, { opacity: [1, 0], duration: 200, ease: 'inQuad', onComplete: () => el.remove() }); }
    return { el, update, drawIn, leave };
  };
})(window.HWUI);

/* ── PORT: a node's input or output jack, plus its label. Ported verbatim from
   tools/patch/components/port/port.js.
   HWUI.ui.port({ side: 'in' | 'out', label, sc, top, aria, onClick }) → { el, dot, update(state) }
   state: { connected, armed (waiting for a cable), pending (this output is the cable source) }.
   A square ring marks a sidechain (SC) input. Armed inputs breathe; a press pops the jack. */
(function (P) {
  'use strict';
  const { h } = P;

  P.ui.port = function (o) {
    const dot = h('span', { class: 'p-port-dot' });
    const btn = h('button', { type: 'button', class: 'p-port-hit', 'aria-label': o.aria || o.label }, dot);
    btn.addEventListener('click', (e) => { e.stopPropagation(); P.pop(dot, 1.45); if (o.onClick) o.onClick(); });
    const el = h('div', { class: 'p-port ' + (o.side || 'in') + (o.sc ? ' sc' : ''), style: { top: (o.top || 0) + 'px' } },
      btn, h('span', { class: 'p-port-label', text: o.label }));

    let armed = false, breath = null;
    function update(s) {
      el.classList.toggle('connected', !!s.connected);
      el.classList.toggle('armed', !!s.armed);
      el.classList.toggle('pending', !!s.pending);
      if (!!s.armed === armed) return;
      armed = !!s.armed;
      if (breath) { breath.pause(); breath = null; }
      if (armed && P.moving()) breath = window.anime.animate(dot, { scale: [1, 1.32], duration: 560, ease: 'inOutSine', loop: true, alternate: true });
      else P.animate(dot, { scale: 1, duration: 200, ease: 'outQuad' });
    }
    return { el, dot, update };
  };
})(window.HWUI);

/* ── LED BYPASS: ON / BYP toggle with a status LED in the module's colour. Ported verbatim
   from tools/patch/components/led-bypass/led-bypass.js.
   HWUI.ui.ledBypass({ on, color, label, onToggle }) → { el, update({ on, color }) } */
(function (P) {
  'use strict';
  const { h } = P;

  P.ui.ledBypass = function (o) {
    const led = h('span', { class: 'p-led-dot' });
    const txt = h('span', { class: 'p-led-txt' });
    const el = h('button', { type: 'button', class: 'p-led', 'aria-label': o.label || 'Bypass' }, led, txt);
    let on = null;
    function update(n) {
      if (n.color) el.style.setProperty('--led', n.color);
      if (n.on == null || n.on === on) return;
      const first = on === null;
      on = n.on;
      el.classList.toggle('on', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
      txt.textContent = on ? 'ON' : 'BYP';
      if (first) return;
      if (on) P.animate(led, { scale: [2.2, 1], duration: 640, ease: P.spring(0.35, 640) });
      else P.animate(led, { scale: [0.4, 1], duration: 360, ease: 'outQuad' });
    }
    el.addEventListener('click', () => { if (o.onToggle) o.onToggle(!on); });
    update({ on: o.on !== false, color: o.color });
    return { el, update };
  };
})(window.HWUI);

/* ── PARAM CONTROL: full knob, label, value readout and hairline slider — the two drive each
   other. Ported verbatim from tools/patch/components/param-control/param-control.js.
   HWUI.ui.paramControl({ label, kind, v, color, aria, onInput(v) }) → { el, update({ v, color }) } */
(function (P) {
  'use strict';
  const { h } = P;

  P.ui.paramControl = function (o) {
    let v = o.v;
    const val = h('span', { class: 'p-param-val p-display', text: P.fmt(o.kind, v) });
    const range = h('input', { type: 'range', min: 0, max: 100, value: Math.round(v * 100), 'aria-label': o.aria || o.label });
    const commit = (nv, from) => {
      v = nv; val.textContent = P.fmt(o.kind, v);
      if (from !== 'knob') knob.update({ v }, { instant: true });
      if (from !== 'range') range.value = Math.round(v * 100);
      if (o.onInput) o.onInput(v);
    };
    const knob = P.ui.knob({ kind: o.kind, v, color: o.color, variant: 'full', aria: (o.aria || o.label) + ' knob', onInput: (nv) => commit(nv, 'knob') });
    range.addEventListener('input', () => commit(Number(range.value) / 100, 'range'));

    const el = h('label', { class: 'p-param' },
      knob.el,
      h('span', { class: 'p-param-row' }, h('span', { class: 'p-param-label', text: o.label }), val),
      range);

    function update(n) {
      if (n.color) knob.update({ color: n.color });
      if (n.v == null || n.v === v) return;
      v = n.v; val.textContent = P.fmt(o.kind, v); range.value = Math.round(v * 100);
      knob.update({ v });
    }
    return { el, update };
  };
})(window.HWUI);
