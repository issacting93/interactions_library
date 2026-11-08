/* INTERACTIONS — Creature-parts architecture: renderer-agnostic procedural buildings/ornament.
   Ported from two Three.js tools so the ideas (SVG parsing, Bezier flattening, role
   classification, elevation composition, 3D placement) can be reused by WebGL2/other renderers
   with no Three.js dependency at all:
     - "Sigil City (3).html" (search "creature architecture" / `ARCH = {`) — partPolys/archRoles/
       archKits/elevTower/elevHall/standElev: parses shared/engine/creature-parts.json into polylines,
       buckets parts into roles by aspect ratio, picks a per-zone "kit" of parts, composes flat
       2D elevations (towers and halls), then stands an elevation up in the world as 2-3 crossed
       vertical planes through a point (a whole building, seen from any angle).
     - "Tower Forge (1).html" (search "Spire Forge ornament") — the `onWall(id, th, y, px, lift)`
       idea: wrap a creature part onto a tapered tower's curved surface at a given angle/height.
       Sigil City never does this (it only stands parts through flat footprints); this module's
       wrapOnSurface() generalizes onWall's trig to a whole elevation, for tower ornament bands.

   This module does NOT touch THREE.js, WebGL, or the DOM (besides fetch()). Every function here
   returns plain arrays / typed arrays describing 2D or 3D line geometry; a consumer uploads that
   into whatever renderer it likes (a WebGL2 gl.LINES buffer, a canvas 2D path, Three.js
   LineSegments, anything).

   Load order:
     <script src="../../../shared/engine/rng.js"></script>        (for RNG.create — archKits takes a caller-
                                                           supplied rnd() instead of calling RNG
                                                           itself, so this dependency is advisory:
                                                           the repo convention is RNG.create(seed,
                                                           ...parts) to derive that rnd())
     <script src="../../../shared/engine/creature-arch.js"></script>
     then:
       CreatureArch.load('../../../shared/engine/creature-parts.json').then(() => { ... use it ... });

   Data source: shared/engine/creature-parts.json, a flat array of 347 objects:
     { id, species, side: "center"|"left", w, h, ox, oy, bw, tw, defs: "", svg: '<g transform=
       "translate(tx ty)"><path d="M.. L.. C.. Z" stroke="#hex" .../></g>' }
   24 of the 347 parts carry SVG masks/clip-paths (non-empty `defs`, or `mask=`/`clip-path=` in
   `svg`) — this module skips those 24 outright (same as both reference files) rather than
   implementing SVG clipping. Path data in the real file only ever uses uppercase M/L/C/Z
   (verified against all 347 parts) — relative/lowercase commands are not present, but a few
   parts do carry MULTIPLE <path> elements per <g> (13 of them, 7 after the mask/clip skip), so
   the parser loops over every ` d="..."` match rather than assuming one path per part.
*/
(function () {
  'use strict';

  // ---------- SVG path parsing + Bezier flattening ----------

  const BEZIER_STEPS = 8; // samples per cubic curve (reference used 3; this is smoother for glow lines)

  // Parse one part's `svg` string into an array of polylines: Array<Array<[x,y]>>.
  // Each polyline also gets attached as `.color` (hex string or null) via the caller (partPolys).
  function flattenPath(d, tx, ty) {
    const toks = d.match(/[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
    let i = 0, cmd = null, cur = null, start = null, poly = [];
    const out = [];
    const flush = () => { if (poly.length >= 2) out.push(poly); poly = []; };
    while (i < toks.length) {
      const t = toks[i];
      if (t === 'M' || t === 'L' || t === 'C' || t === 'Z') { cmd = t; i++; }
      if (cmd === 'Z') {
        if (start) poly.push([start[0], start[1]]);
        flush(); cmd = null; continue;
      }
      if (!cmd) { i++; continue; }
      const n = cmd === 'C' ? 6 : 2;
      const v = toks.slice(i, i + n).map(Number);
      if (v.length < n || v.some(Number.isNaN)) break;
      i += n;
      if (cmd === 'M') {
        flush();
        cur = [v[0] + tx, v[1] + ty];
        start = cur;
        poly.push(cur);
        cmd = 'L'; // subsequent bare coordinate pairs after M are implicit lineto's
      } else if (cmd === 'L') {
        cur = [v[0] + tx, v[1] + ty];
        poly.push(cur);
      } else { // C: cubic Bezier, flatten into BEZIER_STEPS line segments
        const p0 = cur;
        const p1 = [v[0] + tx, v[1] + ty], p2 = [v[2] + tx, v[3] + ty], p3 = [v[4] + tx, v[5] + ty];
        for (let k = 1; k <= BEZIER_STEPS; k++) {
          const u = k / BEZIER_STEPS, a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u * u, dd = u ** 3;
          poly.push([
            a * p0[0] + b * p1[0] + c * p2[0] + dd * p3[0],
            a * p0[1] + b * p1[1] + c * p2[1] + dd * p3[1],
          ]);
        }
        cur = p3;
      }
    }
    flush();
    return out;
  }

  // CreatureArch.partPolys(part) -> Array<Array<[x,y]>>, each polyline carrying a `.color` property.
  function partPolys(part) {
    const m = /translate\(([-\d.e]+)[ ,]([-\d.e]+)\)/.exec(part.svg);
    const tx = m ? +m[1] : 0, ty = m ? +m[2] : 0;
    const out = [];
    const dRe = /<path[^>]*\sd="([^"]+)"[^>]*>/g;
    let dm;
    while ((dm = dRe.exec(part.svg))) {
      const tag = dm[0];
      const cm = /stroke="(#[0-9a-fA-F]{3,8})"/.exec(tag);
      const color = cm ? cm[1] : null;
      const polys = flattenPath(dm[1], tx, ty);
      for (const pl of polys) { pl.color = color; out.push(pl); }
    }
    return out;
  }

  // ---------- role classification ----------

  // CreatureArch.archRoles(part) -> array of role names (a part may match 0, 1, or several).
  // Thresholds for the original 7 roles below (frieze/bead/segment/lamp/blade/spire/rib) are
  // ported verbatim from Sigil City's archRoles() and left untouched by design, even though they
  // differ slightly from Spire Forge's own numbers for the same roles — these were independently
  // tuned/verified against the real 347-part creature-parts.json data. The 4 new roles
  // (hook/core/halo/buttress) have no equivalent in Sigil City, so their thresholds are ported
  // verbatim from Spire Forge's rolesOf() instead (the only reference that has them).
  function archRoles(part) {
    const r = [];
    const w = part.w, h = part.h, mx = Math.max(w, h), C = part.side === 'center';
    if (mx < 14) return r;
    if (w >= 24 && w <= 95 && h >= 12 && h <= 52 && w >= h * 1.1) r.push('frieze');
    if (!C && mx >= 18 && mx <= 60) r.push('hook');
    if (C && Math.abs(w - h) < 0.22 * w && mx >= 20 && mx <= 60) r.push('bead');
    if (C && h >= 250 && w <= 230) r.push('core');
    if (C && h >= 25 && h <= 95 && w <= 64 && h >= 1.25 * w) r.push('segment');
    if (C && w >= 24 && w <= 100 && h >= 30 && h <= 130) r.push('lamp');
    if (!C && mx >= 22 && mx <= 130) r.push('blade');
    if (C && h >= 60 && w <= 38 && h >= 2.4 * w) r.push('spire');
    if (!C && h >= 40 && h <= 140 && h >= 1.9 * w) r.push('rib');
    if (C && w >= 100 && w <= 250 && Math.abs(w - h) < 0.16 * w) r.push('halo');
    if (!C && mx >= 90 && mx <= 240) r.push('buttress');
    return r;
  }

  // Original 7 kept first and in their original order (archKits()'s per-role rnd() draw order
  // for those 7 is therefore unchanged in relative sequence); the 4 ported roles are appended.
  const ROLE_NAMES = ['frieze', 'bead', 'segment', 'lamp', 'blade', 'spire', 'rib', 'hook', 'core', 'halo', 'buttress'];

  // ---------- loading ----------

  const CreatureArch = {
    ready: false,
    parts: [],       // array of { id, species, side, w, h, polys } (parsed, unskipped parts)
    byId: {},        // id -> parsed part record
    byRole: {},       // role -> array of parsed part records
    skippedCount: 0,
  };

  function isMaskedOrClipped(p) {
    return !!p.defs || /mask=|clip-path=/.test(p.svg);
  }

  function indexPart(rec) {
    CreatureArch.parts.push(rec);
    CreatureArch.byId[rec.id] = rec;
    for (const role of archRoles(rec)) {
      (CreatureArch.byRole[role] = CreatureArch.byRole[role] || []).push(rec);
    }
  }

  // CreatureArch.load(url) -> Promise<void>
  function load(url) {
    url = url || '../../../shared/engine/creature-parts.json';
    return fetch(url).then((r) => r.json()).then((list) => {
      let skipped = 0;
      for (const p of list) {
        if (isMaskedOrClipped(p)) { skipped++; continue; }
        const polys = partPolys(p);
        if (!polys.length) { skipped++; continue; }
        indexPart({ id: p.id, species: p.species, side: p.side, w: p.w, h: p.h, polys });
      }
      CreatureArch.skippedCount = skipped;
      CreatureArch.ready = true;
      // eslint-disable-next-line no-console
      console.log('[CreatureArch] loaded ' + CreatureArch.parts.length + ' parts, skipped ' + skipped + ' (masked/clipped/empty)');
    });
  }

  // ---------- per-group kit selection ----------

  // CreatureArch.archKits(rnd, groupKeys) -> Map<groupKey, Map<role, part>>
  // One random part per role per group, using the caller-supplied rnd() (RNG.create(...) convention).
  function archKits(rnd, groupKeys) {
    const kits = new Map();
    for (const key of groupKeys) {
      const kit = new Map();
      for (const role of ROLE_NAMES) {
        const list = CreatureArch.byRole[role];
        if (list && list.length) kit.set(role, list[Math.floor(rnd() * list.length)]);
      }
      kits.set(key, kit);
    }
    return kits;
  }

  // ---------- elevation composition ----------
  // Elevation = { E: Array<{part, x, y, s, rot, flipX, free}>, top } in local px space:
  // x = horizontal across the elevation (0 = axis), y = UP from the elevation's base.
  // "left"-side parts are mirrored to the opposite x automatically by standElevation, UNLESS the
  // placement is marked `free: true` (an already-centered/standalone placement, ported from the
  // reference's same convention).

  // ---------- band/bay grammar (ported from Spire Forge's dressBand/RULES/ruleFor/makeBays) ----------
  // Spire Forge composes one band (a horizontal facade strip) as an optional cornice plus an odd
  // number of "bays", each bay's content picked by position (center/end/side) via increasingly
  // general rule keys: family.level.position, falling back to family.position, falling back to
  // base.position. A "control grammar" ties end-bay rules to side-bay rules ~50% of the time so a
  // whole building reads calmer/more consistent instead of every bay being independently random.
  // Ported here as two new, additive functions: makeBandGrammar() (ports makeBays/RULES/ruleFor —
  // builds + randomizes the rule table ONCE per building) and composeBand() (ports dressBand —
  // applies a pre-built grammar's rules to lay out one band's bays at a given width/height).
  //
  // Adaptation note: Spire Forge's ruleFor() randomly picks a PART from a pool of same-role parts
  // (e.g. every loaded "lamp" part) each time a rule is built. This module's archKits() gives one
  // part per role PER KIT (no pools), so a rule here instead picks a ROLE NAME from a small
  // candidate list; composeBand() resolves that role to an actual part via the caller's
  // kit.get(role). This keeps the original's "a rule is randomized once, and every bay sharing
  // that rule looks the same" behavior while fitting this module's one-part-per-role kit shape.
  const BAY_OPEN_ROLES = ['lamp', 'bead', 'segment']; // candidate roles for a center/end/side bay
  const BAY_PIL_ROLES = ['segment', 'spire'];          // candidate roles for a pilaster

  // Muqarnas-style tier alternation: a real muqarnas cornice (and most bay-grammar facades it
  // inspired) never repeats the exact same cell down a row -- it cycles through a small set of
  // kit variants (classically 3: a "straight" tier, a "stepped" tier, a "pointed" tier) so the
  // rhythm reads as hand-fitted rather than stamped. BAND_RULE_KEYS positions (center/end/side)
  // used to resolve to ONE rule shared by every bay in that position; they now resolve to an
  // array of BAY_KIT_COUNT variant rules, cycled by bay index (`i % BAY_KIT_COUNT` in
  // composeBand/buildTemplate's bay loop) so e.g. every 3rd "side" bay looks the same but its two
  // neighbors differ. Pilaster rules are left single (one pilaster style per family, same as
  // before) since alternating the vertical dividers reads as noise, not rhythm.
  const BAY_KIT_COUNT = 3;

  // the fixed set of rule keys a grammar precomputes, ported verbatim from Spire Forge's RULES
  // table (its UI label strings are dropped there; only the lookup keys matter here)
  const BAND_RULE_KEYS = [
    'base.ground.center', 'base.ground.end', 'base.ground.side',
    'base.center', 'base.end', 'base.side',
    'drum.center', 'drum.end', 'drum.side',
    'base.pilaster', 'drum.pilaster',
  ];

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  function bandRuleFor(key, rnd, kit) {
    const pick = (roles) => {
      const avail = roles.filter((role) => kit.get(role));
      return avail.length ? avail[Math.floor(rnd() * avail.length)] : null;
    };
    if (key.endsWith('pilaster')) return { role: rnd() < 0.75 ? pick(BAY_PIL_ROLES) : null };
    const big = key.endsWith('center') ? 1.15 : key.endsWith('end') ? 1.0 : 0.85;
    return { role: pick(BAY_OPEN_ROLES), scale: +(big * (0.9 + rnd() * 0.2)).toFixed(2) };
  }

  // array of BAY_KIT_COUNT independently-rolled variants of the same rule key -- the muqarnas
  // alternation set for that position (see BAY_KIT_COUNT note above). Pilaster keys never call
  // this (makeBandGrammar keeps them single).
  function bandRuleVariants(key, rnd, kit, n) {
    const out = [];
    for (let i = 0; i < (n || BAY_KIT_COUNT); i++) out.push(bandRuleFor(key, rnd, kit));
    return out;
  }

  // CreatureArch.makeBandGrammar(rnd, kit) -> { width, size, rules }
  // Ports Spire Forge's makeBays(): builds the full BAND_RULE_KEYS rule table using the
  // caller-supplied rnd() (RNG.create(...) convention, same as archKits), then applies the
  // "control grammar" (end bays tied to side bays, ~50% of the time) exactly like the reference.
  // Call this ONCE per building and reuse the returned grammar across every composeBand() call
  // for that building, so its bands read as belonging to one structure — same as Spire Forge
  // builds one `g.bays` per building and reuses it across every dressBand() call.
  function makeBandGrammar(rnd, kit) {
    const rules = {};
    for (const key of BAND_RULE_KEYS) {
      rules[key] = key.endsWith('pilaster') ? bandRuleFor(key, rnd, kit) : bandRuleVariants(key, rnd, kit, BAY_KIT_COUNT);
    }
    for (const fam of ['base.ground', 'base', 'drum']) {
      if (rnd() < 0.5) {
        const side = rules[fam + '.side']; // array of BAY_KIT_COUNT variants
        rules[fam + '.end'] = side.map((r) => ({ ...r, scale: (r.scale || 1) * 1.1 }));
      }
    }
    return { width: Math.round(26 + rnd() * 22), size: +(0.7 + rnd() * 0.2).toFixed(2), rules };
  }

  // CreatureArch.composeBand(kit, W, H, grammar, opts) -> Array<{part, x, y, s, rot, free}>
  // Ports Spire Forge's dressBand(): lays out ONE band (width W, height H, x spanning -W/2..W/2,
  // y spanning 0 (band bottom) .. H (band top), matching this module's local +Y-up convention) as
  // an optional cornice frieze across the top plus an odd number of bays across the rest of the
  // band, using `grammar` (from makeBandGrammar()) to pick each bay's content by position
  // (center/end/side) via the same most-specific-first fallback chain as the reference:
  //   family.level.position -> family.position -> base.position
  // opts: { family (default 'base'), level (e.g. 'ground', or omit for the generic/upper case),
  //   cornice (default true; pass false to omit the top frieze strip) }.
  // Every returned placement is `free: true` (this function positions bay/pilaster/cornice
  // content left-to-right explicitly, rather than relying on the axis-centered single-part +
  // side-mirroring convention elevTower/elevHall use elsewhere) — a caller drops these straight
  // into an elevation's `E` array (optionally shifting every entry's `y` to stack several bands).
  function composeBand(kit, W, H, grammar, opts) {
    opts = opts || {};
    const family = opts.family || 'base';
    const level = opts.level || null;
    const useCornice = opts.cornice !== false;
    const half = W / 2, margin = Math.min(5, half * 0.3);
    const out = [];

    // bays: split the width into an odd number of bays, position-labeled center/end/side. Moved
    // ahead of the cornice/pilaster blocks below (2026-11-03, "module-derived proportions" pass)
    // so `bw` -- the bay module, this grammar's equivalent of a classical order's intercolumniation
    // -- is known before anything that should SCALE OFF it gets sized, same idea as a classical
    // entablature height or column diameter being expressed as a fraction of the module rather
    // than as its own independent constant.
    const inner = 2 * (half - margin);
    let n = Math.max(1, Math.round(inner / clamp(grammar.width, 12, 120)));
    if (n % 2 === 0) n += 1;
    const bw = inner / n, c = (n - 1) / 2;

    // cornice: a repeated frieze row across the top ~24% of the band. Ported from dressBand's
    // cornice strip; its accompanying raw-SVG `ring()` baseline is dropped since a bare line has
    // no representation in this module's part-placement shape. Height clamped into a module-
    // derived range (0.3x-0.95x the bay width) rather than a bare `H * 0.24` -- a band with wide
    // bays now reads a proportionally taller entablature, a band with narrow bays a shorter one,
    // instead of every band at a given H getting the identical cornice regardless of bay rhythm.
    let zoneH = H;
    if (useCornice && H >= 28) {
      const ch = clamp(H * 0.24, bw * 0.3, bw * 0.95);
      const frieze = kit.get('frieze');
      if (frieze) {
        const fs = clamp(Math.min((ch * 0.8) / frieze.h, (W * 0.9) / frieze.w), 0.45, 1.15);
        const step = frieze.w * fs * 1.08;
        const n2 = Math.max(1, Math.floor(W / step));
        for (let i = 0; i < n2; i++) {
          out.push({ part: frieze, x: -W / 2 + step * (i + 0.5) + (W - n2 * step) / 2, y: H - ch / 2, s: fs, rot: 0, free: true });
        }
      }
      zoneH = H - ch;
    }
    // muqarnas alternation: the resolved entry is an array of BAY_KIT_COUNT variant rules (see
    // makeBandGrammar); pick one by bay index so neighboring bays of the same position class
    // (e.g. two "side" bays in a row) don't look identical.
    const ruleFor = (pos, i) => {
      const arr = grammar.rules[`${family}.${level}.${pos}`] || grammar.rules[`${family}.${pos}`] || grammar.rules[`base.${pos}`];
      return Array.isArray(arr) ? arr[i % arr.length] : arr;
    };
    for (let i = 0; i < n; i++) {
      const x = -half + margin + bw * (i + 0.5);
      const pos = i === c ? 'center' : (i === 0 || i === n - 1) && n >= 3 ? 'end' : 'side';
      const r = ruleFor(pos, i);
      const part = r && r.role && kit.get(r.role);
      if (!part) continue;
      const box = Math.min(bw * 0.86, zoneH * 0.86) * clamp(grammar.size, 0.3, 1.2) * (r.scale || 1);
      const s = clamp(box / Math.max(part.w, part.h), 0.12, 1.8);
      out.push({ part, x, y: zoneH * 0.5, s, rot: 0, free: true });
    }

    // pilasters on every internal bay boundary. Spire Forge places only the left half and relies
    // on its SVG renderer's x-position mirroring to fill the right half; this module's `free`
    // placements aren't auto-mirrored that way, so every boundary (both halves) is placed here.
    const pr = grammar.rules[`${family}.pilaster`];
    const pp = pr && pr.role && kit.get(pr.role);
    if (pp) {
      // module-derived width: a pilaster's apparent width is also capped to a fraction of the bay
      // module (classical: column diameter as a fraction of the intercolumniation), not driven by
      // height alone -- a wide-bay band gets a proportionally stouter divider, a narrow-bay band a
      // slenderer one, instead of every pilaster being sized only off zoneH regardless of rhythm.
      for (let k = 1; k < n; k++) {
        const x = -half + margin + bw * k;
        const s = clamp(Math.min((zoneH * 0.92) / pp.h, (bw * 0.26) / Math.max(pp.w, 1)), 0.12, 1.4);
        out.push({ part: pp, x, y: zoneH * 0.5, s, rot: 0, free: true });
      }
    }
    return out;
  }

  // CreatureArch.elevFromOrn(orn, H) -> { E, top }
  // Builds a band elevation from Spire Forge's `toTowerForge()` bridge's per-tier `orn` field
  // (bay/front/pilaster part IDs + computed counts/pixel sizes, OR shaft-style rib+frieze) instead
  // of composeBand()'s grammar+kit (which only ever picks ONE part per ROLE and lays it out by
  // generic rule). This is the exact-fidelity path: `orn` already names the literal part id and
  // how many times/how big to place it, so this function just resolves ids via CreatureArch.byId
  // and lays them out — no role resolution, no randomness. Returns the same { E, top } shape as
  // every other elevation builder, so a caller feeds it straight into standElevation/wrapOnSurface.
  // orn shape (produced by toTowerForge, see Spire Forge (2)'s index.html "bridge" section):
  //   { bay, front, pil, frieze, bayN, bayPx, pilPx, friezePx }  — base/drum tiers
  //   { rib, ribN, ribPx, frieze, friezePx }                     — shaft tiers
  // Any field can be absent (a tier with no bays/ribs still gets its frieze, if any); an orn with
  // nothing resolvable returns { E: [], top: H }, same "nothing to draw" contract as the other
  // elevXxx functions returning an empty E.
  function elevFromOrn(orn, H) {
    H = H || 70;
    orn = orn || {};
    const E = [];
    const get = (id) => (id && CreatureArch.byId[id]) || null;
    const bay = get(orn.bay), front = get(orn.front), pil = get(orn.pil);
    const frieze = get(orn.frieze), rib = get(orn.rib);
    let W = 0;
    if (bay || front) {
      const n = Math.max(1, orn.bayN || 1);
      const bayPx = orn.bayPx || 40;
      const step = bayPx * 1.12;
      W = step * n;
      const c = (n - 1) / 2;
      for (let i = 0; i < n; i++) {
        const part = (i === c && front) ? front : (bay || front);
        if (!part) continue;
        const s = clamp(bayPx / Math.max(part.w, part.h), 0.12, 1.8);
        E.push({ part, x: -W / 2 + step * (i + 0.5), y: H * 0.5, s, rot: 0, free: true });
      }
      if (pil) {
        const pilPx = orn.pilPx || H * 0.9;
        const ps = clamp(pilPx / pil.h, 0.12, 1.4);
        for (let k = 0; k <= n; k++) {
          E.push({ part: pil, x: -W / 2 + step * k, y: H * 0.5, s: ps, rot: 0, free: true });
        }
      }
    }
    if (rib) {
      const n = Math.max(1, orn.ribN || 8);
      const ribPx = orn.ribPx || H * 0.9;
      if (!W) W = ribPx * 1.3 * n;
      const rs = clamp(ribPx / Math.max(rib.w, rib.h), 0.12, 1.8);
      for (let i = 0; i < n; i++) {
        E.push({ part: rib, x: -W / 2 + (W / n) * (i + 0.5), y: H * 0.5, s: rs, rot: 0, free: true });
      }
    }
    if (frieze) {
      if (!W) W = 200;
      const friezePx = orn.friezePx || H * 0.24;
      const fs = clamp((friezePx * 0.8) / frieze.h, 0.3, 1.2);
      const step = frieze.w * fs * 1.08;
      const n = Math.max(1, Math.floor(W / step));
      for (let i = 0; i < n; i++) {
        E.push({ part: frieze, x: -W / 2 + step * (i + 0.5) + (W - n * step) / 2, y: H - friezePx * 0.4, s: fs, rot: 0, free: true });
      }
    }
    return { E, top: H };
  }

  // elevTower(kit, H, crownOptions, bandOpts) -> { E, top } (unchanged signature; `bandOpts` is a
  // new, OPTIONAL 4th parameter — omitting it, as every existing caller does, reproduces the
  // exact original uniform-coursing behavior below with zero changes).
  // When bandOpts is given, the course-stacking loop uses composeBand() instead of repeating the
  // kit's single `segment` part for every course. bandOpts: { grammar (a pre-built
  // makeBandGrammar() result — reuse one grammar across multiple towers/bands of the same
  // building so they read as consistent; built here from bandOpts.rng if omitted), rng (rnd()
  // used only when grammar isn't supplied), bandHeight (px, default 50), width (band width in
  // local px, default 70), family (default 'base'), level (forwarded to composeBand per band;
  // defaults to 'ground' for the first band and null for the rest, matching Spire Forge's
  // ground-terrace-vs-upper-terrace distinction), cornice (forwarded to composeBand) }.
  function elevTower(kit, H, crownOptions, bandOpts) {
    const E = [];
    const seg = kit.get('segment');
    if (!seg) return { E, top: 0 };
    let y = 0, i = 0;
    if (bandOpts) {
      const grammar = bandOpts.grammar || makeBandGrammar(bandOpts.rng || Math.random, kit);
      const bandH = bandOpts.bandHeight || 50;
      const bandW = bandOpts.width || 70;
      let first = true;
      while (y < H - 4 && i++ < 40) {
        const level = bandOpts.level != null ? bandOpts.level : (first ? 'ground' : null);
        const placements = composeBand(kit, bandW, bandH, grammar, {
          family: bandOpts.family || 'base', level, cornice: bandOpts.cornice,
        });
        for (const p of placements) E.push({ ...p, y: y + p.y });
        y += bandH * 0.9;
        first = false;
      }
    } else {
      // Sigil City alternates two independently-picked segment parts (seg/seg2) per course for
      // visual variety; this module's archKits picks one part per role (per the module contract),
      // so every course here uses the kit's single `segment` part — still varied across kits/zones
      // since each kit's segment choice differs, just not within one tower's own courses.
      while (y < H - 4 && i++ < 40) {
        const s = 26 / seg.w, hh = seg.h * s;
        E.push({ part: seg, x: 0, y: y + hh / 2, s });
        y += hh * 0.9;
      }
    }
    const rib = kit.get('rib');
    if (rib) for (let yy = 30; yy < y - 20; yy += rib.h * 0.5 * 0.8) {
      E.push({ part: rib, x: -20, y: yy, s: 0.5 });
    }
    if (crownOptions) {
      const lamp = kit.get('lamp'), blade = kit.get('blade'), spire = kit.get('spire');
      if (lamp) {
        const ls = 40 / Math.max(lamp.w, lamp.h);
        E.push({ part: lamp, x: 0, y: y + lamp.h * ls / 2, s: ls });
        const cy = y + lamp.h * ls / 2;
        if (blade) {
          const bs = 30 / Math.max(blade.w, blade.h);
          for (let n = 0; n < 4; n++) {
            const th = (-150 + 100 * n / 3) * Math.PI / 180;
            E.push({ part: blade, x: 34 * Math.sin(th), y: cy - 34 * Math.cos(th), s: bs, rot: th * 180 / Math.PI - 30 });
          }
        }
        if (spire) {
          const ss = 50 / spire.h;
          E.push({ part: spire, x: 0, y: y + lamp.h * ls + spire.h * ss / 2 - 4, s: ss });
          y += lamp.h * ls + spire.h * ss;
        } else {
          y += lamp.h * ls;
        }
      }
    }
    return { E, top: y };
  }

  // elevHall(kit, W, H, crownOptions, bandOpts) -> { E, top } (unchanged signature; `bandOpts` is
  // a new, OPTIONAL 5th parameter — omitting it, as every existing caller does, reproduces the
  // exact original behavior below with zero changes).
  // When bandOpts is given, the whole facade is composed with composeBand() (a cornice + bays
  // across the full W/H) instead of the single full-height `segment` placement plus separate
  // frieze/lamp/bead placements. bandOpts: { grammar (reuse across halls/bands of the same
  // building; built from bandOpts.rng if omitted), rng, family (default 'base'), level, cornice }.
  function elevHall(kit, W, H, crownOptions, bandOpts) {
    const E = [];
    const seg = kit.get('segment') || kit.get('frieze');
    if (!seg) return { E, top: H };
    if (bandOpts) {
      const grammar = bandOpts.grammar || makeBandGrammar(bandOpts.rng || Math.random, kit);
      const placements = composeBand(kit, W, H, grammar, {
        family: bandOpts.family || 'base', level: bandOpts.level, cornice: bandOpts.cornice,
      });
      E.push(...placements);
      let top = H;
      if (crownOptions) {
        const blade = kit.get('blade');
        if (blade) {
          const bs = 26 / Math.max(blade.w, blade.h);
          E.push({ part: blade, x: -14, y: H + 12, s: bs, rot: -20 });
          top = H + 26;
        }
      }
      return { E, top };
    }
    const ps = H / seg.h;
    E.push({ part: seg, x: -W / 2, y: H / 2, s: ps, free: true });
    const frieze = kit.get('frieze');
    let friezeH = 0;
    if (frieze) {
      const fs = Math.min(18 / frieze.h, (W * 0.9) / frieze.w);
      friezeH = frieze.h * fs;
      const step = frieze.w * fs * 1.05, n = Math.max(1, Math.floor(W / step));
      for (let i = 0; i < n; i++) {
        E.push({ part: frieze, x: -W / 2 + step * (i + 0.5) + (W - n * step) / 2, y: H - friezeH / 2, s: fs, free: true });
      }
    }
    const lamp = kit.get('lamp');
    if (lamp) {
      const ls = Math.min((H - friezeH) * 0.8 / lamp.h, W * 0.5 / lamp.w);
      E.push({ part: lamp, x: 0, y: (H - friezeH) / 2, s: ls });
    }
    const bead = kit.get('bead');
    if (bead) {
      E.push({ part: bead, x: -W / 4, y: (H - friezeH) / 2, s: Math.min(14 / bead.w, 1), free: true });
    }
    let top = H;
    if (crownOptions) {
      const blade = kit.get('blade');
      if (blade) {
        const bs = 26 / Math.max(blade.w, blade.h);
        E.push({ part: blade, x: -14, y: H + 12, s: bs, rot: -20 });
        top = H + 26;
      }
    }
    return { E, top };
  }

  // ---------- 3D placement ----------

  // Walk every point of every polyline in an elevation placement through a mapping function,
  // emitting GL_LINES-style segment pairs into `positions` (flat [x,y,z,...]) and `colors`
  // (flat [r,g,b,...], one triple per vertex, parallel to positions) via the provided default
  // color when a polyline has none of its own.
  function emitPlacement(part, map, positions, colors, defaultRGB) {
    for (const pl of part.polys) {
      const rgb = hexToRGB(pl.color) || defaultRGB;
      let prev = null;
      for (let i = 0; i < pl.length; i++) {
        const v = map(pl[i][0], pl[i][1]);
        if (prev) {
          positions.push(prev[0], prev[1], prev[2], v[0], v[1], v[2]);
          colors.push(rgb[0], rgb[1], rgb[2], rgb[0], rgb[1], rgb[2]);
        }
        prev = v;
      }
    }
  }

  function hexToRGB(hex) {
    if (!hex) return null;
    let s = hex.replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    if (s.length !== 6) return null;
    const n = parseInt(s, 16);
    if (Number.isNaN(n)) return null;
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  // CreatureArch.standElevation(elevation, originXYZ, footprintRadius, planeCount=3, opts) ->
  //   { positions: Float32Array, colors: Float32Array }
  // Stands a flat 2D elevation up as `planeCount` crossed vertical planes through originXYZ
  // (ported from Sigil City's standElev). Each plane is rotated by PI/planeCount around Y from
  // the previous one (matching the reference's `phase + q/K * PI`, i.e. planes are spaced across
  // a half-turn since a plane drawn edge-on from both sides already covers a full turn).
  // Scale `u` is derived from footprintRadius so the elevation's horizontal extent (as placed,
  // including any mirrored x) fits within footprintRadius*2.
  // "left"-side parts (part.side === 'left') placed off-axis (x !== 0) and NOT `free` are also
  // drawn mirrored to -x within the same plane, same as the reference.
  //
  // Output shape: positions is a flat Float32Array of XYZ triples, GL_LINES style (every 2
  // consecutive points, i.e. every 6 floats, is one line segment). colors is a parallel
  // Float32Array of RGB triples, one per vertex (so colors.length === positions.length). This
  // (separate parallel buffers, not interleaved) was chosen over interleaving because it lets a
  // caller upload a single shared color buffer across many static-colored batches without
  // re-touching positions, and because WebGL2 vertex attribute setup for two same-length separate
  // buffers is no more error-prone than interleaving while being easier to debug/inspect.
  function standElevation(elevation, originXYZ, footprintRadius, planeCount, opts) {
    planeCount = planeCount || 3;
    opts = opts || {};
    const phase = opts.phase || 0;
    const defaultRGB = opts.defaultColor || [0.6, 1.0, 0.75];
    // find the elevation's horizontal half-extent (including mirrored placements) to size `u`.
    let halfW = 1;
    for (const e of elevation.E) {
      const pw = Math.max(e.part.w, e.part.h) * e.s * 0.5 + Math.abs(e.x);
      if (pw > halfW) halfW = pw;
    }
    const u = footprintRadius / halfW;
    const [ox, oy, oz] = originXYZ;
    const positions = [], colors = [];
    for (let q = 0; q < planeCount; q++) {
      const phi = phase + (q / planeCount) * Math.PI;
      const cp = Math.cos(phi), sp = Math.sin(phi);
      for (const e of elevation.E) {
        const rot = (e.rot || 0) * Math.PI / 180, cr = Math.cos(rot), sr = Math.sin(rot);
        const mirror = e.part.side === 'left' && !e.free && e.x !== 0;
        const sides = mirror ? [1, -1] : [1];
        for (const sd of sides) {
          const map = (px, py) => {
            const lx = (px * cr - py * sr) * e.s * (sd < 0 ? -1 : 1) + e.x * sd;
            const ly = (px * sr + py * cr) * e.s;
            return [ox + lx * u * cp, oy + (e.y - ly) * u, oz + lx * u * sp];
          };
          emitPlacement(e.part, map, positions, colors, defaultRGB);
        }
      }
    }
    return { positions: new Float32Array(positions), colors: new Float32Array(colors) };
  }

  // CreatureArch.wrapOnSurface(elevation, originXYZ, axisUpVec, facingAngleRad, radius,
  //   heightSpan, curveFraction=1.0, opts) -> { positions: Float32Array, colors: Float32Array }
  //
  // Generalizes Tower Forge's onWall(id, th, y, px, lift) from one part to a whole elevation:
  // wraps the elevation's local x-axis around a cylinder of `radius` centered on originXYZ,
  // starting at facingAngleRad and sweeping curveFraction of a full turn (1.0 = wraps all the
  // way around and meets itself again; <1.0 = a band covering only part of the circumference,
  // e.g. one tower "bay"); the elevation's local y-axis (height) maps linearly onto `heightSpan`
  // along axisUpVec.
  //
  // Basis construction: axisUpVec can point in any direction (a tapered tower's local "up" after
  // whatever transform placed it), so `rightVec`/`forwardVec` (the two axes the circle is drawn
  // in) are derived by picking any vector not parallel to axisUpVec — world +Y, unless axisUpVec
  // is itself within ~1 degree of +Y/-Y, in which case world +X is used instead — and taking its
  // cross products with axisUpVec. This is the standard "arbitrary stable perpendicular" trick:
  // it never divides by zero and only changes which particular rotation of the circle you get
  // (not its shape), which doesn't matter here since facingAngleRad already controls orientation
  // for any caller that cares.
  //
  // For each local point (ex, ey) in a polyline:
  //   angle = facingAngleRad + (ex / elevationWidth) * curveFraction * 2*PI
  //   pos   = origin + radius*cos(angle)*rightVec + radius*sin(angle)*forwardVec
  //                   + (ey / elevationHeight) * heightSpan * axisUpVecNormalized
  // elevationWidth/elevationHeight are the elevation's own local bounding extents (so a caller
  // doesn't have to pre-normalize the elevation's coordinate space).
  function wrapOnSurface(elevation, originXYZ, axisUpVec, facingAngleRad, radius, heightSpan, curveFraction, opts) {
    curveFraction = curveFraction == null ? 1.0 : curveFraction;
    opts = opts || {};
    const defaultRGB = opts.defaultColor || [0.6, 1.0, 0.75];
    const [ox, oy, oz] = originXYZ;

    // normalize up vector
    const ulen = Math.hypot(axisUpVec[0], axisUpVec[1], axisUpVec[2]) || 1;
    const up = [axisUpVec[0] / ulen, axisUpVec[1] / ulen, axisUpVec[2] / ulen];

    // pick a stable "not parallel to up" seed vector
    const seed = Math.abs(up[1]) > 0.999 ? [1, 0, 0] : [0, 1, 0];
    // rightVec = seed x up (normalized)
    let right = cross(seed, up);
    let rlen = Math.hypot(right[0], right[1], right[2]) || 1;
    right = [right[0] / rlen, right[1] / rlen, right[2] / rlen];
    // forwardVec = up x rightVec (completes an orthonormal basis)
    const forward = cross(up, right);

    // local bounding extents of the elevation (x across, y up), used to normalize ex/ey below.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const e of elevation.E) {
      const pw = Math.max(e.part.w, e.part.h) * e.s * 0.5;
      minX = Math.min(minX, e.x - pw); maxX = Math.max(maxX, e.x + pw);
      minY = Math.min(minY, e.y - pw); maxY = Math.max(maxY, e.y + pw);
    }
    const elevationWidth = Math.max(1e-6, maxX - minX);
    const elevationHeight = Math.max(1e-6, maxY - minY);

    const positions = [], colors = [];
    for (const e of elevation.E) {
      const rot = (e.rot || 0) * Math.PI / 180, cr = Math.cos(rot), sr = Math.sin(rot);
      const mirror = e.part.side === 'left' && !e.free && e.x !== 0;
      const sides = mirror ? [1, -1] : [1];
      for (const sd of sides) {
        const map = (px, py) => {
          const lx = (px * cr - py * sr) * e.s * (sd < 0 ? -1 : 1) + e.x * sd;
          const ly = (px * sr + py * cr) * e.s;
          const ex = lx - minX, ey = e.y - ly; // ex relative to the elevation's left edge
          const angle = facingAngleRad + (ex / elevationWidth) * curveFraction * Math.PI * 2;
          const ca = Math.cos(angle), sa = Math.sin(angle);
          const h = (ey / elevationHeight) * heightSpan;
          return [
            ox + radius * ca * right[0] + radius * sa * forward[0] + h * up[0],
            oy + radius * ca * right[1] + radius * sa * forward[1] + h * up[1],
            oz + radius * ca * right[2] + radius * sa * forward[2] + h * up[2],
          ];
        };
        emitPlacement(e.part, map, positions, colors, defaultRGB);
      }
    }
    return { positions: new Float32Array(positions), colors: new Float32Array(colors) };
  }

  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }

  // ---------- template composition (ported from Spire Forge's newGenome()/draw()) ----------
  // Spire Forge's newGenome(tpl, seed) builds a "genome" object whose NUMBER fields (terrace
  // counts/widths/heights, shaft height, balcony count/taper, drum count, crown radius/bead/fan
  // counts, buttress on/scale) drive draw()'s base-terraces -> shaft -> balconies -> drums ->
  // neck -> crown composition pipeline; its PART-ID fields (pk("segment") etc.) just pick one
  // part per role from a pool, which this module's archKits() already does once per kit — so
  // only the numeric ranges needed porting, not the part-picking.
  // between/intBetween port newGenome's local `between`/`int` closures as free functions that
  // take the caller-supplied rnd() explicitly (this module's convention), instead of closing
  // over a per-call rng(seed) the way Spire Forge's genome builder does.
  function between(rnd, a, b) { return a + rnd() * (b - a); }
  function intBetween(rnd, a, b) { return Math.floor(between(rnd, a, b + 1)); }

  const TEMPLATE_NAMES = ['lighthouse', 'spire', 'hive', 'shrine', 'gothic'];

  // Ported verbatim (numeric ranges only, see note above) from newGenome()'s per-template `T`
  // table (Spire Forge index.html, was lines ~270-294). One-line read of each template:
  //   lighthouse: 3 wide terraces, tall shaft (often a single "core" column, ~70% chance, else
  //     segmented + ribbed), 3 tapering balconies, big halo+bead+fan crown, always a spire.
  //   spire: smallest base (2 terraces), the TALLEST/thinnest shaft of the four, 4-6 strongly
  //     tapering balconies, crown is often tiny-or-absent (60% chance R=0, else a small 50-70
  //     halo), buttresses only 50% of the time, but ALWAYS ends in a spire+blade-fan crown.
  //   hive: single squat/wide terrace, SHORT shaft with no ribs/core, NO balconies at all, 3-5
  //     stacked upper drums (its own signature feature, widest of the four), moderate crown,
  //     spire only 60% of the time (sometimes a flat/open top).
  //   shrine: widest base (3-4 terraces, half up to 240), short+modest shaft, a single wide
  //     balcony, no drums, by far the LARGEST crown (R 160-200, 10-16 beads, 7-10 blade fans)
  //     relative to its modest height, spire only 50% of the time.
  //   gothic: 5th template (added 2026-11-02, architecture-research follow-up). Steepest base
  //     taper and tallest/thinnest shaft of all five (narrower even than 'spire'), shaft ALWAYS
  //     ribbed (reads as blind arcading/tracery up the walls), no drums, a short neck, and NO
  //     halo/bead crown ring at all (R: 0) -- its silhouette is carried entirely by the spire
  //     itself plus hand-placed "crocket" accents marching up both of the spire's edges (see
  //     buildTemplate's crown section), rather than a lighthouse-style lamp-and-fan top.
  //   Base terrace `step` ratios retuned 2026-11-02 (historically-tuned taper pass): real stepped
  //   minarets/ziggurats narrow in sharper, more deliberate stages than a smooth gradual taper --
  //   lighthouse/spire/shrine's step ranges were all lowered (narrower per terrace) from their
  //   original values; hive (a single squat terrace, step barely used) is left alone.
  function templateParams(tpl, rnd) {
    switch (tpl) {
      case 'lighthouse': return {
        base: { n: 3, half: between(rnd, 150, 190), h: between(rnd, 34, 46), step: between(rnd, 0.68, 0.78) },
        shaft: { h: between(rnd, 330, 420), useCore: rnd() < 0.7, ribs: true },
        balc: { n: 3, half: between(rnd, 95, 125), taper: between(rnd, 0.2, 0.35) },
        drums: { n: 0, half: 70, h: 40 },
        neck: ['lamp', 'frieze'],
        crown: { R: between(rnd, 95, 125), beads: intBetween(rnd, 7, 11), n: intBetween(rnd, 5, 7), spire: true },
        butt: { on: true, scale: between(rnd, 0.65, 0.85) },
      };
      case 'spire': return {
        base: { n: 2, half: between(rnd, 80, 120), h: between(rnd, 26, 36), step: between(rnd, 0.7, 0.82) },
        shaft: { h: between(rnd, 480, 600), useCore: false, ribs: rnd() < 0.6 },
        balc: { n: intBetween(rnd, 4, 6), half: between(rnd, 60, 90), taper: between(rnd, 0.35, 0.55) },
        drums: { n: 0, half: 50, h: 30 },
        neck: ['lamp'],
        crown: { R: rnd() < 0.4 ? between(rnd, 50, 70) : 0, beads: intBetween(rnd, 0, 6), n: intBetween(rnd, 3, 5), spire: true },
        butt: { on: rnd() < 0.5, scale: between(rnd, 0.55, 0.75) },
      };
      case 'hive': return {
        base: { n: 1, half: between(rnd, 160, 200), h: between(rnd, 30, 40), step: 0.72 },
        shaft: { h: between(rnd, 60, 120), useCore: false, ribs: false },
        balc: { n: 0, half: 100, taper: 0.2 },
        drums: { n: intBetween(rnd, 3, 5), half: between(rnd, 120, 160), h: between(rnd, 55, 75) },
        neck: ['segment'],
        crown: { R: between(rnd, 55, 85), beads: intBetween(rnd, 6, 10), n: intBetween(rnd, 4, 6), spire: rnd() < 0.6 },
        butt: { on: rnd() < 0.7, scale: between(rnd, 0.6, 0.85) },
      };
      case 'shrine': return {
        base: { n: intBetween(rnd, 3, 4), half: between(rnd, 200, 240), h: between(rnd, 22, 30), step: between(rnd, 0.78, 0.86) },
        shaft: { h: between(rnd, 90, 170), useCore: false, ribs: true },
        balc: { n: 1, half: between(rnd, 110, 140), taper: 0 },
        drums: { n: 0, half: 60, h: 30 },
        neck: ['lamp', 'segment'],
        crown: { R: between(rnd, 160, 200), beads: intBetween(rnd, 10, 16), n: intBetween(rnd, 7, 10), spire: rnd() < 0.5 },
        butt: { on: true, scale: between(rnd, 0.7, 0.95) },
      };
      case 'gothic': return {
        base: { n: 2, half: between(rnd, 70, 100), h: between(rnd, 30, 42), step: between(rnd, 0.62, 0.72) },
        shaft: { h: between(rnd, 420, 560), useCore: false, ribs: true },
        balc: { n: intBetween(rnd, 2, 3), half: between(rnd, 45, 65), taper: between(rnd, 0.35, 0.55) },
        drums: { n: 0, half: 40, h: 25 },
        neck: ['segment', 'lamp'],
        crown: { R: 0, beads: 0, n: intBetween(rnd, 6, 9), spire: true },
        butt: { on: true, scale: between(rnd, 0.8, 1.1) },
      };
      default: throw new Error('CreatureArch.buildTemplate: unknown template "' + tpl + '" (expected lighthouse|spire|hive|shrine|gothic)');
    }
  }

  // CreatureArch.buildTemplate(templateName, kit, rnd, sizeParams) -> { E, top }
  // Ports the FULL genome -> drawn-geometry pipeline (newGenome() + draw()'s base terraces ->
  // shaft -> balconies -> upper drums -> neck -> crown composition, Spire Forge index.html was
  // lines ~262-521), as a drop-in alternative elevation builder alongside elevTower/elevHall:
  // same { E: Array<{part,x,y,s,rot,free}>, top } local-px/+Y-up return shape, so standElevation/
  // wrapOnSurface consume it exactly like any other elevation.
  // templateName: 'lighthouse' | 'spire' | 'hive' | 'shrine'.
  // sizeParams (all optional): { grammar (a pre-built makeBandGrammar() result, reused across
  //   multiple buildTemplate/elevTower/elevHall calls of the same building so every band reads
  //   as consistent — built here from `rnd` if omitted) }.
  // Coordinate-frame note: Spire Forge draws in SVG space (y increases DOWNWARD, terraces/shaft
  // stack by DEcrementing y as they rise). This module's elevations use the opposite convention
  // (y increases UPWARD, documented at the top of "elevation composition" above), so every
  // additive/subtractive y-offset below is the mirror image of the reference's — heights/radii/
  // scales themselves are carried over unchanged.
  // Dropped (no equivalent in this module's placement-list output, same reasoning as
  // composeBand's already-dropped cornice ring/baseline): draw()'s bare-SVG-line decorations
  // (terrace rings, drum silhouette curves, the dashed ground line, the dashed crown "beams"),
  // and the genome's secondary alternate-segment part id (this module's one-part-per-role kit
  // has no second segment to alternate with, same simplification elevTower's basic branch already
  // documents for Sigil City's seg/seg2 alternation).
  function buildTemplate(templateName, kit, rnd, sizeParams) {
    const p = templateParams(templateName, rnd);
    sizeParams = sizeParams || {};
    const grammar = sizeParams.grammar || makeBandGrammar(rnd, kit);
    const E = [];
    let y = 0;

    // base terraces: an odd-bay dressed band per terrace, narrowing by `step` each course, plus
    // a corner "hook" accent (left-side role, auto-mirrored by standElevation).
    let half = p.base.half;
    const baseHalf0 = p.base.half;
    for (let i = 0; i < p.base.n; i++) {
      const h = p.base.h;
      const placements = composeBand(kit, half * 2, h, grammar, { family: 'base', level: i === 0 ? 'ground' : null });
      for (const pl of placements) E.push({ ...pl, y: y + pl.y });
      const hook = kit.get('hook');
      if (hook) E.push({ part: hook, x: -half - 8, y: y + h - 2, s: clamp(h / 50, 0.5, 1), rot: -20 });
      y += h;
      half *= p.base.step;
    }
    const topOfBase = y;
    if (p.butt.on && p.base.n) {
      const butt = kit.get('buttress');
      if (butt) {
        const s = clamp(p.butt.scale, 0.3, 1.2);
        E.push({ part: butt, x: -baseHalf0 * 0.92, y: butt.h * s * 0.5 + 4, s, rot: -4 });
      }
    }

    // shaft: a single scaled "core" column part (when the template allows it and the part's
    // aspect ratio fits) or a repeated "segment" course stack, plus optional ribs up the sides.
    const shaftH = p.shaft.h;
    let coreHalf = 26;
    if (shaftH > 10) {
      const core = p.shaft.useCore ? kit.get('core') : null;
      if (core && shaftH / core.h > 0.55 && shaftH / core.h < 1.6) {
        const s = shaftH / core.h;
        E.push({ part: core, x: 0, y: y + shaftH / 2, s });
        coreHalf = Math.min(core.w * s / 2, 70);
      } else {
        const seg = kit.get('segment');
        if (seg) {
          let yy = y, i = 0;
          while (yy < y + shaftH - 4 && i++ < 60) {
            const s = clamp(34 / seg.w, 0.8, 1.6), hh = seg.h * s;
            E.push({ part: seg, x: 0, y: yy + hh / 2, s });
            coreHalf = Math.max(coreHalf, seg.w * s / 2);
            yy += hh * 0.92;
          }
        }
      }
      if (p.shaft.ribs) {
        const rib = kit.get('rib'), hook = kit.get('hook');
        if (rib) {
          const s = clamp(44 / rib.h, 0.4, 1.1), step = rib.h * s * 0.85;
          for (let yy = y + step / 2; yy < y + shaftH - step / 3; yy += step) {
            E.push({ part: rib, x: -coreHalf - 12, y: yy, s, rot: -6 });
            if (hook) E.push({ part: hook, x: -coreHalf - 2, y: yy - step * 0.3, s: clamp(14 / Math.max(hook.w, 1), 0.3, 0.8), rot: 15 });
          }
        }
      }
    }
    y += shaftH;

    // ring balconies spaced up the shaft (frieze tiled across the rim + a hand-placed bead
    // ring, manually mirrored left/right since "bead" is a center-side role that standElevation
    // never auto-mirrors — see the crown section below for the same reasoning in more detail).
    // Per-balcony alternation (added 2026-11-02): without it every balcony up one shaft used the
    // EXACT same frieze density/bead count, which reads as a mechanical repeat on templates with
    // several balconies (spire/gothic go up to 6). `alt` cycles 3 ways (dense-frieze/sparse-bead,
    // sparse-frieze/dense-bead, balanced) by balcony index, same alternation-by-index idea as the
    // muqarnas bay-kit cycling above, just applied to a balcony's own two ornament rows.
    for (let i = 0; i < p.balc.n; i++) {
      const t = (i + 1) / (p.balc.n + 1);
      const by = topOfBase + shaftH * t;
      const bh = p.balc.half * (1 - p.balc.taper * t);
      const alt = i % 3;
      const frieze = kit.get('frieze');
      if (frieze) {
        const friezeScale = alt === 1 ? 0.8 : alt === 2 ? 1.15 : 1;
        const fs = clamp(20 / frieze.h, 0.45, 1.15) * friezeScale, step = frieze.w * fs * (alt === 1 ? 1.3 : 1.08);
        const n = Math.max(1, Math.floor((bh - 10) * 2 / step));
        for (let k = 0; k < n; k++) {
          E.push({ part: frieze, x: -(bh - 10) + step * (k + 0.5) + ((bh - 10) * 2 - n * step) / 2, y: by - 13, s: fs, free: true });
        }
      }
      const bead = kit.get('bead');
      if (bead) {
        const bs = clamp(14 / bead.w, 0.2, 0.6);
        const beadN = alt === 2 ? 9 : alt === 1 ? 5 : 7;
        for (let k = 0; k < beadN; k++) {
          const bx = (bh - 8) * (1 - k / (beadN - 1));
          if (bx > 4) {
            E.push({ part: bead, x: -bx, y: by + 20, s: bs, free: true });
            E.push({ part: bead, x: bx, y: by + 20, s: bs, free: true });
          }
        }
      }
      const hook = kit.get('hook');
      if (hook) E.push({ part: hook, x: -bh - 6, y: by - 6, s: 0.75, rot: -10 });
    }
    y = Math.max(y, topOfBase + shaftH);

    // upper drums: dressed bands like the base terraces, narrowing geometrically.
    let dh = p.drums.half;
    for (let i = 0; i < p.drums.n; i++) {
      const h = p.drums.h * (1 - i * 0.08);
      const placements = composeBand(kit, dh * 2 * 0.97, h, grammar, { family: 'drum', level: null });
      for (const pl of placements) E.push({ ...pl, y: y + pl.y });
      y += h * 0.96;
      dh *= 0.8;
    }

    // neck: one or two part roles stacked directly, same pattern as elevTower's course stack.
    for (const role of p.neck) {
      const part = kit.get(role);
      if (!part) continue;
      const s = clamp(40 / Math.max(part.w, 1), 0.6, 1.2), hh = part.h * s;
      E.push({ part, x: 0, y: y + hh / 2 - 4, s });
      y += hh * 0.85;
    }

    // crown: halo + bead ring + two blade fans + lamp + optional spire, ported from draw()'s own
    // crown block (was lines ~480-509) rather than reusing elevTower's crown. elevTower's crown
    // is a small FIXED lamp+4-blades+spire shape with no radius/bead/fan-count parameters — it
    // can't express the range this template system actually needs (a 'spire' template's crown
    // can shrink to R=0 with no halo at all, while a 'shrine' crown is a huge R=160-200,
    // 10-16-bead, 7-10-blade-fan structure); reusing it would flatten exactly the distinction the
    // 4 templates are meant to have, so this is a direct, from-scratch port instead.
    // Both the bead ring and the two blade fans are built by Spire Forge as a HALF-sweep (every
    // angle in its arc lands on one side) relying on its renderer's position-based auto-mirror to
    // fill in the other half. This module's standElevation only auto-mirrors `side:'left'` parts,
    // and "bead" is a center-side role that never qualifies — so both rings are mirrored by hand
    // here (every placement generated for +x also gets an explicit -x twin), all marked
    // `free: true` to keep that hand-mirroring the only mirroring that happens to them.
    const R = p.crown.R;
    const lamp = kit.get('lamp');
    const lampS = lamp ? clamp(Math.min(Math.max(R, 45) * 0.85, 105) / Math.max(lamp.h, lamp.w * 0.8), 0.5, 1.4) : 1;
    const cy = y + Math.max(R * 0.85, lamp ? lamp.h * lampS * 0.5 : 30);
    const halo = kit.get('halo');
    if (R > 20 && halo) {
      E.push({ part: halo, x: 0, y: cy, s: 2 * R / halo.w });
      E.push({ part: halo, x: 0, y: cy, s: 1.45 * R / halo.w });
      const bead = kit.get('bead');
      if (bead && p.crown.beads > 0) {
        const bs = clamp(12 / bead.w, 0.15, 0.6), n = p.crown.beads;
        for (let i = 0; i < n; i++) {
          const t = n === 1 ? 0.5 : i / (n - 1), th = -172 + 164 * t, rad = th * Math.PI / 180;
          const bx = R * Math.sin(rad), by = cy + R * Math.cos(rad);
          E.push({ part: bead, x: bx, y: by, s: bs, rot: th, free: true });
          E.push({ part: bead, x: -bx, y: by, s: bs, rot: -th, free: true });
        }
        E.push({ part: bead, x: 0, y: cy + R, s: bs * 1.3, free: true });
      }
    }
    const blade = kit.get('blade');
    if (blade) {
      const fanDefs = [
        { n: p.crown.n, r: 0.62, from: -165, to: -25, spin: between(rnd, -50, 10), scale: between(rnd, 0.8, 1.1) },
        { n: Math.max(2, p.crown.n - 2), r: 0.95, from: -150, to: -35, spin: between(rnd, -45, -10), scale: between(rnd, 0.7, 1) },
      ];
      for (const f of fanDefs) {
        if (!f.n) continue;
        const s = clamp(f.scale * Math.max(R, 50) * 0.42 / Math.max(blade.w, blade.h), 0.35, 1.3);
        const rad0 = Math.max(R, 50) * f.r, cyF = cy - 4;
        for (let i = 0; i < f.n; i++) {
          const t = f.n === 1 ? 0.5 : i / (f.n - 1), th = f.from + (f.to - f.from) * t, rad = th * Math.PI / 180;
          const bx = rad0 * Math.sin(rad), by = cyF + rad0 * Math.cos(rad);
          E.push({ part: blade, x: bx, y: by, s, rot: th + f.spin, free: true });
          E.push({ part: blade, x: -bx, y: by, s, rot: -(th + f.spin), free: true });
        }
      }
    }
    if (lamp) E.push({ part: lamp, x: 0, y: cy, s: lampS });
    let top = cy + Math.max(R, lamp ? lamp.h * lampS * 0.5 : 30);
    if (p.crown.spire) {
      const spire = kit.get('spire');
      if (spire) {
        const ss = clamp(Math.max(R, 60) * 0.75 / spire.h, 0.5, 1.4);
        const spireY0 = top, spireH = spire.h * ss;
        E.push({ part: spire, x: 0, y: spireY0 + spireH / 2 - 8, s: ss });
        // gothic crockets: a Gothic spire's edges carry small projecting ornaments marching up
        // toward the finial (where a lighthouse/shrine crown instead reads through its halo+bead
        // ring, which gothic deliberately omits -- see templateParams' gothic case). Reuses the
        // 'hook' role (falls back to 'blade') since neither is otherwise placed this high; each
        // pair narrows inward with height to track the spire's taper.
        if (templateName === 'gothic') {
          const crocket = kit.get('hook') || kit.get('blade');
          if (crocket) {
            const steps = 5, halfW0 = Math.max(spire.w, 10) * ss * 0.5;
            for (let k = 1; k <= steps; k++) {
              const ft = k / (steps + 1), cy2 = spireY0 + spireH * ft - 8;
              const cs = clamp(12 / Math.max(crocket.w, crocket.h), 0.25, 0.6);
              const cx = halfW0 * (1 - ft) + 5;
              E.push({ part: crocket, x: cx, y: cy2, s: cs, rot: -15, free: true });
              E.push({ part: crocket, x: -cx, y: cy2, s: cs, rot: 15, free: true });
            }
          }
        }
        top += spireH - 8;
      }
    }
    return { E, top };
  }

  // CreatureArch.mutateBandGrammar(grammar, kit, rnd, strength=1) -> grammar'
  // Ports the CONCEPT of Spire Forge's mutate(g0, R) (was lines ~524-547): apply 1-3 small
  // randomized perturbations to produce a "nearby variant," here of a makeBandGrammar() result
  // instead of a whole stateful genome (this module's elevTower/elevHall/buildTemplate are pure
  // functions of (kit, size params, bandOpts) rather than Spire Forge's mutable genome object —
  // see the file-header note on this module's design — so "mutate the building" becomes "mutate
  // the grammar, then call elevTower/elevHall/buildTemplate again with it").
  // Of the reference's ~13 perturbation operators, exactly 2 map cleanly onto makeBandGrammar's
  // { width, size, rules } shape:
  //   - reroll one random bay rule   -> rerolls one random grammar.rules[key] via bandRuleFor()
  //   - nudge the bay width          -> nudges grammar.width by the same +/-25% factor
  // Dropped (operate on fields that live OUTSIDE the grammar in this module's data model, not on
  // the grammar itself, so they don't belong in a function that mutates a grammar):
  //   - base/shaft/balc/drum/crown/buttress numeric nudges (half, h, shaft.h, balc.n, crown.R,
  //     crown.n, crown.beads, drums.n, butt.scale) -> these are buildTemplate's own sizeParams/
  //     template-sampled numbers, not part of a grammar; a caller wanting a "nearby" building on
  //     these axes perturbs its own sizeParams between buildTemplate() calls instead.
  //   - re-picking a part id (base.frieze, balc.frieze/bead, crown.lamp/halo, shaft.segs/core,
  //     butt.part) -> this module's kit already gives ONE part per role per kit (no pools to
  //     re-pick from); "a different part" means building a different kit via archKits(), not
  //     mutating a grammar.
  //   - toggling butt.on, crown.spire/beams -> boolean template switches, not grammar fields.
  // `strength` (default 1) scales how many perturbations are applied (same 1-3 range as the
  // reference when strength=1); it does not change per-operator magnitude.
  function mutateBandGrammar(grammar, kit, rnd, strength) {
    strength = strength == null ? 1 : strength;
    const g = { width: grammar.width, size: grammar.size, rules: Object.assign({}, grammar.rules) };
    const ops = [
      () => {
        const key = BAND_RULE_KEYS[Math.floor(rnd() * BAND_RULE_KEYS.length)];
        if (key.endsWith('pilaster')) g.rules[key] = bandRuleFor(key, rnd, kit);
        else g.rules[key] = bandRuleVariants(key, rnd, kit, (grammar.rules[key] || []).length || BAY_KIT_COUNT);
      },
      () => { g.width = clamp(g.width * (0.75 + rnd() * 0.5), 16, 90); },
    ];
    const n = Math.max(1, Math.round((1 + Math.floor(rnd() * 3)) * strength));
    for (let i = 0; i < n; i++) ops[Math.floor(rnd() * ops.length)]();
    return g;
  }

  // ---------- building-kind dispatch ----------

  // CreatureArch.buildingElevation(kind, kit, sizeParams) -> elevation ({E, top})
  // Simplified port of Sigil City's creaturePiece() dispatch: returns the elevHall/elevTower
  // composition appropriate to a building `kind`. Unlike creaturePiece, this does not itself
  // place the elevation in 3D (call standElevation/wrapOnSurface with the result) and it drops
  // the fully special-cased kinds that aren't a single elevation (fountain's inlaid rosette,
  // garden's rows of mirrored blade-plants, wall's palisade run, street pylons) since those are
  // compositions of several small placements rather than one elevation — a caller building those
  // kinds should compose multiple elevTower/elevHall (or inlay-style) calls directly instead.
  // sizeParams: { H, W, levels, crown }.
  const TALL_KINDS = { minaret: 1, tower: 1, 'ab-anbar': 1, pavilion: 1, core: 1, gate: 1 };
  const HALL_KINDS = { 'bayt-al-hikma': 1, caravanserai: 1, madrasa: 1, house: 1, hammam: 1, bimaristan: 1, masjid: 1, iwan: 1 };
  // sizeParams: { H, W, levels, crown, bandOpts } — bandOpts (optional) is forwarded verbatim to
  // elevTower/elevHall's own optional bandOpts param (see their headers); omitted, behavior is
  // byte-identical to before the band-grammar system existed.
  function buildingElevation(kind, kit, sizeParams) {
    sizeParams = sizeParams || {};
    const levels = sizeParams.levels || 0, bandOpts = sizeParams.bandOpts;
    if (TALL_KINDS[kind]) {
      const H = sizeParams.H != null ? sizeParams.H
        : (kind === 'minaret' ? 160 : kind === 'gate' ? 110 : kind === 'core' ? 230 : 90) + levels * 22;
      return elevTower(kit, H, sizeParams.crown !== false, bandOpts);
    }
    if (HALL_KINDS[kind]) {
      const W = sizeParams.W != null ? sizeParams.W : 200;
      const H = sizeParams.H != null ? sizeParams.H : Math.min(W * 0.55, 46 + levels * 26);
      return elevHall(kit, W * 0.9, H, sizeParams.crown != null ? sizeParams.crown : (kind !== 'house' || levels >= 2), bandOpts);
    }
    // unknown kind: fall back to a modest hall elevation
    const W = sizeParams.W != null ? sizeParams.W : 160, H = sizeParams.H != null ? sizeParams.H : 60;
    return elevHall(kit, W, H, !!sizeParams.crown, bandOpts);
  }

  // ---------- export ----------

  CreatureArch.load = load;
  CreatureArch.partPolys = partPolys;
  CreatureArch.archRoles = archRoles;
  CreatureArch.archKits = archKits;
  CreatureArch.elevTower = elevTower;
  CreatureArch.elevHall = elevHall;
  CreatureArch.makeBandGrammar = makeBandGrammar;
  CreatureArch.composeBand = composeBand;
  CreatureArch.elevFromOrn = elevFromOrn;
  CreatureArch.standElevation = standElevation;
  CreatureArch.wrapOnSurface = wrapOnSurface;
  CreatureArch.buildingElevation = buildingElevation;
  CreatureArch.buildTemplate = buildTemplate;
  CreatureArch.mutateBandGrammar = mutateBandGrammar;
  CreatureArch.ROLE_NAMES = ROLE_NAMES;
  CreatureArch.TEMPLATE_NAMES = TEMPLATE_NAMES;

  window.CreatureArch = CreatureArch;
})();
