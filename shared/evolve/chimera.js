/* shared/evolve/chimera.js — breed new pieces out of the library's own code.
   A chimera is three layers, each a piece the library already has, plus that piece's recipe:
     body       what it is      every Forge generator registered in ForgeRegistry that draws a figure
                                (towers, seals, arch towers, classical facades), plus a pair of
                                Cybernetic Ecology creatures (one in front, one looming behind)
     skin       how it looks    glow (light on dark), gilt (the holy light shader as gold leaf on
                                paper), blueprint (cyan lines on a ruled ground), ink (on paper)
     mechanism  how it behaves  watch (still while looked at, moves when you look away), drift
                                (always easing to new poses), breathe (a slow rhythm)
   Every body draws to a mask (bright lines on black) and every skin paints any mask, so any body
   wears any skin; that is what lets crossover between layers make things nobody drew.

   Variation: mutate tweaks one layer's recipe (the piece's own mutate(), e.g. Sigil Forge's) or
   swaps the piece for another of that layer; cross takes each layer from one parent or the other.
   Traits are measured from the render, so pieces from different tools land in one archive:
     gothic     sci-fi (0) to gothic (1): a hand formula, a stand-in for a model's judgement —
                warm hue, paper ground, organic body push it up; cool hue, dark ground, built geometry down
     ink        how much of the frame the lines cover
     mass       how much of it is enclosed (solid body vs open line work)
     symmetry   left-right mirror agreement
     complexity edge crossings per lit pixel
     restless   how much the mechanism moves it
   Quality is coherence: the figure sits in the frame, is not clipped, and is neither empty nor a blot.

     const ctx = await Chimera.setup({ kitUrl, species, defaultColHi });   // loads parts, prepares generators
     Chimera.random(ctx, R) / mutate(ctx, g, R) / cross(ctx, a, b, R)  -> genome
     await Chimera.evaluate(ctx, g, size)     -> { genome, traits, quality, thumb }
     const view = Chimera.view(ctx, canvas)   -> a live drawing surface (its own WebGL contexts)
     await Chimera.draw(ctx, g, view, pose)   -> draws a genome in a pose on that surface
     Chimera.restPose(g), Chimera.MECHANISMS[id].step(state, dt, watched) -> pose for the live view
     Chimera.AXES, Chimera.similarity(a, b), Chimera.label(g)
   Needs: kit-utils, the generator modules, forge-registry, forge-building, forge-generators,
   ecology-sim, ecology-render, holy-light, and a species file (window.SERAPH_SPECIES). Classic script. */
(function () {
  "use strict";
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  let uid = 1;
  const pickOf = (R, arr) => arr[Math.floor(R() * arr.length)];
  const between = (R, a, b) => a + R() * (b - a);
  const seedOf = (R) => Math.floor(R() * 1e9);

  // ── BODIES ────────────────────────────────────────────────────────────────
  // How organic each body reads, for the gothic trait (ecology creatures are the most alive)
  const ORGANIC = { "ecology.pair": 0.95, "glyph.logogram": 0.7, "seal.sigil": 0.6, "building.arch": 0.55, "building.spire": 0.45, "building.classical": 0.2 };
  const FIGURES = ["building", "seal"];           // registry types that draw one figure (not a sheet)

  // a Forge generator as a body: its own defaults() and mutate(), its SVG as the mask
  function forgeBody(def) {
    return {
      id: def.id, layer: "body", label: def.label, kind: "svg",
      defaults: (ctx, R) => ForgeRegistry.create(def.id, ctx.kit, seedOf(R)),
      mutate: (ctx, r, R) => ForgeRegistry.vary(def.id, r, ctx.kit, seedOf(R)),
      svg(ctx, r) {
        const key = def.id + ":" + JSON.stringify(r);
        let s = ctx.svgCache.get(key);
        if (!s) {
          s = whiteLines(ForgeRegistry.run(def.id, r, ctx.kit).svg || "");
          ctx.svgCache.set(key, s);
          if (ctx.svgCache.size > 300) ctx.svgCache.delete(ctx.svgCache.keys().next().value);
        }
        return s;
      },
    };
  }
  // Forge draws mint on a dark plate: turn every colour into its brightness, so lines are white
  // (dim lines grey) and the plate black, ready for any skin
  function whiteLines(svg) {
    return svg.replace(/#([0-9a-fA-F]{6})\b/g, (m, h) => {
      const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
      const L = Math.max(r, g, b);
      if (L < 0.2) return "#000000";
      const v = Math.round(clamp(L / 0.75, 0, 1) * 255).toString(16).padStart(2, "0");
      return "#" + v + v + v;
    });
  }

  // two Cybernetic Ecology creatures, drawn by its WebGL2 renderer
  const ecologyBody = {
    id: "ecology.pair", layer: "body", label: "Creatures", kind: "ecology",
    defaults(ctx, R) {
      const keys = ctx.species.map((s) => s.key);
      return { front: pickOf(R, keys), back: R() < 0.8 ? pickOf(R, keys) : null, fs: between(R, 480, 680), bs: between(R, 700, 880),
        lean: between(R, -6, 6), bend: between(R, -14, 14), tuck: R() * 0.8, puff: R() * 0.9, glide: R(), flap: between(R, 0.4, 1.2), turn: between(R, -0.5, 0.5) };
    },
    mutate(ctx, r, R) {
      const o = clone(r), keys = ctx.species.map((s) => s.key), k = R();
      if (k < 0.25) o.front = pickOf(R, keys);
      else if (k < 0.45) o.back = R() < 0.15 ? null : pickOf(R, keys);
      else if (k < 0.6) { o.fs = clamp(o.fs + between(R, -90, 90), 420, 720); o.bs = clamp(o.bs + between(R, -90, 90), 620, 920); }
      else { for (const p of ["tuck", "puff", "glide"]) o[p] = clamp(o[p] + between(R, -0.3, 0.3), 0, 1); o.lean = clamp(o.lean + between(R, -4, 4), -12, 12); o.bend = clamp(o.bend + between(R, -8, 8), -24, 24); }
      return o;
    },
  };

  // a phrase written as one composed glyph by shared/glyph/glyph-system.js (the Scriptorium's scripts)
  let glyphKit = null;
  const glyphBody = {
    id: "glyph.logogram", layer: "body", label: "Logogram", kind: "svg",
    defaults(ctx, R) {
      const L = GlyphSystem.LEXICON, n = 2 + Math.floor(R() * 3), words = [];
      while (words.length < n) { const c = L[Math.floor(R() * L.length)].id; if (!words.includes(c)) words.push(c); }
      return { script: GlyphSystem.newScript(seedOf(R), R), words };
    },
    mutate(ctx, r, R) {
      const o = clone(r);
      if (R() < 0.6) o.script = GlyphSystem.mutate(o.script, R);
      else { const L = GlyphSystem.LEXICON; o.words[Math.floor(R() * o.words.length)] = L[Math.floor(R() * L.length)].id; }
      return o;
    },
    svg(ctx, r) { return GlyphSystem.svgDoc(GlyphSystem.compose(r.script, r.words, glyphKit).svg, { size: 600, ink: "#ffffff", plate: "#000000", bg: "#000000" }); },
  };

  // ── SKINS: (mask, recipe) -> colours ─────────────────────────────────────
  const hsl = (h, s, l) => {
    const a = s * Math.min(l, 1 - l), f = (n) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return [f(0), f(8), f(4)];
  };
  // how warm a hue is: gold/red 1, cyan/blue 0
  const warmthOfHue = (h) => 0.5 + 0.5 * Math.cos(((h - 35) / 180) * Math.PI);
  const SKINS = {
    glow: {
      id: "glow", layer: "skin", label: "Glow", ground: "dark",
      defaults: (ctx, R) => ({ hue: R() * 360, sat: between(R, 0.4, 0.9), glow: between(R, 0.3, 1), fill: between(R, 0, 0.5) }),
      mutate: (ctx, r, R) => ({ ...r, hue: (r.hue + between(R, -40, 40) + 360) % 360, sat: clamp(r.sat + between(R, -0.15, 0.15), 0.2, 1), glow: clamp(r.glow + between(R, -0.25, 0.25), 0, 1.2), fill: clamp(r.fill + between(R, -0.2, 0.2), 0, 0.7) }),
      hue: (r) => r.hue,
    },
    gilt: {
      id: "gilt", layer: "skin", label: "Gilt", ground: "paper", shader: true,
      defaults: (ctx, R) => ({ hue: between(R, 22, 48), power: between(R, 0.6, 1.3), fill: between(R, 0.1, 0.45), ring: R() < 0.4 ? 0 : between(R, 0.08, 0.3), burst: between(R, 0.2, 1) }),
      mutate: (ctx, r, R) => ({ ...r, hue: clamp(r.hue + between(R, -8, 8), 10, 60), power: clamp(r.power + between(R, -0.25, 0.25), 0.3, 1.6), fill: clamp(r.fill + between(R, -0.15, 0.15), 0, 0.6),
        ring: R() < 0.15 ? (r.ring ? 0 : between(R, 0.08, 0.3)) : clamp((r.ring ?? 0.2) + (r.ring ? between(R, -0.05, 0.05) : 0), 0, 0.34), burst: clamp((r.burst ?? 0.8) + between(R, -0.2, 0.2), 0, 1.2) }),
      hue: (r) => r.hue,
    },
    blueprint: {
      id: "blueprint", layer: "skin", label: "Blueprint", ground: "dark",
      defaults: (ctx, R) => ({ hue: between(R, 185, 225), grid: Math.round(between(R, 6, 18)), fill: between(R, 0, 0.3) }),
      mutate: (ctx, r, R) => ({ ...r, hue: clamp(r.hue + between(R, -10, 10), 170, 240), grid: clamp(Math.round(r.grid + between(R, -3, 3)), 4, 24), fill: clamp(r.fill + between(R, -0.12, 0.12), 0, 0.5) }),
      hue: (r) => r.hue,
    },
    ink: {
      id: "ink", layer: "skin", label: "Ink", ground: "paper",
      defaults: (ctx, R) => ({ hue: R() < 0.6 ? between(R, 15, 40) : R() * 360, sat: between(R, 0.05, 0.5), fill: between(R, 0.05, 0.5) }),
      mutate: (ctx, r, R) => ({ ...r, hue: (r.hue + between(R, -25, 25) + 360) % 360, sat: clamp(r.sat + between(R, -0.12, 0.12), 0, 0.7), fill: clamp(r.fill + between(R, -0.15, 0.15), 0, 0.7) }),
      hue: (r) => r.hue,
    },
  };

  // ── MECHANISMS: how it moves in the live view ────────────────────────────
  // A pose is { lean, bend, spin, breathe, tuck, puff, glide, flap, turn }. Each mechanism keeps
  // a little state and eases the pose on critically damped springs (no snaps).
  const POSE_KEYS = ["lean", "bend", "spin", "breathe", "tuck", "puff", "glide", "flap", "turn"];
  function randomPose(R, amp, base) {
    return { lean: (base.lean || 0) + between(R, -8, 8) * amp, bend: (base.bend || 0) + between(R, -16, 16) * amp, spin: (base.spin || 0) + between(R, -40, 40) * amp,
      breathe: 1 + between(R, -0.04, 0.04) * amp, tuck: R() * 0.8, puff: R() * 0.9, glide: R(), flap: between(R, 0.4, 1.2), turn: between(R, -0.6, 0.6) };
  }
  function spring(st, dt, om) {
    for (const k of POSE_KEYS) {
      const x = st.pose[k] - st.goal[k], v = st.vel[k] || 0, a = -om * om * x - 2 * om * v;
      st.vel[k] = v + a * dt; st.pose[k] += st.vel[k] * dt;
    }
  }
  const MECHANISMS = {
    watch: {
      id: "watch", layer: "mechanism", label: "Watch", about: "Still while looked at; moves when you look away.",
      defaults: (ctx, R) => ({ rate: between(R, 0.3, 1.2), amp: between(R, 0.3, 1) }),
      mutate: (ctx, r, R) => ({ rate: clamp(r.rate + between(R, -0.25, 0.25), 0.1, 1.6), amp: clamp(r.amp + between(R, -0.2, 0.2), 0.1, 1.2) }),
      restless: (r) => r.rate * r.amp * 0.5,
      step(st, dt, watched, r) {
        if (watched) return false;                       // frozen: nothing changes, nothing is drawn
        st.timer -= dt; if (st.timer <= 0) { st.goal = randomPose(st.R, r.amp, st.rest); st.timer = between(st.R, 1.2, 3) / r.rate; }
        spring(st, dt, 1.6 * r.rate + 0.4); return true;
      },
    },
    drift: {
      id: "drift", layer: "mechanism", label: "Drift", about: "Always easing, slowly, to a new pose.",
      defaults: (ctx, R) => ({ rate: between(R, 0.2, 1), amp: between(R, 0.2, 0.9) }),
      mutate: (ctx, r, R) => ({ rate: clamp(r.rate + between(R, -0.2, 0.2), 0.05, 1.4), amp: clamp(r.amp + between(R, -0.2, 0.2), 0.1, 1.2) }),
      restless: (r) => r.rate * r.amp,
      step(st, dt, watched, r) {
        st.timer -= dt; if (st.timer <= 0) { st.goal = randomPose(st.R, r.amp, st.rest); st.timer = between(st.R, 2, 5) / r.rate; }
        spring(st, dt, 0.9 * r.rate + 0.2); return true;
      },
    },
    breathe: {
      id: "breathe", layer: "mechanism", label: "Breathe", about: "A slow rhythm: it swells, curls and settles.",
      defaults: (ctx, R) => ({ rate: between(R, 0.15, 0.6), amp: between(R, 0.2, 1) }),
      mutate: (ctx, r, R) => ({ rate: clamp(r.rate + between(R, -0.1, 0.1), 0.05, 1), amp: clamp(r.amp + between(R, -0.2, 0.2), 0.1, 1.2) }),
      restless: (r) => r.rate * r.amp * 0.8,
      step(st, dt, watched, r) {
        st.t += dt; const s = Math.sin(st.t * TAU * r.rate), c = Math.sin(st.t * TAU * r.rate * 0.5 + 1);
        Object.assign(st.pose, st.rest, { breathe: 1 + 0.035 * r.amp * s, bend: (st.rest.bend || 0) + 10 * r.amp * s, puff: clamp(0.45 + 0.4 * s * r.amp, 0, 1), tuck: clamp(0.4 - 0.35 * c * r.amp, 0, 1), glide: 0.5 + 0.5 * c });
        return true;
      },
    },
  };

  // ── SETUP ─────────────────────────────────────────────────────────────────
  async function setup(opts) {
    const kit = await ForgeRegistry.loadKit(opts.kitUrl);
    await ForgeRegistry.prepareAll(kit);
    const species = opts.species || window.SERAPH_SPECIES || [];
    const bodies = {};
    for (const def of ForgeRegistry.list((d) => FIGURES.includes(d.type))) bodies[def.id] = forgeBody(def);
    if (species.length && window.EcologyRender) bodies["ecology.pair"] = ecologyBody;
    if (window.GlyphSystem && window.Xenoglyph) { bodies["glyph.logogram"] = glyphBody; glyphKit = GlyphSystem.prepareKit(kit.raw || kit.parts); }
    const ctx = { kit, species, defaultColHi: opts.defaultColHi, bodies, skins: SKINS, mechanisms: MECHANISMS, svgCache: new Map(), imgCache: new Map() };
    ctx.thumbView = view(ctx, document.createElement("canvas"));
    return ctx;
  }

  // ── GENOMES ───────────────────────────────────────────────────────────────
  const LAYERS = { body: "bodies", skin: "skins", mech: "mechanisms" };
  function random(ctx, R, only) {
    const g = { id: uid++, parents: [] };
    for (const [layer, set] of Object.entries(LAYERS)) {
      const ids = Object.keys(ctx[set]), piece = ctx[set][(only && only[layer]) || pickOf(R, ids)];
      g[layer] = { piece: piece.id, r: piece.defaults(ctx, R) };
    }
    return g;
  }
  function mutate(ctx, g, R) {
    const o = clone(g); o.id = uid++; o.parents = [g.id];
    const k = R(), layer = k < 0.5 ? "body" : k < 0.8 ? "skin" : "mech", set = ctx[LAYERS[layer]];
    if (R() < 0.18) {                                   // swap in another piece for this layer
      const ids = Object.keys(set).filter((id) => id !== o[layer].piece);
      if (ids.length) { const p = set[pickOf(R, ids)]; o[layer] = { piece: p.id, r: p.defaults(ctx, R) }; return o; }
    }
    const p = set[o[layer].piece];
    o[layer].r = p.mutate ? p.mutate(ctx, o[layer].r, R) : p.defaults(ctx, R);
    return o;
  }
  function cross(ctx, a, b, R) {
    const o = { id: uid++, parents: [a.id, b.id] };
    let fromA = 0;
    for (const layer of Object.keys(LAYERS)) { const takeA = R() < 0.5; fromA += takeA; o[layer] = clone((takeA ? a : b)[layer]); }
    if (fromA === 0 || fromA === 3) { const layer = pickOf(R, Object.keys(LAYERS)); o[layer] = clone((fromA ? b : a)[layer]); }
    return o;
  }
  function label(ctx, g) {
    const b = ctx.bodies[g.body.piece], s = ctx.skins[g.skin.piece], m = ctx.mechanisms[g.mech.piece];
    let body = b ? b.label : g.body.piece;
    if (g.body.piece === "ecology.pair") body = g.body.r.front + (g.body.r.back ? " + " + g.body.r.back : "");
    else if (g.body.piece === "glyph.logogram") body = "Logogram · " + g.body.r.words.join(" ");
    else if (g.body.r && (g.body.r.text || g.body.r.tpl)) body += " · " + (g.body.r.text || g.body.r.tpl);
    return { body, skin: s ? s.label : g.skin.piece, mech: m ? m.label : g.mech.piece };
  }

  // ── DRAWING ───────────────────────────────────────────────────────────────
  // A view owns the canvases one size of drawing needs: a mask, a WebGL2 creature renderer,
  // the holy light shader, and scratch space for the fill.
  const FOCAL = Math.max(60, 1000 * 0.9 * 0.8) * 0.45, K = 20;
  function view(ctx, out) {
    const v = { out, octx: out.getContext("2d"), size: 0, mask: document.createElement("canvas"), tmp: document.createElement("canvas"), fill: document.createElement("canvas"), eco: null, holy: null, holyCv: null, ecoCv: null };
    v.mctx = v.mask.getContext("2d", { willReadFrequently: true }); v.tctx = v.tmp.getContext("2d"); v.fctx = v.fill.getContext("2d", { willReadFrequently: true });
    return v;
  }
  function sizeView(v, S) {
    if (v.size === S) return;
    v.size = S;
    for (const c of [v.out, v.mask, v.tmp]) { c.width = S; c.height = S; }
    if (v.holy) HolyLight.resize(v.holy, S, S);
  }
  function ecoOf(ctx, v) {
    if (!v.eco) {
      v.ecoCv = document.createElement("canvas");
      v.eco = EcologyRender.create(v.ecoCv, { SPECIES: ctx.species, HUE: {}, WING: {}, DEFAULT_COL_HI: ctx.defaultColHi }, { maxFish: 4 });
      v.ecoSize = 0;
    }
    // thin creature lines break into dots below ~400 px: draw big, then shrink into the mask
    const Se = Math.max(v.size, 400);
    if (v.ecoSize !== Se) { EcologyRender.resize(v.eco, Se, Se); v.ecoSize = Se; }
    return v.eco;
  }
  function holyOf(v) {
    if (!v.holy) { v.holyCv = document.createElement("canvas"); try { v.holy = HolyLight.create(v.holyCv, { scale: 1 }); HolyLight.resize(v.holy, v.size, v.size); } catch (e) { v.holy = false; } }
    return v.holy || null;
  }
  function imageOf(ctx, svg) {
    let p = ctx.imgCache.get(svg);
    if (!p) {
      p = new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("svg would not load")); im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); });
      ctx.imgCache.set(svg, p);
      if (ctx.imgCache.size > 120) ctx.imgCache.delete(ctx.imgCache.keys().next().value);
    }
    return p;
  }
  function restPose(g) {
    const r = g.body.r || {};
    return { lean: r.lean || 0, bend: r.bend || 0, spin: 0, breathe: 1, tuck: r.tuck ?? 0.4, puff: r.puff ?? 0.4, glide: r.glide ?? 0.5, flap: r.flap ?? 0.8, turn: r.turn || 0 };
  }

  // body -> mask (white lines on black, S x S)
  async function drawMask(ctx, g, v, pose) {
    const S = v.size, m = v.mctx, body = ctx.bodies[g.body.piece];
    m.setTransform(1, 0, 0, 1, 0, 0); m.globalCompositeOperation = "source-over"; m.fillStyle = "#000"; m.fillRect(0, 0, S, S);
    if (!body) return;
    if (body.kind === "svg") {
      const svg = body.svg(ctx, g.body.r), im = await imageOf(ctx, svg);
      const vb = (svg.match(/viewBox="([^"]+)"/) || [])[1], [, , vw, vh] = vb ? vb.split(/\s+/).map(Number) : [0, 0, 600, 600];
      const fit = (S * 0.9) / Math.max(vw, vh) * pose.breathe;
      m.translate(S / 2, S / 2); m.rotate((pose.spin * 0.25 + pose.lean * 0.4) * Math.PI / 180);
      m.drawImage(im, -vw * fit / 2, -vh * fit / 2, vw * fit, vh * fit);
      m.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      const r = ecoOf(ctx, v), b = g.body.r, idx = (key) => Math.max(0, ctx.species.findIndex((s) => s.key === key));
      const make = (key, span, depth, lit) => {
        const sp = ctx.species[idx(key)], bd = sp.bounds, aspect = (bd[2] - bd[0]) / (bd[3] - bd[1]);
        return { sp: idx(key), len: (span / Math.max(1, aspect)) * pose.breathe, chain: new Float32Array(K * 2), cz: new Float32Array(K).fill(FOCAL + depth), croll: new Float32Array(K),
          phase: 0, seed: 1, z: lit, darkRoll: 1, cloak: 0, fade: 1, gulp: 0, tuck: 0, turnS: 0, puff: 0, alert: 0, glide: 0, flap: 1 };
      };
      const lay = (f, cx, cy, lean, bend) => {
        const seg = f.len / (K - 1), pts = [[0, 0]];
        for (let k = 1; k < K; k++) { const a = (lean + bend * (k / (K - 1) - 0.5)) * Math.PI / 180, [x, y] = pts[k - 1]; pts.push([x + Math.sin(a) * seg, y + Math.cos(a) * seg]); }
        const mx = pts[K >> 1][0], my = pts[K >> 1][1];
        for (let k = 0; k < K; k++) { f.chain[k * 2] = cx + pts[k][0] - mx; f.chain[k * 2 + 1] = cy + pts[k][1] - my; }
      };
      const front = make(b.front, b.fs, 0, 0), fish = [];
      if (b.back) { const back = make(b.back, b.bs, 70, 0.45); lay(back, 500, 482, -pose.lean * 0.7, -pose.bend * 0.6); Object.assign(back, { tuck: 0.8 - pose.tuck, turnS: -pose.turn * 0.7, puff: pose.puff * 0.6, glide: 1 - pose.glide, flap: pose.flap * 0.7 }); fish.push(back); }
      lay(front, 500, 500, pose.lean, pose.bend); Object.assign(front, { tuck: pose.tuck, turnS: pose.turn, puff: pose.puff, glide: pose.glide, flap: pose.flap }); fish.push(front);
      const tank = { fish, carcasses: [], speciesRT: ctx.species.map(() => ({ beh: null })), cfg: { size: 176, dz: 0.8, wiggle: 0.018, beh: "off" }, _bodyLen: (f) => f.len };
      EcologyRender.frame(r, { sim: tank, time: pose.t || 3, worldW: 1000, worldH: 1000, dpr: 1, camera: { tilt: 0 },
        render: { glow: 0.35, iris: 0, irisMode: 1, shimmer: 0, snow: false, carcasses: false, dark: 0, wings: 1, waterAlpha: 1 } });
      m.save(); m.translate(S / 2, S / 2); m.rotate(pose.spin * 0.15 * Math.PI / 180); m.drawImage(v.ecoCv, -S / 2, -S / 2, S, S); m.restore();   // same task: still readable
    }
    // keep only how bright each pixel is (the creatures come in their own colours) and stretch it so the
    // brightest line is white: dim or thin line work still reads, and any skin can recolour it
    const id = m.getImageData(0, 0, S, S), d = id.data;
    let top = 1;
    for (let i = 0; i < d.length; i += 4) { const L = Math.max(d[i], d[i + 1], d[i + 2]); d[i] = L; if (L > top) top = L; }
    const k = Math.min(4, 235 / top);
    for (let i = 0; i < d.length; i += 4) { const L = Math.min(255, d[i] * k); d[i] = d[i + 1] = d[i + 2] = L; d[i + 3] = 255; }
    m.putImageData(id, 0, 0);
  }

  // what the lines enclose, from the mask: close small gaps, flood the outside in from the edges
  function enclosed(v) {
    const S = v.size, step = S > 300 ? 3 : 2, w = Math.ceil(S / step), h = Math.ceil(S / step), n = w * h, R = 2;
    if (v.fill.width !== w) { v.fill.width = w; v.fill.height = h; v.fbuf = null; }
    if (!v.fbuf) v.fbuf = { a: new Uint8Array(n), b: new Uint8Array(n), q: new Int32Array(n) };
    const { a, b, q } = v.fbuf;
    v.fctx.clearRect(0, 0, w, h); v.fctx.drawImage(v.mask, 0, 0, w, h);
    const px = v.fctx.getImageData(0, 0, w, h).data;
    for (let i = 0; i < n; i++) a[i] = px[i * 4] > 40 ? 1 : 0;
    const grow = (src, dst) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = 0; for (let k = -R; k <= R && !m; k++) { const xx = x + k; if (xx >= 0 && xx < w && src[y * w + xx]) m = 1; } dst[y * w + x] = m; }
      for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) { let m = 0; for (let k = -R; k <= R && !m; k++) { const yy = y + k; if (yy >= 0 && yy < h && dst[yy * w + x]) m = 1; } src[y * w + x] = m; }
    };
    grow(a, b);
    b.fill(0); let qh = 0, qt = 0;
    const seed = (i) => { if (!a[i] && !b[i]) { b[i] = 1; q[qt++] = i; } };
    for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
    while (qh < qt) { const i = q[qh++], x = i % w; if (x > 0) seed(i - 1); if (x < w - 1) seed(i + 1); if (i >= w) seed(i - w); if (i < n - w) seed(i + w); }
    grow(b, a);
    let inside = 0; const img = v.fctx.createImageData(w, h);
    for (let i = 0; i < n; i++) { const on = !b[i]; inside += on; img.data[i * 4 + 3] = on ? 255 : 0; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255; }
    v.fctx.putImageData(img, 0, 0);
    return inside / n;
  }

  // mask -> the skin's colours on the out canvas
  function paint(ctx, g, v, mass) {
    const S = v.size, o = v.octx, t = v.tctx, skin = ctx.skins[g.skin.piece], r = g.skin.r;
    const toCss = (c) => `rgb(${c.map((x) => Math.round(clamp(x, 0, 1) * 255)).join(",")})`;
    // the mask in one colour: white lines * colour, on black
    const tint = (rgb) => { t.globalCompositeOperation = "source-over"; t.filter = "none"; t.drawImage(v.mask, 0, 0); t.globalCompositeOperation = "multiply"; t.fillStyle = toCss(rgb); t.fillRect(0, 0, S, S); t.globalCompositeOperation = "source-over"; return v.tmp; };
    const fillLayer = (rgb, alpha) => { if (alpha <= 0.01 || mass <= 0.002) return; o.save(); o.globalAlpha = alpha; o.imageSmoothingEnabled = true; o.filter = `blur(${(S / 220).toFixed(1)}px)`;
      // colour the fill mask: draw it, then colour it in with source-in
      t.globalCompositeOperation = "source-over"; t.clearRect(0, 0, S, S); t.drawImage(v.fill, 0, 0, S, S); t.globalCompositeOperation = "source-in"; t.fillStyle = toCss(rgb); t.fillRect(0, 0, S, S); t.globalCompositeOperation = "source-over";
      o.drawImage(v.tmp, 0, 0); o.restore(); };
    o.setTransform(1, 0, 0, 1, 0, 0); o.globalCompositeOperation = "source-over"; o.globalAlpha = 1; o.filter = "none";
    if (skin.id === "glow") {
      const c = hsl(r.hue, r.sat, 0.62);
      o.fillStyle = "#07080a"; o.fillRect(0, 0, S, S);
      fillLayer(c.map((x) => x * 0.22), Math.min(1, r.fill * 1.6));
      o.globalCompositeOperation = "lighter";
      tint(c);
      if (r.glow > 0.02) { o.save(); o.filter = `blur(${(S / 90).toFixed(1)}px)`; o.globalAlpha = Math.min(1, r.glow); o.drawImage(v.tmp, 0, 0); o.restore(); }
      o.drawImage(v.tmp, 0, 0);
    } else if (skin.id === "blueprint") {
      const c = hsl(r.hue, 0.7, 0.7), ground = hsl(r.hue, 0.55, 0.13);
      o.fillStyle = toCss(ground); o.fillRect(0, 0, S, S);
      o.strokeStyle = toCss(hsl(r.hue, 0.5, 0.24)); o.lineWidth = Math.max(0.5, S / 600); o.beginPath();
      for (let k = 1; k < r.grid; k++) { const p = Math.round((k * S) / r.grid) + 0.5; o.moveTo(p, 0); o.lineTo(p, S); o.moveTo(0, p); o.lineTo(S, p); }
      o.stroke();
      fillLayer(hsl(r.hue, 0.6, 0.3), Math.min(1, r.fill * 1.8));
      o.globalCompositeOperation = "lighter"; o.drawImage(tint(c), 0, 0);
    } else {
      // paper skins: ink = paper * (1 - mask * (1 - inkColour)), built as multiply over the paper
      const paper = [0.95, 0.937, 0.91];
      const inkCol = skin.id === "gilt" ? hsl(r.hue, 0.62, 0.36) : hsl(r.hue, r.sat, 0.16);
      o.fillStyle = toCss(paper); o.fillRect(0, 0, S, S);
      if (skin.id === "gilt") {
        const h = holyOf(v);
        if (h) {
          // the shader lays its light down as gold leaf; it reads the mask the way it reads the angel
          HolyLight.draw(h, v.mask, { time: 0, light: [0.5, 0.36], ring: r.ring ?? 0.2, ink: true, power: r.power, burst: r.burst ?? 0.8, inkColor: hsl(r.hue, 0.6, 0.55) });
          o.globalCompositeOperation = "multiply"; o.drawImage(v.holyCv, 0, 0, S, S); o.globalCompositeOperation = "source-over";
        }
      }
      fillLayer(hsl(r.hue, 0.45, 0.78), Math.min(1, r.fill * 1.5));
      // multiply layer: white minus mask * (1 - ink)
      tint(inkCol.map((x) => 1 - x));
      t.globalCompositeOperation = "difference"; t.fillStyle = "#fff"; t.fillRect(0, 0, S, S); t.globalCompositeOperation = "source-over";
      o.globalCompositeOperation = "multiply"; o.drawImage(v.tmp, 0, 0);
    }
    o.globalCompositeOperation = "source-over"; o.globalAlpha = 1; o.filter = "none";
  }

  async function draw(ctx, g, v, pose, size) {
    sizeView(v, size || v.size || 256);
    await drawMask(ctx, g, v, pose || restPose(g));
    const mass = enclosed(v);
    paint(ctx, g, v, mass);
    return mass;
  }

  // ── TRAITS & QUALITY ──────────────────────────────────────────────────────
  const AXES = {
    gothic:     { label: "Sci-fi → gothic", min: 0.1, max: 0.9 },
    ink:        { label: "Sparse → dense", min: 0, max: 0.14 },
    mass:       { label: "Line → mass", min: 0, max: 0.6 },
    symmetry:   { label: "Wild → symmetric", min: 0.4, max: 1 },
    complexity: { label: "Plain → intricate", min: 0.04, max: 0.4 },
    restless:   { label: "Calm → restless", min: 0, max: 1 },
  };
  function measure(ctx, g, v, mass) {
    const S = v.size, d = v.mctx.getImageData(0, 0, S, S).data;
    let lit = 0, sum = 0, edges = 0, sym = 0, symN = 0, x0 = S, x1 = -1, y0 = S, y1 = -1, border = 0;
    const L = (x, y) => d[(y * S + x) * 4] / 255;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const a = L(x, y); sum += a;
      if (a > 0.25) { lit++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (x < 2 || y < 2 || x > S - 3 || y > S - 3) border++; }
      if (x + 1 < S && (a > 0.25) !== (L(x + 1, y) > 0.25)) edges++;
      if (y + 1 < S && (a > 0.25) !== (L(x, y + 1) > 0.25)) edges++;
      if (x < S / 2) { const b = L(S - 1 - x, y); if (a > 0.1 || b > 0.1) { sym += 1 - Math.abs(a - b); symN++; } }
    }
    const ink = sum / (S * S), skin = ctx.skins[g.skin.piece];
    const hueWarm = warmthOfHue(skin.hue(g.skin.r)), paper = skin.ground === "paper" ? 1 : 0, organic = ORGANIC[g.body.piece] ?? 0.5;
    const traits = {
      gothic: 0.45 * hueWarm + 0.25 * paper + 0.3 * organic,
      ink, mass,
      symmetry: symN ? sym / symN : 1,
      complexity: lit ? Math.min(1, edges / Math.max(1, (x1 - x0 + 1) * (y1 - y0 + 1))) : 0,
      restless: Math.min(1, ctx.mechanisms[g.mech.piece].restless(g.mech.r)),
    };
    // coherence: the figure sits in the frame, is not clipped, and is neither empty nor a blot
    let q = 1;
    if (lit < S * S * 0.004) q = 0.05;
    else {
      const occ = ((x1 - x0 + 1) * (y1 - y0 + 1)) / (S * S);
      if (occ < 0.2) q -= (0.2 - occ) * 2.5;
      if (occ > 0.92) q -= 0.15;
      q -= Math.min(0.4, (border / lit) * 6);
      if (ink > 0.32) q -= (ink - 0.32) * 3;
      const cx = (x0 + x1) / 2 / S - 0.5, cy = (y0 + y1) / 2 / S - 0.5;
      q -= Math.min(0.2, Math.hypot(cx, cy) * 0.8);
    }
    return { traits, quality: clamp(q, 0, 1) };
  }

  async function evaluate(ctx, g, size) {
    const v = ctx.thumbView;
    const mass = await draw(ctx, g, v, restPose(g), size || 128);
    const { traits, quality } = measure(ctx, g, v, mass);
    const thumb = document.createElement("canvas"); thumb.width = thumb.height = v.size;
    thumb.getContext("2d").drawImage(v.out, 0, 0);
    return { genome: g, traits, quality, thumb };
  }

  // how alike two evaluated chimeras are: shared pieces, then nearby traits
  function similarity(a, b) {
    let same = 0;
    for (const l of Object.keys(LAYERS)) same += a.genome[l].piece === b.genome[l].piece ? 1 : 0;
    let near = 0, n = 0;
    for (const [k, ax] of Object.entries(AXES)) { near += 1 - Math.min(1, Math.abs(a.traits[k] - b.traits[k]) / (ax.max - ax.min)); n++; }
    return 0.45 * (same / 3) + 0.55 * (near / n);
  }

  // a live mechanism: state to step every frame
  function live(g, seed) {
    const R = window.ForgeKit ? window.ForgeKit.rng(seed || 1) : Math.random;
    const rest = restPose(g);
    return { R, rest, pose: { ...rest }, goal: { ...rest }, vel: {}, timer: 0.3, t: 0 };
  }

  window.Chimera = { setup, random, mutate, cross, evaluate, draw, view, restPose, live, label, similarity, AXES, SKINS, MECHANISMS, measure };
})();
