/*
 * Forge — shared parts-kit utilities for the generator modules (spire-generator.js,
 * sigil-generator.js). Fresh extraction, ported from world/forges/spire-forge/index.html's
 * rolesOf()/ROLES/pools() (lines 250-275 as of 2026-11-03) and parameterized to take
 * the kit explicitly instead of reading page-level `state` — the mechanical fix a
 * research pass identified as the one thing standing between that logic and being a
 * portable, reusable module.
 *
 * Deliberately NOT a refactor of Spire Forge's or Sigil Forge's own files — those keep
 * their own internal copies of this same logic, unchanged, so both tools stay exactly
 * as reliable standalone as before. This module is a known, accepted duplicate: Sigil
 * Forge's own rolesOf() already differs from Spire's (it never populates "core" or
 * "buttress", since seals have no use for them), so there is no single byte-identical
 * "the" rolesOf() to refactor toward without changing one tool's behavior. This file
 * uses Spire's full 11-role version, since Bench's Tower preset is the one consumer
 * that needs every role.
 */
(function () {
  "use strict";

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, a, b) {
    return Math.min(b, Math.max(a, Number.isFinite(+v) ? +v : a));
  }

  function svgUrl(s) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
  }

  function rolesOf(p) {
    if (p.species === "sheet-xenoglyph") return ["glyph"]; // letters are kept for inscriptions, never used as ornament
    const r = [];
    const { w, h } = p;
    const m = Math.max(w, h);
    const C = p.side === "center";
    if (m < 14) return r;
    if (w >= 24 && w <= 95 && h >= 12 && h <= 52 && w >= h * 1.1) r.push("frieze");
    if (!C && m >= 18 && m <= 60) r.push("hook");
    if (C && Math.abs(w - h) < 0.22 * w && m >= 20 && m <= 60) r.push("bead");
    if (C && h >= 250 && w <= 230) r.push("core");
    if (C && h >= 25 && h <= 95 && w <= 64 && h >= 1.25 * w) r.push("segment");
    if (!C && h >= 40 && h <= 140 && h >= 1.9 * w) r.push("rib");
    if (C && w >= 100 && w <= 250 && Math.abs(w - h) < 0.16 * w) r.push("halo");
    if (C && w >= 24 && w <= 100 && h >= 30 && h <= 130) r.push("lamp");
    if (!C && m >= 22 && m <= 130) r.push("blade");
    if (C && h >= 60 && w <= 38 && h >= 2.4 * w) r.push("spire");
    if (!C && m >= 90 && m <= 240) r.push("buttress");
    return r;
  }

  const ROLES = ["frieze", "hook", "bead", "core", "segment", "rib", "halo", "lamp", "blade", "spire", "buttress"];

  // parts: the raw shared/engine/creature-parts.json array, each tagged with .roles (via rolesOf).
  // enabledSpecies: a Set of species ids to prefer; falls back to "every species" per role
  // when a role's preferred pool would otherwise be empty (same fallback as the original).
  function pools(parts, enabledSpecies) {
    const on = enabledSpecies && enabledSpecies.size ? enabledSpecies : null;
    const pool = {};
    const all = {};
    for (const r of ROLES) { pool[r] = []; all[r] = []; }
    for (const p of parts) {
      for (const r of p.roles || []) {
        if (!all[r]) continue;
        all[r].push(p);
        if (!on || on.has(p.species)) pool[r].push(p);
      }
    }
    for (const r of ROLES) if (!pool[r].length) pool[r] = all[r];
    return pool;
  }

  function tagRoles(parts) {
    return parts.map((p) => ({ ...p, roles: rolesOf(p) }));
  }

  window.ForgeKit = { rng, clamp, svgUrl, rolesOf, ROLES, pools, tagRoles };
})();
