/* TRANSPORT BAR: legend, AUDITION / SAVE AS FX / RESET, and the toast line.
   P.ui.transportBar(actions) → { el, update(state) }
   The toast slides in from the right and fades out when cleared.
   Uses: legend. */
(function (P) {
  'use strict';
  const { h } = P;
  const PLAY = 'M2 1 L11 6 L2 11 Z', PAUSE = 'M2 1 H5 V11 H2 Z M7 1 H10 V11 H7 Z';

  P.ui.transportBar = function (actions) {
    const icon = h('path', { d: PLAY, fill: 'currentColor' });
    const aud = h('button', { type: 'button', class: 'p-tb-aud', 'aria-pressed': 'false' },
      h('svg', { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': 'true' }, icon), 'AUDITION');
    aud.addEventListener('click', () => { P.pop(aud, 1.06); actions.toggleAudition(); });
    const save = h('button', { type: 'button', class: 'p-btn', onClick: () => actions.saveFx() }, 'SAVE AS FX');
    const reset = h('button', { type: 'button', class: 'p-btn quiet', onClick: () => actions.reset() }, 'RESET');
    const toast = h('div', { class: 'p-tb-toast', role: 'status' });
    const el = h('footer', { class: 'p-tb' },
      P.ui.legend().el,
      h('div', { class: 'p-tb-btns' }, aud, save, reset),
      h('div', { class: 'p-tb-toastwrap' }, toast));

    let lastToast = '', lastAud = null;
    function update(s) {
      if (s.audition !== lastAud) {
        lastAud = s.audition;
        aud.classList.toggle('on', !!s.audition);
        aud.setAttribute('aria-pressed', s.audition ? 'true' : 'false');
        icon.setAttribute('d', s.audition ? PAUSE : PLAY);
      }
      if (s.toast === lastToast) return;
      if (s.toast) {
        toast.textContent = s.toast; toast.style.color = s.toastC || '';
        P.animate(toast, { opacity: [0, 1], translateX: [16, 0], duration: 460, ease: 'outQuart' });
      } else {
        P.animate(toast, { opacity: 0, translateX: 8, duration: 300, ease: 'inQuad' });
      }
      lastToast = s.toast;
    }
    return { el, update };
  };
})(window.Patch);
