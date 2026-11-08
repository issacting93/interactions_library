/* PORT: a node's input or output jack, plus its label.
   P.ui.port({ side: 'in' | 'out', label, sc, top, aria, onClick }) → { el, dot, update(state) }
   state: { connected, armed (an input waiting for a cable), pending (this output is the cable source) }
   A square ring marks a sidechain (SC) input. Armed inputs breathe; a press pops the jack. */
(function (P) {
  'use strict';
  const { h } = P;

  P.ui.port = function (o) {
    const dot = h('span', { class: 'p-port-dot' });
    const btn = h('button', { type: 'button', class: 'p-port-hit', 'aria-label': o.aria || o.label },  dot);
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
})(window.Patch);
