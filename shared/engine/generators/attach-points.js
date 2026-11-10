/*
 * Forge — attach points. Where a part joins its parent, where children mount, where it
 * swings from, and where a frieze repeats. One set of points per part, used by the rig
 * (creature-rig.js), and available to sockets and rosettes.
 *
 * Points live in the part's own local frame: the same frame as its `svg` once the
 * `translate(-ox -oy)` in creature-parts.json is applied, i.e. (0,0) is the part's
 * (ox, oy) on its species sheet, x right, y down, in sheet px.
 *
 *   point = { kind: "joint"|"mount"|"hang"|"rim", x, y, angle (deg, 0 = +x, 90 = down), auto: bool }
 *
 * suggest(part) derives points from the part's real outline (via CreatureArch.partPolys):
 *   centre parts      joint at the top of the midline, mount at the bottom
 *   centre lamp/bead  hang at the top instead of a joint (it swings from its parent)
 *   side parts        joint at the edge nearest the spine, mount at the far tip
 *   friezes           rim points at the left and right extremes (where the next copy butts on)
 *
 * Edited points are stored in ONE world object, { id: "attach_kit", type: "attach",
 * recipe: { [partId]: point[] } }; a part without an entry uses its suggestion. So the
 * kit has points for every part from the first load, and your edits override them.
 *
 * Depends on CreatureArch.partPolys (shared/engine/creature-arch.js; no load() needed for that
 * function) and ForgeKit.rolesOf (shared/engine/generators/kit-utils.js). Classic script.
 */
(function () {
  "use strict";

  const KINDS = {
    joint: { label: "Joint", help: "where it meets its parent" },
    mount: { label: "Mount", help: "where children attach" },
    hang: { label: "Hang", help: "pivot for swinging parts" },
    rim: { label: "Rim", help: "repeat edge for friezes" },
    limb: { label: "Limb", help: "hip of a walking leg; angle points to the foot" },
  };
  const STORE_ID = "attach_kit";
  const polyCache = new Map();

  function polysOf(part) {
    if (!polyCache.has(part.id)) polyCache.set(part.id, window.CreatureArch.partPolys(part));
    return polyCache.get(part.id);
  }
  function pointsOf(part) {
    const out = [];
    for (const pl of polysOf(part)) for (const p of pl) out.push(p);
    return out;
  }
  const round = (v) => Math.round(v * 10) / 10;

  function suggest(part) {
    const pts = pointsOf(part);
    if (!pts.length) return [];
    const roles = part.roles || window.ForgeKit.rolesOf(part);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of pts) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    const w = maxX - minX, h = maxY - minY;
    const out = [];
    const mk = (kind, x, y, angle) => out.push({ kind, x: round(x), y: round(y), angle, auto: true });

    if (roles.includes("frieze") && w > h) {
      // rim: mid-height points at the left/right extremes
      const midY = (minY + maxY) / 2;
      const nearest = (tx) => pts.reduce((b, p) => (Math.hypot(p[0] - tx, (p[1] - midY) * 0.5) < Math.hypot(b[0] - tx, (b[1] - midY) * 0.5) ? p : b));
      const l = nearest(minX), r = nearest(maxX);
      mk("rim", l[0], l[1], 180); mk("rim", r[0], r[1], 0);
      if (part.side === "center") return out;
      // a side frieze is also a fin on its creature: give it a hinge too
      const axisX = 200 - (part.ox || 0);
      const root = pts.reduce((b, p) => (Math.abs(p[0] - axisX) < Math.abs(b[0] - axisX) ? p : b));
      mk("joint", root[0], root[1], 0);
      return out;
    }

    if (part.side === "center") {
      // the midline: points within a narrow band around the axis (x≈0 in local frame,
      // since a centre part's ox sits on the sheet's axis)
      const band = Math.max(2, w * 0.12);
      const mid = pts.filter((p) => Math.abs(p[0]) <= band);
      const src = mid.length ? mid : pts;
      const top = src.reduce((b, p) => (p[1] < b[1] ? p : b));
      const bot = src.reduce((b, p) => (p[1] > b[1] ? p : b));
      const hangs = (roles.includes("lamp") || roles.includes("bead")) && !roles.includes("segment") && !roles.includes("core");
      mk(hangs ? "hang" : "joint", 0, top[1], -90);
      if (!hangs || h > w * 1.4) mk("mount", 0, bot[1], 90);
      return out;
    }

    // side part (drawn left of the axis, mirrored to the right): the spine is towards +x,
    // at local x = 200 - ox on a 400-wide sheet
    const axisX = 200 - (part.ox || 0);
    const root = pts.reduce((b, p) => (Math.abs(p[0] - axisX) < Math.abs(b[0] - axisX) ? p : b));
    const tip = pts.reduce((b, p) => (Math.hypot(p[0] - root[0], p[1] - root[1]) > Math.hypot(b[0] - root[0], b[1] - root[1]) ? p : b));
    mk("joint", root[0], root[1], 0);
    mk("mount", tip[0], tip[1], Math.round(Math.atan2(tip[1] - root[1], tip[0] - root[0]) * 180 / Math.PI));
    return out;
  }

  // the points a part actually uses: edited if stored, else suggested
  function get(part, store) {
    return (store && store[part.id]) || suggest(part);
  }
  function isEdited(part, store) { return !!(store && store[part.id]); }

  // first point of a kind, in SHEET coordinates (for rigs): local + (ox, oy)
  function sheetPoint(part, store, kind) {
    const p = get(part, store).find((q) => q.kind === kind);
    return p ? { ...p, x: p.x + (part.ox || 0), y: p.y + (part.oy || 0) } : null;
  }

  // a limb point derived from a part's points: at its joint, aimed at its mount (the tip)
  function limbFrom(pts) {
    const j = pts.find((q) => q.kind === "joint") || pts[0], m = pts.find((q) => q.kind === "mount");
    if (!j) return null;
    const angle = m ? Math.round(Math.atan2(m.y - j.y, m.x - j.x) * 180 / Math.PI) : 180;
    return { kind: "limb", x: j.x, y: j.y, angle };
  }
  // mark a side part as a walking leg (or not); either way the part counts as edited after
  function setLimb(part, store, on) {
    const pts = get(part, store).filter((q) => q.kind !== "limb");
    if (on) { const l = limbFrom(pts); if (l) pts.push(l); }
    store[part.id] = pts.map(({ auto, ...q }) => q);
    return store;
  }
  const hasLimb = (part, store) => get(part, store).some((q) => q.kind === "limb");

  async function load(world) {
    const rec = await world.get(STORE_ID);
    return (rec && rec.recipe) || {};
  }
  async function save(world, store) {
    return world.put({ id: STORE_ID, type: "attach", name: "Attach points", recipe: store, refs: Object.keys(store).map((id) => "part:" + id) });
  }

  window.AttachPoints = { KINDS, STORE_ID, suggest, get, isEdited, sheetPoint, setLimb, hasLimb, limbFrom, load, save, polysOf };
})();
