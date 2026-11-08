/*
 * Forge - the Save as Prefab dialog (E6Prefab.dc.html is the literal spec, from
 * the "Forge UI Explorations" Artifact canvas's e2e page). Turns an object
 * already written to the world file into a prefab by adding its `prefab`
 * block: footprint/height (read off the object's own recipe, not typed in),
 * which districts it belongs in, which species it attracts (Ecology reads
 * this field once Ecology exists), and whether its parts are pinned.
 *
 * Scoped down from the mockup in one place: E6's "Belongs in" is a fixed list
 * of real district chips and the primary action is "Save and place in city" -
 * neither exists yet, since the City screen and its district objects are
 * Phase 3 work this pass doesn't include. "Belongs in" is a free-text tag
 * list instead, and the action is just "Save as prefab"; City can read these
 * tags once it exists, same as the mockup's chips would feed it.
 *
 * Depends on forge-world.js (an open World from ForgeWorld.open/activeWorld).
 * Load as a plain script: <script src="forge-prefab.js">.
 */
(function () {
  "use strict";

  const STYLE_ID = "forge-prefab-styles";

  // The host page (Spire Forge, Sigil Forge, ...) doesn't link shared/look/tokens.css or load
  // Geist Mono, so this dialog carries its own hardcoded copy of the Forge "forge"
  // theme's palette (shared/look/tokens.css's :root[data-theme="forge"]) rather than relying on
  // inherited CSS custom properties, plus its own Google Fonts link for the mono face.
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    if (!document.getElementById("forge-prefab-font")) {
      const link = document.createElement("link");
      link.id = "forge-prefab-font";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500&display=swap";
      document.head.appendChild(link);
    }
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .forge-prefab-overlay {
        position: fixed; inset: 0; z-index: 1000; background: rgba(11,13,17,.8);
        display: flex; align-items: center; justify-content: center; padding: 24px;
        font-family: 'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace; color: #e8eaf0;
      }
      .forge-prefab-dialog {
        width: min(760px, 100%); max-height: 90vh; overflow: auto; display: flex; gap: 0;
        background: #0b0d11; border: 1px solid #2a2e38; border-radius: 3px; overflow: hidden;
      }
      .fp-left { flex: 0 0 260px; background: #0b0d11; border-right: 1px solid #1f2229; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; gap: 10px; }
      .fp-art { width: 100%; height: 220px; display: flex; align-items: center; justify-content: center; }
      .fp-art svg { max-width: 100%; max-height: 100%; }
      .fp-empty { font-size: 11px; color: #8b93a4; }
      .fp-hint { font-size: 9px; letter-spacing: .14em; color: #8b93a4; text-transform: uppercase; }
      .fp-right { flex: 1 1 auto; padding: 22px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
      .fp-title { font-family: inherit; font-size: 15px; font-weight: 500; letter-spacing: 0; margin: 0 0 4px; color: #e8eaf0; }
      .fp-label { font-size: 9px; letter-spacing: .18em; color: #8b93a4; text-transform: uppercase; display: block; }
      .fp-sub { text-transform: none; letter-spacing: .02em; color: #6b7280; font-size: 10px; display: block; margin-top: 2px; }
      .fp-input {
        width: 100%; background: #0b0d11; border: 1px solid #2a2e38; border-radius: 2px;
        color: #e8eaf0; font-family: inherit; font-size: 12px; padding: 8px 10px;
      }
      .fp-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
      .fp-stats > div { background: transparent; border: 1px solid #2a2e38; border-radius: 2px; padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; }
      .fp-k { font-size: 8px; letter-spacing: .14em; color: #8b93a4; text-transform: uppercase; }
      .fp-v { font-size: 12px; }
      .fp-chips { display: flex; gap: 6px; flex-wrap: wrap; max-height: 90px; overflow: auto; }
      .fp-chip {
        font-size: 10px; letter-spacing: .04em; padding: 5px 10px; border-radius: 2px;
        border: 1px solid #2a2e38; color: #8b93a4; cursor: pointer;
      }
      .fp-chip.on { border-color: #e8eaf0; color: #e8eaf0; background: transparent; }
      .fp-check { display: flex; flex-direction: column; gap: 2px; font-size: 11px; cursor: pointer; color: #e8eaf0; }
      .fp-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 6px; }
      .fp-btn { font-family: inherit; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; padding: 9px 16px; border-radius: 2px; cursor: pointer; border: 1px solid #2a2e38; background: transparent; color: #e8eaf0; }
      .fp-btn.primary { background: #e8eaf0; border-color: #e8eaf0; color: #0b0d11; }
    `;
    document.head.appendChild(style);
  }

  // Reads footprint/height straight off a Tower-Forge-shaped spec (the one
  // shape Spire Forge already produces via toTowerForge()) rather than asking
  // the person to type them in, matching E6Prefab's "64 x 48 auto" fields.
  function footprintFromTowerSpec(spec) {
    if (!spec || !Array.isArray(spec.tiers) || !spec.tiers.length) return { footprint: null, height: null };
    const maxR = Math.max(...spec.tiers.map((t) => Math.max(t.r0 || 0, t.r1 || 0)));
    const height = spec.tiers.reduce((sum, t) => sum + (t.h || 0), 0);
    const diameter = Math.round(maxR * 2);
    return { footprint: [diameter, diameter], height: Math.round(height) };
  }

  // opts: { world, object: {id,name,recipe,svg,...} already in the world file,
  //         speciesList?: string[] (display names for the "Attracts" chips) }
  // Resolves to the saved record, or null if the person cancelled.
  function open(opts) {
    injectStyles();
    const { footprint, height } = footprintFromTowerSpec(opts.object && opts.object.recipe);
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "forge-prefab-overlay";
      overlay.innerHTML = `
        <div class="forge-prefab-dialog">
          <div class="fp-left">
            <div class="fp-art">${(opts.object && opts.object.svg) || "<div class='fp-empty'>No preview</div>"}</div>
            <div class="fp-hint">preview</div>
          </div>
          <div class="fp-right">
            <h3 class="fp-title">Save as prefab</h3>
            <div>
              <label class="fp-label">Name</label>
              <input class="fp-input" id="fpName" value="${String((opts.object && opts.object.name) || "").replace(/"/g, "&quot;")}">
            </div>
            <div class="fp-stats">
              <div><span class="fp-k">Footprint</span><span class="fp-v">${footprint ? footprint[0] + " &#215; " + footprint[1] + " auto" : "&#8212;"}</span></div>
              <div><span class="fp-k">Height</span><span class="fp-v">${height != null ? height + " auto" : "&#8212;"}</span></div>
              <div><span class="fp-k">Facing</span><span class="fp-v">any</span></div>
            </div>
            <div>
              <label class="fp-label">Belongs in<span class="fp-sub">comma-separated &#8212; no district list exists yet, City will read these tags once it does</span></label>
              <input class="fp-input" id="fpDistricts" placeholder="e.g. lantern-quarter, harbour">
            </div>
            <div>
              <label class="fp-label">Attracts<span class="fp-sub">Ecology reads this: these species gather and drift near it</span></label>
              <div class="fp-chips" id="fpSpecies"></div>
            </div>
            <div>
              <label class="fp-label">Drawn in<span class="fp-sub">the style World Scene and Route Scene draw it in, wherever it stands (Forge &#8250; Style edits these)</span></label>
              <select class="fp-input" id="fpStyle"></select>
            </div>
            <label class="fp-check"><input type="checkbox" id="fpPin" checked> Pin parts at today's versions
              <span class="fp-sub">Later part edits ask before changing this prefab</span>
            </label>
            <div class="fp-actions">
              <button class="fp-btn ghost" id="fpCancel" type="button">Cancel</button>
              <button class="fp-btn primary" id="fpSave" type="button">Save as prefab</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      // styles: the shared recipes (shared/look/style/style-recipes.js) when the page has them, else the
      // built-in ids by name so the choice still saves; a building carries Route Zero by default
      const styleSel = overlay.querySelector("#fpStyle");
      const SR = window.StyleRecipes;
      const styles = SR ? SR.all() : [{ id: "route-zero", name: "Route Zero" }, { id: "route-blue", name: "Route Zero blue" }, { id: "ash", name: "Ash" }, { id: "paper", name: "Paper" }, { id: "glitch", name: "Glitch" }, { id: "engraving", name: "Engraving" }, { id: "relief", name: "Relief" }];
      for (const r of styles) { const o = document.createElement("option"); o.value = r.id; o.textContent = r.name + (r.saved ? " (saved)" : ""); styleSel.appendChild(o); }
      styleSel.value = (opts.object && opts.object.style) || "route-zero";
      if (SR && SR.loadSaved) SR.loadSaved().then(() => { const cur = styleSel.value; styleSel.innerHTML = ""; for (const r of SR.all()) { const o = document.createElement("option"); o.value = r.id; o.textContent = r.name + (r.saved ? " (saved)" : ""); styleSel.appendChild(o); } styleSel.value = cur; });

      const speciesBox = overlay.querySelector("#fpSpecies");
      const chosen = new Set();
      (opts.speciesList || []).slice(0, 30).forEach((sp) => {
        const chip = document.createElement("span");
        chip.className = "fp-chip";
        chip.textContent = sp;
        chip.onclick = () => {
          chip.classList.toggle("on");
          if (chosen.has(sp)) chosen.delete(sp); else chosen.add(sp);
        };
        speciesBox.appendChild(chip);
      });

      function close(result) { overlay.remove(); resolve(result); }
      overlay.querySelector("#fpCancel").onclick = () => close(null);
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(null); });

      overlay.querySelector("#fpSave").onclick = async () => {
        const name = overlay.querySelector("#fpName").value.trim() || (opts.object && opts.object.name);
        const districts = overlay.querySelector("#fpDistricts").value.split(",").map((s) => s.trim()).filter(Boolean);
        const pinned = overlay.querySelector("#fpPin").checked;
        const prefab = { footprint, height, facing: "any", districts, attracts: [...chosen], pinned };
        const record = await opts.world.put({ id: opts.object.id, name, prefab, style: styleSel.value || "route-zero", approved: pinned });
        close(record);
      };
    });
  }

  window.ForgePrefab = { open };
})();
