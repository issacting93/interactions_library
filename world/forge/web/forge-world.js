/*
 * Forge — the shared world file.
 *
 * Phase 1 of the Forge pipeline plan: one IndexedDB database per world, one
 * object store, one object shape for everything a forge ever saves — species,
 * parts, scripts, seals, buildings, prefabs, cities. A "prefab" is not a
 * separate type: it's a `prefab` block added to any object once saved.
 * Schema is exactly H2Rules.dc.html's ("The rules underneath", the Forge UI
 * Explorations Artifact canvas): { id, type, version, name, recipe, seed,
 * refs[], sockets[], prefab, style, svg, thumb, approved, source, createdAt, updatedAt }.
 * `style` (added later) is the render style the object is drawn in -- shared/look/style/style-recipes.js.
 * `thumb` is a small raster preview (data URL); `svg` is a full drawing, kept
 * only where a reader still needs real art at scale (e.g. City compositing a
 * building). A type that never needs that — city, so far — can save `svg: null`
 * and just a `thumb` once it has one, instead of carrying both forever.
 *
 * Every generator tool stays standalone; this module is the one thing they
 * all read and write through once they opt in (world/forges/spire-forge/index.html
 * is the first to do so). Load as a plain script: <script src="forge-world.js">
 * or, from inside world/forge/web/ itself, <script src="./forge-world.js">.
 */
(function () {
  "use strict";

  const DB_PREFIX = "forge-world:";
  const STORE = "objects";
  const WORLDS_INDEX_KEY = "forge:worlds-index";
  const ACTIVE_WORLD_KEY = "forge:active-world";

  function openDb(worldId) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_PREFIX + worldId, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // repo root, from where this script was loaded, so editor links work from world/forge/web/ and tools/
  const ROOT = (() => { try { return new URL("../../../", document.currentScript.src).href; } catch { return "../../../"; } })();

  // every put is announced to other open Forge tabs and tools (City refreshes its shelf when a
  // building comes back from Spire Forge, and so on)
  const channel = (() => { try { return new BroadcastChannel("forge-world"); } catch { return null; } })();
  const localListeners = new Set();
  const TAB = Math.random().toString(36).slice(2, 10);   // which tab a message came from
  function announce(msg) {
    msg = { ...msg, tab: TAB };
    try { channel && channel.postMessage(msg); } catch { /* ignore */ }
    // a BroadcastChannel never echoes to its own tab; same-tab listeners hear it here
    for (const fn of localListeners) { try { fn({ data: msg }); } catch (e) { console.error(e); } }
  }

  function store(db, mode) { return db.transaction(STORE, mode).objectStore(STORE); }

  function slugify(s) { return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

  function idFor(type, name) {
    const base = slugify(name) || Math.random().toString(36).slice(2, 8);
    return type + "_" + base;
  }

  class World {
    constructor(db, worldId) { this.db = db; this.worldId = worldId; }

    list(type) {
      return new Promise((resolve, reject) => {
        const req = store(this.db, "readonly").getAll();
        req.onsuccess = () => resolve(type ? req.result.filter((o) => o.type === type) : req.result);
        req.onerror = () => reject(req.error);
      });
    }

    get(id) {
      return new Promise((resolve, reject) => {
        const req = store(this.db, "readonly").get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    }

    // Bumps `version` on every write; leaves the lineage/re-forge engine (walking
    // refs[] to mark stale dependents) for Phase 4 — not built here, but refs[]
    // itself is recorded correctly from day one so that phase has real data to walk.
    async put(obj) {
      const existing = obj.id ? await this.get(obj.id) : null;
      const id = obj.id || idFor(obj.type, obj.name);
      const record = {
        id,
        type: obj.type || existing?.type,
        version: (existing?.version || 0) + 1,
        name: obj.name ?? existing?.name ?? id,
        recipe: obj.recipe ?? existing?.recipe ?? null,
        seed: obj.seed ?? existing?.seed ?? null,
        refs: obj.refs ?? existing?.refs ?? [],
        sockets: obj.sockets ?? existing?.sockets ?? [],
        prefab: obj.prefab ?? existing?.prefab ?? null,
        // the render style it's drawn in (a shared/look/style/style-recipes.js id); buildings carry Route Zero
        // when this is unset (StyleRecipes.styleOf)
        style: obj.style ?? existing?.style ?? null,
        // "svg" in obj (not ??) so a save can explicitly clear a stale full drawing with svg: null
        // once a thumb replaces it, instead of null silently falling back to the old value.
        svg: "svg" in obj ? obj.svg : (existing?.svg ?? null),
        thumb: obj.thumb ?? existing?.thumb ?? null,
        approved: obj.approved ?? existing?.approved ?? false,
        source: obj.source ?? existing?.source ?? null,
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };
      return new Promise((resolve, reject) => {
        const req = store(this.db, "readwrite").put(record);
        req.onsuccess = () => { announce({ kind: "put", worldId: this.worldId, id: record.id, type: record.type, version: record.version }); resolve(record); };
        req.onerror = () => reject(req.error);
      });
    }

    remove(id) {
      return new Promise((resolve, reject) => {
        const req = store(this.db, "readwrite").delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }

    // Phase 1 migration: wrap each old per-tool localStorage settings key
    // (spire:*, sigil:*, forge:* — forge: is Bestiary Forge's own prefix) as a
    // `type: "settings"` object, so everything a browser already has lives in
    // the one world file going forward. These keys hold small per-tool state
    // (species on/off, last preset) today, not saved-item lists — real list
    // persistence needed window.claude.use("db"), which only exists inside a
    // published Artifact — so this is deliberately modest, not a fake "23 saves".
    async migrateFromLocalStorage() {
      const PREFIXES = [
        { prefix: "spire:", tool: "Spire Forge" },
        { prefix: "sigil:", tool: "Sigil Forge" },
        { prefix: "forge:", tool: "Bestiary Forge" },
      ];
      let found = 0;
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
      for (const key of keys) {
        if (!key) continue;
        const match = PREFIXES.find((p) => key.startsWith(p.prefix));
        if (!match) continue;
        found++;
        let value = localStorage.getItem(key);
        try { value = JSON.parse(value); } catch { /* keep as string */ }
        const id = "settings_" + slugify(match.tool) + "_" + slugify(key.slice(match.prefix.length));
        await this.put({
          id, type: "settings", name: key,
          recipe: { tool: match.tool, key, value },
          source: { tool: match.tool, localStorageKey: key },
        });
      }
      return found;
    }
  }

  function readWorldsIndex() {
    try { return JSON.parse(localStorage.getItem(WORLDS_INDEX_KEY)) || []; } catch { return []; }
  }
  function writeWorldsIndex(list) {
    try { localStorage.setItem(WORLDS_INDEX_KEY, JSON.stringify(list)); } catch { /* ignore */ }
  }

  // ---- world files: a whole world as one JSON document, so it survives a cleared browser ----
  const FILE_FORMAT = "forge-world";
  const FILE_VERSION = 1;
  function rawPut(db, record) {
    return new Promise((resolve, reject) => {
      const req = store(db, "readwrite").put(record);
      req.onsuccess = () => resolve(record);
      req.onerror = () => reject(req.error);
    });
  }

  // ---- the dependency graph, read from every object's refs[] ("type:id@version") ----
  // Like Houdini's PDG, a version in a ref is what the object was cooked against: if the thing it
  // points at has moved on, the object is stale. Only INPUT refs make an object stale; the rest are
  // provenance ("made with"), shown but never stale (a captured species doesn't go stale because
  // the city it drifted in was edited).
  const INPUT_TYPES = { building: ["ruleset", "seal", "script", "icon-set"], rig: ["attach", "species"], city: ["building"], species: ["species"] };
  function parseRef(ref) {
    const m = /^([a-z][\w-]*):([^@]+?)(?:@(\d+))?$/i.exec(ref || "");
    return m ? { type: m[1], id: m[2], version: m[3] ? +m[3] : null, ref } : null;
  }
  function graph(records) {
    const byId = new Map(records.map((r) => [r.id, r]));
    const usedBy = new Map();     // id -> [{ id, input }]
    const refsOf = (r) => {
      const out = [];
      for (const s of r.refs || []) { const p = parseRef(s); if (p && p.type !== "part") out.push(p); }
      // an override base is a ref too ("species:<id>"), versioned against the base's current record
      const b = r.recipe && r.recipe.$base && parseRef(r.recipe.$base);
      if (b && byId.has(b.id) && !out.some((x) => x.id === b.id)) out.push(b);
      return out.map((p) => ({ ...p, input: (INPUT_TYPES[r.type] || []).includes(p.type) }));
    };
    for (const r of records) for (const p of refsOf(r)) {
      if (!usedBy.has(p.id)) usedBy.set(p.id, []);
      if (!usedBy.get(p.id).some((x) => x.id === r.id)) usedBy.get(p.id).push({ id: r.id, input: p.input });
    }
    const g = {
      byId, refsOf,
      usedBy: (id) => (usedBy.get(id) || []).map((u) => ({ ...u, record: byId.get(u.id) })).filter((u) => u.record),
      // everything downstream, through any ref
      impact(id) {
        const seen = new Set(), q = [id];
        while (q.length) for (const u of usedBy.get(q.shift()) || []) if (!seen.has(u.id) && u.id !== id) { seen.add(u.id); q.push(u.id); }
        return [...seen].map((x) => byId.get(x)).filter(Boolean);
      },
      // input refs whose target has a newer version than the one this object was cooked against
      stale(r) {
        return refsOf(r).filter((p) => p.input && p.version != null && byId.has(p.id) && byId.get(p.id).version > p.version)
          .map((p) => ({ ...p, now: byId.get(p.id).version, name: byId.get(p.id).name }));
      },
      staleAll() { return records.filter((r) => g.stale(r).length); },
      // a part id -> the objects that place it
      partUsers(partId) { return records.filter((r) => (r.refs || []).includes("part:" + partId)); },
    };
    return g;
  }

  const ForgeWorld = {
    STORE_NAME: STORE,
    parseRef, graph, INPUT_TYPES, TAB,
    async graphOf(world) { return graph(await world.list()); },
    FILE_FORMAT,

    // { format, version, exportedAt, world: {id, name, createdAt, updatedAt}, objects: [...] }
    async exportWorld(worldId) {
      const w = await this.open(worldId);
      const meta = readWorldsIndex().find((x) => x.id === worldId) || { id: worldId, name: worldId };
      const objects = (await w.list()).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      return { format: FILE_FORMAT, version: FILE_VERSION, exportedAt: new Date().toISOString(), world: meta, objects };
    },

    // Downloads the world file in a browser (forge-<name>.forge.json).
    async downloadWorld(worldId) {
      const data = await this.exportWorld(worldId);
      const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "forge-" + (slugify(data.world.name) || "world") + ".forge.json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      return data.objects.length;
    },

    // Imports a world file as a NEW world (never overwrites one), keeping every object's
    // id, version and history fields exactly, so refs between objects still resolve.
    // opts.name overrides the name; returns the new world's index record.
    async importWorld(data, opts) {
      opts = opts || {};
      if (typeof data === "string") data = JSON.parse(data);
      if (!data || data.format !== FILE_FORMAT || !Array.isArray(data.objects)) throw new Error("Not a Forge world file");
      if (data.version > FILE_VERSION) throw new Error("This world file is from a newer Forge (v" + data.version + ")");
      const taken = new Set(readWorldsIndex().map((w) => w.name));
      let name = opts.name || (data.world && data.world.name) || "Imported world";
      if (!opts.name && taken.has(name)) name += " (imported)";
      const rec = await this.createWorld(name);
      const w = await this.open(rec.id);
      for (const o of data.objects) if (o && o.id && o.type) await rawPut(w.db, o);
      return rec;
    },

    async readWorldFile(file) { return this.importWorld(await file.text()); },

    // ---- the selection: one object picked per world, shared by every page and tab ----
    // Like Blender's active object: pick a building in City and it is still picked in Bench,
    // Ecology, Lineage and the selection bar. Stored per world; changes are broadcast.
    getSelection(worldId) {
      try { return JSON.parse(localStorage.getItem("forge:sel:" + (worldId || this.getActiveWorldId())) || "null"); } catch { return null; }
    },
    select(worldId, sel) {
      worldId = worldId || this.getActiveWorldId();
      const v = sel && sel.id ? { id: sel.id, type: sel.type || null, from: sel.from || null, at: Date.now() } : null;
      const cur = this.getSelection(worldId);
      if (cur && v && cur.id === v.id) return;
      try { v ? localStorage.setItem("forge:sel:" + worldId, JSON.stringify(v)) : localStorage.removeItem("forge:sel:" + worldId); } catch { /* ignore */ }
      announce({ kind: "select", worldId, sel: v });
    },
    onSelect(cb) { return this.onChange((m) => { if (m && m.kind === "select") cb(m.sel, m.worldId); }); },

    // Every place an object lives across the stages, for the selection bar:
    // [{ id, label, url, kind: "edit" | "see" }], edits first. `g` = graph(records).
    placesFor(record, g, opts) {
      if (!record) return [];
      opts = opts || {};
      const world = opts.worldId || this.getActiveWorldId() || "";
      const page = (p, q) => ROOT + "world/forge/web/" + p + "?" + new URLSearchParams({ world, ...q }).toString();
      const out = this.editorsFor(record, opts).map((e) => ({ ...e, kind: "edit" }));
      const users = g ? g.usedBy(record.id).map((u) => u.record) : [];
      const cities = users.filter((u) => u.type === "city");
      const r = record.recipe || {};
      if (record.type === "building") {
        for (const c of cities) out.push({ id: "city:" + c.id, label: "In " + c.name, url: page("city.html", { city: c.id, focus: record.id }), kind: "see" });
        if (!cities.length) out.push({ id: "place", label: "Place in a city", url: page("city.html", { focus: record.id }), kind: "see" });
        const attracts = record.prefab && record.prefab.attracts && record.prefab.attracts.length;
        for (const c of cities) out.push({ id: "eco:" + c.id, label: (attracts ? "Its species in " : "Ecology in ") + c.name, url: page("ecology.html", { city: c.id, focus: record.id }), kind: "see" });
      } else if (record.type === "city") {
        out.push({ id: "eco", label: "Run ecology", url: page("ecology.html", { city: record.id }), kind: "see" });
      } else if (record.type === "species" && r.base) {
        if (r.city && g && g.byId.has(r.city)) out.push({ id: "eco", label: "Swimming in " + g.byId.get(r.city).name, url: page("ecology.html", { city: r.city, focus: record.id }), kind: "see" });
      } else if (record.type === "ruleset") {
        out.push({ id: "rules", label: "Rule sets", url: page("rules.html", { set: record.id }), kind: "edit" });
      }
      out.push({ id: "lineage", label: "Lineage", url: page("lineage.html", { object: record.id }), kind: "see" });
      return out;
    },

    // cb({ kind: "put", worldId, id, type, version }) whenever any tab saves into a world
    onChange(cb) {
      const h = (e) => cb(e.data);
      localListeners.add(h);
      if (channel) channel.addEventListener("message", h);
      return () => { localListeners.delete(h); if (channel) channel.removeEventListener("message", h); };
    },

    // Where a saved object can be edited, best first: [{ id, label, url }]. Tools open the object
    // through forge-bridge.js (?world=&object=&return=) and save back onto the same id.
    // opts.returnTo: the URL to come back to after editing (defaults to this page).
    editorsFor(record, opts) {
      opts = opts || {};
      if (!record) return [];
      const world = opts.worldId || this.getActiveWorldId() || "";
      const back = opts.returnTo || (typeof location !== "undefined" ? location.href : "");
      const q = (extra) => {
        const u = new URLSearchParams({ world, object: record.id, ...(extra || {}) });
        if (back) u.set("return", back);
        return u.toString();
      };
      const forge = (page, extra) => ROOT + "world/forge/web/" + page + "?" + q(extra);
      const r = record.recipe || {};
      const out = [];
      const tool = (path, extra) => ROOT + "world/forges/" + path + "?" + q(extra);
      // anything the 3D Bestiary can stand up gets a "walk it" entry (shared/engine/creature-record.js has the kinds)
      if (record.type === "species" && ["walker", "kit-mech", "glb-mech", "composed-mech", "composed-blade"].includes(r.kind)) out.push({ id: "walk", label: "Walk in 3D", url: tool("walker-bestiary/index.html") });
      if (record.type === "species" && (r.kind === "composed" || r.kind === "composed-mech")) out.push({ id: "compose", label: "Compose", url: forge("compose.html") });
      if (r.layout && (r.kind === "bred" || r.kind === "bred-tower" || r.kind === "composed")) out.push({ id: "bestiary", label: "Bestiary Forge", url: tool("bestiary-forge/index.html") });
      if (record.type === "building") {
        const genome = (r.spire && r.spire.base) ? r.spire : (r.base && r.crown ? r : null);
        if (genome) {
          out.push({ id: "spire-forge", label: "Spire Forge", url: tool("spire-forge/index.html") });
          out.push({ id: "bench", label: "Bench", url: forge("bench.html", { gen: "building.spire" }) });
        }
        if (Array.isArray(r.tiers)) out.push({ id: "tower-forge", label: "Tower Forge", url: tool("tower-forge/Tower%20Forge.html") });
      } else if (record.type === "seal") {
        out.push({ id: "sigil-forge", label: "Sigil Forge", url: tool("sigil-forge/index.html", { mode: "sigil" }) });
        out.push({ id: "bench", label: "Bench", url: forge("bench.html", { gen: "seal.sigil" }) });
      } else if (record.type === "script") {
        out.push({ id: "sigil-forge", label: "Sigil Forge", url: tool("sigil-forge/index.html", { mode: "glyphs" }) });
        out.push({ id: "bench", label: "Bench", url: forge("bench.html", { gen: "script.alphabet" }) });
      } else if (record.type === "icon-set") out.push({ id: "sigil-forge", label: "Sigil Forge", url: tool("sigil-forge/index.html", { mode: "icon" }) });
      else if (record.type === "style") out.push({ id: "style-lab", label: "Style Lab", url: tool("fish-tool/Species%20Style%20Lab.html") });
      else if (record.type === "city") out.push({ id: "city", label: "City", url: ROOT + "world/forge/web/city.html?world=" + encodeURIComponent(world) + "&city=" + encodeURIComponent(record.id) });
      else if (record.type === "rig" && r.species) out.push({ id: "rig", label: "Rig", url: ROOT + "world/forge/web/rig.html?world=" + encodeURIComponent(world) + (r.variant ? "&variant=" + encodeURIComponent(r.variant) : "&species=" + encodeURIComponent(r.species)) });
      else if (record.type === "species" && r.base) out.push({ id: "rig", label: "Rig", url: ROOT + "world/forge/web/rig.html?world=" + encodeURIComponent(world) + "&variant=" + encodeURIComponent(record.id) });
      return out;
    },

    async open(worldId) {
      const db = await openDb(worldId);
      return new World(db, worldId);
    },

    listWorlds() { return readWorldsIndex(); },

    async createWorld(name) {
      const id = "world_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const list = readWorldsIndex();
      const record = { id, name: name || "Untitled world", createdAt: Date.now(), updatedAt: Date.now() };
      list.push(record);
      writeWorldsIndex(list);
      await this.open(id); // materializes the IndexedDB database immediately
      return record;
    },

    renameWorld(worldId, name) {
      const list = readWorldsIndex();
      const w = list.find((x) => x.id === worldId);
      if (w && name) { w.name = name; w.updatedAt = Date.now(); writeWorldsIndex(list); }
      return w;
    },

    touchWorld(worldId) {
      const list = readWorldsIndex();
      const w = list.find((x) => x.id === worldId);
      if (w) { w.updatedAt = Date.now(); writeWorldsIndex(list); }
    },

    getActiveWorldId() {
      try { return localStorage.getItem(ACTIVE_WORLD_KEY); } catch { return null; }
    },
    setActiveWorldId(id) {
      try { localStorage.setItem(ACTIVE_WORLD_KEY, id); } catch { /* ignore */ }
    },

    // Convenience: the active world, creating "Tidegate" (first run) if none exists yet.
    async activeWorld() {
      let id = this.getActiveWorldId();
      let list = readWorldsIndex();
      if (!id || !list.find((w) => w.id === id)) {
        const created = list.length ? list[0] : await this.createWorld("Untitled world");
        id = created.id;
        this.setActiveWorldId(id);
      }
      return this.open(id);
    },
  };

  window.ForgeWorld = ForgeWorld;
})();
