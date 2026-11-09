/*
 * Forge — mech slots: which parts may go in which slot of a mech, in ONE place. Every page that
 * offers parts for a slot (Compose's bloom, the Walker Bestiary's Kit Mech and remix, the export
 * scripts) asks here, so a "thigh" means the same thing everywhere.
 *
 * Two sources, in order:
 *   curated  shared/data/mech-slots.json: lists picked by hand in the Mech Parts Curation page
 *   rules    shape rules on a part's box (w, h, side), the fallback for any slot with no list
 *
 *   MechSlots.SLOTS                   every slot name the rules know
 *   MechSlots.RULES                   { slot: (part) => bool }
 *   MechSlots.load(url?)              fetch the curated lists once (default ../../../shared/data/mech-slots.json);
 *                                     resolves {} when the file is missing
 *   MechSlots.pool(slot, parts, curated?)   -> part ids: the curated list when it has entries, else
 *                                     the rule applied to `parts` (glyph sheets left out)
 *   MechSlots.pools(slots, parts, curated?) -> { slot: ids } for several slots at once
 *
 * Quad mech slots: thigh, shin, foot, hull, visor, turret, base, sidePod. Blade mech slots:
 * body, pod, front, back.
 * Pure: no DOM except load()'s fetch. Classic script.
 */
(function () {
  "use strict";
  const asp = (p) => Math.max(p.w, p.h) / Math.max(1, Math.min(p.w, p.h));
  const M = (p) => Math.max(p.w, p.h);
  const long = (p) => (asp(p) >= 2 && asp(p) <= 4 && Math.min(p.w, p.h) >= 16 && M(p) >= 50 && M(p) <= 110) || (asp(p) >= 2.4 && M(p) >= 50 && M(p) <= 120);
  const RULES = {
    // quad mech (kit legs in three parts)
    thigh: (p) => asp(p) >= 2 && asp(p) <= 4 && Math.min(p.w, p.h) >= 16 && M(p) >= 50 && M(p) <= 110,   // long, with some bulk
    shin: (p) => asp(p) >= 2.4 && M(p) >= 50 && M(p) <= 120,                                           // long and lean
    foot: (p) => asp(p) <= 1.6 && M(p) >= 22 && M(p) <= 45,                                            // small and compact
    hull: (p) => p.side === "center" && asp(p) <= 2.2 && p.w >= 80 && p.w >= p.h,                      // the big wide plate
    visor: (p) => p.side === "center" && p.w / p.h >= 1.6 && p.w >= 40 && p.w <= 100,                  // a wide slit
    turret: (p) => p.side === "center" && asp(p) <= 1.3 && p.w >= 30 && p.w <= 70,
    base: (p) => p.side === "center" && asp(p) <= 1.3 && p.w >= 30 && p.w <= 70,
    sidePod: (p) => p.side === "center" && p.w / p.h >= 1.6 && p.w >= 60 && p.w <= 130,               // a wide plate beside the hull
    // blade mech: a compact piece at each hip
    pod: (p) => (asp(p) <= 1.6 && M(p) >= 22 && M(p) <= 45) || (p.side === "center" && asp(p) <= 1.3 && p.w >= 30 && p.w <= 70),
    // blade mech (one blade per leg)
    body: (p) => p.side === "center" && asp(p) <= 2.2 && p.w >= 80 && p.w >= p.h,
    front: long,
    back: long,
  };
  const SLOTS = Object.keys(RULES);
  const usable = (parts) => parts.filter((p) => !/xenoglyph/.test(p.species || ""));

  let loading = null;
  function load(url) {
    if (!loading) loading = fetch(url || "../../../shared/data/mech-slots.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    return loading;
  }
  function pool(slot, parts, curated) {
    const list = curated && Array.isArray(curated[slot]) ? curated[slot].filter((x) => typeof x === "string") : [];
    if (list.length) return list.slice();
    const rule = RULES[slot]; if (!rule) return [];
    return usable(parts).filter(rule).map((p) => p.id);
  }
  const pools = (slots, parts, curated) => Object.fromEntries(slots.map((k) => [k, pool(k, parts, curated)]));

  window.MechSlots = { SLOTS, RULES, load, pool, pools };
})();
