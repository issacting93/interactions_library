/* ---------- Gothic grammar: cathedral fronts and college ranges ---------- */
// A shape grammar written as named rules. Each rule rewrites one shape into smaller shapes or into
// drawn marks, and each one records what it was observed from (St. John the Divine, St. Thomas,
// Riverside and its seminary range, the Romanesque church). Rules can be switched off one by one,
// and the derivation counts how often each rule fired.
const GO_TYPES = { cathedral: "Cathedral", range: "College" };
const GO_RULES = [
  // cathedral front
  ["F1", "Front → tower | nave | tower", "St. John the Divine and St. Thomas: a tall central nave bay between two tower bays.", "cathedral"],
  ["F2", "Bay edge → buttress", "Every bay is bounded by a buttress; the buttresses are what you count to read the front.", "cathedral"],
  ["F3", "Buttress → setbacks + pinnacles", "Buttresses step back two or three times, each step with a sloped top and a pinnacle against it.", "cathedral"],
  ["F4", "Pinnacle → shaft, gablet, spirelet, crockets, finial", "Each pinnacle is a small spire: a gabled shaft, a pointed cap with hooked leaves up its edges, a knob on top.", "both"],
  ["F5", "Nave → portal / band / arcade / rose / gallery / gable", "The nave stacks in zones: portal, a leaf band, a blind arcade, the rose, a figure gallery, the gable.", "cathedral"],
  ["F6", "Tower → portal / band / arcade / window / stages / top", "Tower bays repeat the lower zones at a smaller size, then rise in stages to a stub, belfry or spire.", "cathedral"],
  ["F7", "Portal → gable + archivolts + jambs + tympanum + doors", "The St. John portal: a steep gable over five or six nested arches, figures in the jambs, a carved tympanum, two doors.", "cathedral"],
  ["F8", "Archivolts → nested arches on one springline", "The arches step inward and share one springing line; each band carries a different repeated carving.", "both"],
  ["F9", "Jamb → column + standing figure, stepped with the bands", "Tall figures stand on short columns, one per arch band, stepping outward on both sides of the door.", "cathedral"],
  ["F10", "Tympanum → ring of foils round a figure, over two cusped arches", "Above the doors: a small rose of quatrefoils round a seated figure, two lobed sub-arches, a frieze of small figures.", "cathedral"],
  ["F11", "Trumeau → column + statue", "The post between the two doors carries a single statue.", "cathedral"],
  ["F12", "Gable → raking edges, crockets, inscription, oculus, finial", "The portal gable: hooked leaves along both edges, a text running up one side and down the other, a round foiled window, a figure at the peak.", "both"],
  ["F13", "Rose → hub + petals + ring of foils, under an arch", "The west rose: a hub, twelve long petals, each ending in a foiled circle, inside a ring and a pointed containing arch.", "cathedral"],
  ["F14", "Arcade → small arches with foiled heads", "Below the rose: a row of small blind arches, each with a lobed shape in its head.", "cathedral"],
  ["F15", "Band course → repeated leaf block", "Square leaf blocks in a row mark each level across the whole front.", "both"],
  ["F16", "Window → containing arch over two lancets and an oculus", "Bar tracery: two pointed lights with a foiled circle above them, all under one arch.", "both"],
  ["F17", "Gallery → canopied niches with figures", "St. Thomas: rows of standing figures under little canopies, here your creatures.", "cathedral"],
  ["F18", "Nave gable → stepped edges, two lancets, star opening", "The St. John nave gable is stepped at its edges with two small windows and a star at the peak.", "cathedral"],
  ["F19", "Tower top → stub | belfry crown | spire", "St. John's towers stop short; Riverside's rises to a crown of pinnacles; a spire finishes the type.", "both"],
  // college range
  ["C1", "Range → bays with buttresses between", "The seminary below Riverside: a long range, bays divided by shallow buttresses.", "range"],
  ["C2", "Bay → windows with hood moulds and label stops", "Mullioned windows, pointed or flat-headed, each under a drip moulding that ends in small carved stops.", "range"],
  ["C3", "Every k bays → cross gable", "Steep cross gables break the eaves at intervals, each with a tall traceried window.", "range"],
  ["C4", "Roof → steep with dormers | battlemented parapet", "Slate roofs with gabled dormers, or a crenellated parapet.", "range"],
  ["C5", "Tower → stages + clock + pinnacle crown", "Riverside's tower: stages that narrow, tall paired lancets, a clock, a crown of pinnacles.", "range"],
  ["C6", "Entrance → pointed door under a hood", "A pointed doorway under a hood moulding, reached by a few steps.", "range"],
  // Romanesque substitutions
  ["R1", "Romanesque: arch → round arch", "The Romanesque church: every arch is a half circle.", "both"],
  ["R2", "Romanesque: rose → wheel", "Its rose is a wheel: spokes as little columns, round arches at the rim.", "both"],
  ["R3", "Romanesque: band → corbel table", "Rows of small round arches run under the gable and along each band.", "both"],
  ["R4", "Romanesque: pinnacle → turret with a cone", "Round turrets with conical caps stand at the corners instead of pinnacles.", "both"],
  ["R5", "Romanesque: wall → two-colour bands", "The stone alternates in two colours in horizontal bands.", "both"],
];
function newGothic(type, seed, keep) {
  const R = rng(seed), int = (a, b) => a + Math.floor(R() * (b - a + 1)), one = a => a[Math.floor(R() * a.length)], odd = n => n % 2 ? n : n + 1;
  const kits = keep?.kits || { A: makeKit(R), B: makeKit(R) };
  const parts = { petal: pick(R, "blade"), bead: pick(R, "bead"), hub: pick(R, "lamp"), crocket: pick(R, "hook"), finial: pick(R, "lamp"), spire: pick(R, "spire"), angel: pick(R, "blade"),
    figures: [pick(R, "lamp"), pick(R, "segment"), pick(R, "lamp"), pick(R, "segment"), pick(R, "lamp")], leaf: pick(R, "frieze"), band2: pick(R, "frieze") };
  const T = {
    cathedral: { naveBays: 5, towerBays: 3, stages: int(1, 3), top: one(["stub", "belfry", "spire"]), petals: one([8, 12, 12, 16]), bands: int(4, 6), gallery: R() < 0.6, text: "SO LOVED THE WORLD", steps: int(5, 9), asym: false },
    range: { bays: odd(int(9, 15)), floors: int(3, 4), gableEvery: int(3, 5), roof: one(["steep", "parapet"]), tower: one(["central", "end", "none"]), window: one(["pointed", "tudor"]), lights: int(2, 3), steps: 2, text: "" }
  };
  return { kind: "gothic", seed, bayW: keep?.bayW ?? int(32, 40), floorH: keep?.floorH ?? int(44, 54), open: 0.72, cornice: 0.32, every: 2, kits,
    crown: keep?.crown || { kind: "none", blade: pick(R, "blade"), spire: pick(R, "spire"), lamp: pick(R, "lamp"), n: 5 }, blocks: [{ bays: 5, floors: 1, off: 0, kit: "A" }],
    go: { type, style: "gothic", off: [], ...T[type], parts } };
}
function mutateGothic(g0, R) {
  const g = JSON.parse(JSON.stringify(g0)), o = g.go, one = a => a[Math.floor(R() * a.length)];
  const ops = o.type === "cathedral" ? [
    () => o.petals = one([6, 8, 10, 12, 16, 20]), () => o.bands = clamp(o.bands + (R() < 0.5 ? -1 : 1), 2, 8), () => o.stages = clamp(o.stages + (R() < 0.5 ? -1 : 1), 0, 4),
    () => o.top = one(["stub", "belfry", "spire"]), () => o.gallery = !o.gallery, () => o.naveBays = one([3, 5, 7]), () => o.towerBays = one([2, 3, 4]),
    () => { o.parts.petal = pick(R, "blade"); o.parts.hub = pick(R, "lamp"); }, () => o.parts.figures = o.parts.figures.map(() => pick(R, one(["lamp", "segment", "blade"]))),
    () => { o.parts.crocket = pick(R, "hook"); o.parts.finial = pick(R, "lamp"); }, () => o.asym = !o.asym
  ] : [
    () => o.bays = clamp(o.bays + (R() < 0.5 ? -2 : 2), 5, 21), () => o.floors = clamp(o.floors + (R() < 0.5 ? -1 : 1), 2, 5), () => o.gableEvery = clamp(o.gableEvery + (R() < 0.5 ? -1 : 1), 0, 7),
    () => o.roof = one(["steep", "parapet"]), () => o.tower = one(["central", "end", "none"]), () => o.window = one(["pointed", "tudor"]), () => o.lights = one([2, 3]),
    () => { o.parts.crocket = pick(R, "hook"); o.parts.finial = pick(R, "lamp"); }
  ];
  if (R() < 0.15) o.style = o.style === "gothic" ? "romanesque" : "gothic";
  const n = 1 + Math.floor(R() * 2); for (let i = 0; i < n; i++) one(ops)();
  g.seed = Math.floor(R() * 1e9);
  return g;
}

function drawGothic(g) {
  const ctx = mkCtx(), o = g.go, P = id => state.byId[id], bw = g.bayW, fh = g.floorH;
  const off = new Set(o.off || []), roman = o.style === "romanesque";
  const fired = {}; const on = id => { if (off.has(id)) return false; if (roman && ["F3", "F4"].includes(id) && !off.has("R4")) { /* pinnacles become turrets */ } fired[id] = (fired[id] || 0) + 1; return true; };
  const rOn = id => roman && !off.has(id) && (fired[id] = (fired[id] || 0) + 1);
  const grow = (x, y) => { ctx.top = Math.min(ctx.top, y); ctx.minX = Math.min(ctx.minX, x); ctx.maxX = Math.max(ctx.maxX, x); };
  const L = (x1, y1, x2, y2, w = 1, c = MINT, op) => { line(ctx, x1, y1, x2, y2, w, c, op); grow(x1, y1); grow(x2, y2); };
  const rect = (x1, y1, x2, y2, w = 1, c = MINT) => { L(x1, y1, x2, y1, w, c); L(x2, y1, x2, y2, w, c); L(x2, y2, x1, y2, w, c); L(x1, y2, x1, y1, w, c); };
  const path = (d, w = 1, c = MINT, extra = "") => ctx.out.push(`<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`);
  const f = v => v.toFixed(1);
  const xeno = ch => "P" + String(359 + "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".indexOf(ch)).padStart(3, "0");
  const fig = (i) => P(o.parts.figures[i % o.parts.figures.length]);

  // --- arches: pointed (two arcs of radius = span, the equilateral arch) or round (R1) ---
  const archRise = (s) => roman && rOn("R1") !== false && roman ? s / 2 : s * Math.sqrt(3) / 2;
  const isRound = () => roman && !off.has("R1");
  const arch = (cx, y, s, w = 1, c = MINT) => {
    if (s <= 1) return;
    const xl = cx - s / 2, xr = cx + s / 2;
    if (isRound()) { path(`M${f(xl)} ${f(y)} A${f(s / 2)} ${f(s / 2)} 0 0 1 ${f(xr)} ${f(y)}`, w, c); grow(cx, y - s / 2); }
    else { const ya = y - s * Math.sqrt(3) / 2; path(`M${f(xl)} ${f(y)} A${f(s)} ${f(s)} 0 0 1 ${f(cx)} ${f(ya)} A${f(s)} ${f(s)} 0 0 1 ${f(xr)} ${f(y)}`, w, c); grow(cx, ya); }
    grow(xl, y); grow(xr, y);
  };
  const apex = (y, s) => isRound() ? y - s / 2 : y - s * Math.sqrt(3) / 2;
  // points (and tangent angle, degrees) evenly along an arch, for parts set along a band
  const archPts = (cx, y, s, n) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (isRound()) { const a = Math.PI + t * Math.PI; out.push([cx + s / 2 * Math.cos(a), y + s / 2 * Math.sin(a), a * 180 / Math.PI + 90]); }
      else if (t <= 0.5) { const a = Math.PI + (t / 0.5) * (Math.PI / 3); out.push([cx + s / 2 + s * Math.cos(a), y + s * Math.sin(a), a * 180 / Math.PI + 90]); }
      else { const a = -Math.PI / 3 + ((t - 0.5) / 0.5) * (Math.PI / 3); out.push([cx - s / 2 + s * Math.cos(a), y + s * Math.sin(a), a * 180 / Math.PI + 90]); }
    }
    return out;
  };
  const foil = (cx, cy, r, lobes = 4, w = 0.8) => {   // a lobed opening: circles round a centre, in a ring
    path(`M${f(cx - r)} ${f(cy)} a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0 a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0`, w);
    for (let i = 0; i < lobes; i++) { const a = i / lobes * 2 * Math.PI - Math.PI / 2, lx = cx + Math.cos(a) * r * 0.42, ly = cy + Math.sin(a) * r * 0.42, lr = r * 0.4; path(`M${f(lx - lr)} ${f(ly)} a${f(lr)} ${f(lr)} 0 1 0 ${f(2 * lr)} 0 a${f(lr)} ${f(lr)} 0 1 0 ${f(-2 * lr)} 0`, w * 0.7); }
    grow(cx - r, cy - r); grow(cx + r, cy + r);
  };
  const lancet = (cx, yb, w, h, lw = 0.9) => { const ys = yb - Math.max(0, h - (isRound() ? w / 2 : w * Math.sqrt(3) / 2)); L(cx - w / 2, yb, cx - w / 2, ys, lw); L(cx + w / 2, yb, cx + w / 2, ys, lw); arch(cx, ys, w, lw); L(cx - w / 2, yb, cx + w / 2, yb, lw); return ys; };
  // F16: a containing arch over two lights and a foiled oculus
  const tracery = (cx, yb, w, h) => {
    if (!on("F16")) { lancet(cx, yb, w, h); return; }
    const ys = lancet(cx, yb, w, h, 1.1), lw = w * 0.4;
    for (const s of [-1, 1]) lancet(cx + s * w * 0.24, yb, lw, (yb - ys) + lw * 0.6, 0.7);
    foil(cx, ys - w * 0.12, w * 0.2, 4, 0.7);
  };
  // F15 / R3: a band course of leaf blocks, or a Romanesque corbel table of little round arches
  const band = (x0, x1, y, h) => {
    L(x0, y, x1, y, 0.9); L(x0, y - h, x1, y - h, 0.9);
    if (roman && !off.has("R3")) { rOn("R3"); const n = Math.max(2, Math.round((x1 - x0) / (h * 1.4))), s = (x1 - x0) / n; for (let i = 0; i < n; i++) path(`M${f(x0 + i * s)} ${f(y - h * 0.15)} A${f(s / 2)} ${f(s / 2)} 0 0 1 ${f(x0 + (i + 1) * s)} ${f(y - h * 0.15)}`, 0.6); return; }
    if (!on("F15")) return;
    const p = P(o.parts.leaf) || P(g.kits.A.frieze); if (!p) return;
    const s = fitS(p, h * 1.3, h * 0.8), step = Math.max(6, p.w * s * 1.1);
    for (let x = x0 + step / 2; x < x1 - step / 3; x += step) put(ctx, p.id, x, y - h / 2, s, { sw: 0.8 });
  };
  // F4 / R4: pinnacle, or a Romanesque turret with a cone
  const pinnacle = (x, yb, w, h) => {
    if (roman && !off.has("R4")) { rOn("R4"); const tw = w * 0.9; rect(x - tw / 2, yb, x + tw / 2, yb - h * 0.5, 0.8); L(x - tw / 2 - 2, yb - h * 0.5, x + tw / 2 + 2, yb - h * 0.5, 0.9); L(x - tw / 2, yb - h * 0.5, x, yb - h, 0.9); L(x, yb - h, x + tw / 2, yb - h * 0.5, 0.9); return; }
    if (!on("F4")) { L(x, yb, x, yb - h, 0.8); return; }
    const ys = yb - h * 0.42, yt = yb - h;
    rect(x - w / 2, yb, x + w / 2, ys, 0.8);
    L(x - w / 2 - 1, ys, x, ys - w * 0.6, 0.8); L(x, ys - w * 0.6, x + w / 2 + 1, ys, 0.8);
    L(x - w * 0.42, ys - w * 0.3, x, yt, 0.9); L(x, yt, x + w * 0.42, ys - w * 0.3, 0.9);
    const ck = P(o.parts.crocket);
    if (ck) { const s = fitS(ck, w * 0.42, w * 0.42); for (let k = 1; k <= 3; k++) { const t = k / 4, yy = ys - w * 0.3 + (yt - (ys - w * 0.3)) * t, dx = w * 0.42 * (1 - t); put(ctx, ck.id, x - dx - 2, yy, s, { rot: -30, sw: 0.7 }); put(ctx, ck.id, x + dx + 2, yy, s, { rot: 30, flip: true, sw: 0.7 }); } }
    const fn = P(o.parts.finial); if (fn) put(ctx, fn.id, x, yt - w * 0.3, fitS(fn, w * 0.6, w * 0.7), { sw: 0.8 });
  };
  // F3: buttress with setbacks, a pinnacle on each setback, a niche figure part way up
  const buttress = (x, yb, yt, w) => {
    if (!on("F2")) return;
    if (roman && !off.has("R4")) { rect(x - w * 0.35, yb, x + w * 0.35, yt, 0.8); return; }   // a flat pilaster strip
    const steps = on("F3") ? 3 : 1, H = yb - yt;
    for (let k = 0; k < steps; k++) {
      const wk = w * (1 - k * 0.2), y0 = yb - k * H / steps, y1 = yb - (k + 1) * H / steps + (k < steps - 1 ? w * 0.4 : 0);
      L(x - wk / 2, y0, x - wk / 2, y1, 0.9); L(x + wk / 2, y0, x + wk / 2, y1, 0.9);
      if (k < steps - 1) { const wn = w * (1 - (k + 1) * 0.2); L(x - wk / 2, y1, x - wn / 2, y1 - w * 0.4, 0.8); L(x + wk / 2, y1, x + wn / 2, y1 - w * 0.4, 0.8); if (steps > 1) pinnacle(x + wk / 2 + w * 0.25, y1 + w * 0.2, w * 0.38, H / steps * 0.75); }
      if (k === 1 && on("F17")) { const fp = fig(k + Math.round(x)); if (fp) { const fy = (y0 + y1) / 2; path(`M${f(x - wk * 0.3)} ${f(fy + wk * 0.5)}V${f(fy - wk * 0.4)}L${f(x)} ${f(fy - wk * 0.75)}L${f(x + wk * 0.3)} ${f(fy - wk * 0.4)}V${f(fy + wk * 0.5)}`, 0.7); put(ctx, fp.id, x, fy, fitS(fp, wk * 0.5, wk * 0.85), { sw: 0.8 }); } }
    }
    return yt;
  };
  // F12: gable with crockets, an inscription along the rakes, an oculus, a finial figure
  const gable = (cx, yb, half, pitch, opts = {}) => {
    const ya = yb - half * Math.tan(pitch * Math.PI / 180), ang = pitch;
    L(cx - half, yb, cx, ya, 1.3); L(cx, ya, cx + half, yb, 1.3);
    L(cx - half + 8, yb, cx, ya + 9, 0.6); L(cx, ya + 9, cx + half - 8, yb, 0.6);
    if (!on("F12")) return ya;
    const ck = P(o.parts.crocket);
    if (ck) { const n = Math.max(3, Math.round(Math.hypot(half, yb - ya) / 22)), s = fitS(ck, 12, 12); for (let k = 1; k < n; k++) { const t = k / n; put(ctx, ck.id, cx - half + half * t - 5, yb + (ya - yb) * t - 6, s, { rot: -ang - 20, sw: 0.75 }); put(ctx, ck.id, cx + half - half * t + 5, yb + (ya - yb) * t - 6, s, { rot: ang + 20, flip: true, sw: 0.75 }); } }
    if (opts.text) {   // runs up the left rake and down the right
      const t = opts.text.toUpperCase().replace(/[^A-Z0-9 ]/g, ""), len = Math.hypot(half, yb - ya) * 2 - 30, adv = Math.min(9, len / Math.max(1, t.length));
      [...t].forEach((ch, i) => {
        if (ch === " ") return;
        let d = 15 + i * adv, x, y, r;
        const side = Math.hypot(half, yb - ya);
        if (d < side) { const u = d / side; x = cx - half + half * u + 3; y = yb + (ya - yb) * u + 9; r = -ang; }
        else { const u = (d - side) / side; x = cx + half * u - 3; y = ya + (yb - ya) * u + 9; r = ang; }
        const p = P(xeno(ch)); if (p) put(ctx, p.id, x, y, adv / 30, { rot: r, sw: 0.7 });
      });
    }
    if (opts.oculus !== false) { const r = half * 0.26, cy = yb - (yb - ya) * 0.42; foil(cx, cy, r, 4, 0.8); const sp = P(g.kits.B.bay); if (sp) put(ctx, sp.id, cx, cy, fitS(sp, r * 0.9, r * 0.9), { sw: 0.8 }); }
    const fn = opts.figure ? P(o.parts.angel) : P(o.parts.finial);
    if (fn) put(ctx, fn.id, cx, ya - 12, fitS(fn, opts.figure ? 22 : 16, opts.figure ? 30 : 18), { sw: 0.9 });
    return ya;
  };
  // F7 – F11: the portal
  const portal = (cx, yG, s, nb, big) => {
    if (!on("F7")) { arch(cx, yG - s * 0.85, s, 1.2); L(cx - s / 2, yG, cx - s / 2, yG - s * 0.85, 1.2); L(cx + s / 2, yG, cx + s / 2, yG - s * 0.85, 1.2); return; }
    const ys = yG - s * (big ? 0.95 : 0.85), step = s * 0.075, outer = s + 2 * nb * step;
    // F8 archivolts: nested arches on one springline, parts set along every other band
    if (on("F8")) for (let k = nb; k >= 0; k--) {
      const sk = s + 2 * k * step; arch(cx, ys, sk, k === nb ? 1.3 : 0.75);
      if (k % 2 === 1) { const p = P(k % 4 === 1 ? o.parts.leaf : o.parts.band2) || P(g.kits.A.frieze); if (p) { const pts = archPts(cx, ys, sk - step, Math.max(6, Math.round(sk / 9))); const sc = fitS(p, step * 1.1, step * 0.9); pts.slice(1, -1).forEach(([x, y, a]) => put(ctx, p.id, x, y, sc, { rot: a, sw: 0.6 })); } }
    } else arch(cx, ys, outer, 1.3);
    // F9 jambs: a column and a standing figure for each band, both sides
    for (let k = 0; k <= nb; k++) for (const sd of [-1, 1]) {
      const x = cx + sd * (s / 2 + k * step + step / 2);
      L(x - step * 0.3, yG, x - step * 0.3, ys, 0.6); L(x + step * 0.3, yG, x + step * 0.3, ys, 0.6);
      if (on("F9") && big) { const fp = fig(k); if (fp) put(ctx, fp.id, x, ys + (yG - ys) * 0.35, fitS(fp, step * 0.95, (yG - ys) * 0.42), { sw: 0.75, flip: sd > 0 && fp.side !== "center" }); }
    }
    L(cx - outer / 2, ys, cx + outer / 2, ys, 0.9);
    // doors, lintel frieze, tympanum
    const yl = ys + s * 0.12;
    rect(cx - s / 2 + 3, yG, cx - 2, yl, 0.9); rect(cx + 2, yG, cx + s / 2 - 3, yl, 0.9);
    for (let i = 1; i < 4; i++) { L(cx - s / 2 + 3, yG - (yG - yl) * i / 4, cx - 2, yG - (yG - yl) * i / 4, 0.35); L(cx + 2, yG - (yG - yl) * i / 4, cx + s / 2 - 3, yG - (yG - yl) * i / 4, 0.35); }
    if (big && on("F10")) {
      const fr = fig(0), n = Math.max(4, Math.round(s / 12));
      L(cx - s / 2, ys, cx + s / 2, ys, 0.8);
      if (fr) for (let i = 0; i < n; i++) put(ctx, fr.id, cx - s / 2 + (i + 0.5) * s / n, (ys + yl) / 2, fitS(fr, s / n * 0.8, (yl - ys) * 0.85), { sw: 0.6 });
      for (const sd of [-1, 1]) { const sc = cx + sd * s / 4; arch(sc, ys, s / 2 - 4, 0.9); const b = P(o.parts.bead); if (b) archPts(sc, ys, s / 2 - 10, 7).slice(1, -1).forEach(([x, y]) => put(ctx, b.id, x, y, fitS(b, 6, 6), { sw: 0.6 })); }
      const tr = s * 0.17, ty = ys - s * 0.6; path(`M${f(cx - tr)} ${f(ty)} a${f(tr)} ${f(tr)} 0 1 0 ${f(2 * tr)} 0 a${f(tr)} ${f(tr)} 0 1 0 ${f(-2 * tr)} 0`, 0.9);
      for (let i = 0; i < 7; i++) { const a = i / 7 * 2 * Math.PI - Math.PI / 2; foil(cx + Math.cos(a) * tr * 0.72, ty + Math.sin(a) * tr * 0.72, tr * 0.24, 4, 0.55); }
      const hub = P(o.parts.hub); if (hub) put(ctx, hub.id, cx, ty, fitS(hub, tr * 0.9, tr * 1.1), { sw: 0.85 });
      // two beasts in the spandrels (your blade parts), mirrored
      const bst = P(o.parts.petal); if (bst) { const bs = fitS(bst, s * 0.18, s * 0.18); put(ctx, bst.id, cx - s * 0.3, ys - s * 0.45, bs, { sw: 0.7, rot: -20 }); put(ctx, bst.id, cx + s * 0.3, ys - s * 0.45, bs, { sw: 0.7, rot: 20, flip: true }); }
    } else foil(cx, ys - s * 0.35, s * 0.16, 4, 0.8);
    if (on("F11")) { L(cx - 3, yG, cx - 3, yl, 0.8); L(cx + 3, yG, cx + 3, yl, 0.8); const sp = fig(2); if (sp && big) put(ctx, sp.id, cx, (yG + yl) / 2 - (yG - yl) * 0.1, fitS(sp, 10, (yG - yl) * 0.45), { sw: 0.8 }); }
    const gh = outer / 2 + step * 1.5;
    return big || true ? gable(cx, ys - step, gh, roman ? 35 : 58, { text: big ? o.text : "", figure: big }) : apex(ys, outer);
  };
  // F13 / R2: the rose (or the Romanesque wheel)
  const rose = (cx, cy, R) => {
    if (!on("F13")) { foil(cx, cy, R, 6, 1); return; }
    const n = clamp(o.petals, 4, 24);
    for (const r of [R, R * 0.95]) path(`M${f(cx - r)} ${f(cy)} a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0 a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0`, r === R ? 1.3 : 0.7);
    grow(cx - R, cy - R); grow(cx + R, cy + R);
    const hub = R * 0.18; path(`M${f(cx - hub)} ${f(cy)} a${f(hub)} ${f(hub)} 0 1 0 ${f(2 * hub)} 0 a${f(hub)} ${f(hub)} 0 1 0 ${f(-2 * hub)} 0`, 1);
    const hp = P(o.parts.hub); if (hp) put(ctx, hp.id, cx, cy, fitS(hp, hub * 1.4, hub * 1.6), { sw: 0.8 });
    if (roman && !off.has("R2")) {
      rOn("R2"); const sg = P(g.kits.A.pil);
      for (let i = 0; i < n; i++) { const a = i / n * 2 * Math.PI - Math.PI / 2, x1 = cx + Math.cos(a) * hub, y1 = cy + Math.sin(a) * hub, x2 = cx + Math.cos(a) * R * 0.78, y2 = cy + Math.sin(a) * R * 0.78; L(x1, y1, x2, y2, 0.9); if (sg) put(ctx, sg.id, (x1 + x2) / 2, (y1 + y2) / 2, fitS(sg, R * 0.08, R * 0.5), { rot: a * 180 / Math.PI + 90, sw: 0.7 }); const a2 = (i + 1) / n * 2 * Math.PI - Math.PI / 2; path(`M${f(x2)} ${f(y2)} A${f(R * 0.3)} ${f(R * 0.3)} 0 0 1 ${f(cx + Math.cos(a2) * R * 0.78)} ${f(cy + Math.sin(a2) * R * 0.78)}`, 0.7); }
      const b = P(o.parts.bead); if (b) for (let i = 0; i < n * 2; i++) { const a = (i + 0.5) / (n * 2) * 2 * Math.PI; put(ctx, b.id, cx + Math.cos(a) * R * 0.88, cy + Math.sin(a) * R * 0.88, fitS(b, R * 0.09, R * 0.09), { sw: 0.6 }); }
      return;
    }
    const d = Math.PI / n * 0.82, pp = P(o.parts.petal), bp = P(o.parts.bead);
    for (let i = 0; i < n; i++) {
      const a = i / n * 2 * Math.PI - Math.PI / 2, pt = (r, t) => [cx + Math.cos(t) * r, cy + Math.sin(t) * r];
      const [ax, ay] = pt(hub, a - d * 0.55), [bx, by] = pt(R * 0.55, a - d), [tx, ty] = pt(R * 0.7, a), [cx2, cy2] = pt(R * 0.55, a + d), [dx, dy] = pt(hub, a + d * 0.55);
      path(`M${f(ax)} ${f(ay)}Q${f(bx)} ${f(by)} ${f(tx)} ${f(ty)}Q${f(cx2)} ${f(cy2)} ${f(dx)} ${f(dy)}`, 0.85);
      if (pp && i % 2 === 0) { const [mx, my] = pt(R * 0.43, a); put(ctx, pp.id, mx, my, fitS(pp, R * 0.16, R * 0.3), { rot: a * 180 / Math.PI + 90, sw: 0.7 }); }
      const [ox, oy] = pt(R * 0.83, a); foil(ox, oy, R * 0.1, 4, 0.6);
      if (bp) put(ctx, bp.id, ox, oy, fitS(bp, R * 0.09, R * 0.09), { sw: 0.6 });
      const [sx, sy] = pt(R * 0.8, a + Math.PI / n); foil(sx, sy, R * 0.055, 3, 0.5);
    }
  };
  // F14: blind arcade
  const arcade = (x0, x1, yb, h) => {
    if (!on("F14")) return;
    const n = Math.max(2, Math.round((x1 - x0) / (h * 0.62))), s = (x1 - x0) / n;
    for (let i = 0; i < n; i++) { const cx = x0 + (i + 0.5) * s, ys = yb - h + (isRound() ? s / 2 : s * 0.866) * 0.9; L(cx - s / 2 + 1.5, yb, cx - s / 2 + 1.5, ys, 0.6); L(cx + s / 2 - 1.5, yb, cx + s / 2 - 1.5, ys, 0.6); arch(cx, ys, s - 3, 0.75); foil(cx, ys - s * 0.32, s * 0.2, 3, 0.5); }
  };
  // F17: gallery of figures under canopies
  const gallery = (x0, x1, yb, h) => {
    if (!on("F17")) return;
    const n = Math.max(3, Math.round((x1 - x0) / (h * 0.45))), s = (x1 - x0) / n;
    L(x0, yb, x1, yb, 0.9);
    for (let i = 0; i < n; i++) { const cx = x0 + (i + 0.5) * s, fp = fig(i); L(cx - s / 2, yb, cx - s / 2, yb - h * 0.8, 0.5); arch(cx, yb - h * 0.72, s * 0.9, 0.7); L(cx - s * 0.3, yb - h * 0.72 - s * 0.6, cx, yb - h, 0.6); L(cx, yb - h, cx + s * 0.3, yb - h * 0.72 - s * 0.6, 0.6); if (fp) put(ctx, fp.id, cx, yb - h * 0.38, fitS(fp, s * 0.7, h * 0.62), { sw: 0.75 }); }
    L(x1, yb, x1, yb - h * 0.8, 0.5);
  };
  // R5: two-colour bands across a wall
  const banding = (x0, x1, yb, yt) => { if (!roman || off.has("R5")) return; rOn("R5"); for (let y = yb - 10, k = 0; y > yt; y -= 10, k++) if (k % 2) L(x0, y, x1, y, 0.35, DIM); };

  if (o.type === "range") drawRange(); else drawCathedral();

  function drawCathedral() {
    on("F1");
    const nbN = clamp(o.naveBays, 3, 9), nbT = clamp(o.towerBays, 2, 5), naveW = nbN * bw, towerW = nbT * bw, W = naveW + 2 * towerW, x0 = AX - W / 2;
    const yG = GROUND - clamp(o.steps, 0, 16) * 6;
    // steps across the whole front
    for (let i = 0; i < o.steps; i++) { const y = GROUND - i * 6, w = W / 2 + 20 + (o.steps - i) * 4; L(AX - w, y - 6, AX + w, y - 6, 0.6); }
    const bands = clamp(o.bands, 2, 8), sP = naveW * 0.55;
    const xs = [x0, x0 + towerW, x0 + towerW + naveW, x0 + W];
    // ----- nave (F5) -----
    on("F5");
    const yPortalTop = yG - sP * 0.95 - (sP + 2 * bands * sP * 0.075) * (isRound() ? 0.5 : 0.866) - sP * 0.15;
    const gTop = portal(AX, yG, sP, bands, true);
    const yBand = Math.min(yPortalTop, yG - naveW * 1.05), bh = bw * 0.32;
    const R = naveW * 0.34, yArc = yBand - bh - bw * 1.3;
    band(xs[0], xs[3], yBand, bh); arcade(xs[0], xs[3], yBand - bh, bw * 1.3);
    const cy = yArc - R - bw * 0.35;
    rose(AX, cy, R);
    for (let k = 0; k < 2; k++) arch(AX, cy + R * 0.25, 2 * R * 1.22 + k * 10, k ? 0.7 : 1.2);
    L(AX - R * 1.22, cy + R * 0.25, AX - R * 1.22, yArc, 0.9); L(AX + R * 1.22, cy + R * 0.25, AX + R * 1.22, yArc, 0.9);
    let yN = apex(cy + R * 0.25, 2 * R * 1.22 + 10) - bw * 0.3;
    if (o.gallery) { band(xs[1], xs[2], yN, bh * 0.8); gallery(xs[1] + 4, xs[2] - 4, yN - bh * 0.8, bw * 1.5); yN -= bh * 0.8 + bw * 1.5; }
    band(xs[1], xs[2], yN, bh);
    const yGb = yN - bh;
    // F18 nave gable: stepped edges, two lancets, a star at the peak
    if (on("F18")) {
      const half = naveW / 2, ya = yGb - half * 0.95, n = 8;
      let px = AX - half, py = yGb; for (let i = 0; i < n; i++) { const nx = AX - half + half * (i + 1) / n, ny = yGb - (yGb - ya) * (i + 1) / n; L(px, py, px, ny, 0.9); L(px, ny, nx, ny, 0.9); px = nx; py = ny; }
      px = AX + half; py = yGb; for (let i = 0; i < n; i++) { const nx = AX + half - half * (i + 1) / n, ny = yGb - (yGb - ya) * (i + 1) / n; L(px, py, px, ny, 0.9); L(px, ny, nx, ny, 0.9); px = nx; py = ny; }
      for (const s of [-1, 1]) lancet(AX + s * half * 0.18, yGb - (yGb - ya) * 0.2, bw * 0.28, (yGb - ya) * 0.35, 0.8);
      foil(AX, ya + (yGb - ya) * 0.18, bw * 0.3, 6, 0.8);
    } else gable(AX, yGb, naveW / 2, 40, { oculus: false });
    banding(xs[1], xs[2], yG, yGb);
    L(xs[1], yG, xs[1], yGb, 1); L(xs[2], yG, xs[2], yGb, 1);
    // ----- towers (F6) -----
    on("F6");
    const stageH = towerW * 0.95, stages = clamp(o.stages, 0, 5);
    for (const [tx0, tx1, side] of [[xs[0], xs[1], -1], [xs[2], xs[3], 1]]) {
      const tcx = (tx0 + tx1) / 2, tw = tx1 - tx0, asymCut = o.asym && side > 0 ? 1 : 0;
      portal(tcx, yG, tw * 0.5, Math.max(2, bands - 2), false);
      tracery(tcx, yArc - bw * 0.3, tw * 0.48, cy + R - (yArc - R * 2.3));
      banding(tx0, tx1, yG, yGb);
      let yt = yGb;
      for (let st = 0; st < stages - asymCut; st++) {
        band(tx0, tx1, yt, bh * 0.8);
        const y0 = yt - bh * 0.8; for (const s of [-1, 1]) lancet(tcx + s * tw * 0.2, y0 - stageH * 0.12, tw * 0.22, stageH * 0.7, 0.9);
        yt = y0 - stageH;
      }
      L(tx0, yG, tx0, yt, 1.1); L(tx1, yG, tx1, yt, 1.1);
      // F19 tower top
      if (on("F19")) {
        if (o.top === "stub") { L(tx0 - 4, yt, tx1 + 4, yt, 1.3); for (const x of [tx0 + tw * 0.12, tx1 - tw * 0.12]) rect(x - tw * 0.08, yt, x + tw * 0.08, yt - tw * 0.35, 0.9); for (let x = tx0 + tw * 0.3; x < tx1 - tw * 0.25; x += tw * 0.1) L(x, yt, x, yt - tw * 0.18, 0.6); }
        else if (o.top === "belfry") { L(tx0 - 4, yt, tx1 + 4, yt, 1.3); for (const x of [tx0, tx0 + tw / 3, tx1 - tw / 3, tx1]) pinnacle(x, yt, tw * 0.12, tw * 0.75); arcade(tx0 + 4, tx1 - 4, yt, tw * 0.2); }
        else { L(tx0, yt, tcx, yt - tw * 2.4, 1.2); L(tcx, yt - tw * 2.4, tx1, yt, 1.2); L(tcx, yt, tcx, yt - tw * 2.4, 0.4); const ck = P(o.parts.crocket); if (ck) for (let k = 1; k < 8; k++) { const t = k / 8; put(ctx, ck.id, tx0 + (tcx - tx0) * t - 4, yt - tw * 2.4 * t, fitS(ck, 10, 10), { rot: -60, sw: 0.7 }); put(ctx, ck.id, tx1 - (tx1 - tcx) * t + 4, yt - tw * 2.4 * t, fitS(ck, 10, 10), { rot: 60, flip: true, sw: 0.7 }); } const fn = P(o.parts.finial); if (fn) put(ctx, fn.id, tcx, yt - tw * 2.4 - 10, fitS(fn, 16, 20)); for (const x of [tx0, tx1]) pinnacle(x, yt, tw * 0.12, tw * 0.6); }
      } else L(tx0, yt, tx1, yt, 1.2);
    }
    // buttresses on every bay edge, full height of the towers
    const yTop = yGb - stages * (stageH + bh * 0.8);
    xs.forEach((x, i) => buttress(x, yG, (i === 0 || i === 3) ? yTop + bw : yTop + bw * 0.6, bw * 0.75));
    void gTop;
  }

  function drawRange() {
    on("C1");
    const n = clamp(o.bays, 3, 25), W = n * bw, x0 = AX - W / 2, x1 = AX + W / 2, plinth = fh * 0.35, yG = GROUND, yE = yG - plinth - o.floors * fh;
    rect(x0, yG, x1, yG - plinth, 0.9); L(x0 - 3, yG - plinth, x1 + 3, yG - plinth, 1.1);
    L(x0, yG - plinth, x0, yE, 1.1); L(x1, yG - plinth, x1, yE, 1.1);
    banding(x0, x1, yG, yE);
    const towerAt = o.tower === "central" ? (n - 1) / 2 : o.tower === "end" ? n - 1 : -1;
    const gEvery = clamp(o.gableEvery, 0, 9), gableBay = i => on("C3") && gEvery > 0 && i !== towerAt && (i % gEvery === Math.floor(gEvery / 2));
    for (let fl = 0; fl < o.floors; fl++) { const yf = yG - plinth - fl * fh; if (fl) band(x0, x1, yf + 2, 5); }
    for (let i = 0; i < n; i++) {
      const cx = x0 + (i + 0.5) * bw;
      if (i === towerAt) continue;
      for (let fl = 0; fl < o.floors; fl++) {
        const yb = yG - plinth - fl * fh - fh * 0.16, h = fh * 0.62, ww = bw * 0.62, lights = clamp(o.lights, 1, 4);
        if (o.window === "pointed" || isRound()) { if (lights >= 2 && on("F16")) tracery(cx, yb, ww, h); else lancet(cx, yb, ww * 0.6, h); }
        else { rect(cx - ww / 2, yb, cx + ww / 2, yb - h, 0.9); for (let k = 1; k < lights; k++) L(cx - ww / 2 + ww * k / lights, yb, cx - ww / 2 + ww * k / lights, yb - h, 0.5); L(cx - ww / 2, yb - h * 0.62, cx + ww / 2, yb - h * 0.62, 0.45); }
        // C2 hood mould with label stops
        if (on("C2")) { const yh = yb - h - 4; L(cx - ww / 2 - 4, yh, cx + ww / 2 + 4, yh, 0.9); L(cx - ww / 2 - 4, yh, cx - ww / 2 - 4, yh + 8, 0.9); L(cx + ww / 2 + 4, yh, cx + ww / 2 + 4, yh + 8, 0.9); const ls = P(g.kits.A.hook); if (ls) { const s = fitS(ls, 7, 7); put(ctx, ls.id, cx - ww / 2 - 4, yh + 10, s, { sw: 0.7 }); put(ctx, ls.id, cx + ww / 2 + 4, yh + 10, s, { sw: 0.7, flip: true }); } }
      }
      if (gableBay(i)) { const gw = bw * 0.85; L(cx - gw, yE, cx - gw, yE - fh * 0.2, 1); L(cx + gw, yE, cx + gw, yE - fh * 0.2, 1); gable(cx, yE - fh * 0.2, gw + 4, 55, { oculus: true }); tracery(cx, yE - fh * 0.25, bw * 0.7, fh * 0.9); }
      if (o.buttress && i > 0 && on("F2")) { const bx = x0 + i * bw; for (const y of [yG - plinth, yG - plinth - fh * o.floors * 0.5]) { L(bx - 4, y, bx - 4, y - fh * o.floors * 0.5 + 6, 0.7); L(bx + 4, y, bx + 4, y - fh * o.floors * 0.5 + 6, 0.7); L(bx - 4, y - fh * o.floors * 0.5 + 6, bx - 2, y - fh * o.floors * 0.5, 0.6); L(bx + 4, y - fh * o.floors * 0.5 + 6, bx + 2, y - fh * o.floors * 0.5, 0.6); } }
    }
    // C4 roof: steep with dormers, or a battlemented parapet
    if (on("C4") && o.roof === "steep") {
      const rh = fh * 1.2; L(x0 - 6, yE, x0 + rh * 0.8, yE - rh, 1); L(x0 + rh * 0.8, yE - rh, x1 - rh * 0.8, yE - rh, 1.1); L(x1 - rh * 0.8, yE - rh, x1 + 6, yE, 1); L(x0 - 6, yE, x1 + 6, yE, 1.1);
      for (let i = 1; i < n - 1; i += 2) { if (gableBay(i) || i === towerAt) continue; const cx = x0 + (i + 0.5) * bw, dw = bw * 0.3, dy = yE - rh * 0.35; rect(cx - dw, dy, cx + dw, dy - fh * 0.3, 0.7); L(cx - dw - 3, dy - fh * 0.3, cx, dy - fh * 0.3 - dw * 0.9, 0.8); L(cx, dy - fh * 0.3 - dw * 0.9, cx + dw + 3, dy - fh * 0.3, 0.8); L(cx, dy, cx, dy - fh * 0.3, 0.4); }
    } else if (on("C4")) {
      const ph = fh * 0.3; L(x0 - 3, yE, x1 + 3, yE, 1.1); L(x0, yE - ph * 0.5, x1, yE - ph * 0.5, 0.8);
      for (let x = x0, k = 0; x < x1 - 1; x += bw / 3, k++) if (k % 2 === 0) rect(x, yE - ph * 0.5, Math.min(x1, x + bw / 3), yE - ph, 0.7);
    } else L(x0, yE, x1, yE, 1);
    // C5 tower
    if (towerAt >= 0) {
      const tw = bw * 1.6, tcx = x0 + (towerAt + 0.5) * bw, stages = 3, sh = fh * 1.3;
      let yt = yE; rect(tcx - tw / 2, yG, tcx + tw / 2, yE, 1);
      if (on("C6")) { const dw = bw * 0.6; lancet(tcx, yG, dw, fh * 1.1, 1.1); L(tcx - dw / 2 - 5, yG - fh * 1.1 - 3, tcx + dw / 2 + 5, yG - fh * 1.1 - 3, 0.9); for (let k = 0; k < o.steps; k++) L(tcx - dw / 2 - 8 - k * 4, yG + k * 0, tcx + dw / 2 + 8 + k * 4, yG, 0.5); }
      if (on("C5")) {
        for (let st = 0; st < stages; st++) {
          const w = tw * (1 - st * 0.08); rect(tcx - w / 2, yt, tcx + w / 2, yt - sh, 1); band(tcx - w / 2, tcx + w / 2, yt, 5);
          if (st === 1) { const r = w * 0.22; foil(tcx, yt - sh * 0.45, r, 12, 0.8); L(tcx, yt - sh * 0.45, tcx, yt - sh * 0.45 - r * 0.7, 0.9); L(tcx, yt - sh * 0.45, tcx + r * 0.5, yt - sh * 0.45, 0.9); }
          else for (const s of [-1, 1]) lancet(tcx + s * w * 0.2, yt - sh * 0.1, w * 0.22, sh * 0.75, 0.9);
          yt -= sh;
        }
        const w = tw * (1 - stages * 0.08); L(tcx - w / 2 - 4, yt, tcx + w / 2 + 4, yt, 1.2);
        for (const x of [tcx - w / 2, tcx - w / 6, tcx + w / 6, tcx + w / 2]) pinnacle(x, yt, w * 0.14, w * 0.8);
      }
    } else if (on("C6")) { const cx = AX, dw = bw * 0.6; lancet(cx, yG, dw, fh * 1.05, 1.1); }
  }

  const top = ctx.top, minX = ctx.minX, maxX = ctx.maxX;
  const k = Math.min(2.6, (GROUND - 30) / Math.max(1, GROUND - top), (AX - 24) / Math.max(1, AX - minX, maxX - AX));
  const body = `<g transform="translate(${AX} ${GROUND}) scale(${k.toFixed(4)}) translate(${-AX} ${-GROUND})">${ctx.out.join("")}</g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${ctx.defs.size ? `<defs>${[...ctx.defs.values()].join("")}</defs>` : ""}<rect width="${W}" height="${H}" fill="#14171d"/>${body}</svg>`;
  return { svg, k, parts: ctx.count, L: [], fired };
}
