/* ---------- classical facades (Beaux-Arts: temple front, brick palazzo, giant order, library) ---------- */
// Proportions follow the classical orders: a column is a fixed number of its own lower diameters
// tall (Vignola: Tuscan 7, Doric 8, Ionic 9, Corinthian 10), the entablature about a quarter of the
// column. Every ornament is one of your parts: Ionic volutes are a mirrored pair of hooks, Corinthian
// leaves a small fan of blades, the frieze inscription is set in xenoglyphs.
const ORDERS = { tuscan: { d: 7, label: "Tuscan" }, doric: { d: 8, label: "Doric" }, ionic: { d: 9, label: "Ionic" }, corinthian: { d: 10, label: "Corinthian" } };
const CL_TYPES = { temple: "Temple", palazzo: "Palazzo", giant: "Hall", library: "Library" };
const XENO_CH = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function newClassical(type, seed, keep) {
  const R = rng(seed), int = (a, b) => a + Math.floor(R() * (b - a + 1)), odd = n => n % 2 ? n : n + 1, one = a => a[Math.floor(R() * a.length)];
  const kits = keep?.kits || { A: makeKit(R), B: makeKit(R) };
  const parts = { volute: pick(R, "hook"), leaf: pick(R, "blade"), echinus: pick(R, "bead"), oculus: pick(R, "bead"), acro: pick(R, "lamp"), spire: pick(R, "spire") };
  const T = {
    temple: { bays: 3, pav: 3, floors: 2, base: 0.55, order: one(["doric", "ionic", "ionic"]), front: "portico", frame: "plain", pediment: true, pitch: 15, attic: false, balus: false, quoins: true, steps: int(9, 14), dome: { on: R() < 0.6, w: 0.95, drum: 0.75, oculi: int(3, 5) }, text: "SIGIL HALL" },
    palazzo: { bays: odd(int(9, 13)), pav: 3, floors: 3, base: 0.9, order: "ionic", front: "aedicule", frame: "gibbs", pediment: R() < 0.35, pitch: 13, attic: false, balus: R() < 0.5, quoins: true, steps: 3, dome: { on: false, w: 0.5, drum: 0.6, oculi: 4 }, text: "" },
    giant: { bays: odd(int(7, 11)), pav: odd(int(3, 5)), floors: 2, base: 1.25, order: one(["ionic", "corinthian"]), front: "pilasters", frame: "plain", pediment: false, pitch: 14, attic: true, balus: true, quoins: false, steps: 0, dome: { on: false, w: 0.5, drum: 0.6, oculi: 4 }, text: "" },
    library: { bays: odd(int(11, 15)), pav: odd(int(5, 9)), floors: 2, base: 0.9, order: "ionic", front: "portico", frame: "plain", pediment: false, pitch: 14, attic: true, balus: false, quoins: false, steps: int(10, 16), dome: { on: true, w: 0.42, drum: 0.65, oculi: 4 }, text: "LIBRARY OF SIGIL CITY" }
  };
  return { kind: "classical", seed, bayW: keep?.bayW ?? int(30, 40), floorH: keep?.floorH ?? int(44, 54), open: 0.72, cornice: 0.32, every: 2, kits,
    crown: keep?.crown || { kind: "none", blade: pick(R, "blade"), spire: pick(R, "spire"), lamp: pick(R, "lamp"), n: 5 },
    blocks: [{ bays: 5, floors: 1, off: 0, kit: "A" }], cl: { type, ...T[type], parts } };
}
function mutateClassical(g0, R) {
  const g = JSON.parse(JSON.stringify(g0)), c = g.cl, one = a => a[Math.floor(R() * a.length)];
  const ops = [
    () => c.order = one(Object.keys(ORDERS)),
    () => c.bays = clamp(c.bays + (R() < 0.5 ? -2 : 2), 3, 17),
    () => c.pav = clamp(c.pav + (R() < 0.5 ? -2 : 2), 1, Math.min(9, c.bays)),
    () => c.floors = clamp(c.floors + (R() < 0.5 ? -1 : 1), 1, 4),
    () => c.frame = one(["plain", "gibbs", "pediments"]),
    () => c.pediment = !c.pediment, () => c.attic = !c.attic, () => c.balus = !c.balus, () => c.quoins = !c.quoins,
    () => c.dome.on = !c.dome.on,
    () => c.front = one(["portico", "pilasters", "aedicule"]),
    () => { c.parts.volute = pick(R, "hook"); c.parts.leaf = pick(R, "blade"); c.parts.echinus = pick(R, "bead"); },
    () => { const kk = R() < 0.5 ? "A" : "B", r = one(["bay", "accent", "door", "pil", "frieze", "hook"]); g.kits[kk][r] = pick(R, r === "pil" ? "segment" : r === "frieze" ? "frieze" : r === "hook" ? "hook" : r === "bay" ? (R() < 0.5 ? "bead" : "segment") : "lamp"); },
    () => c.base = +clamp(c.base + (R() - 0.5) * 0.4, 0.3, 1.6).toFixed(2),
  ];
  const n = 1 + Math.floor(R() * 2);
  for (let i = 0; i < n; i++) one(ops)();
  if (c.pav > c.bays) c.pav = c.bays;
  g.seed = Math.floor(R() * 1e9);
  return g;
}
function drawClassical(g) {
  const ctx = mkCtx(), back = mkCtx(), c = g.cl, P = id => state.byId[id], kA = g.kits.A, kB = g.kits.B;
  const bw = g.bayW, fh = g.floorH, n = clamp(c.bays, 1, 21), Wd = n * bw, x0 = AX - Wd / 2, x1 = AX + Wd / 2;
  const grow = (cx, x, y) => { cx.top = Math.min(cx.top, y); cx.minX = Math.min(cx.minX, x); cx.maxX = Math.max(cx.maxX, x); };
  const L = (xa, ya, xb, yb, w = 1, col = MINT, op, cx = ctx) => { line(cx, xa, ya, xb, yb, w, col, op); grow(cx, xa, ya); grow(cx, xb, yb); };
  const rect = (xa, ya, xb, yb, w = 1, col = MINT, cx = ctx) => { L(xa, ya, xb, ya, w, col, 0, cx); L(xb, ya, xb, yb, w, col, 0, cx); L(xb, yb, xa, yb, w, col, 0, cx); L(xa, yb, xa, ya, w, col, 0, cx); };
  const raw = (cx, s) => cx.out.push(s);
  const pv = clamp(c.pav % 2 ? c.pav : c.pav + 1, 1, n), pv0 = AX - pv * bw / 2, pv1 = AX + pv * bw / 2;
  const hb = fh * c.base, Hb = c.floors * fh, ybase = GROUND - hb, ybody = ybase - Hb;
  const ord = ORDERS[c.order] || ORDERS.ionic, giant = c.front === "portico" || c.front === "pilasters";
  const E = giant ? clamp(Hb * 0.22, fh * 0.4, fh * 0.9) : fh * 0.45, yE = ybody - E;
  const ha = c.attic ? fh * 0.55 : 0, ytop = yE - ha, hbal = c.balus ? fh * 0.32 : 0;
  // inscription in xenoglyphs, centred on (cx, cy), h tall
  const inscribe = (text, cx, cy, h, maxW) => {
    const t = (text || "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").trim(); if (!t) return;
    let adv = h * 0.92; const total = [...t].reduce((a, ch) => a + (ch === " " ? adv * 0.6 : adv), 0);
    if (total > maxW) adv *= maxW / total;
    let x = cx - [...t].reduce((a, ch) => a + (ch === " " ? adv * 0.6 : adv), 0) / 2;
    for (const ch of t) { if (ch !== " ") { const id = "P" + String(359 + XENO_CH.indexOf(ch)).padStart(3, "0"); if (P(id)) put(ctx, id, x + adv / 2, cy, (adv / 0.92) / 26, { sw: 0.9 }); } x += ch === " " ? adv * 0.6 : adv; }
  };
  // a column (or flat pilaster) from ybot up to ytop2, lower diameter D
  const capital = (cx, yc, D, scale = 1) => {
    L(cx - D * 0.66, yc, cx + D * 0.66, yc, 1.1);   // abacus
    if (c.order === "doric" && P(c.parts.echinus)) { const p = P(c.parts.echinus); put(ctx, p.id, cx, yc + D * 0.18, fitS(p, D * 0.9, D * 0.36) * scale, { sw: 0.9 }); }
    if (c.order === "ionic" && P(c.parts.volute)) { const p = P(c.parts.volute), s = fitS(p, D * 0.55, D * 0.55) * scale; put(ctx, p.id, cx - D * 0.42, yc + D * 0.2, s, { sw: 0.9 }); put(ctx, p.id, cx + D * 0.42, yc + D * 0.2, s, { sw: 0.9, flip: true }); }
    if (c.order === "corinthian" && P(c.parts.leaf)) { const p = P(c.parts.leaf), s = fitS(p, D * 0.5, D * 0.5) * scale; for (const a of [-38, -12, 12, 38]) put(ctx, p.id, cx + Math.sin(a * Math.PI / 180) * D * 0.3, yc + D * 0.38 - Math.cos(a * Math.PI / 180) * D * 0.12, s, { sw: 0.85, rot: a, flip: a > 0 }); }
    if (c.order === "tuscan") L(cx - D * 0.55, yc + D * 0.16, cx + D * 0.55, yc + D * 0.16, 0.7);
  };
  const column = (cx, ybot, ytop2, D) => {
    const bh = D * 0.3, ch = D * 0.42, ys = ybot - bh, yc = ytop2 + ch;
    L(cx - D * 0.66, ybot, cx + D * 0.66, ybot, 1); L(cx - D * 0.58, ys + bh * 0.5, cx + D * 0.58, ys + bh * 0.5, 0.7); L(cx - D * 0.5, ys, cx + D * 0.5, ys, 0.8);
    // shaft with a slight taper (entasis) and two flutes
    L(cx - D * 0.5, ys, cx - D * 0.42, yc, 1.1); L(cx + D * 0.5, ys, cx + D * 0.42, yc, 1.1);
    if (c.order !== "tuscan") for (const f of [-0.17, 0.17]) L(cx + D * f, ys - 3, cx + D * f * 0.85, yc + 3, 0.5, MINT, 0.6);
    capital(cx, ytop2, D);
  };
  const pilaster = (cx, ybot, ytop2, D) => {
    const w = D * 0.42;
    L(cx - w, ybot, cx - w, ytop2 + D * 0.35, 0.9); L(cx + w, ybot, cx + w, ytop2 + D * 0.35, 0.9);
    L(cx - w * 1.25, ybot, cx + w * 1.25, ybot, 0.9);
    capital(cx, ytop2, D * 0.85, 0.85);
  };

  // ---- dome behind (drum with round windows, shell, lantern) ----
  if (c.dome?.on) {
    const dw = Math.max(bw * 1.2, Wd * c.dome.w / 2), dh = fh * c.dome.drum, yd0 = (c.pediment ? Math.min(ytop, yE - Math.min(pv * bw / 2 + 8, Wd / 2 + 8) * Math.tan(c.pitch * Math.PI / 180) * 0.6) : ytop) - hbal;
    rect(AX - dw, yd0, AX + dw, yd0 - dh, 1.1, MINT, back);
    L(AX - dw - 6, yd0 - dh, AX + dw + 6, yd0 - dh, 1.3, MINT, 0, back);
    const oc = P(c.parts.oculus), k = clamp(c.dome.oculi, 0, 9);
    for (let i = 0; i < k; i++) { const x = AX - dw + (i + 0.5) * 2 * dw / k; if (oc) put(back, oc.id, x, yd0 - dh / 2, fitS(oc, dh * 0.42, dh * 0.42), { sw: 0.9 }); else raw(back, `<circle cx="${x.toFixed(1)}" cy="${(yd0 - dh / 2).toFixed(1)}" r="${(dh * 0.18).toFixed(1)}" fill="none" stroke="${MINT}"/>`); if (i) L(AX - dw + i * 2 * dw / k, yd0, AX - dw + i * 2 * dw / k, yd0 - dh, 0.5, MINT, 0, back); }
    const R = dw * 0.98, Hd = R * 0.72, yb = yd0 - dh;
    for (const [f, w, col] of [[1, 1.3, MINT], [0.8, 0.6, DIM], [0.58, 0.6, DIM]]) raw(back, `<path d="M${(AX - R * f).toFixed(1)} ${yb.toFixed(1)} A${(R * f).toFixed(1)} ${(Hd * f).toFixed(1)} 0 0 1 ${(AX + R * f).toFixed(1)} ${yb.toFixed(1)}" fill="none" stroke="${col}" stroke-width="${w}"/>`);
    grow(back, AX - R, yb - Hd);
    const lw = R * 0.16, lh = R * 0.3, yl = yb - Hd + 2, sg = P(kB.pil || kA.pil);
    rect(AX - lw, yl, AX + lw, yl - lh, 1, MINT, back);
    if (sg) for (const s of [-1, 0, 1]) put(back, sg.id, AX + s * lw * 0.62, yl - lh / 2, fitS(sg, lw * 0.5, lh * 0.9), { sw: 0.9 });
    raw(back, `<path d="M${(AX - lw * 1.1).toFixed(1)} ${(yl - lh).toFixed(1)} A${(lw * 1.1).toFixed(1)} ${(lw * 0.8).toFixed(1)} 0 0 1 ${(AX + lw * 1.1).toFixed(1)} ${(yl - lh).toFixed(1)}" fill="none" stroke="${MINT}" stroke-width="1"/>`);
    const sp = P(c.parts.spire); if (sp) { const s = fitS(sp, lw * 1.4, lh * 1.6); put(back, sp.id, AX, yl - lh - lw * 0.8 - sp.h * s / 2 + 2, s, { sw: 1 }); }
  }

  // ---- solid backing so the dome reads as behind the front ----
  const pedH = c.pediment ? Math.min(pv * bw / 2 + 8, Wd / 2 + 8) * Math.tan(c.pitch * Math.PI / 180) : 0;
  const pw = c.pediment ? (pv >= n ? Wd / 2 + 8 : pv * bw / 2 + 8) : 0;
  raw(ctx, `<path d="M${x0 - 8} ${GROUND}V${(ytop - hbal).toFixed(1)}H${x1 + 8}V${GROUND}Z${c.pediment ? `M${AX - pw} ${yE.toFixed(1)}L${AX} ${(yE - (pv >= n ? (Wd / 2 + 8) : pw) * Math.tan(c.pitch * Math.PI / 180)).toFixed(1)}L${AX + pw} ${yE.toFixed(1)}Z` : ""}" fill="#14171d"/>`);
  void pedH;

  // ---- base: rusticated, with grilles to the basement ----
  rect(x0, GROUND, x1, ybase, 1.2);
  L(x0 - 4, ybase, x1 + 4, ybase, 1.3); L(x0 - 4, ybase + 4, x1 + 4, ybase + 4, 0.6);
  const stairW = c.steps > 0 ? (c.front === "portico" ? pv * bw : bw * 1.6) / 2 + c.steps * 4 + 4 : 0;
  for (let y = GROUND - 9, r = 0; y > ybase + 6; y -= 9, r++) {
    L(x0, y, x1, y, 0.4, MINT, 0.55);
    for (let x = x0 + (r % 2 ? bw / 2 : bw / 4); x < x1; x += bw / 2) if (Math.abs(x - AX) > stairW) L(x, y, x, y + 9, 0.4, MINT, 0.55);
  }
  for (let i = 0; i < n; i++) {
    const cx = x0 + (i + 0.5) * bw; if (Math.abs(cx - AX) < stairW + 4) continue;
    const s = Math.min(bw * 0.42, hb * 0.5), cy = GROUND - hb * 0.45;
    rect(cx - s / 2, cy + s / 2, cx + s / 2, cy - s / 2, 0.8);
    for (const f of [1 / 3, 2 / 3]) { L(cx - s / 2 + s * f, cy - s / 2, cx - s / 2 + s * f, cy + s / 2, 0.5); L(cx - s / 2, cy - s / 2 + s * f, cx + s / 2, cy - s / 2 + s * f, 0.5); }
  }

  // ---- body: walls, pavilion edges, quoins, windows ----
  rect(x0, ybase, x1, ybody, 1.1);
  if (pv < n) { L(pv0, ybase, pv0, ybody, 1.1); L(pv1, ybase, pv1, ybody, 1.1); L(pv0 - 3, ybase, pv0 - 3, ybody, 0.5); L(pv1 + 3, ybase, pv1 + 3, ybody, 0.5); }
  if (c.quoins) for (const ex of [x0, x1, ...(pv < n ? [pv0, pv1] : [])]) {
    const inward = ex === x0 || ex === pv1 ? 1 : -1;
    for (let y = ybase, k = 0; y - 8 > ybody; y -= 9, k++) { const w = k % 2 ? 9 : 15; rect(ex, y, ex + inward * w, y - 8, 0.6); }
  }
  for (let f = 0; f < c.floors; f++) {
    const yf = ybase - f * fh;
    if (f) L(x0, yf, x1, yf, 0.45, MINT, 0.6);
    for (let i = 0; i < n; i++) {
      const cx = x0 + (i + 0.5) * bw, mid = i === (n - 1) / 2, door = f === 0 && mid && c.front !== "pilasters" || (f === 0 && mid && c.front === "pilasters");
      const ww = bw * 0.44 * (g.open / 0.72), wh = door ? fh * 0.82 : fh * (f === 1 ? 0.62 : 0.54), yb2 = yf - (door ? 0 : fh * 0.2), yt = yb2 - wh;
      rect(cx - ww / 2, yb2, cx + ww / 2, yt, 0.9);
      if (door) { L(cx, yb2, cx, yt + wh * 0.3, 0.6); L(cx - ww / 2, yt + wh * 0.3, cx + ww / 2, yt + wh * 0.3, 0.6); const dp = P(kA.door); if (dp) put(ctx, dp.id, cx, yt + wh * 0.15, fitS(dp, ww * 0.8, wh * 0.26), { sw: 0.9 }); }
      else { L(cx, yb2, cx, yt, 0.4); L(cx - ww / 2, yt + wh * 0.42, cx + ww / 2, yt + wh * 0.42, 0.4); L(cx - ww / 2 - 3, yb2 + 2, cx + ww / 2 + 3, yb2 + 2, 0.9); }
      if (c.frame === "gibbs") {
        for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const by = yb2 - (k + 0.5) * wh / 3, w = k % 2 ? 4 : 7; rect(cx + s * ww / 2, by + wh / 7, cx + s * (ww / 2 + w), by - wh / 7, 0.55); }
        const kp = P(kA.bay); if (kp) put(ctx, kp.id, cx, yt - 5, fitS(kp, 11, 13), { sw: 0.9 });
      } else if (c.frame === "pediments" && f === Math.min(1, c.floors - 1) && !door) {
        const ph = ww * 0.22;
        if (i % 2) raw(ctx, `<path d="M${(cx - ww / 2 - 4).toFixed(1)} ${(yt - 3).toFixed(1)} A${(ww / 2 + 4).toFixed(1)} ${ph.toFixed(1)} 0 0 1 ${(cx + ww / 2 + 4).toFixed(1)} ${(yt - 3).toFixed(1)}" fill="none" stroke="${MINT}" stroke-width="0.9"/>`);
        else { L(cx - ww / 2 - 4, yt - 3, cx, yt - 3 - ph, 0.9); L(cx, yt - 3 - ph, cx + ww / 2 + 4, yt - 3, 0.9); }
        L(cx - ww / 2 - 4, yt - 3, cx + ww / 2 + 4, yt - 3, 0.9);
      } else L(cx - ww / 2 - 2, yt - 3, cx + ww / 2 + 2, yt - 3, 0.8);
      // the piano nobile's centre bays hold a creature eye in the glass
      if (f === Math.min(1, c.floors - 1) && !door && Math.abs(cx - AX) < pv * bw / 2) { const ap = P(kB.accent); if (ap) put(ctx, ap.id, cx, yt + wh * 0.62, fitS(ap, ww * 0.62, wh * 0.4), { sw: 0.85, op: 0.85 }); }
    }
  }

  // ---- order: portico columns, giant pilasters, or an entrance aedicule ----
  if (c.front === "portico") {
    const D = Math.min(Hb / ord.d, bw * 0.4);
    for (let k = 0; k <= pv; k++) column(pv0 + k * bw, ybase, ybody, D);
  } else if (c.front === "pilasters") {
    const D = Math.min(Hb / ord.d, bw * 0.34);
    for (let k = 0; k <= n; k++) { const x = x0 + k * bw; if (k === 0 || k === n || (x >= pv0 - 1 && x <= pv1 + 1) || k % 2 === 0) pilaster(x, ybase, ybody, D); }
  } else if (c.front === "aedicule") {
    const D = bw * 0.2, hh = fh * 0.95, cx0 = AX - bw * 0.62, cx1 = AX + bw * 0.62;
    for (const x of [cx0, cx1]) column(x, ybase, ybase - hh + D * 0.4, D);
    const ya = ybase - hh;
    rect(cx0 - D * 1.3, ya, cx1 + D * 1.3, ya - fh * 0.12, 1);
    // balcony with balusters
    const yb3 = ya - fh * 0.12, bh = fh * 0.28, sg = P(kA.pil);
    L(cx0 - D * 1.3, yb3 - bh, cx1 + D * 1.3, yb3 - bh, 1);
    for (let x = cx0 - D; x <= cx1 + D; x += 7) sg ? put(ctx, sg.id, x, yb3 - bh / 2, fitS(sg, 5, bh * 0.9), { sw: 0.7 }) : L(x, yb3, x, yb3 - bh, 0.6);
  }

  // ---- entablature: architrave, frieze (inscription or repeating parts), cornice with dentils ----
  L(x0 - 2, ybody, x1 + 2, ybody, 1.1); L(x0 - 2, ybody - E * 0.14, x1 + 2, ybody - E * 0.14, 0.6); L(x0 - 2, ybody - E * 0.3, x1 + 2, ybody - E * 0.3, 0.9);
  const fy0 = ybody - E * 0.3, fy1 = ybody - E * 0.66, fcy = (fy0 + fy1) / 2;
  L(x0 - 2, fy1, x1 + 2, fy1, 0.9);
  const inscW = (c.text ? Math.min(Wd * 0.8, Math.max(pv * bw, Wd * 0.5)) : 0);
  if (c.text) inscribe(c.text, AX, fcy, (fy0 - fy1) * 0.62, inscW);
  if (c.order === "doric" && P(kA.pil)) { const tg = P(kA.pil); for (let k = 0; k <= n; k++) { const x = x0 + k * bw; if (c.text && Math.abs(x - AX) < inscW / 2 + 8) continue; put(ctx, tg.id, x, fcy, fitS(tg, bw * 0.3, (fy0 - fy1) * 0.85), { sw: 0.8 }); } }
  else if (P(kA.frieze)) { const fr = P(kA.frieze), s = fitS(fr, bw * 0.9, (fy0 - fy1) * 0.7); for (let k = 0; k < n; k++) { const x = x0 + (k + 0.5) * bw; if (c.text && Math.abs(x - AX) < inscW / 2 + bw * 0.3) continue; put(ctx, fr.id, x, fcy, s, { sw: 0.8 }); } }
  L(x0 - 10, yE, x1 + 10, yE, 1.4); L(x0 - 6, yE + 4, x1 + 6, yE + 4, 0.7);
  for (let x = x0 - 4; x <= x1 + 4; x += 5) L(x, fy1, x, fy1 - (fy1 - yE - 4) * 0.55, 0.45, MINT, 0.7);

  // ---- attic and balustrade ----
  if (c.attic) {
    rect(x0 + 4, yE, x1 - 4, ytop, 0.9); L(x0 - 2, ytop, x1 + 2, ytop, 1.1);
    for (let i = 0; i < n; i++) { const cx = x0 + (i + 0.5) * bw, s = Math.min(bw * 0.3, ha * 0.45); rect(cx - s / 2, yE - ha * 0.28, cx + s / 2, yE - ha * 0.28 - s, 0.6); }
  }
  if (c.balus) {
    const yb4 = ytop, sg = P(kB.pil || kA.pil);
    L(x0, yb4 - hbal, x1, yb4 - hbal, 1); L(x0, yb4 - hbal - 3, x1, yb4 - hbal - 3, 0.6);
    for (let k = 0; k <= n; k++) rect(x0 + k * bw - 4, yb4, x0 + k * bw + 4, yb4 - hbal - 3, 0.7);
    for (let x = x0 + 8; x < x1 - 4; x += 8) { if (Math.abs(((x - x0) % bw)) < 6 || Math.abs(((x - x0) % bw) - bw) < 6) continue; sg ? put(ctx, sg.id, x, yb4 - hbal / 2, fitS(sg, 5, hbal * 0.85), { sw: 0.6 }) : L(x, yb4, x, yb4 - hbal, 0.5); }
  }

  // ---- pediment: raking cornice, tympanum rosette, acroteria ----
  if (c.pediment) {
    const yp = c.attic ? ytop : yE, half = pw, ph = half * Math.tan(c.pitch * Math.PI / 180), apx = AX, apy = yp - ph;
    L(AX - half, yp, apx, apy, 1.4); L(apx, apy, AX + half, yp, 1.4);
    L(AX - half + 10, yp - 3, apx, apy + 7, 0.6); L(apx, apy + 7, AX + half - 10, yp - 3, 0.6);
    L(AX - half, yp, AX + half, yp, 1.1);
    const lp = P(kB.accent), bl = P(g.crown.blade), th = ph * 0.62, tcy = yp - ph * 0.36;
    if (lp) put(ctx, lp.id, AX, tcy, fitS(lp, th * 0.9, th * 0.85), { sw: 0.9 });
    if (bl) { const s = fitS(bl, th * 0.55, th * 0.55); for (const a of [-70, -45]) { const r = th * 0.75, rx = Math.sin(a * Math.PI / 180) * r * 1.5, ry = -Math.cos(a * Math.PI / 180) * r * 0.5; put(ctx, bl.id, AX + rx, tcy + ry + th * 0.2, s, { sw: 0.85, rot: a }); put(ctx, bl.id, AX - rx, tcy + ry + th * 0.2, s, { sw: 0.85, rot: -a, flip: true }); } }
    const ac = P(c.parts.acro), hk = P(kA.hook);
    if (ac) put(ctx, ac.id, apx, apy - 10, fitS(ac, 26, 22), { sw: 1 });
    if (hk) { const s = fitS(hk, 18, 18); put(ctx, hk.id, AX - half + 4, yp - 10, s, { rot: -15 }); put(ctx, hk.id, AX + half - 4, yp - 10, s, { rot: 15, flip: true }); }
  } else if (kA.hook && P(kA.hook)) {
    const hk = P(kA.hook), s = fitS(hk, 16, 16), yt2 = (c.attic ? ytop : yE) - hbal;
    put(ctx, hk.id, x0 - 2, yt2 - 9, s, { rot: -20 }); put(ctx, hk.id, x1 + 2, yt2 - 9, s, { rot: 20, flip: true });
  }

  // ---- stairs up to the base, with cheek walls and lamp standards ----
  if (c.steps > 0) {
    const sh = hb / c.steps, sw0 = (c.front === "portico" ? pv * bw : bw * 1.6) / 2 + 6;
    raw(ctx, `<path d="M${(AX - sw0 - c.steps * 4).toFixed(1)} ${GROUND}V${ybase.toFixed(1)}H${(AX + sw0 + c.steps * 4).toFixed(1)}V${GROUND}Z" fill="#14171d"/>`);
    for (let i = 0; i < c.steps; i++) { const w = sw0 + (c.steps - i) * 4, y = GROUND - i * sh; L(AX - w, y - sh, AX + w, y - sh, 0.8); L(AX - w, y, AX - w, y - sh, 0.5); L(AX + w, y, AX + w, y - sh, 0.5); }
    const cw = sw0 + c.steps * 4 + 2, lp = P(kA.accent), top = ybase - 4;
    for (const s of [-1, 1]) {
      rect(AX + s * cw, GROUND, AX + s * (cw + 12), top, 0.9);
      if (lp) { const ls = fitS(lp, 18, 22), py = top - fh * 0.5; L(AX + s * (cw + 6), top, AX + s * (cw + 6), py, 1.1); put(ctx, lp.id, AX + s * (cw + 6), py - lp.h * ls / 2, ls, { sw: 1 }); }
    }
  }
  [[1, 1.2], [0.8, 0.9], [0.6, 0.9]].forEach(([w, sw], i) => line(ctx, AX - W * 0.48 * w, GROUND + 6 + i * 9, AX + W * 0.48 * w, GROUND + 6 + i * 9, sw, i ? DIM : MINT));

  const top = Math.min(ctx.top, back.top), minX = Math.min(ctx.minX, back.minX, x0 - 30), maxX = Math.max(ctx.maxX, back.maxX, x1 + 30);
  const k = Math.min(1, (GROUND - 22) / Math.max(1, GROUND - top), (AX - 16) / Math.max(1, AX - minX, maxX - AX));
  const defs = new Map([...back.defs, ...ctx.defs]);
  const body = `<g transform="translate(${AX} ${GROUND}) scale(${k.toFixed(4)}) translate(${-AX} ${-GROUND})">${back.out.join("")}${ctx.out.join("")}</g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${defs.size ? `<defs>${[...defs.values()].join("")}</defs>` : ""}<rect width="${W}" height="${H}" fill="#14171d"/>${body}</svg>`;
  return { svg, k, parts: ctx.count + back.count, L: [] };
}
