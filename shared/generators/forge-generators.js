/*
 * Forge — the registered generators. Thin wrappers that put each existing module
 * behind ForgeRegistry's one contract. None of the wrapped modules is modified:
 *   building.spire      SpireGenerator         (spire-generator.js)     2D elevation
 *   seal.sigil          SigilGenerator         (sigil-generator.js)     2D seal, reads a script input
 *   script.alphabet     SigilGenerator         (sigil-generator.js)     2D glyph sheet
 *   building.arch       CreatureArch           (creature-arch.js)       2D elevation + 3D lines
 *   building.classical  CreatureClassical      (creature-classical.js)  3D lines, projected to 2D
 *
 * A generator whose module isn't loaded on a page simply doesn't show up
 * (available() is false), so a page includes only the modules it wants.
 *
 * Load after kit-utils.js, forge-registry.js and whichever generator modules you use.
 */
(function () {
  "use strict";
  const R = window.ForgeRegistry, K = window.ForgeKit;
  const MINT = "#5fd38d", PLATE = "#14171d";
  const f1 = (v) => (Math.round(v * 10) / 10).toString();

  /* ---------- shared renderers for line/elevation output ---------- */

  // CreatureArch elevation {E:[{part,x,y,s,rot,free}], top} -> flat SVG, same mirroring rule
  // as CreatureArch.standElevation (left-side parts off-axis and not `free` draw twice).
  function elevationToSvg(elev, W, H) {
    W = W || 600; H = H || 900;
    const polys = [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const e of elev.E) {
      const rot = (e.rot || 0) * Math.PI / 180, cr = Math.cos(rot), sr = Math.sin(rot);
      const sides = e.part.side === "left" && !e.free && e.x !== 0 ? [1, -1] : [1];
      for (const sd of sides) for (const pl of e.part.polys) {
        const out = pl.map(([px, py]) => {
          const lx = (px * cr - py * sr) * e.s * (sd < 0 ? -1 : 1) + e.x * sd;
          const ly = (px * sr + py * cr) * e.s;
          const X = lx, Y = -(e.y - ly);
          if (X < minX) minX = X; if (X > maxX) maxX = X; if (Y < minY) minY = Y; if (Y > maxY) maxY = Y;
          return [X, Y];
        });
        polys.push(out);
      }
    }
    if (!polys.length) return blankSvg(W, H);
    const pad = 24, k = Math.min((W - 2 * pad) / Math.max(1, maxX - minX), (H - 2 * pad) / Math.max(1, maxY - minY));
    const ox = W / 2 - ((minX + maxX) / 2) * k, oy = H - pad - maxY * k;
    const d = polys.map((pl) => "M" + pl.map(([x, y]) => f1(x * k + ox) + " " + f1(y * k + oy)).join("L")).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${PLATE}"/>` +
      `<path d="${d}" fill="none" stroke="${MINT}" stroke-width="0.9" stroke-linejoin="round" stroke-linecap="round"/>` +
      `<path d="M${pad} ${f1(oy)}H${W - pad}" stroke="${MINT}" stroke-width="1.2"/></svg>`;
  }

  // GL_LINES-style positions (x,y,z per vertex, 2 vertices per segment) -> a 3/4 view SVG
  function linesToSvg(positions, o) {
    o = o || {};
    const W = o.W || 600, H = o.H || 600, yaw = (o.yaw ?? -32) * Math.PI / 180, pitch = (o.pitch ?? 16) * Math.PI / 180;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const n = positions.length / 3, X = new Float32Array(n), Y = new Float32Array(n);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
      const xr = x * cy - z * sy, zr = x * sy + z * cy;
      const sx = xr, syy = -y * cp + zr * sp;
      X[i] = sx; Y[i] = syy;
      if (sx < minX) minX = sx; if (sx > maxX) maxX = sx; if (syy < minY) minY = syy; if (syy > maxY) maxY = syy;
    }
    if (!n) return blankSvg(W, H);
    const pad = 28, k = Math.min((W - 2 * pad) / Math.max(1e-6, maxX - minX), (H - 2 * pad) / Math.max(1e-6, maxY - minY));
    const ox = W / 2 - ((minX + maxX) / 2) * k, oy = H / 2 - ((minY + maxY) / 2) * k;
    let d = "", lx = NaN, ly = NaN;
    for (let i = 0; i < n; i += 2) {
      const ax = f1(X[i] * k + ox), ay = f1(Y[i] * k + oy), bx = f1(X[i + 1] * k + ox), by = f1(Y[i + 1] * k + oy);
      d += (ax === lx && ay === ly ? "L" : "M" + ax + " " + ay + "L") + bx + " " + by;   // chain touching segments
      lx = bx; ly = by;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${PLATE}"/>` +
      `<path d="${d}" fill="none" stroke="${MINT}" stroke-width="0.7" stroke-opacity=".9" stroke-linecap="round"/></svg>`;
  }
  function blankSvg(W, H) { return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${PLATE}"/></svg>`; }

  const archReady = async (kit) => { if (!window.CreatureArch.ready) await window.CreatureArch.load(kit.url); };
  const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;

  /* ---------- building.spire — Spire Forge's elevation ---------- */
  if (window.SpireGenerator) R.register({
    id: "building.spire", type: "building", label: "Tower", newLabel: "New building", bench: true,
    // a saved rule set (rule-sets.js / forge/web/rules.html) pins bay rules over the recipe's own
    inputs: window.RuleSets ? [{ name: "rules", accepts: "ruleset", label: "Rule set", optional: true }] : [],
    defaults: (seed, kit, o) => window.SpireGenerator.newGenome(o.tpl || "lighthouse", seed, kit.pool),
    mutate: (r, Rn, kit) => window.SpireGenerator.mutate(r, Rn, kit.pool),
    params: [
      { id: "tpl", label: "Type", type: "select", opts: ["lighthouse", "spire", "hive", "shrine", "rotunda"], path: "tpl", v: "lighthouse", regen: true },
      { id: "baseN", label: "Base tiers", type: "range", path: "base.n", min: 0, max: 4, step: 1, v: 3 },
      { id: "baseHalf", label: "Base width", type: "range", path: "base.half", min: 70, max: 250, step: 1, v: 170 },
      { id: "shaftH", label: "Shaft height", type: "range", path: "shaft.h", min: 0, max: 620, step: 5, v: 380 },
      { id: "balc", label: "Balconies", type: "range", path: "balc.n", min: 0, max: 7, step: 1, v: 3 },
      { id: "crownR", label: "Crown radius", type: "range", path: "crown.R", min: 0, max: 210, step: 1, v: 110 },
      { id: "crownN", label: "Crown blades", type: "range", path: "crown.n", min: 0, max: 10, step: 1, v: 6 },
      { id: "bays", label: "Bay dressing", type: "check", path: "bays.on", v: true },
      { id: "ribs", label: "Shaft ribs", type: "check", path: "shaft.ribs", v: true },
    ],
    // approximate placements until Spire hands real per-tier coordinates (see workbench.html)
    sockets: [
      { id: "crown.halo", label: "Crown Halo", accepts: ["seal", "icon-set"], top: "10%", left: "50%", w: 70, h: 70 },
      { id: "terrace.bay", label: "Terrace Bay", accepts: ["seal"], top: "46%", left: "50%", w: 130, h: 44 },
      { id: "cornice.frieze", label: "Cornice Frieze", accepts: ["script", "seal"], top: "68%", left: "50%", w: 150, h: 36 },
    ],
    generate(r, ctx) {
      const rs = ctx.inputs.rules && ctx.inputs.rules.data;
      const g = rs && window.RuleSets ? window.RuleSets.apply(r, rs, ctx.kit.pool, r.seed) : r;
      const res = window.SpireGenerator.generate(g, ctx.kit.byId, {});
      // data: the genome as drawn (rule set applied), which is what gets saved
      return { svg: res.svg, data: g, metrics: { parts: res.parts, height: res.height, rules: rs ? ctx.inputs.rules.name : null } };
    },
    // saved as the shared building recipe (forge-building.js): a Tower Forge spec carrying the
    // genome as spec.spire, the same object Spire Forge, Tower Forge and World Scene read
    persist: (r, res, kit, name) => window.ForgeBuilding && window.SpireGenerator.toTowerSpec ? window.ForgeBuilding.fromGenome(res.data || r, kit.byId, name) : r,
    restore: (saved) => window.ForgeBuilding ? window.ForgeBuilding.read(saved).genome : saved,
    name: (r) => `${cap(r.tpl || "tower")} ${String(r.seed ?? "").slice(-4)}`,
    name: (r) => "Forged " + r.tpl,
    summary: (res) => `${res.metrics.parts} parts · ${res.metrics.height}px tall` + (res.metrics.rules ? ` · rules: ${res.metrics.rules}` : ""),
  });

  /* ---------- seal.sigil — Sigil Forge's seal, reads an alphabet ---------- */
  if (window.SigilGenerator) R.register({
    id: "seal.sigil", type: "seal", label: "Seal", newLabel: "New seal", bench: true,
    inputs: [{ name: "alphabet", accepts: "script", label: "Inscription alphabet", optional: true }],
    defaults: (seed, kit, o) => window.SigilGenerator.newSigil(seed, o.text || "FORGE", kit.parts),
    mutate: (r, Rn, kit) => window.SigilGenerator.mutate(r, Rn, kit.parts),
    params: [
      { id: "text", label: "Word", type: "text", path: "text", v: "FORGE" },
      { id: "method", label: "Method", type: "select", opts: ["wheel", "kamea", "monogram"], path: "method", v: "wheel" },
      { id: "frame", label: "Frame", type: "select", opts: ["ring", "star", "poly", "none"], path: "frame.kind", v: "star" },
      { id: "fold", label: "Fold", type: "range", path: "n", min: 3, max: 16, step: 1, v: 9 },
      { id: "detail", label: "Detail", type: "range", path: "detail", min: 0, max: 1, step: 0.05, v: 0.7 },
      { id: "mirror", label: "Mirror folds", type: "check", path: "mirror", v: true },
      { id: "band", label: "Inscription band", type: "check", path: "band", v: true },
    ],
    generate(r, ctx) {
      const A = ctx.inputs.alphabet ? ctx.inputs.alphabet.data : null;
      const res = window.SigilGenerator.generate(r, { byId: ctx.kit.byId, parts: ctx.kit.parts, alphabet: A && A.glyphs ? A : null }, {});
      return { svg: res.svg, metrics: { parts: res.parts, word: res.word, alphabet: A && A.glyphs ? "forged" : "xenoglyph" } };
    },
    name: (r) => cap((r.text || "").toLowerCase()) + " Seal",
    summary: (res) => `${res.metrics.parts} parts · word "${res.metrics.word}" · ${res.metrics.alphabet} band`,
  });

  /* ---------- script.alphabet — grid-walk glyphs ---------- */
  // The recipe is just the settings + seed; the glyph search (the slow part) is memoised
  // by grid settings, so style/weight/ornament sliders redraw without re-searching.
  // persist() saves the full alphabet (with glyphs) so a seal can read it back from the world.
  const alphaMemo = new Map();
  const GRID_KEYS = ["seed", "cols", "rows", "diag", "min", "max", "cross", "dist"];
  if (window.SigilGenerator) R.register({
    id: "script.alphabet", type: "script", label: "Alphabet", newLabel: "New alphabet", bench: true,
    defaults(seed, kit, o) {
      const Rn = K.rng(seed ^ 0x1234);
      const pick = (role) => { const a = kit.parts.filter((p) => p.roles.includes(role)); return a.length ? a[Math.floor(Rn() * a.length)].id : null; };
      return { seed, cols: 3, rows: 4, diag: true, min: 4, max: 8, cross: 1, dist: 3, style: o.style || "creature", w: 3.4, orn: 0.7, hook: pick("hook"), bead: pick("bead") };
    },
    mutate: (r, Rn) => ({ ...r, seed: Math.floor(Rn() * 1e9) }),
    params: [
      { id: "grid", label: "Grid", type: "select", opts: ["3x3", "3x4", "4x4", "4x5"], v: "3x4",
        get: (r) => `${r.cols}x${r.rows}`, set: (r, v) => { const [c, w] = v.split("x").map(Number); r.cols = c; r.rows = w; } },
      { id: "diag", label: "Diagonal strokes", type: "check", path: "diag", v: true },
      { id: "style", label: "Stroke", type: "select", opts: ["plain", "round", "creature", "beaded"], path: "style", v: "creature" },
      { id: "w", label: "Weight", type: "range", path: "w", min: 1, max: 8, step: 0.2, v: 3.4 },
      { id: "orn", label: "Ornament", type: "range", path: "orn", min: 0, max: 1, step: 0.05, v: 0.7 },
    ],
    generate(r, ctx) {
      const key = JSON.stringify(GRID_KEYS.map((k) => r[k]));
      let base = alphaMemo.get(key);
      if (!base) {
        base = window.SigilGenerator.newAlphabet(r.seed, { ...r });
        alphaMemo.set(key, base);
        if (alphaMemo.size > 24) alphaMemo.delete(alphaMemo.keys().next().value);
      }
      const A = { ...r, glyphs: base.glyphs };
      const res = window.SigilGenerator.drawSheet(A, ctx.kit.byId, ctx.kit.parts);
      return { svg: res.svg, data: A, metrics: { glyphs: A.glyphs.length, parts: res.parts } };
    },
    persist: (recipe, result) => result.data,
    name: () => "Forged Alphabet",
    summary: (res) => `${res.metrics.glyphs} glyphs · ${res.data.style} stroke · ${res.data.cols}×${res.data.rows} grid`,
  });

  /* ---------- building.arch — CreatureArch templates, 2D + 3D ---------- */
  if (window.CreatureArch) R.register({
    id: "building.arch", type: "building", label: "Arch tower", newLabel: "New tower", bench: true,
    prepare: archReady,
    defaults: (seed, kit, o) => ({ tpl: o.tpl || "gothic", seed, planes: 3 }),
    mutate: (r, Rn) => ({ ...r, seed: Math.floor(Rn() * 1e9) }),
    params: [
      { id: "tpl", label: "Template", type: "select", opts: (window.CreatureArch.TEMPLATE_NAMES || ["lighthouse", "spire", "hive", "shrine", "gothic"]).slice(), path: "tpl", v: "gothic" },
      { id: "planes", label: "3D planes", type: "range", path: "planes", min: 1, max: 4, step: 1, v: 3 },
    ],
    generate(r) {
      const CA = window.CreatureArch, rnd = K.rng(r.seed >>> 0);
      const kit = CA.archKits(rnd, ["main"]).get("main");
      const elev = CA.buildTemplate(r.tpl, kit, rnd);
      return {
        svg: elevationToSvg(elev),
        lines: CA.standElevation(elev, [0, 0, 0], 1, r.planes || 3),
        usedRefs: [...kit.values()].map((p) => "part:" + p.id),
        metrics: { placements: elev.E.length, height: Math.round(elev.top) },
      };
    },
    name: (r) => cap(r.tpl) + " tower",
    summary: (res) => `${res.metrics.placements} placements · ${res.metrics.height}px tall · 3D lines`,
  });

  /* ---------- building.classical — CreatureClassical, built in the round ---------- */
  if (window.CreatureClassical && window.CreatureArch) R.register({
    id: "building.classical", type: "building", label: "Classical", newLabel: "New facade", bench: true,
    prepare: archReady,
    defaults: (seed, kit, o) => window.CreatureClassical.newClassical(o.type || "temple", seed),
    mutate: (r, Rn) => window.CreatureClassical.newClassical(r.cl.type, Math.floor(Rn() * 1e9), { text: r.cl.text }),
    params: [
      { id: "type", label: "Type", type: "select", opts: window.CreatureClassical.TYPES.slice(), get: (r) => r.cl.type, v: "temple", regen: true },
      { id: "order", label: "Order", type: "select", opts: ["tuscan", "doric", "ionic", "corinthian"], path: "cl.order", v: "ionic" },
      { id: "bays", label: "Bays", type: "range", path: "cl.bays", min: 1, max: 15, step: 2, v: 5 },
      { id: "floors", label: "Floors", type: "range", path: "cl.floors", min: 1, max: 4, step: 1, v: 2 },
      { id: "steps", label: "Steps", type: "range", path: "cl.steps", min: 0, max: 16, step: 1, v: 10 },
      { id: "dome", label: "Dome", type: "check", path: "cl.dome.on", v: true },
      { id: "text", label: "Inscription", type: "text", path: "cl.text", v: "SIGIL HALL" },
    ],
    generate(r) {
      const out = window.CreatureClassical.build(r, {});
      return { svg: linesToSvg(out.lines.positions), lines: out.lines, metrics: { segments: out.stats.segments, bays: out.stats.bays } };
    },
    name: (r) => cap(r.cl.type) + (r.cl.text ? " · " + r.cl.text.toLowerCase() : ""),
    summary: (res) => `${res.metrics.segments} line segments · ${res.metrics.bays} bays · 3D lines`,
  });

  window.ForgeRender = { elevationToSvg, linesToSvg };
})();
