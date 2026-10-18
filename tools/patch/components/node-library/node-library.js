/* NODE LIBRARY: the palette of node types, grouped. Tap a row to add that node.
   P.ui.nodeLibrary({ groups = P.LIB, onAdd(type) }) → { el }
   Rows cascade in on first show; the swatch pops when tapped. */
(function (P) {
  'use strict';
  const { h, T } = P;

  P.ui.nodeLibrary = function (o) {
    o = o || {};
    const rows = [];
    const groups = (o.groups || P.LIB).map(([lab, types]) => h('div', { class: 'p-lib-group' },
      h('span', { class: 'p-lib-glabel', text: lab }),
      types.map((t) => {
        const d = T[t];
        const sw = h('span', { class: 'p-lib-sw', style: { background: d.color } });
        const row = h('button', { type: 'button', class: 'p-lib-row' },
          sw, h('span', { class: 'p-lib-name', text: d.name }), h('span', { class: 'p-lib-io', text: d.ins.length + '→' + d.outs.length }));
        row.addEventListener('click', () => { P.pop(sw, 1.8); if (o.onAdd) o.onAdd(t); });
        rows.push(row);
        return row;
      })));
    const el = h('aside', { class: 'p-lib', 'aria-label': 'Node library' },
      h('div', { class: 'p-lib-head' }, h('span', { class: 'p-lib-title p-display', text: 'NODES' }), h('span', { class: 'p-lib-sub', text: 'TAP TO ADD TO PATCH' })),
      groups);
    P.animate(rows, { opacity: [0, 1], translateX: [-10, 0], delay: P.stagger(22), duration: 520, ease: 'outQuart' });
    return { el };
  };
})(window.Patch);
