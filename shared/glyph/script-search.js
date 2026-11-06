/* shared/glyph/script-search.js — measuring a whole script, for MAP-Elites (shared/evolve/map-elites.js).
   The unit of search is a script (a GlyphSystem recipe), not a glyph: a good script is one where the
   signs are told apart easily and still look like one hand. Each script is judged by drawing eight
   dictionary entries, one from every category and more, into one sheet and reading the pixels:

     legibility   how distinct the signs are: for each sign, how far it is from its nearest neighbour
                  (1 - shared ink / combined ink, on a softened 24 px copy), averaged
     figurative   how far it has moved from sign to picture: figure 1, head 0.5, sign 0, averaged
     density      ink coverage
     symmetry     left-right mirror agreement
     variety      how much the signs differ in weight (the opposite of a steady hand)
   Quality is consistency, the "one script" test: signs of even weight, none empty, none a blot.

     const item = await ScriptSearch.evaluate(script, kit)   -> { genome, traits, quality, thumb, levels }
     ScriptSearch.AXES, ScriptSearch.similarity(a, b), ScriptSearch.SAMPLE
   Needs GlyphSystem. Classic script. */
(function () {
  "use strict";
  const G = () => window.GlyphSystem;
  const SAMPLE = ["person", "bird", "sea", "city", "fly", "fall", "sun", "night"];
  const CELL = 48, COLS = 4, ROWS = 2, SMALL = 24;

  const AXES = {
    legibility: { label: "Alike → distinct", min: 0.25, max: 0.85 },
    figurative: { label: "Sign → figure", min: 0, max: 1 },
    density:    { label: "Sparse → dense", min: 0.02, max: 0.22 },
    symmetry:   { label: "Wild → symmetric", min: 0.45, max: 1 },
    variety:    { label: "Even → varied", min: 0, max: 0.9 },
  };

  const sheetCv = document.createElement("canvas"), sctx = sheetCv.getContext("2d", { willReadFrequently: true });
  sheetCv.width = CELL * COLS; sheetCv.height = CELL * ROWS;
  const smallCv = document.createElement("canvas"), smctx = smallCv.getContext("2d", { willReadFrequently: true });
  smallCv.width = SMALL; smallCv.height = SMALL;

  function sheetSvg(script, kit) {
    const levels = [];
    let inner = "";
    SAMPLE.forEach((c, i) => {
      const r = G().radical(script, c, kit); levels.push(r.level);
      const x = (i % COLS) * 100, y = Math.floor(i / COLS) * 100;
      inner += `<g transform="translate(${x} ${y})">${r.svg}</g>`;
    });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COLS * 100} ${ROWS * 100}" width="${CELL * COLS}" height="${CELL * ROWS}" style="color:#fff">` +
      `<rect width="100%" height="100%" fill="#000"/>` + inner.replace(/var\(--plate\)/g, "#000") + "</svg>";
    return { svg, levels };
  }
  function load(svg) {
    return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("sheet would not draw")); im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); });
  }

  async function evaluate(script, kit) {
    const { svg, levels } = sheetSvg(script, kit);
    const im = await load(svg);
    sctx.fillStyle = "#000"; sctx.fillRect(0, 0, sheetCv.width, sheetCv.height); sctx.drawImage(im, 0, 0);
    const inks = [], syms = [], smalls = [];
    for (let i = 0; i < SAMPLE.length; i++) {
      const x0 = (i % COLS) * CELL, y0 = Math.floor(i / COLS) * CELL;
      const d = sctx.getImageData(x0, y0, CELL, CELL).data;
      let ink = 0, sym = 0, symN = 0;
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
        const a = d[(y * CELL + x) * 4] / 255; ink += a;
        if (x < CELL / 2) { const b = d[(y * CELL + CELL - 1 - x) * 4] / 255; if (a > 0.1 || b > 0.1) { sym += 1 - Math.abs(a - b); symN++; } }
      }
      inks.push(ink / (CELL * CELL)); syms.push(symN ? sym / symN : 1);
      // a softened small copy, so a sign shifted by a hair still counts as the same sign
      smctx.clearRect(0, 0, SMALL, SMALL); smctx.imageSmoothingEnabled = true; smctx.drawImage(sheetCv, x0, y0, CELL, CELL, 0, 0, SMALL, SMALL);
      const sd = smctx.getImageData(0, 0, SMALL, SMALL).data, v = new Float32Array(SMALL * SMALL);
      for (let k = 0; k < v.length; k++) v[k] = sd[k * 4] / 255;
      smalls.push(v);
    }
    // legibility: distance to the nearest other sign (Ruzicka: 1 - sum(min) / sum(max))
    let leg = 0;
    for (let i = 0; i < smalls.length; i++) {
      let best = 1;
      for (let j = 0; j < smalls.length; j++) {
        if (i === j) continue;
        let mn = 0, mx = 0; const a = smalls[i], b = smalls[j];
        for (let k = 0; k < a.length; k++) { mn += Math.min(a[k], b[k]); mx += Math.max(a[k], b[k]); }
        best = Math.min(best, mx ? 1 - mn / mx : 0);
      }
      leg += best;
    }
    const mean = inks.reduce((a, b) => a + b, 0) / inks.length;
    const sd = Math.sqrt(inks.reduce((a, b) => a + (b - mean) ** 2, 0) / inks.length);
    const variety = mean ? Math.min(1, sd / mean) : 0;
    const traits = {
      legibility: leg / smalls.length,
      figurative: levels.reduce((a, l) => a + (l === "figure" ? 1 : l === "head" ? 0.5 : 0), 0) / levels.length,
      density: mean,
      symmetry: syms.reduce((a, b) => a + b, 0) / syms.length,
      variety,
    };
    let q = 1 - 0.6 * variety;                                    // a steady hand reads as one script
    if (inks.some((v) => v < 0.006)) q -= 0.5;                    // a sign that drew nothing
    if (mean > 0.28) q -= (mean - 0.28) * 3;                      // blots
    if (traits.legibility < 0.2) q -= 0.3;                        // signs that cannot be told apart
    // thumbnail: four signs, two by two
    const thumb = document.createElement("canvas"); thumb.width = thumb.height = CELL * 2;
    const tc = thumb.getContext("2d");
    [0, 1, 4, 5].forEach((i, k) => tc.drawImage(sheetCv, (i % COLS) * CELL, Math.floor(i / COLS) * CELL, CELL, CELL, (k % 2) * CELL, Math.floor(k / 2) * CELL, CELL, CELL));
    return { genome: script, traits, quality: Math.max(0, Math.min(1, q)), thumb, levels };
  }

  function similarity(a, b) {
    const A = a.genome, B = b.genome;
    let same = 0, n = 0;
    for (const k of ["engine", "flesh", "grammar", "frame", "seed"]) { same += A[k] === B[k] ? 1 : 0; n++; }
    let near = 0, m = 0;
    for (const [k, ax] of Object.entries(AXES)) { near += 1 - Math.min(1, Math.abs(a.traits[k] - b.traits[k]) / (ax.max - ax.min)); m++; }
    return 0.5 * (same / n) + 0.5 * (near / m);
  }

  window.ScriptSearch = { AXES, SAMPLE, evaluate, similarity };
})();
