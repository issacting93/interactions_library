/*
 * Forge — part library: ONE way to fetch the hand-drawn parts and turn a part into outlines.
 * The library (shared/data/creature-parts.json, 1.8 MB) is fetched once per page and kept; a part's
 * outlines are worked out once and kept too, so every caller sees the same lines.
 *
 *   PartLib.load(url?)        -> Promise<parts[]> (default ../../../shared/data/creature-parts.json)
 *   PartLib.byId(id)          the part, after load (or undefined)
 *   PartLib.lines(part, k?)   -> flat polylines [[x0, y0, x1, y1, ...], ...] in the part's own frame,
 *                                curves flattened into k steps (default 8), rounded to 0.1;
 *                                needs LimbArt.flattenD (shared/engine/motion/limb-art.js)
 *   PartLib.add(parts)        register extra parts (hex blocks, your hand-built pieces) beside the kit
 *
 * Classic script.
 */
(function () {
  "use strict";
  let loading = null;
  const index = new Map(), cache = new Map();
  function load(url) {
    if (!loading) loading = fetch(url || "../../../shared/data/creature-parts.json").then((r) => r.json()).then((all) => { for (const p of all) index.set(p.id, p); return all; });
    return loading;
  }
  const add = (parts) => { for (const p of [].concat(parts || [])) if (p && p.id) { index.set(p.id, p); cache.delete(p.id + ":8"); } };
  function lines(part, k) {
    const p = typeof part === "string" ? index.get(part) : part; if (!p) return [];
    const key = p.id + ":" + (k || 8);
    if (!cache.has(key)) {
      const flat = window.LimbArt && window.LimbArt.flattenD;
      if (!flat) throw new Error("PartLib.lines needs shared/engine/motion/limb-art.js");
      cache.set(key, [...String(p.svg).matchAll(/\sd="([^"]+)"/g)].flatMap((m) => flat(m[1], k || 8)).map((pl) => pl.map((v) => Math.round(v * 10) / 10)));
    }
    return cache.get(key);
  }
  window.PartLib = { load, byId: (id) => index.get(id), lines, add };
})();
