/* shared/creature-catalog.js — readable names for the parts kit.
 *
 * shared/creature-parts.json keeps its ids (P001…, "sheet-koi"); shared/creature-catalog.json (built by
 * shared/creature-catalog/build.py) gives each sheet a clean name, a family and features, and each part a
 * name ("Koi segment 03"), a feature and, for drawings that render nothing or repeat another, a hidden flag.
 *
 *   await CreatureCatalog.load("../../shared/creature-catalog.json");
 *   CreatureCatalog.sheetName("sheet-koi")      // "Koi"
 *   CreatureCatalog.familyOf("sheet-koi")       // { id: "fish", name: "Fish and puffers", hue: "trk-1", … }
 *   CreatureCatalog.partName("P213")            // "Koi segment 03"
 *   CreatureCatalog.hidden("P037")              // "empty" | "repeat" | null
 *
 * Before load() resolves (or if it fails) every function falls back to a name made from the id, so a page
 * never shows nothing.
 */
(function () {
  let cat = null;
  const fromId = (id) => String(id || "").replace(/^sheet-/, "").replace(/-mk-ii$/, " II").replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  const CreatureCatalog = {
    async load(url) {
      if (cat) return cat;
      try { cat = await (await fetch(url || "../../shared/creature-catalog.json")).json(); } catch (e) { cat = { families: [], sheets: {}, parts: {} }; }
      return cat;
    },
    get ready() { return !!cat; },
    families() { return cat ? cat.families : []; },
    sheet(id) { return (cat && cat.sheets[id]) || null; },
    sheetName(id) { const s = this.sheet(id); return s ? s.name : fromId(id); },
    familyOf(id) { const s = this.sheet(id); return s && cat ? cat.families.find((f) => f.id === s.family) || null : null; },
    /** sheet ids in catalogue order (family, then sheet), any unknown ids last */
    orderSheets(ids) {
      const o = (id) => { const s = this.sheet(id); return s ? s.order : 1e6; };
      return [...ids].sort((a, b) => o(a) - o(b) || String(a).localeCompare(String(b)));
    },
    part(pid) { return (cat && cat.parts[pid]) || null; },
    partName(pid) { const p = this.part(pid); return p ? p.name : pid; },
    feature(pid) { const p = this.part(pid); return p ? p.feature : null; },
    hidden(pid) { const p = this.part(pid); return p && p.hidden ? p.hidden : null; },
    sameAs(pid) { const p = this.part(pid); return p && p.same ? p.same : null; },
    heroOf(id) { const s = this.sheet(id); return s ? s.hero : null; },
    /** words a search box should match a part on */
    searchText(part) {
      const p = this.part(part.id) || {}, s = this.sheet(part.species) || {}, f = this.familyOf(part.species) || {};
      return [part.id, part.species, p.name, p.feature, s.name, f.name, ...(s.features || [])].filter(Boolean).join(" ").toLowerCase();
    },
  };
  /**
   * Draw a list of sheets grouped by family into `host`, Forge Console style (f-row with a thumbnail).
   *   ids       sheet ids to show
   *   opts.selected  the picked sheet id
   *   opts.onPick(id)
   *   opts.meta(id)  text for the right-hand value (a count, "3/19")
   *   opts.thumb(id) an SVG string for the sheet's thumbnail (e.g. its hero part drawn by the page)
   */
  CreatureCatalog.renderSheetList = function (host, ids, opts) {
    opts = opts || {};
    host.innerHTML = "";
    const groups = new Map();
    for (const id of this.orderSheets(ids)) {
      const f = this.familyOf(id) || { id: "other", name: "Other", hue: "line-4" };
      if (!groups.has(f.id)) groups.set(f.id, { f, ids: [] });
      groups.get(f.id).ids.push(id);
    }
    for (const { f, ids: list } of groups.values()) {
      const head = document.createElement("div");
      head.className = "f-catfam";
      head.style.setProperty("--c", `var(--${f.hue})`);
      head.textContent = f.name;
      if (f.blurb) head.title = f.blurb;
      host.appendChild(head);
      for (const id of list) {
        const row = document.createElement("div");
        row.className = "f-row f-catsheet" + (id === opts.selected ? " is-sel" : "");
        row.tabIndex = 0;
        row.dataset.sheet = id;
        const th = document.createElement("span"); th.className = "f-thumb"; th.innerHTML = opts.thumb ? opts.thumb(id) || "" : "";
        const nm = document.createElement("span"); nm.className = "f-name"; nm.textContent = this.sheetName(id);
        const v = document.createElement("span"); v.className = "f-row__v"; v.textContent = opts.meta ? opts.meta(id) : "";
        row.append(th, nm, v);
        const s = this.sheet(id); if (s && s.features) row.title = s.features.join(" · ");
        const pick = () => opts.onPick && opts.onPick(id);
        row.addEventListener("click", pick);
        row.addEventListener("keydown", (e) => { if (e.key === "Enter") pick(); });
        host.appendChild(row);
      }
    }
    // keep the picked sheet in view inside its scrolling column
    const sel = host.querySelector(".is-sel"), col = host.closest(".col") || host.parentElement;
    if (sel && col && col.scrollHeight > col.clientHeight) {
      const top = sel.getBoundingClientRect().top - col.getBoundingClientRect().top + col.scrollTop;
      if (top < col.scrollTop || top > col.scrollTop + col.clientHeight - 40) col.scrollTop = Math.max(0, top - col.clientHeight / 2);
    }
  };

  window.CreatureCatalog = CreatureCatalog;
})();
