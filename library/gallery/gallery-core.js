/* library/gallery/gallery-core.js — the Sci-fi Gallery's data and drawing, shared by index.html, bench.html and view.html.
   Forge's approach applied to the component library:
     parts   = the components in library/components/catalog.js (the kit; ids never change)
     design  = parts placed on a grid frame, saved with a name, a version and where it came from
     compose = a seeded generator that lays parts out on the frame; Reroll keeps the rules, draws a new seed
   Starter designs live in library/gallery/designs.js (window.SCIFI_DESIGNS) and are read-only; yours live in this
   browser's localStorage. Editing a starter saves a copy that points back at it.
   Classic script, so the pages work from file:// too. Load after library/components/catalog.js, designs.js and shared/engine/rng.js. */
(function () {
  "use strict";
  const CAT = window.LIBRARY_CATALOG;
  const STARTERS = (window.SCIFI_DESIGNS || []).map((d) => Object.assign({ starter: true }, d));
  const KEY = "scifi-gallery:designs";
  const ROOT = "../../"; // gallery pages sit one folder below the repo root
  const parts = new Map(CAT.components.map((c) => [c.id, c]));
  const things = new Map([...CAT.studies, ...CAT.components, ...CAT.tools].map((x) => [x.id, x]));
  const HUE = { physics: "var(--trk-1)", motion: "var(--trk-3)", interaction: "var(--trk-5)", layout: "var(--trk-7)", generative: "var(--trk-9)", rigged: "var(--trk-10)" };
  const listeners = new Set();

  // ── storage ──────────────────────────────────────────────────────────
  function mine() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function writeMine(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* private window: designs last until reload */ }
    listeners.forEach((f) => f());
  }
  window.addEventListener("storage", (e) => { if (e.key === KEY) listeners.forEach((f) => f()); });
  function all() { return [...mine().sort((a, b) => b.updatedAt - a.updatedAt), ...STARTERS]; }
  function get(id) { return all().find((d) => d.id === id) || null; }
  function newId() { return "d-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function save(d) {
    const list = mine();
    const i = list.findIndex((x) => x.id === d.id);
    const out = Object.assign({}, d, { starter: undefined, updatedAt: Date.now(), version: (i >= 0 ? (list[i].version || 1) + 1 : d.version || 1) });
    delete out.starter;
    if (i >= 0) list[i] = out; else list.push(out);
    writeMine(list);
    return out;
  }
  function remove(id) { writeMine(mine().filter((d) => d.id !== id)); }
  function copyOf(d, note) {
    return Object.assign(clone(d), { id: newId(), name: d.name + (note === "duplicate" ? " copy" : ""), version: 1, starter: undefined,
      from: [{ kind: "design", id: d.id, note: note || "edited from" }] });
  }
  function blank() { return { id: newId(), name: "Untitled design", about: "", cols: 16, rows: 10, gap: 6, labels: true, slots: [], version: 1 }; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function onChange(f) { listeners.add(f); return () => listeners.delete(f); }

  // ── reading designs ──────────────────────────────────────────────────
  const part = (id) => parts.get(id) || null;
  const thumb = (id) => "thumbs/" + id + ".jpg";
  const fileOf = (id) => { const p = part(id); return p ? ROOT + p.file : "about:blank"; };
  const missing = (d) => d.slots.filter((s) => !part(s.part));
  function partIds(d) { return [...new Set(d.slots.map((s) => s.part))]; }
  function usedIn(partId) { return all().filter((d) => d.slots.some((s) => s.part === partId)); }
  // "from study 04 Compass Studies · panel II", "rev B of Cyberpunk Dial", "made in Wing Rig"
  function lineage(c) {
    return (c.from || []).map((f) => {
      const t = things.get(f.id); if (!t) return null;
      const name = f.kind === "study" ? `study ${String(t.n).padStart(2, "0")} ${t.name}${f.panel ? " · panel " + f.panel : ""}` : t.name;
      return (f.note || (f.kind === "tool" ? "made in" : "from")) + " " + name;
    }).filter(Boolean);
  }
  // the studies behind a design, through its parts
  function studiesBehind(d) {
    const out = new Map();
    for (const id of partIds(d)) {
      const walk = (c, seen) => {
        for (const f of (c && c.from) || []) {
          if (f.kind === "study") out.set(f.id, things.get(f.id));
          else if (f.kind === "component" && !seen.has(f.id)) { seen.add(f.id); walk(part(f.id), seen); }
        }
      };
      walk(part(id), new Set());
    }
    return [...out.values()].filter(Boolean).sort((a, b) => a.n - b.n);
  }
  function designFrom(d) { return (d.from || []).map((f) => ({ note: f.note, design: get(f.id), id: f.id })); }
  const slotLabel = (d, s, i) => (s.label || (part(s.part) || { name: s.part }).name);
  const slotCode = (i) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : "");

  // ── drawing ──────────────────────────────────────────────────────────
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function place(node, d, s) {
    node.style.left = (s.x / d.cols * 100) + "%"; node.style.top = (s.y / d.rows * 100) + "%";
    node.style.width = (s.w / d.cols * 100) + "%"; node.style.height = (s.h / d.rows * 100) + "%";
  }
  // a still picture of a design, from the parts' thumbnails: cheap enough for lists
  function composite(d, opts) {
    opts = opts || {};
    const box = el("div", "sg-comp" + (opts.cls ? " " + opts.cls : ""));
    box.style.aspectRatio = d.cols + " / " + d.rows;
    box.style.setProperty("--gap", Math.max(1, (d.gap ?? 6) / 4) + "px");
    d.slots.forEach((s) => {
      const c = el("div", "sg-comp__slot" + (part(s.part) ? "" : " is-missing"));
      place(c, d, s);
      if (part(s.part)) c.style.backgroundImage = `url("${thumb(s.part)}")`;
      box.appendChild(c);
    });
    if (!d.slots.length) box.appendChild(el("span", "sg-comp__empty", "Empty frame"));
    return box;
  }
  // the design running: every slot is the live component in an iframe, scaled to fit.
  // zoom: how much of the component's own page shows. null = auto (the part renders at least `minView` px wide).
  function live(host, d, opts) {
    opts = opts || {};
    host.classList.add("sg-live");
    host.style.setProperty("--gap", (d.gap ?? 6) + "px");
    if (!opts.keep) host.innerHTML = "";
    const nodes = d.slots.map((s, i) => {
      const n = el("div", "sg-slot"); n.dataset.slot = s.id; place(n, d, s);
      const f = el("iframe"); f.title = slotLabel(d, s, i); f.setAttribute("loading", "lazy");
      f.src = fileOf(s.part);
      n.appendChild(f);
      if (d.labels !== false) { const l = el("div", "sg-slot__label"); l.append(el("b", "", slotCode(i)), el("span", "", slotLabel(d, s, i))); n.appendChild(l); }
      if (!part(s.part)) n.appendChild(el("div", "sg-slot__missing", "Missing part · " + s.part));
      host.appendChild(n);
      return { n, f, s };
    });
    const fit = () => nodes.forEach(({ n, f, s }) => {
      const g = d.gap ?? 6, w = n.clientWidth - g, h = n.clientHeight - g; if (w <= 0 || h <= 0) return;
      const z = s.zoom || Math.min(1, w / (opts.minView || 880));
      f.style.width = (w / z) + "px"; f.style.height = (h / z) + "px"; f.style.transform = `scale(${z})`;
      n.dataset.zoom = z.toFixed(2);
    });
    fit();
    if (host._sgRO) host._sgRO.disconnect();
    host._sgRO = new ResizeObserver(fit); host._sgRO.observe(host);
    return { nodes, fit };
  }

  // ── compose: the generator ───────────────────────────────────────────
  // Splits the frame into rectangles (binary space partition, snapped to the grid) and deals parts into them.
  // rules: { layout: "mosaic"|"hero"|"strips"|"columns", count, mix: [categories], seed }
  const LAYOUTS = {
    mosaic: "Split the frame anywhere",
    hero: "One large part, the rest around it",
    strips: "Thin bands top and bottom, a split middle",
    columns: "Full-height columns",
  };
  function compose(rules, base) {
    const R = window.RNG.create(String(rules.seed), "compose");
    const d = base ? clone(base) : blank();
    const cols = d.cols, rows = d.rows, count = Math.max(1, rules.count || 5);
    const rand = (a, b) => a + R() * (b - a);
    const minC = 3, minR = 2;
    let rects = [];
    if (rules.layout === "hero") {
      const w = Math.round(cols * rand(0.5, 0.66)), left = R() < 0.5;
      rects.push({ x: left ? 0 : cols - w, y: 0, w, h: rows, hero: true });
      rects.push({ x: left ? w : 0, y: 0, w: cols - w, h: rows });
    } else if (rules.layout === "strips") {
      const top = R() < 0.6 ? 2 : 0, bot = 2;
      if (top) rects.push({ x: 0, y: 0, w: cols, h: top, fixed: true });
      rects.push({ x: 0, y: top, w: cols, h: rows - top - bot });
      rects.push({ x: 0, y: rows - bot, w: cols, h: bot, fixed: true });
    } else if (rules.layout === "columns") {
      const n = Math.min(count, Math.floor(cols / minC)); let x = 0;
      for (let i = 0; i < n; i++) { const w = i === n - 1 ? cols - x : Math.max(minC, Math.round((cols - x) / (n - i) * rand(0.75, 1.25))); rects.push({ x, y: 0, w, h: rows }); x += w; }
    } else rects.push({ x: 0, y: 0, w: cols, h: rows });
    // split the biggest splittable rectangle until there are enough
    let guard = 0;
    while (rects.length < count && guard++ < 200) {
      const cand = rects.filter((r) => !r.fixed && !r.hero && (r.w >= minC * 2 || r.h >= minR * 2)).sort((a, b) => b.w * b.h - a.w * a.h);
      if (!cand.length) { rects.forEach((r) => { r.hero = false; }); if (guard > 2 && !rects.some((r) => !r.fixed && (r.w >= minC * 2 || r.h >= minR * 2))) break; continue; }
      const r = cand[Math.floor(R() * Math.min(2, cand.length))];
      const vertical = r.w / cols >= r.h / rows ? r.w >= minC * 2 : r.h < minR * 2;
      rects.splice(rects.indexOf(r), 1);
      if (vertical) { const a = clamp(Math.round(r.w * rand(0.36, 0.64)), minC, r.w - minC); rects.push({ x: r.x, y: r.y, w: a, h: r.h }, { x: r.x + a, y: r.y, w: r.w - a, h: r.h }); }
      else { const a = clamp(Math.round(r.h * rand(0.36, 0.64)), minR, r.h - minR); rects.push({ x: r.x, y: r.y, w: r.w, h: a }, { x: r.x, y: r.y + a, w: r.w, h: r.h - a }); }
    }
    // deal parts: biggest rectangle first, no part twice while the pool lasts
    const pool = CAT.components.filter((c) => !rules.mix || !rules.mix.length || rules.mix.includes(c.category)).map((c) => c.id);
    const deck = shuffle(pool.slice(), R);
    rects.sort((a, b) => b.w * b.h - a.w * a.h);
    d.slots = rects.map((r, i) => ({ id: "s" + (i + 1), part: deck.length ? deck[i % deck.length] : CAT.components[0].id, x: r.x, y: r.y, w: r.w, h: r.h, zoom: null }));
    d.slots.sort((a, b) => a.y - b.y || a.x - b.x);
    d.compose = { layout: rules.layout, count, mix: rules.mix || [], seed: rules.seed };
    return d;
  }
  function shuffle(a, R) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function newSeed() { return String(Math.floor(Math.random() * 1e6)).padStart(6, "0"); }

  // ── moving designs in and out ────────────────────────────────────────
  function exportJSON(list) {
    const data = JSON.stringify(list.map((d) => { const o = clone(d); delete o.starter; return o; }), null, 2);
    const a = el("a"); a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    a.download = (list.length === 1 ? slug(list[0].name) : "scifi-designs") + ".json"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function importJSON(file) {
    return file.text().then((t) => {
      const got = [].concat(JSON.parse(t)).filter((d) => d && Array.isArray(d.slots));
      const list = mine();
      for (const d of got) { if (all().some((x) => x.id === d.id)) d.id = newId(); d.updatedAt = Date.now(); list.push(d); }
      writeMine(list);
      return got.length;
    });
  }
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "design";
  function ago(t) {
    if (!t) return "";
    const s = (Date.now() - t) / 1000;
    return s < 60 ? "just now" : s < 3600 ? Math.round(s / 60) + " min ago" : s < 86400 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " d ago";
  }
  const pad = (n, k) => String(n).padStart(k || 2, "0");

  window.SciFiGallery = {
    CAT, HUE, LAYOUTS, ROOT, all, get, mine, save, remove, copyOf, blank, clone, onChange,
    part, thumb, fileOf, missing, partIds, usedIn, lineage, studiesBehind, designFrom, slotLabel, slotCode,
    el, composite, live, compose, newSeed, exportJSON, importJSON, ago, pad,
  };
})();
