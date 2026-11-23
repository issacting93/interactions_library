/* Game UI kit: the widgets a player touches while they play, drawn in Forge's reliquary language.
   Each widget is mounted once and then drawn from a small state object every frame, so the tank,
   a gallery page or a later port all drive the same parts. Nothing here reads the sim.

     GameUI.reticle(parent)  .draw({ x, y, r, charge, mode, dt })      the lunge aim, closing on its target
                             mode: "charge" (grey, nothing catchable) · "hit" (green, it will connect) · "refuse" (red, too big or not food)
     GameUI.dial(parent)     .draw({ x, y, r, hold, free, ang, dt })   the struggle when something has you in its jaw
                             hold: share of the grip left (1 → 0) · free: how hard you are twisting (0 → 1) · ang: the stick's angle
     GameUI.sheet(parent, h) .draw(model)                              Mutate: Forge's Compose hex layout in the tank's style, fed by what the Maw ate
                             model: { owed, stock, stockMax, places:[{label, art, cls}], opts:[{kind, tag, name, from, art}], sel, say }
                             h: { pick(i), grow(), later() }
     GameUI.rig(parent, h)   .draw(model) .frame({ pts, c, axis })   Mutate drawn on the Maw: tags on its body, a hex grid of what it can grow beside it
     GameUI.honey(n)         the honeycomb slots Compose uses: centre, then the rings, as [left, top] for a 104 × 90 cell

   Mechanisms taken from the library, not its looks: the reticle is a hand-drawn jaw (fangs.js) that closes,
   the dial is a bezel round a moving index (Helm Dial), the sheet is Compose's place-then-honeycomb (compose-hex), dressed in the tank's own panel style.
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
.gu-sheet{position:absolute;left:50%;bottom:calc(10px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);width:min(420px,calc(100vw - 16px));max-height:calc(100% - 20px);overflow:auto;box-sizing:border-box;padding:16px 16px 14px;background:color-mix(in srgb,var(--void,#0d0a14) 92%,transparent);border:1px solid var(--line,#33243d);border-radius:14px;color:var(--text,#f1ece8);pointer-events:auto;font:12px/17px var(--mono,"JetBrains Mono","IBM Plex Mono",ui-monospace,monospace);z-index:6;-webkit-user-select:none;user-select:none;scrollbar-width:none}
.gu-sheet::-webkit-scrollbar{display:none}
.gu-sheet[hidden]{display:none}
.gu-sheet .grab{display:none}
.gu-sheet .hd{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:12px;border-bottom:1px solid var(--line,#33243d)}
.gu-sheet h2{margin:0;font:600 13px/18px var(--mono,"JetBrains Mono","IBM Plex Mono",ui-monospace,monospace);letter-spacing:.2em;text-transform:uppercase;color:var(--gold,#e8a23c)}
.gu-sheet .sub{color:var(--muted,#9a8aa3);font-size:11px;line-height:16px;margin-top:4px}
.gu-sheet .gu-k{font:500 9px/14px var(--mono,"JetBrains Mono","IBM Plex Mono",ui-monospace,monospace);letter-spacing:.18em;text-transform:uppercase;color:var(--muted,#9a8aa3)}
.gu-sheet .stock{flex:none;display:flex;align-items:center;gap:8px}
.gu-sheet .plan{display:grid;grid-template-columns:repeat(var(--n,8),minmax(0,1fr));align-items:start;gap:2px;margin-top:8px}
.gu-sheet .plan::-webkit-scrollbar{display:none}
.gu-sheet .pl{display:grid;grid-template-columns:minmax(0,1fr);justify-items:center;gap:3px;min-width:0}
.gu-sheet .pl .n{font:500 10px/12px var(--mono,"JetBrains Mono","IBM Plex Mono",ui-monospace,monospace);letter-spacing:.08em}
.gu-sheet .pl .r{display:none;font:500 8px/10px var(--mono,"JetBrains Mono","IBM Plex Mono",ui-monospace,monospace);letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#9a8aa3);white-space:nowrap}
.gu-hx{display:block;position:relative;flex:none;clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%);background:var(--line-2,#4a3456)}
.gu-hx>.in{position:absolute;inset:1px;clip-path:inherit;background:var(--card,#1b1422);color:var(--text,#f1ece8);display:grid;place-items:center}
.gu-hx svg{width:62%;height:62%;overflow:visible}
.gu-hx svg *{fill:none!important;stroke:currentColor!important;stroke-width:1.2px!important;vector-effect:non-scaling-stroke}
.gu-hx.sm{width:100%;max-width:44px;height:auto;aspect-ratio:44/38}
.gu-hx.base>.in{color:var(--muted,#9a8aa3)}
.gu-hx.ghost,.gu-hx.re{background:var(--gold,#e8a23c)}
.gu-hx.ghost>.in{background:var(--card-2,#241a2e);color:var(--gold,#e8a23c)}
.gu-sheet .link{display:flex;justify-content:center;height:18px}
.gu-sheet .honey{position:relative;width:260px;height:270px;margin:0 auto}
.gu-sheet .honey button{all:unset;position:absolute;width:104px;height:90px;cursor:pointer}
.gu-sheet .honey button .gu-hx{width:104px;height:90px}
.gu-sheet .honey button:hover .gu-hx,.gu-sheet .honey button:focus-visible .gu-hx{background:var(--text,#f1ece8)}
.gu-sheet .honey button.sel .gu-hx{background:var(--gold,#e8a23c)}
.gu-sheet .honey button.sel .gu-hx>.in{inset:2px;background:var(--card-2,#241a2e)}
.gu-sheet .honey .gu-hx>.in{grid-template-rows:20px 1fr 22px;padding:4px 0 6px;box-sizing:border-box}
.gu-sheet .honey .gu-hx svg{width:32px;height:32px;align-self:center}
.gu-sheet .honey .t{font:500 8px var(--mono,"JetBrains Mono","IBM Plex Mono",ui-monospace,monospace);letter-spacing:.18em;text-transform:uppercase;align-self:end}
.gu-sheet .honey .t.part{color:var(--muted,#9a8aa3)} .gu-sheet .honey .t.ability{color:var(--yellow,#6fe8e6)} .gu-sheet .honey .t.form{color:var(--gold,#e8a23c)}
.gu-sheet .honey .k{font:600 10px var(--mono,"JetBrains Mono","IBM Plex Mono",ui-monospace,monospace);letter-spacing:.14em;text-transform:uppercase;color:var(--text,#f1ece8)}
.gu-sheet .honey .empty .gu-hx{background:transparent;clip-path:none}
.gu-sheet .det{min-height:54px;margin-top:8px;padding-top:10px;border-top:1px solid var(--line,#33243d)}
.gu-sheet .det b{display:block;font:600 11px/16px var(--mono,"JetBrains Mono","IBM Plex Mono",ui-monospace,monospace);letter-spacing:.16em;text-transform:uppercase}
.gu-sheet .det span{color:var(--muted,#9a8aa3);font-size:11px;line-height:16px}
.gu-sheet .sx{display:grid;gap:2px;margin-top:8px}
.gu-sheet .sx>div{display:grid;grid-template-columns:72px 1fr auto;align-items:baseline;gap:8px;font:500 10px/18px var(--mono,"JetBrains Mono",ui-monospace,monospace);letter-spacing:.08em;font-variant-numeric:tabular-nums}
.gu-sheet .sx>div>span:first-child{text-transform:uppercase;letter-spacing:.16em;color:var(--muted,#9a8aa3);font-size:9px}
.gu-sheet .sx b{display:inline;font:600 11px var(--mono,ui-monospace,monospace);letter-spacing:.04em;text-transform:none}
.gu-sheet .sx em{font-style:normal;font-weight:600}
.gu-sheet .sx .up em,.gu-sheet .sx .up b{color:#9be26a} .gu-sheet .sx .down em,.gu-sheet .sx .down b{color:#ec5c4c}
.gu-sheet .ft{position:sticky;bottom:-14px;display:flex;align-items:center;justify-content:space-between;gap:8px;margin:10px -2px -14px;padding:0 2px 14px;background:inherit}
.gu-sheet .ft button{height:44px;padding:0 20px;border-radius:10px;font:600 11px var(--mono,"JetBrains Mono","IBM Plex Mono",ui-monospace,monospace);letter-spacing:.2em;text-transform:uppercase;cursor:pointer;min-height:0}
.gu-sheet .later{border:1px solid var(--line-2,#4a3456);background:none;color:var(--muted,#9a8aa3)}
.gu-sheet .grow{border:1px solid var(--gold,#e8a23c);background:var(--gold,#e8a23c);color:var(--void,#0d0a14);flex:1;max-width:180px}
.gu-sheet .grow:disabled{background:none;color:var(--faint,#5c4e66);border-color:var(--line,#33243d);cursor:default}
.gu-sheet button:focus-visible{outline:1px solid var(--gold,#e8a23c);outline-offset:2px}
@media (max-height:720px){.gu-sheet .link{height:10px}.gu-sheet .det{margin-top:4px;padding-top:6px}.gu-sheet .plan{margin-top:6px}}
@media (max-width:560px){
.gu-sheet{left:0;right:0;bottom:0;transform:none;width:auto;max-height:82%;border-radius:16px 16px 0 0;border-width:1px 0 0;padding:8px 14px calc(12px + env(safe-area-inset-bottom,0px))}
.gu-sheet .grab{display:block;width:40px;height:4px;border-radius:2px;background:var(--line-2,#4a3456);margin:0 auto 10px}
.gu-sheet .sub{display:none}
.gu-sheet .hd{padding-bottom:10px}
.gu-sheet .det{min-height:0}
.gu-sheet .ft{bottom:calc(-12px - env(safe-area-inset-bottom,0px));margin-bottom:calc(-12px - env(safe-area-inset-bottom,0px));padding-bottom:calc(12px + env(safe-area-inset-bottom,0px))}
.gu-sheet .ft .grow{max-width:none}
}
`;
  let styled = false;
  function style() { if (styled) return; styled = true; const s = document.createElement("style"); s.id = "game-ui-css"; s.textContent = css; document.head.appendChild(s); }
  function el(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  function arcD(r, a0, a1) { // degrees, 0 = 12 o'clock, clockwise
    const p = (a) => [r * Math.sin(a * Math.PI / 180), -r * Math.cos(a * Math.PI / 180)], [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; }
  function layer(parent) { style(); let L = parent.querySelector(":scope > .gu-layer"); if (!L) { L = document.createElement("div"); L.className = "gu-layer"; parent.appendChild(L); } return L; }
  const colOf = (mode) => mode === "hit" ? C.hit : mode === "refuse" ? C.nohit : C.charge;

  // ---- the lunge reticle: a jaw (Fangs, hand drawn) round the target. The upper and lower rows close on it as the coil fills,
  // so aiming reads as biting. Grey while charging, green when the strike will connect (the jaw shuts snug), red and held wide when it is too big ----
  function reticle(parent) {
    const L = layer(parent), svg = el("svg", { width: 1, height: 1, "aria-hidden": "true" }, L), g = el("g", {}, svg); svg.style.display = "none";
    const F = window.Fangs, rows = [];
    for (const [list, tip, sgn] of [[F ? F.UPPER : [], F ? F.UTIP : 0, -1], [F ? F.LOWER : [], F ? F.LTIP : 0, 1]]) {
      const outer = el("g", {}, g), inner = el("g", { transform: F ? `translate(${-F.CX} ${-tip})` : "" }, outer);
      for (const d of list) el("path", { d, fill: "none", "stroke-width": 1.4, "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round" }, inner);
      rows.push({ outer, sgn }); }
    const tag = el("text", { "text-anchor": "middle", class: "gu-cap", "font-size": 12 }, g);
    let shown = false, open = 1;
    return { el: svg, draw(s) {
      if (!s || !s.show) { if (shown) { svg.style.display = "none"; shown = false; } return; }
      if (!shown) { svg.style.display = ""; shown = true; open = 1; }
      const dt = s.dt || 1 / 60, ch = Math.max(0, Math.min(1, s.charge || 0)), col = colOf(s.mode), hit = s.mode === "hit", no = s.mode === "refuse";
      open += ((hit ? 0 : no ? 1 : 1 - ch) - open) * Math.min(1, dt * 12);
      const r = Math.max(14, s.r || 30), k = r * 3.2 / (F ? F.W : 247), gap = r * (0.5 + 1.3 * open);
      svg.style.transform = `translate(${s.x}px,${s.y}px)`;
      for (const w of rows) { w.outer.setAttribute("transform", `translate(0 ${(w.sgn * gap).toFixed(1)}) scale(${k.toFixed(4)})`); w.outer.setAttribute("stroke", col); w.outer.setAttribute("opacity", hit ? 1 : no ? 0.9 : 0.55 + 0.45 * ch); }
      tag.setAttribute("fill", col); tag.setAttribute("y", (gap + (F ? F.H - F.LTIP : 130) * k + 16).toFixed(1)); tag.textContent = hit ? "RELEASE" : no ? "TOO BIG" : "";
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
    const r = 15, segs = []; for (let i = 0; i < max; i++) { const a0 = i / max * 360 + 6, a1 = (i + 1) / max * 360 - 6; segs.push(`<path d="${arcD(r, a0, a1)}" fill="none" stroke="${i < n ? "var(--gold,#e8a23c)" : "var(--line-2,#4a3456)"}" stroke-width="3"/>`); }
    return `<svg width="38" height="38" viewBox="-19 -19 38 38" aria-hidden="true">${segs.join("")}<text y="4" text-anchor="middle" style="font:600 11px var(--mono,ui-monospace,monospace)" fill="var(--text,#f1ece8)">${n}</text></svg>`; }
  function sheet(parent, h) {
    style(); const root = document.createElement("div"); root.className = "gu-sheet"; root.hidden = true; root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "Mutate"); parent.appendChild(root);
    let order = [], sig = "";
    root.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.i != null) h.pick(+b.dataset.i); else if (b.classList.contains("grow")) h.grow(); else if (b.classList.contains("later")) h.later(); });
    // the honeycomb shrinks to the room it has: never wider than the sheet, never more than a third of the screen's height
    function fit() { const hn = root.querySelector(".honey"); if (!hn) return; hn.style.zoom = "";
      const w = root.clientWidth - 28, h = hn.offsetHeight, k = Math.min(1, w / 260, Math.max(0.8, (innerHeight * (innerHeight < 720 ? 0.28 : 0.34)) / h)); hn.style.zoom = k < 0.999 ? k.toFixed(3) : "";   // below 0.8 the labels get too small to read; the sheet scrolls instead
      // the dashed line runs from the lit place down to the middle of the honeycomb
      const ln = root.querySelector(".link"), lit = root.querySelector(".pl.lit .gu-hx"); if (!ln) return; const R0 = ln.getBoundingClientRect(), lh = R0.height || 18;
      const xc = R0.width / 2, xl = lit ? lit.getBoundingClientRect().left + lit.getBoundingClientRect().width / 2 - R0.left : xc;
      ln.innerHTML = `<svg width="${R0.width}" height="${lh}" aria-hidden="true"><path d="M${xl.toFixed(1)} 0 V${(lh / 2).toFixed(1)} H${xc.toFixed(1)} V${lh}" fill="none" stroke="var(--gold,#e8a23c)" stroke-dasharray="3 3"/></svg>`; }
    addEventListener("resize", () => { if (!root.hidden) fit(); });
    return { el: root, open(on) { root.hidden = !on; if (on) sig = ""; }, get hidden() { return root.hidden; }, draw(m) {
      const s = JSON.stringify([m.owed, m.stock, m.sel, m.places.map((p) => p.label + p.cls), m.opts.map((o) => o.kind + o.from)]); if (s === sig) return; sig = s;
      // the chosen one goes to the middle; the others keep their order round it
      order = m.opts.map((_, i) => i); if (m.sel >= 0) order = [m.sel, ...order.filter((i) => i !== m.sel)]; else order = [-1, ...order];
      const P0 = honey(Math.min(order.length, 7)), y0 = Math.min(...P0.map((q) => q[1])), y1 = Math.max(...P0.map((q) => q[1])), P = P0.map(([x, y]) => [x, y - y0]), sel = m.opts[m.sel];
      const cell = (o, i, pos) => i < 0 ? `<button type="button" class="empty" disabled style="left:${pos[0]}px;top:${pos[1]}px" aria-hidden="true"><span class="gu-hx"><span class="in" style="background:transparent;color:var(--muted,#9a8aa3);outline:1px dashed var(--line-2,#4a3456);outline-offset:-6px"><span></span><span class="gu-k" style="align-self:center">Pick one</span><span></span></span></span></button>`
        : `<button type="button" data-i="${i}" class="${i === m.sel ? "sel" : ""}" style="left:${pos[0]}px;top:${pos[1]}px" aria-pressed="${i === m.sel}" aria-label="${esc(o.name)}, ${esc(o.tag)}, from ${esc(o.from)}"><span class="gu-hx"><span class="in"><span class="t ${o.tag.toLowerCase()}">${esc(o.tag)}</span>${o.art || ""}<span class="k">${esc(o.name)}</span></span></span></button>`;
      const lit = m.places.filter((p) => /ghost|re/.test(p.cls)).length, ghost = lit === m.places.length ? -2 : m.places.findIndex((p) => /ghost|re/.test(p.cls));
      root.innerHTML = `<div class="grab"></div>
        <div class="hd"><div><h2>Mutate${m.owed > 1 ? ` ×${m.owed}` : ""}</h2><div class="sub">${m.owed > 1 ? `${m.owed} levels to spend · one change each` : "Pick a place in the body, then one change."}</div></div>
          <div class="stock"><span class="gu-k" style="text-align:right">Stock<br>${m.stock} / ${m.stockMax}</span>${stockDial(m.stock, m.stockMax)}</div></div>
        <div class="gu-k" style="margin-top:12px">Place in the body${ghost === -2 ? " · whole body" : ghost >= 0 ? ` · ${String(ghost + 1).padStart(2, "0")} ${esc(m.places[ghost].label)}` : ""}</div>
        <div class="plan" style="--n:${m.places.length}">${m.places.map((p, i) => `<div class="pl${/ghost|re/.test(p.cls) && ghost !== -2 ? " lit" : ""}"><span class="gu-hx sm ${p.cls}"><span class="in">${p.art || ""}</span></span><span class="n" style="color:${/ghost|re/.test(p.cls) ? "var(--gold,#e8a23c)" : "var(--text,#f1ece8)"}">${String(i + 1).padStart(2, "0")}</span><span class="r">${esc(p.label)}</span></div>`).join("")}</div>
        <div class="link"><svg width="2" height="18" aria-hidden="true"><path d="M1 0 V18" stroke="var(--gold,#e8a23c)" stroke-dasharray="3 3"/></svg></div>
        <div class="honey" style="height:${y1 - y0 + 90}px">${order.slice(0, 7).map((i, k) => cell(m.opts[i], i, P[k])).join("")}</div>
        <div class="det">${sel ? `<b>${esc(sel.name)}</b><span>${esc(m.say)}</span>${(m.stats || []).length ? `<div class="sx">${m.stats.map((r) => `<div class="${r.good ? "up" : "down"}"><span>${esc(r.label)}</span><span>${esc(r.from)} → <b>${esc(r.to)}</b></span><em>${esc(r.d)}</em></div>`).join("")}</div>` : ""}` : `<b style="color:var(--muted,#9a8aa3)">Choose a change</b><span>Everything here comes from what it ate.</span>`}</div>
        <div class="ft"><button type="button" class="later">Later</button><button type="button" class="grow" ${sel ? "" : "disabled"}>Grow</button></div>`;
      fit();
    } };
  }

  // ---- Mutate, drawn on the Maw itself (the diegetic rig), in two steps (Zac's sketch, 20 Nov):
  //   1 "the Maw": the body's places are called out to the screen's edges, each line ending in that place's own part. "Show parts" moves on.
  //   2 "Selector": what it can grow, as a half dial at the foot of the screen with the pick at its apex (arc), or as a ring beside the body
  //     with the pick's number in the middle (ring). The pick's line runs from its node to the place on the body it changes.
  // h: { pick(i), grow(), later() }. draw(model) when the choice changes; frame({ pts, c, axis }) every frame, in screen pixels:
  //   pts: per place, where it is on screen (or null) · c: the body's middle · axis: unit vector from head to tail on screen
  //   model: { owed, stock, stockMax, places: [{ label, cls, art }], opts: [{ kind, tag, name, from, art }], sel, say, stats, target }
  //   target: the place index the chosen option changes (-2: the whole body, -1: none)
  // .lift: how far (0..1 of the screen) the page should raise the camera's picture, so the body clears the dial
  const RIG_CSS = `
.gu-rig{position:absolute;inset:0;pointer-events:none;z-index:5;--acc:#E8B04A;--ink:#ECE8DE;--dim:#8C8981;--off:#4a4844;--hair:rgba(236,232,222,.22);--pan:rgba(29,29,32,.94);--gnd:rgba(22,22,24,.86);font:400 10px/1.4 'IBM Plex Mono',ui-monospace,monospace;color:var(--ink);--disp:'Martian Mono','IBM Plex Mono',monospace}
.gu-rig[hidden]{display:none}
.gu-rig>svg{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible}
.gu-rig .br{fill:none;stroke:var(--ink);stroke-width:1.5;opacity:.85}
.gu-rig .ld{fill:none;stroke:var(--hair);stroke-width:1}
.gu-rig .ld.on{stroke:var(--acc);stroke-width:1.4}
.gu-rig .arr{fill:var(--acc)}
.gu-rig .pt{fill:var(--ink)} .gu-rig .pt.on{fill:var(--acc)}
.gu-rig .dl{fill:none;stroke:var(--hair);stroke-width:1} .gu-rig .dl.in{stroke:var(--off)} .gu-rig .dl.ptr{stroke:var(--acc);stroke-width:1.5}
.gu-rig .tag{position:absolute;display:flex;align-items:center;gap:6px;transform:translateY(-50%);white-space:nowrap}
.gu-rig .tag.l{flex-direction:row} .gu-rig .tag.r{flex-direction:row-reverse;transform:translate(-100%,-50%)}
.gu-rig .tag .bx{position:relative;display:grid;place-items:center;width:28px;height:28px;box-sizing:border-box;border:1.2px solid var(--ink);border-radius:5px;background:var(--gnd);color:var(--ink)}
.gu-rig .tag .bx svg{width:20px;height:20px;overflow:visible} .gu-rig .tag .bx svg *{stroke:currentColor!important;fill:none!important;vector-effect:non-scaling-stroke}
.gu-rig .tag .bx em{position:absolute;top:-7px;font:500 8px 'IBM Plex Mono',monospace;font-style:normal;color:var(--dim);background:var(--gnd);padding:0 2px} .gu-rig .tag.l .bx em{left:-6px} .gu-rig .tag.r .bx em{right:-6px}
.gu-rig .tag b{background:var(--gnd);padding:2px 4px;font:600 9px 'IBM Plex Mono',monospace;letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}
.gu-rig .tag.on .bx{border-color:var(--acc);color:var(--acc)} .gu-rig .tag.on .bx em,.gu-rig .tag.on b{color:var(--acc)}
.gu-rig .tag.ghost .bx{border-style:dashed} .gu-rig .tag.grown .bx{border-width:2px}
.gu-rig .tag.bare b{display:none} .gu-rig .tag.dimmed{opacity:.45}
.gu-rig .rd{position:absolute;font:500 9px 'IBM Plex Mono',monospace;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);white-space:nowrap;display:flex;align-items:center;gap:10px}
.gu-rig .rd b{font:200 18px/1 var(--disp);letter-spacing:.02em;color:var(--ink)} .gu-rig .rd b.acc{color:var(--acc)}
.gu-rig button{all:unset;box-sizing:border-box;pointer-events:auto;cursor:pointer}
.gu-rig .btn{min-height:44px;padding:0 16px;display:inline-grid;place-items:center;border:1px solid rgba(236,232,222,.16);border-radius:10px;font:600 10px 'IBM Plex Mono',monospace;letter-spacing:.16em;text-transform:uppercase;color:var(--ink);background:var(--gnd)}
.gu-rig .btn.go{border-color:var(--acc);color:var(--acc)} .gu-rig .btn.go:hover{background:var(--acc);color:#161618}
.gu-rig .btn[disabled]{opacity:.35;cursor:default} .gu-rig .btn:focus-visible,.gu-rig .nd:focus-visible,.gu-rig .seg button:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.gu-rig kbd{font:inherit;color:var(--off);margin-left:6px} @media (pointer:coarse){.gu-rig kbd{display:none}}
.gu-rig .bar{position:absolute;display:flex;gap:6px;align-items:center}
.gu-rig .bar .n{font:500 9px 'IBM Plex Mono',monospace;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);margin-right:6px}
.gu-rig .seg{display:inline-flex;border:1px solid rgba(236,232,222,.16);border-radius:10px;overflow:hidden;pointer-events:auto;background:var(--gnd)}
.gu-rig .seg button{min-height:44px;min-width:56px;padding:0 10px;display:grid;place-items:center;font:600 9px 'IBM Plex Mono',monospace;letter-spacing:.18em;text-transform:uppercase;color:var(--dim)}
.gu-rig .seg button[aria-pressed=true]{color:var(--acc);box-shadow:inset 0 -1px 0 var(--acc)}
.gu-rig .nd{position:absolute;transform:translate(-50%,-50%);border-radius:50%;display:grid;place-items:center;color:var(--ink)}
.gu-rig .nd svg.f{position:absolute;inset:0;width:100%;height:100%;overflow:visible} .gu-rig .nd svg.f circle{fill:var(--gnd);stroke:var(--hair);stroke-width:1.2}
.gu-rig .nd:hover svg.f circle{stroke:var(--ink)} .gu-rig .nd.sel svg.f circle{stroke:var(--acc);stroke-width:2}
.gu-rig .nd .art{position:relative;width:52%;height:52%} .gu-rig .nd .art svg{width:100%;height:100%;overflow:visible} .gu-rig .nd .art svg *{stroke:currentColor!important;fill:none!important;vector-effect:non-scaling-stroke}
.gu-rig .nd.sel{color:var(--acc)}
.gu-rig .nd .k{position:absolute;top:-14px;left:50%;transform:translateX(-50%);font:500 9px 'IBM Plex Mono',monospace;color:var(--off)} .gu-rig .nd.sel .k{color:var(--acc)}
.gu-rig .nd .nm{position:absolute;top:calc(100% + 4px);left:50%;transform:translateX(-50%);white-space:nowrap;text-align:center;font:400 9px/1.3 var(--disp);letter-spacing:.06em;text-transform:uppercase;color:var(--ink)}
.gu-rig .nd .nm small{display:block;font:500 7px 'IBM Plex Mono',monospace;letter-spacing:.14em;color:var(--dim)}
.gu-rig .nd.sel .nm{color:var(--acc)}
.gu-rig .nd.empty{pointer-events:none} .gu-rig .nd.empty svg.f circle{fill:none;stroke-dasharray:3 3}
.gu-rig .ctr{position:absolute;transform:translate(-50%,-50%);text-align:center;pointer-events:none}
.gu-rig .ctr b{display:block;font:200 44px/1 var(--disp);color:var(--acc)} .gu-rig .ctr span{font:500 8px 'IBM Plex Mono',monospace;letter-spacing:.2em;text-transform:uppercase;color:var(--dim)}
.gu-rig .card{position:absolute;pointer-events:auto;box-sizing:border-box;padding:10px 12px;background:var(--pan);border:1px solid rgba(236,232,222,.10);border-radius:18px;display:grid;gap:8px}
.gu-rig .card .t{display:flex;align-items:baseline;justify-content:space-between;gap:10px} .gu-rig .card .t b{font:300 15px/1 var(--disp);text-transform:uppercase;letter-spacing:.06em} .gu-rig .card .t span{font:500 8px 'IBM Plex Mono',monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
.gu-rig .card p{margin:0;color:var(--dim);font-size:10px;line-height:1.5}
.gu-rig .card .sx{display:grid;grid-template-columns:auto auto auto auto;gap:2px 10px;font:500 9px 'IBM Plex Mono',monospace;letter-spacing:.08em;text-transform:uppercase;font-variant-numeric:tabular-nums}
.gu-rig .card .sx span:nth-child(4n+1){color:var(--dim)} .gu-rig .card .sx .up{color:#5BE39A} .gu-rig .card .sx .down{color:#FF4D5E}
.gu-rig .card .ft{display:flex;gap:6px;justify-content:space-between}
.gu-rig.narrow .card p,.gu-rig.narrow .card .sx{display:none}
`;
  function rig(parent, h) {
    if (!document.getElementById("gu-rig-css")) { const st = document.createElement("style"); st.id = "gu-rig-css"; st.textContent = RIG_CSS; document.head.appendChild(st); }
    const root = document.createElement("div"); root.className = "gu-rig"; root.hidden = true; parent.appendChild(root);
    root.innerHTML = `<svg aria-hidden="true"></svg><div class="tags"></div><div class="rd tl"></div><div class="rd tr"></div><div class="dial" role="radiogroup" aria-label="What it can grow"></div><div class="ctr"></div><div class="card"></div><div class="bar"></div>`;
    const svg = root.querySelector("svg"), tagsEl = root.querySelector(".tags"), dialEl = root.querySelector(".dial"), ctr = root.querySelector(".ctr"), card = root.querySelector(".card"), bar = root.querySelector(".bar"), rdL = root.querySelector(".rd.tl"), rdR = root.querySelector(".rd.tr");
    let M = null, sig = "", step = "body", lay = "arc", rot = null, lift = 0, liftX = 0, zoom = 1, tLast = 0;
    try { lay = localStorage.getItem("gu-rig-lay") === "ring" ? "ring" : "arc"; } catch (e) {}
    const api = { el: root, get hidden() { return root.hidden; }, get step() { return step; }, get lift() { return lift; }, get liftX() { return liftX; }, get zoom() { return zoom; } };
    const go = (s) => { step = s; sig = ""; if (s === "sel" && M && M.sel < 0 && M.opts.length) h.pick(0); else if (M) build(M); };
    root.addEventListener("click", (e) => {
      const n = e.target.closest(".nd[data-i]"); if (n) { h.pick(+n.dataset.i); return; }
      const b = e.target.closest("[data-do]"); if (!b) return; const d = b.dataset.do;
      if (d === "show") { if (M && M.opts.length) go("sel"); } else if (d === "back") go("body"); else if (d === "later") h.later(); else if (d === "grow") h.grow();
      else if (d === "arc" || d === "ring") { lay = d; try { localStorage.setItem("gu-rig-lay", d); } catch (e2) {} sig = ""; build(M); } });
    root.addEventListener("wheel", (e) => { if (step !== "sel" || !M || !M.opts.length) return; const n = M.opts.length, i = ((M.sel < 0 ? 0 : M.sel) + (e.deltaY > 0 ? 1 : -1) + n) % n; h.pick(i); e.preventDefault(); }, { passive: false });
    addEventListener("keydown", (e) => { if (root.hidden || !M || e.target.closest("input, textarea, select")) return; const n = M.opts.length;
      if (step === "body") { if ((e.key === "Enter" || e.key === "ArrowRight") && M.opts.length) { go("sel"); e.preventDefault(); } else if (e.key === "Escape") { h.later(); e.preventDefault(); } return; }
      if (/^[1-9]$/.test(e.key) && +e.key <= n) { h.pick(+e.key - 1); e.preventDefault(); }
      else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && n) { h.pick(((M.sel < 0 ? 0 : M.sel) + (e.key === "ArrowRight" ? 1 : -1) + n) % n); e.preventDefault(); }
      else if (e.key === "Enter" && M.sel >= 0) { h.grow(); e.preventDefault(); } else if (e.key === "Escape") { go("body"); e.preventDefault(); } });
    function build(m) {
      if (!m) return; const narrow = innerWidth < 560; root.classList.toggle("narrow", narrow);
      tagsEl.innerHTML = m.places.map((p, i) => `<div class="tag" data-i="${i}"><span class="bx"><em>${i + 1}</em>${p.art || ""}</span><b>${esc(p.label)}</b></div>`).join("");
      rdL.innerHTML = `<b class="acc">Mutate</b><span>${m.owed > 1 ? `×${m.owed} levels` : "1 level"}</span>`;
      rdR.innerHTML = `<span><b>${m.stock}</b> / ${m.stockMax} stock</span>`;
      const sel = m.opts[m.sel];
      if (step === "body") {
        dialEl.innerHTML = ""; ctr.innerHTML = ""; card.hidden = true;
        bar.innerHTML = `<span class="n">${m.opts.length ? `${m.opts.length} part${m.opts.length === 1 ? "" : "s"} to choose from` : `next part in ${m.next || 0} meal${m.next === 1 ? "" : "s"}`}</span><button type="button" class="btn" data-do="later">${m.opts.length ? "Later" : "Close"}<kbd>esc</kbd></button><button type="button" class="btn go" data-do="show"${m.opts.length ? "" : " disabled"}>Show parts<kbd>↵</kbd></button>`;
        return; }
      bar.innerHTML = `<button type="button" class="btn" data-do="back" aria-label="Back to the body">‹ Body</button><span class="seg" role="group" aria-label="Selector layout"><button type="button" data-do="arc" aria-pressed="${lay === "arc"}">Arc</button><button type="button" data-do="ring" aria-pressed="${lay === "ring"}">Ring</button></span>`;
      const slots = lay === "ring" ? Math.max(8, m.opts.length) : m.opts.length;
      let nd = ""; for (let i = 0; i < slots; i++) { const o = m.opts[i];
        nd += o ? `<button type="button" class="nd${i === m.sel ? " sel" : ""}" data-i="${i}" role="radio" aria-checked="${i === m.sel}" aria-label="${esc(o.name)}, ${esc(o.tag)}, from ${esc(o.from)}"><svg class="f" viewBox="-50 -50 100 100"><circle r="48"/></svg><span class="k">${i + 1}</span><span class="art">${o.art || ""}</span><span class="nm">${esc(o.name)}<small>${esc(o.tag)}</small></span></button>`
          : `<span class="nd empty" aria-hidden="true"><svg class="f" viewBox="-50 -50 100 100"><circle r="48"/></svg></span>`; }
      dialEl.innerHTML = nd;
      ctr.innerHTML = lay === "ring" ? (sel ? `<b>${m.sel + 1}</b><span>${esc(sel.tag)}</span>` : `<b>–</b><span>pick</span>`) : "";
      card.hidden = false;
      card.innerHTML = (sel ? `<div class="t"><b>${esc(sel.name)}</b><span>from ${esc(sel.from)}</span></div><p>${esc(m.say)}</p>${(m.stats || []).length ? `<div class="sx">${m.stats.map((r) => `<span>${esc(r.label)}</span><span>${esc(r.from)}</span><span>→ ${esc(r.to)}</span><span class="${r.good ? "up" : "down"}">${esc(r.d)}</span>`).join("")}</div>` : ""}`
        : `<p>Pick what to grow. Its line runs to the place on the body it changes.</p>`) + `<div class="ft"><button type="button" class="btn" data-do="later">Later</button><button type="button" class="btn go" data-do="grow"${sel ? "" : " disabled"}>Grow<kbd>↵</kbd></button></div>`;
    }
    const arrow = (x, y, ang) => { const a = 7, w = 3.5, c = Math.cos(ang), s = Math.sin(ang); return `<path class="arr" d="M${x.toFixed(1)} ${y.toFixed(1)}L${(x - a * c - w * s).toFixed(1)} ${(y - a * s + w * c).toFixed(1)}L${(x - a * c + w * s).toFixed(1)} ${(y - a * s - w * c).toFixed(1)}Z"/>`; };
    api.open = (on) => { root.hidden = !on; sig = ""; step = "body"; rot = null; if (!on) { svg.innerHTML = ""; lift = 0; liftX = 0; zoom = 1; } };
    api.draw = (m) => { M = m; const s = JSON.stringify([m.next, step, lay, innerWidth < 560, m.owed, m.stock, m.sel, m.say, m.target, m.places.map((p) => p.label + p.cls), m.opts.map((o) => o.kind + o.from), (m.stats || []).map((r) => r.to)]); if (s === sig) return; sig = s; build(m); };
    api.frame = (f) => {
      if (root.hidden || !M || !f || !f.c) return; const vw = root.clientWidth, vh = root.clientHeight, P = f.pts || [], c = f.c, narrow = vw < 560;
      const now = performance.now(), dt = Math.min(0.1, tLast ? (now - tLast) / 1000 : 0); tLast = now;
      const lit = M.target, sel = step === "sel" ? M.sel : -1, n = M.opts.length;
      // ---- the selector's place on screen: arc, a half dial standing on the foot of the screen; ring, beside the body ----
      const R = lay === "arc" ? Math.max(130, Math.min(narrow ? vw * 0.44 : 320, vw * 0.3 + (narrow ? 60 : 0), vh * 0.36)) : (narrow ? 92 : 112);
      const nr = narrow ? 22 : lay === "ring" ? 26 : 30, top0 = narrow ? 128 : 132;   // node radius; clear of the status card and the log
      const ring = step === "sel" && lay === "ring", dialUp = step === "sel" && (lay === "arc" || narrow);
      // the picture moves, not the Maw: up so it clears the dial at the foot, or left so the ring stands beside it. The Maw's middle is
      // where it is drawn now, so the shift asked for is what is left to go
      const bodyY = dialUp ? (top0 + (lay === "arc" ? vh - R - nr - 64 : vh - 2 * R - 2 * nr - 170)) / 2 : vh / 2, bodyX = ring && !narrow ? vw * 0.3 : vw / 2;
      // the body's extent on screen (its places), so the picture can be moved and pulled back until it fits the room it has
      let py0 = c.y, py1 = c.y; for (const p of P) if (p) { py0 = Math.min(py0, p.y); py1 = Math.max(py1, p.y); }
      const pad = 40, bandTop = top0 + pad, bandBot = (dialUp ? (lay === "arc" ? vh - R - nr - 64 : vh - 2 * R - 2 * nr - 170) : vh - (narrow ? 84 : 76)) - pad, room = Math.max(60, bandBot - bandTop), tall = (py1 - py0) + 2 * pad;
      const wantZ = Math.max(1, Math.min(2.5, zoom * tall / room)); zoom += (wantZ - zoom) * Math.min(1, dt * 3);
      const k6 = Math.min(1, dt * 6), wantL = Math.max(-0.2, Math.min(0.4, lift + ((py0 + py1) / 2 - (bandTop + bandBot) / 2) / vh)), wantX = Math.max(-0.3, Math.min(0.3, liftX + (bodyX - c.x) / vw));
      lift += (wantL - lift) * k6 * 0.5; liftX += ((ring && !narrow ? wantX : 0) - liftX) * k6 * 0.5;
      // ---- tags: two columns at the screen's edges (each place goes to the side it is on), kept apart, above the dial when it is up ----
      const yMax = dialUp ? (lay === "arc" ? vh - R - nr - 64 : vh - 2 * R - 2 * nr - 170) : vh - (narrow ? 84 : 76), yMin = top0 + (narrow && step === "sel" ? 76 : 24);
      const T = [], gap = narrow ? 32 : 36, mg = narrow ? 10 : 36, colL = mg, colR = vw - mg;
      { let nL = 0, nR = 0; const ord = P.map((p, i) => ({ p, i })).filter((q) => q.p).sort((a, b) => a.p.y - b.p.y);
        for (const { p, i } of ord) { const dx = p.x - c.x, s = Math.abs(dx) > 16 ? Math.sign(dx) : nL <= nR ? -1 : 1; if (s < 0) nL++; else nR++; T.push({ i, p, s, x: s > 0 ? colR : colL, y: p.y }); } }
      for (const s of [1, -1]) { const L = T.filter((q) => q.s === s).sort((a, b) => a.y - b.y); if (!L.length) continue;
        const span = gap * (L.length - 1), room = yMax - yMin, g2 = span > room ? room / Math.max(1, L.length - 1) : gap;
        for (let k = 0; k < L.length; k++) { L[k].y = Math.max(yMin, Math.min(yMax, L[k].y)); if (k && L[k].y - L[k - 1].y < g2) L[k].y = L[k - 1].y + g2; }
        const over = L[L.length - 1].y - yMax; if (over > 0) for (const q of L) q.y -= over;
        if (L[0].y < yMin) { const sh = yMin - L[0].y; for (const q of L) q.y += sh; } }
      let ringAt = null;
      if (ring) { ringAt = narrow ? { x: vw / 2, y: vh - R - nr - 150 } : { x: Math.min(vw - mg - R - nr - 20, Math.max(vw * 0.62, c.x + 200 + R)), y: Math.max(top0 + R + 40, Math.min(vh - R - nr - 210, c.y)) };
        const q = T.find((t) => t.i === lit); for (const t of T) t.hide = t !== q;
        if (q && !narrow) { q.s = 1; q.x = ringAt.x - R - nr - 70; q.y = ringAt.y; } else if (q) { q.s = -1; q.x = mg; q.y = Math.min(q.y, ringAt.y - R - nr - 40); } }
      let ln = "", on = "", d = "";
      const box = 28, tagEnd = (q) => q.s > 0 ? q.x - box : q.x + box;   // where a leader meets its tag
      for (const q of T) { const e = tagsEl.children[q.i]; if (!e) continue; if (q.hide) { e.hidden = true; continue; } const isOn = lit === -2 || lit === q.i, pl = M.places[q.i] || {};
        e.className = "tag " + (q.s > 0 ? "r" : "l") + (isOn && step === "sel" ? " on" : "") + (/ghost/.test(pl.cls || "") ? " ghost" : "") + (/grown/.test(pl.cls || "") ? " grown" : "") + (narrow && !isOn ? " bare" : "") + (step === "sel" && lit >= 0 && !isOn ? " dimmed" : "");
        e.style.left = q.x + "px"; e.style.top = q.y + "px"; e.hidden = false;
        const ex = tagEnd(q), lab = narrow && !isOn ? 0 : 74, ex2 = ex - q.s * lab;   // the line runs past the label to the body
        const mx = q.p.x + (ex2 - q.p.x) * 0.3, path = `M${q.p.x.toFixed(1)} ${q.p.y.toFixed(1)}L${mx.toFixed(1)} ${q.y.toFixed(1)}L${ex2.toFixed(1)} ${q.y.toFixed(1)}`;
        if (isOn && step === "sel") on += path; else ln += path;
        d += `<circle class="pt${isOn && step === "sel" ? " on" : ""}" cx="${q.p.x.toFixed(1)}" cy="${q.p.y.toFixed(1)}" r="${isOn && step === "sel" ? 3 : 2}"/>`; }
      for (let i = 0; i < tagsEl.children.length; i++) if (!T.some((q) => q.i === i && !q.hide)) tagsEl.children[i].hidden = true;
      // ---- the frame: viewfinder corners round the whole callout ----
      const k = 14, X0 = 6 + (narrow ? 0 : 16), X1 = vw - 6 - (narrow ? 0 : 16), Y0 = top0 - 6, Y1 = dialUp ? yMax + 22 : vh - (narrow ? 70 : 64);
      d += `<path class="br" d="M${X0} ${Y0 + k}V${Y0}H${X0 + k}M${X1 - k} ${Y0}H${X1}V${Y0 + k}M${X1} ${Y1 - k}V${Y1}H${X1 - k}M${X0 + k} ${Y1}H${X0}V${Y1 - k}"/>`;
      rdL.style.left = X0 + "px"; rdL.style.top = (Y0 - 30) + "px"; rdR.style.right = (vw - X1) + "px"; rdR.style.left = ""; rdR.style.top = (Y0 - 30) + "px";
      rdL.style.display = "none"; rdR.style.display = narrow ? "none" : "";   // the status card already says Mutate ×n
      // ---- the bar: Show parts (step 1), or back and the layout switch (step 2) ----
      if (step === "body") { bar.style.left = ""; bar.style.right = (narrow ? 10 : vw - X1) + "px"; bar.style.top = ""; bar.style.bottom = (narrow ? 14 : 14) + "px"; }
      else { bar.style.right = ""; bar.style.top = ""; bar.style.left = (narrow ? 10 : X0) + "px"; bar.style.bottom = (narrow ? vh - Y0 + 8 - 52 : 14) + "px"; if (narrow) { bar.style.bottom = ""; bar.style.top = (Y0 + 8) + "px"; } }
      // ---- step 2: the selector ----
      const nodes = dialEl.children;
      if (step === "sel" && nodes.length) {
        let ax, ay, pos = [], apex = null;
        if (lay === "arc") {
          ax = vw / 2; ay = vh + (narrow ? 4 : 10); const step0 = Math.min(32, 150 / Math.max(1, n - 1)) * Math.PI / 180 * (narrow ? 1.25 : 1);
          const tgt = M.sel < 0 ? 0 : M.sel; if (rot == null) rot = tgt; rot += (tgt - rot) * Math.min(1, dt * 10);
          for (let i = 0; i < nodes.length; i++) { const a = -Math.PI / 2 + (i - rot) * step0; pos.push([ax + R * Math.cos(a), ay + R * Math.sin(a), a]); }
          const rIn = R - nr - (narrow ? 26 : 34);
          d += `<path class="dl" d="M${ax - R} ${ay}A${R} ${R} 0 0 1 ${ax + R} ${ay}"/><path class="dl in" d="M${ax - rIn} ${ay}A${rIn} ${rIn} 0 0 1 ${ax + rIn} ${ay}"/>`;
          d += `<path class="dl ptr" d="M${ax} ${ay - R + nr + 6}V${ay - rIn + 2}"/>`;
          for (let t = -8; t <= 8; t++) { const a = -Math.PI / 2 + t * 10 * Math.PI / 180, r1 = rIn - 4, r2 = rIn - (t % 3 ? 8 : 12); d += `<path class="dl in" d="M${(ax + r1 * Math.cos(a)).toFixed(1)} ${(ay + r1 * Math.sin(a)).toFixed(1)}L${(ax + r2 * Math.cos(a)).toFixed(1)} ${(ay + r2 * Math.sin(a)).toFixed(1)}"/>`; }
          // the card sits inside the dial, under the apex
          const cw = Math.min(narrow ? vw - 40 : 320, 2 * Math.sqrt(Math.max(0, (rIn - 18) ** 2 - 60 ** 2))); card.style.width = cw + "px";
          card.style.left = (ax - cw / 2) + "px"; card.style.top = Math.max(ay - rIn + 16, vh - card.offsetHeight - 10) + "px";
          ctr.style.display = "none";
        } else {
          // ring: beside the body where there is room, else at the foot
          ax = ringAt.x; ay = ringAt.y;
          const N = nodes.length; for (let i = 0; i < N; i++) { const a = -Math.PI / 2 + i / N * Math.PI * 2; pos.push([ax + R * Math.cos(a), ay + R * Math.sin(a), a]); }
          d += `<circle class="dl" cx="${ax}" cy="${ay}" r="${R}"/><circle class="dl in" cx="${ax}" cy="${ay}" r="${R - nr - 10}"/>`;
          ctr.style.display = ""; ctr.style.left = ax + "px"; ctr.style.top = ay + "px";
          const cw = Math.min(300, vw - 20); card.style.width = cw + "px"; card.style.left = Math.max(10, Math.min(vw - cw - 10, ax - cw / 2)) + "px"; card.style.top = (ay + R + nr + 24) + "px";
          if (ay + R + nr + 30 + card.offsetHeight > vh - 10) card.style.top = (vh - 10 - card.offsetHeight) + "px";
        }
        for (let i = 0; i < nodes.length; i++) { const e = nodes[i], [x, y, a] = pos[i], isSel = i === M.sel, r = isSel && lay === "arc" ? nr + 8 : nr;
          const vis = lay === "ring" || (a > -Math.PI - 0.05 && a < 0.05 && y < vh - nr * 0.4);
          e.style.display = vis ? "" : "none"; e.style.left = x.toFixed(1) + "px"; e.style.top = y.toFixed(1) + "px"; e.style.width = e.style.height = (2 * r) + "px";
          if (isSel) apex = { x, y, r }; }
        // the pick's line: from the place's tag, with an arrow into the pick (the sketch's arrow), or to the body's middle for a change of the whole body
        if (apex && lit !== -1) { const tq = T.find((q) => q.i === lit); let tx, ty;
          if (tq && lay === "ring") { tx = tq.s > 0 ? tq.x + 3 : tq.x + box + 3; ty = tq.y; } else if (tq) { tx = tq.s > 0 ? tq.x - box / 2 : tq.x + box / 2; ty = tq.y + box / 2; } else { tx = c.x; ty = c.y; }
          const dx = apex.x - tx, dy = apex.y - ty, dl = Math.hypot(dx, dy) || 1, ex = apex.x - dx / dl * (apex.r + 4), ey = apex.y - dy / dl * (apex.r + 4);
          const my = lay === "arc" ? ey - Math.max(24, (ey - ty) * 0.5) : ty;
          on += lay === "arc" ? `M${tx.toFixed(1)} ${ty.toFixed(1)}V${my.toFixed(1)}L${ex.toFixed(1)} ${ey.toFixed(1)}` : `M${tx.toFixed(1)} ${ty.toFixed(1)}L${ex.toFixed(1)} ${ey.toFixed(1)}`;
          const ang = lay === "arc" ? Math.atan2(ey - my, ex - tx) : Math.atan2(dy, dx); d += arrow(ex, ey, ang); }
      } else if (step !== "sel") { ctr.style.display = "none"; }
      svg.innerHTML = `<path class="ld" d="${ln}"/><path class="ld on" d="${on}"/>` + d;
    };
    return api;
  }

  window.GameUI = { reticle, dial, sheet, rig, honey, COLORS: C, ROMAN: ROM };
})();
