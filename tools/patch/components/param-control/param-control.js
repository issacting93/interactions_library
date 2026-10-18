/* PARAM CONTROL: inspector row. Full knob, label, value readout and hairline slider.
   P.ui.paramControl({ label, kind, v, color, aria, onInput(v) }) → { el, update({ v, color }) }
   The knob and the slider drive each other. A value arriving from outside tweens the knob. */
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
})(window.Patch);
