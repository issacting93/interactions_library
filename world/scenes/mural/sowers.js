/* world/scenes/mural/sowers.js — "The Sowers and the Hollow", a second mythos painted with the mural's tools
   (window.MuralKit, world/scenes/mural/mural.js), in black and white like a scratchboard engraving.
   An original myth on the themes of precursor stories (makers who seed life by sacrificing
   themselves, a parasite that follows the seed, a last weapon that stills every living thing so the
   parasite starves): no creature, ship or structure from those stories is drawn, only the themes,
   remade from the library's generators.

     I   The Sowing     a colossal hooded Sower kneels at a black sea and unravels into it; a seed-wheel
                        (Sigil Forge) hangs in the sky; the first creatures (Cybernetic Ecology) rise
     II  The Hollowing  a pale root grows up from the ground (a branching growth, like space
                        colonisation) through the tower city (Spire Forge) and into the creatures,
                        leaving them hollow
     III The Silence    the last Sowers light the Wheel (a great seal ringed by lesser seals); its light
                        sweeps over the world and the ruins (Creature Arch, Classical) fall to ash;
                        the last Sower sits turned to stone, holding the one seed that was kept

   Value comes from line, not colour: engraved horizontal hatching for the sky, wave lines for the sea,
   stipple for light and ash, white lines on black bodies for every generated figure.
     Sowers.paint(canvas, { seed, kit, species, onStage }) -> Promise   (3600 x 1500) */
(function () {
  "use strict";
  const M = () => window.MuralKit;
  const INK = "#f1eee6", INK2 = "#bdb8ad", INK3 = "#6d6a64", BLACK = "#0a0a0a", BLACK2 = "#161616";
  const a = (v) => `rgba(241,238,230,${v})`, k = (v) => `rgba(10,10,10,${v})`;

  // ── engraving ────────────────────────────────────────────────────────────
  // horizontal hatching whose weight follows a brightness function of height (0 dark .. 1 light)
  function engraveSky(ctx, x0, y0, x1, y1, light, R) {
    for (let y = y0; y < y1; y += 4) {
      const v = light(y);
      if (v < 0.03) continue;
      ctx.strokeStyle = a(Math.min(0.9, 0.15 + v * 0.75)); ctx.lineWidth = 0.4 + v * 1.9;
      ctx.beginPath();
      let x = x0;
      while (x < x1) {   // broken lines, the way a burin skips
        const len = 60 + R() * 380 * (0.4 + v), gap = 4 + R() * 30 * (1 - v);
        ctx.moveTo(x, y + Math.sin(x * 0.003 + y) * 1.2); ctx.lineTo(Math.min(x1, x + len), y + Math.sin((x + len) * 0.003 + y) * 1.2);
        x += len + gap;
      }
      ctx.stroke();
    }
  }
  function stipple(ctx, cx, cy, r, n, R, fall, size) {
    ctx.fillStyle = INK;
    for (let i = 0; i < n; i++) {
      const t = Math.pow(R(), fall || 1.6), ang = R() * Math.PI * 2, d = t * r;
      const s = (size || 1.6) * (1 - t * 0.6);
      ctx.globalAlpha = 0.25 + (1 - t) * 0.7; ctx.fillRect(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, s, s);
    }
    ctx.globalAlpha = 1;
  }
  function hatchClip(ctx, path, ang, gap, lw, alpha, bbox) {
    ctx.save(); path(); ctx.clip();
    const [x0, y0, x1, y1] = bbox, c = Math.cos(ang), s = Math.sin(ang), L = Math.hypot(x1 - x0, y1 - y0);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    ctx.strokeStyle = a(alpha); ctx.lineWidth = lw; ctx.beginPath();
    for (let d = -L; d <= L; d += gap) { ctx.moveTo(cx + c * -L - s * d, cy + s * -L + c * d); ctx.lineTo(cx + c * L - s * d, cy + s * L + c * d); }
    ctx.stroke(); ctx.restore();
  }
  // the sea: wave lines that open out toward the viewer
  function sea(ctx, x0, x1, y0, y1, R) {
    ctx.fillStyle = BLACK; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    let y = y0 + 3, gap = 3;
    while (y < y1) {
      const t = (y - y0) / (y1 - y0);
      ctx.strokeStyle = a(0.25 + 0.5 * (1 - t)); ctx.lineWidth = 0.6 + t * 1.6;
      ctx.beginPath();
      for (let x = x0; x <= x1; x += 8) { const yy = y + Math.sin(x * (0.02 - t * 0.012) + y * 0.7) * (1 + t * 5); x === x0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); }
      ctx.stroke();
      y += gap; gap *= 1.12;
    }
  }
  // the Hollow: a pale root that branches as it climbs, knotted where it splits (a growth after
  // space colonisation: each tip leans toward the nearest target and forks along the way)
  function hollowRoot(ctx, x, y, ang, len, w, depth, R, targets, out) {
    const pts = [[x, y]];
    let cx = x, cy = y, a0 = ang;
    const steps = Math.max(4, Math.round(len / 14));
    for (let i = 0; i < steps; i++) {
      // lean toward the nearest target, wander a little
      let best = null, bd = 1e9;
      for (const t of targets) { const d = Math.hypot(t[0] - cx, t[1] - cy); if (d < bd) { bd = d; best = t; } }
      if (best && bd < 900) { const ta = Math.atan2(best[1] - cy, best[0] - cx); a0 += Math.atan2(Math.sin(ta - a0), Math.cos(ta - a0)) * 0.08; }
      a0 += (R() - 0.5) * 0.45;
      cx += Math.cos(a0) * 14; cy += Math.sin(a0) * 14; pts.push([cx, cy]);
    }
    out.push({ pts, w });
    if (depth > 0) {
      const forks = 1 + (R() < 0.55 ? 1 : 0);
      for (let f = 0; f < forks; f++) {
        const at = pts[Math.floor(pts.length * (0.4 + R() * 0.55))];
        hollowRoot(ctx, at[0], at[1], a0 + (R() - 0.5) * 1.6, len * (0.55 + R() * 0.3), w * 0.62, depth - 1, R, targets, out);
      }
    }
  }
  function drawRoots(ctx, roots) {
    // black casing first, so the pale root reads over white line work too
    for (const pass of [0, 1]) for (const r of roots) {
      ctx.beginPath(); r.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeStyle = pass ? "rgba(189,184,173,0.85)" : BLACK; ctx.lineWidth = pass ? r.w : r.w + 2.5; ctx.stroke();
      if (pass) { const e = r.pts[r.pts.length - 1]; ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(e[0], e[1], Math.max(1.2, r.w * 0.9), 0, Math.PI * 2); ctx.fill(); }
    }
    // knots where the root swells
    ctx.fillStyle = INK2;
    for (const r of roots) if (r.w > 3) { const p = r.pts[Math.floor(r.pts.length / 2)]; ctx.beginPath(); ctx.ellipse(p[0], p[1], r.w * 1.3, r.w * 0.9, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = BLACK; ctx.beginPath(); ctx.arc(p[0], p[1], r.w * 0.4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = INK2; }
  }
  // a Sower: hooded, very tall, a smooth faceless mask split by one vertical line; robe in engraved folds
  function sower(ctx, x, y, h, R, o) {
    o = o || {};
    const w = h * 0.34;
    ctx.save(); ctx.translate(x, y);
    if (o.kneel) ctx.scale(1, 0.72);
    const robe = () => { ctx.beginPath(); ctx.moveTo(-w * 0.18, -h * 0.86); ctx.bezierCurveTo(-w * 0.5, -h * 0.6, -w * 0.62, -h * 0.25, -w * 0.7, 0); ctx.lineTo(w * 0.7, 0); ctx.bezierCurveTo(w * 0.62, -h * 0.25, w * 0.5, -h * 0.6, w * 0.18, -h * 0.86); ctx.closePath(); };
    robe(); ctx.fillStyle = o.stone ? BLACK2 : BLACK; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.stroke();
    // folds: long engraved lines down the robe
    hatchClip(ctx, robe, Math.PI / 2 + 0.04, o.stone ? 7 : 11, 1.1, o.stone ? 0.55 : 0.4, [-w, -h, w, 0]);
    // hood and mask
    ctx.beginPath(); ctx.ellipse(0, -h * 0.9, w * 0.24, h * 0.1, 0, 0, Math.PI * 2); ctx.fillStyle = BLACK; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -h * 0.885, w * 0.12, h * 0.07, 0, 0, Math.PI * 2); ctx.fillStyle = o.stone ? INK3 : INK; ctx.fill();
    ctx.strokeStyle = BLACK; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, -h * 0.95); ctx.lineTo(0, -h * 0.82); ctx.stroke();
    // a band of glyph dots across the chest
    ctx.fillStyle = INK; for (let i = -3; i <= 3; i++) ctx.fillRect(i * w * 0.07 - 2, -h * 0.62, 4, 4);
    ctx.restore();
  }

  async function paint(target, opts) {
    const K = M(), W = K.W, H = K.H, FR = K.FR;
    const R = ForgeKit.rng(opts.seed || 1), kit = opts.kit, species = opts.species, stage = opts.onStage || (() => {});
    target.width = W; target.height = H;
    const ctx = target.getContext("2d"), Reg = ForgeRegistry;
    const draw = (id, seed) => Reg.run(id, Reg.create(id, kit, seed), kit).svg;
    const SEA = 1040, LAND = 1120;
    const engraved = (mask, o) => K.figure(mask, Object.assign({ body: BLACK, bodyAlpha: 1, line: INK }, o));

    // ground and sky
    stage("Engraving the sky");
    ctx.fillStyle = BLACK; ctx.fillRect(0, 0, W, H);
    // light falls from the Wheel (right) and from the seed-wheel (left); the middle is darkest
    const WHEEL = [3020, 470], SEED = [640, 380];
    engraveSky(ctx, 0, FR, W, LAND, (y) => {
      const t = (y - FR) / (LAND - FR);
      return Math.max(0, 0.08 + 0.55 * Math.pow(t, 2.2));
    }, R);
    for (let i = 0; i < 1400; i++) { ctx.fillStyle = a(0.3 + R() * 0.6); const s = R() < 0.95 ? 1.3 : 2.6; ctx.fillRect(R() * W, FR + R() * (SEA - FR) * 0.75, s, s); }
    await K.tick();

    // ── III first (it is lit from far away): the Wheel and its light ──
    stage("Lighting the Wheel");
    // the sweep: thin concentric arcs travelling left over everything
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (let i = 1; i < 26; i++) { const r = 240 + i * 92; ctx.beginPath(); ctx.arc(WHEEL[0], WHEEL[1], r, Math.PI * 0.55, Math.PI * 1.45); ctx.strokeStyle = a(Math.max(0.03, 0.32 - i * 0.012)); ctx.lineWidth = 1.2 + (i % 3 === 0 ? 1.4 : 0); ctx.stroke(); }
    ctx.restore();
    stipple(ctx, WHEEL[0], WHEEL[1], 520, 9000, R, 2.2, 1.8);
    // the Wheel: a great seal, ringed by twelve lesser seals
    for (const [r, w] of [[330, 3], [352, 1.2], [470, 1.2], [492, 3]]) { ctx.beginPath(); ctx.arc(WHEEL[0], WHEEL[1], r, 0, Math.PI * 2); ctx.strokeStyle = INK; ctx.lineWidth = w; ctx.stroke(); }
    const wheel = engraved(await K.svgMask(draw("seal.sigil", Math.floor(R() * 1e9)), 620, 620), { body: BLACK });
    K.place(ctx, wheel, WHEEL[0], WHEEL[1], { centre: true, glow: 14, glowAlpha: 0.7 });
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2, x = WHEEL[0] + Math.cos(ang) * 412, y = WHEEL[1] + Math.sin(ang) * 412;
      ctx.beginPath(); ctx.arc(x, y, 50, 0, Math.PI * 2); ctx.fillStyle = BLACK; ctx.fill();
      const s = engraved(await K.svgMask(draw("seal.sigil", Math.floor(R() * 1e9)), 92, 92), {});
      K.place(ctx, s, x, y, { centre: true });
    }
    await K.tick();

    // ── I: the seed-wheel, the sea, the kneeling Sower ──
    stage("Hanging the seed-wheel");
    stipple(ctx, SEED[0], SEED[1], 300, 5000, R, 1.9, 1.6);
    for (const r of [190, 205, 260]) { ctx.beginPath(); ctx.arc(SEED[0], SEED[1], r, 0, Math.PI * 2); ctx.strokeStyle = a(r === 260 ? 0.4 : 0.9); ctx.lineWidth = r === 205 ? 1 : 2.4; ctx.stroke(); }
    const seedSeal = engraved(await K.svgMask(draw("seal.sigil", Math.floor(R() * 1e9)), 370, 370), {});
    K.place(ctx, seedSeal, SEED[0], SEED[1], { centre: true, glow: 10, glowAlpha: 0.5 });
    // threads of seed falling from it to the sea
    ctx.strokeStyle = a(0.5); ctx.lineWidth = 1;
    for (let i = 0; i < 40; i++) { const x = SEED[0] - 120 + R() * 240; ctx.beginPath(); ctx.moveTo(x, SEED[1] + 200); ctx.bezierCurveTo(x + (R() - 0.5) * 80, SEED[1] + 380, x + (R() - 0.5) * 140, SEA - 200, x + (R() - 0.5) * 200, SEA); ctx.stroke(); }
    sea(ctx, 0, 1220, SEA, H - FR, R);
    await K.tick();

    // ── the land: II and III stand on it ──
    stage("Raising the land");
    const ground = (x) => LAND - 40 * Math.sin(x * 0.0021 + 1.3) - 18 * Math.sin(x * 0.0063);
    const land = () => { ctx.beginPath(); ctx.moveTo(1180, H); ctx.lineTo(1180, ground(1180) + 60); for (let x = 1180; x <= W; x += 10) ctx.lineTo(x, ground(x)); ctx.lineTo(W, H); ctx.closePath(); };
    land(); ctx.fillStyle = BLACK; ctx.fill();
    hatchClip(ctx, land, 0, 6, 1, 0.22, [1180, LAND - 80, W, H]);
    ctx.save(); land(); ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.stroke(); ctx.restore();
    // the cliff the Sower kneels on, between sea and land
    const LEDGE = SEA - 46;
    // a jagged rock tongue running out into the sea, its top broken into small steps
    const rock = [[790, H], [800, SEA + 70], [826, SEA + 26], [848, SEA + 8], [872, LEDGE + 14], [896, LEDGE + 2], [930, LEDGE + 6], [968, LEDGE - 4], [1012, LEDGE + 2], [1060, LEDGE - 8], [1110, LEDGE - 2], [1160, LEDGE - 14], [1214, ground(1214) - 30], [1262, ground(1262) - 4], [1290, H]];
    const cliff = () => { ctx.beginPath(); rock.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); };
    cliff(); ctx.fillStyle = BLACK; ctx.fill(); hatchClip(ctx, cliff, 1.2, 5, 1, 0.42, [800, LEDGE - 20, 1320, H]); hatchClip(ctx, cliff, -0.4, 9, 0.8, 0.18, [800, LEDGE - 20, 1320, H]);
    cliff(); ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.stroke();
    // cracks down the rock face
    ctx.save(); cliff(); ctx.clip(); ctx.strokeStyle = a(0.55); ctx.lineWidth = 1.3;
    for (let i = 0; i < 9; i++) { let x = 830 + R() * 420, y = LEDGE + R() * 40; ctx.beginPath(); ctx.moveTo(x, y); for (let j = 0; j < 8; j++) { x += (R() - 0.5) * 30; y += 20 + R() * 30; ctx.lineTo(x, y); } ctx.stroke(); }
    ctx.restore();
    await K.tick();

    // the far towers of the city, between the chapters
    stage("Building the city");
    for (const [x, h] of [[1500, 330], [2260, 300], [2450, 260]]) {
      const im = engraved(await K.svgMask(draw("building.spire", Math.floor(R() * 1e9)), h * 0.7, h), { line: INK2 });
      K.place(ctx, im, x, ground(x) + 6, { alpha: 0.9 });
    }
    const TX = 1880, tower = engraved(await K.svgMask(draw("building.spire", Math.floor(R() * 1e9)), 620, 860), {});
    K.place(ctx, tower, TX, ground(TX) + 8);
    await K.tick();

    // the Old Ones: rising from the sea (I), circling the tower (II)
    stage("Waking the first creatures");
    const rend = K.creatureRenderer(species), keys = species.map((s) => s.key);
    const hollowed = [];
    const creature = async (key, x, y, size, rot, o) => {
      o = o || {};
      const pose = { bend: (R() - 0.5) * 50, tuck: R() * 0.3, puff: 0.5 + R() * 0.5, glide: 0.6 + R() * 0.4, flap: 0.8 + R() * 0.5, turn: (R() - 0.5) * 0.6 };
      const m = K.creatureMask(rend, species, key, pose), sc = size / Math.max(m.width, m.height);
      // brighter lines and a faint body, so the small creatures still read on black
      const im = K.figure(K.scaled(m, sc), { body: "#a8a398", bodyAlpha: 0.3, line: "#ffffff" });
      K.place(ctx, im, x, y, { centre: true, rot, glow: o.glow ?? 7, glowAlpha: 0.55, alpha: o.alpha ?? 1 });
      if (o.hollow) hollowed.push([x, y, size]);
      await K.tick();
    };
    // rising from the sea: small, dim, one after another up toward the seed-wheel
    for (const [ki, x, y, s, r] of [[10, 300, 890, 260, -0.2], [0, 520, 760, 320, 0.25], [6, 220, 560, 280, -0.4], [11, 760, 600, 240, 0.3]]) await creature(keys[ki], x, y, s, r, { glow: 10 });
    // around the tower, being hollowed
    for (const [ki, x, y, s, r] of [[3, 1560, 520, 360, -0.35], [5, 2200, 430, 380, 0.4], [8, 1700, 260, 260, 1.4], [2, 2380, 740, 300, -0.6]]) await creature(keys[ki], x, y, s, r, { hollow: true });

    // ── I: the Sower, kneeling at the cliff's edge, unravelling into the sea ──
    stage("Kneeling the Sower");
    // bowed toward the sea, kneeling on the ledge's edge
    ctx.save(); ctx.translate(1010, SEA - 50); ctx.rotate(-0.16); sower(ctx, 0, 0, 820, R, { kneel: true }); ctx.restore();
    // unravelling: white fibres pouring off the Sower's front into the sea
    ctx.lineCap = "round";
    for (let i = 0; i < 80; i++) {
      const x0 = 880 + R() * 70, y0 = SEA - 420 + R() * 260, x1 = 560 + R() * 300, y1 = SEA + 4 + R() * 30;
      ctx.strokeStyle = a(0.25 + R() * 0.5); ctx.lineWidth = 0.6 + R() * 1.8;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.bezierCurveTo(x0 - 40 - R() * 60, y0 + 60, x1 + 80, y1 - 140 - R() * 80, x1, y1); ctx.stroke();
    }
    stipple(ctx, 820, SEA + 20, 220, 2600, R, 1.4, 1.4);
    await K.tick();

    // ── II: the Hollow climbs out of the ground into the tower and the creatures ──
    stage("Letting the Hollow in");
    const roots = [], targets = hollowed.map((h) => [h[0], h[1]]).concat([[TX, ground(TX) - 420], [TX - 80, ground(TX) - 700], [TX + 90, ground(TX) - 250]]);
    for (let i = 0; i < 6; i++) { const x = 1420 + R() * 1100; hollowRoot(ctx, x, ground(x) + 20, -Math.PI / 2 + (R() - 0.5) * 0.6, 240 + R() * 240, 4.5 + R() * 2, 3, R, targets, roots); }
    // inside each hollowed creature: the root's own knot, and the dark it leaves behind
    for (const [x, y, s] of hollowed) {
      ctx.fillStyle = k(0.85); ctx.beginPath(); ctx.ellipse(x, y, s * 0.16, s * 0.11, R() * 3, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 3; i++) hollowRoot(ctx, x, y, R() * Math.PI * 2, s * 0.3, 2, 1, R, [[x + (R() - 0.5) * s, y + (R() - 0.5) * s]], roots);
    }
    drawRoots(ctx, roots);
    await K.tick();

    // ── III: the ruins falling to ash under the Wheel's light, and the last Sower in stone ──
    stage("Silencing the world");
    const arch = engraved(await K.svgMask(draw("building.arch", Math.floor(R() * 1e9)), 360, 520), {});
    K.place(ctx, arch, 2700, ground(2700) + 10);
    const classic = engraved(await K.svgMask(draw("building.classical", Math.floor(R() * 1e9)), 420, 380), {});
    K.place(ctx, classic, 3330, ground(3330) + 10);
    // ash: erase the ruins and land from the right, the dust drifting toward the Wheel
    ctx.save(); ctx.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 9000; i++) { const x = 2560 + Math.pow(R(), 0.6) * 1040, y = 560 + R() * 620, s = 1 + R() * 4; if (R() < (x - 2560) / 1300) ctx.fillRect(x, y, s, s); }
    ctx.restore();
    ctx.fillStyle = INK; for (let i = 0; i < 4200; i++) { const t = R(), x = 2600 + t * 1000 + (R() - 0.5) * 60, y = 1050 - Math.pow(t, 0.7) * 520 + (R() - 0.5) * 300; ctx.globalAlpha = 0.2 + R() * 0.6; ctx.fillRect(x, y, 1.6, 1.6); }
    ctx.globalAlpha = 1;
    // the last Sower, seated, turned to stone, holding the seed that was kept
    sower(ctx, 2560, ground(2560) + 10, 560, R, { kneel: true, stone: true });
    ctx.beginPath(); ctx.arc(2560, ground(2560) - 230, 14, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
    stipple(ctx, 2560, ground(2560) - 230, 60, 500, R, 1.4, 1.4);
    await K.tick();

    // friezes: white glyphs on black between double rules, and the chapter names
    stage("Cutting the friezes");
    const script = GlyphSystem.newScript(Math.floor(R() * 1e9), R, "carved");
    const glyph = async (inner, size, ink, plate) => K.loadImg(GlyphSystem.svgDoc(inner, { size, ink, plate }));
    for (const [y0, flip] of [[0, false], [H - FR, true]]) {
      ctx.fillStyle = BLACK; ctx.fillRect(0, y0, W, FR);
      ctx.fillStyle = INK; ctx.fillRect(0, flip ? y0 + 6 : y0 + FR - 10, W, 3); ctx.fillRect(0, flip ? y0 + 14 : y0 + FR - 16, W, 1);
      ctx.fillRect(0, flip ? y0 + FR - 8 : y0 + 5, W, 1);
      let x = 34, n = 0;
      while (x < W - 60) {
        if (n % 11 === 5) { const s = engraved(await K.svgMask(draw("seal.sigil", Math.floor(R() * 1e9)), 84, 84), {}); K.place(ctx, s, x + 42, y0 + FR / 2, { centre: true }); x += 104; }
        else { const c = GlyphSystem.LEXICON[Math.floor(R() * GlyphSystem.LEXICON.length)].id; ctx.drawImage(await glyph(GlyphSystem.radical(script, c).svg, 70, INK, BLACK), x, y0 + (FR - 70) / 2); x += 78; }
        n++;
      }
    }
    for (const [cx, words] of [[600, ["spirit", "sea", "before"]], [1800, ["beast", "city", "night"]], [3000, ["sun", "fall", "after"]]]) {
      ctx.fillStyle = BLACK; ctx.strokeStyle = INK; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, FR / 2, 50, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, FR / 2, 44, 0, Math.PI * 2); ctx.lineWidth = 1; ctx.stroke();
      ctx.drawImage(await glyph(GlyphSystem.compose({ ...script, grammar: "ring", frame: "none" }, words).svg, 86, INK, BLACK), cx - 43, FR / 2 - 43);
    }
    for (const x of [1200, 2400]) { ctx.fillStyle = a(0.5); ctx.fillRect(x - 4, FR, 1, H - 2 * FR); ctx.fillRect(x + 3, FR, 1, H - 2 * FR); }
    await K.tick();

    // age: grain, scratches, a dark edge
    stage("Wearing the plate");
    const id = ctx.getImageData(0, 0, W, H), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const nz = (R() - 0.5) * 26; d[i] += nz; d[i + 1] += nz; d[i + 2] += nz; }
    ctx.putImageData(id, 0, 0);
    for (let i = 0; i < 60; i++) { const x = R() * W, y = R() * H, l = 40 + R() * 260, an = (R() - 0.5) * 0.5 + (R() < 0.5 ? 0 : Math.PI / 2); ctx.strokeStyle = a(0.08 + R() * 0.14); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(an) * l, y + Math.sin(an) * l); ctx.stroke(); }
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.5, W / 2, H / 2, W * 0.62); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.6)");
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    stage("");
  }

  window.Sowers = { paint };
})();
