/*
 * Forge — the bridge a standalone tool loads to edit objects in a Forge world.
 *
 * A tool stays a full editor in its own right; the bridge only adds the round trip:
 *   opened as  tool.html?world=<id>&object=<id>&return=<url>
 *   - shows a slim Forge bar (world, what's being edited, Back to Forge)
 *   - hands the tool the saved record once the tool says it's ready
 *   - saves back onto the SAME object (a new version), or as a new object
 *   - other open Forge tabs hear about the save (ForgeWorld.onChange) and refresh
 * Opened without ?object, it still saves new objects into the active world, as before.
 *
 *   const bridge = ForgeBridge.connect({ tool: "Spire Forge", onOpen(record) { ... } });
 *   bridge.ready()                       call when the tool can accept a design (parts loaded…);
 *                                        resolves with the opened record (or null)
 *   await bridge.save(obj, { asNew, speciesList, prefab })  -> { record, created }
 *       obj = { type, name, recipe, seed, refs, svg, source } as for world.put. Editing an
 *       opened object updates it; a new object (or asNew) gets the Save-as-Prefab dialog
 *       when prefab !== false and forge-prefab.js is loaded.
 *   bridge.record, bridge.world, bridge.returnUrl, bridge.setStatus(text)
 *
 * Depends on forge-world.js; uses forge-prefab.js when present. Classic script.
 */
(function () {
  "use strict";
  const STYLE_ID = "forge-bridge-styles";
  const SCRIPT_SRC = document.currentScript ? document.currentScript.src : location.href;

  function styles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style"); s.id = STYLE_ID;
    s.textContent = `
      .forge-bridge { position: sticky; top: 0; z-index: 50; display: flex; align-items: center; gap: 12px; padding: 7px 16px;
        background: #0d0f13; border-bottom: 1px solid #262a33; color: #a7adb8; font: 500 10px/1.2 "Geist Mono", ui-monospace, monospace;
        letter-spacing: .1em; text-transform: uppercase; }
      .forge-bridge b { color: #e8eaf0; font-weight: 500; letter-spacing: .2em; }
      .forge-bridge .fb-obj { color: #e8eaf0; text-transform: none; letter-spacing: .02em; font-size: 11px; }
      .forge-bridge .fb-sp { flex: 1; }
      .forge-bridge .fb-st { color: #5fd38d; }
      .forge-bridge .fb-st.err { color: #ff6b6b; }
      .forge-bridge a, .forge-bridge button { font: inherit; letter-spacing: inherit; text-transform: inherit; color: #e8eaf0; background: transparent;
        border: 1px solid #3a3f4b; border-radius: 3px; padding: 5px 9px; cursor: pointer; text-decoration: none; }
      .forge-bridge a:hover, .forge-bridge button:hover { border-color: #a7adb8; }
    `;
    document.head.appendChild(s);
  }

  function connect(opts) {
    opts = opts || {};
    const params = new URLSearchParams(location.search);
    const objectId = params.get("object");
    const returnUrl = params.get("return");
    if (params.get("world") && window.ForgeWorld) window.ForgeWorld.setActiveWorldId(params.get("world"));
    const bridge = { record: null, world: null, returnUrl, objectId, tool: opts.tool || "tool" };
    const worldP = window.ForgeWorld ? window.ForgeWorld.activeWorld() : Promise.resolve(null);
    let bar = null;

    function render() {
      if (!bar) return;
      const meta = window.ForgeWorld && bridge.world ? window.ForgeWorld.listWorlds().find((w) => w.id === bridge.world.worldId) : null;
      bar.querySelector(".fb-world").textContent = meta ? meta.name : "";
      bar.querySelector(".fb-obj").textContent = bridge.record ? `editing ${bridge.record.name} \u00b7 v${bridge.record.version}` : (objectId ? "opening\u2026" : "");
    }
    bridge.setStatus = (text, err) => { if (!bar) return; const st = bar.querySelector(".fb-st"); st.textContent = text || ""; st.className = "fb-st" + (err ? " err" : ""); };

    // the bar only appears when the tool was opened from Forge (or is inside a world with ?world=)
    if (objectId || returnUrl || params.get("world")) {
      styles();
      bar = document.createElement("div"); bar.className = "forge-bridge"; bar.setAttribute("role", "region"); bar.setAttribute("aria-label", "Forge");
      bar.innerHTML = `<b>FORGE</b><span class="fb-world"></span><span class="fb-obj"></span><span class="fb-sp"></span><span class="fb-st" role="status"></span>`;
      const back = document.createElement("a");
      back.textContent = "Back to Forge";
      back.href = returnUrl || new URL("./workspace.html", SCRIPT_SRC).href;
      bar.appendChild(back);
      const mount = () => document.body.insertBefore(bar, document.body.firstChild);
      if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
    }

    let resolveReady;
    const opened = new Promise((r) => { resolveReady = r; });
    bridge.ready = async () => {
      bridge.world = await worldP;
      if (bridge.world && objectId) {
        const rec = await bridge.world.get(objectId);
        if (rec) { bridge.record = rec; try { opts.onOpen && opts.onOpen(rec); } catch (e) { console.error(e); bridge.setStatus("Couldn't open " + rec.name, true); } }
        else bridge.setStatus("That object isn't in this world any more", true);
      }
      render(); resolveReady(bridge.record); return bridge.record;
    };
    bridge.opened = opened;

    bridge.save = async (obj, o) => {
      o = o || {};
      bridge.world = bridge.world || (await worldP);
      if (!bridge.world) throw new Error("Forge's world file isn't available here.");
      const editing = bridge.record && !o.asNew;
      const record = await bridge.world.put({ ...obj, ...(editing ? { id: bridge.record.id } : {}) });
      bridge.record = record;
      let tagged = null;
      if (!editing && o.prefab !== false && window.ForgePrefab) tagged = await window.ForgePrefab.open({ world: bridge.world, object: record, speciesList: o.speciesList || [] });
      if (tagged) bridge.record = tagged;
      render(); bridge.setStatus(editing ? `saved v${record.version}` : "saved to world");
      // later saves update this object; keep the URL honest so a reload reopens it
      try { const u = new URL(location.href); u.searchParams.set("object", record.id); u.searchParams.set("world", bridge.world.worldId); history.replaceState(null, "", u); } catch { /* ignore */ }
      return { record: bridge.record, created: !editing };
    };
    return bridge;
  }

  window.ForgeBridge = { connect };
})();
