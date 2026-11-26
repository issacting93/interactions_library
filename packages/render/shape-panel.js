/* ShapePanel: the controls that decide how a tank species' drawing becomes a solid, for a page that shows one species at a time (Specimen).

   What it edits is a species' shape (packages/kit/data/creature-shapes.js, read by EcologyRender.computeCore as render.core.shape[key]):

     { mode, thick, inner, crease, edge,      how a shape rises: belly (round), blade (a ridge) or plate (a flat top), and the four amounts
       wingThick, cap, res, wings,            wings and fins as a share of a body's depth; deepest, of the body's length; mesh detail; wings solid or not
       parts: { "<part name>": { as, mode, thick, inner, crease, edge, res } } }     one part's own: `as` is solid, tube or lines

   Every field is optional; a part falls back to the species, the species to the tank's defaults (DEF below, the numbers computeCore uses).

   Three modes:
     Extrude   the method (Belly, Blade, Plate) and the amounts, for the whole creature or the picked part
     Mesh      the mesh's edges drawn over the solid, mesh detail, and what a part is made as (solid, tube, lines)
     Stages    the build one step at a time: outline, fill, inflate, creases, lines

   A part is picked on the map (the creature's drawing laid flat, beside the stage) or with the stepper. Changes are kept on this device
   (localStorage) and Copy all gives the text creature-shapes.json takes, the changed ones marked by: "zac".

   The page owns the renderer. It asks this for three things each frame: shapes() for render.core.shape, edit() for render.edit, and
   cores() for whether solids must be on or off (null: leave them as the page has them).

     const panel = ShapePanel.mount({ row, map, species, base, strokesOf, tally, onChange });
     panel.show(i, usable); panel.active(on);
*/
(function () {
  "use strict";
  const DEF = { mode: "belly", thick: 0.7, inner: 0.2, crease: 0.3, edge: 0.05, wingThick: 0.3, cap: 0.07, res: 1 };
  const LKEY = "forge:specimen-shapes";
  // the names the Kit 3D Study uses, with what each does as its tooltip
  const METHODS = [["belly", "Belly", "Round, as deep as it is wide"], ["blade", "Blade", "Slopes to a ridge down the middle"], ["plate", "Plate", "Bevels to a flat top"]];
  const MAKE = [["", "Auto"], ["solid", "Solid"], ["tube", "Tube"], ["lines", "Lines"]];
  const STAGES = [["Outline", "The drawing: a closed outline is the rim of the solid"], ["Fill", "The outline filled with triangles, still flat"],
    ["Inflate", "The fill pushed out from the rim, with no inner detail yet"], ["Creases", "Inner shapes raised or sunk, inner lines pressed in"],
    ["Lines", "The drawing laid back on the surface, in its look"]];
  // a slider: [field, label, min, max, step, how the number is shown, creature only]
  const AMOUNTS = [["thick", "Thickness", 0.1, 2, 0.05, (v) => Math.round(v * 100), false], ["inner", "Inner shapes", -1, 1, 0.05, (v) => Math.round(v * 100), false],
    ["crease", "Crease depth", 0, 1, 0.05, (v) => Math.round(v * 100), false], ["edge", "Rim", 0, 0.4, 0.01, (v) => Math.round(v * 100), false],
    ["wingThick", "Wings", 0.05, 1, 0.05, (v) => Math.round(v * 100), true], ["cap", "Depth limit", 0.02, 0.2, 0.01, (v) => Math.round(v * 100), true]];
  const clone = (o) => JSON.parse(JSON.stringify(o || {}));
  const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; };
  const ARROW = (d) => `<svg viewBox="0 0 12 12"><path d="${d < 0 ? "M8 1 L3 6 L8 11" : "M4 1 L9 6 L4 11"}"/></svg>`;

  function mount(o) {
    const SP = o.species, BASE = o.base || {}; let MINE = {};
    try { MINE = JSON.parse(localStorage.getItem(LKEY) || "{}") || {}; } catch (e) { /* no storage here: changes last until the page is closed */ }
    const S = { i: 0, usable: true, on: false, mode: "extrude", pick: -1, stage: 5, rise: 1, wire: true, through: true, riseT0: 0, say: "" };   // through: the drawing shown over the solid
    const keyNow = () => (S.usable && SP[S.i] ? SP[S.i].key : null);
    const shapeOf = (key) => MINE[key] || BASE[key] || {};
    const partName = (pi) => { const sp = SP[S.i]; return sp && sp.ids ? sp.ids[pi] : String(pi); };
    // the value a control shows: the picked part's own, else the creature's, else the default
    const partOf = (sh) => (S.pick >= 0 ? (sh.parts || {})[partName(S.pick)] || {} : null);
    const valueOf = (f) => { const sh = shapeOf(keyNow()), p = partOf(sh); return p && p[f] != null ? p[f] : sh[f] != null ? sh[f] : DEF[f]; };
    const save = () => { try { localStorage.setItem(LKEY, JSON.stringify(MINE)); } catch (e) { /* kept in memory only */ } };
    // what the renderer is given (shapes()): the shapes as they stood when the dials last came to rest, so a dragged dial asks for one build, not one a pixel
    let applied = null, timer = 0;
    const apply = () => { const all = Object.assign({}, BASE, MINE), k = keyNow();
      // while a stage before Creases is shown, the species on screen is built without its inner detail
      if (S.on && k && S.mode === "stages" && S.stage <= 3) { const sh = clone(all[k]); sh.inner = 0; sh.crease = 0; for (const n in sh.parts || {}) { delete sh.parts[n].inner; delete sh.parts[n].crease; } all[k] = sh; }
      applied = Object.keys(all).length ? all : null; if (o.onChange) o.onChange(); };
    const changed = (now) => { clearTimeout(timer); if (now) apply(); else timer = setTimeout(apply, 140); };
    // change the creature's shape, or the picked part's
    function change(fn, say) { const k = keyNow(); if (!k) return; const sh = clone(shapeOf(k));
      if (S.pick >= 0) { sh.parts = sh.parts || {}; const n = partName(S.pick), p = sh.parts[n] || {}; fn(p, true); if (Object.keys(p).length) sh.parts[n] = p; else delete sh.parts[n]; if (!Object.keys(sh.parts).length) delete sh.parts; }
      else fn(sh, false);
      MINE[k] = sh; save(); S.say = say || ""; sync(); changed(); }

    // ---- the controls ----
    const row = o.row; row.textContent = "";
    const seg = (id, label, opts) => `<span class="grp" data-g="${id}"><span class="micro">${label}</span><span class="seg" id="sh-${id}">${opts.map(([v, t, tip]) => `<button type="button" data-v="${v}"${tip ? ` title="${tip}"` : ""}>${t}</button>`).join("")}</span></span>`;
    const slider = ([f, label, min, max, step]) => `<label class="sl" data-f="${f}"><span class="micro">${label}</span><input type="range" id="sh-${f}" min="${min}" max="${max}" step="${step}" aria-label="${label}"><b id="sh-${f}-v">0</b><small>%</small></label>`;
    row.append(
      el(seg("mode", "Edit", [["extrude", "Extrude"], ["mesh", "Mesh"], ["stages", "Stages"]])),
      el(`<span class="grp" data-g="part"><button type="button" class="step" id="sh-prev" aria-label="Previous part">${ARROW(-1)}</button><button type="button" id="sh-whole" aria-pressed="true">Whole creature</button><button type="button" class="step" id="sh-next" aria-label="Next part">${ARROW(1)}</button></span>`),
      el(`<span class="shm" data-m="extrude" style="display: contents">${seg("method", "Method", METHODS)}${AMOUNTS.map(slider).join("")}</span>`),
      el(`<span class="shm" data-m="mesh" style="display: contents">${seg("wire", "Mesh lines", [["1", "On"], ["0", "Off"]])}${slider(["res", "Detail", 0.3, 1.6, 0.05])}${seg("make", "Make it", MAKE)}${seg("wings", "Wings and fins", [["1", "Solid"], ["0", "Lines"]])}</span>`),
      el(`<span class="shm" data-m="stages" style="display: contents">${seg("stage", "Stage", STAGES.map(([t], i) => [i + 1, (i + 1) + " " + t]))}<label class="sl" data-f="rise"><span class="micro">Rise</span><input type="range" id="sh-rise" min="0" max="1" step="0.01" aria-label="How far the solid has risen"><b id="sh-rise-v">100</b><small>%</small></label></span>`),
      el(seg("through", "Drawing", [["0", "Under", "The solid hides the drawing behind it"], ["1", "Through", "The drawing shown over the solid"]])),
      el(`<span class="grp"><button type="button" id="sh-reset">Reset</button><button type="button" id="sh-copy">Copy all</button></span>`),
      el(`<span class="micro" id="sh-say" role="status"></span>`));
    const $ = (id) => row.querySelector("#sh-" + id);
    const press = (id, v) => { for (const b of $(id).children) b.setAttribute("aria-pressed", String(b.dataset.v === String(v))); };
    const onSeg = (id, fn) => { $(id).onclick = (e) => { const b = e.target.closest("button"); if (b) fn(b.dataset.v); }; };

    onSeg("mode", (v) => { S.mode = v; if (v === "stages") stage(S.stage); S.say = ""; sync(); changed(true); });
    // a method pressed again on a part gives the part back to the creature's
    onSeg("method", (v) => change((t, part) => { if (part && t.mode === v) delete t.mode; else t.mode = v; }));
    for (const a of AMOUNTS) $(a[0]).oninput = () => { const v = +$(a[0]).value; $(a[0] + "-v").textContent = a[5](v); change((t) => { t[a[0]] = v; }); };
    $("res").oninput = () => { const v = +$("res").value; $("res-v").textContent = Math.round(v * 100); change((t) => { t.res = v; }); };
    onSeg("wire", (v) => { S.wire = v === "1"; sync(); });
    onSeg("through", (v) => { S.through = v === "1"; try { localStorage.setItem("forge:shape-through", v); } catch (e) {} sync(); });
    try { const v = localStorage.getItem("forge:shape-through"); if (v != null) S.through = v === "1"; } catch (e) {}
    onSeg("make", (v) => change((t) => { if (v) t.as = v; else delete t.as; }));
    onSeg("wings", (v) => change((t) => { if (v === "1") delete t.wings; else t.wings = false; }));
    onSeg("stage", (v) => { stage(+v); sync(); changed(true); });
    $("rise").oninput = () => { S.rise = +$("rise").value; S.riseT0 = 0; $("rise-v").textContent = Math.round(S.rise * 100); };
    $("prev").onclick = () => pick(S.pick < 0 ? SP[S.i].parts - 1 : S.pick - 1);
    $("next").onclick = () => pick(S.pick + 1 >= SP[S.i].parts ? -1 : S.pick + 1);
    $("whole").onclick = () => pick(-1);
    $("reset").onclick = () => { const k = keyNow(); if (!k) return;
      if (S.pick >= 0) { const sh = clone(shapeOf(k)), n = partName(S.pick); if (sh.parts) { delete sh.parts[n]; if (!Object.keys(sh.parts).length) delete sh.parts; } MINE[k] = sh; S.say = "This part follows the creature again"; }
      else { delete MINE[k]; S.say = BASE[k] ? "Back to its saved shape" : "Back to the defaults"; }
      save(); sync(); changed(true); };
    // every shape as it now stands, as the text creature-shapes.json takes (the ones changed here marked by: "zac")
    $("copy").onclick = async () => { const out = {}; for (const sp of SP) { const sh = shapeOf(sp.key); if (Object.keys(sh).length) out[sp.key] = Object.assign({ name: sp.name }, sh, { by: MINE[sp.key] ? "zac" : sh.by || "claude" }); }
      const text = JSON.stringify(out, null, 1), n = Object.keys(out).length;
      try { await navigator.clipboard.writeText(text); S.say = n ? `Copied ${n} ${n === 1 ? "shape" : "shapes"} · ${Object.keys(MINE).length} changed here` : "Nothing changed yet"; } catch (e) { window.__shapesText = text; S.say = "Could not reach the clipboard"; }
      sync(); };

    function stage(n) { S.stage = Math.max(1, Math.min(5, n)); S.rise = S.stage <= 2 ? 0 : 1; S.riseT0 = S.stage === 3 ? performance.now() : 0; S.say = STAGES[S.stage - 1][1]; }
    function pick(pi) { S.pick = pi; S.say = ""; sync(); }

    // ---- the map: the creature's drawing laid flat, one tap a part ----
    const map = o.map, cv = map.querySelector("canvas"), cap = map.querySelector("[data-cap]"); let M = null;   // M: this species' strokes, boxes and the fit
    function readMap() { const sp = SP[S.i]; if (!sp || !S.usable) { M = null; return; }
      const st = o.strokesOf(sp), parts = [];
      for (let pi = 0; pi < sp.parts; pi++) { const polys = st.get(pi) || []; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const p of polys) for (let k = 0; k < p.length; k += 2) { x0 = Math.min(x0, p[k]); x1 = Math.max(x1, p[k]); y0 = Math.min(y0, p[k + 1]); y1 = Math.max(y1, p[k + 1]); }
        parts.push({ polys, x0, x1, y0, y1, area: polys.length ? (x1 - x0) * (y1 - y0) : Infinity }); }
      M = { parts, b: sp.bounds }; }
    function fit() { const b = M.b, W = b[2] - b[0], H = b[3] - b[1], cw = cv.clientWidth, ch = cv.clientHeight, pad = 8, k = Math.min((cw - pad * 2) / W, (ch - pad * 2) / H);
      return { k, ox: (cw - W * k) / 2 - b[0] * k, oy: (ch - H * k) / 2 - b[1] * k }; }
    function drawMap() { if (!M || map.hidden) return; const b = M.b, ratio = (b[3] - b[1]) / Math.max(1, b[2] - b[0]);
      cv.style.aspectRatio = String(1 / Math.max(0.6, Math.min(2.4, ratio)));
      const dpr = Math.min(2, window.devicePixelRatio || 1), cw = cv.clientWidth, ch = cv.clientHeight; if (!cw || !ch) return;
      if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
      const g = cv.getContext("2d"), f = fit(), own = (shapeOf(keyNow()).parts) || {}; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch); g.lineWidth = 1; g.lineJoin = "round";
      const trace = (pi) => { g.beginPath(); for (const p of M.parts[pi].polys) { for (let k = 0; k < p.length; k += 2) { const x = p[k] * f.k + f.ox, y = p[k + 1] * f.k + f.oy; if (k) g.lineTo(x, y); else g.moveTo(x, y); } } };
      for (let pi = 0; pi < M.parts.length; pi++) { if (pi === S.pick) continue; const ch2 = own[partName(pi)]; trace(pi);
        g.setLineDash(ch2 && ch2.as === "lines" ? [2, 2] : []); g.strokeStyle = ch2 ? "rgba(236,232,222,.95)" : "rgba(236,232,222,.34)"; g.stroke(); }   // a part with settings of its own is drawn at full strength; one left as lines, dashed
      g.setLineDash([]);
      if (S.pick >= 0 && M.parts[S.pick]) { trace(S.pick); g.fillStyle = "rgba(232,176,74,.16)"; g.fill("evenodd"); g.strokeStyle = "#E8B04A"; g.lineWidth = 1.5; g.stroke(); } }
    // which part is under a point of the sheet: the smallest one whose closed shapes hold it, else the nearest stroke within reach
    function hit(x, y, reach) { let best = -1, bestA = Infinity;
      for (let pi = 0; pi < M.parts.length; pi++) { const P = M.parts[pi]; if (x < P.x0 || x > P.x1 || y < P.y0 || y > P.y1 || P.area >= bestA) continue; let inside = false;
        for (const p of P.polys) { const n = p.length / 2; if (n < 4 || p[0] !== p[n * 2 - 2] || p[1] !== p[n * 2 - 1]) continue;
          for (let a = 0, c = n - 1; a < n; c = a++) { const xa = p[a * 2], ya = p[a * 2 + 1], xc = p[c * 2], yc = p[c * 2 + 1]; if ((ya > y) !== (yc > y) && x < ((xc - xa) * (y - ya)) / (yc - ya) + xa) inside = !inside; } }
        if (inside) { best = pi; bestA = P.area; } }
      if (best >= 0) return best; let bd = reach * reach;
      for (let pi = 0; pi < M.parts.length; pi++) { const P = M.parts[pi]; if (x < P.x0 - reach || x > P.x1 + reach || y < P.y0 - reach || y > P.y1 + reach) continue;
        for (const p of P.polys) for (let k = 0; k + 3 < p.length; k += 2) { const ax = p[k], ay = p[k + 1], dx = p[k + 2] - ax, dy = p[k + 3] - ay, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0, d = (x - ax - dx * t) ** 2 + (y - ay - dy * t) ** 2; if (d < bd) { bd = d; best = pi; } } }
      return best; }
    cv.addEventListener("click", (e) => { if (!M) return; const r = cv.getBoundingClientRect(), f = fit(); pick(hit((e.clientX - r.left - f.ox) / f.k, (e.clientY - r.top - f.oy) / f.k, 10 / f.k)); });
    window.addEventListener("resize", drawMap);

    // ---- everything shown follows the state ----
    function sync() { const k = keyNow(), sh = shapeOf(k), isPart = S.pick >= 0, p = partOf(sh) || {}, sp = SP[S.i];
      row.classList.toggle("off", !k); press("mode", S.mode); press("through", S.through ? 1 : 0);
      for (const m of row.querySelectorAll(".shm")) for (const c of m.children) c.hidden = m.dataset.m !== S.mode;
      $("whole").textContent = isPart ? String(S.pick + 1).padStart(2, "0") + " · " + partName(S.pick) : "Whole creature"; $("whole").setAttribute("aria-pressed", String(!isPart)); $("whole").title = isPart ? "Back to the whole creature" : "";
      if (S.mode === "extrude") { press("method", isPart ? p.mode || "" : sh.mode || DEF.mode);
        for (const a of AMOUNTS) { const v = valueOf(a[0]); $(a[0]).value = v; $(a[0] + "-v").textContent = a[5](v); $(a[0]).closest("label").hidden = isPart && a[6]; } }
      if (S.mode === "mesh") { press("wire", S.wire ? 1 : 0); const v = valueOf("res"); $("res").value = v; $("res-v").textContent = Math.round(v * 100);
        $("make").closest(".grp").hidden = !isPart; press("make", p.as || ""); $("wings").closest(".grp").hidden = isPart; press("wings", sh.wings === false ? 0 : 1); }
      if (S.mode === "stages") { press("stage", S.stage); $("rise").value = S.rise; $("rise-v").textContent = Math.round(S.rise * 100); $("rise").closest("label").classList.toggle("dim", S.stage < 3); }
      $("reset").textContent = isPart ? "Reset part" : "Reset";
      // what to say: a message from the last action, else what is picked and how far it has been changed
      const t = o.tally && o.tally(S.i), n = Object.keys(sh.parts || {}).length, tris = isPart && t && t.partTris ? t.partTris[S.pick] : -1;
      $("say").textContent = !k ? "Shown walking: its solids come from the walker engine" : S.say ? S.say
        : isPart ? (tris > 0 ? `${tris > 999 ? (tris / 1000).toFixed(1) + "k" : tris} triangles` : tris === 0 ? "Not solid: drawn as lines" : "") + (sh.parts && sh.parts[partName(S.pick)] ? " · has settings of its own" : " · follows the creature")
        : MINE[k] ? `Changed here · kept on this device${n ? ` · ${n} ${n === 1 ? "part" : "parts"} with their own` : ""}` : BASE[k] ? "Its saved shape" : "The tank's defaults";
      cap.textContent = !k ? "" : `${sp.parts} parts · tap one · tap outside for the whole creature`;
      drawMap(); }

    apply();
    return {
      // the species on screen changed (usable: it swims, so its solid is a core this panel can shape)
      show(i, usable) { const was = S.i; S.i = i; S.usable = !!usable && i < SP.length; if (was !== i) { S.pick = -1; S.say = ""; } readMap(); map.hidden = !S.on || !M; sync(); changed(true); },
      // the panel's tab was opened or left
      active(on) { S.on = !!on; map.hidden = !on || !M; if (on) { if (S.mode === "stages") stage(S.stage); sync(); } changed(true); },
      // every species' shape (render.core.shape)
      shapes() { return applied; },
      // render.edit while the panel is open: the picked part lit, and the mode's own view of the solid
      edit() { if (!S.on || !keyNow()) return null; const e = { pick: S.pick, rise: 1, wire: 0, plain: false, lines: 1, through: S.through ? 1 : 0 };
        if (S.mode === "mesh" && S.wire) { e.wire = 0.5; e.plain = true; e.lines = 0.5; }
        if (S.mode === "stages") { if (S.riseT0) { const u = Math.min(1, (performance.now() - S.riseT0) / 1400); S.rise = u * u * (3 - 2 * u); $("rise").value = S.rise; $("rise-v").textContent = Math.round(S.rise * 100); if (u >= 1) S.riseT0 = 0; }
          const n = S.stage; e.rise = n === 2 ? 0 : S.rise; e.wire = n === 2 ? 0.6 : n === 3 ? 0.45 : n === 4 ? 0.22 : 0; e.plain = n < 5; e.lines = n === 1 || n === 5 ? 1 : n === 2 ? 0.4 : 0.25; }
        return e; },
      // whether the solids must be shown: on while the panel is open, off for the Outline stage; null leaves it to the page
      cores() { return !S.on || !keyNow() ? null : S.mode === "stages" && S.stage === 1 ? 0 : 1; },
      wantsWire() { return S.on; },
      state: S, sync, pick, stage: (n) => { stage(n); sync(); changed(true); }, mode: (m) => { S.mode = m; if (m === "stages") stage(S.stage); sync(); changed(true); },
      set(fn, say) { change(fn, say); }, mine: () => MINE, DEF,
    };
  }
  window.ShapePanel = { mount, DEF };
})();
