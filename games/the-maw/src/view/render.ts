// The view: reads the game's state and draws it. It never changes the simulation (the legs' footfalls are its own state).
// TAPE 08 on the ground: hairline ink on warm charcoal, colour only as a signal (amber: gates and your aim, red: what can eat you).
import type { Game } from "../game";
import { RULES } from "../game";
import { BY_KEY, KIT, type MawPart } from "../content/data";
import { mouthAt } from "../systems/feed";
import { along, drawCentred, drawPart, drawSheet, setBase } from "./art";

export const T8 = {
  ground: "#161618", panel: "#1D1D20", lane: "#1C1C1F", ink: "#ECE8DE", ink2: "#8C8981", off: "#2E2D2A",
  l1: "rgba(236,232,222,.07)", l2: "rgba(236,232,222,.10)", l3: "rgba(236,232,222,.14)", l5: "rgba(236,232,222,.22)",
  amber: "#E8B04A", rec: "#FF4D5E", loop: "#5BE39A", solo: "#5CC8E0",
};

interface Foot { x: number; y: number; fx: number; fy: number; t: number }   // planted at x,y; stepping from fx,fy while t < 1
export class View {
  readonly ctx: CanvasRenderingContext2D;
  W = 0; H = 0; dpr = 1; zoom = 1; cx = 0; cy = 0;
  feet: Foot[] = [];
  time = 0;
  target = 0;
  fixedZoom = 0;     // set by headless checks
  hide = new Set<string>();
  constructor(readonly canvas: HTMLCanvasElement) { this.ctx = canvas.getContext("2d")!; }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = this.canvas.clientWidth; this.H = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.W * this.dpr); this.canvas.height = Math.round(this.H * this.dpr);
  }

  draw(g: Game, dt: number): void {
    this.time += dt;
    const { ctx, W, H, dpr } = this, w = g.w, pp = w.get(g.player, "pos")!, pb = w.get(g.player, "body")!;
    // the camera: centred on you, the view widening as you grow
    const R = 300 + pb.len * 2.6, z = this.fixedZoom || Math.hypot(W, H) / (2 * R);
    this.zoom += (z - this.zoom) * Math.min(1, dt * 2); if (!isFinite(this.zoom) || this.zoom <= 0) this.zoom = z;
    this.cx += (pp.x - this.cx) * Math.min(1, dt * 8); this.cy += (pp.y - this.cy) * Math.min(1, dt * 8);
    if (Math.hypot(pp.x - this.cx, pp.y - this.cy) > 600) { this.cx = pp.x; this.cy = pp.y; }
    const px = this.zoom, base = new DOMMatrix([dpr * px, 0, 0, dpr * px, dpr * (W / 2 - this.cx * px), dpr * (H / 2 - this.cy * px)]);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = T8.ground; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(base); setBase(base);
    const view = { x0: this.cx - W / 2 / px - 80, x1: this.cx + W / 2 / px + 80, y0: this.cy - H / 2 / px - 80, y1: this.cy + H / 2 / px + 80 };
    const inView = (x: number, y: number, r = 0) => x + r > view.x0 && x - r < view.x1 && y + r > view.y0 && y - r < view.y1;
    const hair = 1 / px;

    this.ground(g, view, hair);
    // props
    for (const p of g.map.props) if (inView(p.x, p.y, p.r * 2)) this.prop(p, hair);
    this.gates(g, view, hair);

    // creatures, lowest first (what flies over you is drawn over you, bigger, with its shadow below)
    const m = g.maw, list: [number, number][] = [];
    for (const [e, p, , alt] of w.query("pos", "body", "alt")) if (e !== g.player && inView(p.x, p.y, 200)) list.push([e, alt.z]);
    list.sort((a, b) => a[1] - b[1]);
    this.target = this.aim(g);
    const myZ = w.get(g.player, "alt")!.z;
    let drewMe = false;
    for (const [e, zz] of list) {
      if (!drewMe && zz > myZ) { this.maw(g, hair, dt); drewMe = true; }
      const b = w.get(e, "body")!, sp = w.get(e, "spine")!, spc = BY_KEY[b.species]; if (!spc) continue;
      g.seen.add(b.species);
      const edible = g.canEat(g.player, e), threat = g.canEat(e, g.player) && spc.role !== "prey";
      const high = m.state !== "swim" && zz > RULES.reachWalk + 0.25 + 0.1 * m.traits.leap;
      const lift = 1 + zz * 0.22;
      if (zz > 0.25) {   // its shadow: where it really is
        ctx.strokeStyle = T8.l3; ctx.lineWidth = Math.max(hair, b.len * 0.05); ctx.lineCap = "round"; ctx.beginPath();
        for (let i = 0; i < sp.pts.length; i += 2) i ? ctx.lineTo(sp.pts[i], sp.pts[i + 1]) : ctx.moveTo(sp.pts[i], sp.pts[i + 1]); ctx.stroke();
      }
      const onScreen = b.len * px * lift;
      const stroke = threat ? T8.rec : edible && !high ? T8.ink : T8.ink2;
      ctx.globalAlpha = high ? 0.55 : 1;
      if (onScreen < 9) { ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(hair * 1.5, b.len * 0.18); ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(sp.pts[0], sp.pts[1]); ctx.lineTo(sp.pts[8], sp.pts[9]); ctx.stroke(); }
      else drawSheet(ctx, spc.sheet, sp.pts, b.len, px, { fill: T8.ground, stroke, width: threat ? 1.3 : 1 }, lift);
      ctx.globalAlpha = 1;
      if (e === this.target) this.brackets(sp.pts, b.len * lift, hair);
    }
    if (!drewMe) this.maw(g, hair, dt);
    this.fog(g, hair);
    this.compass(g, view, hair);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // the floor: a ruled ground per ring, the walls between them, the moat and the island
  ground(g: Game, v: { x0: number; x1: number; y0: number; y1: number }, hair: number): void {
    const { ctx } = this, map = g.map, step = 90;
    // dot grid (the instrument's graph paper), only what is on screen
    ctx.fillStyle = T8.l2;
    for (let x = Math.floor(v.x0 / step) * step; x < v.x1; x += step) for (let y = Math.floor(v.y0 / step) * step; y < v.y1; y += step) {
      const r = Math.hypot(x, y); if (r > map.R || (r > map.moat.r0 && r < map.moat.r1)) continue; ctx.fillRect(x - hair, y - hair, hair * 2, hair * 2); }
    // ring floors one step apart, inward lighter (the path forward reads brighter)
    for (const ring of [...map.rings].reverse()) { if (ring.i === 3) continue; ctx.fillStyle = ring.i === 0 ? "rgba(236,232,222,.012)" : ring.i === 1 ? "rgba(236,232,222,.02)" : "rgba(236,232,222,.03)";
      ctx.beginPath(); ctx.arc(0, 0, ring.r1, 0, Math.PI * 2); ctx.arc(0, 0, ring.r0, 0, Math.PI * 2, true); ctx.fill("evenodd"); }
    // wedge seams
    ctx.strokeStyle = T8.l1; ctx.lineWidth = hair; ctx.setLineDash([6 * hair, 10 * hair]);
    for (const ring of map.rings) { if (ring.i === 3) continue; const n = ring.wedges.length; for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + ring.i;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * ring.r0, Math.sin(a) * ring.r0); ctx.lineTo(Math.cos(a) * ring.r1, Math.sin(a) * ring.r1); ctx.stroke(); } }
    ctx.setLineDash([]);
    // the walls: a double line with a tick hatch (a cliff), the world's edge a single line
    for (const ri of [0, 1]) { const R0 = map.rings[ri].r0;
      ctx.strokeStyle = T8.l5; ctx.lineWidth = hair * 1.5; ctx.beginPath(); ctx.arc(0, 0, R0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = T8.l3; ctx.lineWidth = hair; ctx.beginPath(); ctx.arc(0, 0, R0 - 14, 0, Math.PI * 2); ctx.stroke();
      const n = Math.round(R0 * Math.PI * 2 / 22); ctx.beginPath(); for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); ctx.moveTo(c * R0, s * R0); ctx.lineTo(c * (R0 - 14), s * (R0 - 14)); } ctx.stroke(); }
    ctx.strokeStyle = T8.l3; ctx.lineWidth = hair; ctx.beginPath(); ctx.arc(0, 0, map.R, 0, Math.PI * 2); ctx.stroke();
    // the moat: water lines that drift
    const mo = map.moat; ctx.save(); ctx.beginPath(); ctx.arc(0, 0, mo.r1, 0, Math.PI * 2); ctx.arc(0, 0, mo.r0, 0, Math.PI * 2, true); ctx.clip("evenodd");
    ctx.fillStyle = "#131416"; ctx.fillRect(-mo.r1, -mo.r1, mo.r1 * 2, mo.r1 * 2);
    ctx.strokeStyle = "rgba(92,200,224,.16)"; ctx.lineWidth = hair;
    for (let y = -mo.r1; y < mo.r1; y += 18) { ctx.beginPath(); for (let x = -mo.r1; x <= mo.r1; x += 24) { const yy = y + Math.sin(x * 0.03 + this.time * 1.2 + y) * 3; x === -mo.r1 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); } ctx.stroke(); }
    ctx.restore();
    ctx.strokeStyle = T8.l5; ctx.lineWidth = hair; for (const r of [mo.r0, mo.r1]) { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); }
    // the island: concentric rings, a ruin crown at the centre
    ctx.strokeStyle = T8.l3; for (let r = 40; r < mo.r0; r += 40) { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.strokeStyle = T8.l5; ctx.beginPath(); for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; ctx.moveTo(Math.cos(a) * 30, Math.sin(a) * 30); ctx.lineTo(Math.cos(a) * 60, Math.sin(a) * 60); } ctx.stroke();
  }

  prop(p: { kind: string; x: number; y: number; r: number; a: number }, hair: number): void {
    const { ctx } = this; ctx.lineWidth = hair; ctx.strokeStyle = T8.l5; ctx.fillStyle = T8.ground;
    const t = this.time;
    if (p.kind === "boulder") {
      ctx.beginPath(); for (let k = 0; k <= 9; k++) { const a = p.a + k / 9 * Math.PI * 2, rr = p.r * (0.82 + 0.18 * Math.sin(k * 2.3 + p.a * 5)); k ? ctx.lineTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr) : ctx.moveTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = T8.l2; ctx.beginPath(); for (let k = -2; k <= 2; k++) { const o = k * p.r * 0.25; ctx.moveTo(p.x - p.r * 0.5 + o, p.y + p.r * 0.5); ctx.lineTo(p.x + p.r * 0.1 + o, p.y - p.r * 0.1); } ctx.stroke();
    } else if (p.kind === "weed") {
      ctx.strokeStyle = "rgba(91,227,154,.28)"; ctx.beginPath();
      for (let k = 0; k < 5; k++) { const a = p.a + k * 1.26, bx = p.x + Math.cos(a) * p.r * 0.3, by = p.y + Math.sin(a) * p.r * 0.3, sw = Math.sin(t * 1.3 + k + p.x * 0.01) * 0.3;
        ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + Math.cos(a + sw) * p.r * 0.7, by + Math.sin(a + sw) * p.r * 0.7, bx + Math.cos(a + sw * 2) * p.r * 1.3, by + Math.sin(a + sw * 2) * p.r * 1.3); }
      ctx.stroke();
    } else if (p.kind === "carcass") {
      const c = Math.cos(p.a), s = Math.sin(p.a); ctx.beginPath(); ctx.moveTo(p.x - c * p.r, p.y - s * p.r); ctx.lineTo(p.x + c * p.r, p.y + s * p.r); ctx.stroke();
      ctx.beginPath(); for (let k = -4; k <= 4; k++) { const ox = p.x + c * k * p.r * 0.2, oy = p.y + s * k * p.r * 0.2, L = p.r * 0.45 * (1 - Math.abs(k) / 6);
        ctx.moveTo(ox - s * L, oy + c * L); ctx.quadraticCurveTo(ox, oy, ox + s * L, oy - c * L); } ctx.stroke();
    } else if (p.kind === "vent") {
      for (let k = 0; k < 3; k++) { const r = p.r * (0.3 + ((t * 0.4 + k / 3) % 1) * 0.9); ctx.globalAlpha = 1 - ((t * 0.4 + k / 3) % 1); ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke(); }
      ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.22, 0, Math.PI * 2); ctx.stroke();
    } else if (p.kind === "ruin") {   // a fallen pillar, its capital toward the tower it points at
      const c = Math.cos(p.a), s = Math.sin(p.a), L = p.r * 1.4, wv = p.r * 0.32;
      ctx.beginPath(); ctx.moveTo(p.x - c * L - s * wv, p.y - s * L + c * wv); ctx.lineTo(p.x + c * L - s * wv, p.y + s * L + c * wv); ctx.lineTo(p.x + c * L + s * wv, p.y + s * L - c * wv); ctx.lineTo(p.x - c * L + s * wv, p.y - s * L - c * wv); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = T8.ink2; ctx.beginPath(); ctx.moveTo(p.x + c * L - s * wv * 1.8, p.y + s * L + c * wv * 1.8); ctx.lineTo(p.x + c * (L + wv * 2.2), p.y + s * (L + wv * 2.2)); ctx.lineTo(p.x + c * L + s * wv * 1.8, p.y + s * L - c * wv * 1.8); ctx.stroke();
      ctx.strokeStyle = T8.l2; ctx.beginPath(); for (let k = -2; k <= 2; k++) { const o = k * L * 0.3; ctx.moveTo(p.x + c * o - s * wv, p.y + s * o + c * wv); ctx.lineTo(p.x + c * o + s * wv, p.y + s * o - c * wv); } ctx.stroke();
    }
  }

  // towers (always shown, with a beacon) and stairs (only to Eyes)
  gates(g: Game, v: { x0: number; x1: number; y0: number; y1: number }, hair: number): void {
    const { ctx } = this, eyes = g.maw.traits.eyes;
    for (const q of g.map.gates) {
      if (q.kind === "stair" && eyes <= 0) continue;
      const c = Math.cos(q.a), s = Math.sin(q.a);
      if (q.kind === "tower") {
        // the beacon: rings rising off it, seen from far
        for (let k = 0; k < 3; k++) { const u = (this.time / 2.6 + k / 3) % 1; ctx.globalAlpha = (1 - u) * 0.6; ctx.strokeStyle = T8.amber; ctx.lineWidth = hair * 1.2; ctx.beginPath(); ctx.arc(q.x, q.y, 50 + u * 360, 0, Math.PI * 2); ctx.stroke(); }
        ctx.globalAlpha = 1;
        if (q.x < v.x0 - 80 || q.x > v.x1 + 80 || q.y < v.y0 - 80 || q.y > v.y1 + 80) continue;
        ctx.fillStyle = T8.panel; ctx.strokeStyle = T8.amber; ctx.lineWidth = hair * 1.4;
        for (const r of [62, 44, 26]) { ctx.beginPath(); for (let k = 0; k < 4; k++) { const a = q.a + Math.PI / 4 + k * Math.PI / 2; k ? ctx.lineTo(q.x + Math.cos(a) * r, q.y + Math.sin(a) * r) : ctx.moveTo(q.x + Math.cos(a) * r, q.y + Math.sin(a) * r); } ctx.closePath(); r === 62 && ctx.fill(); ctx.stroke(); }
        ctx.fillStyle = T8.amber; ctx.beginPath(); ctx.arc(q.x, q.y, 6, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.strokeStyle = T8.amber; ctx.lineWidth = hair * 1.4;
        for (let k = 0; k < 5; k++) { const r = k * 14 - 20, wv = 46 - k * 5; ctx.beginPath(); ctx.moveTo(q.x - c * r - s * wv, q.y - s * r + c * wv); ctx.lineTo(q.x - c * r + s * wv, q.y - s * r - c * wv); ctx.stroke(); }
        for (let k = 0; k < 3; k++) { const u = (this.time / 2 + k / 3) % 1; ctx.globalAlpha = (1 - u) * 0.5; ctx.beginPath(); ctx.arc(q.x, q.y, 40 + u * 160, 0, Math.PI * 2); ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
    }
  }

  // what a strike now would go for (the same cone the strike uses)
  aim(g: Game): number {
    const w = g.w, m = g.maw, pos = w.get(g.player, "pos")!, me = w.get(g.player, "body")!;
    if (m.state === "climb" || m.state === "dead") return 0;
    const dir = Math.hypot(m.input.x, m.input.y) > 0.2 ? Math.atan2(m.input.y, m.input.x) : me.heading, reach = me.len * (RULES.reach[0] + RULES.reach[1] * Math.max(0.3, m.coil));
    let best = 0, bs = 0;
    for (const o of g.grid.near(pos.x, pos.y, reach + me.len)) { if (!g.canEat(g.player, o)) continue; const a = w.get(o, "alt"); if (!a) continue;
      if (m.state === "swim" ? Math.abs(a.z - w.get(g.player, "alt")!.z) > 0.55 : a.z > RULES.reachWalk + 0.25 * m.coil + 0.1 * m.traits.leap) continue;
      const op = w.get(o, "pos")!, dx = op.x - pos.x, dy = op.y - pos.y, d = Math.hypot(dx, dy), da = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - dir), Math.cos(Math.atan2(dy, dx) - dir)));
      if (d > reach + me.len * 0.4 || da > RULES.cone) continue; const s = (1 - da / RULES.cone) * (1 - d / (reach + me.len)); if (s > bs) { bs = s; best = o; } }
    return best;
  }
  brackets(pts: number[], len: number, hair: number): void {
    const { ctx } = this, c = along(pts, 0.4), r = len * 0.55 + 10, k = r * 0.35;
    ctx.strokeStyle = T8.amber; ctx.lineWidth = hair * 1.5; ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(c.x + sx * r, c.y + sy * (r - k)); ctx.lineTo(c.x + sx * r, c.y + sy * r); ctx.lineTo(c.x + sx * (r - k), c.y + sy * r); }
    ctx.stroke();
  }

  // the Maw: its own rows of parts along the spine, the neck thrown on a strike, two-part legs stepping by IK, fins when it swims
  maw(g: Game, hair: number, dt: number): void {
    const { ctx } = this, w = g.w, m = g.maw, b = w.get(g.player, "body")!, sp = w.get(g.player, "spine")!, alt = w.get(g.player, "alt")!, P = sp.pts, len = b.len;
    const lift = 1 + alt.z * 0.22, s = (len / 230) * lift, mk = KIT.maw;
    const dead = m.state === "dead";
    ctx.fillStyle = T8.panel; ctx.strokeStyle = dead ? T8.ink2 : m.energy < 0.22 && Math.floor(this.time * 2) % 2 ? T8.rec : T8.ink; ctx.lineJoin = "round";
    const swim = m.state === "swim" || m.state === "leap";
    // shadow when off the ground
    if (alt.z > 0.15) { ctx.strokeStyle = T8.l3; ctx.lineWidth = len * 0.07; ctx.lineCap = "round"; ctx.beginPath(); for (let i = 0; i < P.length; i += 2) i ? ctx.lineTo(P[i], P[i + 1]) : ctx.moveTo(P[i], P[i + 1]); ctx.stroke(); ctx.strokeStyle = T8.ink; }
    ctx.lineWidth = 1.1 / (s * this.zoom);
    const sh = along(P, 0.33), hu = along(P, 0.64);
    // legs: four, planted and stepping in diagonal pairs (tucked while swimming)
    const hips = [[sh, 1, 1], [sh, -1, 1], [hu, 1, -1], [hu, -1, -1]] as const;
    if (this.feet.length !== 4) this.feet = hips.map(([h, side]) => { const x = h.x + Math.cos(h.a + side * Math.PI / 2) * len * 0.22, y = h.y + Math.sin(h.a + side * Math.PI / 2) * len * 0.22; return { x, y, fx: x, fy: y, t: 1 }; });
    const L1 = len * 0.15, L2 = len * 0.15;
    hips.forEach(([h, side, front], i) => {
      const f = this.feet[i], ox = Math.cos(h.a + side * Math.PI / 2), oy = Math.sin(h.a + side * Math.PI / 2);
      const hx = h.x + ox * len * 0.06, hy = h.y + oy * len * 0.06;
      const rest = { x: hx + ox * len * 0.16 + Math.cos(h.a) * len * (swim ? -0.18 : 0.08), y: hy + oy * len * 0.16 + Math.sin(h.a) * len * (swim ? -0.18 : 0.08) };
      if (swim || m.state === "climb") { f.x += (rest.x - f.x) * Math.min(1, dt * 10); f.y += (rest.y - f.y) * Math.min(1, dt * 10); f.t = 1; }
      else {
        const partner = this.feet[i ^ 3];   // the diagonal pair steps together, the other pair waits
        if (f.t >= 1 && Math.hypot(rest.x - f.x, rest.y - f.y) > len * 0.2 && this.feet[i ^ 1].t >= 1) { f.fx = f.x; f.fy = f.y; f.t = 0; void partner; }
        if (f.t < 1) { f.t = Math.min(1, f.t + dt / 0.13); const lead = { x: rest.x + Math.cos(h.a) * len * 0.1, y: rest.y + Math.sin(h.a) * len * 0.1 }; f.x = f.fx + (lead.x - f.fx) * f.t; f.y = f.fy + (lead.y - f.fy) * f.t; }
      }
      // two-bone IK, the knee bent outward (front knees back, hind knees forward)
      let dx = f.x - hx, dy = f.y - hy, d = Math.hypot(dx, dy); const maxD = (L1 + L2) * 0.98;
      if (d > maxD) { f.x = hx + dx / d * maxD; f.y = hy + dy / d * maxD; dx = f.x - hx; dy = f.y - hy; d = maxD; }
      const a0 = Math.atan2(dy, dx), cosK = Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * Math.max(1e-3, d)))), bend = Math.acos(cosK) * (side * front > 0 ? -1 : 1);
      const kx = hx + Math.cos(a0 + bend) * L1, ky = hy + Math.sin(a0 + bend) * L1;
      if (!this.hide.has("legs")) { this.bone(mk.thigh, "maw-thigh", hx, hy, kx, ky, side < 0); this.bone(mk.shin, "maw-shin", kx, ky, f.x, f.y, side < 0); }
    });
    // fins: its own wing, when it swims or leaps
    if (swim) {
      const flap = 0.65 + 0.35 * Math.sin(this.time * 7), ws = (len * 0.42 / mk.wing.w) * lift;
      for (const [at, k] of [[sh, 1], [hu, 0.7]] as const) for (const side of [1, -1]) {
        const x = at.x + Math.cos(at.a + side * Math.PI / 2) * len * 0.1, y = at.y + Math.sin(at.a + side * Math.PI / 2) * len * 0.1;
        ctx.lineWidth = 1 / (ws * k * this.zoom); drawCentred(ctx, "maw-wing", mk.wing.d, x, y, at.a + Math.PI / 2 + side * 0.25, -side * ws * k * flap, ws * k);
      }
      ctx.lineWidth = 1.1 / (s * this.zoom);
    }
    // the body rows, tail first, so the head is on top
    const T: Record<string, number> = { tail: 0.86, haunch: 0.66, back: 0.5, shoulders: 0.33 };
    const rows = mk.rows, mo = mouthAt(g), striking = !!m.strike;
    const head = striking ? { x: mo.x - Math.cos(m.strike!.dir) * len * 0.1, y: mo.y - Math.sin(m.strike!.dir) * len * 0.1, a: m.strike!.dir } : along(P, 0.03);
    for (const role of ["tail", "haunch", "back", "shoulders"]) { if (this.hide.has(role)) continue; const r = rows.find((q) => q.role === role)!; const at = along(P, T[role]); drawPart(ctx, r, "maw-" + role, at.x, at.y, at.a + Math.PI / 2, s); }
    // the neck: two pieces from the shoulders to wherever the head is (thrown on a strike)
    const neck = rows.find((q) => q.role === "neck")!, sh2 = along(P, 0.3);
    for (const u of [0.62, 0.3]) { const nx = sh2.x + (head.x - sh2.x) * u, ny = sh2.y + (head.y - sh2.y) * u, na = Math.atan2(head.y - sh2.y, head.x - sh2.x);
      drawPart(ctx, neck, "maw-neck", nx, ny, na + Math.PI / 2, s, striking ? 1 : 1); }
    // fangs open as it coils, a crown round the mouth
    const open = striking ? 1 : m.coil;
    if (open > 0.05) {
      const fs = (len * 0.2 / 126) * lift;
      ctx.lineWidth = 1 / (fs * this.zoom); ctx.strokeStyle = m.coil > 0.95 || striking ? T8.amber : T8.ink;
      const fangs = mk.fangs.filter((f) => f.id.startsWith("FANG-U"));
      for (let k = 0; k < 6; k++) { const f = fangs[k % 3], side = k < 3 ? 1 : -1, spread = (0.25 + (k % 3) * 0.32) * open * side;
        const fx = head.x + Math.cos(head.a + side * Math.PI / 2) * len * 0.035, fy = head.y + Math.sin(head.a + side * Math.PI / 2) * len * 0.035;
        drawCentred(ctx, "fang" + f.id, f.d, fx + Math.cos(head.a) * len * 0.05, fy + Math.sin(head.a) * len * 0.05, head.a + Math.PI / 2 + spread, fs * (side < 0 ? -1 : 1), fs * (0.6 + 0.4 * open)); }
      ctx.strokeStyle = T8.ink; ctx.lineWidth = 1.1 / (s * this.zoom);
    }
    drawPart(ctx, rows.find((q) => q.role === "head")!, "maw-head", head.x, head.y, head.a + Math.PI / 2, s * 1.05);
    // the coil gauge: an amber arc round the head
    if (m.coil > 0 && !striking) { ctx.strokeStyle = T8.amber; ctx.lineWidth = hair * 2; ctx.beginPath(); ctx.arc(head.x, head.y, len * 0.32, head.a - Math.PI * m.coil, head.a + Math.PI * m.coil); ctx.stroke(); }
    if (m.stunT > 0) { ctx.strokeStyle = T8.rec; ctx.lineWidth = hair * 1.5; ctx.setLineDash([4 * hair, 4 * hair]); ctx.beginPath(); ctx.arc(sh.x, sh.y, len * 0.55, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
  }
  bone(part: MawPart, key: string, x0: number, y0: number, x1: number, y1: number, flip: boolean): void {
    const L = Math.hypot(x1 - x0, y1 - y0), s = L / part.w;
    this.ctx.lineWidth = 1.1 / (s * this.zoom * 1.25);
    // the part's length runs along its x: centre it on the bone, turned to the bone
    drawPart(this.ctx, part, key, (x0 + x1) / 2, (y0 + y1) / 2, Math.atan2(y1 - y0, x1 - x0) + (flip ? Math.PI : 0), s * 1.1, 1, false);
  }

  // the dark: the Frond is lit only round you (wider with Eyes); the Shoals dim
  fog(g: Game, hair: number): void {
    const { ctx } = this, map = g.map, pp = g.w.get(g.player, "pos")!, pb = g.w.get(g.player, "body")!, eyes = g.maw.traits.eyes;
    for (const ring of map.rings) {
      if (!ring.dark) continue;
      const lit = eyes > 0 ? 260 + 120 * eyes + pb.len : 70 + pb.len * 1.2;
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, ring.r1, 0, Math.PI * 2); ctx.arc(0, 0, ring.r0, 0, Math.PI * 2, true); ctx.clip("evenodd");
      ctx.fillStyle = `rgba(16,16,18,${ring.dark})`; ctx.beginPath(); ctx.rect(pp.x - 4000, pp.y - 4000, 8000, 8000); ctx.arc(pp.x, pp.y, lit, 0, Math.PI * 2, true); ctx.fill("evenodd");
      ctx.strokeStyle = T8.l3; ctx.lineWidth = hair; ctx.setLineDash([3 * hair, 7 * hair]); ctx.beginPath(); ctx.arc(pp.x, pp.y, lit, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // with Climb you feel the towers: ticks at the screen's edge toward each (and the stairs, with Eyes)
  compass(g: Game, v: { x0: number; x1: number; y0: number; y1: number }, hair: number): void {
    const { ctx } = this, m = g.maw, ri = g.ringOf(g.player);
    const want = ri === 0 && m.traits.climb > 0 ? "tower" : ri === 1 && m.traits.eyes > 0 ? "stair" : null; if (!want) return;
    const cx = this.cx, cy = this.cy, hw = (v.x1 - v.x0) / 2 - 110, hh = (v.y1 - v.y0) / 2 - 110;
    for (const q of g.map.gates) { if (q.kind !== want) continue; const dx = q.x - cx, dy = q.y - cy; if (Math.abs(dx) < hw && Math.abs(dy) < hh) continue;
      const k = Math.min(hw / Math.abs(dx || 1e-6), hh / Math.abs(dy || 1e-6)), x = cx + dx * k, y = cy + dy * k, a = Math.atan2(dy, dx), L = 26 * hair * 2;
      ctx.strokeStyle = T8.amber; ctx.lineWidth = hair * 2; ctx.beginPath(); ctx.moveTo(x - Math.cos(a - 0.5) * L, y - Math.sin(a - 0.5) * L); ctx.lineTo(x, y); ctx.lineTo(x - Math.cos(a + 0.5) * L, y - Math.sin(a + 0.5) * L); ctx.stroke(); }
  }
}
