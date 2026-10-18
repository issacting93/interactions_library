/* TOP STRIP: TAPE 08 brand, view tabs, audition status, engine readouts.
   P.ui.topStrip({ current = 'PATCH' }) → { el, update(state) }
   The CPU readout counts to its new value instead of jumping. */
(function (P) {
  'use strict';
  const { h } = P;
  const TABS = ['ARRANGE', 'MIX', 'PATCH', 'EXPORT'];

  P.ui.topStrip = function (o) {
    o = o || {};
    const statusTxt = h('span', { text: 'IDLE' });
    const status = h('span', { class: 'p-ts-status' }, h('span', { class: 'p-dot' }), statusTxt);
    const cpu = h('span', { text: 'CPU 3%' });
    const el = h('header', { class: 'p-ts' },
      h('div', { class: 'p-ts-brand' },
        h('svg', { width: 22, height: 22, viewBox: '0 0 22 22', 'aria-hidden': 'true' },
          h('circle', { cx: 6, cy: 11, r: 4.5, fill: 'none', stroke: P.C.ink, 'stroke-width': 1 }),
          h('circle', { cx: 16, cy: 11, r: 4.5, fill: 'none', stroke: P.C.ink, 'stroke-width': 1 }),
          h('line', { x1: 2, y1: 18, x2: 20, y2: 18, stroke: P.C.ink, 'stroke-width': 1 })),
        h('span', { class: 'p-ts-name p-display', text: 'TAPE 08' }),
        h('span', { class: 'p-ts-ver', text: 'MULTITRACK / R 2.0.1' })),
      h('nav', { class: 'p-ts-tabs', 'aria-label': 'Views' },
        TABS.map((t) => h('span', { class: 'p-ts-tab', 'aria-current': t === (o.current || 'PATCH') ? 'page' : null, text: t }))),
      h('div', { class: 'p-ts-ro' }, status, h('span', { text: '48 kHZ · BLOCK 128' }), cpu));

    const shown = { v: 3 };
    let lastAud = null;
    function update(s) {
      if (s.audition !== lastAud) {
        lastAud = s.audition;
        status.classList.toggle('on', !!s.audition);
        statusTxt.textContent = s.audition ? 'AUDITION' : 'IDLE';
      }
      const target = s.audition ? 14 + s.nodes.length : 3;
      P.animate(shown, { v: target, duration: 900, ease: 'outExpo', onUpdate: () => { cpu.textContent = 'CPU ' + Math.round(shown.v) + '%'; } });
    }
    return { el, update };
  };
})(window.Patch);
