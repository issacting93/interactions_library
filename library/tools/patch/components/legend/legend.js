/* LEGEND: key to cable kinds and the sidechain port.
   P.ui.legend() → { el } */
(function (P) {
  'use strict';
  const { h } = P;
  const ITEMS = [
    ['line', 'rgba(236,232,222,0.6)', 'AUDIO'],
    ['dash', 'var(--t8-solo)', 'SIDECHAIN'],
    ['dash', 'var(--t8-loop)', 'FEEDBACK'],
    ['line', 'var(--t8-rec)', 'ILLEGAL LOOP'],
    ['port', 'var(--t8-solo)', 'SC PORT']
  ];
  P.ui.legend = function () {
    const el = h('div', { class: 'p-legend', role: 'list', 'aria-label': 'Cable legend' },
      ITEMS.map(([shape, c, lab]) => h('span', { class: 'p-legend-item', role: 'listitem' },
        h('span', { class: 'p-legend-mark ' + shape, style: { '--c': c } }), lab)));
    return { el };
  };
})(window.Patch);
