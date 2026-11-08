/* INTERACTIONS — Radial Lattice core.
   The karbandi star-lattice math extracted from tools/karbandi-generator/karbandi-generator.html:
   divide a circle into n points, connect every point to the one k steps away, and read off the
   "shamseh" medallion radius where the chords clear the centre. Pure geometry, no DOM — palette-
   agnostic (callers pass explicit colours, not a named palette) so it drops into either an
   SVG-string builder (karbandi-generator's own UI) or a canvas renderer (e.g. tools/naqsh-forge's
   karbandi node) without preferring either.

   Classic script (not a module), so it also works from file://. Load order:
     <script src="../../../shared/engine/radial-lattice.js"></script>
*/
(function () {
  'use strict';

  const f2 = n => n.toFixed(2);

  // A single point i of n, on a circle of radius r centred at (cx, cy), rotated by rotationDeg.
  function pointAt(r, i, n, cx, cy, rotationDeg) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2 + (rotationDeg * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }

  // All n points on the circle.
  function points(n, r, { cx = 0, cy = 0, rotation = 0 } = {}) {
    return Array.from({ length: n }, (_, i) => pointAt(r, i, n, cx, cy, rotation));
  }

  // The n chords, each connecting point i to point (i + k) % n, as [[x1,y1],[x2,y2]] pairs.
  function chords(n, k, r, opts) {
    const pts = points(n, r, opts);
    return pts.map((p, i) => [p, pts[(i + k) % n]]);
  }

  // Radius of the medallion left open at the centre once the chords are drawn.
  function shamsehRadius(radius, divisions, step, shamsehScale) {
    const chord = 2 * radius * Math.sin((step * Math.PI) / divisions);
    return Math.max(0, (radius - chord / 2) * shamsehScale);
  }

  function hexToRgba(hex, alpha) {
    const v = hex.replace('#', '');
    const r = parseInt(v.slice(0, 2), 16), g = parseInt(v.slice(2, 4), 16), b = parseInt(v.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // Full SVG markup string for the lattice — same shape as karbandi-generator's own `build()`.
  // opts: { cx, cy, divisions, step, rotation, radius, mode, strokeWidth, chordColor, shamsehColor, pointSize }
  function buildSVG(opts) {
    const {
      cx = 400, cy = 400,
      divisions: n, step: k, radius,
      rotation = 0, mode = 'full', strokeWidth = 1.6,
      chordColor, shamsehColor, pointSize = 0,
    } = opts;
    const pts = points(n, radius, { cx, cy, rotation });

    let markup = '';
    if (mode === 'pattern') {
      markup += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${chordColor}" stroke-width="1" stroke-dasharray="4 5" opacity="0.4"/>`;
    } else {
      markup += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${chordColor}" stroke-width="1" opacity="0.25"/>`;
    }

    for (let i = 0; i < n; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + k) % n];
      markup += `<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="${chordColor}" stroke-width="${strokeWidth}" opacity="0.85"/>`;
    }

    const shamR = shamsehRadius(radius, n, k, opts.shamsehScale);
    if (shamR > 2) {
      markup += `<circle cx="${cx}" cy="${cy}" r="${f2(shamR)}" fill="${hexToRgba(shamsehColor, 0.14)}" stroke="${shamsehColor}" stroke-width="1.6"/>`;
    }

    if (mode === 'full') {
      if (pointSize > 0) {
        pts.forEach(([x, y]) => {
          markup += `<circle cx="${f2(x)}" cy="${f2(y)}" r="${pointSize}" fill="${chordColor}"/>`;
        });
      }
      markup += `<circle cx="${cx}" cy="${cy}" r="5" fill="${shamsehColor}"/>`;
    }
    return markup;
  }

  window.RadialLattice = { pointAt, points, chords, shamsehRadius, hexToRgba, buildSVG };
})();
