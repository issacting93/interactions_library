/*
 * Forge — rule sets: the bay grammar of a Spire building as editable, saveable data.
 *
 * SpireGenerator already dresses terraces and drums with bays chosen by rule keys,
 * most specific first: family.level.position -> family.position -> base.position
 * (SpireGenerator.RULES). A building normally rolls every rule at random. A rule set
 * pins some of them:
 *
 *   ruleset recipe = {
 *     width: number|null, size: number|null,           // bay module; null = keep the building's
 *     rules: { [ruleKey]: { mode: "random"|"role"|"part"|"off", role, part, scale } },
 *   }
 *
 *   RuleSets.apply(genome, ruleset, pool, seed) -> a new genome with the rules pinned.
 *       "role" picks a part of that role deterministically (same seed + key -> same part),
 *       from the same bay-eligible pool Spire itself uses (centre parts, max 130px).
 *   RuleSets.check(ruleset, kit) -> [{ level: "error"|"warn"|"info", key, text }]
 *   RuleSets.usage(ruleset, kit, templates, seeds) -> which rules a template actually reaches,
 *       measured by generating with SpireGenerator's own `record` option (real placements).
 *   RuleSets.KEYS -> [{ key, family, position }] from SpireGenerator.RULES
 *
 * Saved as world objects of type "ruleset". The Tower generator takes one as an input
 * (forge-generators.js), so a rule set applies in Bench and in the graph alike.
 * Depends on SpireGenerator and ForgeKit. Classic script.
 */
(function () {
  "use strict";
  const BAY_ROLES = ["lamp", "bead", "segment", "spire", "halo", "frieze", "hook", "blade"];
  const PIL_ROLES = ["segment", "spire"];
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  const KEYS = () => window.SpireGenerator.RULES.map(([key, family, position]) => ({ key, family, position, pilaster: key.endsWith("pilaster") }));

  // Spire's own bay pool (bayPools in spire-generator.js): centre parts, max dimension 130
  function eligible(pool, role, pilaster) {
    const list = (pool[role] || []).filter((p) => p.side === "center");
    return pilaster ? list : list.filter((p) => Math.max(p.w, p.h) <= 130);
  }

  function blank() { return { width: null, size: null, rules: {} }; }

  function apply(g0, rs, pool, seed) {
    if (!rs || !g0) return g0;
    const g = JSON.parse(JSON.stringify(g0));
    if (!g.bays) return g;
    g.bays.on = true;
    if (rs.width != null) g.bays.width = rs.width;
    if (rs.size != null) g.bays.size = rs.size;
    for (const [key, r] of Object.entries(rs.rules || {})) {
      if (!r || r.mode === "random" || !r.mode) continue;
      const pil = key.endsWith("pilaster");
      if (r.mode === "off") { g.bays.rules[key] = { part: null }; continue; }
      let part = null;
      if (r.mode === "part") part = r.part || null;
      if (r.mode === "role") {
        const list = eligible(pool, r.role, pil);
        if (list.length) part = list[((hash(key) ^ (seed >>> 0)) >>> 0) % list.length].id;
      }
      g.bays.rules[key] = pil ? { part } : { part, scale: r.scale != null ? r.scale : (g.bays.rules[key] && g.bays.rules[key].scale) || 1 };
    }
    return g;
  }

  function check(rs, kit) {
    const out = [], byId = kit.byId;
    const keys = KEYS();
    const set = Object.entries(rs.rules || {}).filter(([, r]) => r && r.mode && r.mode !== "random");
    for (const [key, r] of set) {
      const k = keys.find((x) => x.key === key), label = k ? `${k.family} · ${k.position}` : key;
      if (r.mode === "part") {
        const p = byId[r.part];
        if (!p) { out.push({ level: "error", key, text: `${label}: part ${r.part || "(none)"} isn't in the kit.` }); continue; }
        if (p.side !== "center") out.push({ level: "warn", key, text: `${label}: ${p.id} is a side part, so it's drawn unmirrored in the bay.` });
        if (!k.pilaster && Math.max(p.w, p.h) > 130) out.push({ level: "warn", key, text: `${label}: ${p.id} is ${Math.round(Math.max(p.w, p.h))}px, so it's scaled well down to fit a bay.` });
        if (k.pilaster && !(p.roles || []).some((x) => PIL_ROLES.includes(x))) out.push({ level: "warn", key, text: `${label}: ${p.id} isn't a segment or spire part, so it reads oddly as a pilaster.` });
      }
      if (r.mode === "role") {
        const n = eligible(kit.pool, r.role, k && k.pilaster).length;
        if (!n) out.push({ level: "error", key, text: `${label}: no ${r.role} parts fit a bay.` });
        else if (n < 3) out.push({ level: "warn", key, text: `${label}: only ${n} ${r.role} part${n > 1 ? "s" : ""} fit a bay, so seeds will repeat.` });
      }
    }
    // the same pinned part in centre, end and side of a family reads flat
    for (const fam of ["base.ground", "base", "drum"]) {
      const ps = ["center", "end", "side"].map((pos) => rs.rules[`${fam}.${pos}`]).filter((r) => r && r.mode === "part");
      if (ps.length === 3 && new Set(ps.map((r) => r.part)).size === 1) out.push({ level: "info", key: fam + ".center", text: `${fam.replace(".", " ")}: every bay uses ${ps[0].part}; the band will read flat.` });
    }
    return out;
  }

  // which rule keys a template's buildings actually draw from, over a few seeds
  function usage(rs, kit, templates, seeds) {
    const SG = window.SpireGenerator, used = {};
    for (const tpl of templates) {
      used[tpl] = new Set();
      for (const seed of seeds) {
        const g = apply(SG.newGenome(tpl, seed, kit.pool), rs, kit.pool, seed);
        const record = [];
        SG.generate(g, kit.byId, { record });
        const placed = new Set(record.map((x) => x.part));
        for (const [key, rule] of Object.entries(g.bays.rules)) if (rule && rule.part && placed.has(rule.part)) used[tpl].add(key);
        if (!g.bays.on) used[tpl].add("__bays_off");
      }
    }
    return used;
  }

  window.RuleSets = { KEYS, BAY_ROLES, PIL_ROLES, eligible, blank, apply, check, usage };
})();
