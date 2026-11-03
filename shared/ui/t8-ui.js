/* INTERACTIONS — T8 UI behaviour.
 * The small JS layer shared/ui/t8-ui.css's interactive components need. Leans on native browser
 * features wherever they exist (details/summary for accordion, <dialog> for modal, the Popover
 * API for dropdown/popover) specifically so there's almost nothing left to hand-roll — focus
 * trapping, light-dismiss, ESC-to-close and top-layer stacking all come from the platform, not
 * this file. What's actually here: tabs (keyboard roving-tabindex + panel switching), dialog
 * open/close wiring plus click-outside-to-dismiss, popover/dropdown position-near-trigger (the
 * Popover API shows the element but doesn't anchor it to whatever opened it), and a toast()
 * function to spawn transient status messages. Classic script, auto-initialises on load and
 * (via a MutationObserver) for anything added afterwards — no explicit init call needed for
 * markup already on the page.
 * Needs the Popover API (Chrome/Edge 114+, Safari 17+, Firefox 125+) for [popover] elements and
 * <dialog> for modals; both are now baseline in evergreen browsers. No polyfill — on an older
 * browser a popover/dialog simply won't open, everything else on the page is unaffected.
 */
(function () {
  'use strict';

  // ── tabs: [data-t8-tabs] wraps a [role=tablist] of .t8-tab buttons + sibling .t8-tabpanel ──
  function selectTab(root, tab) {
    const list = tab.closest('[role="tablist"]');
    if (!list) return;
    [...list.querySelectorAll('.t8-tab')].forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    });
    tab.focus();
  }
  function initTabs(root) {
    root.querySelectorAll('[data-t8-tabs]').forEach((wrap) => {
      if (wrap.dataset.t8Init) return;
      wrap.dataset.t8Init = '1';
      const tabs = [...wrap.querySelectorAll('.t8-tab')];
      tabs.forEach((t, i) => { t.tabIndex = t.getAttribute('aria-selected') === 'true' ? 0 : -1; });
      wrap.addEventListener('click', (e) => { const t = e.target.closest('.t8-tab'); if (t) selectTab(wrap, t); });
      wrap.addEventListener('keydown', (e) => {
        const cur = e.target.closest('.t8-tab'); if (!cur) return;
        const i = tabs.indexOf(cur);
        if (i < 0) return;
        let n = -1;
        if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') n = 0;
        else if (e.key === 'End') n = tabs.length - 1;
        if (n >= 0) { e.preventDefault(); selectTab(wrap, tabs[n]); }
      });
    });
  }

  // ── dialog: [data-t8-dialog-open="id"] shows it; [data-t8-dialog-close] closes the nearest
  // ancestor <dialog>; clicking the backdrop area (outside the dialog's own box) dismisses it. ──
  function initDialogs(root) {
    root.querySelectorAll('[data-t8-dialog-open]').forEach((btn) => {
      if (btn.dataset.t8Init) return;
      btn.dataset.t8Init = '1';
      btn.addEventListener('click', () => {
        const dlg = document.getElementById(btn.getAttribute('data-t8-dialog-open'));
        if (dlg && dlg.showModal) dlg.showModal();
      });
    });
    root.querySelectorAll('[data-t8-dialog-close]').forEach((btn) => {
      if (btn.dataset.t8Init) return;
      btn.dataset.t8Init = '1';
      btn.addEventListener('click', () => { const dlg = btn.closest('dialog'); if (dlg) dlg.close(); });
    });
    root.querySelectorAll('dialog.t8-dialog').forEach((dlg) => {
      if (dlg.dataset.t8DismissInit) return;
      dlg.dataset.t8DismissInit = '1';
      dlg.addEventListener('click', (e) => {
        if (e.target !== dlg) return;
        const r = dlg.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!inside) dlg.close();
      });
    });
  }

  // ── popover / dropdown: [popover] elements float at their static position by default; this
  // positions one under its [popovertarget] trigger on open, clamped to the viewport. ──
  function placePopover(pop) {
    const trigger = document.querySelector('[popovertarget="' + pop.id + '"]');
    if (!trigger) return;
    const tr = trigger.getBoundingClientRect();
    pop.style.position = 'fixed';
    pop.style.margin = '0';
    const pw = pop.offsetWidth || 220, ph = pop.offsetHeight || 80;
    let left = tr.left, top = tr.bottom + 6;
    if (left + pw > innerWidth - 8) left = Math.max(8, innerWidth - pw - 8);
    if (top + ph > innerHeight - 8) top = Math.max(8, tr.top - ph - 6);
    pop.style.left = Math.round(left) + 'px';
    pop.style.top = Math.round(top) + 'px';
  }
  function initPopovers(root) {
    root.querySelectorAll('[popover].t8-pop').forEach((pop) => {
      if (pop.dataset.t8Init) return;
      pop.dataset.t8Init = '1';
      pop.addEventListener('toggle', (e) => { if (e.newState === 'open') placePopover(pop); });
    });
  }

  function scan(root) { initTabs(root); initDialogs(root); initPopovers(root); }

  // ── toast: T8.toast({ title, desc, variant: 'default'|'rec'|'loop', duration }) ──
  let region = null;
  function toast(o) {
    o = o || {};
    if (!region) { region = document.createElement('div'); region.className = 't8-toast-region'; region.setAttribute('role', 'status'); document.body.appendChild(region); }
    const el = document.createElement('div');
    el.className = 't8-toast' + (o.variant && o.variant !== 'default' ? ' ' + o.variant : '');
    el.innerHTML = (o.title ? '<span class="t8-toast-title"></span>' : '') + (o.desc ? '<span class="t8-toast-desc"></span>' : '');
    if (o.title) el.querySelector('.t8-toast-title').textContent = o.title;
    if (o.desc) el.querySelector('.t8-toast-desc').textContent = o.desc;
    region.appendChild(el);
    const life = o.duration || 3200;
    const remove = () => el.remove();
    setTimeout(() => {
      el.classList.add('leaving');
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (mq) remove(); else el.addEventListener('animationend', remove, { once: true });
    }, life);
    return el;
  }

  document.addEventListener('DOMContentLoaded', () => scan(document));
  if (document.readyState !== 'loading') scan(document);
  new MutationObserver((muts) => { muts.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) scan(n.parentNode || document); })); })
    .observe(document.documentElement, { childList: true, subtree: true });

  window.T8 = { toast, scan };
})();
