/* world/forge/web/forge-scene.js — the one 3D world, as Forge's stages show it.

   City and Ecology both host World Scene in a frame (?forge=1) and drive it through its
   window.ForgeCityHost (world/scenes/world-scene/forge-host.js). City shapes the city; Ecology shows
   what lives in it: the swimmers, the creatures walking the streets, and drift round the buildings
   that stand as towers. Both see the same floor, camera and look, because it is the same scene.

   This file is the panel side of that seam, shared by the two pages:
     ForgeScene.boot(frame, seed)            point an <iframe> at World Scene, embedded
     ForgeScene.buildings3d(prefabs, getKit) the world's buildings as towers the scene can stand
     ForgeScene.create(ctx)                  the panels, bound to one page:
       ctx.host()      ForgeCityHost once the frame said "ready", else null
       ctx.world       the open ForgeWorld
       ctx.state       { recipe: { grammar }, prefabs, buildings3d, sceneSum, cityId, ... } (filled in here too)
       ctx.touch()     the city's grammar changed (scene settings, homes): keep it
       ctx.render()    draw the page's panels again
       ctx.status(t)   a line in the top bar
       ctx.quiet(fn)   run fn with the scene asleep (baking, saving)
       ctx.live()      true while drift numbers and head counts are on screen
   What is tuned in the scene is kept on the city as recipe.grammar.scene (World Scene's own settings
   object), and which building a walker keeps to as recipe.grammar.homes. */
(function () {
  "use strict";

  const SCENE_URL = "../../scenes/world-scene/World%20Scene.html";
  const GW_HUES = ["#5be39a", "#e8b04a", "#a98bff", "#5cc8e0", "#ff8a3d", "#e66fb8", "#a3d65c", "#7fa8c9"];
  const SEG_NAMES = { mode: "Draw", flow: "Swim", beh: "Life", ptr: "Pointer", irismode: "Iris finish", view: "View", proj: "Lens" };

  function boot(frame, seed) { frame.src = SCENE_URL + "?forge=1#" + btoa(JSON.stringify({ seed: (seed >>> 0) || 1 })); }

  // the Forge world's buildings, as the towers the 3D city may stand: each record's own design (its spec with the Spire genome inside)
  async function buildings3d(prefabs, getKit) {
    const out = []; let kit = null;
    for (const p of prefabs) {
      const r = ForgeBuilding.read(p.record.recipe); let spec = r.spec;
      try { if (!spec && r.genome) { kit = kit || await getKit(); spec = ForgeBuilding.fromGenome(r.genome, kit.byId, p.name); } } catch (e) { spec = null; }
      if (spec && spec.tiers && spec.tiers.length) out.push({ id: p.id, version: p.version, name: p.name, districts: p.districts, spec });
    }
    return out;
  }

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function create(ctx) {
    const { world } = ctx, state = ctx.state, host = ctx.host;
    state.ground = state.ground || [];
    state.attracts = state.attracts || {};
    const grammar = () => state.recipe.grammar;

    /* ---------- creatures that walk the city ----------
       The creatures saved in this world that walk (kit mechs, Blender solids, Bestiary walkers) walk
       the city between its towers; each carries its own top view (recipe.flat), baked here in a hidden
       Bestiary frame when it is missing. How many of each walk is kept per world in this browser. */
    const gwKey = () => "forge:ground-walkers:" + world.worldId;
    const gwCounts = () => { try { return JSON.parse(localStorage.getItem(gwKey()) || "{}"); } catch (e) { return {}; } };
    const gwSetCount = (id, n) => { const c = gwCounts(); c[id] = n; try { localStorage.setItem(gwKey(), JSON.stringify(c)); } catch (e) { /* counts just won't be remembered */ } };
    function bakeFlat(rec) {
      return new Promise((done) => {
        const f = document.createElement("iframe"); f.setAttribute("aria-hidden", "true"); f.tabIndex = -1;
        f.style.cssText = "position:fixed;left:-2000px;top:0;width:640px;height:480px;border:0;visibility:hidden";
        let over = false; const finish = (ok) => { if (over) return; over = true; clearTimeout(timer); window.removeEventListener("message", onMsg); f.remove(); done(ok); };
        const onMsg = (e) => { if (e.origin === location.origin && e.data && e.data.forgeBaked === rec.id) finish(!!e.data.ok); };
        const timer = setTimeout(() => finish(false), 60000);
        window.addEventListener("message", onMsg);
        f.src = CreatureRecord.walkUrl(rec, { worldId: world.worldId, root: "../../../" }) + "&embed=1&bake=1";
        document.body.appendChild(f);
      });
    }
    function applyGround() {
      const h = host(); if (!h) return;
      const counts = gwCounts();
      h.setCreatures(state.ground.filter((g) => g.rec.recipe.flat).map((g) => ({ id: g.rec.id, name: g.rec.name, flat: g.rec.recipe.flat, motion: CreatureRecord.motionOf(g.rec), count: counts[g.rec.id] ?? 3, color: GW_HUES[state.ground.indexOf(g) % GW_HUES.length], home: (grammar().homes || {})[g.rec.id] || null })));
    }
    let gwLoading = null;
    async function loadGround() {
      if (gwLoading) return gwLoading;
      gwLoading = (async () => {
        const recs = (await world.list("species")).filter((o) => CreatureRecord.kindOf(o).walks).sort((a, b) => a.createdAt - b.createdAt);
        const stale = recs.filter((o) => !CreatureRecord.flatFresh(o));
        state.ground = recs.map((o) => ({ rec: o, pending: stale.includes(o) })); applyGround(); ctx.render();
        for (const o of stale) {
          await ctx.quiet(() => bakeFlat(o)); const fresh = await world.get(o.id), slot = state.ground.find((g) => g.rec.id === o.id);
          if (slot) { slot.pending = false; slot.failed = !fresh || !CreatureRecord.flatFresh(fresh); if (fresh) slot.rec = fresh; }
          applyGround(); ctx.render();
        }
      })();
      try { await gwLoading; } finally { gwLoading = null; }
    }
    const loadingGround = () => !!gwLoading;
    const stepper = (label, d, aria, fn) => { const b = el("button", "f-btn is-dense", label); b.type = "button"; b.setAttribute("aria-label", aria); b.onclick = () => fn(d); return b; };

    /* ---------- World Scene's own controls, shown in Forge ----------
       The scene hides its panels in Forge (?forge=1); forge-host.js describes each control from the
       scene's own elements and drives it the way a person would (controls / set / choose / press). */
    const keepScene = () => { const h = host(); if (!h) return; grammar().scene = h.preset(); ctx.touch(); };
    function applyScene() { const h = host(); if (h && grammar().scene) h.applyPreset(grammar().scene); }
    function sceneControl(h, panel, d) {
      const reread = () => (h.controls(panel).find((x) => x.id === d.id) || d);
      if (d.kind === "range") {
        const f = el("div", "f-field knob3d");
        f.innerHTML = `<label class="f-field__label"><span></span><span class="v"></span></label>`;
        f.querySelector("span").textContent = d.label; f.querySelector(".v").textContent = d.text;
        const r = document.createElement("input"); r.type = "range"; r.className = "f-fader"; r.min = d.min; r.max = d.max; r.step = d.step; r.value = d.value; r.id = "k3d-" + d.id; r.setAttribute("aria-label", d.label);
        r.oninput = () => { h.set(d.id, r.value); f.querySelector(".v").textContent = reread().text; };
        r.onchange = keepScene;
        f.appendChild(r); return f;
      }
      if (d.kind === "choice") {
        const w = el("div"), l = el("div", "seglabel", SEG_NAMES[d.id] || d.label);
        const g = el("div", "seg3d"); g.setAttribute("role", "group"); g.setAttribute("aria-label", SEG_NAMES[d.id] || d.label);
        for (const o of d.options) {
          const b = el("button", null, o.label); b.type = "button"; b.id = `c3d-${d.id}-${o.value}`; b.setAttribute("aria-pressed", String(o.value === d.value));
          b.onclick = () => { h.choose(d.id, o.value); g.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); keepScene(); };
          g.appendChild(b);
        }
        w.append(l, g); return w;
      }
      if (d.kind === "select") {
        const w = el("div"), sel = document.createElement("select"); sel.style.width = "100%"; sel.setAttribute("aria-label", d.label); sel.id = "s3d-" + d.id;
        sel.innerHTML = d.options.map((o) => `<option value="${o.value}"${o.value === d.value ? " selected" : ""}>${o.label}</option>`).join("");
        sel.onchange = () => { h.set(d.id, sel.value); keepScene(); };
        w.append(el("div", "seglabel", "Highlight and follow"), sel); w.style.marginBottom = "8px"; return w;
      }
      const b = el("button", "f-btn is-dense", d.label); b.type = "button"; b.id = "b3d-" + d.id;
      if (d.kind === "toggle") { b.setAttribute("aria-pressed", String(d.on)); b.onclick = () => { h.press(d.id); b.setAttribute("aria-pressed", String(reread().on)); keepScene(); }; }
      else b.onclick = () => { h.press(d.id); if (d.id === "reseed") keepScene(); };
      return b;
    }
    // a group of the scene's controls: knobs and choices stacked, buttons in a row underneath
    function sceneGroup(h, title, panel, hint, collapsed) {
      const g = el(collapsed ? "details" : "div", "group" + (collapsed ? " more3d" : ""));
      if (collapsed) g.appendChild(el("summary", null, title));
      else g.appendChild(el("div", "glabel", title));
      const row = el("div", "btnrow3d");
      for (const d of h.controls(panel)) { const c = sceneControl(h, panel, d); if (d.kind === "toggle" || d.kind === "button") row.appendChild(c); else g.appendChild(c); }
      if (row.children.length) g.appendChild(row);
      if (hint) g.insertAdjacentHTML("beforeend", `<p class="hint-text">${hint}</p>`);
      return g;
    }

    /* ---------- drift, in the 3D city ----------
       The buildings standing as towers pull in the species they attract; a species that spends time
       round a building drifts its swim toward that building's character (ecology-loop.js, run by the
       scene). What a building attracts is kept on its record (prefab.attracts). */
    async function startDrift() {
      const h = host(); if (!h) return;
      if (!state.rigs) { try { state.rigs = await world.list("rig"); } catch (e) { state.rigs = []; } }
      const standing = new Set(((state.sceneSum || {}).standing || []).map((t) => t.key).filter(Boolean));
      const prefabs = state.prefabs.filter((p) => standing.has(p.id)).map((p) => ({ id: p.id, name: p.name, type: p.type, version: p.version, attracts: state.attracts[p.id] || p.attracts || [] }));
      // the first run with nothing attracted anywhere: two species per building, so the drift has something to do
      if (prefabs.length && prefabs.every((p) => !p.attracts.length)) {
        const pool = h.species().filter((sp) => sp.pop > 0).sort((a, b) => b.pop - a.pop).slice(0, 8).map((sp) => sp.key);   // the common swimmers, so a building has someone to pull in
        for (const p of prefabs) { let x = 0; for (const ch of p.id) x = (x * 31 + ch.charCodeAt(0)) >>> 0; p.attracts = [pool[x % pool.length], pool[(x >>> 7) % pool.length]].filter((v, i, a) => v && a.indexOf(v) === i); state.attracts[p.id] = p.attracts; }
        state.driftSuggested = true;
      }
      h.driftStart({ prefabs, rigs: state.rigs, rate: state.driftRate ?? 0.6, keepExposure: true });
    }
    async function captureVariant(h, i) {
      const v = h.driftVariant(i); if (!v) return;
      const b = v.building ? state.prefabs.find((p) => p.id === v.building) : null, root = v.base.split("~")[0];
      const $overrides = ForgeOverrides.diff({ swim: v.baseSwim }, { swim: v.swim });
      const { swim: _s, baseSwim: _b, ...meta } = v;
      const refs = []; if (state.cityId) refs.push(`city:${state.cityId}`); if (b) refs.push(`${b.type}:${b.id}@${b.version}`); if (v.rig) refs.push(`rig:${v.rig}`);
      const sp = h.species().find((x) => x.key === root), name = `${sp ? sp.name : root}${b ? " of " + b.name : ""}`;
      const rec = await world.put({ id: "species_" + Math.random().toString(36).slice(2, 9), type: "species", name, recipe: { $base: "eco:" + root, $overrides, ...meta, base: root, parent: null, generation: 1, city: state.cityId || null }, seed: null, refs, source: { tool: "Forge Ecology" } });
      ForgeWorld.select(world.worldId, { id: rec.id, type: rec.type, from: "ecology" });
      ctx.status(`captured ${rec.name}`); if (window.ForgeShell && ForgeShell.refreshShelf) ForgeShell.refreshShelf(); ctx.render();
    }
    function driftGroup(h) {
      const D = h.drift(), g = el("div", "group"); g.id = "drift3d";
      g.appendChild(el("div", "glabel", "Drift · what the buildings attract"));
      if (!D || !D.landmarks.length) { g.insertAdjacentHTML("beforeend", `<p class="hint-text">${(state.buildings3d || []).length ? "None of this world's buildings stands in the city yet. Click a tower in City to stand one there." : "Forge some buildings first: each one that stands as a tower can pull in the species it attracts."}</p>`); return g; }
      const SP = h.species(), nameOf = (k) => (SP.find((x) => x.key === k) || {}).name || k;
      if (state.driftSuggested) g.insertAdjacentHTML("beforeend", `<p class="hint-text">None of these buildings attracted anything yet, so each was given two species to start. Change them and save them to the building.</p>`);
      for (const L of D.landmarks) {
        const row = el("div", "landmark3d"); row.dataset.id = L.id; if (state.focusLandmark === L.id) row.classList.add("focus");
        row.innerHTML = `<div class="rowline" style="margin:0"><span class="who"><b></b><span class="hint-text" style="margin:0">${L.sites.map((s) => s === 0 ? "main tower" : "tower " + s).join(", ")}</span></span></div>`;
        row.querySelector("b").textContent = L.name;
        const chips = el("div", "chips3d");
        const set = (keys) => { state.attracts[L.id] = keys; h.driftAttracts(L.id, keys); ctx.render(); };
        for (const k of L.attracts) { const c = el("button", null, nameOf(k) + " ×"); c.type = "button"; c.title = "Stop attracting"; c.onclick = () => set(L.attracts.filter((x) => x !== k)); chips.appendChild(c); }
        const add = document.createElement("select"); add.setAttribute("aria-label", "Attract another species to " + L.name);
        add.innerHTML = `<option value="">+ attract</option>` + SP.filter((x) => !L.attracts.includes(x.key)).map((x) => `<option value="${x.key}">${x.name}</option>`).join("");
        add.onchange = () => { if (add.value) set(L.attracts.concat(add.value)); };
        chips.appendChild(add); row.appendChild(chips);
        const sv = el("button", "f-btn is-dense", "Save to building"); sv.type = "button";
        sv.onclick = async () => { const rec = await world.get(L.id); await world.put({ id: L.id, prefab: { ...(rec.prefab || { footprint: null, height: null, facing: "any", districts: [], pinned: false }), attracts: L.attracts.slice() } });
          const p = state.prefabs.find((x) => x.id === L.id); if (p) p.attracts = L.attracts.slice(); state.driftSuggested = false; ctx.status("attracts saved"); ctx.render(); };
        row.appendChild(sv); g.appendChild(row);
      }
      const rate = el("div", "f-field knob3d");
      rate.innerHTML = `<label class="f-field__label"><span>Drift rate</span><span class="v">${Math.round(D.rate * 100)}%</span></label>`;
      const r = document.createElement("input"); r.type = "range"; r.className = "f-fader"; r.min = 0; r.max = 1; r.step = 0.05; r.value = D.rate; r.setAttribute("aria-label", "Drift rate"); r.id = "driftRate";
      r.oninput = () => { state.driftRate = +r.value; h.driftRate(+r.value); rate.querySelector(".v").textContent = Math.round(r.value * 100) + "%"; };
      rate.appendChild(r); g.appendChild(rate);
      const moved = D.species.filter((s) => s.exposure > 0).sort((a, b) => b.drift - a.drift);
      const list = el("div"); list.id = "driftList";
      if (!moved.length) list.innerHTML = `<p class="hint-text">Nothing has drifted yet. A species drifts once it spends time round a building that attracts it.</p>`;
      for (const s of moved) {
        const box = el("div", "driftrow"); box.dataset.i = s.i;
        box.innerHTML = `<div class="rowline" style="margin:0"><span class="who"><b></b><span class="hint-text" style="margin:0" data-d></span></span></div>`;
        box.querySelector("b").textContent = s.name + (s.rigged ? " · rigged" : "");
        for (const k of s.allow) box.insertAdjacentHTML("beforeend", `<div class="param" data-k="${k}"><span>${k}</span><div class="track"><i class="b"></i><i class="c"></i></div><span class="v"></span></div>`);
        const cap = el("button", "f-btn is-dense", "Capture variant"); cap.type = "button"; cap.style.marginTop = "4px"; cap.onclick = () => captureVariant(h, s.i);
        box.appendChild(cap); list.appendChild(box);
      }
      g.appendChild(list);
      const rs = el("button", "f-btn is-dense is-quiet", "Reset drift"); rs.type = "button"; rs.id = "driftReset"; rs.onclick = () => { h.driftReset(); ctx.render(); };
      g.appendChild(rs);
      g.insertAdjacentHTML("beforeend", `<p class="hint-text">Each building leans each swim its own way: some make creatures faster, others make them beat wider or slower. A captured variant is saved to this world as a species of its own.</p>`);
      driftNumbers(h);
      return g;
    }
    // the live numbers of the drift and the swimmers, updated in place so the buttons stay put
    function driftNumbers(h) {
      const D = h.drift(); if (!D) return;
      for (const box of document.querySelectorAll("#driftList .driftrow")) {
        const s = D.species[+box.dataset.i]; if (!s) continue;
        box.querySelector("[data-d]").textContent = `${Math.round(s.drift * 100)}% drifted` + (s.top ? ` · mostly ${s.top.name}` : "");
        for (const e of box.querySelectorAll(".param")) {
          const k = e.dataset.k, b = s.base[k], c = s.cur[k], lo = b * 0.5, hi = b * 1.6, pos = (v) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo || 1)) * 100));
          e.querySelector(".b").style.left = pos(b) + "%"; e.querySelector(".c").style.left = pos(c) + "%"; e.querySelector(".v").textContent = `${(+b).toFixed(2)} → ${(+c).toFixed(2)}`;
        }
      }
    }
    setInterval(() => {
      if (!ctx.live()) return;
      const h = host(); if (!h) return;
      driftNumbers(h);
      for (const sp of h.species()) { const a = document.querySelector(`[data-alive="${sp.key}"]`); if (a) a.textContent = String(sp.alive).padStart(2, "0"); const t = document.querySelector(`[data-tally="${sp.key}"]`); if (t) t.textContent = sp.eaten || sp.lost ? ` · ate ${sp.eaten}, lost ${sp.lost}${sp.pressure ? " · under pressure" : ""}` : ""; }
      const sum = document.getElementById("swimSum"); if (sum) { const S2 = h.species(); sum.textContent = `${S2.reduce((n, s) => n + s.alive, 0)} alive · ${S2.reduce((n, s) => n + s.eaten, 0)} eaten`; }
    }, 1000);

    /* ---------- the panels ---------- */
    function walkersGroup(h) {
      const g1 = el("div", "group"); g1.id = "walkers3d";
      g1.appendChild(el("div", "glabel", "Walking the city"));
      if (!state.ground.length) g1.insertAdjacentHTML("beforeend", `<p class="hint-text">Nothing walks here yet. Save a kit mech, a Blender model or a Bestiary walker to this world and it walks between the towers.</p><a class="f-btn" style="text-decoration:none;display:flex;align-items:center;justify-content:center" href="./species.html">Open Species</a>`);
      const counts = gwCounts();
      state.ground.forEach((g, i) => {
        const row = el("div", "rowline");
        row.innerHTML = `<span class="dot" style="background:${GW_HUES[i % GW_HUES.length]}"></span><span class="who"><b></b><span class="hint-text" style="margin:0"></span></span>`;
        row.querySelector("b").textContent = g.rec.name;
        row.querySelector(".hint-text").textContent = g.pending ? "Standing it up to get its top view…" : g.failed ? "Couldn't get its top view. Open it in the Bestiary and save it." : CreatureRecord.kindOf(g.rec).label + " · " + CreatureRecord.motionLabel(g.rec);
        if (g.rec.recipe.flat) {
          const n = counts[g.rec.id] ?? 3, ct = el("span", "ct", String(n).padStart(2, "0"));
          const set = (d) => { gwSetCount(g.rec.id, Math.max(0, Math.min(12, n + d))); applyGround(); ctx.render(); };
          row.append(stepper("−", -1, "Fewer " + g.rec.name, set), ct, stepper("+", 1, "More " + g.rec.name, set));
        }
        g1.appendChild(row);
        // the building it keeps to: it walks there most often and stays longest
        const B = state.buildings3d || [], standing = new Set(((state.sceneSum || {}).standing || []).map((t) => t.key));
        if (g.rec.recipe.flat && B.length) {
          const homes = grammar().homes || {}, sel = document.createElement("select"); sel.setAttribute("aria-label", g.rec.name + " keeps to"); sel.style.cssText = "width:100%;margin:2px 0 8px";
          sel.innerHTML = `<option value="">Keeps to: any tower</option>` + B.filter((b) => standing.has(b.id)).map((b) => `<option value="${b.id}"${homes[g.rec.id] === b.id ? " selected" : ""}>Keeps to: ${b.name}</option>`).join("");
          sel.onchange = () => { const h2 = { ...(grammar().homes || {}) }; if (sel.value) h2[g.rec.id] = sel.value; else delete h2[g.rec.id]; grammar().homes = h2; applyGround(); ctx.touch(); };
          g1.appendChild(sel);
        }
      });
      return g1;
    }
    // the swimmers: World Scene's ecosystem, with the dials, diets and modes its own panels have
    function swimmersGroup(h) {
      const E = h.ecology(), SP = h.species(), g2 = el("div", "group"); g2.id = "swimmers3d";
      g2.innerHTML = `<div class="glabel">Swimmers · <span id="swimSum">${SP.reduce((n, s) => n + s.alive, 0)} alive · ${SP.reduce((n, s) => n + s.eaten, 0)} eaten</span></div>`;
      const pr = el("div", "btnrow3d");
      const pp = el("button", "f-btn", E.playing ? "Pause the world" : "Play"); pp.type = "button"; pp.id = "ecoPlay";
      pp.onclick = () => { h.play(!E.playing); ctx.render(); };
      const rn = el("button", "f-btn is-quiet", "Reset numbers"); rn.type = "button"; rn.onclick = () => { h.resetPop(); keepScene(); ctx.render(); };
      pr.append(pp, rn); g2.appendChild(pr);
      for (const d of h.controls("population")) g2.appendChild(sceneControl(h, "population", d));
      // every kind, with its count and its diet: a long list, so it opens on request
      const kinds = el("details", "more3d"); kinds.id = "kinds3d"; kinds.open = !!state.kindsOpen;
      kinds.ontoggle = () => { state.kindsOpen = kinds.open; };
      kinds.appendChild(el("summary", null, `${SP.length} kinds · counts and what they eat`));
      for (const sp of SP) {
        const row = el("div", "rowline"); row.style.marginBottom = "0";
        row.innerHTML = `<span class="who"><b></b><span class="hint-text" style="margin:0"></span></span>`; row.querySelector("b").textContent = sp.name; row.querySelector(".hint-text").textContent = sp.mood;
        const ct = el("span", "ct", String(sp.alive).padStart(2, "0")); ct.dataset.alive = sp.key; ct.title = "alive now";
        const step = Math.max(1, Math.round(sp.pop * 0.25));
        const set = (dd) => { h.setPop(sp.key, Math.max(0, Math.min(sp.max, Math.round(sp.pop) + dd * step))); keepScene(); setTimeout(ctx.render, 400); };
        row.append(stepper("−", -1, "Fewer " + sp.name, set), ct, stepper("+", 1, "More " + sp.name, set)); kinds.appendChild(row);
        const diet = el("div", "diet");
        diet.innerHTML = `${sp.eats.length ? "eats " + sp.eats.join(", ") : "eats nothing here"}${sp.avoids.length ? " · <em>avoids " + sp.avoids.join(", ") + "</em>" : ""} · escapes: ${sp.escape}<span data-tally="${sp.key}"></span>`;
        kinds.appendChild(diet);
      }
      g2.appendChild(kinds);
      return g2;
    }
    // everything about the life in the world, in reading order
    function lifeGroups(h) {
      return [walkersGroup(h), swimmersGroup(h),
        sceneGroup(h, "Behaviour", "modes", "Life: Ecosystem hunts, eats and flees; Boids only school. Pointer: what a click in the water does."),
        sceneGroup(h, "Schooling and bodies", "motion", null, true),
        sceneGroup(h, "Light, finish and water", "look", "The scene's palette, lines and atmosphere are the style, chosen over the scene and made on the Style page.", true),
        sceneGroup(h, "Overlay", "overlays", "Marks who is hunting whom, and who is fleeing, right now.")];
    }
    // the camera round the city, and pictures of it
    function cameraGroups(h, linkTo) {
      const cam = sceneGroup(h, "Camera", "camera", "Drag in the scene to turn and tilt, shift-drag to pan, scroll to zoom. Follow rides behind one creature; Follow another picks the next. Re-centre clears a pan. Tilt runs to 90° for a level side view, which pairs well with Orthographic.");
      cam.id = "camera3d";
      const fr = el("div", "btnrow3d");
      const a = el("button", "f-btn is-dense", "Whole city"); a.type = "button"; a.onclick = () => h.frame();
      const b = el("button", "f-btn is-dense", "Look down the road"); b.type = "button"; b.onclick = () => h.viewRoad();
      fr.append(a, b); cam.appendChild(fr);
      const cap = sceneGroup(h, "Capture", "capture", "Save PNG saves the world as it is drawn now. The link opens this city in World Scene on its own, with these settings.");
      const ln = el("button", "f-btn is-dense", "Copy World Scene link"); ln.type = "button"; ln.id = "copyLink3d";
      ln.onclick = async () => { const url = h.link(linkTo || {}); try { await navigator.clipboard.writeText(url); ln.textContent = "Copied"; } catch (e) { ln.textContent = "Couldn't copy"; } setTimeout(() => { ln.textContent = "Copy World Scene link"; }, 1400); };
      (cap.querySelector(".btnrow3d") || cap).appendChild(ln);
      return [cam, cap];
    }

    return { GW_HUES, applyGround, loadGround, loadingGround, keepScene, applyScene, sceneControl, sceneGroup, startDrift, captureVariant, driftGroup, driftNumbers, walkersGroup, swimmersGroup, lifeGroups, cameraGroups };
  }

  window.ForgeScene = { boot, buildings3d, create, GW_HUES, SCENE_URL };
})();
