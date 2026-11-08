/*
 * Forge — overrides: an object stored as a base plus only what it changes.
 *
 * Unity prefab variants, Blender library overrides and USD opinions all work this way: a
 * variant points at its base and keeps a small map of changed values. Untouched values follow
 * the base when it changes; changed ones are marked, can be reverted, or pushed down into the
 * base ("apply to base").
 *
 * In a recipe:
 *   { $base: "<scheme>:<id>", $overrides: { "swim.speed": 1.2, "shaft.h": 540 }, ...other fields }
 * Paths are dot paths into the base's data. Schemes are resolved by the page that knows them:
 *   "species:<id>"  another world object (its own $base resolves first, so chains work)
 *   "eco:<key>"     an Ecology species' built-in data (Ecology / Rig register this)
 *
 *   ForgeOverrides.get(obj, path), set(obj, path, v)            dot-path access
 *   ForgeOverrides.diff(base, next, paths?)  -> overrides        only the leaves that differ
 *   ForgeOverrides.apply(base, overrides)    -> new object       base with overrides laid on top
 *   ForgeOverrides.has(ov, path), without(ov, path), count(ov)
 *   ForgeOverrides.register(scheme, async (id) => baseData)
 *   ForgeOverrides.resolve(recipe, ctx?)     -> effective data   async; follows $base chains
 *   ForgeOverrides.make(baseRef, base, next, paths?) -> { $base, $overrides }
 *
 * Pure apart from the resolver registry. Classic script; also loads under Node.
 */
(function () {
  "use strict";
  const EPS = 1e-6;
  const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
  function get(obj, path) { return path.split(".").reduce((a, k) => (a == null ? undefined : a[k]), obj); }
  function set(obj, path, v) {
    const ks = path.split("."), last = ks.pop();
    const t = ks.reduce((a, k) => (a[k] == null || typeof a[k] !== "object" ? (a[k] = {}) : a[k]), obj);
    t[last] = v; return obj;
  }
  const same = (a, b) => (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a), Math.abs(b)) : JSON.stringify(a) === JSON.stringify(b));

  // leaves of `next` that differ from `base`; `paths` limits the comparison to those paths
  function diff(base, next, paths) {
    const out = {};
    if (paths) { for (const p of paths) { const v = get(next, p); if (v !== undefined && !same(get(base, p), v)) out[p] = clone(v); } return out; }
    (function walk(n, pre) {
      for (const k of Object.keys(n || {})) {
        const p = pre ? pre + "." + k : k, v = n[k];
        if (v && typeof v === "object" && !Array.isArray(v)) walk(v, p);
        else if (!same(get(base, p), v)) out[p] = clone(v);
      }
    })(next, "");
    return out;
  }
  function apply(base, ov) { const o = clone(base) || {}; for (const [p, v] of Object.entries(ov || {})) set(o, p, clone(v)); return o; }
  const has = (ov, path) => !!ov && Object.prototype.hasOwnProperty.call(ov, path);
  function without(ov, path) { const o = { ...(ov || {}) }; delete o[path]; return o; }
  const count = (ov) => Object.keys(ov || {}).length;

  const resolvers = {};
  function register(scheme, fn) { resolvers[scheme] = fn; }
  async function resolveRef(ref, ctx, depth) {
    if (!ref) return null;
    const i = ref.indexOf(":"), scheme = ref.slice(0, i), id = ref.slice(i + 1).replace(/@\d+$/, "");
    const fn = (ctx && ctx.resolvers && ctx.resolvers[scheme]) || resolvers[scheme];
    if (!fn) throw new Error("ForgeOverrides: no resolver for " + scheme);
    const data = await fn(id, ctx);
    // a base that is itself a variant resolves first
    return data && data.$base && (depth || 0) < 16 ? resolve(data, ctx, (depth || 0) + 1) : data;
  }
  async function resolve(recipe, ctx, depth) {
    if (!recipe || !recipe.$base) return recipe;
    const base = await resolveRef(recipe.$base, ctx, depth);
    const rest = {};
    for (const [k, v] of Object.entries(recipe)) if (k !== "$base" && k !== "$overrides") rest[k] = v;
    return { ...apply(base || {}, recipe.$overrides), ...rest, $base: recipe.$base, $overrides: recipe.$overrides || {} };
  }
  function make(baseRef, base, next, paths) { return { $base: baseRef, $overrides: diff(base, next, paths) }; }

  const ForgeOverrides = { get, set, diff, apply, has, without, count, register, resolve, resolveRef, make, clone };
  if (typeof window !== "undefined") window.ForgeOverrides = ForgeOverrides;
  if (typeof module !== "undefined") module.exports = ForgeOverrides;
})();
