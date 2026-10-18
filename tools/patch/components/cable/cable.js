/* CABLE: one patch cord, an SVG <g> with a fat invisible hit path and the visible stroke.
   P.ui.cable({ onClick }) → { el, update({ d, kind, selected, audition }), drawIn(delay), leave() }
   kind: 'audio' | 'sc' | 'feedback' | 'illegal' | 'ghost' (the cord that follows the pointer while patching).
   Colour and width transition in CSS. drawIn() strokes the cable on from its output end. */
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
})(window.Patch);
