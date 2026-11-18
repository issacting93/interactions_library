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

  // ---- Mutate, drawn on the Maw itself (the diegetic rig): the body's places are tagged where they are on screen, with leaders out to
  // numbered tags either side of it; what it can grow sits beside it as a hex grid; the chosen hex's leader runs to the place it changes.
  // h: { pick(i), grow(), later() }. draw(model) when the choice changes; frame({ pts, c, axis }) every frame, in screen pixels:
  //   pts: per place, where it is on screen (or null) · c: the body's middle · axis: unit vector from head to tail on screen
  //   model: as sheet's, plus target: the place index the chosen option changes (-2: the whole body, -1: none)
  const RIG_CSS = `
.gu-rig{position:absolute;inset:0;pointer-events:none;z-index:5;--acc:#FD8235;--ink:#e8e2d4;--dim:#8a8a8a;--off:#555;--hair:rgba(232,226,212,.28);--pan:rgba(10,10,10,.84);font:400 10px/1.4 'IBM Plex Mono',ui-monospace,monospace;color:var(--ink)}
.gu-rig[hidden]{display:none}
.gu-rig>svg{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible}
.gu-rig .br{fill:none;stroke:var(--ink);stroke-width:1.5;opacity:.85}
.gu-rig .ld{fill:none;stroke:var(--hair);stroke-width:1;stroke-dasharray:3 3}
.gu-rig .ld.on{stroke:var(--acc);stroke-width:1.4;stroke-dasharray:4 3}
.gu-rig .pt{fill:var(--ink)} .gu-rig .pt.on{fill:var(--acc)}
.gu-rig .tag{position:absolute;display:flex;align-items:center;gap:6px;transform:translate(-11px,-50%);white-space:nowrap} .gu-rig .tag.l{transform:translate(calc(-100% + 11px),-50%)} .gu-rig .tag.bare b{display:none}
.gu-rig .tag.r{flex-direction:row} .gu-rig .tag.l{flex-direction:row-reverse}
.gu-rig .tag i{font-style:normal;display:grid;place-items:center;width:20px;height:20px;box-sizing:border-box;border:1.5px solid var(--ink);font:600 11px 'IBM Plex Mono',monospace;color:var(--ink);background:rgba(10,10,10,.55)}
.gu-rig .tag b{background:rgba(10,10,10,.8);padding:2px 4px;font:600 9px 'IBM Plex Mono',monospace;letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}
.gu-rig .tag.on i{border-color:var(--acc);color:#0a0a0a;background:var(--acc)} .gu-rig .tag.on b{color:var(--acc)}
.gu-rig .tag.ghost i{border-style:dashed}
.gu-rig .rd{position:absolute;font:500 9px 'IBM Plex Mono',monospace;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);white-space:nowrap}
.gu-rig .rd b{font:700 20px/1 'Barlow Condensed',sans-serif;letter-spacing:.02em;color:var(--ink);margin-right:6px;vertical-align:-3px} .gu-rig .rd b.acc{color:var(--acc)}
.gu-rig .blk{position:absolute;display:grid;gap:10px;justify-items:center;pointer-events:none}
.gu-rig .hexes{position:relative}
.gu-rig .hx{all:unset;box-sizing:border-box;position:absolute;transform:translate(-50%,-50%);pointer-events:auto;cursor:pointer;display:grid;place-items:center}
.gu-rig .hx svg.f{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.gu-rig .hx svg.f path{fill:rgba(10,10,10,.78);stroke:var(--hair);stroke-width:1.2}
.gu-rig .hx:hover svg.f path{stroke:var(--ink)}
.gu-rig .hx.sel svg.f path{stroke:var(--acc);stroke-width:2;fill:rgba(253,130,53,.12)}
.gu-rig .hx:focus-visible{outline:none} .gu-rig .hx:focus-visible svg.f path{stroke:var(--acc);stroke-width:2.5}
.gu-rig .hx .art{position:relative;width:42%;height:42%;margin-top:-14%;color:var(--ink)} .gu-rig .hx .art svg{width:100%;height:100%;overflow:visible} .gu-rig .hx .art svg *{stroke:currentColor!important;fill:none!important;vector-effect:non-scaling-stroke}
.gu-rig .hx.sel .art{color:var(--acc)}
.gu-rig .hx .nm{position:absolute;left:0;right:0;bottom:24%;text-align:center;font:600 13px/1 'Barlow Condensed',sans-serif;letter-spacing:.04em;text-transform:uppercase}
.gu-rig .hx .k{position:absolute;top:17%;left:50%;transform:translateX(-50%);font:500 8px 'IBM Plex Mono',monospace;color:var(--off)} .gu-rig .hx.sel .k{color:var(--acc)}
.gu-rig .hx .tg{position:absolute;left:0;right:0;bottom:14%;text-align:center;font:500 7px 'IBM Plex Mono',monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
.gu-rig .card{pointer-events:auto;box-sizing:border-box;padding:9px 12px;background:var(--pan);border:1px solid rgba(232,226,212,.14);display:grid;gap:7px}
.gu-rig .card .t{display:flex;align-items:baseline;justify-content:space-between;gap:10px} .gu-rig .card .t b{font:700 18px/1 'Barlow Condensed',sans-serif;text-transform:uppercase;letter-spacing:.02em} .gu-rig .card .t span{font:500 8px 'IBM Plex Mono',monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
.gu-rig .card p{margin:0;color:var(--dim);font-size:10px;line-height:1.5}
.gu-rig .card .sx{display:grid;grid-template-columns:auto auto auto auto;gap:2px 10px;font:500 9px 'IBM Plex Mono',monospace;letter-spacing:.08em;text-transform:uppercase;font-variant-numeric:tabular-nums}
.gu-rig .card .sx span:nth-child(4n+1){color:var(--dim)} .gu-rig .card .sx .up{color:#4ade80} .gu-rig .card .sx .down{color:#ef4444}
.gu-rig .card .ft{display:flex;gap:6px;justify-content:flex-end}
.gu-rig .card button{all:unset;box-sizing:border-box;min-height:44px;padding:0 16px;display:grid;place-items:center;border:1px solid rgba(232,226,212,.3);font:500 10px 'IBM Plex Mono',monospace;letter-spacing:.16em;text-transform:uppercase;cursor:pointer;color:var(--ink)}
.gu-rig .card button.grow{border-color:var(--acc);color:var(--acc);background:rgba(253,130,53,.1)} .gu-rig .card button.grow:hover{background:var(--acc);color:#0a0a0a}
.gu-rig .card button[disabled]{opacity:.35;cursor:default} .gu-rig .card button:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.gu-rig .card kbd{font:inherit;color:var(--off);margin-left:6px} @media (pointer:coarse){.gu-rig .card kbd{display:none}}
`;
  function rig(parent, h) {
    if (!document.getElementById("gu-rig-css")) { const st = document.createElement("style"); st.id = "gu-rig-css"; st.textContent = RIG_CSS; document.head.appendChild(st); }
    const root = document.createElement("div"); root.className = "gu-rig"; root.hidden = true; parent.appendChild(root);
    root.innerHTML = `<svg aria-hidden="true"></svg><div class="tags"></div><div class="rd tl"></div><div class="rd tr"></div><div class="blk"><div class="hexes" role="radiogroup" aria-label="What it can grow"></div><div class="card"></div></div>`;
    const svg = root.querySelector("svg"), tagsEl = root.querySelector(".tags"), blk = root.querySelector(".blk"), hexEl = root.querySelector(".hexes"), card = root.querySelector(".card"), rdL = root.querySelector(".rd.tl"), rdR = root.querySelector(".rd.tr");
    let M = null, sig = "", side = null, S = 34;
    const AX = [[0, 0], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1], [2, -1], [2, 0], [1, 1], [0, 2], [-1, 2]];
    const hexPath = (s) => { let d = ""; for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 90); d += (i ? "L" : "M") + (s * Math.cos(a)).toFixed(1) + " " + (s * Math.sin(a)).toFixed(1); } return d + "Z"; };
    hexEl.addEventListener("click", (e) => { const b = e.target.closest(".hx"); if (b) h.pick(+b.dataset.i); });
    card.addEventListener("click", (e) => { if (e.target.closest(".grow")) h.grow(); else if (e.target.closest(".later")) h.later(); });
    addEventListener("keydown", (e) => { if (root.hidden || !M || e.target.closest("input, textarea, select")) return;
      if (/^[1-9]$/.test(e.key) && +e.key <= M.opts.length) { h.pick(+e.key - 1); e.preventDefault(); } else if (e.key === "Enter" && M.sel >= 0) { h.grow(); e.preventDefault(); } else if (e.key === "Escape") { h.later(); e.preventDefault(); } });
    function build(m) {
      const n = m.opts.length; S = innerWidth < 560 ? 30 : 36;
      const pos = AX.slice(0, n).map(([q, r]) => [S * Math.sqrt(3) * (q + r / 2), S * 1.5 * r]), x0 = Math.min(...pos.map((p) => p[0])) - S, x1 = Math.max(...pos.map((p) => p[0])) + S, y0 = Math.min(...pos.map((p) => p[1])) - S, y1 = Math.max(...pos.map((p) => p[1])) + S;
      hexEl.style.width = (x1 - x0) + "px"; hexEl.style.height = (y1 - y0) + "px";
      hexEl.innerHTML = m.opts.map((o, i) => `<button type="button" class="hx${i === m.sel ? " sel" : ""}" data-i="${i}" role="radio" aria-checked="${i === m.sel}" aria-label="${esc(o.name)}, ${esc(o.tag)}, from ${esc(o.from)}" style="left:${(pos[i][0] - x0).toFixed(1)}px;top:${(pos[i][1] - y0).toFixed(1)}px;width:${(S * Math.sqrt(3)).toFixed(1)}px;height:${2 * S}px">
        <svg class="f" viewBox="${-S * Math.sqrt(3) / 2} ${-S} ${S * Math.sqrt(3)} ${2 * S}"><path d="${hexPath(S - 1.5)}"/></svg><span class="k">${i + 1}</span><span class="art">${o.art || ""}</span><span class="nm">${esc(o.name)}</span><span class="tg">${esc(o.tag)}</span></button>`).join("");
      const sel = m.opts[m.sel];
      card.style.width = Math.min(280, innerWidth - 24) + "px";
      card.innerHTML = sel ? `<div class="t"><b>${esc(sel.name)}</b><span>${esc(sel.tag)} · from ${esc(sel.from)}</span></div><p>${esc(m.say)}</p>${(m.stats || []).length ? `<div class="sx">${m.stats.map((r) => `<span>${esc(r.label)}</span><span>${esc(r.from)}</span><span>→ ${esc(r.to)}</span><span class="${r.good ? "up" : "down"}">${esc(r.d)}</span>`).join("")}</div>` : ""}
        <div class="ft"><button type="button" class="later">Later<kbd>esc</kbd></button><button type="button" class="grow">Grow<kbd>↵</kbd></button></div>`
        : `<p>Pick what to grow${n > 1 ? ` · keys 1–${n}` : ""}. Its line runs to the place on the body it changes.</p><div class="ft"><button type="button" class="later">Later<kbd>esc</kbd></button><button type="button" class="grow" disabled>Grow</button></div>`;
      rdL.innerHTML = `<b class="acc">Mutate</b>${m.owed > 1 ? `×${m.owed} levels` : "1 level"}`; rdR.innerHTML = `<b>${m.stock}</b>/ ${m.stockMax} stock`;
      tagsEl.innerHTML = m.places.map((p, i) => `<div class="tag" data-i="${i}"><i>${i + 1}</i><b>${esc(p.label)}</b></div>`).join("");
    }
    return { el: root, get hidden() { return root.hidden; },
      open(on) { root.hidden = !on; sig = ""; side = null; if (!on) svg.innerHTML = ""; },
      draw(m) { M = m; const s = JSON.stringify([m.owed, m.stock, m.sel, m.say, m.target, m.places.map((p) => p.label + p.cls), m.opts.map((o) => o.kind + o.from), (m.stats || []).map((r) => r.to)]); if (s === sig) return; sig = s; build(m); },
      frame(f) {
        if (root.hidden || !M || !f || !f.c) return; const vw = root.clientWidth, vh = root.clientHeight, P = f.pts || [], c = f.c;
        let u = f.axis || { x: 0, y: 1 }; const ul = Math.hypot(u.x, u.y) || 1; u = { x: u.x / ul, y: u.y / ul }; const nrm = { x: -u.y, y: u.x };
        // the frame: the body's extent on screen, never smaller than a square round its middle
        let bx0 = c.x - 70, bx1 = c.x + 70, by0 = c.y - 70, by1 = c.y + 70; for (const p of P) if (p) { bx0 = Math.min(bx0, p.x - 22); bx1 = Math.max(bx1, p.x + 22); by0 = Math.min(by0, p.y - 22); by1 = Math.max(by1, p.y + 22); }
        let half = 0; for (const p of P) if (p) half = Math.max(half, Math.abs((p.x - c.x) * nrm.x + (p.y - c.y) * nrm.y));
        // tags: two columns, left and right of the body (each place goes to the side it is on), in order down the screen, kept apart
        const T = [], lit = M.target, narrow = vw < 560, gap = narrow ? 26 : 30, colL = Math.max(18, bx0 - 26), colR = Math.min(vw - 18, bx1 + 26);
        P.forEach((p, i) => { if (!p) return; const s = p.x >= c.x ? 1 : -1; T.push({ i, p, s, x: s > 0 ? colR : colL, y: p.y }); });
        for (const s of [1, -1]) { const L = T.filter((q) => q.s === s).sort((a, b) => a.y - b.y); for (let k = 1; k < L.length; k++) if (L[k].y - L[k - 1].y < gap) L[k].y = L[k - 1].y + gap;
          const over = L.length ? L[L.length - 1].y - (vh - 16) : 0; if (over > 0) for (const q of L) q.y -= over; }
        let d = "", ln = "", on = "";
        for (const q of T) { const e = tagsEl.children[q.i]; if (!e) continue; const x = Math.max(16, Math.min(vw - 16, q.x)), y = Math.max(16, Math.min(vh - 16, q.y)), isOn = lit === -2 || lit === q.i, gh = M.places[q.i] && /ghost/.test(M.places[q.i].cls);
          const room = q.s > 0 ? vw - x > 86 : x > 86; e.className = "tag " + ((q.s > 0) === room ? "r" : "l") + (isOn ? " on" : "") + (gh ? " ghost" : "") + (narrow && !isOn ? " bare" : ""); e.style.left = x + "px"; e.style.top = y + "px"; e.hidden = false;
          const ex = x - q.s * 11, mx = q.p.x + (ex - q.p.x) * 0.35, path = `M${q.p.x.toFixed(1)} ${q.p.y.toFixed(1)}L${mx.toFixed(1)} ${y.toFixed(1)}L${ex.toFixed(1)} ${y.toFixed(1)}`; if (isOn) on += path; else ln += path;
          d += `<circle class="pt${isOn ? " on" : ""}" cx="${q.p.x.toFixed(1)}" cy="${q.p.y.toFixed(1)}" r="${isOn ? 3 : 2}"/>`; }
        for (let i = 0; i < tagsEl.children.length; i++) if (!T.some((q) => q.i === i)) tagsEl.children[i].hidden = true;
        // the frame's corners, as a viewfinder's
        const tw = (q) => (narrow && !(lit === -2 || lit === q.i) ? 12 : 80), fx0 = Math.min(bx0, ...T.filter((q) => q.s < 0).map((q) => q.x - tw(q))) - 8, fx1 = Math.max(bx1, ...T.filter((q) => q.s > 0).map((q) => q.x + tw(q))) + 8, fy0 = Math.min(by0, ...T.map((q) => q.y - 16)) - 10, fy1 = Math.max(by1, ...T.map((q) => q.y + 16)) + 10, k = 14;
        const X0 = Math.max(6, fx0), X1 = Math.min(vw - 6, fx1), Y0 = Math.max(6, fy0), Y1 = Math.min(vh - 6, fy1);
        d += `<path class="br" d="M${X0} ${Y0 + k}V${Y0}H${X0 + k}M${X1 - k} ${Y0}H${X1}V${Y0 + k}M${X1} ${Y1 - k}V${Y1}H${X1 - k}M${X0 + k} ${Y1}H${X0}V${Y1 - k}"/>`;
        rdL.style.left = X0 + "px"; rdL.style.top = Math.max(2, Y0 - 26) + "px"; rdR.style.left = ""; rdR.style.right = Math.max(6, vw - X1) + "px"; rdR.style.top = Math.max(2, Y0 - 26) + "px";
        // the grid of what it can grow, and its card: beside the frame where there is room (kept on the side it took when it opened)
        const bw = Math.max(hexEl.offsetWidth, card.offsetWidth), bh = hexEl.offsetHeight + 10 + card.offsetHeight, pad = 10;
        const fits = (x, y) => x >= pad && y >= 96 && x + bw <= vw - pad && y + bh <= vh - pad;   // clear of the status card at the top
        const at = { right: [X1 + 18, (Y0 + Y1) / 2 - hexEl.offsetHeight / 2], left: [X0 - 18 - bw, (Y0 + Y1) / 2 - hexEl.offsetHeight / 2], below: [(X0 + X1) / 2 - bw / 2, Y1 + 14], above: [(X0 + X1) / 2 - bw / 2, Y0 - 34 - bh] };
        for (const k2 of ['right', 'left']) at[k2][1] = Math.max(pad, Math.min(vh - pad - bh, at[k2][1]));
        if (narrow) side = "dock"; else if (!side || side === "dock" || !fits(...at[side])) side = ["right", "left", "below"].find((k2) => fits(...at[k2])) || "dock";   // a phone: the grid and its card sit at the bottom, under the body
        let [bxp, byp] = side === "dock" ? [(vw - bw) / 2, vh - pad - bh] : at[side]; bxp = Math.max(pad, Math.min(vw - pad - bw, bxp));
        blk.style.left = bxp + "px"; blk.style.top = byp + "px"; blk.style.width = bw + "px";
        // the chosen hex's leader, to the place it changes (or to the frame, when it changes the whole body)
        const hb = hexEl.querySelector(".hx.sel"); if (hb) { const r = hb.getBoundingClientRect(), R0 = root.getBoundingClientRect(), hx = r.left + r.width / 2 - R0.left, hy = r.top + r.height / 2 - R0.top;
          const tq = T.find((q) => q.i === lit), tx = tq ? Math.max(16, Math.min(vw - 16, tq.x)) : c.x, ty = tq ? Math.max(16, Math.min(vh - 16, tq.y)) : c.y;
          const ex = Math.abs(tx - hx) > Math.abs(ty - hy) ? hx + Math.sign(tx - hx) * S * 0.87 : hx, ey = Math.abs(tx - hx) > Math.abs(ty - hy) ? hy : hy + Math.sign(ty - hy) * S;
          on += `M${ex.toFixed(1)} ${ey.toFixed(1)}L${((ex + tx) / 2).toFixed(1)} ${ey.toFixed(1)}L${((ex + tx) / 2).toFixed(1)} ${ty.toFixed(1)}L${tx.toFixed(1)} ${ty.toFixed(1)}`; }
        svg.innerHTML = `<path class="ld" d="${ln}"/><path class="ld on" d="${on}"/>` + d;
      } };
  }

  window.GameUI = { reticle, dial, sheet, rig, honey, COLORS: C, ROMAN: ROM };
})();
