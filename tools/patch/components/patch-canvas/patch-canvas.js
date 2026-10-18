/* PATCH CANVAS: header (title, counts, graph status, PDC), hint line, and the 900×600 dotted grid
   holding cables and node cards.
   P.ui.patchCanvas(actions) → { el, update(state) }
   Nodes and cables are keyed by id and kept between updates, so:
     · the first render assembles: cards spring in one by one, then cables draw on;
     · a node that moves without being dragged (RESET) springs to its new place, and cables follow;
     · a new cable draws on from its output, a removed one fades;
     · while an output is armed, a ghost cable trails the pointer.
   Uses: node-card (→ knob, port), cable. */
(function (P) {
  'use strict';
  const { h, W, CW, CH } = P;

  P.ui.patchCanvas = function (actions) {
    // ── header ──
    const title = h('span', { class: 'p-cv-title p-display' });
    const meta = h('span', { class: 'p-cv-meta' });
    const statusTxt = h('span');
    const status = h('span', { class: 'p-pill' }, h('span', { class: 'p-dot' }), statusTxt);
    const fb = h('span', { class: 'p-pill fb', hidden: true }, h('span', { class: 'p-dot' }), 'FEEDBACK · VIA DELAY');
    const pdc = h('span', { class: 'p-cv-meta' });
    const head = h('div', { class: 'p-cv-head' },
      h('div', { class: 'p-cv-titles' }, title, meta), h('span', { class: 'p-cv-spacer' }), status, fb, pdc);
    const hint = h('div', { class: 'p-cv-hint', 'aria-live': 'polite' });

    // ── grid ──
    const svg = h('svg', { class: 'p-cv-cables', width: CW, height: CH, viewBox: '0 0 ' + CW + ' ' + CH, 'aria-hidden': 'true' });
    const ghost = P.ui.cable();
    ghost.el.style.display = 'none';
    svg.append(ghost.el);
    const nodesLayer = h('div', { class: 'p-cv-nodes' });
    const grid = h('div', { class: 'p-cv-grid', style: { width: CW + 'px', height: CH + 'px' } },
      h('span', { class: 'p-cv-gridlab', text: 'GRID 16 · 100%' }), svg, nodesLayer);
    const el = h('section', { class: 'p-canvas', 'aria-label': 'Patch canvas' }, head, hint, h('div', { class: 'p-cv-frame' }, grid));

    const cards = new Map();   // id → { card, type, pos (tweened), tx, ty (target) }
    const cables = new Map();  // id → cable
    let S = null, first = true, drag = null, grabbed = false, raf = 0;
    const ghostEnd = { x: 0, y: 0 };
    const pdcShown = { v: 0 };
    let lastHint = '', lastStatus = '';

    const portXY = (id, side, k) => {
      const c = cards.get(id); if (!c) return null;
      return { x: c.pos.x + (side === 'out' ? W : 0), y: c.pos.y + P.geom(c.type).py(k) };
    };
    function redraw() {
      if (!S) return;
      S.edges.forEach((e) => {
        const cb = cables.get(e.id), a = portXY(e.a, 'out', e.ap), b = portXY(e.b, 'in', e.bp);
        if (cb && a && b) cb.update({ d: P.cablePath(a.x, a.y, b.x, b.y) });
      });
      const p = S.pending && portXY(S.pending.node, 'out', S.pending.port);
      ghost.el.style.display = p ? '' : 'none';
      if (p) ghost.update({ kind: 'ghost', d: P.cablePath(p.x, p.y, ghostEnd.x, ghostEnd.y) });
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; redraw(); }); };

    // ── pointer ──
    const local = (e) => {
      const r = grid.getBoundingClientRect(), sc = grid.offsetWidth ? r.width / grid.offsetWidth : 1;
      return { x: (e.clientX - r.left) / sc, y: (e.clientY - r.top) / sc, sc };
    };
    function grab(id, e) {
      if (e.button > 0) return;
      const n = S.nodes.find((x) => x.id === id), c = cards.get(id);
      if (!n || !c) return;
      grabbed = true;
      drag = { id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y };
      grid.setPointerCapture(e.pointerId);
      nodesLayer.append(c.card.el);              // bring to front
      c.card.el.classList.add('dragging');
      P.animate(c.card.el, { scale: 1.03, duration: 260, ease: 'outQuad' });
      actions.select({ kind: 'node', id });
    }
    grid.addEventListener('pointerdown', () => { grabbed = false; }, true);
    grid.addEventListener('pointermove', (e) => {
      const L = local(e);
      if (drag) {
        const c = cards.get(drag.id); if (!c) return;
        const nx = Math.round(Math.min(CW - W - 4, Math.max(4, drag.ox + (e.clientX - drag.sx) / L.sc)) / 2) * 2;
        const ny = Math.round(Math.min(CH - c.card.h - 4, Math.max(4, drag.oy + (e.clientY - drag.sy) / L.sc)) / 2) * 2;
        actions.moveNode(drag.id, nx, ny);
      } else if (S && S.pending) {
        P.animate(ghostEnd, { x: L.x, y: L.y, duration: 160, ease: 'outQuad', onUpdate: schedule });
      }
    });
    const endDrag = () => {
      if (!drag) return;
      const c = cards.get(drag.id);
      if (c) { c.card.el.classList.remove('dragging'); P.animate(c.card.el, { scale: 1, duration: 420, ease: P.spring(0.3, 420) }); }
      drag = null;
    };
    grid.addEventListener('pointerup', endDrag);
    grid.addEventListener('pointercancel', endDrag);
    grid.addEventListener('click', (e) => {
      if (grabbed) { grabbed = false; return; }
      if (e.target === grid || e.target === svg || e.target === nodesLayer) actions.clearSelection();
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S && S.pending) actions.select(S.sel); });

    // ── update ──
    function update(s) {
      const wasPending = S && S.pending;
      S = s;
      const D = P.derive(s);

      for (const [id, c] of cards) if (!D.byId[id]) { c.card.leave(); cards.delete(id); }
      s.nodes.forEach((n, i) => {
        let c = cards.get(n.id);
        if (!c) {
          const card = P.ui.nodeCard({ type: n.type, aria: P.label(n), onGrab: (e) => grab(n.id, e), onIn: (k) => actions.clickIn(n.id, k), onOut: (k) => actions.clickOut(n.id, k) });
          c = { card, type: n.type, pos: { x: n.x, y: n.y }, tx: n.x, ty: n.y };
          cards.set(n.id, c);
          nodesLayer.append(card.el);
          card.place(n.x, n.y);
          card.enter(first ? 60 + i * 55 : 0);
        } else if (drag && drag.id === n.id) {
          P.stop(c.pos); c.pos.x = n.x; c.pos.y = n.y; c.card.place(n.x, n.y);
        } else if (c.tx !== n.x || c.ty !== n.y) {
          P.animate(c.pos, { x: n.x, y: n.y, duration: 760, ease: P.spring(0.22, 760), onUpdate: () => { c.card.place(c.pos.x, c.pos.y); schedule(); } });
        }
        c.tx = n.x; c.ty = n.y;
        c.card.update(P.ui.nodeCard.view(s, D, n));
      });

      const live = new Set();
      s.edges.forEach((e, i) => {
        if (!D.byId[e.a] || !D.byId[e.b]) return;
        live.add(e.id);
        let cb = cables.get(e.id);
        const fresh = !cb;
        if (fresh) { cb = P.ui.cable({ onClick: () => actions.select({ kind: 'edge', id: e.id }) }); cables.set(e.id, cb); svg.insertBefore(cb.el, ghost.el); }
        cb.update({ kind: D.A.kind[e.id], selected: !!(s.sel && s.sel.kind === 'edge' && s.sel.id === e.id), audition: s.audition });
        if (fresh) { const a = portXY(e.a, 'out', e.ap), b = portXY(e.b, 'in', e.bp); cb.update({ d: P.cablePath(a.x, a.y, b.x, b.y) }); cb.drawIn(first ? 480 + i * 60 : 0); }
      });
      for (const [id, cb] of cables) if (!live.has(id)) { cb.leave(); cables.delete(id); }

      if (s.pending && !wasPending) {          // start the ghost at its port
        const p = portXY(s.pending.node, 'out', s.pending.port);
        if (p) { P.stop(ghostEnd); ghostEnd.x = p.x + 60; ghostEnd.y = p.y; }
      }
      redraw();

      // header
      title.textContent = s.title;
      meta.textContent = 'PATCH 01 · ' + s.nodes.length + ' NODES · ' + s.edges.length + ' CABLES';
      const st = D.A.illegal ? 'LOOP WITHOUT DELAY' : 'GRAPH VALID';
      if (st !== lastStatus) {
        statusTxt.textContent = st; status.classList.toggle('bad', D.A.illegal);
        if (lastStatus) P.pop(status, 1.12);
        lastStatus = st;
      }
      const showFb = D.A.feedback && !D.A.illegal;
      if (showFb && fb.hidden) { fb.hidden = false; if (!first) P.animate(fb, { opacity: [0, 1], translateX: [8, 0], duration: 380, ease: 'outQuart' }); }
      else if (!showFb) fb.hidden = true;
      P.animate(pdcShown, { v: D.A.pdc, duration: 600, ease: 'outExpo', onUpdate: () => { pdc.textContent = 'PDC ' + Math.round(pdcShown.v) + ' SMP'; } });

      // hint
      let ht = 'DRAG A NODE BY ITS HEADER · TAP AN OUTPUT, THEN AN INPUT, TO PATCH';
      if (s.pending && D.byId[s.pending.node]) {
        const n = D.byId[s.pending.node];
        ht = 'PICK AN INPUT FOR ' + P.label(n) + ' · ' + P.T[n.type].outs[s.pending.port] + ' — TAP THE GRID TO CANCEL';
      }
      if (ht !== lastHint) {
        hint.textContent = ht; hint.classList.toggle('armed', !!s.pending);
        if (lastHint) P.animate(hint, { opacity: [0, 1], translateY: [4, 0], duration: 320, ease: 'outQuad' });
        lastHint = ht;
      }
      first = false;
    }
    return { el, update };
  };
})(window.Patch);
