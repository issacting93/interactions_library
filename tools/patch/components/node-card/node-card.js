/* NODE CARD: one module on the patch canvas. Header (order badge, name, LED), ports, mini knobs.
   P.ui.nodeCard({ type, onGrab(e), onIn(k), onOut(k), aria }) → { el, h, place(x, y), update(view), enter(delay), leave() }
   view (see nodeCard.view): { name, color, order, selected, invalid, on, params: [{ kind, v }],
                               ins: [{ connected, armed }], outs: [{ connected, pending }] }
   The card is built once per node and updated in place, so knobs and ports can animate.
   Uses: knob, port. */
(function (P) {
  'use strict';
  const { h, T, W } = P;

  P.ui.nodeCard = function (o) {
    const d = T[o.type], g = P.geom(o.type);
    const badge = h('span', { class: 'p-node-order p-display' });
    const name = h('span', { class: 'p-node-name p-display' });
    const led = h('span', { class: 'p-node-led' });
    const head = h('div', { class: 'p-node-head' }, badge, name, led);
    if (o.onGrab) head.addEventListener('pointerdown', (e) => o.onGrab(e));

    const label = (side, lab) => (side === 'in' ? 'Input ' : 'Output ') + lab + ' of ' + (o.aria || d.name);
    const ins = d.ins.map((lab, k) => P.ui.port({ side: 'in', label: lab, sc: lab === 'SC', top: g.py(k), aria: label('in', lab), onClick: () => o.onIn && o.onIn(k) }));
    const outs = d.outs.map((lab, k) => P.ui.port({ side: 'out', label: lab, top: g.py(k), aria: label('out', lab), onClick: () => o.onOut && o.onOut(k) }));

    const knobs = d.params.map(([, kind, v]) => {
      const kb = P.ui.knob({ kind, v, color: P.knobColor(d.color) });
      const val = h('span', { class: 'p-node-kval', text: P.fmt(kind, v) });
      return { kind, kb, val, cell: h('div', { class: 'p-node-knob' }, kb.el, val) };
    });
    const knobRow = knobs.length ? h('div', { class: 'p-node-knobs' }, knobs.map((k) => k.cell)) : null;

    const el = h('div', { class: 'p-node', style: { width: W + 'px', height: g.h + 'px', '--node': d.color } },
      head, ins.map((p) => p.el), outs.map((p) => p.el), knobRow);

    let last = {};
    function update(v) {
      if (v.name !== last.name) name.textContent = v.name;
      if (v.order !== last.order) {
        badge.textContent = v.order;
        if (last.order != null) P.pop(badge, 1.35);
      }
      el.classList.toggle('sel', !!v.selected);
      el.classList.toggle('invalid', !!v.invalid);
      el.classList.toggle('bypassed', v.on === false);
      (v.params || []).forEach((p, i) => { const k = knobs[i]; if (!k) return; k.kb.update({ v: p.v }); k.val.textContent = P.fmt(k.kind, p.v); });
      (v.ins || []).forEach((s, i) => ins[i] && ins[i].update(s));
      (v.outs || []).forEach((s, i) => outs[i] && outs[i].update(s));
      last = v;
    }
    function place(x, y) { el.style.left = x + 'px'; el.style.top = y + 'px'; }
    function enter(delay) { P.animate(el, { opacity: [0, 1], scale: [0.9, 1], translateY: [10, 0], delay: delay || 0, duration: 700, ease: P.spring(0.25, 700) }); }
    function leave() { P.fadeOut(el); }
    return { el, h: g.h, place, update, enter, leave };
  };

  // Build a card's view from patch state (s) and derived data (D = P.derive(s)).
  P.ui.nodeCard.view = function (s, D, n) {
    const d = T[n.type], pending = s.pending;
    const count = (f) => s.edges.filter(f).length;
    return {
      name: P.label(n), color: d.color, order: P.orderTag(D, n.id), on: n.on,
      selected: !!(s.sel && s.sel.kind === 'node' && s.sel.id === n.id),
      invalid: !D.orderIdx[n.id],
      params: d.params.map(([k, kind]) => ({ kind, v: n.p[k] })),
      ins: d.ins.map((_, k) => ({ connected: count((e) => e.b === n.id && e.bp === k) > 0, armed: !!pending && pending.node !== n.id })),
      outs: d.outs.map((_, k) => ({ connected: count((e) => e.a === n.id && e.ap === k) > 0, pending: !!pending && pending.node === n.id && pending.port === k }))
    };
  };
})(window.Patch);
