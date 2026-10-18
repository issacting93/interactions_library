// Export stage renders as flattened, Figma-importable SVG.
//
//   node stage/export-figma.mjs [piece ...]       (no args: every registered piece)
//   node stage/export-figma.mjs cyberpunk-dial daisy-wheel
//
// Output: Instagram_Visuals/figma/<CODE>-<mode>.svg   (story · spec · exploded)
// The stage draws with CSS classes, SVG filters, <pattern> fills and textPath — none of
// which Figma's SVG importer understands. The export pass flattens all of it in the page:
//   · classes → computed presentation attributes (rgb → hex)
//   · <pattern> fills → explicit shapes (Figma has no <pattern>)
//   · goo filters → removed; the halo/core strokes already fake the look without the blur
//   · textPath → plain rotated <text> at the glyph position (Figma has no text-on-path)
//   · <tspan> → separate <text> elements at their glyph positions
//   · dominant-baseline → y offset, because Figma ignores the attribute
//   · invisible elements dropped; ids kept (Figma names layers after them)
// Fonts are Google fonts (Martian Mono / IBM Plex Mono) — Figma has them, so type stays editable.
// Env: STAGE_URL (default http://localhost:8765/Instagram_Visuals/stage/stage.html)
//      CHROME     (default the macOS Google Chrome app)

import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'figma');
const base = process.env.STAGE_URL || 'http://localhost:8765/Instagram_Visuals/stage/stage.html';
const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PIECES = ['rosette', 'cyberpunk-dial', 'signal-wheel', 'radial-goo-bloom', 'hex-workspace',
  'spine-section', 'daisy-wheel', 'geared-reticle', 'geared-reticle-patch'];
const MODES = [['story', 8.5], ['spec', 0], ['exploded', 8.5]];

const args = process.argv.slice(2);
const pieces = args.length ? args : PIECES;
mkdirSync(outDir, { recursive: true });

/* ── the in-page flatten pass (runs on a clone of #art, styles still live) ── */
const flattenFn = () => {
  const NS = 'http://www.w3.org/2000/svg';
  const clone = document.getElementById('art').cloneNode(true);
  clone.removeAttribute('style');
  clone.removeAttribute('class');
  // glyph queries (getStartPositionOfChar, getPointAtLength, getBBox) need the tree laid out:
  // attach the clone offscreen for the duration of the pass
  clone.style.position = 'fixed';
  clone.style.left = '-20000px';
  clone.style.top = '0';
  document.body.appendChild(clone);

  const rgb2hex = c => {
    const m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return c;
    const p = m[1].split(',').map(s => s.trim());
    const h = v => Math.round(+v).toString(16).padStart(2, '0');
    if (p.length > 3 && parseFloat(p[3]) < 1) return c;          // keep translucency as rgba
    return `#${h(p[0])}${h(p[1])}${h(p[2])}`;
  };

  // ── 1 · <pattern> fills → explicit shapes (anchored at the user-space origin) ──
  const patterns = {};
  clone.querySelectorAll('pattern').forEach(p => { patterns[p.id] = p; });
  clone.querySelectorAll('*').forEach(n => {
    const f = n.getAttribute('fill');
    if (!f || !f.startsWith('url(#')) return;
    const pat = patterns[f.slice(5, -1)];
    if (!pat) return;
    const pw = parseFloat(pat.getAttribute('width')), ph = parseFloat(pat.getAttribute('height'));
    const bx = n.getBBox();
    const g = document.createElementNS(NS, 'g');
    const cs = getComputedStyle(n);
    if (cs.opacity && cs.opacity !== '1') g.setAttribute('opacity', cs.opacity);
    if (cs.fillOpacity && cs.fillOpacity !== '1') g.setAttribute('fill-opacity', cs.fillOpacity);
    n.parentNode.insertBefore(g, n);
    for (const c of pat.children) {
      const ccs = getComputedStyle(c);
      const fill = rgb2hex(ccs.fill);
      const dx = parseFloat(c.getAttribute('cx')) || 0, dy = parseFloat(c.getAttribute('cy')) || 0;
      const r = c.getAttribute('r') || '1';
      for (let x = Math.floor((bx.x - dx) / pw) * pw + dx; x < bx.x + bx.width; x += pw)
        for (let y = Math.floor((bx.y - dy) / ph) * ph + dy; y < bx.y + bx.height; y += ph) {
          const q = c.cloneNode(true);
          q.removeAttribute('class');
          q.setAttribute('fill', fill);
          q.removeAttribute('cx'); q.removeAttribute('cy');
          q.setAttribute('cx', x); q.setAttribute('cy', y);
          q.setAttribute('r', r);
          g.appendChild(q);
        }
    }
    n.remove();
  });

  // ── 2 · textPath → rotated text at the glyph position ──
  clone.querySelectorAll('textPath').forEach(tp => {
    const textEl = tp.parentElement;
    const ref = clone.getElementById((tp.getAttribute('href') || '').slice(1));
    const label = tp.textContent;
    if (!ref || !label) { tp.remove(); return; }
    const idx = Math.floor(label.length / 2);
    let gp;
    try { gp = tp.getStartPositionOfChar(idx); } catch { tp.remove(); return; }
    const len = ref.getTotalLength();
    const mid = ref.getPointAtLength(len / 2);
    const eps = ref.getPointAtLength(Math.min(len, len / 2 + 2));
    let ang = Math.atan2(eps.y - mid.y, eps.x - mid.x) * 180 / Math.PI;
    if (Math.cos(ang * Math.PI / 180) < 0) ang += 180;          // keep it reading left → right
    const nt = document.createElementNS(NS, 'text');
    nt.setAttribute('x', gp.x); nt.setAttribute('y', gp.y);
    nt.setAttribute('transform', `rotate(${ang.toFixed(2)} ${gp.x.toFixed(2)} ${gp.y.toFixed(2)})`);
    nt.setAttribute('text-anchor', 'middle');
    nt.textContent = label;
    textEl.replaceWith(nt);
    ref.remove();
  });

  // ── 3 · <tspan> → separate <text> at glyph positions ──
  clone.querySelectorAll('text').forEach(t => {
    const spans = t.querySelectorAll('tspan');
    if (!spans.length) return;
    const anchor = getComputedStyle(t).textAnchor;
    [...spans].forEach(ts => {
      let p;
      try { p = ts.getStartPositionOfChar(0); } catch { return; }
      const nt = document.createElementNS(NS, 'text');
      nt.setAttribute('x', p.x); nt.setAttribute('y', p.y);
      if (anchor) nt.setAttribute('text-anchor', anchor);
      nt.textContent = ts.textContent;
      t.parentNode.insertBefore(nt, t);
    });
    t.remove();
  });

  // ── 4 · inline computed styles on everything still standing ──
  const SHAPE_ATTRS = ['stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin',
    'stroke-dasharray', 'stroke-dashoffset', 'fill', 'fill-opacity', 'fill-rule', 'opacity'];
  const TEXT_ATTRS = ['fill', 'opacity', 'font-family', 'font-size', 'font-weight', 'letter-spacing'];
  clone.querySelectorAll('*').forEach(n => {
    if (n.tagName === 'svg' || n.tagName === 'defs') return;
    const cs = getComputedStyle(n);
    if (n.tagName === 'text') {
      for (const k of TEXT_ATTRS) {
        const v = cs[k];
        if (k === 'fill') n.setAttribute('fill', rgb2hex(v));
        else if (k === 'letter-spacing') { if (v !== 'normal' && v !== '0px') n.setAttribute(k, v); }
        else if (v && v !== 'normal' && v !== '0px' && v !== '400') n.setAttribute(k, v);
      }
      if (cs.textAnchor && cs.textAnchor !== 'start') n.setAttribute('text-anchor', cs.textAnchor);
      // Figma ignores dominant-baseline: shift the baseline down instead
      if (cs.dominantBaseline === 'middle' || cs.dominantBaseline === 'central') {
        const fs = parseFloat(cs.fontSize) || 12;
        const y = parseFloat(n.getAttribute('y')) || 0;
        n.setAttribute('y', (y + fs * 0.35).toFixed(2));
      }
    } else {
      for (const k of SHAPE_ATTRS) {
        const v = cs[k];
        if (v === undefined || v === '') continue;
        if (k === 'fill' || k === 'stroke') n.setAttribute(k, rgb2hex(v));
        else if (k === 'stroke-dasharray') { if (v !== 'none') n.setAttribute(k, v); }
        else if (k === 'stroke-dashoffset') { if (parseFloat(v) !== 0 && cs.strokeDasharray !== 'none') n.setAttribute(k, v); }
        else if (k === 'opacity' || k === 'stroke-opacity' || k === 'fill-opacity') { if (parseFloat(v) < 1) n.setAttribute(k, v); }
        else n.setAttribute(k, v);
      }
      if (cs.opacity === '0') return;
    }
  });

  // ── 5 · drop what Figma cannot read ──
  clone.querySelectorAll('style, #guides, pattern, filter').forEach(n => n.remove());
  clone.querySelectorAll('*').forEach(n => {
    n.removeAttribute('class');
    n.removeAttribute('filter');
    n.removeAttribute('data-made-with');
    if (n.tagName === 'defs' && !n.children.length) n.remove();
  });
  // hidden elements (visibility / display) leave no trace
  clone.querySelectorAll('*').forEach(n => {
    if (n.tagName === 'svg' || n.tagName === 'defs') return;
    const cs = getComputedStyle(n);
    if (cs.display === 'none' || cs.visibility === 'hidden') n.remove();
  });

  return {
    code: document.getElementById('piece').selectedOptions[0].textContent.split(' · ')[0],
    // drop the offscreen-positioning style before serializing — an <img> would apply it
    // and shift the whole drawing out of view
    svg: (() => { clone.removeAttribute('style'); const s = new XMLSerializer().serializeToString(clone); clone.remove(); return s; })(),
  };
};

const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });

for (const piece of pieces) {
  for (const [mode, t] of MODES) {
    await page.goto(`${base}?piece=${piece}&mode=${mode}&format=4x5&capture=1&t=${t}`, { waitUntil: 'networkidle0' });
    await page.waitForFunction('window.stage && window.stage.ready');
    await page.evaluate(tt => window.stage.seek(tt), t);
    const { code, svg } = await page.evaluate(flattenFn);
    const file = join(outDir, `${code}-${mode}.svg`);
    writeFileSync(file, svg);
    console.log(file);
  }
}
if (errors.length) { console.error('PAGE ERRORS:\n' + errors.join('\n')); process.exitCode = 1; }
await browser.close();
