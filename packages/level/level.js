// ForgeLevel: a level as a data file, and the edits that change one.
//
// A level is plain JSON (docs/LEVELS.md): a header, the field, the life it keeps in numbers, and a flat list of entities, each a type, a place and a
// few properties. Nothing in it is baked: a page builds its world from the file every time. This script is the one place that knows the format:
//   TYPES      what kinds of entity there are and what properties each has (the editor's inspector and the checks are both made from it)
//   create, template, autoPlace   new levels
//   parse, stringify, migrate     files in and out, old versions brought forward
//   validate   what is wrong with a level (errors: a page cannot run it; warnings: it runs, and something looks off)
//   doc, apply, undo, redo        edits as commands, each with its inverse, so every change can be undone
// A classic script (window.ForgeLevel) that Node can also load (module.exports). No DOM, no dependencies.
(function (root) {
  "use strict";
  const FORMAT = "forge-level", VERSION = 2, TAU = Math.PI * 2;
  const getPath = (o, path) => path.split(".").reduce((a, k) => (a == null ? a : a[k]), o);

  // ---- what a level can hold ----
  // The encounters: the field's attack patterns (games/the-maw/field), by id. needs: 'tower' (hangs from one), big: wants more room round its home.
  // tests/level.test.ts checks this list against the field page's own.
  const ENCOUNTERS = [
    { id: "charge", name: "Charge", species: "Strike Lance" }, { id: "sweep", name: "Spin Sweep", species: "Glass Star" },
    { id: "adds", name: "Summon Adds", species: "Bell Jelly" }, { id: "blink", name: "Teleport Strike", species: "Cloak Rogue" },
    { id: "rage", name: "Rage Speed-Up", species: "Blade Hunter" }, { id: "slam", name: "Shockwave Slam", species: "Blade Puffer" },
    { id: "pack", name: "Pack Cut-Off", species: "Sickle Swift" }, { id: "under", name: "Under the Floor", species: "Clawed Centiwyrm" },
    { id: "spit", name: "Orbit and Spit", species: "Lattice Eel" }, { id: "plant", name: "False Plant", species: "Bramble Wyrm", big: true },
    { id: "drop", name: "Hanging Drop", species: "Drape Vampire", needs: "tower" }, { id: "dead", name: "Playing Dead", species: "Fin Puffer" },
    { id: "gaze", name: "Gaze", species: "Halo-eyed Seraph", big: true }, { id: "bait", name: "False Prey", species: "Halo Angler" },
    { id: "alarm", name: "Alarm Chain", species: "Blade Hunter", big: true }, { id: "thief", name: "Thief", species: "Ring Scavenger" },
    { id: "cloak", name: "Cloak Stalk", species: "Cloak Rogue" }, { id: "shell", name: "Shell", species: "Ring Scavenger" },
    { id: "territory", name: "Territory", species: "Spine Dragon" }, { id: "ink", name: "Ink Cloud", species: "Rosary Eel" },
    { id: "manta", name: "Escorts", species: "Glass Manta", big: true },
  ];
  const ENC = Object.fromEntries(ENCOUNTERS.map((e) => [e.id, e]));
  // what the field keeps in numbers as food for everyone
  const AMBIENT = [["koi", "Sigil Koi"], ["worm", "Butterfly Worm"], ["wisp", "Lantern Wisp"], ["leech", "Studded Leech"], ["comb-drifter", "Comb Drifter"]];

  // Each type: a label, a one-letter mark for the map, whether a level holds exactly one, and its properties.
  // A property: key, label, kind (number | enum | ref | text), and for a number its least, most, step and default.
  // Every entity also has id, type, x and y (level units: the field's radius is field.radius, the middle is 0, 0, y runs down the map).
  const TYPES = {
    start: { label: "Maw start", mark: "M", one: true, radius: () => 4, props: [] },
    tower: { label: "Tower", mark: "T", radius: (e) => e.r, props: [
      { key: "r", label: "Radius", kind: "number", min: 1.5, max: 25, step: 0.1, def: 3.9 },
      { key: "height", label: "Height", kind: "number", min: 0.2, max: 0.95, step: 0.01, def: 0.82, hint: "of depth" } ] },
    grove: { label: "Grove", mark: "G", radius: (e) => e.r, props: [
      { key: "r", label: "Radius", kind: "number", min: 2, max: 30, step: 0.5, def: 9 },
      { key: "plants", label: "Plants", kind: "number", min: 1, max: 40, step: 1, def: 7 } ] },
    encounter: { label: "Encounter", mark: "E", radius: () => 3, props: [
      { key: "pattern", label: "Pattern", kind: "enum", options: ENCOUNTERS.map((e) => [e.id, e.name]), def: "charge" },
      { key: "tower", label: "Tower", kind: "ref", of: "tower", def: "", hint: "empty: the nearest" } ] },
  };

  // A level is one of two kinds. "field": a layout (the entities above), played in games/the-maw/field. "stage": one of the tank's places
  // (packages/maw/maw-stages.js), played in the tank; the tank lays the place out itself, so a stage is settings: who lives there, the light and
  // ground, what the Maw starts with, and what clears it. STAGE lists those settings once; the editor's Stage tab and the checks are made from it.
  const CREW = [["strider", "Carapace Strider"], ["pincer", "Pincer Crawler"], ["lancer", "Strike Lance"], ["centiwyrm", "Centiwyrm"]], PROPS = [["boulder", "Boulders"], ["weed", "Weed"], ["carcass", "Carcasses"], ["vent", "Vents"]];
  const STAGE = [
    { group: "Place", fields: [{ path: "place", label: "Place", kind: "text", def: "Open floor, dim" }, { path: "verb", label: "Verb", kind: "text", def: "Lunge" }, { path: "brief", label: "Brief", kind: "long", def: "" }, { path: "trick", label: "Trick", kind: "long", def: "" }] },
    { group: "Creatures", fields: [{ path: "roster", label: "Roster", kind: "counts", of: "species", min: 1, max: 60, def: { worm: 8, wisp: 18 } }] },
    { group: "Floor crew", fields: [{ path: "crew", label: "Crew", kind: "fixed", keys: CREW, min: 0, max: 8, def: { strider: 3 } }] },
    { group: "Landmarks", fields: [{ path: "props", label: "Landmarks", kind: "fixed", keys: PROPS, min: 0, max: 30, def: { boulder: 10 } }] },
    { group: "Light and ground", fields: [{ path: "env.dark", label: "Dark", kind: "number", min: 0, max: 1, step: 0.05, def: 0.2, hint: "0 lit · 1 black" }, { path: "env.ruins", label: "Towers", kind: "bool", def: false }] },
    { group: "The Maw starts with", fields: [{ path: "kit.eyes", label: "Eyes", kind: "number", min: 0, max: 2, step: 1, def: 0, hint: "pairs" }, { path: "kit.sonar", label: "Sonar", kind: "number", min: 0, max: 1, step: 1, def: 0 },
      { path: "kit.form", label: "Form", kind: "enum", options: [["", "Walker"], ["swim", "Swimmer"]], def: "" }, { path: "kit.mass", label: "Mass", kind: "number", min: 0, max: 14, step: 1, def: 0, hint: "0 hatchling · 14 mid" }] },
    { group: "Goal (all must hold)", fields: [{ path: "goal.meals", label: "Meals", kind: "number", min: 0, max: 60, step: 1, def: 10 }, { path: "goal.eyes", label: "Eyes", kind: "number", min: 0, max: 2, step: 1, def: 0 }, { path: "goal.sonar", label: "Sonar", kind: "number", min: 0, max: 1, step: 1, def: 0 },
      { path: "goal.form", label: "Become", kind: "enum", options: [["", "No change"], ["swim", "Swimmer"]], def: "" }, { path: "goal.tier", label: "Size", kind: "enum", options: [["", "Any"], ["1", "Mid"], ["2", "Large"]], def: "" }, { path: "goal.parts", label: "Parts", kind: "number", min: 0, max: 8, step: 1, def: 0 },
      { path: "goal.eat", label: "Eat", kind: "eat", def: [] }] },
    { group: "Pressure", fields: [{ path: "press.upkeep", label: "Hunger", kind: "number", min: 1, max: 20, step: 1, def: 8, hint: "× drain" }, { path: "press.prey", label: "Food", kind: "number", min: 0.2, max: 3, step: 0.1, def: 1, hint: "× kept" }, { path: "press.regrow", label: "Crew back", kind: "number", min: 10, max: 120, step: 5, def: 45, hint: "s" }] },
  ];
  // a stage with every setting at its default
  function stage(o) { const st = { roster: {}, crew: {}, props: {}, env: {}, kit: {}, goal: {}, press: {} }; for (const g of STAGE) for (const f of g.fields) { const v = clone(f.def); if (f.kind === "number" && f.path.startsWith("kit.") && !v) continue; if (f.kind === "number" && f.path.startsWith("goal.") && !v) continue; if ((f.kind === "enum" || f.kind === "eat") && (v === "" || (Array.isArray(v) && !v.length))) continue; setPath(st, f.path, v); } return Object.assign(st, o || {}); }
  // a level from one of the tank's stages (MawStages.LIST), and the stage a level stands for (what MawStages.add takes)
  const STAGE_KEYS = ["place", "verb", "brief", "trick", "roster", "crew", "props", "env", "kit", "goal", "press"];
  function fromStage(st, o) { const L = create(Object.assign({ name: st.name }, o)); L.kind = "stage"; L.entities = []; delete L.life; L.stage = {}; for (const k of STAGE_KEYS) if (st[k] !== undefined) L.stage[k] = clone(st[k]); return L; }
  // A stage may place its own towers (tower entities; 100 level units is half the tank's short side). They go with it as layout.towers, and the
  // tank stands them in place of the ring it would roll from its seed. With none placed, the tank's own.
  function layoutOf(level) { const towers = (level.entities || []).filter((e) => e.type === "tower").map((e) => ({ x: e.x, y: e.y, r: e.r, height: e.height })); return towers.length ? { towers } : null; }
  function toStage(level, id) { const st = { id: id || slug(level.name), name: level.name }; for (const k of STAGE_KEYS) st[k] = clone(level.stage[k] === undefined ? (k === "place" || k === "verb" || k === "brief" || k === "trick" ? "" : {}) : level.stage[k]);
    const lay = st.env && st.env.ruins ? layoutOf(level) : null; if (lay) st.layout = lay; return st; }
  const slug = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "level";

  // ---- small helpers ----
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function rng(seed) { let a = (seed | 0) || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const round = (v, p) => { const k = Math.pow(10, p == null ? 2 : p); return Math.round(v * k) / k; };
  const snap = (v, grid) => (grid > 0 ? Math.round(v / grid) * grid : v);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const radiusOf = (e) => (TYPES[e.type] ? TYPES[e.type].radius(e) : 1);
  const byId = (level, id) => level.entities.find((e) => e.id === id) || null;
  const ofType = (level, type) => level.entities.filter((e) => e.type === type);
  function nextId(level) { let n = 0; for (const e of level.entities) { const m = /^e(\d+)$/.exec(e.id); if (m) n = Math.max(n, +m[1]); } return "e" + (n + 1); }
  function nearestTower(level, p) { let best = null, bd = 1e9; for (const t of ofType(level, "tower")) { const d = dist(t, p); if (d < bd) { bd = d; best = t; } } return best; }

  // an entity of a type with every property at its default
  function entity(type, x, y, props) { const T = TYPES[type]; if (!T) throw new Error("unknown entity type: " + type);
    const e = { id: "", type, x: round(x || 0), y: round(y || 0) }; for (const p of T.props) e[p.key] = p.def; return Object.assign(e, props || {}); }

  // ---- new levels ----
  function create(o) { o = o || {};
    return { format: FORMAT, version: VERSION, kind: "field", name: o.name || "Untitled", notes: "", seed: o.seed == null ? 7 : o.seed | 0,
      field: { shape: "disc", radius: 100, crowd: o.crowd || 70 },
      life: { ambient: [["koi", 7], ["worm", 4], ["wisp", 6], ["leech", 4], ["comb-drifter", 3]].map(([species, count]) => ({ species, count })) },
      entities: [Object.assign(entity("start", 0, 0), { id: "e1" })] }; }

  // Places entities by rule, as the field page always has: each a clear distance from the Maw's start, the towers and each other.
  // o.encounters: [[pattern, count], ...]; o.groves: how many; o.seed. Returns the entities it added (already in the level).
  function autoPlace(level, o) { o = o || {}; const rnd = rng((o.seed == null ? level.seed : o.seed) * 7919 + 13), R = level.field.radius, added = [];
    const taken = level.entities.map((e) => ({ x: e.x, y: e.y, r: e.type === "start" ? 31 : e.type === "tower" ? e.r + 11 : e.type === "grove" ? 12 : 12 }));
    // a crowded level gives ground: the room asked for shrinks until a place is found
    const spot = (m) => { for (const k of [1, 0.75, 0.5, 0.3]) for (let n = 0; n < 300; n++) { const a = rnd() * TAU, r = Math.sqrt(rnd()) * (R - 13), x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (taken.every((h) => Math.hypot(h.x - x, h.y - y) > Math.max(m, h.r) * k)) { taken.push({ x, y, r: m * 0.6 }); return { x, y }; } } return null; };
    const put = (e) => { e.id = nextId(level); level.entities.push(e); added.push(e); };
    for (let g = 0; g < (o.groves || 0); g++) { const c = spot(20); if (c) put(entity("grove", c.x, c.y)); }
    for (const [id, n] of o.encounters || []) for (let j = 0; j < n; j++) {
      if (ENC[id] && ENC[id].needs === "tower") { const ts = ofType(level, "tower"); if (!ts.length) continue; const t = ts[(added.length + j) % ts.length]; put(entity("encounter", t.x, t.y, { pattern: id, tower: t.id })); continue; }
      const c = spot(ENC[id] && ENC[id].big ? 27 : 19); if (c) put(entity("encounter", c.x, c.y, { pattern: id })); }
    return added; }

  const FIELD_ROSTER = [["charge", 2], ["sweep", 2], ["adds", 1], ["blink", 2], ["rage", 2], ["slam", 2], ["pack", 1], ["under", 2], ["spit", 2], ["plant", 2], ["drop", 2], ["dead", 2], ["gaze", 1], ["bait", 2], ["alarm", 1], ["thief", 1], ["cloak", 2], ["shell", 2], ["territory", 2], ["ink", 2], ["manta", 1]];
  const TEMPLATES = {
    empty: { label: "Empty field", make: (o) => { const L = create(o); L.entities.push(Object.assign(entity("tower", 7, -46), { id: "e2" })); return L; } },
    // the field as its page lays it out by default: five towers, five groves, every pattern
    field: { label: "The field", make: (o) => { const L = create(Object.assign({ name: "The field" }, o));
      const T = [[7, -46, 3.87]].concat([[-0.6, 0.61, 70], [1.1, 0.67, 88], [2.4, 0.56, 64], [3.6, 0.7, 82]].map(([a, d, r]) => [Math.cos(a) * d * 100, Math.sin(a) * d * 100, r / 20.16]));
      for (const [x, y, r] of T) L.entities.push(Object.assign(entity("tower", x, y, { r: round(r) }), { id: nextId(L) }));
      autoPlace(L, { groves: 5, encounters: FIELD_ROSTER }); return L; } },
    duel: { label: "One on one", make: (o) => { const L = create(Object.assign({ name: "One on one" }, o)); L.entities[0].y = 30;
      L.entities.push(Object.assign(entity("tower", 0, -55), { id: "e2" }), Object.assign(entity("encounter", 0, -10, { pattern: "charge" }), { id: "e3" })); return L; } },
    // a new place for the tank, from the settings' defaults
    stage: { label: "A tank stage", make: (o) => { const L = create(Object.assign({ name: "New stage" }, o)); L.kind = "stage"; L.entities = []; delete L.life; L.stage = stage({ brief: "A new place in the tank.", trick: "" }); return L; } },
  };
  function template(key, o) { const t = TEMPLATES[key]; if (!t) throw new Error("unknown template: " + key); return t.make(o || {}); }

  // ---- files ----
  // older versions are brought forward one step at a time; MIGRATIONS[n] turns version n into n + 1
  const MIGRATIONS = { 1: (L) => { L.kind = "field"; return L; } };   // version 2 added kind and the stage block; every version 1 level was a field
  function migrate(obj) { if (!obj || typeof obj !== "object" || obj.format !== FORMAT) throw new Error("not a Forge level file");
    let L = clone(obj); if (!(L.version >= 1)) throw new Error("level has no version");
    if (L.version > VERSION) throw new Error("level is version " + L.version + "; this build reads up to " + VERSION);
    while (L.version < VERSION) { const step = MIGRATIONS[L.version]; if (!step) throw new Error("no way forward from version " + L.version); L = step(L); L.version++; }
    return L; }
  function parse(text) { let obj; try { obj = JSON.parse(text); } catch (e) { throw new Error("not JSON: " + e.message); } return migrate(obj); }
  // keys in one order and numbers rounded, so the same level always gives the same file
  function stringify(level) { const L = clone(level); for (const e of L.entities) for (const k of Object.keys(e)) if (typeof e[k] === "number") e[k] = round(e[k], 3);
    const head = ["format", "version", "kind", "name", "notes", "seed", "field", "life", "stage", "entities"], out = {};
    for (const k of head) if (k in L) out[k] = L[k]; for (const k of Object.keys(L)) if (!(k in out)) out[k] = L[k];
    out.entities = L.entities.map((e) => { const o = { id: e.id, type: e.type, x: e.x, y: e.y }; for (const k of Object.keys(e)) if (!(k in o)) o[k] = e[k]; return o; });
    return JSON.stringify(out, null, 2).replace(/\{\n\s+"id": ([^\n]+),\n\s+"type": ([^\n]+),\n([\s\S]*?)\n\s+\}/g, (m, id, type, rest) => `{ "id": ${id}, "type": ${type}, ${rest.trim().replace(/,\n\s+/g, ", ")} }`).replace(/\{\n\s+"species": ([^\n]+),\n\s+"count": ([^\n]+)\n\s+\}/g, '{ "species": $1, "count": $2 }') + "\n"; }

  // ---- checks ----
  // ctx.species: the species keys a page knows (optional). Returns { ok, errors, warnings }; each entry { id, msg } (id: the entity, or null for the level).
  function validate(level, ctx) { const errors = [], warnings = [], E = (id, msg) => errors.push({ id, msg }), W = (id, msg) => warnings.push({ id, msg }); ctx = ctx || {};
    if (!level || level.format !== FORMAT) { E(null, "Not a Forge level."); return { ok: false, errors, warnings }; }
    if (level.version !== VERSION) E(null, "Version " + level.version + " (expected " + VERSION + "): migrate it first.");
    if (typeof level.name !== "string" || !level.name.trim()) E(null, "The level has no name.");
    if (!Number.isInteger(level.seed)) E(null, "The seed must be a whole number.");
    const F = level.field || {}; if (!(F.radius > 0)) E(null, "The field has no radius."); if (!(F.crowd >= 40 && F.crowd <= 600)) E(null, "Field size must be between 40 and 600.");
    const R = F.radius || 100, ents = Array.isArray(level.entities) ? level.entities : []; if (!Array.isArray(level.entities)) E(null, "The level has no entity list.");
    if (level.kind !== "field" && level.kind !== "stage") E(null, "Unknown kind of level: " + level.kind + ".");
    if (level.kind === "stage") { stageChecks(level.stage, ctx, E, W); const seen = new Set(), tw = ents.filter((e) => e.type === "tower");
      for (const e of ents) { if (!e.id || seen.has(e.id)) E(e.id || null, "Two entities share the id " + e.id + "."); seen.add(e.id);
        if (e.type !== "tower") { E(e.id, "A tank stage can place towers only; this is a " + ((TYPES[e.type] || { label: e.type }).label).toLowerCase() + "."); continue; }
        if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) { E(e.id, "Tower has no place."); continue; } if (Math.hypot(e.x, e.y) + e.r > R) E(e.id, "Tower reaches outside the part of the tank every screen shows.");
        for (const p of TYPES.tower.props) if (!Number.isFinite(e[p.key]) || e[p.key] < p.min || e[p.key] > p.max) E(e.id, "Tower: " + p.label + " must be " + p.min + " to " + p.max + "."); }
      for (let i = 0; i < tw.length; i++) for (let j = i + 1; j < tw.length; j++) if (dist(tw[i], tw[j]) < tw[i].r + tw[j].r) E(tw[j].id, "Two towers overlap.");
      if (tw.length && !(level.stage && level.stage.env && level.stage.env.ruins)) W(null, "Towers are placed but Towers is off: they will not stand.");
      if (tw.length > 12) W(null, tw.length + " towers: the tank is tuned for 6 to 9.");
      return { ok: !errors.length, errors, warnings }; }
    const amb = (level.life && level.life.ambient) || []; if (!amb.length) W(null, "No food is kept in the field: everything will starve.");
    for (const a of amb) { if (ctx.species ? !ctx.species.includes(a.species) : !a.species) E(null, "Food names an unknown species: " + a.species + "."); if (!(a.count >= 0 && a.count <= 200)) E(null, "Food count for " + a.species + " must be 0 to 200."); }
    const seen = new Set(), towers = ents.filter((e) => e.type === "tower"), starts = ents.filter((e) => e.type === "start");
    if (starts.length !== 1) E(null, starts.length ? "More than one Maw start." : "No Maw start.");
    for (const e of ents) { const T = TYPES[e.type];
      if (!e.id || seen.has(e.id)) E(e.id || null, "Two entities share the id " + e.id + "."); seen.add(e.id);
      if (!T) { E(e.id, "Unknown type: " + e.type + "."); continue; }
      if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) { E(e.id, T.label + " has no place."); continue; }
      const d = Math.hypot(e.x, e.y), r = radiusOf(e);
      if (d > R) E(e.id, T.label + " is outside the field."); else if (d + r > R) W(e.id, T.label + " reaches past the field's edge.");
      for (const p of T.props) { const v = e[p.key];
        if (p.kind === "number") { if (!Number.isFinite(v)) E(e.id, T.label + ": " + p.label + " is not a number."); else if (v < p.min || v > p.max) E(e.id, T.label + ": " + p.label + " must be " + p.min + " to " + p.max + "."); }
        else if (p.kind === "enum") { if (!p.options.some((o) => o[0] === v)) E(e.id, T.label + ": unknown " + p.label.toLowerCase() + " \"" + v + "\"."); }
        else if (p.kind === "ref" && v) { const t = ents.find((x) => x.id === v); if (!t || t.type !== p.of) E(e.id, T.label + ": its " + p.label.toLowerCase() + " (" + v + ") is not in the level."); } } }
    for (let i = 0; i < towers.length; i++) for (let j = i + 1; j < towers.length; j++) if (dist(towers[i], towers[j]) < towers[i].r + towers[j].r) E(towers[j].id, "Two towers overlap.");
    const st = starts[0]; if (st) for (const t of towers) if (dist(st, t) < t.r + 4) E(st.id, "The Maw starts inside a tower.");
    const encs = ents.filter((e) => e.type === "encounter" && ENC[e.pattern]);
    for (const e of encs) { const X = ENC[e.pattern];
      if (X.needs === "tower") { if (!towers.length) E(e.id, X.name + " needs a tower to hang from, and the level has none."); }
      else { for (const t of towers) if (dist(e, t) < t.r) { E(e.id, X.name + " is inside a tower."); break; } }
      if (st && X.needs !== "tower" && dist(e, st) < 15) W(e.id, X.name + " is on top of the Maw's start."); }
    for (let i = 0; i < encs.length; i++) for (let j = i + 1; j < encs.length; j++) if (ENC[encs[i].pattern].needs !== "tower" && ENC[encs[j].pattern].needs !== "tower" && dist(encs[i], encs[j]) < 8) W(encs[j].id, "Two encounters share nearly the same home.");
    if (!towers.length) W(null, "No towers: nothing to climb.");
    if (!encs.length) W(null, "No encounters: nothing hunts the Maw.");
    if (encs.length > 60) W(null, encs.length + " encounters: the field draws at most 64 creatures at once.");
    return { ok: !errors.length, errors, warnings }; }

  function stageChecks(st, ctx, E, W) { if (!st || typeof st !== "object") return E(null, "A stage level has no stage settings.");
    const known = ctx.speciesAll ? new Set(ctx.speciesAll) : null, crew = new Set(CREW.map((c) => c[0])), props = new Set(PROPS.map((c) => c[0])), num = (v) => typeof v === "number" && Number.isFinite(v);
    for (const g of STAGE) for (const f of g.fields) { const v = getPath(st, f.path); if (v == null || v === "") continue;
      if (f.kind === "number" && (!num(v) || v < f.min || v > f.max)) E(null, f.label + " must be " + f.min + " to " + f.max + ".");
      if (f.kind === "enum" && !f.options.some((o) => o[0] === String(v))) E(null, f.label + ": unknown choice \"" + v + "\"."); }
    const roster = st.roster || {}, rk = Object.keys(roster); if (!rk.length) E(null, "The roster is empty: nothing lives here.");
    for (const k of rk) { if (known && !known.has(k)) E(null, "The roster names \"" + k + "\", which is not a species."); if (!num(roster[k]) || roster[k] < 1 || roster[k] > 60) E(null, "Roster count for " + k + " must be 1 to 60."); }
    for (const k of Object.keys(st.crew || {})) { if (!crew.has(k)) E(null, "The crew names \"" + k + "\", which is not a walker."); else if (!num(st.crew[k]) || st.crew[k] < 0 || st.crew[k] > 8) E(null, "Crew count for " + k + " must be 0 to 8."); }
    for (const k of Object.keys(st.props || {})) { if (!props.has(k)) E(null, "Landmarks name \"" + k + "\", which the tank does not have."); else if (!num(st.props[k]) || st.props[k] < 0 || st.props[k] > 30) E(null, "Landmark count for " + k + " must be 0 to 30."); }
    const G = st.goal || {}, eat = G.eat || []; if (!(G.meals || G.eyes || G.sonar || G.form || G.tier != null && G.tier !== "" || G.parts || eat.length)) E(null, "The stage has no goal: it could never be cleared.");
    for (const e of eat) { if (!e || !Array.isArray(e.keys) || !e.keys.length) { E(null, "An Eat goal names no species."); continue; } if (!num(e.n) || e.n < 1 || e.n > 40) E(null, "An Eat goal's count must be 1 to 40.");
      for (const k of e.keys) { if (known && !known.has(k)) E(null, "An Eat goal names \"" + k + "\", which is not a species."); else if (!roster[k] && !Object.keys(st.crew || {}).length) W(null, "The goal asks for " + k + ", which is not in the roster."); } }
    if (G.eyes && (st.kit || {}).eyes >= G.eyes) W(null, "The Maw starts with the eyes the goal asks for.");
    if (G.form && (st.kit || {}).form === G.form) W(null, "The Maw starts in the form the goal asks for.");
    if (!st.brief) W(null, "No brief: the menu will have nothing to say about this place.");
    const total = rk.reduce((a, k) => a + (num(roster[k]) ? roster[k] : 0), 0); if (total > 140) W(null, total + " creatures in the roster: the tank is tuned for 60 to 120."); }

  // ---- edits ----
  // A document is a level with its history. Every edit is a command; apply() does it and keeps its inverse.
  //   { op: 'add', entity }            (an id is given if it has none)
  //   { op: 'remove', id }             (references to it are cleared in the same step)
  //   { op: 'set', id, props }         (place and properties of one entity)
  //   { op: 'level', path, value }     (a level setting, by dotted path: 'name', 'seed', 'field.crowd', 'life.ambient', 'stage.roster'; value undefined removes it)
  //   { op: 'batch', cmds, label }
  // opts.merge: a key; successive commands with the same key (a drag) fold into one undo step.
  function doc(level) { return { level, undo: [], redo: [], changes: 0 }; }
  function setPath(o, path, v) { const ks = path.split("."), last = ks.pop(); let a = o; for (const k of ks) a = a[k] || (a[k] = {}); if (v === undefined) delete a[last]; else a[last] = v; }
  function run(level, c) {
    if (c.op === "add") { const e = clone(c.entity); if (!e.id || byId(level, e.id)) e.id = nextId(level); const at = c.at == null ? level.entities.length : c.at; level.entities.splice(at, 0, e); c.entity = clone(e); return { op: "remove", id: e.id }; }
    if (c.op === "remove") { const i = level.entities.findIndex((e) => e.id === c.id); if (i < 0) return null; const e = level.entities[i], inv = [{ op: "add", entity: clone(e), at: i }];
      level.entities.splice(i, 1); for (const o of level.entities) for (const p of (TYPES[o.type] || { props: [] }).props) if (p.kind === "ref" && o[p.key] === c.id) { inv.push({ op: "set", id: o.id, props: { [p.key]: c.id } }); o[p.key] = ""; }
      return inv.length === 1 ? inv[0] : { op: "batch", cmds: inv }; }
    if (c.op === "set") { const e = byId(level, c.id); if (!e) return null; const was = {}; for (const k of Object.keys(c.props)) { if (k === "id" || k === "type") continue; was[k] = e[k]; e[k] = c.props[k]; } return { op: "set", id: c.id, props: was }; }
    if (c.op === "level") { const was = getPath(level, c.path); setPath(level, c.path, c.value === undefined ? undefined : clone(c.value)); return { op: "level", path: c.path, value: was === undefined ? undefined : clone(was) }; }
    if (c.op === "batch") { const inv = []; for (const s of c.cmds) { const r = run(level, s); if (r) inv.unshift(r); } return { op: "batch", cmds: inv, label: c.label }; }
    throw new Error("unknown command: " + c.op); }
  function apply(d, cmd, opts) { const inv = run(d.level, cmd); if (!inv) return false; const key = opts && opts.merge, top = d.undo[d.undo.length - 1];
    if (!(key && top && top.merge === key)) d.undo.push({ inv, merge: key || null, label: cmd.label || cmd.op });   // a merged step keeps the first inverse: undo goes back to before the drag
    if (d.undo.length > 200) d.undo.shift(); d.redo.length = 0; d.changes++; return true; }
  function seal(d) { const top = d.undo[d.undo.length - 1]; if (top) top.merge = null; }   // end a drag: the next command starts a new step
  function undo(d) { const s = d.undo.pop(); if (!s) return false; const inv = run(d.level, s.inv); d.redo.push({ inv, label: s.label }); d.changes++; return true; }
  function redo(d) { const s = d.redo.pop(); if (!s) return false; const inv = run(d.level, s.inv); d.undo.push({ inv, merge: null, label: s.label }); d.changes++; return true; }

  const api = { FORMAT, VERSION, TYPES, ENCOUNTERS, ENC, AMBIENT, TEMPLATES, FIELD_ROSTER, STAGE, CREW, PROPS, stage, fromStage, toStage, layoutOf, slug, getPath, rng, snap, round, dist, radiusOf, byId, ofType, nextId, nearestTower,
    entity, create, template, autoPlace, migrate, parse, stringify, validate, doc, apply, seal, undo, redo };
  root.ForgeLevel = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
