/* LED BYPASS: ON / BYP toggle with a status LED in the module's colour.
   P.ui.ledBypass({ on, color, label, onToggle }) → { el, update({ on, color }) }
   The LED flares when switched on and dims out when bypassed. */
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
})(window.Patch);
