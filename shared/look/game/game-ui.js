/* Game UI kit: the widgets a player touches while they play, drawn in Forge's reliquary language.
   Each widget is mounted once and then drawn from a small state object every frame, so the tank,
   a gallery page or a later port all drive the same parts. Nothing here reads the sim.

     GameUI.reticle(parent)  .draw({ x, y, r, charge, mode, dt })      the lunge aim, closing on its target
                             mode: "charge" (grey, nothing catchable) · "hit" (green, it will connect) · "refuse" (red, too big or not food)
     GameUI.dial(parent)     .draw({ x, y, r, hold, free, ang, dt })   the struggle when something has you in its jaw
                             hold: share of the grip left (1 → 0) · free: how hard you are twisting (0 → 1) · ang: the stick's angle
     GameUI.sheet(parent, h) .draw(model)                              Mutate: Forge's Compose hex, fed by what the Maw ate
                             model: { owed, stock, stockMax, places:[{label, art, cls}], opts:[{kind, tag, name, from, art}], sel, say }
                             h: { pick(i), grow(), later() }
     GameUI.honey(n)         the honeycomb slots Compose uses: centre, then the rings, as [left, top] for a 104 × 90 cell

   Mechanisms taken from the library, not its looks: the reticle is a ring with closing ticks,
   the dial is a bezel round a moving index (Helm Dial), the sheet is Compose's place-then-honeycomb (compose-hex).
   Look: flat hairlines, Barlow Condensed caps, Cormorant italic numerals; no glows, gradients or shadows. */
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg", TAU = Math.PI * 2;
  const C = { ink: "#e8e6df", mut: "#a9aca6", line: "#3a403d", line2: "#5a6360", bg: "#0b0e0d", tile: "#0f1413",
    gold: "#e8b04a", hit: "#9be26a", nohit: "#ec5c4c", charge: "#a9aca6",
    paper: "#e6e4dd", pink: "#1b1d1c", pmut: "#5a5d58", pacc: "#8a5a00" };
  const ROM = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI"];
  const css = `
.gu-layer{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:4}
.gu-layer svg{position:absolute;left:0;top:0;overflow:visible}
.gu-cap{font:600 11px 'Barlow Condensed',sans-serif;letter-spacing:.16em;text-transform:uppercase}
.gu-sheet{position:absolute;left:50%;bottom:calc(10px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);width:min(440px,calc(100vw - 16px));max-height:calc(100% - 20px);overflow:auto;box-sizing:border-box;padding:16px 18px 14px;background:${C.paper};color:${C.pink};border-radius:22px;pointer-events:auto;font:14px/20px 'Barlow',system-ui,sans-serif;z-index:6;-webkit-user-select:none;user-select:none;scrollbar-width:none}
.gu-sheet::-webkit-scrollbar{display:none}
.gu-sheet[hidden]{display:none}
.gu-sheet .grab{width:56px;height:4px;border-radius:2px;background:#b9b7ae;margin:-6px auto 10px}
.gu-sheet .hd{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.gu-sheet h2{margin:0;font:italic 500 38px/40px 'Cormorant Garamond',serif}
.gu-sheet .sub{color:${C.pmut};font-size:14px;margin-top:2px}
.gu-sheet .gu-k{font:600 12px 'Barlow Condensed',sans-serif;letter-spacing:.14em;text-transform:uppercase;color:${C.pmut}}
.gu-sheet .stock{flex:none;display:grid;justify-items:center;gap:2px}
.gu-sheet .plan{display:flex;align-items:flex-start;gap:4px;margin-top:8px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}
.gu-sheet .plan::-webkit-scrollbar{display:none}
.gu-sheet .pl{flex:none;display:grid;justify-items:center;gap:2px;width:56px}
.gu-sheet .pl .n{font:italic 500 16px/18px 'Cormorant Garamond',serif}
.gu-sheet .pl .r{font:600 9px 'Barlow Condensed',sans-serif;letter-spacing:.06em;text-transform:uppercase;color:${C.pmut};white-space:nowrap}
.gu-hx{display:block;position:relative;flex:none;clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%);background:rgba(27,29,28,.5)}
.gu-hx>.in{position:absolute;inset:2px;clip-path:inherit;background:${C.tile};color:${C.ink};display:grid;place-items:center}
.gu-hx svg{width:62%;height:62%;overflow:visible}
.gu-hx svg *{fill:none!important;stroke:currentColor!important;stroke-width:1.2px!important;vector-effect:non-scaling-stroke}
.gu-hx.sm{width:44px;height:38px}
.gu-hx.base>.in{color:${C.mut}}
.gu-hx.ghost,.gu-hx.re{background:${C.pacc}}
.gu-hx.ghost>.in{background:#1d1a12;color:${C.gold}}
.gu-sheet .link{display:flex;justify-content:center;height:22px}
.gu-sheet .honey{position:relative;width:260px;height:270px;margin:0 auto}
.gu-sheet .honey button{all:unset;position:absolute;width:104px;height:90px;cursor:pointer}
.gu-sheet .honey button .gu-hx{width:104px;height:90px}
.gu-sheet .honey button:hover .gu-hx,.gu-sheet .honey button:focus-visible .gu-hx{background:${C.pink}}
.gu-sheet .honey button.sel .gu-hx{background:${C.pacc}}
.gu-sheet .honey button.sel .gu-hx>.in{inset:3px}
.gu-sheet .honey .gu-hx>.in{grid-template-rows:20px 1fr 22px;padding:4px 0 6px;box-sizing:border-box}
.gu-sheet .honey .gu-hx svg{width:34px;height:34px;align-self:center}
.gu-sheet .honey .t{font:600 9px 'Barlow Condensed',sans-serif;letter-spacing:.16em;text-transform:uppercase;align-self:end}
.gu-sheet .honey .t.part{color:${C.mut}} .gu-sheet .honey .t.ability{color:#7fd6c2} .gu-sheet .honey .t.form{color:${C.gold}}
.gu-sheet .honey .k{font:600 12px 'Barlow Condensed',sans-serif;letter-spacing:.12em;text-transform:uppercase;color:${C.ink}}
.gu-sheet .honey .empty .gu-hx{background:none;outline:1px dashed ${C.pmut};outline-offset:-1px;clip-path:none}
.gu-sheet .honey .empty .gu-hx{background:transparent}
.gu-sheet .det{min-height:62px;margin-top:6px}
.gu-sheet .det b{display:block;font:600 24px/28px 'Cormorant Garamond',serif}
.gu-sheet .det span{color:${C.pmut};font-size:14px;line-height:19px}
.gu-sheet .ft{display:flex;align-items:center;justify-content:space-between;margin-top:10px}
.gu-sheet .ft button{height:44px;padding:0 24px;border-radius:22px;font:600 15px 'Barlow Condensed',sans-serif;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}
.gu-sheet .later{border:0;background:none;color:${C.pmut};padding:0 4px!important}
.gu-sheet .grow{border:0;background:${C.pink};color:${C.paper}}
.gu-sheet .grow:disabled{opacity:.35;cursor:default}
.gu-sheet button:focus-visible{outline:1px solid ${C.pacc};outline-offset:2px}
@media (max-height:640px){.gu-sheet .honey{zoom:.8}}
`;
  let styled = false;
  function style() { if (styled) return; styled = true; const s = document.createElement("style"); s.id = "game-ui-css"; s.textContent = css; document.head.appendChild(s); }
  function el(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  function arcD(r, a0, a1) { // degrees, 0 = 12 o'clock, clockwise
    const p = (a) => [r * Math.sin(a * Math.PI / 180), -r * Math.cos(a * Math.PI / 180)], [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; }
  function layer(parent) { style(); let L = parent.querySelector(":scope > .gu-layer"); if (!L) { L = document.createElement("div"); L.className = "gu-layer"; parent.appendChild(L); } return L; }
  const colOf = (mode) => mode === "hit" ? C.hit : mode === "refuse" ? C.nohit : C.charge;

  // ---- the lunge reticle: one ring on the target, four ticks that close in as the coil fills, the charge as an arc round it.
  // Grey while charging, green when the strike will connect (the ring goes solid), red with a cross when it is too big ----
  function reticle(parent) {
    const L = layer(parent), svg = el("svg", { width: 1, height: 1, "aria-hidden": "true" }, L), g = el("g", {}, svg); svg.style.display = "none";
    const ring = el("circle", { r: 1, fill: "none" }, g), arc = el("path", { fill: "none", "stroke-linecap": "butt" }, g), ticks = [0, 1, 2, 3].map(() => el("line", { "stroke-linecap": "round" }, g));
    const xmark = el("g", {}, g), xa = el("line", {}, xmark), xb = el("line", {}, xmark);
    const tag = el("text", { "text-anchor": "middle", class: "gu-cap", "font-size": 12 }, g);
    let shown = false, open = 1;
    return { el: svg, draw(s) {
      if (!s || !s.show) { if (shown) { svg.style.display = "none"; shown = false; } return; }
      if (!shown) { svg.style.display = ""; shown = true; open = 1; }
      const dt = s.dt || 1 / 60, ch = Math.max(0, Math.min(1, s.charge || 0)), col = colOf(s.mode), hit = s.mode === "hit", no = s.mode === "refuse";
      open += ((hit ? 0 : 1 - ch) - open) * Math.min(1, dt * 12);   // the ticks close onto the ring as it coils
      const r = Math.max(14, s.r || 30), gap = 6 + 22 * open, len = 8;
      svg.style.transform = `translate(${s.x}px,${s.y}px)`;
      ring.setAttribute("r", r); ring.setAttribute("stroke", col); ring.setAttribute("stroke-width", hit ? 2 : 1.2); ring.setAttribute("stroke-dasharray", hit || no ? "none" : "3 4");
      ticks.forEach((t, i) => { const a = i * Math.PI / 2, c = Math.cos(a), sn = Math.sin(a), r0 = r + gap, r1 = r0 + len;
        t.setAttribute("x1", (c * r0).toFixed(1)); t.setAttribute("y1", (sn * r0).toFixed(1)); t.setAttribute("x2", (c * r1).toFixed(1)); t.setAttribute("y2", (sn * r1).toFixed(1)); t.setAttribute("stroke", col); t.setAttribute("stroke-width", 1.6); });
      arc.setAttribute("stroke", col); arc.setAttribute("stroke-width", 2.5); arc.setAttribute("d", !hit && !no && ch > 0.005 ? arcD(r + 4, 0, Math.min(359.9, ch * 360)) : "");
      const k = r * 0.45; xmark.style.display = no ? "" : "none";
      for (const [ln, sg] of [[xa, 1], [xb, -1]]) { ln.setAttribute("x1", -k); ln.setAttribute("y1", -k * sg); ln.setAttribute("x2", k); ln.setAttribute("y2", k * sg); ln.setAttribute("stroke", col); ln.setAttribute("stroke-width", 1.6); }
      tag.setAttribute("fill", col); tag.setAttribute("y", (r + gap + len + 16).toFixed(1)); tag.textContent = hit ? "RELEASE" : no ? "TOO BIG" : "";
    } };
  }

  // ---- the struggle dial: a bezel round you while something holds you. The red arc is the grip it has left;
  // the green arc is how hard you twist (turn the stick, or tap left and right); the index follows the stick ----
  function dial(parent) {
    const L = layer(parent), svg = el("svg", { width: 1, height: 1, "aria-hidden": "true" }, L), g = el("g", {}, svg); svg.style.display = "none";
    el("circle", { r: 100, fill: "none", stroke: C.line, "stroke-width": 9, "stroke-dasharray": "1 8.1" }, g);
    el("circle", { r: 90, fill: "none", stroke: C.mut, "stroke-width": 0.8 }, g);
    const hold = el("path", { fill: "none", stroke: C.nohit, "stroke-width": 4, "stroke-linecap": "butt" }, g);
    el("circle", { r: 76, fill: "none", stroke: C.line, "stroke-width": 0.8, "stroke-dasharray": "4 5" }, g);
    const free = el("path", { fill: "none", stroke: C.hit, "stroke-width": 4, "stroke-linecap": "butt" }, g);
    const idx = el("g", {}, g); el("path", { d: "M-8 -112 L0 -100 L8 -112", fill: "none", stroke: C.ink, "stroke-width": 1.6, "stroke-linejoin": "round" }, idx); el("line", { x1: 0, y1: -98, x2: 0, y2: -70, stroke: C.ink, "stroke-width": 1 }, idx);
    const t1 = el("text", { y: 132, "text-anchor": "middle", class: "gu-cap", fill: C.nohit, "font-size": 15 }, g);
    const t2 = el("text", { y: -122, "text-anchor": "middle", class: "gu-cap", fill: C.ink, "font-size": 13 }, g);
    let shown = false, a = 0;
    return { el: svg, draw(s) {
      if (!s || !s.show) { if (shown) { svg.style.display = "none"; shown = false; } return; }
      if (!shown) { svg.style.display = ""; shown = true; }
      const k = Math.max(30, s.r || 60) / 90, h = Math.max(0, Math.min(1, s.hold)), f = Math.max(0, Math.min(1, s.free)), dt = s.dt || 1 / 60;
      svg.style.transform = `translate(${s.x}px,${s.y}px)`; g.setAttribute("transform", `scale(${k.toFixed(3)})`);
      hold.setAttribute("d", h > 0.005 ? arcD(90, 0, Math.min(359.9, h * 360)) : ""); free.setAttribute("d", f > 0.005 ? arcD(76, 0, Math.min(359.9, f * 360)) : "");
      if (s.ang != null) a = s.ang * 180 / Math.PI + 90; else a += dt * 90 * (0.3 + f);
      idx.setAttribute("transform", `rotate(${a.toFixed(1)})`);
      for (const t of [t1, t2]) t.setAttribute("font-size", ((t === t1 ? 15 : 13) / k).toFixed(1));
      t1.setAttribute("y", (106 + 26 / k).toFixed(1)); t2.setAttribute("y", (-108 - 14 / k).toFixed(1));
      t1.textContent = "CAUGHT"; t2.textContent = f > 0.6 ? "BREAKING FREE" : "TWIST FREE";
    } };
  }

  // ---- the honeycomb Compose lays its options on: the centre, then the first ring, then the second (flat-top hexes, 104 × 90) ----
  const RINGS = [[0, 0], [0, -2], [1, -1], [1, 1], [0, 2], [-1, 1], [-1, -1], [0, -4], [1, -3], [2, -2], [2, 0], [2, 2], [1, 3], [0, 4], [-1, 3], [-2, 2], [-2, 0], [-2, -2], [-1, -3]];
  function honey(n, cx, cy) { cx = cx == null ? 130 : cx; cy = cy == null ? 135 : cy; return RINGS.slice(0, n).map(([q, r]) => [cx + q * 78 - 52, cy + r * 45 - 45]); }

  // ---- Mutate: Compose's place, then honeycomb, on paper. The body plan runs head to tail as small hexes with Roman numerals;
  // the selected option sits in the middle of the honeycomb (as Compose puts the chosen part there) and the rest ring it ----
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function stockDial(n, max) {
    const r = 22, segs = []; for (let i = 0; i < max; i++) { const a0 = i / max * 360 + 5, a1 = (i + 1) / max * 360 - 5; segs.push(`<path d="${arcD(r, a0, a1)}" fill="none" stroke="${i < n ? C.pink : "#c9c7be"}" stroke-width="4"/>`); }
    return `<svg width="58" height="58" viewBox="-29 -29 58 58" aria-hidden="true">${segs.join("")}<text y="8" text-anchor="middle" style="font:italic 500 22px 'Cormorant Garamond',serif" fill="${C.pink}">${n}</text></svg>`; }
  function sheet(parent, h) {
    style(); const root = document.createElement("div"); root.className = "gu-sheet"; root.hidden = true; root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "Mutate"); parent.appendChild(root);
    let order = [], sig = "";
    root.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.i != null) h.pick(+b.dataset.i); else if (b.classList.contains("grow")) h.grow(); else if (b.classList.contains("later")) h.later(); });
    return { el: root, open(on) { root.hidden = !on; if (on) sig = ""; }, get hidden() { return root.hidden; }, draw(m) {
      const s = JSON.stringify([m.owed, m.stock, m.sel, m.places.map((p) => p.label + p.cls), m.opts.map((o) => o.kind + o.from)]); if (s === sig) return; sig = s;
      // the chosen one goes to the middle; the others keep their order round it
      order = m.opts.map((_, i) => i); if (m.sel >= 0) order = [m.sel, ...order.filter((i) => i !== m.sel)]; else order = [-1, ...order];
      const P0 = honey(Math.min(order.length, 7)), y0 = Math.min(...P0.map((q) => q[1])), y1 = Math.max(...P0.map((q) => q[1])), P = P0.map(([x, y]) => [x, y - y0]), sel = m.opts[m.sel];
      const cell = (o, i, pos) => i < 0 ? `<button type="button" class="empty" disabled style="left:${pos[0]}px;top:${pos[1]}px" aria-hidden="true"><span class="gu-hx"><span class="in" style="background:transparent;color:${C.pmut}"><span></span><span class="gu-cap" style="align-self:center;color:${C.pmut}">Pick one</span><span></span></span></span></button>`
        : `<button type="button" data-i="${i}" class="${i === m.sel ? "sel" : ""}" style="left:${pos[0]}px;top:${pos[1]}px" aria-pressed="${i === m.sel}" aria-label="${esc(o.name)}, ${esc(o.tag)}, from ${esc(o.from)}"><span class="gu-hx"><span class="in"><span class="t ${o.tag.toLowerCase()}">${esc(o.tag)}</span>${o.art || ""}<span class="k">${esc(o.name)}</span></span></span></button>`;
      const lit = m.places.filter((p) => /ghost|re/.test(p.cls)).length, ghost = lit === m.places.length ? -2 : m.places.findIndex((p) => /ghost|re/.test(p.cls));
      root.innerHTML = `<div class="grab"></div>
        <div class="hd"><div><h2>Mutate</h2><div class="sub">${m.owed > 1 ? `${m.owed} levels to spend · one change each` : "Pick a place in the body, then one change."}</div></div>
          <div class="stock">${stockDial(m.stock, m.stockMax)}<span class="gu-k" style="font-size:10px">Stock · ${m.stock} of ${m.stockMax}</span></div></div>
        <div class="gu-k" style="margin-top:12px">Place in the body${ghost === -2 ? " · the whole body" : ghost >= 0 ? ` · ${ROM[ghost] || ghost + 1} · ${esc(m.places[ghost].label)}` : ""}</div>
        <div class="plan">${m.places.map((p, i) => `<div class="pl"><span class="gu-hx sm ${p.cls}"><span class="in">${p.art || ""}</span></span><span class="n" style="color:${/ghost|re/.test(p.cls) ? C.pacc : C.pink}">${ROM[i] || i + 1}</span><span class="r">${esc(p.label)}</span></div>`).join("")}</div>
        <div class="link"><svg width="2" height="22" aria-hidden="true"><path d="M1 0 V22" stroke="${C.pacc}" stroke-dasharray="4 4"/></svg></div>
        <div class="honey" style="height:${y1 - y0 + 90}px">${order.slice(0, 7).map((i, k) => cell(m.opts[i], i, P[k])).join("")}</div>
        <div class="det">${sel ? `<b>${esc(sel.name)}</b><span>${esc(m.say)}</span>` : `<b style="color:${C.pmut}">Choose a change</b><span>Everything here comes from what it ate.</span>`}</div>
        <div class="ft"><button type="button" class="later">Later</button><button type="button" class="grow" ${sel ? "" : "disabled"}>Grow</button></div>`;
      const g = root.querySelector(".plan .ghost, .plan .re"); if (g && g.scrollIntoView) g.closest(".pl").scrollIntoView({ block: "nearest", inline: "center" });
    } };
  }

  window.GameUI = { reticle, dial, sheet, honey, COLORS: C, ROMAN: ROM };
})();
