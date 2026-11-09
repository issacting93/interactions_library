/* Bloom picker — the Forge Console look for shared/engine/bloom.js (load that first).

   BloomPicker.open({
     host,            element the bloom draws over; it must be positioned (relative/absolute)
     at: { x, y },    the clicked thing's centre, in host pixels
     options: [{ id, label, src | html, current, mirror }],
     core: { label, title, onClick } | null,   the centre button; default "Done" closes the bloom
     mode: 'full' | 'arc' | 'hex',  radius, dir, span, cell: [w, h]   (see Bloom.layout)
     node: 48,        option size in px
     dim: [elements], faded while open (everything that isn't the clicked thing)
     onPick(option, index),  onClose(reason),  closeOnPick: true
   }) → { close(), el }

   Keyboard: focus starts on the current option. Arrows step round the ring, Home/End jump, Enter/Space
   pick, Tab stays inside, Escape closes and puts focus back where it was.
   Only one bloom is open at a time; opening another closes the first. */
(function () {
  'use strict';
  if (!window.Bloom) { console.warn('bloom-picker.js: load shared/engine/bloom.js first'); return; }
  const NS = 'http://www.w3.org/2000/svg';
  let openOne = null;

  function el(tag, cls, attrs) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function open(o) {
    if (openOne) openOne.close('replaced');
    const host = o.host, opts = o.options || [], mode = o.mode || 'full', node = o.node || 48;
    const box = host.getBoundingClientRect();
    const L = Bloom.layout(opts.length, o.at.x, o.at.y, {
      mode, radius: o.radius ?? Math.max(72, node * 1.85), dir: o.dir, span: o.span, cell: o.cell, node,
      bounds: { w: host.clientWidth || box.width, h: host.clientHeight || box.height, pad: 6, node },
    });
    const root = el('div', 'f-bloom is-closed' + (mode === 'hex' ? ' is-hex' : ''), { role: 'dialog', 'aria-label': o.title || 'Choose an option' });
    root.style.setProperty('--bloom-node', node + 'px');
    if (o.cell) { root.style.setProperty('--bloom-cw', o.cell[0] + 'px'); root.style.setProperty('--bloom-ch', o.cell[1] + 'px'); }

    const scrim = el('button', 'f-bloom__scrim', { type: 'button', 'aria-label': 'Close', tabindex: '-1' });
    root.appendChild(scrim);

    if (mode !== 'hex') {
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'f-bloom__ring'); svg.setAttribute('width', '1'); svg.setAttribute('height', '1'); svg.setAttribute('aria-hidden', 'true');
      const disc = document.createElementNS(NS, 'circle');
      disc.setAttribute('class', 'disc'); disc.setAttribute('cx', L.cx); disc.setAttribute('cy', L.cy); disc.setAttribute('r', L.radius);
      const tick = document.createElementNS(NS, 'circle');
      tick.setAttribute('class', 'tick'); tick.setAttribute('cx', L.cx); tick.setAttribute('cy', L.cy); tick.setAttribute('r', L.radius + node / 2 + 4);
      if (mode === 'arc') {
        // A half-bloom draws only the arc it opens along, so the body behind it stays visible.
        const pad = 14, f = (L.from - pad) * Math.PI / 180, t = (L.to + pad) * Math.PI / 180, r = L.radius;
        const arc = document.createElementNS(NS, 'path');
        arc.setAttribute('class', 'tick');
        arc.setAttribute('d', `M${L.cx + r * Math.cos(f)} ${L.cy + r * Math.sin(f)} A${r} ${r} 0 ${t - f > Math.PI ? 1 : 0} 1 ${L.cx + r * Math.cos(t)} ${L.cy + r * Math.sin(t)}`);
        arc.style.strokeDasharray = 'none'; arc.style.strokeOpacity = '1';
        svg.append(arc);
      } else svg.append(disc, tick);
      root.appendChild(svg);
    }

    const cap = el('div', 'f-bloom__cap', { 'aria-hidden': 'true' });
    cap.style.left = L.cx + 'px'; cap.style.top = (mode === 'arc' ? L.cy + 44 : L.cy + L.radius + node / 2 + 14) + 'px';

    const buttons = opts.map((op, i) => {
      const p = L.points[i];
      const b = el('button', 'f-bloom__opt' + (op.mirror ? ' is-mirror' : ''), { type: 'button', 'aria-label': op.label || String(op.id) });
      if (op.current) b.setAttribute('aria-current', 'true');
      b.style.left = p.x + 'px'; b.style.top = p.y + 'px';
      b.style.setProperty('--from-x', (L.cx - p.x) + 'px'); b.style.setProperty('--from-y', (L.cy - p.y) + 'px');
      if (op.src) { const im = el('img', '', { alt: '', src: op.src, draggable: 'false' }); b.appendChild(im); }
      else if (op.html) b.innerHTML = op.html;
      else b.textContent = op.label || '';
      const show = () => { cap.textContent = op.label || ''; };
      b.addEventListener('pointerenter', show); b.addEventListener('focus', show);
      b.addEventListener('click', () => { o.onPick && o.onPick(op, i); if (o.closeOnPick !== false) api.close('pick'); });
      root.appendChild(b);
      return b;
    });

    const core = o.core === null ? null : el('button', 'f-bloom__core', { type: 'button' });
    if (core) {
      const c = o.core || {};
      core.textContent = c.label || 'Done';
      if (c.title) core.title = c.title;
      core.setAttribute('aria-label', c.title || (c.label || 'Done').replace(/\n/g, ' '));
      core.style.left = L.cx + 'px'; core.style.top = L.cy + 'px';
      core.addEventListener('click', () => { if (c.onClick) c.onClick(api); else api.close('done'); });
      root.appendChild(core);
    }
    root.appendChild(cap);

    const ring = core ? buttons.concat(core) : buttons;
    root.addEventListener('keydown', (e) => {
      const i = ring.indexOf(document.activeElement);
      const go = (j) => { e.preventDefault(); ring[(j + ring.length) % ring.length].focus(); };
      if (e.key === 'Escape') { e.preventDefault(); api.close('escape'); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go(i + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go(i - 1);
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(ring.length - 1);
      else if (e.key === 'Tab') go(i + (e.shiftKey ? -1 : 1));
    });
    scrim.addEventListener('click', () => api.close('outside'));

    const dim = (o.dim || []).filter(Boolean);
    dim.forEach((d) => d.classList.add('is-bloom-dim'));
    const back = document.activeElement;
    host.appendChild(root);
    requestAnimationFrame(() => root.classList.remove('is-closed'));
    const first = buttons.find((b) => b.getAttribute('aria-current') === 'true') || buttons[0] || core;
    if (first) first.focus({ preventScroll: true });

    let closed = false;
    const api = {
      el: root,
      close(reason) {
        if (closed) return; closed = true;
        dim.forEach((d) => d.classList.remove('is-bloom-dim'));
        root.remove();
        if (openOne === api) openOne = null;
        if (back && back.focus && reason !== 'replaced' && document.contains(back)) back.focus({ preventScroll: true });
        o.onClose && o.onClose(reason);
      },
      // Change the core's label without reopening (for cores that step a mode).
      setCore(label, title) { if (core) { core.textContent = label; if (title) { core.title = title; core.setAttribute('aria-label', title); } } },
    };
    openOne = api;
    return api;
  }

  window.BloomPicker = { open, close: () => openOne && openOne.close('api'), get current() { return openOne; } };
})();
