/*
 * Forge — the shared world file.
 *
 * Phase 1 of the Forge pipeline plan: one IndexedDB database per world, one
 * object store, one object shape for everything a forge ever saves — species,
 * parts, scripts, seals, buildings, prefabs, cities. A "prefab" is not a
 * separate type: it's a `prefab` block added to any object once saved.
 * Schema is exactly H2Rules.dc.html's ("The rules underneath", the Forge UI
 * Explorations Artifact canvas): { id, type, version, name, recipe, seed,
 * refs[], sockets[], prefab, svg, approved, source, createdAt, updatedAt }.
 *
 * Every generator tool stays standalone; this module is the one thing they
 * all read and write through once they opt in (tools/spire-forge/index.html
 * is the first to do so). Load as a plain script: <script src="../../forge/web/forge-world.js">
 * or, from inside forge/web/ itself, <script src="./forge-world.js">.
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
        svg: obj.svg ?? existing?.svg ?? null,
        approved: obj.approved ?? existing?.approved ?? false,
        source: obj.source ?? existing?.source ?? null,
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };
      return new Promise((resolve, reject) => {
        const req = store(this.db, "readwrite").put(record);
        req.onsuccess = () => resolve(record);
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

  const ForgeWorld = {
    STORE_NAME: STORE,
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
