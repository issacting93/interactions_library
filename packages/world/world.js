/* ForgeWorld: a world of joined levels, and the save that travels through it.
   Classic script: puts ForgeWorld on window (and module.exports under node). Needs ForgeLevel for levelFor().

   Two files.
   A WORLD says which levels there are and how they join. It is made once and does not change as you play.
     { format: 'forge-world', version: 1, name, seed, start: 'floor',
       levels: [ { id: 'floor', level: 'field', away: 'freeze', seed? } ],        level: the name of a level file
       links:  [ { from: 'floor', to: 'forest', needs?: 'flag' } ] }              a link is one way; add its mirror to go back
   A SAVE is what one player has done to it. A level is never stored whole: it is made again from its file and seed, and
   the save holds only what differs.
     { format: 'forge-save', version: 1, world: { name, seed }, clock, at,
       rules:   { onDeath: 'keep' | 'reset' },                                    what dying does to the levels. Not decided yet: 'keep' until it is
       levels:  { floor: { visits, leftAt, changes: [commands], state: {} } },    changes are ForgeLevel commands against the made level
       run:     { n, startedAt, maw: {}, flags: {} },                             dies with the run
       lasting: { runs, unlocked: [], seen: [], flags: {}, best: {} } }           survives it

   away: what a level does while you are somewhere else. 'freeze': nothing; you find it as you left it. 'live': it goes on, and
   awayFor() says for how many seconds, which the game plays forward (or stands in for) when you come back. */
(function (root) {
  "use strict";
  const WORLD = "forge-world", SAVE = "forge-save", VERSION = 1, AWAY = ["freeze", "live"], DEATH = ["keep", "reset"], ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const isObj = (o) => o && typeof o === "object" && !Array.isArray(o);
  // a level's own seed, when the world gives none: from the world's seed and the level's id, so adding a level moves no other
  function seedOf(world, id) { const lv = byId(world, id); if (lv && Number.isFinite(lv.seed)) return lv.seed >>> 0; let h = (world.seed >>> 0) ^ 0x9e3779b9; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0) % 1000000; }
  const byId = (world, id) => world.levels.find((l) => l.id === id) || null;
  const exits = (world, id) => world.links.filter((k) => k.from === id);

  function create(o) { o = o || {}; return { format: WORLD, version: VERSION, name: o.name || "Untitled world", seed: (o.seed >>> 0) || 1, start: o.start || null, levels: [], links: [] }; }
  function addLevel(world, o) { const lv = { id: o.id, level: o.level || o.id, away: o.away || "freeze" }; if (Number.isFinite(o.seed)) lv.seed = o.seed >>> 0; world.levels.push(lv); if (!world.start) world.start = lv.id; return lv; }
  function link(world, from, to, o) { o = o || {}; const add = (a, b) => { if (!world.links.some((k) => k.from === a && k.to === b)) { const k = { from: a, to: b }; if (o.needs) k.needs = o.needs; world.links.push(k); } }; add(from, to); if (o.both !== false) add(to, from); return world; }

  // which levels can be reached from the start, with the flags given (none: only ungated links)
  function reach(world, flags) { const seen = new Set(), go = [world.start]; flags = flags || {}; while (go.length) { const id = go.pop(); if (seen.has(id) || !byId(world, id)) continue; seen.add(id); for (const k of exits(world, id)) if (!k.needs || flags[k.needs]) go.push(k.to); } return seen; }

  function validateWorld(world, opts) { const errors = [], warnings = [], err = (m, id) => errors.push({ message: m, id: id || null }), warn = (m, id) => warnings.push({ message: m, id: id || null });
    if (!isObj(world) || world.format !== WORLD) { err("Not a world file."); return { errors, warnings }; }
    if (world.version > VERSION) err("Made by a newer build (version " + world.version + ").");
    if (!Array.isArray(world.levels) || !world.levels.length) { err("A world needs at least one level."); return { errors, warnings }; }
    if (!Array.isArray(world.links)) { err("links must be a list."); return { errors, warnings }; }
    const ids = new Set();
    for (const l of world.levels) { if (!ID.test(l.id || "")) err("A level's id is lower-case letters, digits and dashes.", l.id); if (ids.has(l.id)) err("Two levels share the id " + l.id + ".", l.id); ids.add(l.id);
      if (!AWAY.includes(l.away)) err("away is 'freeze' or 'live'.", l.id); if (typeof l.level !== "string" || !l.level) err("A level names its level file.", l.id);
      if (opts && opts.files && !opts.files.includes(l.level)) err("There is no level file called " + l.level + ".", l.id); }
    if (!ids.has(world.start)) err("The start is not one of the levels.");
    for (const k of world.links) { if (!ids.has(k.from) || !ids.has(k.to)) err("A link joins a level that is not there: " + k.from + " to " + k.to + "."); if (k.from === k.to) err("A link joins " + k.from + " to itself.", k.from); }
    if (!errors.length) { const all = new Set(), gates = {}; for (const k of world.links) if (k.needs) gates[k.needs] = true; for (const id of reach(world, gates)) all.add(id);
      for (const l of world.levels) { if (!all.has(l.id)) warn("Nothing leads to " + l.id + ".", l.id); else if (l.id !== world.start && !exits(world, l.id).length) warn(l.id + " has no way out.", l.id); } }
    return { errors, warnings }; }

  // ---- the save ----
  function newSave(world, o) { o = o || {}; return { format: SAVE, version: VERSION, world: { name: world.name, seed: world.seed >>> 0 }, clock: 0, at: null, rules: { onDeath: DEATH.includes(o.onDeath) ? o.onDeath : "keep" },
    levels: {}, run: newRun(1, 0), lasting: { runs: 0, unlocked: [], seen: [], flags: {}, best: {} } }; }
  function newRun(n, t) { return { n, startedAt: t, maw: {}, flags: {} }; }
  const rec = (save, id) => save.levels[id] || (save.levels[id] = { visits: 0, leftAt: null, catchUp: 0, changes: [], state: {} });
  const flagsOf = (save) => Object.assign({}, save.lasting.flags, save.run.flags);
  // time only moves while somebody plays; every level's 'away' is counted against this one clock
  function tick(save, dt) { if (dt > 0) save.clock = +(save.clock + dt).toFixed(3); return save.clock; }
  function canGo(world, save, to) { if (save.at === null) return to === world.start; const k = exits(world, save.at).find((x) => x.to === to); return !!k && (!k.needs || !!flagsOf(save)[k.needs]); }
  function awayFor(world, save, id) { const lv = byId(world, id), r = save.levels[id]; if (!lv || !r || r.leftAt === null || lv.away !== "live") return 0; return Math.max(0, +(save.clock - r.leftAt).toFixed(3)); }
  // enter a level: says what to build. The game makes the level from { level, seed }, applies changes, then plays `away` seconds forward
  function enter(world, save, id, o) { if (!byId(world, id)) throw new Error("No level " + id); if (!(o && o.anyway) && !canGo(world, save, id)) throw new Error("No way from " + save.at + " to " + id);
    const r = rec(save, id), away = awayFor(world, save, id); r.visits++; r.leftAt = null; r.catchUp = away; save.at = id; if (!save.lasting.seen.includes(id)) save.lasting.seen.push(id);
    return { id, level: byId(world, id).level, seed: seedOf(world, id), changes: clone(r.changes), state: clone(r.state), away, first: r.visits === 1 }; }
  // the page was loaded again while you were in a level: the same descriptor, and nothing counted twice
  function resume(world, save) { const id = save.at, lv = byId(world, id), r = save.levels[id]; if (!lv || !r) throw new Error("Nothing to resume"); return { id, level: lv.level, seed: seedOf(world, id), changes: clone(r.changes), state: clone(r.state), away: r.catchUp || 0, first: r.visits === 1 }; }
  // the page has played the time away forward: a reload will not play it again
  function settle(save) { const r = save.at !== null && save.levels[save.at]; if (r) r.catchUp = 0; }
  // leave it: keep only what differs. `made` is the level as its file and seed make it, `now` as it stands
  function leave(world, save, o) { const id = save.at; if (id === null) return null; const r = rec(save, id); o = o || {};
    if (o.made && o.now) r.changes = diff(o.made, o.now); else if (o.changes) r.changes = clone(o.changes); if (o.state) r.state = clone(o.state); r.leftAt = save.clock; save.at = null; return r; }
  // walk through a link: leave where you stand (keeping what differs) and enter the next. Refused before anything is changed
  function go(world, save, to, o) { if (!canGo(world, save, to)) throw new Error("No way from " + save.at + " to " + to); if (save.at !== null) { const from = save.at; leave(world, save, o); save.at = from; } return enter(world, save, to); }
  // the level select: go to a level the run has already been to (or the start), links or not. Leaves where you stand, keeping what differs
  function jump(world, save, to, o) { if (!byId(world, to)) throw new Error("No level " + to); if (to !== world.start && !save.lasting.seen.includes(to)) throw new Error(to + " has not been reached yet");
    const from = save.at; if (from !== null) leave(world, save, o); return enter(world, save, to, { anyway: true }); }
  // what a level's clearing is called: set by the field when its goal is met (a link can need it: needs: "cleared-<id>")
  const clearedFlag = (id) => "cleared-" + id;
  // a level's exits against the world's links: an exit to nowhere is an error; an exit with no link, or a link with no exit, is a warning
  function checkExits(world, id, level) { const errors = [], warnings = [], ex = (level.entities || []).filter((e) => e.type === "exit"), to = new Set(exits(world, id).map((k) => k.to));
    for (const e of ex) { if (!byId(world, e.to)) errors.push({ message: "This exit leads to " + e.to + ", which the world does not have.", id: e.id }); else if (!to.has(e.to)) warnings.push({ message: "No link from " + id + " to " + e.to + ": this exit will stay shut.", id: e.id }); }
    for (const t of to) if (!ex.some((e) => e.to === t)) warnings.push({ message: "The world links " + id + " to " + t + " but the level has no exit to it.", id: null });
    return { errors, warnings }; }
  function setFlag(save, key, o) { (o && o.lasting ? save.lasting : save.run).flags[key] = true; }
  // the Maw dies: the run ends, what lasts is added to, and the levels keep or lose their changes by the rule
  function die(world, save, o) { o = o || {}; const rule = DEATH.includes(o.onDeath) ? o.onDeath : save.rules.onDeath, run = save.run, L = save.lasting;
    L.runs++; const depth = L.seen.length; if (!(L.best.levels >= depth)) L.best.levels = depth; const secs = +(save.clock - run.startedAt).toFixed(3); if (!(L.best.secs >= secs)) L.best.secs = secs;
    for (const k of o.unlocked || []) if (!L.unlocked.includes(k)) L.unlocked.push(k);
    if (rule === "reset") save.levels = {}; else for (const id in save.levels) if (save.levels[id].leftAt === null) save.levels[id].leftAt = save.clock;
    save.at = null; save.run = newRun(run.n + 1, save.clock); return { rule, run: run.n, secs }; }

  // what differs between two levels, as ForgeLevel commands that turn the first into the second (entities, by id)
  function diff(made, now) { const a = new Map(made.entities.map((e) => [e.id, e])), b = new Map(now.entities.map((e) => [e.id, e])), out = [];
    for (const [id] of a) if (!b.has(id)) out.push({ op: "remove", id });
    for (const [id, e] of b) { const was = a.get(id); if (!was) { out.push({ op: "add", entity: clone(e) }); continue; } const props = {}; let n = 0;
      for (const k of new Set([...Object.keys(was), ...Object.keys(e)])) { if (k === "id" || k === "type") continue; if (JSON.stringify(was[k]) !== JSON.stringify(e[k])) { props[k] = e[k] === undefined ? null : clone(e[k]); n++; } }
      if (n) out.push({ op: "set", id, props }); }
    return out; }
  // the level a save's record makes: the made level with its changes applied. A change that no longer fits (the file moved on) is skipped and counted
  function levelFor(made, changes) { const L = root.ForgeLevel || (typeof require === "function" ? require("../level/level.js") : null); if (!L) throw new Error("ForgeWorld.levelFor needs ForgeLevel");
    const d = L.doc(clone(made)); let skipped = 0; for (const c of changes || []) { let ok = false; try { ok = L.apply(d, clone(c)) !== false; } catch (e) { ok = false; } if (!ok) skipped++; } return { level: d.level, skipped }; }

  function validateSave(save, world) { const errors = [], err = (m) => errors.push({ message: m });
    if (!isObj(save) || save.format !== SAVE) { err("Not a save file."); return { errors }; }
    if (save.version > VERSION) err("Made by a newer build (version " + save.version + ").");
    if (!isObj(save.levels) || !isObj(save.run) || !isObj(save.lasting) || !isObj(save.rules)) { err("A save has levels, run, lasting and rules."); return { errors }; }
    if (!DEATH.includes(save.rules.onDeath)) err("rules.onDeath is 'keep' or 'reset'.");
    if (!(save.clock >= 0)) err("The clock cannot be before zero.");
    if (world) { if (save.world.seed !== (world.seed >>> 0)) err("This save is of another world (seed " + save.world.seed + ")."); if (save.at !== null && !byId(world, save.at)) err("The save stands in a level the world does not have: " + save.at + ".");
      for (const id in save.levels) if (!byId(world, id)) err("The save remembers a level the world does not have: " + id + "."); }
    for (const id in save.levels) { const r = save.levels[id]; if (!Array.isArray(r.changes) || !isObj(r.state)) err("The record of " + id + " is damaged."); else if (r.leftAt !== null && r.leftAt > save.clock) err(id + " was left after now."); }
    return { errors }; }
  const order = (o) => Array.isArray(o) ? o.map(order) : isObj(o) ? Object.keys(o).sort().reduce((a, k) => { a[k] = order(o[k]); return a; }, {}) : o;
  function stringify(x) { if (x && x.format === WORLD) { const w = clone(x); return JSON.stringify({ format: w.format, version: w.version, name: w.name, seed: w.seed, start: w.start, levels: w.levels, links: w.links }, null, 2) + "\n"; }
    const s = clone(x); return JSON.stringify({ format: s.format, version: s.version, world: s.world, clock: s.clock, at: s.at, rules: s.rules, levels: order(s.levels), run: order(s.run), lasting: order(s.lasting) }, null, 2) + "\n"; }
  function parse(text) { let o; try { o = typeof text === "string" ? JSON.parse(text) : clone(text); } catch (e) { throw new Error("Not JSON: " + e.message); }
    if (!isObj(o) || (o.format !== WORLD && o.format !== SAVE)) throw new Error("Not a world or a save."); if (o.version > VERSION) throw new Error("Made by a newer build (version " + o.version + ")."); return o; }

  const api = { WORLD, SAVE, VERSION, AWAY, DEATH, create, addLevel, link, byId, exits, reach, seedOf, validateWorld, newSave, tick, canGo, awayFor, enter, resume, settle, leave, go, jump, clearedFlag, checkExits, setFlag, flagsOf, die, diff, levelFor, validateSave, stringify, parse };
  root.ForgeWorld = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
