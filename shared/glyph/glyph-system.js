/* shared/glyph/glyph-system.js — a writing system on top of the Xenoglyph engines.
   Xenoglyph draws marks; this turns them into a script that means something and can become
   illustration, after the Glyph System Research Plan. Layers, as in Chimera:

     lexicon   20 concepts in five categories (being, place, motion, light, time). Each concept gets
               one radical per script, seeded by the script and the concept, so the dictionary is stable.
     body      how a radical is drawn, at one of three levels (Maya script is the precedent: the same
               sign as a plain glyph, a head variant, or a full figure):
                 sign     a Xenoglyph engine's mark (script, radical, pills, pixel, sigil, circuit,
                          cluster, blob), exactly as Xenoglyph draws it
                 head     the sign, crowned with a creature part
                 figure   a creature part from the kit, carrying a small copy of its sign
               `figure` and `head` (0..1) are the share of the lexicon drawn at each level.
     grammar   how several concepts become one glyph:
                 block    Hangul: radicals slot into a fixed layout by count (1 to 4)
                 ring     Heptapod B / Nomai: radicals around a ring, the first one at its centre
                 graph    concepts as nodes, joined by strokes in the order they were said
               plus a determinative (Egyptian): a small mark for the category of the first concept,
               and a frame: none, cartouche (Maya / Egyptian name ring) or circle.
     skin      colours only; the page applies them (ink, gilt, glow, blueprint).

   Everything returns SVG markup in a 100 x 100 box drawn in currentColor, with knock-outs in
   var(--plate) — the same `(rng, opts) -> {svg}` shape as Xenoglyph, one level up.

     GlyphSystem.LEXICON, CATEGORIES, ENGINES
     GlyphSystem.newScript(seed, R?)               -> a script recipe
     GlyphSystem.mutate(script, R) / cross(a, b, R)
     GlyphSystem.radical(script, concept, kit)    -> { svg, level }   one dictionary entry
     GlyphSystem.compose(script, concepts, kit)   -> { svg, levels }  one composed glyph
     GlyphSystem.parse(text)                       -> concepts found in a phrase ("bird flies over the sea")
     GlyphSystem.svgDoc(inner, { size, ink, plate, bg }) -> a standalone <svg> string
   kit: { parts, byId, pools } from GlyphSystem.prepareKit(parts) (shared/creature-parts.json, tagged
   by ForgeKit.tagRoles). Without a kit every radical is drawn as a sign.
   Needs: shared/xenoglyph-engine.js (and kit-utils.js for creature parts). Classic script, pure. */
(function () {
  "use strict";
  const X = () => window.Xenoglyph;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const f1 = (v) => (Math.round(v * 10) / 10).toString();
  const f3 = (v) => (Math.round(v * 1000) / 1000).toString();
  const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  const unit = (s) => hash(s) / 4294967296;

  // ── LEXICON ──────────────────────────────────────────────────────────────
  // which creature-part roles can stand in for each category when a concept is drawn as a figure
  const CATEGORIES = {
    being:  { label: "Being",  roles: ["lamp", "bead", "halo"] },
    place:  { label: "Place",  roles: ["spire", "segment", "core"] },
    motion: { label: "Motion", roles: ["blade", "hook", "rib"] },
    light:  { label: "Light",  roles: ["halo", "bead", "lamp"] },
    time:   { label: "Time",   roles: ["frieze", "rib", "segment"] },
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

  // ── SCRIPTS (the genome) ────────────────────────────────────────────────
  const ENGINES = ["script", "radical", "pills", "pixel", "sigil", "circuit", "cluster", "blob"];
  const FLESH = ["mono", "pill", "outline", "dot", "brush"];
  const GRAMMARS = ["block", "ring", "graph"];
  const FRAMES = ["none", "cartouche", "circle"];
  let uid = 1;
  function newScript(seed, R) {
    R = R || (window.ForgeKit ? window.ForgeKit.rng(seed) : Math.random);
    const pick = (a) => a[Math.floor(R() * a.length)];
    return {
      id: uid++, parents: [], seed: "s" + (seed >>> 0).toString(36),
      engine: pick(ENGINES), flesh: pick(FLESH), cx: 2 + Math.floor(R() * 3), wt: 1 + Math.floor(R() * 4), grid: R() < 0.7 ? 3 : 4,
      jitter: R() * 0.6, round: R(),
      grammar: pick(GRAMMARS), frame: pick(FRAMES), determinative: R() < 0.6,
      figure: R() < 0.35 ? 0 : R() * 0.8, head: R() * 0.5, line: 0.8 + R() * 1.4,
      species: null,
    };
  }
  function mutate(s, R) {
    const o = JSON.parse(JSON.stringify(s)); o.id = uid++; o.parents = [s.id];
    const pick = (a) => a[Math.floor(R() * a.length)];
    const k = Math.floor(R() * 9);
    if (k === 0) o.engine = pick(ENGINES);
    else if (k === 1) o.flesh = pick(FLESH);
    else if (k === 2) { o.cx = clamp(o.cx + (R() < 0.5 ? -1 : 1), 1, 5); o.wt = clamp(o.wt + (R() < 0.5 ? -1 : 1), 1, 5); }
    else if (k === 3) o.grammar = pick(GRAMMARS);
    else if (k === 4) { o.frame = pick(FRAMES); o.determinative = R() < 0.6; }
    else if (k === 5) o.figure = clamp(o.figure + (R() - 0.5) * 0.5, 0, 1);
    else if (k === 6) o.head = clamp(o.head + (R() - 0.5) * 0.5, 0, 1);
    else if (k === 7) o.seed = "s" + Math.floor(R() * 1e9).toString(36);   // a new hand: every radical redrawn
    else { o.jitter = clamp(o.jitter + (R() - 0.5) * 0.4, 0, 1); o.round = clamp(o.round + (R() - 0.5) * 0.5, 0, 1); o.line = clamp(o.line + (R() - 0.5) * 0.6, 0.5, 2.6); }
    return o;
  }
  // the hand (engine, seed, stroke) comes from one parent, the grammar and illustration from the other
  function cross(a, b, R) {
    const [hand, form] = R() < 0.5 ? [a, b] : [b, a];
    return { ...JSON.parse(JSON.stringify(hand)), grammar: form.grammar, frame: form.frame, determinative: form.determinative,
      figure: form.figure, head: form.head, species: form.species, id: uid++, parents: [a.id, b.id] };
  }

  // ── KIT ──────────────────────────────────────────────────────────────────
  function prepareKit(parts) {
    const tagged = window.ForgeKit ? window.ForgeKit.tagRoles(parts) : parts;
    // line-drawn parts only, and no lettering: a figure should read as a creature, not as more text
    const usable = tagged.filter((p) => p.species !== "sheet-xenoglyph" && !p.defs && (p.roles || []).length);
    const byId = Object.fromEntries(usable.map((p) => [p.id, p]));
    const pools = {};
    for (const p of usable) for (const r of p.roles) (pools[r] = pools[r] || []).push(p);
    const species = [...new Set(usable.map((p) => p.species))].sort();
    return { parts: usable, byId, pools, species };
  }

  // ── DRAWING ──────────────────────────────────────────────────────────────
  function engineOpts(s) { return { cx: s.cx, wt: s.wt, flesh: s.flesh, seed: s.seed, grid: s.grid, jitter: s.jitter, round: s.round }; }
  function sign(s, key) {
    const eng = X().ENGINES[s.engine] || X().ENGINES.script;
    return eng.fn(X().rngFor(s.seed, s.engine, key, 0), engineOpts(s)).svg.replace(/var\(--_bg,#0B0D14\)/g, "var(--plate)");
  }
  // a creature part, centred at (x, y), fitted to `size`, in ink with plate knock-outs
  function partSvg(p, x, y, size, line, rot) {
    const s = size / Math.max(p.w, p.h);
    const sw = f3((line || 1.2) / s);
    // one even line weight: drop each part's own widths, then give every stroke the same one
    const frag = p.svg
      .replace(/\s*stroke-width="[^"]*"/g, "")
      .replace(/stroke="#[0-9a-fA-F]{3,6}"/g, `stroke="currentColor" stroke-width="${sw}"`)
      .replace(/fill="#[0-9a-fA-F]{3,6}"/g, 'fill="var(--plate)"');
    return `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(rot || 0)}) scale(${f3(s)})">${frag}</g>`;
  }
  function partFor(s, concept, kit, roles) {
    if (!kit) return null;
    for (const role of roles) {
      let pool = kit.pools[role] || [];
      if (s.species) { const own = pool.filter((p) => p.species === s.species); if (own.length) pool = own; }
      if (pool.length) return pool[hash(s.seed + ":" + concept + ":" + role) % pool.length];
    }
    return null;
  }
  // which level a concept is drawn at in this script: stable per concept, so the dictionary is consistent
  function levelOf(s, concept, kit) {
    if (!kit) return "sign";
    const u = unit(s.seed + "|level|" + concept);
    return u < s.figure ? "figure" : u < s.figure + s.head * (1 - s.figure) ? "head" : "sign";
  }
  // one radical, drawn into the box (x, y, w, h)
  function radicalAt(s, concept, kit, x, y, w, h) {
    const c = BY_ID[concept] || { id: concept, cat: "being" }, level = levelOf(s, concept, kit);
    const box = Math.min(w, h), cx = x + w / 2, cy = y + h / 2, k = box / 100;
    const signAt = (scale, ox, oy) => `<g transform="translate(${f1(cx - 50 * k * scale + (ox || 0))} ${f1(cy - 50 * k * scale + (oy || 0))}) scale(${f3(k * scale)})">${sign(s, concept)}</g>`;
    if (level === "sign") return { svg: signAt(1), level };
    if (level === "head") {
      const p = partFor(s, concept, kit, ["lamp", "bead", "halo"]);
      if (!p) return { svg: signAt(1), level: "sign" };
      // the sign keeps its place, smaller; a creature's head grows from its top
      return { svg: signAt(0.72, 0, box * 0.12) + partSvg(p, cx, cy - box * 0.3, box * 0.36, s.line * 0.9), level };
    }
    const p = partFor(s, concept, kit, CATEGORIES[c.cat].roles);
    if (!p) return { svg: signAt(1), level: "sign" };
    // the full figure, carrying its sign small at its heart on a plate, so it still reads as that word
    const tag = box * 0.34;
    return { svg: partSvg(p, cx, cy, box * 0.92, s.line, 0) +
      `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(tag * 0.58)}" fill="var(--plate)"/>` + signAt(0.34), level };
  }
  function determinativeAt(s, cat, x, y, size) {
    const k = size / 100;
    const svg = X().ENGINES.sigil.fn(X().rngFor(s.seed, "sigil", "cat:" + cat, 0), { ...engineOpts(s), cx: 2, wt: 2 }).svg.replace(/var\(--_bg,#0B0D14\)/g, "var(--plate)");
    return `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f3(k)})">${svg}</g>`;
  }
  function frameSvg(s, inner) {
    const w = f3(1.6 + s.wt * 0.5);
    if (s.frame === "cartouche") return `<rect x="5" y="9" width="90" height="82" rx="26" fill="none" stroke="currentColor" stroke-width="${w}"/>` + inner;
    if (s.frame === "circle") return `<circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="${w}"/>` + inner;
    return inner;
  }
  // the inner box a frame leaves
  const INNER = { none: [6, 6, 88, 88], cartouche: [15, 17, 70, 66], circle: [20, 20, 60, 60] };

  function radical(s, concept, kit) {
    const [x, y, w, h] = INNER[s.frame] || INNER.none, c = BY_ID[concept];
    const r = radicalAt(s, concept, kit, x, y, w, h);
    let inner = r.svg;
    if (s.determinative && c) inner += determinativeAt(s, c.cat, x + w - 14, y + h - 14, 18);
    return { svg: frameSvg(s, inner), level: r.level };
  }

  function compose(s, concepts, kit) {
    concepts = (concepts || []).filter((c) => BY_ID[c]).slice(0, 6);
    if (!concepts.length) return { svg: "", levels: [] };
    if (concepts.length === 1) { const r = radical(s, concepts[0], kit); return { svg: r.svg, levels: [r.level] }; }
    const [X0, Y0, W, H] = INNER[s.frame] || INNER.none, out = [], levels = [];
    const put = (c, x, y, w, h) => { const r = radicalAt(s, c, kit, x, y, w, h); out.push(r.svg); levels.push(r.level); };
    const sw = f3(1.2 + s.wt * 0.45);
    if (s.grammar === "block") {
      // Hangul: fixed slots by count; a long phrase stacks into two blocks side by side
      const n = Math.min(concepts.length, 4), g = 2;
      const slots = n === 2 ? [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]]
        : n === 3 ? [[0, 0, 0.5, 1], [0.5, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]]
        : [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]];
      slots.forEach((sl, i) => put(concepts[i], X0 + sl[0] * W + g, Y0 + sl[1] * H + g, sl[2] * W - 2 * g, sl[3] * H - 2 * g));
      // anything past four rides along the bottom as a small line of signs
      concepts.slice(4).forEach((c, i) => put(c, X0 + W - (i + 1) * W * 0.2, Y0 + H * 0.82, W * 0.18, H * 0.18));
    } else if (s.grammar === "ring") {
      // Heptapod B: the first concept at the centre, the rest around a ring that carries the stroke weight
      const cx = X0 + W / 2, cy = Y0 + H / 2, R = Math.min(W, H) * 0.36, rest = concepts.slice(1);
      out.push(`<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(R)}" fill="none" stroke="currentColor" stroke-width="${sw}"/>`);
      const size = Math.min(W, H) * (rest.length > 3 ? 0.24 : 0.3);
      rest.forEach((c, i) => {
        const a = -Math.PI / 2 + (i / rest.length) * Math.PI * 2;
        const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
        out.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(size * 0.52)}" fill="var(--plate)"/>`);
        put(c, x - size / 2, y - size / 2, size, size);
      });
      put(concepts[0], cx - R * 0.62, cy - R * 0.62, R * 1.24, R * 1.24);
    } else {
      // graph: nodes in a loose arc, in the order said, joined by strokes
      const n = concepts.length, size = Math.min(W, H) * (n > 3 ? 0.3 : 0.38);
      const pts = concepts.map((c, i) => {
        const t = n === 1 ? 0.5 : i / (n - 1), a = Math.PI * (1.15 - 1.3 * t), j = (unit(s.seed + c) - 0.5) * 0.12;
        return [X0 + W / 2 + Math.cos(a) * W * (0.32 + j), Y0 + H * 0.56 - Math.sin(a) * H * (0.3 + j)];
      });
      const d = "M" + pts.map((p) => f1(p[0]) + " " + f1(p[1])).join(" L ");
      out.push(`<path d="${d}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`);
      // small plates under each node, so the joining stroke stays visible between them
      pts.forEach(([x, y], i) => { out.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(size * 0.3)}" fill="var(--plate)"/>`); put(concepts[i], x - size / 2, y - size / 2, size, size); });
    }
    if (s.determinative) out.push(determinativeAt(s, BY_ID[concepts[0]].cat, X0 + W - 13, Y0 + H - 13, 16));
    return { svg: frameSvg(s, out.join("")), levels };
  }

  function svgDoc(inner, o) {
    o = Object.assign({ size: 100, ink: "#fff", plate: "#000", bg: null }, o || {});
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${o.size}" height="${o.size}" style="color:${o.ink};--plate:${o.plate}">` +
      (o.bg ? `<rect width="100" height="100" fill="${o.bg}"/>` : "") + inner.replace(/var\(--plate\)/g, o.plate) + "</svg>";
  }

  window.GlyphSystem = { LEXICON, CATEGORIES, ENGINES, FLESH, GRAMMARS, FRAMES, BY_ID, parse, newScript, mutate, cross, prepareKit, radical, compose, levelOf, svgDoc, hash };
})();
