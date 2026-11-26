// packages/ui/eco-knobs.js -- the round knobs the ecology pages' panels use for their sliders (World Scene, Cybernetic Ecology, Field
// Scan, Species Style Lab each carried the same copy): set a range input, the arc of a knob, and a knob built over a range input.
// Plain global functions.

function setRange(id, v) { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input')); }
function knobArc(a0, a1) {
  if (Math.abs(a1 - a0) < 0.002) return 'M0 0';
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1), r = 16;
  const s = (135 + 270 * lo) * Math.PI / 180, e = (135 + 270 * hi) * Math.PI / 180;
  return 'M' + (20 + r * Math.cos(s)).toFixed(2) + ' ' + (20 + r * Math.sin(s)).toFixed(2) +
    ' A' + r + ' ' + r + ' 0 ' + (270 * (hi - lo) > 180 ? 1 : 0) + ' 1 ' + (20 + r * Math.cos(e)).toFixed(2) + ' ' + (20 + r * Math.sin(e)).toFixed(2);
}
function makeKnob(input) {
  const NS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs) => { const el = document.createElementNS(NS, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); return el; };
  const min = +input.min, max = +input.max, step = +input.step || 1;
  const track = sv('path', { fill: 'none', stroke: 'var(--line-2)', 'stroke-width': 2.2, 'stroke-linecap': 'round' });
  const arc = sv('path', { fill: 'none', stroke: 'var(--acc)', 'stroke-width': 2.2, 'stroke-linecap': 'round', opacity: 0.55 });
  const needle = sv('circle', { r: 2.6, fill: 'var(--acc)' });
  const capc = sv('circle', { cx: 20, cy: 20, r: 1.4, fill: 'var(--faint)' });
  const label = input.closest('.ctl').querySelector('span').textContent.trim();
  const svg = sv('svg', { class: 'p-knob', width: 46, height: 46, viewBox: '0 0 40 40', role: 'slider', tabindex: '0', 'aria-label': label, 'aria-valuemin': min, 'aria-valuemax': max });
  svg.append(track, capc, arc, needle);
  const out = input.closest('.ctl').querySelector('output');
  const norm = () => Math.min(1, Math.max(0, (+input.value - min) / (max - min)));
  function draw() {
    const n = norm(), a = (135 + 270 * n) * Math.PI / 180;
    track.setAttribute('d', knobArc(0, 1)); arc.setAttribute('d', knobArc(0, n));
    needle.setAttribute('cx', (20 + 16 * Math.cos(a)).toFixed(2)); needle.setAttribute('cy', (20 + 16 * Math.sin(a)).toFixed(2));
    svg.setAttribute('aria-valuenow', input.value); if (out) svg.setAttribute('aria-valuetext', out.textContent);
  }
  function commit(nv) {
    nv = Math.min(max, Math.max(min, nv)); nv = Math.round(nv / step) * step; nv = Math.round(nv * 1000) / 1000;
    if (+input.value === nv) return;
    input.value = nv; input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  let drag = null;
  svg.addEventListener('pointerdown', e => { drag = { y: e.clientY, v: +input.value }; svg.setPointerCapture(e.pointerId); svg.classList.add('grab'); e.preventDefault(); });
  svg.addEventListener('pointermove', e => { if (!drag) return; const span = max - min, k = e.shiftKey ? 2400 : 160; commit(drag.v + (drag.y - e.clientY) * span / k); });
  const endDrag = () => { drag = null; svg.classList.remove('grab'); };
  svg.addEventListener('pointerup', endDrag); svg.addEventListener('pointercancel', endDrag);
  svg.addEventListener('dblclick', () => commit(+input.defaultValue));          // double-click resets
  svg.addEventListener('keydown', e => {
    const st = e.shiftKey ? step * 10 : step;
    const d = { ArrowUp: st, ArrowRight: st, ArrowDown: -st, ArrowLeft: -st }[e.key];
    if (e.key === 'Home') { commit(min); e.preventDefault(); } else if (e.key === 'End') { commit(max); e.preventDefault(); }
    else if (d) { commit(+input.value + d); e.preventDefault(); }
  });
  input.addEventListener('input', draw); draw();
  return svg;
}
