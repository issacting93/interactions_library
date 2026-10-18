import { useState, useMemo, useCallback } from "react";

/* ============================================================
   SCI-FI ASSET FOUNDRY
   Vector asset generator. Every asset is built as an element
   descriptor list -> rendered to JSX and serialised to SVG,
   so what you see is exactly what exports.
   ============================================================ */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rr = (r, a, b) => a + r() * (b - a);
const ri = (r, a, b) => Math.floor(rr(r, a, b + 1));
const pk = (r, arr) => arr[Math.floor(r() * arr.length)];
const chance = (r, p) => r() < p;

/* ---------------- palettes ---------------- */
const PALETTES = [
  { id: "acid",     name: "ACID",     bg: "#F2E600", ink: "#0A0A0A", accent: "#F0439C", dim: "#B8AE00" },
  { id: "marathon", name: "MARATHON", bg: "#C6F53E", ink: "#0A0A0A", accent: "#FF3B3B", dim: "#9BC22E" },
  { id: "eborza",   name: "EBORZA",   bg: "#E8221E", ink: "#FFFFFF", accent: "#FFFFFF", dim: "#B01715" },
  { id: "d350",     name: "D350",     bg: "#C9DBC6", ink: "#20241F", accent: "#F4622B", dim: "#8EA38A" },
  { id: "void",     name: "VOID",     bg: "#0B0B0C", ink: "#EDEDED", accent: "#00E5A0", dim: "#3A3A3E" },
  { id: "blueprint",name: "BLUEPRINT",bg: "#F5F5F3", ink: "#141414", accent: "#2B5BF4", dim: "#B4B4B0" },
];

/* ---------------- element helpers ---------------- */
const el = {
  r: (x, y, w, h, o = {}) => ({ t: "rect", x, y, w, h, ...o }),
  p: (d, o = {}) => ({ t: "path", d, ...o }),
  c: (cx, cy, r, o = {}) => ({ t: "circle", cx, cy, r, ...o }),
  l: (x1, y1, x2, y2, o = {}) => ({ t: "line", x1, y1, x2, y2, ...o }),
  t: (x, y, s, o = {}) => ({ t: "text", x, y, s, ...o }),
};
const n = (v) => Math.round(v * 100) / 100;

/* ---------------- geometry: parallel bundle routing ---------------- */
function lineIntersect(a1, a2, b1, b2) {
  const d = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
  if (Math.abs(d) < 1e-6) return { x: a2.x, y: a2.y };
  const u = ((b1.x - a1.x) * (b2.y - b1.y) - (b1.y - a1.y) * (b2.x - b1.x)) / d;
  return { x: a1.x + u * (a2.x - a1.x), y: a1.y + u * (a2.y - a1.y) };
}
function offsetPolyline(pts, off) {
  if (pts.length < 2) return pts;
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i], q = pts[i + 1];
    const dx = q.x - p.x, dy = q.y - p.y;
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    segs.push([{ x: p.x + nx * off, y: p.y + ny * off }, { x: q.x + nx * off, y: q.y + ny * off }]);
  }
  const out = [segs[0][0]];
  for (let i = 0; i < segs.length - 1; i++) {
    out.push(lineIntersect(segs[i][0], segs[i][1], segs[i + 1][0], segs[i + 1][1]));
  }
  out.push(segs[segs.length - 1][1]);
  return out;
}
const DIRS8 = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
function routePath(rng, start, dirIdx, steps, W, H, minLen, maxLen) {
  const pts = [{ ...start }];
  let d = dirIdx, cur = { ...start };
  for (let i = 0; i < steps; i++) {
    const [dx, dy] = DIRS8[d];
    const L = rr(rng, minLen, maxLen) / (Math.abs(dx) + Math.abs(dy) > 1 ? 1.414 : 1);
    let nx = cur.x + dx * L, ny = cur.y + dy * L;
    nx = Math.max(-40, Math.min(W + 40, nx));
    ny = Math.max(-40, Math.min(H + 40, ny));
    cur = { x: nx, y: ny };
    pts.push({ ...cur });
    d = (d + (chance(rng, 0.5) ? 1 : -1) * (chance(rng, 0.55) ? 1 : 2) + 8) % 8;
  }
  return pts;
}
const dOf = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${n(p.x)} ${n(p.y)}`).join(" ");

/* ---------------- micro copy ---------------- */
const CODE_A = "ABCDEFGHJKLMNPRSTVWXYZ";
const code = (rng, len = 6) => Array.from({ length: len }, () => chance(rng, 0.45) ? CODE_A[ri(rng, 0, CODE_A.length - 1)] : String(ri(rng, 0, 9))).join("");
const coordStr = (rng) => `${(rr(rng, 0, 90)).toFixed(4)}N ${(rr(rng, 0, 180)).toFixed(4)}E`;
const partNo = (rng) => `${CODE_A[ri(rng,0,21)]}${CODE_A[ri(rng,0,21)]}-${ri(rng,100,999)}${CODE_A[ri(rng,0,21)]}`;
const LABELS = ["SYS","NAV","PWR","THM","OPT","SIG","AUX","CTL","LNK","BUS","DEC","REF","IDX","CAL","SNC"];

/* ============================================================
   ASSET GENERATORS
   Each returns { w, h, els }
   ============================================================ */

/* 1 — TRACE : routed parallel bus, single flow system */
function genTrace(rng, C) {
  const W = 480, H = 360, els = [];
  const sgn = chance(rng, 0.5) ? 1 : -1;          // one diagonal direction for the whole asset
  const bundles = ri(rng, 3, 4 + Math.round(C * 2));
  const turnBand = rr(rng, H * 0.3, H * 0.55);     // shared turn zone = coherence
  const laneW = (W * 0.7) / bundles;
  const originX = rr(rng, W * 0.05, W * 0.22);
  let densest = { x: 0, y: 0, k: 0 };
  for (let b = 0; b < bundles; b++) {
    const x0 = originX + b * laneW + rr(rng, -6, 6);
    const yTurn = turnBand + b * rr(rng, 8, 20);   // stepped turns, like traces clearing each other
    const diag = rr(rng, 50, 130);
    const pts = [
      { x: x0, y: -20 },
      { x: x0, y: yTurn },
      { x: x0 + diag * sgn, y: yTurn + diag },
    ];
    if (chance(rng, 0.6)) pts.push({ x: x0 + diag * sgn, y: H * rr(rng, 0.85, 1.06) });
    const k = ri(rng, 3, 4 + Math.round(C * 6));
    const sp = rr(rng, 3, 4.5);
    if (k > densest.k) densest = { x: pts[1].x, y: pts[1].y, k };
    for (let i = 0; i < k; i++) {
      const off = (i - (k - 1) / 2) * sp;
      const op = offsetPolyline(pts, off);
      const cut = chance(rng, 0.18) ? op.length - 1 : op.length;
      els.push(el.p(dOf(op.slice(0, cut)), { stroke: "ink", sw: rr(rng, 0.8, 1.3), fill: "none" }));
      if (cut < op.length) {
        const e2 = op[cut - 1];
        els.push(el.r(e2.x - 2, e2.y - 2, 4, 4, { fill: "ink" }));  // terminated line gets a pad
      }
    }
    // aligned terminal pad at bundle end
    const tail = pts[pts.length - 1], prev = pts[pts.length - 2];
    const ang = Math.atan2(tail.y - prev.y, tail.x - prev.x);
    const pw = k * sp + 6;
    els.push(el.r(-pw / 2, -5, pw, 10, {
      fill: chance(rng, 0.4) ? "ink" : "none", stroke: "ink", sw: 1.2,
      tr: `translate(${n(tail.x)} ${n(tail.y)}) rotate(${n((ang * 180) / Math.PI + 90)})`,
    }));
    // via at the turn only
    if (chance(rng, 0.5)) els.push(el.c(pts[1].x, pts[1].y - k * sp * 0.5 - 6, 3, { fill: "none", stroke: "ink", sw: 1.1 }));
  }
  // one detail cluster at the densest turn — complexity concentrates, rest stays empty
  const dc = densest;
  for (let i = 0; i < 4; i++) {
    els.push(el.r(dc.x + sgn * rr(rng, 14, 60), dc.y + rr(rng, -30, 10), rr(rng, 5, 16), rr(rng, 3, 8),
      { fill: i === 0 ? "accent" : "ink" }));
  }
  for (let i = 0; i < 3; i++) {
    const yy = dc.y - 40 - i * 6;
    els.push(el.l(dc.x - 24, yy, dc.x + 24, yy, { stroke: "ink", sw: 0.8, dash: i === 1 ? "2 3" : undefined }));
  }
  els.push(el.t(dc.x + sgn * 30, dc.y + 34, code(rng, 5), { fill: "ink", fs: 8, mono: true, anchor: sgn > 0 ? "start" : "end" }));
  return { w: W, h: H, els };
}

/* 2 — PANEL : notched HUD data module */
function genPanel(rng, C) {
  const W = 400, H = 280, els = [];
  const notch = rr(rng, 14, 26);
  const x = 10, y = 10, w = W - 20, h = H - 20;
  els.push(el.p(
    `M${x + notch} ${y} L${x + w} ${y} L${x + w} ${y + h - notch} L${x + w - notch} ${y + h} L${x} ${y + h} L${x} ${y + notch} Z`,
    { fill: "none", stroke: "ink", sw: 2 }
  ));
  // header
  const hh = 26;
  els.push(el.p(`M${x + notch} ${y} L${x + w} ${y} L${x + w} ${y + hh} L${x} ${y + hh} L${x} ${y + notch} Z`, { fill: "ink" }));
  els.push(el.t(x + 12, y + 18, `${pk(rng, LABELS)}//${code(rng, 4)}`, { fill: "bg", fs: 13, mono: true, weight: 700 }));
  els.push(el.t(x + w - 12, y + 18, `${ri(rng, 10, 99)}`, { fill: "bg", fs: 13, mono: true, anchor: "end", weight: 700 }));

  // big numeral
  if (chance(rng, 0.75)) {
    els.push(el.t(x + 14, y + hh + 66, `${ri(rng, 10, 99)}`, { fill: "accent", fs: 62, weight: 900 }));
    els.push(el.t(x + 14, y + hh + 84, pk(rng, ["ACTIVE ORBITS", "SIGNAL ROUTE", "FREIGHT LOCK", "CYCLE INDEX"]), { fill: "ink", fs: 9, mono: true }));
  }
  // bar rows: label / track / value on a shared grid
  const rows = ri(rng, 4, 6);
  const bx = x + w * 0.5, bw2 = w * 0.5 - 14;
  const lab = 30, valW = 26;
  for (let i = 0; i < rows; i++) {
    const by = y + hh + 18 + i * 17;
    const v = rr(rng, 0.08, 0.98);
    els.push(el.t(bx, by + 6, pk(rng, LABELS), { fill: "ink", fs: 8, mono: true }));
    els.push(el.r(bx + lab, by, bw2 - lab - valW, 7, { fill: "none", stroke: "ink", sw: 0.9 }));
    els.push(el.r(bx + lab, by, (bw2 - lab - valW) * v, 7, { fill: i === 1 ? "accent" : "ink" }));
    els.push(el.t(bx + bw2, by + 6, String(Math.round(v * 100)).padStart(3, "0"), { fill: "ink", fs: 8, mono: true, anchor: "end" }));
  }
  // footer rule + microtype
  els.push(el.l(x + 12, y + h - 34, x + w - 12, y + h - 34, { stroke: "ink", sw: 1 }));
  els.push(el.t(x + 12, y + h - 20, partNo(rng), { fill: "ink", fs: 9, mono: true }));
  els.push(el.t(x + w - 30, y + h - 20, code(rng, 8), { fill: "ink", fs: 9, mono: true, anchor: "end" }));
  // indicator squares
  for (let i = 0; i < 4; i++) {
    els.push(el.r(x + 12 + i * 11, y + hh + 100, 7, 7, { fill: chance(rng, 0.4) ? "accent" : "none", stroke: "ink", sw: 1 }));
  }
  return { w: W, h: H, els };
}

/* 3 — RETICLE : targeting construction */
function genReticle(rng, C) {
  const S = 340, cx = S / 2, cy = S / 2, els = [];
  const R = S * 0.38;
  els.push(el.c(cx, cy, R, { fill: "none", stroke: "ink", sw: 1.6 }));
  // gapped inner ring
  const gaps = ri(rng, 3, 6);
  for (let i = 0; i < gaps; i++) {
    const a0 = (i / gaps) * Math.PI * 2 + rr(rng, 0.05, 0.2);
    const a1 = a0 + (Math.PI * 2) / gaps - rr(rng, 0.2, 0.5);
    const r2 = R * 0.72;
    els.push(el.p(
      `M${n(cx + Math.cos(a0) * r2)} ${n(cy + Math.sin(a0) * r2)} A${n(r2)} ${n(r2)} 0 0 1 ${n(cx + Math.cos(a1) * r2)} ${n(cy + Math.sin(a1) * r2)}`,
      { fill: "none", stroke: "ink", sw: 4 }
    ));
  }
  // tick array
  const ticks = ri(rng, 24, 60);
  for (let i = 0; i < ticks; i++) {
    const a = (i / ticks) * Math.PI * 2;
    const long = i % 5 === 0;
    const r1 = R + 4, r2 = R + (long ? 14 : 7);
    els.push(el.l(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, cx + Math.cos(a) * r2, cy + Math.sin(a) * r2,
      { stroke: "ink", sw: long ? 1.6 : 0.8 }));
  }
  // crosshair with center gap
  const g = R * 0.18, ex = R * 1.35;
  [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx, dy]) =>
    els.push(el.l(cx + dx * g, cy + dy * g, cx + dx * ex, cy + dy * ex, { stroke: "ink", sw: 1.4 })));
  els.push(el.c(cx, cy, rr(rng, 3, 7), { fill: "accent" }));
  // corner brackets
  const b = S * 0.44, L = 22;
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx, sy]) => {
    els.push(el.p(`M${n(cx + sx * b - sx * L)} ${n(cy + sy * b)} L${n(cx + sx * b)} ${n(cy + sy * b)} L${n(cx + sx * b)} ${n(cy + sy * b - sy * L)}`,
      { fill: "none", stroke: "accent", sw: 2.4 }));
  });
  // labels
  els.push(el.t(cx + R * 0.78, cy - R * 0.78, code(rng, 5), { fill: "ink", fs: 10, mono: true }));
  els.push(el.t(cx - R * 1.3, cy + R * 1.05, `LOCK ${ri(rng, 10, 99)}.${ri(rng, 100, 999)}`, { fill: "ink", fs: 10, mono: true }));
  // range arcs
  if (chance(rng, 0.6)) {
    for (let i = 1; i <= 2; i++) {
      const a0 = rr(rng, 0, 6);
      els.push(el.p(`M${n(cx + Math.cos(a0) * (R + 22 + i * 10))} ${n(cy + Math.sin(a0) * (R + 22 + i * 10))} A${n(R + 22 + i * 10)} ${n(R + 22 + i * 10)} 0 0 1 ${n(cx + Math.cos(a0 + 1.1) * (R + 22 + i * 10))} ${n(cy + Math.sin(a0 + 1.1) * (R + 22 + i * 10))}`,
        { fill: "none", stroke: "ink", sw: 1.2 }));
    }
  }
  return { w: S, h: S, els };
}

/* 4 — HAZARD : striped warning block */
function genHazard(rng, C) {
  const W = 460, H = 150, els = [];
  const notch = 18;
  const x = 8, y = 8, w = W - 16, h = H - 16;
  const clipId = `hz${Math.floor(rng() * 1e6)}`;
  const shape = `M${x + notch} ${y} L${x + w} ${y} L${x + w} ${y + h - notch} L${x + w - notch} ${y + h} L${x} ${y + h} L${x} ${y + notch} Z`;
  els.push({ t: "clip", id: clipId, d: shape });
  // stripes
  const sw = rr(rng, 12, 26), gap = sw * rr(rng, 0.8, 1.3);
  for (let i = -h; i < w + h; i += sw + gap) {
    els.push(el.p(`M${n(x + i)} ${n(y + h)} L${n(x + i + h)} ${n(y)} L${n(x + i + h + sw)} ${n(y)} L${n(x + i + sw)} ${n(y + h)} Z`,
      { fill: "ink", clip: clipId }));
  }
  els.push(el.p(shape, { fill: "none", stroke: "ink", sw: 2.5 }));
  // label plate
  const pw = w * rr(rng, 0.42, 0.6), ph = 44;
  const px = x + (w - pw) / 2, py = y + (h - ph) / 2;
  els.push(el.r(px, py, pw, ph, { fill: "bg", stroke: "ink", sw: 2 }));
  els.push(el.t(px + pw / 2, py + 22, pk(rng, ["HAZARD", "RESTRICTED", "NO ENTRY", "HIGH VOLTAGE", "CAUTION"]),
    { fill: "ink", fs: 18, weight: 900, anchor: "middle" }));
  els.push(el.t(px + pw / 2, py + 36, `${partNo(rng)} / ZONE ${ri(rng, 1, 9)}`, { fill: "ink", fs: 9, mono: true, anchor: "middle" }));
  return { w: W, h: H, els };
}

/* 5 — LATTICE : hex mesh, clustered fill falloff */
function genLattice(rng, C) {
  const W = 400, H = 360, els = [];
  const fm = 16;
  const cid = `lt${Math.floor(rng() * 1e6)}`;
  els.push({ t: "clip", id: cid, d: `M${fm} ${fm} L${W - fm} ${fm} L${W - fm} ${H - fm} L${fm} ${H - fm} Z` });
  const R = rr(rng, 20, 30);
  const hw = Math.sqrt(3) * R, vh = 1.5 * R;
  const fx = rr(rng, W * 0.3, W * 0.7), fy = rr(rng, H * 0.3, H * 0.7);   // focal point
  const hex = (cx, cy) => Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${n(cx + R * Math.cos(a))} ${n(cy + R * Math.sin(a))}`;
  }).join(" L");
  for (let row = 0; row * vh < H + R; row++) {
    for (let col = 0; col * hw < W + hw; col++) {
      const cx = col * hw + (row % 2 ? hw / 2 : 0);
      const cy = row * vh;
      const d = Math.hypot(cx - fx, cy - fy);
      const p = Math.max(0, 1 - d / (W * 0.55));   // density falls off from focal point
      if (rng() > 0.15 + p * 0.85) continue;
      const roll = rng();
      const fill = roll < p * 0.4 ? (roll < p * 0.09 ? "accent" : "ink") : "none";
      els.push(el.p(`M${hex(cx, cy)} Z`, { fill, stroke: "ink", sw: fill === "none" ? 1 : 0, clip: cid }));
    }
  }
  els.push(el.r(fm, fm, W - fm * 2, H - fm * 2, { fill: "none", stroke: "ink", sw: 1.4 }));
  els.push(el.t(fm + 6, fm + 16, "CELL//" + code(rng, 4), { fill: "ink", fs: 9, mono: true }));
  return { w: W, h: H, els };
}

/* 6 — MATRIX : partitioned data grid */
function genMatrix(rng, C) {
  const W = 360, H = 300, els = [];
  // 3×3 partition; each chosen cell owns its region — overlap impossible
  const cw = W / 3, chh = H / 3, m = 12;
  const cells = [0,1,2,3,4,5,6,7,8].filter(() => chance(rng, 0.55 + C * 0.2));
  const accentCell = pk(rng, cells.length ? cells : [4]);
  cells.forEach((ci) => {
    const gx = (ci % 3) * cw + m, gy = Math.floor(ci / 3) * chh + m;
    const aw = cw - m * 2, ah = chh - m * 2;
    const kind = ri(rng, 0, 2);
    if (kind === 0) {
      // dot/square block filling its cell
      const s = rr(rng, 7, 11);
      const cols = Math.floor(aw / s), rows2 = Math.floor(ah / s);
      const dens = rr(rng, 0.5, 0.95);
      const square = chance(rng, 0.5);
      for (let r = 0; r < rows2; r++) for (let c = 0; c < cols; c++) {
        if (rng() > dens) continue;
        const col = ci === accentCell && chance(rng, 0.2) ? "accent" : "ink";
        if (square) els.push(el.r(gx + c * s, gy + r * s, s * 0.6, s * 0.6, { fill: col }));
        else els.push(el.c(gx + c * s + s * 0.3, gy + r * s + s * 0.3, s * 0.2, { fill: col }));
      }
    } else if (kind === 1) {
      // code column
      const lines = Math.floor(ah / 13);
      for (let j = 0; j < lines; j++) {
        els.push(el.t(gx, gy + 10 + j * 13, code(rng, ri(rng, 3, 6)),
          { fill: ci === accentCell && j === 0 ? "accent" : "ink", fs: 10, mono: true }));
      }
    } else {
      // ruled block
      const lines = Math.floor(ah / 10);
      for (let j = 0; j < lines; j++) {
        els.push(el.l(gx, gy + j * 10, gx + aw * rr(rng, 0.4, 1), gy + j * 10, { stroke: "ink", sw: 1.1 }));
      }
    }
  });
  return { w: W, h: H, els };
}

/* 7 — BARCHART : axis-true column chart (D350 register) */
function genBarchart(rng, C) {
  const W = 460, H = 330, els = [];
  const mL = 44, mR = 150, mT = 26, mB = 66;
  const px = mL, py = mT, pw = W - mL - mR, ph = H - mT - mB;
  // data: bounded random walk, one highlighted peak
  const k = ri(rng, 7, 10);
  let v = rr(rng, 40, 90);
  const data = [];
  for (let i = 0; i < k; i++) {
    v = Math.max(12, Math.min(148, v + rr(rng, -34, 34)));
    data.push(v);
  }
  const hi = data.indexOf(Math.max(...data));
  const maxV = 150;
  // gridlines + y labels
  for (let g = 0; g <= 3; g++) {
    const gv = (maxV / 3) * g;
    const y = py + ph - (gv / maxV) * ph;
    els.push(el.l(px, y, px + pw, y, { stroke: "ink", sw: g === 0 ? 1.6 : 0.5, op: g === 0 ? 1 : 0.4 }));
    els.push(el.t(px - 6, y + 3, String(Math.round(gv)), { fill: "ink", fs: 8, mono: true, anchor: "end" }));
  }
  els.push(el.l(px, py, px, py + ph, { stroke: "ink", sw: 1.2 }));
  // bars on strict pitch, shared baseline
  const pitch = pw / k, bw = pitch * 0.52;
  const NAMES = ["EARTH","PLUTO","MARS","SATURN","URANUS","MERCURY","TITAN","VENUS","EUROPA","IO","CERES"];
  for (let i = 0; i < k; i++) {
    const bx = px + i * pitch + (pitch - bw) / 2;
    const bh = (data[i] / maxV) * ph;
    els.push(el.r(bx, py + ph - bh, bw, bh, { fill: i === hi ? "accent" : "ink" }));
    els.push({ t: "text", x: 0, y: 0, s: NAMES[i % NAMES.length], fill: "ink", fs: 8, mono: true, anchor: "end",
      tr: `translate(${n(bx + bw / 2 + 3)} ${n(py + ph + 8)}) rotate(-90)` });
  }
  // title / stat block right
  const tx = px + pw + 18;
  els.push(el.t(tx, py + 10, "TELEMETRY", { fill: "ink", fs: 11, weight: 900 }));
  els.push(el.t(tx, py + 24, "RESULTS//" + code(rng, 4), { fill: "ink", fs: 8, mono: true }));
  els.push(el.t(tx, py + 78, String(Math.round((data[hi] / maxV) * 100)) + "%", { fill: "ink", fs: 40, weight: 900 }));
  els.push(el.t(tx, py + 92, "PEAK RATE", { fill: "ink", fs: 8, mono: true }));
  els.push(el.l(tx, py + 104, tx + mR - 40, py + 104, { stroke: "ink", sw: 1 }));
  const stats = [["MISSIONS", ri(rng, 40, 99) + "+"], ["ORBITS", String(ri(rng, 10, 60))], ["SIGNALS", ri(rng, 10, 80) + "K"]];
  stats.forEach(([l, s2], i) => {
    els.push(el.t(tx, py + 124 + i * 34, l, { fill: "ink", fs: 8, mono: true }));
    els.push(el.t(tx, py + 140 + i * 34, s2, { fill: i === 0 ? "accent" : "ink", fs: 17, weight: 900 }));
  });
  return { w: W, h: H, els };
}

/* 7b — SERIES : plotted telemetry line */
function genSeries(rng, C) {
  const W = 460, H = 300, els = [];
  const mL = 40, mR = 20, mT = 30, mB = 40;
  const px = mL, py = mT, pw = W - mL - mR, ph = H - mT - mB;
  const gx = 8, gy = 4;
  for (let i = 0; i <= gx; i++) {
    const x = px + (pw / gx) * i;
    els.push(el.l(x, py, x, py + ph, { stroke: "ink", sw: 0.5, op: 0.35 }));
    els.push(el.t(x, py + ph + 14, "T" + String(i * 3).padStart(2, "0"), { fill: "ink", fs: 8, mono: true, anchor: "middle" }));
  }
  for (let i = 0; i <= gy; i++) {
    const y = py + (ph / gy) * i;
    els.push(el.l(px, y, px + pw, y, { stroke: "ink", sw: i === gy ? 1.4 : 0.5, op: i === gy ? 1 : 0.35 }));
    els.push(el.t(px - 6, y + 3, String((gy - i) * 25), { fill: "ink", fs: 8, mono: true, anchor: "end" }));
  }
  // series: sum of sines + drift — coherent, band-limited
  const Nn = 48;
  const ph1 = rr(rng, 0, 6), ph2 = rr(rng, 0, 6), drift = rr(rng, -0.15, 0.15);
  const pts = [];
  for (let i = 0; i <= Nn; i++) {
    const t = i / Nn;
    let yv = 0.5 + 0.22 * Math.sin(t * 7 + ph1) + 0.12 * Math.sin(t * 17 + ph2) + drift * (t - 0.5) * 2;
    yv = Math.max(0.05, Math.min(0.95, yv));
    pts.push({ x: px + t * pw, y: py + ph - yv * ph });
  }
  els.push(el.p(dOf(pts), { fill: "none", stroke: "ink", sw: 1.8 }));
  for (let i = 0; i <= Nn; i += 6) els.push(el.c(pts[i].x, pts[i].y, 2.2, { fill: "ink" }));
  // threshold line
  const th = rr(rng, 0.6, 0.85);
  const ty = py + ph - th * ph;
  els.push(el.l(px, ty, px + pw, ty, { stroke: "accent", sw: 1.2, dash: "5 4" }));
  els.push(el.t(px + pw, ty - 5, "LIMIT " + Math.round(th * 100), { fill: "accent", fs: 8, mono: true, anchor: "end" }));
  // last-point highlight + leader
  const lp = pts[Nn];
  els.push(el.c(lp.x, lp.y, 4, { fill: "accent" }));
  els.push(el.c(lp.x, lp.y, 8, { fill: "none", stroke: "accent", sw: 1 }));
  const vy = Math.round((1 - (lp.y - py) / ph) * 100);
  els.push(el.p(`M${n(lp.x)} ${n(lp.y)} L${n(lp.x - 26)} ${n(lp.y - 26)} L${n(lp.x - 78)} ${n(lp.y - 26)}`, { fill: "none", stroke: "ink", sw: 1 }));
  els.push(el.t(lp.x - 78, lp.y - 31, "NOW " + vy, { fill: "ink", fs: 9, mono: true }));
  els.push(el.t(px, 16, "SIGNAL//" + code(rng, 4), { fill: "ink", fs: 10, mono: true, weight: 700 }));
  els.push(el.t(px + pw, 16, "SR-" + ri(rng, 100, 999), { fill: "ink", fs: 10, mono: true, anchor: "end" }));
  return { w: W, h: H, els };
}

/* 7c — PHASE : mission timeline register */
function genPhase(rng, C) {
  const W = 480, H = 250, els = [];
  const px = 24, pw = W - 48;
  const split = rr(rng, 0.42, 0.6);
  els.push(el.t(px, 26, "PHASE 1: " + pk(rng, ["RECON SURVEY", "ORBITAL ENTRY", "SIGNAL SWEEP"]), { fill: "accent", fs: 10, mono: true, weight: 700 }));
  els.push(el.t(px + pw * split + 10, 26, "PHASE 2: " + pk(rng, ["DEPLOYMENT", "BASE ACTIVATION", "EXTRACTION"]), { fill: "ink", fs: 10, mono: true, weight: 700 }));
  els.push(el.r(px, 34, pw * split, 5, { fill: "accent" }));
  els.push(el.r(px + pw * split + 4, 34, pw * (1 - split) - 4, 5, { fill: "dim" }));
  const nt = 9;
  for (let i = 0; i < nt; i++) {
    const x = px + (pw / (nt - 1)) * i;
    els.push(el.l(x, 44, x, 50, { stroke: "ink", sw: 1 }));
    els.push(el.t(x, 62, String(i + 1).padStart(2, "0"), { fill: "ink", fs: 8, mono: true, anchor: "middle" }));
  }
  // event blocks on shared row: filled / hatched / pending outline
  const kb = ri(rng, 5, 6);
  const bs = 44, gap2 = (pw - kb * bs) / (kb - 1);
  const names = ["ORBITAL SURVEY", "LANDING ZONE", "SITE ASSESSMENT", "SURFACE RECON", "CARGO DELIVERY", "BASE ACTIVATION"];
  for (let i = 0; i < kb; i++) {
    const bx2 = px + i * (bs + gap2), by2 = 74;
    if (i / kb < split) {
      if (chance(rng, 0.3)) {
        const cid = `ph${Math.floor(rng() * 1e6)}`;
        els.push({ t: "clip", id: cid, d: `M${n(bx2)} ${n(by2)} L${n(bx2 + bs)} ${n(by2)} L${n(bx2 + bs)} ${n(by2 + bs)} L${n(bx2)} ${n(by2 + bs)} Z` });
        for (let t = -bs; t < bs; t += 7) {
          els.push(el.l(bx2 + t, by2 + bs, bx2 + t + bs, by2, { stroke: "accent", sw: 1, clip: cid }));
        }
        els.push(el.r(bx2, by2, bs, bs, { fill: "none", stroke: "accent", sw: 1.6 }));
      } else {
        els.push(el.r(bx2, by2, bs, bs, { fill: "accent" }));
      }
    } else {
      els.push(el.r(bx2, by2, bs, bs, { fill: "none", stroke: "ink", sw: 1.6 }));
    }
    const depth = 140 + (i % 3) * 26;
    els.push(el.l(bx2 + bs / 2, by2 + bs, bx2 + bs / 2, depth - 8, { stroke: "ink", sw: 0.9, dash: "3 3" }));
    els.push(el.c(bx2 + bs / 2, depth - 6, 1.8, { fill: "ink" }));
    const flip = bx2 > W * 0.62;
    els.push(el.t(bx2 + bs / 2 + (flip ? -5 : 5), depth, names[i % names.length],
      { fill: i / kb < split ? "accent" : "ink", fs: 8, mono: true, anchor: flip ? "end" : "start" }));
  }
  els.push(el.l(px, H - 18, px + pw, H - 18, { stroke: "ink", sw: 1 }));
  els.push(el.t(px, H - 6, "MISSION " + code(rng, 5), { fill: "ink", fs: 8, mono: true }));
  els.push(el.t(px + pw, H - 6, "SEPT 2O35", { fill: "ink", fs: 8, mono: true, anchor: "end" }));
  return { w: W, h: H, els };
}

/* 7d — GAUGE : arc meter with labeled scale + channel column */
function genGauge(rng, C) {
  const W = 380, H = 280, els = [];
  const cx = W * 0.34, cy = H * 0.60, R = 92;
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  const arc = (r, from, to, o) => el.p(
    `M${n(cx + Math.cos(from) * r)} ${n(cy + Math.sin(from) * r)} A${n(r)} ${n(r)} 0 ${to - from > Math.PI ? 1 : 0} 1 ${n(cx + Math.cos(to) * r)} ${n(cy + Math.sin(to) * r)}`,
    { fill: "none", ...o });
  els.push(arc(R, a0, a1, { stroke: "dim", sw: 8 }));
  const val = rr(rng, 0.25, 0.9);
  els.push(arc(R, a0, a0 + (a1 - a0) * val, { stroke: "accent", sw: 8 }));
  for (let i = 0; i <= 20; i++) {
    const f = i / 20;
    const a = a0 + (a1 - a0) * f;
    const major = i % 5 === 0;
    els.push(el.l(cx + Math.cos(a) * (R + 8), cy + Math.sin(a) * (R + 8),
      cx + Math.cos(a) * (R + (major ? 18 : 12)), cy + Math.sin(a) * (R + (major ? 18 : 12)),
      { stroke: "ink", sw: major ? 1.6 : 0.8 }));
    if (major) {
      els.push(el.t(cx + Math.cos(a) * (R + 30), cy + Math.sin(a) * (R + 30) + 3, String(Math.round(f * 100)),
        { fill: "ink", fs: 9, mono: true, anchor: "middle" }));
    }
  }
  els.push(el.t(cx, cy + 2, String(Math.round(val * 100)), { fill: "ink", fs: 48, weight: 900, anchor: "middle" }));
  els.push(el.t(cx, cy + 20, pk(rng, ["OUTPUT", "LOAD", "DRIFT", "SIGNAL"]), { fill: "ink", fs: 9, mono: true, anchor: "middle" }));
  // channel column: label / value / track on a shared grid
  const rx = W * 0.64, rw = W * 0.30, rows = 5, top = 46, rh = 40;
  els.push(el.t(rx, top - 14, "CHANNELS", { fill: "ink", fs: 9, mono: true, weight: 700 }));
  els.push(el.l(rx, top - 8, rx + rw, top - 8, { stroke: "ink", sw: 1.2 }));
  for (let i = 0; i < rows; i++) {
    const y = top + i * rh;
    const v = rr(rng, 0.1, 1);
    els.push(el.t(rx, y + 9, `${pk(rng, LABELS)}-${String(i).padStart(2, "0")}`, { fill: "ink", fs: 9, mono: true }));
    els.push(el.t(rx + rw, y + 9, String(Math.round(v * 100)).padStart(3, "0"), { fill: "ink", fs: 9, mono: true, anchor: "end" }));
    els.push(el.r(rx, y + 14, rw, 6, { fill: "none", stroke: "ink", sw: 0.8 }));
    els.push(el.r(rx, y + 14, rw * v, 6, { fill: i === 2 ? "accent" : "ink" }));
  }
  return { w: W, h: H, els };
}

/* 8 — CALLOUT : leader annotation, laned labels */
function genCallout(rng, C) {
  const W = 420, H = 300, els = [];
  const nA = ri(rng, 3, 4);
  // anchors: rejection-sampled, min 46px apart, left region only
  const anchors = [];
  let guard = 0;
  while (anchors.length < nA && guard++ < 200) {
    const p = { x: rr(rng, 40, W * 0.5), y: rr(rng, 40, H - 70) };
    if (anchors.every((q) => Math.hypot(p.x - q.x, p.y - q.y) > 46)) anchors.push(p);
  }
  anchors.sort((a, b) => a.y - b.y);
  // labels live in one right-hand column, one lane per anchor — collisions impossible
  const colX = W - 130, laneTop = 34;
  const laneH = Math.min(52, (H - 90) / anchors.length);
  anchors.forEach((p, i) => {
    const ly = laneTop + i * laneH;
    els.push(el.c(p.x, p.y, 3.5, { fill: "accent" }));
    els.push(el.c(p.x, p.y, 8, { fill: "none", stroke: "ink", sw: 1 }));
    // 45° rise to lane, then horizontal into the column
    const rise = Math.abs(ly - p.y);
    const elbowX = p.x + Math.min(rise, 60) * (ly < p.y ? 1 : 1);
    els.push(el.p(`M${n(p.x + 8)} ${n(p.y)} L${n(elbowX + 8)} ${n(ly)} L${n(colX - 8)} ${n(ly)}`,
      { fill: "none", stroke: "ink", sw: 1.2 }));
    els.push(el.t(colX, ly - 3, `${pk(rng, LABELS)}-${ri(rng, 10, 99)}`, { fill: "ink", fs: 11, weight: 700 }));
    els.push(el.t(colX, ly + 10, partNo(rng), { fill: "ink", fs: 8, mono: true }));
    els.push(el.l(colX, ly + 15, W - 20, ly + 15, { stroke: "ink", sw: 0.8 }));
  });
  // one dimension line, clear of everything
  const dy = H - 26;
  els.push(el.l(30, dy, W - 30, dy, { stroke: "ink", sw: 1 }));
  [30, W - 30].forEach((x) => els.push(el.l(x, dy - 6, x, dy + 6, { stroke: "ink", sw: 1.4 })));
  els.push(el.t(W / 2, dy - 8, `${ri(rng, 100, 990)}.${ri(rng, 0, 9)} MM`, { fill: "ink", fs: 10, mono: true, anchor: "middle" }));
  return { w: W, h: H, els };
}

/* 9 — GLYPHSTACK : code register + overprint numeral */
function genGlyphstack(rng, C) {
  const W = 380, H = 300, els = [];
  // numeral first (behind), anchored right, accent — Marathon overprint order
  els.push(el.t(W - 24, H * 0.62, String(ri(rng, 10, 99)), { fill: "accent", fs: 170, weight: 900, anchor: "end", op: 0.85 }));
  // code register: strict column grid, sparse
  const cols = 4, rows = 9, cw = 58, rh = 22, gx = 24, gy = 40;
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
    if (chance(rng, 0.4)) continue;
    els.push(el.t(gx + c * cw, gy + r * rh, CODE_A[ri(rng, 0, 21)] + (chance(rng, 0.4) ? String(ri(rng, 0, 9)) : ""),
      { fill: "ink", fs: 13, mono: true, weight: 700 }));
  }
  els.push(el.l(gx, H - 30, W - 24, H - 30, { stroke: "ink", sw: 1 }));
  els.push(el.t(gx, H - 14, `${partNo(rng)}  ${code(rng, 6)}  ${ri(rng, 10, 99)}KG`, { fill: "ink", fs: 9, mono: true }));
  return { w: W, h: H, els };
}

/* 10 — TOPO : framed contour field */
function genTopo(rng, C) {
  const W = 400, H = 320, els = [];
  const fm = 20;
  const cid = `tp${Math.floor(rng() * 1e6)}`;
  els.push({ t: "clip", id: cid, d: `M${fm} ${fm} L${W - fm} ${fm} L${W - fm} ${H - fm} L${fm} ${H - fm} Z` });
  // grid inside frame
  for (let x = fm; x <= W - fm; x += 45) els.push(el.l(x, fm, x, H - fm, { stroke: "ink", sw: 0.4, op: 0.3 }));
  for (let y = fm; y <= H - fm; y += 45) els.push(el.l(fm, y, W - fm, y, { stroke: "ink", sw: 0.4, op: 0.3 }));
  const rings = ri(rng, 5, 8);
  const cx = rr(rng, W * 0.35, W * 0.65), cy = rr(rng, H * 0.35, H * 0.65);
  const maxR = Math.min(W, H) * 0.52;
  const seedPhase = Array.from({ length: 5 }, () => rr(rng, 0, Math.PI * 2));
  const amp = Array.from({ length: 5 }, () => rr(rng, 0.04, 0.13));
  for (let k = 0; k < rings; k++) {
    const base = (maxR / rings) * (k + 1) * 0.9;
    const pts = [];
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      let r = base;
      for (let m2 = 0; m2 < 5; m2++) r += base * amp[m2] * Math.sin(a * (m2 + 2) + seedPhase[m2]);
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.82 });
    }
    els.push(el.p(dOf(pts) + " Z", { fill: "none", stroke: k === rings - 2 ? "accent" : "ink", sw: k === rings - 2 ? 1.6 : 0.8, clip: cid }));
  }
  els.push(el.c(cx, cy, 3, { fill: "accent", clip: cid }));
  els.push(el.r(fm, fm, W - fm * 2, H - fm * 2, { fill: "none", stroke: "ink", sw: 1.6 }));
  els.push(el.t(fm, H - 6, `ELEV ${ri(rng, 100, 900)}M / GRID ${code(rng, 4)}`, { fill: "ink", fs: 9, mono: true }));
  els.push(el.t(W - fm, H - 6, coordStr(rng), { fill: "ink", fs: 9, mono: true, anchor: "end" }));
  return { w: W, h: H, els };
}

/* 11 — NODE : trunk-bus connection diagram */
function genNode(rng, C) {
  const W = 400, H = 320, els = [];
  const trunkX = W * rr(rng, 0.44, 0.56);
  // heavy trunk
  els.push(el.l(trunkX, 24, trunkX, H - 24, { stroke: "ink", sw: 3 }));
  els.push(el.r(trunkX - 6, 16, 12, 8, { fill: "ink" }));
  els.push(el.r(trunkX - 6, H - 24, 12, 8, { fill: "ink" }));
  // nodes on a snapped grid, alternating sides, orthogonal chamfered drops to trunk
  const rows = ri(rng, 4, 5 + Math.round(C * 2));
  const rowH = (H - 80) / rows;
  for (let i = 0; i < rows; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const nx = trunkX + side * rr(rng, 90, 150);
    const ny = 50 + i * rowH + rr(rng, -6, 6);
    const ch = 12;
    els.push(el.p(
      `M${n(nx)} ${n(ny)} L${n(trunkX + side * ch)} ${n(ny)} L${n(trunkX)} ${n(ny + ch)}`,
      { fill: "none", stroke: "ink", sw: 1.3 }));
    els.push(el.c(trunkX, ny + ch, 2.6, { fill: "ink" }));
    const kind = ri(rng, 0, 2);
    if (kind === 0) els.push(el.c(nx, ny, 7, { fill: "bg", stroke: "ink", sw: 1.8 }));
    else if (kind === 1) els.push(el.r(nx - 8, ny - 8, 16, 16, { fill: "bg", stroke: "ink", sw: 1.8 }));
    else els.push(el.r(nx - 9, ny - 5, 18, 10, { fill: "accent" }));
    // label always outboard — never over the diagram
    els.push(el.t(nx + side * 14, ny + 3, `N${String(i).padStart(2, "0")}/${code(rng, 3)}`,
      { fill: "ink", fs: 9, mono: true, anchor: side > 0 ? "start" : "end" }));
  }
  els.push(el.t(trunkX, H - 6, "BUS//" + code(rng, 4), { fill: "ink", fs: 9, mono: true, anchor: "middle" }));
  return { w: W, h: H, els };
}

/* 12 — REGMARK : registration / barcode strip */
function genRegmark(rng, C) {
  const W = 420, H = 180, els = [];
  // barcode
  let x = 16;
  const bh = 62;
  while (x < W - 120) {
    const bw = rr(rng, 1.5, 6);
    if (chance(rng, 0.62)) els.push(el.r(x, 20, bw, bh, { fill: "ink" }));
    x += bw + rr(rng, 1.5, 5);
  }
  els.push(el.t(16, 96, code(rng, 12), { fill: "ink", fs: 11, mono: true, weight: 700 }));
  // registration crosses
  const cross = (cx, cy, r) => {
    els.push(el.c(cx, cy, r, { fill: "none", stroke: "ink", sw: 1.2 }));
    els.push(el.l(cx - r * 1.6, cy, cx + r * 1.6, cy, { stroke: "ink", sw: 1.2 }));
    els.push(el.l(cx, cy - r * 1.6, cx, cy + r * 1.6, { stroke: "ink", sw: 1.2 }));
  };
  cross(W - 70, 44, 12); cross(W - 30, 44, 12);
  // colour bars
  const cbw = 26;
  ["ink", "accent", "dim", "ink"].forEach((c, i) =>
    els.push(el.r(W - 120 + i * cbw, 78, cbw - 3, 16, { fill: c })));
  // corner marks
  [[10, 120, 1, 1], [W - 10, 120, -1, 1], [10, H - 10, 1, -1], [W - 10, H - 10, -1, -1]].forEach(([x2, y2, sx, sy]) => {
    els.push(el.p(`M${n(x2 + sx * 20)} ${n(y2)} L${n(x2)} ${n(y2)} L${n(x2)} ${n(y2 - sy * 20)}`, { fill: "none", stroke: "ink", sw: 1.4 }));
  });
  els.push(el.t(W / 2, H - 22, `${partNo(rng)} / ED ${ri(rng, 10, 60)}/60`, { fill: "ink", fs: 10, mono: true, anchor: "middle" }));
  return { w: W, h: H, els };
}


/* ============================================================
   SCREEN COMPOSERS — full-frame layouts consuming families
   ============================================================ */
function place(target, asset, x, y, s) {
  asset.els.forEach((e) => {
    if (e.t === "clip") { target.push(e); return; }
    const tr = `translate(${n(x)} ${n(y)}) scale(${n(s)})` + (e.tr ? " " + e.tr : "");
    target.push({ ...e, tr });
  });
}

/* S1 — HUD : full-frame heads-up screen (Lugansky register) */
function genHUD(rng, C) {
  const W = 960, H = 540, els = [];
  const m = 18;
  els.push(el.r(m, m, W - m * 2, H - m * 2, { fill: "none", stroke: "ink", sw: 1.2, op: 0.7 }));
  const cl = 30;
  [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]].forEach(([x, y, sx, sy]) => {
    els.push(el.p(`M${n(x + sx * cl)} ${n(y)} L${n(x)} ${n(y)} L${n(x)} ${n(y + sy * cl)}`, { fill: "none", stroke: "ink", sw: 3 }));
  });
  // center axes, faint
  els.push(el.l(W / 2, m + 8, W / 2, H - m - 8, { stroke: "ink", sw: 0.6, op: 0.3 }));
  els.push(el.l(m + 8, H / 2, W - m - 8, H / 2, { stroke: "ink", sw: 0.6, op: 0.3 }));
  // top ruler
  for (let x = m + 40, i = 0; x < W - m - 40; x += 12, i++) {
    const maj = i % 5 === 0;
    els.push(el.l(x, m + 4, x, m + 4 + (maj ? 10 : 5), { stroke: "ink", sw: maj ? 1.2 : 0.6 }));
  }
  // title + code
  els.push(el.t(W / 2, m + 34, "TACTICAL//" + code(rng, 4), { fill: "ink", fs: 12, mono: true, weight: 700, anchor: "middle" }));
  // center reticle
  const rs = 0.78;
  place(els, genReticle(rng, C), W / 2 - 340 * rs / 2, H / 2 - 340 * rs / 2, rs);
  // corner instruments
  place(els, genMatrix(rng, C), m + 16, m + 30, 0.42);
  place(els, genGauge(rng, C), W - m - 16 - 380 * 0.5, m + 24, 0.5);
  place(els, genSeries(rng, C), m + 16, H - m - 20 - 300 * 0.48, 0.48);
  place(els, genTrace(rng, C), W - m - 12 - 480 * 0.42, H - m - 16 - 360 * 0.42, 0.42);
  // bottom data strip
  const by = H - m - 8;
  els.push(el.t(W / 2, by, `${coordStr(rng)}  /  ${partNo(rng)}  /  LOCK ${ri(rng, 10, 99)}.${ri(rng, 100, 999)}`,
    { fill: "ink", fs: 10, mono: true, anchor: "middle" }));
  for (let i = 0; i < 5; i++) {
    els.push(el.r(W / 2 - 40 + i * 18, by - 26, 9, 9, { fill: i < 3 ? "accent" : "none", stroke: "ink", sw: 1 }));
  }
  return { w: W, h: H, els };
}

/* S2 — TERMINAL : telemetry dashboard (D350 register) */
function genTerminal(rng, C) {
  const W = 820, H = 560, els = [];
  // header
  els.push(el.t(24, 48, pk(rng, ["ORION-N5", "NOVA-DX", "VECTOR-9", "HALDE-C2"]), { fill: "ink", fs: 34, weight: 900 }));
  els.push(el.t(24, 66, pk(rng, ["MARS EXPEDITION", "ORBITAL DATA SYSTEM", "TELEMETRY INDEX"]) + " / " + code(rng, 4),
    { fill: "ink", fs: 10, mono: true }));
  // header-right hex mark + id
  const hx = W - 60, hy = 44, hr = 16;
  const hexpts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${n(hx + hr * Math.cos(a))} ${n(hy + hr * Math.sin(a))}`;
  }).join(" L");
  els.push(el.p(`M${hexpts} Z`, { fill: "none", stroke: "ink", sw: 2 }));
  els.push(el.c(hx, hy, 4, { fill: "accent" }));
  els.push(el.t(hx - 28, hy + 5, "D" + ri(rng, 100, 999), { fill: "ink", fs: 15, weight: 900, anchor: "end" }));
  els.push(el.l(24, 84, W - 24, 84, { stroke: "ink", sw: 3 }));
  // main chart left
  place(els, genBarchart(rng, C), 20, 100, 0.82);
  // stat column right
  const sx2 = 430, stats = [["SUCCESS RATE", ri(rng, 88, 99) + "%", true], ["MISSIONS", ri(rng, 40, 99) + "+", false], ["ACTIVE ORBITS", String(ri(rng, 8, 40)), false], ["SIGNALS", ri(rng, 10, 90) + "K", false]];
  stats.forEach(([l, v, acc], i) => {
    const y = 128 + i * 62;
    els.push(el.t(sx2, y, l, { fill: "ink", fs: 9, mono: true }));
    els.push(el.t(sx2, y + 30, v, { fill: acc ? "accent" : "ink", fs: 30, weight: 900 }));
    els.push(el.l(sx2, y + 40, sx2 + 130, y + 40, { stroke: "ink", sw: i === 0 ? 2 : 0.8 }));
  });
  // matrix block right edge
  place(els, genMatrix(rng, C), W - 210, 104, 0.52);
  // phase timeline bottom
  place(els, genPhase(rng, C), 20, 372, 0.74);
  // regmark bottom-right
  place(els, genRegmark(rng, C), W - 260, 396, 0.55);
  // footer
  els.push(el.l(24, H - 30, W - 24, H - 30, { stroke: "ink", sw: 1 }));
  els.push(el.t(24, H - 14, "MISSION CONTROL // " + code(rng, 5), { fill: "ink", fs: 9, mono: true }));
  els.push(el.t(W - 24, H - 14, "SEPT 2O35 / " + partNo(rng), { fill: "ink", fs: 9, mono: true, anchor: "end" }));
  return { w: W, h: H, els };
}

/* S3 — PHONE : handset GUI, purpose-built micro modules */
function genPhone(rng, C) {
  const W = 300, H = 620, els = [];
  els.push(el.r(4, 4, W - 8, H - 8, { fill: "none", stroke: "ink", sw: 3, rx: 26 }));
  els.push(el.r(W / 2 - 44, 12, 88, 16, { fill: "ink", rx: 8 }));
  // status bar
  els.push(el.t(22, 46, "23:5" + ri(rng, 0, 9), { fill: "ink", fs: 11, mono: true, weight: 700 }));
  for (let i = 0; i < 4; i++) els.push(el.r(W - 74 + i * 8, 42 - i * 2, 4, 4 + i * 2, { fill: i < 3 ? "ink" : "dim" }));
  els.push(el.r(W - 40, 38, 20, 9, { fill: "none", stroke: "ink", sw: 1.2, rx: 2 }));
  els.push(el.r(W - 38, 40, 12, 5, { fill: "accent" }));
  // header
  els.push(el.t(22, 84, pk(rng, ["SIGNAL", "UPLINK", "SYSTEM", "CARRIER"]) + "//" + code(rng, 3), { fill: "accent", fs: 10, mono: true, weight: 700 }));
  els.push(el.t(22, 132, String(ri(rng, 10, 99)), { fill: "ink", fs: 52, weight: 900 }));
  els.push(el.t(84, 132, pk(rng, ["ACTIVE NODES", "OPEN CHANNELS", "TASKS QUEUED"]), { fill: "ink", fs: 9, mono: true }));
  els.push(el.l(22, 148, W - 22, 148, { stroke: "ink", sw: 2 }));
  // 2×2 tile grid
  const tw = (W - 44 - 12) / 2, th = 118;
  const tile = (tx, ty, kind) => {
    const nt = 12;
    els.push(el.p(`M${n(tx + nt)} ${n(ty)} L${n(tx + tw)} ${n(ty)} L${n(tx + tw)} ${n(ty + th - nt)} L${n(tx + tw - nt)} ${n(ty + th)} L${n(tx)} ${n(ty + th)} L${n(tx)} ${n(ty + nt)} Z`,
      { fill: "none", stroke: "ink", sw: 1.4 }));
    els.push(el.t(tx + 8, ty + 16, pk(rng, LABELS) + "-" + String(ri(rng, 0, 9)), { fill: "ink", fs: 8, mono: true, weight: 700 }));
    if (kind === 0) {
      // micro arc gauge
      const gx = tx + tw / 2, gy = ty + th * 0.58, gr = 28;
      const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
      const v = rr(rng, 0.2, 0.95);
      const arc = (r, f, t2, o) => el.p(`M${n(gx + Math.cos(f) * r)} ${n(gy + Math.sin(f) * r)} A${n(r)} ${n(r)} 0 ${t2 - f > Math.PI ? 1 : 0} 1 ${n(gx + Math.cos(t2) * r)} ${n(gy + Math.sin(t2) * r)}`, { fill: "none", ...o });
      els.push(arc(gr, a0, a1, { stroke: "dim", sw: 5 }));
      els.push(arc(gr, a0, a0 + (a1 - a0) * v, { stroke: "accent", sw: 5 }));
      els.push(el.t(gx, gy + 5, String(Math.round(v * 100)), { fill: "ink", fs: 17, weight: 900, anchor: "middle" }));
    } else if (kind === 1) {
      for (let i = 0; i < 4; i++) {
        const by = ty + 30 + i * 20, v = rr(rng, 0.15, 1);
        els.push(el.t(tx + 8, by + 5, pk(rng, LABELS), { fill: "ink", fs: 7, mono: true }));
        els.push(el.r(tx + 34, by, tw - 46, 6, { fill: "none", stroke: "ink", sw: 0.8 }));
        els.push(el.r(tx + 34, by, (tw - 46) * v, 6, { fill: i === 1 ? "accent" : "ink" }));
      }
    } else if (kind === 2) {
      const s = 9;
      for (let r = 0; r < 8; r++) for (let c2 = 0; c2 < Math.floor((tw - 16) / s); c2++) {
        if (chance(rng, 0.45)) continue;
        els.push(el.r(tx + 8 + c2 * s, ty + 26 + r * s, s * 0.55, s * 0.55, { fill: chance(rng, 0.1) ? "accent" : "ink" }));
      }
    } else {
      for (let i = 0; i < 5; i++) {
        els.push(el.t(tx + 8, ty + 34 + i * 15, code(rng, ri(rng, 4, 7)), { fill: i === 0 ? "accent" : "ink", fs: 9, mono: true }));
      }
    }
  };
  tile(22, 162, 0); tile(22 + tw + 12, 162, 1);
  tile(22, 162 + th + 12, 2); tile(22 + tw + 12, 162 + th + 12, 3);
  // list rows
  const ly0 = 162 + th * 2 + 34;
  for (let i = 0; i < 3; i++) {
    const y = ly0 + i * 38;
    els.push(el.r(22, y, 14, 14, { fill: i === 0 ? "accent" : "none", stroke: "ink", sw: 1.4 }));
    els.push(el.t(46, y + 11, pk(rng, ["FREIGHT LOCK", "NAV BEACON", "POWER CELL", "COMM ARRAY"]), { fill: "ink", fs: 10, mono: true, weight: 700 }));
    els.push(el.t(W - 44, y + 11, String(ri(rng, 10, 99)).padStart(2, "0"), { fill: "ink", fs: 10, mono: true, anchor: "end" }));
    els.push(el.p(`M${n(W - 34)} ${n(y + 2)} L${n(W - 28)} ${n(y + 7)} L${n(W - 34)} ${n(y + 12)}`, { fill: "none", stroke: "ink", sw: 1.4 }));
    els.push(el.l(22, y + 24, W - 22, y + 24, { stroke: "ink", sw: 0.6, op: 0.5 }));
  }
  // bottom nav
  const ny = H - 52;
  [-1, 0, 1].forEach((k) => {
    els.push(el.r(W / 2 + k * 44 - 9, ny, 18, 18, { fill: k === 0 ? "ink" : "none", stroke: "ink", sw: 1.6 }));
  });
  els.push(el.r(W / 2 - 40, H - 20, 80, 4, { fill: "ink", rx: 2 }));
  return { w: W, h: H, els };
}

const FAMILIES = [
  { id: "hud",      name: "HUD",      gen: genHUD,      note: "full-frame heads-up screen" },
  { id: "terminal", name: "TERMINAL", gen: genTerminal, note: "telemetry dashboard screen" },
  { id: "phone",    name: "PHONE",    gen: genPhone,    note: "handset GUI screen" },
  { id: "trace",      name: "TRACE",      gen: genTrace,      note: "routed parallel bus + pads" },
  { id: "panel",      name: "PANEL",      gen: genPanel,      note: "notched HUD data module" },
  { id: "reticle",    name: "RETICLE",    gen: genReticle,    note: "targeting construction" },
  { id: "hazard",     name: "HAZARD",     gen: genHazard,     note: "striped warning block" },
  { id: "lattice",    name: "LATTICE",    gen: genLattice,    note: "hex mesh, partial fill" },
  { id: "matrix",     name: "MATRIX",     gen: genMatrix,     note: "dot / block data grid" },
  { id: "barchart",   name: "BARCHART",   gen: genBarchart,   note: "axis-true column chart" },
  { id: "series",     name: "SERIES",     gen: genSeries,     note: "plotted telemetry line" },
  { id: "phase",      name: "PHASE",      gen: genPhase,      note: "mission timeline" },
  { id: "gauge",      name: "GAUGE",      gen: genGauge,      note: "arc meter + channels" },
  { id: "callout",    name: "CALLOUT",    gen: genCallout,    note: "leader annotation" },
  { id: "glyphstack", name: "GLYPHSTACK", gen: genGlyphstack, note: "code rows + numeral" },
  { id: "topo",       name: "TOPO",       gen: genTopo,       note: "contour field" },
  { id: "node",       name: "NODE",       gen: genNode,       note: "connection diagram" },
  { id: "regmark",    name: "REGMARK",    gen: genRegmark,    note: "registration + barcode" },
];

/* ============================================================
   RENDERERS — JSX + SVG string from the same descriptors
   ============================================================ */
const MONO = "'Courier New', ui-monospace, monospace";
const SANS = "'Arial Black', 'Helvetica Neue', Arial, sans-serif";

function resolve(tok, pal) {
  if (!tok || tok === "none") return "none";
  return pal[tok] || tok;
}

function ElementsJSX({ els, pal }) {
  return (
    <>
      <defs>
        {els.filter((e) => e.t === "clip").map((e, i) => (
          <clipPath key={i} id={e.id}><path d={e.d} /></clipPath>
        ))}
      </defs>
      {els.map((e, i) => {
        if (e.t === "clip") return null;
        const common = {
          key: i,
          fill: resolve(e.fill, pal),
          stroke: resolve(e.stroke, pal),
          strokeWidth: e.sw,
          strokeDasharray: e.dash,
          opacity: e.op,
          transform: e.tr,
          clipPath: e.clip ? `url(#${e.clip})` : undefined,
          strokeLinejoin: "miter",
          strokeLinecap: "butt",
        };
        if (e.t === "rect") return <rect {...common} x={e.x} y={e.y} width={e.w} height={e.h} rx={e.rx} />;
        if (e.t === "path") return <path {...common} d={e.d} />;
        if (e.t === "circle") return <circle {...common} cx={e.cx} cy={e.cy} r={e.r} />;
        if (e.t === "line") return <line {...common} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} />;
        if (e.t === "text") return (
          <text {...common} x={e.x} y={e.y} fontSize={e.fs} textAnchor={e.anchor}
            fontFamily={e.mono ? MONO : SANS} fontWeight={e.weight || 400}
            letterSpacing={e.mono ? 0.5 : 0} stroke="none">{e.s}</text>
        );
        return null;
      })}
    </>
  );
}

function toSVG(asset, pal, withBg) {
  const attr = (k, v) => (v === undefined || v === null || v === "" ? "" : ` ${k}="${v}"`);
  const clips = asset.els.filter((e) => e.t === "clip");
  const body = asset.els.map((e) => {
    if (e.t === "clip") return "";
    const c = attr("fill", resolve(e.fill, pal)) + attr("stroke", resolve(e.stroke, pal)) +
      attr("stroke-width", e.sw) + attr("stroke-dasharray", e.dash) + attr("opacity", e.op) +
      attr("transform", e.tr) + (e.clip ? ` clip-path="url(#${e.clip})"` : "");
    if (e.t === "rect") return `<rect x="${n(e.x)}" y="${n(e.y)}" width="${n(e.w)}" height="${n(e.h)}"${e.rx ? ` rx="${n(e.rx)}"` : ""}${c}/>`;
    if (e.t === "path") return `<path d="${e.d}"${c}/>`;
    if (e.t === "circle") return `<circle cx="${n(e.cx)}" cy="${n(e.cy)}" r="${n(e.r)}"${c}/>`;
    if (e.t === "line") return `<line x1="${n(e.x1)}" y1="${n(e.y1)}" x2="${n(e.x2)}" y2="${n(e.y2)}"${c}/>`;
    if (e.t === "text") return `<text x="${n(e.x)}" y="${n(e.y)}" font-size="${e.fs}" font-family="${e.mono ? MONO : SANS}" font-weight="${e.weight || 400}"${e.anchor ? ` text-anchor="${e.anchor}"` : ""}${e.tr ? ` transform="${e.tr}"` : ""}${e.op !== undefined ? ` opacity="${e.op}"` : ""} fill="${resolve(e.fill, pal)}">${String(e.s).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`;
    return "";
  }).join("\n  ");
  const defs = clips.length
    ? `<defs>${clips.map((e) => `<clipPath id="${e.id}"><path d="${e.d}"/></clipPath>`).join("")}</defs>\n  `
    : "";
  const bg = withBg ? `<rect width="${asset.w}" height="${asset.h}" fill="${pal.bg}"/>\n  ` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${asset.w} ${asset.h}" width="${asset.w}" height="${asset.h}">\n  ${defs}${bg}${body}\n</svg>`;
}

function download(name, text) {
  const blob = new Blob([text], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

/* ============================================================
   UI
   ============================================================ */
export default function AssetFoundry() {
  const [palId, setPalId] = useState("acid");
  const [seed, setSeed] = useState(1090);
  const [complexity, setComplexity] = useState(0.5);
  const [active, setActive] = useState(null);
  const [enabled, setEnabled] = useState(FAMILIES.map((f) => f.id));
  const [bins, setBins] = useState([]);

  const pal = PALETTES.find((p) => p.id === palId);

  const cells = useMemo(() => {
    const list = FAMILIES.filter((f) => enabled.includes(f.id));
    return list.map((f, i) => {
      const rng = mulberry32(seed + i * 7919);
      return { fam: f, asset: f.gen(rng, complexity), key: `${f.id}-${seed}-${i}` };
    });
  }, [seed, complexity, enabled]);

  const detail = useMemo(() => {
    if (!active) return null;
    const f = FAMILIES.find((x) => x.id === active.id);
    return { fam: f, asset: f.gen(mulberry32(active.seed), complexity) };
  }, [active, complexity]);

  const toggleFam = (id) => setEnabled((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);

  const exportOne = (fam, asset) => download(`M56_${fam.name}_${seed}.svg`, toSVG(asset, pal, true));

  const exportSheet = () => {
    const pad = 24;
    let x = pad, y = pad, rowH = 0, W = 0;
    const parts = [];
    cells.forEach(({ asset }) => {
      if (x + asset.w > 1600) { x = pad; y += rowH + pad; rowH = 0; }
      const inner = toSVG(asset, pal, false).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
      parts.push(`<g transform="translate(${x} ${y})">${inner}</g>`);
      x += asset.w + pad; rowH = Math.max(rowH, asset.h); W = Math.max(W, x);
    });
    const H = y + rowH + pad;
    download(`M56_ASSET_SHEET_${seed}.svg`,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${pal.bg}"/>${parts.join("")}</svg>`);
  };

  const addToBin = (fam, asset) => setBins((b) => [{ fam, asset, id: Math.random() }, ...b].slice(0, 12));

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans">
      {/* header */}
      <div className="border-b border-neutral-800 px-4 py-2.5 flex flex-wrap items-center gap-3 justify-between sticky top-0 bg-neutral-950 z-20">
        <div className="flex items-baseline gap-2">
          <span className="font-black text-base tracking-tight">FOUNDRY</span>
          <span className="text-neutral-500 text-[10px] tracking-[0.25em]">SCI-FI VECTOR ASSETS</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">
            {PALETTES.map((p) => (
              <button key={p.id} title={p.name} onClick={() => setPalId(p.id)}
                className={`w-7 h-7 border-2 ${palId === p.id ? "border-white" : "border-neutral-800"}`}
                style={{ background: p.bg }}>
                <span className="block w-2 h-2 m-auto" style={{ background: p.accent }} />
              </button>
            ))}
          </div>
          <button onClick={() => setSeed(Math.floor(Math.random() * 1e9))}
            className="px-3 py-1.5 bg-white text-black text-[10px] font-black tracking-widest hover:bg-neutral-200">
            REROLL ALL
          </button>
          <button onClick={() => setSeed((s) => s + 1)}
            className="px-2.5 py-1.5 border border-neutral-700 text-[10px] font-bold hover:border-neutral-500">+1</button>
          <button onClick={exportSheet}
            className="px-3 py-1.5 border border-neutral-600 text-[10px] font-black tracking-widest hover:bg-neutral-100 hover:text-black">
            EXPORT SHEET SVG
          </button>
        </div>
      </div>

      {/* family filter + complexity */}
      <div className="border-b border-neutral-800 px-4 py-2 flex flex-wrap items-center gap-2">
        {FAMILIES.map((f) => (
          <button key={f.id} onClick={() => toggleFam(f.id)}
            className={`px-2 py-1 text-[9px] font-bold tracking-[0.15em] border ${enabled.includes(f.id) ? "border-neutral-100 text-neutral-100" : "border-neutral-800 text-neutral-600"}`}>
            {f.name}
          </button>
        ))}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[9px] tracking-[0.2em] text-neutral-500">COMPLEXITY</span>
          <input type="range" min="0" max="1" step="0.01" value={complexity}
            onChange={(e) => setComplexity(parseFloat(e.target.value))}
            className="w-32 accent-white h-1" />
          <span className="text-[9px] text-neutral-400 tabular-nums w-6">{Math.round(complexity * 100)}</span>
        </div>
      </div>

      {/* gallery */}
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {cells.map(({ fam, asset, key }, i) => (
          <div key={key} className="border border-neutral-800 hover:border-neutral-600 transition-colors">
            <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-neutral-800">
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] font-black tracking-[0.18em]">{fam.name}</span>
                <span className="text-[8px] text-neutral-600 tracking-wider">{fam.note}</span>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setActive({ id: fam.id, seed: seed + i * 7919 })}
                  className="px-1.5 py-0.5 text-[8px] font-bold border border-neutral-700 text-neutral-400 hover:border-neutral-400">OPEN</button>
                <button onClick={() => addToBin(fam, asset)}
                  className="px-1.5 py-0.5 text-[8px] font-bold border border-neutral-700 text-neutral-400 hover:border-neutral-400">BIN</button>
                <button onClick={() => exportOne(fam, asset)}
                  className="px-1.5 py-0.5 text-[8px] font-bold border border-neutral-500 text-neutral-100 hover:bg-white hover:text-black">SVG</button>
              </div>
            </div>
            <div style={{ background: pal.bg }}>
              <svg viewBox={`0 0 ${asset.w} ${asset.h}`} className="w-full h-auto block">
                <ElementsJSX els={asset.els} pal={pal} />
              </svg>
            </div>
          </div>
        ))}
      </div>

      {/* bin */}
      {bins.length > 0 && (
        <div className="border-t border-neutral-800 p-4">
          <div className="text-[9px] tracking-[0.25em] text-neutral-500 mb-2">BIN — KEPT VARIANTS</div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {bins.map((b) => (
              <div key={b.id} className="shrink-0 w-40 border border-neutral-800">
                <div className="flex justify-between px-1.5 py-1 border-b border-neutral-800">
                  <span className="text-[8px] font-bold tracking-wider">{b.fam.name}</span>
                  <button onClick={() => exportOne(b.fam, b.asset)}
                    className="text-[8px] font-bold text-pink-500">SVG</button>
                </div>
                <div style={{ background: pal.bg }}>
                  <svg viewBox={`0 0 ${b.asset.w} ${b.asset.h}`} className="w-full h-auto block">
                    <ElementsJSX els={b.asset.els} pal={pal} />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* detail overlay */}
      {detail && (
        <div className="fixed inset-0 bg-black/85 z-30 flex items-center justify-center p-6"
          onClick={() => setActive(null)}>
          <div className="max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 py-2 border border-neutral-700 border-b-0 bg-neutral-950">
              <span className="text-[11px] font-black tracking-[0.2em]">{detail.fam.name}</span>
              <div className="flex gap-1.5">
                <button onClick={() => setActive((a) => ({ ...a, seed: a.seed + 1 }))}
                  className="px-2.5 py-1 text-[9px] font-bold border border-neutral-700 hover:border-neutral-400">REROLL</button>
                <button onClick={() => exportOne(detail.fam, detail.asset)}
                  className="px-2.5 py-1 text-[9px] font-black bg-white text-black">EXPORT SVG</button>
                <button onClick={() => setActive(null)}
                  className="px-2.5 py-1 text-[9px] font-bold border border-neutral-700 hover:border-neutral-400">CLOSE</button>
              </div>
            </div>
            <div className="border border-neutral-700" style={{ background: pal.bg }}>
              <svg viewBox={`0 0 ${detail.asset.w} ${detail.asset.h}`} className="w-full h-auto block">
                <ElementsJSX els={detail.asset.els} pal={pal} />
              </svg>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
