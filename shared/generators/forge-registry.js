/*
 * Forge — the generator registry. One contract every generator implements, so
 * Bench, the Forge Graph (litegraph) and later the city / lineage engine can all
 * drive any generator the same way, without knowing which tool it came from.
 *
 * A generator definition:
 *
 *   ForgeRegistry.register({
 *     id: "building.spire",          // unique, "<type>.<name>"
 *     type: "building",              // what it produces: building | seal | script | species | ...
 *     label: "Tower",                // short UI name
 *     newLabel: "New building",      // Bench's "new" button
 *     inputs: [{ name, accepts, label, optional }],   // other world objects it can read
 *     params: [ParamSpec],           // the controls; Bench and the graph both build UI from these
 *     sockets: [SocketSpec],         // optional static sockets (crown halo, bay, frieze...)
 *     async prepare(kit) {},         // optional one-time setup (e.g. CreatureArch.load)
 *     available() { return true },   // optional: false hides it (module not loaded on this page)
 *     defaults(seed, kit, overrides) -> recipe,          // a fresh recipe; must be deterministic in seed
 *     mutate(recipe, R, kit) -> recipe,                   // optional: a nearby recipe (variations / MAP-Elites)
 *     generate(recipe, ctx) -> { svg, lines?, data?, metrics?, usedRefs? },   // pure: no DOM, no fetch
 *     persist(recipe, result) -> recipe-to-save,           // optional: what world.put stores as `recipe`
 *     name(recipe) -> string, summary(result) -> string,   // optional labels
 *   });
 *
 * ParamSpec: { id, label, type: "range"|"select"|"check"|"text", v (graph default),
 *              path: "base.n" | get(recipe)/set(recipe, v), min, max, step, opts: [...],
 *              regen: true  -> changing it rebuilds the recipe via defaults(seed, kit, {[id]: v}) }
 *
 * ctx passed to generate(): { kit: {url, parts, byId, pool}, inputs: {name: {data, ref, name}}, seed, rng }
 *
 * run() adds what every generator would otherwise repeat: part refs collected from
 * the recipe (any "P123"-style id), refs of the world objects fed in as inputs, and
 * default sockets — so world.put() gets a real refs[] for the lineage phase.
 *
 * Depends on kit-utils.js (window.ForgeKit). Classic script, works from file://.
 */
(function () {
  "use strict";

  const defs = new Map();
  const PART_RE = /^P\d{3,}$/;

  function register(def) {
    for (const k of ["id", "type", "label", "defaults", "generate"]) {
      if (!def[k]) throw new Error(`ForgeRegistry.register: "${def.id || "?"}" is missing ${k}`);
    }
    def.params = def.params || [];
    def.inputs = def.inputs || [];
    def.sockets = def.sockets || [];
    // regen params first, so applying a flat param map never resets later edits
    def.params.sort((a, b) => (b.regen ? 1 : 0) - (a.regen ? 1 : 0));
    defs.set(def.id, def);
    return def;
  }

  function get(id) {
    const d = defs.get(id);
    if (!d) throw new Error("ForgeRegistry: no generator " + id);
    return d;
  }

  function list(filter) {
    return [...defs.values()].filter((d) => (d.available ? d.available() : true) && (!filter || filter(d)));
  }

  /* ---------- kit ---------- */
  async function loadKit(url) {
    const raw = await (await fetch(url)).json();
    const parts = window.ForgeKit.tagRoles(raw);
    const byId = Object.fromEntries(parts.map((p) => [p.id, p]));
    return { url, raw, parts, byId, pool: window.ForgeKit.pools(parts, null) };
  }

  async function prepare(defOrId, kit) {
    const def = typeof defOrId === "string" ? get(defOrId) : defOrId;
    if (def.prepare && !def._prepared) { await def.prepare(kit); def._prepared = true; }
    return def;
  }
  async function prepareAll(kit) { for (const d of list()) await prepare(d, kit); }

  /* ---------- recipes ---------- */
  const newSeed = () => Math.floor(Math.random() * 1e9);

  function create(id, kit, seed, overrides) {
    return get(id).defaults(seed == null ? newSeed() : seed >>> 0, kit, overrides || {});
  }

  function vary(id, recipe, kit, seed) {
    const def = get(id);
    const R = window.ForgeKit.rng(seed == null ? newSeed() : seed);
    return def.mutate ? def.mutate(recipe, R, kit) : def.defaults(Math.floor(R() * 1e9), kit, {});
  }

  function getPath(o, path) { return path.split(".").reduce((a, k) => (a == null ? a : a[k]), o); }
  function setPath(o, path, v) {
    const ks = path.split("."), last = ks.pop();
    const t = ks.reduce((a, k) => (a[k] == null ? (a[k] = {}) : a[k]), o);
    t[last] = v;
  }
  function readParam(p, recipe) { return p.get ? p.get(recipe) : getPath(recipe, p.path); }
  // returns the (possibly rebuilt) recipe
  function writeParam(def, p, recipe, v, kit) {
    if (p.regen) {
      const over = {};
      for (const q of def.params) if (q.regen) over[q.id] = q === p ? v : readParam(q, recipe);
      return def.defaults(recipe.seed >>> 0, kit, over);
    }
    if (p.set) p.set(recipe, v); else setPath(recipe, p.path, v);
    return recipe;
  }

  /* ---------- running ---------- */
  function collectPartRefs(obj, out) {
    out = out || new Set();
    if (typeof obj === "string") { if (PART_RE.test(obj)) out.add(obj); }
    else if (Array.isArray(obj)) obj.forEach((v) => collectPartRefs(v, out));
    else if (obj && typeof obj === "object") for (const k in obj) collectPartRefs(obj[k], out);
    return out;
  }

  function run(id, recipe, kit, inputs) {
    const def = get(id);
    const seed = recipe && recipe.seed != null ? recipe.seed >>> 0 : 0;
    const ctx = { kit, inputs: inputs || {}, seed, rng: window.ForgeKit.rng(seed) };
    const res = def.generate(recipe, ctx) || {};
    const refs = new Set(res.usedRefs || []);
    for (const pid of collectPartRefs(recipe)) refs.add("part:" + pid);
    for (const v of Object.values(ctx.inputs)) if (v && v.ref) refs.add(v.ref);
    return {
      type: def.type,
      svg: res.svg || null,
      lines: res.lines || null,
      data: res.data !== undefined ? res.data : recipe,
      sockets: res.sockets || def.sockets,
      metrics: res.metrics || {},
      usedRefs: [...refs],
    };
  }

  // the record to hand to world.put()
  function toRecord(id, recipe, result, extra) {
    const def = get(id);
    return Object.assign({
      type: def.type,
      name: def.name ? def.name(recipe) : def.label,
      recipe: def.persist ? def.persist(recipe, result) : recipe,
      seed: recipe.seed != null ? String(recipe.seed) : null,
      refs: result.usedRefs,
      svg: result.svg,
      source: { tool: "Forge Bench", generator: def.id },
    }, extra || {});
  }

  /* ---------- inputs ---------- */
  function inputFromRecord(record) {
    return { ref: `${record.type}:${record.id}@${record.version}`, data: record.recipe, name: record.name, svg: record.svg };
  }
  function inputFromResult(result, name) {
    return { ref: null, data: result.data, name: name || "this session", svg: result.svg };
  }

  /* ---------- Forge Graph (litegraph) adapter ---------- */
  // ForgeRegistry.registerInGraph(window.ForgeGraph, () => kit)
  // Every registered generator becomes a node: its inputs become typed input slots
  // (a script output only wires into a slot that accepts "script"), its non-text
  // params become widgets, and its output is { kind:"svg", value } so ForgeGraph's
  // toCanvas()/Composite nodes take it as-is, plus { data } for downstream generators.
  function registerInGraph(FG, getKit, filter) {
    for (const def of list(filter)) {
      FG.registerType({
        id: def.id.replace(/\./g, "-"),
        category: "forge/" + def.type,
        label: def.label,
        inputs: def.inputs.map((i) => ({ name: i.name, kind: i.accepts })),
        outputs: [{ name: def.type, kind: def.type }],
        params: def.params.filter((p) => p.type !== "text").map((p) => ({
          id: p.id, label: p.label, type: p.type === "range" ? "range" : p.type, v: p.v,
          min: p.min, max: p.max, step: p.step, opts: p.opts ? p.opts.map((o) => [o, o]) : undefined,
        })),
        generate(resolved, props, seedNum) {
          const kit = getKit();
          if (!kit || (def.prepare && !def._prepared)) return null;
          let recipe = def.defaults(seedNum >>> 0, kit, {});
          for (const p of def.params) if (p.type !== "text" && props[p.id] !== undefined) recipe = writeParam(def, p, recipe, props[p.id], kit);
          const inputs = {};
          def.inputs.forEach((i) => { const up = resolved[i.name]; if (up && up.data !== undefined) inputs[i.name] = { ref: null, data: up.data, name: up.label }; });
          const r = run(def.id, recipe, kit, inputs);
          return { kind: "svg", value: r.svg, data: r.data, recipe, result: r, label: def.label };
        },
      });
    }
  }

  window.ForgeRegistry = {
    register, get, list, loadKit, prepare, prepareAll, create, vary, run, toRecord,
    readParam, writeParam, collectPartRefs, inputFromRecord, inputFromResult, registerInGraph, newSeed,
  };
})();
