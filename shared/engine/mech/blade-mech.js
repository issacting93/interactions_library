/*
 * Forge — blade mech. A four-legged machine where every leg is ONE long blade (cut into bones by the
 * walker), built from a hand composition: Zac's front-view SVG (shared/data/mechs/hand-mech.svg)
 * gives the body, the hip pods and the two blades; any of the four slots can be swapped for a kit part.
 *
 *   slots   body   the plate the machine is built on (lies flat in 3D, head forward)
 *           pod    a compact piece beside the body at each hip (mirrored)
 *           front  the near legs: blades that reach down to the ground (mirrored)
 *           back   the far legs: blades swept out to the side (mirrored)
 *
 *   BladeMech.SLOTS                          the four slot names
 *   BladeMech.parse(svgText, flattenD)       -> pieces { axis, body, pod, front, back }, each
 *                                               { polys, w, h, cx, cy } (+ J joint, T tip for legs),
 *                                               in Forge sheet coordinates (the mirror axis at x = 200)
 *   BladeMech.handParts(pieces)              -> pseudo-parts "HB-body", "HB-pod", "HB-front", "HB-back"
 *                                               ({ id, name, side, w, h, svg }) to sit beside kit parts
 *   BladeMech.build(byId, picks, pieces, along) -> CreatureCells-style placements (front view): your
 *                                               pieces where you drew them, a kit part fitted to the
 *                                               same place (legs laid along your blade's axis by along())
 *   BladeMech.pools(curated, parts)          -> { slot: [part ids] }: MechSlots (curated lists in
 *                                               shared/data/mech-slots.json, else the shape rules)
 *
 * Paths are sorted by shape: tall blades are the near legs, wide blades out at the sides the far legs,
 * small shapes beside the body the pods, the rest the body. Only left-hand copies are kept.
 * Needs mech-slots.js loaded first. Pure: no DOM. Classic script.
 */
(function () {
  "use strict";
  const AXIS = 200, SLOTS = ["body", "pod", "front", "back"];
  const bbOf = (polys) => {
    let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
    for (const pl of polys) for (let i = 0; i < pl.length; i += 2) { a = Math.min(a, pl[i]); c = Math.max(c, pl[i]); b = Math.min(b, pl[i + 1]); d = Math.max(d, pl[i + 1]); }
    return [a, b, c, d];
  };

  // Illustrator's "expand stroke" can leave a line as dozens of tiny quads, one per stroke segment.
  // Turn each quad back into its centre segment and chain the segments into polylines, so a blade
  // reads as one clean line instead of a ragged double edge.
  function unstroke(polys) {
    const small = polys.filter((pl) => pl.length <= 20);
    if (polys.length < 12 || small.length < polys.length * 0.7) return polys;
    const segs = [];
    for (const pl of polys) {
      if (pl.length > 20) { segs.push(null); continue; }
      let mx = 0, my = 0; const n = pl.length / 2;
      for (let i = 0; i < pl.length; i += 2) { mx += pl[i] / n; my += pl[i + 1] / n; }
      let sxx = 0, syy = 0, sxy = 0;
      for (let i = 0; i < pl.length; i += 2) { const dx = pl[i] - mx, dy = pl[i + 1] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
      const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(ang), uy = Math.sin(ang);
      let lo = 1e9, hi = -1e9;
      for (let i = 0; i < pl.length; i += 2) { const t = (pl[i] - mx) * ux + (pl[i + 1] - my) * uy; lo = Math.min(lo, t); hi = Math.max(hi, t); }
      segs.push([mx + ux * lo, my + uy * lo, mx + ux * hi, my + uy * hi]);
    }
    const out = polys.filter((pl) => pl.length > 20), open = segs.filter(Boolean), tol = 2.5;
    const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;
    while (open.length) {
      const s0 = open.pop(); let line = [[s0[0], s0[1]], [s0[2], s0[3]]], grew = true;
      while (grew) {
        grew = false;
        for (let i = 0; i < open.length; i++) {
          const q = open[i], A = [q[0], q[1]], B = [q[2], q[3]], head = line[0], tail = line[line.length - 1];
          if (near(tail, A)) line.push(B); else if (near(tail, B)) line.push(A); else if (near(head, B)) line.unshift(A); else if (near(head, A)) line.unshift(B); else continue;
          open.splice(i, 1); grew = true; break;
        }
      }
      out.push(line.flat());
    }
    return out;
  }

  function parse(text, flattenD) {
    const paths = [...text.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)].map((m) => flattenD(m[1], 8).filter((pl) => {
      const [a, b, c, d] = bbOf([pl]); return Math.max(c - a, d - b) > 2;     // drop the slivers an expanded stroke leaves
    }));
    const vb = (/viewBox="([^"]+)"/.exec(text) || [0, "0 0 442 410"])[1].split(/[\s,]+/).map(Number), axis = vb[0] + vb[2] / 2;
    const groups = { body: [], front: [], back: [], pod: [] };
    for (const polys of paths) {
      if (!polys.length) continue;
      const [x0, y0, x1, y1] = bbOf(polys), w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, left = cx < axis;
      const g = h > 120 && h > w * 1.8 ? "front" : w > 90 && w > h * 1.2 && (x1 < axis - 60 || x0 > axis + 60) ? "back"
        : w < 60 && h < 60 && Math.abs(cx - axis) > 50 ? "pod" : "body";
      if (g === "body" || left) groups[g].push(...(g === "front" || g === "back" ? unstroke(polys) : polys));
    }
    // into sheet coordinates: the mirror axis at x = 200
    const dx = AXIS - axis, shift = (polys) => polys.map((pl) => pl.map((v, i) => (i % 2 ? v : v + dx)));
    const piece = (polys) => { const [a, b, c, d] = bbOf(polys.length ? polys : [[0, 0]]); return { polys, w: c - a, h: d - b, cx: (a + c) / 2, cy: (b + d) / 2 }; };
    const out = { axis: AXIS };
    for (const k of SLOTS) out[k] = piece(shift(groups[k]));
    // the blade ends: the front blade joins at its top, the back blade at its inner (right-hand) end
    const ends = (polys, key) => { let J = null, T = null; for (const pl of polys) for (let i = 0; i < pl.length; i += 2) { const q = [pl[i], pl[i + 1]]; if (!J || key(q) < key(J)) J = q; if (!T || key(q) > key(T)) T = q; } return { J, T }; };
    Object.assign(out.front, ends(out.front.polys, (q) => q[1]));
    Object.assign(out.back, ends(out.back.polys, (q) => -q[0]));
    return out;
  }

  // your pieces as parts: polylines around their own centre, so they place like kit parts
  function handParts(P) {
    const names = { body: "Your body", pod: "Your pod", front: "Your front blade", back: "Your back blade" };
    const out = {};
    for (const k of SLOTS) {
      const pc = P[k], d = pc.polys.map((pl) => { let s = ""; for (let i = 0; i + 1 < pl.length; i += 2) s += (i ? " L" : "M") + (pl[i] - pc.cx).toFixed(1) + " " + (pl[i + 1] - pc.cy).toFixed(1); return s; }).join(" ");
      out["HB-" + k] = { id: "HB-" + k, name: names[k], species: "hand", side: k === "body" ? "center" : "left", w: +pc.w.toFixed(1), h: +pc.h.toFixed(1), defs: "",
        svg: `<path d="${d}" fill="none" stroke="#5fd38d" stroke-linejoin="round" stroke-linecap="round"/>` };
    }
    return out;
  }

  function build(byId, picks, P, along) {
    const out = [], id = (k) => (picks && picks[k]) || "HB-" + k;
    const put = (k, extra) => out.push({ part: id(k), side: k === "body" ? "c" : "l", role: "cell", cell: k, slot: k, rot: 0, ...extra });
    const fit = (k) => {
      const pc = P[k], p = byId[id(k)];
      if (!p || id(k) === "HB-" + k) return put(k, { x: pc.cx, y: pc.cy, scale: 1 });
      if ((k === "front" || k === "back") && along) return put(k, along(p, pc.J, pc.T, false));
      // body: as wide as yours; pod: as big as yours
      const s = k === "body" ? pc.w / Math.max(1, p.w) : Math.max(pc.w, pc.h) / Math.max(1, p.w, p.h);
      put(k, { x: pc.cx, y: pc.cy, scale: s });
    };
    fit("back"); fit("body"); fit("front"); fit("pod");
    return out;
  }

  // the parts each slot may take: one source for every page (shared/engine/mech/mech-slots.js)
  const pools = (curated, parts) => window.MechSlots.pools(SLOTS, parts, curated);

  window.BladeMech = { SLOTS, parse, handParts, build, pools };
})();
