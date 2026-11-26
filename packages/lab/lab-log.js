/* ForgeLog: one event log for every page that runs the simulation (the field, the tank), so runs can be read, charted and compared the same way.
   Classic script: puts ForgeLog on window (and module.exports under node).

   A log:  { format: 'forge-log', version: 1, page: 'field' | 'tank', level, seed, secs, events: [ { t, type, ...fields } ], dropped }
   t is seconds of simulation time, never wall time, so a log is the same on a slow machine and a fast one.

   Shared types (a page may add its own; these mean the same everywhere):
     meal       { pred, prey }            something ate something (names, not ids). pred 'Maw' is the player
     death      { who, cause, by }        an encounter or creature died: cause 'killed' | 'eaten' | 'other'
     maw_hit    { by }                    the Maw was struck
     maw_death  { by }                    the Maw was eaten or killed
     catch      { who }                   the Maw caught something in its jaws
     grow       { kind, from }            the Maw grew a part (kind: reach, bulk, wide, eyes, an ability) from a donor
     level      { lv }                    the Maw can mutate again
     end        { why }                   the run ended: 'time', 'cleared', 'lost' ...
   digest(log) hashes the events alone (FNV-1a over their JSON), so two runs of one level and seed agree exactly or they do not. */
(function (root) {
  "use strict";
  const FORMAT = "forge-log", VERSION = 1, CAP = 100000;
  function create(o) { o = o || {}; return { format: FORMAT, version: VERSION, page: o.page || "unknown", level: o.level || null, seed: o.seed >>> 0, secs: 0, events: [], dropped: 0 }; }
  function ev(log, t, type, o) { if (log.events.length >= CAP) { log.dropped++; return null; } const e = Object.assign({ t: +(+t).toFixed(2), type }, o || {}); log.events.push(e); if (e.t > log.secs) log.secs = e.t; return e; }
  function digestOf(events) { const text = JSON.stringify(events); let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, "0"); }
  const digest = (log) => digestOf(log.events);
  // counts by type, and per minute of simulation time
  function summary(log, secs) { const by = {}; for (const e of log.events) by[e.type] = (by[e.type] || 0) + 1; const s = secs || log.secs || 0, m = Math.max(1e-9, s / 60), per = {};
    for (const k in by) per[k] = +(by[k] / m).toFixed(2); const mawMeals = log.events.filter((e) => e.type === "meal" && e.pred === "Maw").length;
    return { page: log.page, level: log.level, seed: log.seed, secs: +(+s).toFixed(2), events: log.events.length, dropped: log.dropped, digest: digest(log), byType: by, perMin: per, mawMeals, mawMealsPerMin: +(mawMeals / m).toFixed(2) }; }
  // one event a line: easy to append, stream and read back
  const toJSONL = (log) => JSON.stringify({ format: log.format, version: log.version, page: log.page, level: log.level, seed: log.seed, secs: log.secs, dropped: log.dropped }) + "\n" + log.events.map((e) => JSON.stringify(e)).join("\n") + (log.events.length ? "\n" : "");
  function fromJSONL(text) { const lines = String(text).split("\n").filter((l) => l.trim()); if (!lines.length) throw new Error("empty log"); const head = JSON.parse(lines[0]);
    if (head.format !== FORMAT) throw new Error("not a forge-log"); if (head.version > VERSION) throw new Error("made by a newer build (version " + head.version + ")");
    return Object.assign(create(head), { secs: head.secs || 0, dropped: head.dropped || 0, events: lines.slice(1).map((l) => JSON.parse(l)) }); }
  // a table for a spreadsheet: t, type, then every field any event has, in first-seen order
  function toCSV(log) { const cols = ["t", "type"]; for (const e of log.events) for (const k in e) if (!cols.includes(k)) cols.push(k);
    const cell = (v) => v == null ? "" : typeof v === "object" ? JSON.stringify(v).replace(/"/g, '""').replace(/^|$/g, '"') : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
    return cols.join(",") + "\n" + log.events.map((e) => cols.map((k) => cell(e[k])).join(",")).join("\n") + "\n"; }
  const api = { FORMAT, VERSION, CAP, create, ev, digest, digestOf, summary, toJSONL, fromJSONL, toCSV };
  root.ForgeLog = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
