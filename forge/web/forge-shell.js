/*
 * Forge — shared shell chrome: the left stage rail and the persistent bottom
 * Shelf, present on every screen per the "e2e" page boards (E0-E9.dc.html) of
 * the Forge UI Explorations Artifact canvas. Five stages, all wired: Kit and
 * Bench are bespoke Forge screens; Species/City/Ecology hand off to their
 * real standalone tools. Also exposes mountWorkspace(), the persistent-shell
 * mode (workspace.html) that swaps an iframe's content per stage instead of
 * navigating the page away. Depends on forge-world.js being loaded first
 * (window.ForgeWorld) and shared/tokens.css's data-theme="forge" block.
 */
(function () {
  "use strict";
  const SHELL_SRC = document.currentScript ? document.currentScript.src : location.href;

  // Tower/Seal/Alphabet now share one real engine (shared/generators/) instead
  // of being separate hand-off destinations — Bench is a bespoke Forge screen
  // with a Blender-modifier-style preset switcher, replacing what used to be
  // three separate rail stages (Buildings/Script/Seals) pointing at Spire
  // Forge and Sigil Forge. Those two tools are untouched and still work
  // standalone; Bench is a fresh extraction of their generation logic, not a
  // refactor of them (see shared/generators/kit-utils.js's header for why).
  // Species/City/Ecology stay hand-offs to their real tools, unchanged.
  // `owned: true` = a bespoke Forge screen that takes a `?world=` param and
  // reads/writes the same world file; `owned: false` = someone else's
  // standalone tool, loaded exactly as-is (no world param, no assumptions
  // about its internals) — mountWorkspace() below uses this to know which
  // stages to thread the active world id into.
  const STAGES = [
    { id: "kit", label: "Kit", href: "./kit.html", glyph: "K", owned: true },
    { id: "species", label: "Species", href: "./species.html", glyph: "S", owned: true },
    { id: "bench", label: "Bench", href: "./bench.html", glyph: "B", owned: true },
    { id: "city", label: "City", href: "./city.html", glyph: "C", owned: true },
    { id: "ecology", label: "Ecology", href: "./ecology.html", glyph: "E", owned: true },
  ];

  const STYLE_ID = "forge-shell-styles";

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      body.forge-shell-mounted { padding-left: 84px; padding-bottom: 52px; }
      .forge-rail {
        position: fixed; left: 0; top: 0; bottom: 0; width: 84px; z-index: 30;
        background: var(--bar); border-right: 1px solid var(--line-3);
        display: flex; flex-direction: column; align-items: stretch; padding: 14px 0; gap: 4px;
      }
      a.forge-rail-brand, .forge-rail a.brand { text-decoration: none; }
      .forge-rail .brand {
        font-family: var(--font-display); font-size: 20px; color: var(--ink);
        text-align: center; padding: 4px 0 14px; border-bottom: 1px solid var(--line-3); margin-bottom: 8px;
      }
      .forge-stage {
        display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 4px;
        border: none; border-left: 2px solid transparent; color: var(--ink-off); text-decoration: none;
        cursor: default; background: none; font: inherit; width: 100%;
      }
      .forge-stage .num {
        width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--line-4);
        display: flex; align-items: center; justify-content: center;
        font-family: var(--font-ui); font-size: 11px; color: var(--ink-2);
      }
      .forge-stage .lab { font-family: var(--font-display); font-size: 15px; letter-spacing: 0; }
      .forge-stage.wired { color: var(--ink-2); cursor: pointer; }
      .forge-stage.wired .num { border-color: var(--line-4); color: var(--ink-2); }
      .forge-stage.wired:hover { color: var(--ink); }
      .forge-stage.active { border-left-color: var(--loop); background: #151a17; }
      .forge-stage.active .num { border-color: var(--loop); color: var(--loop); }
      .forge-stage.active .lab { color: var(--ink); }
      .forge-stage.soon .lab::after { content: " \\00b7"; }

      .forge-shelf {
        position: fixed; left: 84px; right: 0; bottom: 0; z-index: 30;
        background: var(--bar); border-top: 1px solid var(--line-3);
        font-family: var(--font-ui); color: var(--ink);
      }
      .forge-shelf-head {
        height: 52px; display: flex; align-items: center; gap: 14px; padding: 0 18px; cursor: pointer;
      }
      .forge-shelf-head .wordmark { font-family: var(--font-display); font-size: 19px; }
      .forge-shelf-card .dep { font-size: 8px; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-2); text-decoration: none; }
      .forge-shelf-card .dep.stale { color: var(--accent); }
      a.forge-shelf-btn { text-decoration: none; display: inline-block; }
      .forge-shelf-card .open { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
      .forge-shelf-card .open a { font-size: 8px; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-2); text-decoration: none; border: 1px solid var(--line-4); border-radius: 3px; padding: 2px 4px; }
      .forge-shelf-card .open a:hover { color: var(--ink); border-color: var(--ink-2); }
      .forge-shelf-btn { font-family: var(--font-body); font-size: 12px; padding: 5px 10px; border: 1px solid var(--line-3); border-radius: 6px; background: var(--panel); color: var(--ink-2); cursor: pointer; margin-right: 6px; }
      .forge-shelf-btn:hover { color: var(--ink); border-color: var(--ink-2); }
      .forge-sel { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 0 1 auto; overflow: hidden; padding-left: 14px; border-left: 1px solid var(--line-2); }
      .forge-sel .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--loop); flex: none; }
      .forge-sel .nm { font-family: var(--font-display); font-size: 17px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 240px; }
      .forge-sel .meta { font-family: var(--font-ui); font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-2); white-space: nowrap; }
      .forge-sel .meta.stale { color: var(--accent); }
      .forge-sel .acts { display: flex; gap: 4px; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
      .forge-sel .acts a { font-family: var(--font-body); font-size: 12px; white-space: nowrap; color: var(--ink-2); text-decoration: none; border: 1px solid var(--line-3); border-radius: 6px; padding: 4px 9px; background: var(--panel); }
      .forge-sel .acts a.edit { color: var(--loop); }
      .forge-sel .acts a:hover { color: var(--ink); border-color: var(--ink-2); }
      .forge-sel .clear { background: none; border: 0; color: var(--ink-off); cursor: pointer; font-size: 13px; padding: 0 4px; }
      .forge-sel.empty .nm { color: var(--ink-off); }
      .forge-shelf-card.sel { border-color: var(--loop); box-shadow: 0 0 0 1px var(--loop) inset; }
      .forge-shelf-head .count { font-family: var(--font-ui); font-size: 11px; letter-spacing: .1em; color: var(--ink-2); text-transform: uppercase; }
      .forge-shelf-head .spacer { flex: 1 1 auto; }
      .forge-shelf-head .toggle { font-family: var(--font-ui); font-size: 11px; letter-spacing: .1em; color: var(--ink-2); text-transform: uppercase; }
      .forge-shelf-body {
        display: none; max-height: 220px; overflow: auto; border-top: 1px solid var(--line-2);
        padding: 14px 18px; gap: 14px; flex-direction: column;
      }
      .forge-shelf.open .forge-shelf-body { display: flex; }
      .forge-shelf-filters { display: flex; gap: 8px; flex-wrap: wrap; }
      .forge-shelf-chip {
        font-size: 9px; letter-spacing: .1em; padding: 5px 10px; border-radius: 12px;
        border: 1px solid var(--line-4); color: var(--ink-2); text-transform: uppercase;
      }
      .forge-shelf-row { display: flex; gap: 10px; flex-wrap: wrap; }
      .forge-shelf-card {
        width: 110px; border: 1px solid var(--line-4); border-radius: var(--r-card); background: var(--lane);
        padding: 8px; display: flex; flex-direction: column; gap: 6px; cursor: grab;
      }
      .forge-shelf-card:hover { border-color: var(--loop); }
      .forge-shelf-card:active { cursor: grabbing; }
      .forge-shelf-card .art { height: 50px; border-radius: 6px; background: var(--well); display: flex; align-items: center; justify-content: center; font-size: 9px; color: var(--ink-off); overflow: hidden; }
      .forge-shelf-card .art svg { width: 100%; height: 100%; }
      .forge-shelf-card .name { font-family: var(--font-display); font-size: 14px; line-height: 17px; }
      .forge-shelf-card .tag { font-family: var(--font-ui); font-size: 9px; letter-spacing: .1em; color: var(--accent); text-transform: uppercase; }
      .forge-shelf-empty { font-size: 10px; letter-spacing: .04em; color: var(--ink-2); padding: 6px 0; }

      /* ── persistent workspace shell (mountWorkspace) ───────────────────── */
      html.forge-workspace, body.forge-workspace { height: 100%; margin: 0; overflow: hidden; }
      .forge-ws-topbar {
        position: fixed; top: 0; left: 78px; right: 0; height: 52px; z-index: 25;
        display: flex; align-items: center; gap: 14px; padding: 0 20px;
        background: var(--bar); border-bottom: 1px solid var(--line-3);
      }
      .forge-ws-topbar .wordmark { font-family: var(--font-display); font-size: 17px; color: var(--ink); text-decoration: none; }
      .forge-ws-topbar .world { font-family: var(--font-ui); font-size: 10px; letter-spacing: .1em; color: var(--ink-2); text-transform: uppercase; }
      .forge-ws-topbar .world b { color: var(--ink); font-weight: 500; }
      .forge-ws-topbar .stage { font-family: var(--font-ui); font-size: 10px; letter-spacing: .1em; color: var(--loop); text-transform: uppercase; }
      .forge-ws-topbar .spacer { flex: 1 1 auto; }
      .forge-ws-topbar .switch { font-family: var(--font-ui); font-size: 9px; letter-spacing: .1em; color: var(--ink-2); text-decoration: none; text-transform: uppercase; border: 1px solid var(--line-4); border-radius: var(--r-sm); padding: 6px 10px; }
      .forge-ws-topbar .switch:hover { border-color: var(--ink-2); color: var(--ink); }
      .forge-ws-frame {
        position: fixed; left: 78px; right: 0; top: 52px; bottom: 46px; z-index: 1;
        border: none; width: calc(100% - 78px); height: calc(100% - 98px); background: var(--ground);
      }
      body.forge-workspace.shelf-open .forge-ws-frame { bottom: 266px; height: calc(100% - 318px); }
    `;
    document.head.appendChild(style);
  }

  // `onSelect`, if given, turns each stage into a button that calls
  // onSelect(stage) instead of a real `<a href>` — used by mountWorkspace()
  // so switching stages swaps the iframe's src instead of navigating the
  // whole shell away (what the user actually asked for: Blender-style
  // persistence, where picking a different workspace doesn't reload the app).
  function renderRail(active, onSelect) {
    const rail = document.createElement("div");
    rail.className = "forge-rail";
    const brand = document.createElement("a");
    brand.className = "brand"; brand.href = new URL("./index.html", SHELL_SRC).href; brand.title = "All worlds";
    brand.textContent = "Forge";
    rail.appendChild(brand);
    STAGES.forEach((stage, i) => {
      const el = document.createElement(onSelect ? "button" : (stage.href ? "a" : "div"));
      el.className = "forge-stage" + (stage.href ? " wired" : " soon") + (stage.id === active ? " active" : "");
      el.dataset.stage = stage.id;
      if (onSelect) {
        el.type = "button";
        el.addEventListener("click", () => onSelect(stage));
      } else if (stage.href) {
        el.href = stage.href;
      }
      el.title = stage.href ? stage.label : stage.label + " — not built yet";
      el.innerHTML = `<span class="num">${i + 1}</span><span class="lab">${stage.label}</span>`;
      rail.appendChild(el);
    });
    // utilities under the stages: what uses what
    const spacer = document.createElement("div"); spacer.style.flex = "1 1 auto"; rail.appendChild(spacer);
    const lin = document.createElement("a");
    lin.className = "forge-stage wired" + (active === "lineage" ? " active" : ""); lin.dataset.stage = "lineage";
    lin.href = new URL("./lineage.html", SHELL_SRC).href; lin.title = "Lineage: what uses what";
    lin.innerHTML = `<span class="num" aria-hidden="true">&#8645;</span><span class="lab">Lineage</span>`;
    rail.appendChild(lin);
    // stage links keep the selection's world
    const wid = window.ForgeWorld && window.ForgeWorld.getActiveWorldId();
    if (wid && !onSelect) rail.querySelectorAll("a.forge-stage").forEach((a) => { const u = new URL(a.href, location.href); u.searchParams.set("world", wid); a.href = u.href; });
    return rail;
  }

  // MIME type a drop target (forge/web/workbench.html's sockets) reads from
  // DataTransfer to identify a dragged Shelf item without a shared JS scope.
  const DRAG_MIME = "application/x-forge-object";

  function lineageUrl(id) { return new URL("./lineage.html" + (id ? "?object=" + encodeURIComponent(id) : ""), SHELL_SRC).href; }
  function renderShelfCard(obj, g) {
    const card = document.createElement("div");
    card.dataset.id = obj.id;
    const cur = window.ForgeWorld.getSelection && window.ForgeWorld.getSelection();
    if (cur && cur.id === obj.id) card.classList.add("sel");
    // a click (not a drag, not a link) picks the object everywhere
    card.addEventListener("click", (e) => { if (e.target.closest("a")) return; window.ForgeWorld.select(null, { id: obj.id, type: obj.type, from: "shelf" }); });
    card.className = "forge-shelf-card";
    card.draggable = true;
    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ id: obj.id, type: obj.type, name: obj.name, svg: obj.svg || null }));
      // A second, type-tagged MIME with no payload: dragover can only read
      // DataTransfer.types (not getData), so a drop target checks for this
      // to light up only for a type it accepts, before the drop actually happens.
      e.dataTransfer.setData(DRAG_MIME + "-type-" + (obj.type || "unknown"), "");
    });
    const art = document.createElement("div");
    art.className = "art";
    if (obj.svg) art.innerHTML = obj.svg;
    else art.textContent = (obj.type || "?").slice(0, 1).toUpperCase();
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = obj.name || obj.id;
    const tag = document.createElement("div");
    tag.className = "tag";
    tag.textContent = (obj.prefab ? "PREFAB · " : (obj.type || "").toUpperCase() + " · ") + "V" + obj.version;
    // lineage at a glance: what uses this, and whether it was built against something since changed
    if (g) {
      const used = g.usedBy(obj.id).length, stale = g.stale(obj);
      if (used || stale.length) {
        const dep = document.createElement("a");
        dep.className = "dep" + (stale.length ? " stale" : "");
        dep.href = lineageUrl(obj.id); dep.draggable = false;
        dep.textContent = stale.length ? `stale · ${stale.map((x) => x.name).join(", ")} changed` : `used by ${used}`;
        card._dep = dep;
      }
    }
    card.appendChild(art);
    card.appendChild(name);
    card.appendChild(tag);
    if (card._dep) card.appendChild(card._dep);
    // where this object can be edited (ForgeWorld.editorsFor): the full tool first, then Bench
    const eds = window.ForgeWorld && window.ForgeWorld.editorsFor ? window.ForgeWorld.editorsFor(obj) : [];
    if (eds.length) {
      const open = document.createElement("div");
      open.className = "open";
      eds.forEach((e) => { const a = document.createElement("a"); a.href = e.url; a.textContent = e.label; a.draggable = false; open.appendChild(a); });
      card.appendChild(open);
    }
    return card;
  }

  // The currently-mounted Shelf's own world (not worldPromise — the resolved
  // World instance) and DOM nodes, so refreshShelf() can re-populate in place
  // after a same-page save (Bench's "Save as prefab" doesn't reload the page,
  // so without this the Shelf would silently go stale until the next visit).
  let mountedShelf = null;

  async function populateShelf(world, head, body) {
    try {
      const all = await world.list();
      // "Saved" here means anything a generator has written into the world file —
      // not only objects with a `prefab` block (that's Save-as-Prefab, Phase 3,
      // not built yet). `type: "settings"` rows are the Phase-1 migration import,
      // not something a person saved, so those stay out of the Shelf.
      const saved = all.filter((o) => o.type !== "settings");
      head.querySelector(".count").textContent = saved.length + " saved";
      body.innerHTML = "";
      if (!saved.length) {
        body.innerHTML = `<div class="forge-shelf-empty">Nothing saved yet. Use a generator's "Save to world" action — Spire Forge is wired up first.</div>`;
      } else {
        const categories = Array.from(new Set(saved.map((p) => p.type)));
        const filters = document.createElement("div");
        filters.className = "forge-shelf-filters";
        filters.innerHTML = `<span class="forge-shelf-chip">All · ${saved.length}</span>` +
          categories.map((c) => `<span class="forge-shelf-chip">${c} · ${saved.filter((p) => p.type === c).length}</span>`).join("");
        const row = document.createElement("div");
        row.className = "forge-shelf-row";
        const g = window.ForgeWorld.graph ? window.ForgeWorld.graph(all) : null;
        saved.forEach((p) => row.appendChild(renderShelfCard(p, g)));
        body.appendChild(filters);
        body.appendChild(row);
      }
    } catch (e) {
      body.innerHTML = `<div class="forge-shelf-empty">Couldn't load the shelf: ${e.message || e}</div>`;
    }
  }

  // inline error text in the shelf head (no browser dialogs)
  function alertless(head, msg) {
    const c = head.querySelector(".count"), old = c.textContent;
    c.textContent = msg; c.style.color = "var(--rec)";
    setTimeout(() => { c.textContent = old; c.style.color = ""; }, 4000);
  }

  async function renderShelf(worldPromise, startOpen, onToggle) {
    const shelf = document.createElement("div");
    shelf.className = "forge-shelf" + (startOpen ? " open" : "");

    const head = document.createElement("div");
    head.className = "forge-shelf-head";
    head.innerHTML = `
      <span class="wordmark">SHELF</span>
      <span class="count">0 saved</span>
      <span class="forge-sel empty" role="status" aria-live="polite"><span class="nm">Nothing selected</span></span>
      <span class="spacer"></span>
      <button type="button" class="forge-shelf-btn" data-act="export" title="Download this world as one file">Export world</button>
      <button type="button" class="forge-shelf-btn" data-act="import" title="Open a world file as a new world">Import</button>
      <input type="file" accept=".json,application/json" hidden>
      <span class="toggle">${startOpen ? "Close shelf &#9662;" : "Open shelf &#9652;"}</span>
    `;
    const fileIn = head.querySelector("input[type=file]");
    head.querySelector('[data-act="export"]').addEventListener("click", async (e) => {
      e.stopPropagation();
      const w = await worldPromise, n = await window.ForgeWorld.downloadWorld(w.worldId);
      e.target.textContent = "Exported " + n; setTimeout(() => { e.target.textContent = "Export world"; }, 2500);
    });
    head.querySelector('[data-act="import"]').addEventListener("click", (e) => { e.stopPropagation(); fileIn.click(); });
    fileIn.addEventListener("click", (e) => e.stopPropagation());
    fileIn.addEventListener("change", async () => {
      const f = fileIn.files[0]; if (!f) return;
      try {
        const rec = await window.ForgeWorld.readWorldFile(f);
        window.ForgeWorld.setActiveWorldId(rec.id);
        const url = new URL(location.href); url.searchParams.set("world", rec.id); location.href = url.toString();
      } catch (err) { alertless(head, err.message || String(err)); }
      fileIn.value = "";
    });
    const body = document.createElement("div");
    body.className = "forge-shelf-body";
    body.innerHTML = `<div class="forge-shelf-empty">Loading…</div>`;

    head.addEventListener("click", () => {
      shelf.classList.toggle("open");
      const open = shelf.classList.contains("open");
      head.querySelector(".toggle").innerHTML = open ? "Close shelf &#9662;" : "Open shelf &#9652;";
      if (onToggle) onToggle(open);
    });

    shelf.appendChild(head);
    shelf.appendChild(body);

    const world = await worldPromise;
    mountedShelf = { world, head, body };
    await populateShelf(world, head, body);
    renderSelection(world, head);
    window.ForgeWorld.onSelect((sel, wid) => {
      if (wid !== world.worldId) return;
      renderSelection(world, head);
      body.querySelectorAll(".forge-shelf-card").forEach((c) => c.classList.toggle("sel", !!sel && c.dataset.id === sel.id));
    });
    window.ForgeWorld.onChange((m) => { if (m && m.kind === "put" && m.worldId === world.worldId) renderSelection(world, head); });
    // saves from other tabs and tools (Spire Forge, say) show up without a reload
    if (window.ForgeWorld && window.ForgeWorld.onChange) window.ForgeWorld.onChange((m) => { if (m && m.kind === "put" && m.worldId === world.worldId) refreshShelf(); });

    return shelf;
  }

  // The selection bar: the object picked anywhere in this world, and every place it lives
  // (edit it in its tools, see it in a city or in Ecology, its lineage). Like Blender's
  // active object, it follows you from stage to stage.
  async function renderSelection(world, head) {
    const box = head.querySelector(".forge-sel");
    const sel = window.ForgeWorld.getSelection(world.worldId);
    const rec = sel ? await world.get(sel.id) : null;
    box.innerHTML = "";
    box.classList.toggle("empty", !rec);
    if (!rec) { box.innerHTML = `<span class="nm">Nothing selected</span>`; return; }
    const all = await world.list(), g = window.ForgeWorld.graph(all);
    const used = g.usedBy(rec.id).length, stale = g.stale(rec).length;
    box.innerHTML = `<span class="dot" aria-hidden="true"></span><span class="nm"></span><span class="meta${stale ? " stale" : ""}"></span><span class="acts"></span><button type="button" class="clear" aria-label="Clear selection" title="Clear selection">&times;</button>`;
    box.querySelector(".nm").textContent = rec.name;
    box.querySelector(".meta").textContent = `${rec.type} v${rec.version}${used ? ` \u00b7 used by ${used}` : ""}${stale ? " \u00b7 out of date" : ""}`;
    const acts = box.querySelector(".acts");
    for (const p of window.ForgeWorld.placesFor(rec, g, { worldId: world.worldId })) {
      if (location.href.split("#")[0] === p.url) continue;
      const a = document.createElement("a"); a.href = p.url; a.textContent = p.label; a.className = p.kind;
      a.addEventListener("click", (e) => e.stopPropagation());
      acts.appendChild(a);
    }
    box.querySelector(".clear").addEventListener("click", (e) => { e.stopPropagation(); window.ForgeWorld.select(world.worldId, null); });
    box.addEventListener("click", (e) => e.stopPropagation());
  }

  // Call after writing a new object into the world file from the same page
  // the Shelf is mounted on (e.g. Bench's "Save as prefab"), so it's visible
  // immediately instead of only after the next page load.
  function refreshShelf() {
    if (!mountedShelf) return Promise.resolve();
    return populateShelf(mountedShelf.world, mountedShelf.head, mountedShelf.body);
  }

  async function mount(opts) {
    opts = opts || {};
    injectStyles();
    document.body.classList.add("forge-shell-mounted");
    document.body.appendChild(renderRail(opts.active || null));
    const worldPromise = opts.world || (window.ForgeWorld ? window.ForgeWorld.activeWorld() : null);
    document.body.appendChild(await renderShelf(worldPromise, !!opts.openShelf));
  }

  function stageUrl(stage, worldId) {
    if (!stage.owned) return stage.href;
    const sep = stage.href.includes("?") ? "&" : "?";
    return stage.href + sep + "world=" + encodeURIComponent(worldId);
  }

  // The persistent shell: one page that never reloads while you switch
  // stages. Each stage's screen (Forge's own Kit/Workbench, or someone
  // else's standalone tool, unmodified) loads into one iframe; the rail,
  // the world switcher and the Shelf live outside it and stay mounted.
  // This is what "a constant workspace, like Blender's mode switch" means
  // in a repo where each category generator is a genuinely separate app:
  // their code stays untouched and separate, only the chrome around them
  // persists.
  async function mountWorkspace(opts) {
    opts = opts || {};
    injectStyles();
    document.documentElement.classList.add("forge-workspace");
    document.body.classList.add("forge-workspace");

    let worldId = opts.worldId;
    if (!worldId) {
      const active = window.ForgeWorld ? await window.ForgeWorld.activeWorld() : null;
      worldId = active ? active.worldId : null;
    }
    if (window.ForgeWorld && worldId) window.ForgeWorld.setActiveWorldId(worldId);

    const topbar = document.createElement("div");
    topbar.className = "forge-ws-topbar";
    const worldMeta = (window.ForgeWorld ? window.ForgeWorld.listWorlds() : []).find((w) => w.id === worldId);
    topbar.innerHTML = `
      <span class="world">World <b>${worldMeta ? worldMeta.name : worldId || "—"}</b></span>
      <span class="stage" id="forgeWsStageLabel"></span>
      <span class="spacer"></span>
      <a class="switch" href="./index.html">Switch world</a>
    `;

    const frame = document.createElement("iframe");
    frame.className = "forge-ws-frame";
    frame.title = "Forge workspace";

    function go(stageId) {
      const stage = STAGES.find((s) => s.id === stageId) || STAGES[0];
      frame.src = stageUrl(stage, worldId);
      rail.querySelectorAll(".forge-stage").forEach((el) => el.classList.toggle("active", el.dataset.stage === stage.id));
      topbar.querySelector("#forgeWsStageLabel").textContent = stage.label;
      const params = new URLSearchParams(location.search);
      params.set("world", worldId || "");
      params.set("stage", stage.id);
      history.replaceState(null, "", "?" + params.toString());
    }

    const rail = renderRail(null, (stage) => go(stage.id));

    document.body.append(topbar, rail, frame);
    const worldPromise = window.ForgeWorld && worldId ? window.ForgeWorld.open(worldId) : null;
    document.body.appendChild(await renderShelf(worldPromise, false, (open) => document.body.classList.toggle("shelf-open", open)));

    go(opts.initialStage || "kit");
  }

  window.ForgeShell = { mount, mountWorkspace, refreshShelf, STAGES, DRAG_MIME };
})();
