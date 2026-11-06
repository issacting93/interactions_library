/* shared/glyph/glyph-system.js — writing systems in families, each drawn by one pen.
   Built on the Xenoglyph engine and the Glyph System Research Plan (Style families, Glyph construction).

   A glyph is a skeleton and its flesh, as type designers build it:
     skeleton   the construction: Xenoglyph's grid walk (makeSkeleton), seeded by the script and the word
     flesh      the pen that draws it: nib, angle, width, contrast, pressure along the stroke, corners
                and terminals. A family owns exactly one pen, fixed before any sign is drawn, so every
                sign in every script of that family has the same colour, the same joins and endings.

   Families (the five hands that passed the audit). Breeding never leaves a family: mutation and
   crossover change the skeletons, the grammar and the illustration, never the pen. A new family is
   a design act, made here by hand.
     Bold     round nib, wide and even, square corners
     Brush    broad nib at 35°, thick-thin contrast, swelling pressure, softened corners
     Carved   an inline: the stroke cut hollow, flat ends with a small spur
     Fine     round nib, thin and even, rounded corners
     Seal     Xenoglyph's blob medallions: a family of its own construction, drawn as Xenoglyph draws it

   Illustration comes from the skeleton, drawn by the same pen (Maya: the same sign as a plain glyph,
   a head, or a full figure). A head grows a loop with an eye from the stroke's first end; a figure
   also grows features for its category: limbs for beings, a ground line for places, wings for motion,
   rays for light, a coil for time. Seal has no skeleton, so it stays a sign.

   Grammar composes several concepts into one glyph: block (Hangul slots), ring (Heptapod B: the first
   concept at the centre) and graph (concepts joined in the order said). Strokes keep the family's
   weight at every size, as a block's parts do in Hangul, so a composed glyph has the same colour.

     GlyphSystem.FAMILIES, LEXICON, CATEGORIES, GRAMMARS, FRAMES
     GlyphSystem.newScript(seed, R, family?)   -> a script recipe (in one family)
     GlyphSystem.mutate(s, R) / cross(a, b, R)  -> stays in s's family (cross needs one family)
     GlyphSystem.radical(s, concept)           -> { svg, level }   one dictionary entry
     GlyphSystem.compose(s, concepts)          -> { svg, levels }  one composed glyph
     GlyphSystem.parse(text)                   -> the concepts in a phrase
     GlyphSystem.svgDoc(inner, { size, ink, plate, bg })
   SVG is drawn in a 100 x 100 box in currentColor, with knock-outs in var(--plate). Pure: no DOM.
   Needs shared/xenoglyph-engine.js. Classic script. */
(function () {
  "use strict";
  const X = () => window.Xenoglyph;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const f1 = (v) => (Math.round(v * 10) / 10).toString();
  const f3 = (v) => (Math.round(v * 1000) / 1000).toString();
  const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  const unit = (s) => hash(s) / 4294967296;

  // ── LEXICON ──────────────────────────────────────────────────────────────
  const CATEGORIES = {
    being: { label: "Being" }, place: { label: "Place" }, motion: { label: "Motion" }, light: { label: "Light" }, time: { label: "Time" },
  };
  const LEXICON = [
    { id: "person", cat: "being", words: ["person", "people", "i", "me", "you", "we", "they", "someone", "who"] },
    { id: "beast", cat: "being", words: ["beast", "animal", "creature", "monster"] },
    { id: "bird", cat: "being", words: ["bird", "birds", "wing", "wings"] },
    { id: "fish", cat: "being", words: ["fish", "eel", "whale"] },
    { id: "spirit", cat: "being", words: ["spirit", "god", "angel", "ghost", "soul"] },
    { id: "city", cat: "place", words: ["city", "town", "home", "house", "temple"] },
    { id: "sea", cat: "place", words: ["sea", "ocean", "water", "river", "deep"] },
    { id: "mountain", cat: "place", words: ["mountain", "hill", "stone", "rock"] },
    { id: "sky", cat: "place", words: ["sky", "heaven", "above", "over", "air"] },
    { id: "go", cat: "motion", words: ["go", "goes", "went", "walk", "travel", "leave"] },
    { id: "return", cat: "motion", words: ["return", "returns", "back", "come", "comes", "came"] },
    { id: "fly", cat: "motion", words: ["fly", "flies", "flew", "rise", "rises"] },
    { id: "fall", cat: "motion", words: ["fall", "falls", "fell", "sink", "sinks", "below", "under"] },
    { id: "sun", cat: "light", words: ["sun", "day", "morning", "gold"] },
    { id: "moon", cat: "light", words: ["moon", "silver", "tide"] },
    { id: "star", cat: "light", words: ["star", "stars", "eye", "eyes", "see", "watch"] },
    { id: "fire", cat: "light", words: ["fire", "burn", "burns", "flame", "light"] },
    { id: "night", cat: "time", words: ["night", "dark", "sleep", "dream"] },
    { id: "before", cat: "time", words: ["before", "past", "old", "ancient", "once"] },
    { id: "after", cat: "time", words: ["after", "future", "new", "will", "soon"] },
  ];
  const BY_ID = Object.fromEntries(LEXICON.map((c) => [c.id, c]));
  const WORD = {};
  for (const c of LEXICON) for (const w of c.words) WORD[w] = c.id;
  function parse(text) {
    const out = [];
    for (const w of String(text || "").toLowerCase().split(/[^a-z]+/)) {
      if (!w) continue;
      const id = WORD[w] || WORD[w.replace(/s$/, "")] || (BY_ID[w] && w);
      if (id && out[out.length - 1] !== id) out.push(id);
    }
    return out;
  }

  // ── FAMILIES: one pen each, fixed first ──────────────────────────────────
  // nib: "round" (even width) or "broad" (width follows the stroke's angle to the nib); w: stem width in
  // the 100-unit box; contrast: thinnest stroke as a share of the stem (broad nib); angle: nib angle;
  // pressure: "even" | "swell" (thicker mid-stroke, finer ends); corner: smoothing passes (0 = sharp);
  // end: "round" | "square" | "spur"; inline: the stroke cut hollow (carved)
  const FAMILIES = {
    bold:   { label: "Bold",   construction: "skeleton", pen: { nib: "round", w: 11, corner: 0, end: "square", pressure: "even" } },
    brush:  { label: "Brush",  construction: "skeleton", pen: { nib: "broad", w: 13, contrast: 0.18, angle: 35, corner: 2, end: "round", pressure: "swell" } },
    carved: { label: "Carved", construction: "skeleton", pen: { nib: "round", w: 12, corner: 0, end: "spur", pressure: "even", inline: 0.42 } },
    fine:   { label: "Fine",   construction: "skeleton", pen: { nib: "round", w: 4.2, corner: 2, end: "round", pressure: "even" } },
    seal:   { label: "Seal",   construction: "blob" },
  };
  const FAMILY_IDS = Object.keys(FAMILIES);
  const familyOf = (s) => FAMILIES[s.family] || FAMILIES.bold;
  const GRAMMARS = ["block", "ring", "graph"];
  const FRAMES = ["none", "cartouche", "circle"];

  // ── SCRIPTS (the genome; the pen is not in it) ──────────────────────────
  let uid = 1;
  function newScript(seed, R, family) {
    R = R || (window.ForgeKit ? window.ForgeKit.rng(seed) : Math.random);
    const pick = (a) => a[Math.floor(R() * a.length)];
    const fam = FAMILIES[family] ? family : pick(FAMILY_IDS);
    const s = {
      id: uid++, parents: [], family: fam, seed: "s" + (seed >>> 0).toString(36),
      cx: 2 + Math.floor(R() * 3), grid: R() < 0.7 ? 3 : 4, jitter: R() * 0.25,
      grammar: pick(GRAMMARS), frame: R() < 0.5 ? "cartouche" : "none",
      figure: R() < 0.4 ? 0 : R() * 0.7, head: R() < 0.4 ? 0 : R() * 0.6,
    };
    if (fam === "seal") { s.figure = 0; s.head = 0; }
    return s;
  }
  function mutate(s, R) {
    const o = JSON.parse(JSON.stringify(s)); o.id = uid++; o.parents = [s.id];
    const pick = (a) => a[Math.floor(R() * a.length)];
    const seal = o.family === "seal", k = Math.floor(R() * (seal ? 5 : 7));
    if (k === 0) o.seed = "s" + Math.floor(R() * 1e9).toString(36);       // a new set of skeletons
    else if (k === 1) o.cx = clamp(o.cx + (R() < 0.5 ? -1 : 1), 2, 4);
    else if (k === 2) { o.jitter = clamp(o.jitter + (R() - 0.5) * 0.15, 0, 0.3); o.grid = R() < 0.7 ? 3 : 4; }
    else if (k === 3) o.grammar = pick(GRAMMARS);
    else if (k === 4) o.frame = pick(FRAMES);
    else if (k === 5) o.figure = clamp(o.figure + (R() - 0.5) * 0.5, 0, 1);
    else o.head = clamp(o.head + (R() - 0.5) * 0.5, 0, 1);
    return o;
  }
  // within one family only: the skeletons from one parent, the grammar and illustration from the other
  function cross(a, b, R) {
    if (a.family !== b.family) return mutate(a, R);
    const [hand, form] = R() < 0.5 ? [a, b] : [b, a];
    return { ...JSON.parse(JSON.stringify(hand)), grammar: form.grammar, frame: form.frame, figure: form.figure, head: form.head, id: uid++, parents: [a.id, b.id] };
  }

  // ── SKELETONS ─────────────────────────────────────────────────────────────
  // Xenoglyph's own grid walk, exactly as its script engine builds it, without its flesh
  function skeletonOf(s, key) {
    const r = X().rngFor(s.seed, "script", key, 0);
    const raw = X().makeSkeleton(r, { grid: s.grid, cx: s.cx });
    const sk = X().recenter(X().jitterSkel(raw, r, s.jitter * 1.6));
    return { polys: sk.polys.map((p) => p.map((q) => [q[0], q[1]])), dots: sk.dots.map((d) => [d[0], d[1]]) };
  }
  const circlePts = (cx, cy, r, n, a0) => Array.from({ length: n + 1 }, (_, i) => { const a = (a0 || 0) + (i / n) * Math.PI * 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
  function bounds(sk) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = ([x, y]) => { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; };
    sk.polys.forEach((p) => p.forEach(add)); sk.dots.forEach(add);
    return x0 === Infinity ? { x: 40, y: 40, w: 20, h: 20 } : { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  }
  // illustration grown from the skeleton: still lines and dots, so the family's pen draws it
  function illustrate(s, sk, concept, level) {
    if (level === "sign" || !sk.polys.length) return sk;
    const out = { polys: sk.polys.slice(), dots: sk.dots.slice(), eyes: [] }, b = bounds(sk), u = Math.max(b.w, b.h);
    const ws = (stem(s) * u) / 80;                                     // the pen's width in skeleton units
    const first = sk.polys[0], p0 = first[0], p1 = first[1] || [p0[0] + 1, p0[1]];
    const dir = Math.atan2(p0[1] - p1[1], p0[0] - p1[0]);                // outward from the first end
    const hr = Math.max(u * 0.12, ws * 1.15), hc = [p0[0] + Math.cos(dir) * hr, p0[1] + Math.sin(dir) * hr];   // big enough to stay open
    out.polys.push(circlePts(hc[0], hc[1], hr, 14, dir + Math.PI));      // the head: a loop on the stroke's end
    out.eyes.push([hc[0] + Math.cos(dir) * hr * 0.12, hc[1] + Math.sin(dir) * hr * 0.12]);   // its eye
    if (level === "head") return out;
    const cat = (BY_ID[concept] || {}).cat, last = sk.polys[sk.polys.length - 1], e = last[last.length - 1], e1 = last[last.length - 2] || e;
    const ed = Math.atan2(e[1] - e1[1], e[0] - e1[0]), L = u * 0.22;
    // the longest segment carries the body's features
    let seg = [first[0], first[1] || first[0]], best = -1;
    for (const p of sk.polys) for (let i = 1; i < p.length; i++) { const d = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); if (d > best) { best = d; seg = [p[i - 1], p[i]]; } }
    const mid = [(seg[0][0] + seg[1][0]) / 2, (seg[0][1] + seg[1][1]) / 2], sa = Math.atan2(seg[1][1] - seg[0][1], seg[1][0] - seg[0][0]), nx = -Math.sin(sa), ny = Math.cos(sa);
    if (cat === "being") {          // limbs: two short strokes off the body
      for (const t of [-0.25, 0.25]) { const m = [mid[0] + Math.cos(sa) * best * t, mid[1] + Math.sin(sa) * best * t]; out.polys.push([m, [m[0] + nx * L + Math.cos(sa) * L * 0.3, m[1] + ny * L + Math.sin(sa) * L * 0.3]]); }
    } else if (cat === "place") {   // a ground line under everything
      out.polys.push([[b.x - u * 0.06, b.y + b.h + u * 0.14], [b.x + b.w + u * 0.06, b.y + b.h + u * 0.14]]);
    } else if (cat === "motion") {  // wings from the middle of the body
      for (const sg of [-1, 1]) out.polys.push([mid, [mid[0] + nx * L * sg - Math.cos(sa) * L * 0.6, mid[1] + ny * L * sg - Math.sin(sa) * L * 0.6], [mid[0] + nx * L * 1.25 * sg, mid[1] + ny * L * 1.25 * sg]]);
    } else if (cat === "light") {   // rays around the head
      for (let i = 0; i < 5; i++) { const a = dir - 1.1 + i * 0.55; out.polys.push([[hc[0] + Math.cos(a) * hr * 1.45, hc[1] + Math.sin(a) * hr * 1.45], [hc[0] + Math.cos(a) * hr * 2.1, hc[1] + Math.sin(a) * hr * 2.1]]); }
    } else {                        // time: a coil from the stroke's last end
      const coil = []; for (let i = 0; i <= 16; i++) { const t = i / 16, a = ed + t * Math.PI * 2.2, r = L * 0.55 * (1 - t * 0.75); coil.push([e[0] + Math.cos(ed) * L * 0.55 + Math.cos(a + Math.PI) * r, e[1] + Math.sin(ed) * L * 0.55 + Math.sin(a + Math.PI) * r]); }
      coil[0] = e; out.polys.push(coil);
    }
    return out;
  }

  // ── THE PEN ──────────────────────────────────────────────────────────────
  // softened corners (Chaikin): the pen's corner setting, not the skeleton's
  function soften(pts, n) {
    let p = pts;
    for (let k = 0; k < n && p.length > 2; k++) {
      const q = [p[0]];
      for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1]; q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
      q.push(p[p.length - 1]); p = q;
    }
    return p;
  }
  const closed = (p) => p.length > 3 && Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) < 0.01;
  const pathD = (p) => "M" + p.map((q) => f1(q[0]) + " " + f1(q[1])).join(" L");
  // sk is in output units already; w is the stem width in output units
  function penDraw(pen, sk, w) {
    const parts = [];
    for (const raw of sk.polys) {
      const p = pen.corner && !closed(raw) ? soften(raw, pen.corner) : raw;
      if (pen.nib === "broad") {
        // a broad nib swept along the path: each step is the quad between the nib's two positions
        const a = (pen.angle * Math.PI) / 180, L = [0];
        for (let i = 1; i < p.length; i++) L.push(L[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
        const tot = L[L.length - 1] || 1;
        const half = (t) => (w / 2) * (pen.pressure === "swell" && !closed(p) ? 0.45 + 0.55 * Math.sin(Math.PI * clamp(t, 0.04, 0.96)) : 1);
        const nib = (i) => { const h = half(L[i] / tot); return [Math.cos(a) * h, Math.sin(a) * h]; };
        // one ribbon per stroke (the nib's one edge out, the other edge back), so no seams show between steps
        const left = [], right = [];
        for (let i = 0; i < p.length; i++) { const [nx, ny] = nib(i); left.push([p[i][0] + nx, p[i][1] + ny]); right.push([p[i][0] - nx, p[i][1] - ny]); }
        parts.push(`<path d="${pathD(left.concat(right.reverse()))} Z" fill="currentColor" fill-rule="nonzero"/>`);
        // the hairline the nib leaves when it travels along its own edge
        parts.push(`<path d="${pathD(p)}" fill="none" stroke="currentColor" stroke-width="${f1(w * pen.contrast)}" stroke-linecap="round" stroke-linejoin="round"/>`);
      } else {
        const cap = pen.end === "round" ? "round" : "butt", join = pen.corner ? "round" : "miter";
        parts.push(`<path d="${pathD(p)}" fill="none" stroke="currentColor" stroke-width="${f1(w)}" stroke-linecap="${cap}" stroke-linejoin="${join}" stroke-miterlimit="3"/>`);
        if (pen.end === "square" || pen.end === "spur") for (const [e, o] of [[p[0], p[1]], [p[p.length - 1], p[p.length - 2]]]) {
          if (!o || closed(p)) continue;
          // square ends sit flush with the stroke; a spur is a short bar across the end, like a serif
          const d = Math.atan2(e[1] - o[1], e[0] - o[0]), nx = -Math.sin(d), ny = Math.cos(d), k = pen.end === "spur" ? w * 0.85 : w / 2;
          if (pen.end === "spur") parts.push(`<path d="M${f1(e[0] + nx * k)} ${f1(e[1] + ny * k)} L${f1(e[0] - nx * k)} ${f1(e[1] - ny * k)}" stroke="currentColor" stroke-width="${f1(w * 0.42)}" stroke-linecap="butt"/>`);
        }
        if (pen.inline) parts.push(`<path d="${pathD(p)}" fill="none" stroke="var(--plate)" stroke-width="${f1(w * pen.inline)}" stroke-linecap="${cap}" stroke-linejoin="${join}" stroke-miterlimit="3"/>`);
      }
    }
    for (const [x, y] of sk.eyes || []) parts.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(Math.max(0.9, w * (pen.inline ? 0.22 : 0.3)))}" fill="currentColor"/>`);
    for (const [x, y] of sk.dots) {
      const r = w * (pen.nib === "broad" ? 0.62 : 0.6);
      if (pen.nib === "broad") { const a = (pen.angle * Math.PI) / 180, c = Math.cos(a) * r, s2 = Math.sin(a) * r; parts.push(`<polygon points="${f1(x + c)},${f1(y + s2)} ${f1(x - s2 * 0.7)},${f1(y + c * 0.7)} ${f1(x - c)},${f1(y - s2)} ${f1(x + s2 * 0.7)},${f1(y - c * 0.7)}" fill="currentColor"/>`); }
      else if (pen.end === "round") parts.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="currentColor"/>`);
      else parts.push(`<rect x="${f1(x - r)}" y="${f1(y - r)}" width="${f1(2 * r)}" height="${f1(2 * r)}" fill="currentColor"/>`);
      if (pen.inline) parts.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * pen.inline)}" fill="var(--plate)"/>`);
    }
    return parts.join("");
  }

  // ── DRAWING ──────────────────────────────────────────────────────────────
  function levelOf(s, concept) {
    if (familyOf(s).construction !== "skeleton") return "sign";
    const u = unit(s.seed + "|level|" + concept);
    return u < s.figure ? "figure" : u < s.figure + s.head * (1 - s.figure) ? "head" : "sign";
  }
  // one sign drawn into the box (x, y, w, h); weight is the stem width in the same units
  function signAt(s, concept, x, y, w, h, weight, level) {
    const fam = familyOf(s);
    if (fam.construction === "blob") {
      // Seal: Xenoglyph's medallions, fitted to the box by their own drawn extent
      const svg = X().ENGINES.blob.fn(X().rngFor(s.seed, "blob", concept, 0), { cx: s.cx, wt: 3, flesh: "pill", seed: s.seed, grid: 3, jitter: 0, round: 1 }).svg.replace(/var\(--_bg,#0B0D14\)/g, "var(--plate)");
      const k = (Math.min(w, h) * 0.95) / 100;
      return `<g transform="translate(${f1(x + w / 2 - 50 * k)} ${f1(y + h / 2 - 50 * k)}) scale(${f3(k)})">${svg}</g>`;
    }
    const sk = illustrate(s, skeletonOf(s, concept), concept, level);
    // fit the skeleton's centreline into the box, leaving room for the pen on every side
    const b = bounds(sk), pad = weight * 0.6, k = Math.min((w - 2 * pad) / b.w, (h - 2 * pad) / b.h, (Math.min(w, h) - 2 * pad) / 30);
    const ox = x + w / 2 - (b.x + b.w / 2) * k, oy = y + h / 2 - (b.y + b.h / 2) * k;
    const map = (q) => [ox + q[0] * k, oy + q[1] * k];
    return penDraw(fam.pen, { polys: sk.polys.map((p) => p.map(map)), dots: sk.dots.map(map), eyes: (sk.eyes || []).map(map) }, weight);
  }
  const stem = (s) => (familyOf(s).pen ? familyOf(s).pen.w : 8);
  function frameSvg(s, inner) {
    const w = f1(Math.max(1.6, stem(s) * 0.32));
    if (s.frame === "cartouche") return `<rect x="5" y="9" width="90" height="82" rx="26" fill="none" stroke="currentColor" stroke-width="${w}"/>` + inner;
    if (s.frame === "circle") return `<circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="${w}"/>` + inner;
    return inner;
  }
  const INNER = { none: [6, 6, 88, 88], cartouche: [15, 17, 70, 66], circle: [19, 19, 62, 62] };

  // a dictionary entry: the sign alone, filling its square (frames belong to composed phrases)
  function radical(s, concept) {
    const level = levelOf(s, concept);
    return { svg: signAt(s, concept, 8, 8, 84, 84, stem(s), level), level };
  }

  function compose(s, concepts) {
    concepts = (concepts || []).filter((c) => BY_ID[c]).slice(0, 6);
    if (!concepts.length) return { svg: "", levels: [] };
    const [X0, Y0, W, H] = INNER[s.frame] || INNER.none, out = [], levels = [];
    // the family's weight, eased a little for small parts, so the whole glyph keeps one colour
    const wAt = (size) => stem(s) * Math.min(1, 0.45 + (0.55 * size) / Math.min(W, H));
    const put = (c, x, y, w, h) => { const lv = levelOf(s, c); out.push(signAt(s, c, x, y, w, h, wAt(Math.min(w, h)), lv)); levels.push(lv); };
    const sw = f1(Math.max(1.4, stem(s) * 0.3));
    if (concepts.length === 1) put(concepts[0], X0, Y0, W, H);
    else if (s.grammar === "block") {
      const n = Math.min(concepts.length, 4), g = 1.5;
      const slots = n === 2 ? [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]]
        : n === 3 ? [[0, 0, 0.5, 1], [0.5, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]]
        : [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]];
      slots.forEach((sl, i) => put(concepts[i], X0 + sl[0] * W + g, Y0 + sl[1] * H + g, sl[2] * W - 2 * g, sl[3] * H - 2 * g));
      concepts.slice(4).forEach((c, i) => put(c, X0 + W - (i + 1) * W * 0.2, Y0 + H * 0.82, W * 0.18, H * 0.18));
    } else if (s.grammar === "ring") {
      const cx = X0 + W / 2, cy = Y0 + H / 2, R = Math.min(W, H) * 0.36, rest = concepts.slice(1);
      out.push(`<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(R)}" fill="none" stroke="currentColor" stroke-width="${sw}"/>`);
      const size = Math.min(W, H) * (rest.length > 3 ? 0.24 : 0.3);
      rest.forEach((c, i) => {
        const a = -Math.PI / 2 + (i / rest.length) * Math.PI * 2, x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
        out.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(size * 0.52)}" fill="var(--plate)"/>`);
        put(c, x - size / 2, y - size / 2, size, size);
      });
      put(concepts[0], cx - R * 0.6, cy - R * 0.6, R * 1.2, R * 1.2);
    } else {
      const n = concepts.length, size = Math.min(W, H) * (n > 3 ? 0.3 : 0.38);
      const pts = concepts.map((c, i) => {
        const t = n === 1 ? 0.5 : i / (n - 1), a = Math.PI * (1.15 - 1.3 * t), j = (unit(s.seed + c) - 0.5) * 0.12;
        return [X0 + W / 2 + Math.cos(a) * W * (0.32 + j), Y0 + H * 0.56 - Math.sin(a) * H * (0.3 + j)];
      });
      out.push(`<path d="${pathD(pts)}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`);
      pts.forEach(([x, y], i) => { out.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(size * 0.3)}" fill="var(--plate)"/>`); put(concepts[i], x - size / 2, y - size / 2, size, size); });
    }
    return { svg: frameSvg(s, out.join("")), levels };
  }

  function svgDoc(inner, o) {
    o = Object.assign({ size: 100, ink: "#fff", plate: "#000", bg: null }, o || {});
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${o.size}" height="${o.size}" style="color:${o.ink};--plate:${o.plate}">` +
      (o.bg ? `<rect width="100" height="100" fill="${o.bg}"/>` : "") + inner.replace(/var\(--plate\)/g, o.plate) + "</svg>";
  }
  // kept so older callers still load; the pen needs no creature parts
  const prepareKit = () => null;

  window.GlyphSystem = { FAMILIES, FAMILY_IDS, familyOf, LEXICON, CATEGORIES, GRAMMARS, FRAMES, BY_ID, parse, newScript, mutate, cross, radical, compose, levelOf, svgDoc, prepareKit, hash, ILLUSTRATE: true };
})();
