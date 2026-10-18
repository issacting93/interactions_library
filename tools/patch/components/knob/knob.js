/* KNOB: 270° rotary readout drawn in a 44×44 box.
   P.ui.knob({ kind, v, color, variant: 'mini' | 'full', size, onInput, aria })
     → { el, update({ kind, v, color }, { instant }), value }
   Value changes tween with anime.js; pass { instant: true } while the user is dragging.
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
})(window.Patch);
