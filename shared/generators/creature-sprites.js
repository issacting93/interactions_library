/*
 * Forge — creature sprites. Draws a rigged creature (creature-rig.js) along a live spine,
 * such as an EcologySim fish's chain, on a 2D canvas, so the creatures swimming in Ecology
 * are made of their own kit parts instead of plain strokes.
 *
 *   const cs = CreatureSprites.create({ parts, store });     // kit parts + attach store
 *   const prep = cs.prepare(speciesId, rigRecord?)            // null if the species can't rig
 *   cs.draw(ctx, prep, { chain, K, bodyLen, time, swim, color, alpha, view })
 *       chain   Float32Array [x0,y0, x1,y1, ...] head first (EcologySim's fish.chain)
 *       bodyLen length of the chain in the same units
 *       view    [a,b,c,d,e,f] canvas transform from chain units to pixels (e.g. [s,0,0,s,0,0])
 *       color   CSS colour the sprites are tinted with (null keeps the parts' own colour)
 *   Each spine bone sits at the point of the chain matching its height on the sheet and turns
 *   with the chain's tangent there; fixed bones ride their parent; wings and pendulums take
 *   their beat/swing from CreatureRig.pose (so the rig's swim settings still show).
 *
 * Sprites are rasterised once per (part, colour) from the part SVG, with strokes thickened so
 * they stay legible at creature scale, and load asynchronously: until a sprite is ready,
 * draw() returns false and the caller can draw its own fallback.
 * Depends on CreatureRig (and AttachPoints through it). Classic script.
 */
(function () {
  "use strict";
  const AXIS = 200, RES = 0.4, PAD = 6;
  const MIRROR = [-1, 0, 0, 1, 2 * AXIS, 0];

  function create(opts) {
    const parts = opts.parts, store = opts.store, thick = opts.thick || 4;
    const sprites = new Map();           // key -> { ready, canvas }
    const preps = new Map();
    const R = window.CreatureRig, mul = R.mat.mul, rotAbout = R.mat.rotAbout;

    // some sheet parts carry the sheet's own frame: a 4-corner box as big as the part. It reads
    // as a card around the creature once it swims, so it is left out of the sprite.
    function stripFrames(part) {
      return part.svg.replace(/<path\b[^>]*\bd="([^"]*)"[^>]*\/?>(?:<\/path>)?/g, (el, d) => {
        const nums = (d.match(/-?[\d.]+/g) || []).map(Number);
        const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1);
        const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
        if (w >= 380 && h >= 380) return "";                       // the whole-sheet card
        if (/[CQSAcqsa]/.test(d) || nums.length < 8 || nums.length > 10) return el;
        return w > part.w * 0.8 && h > part.h * 0.8 ? "" : el;    // a 4-corner box around the part
      });
    }

    function sprite(part, color) {
      const key = part.id + "|" + (color || "");
      let s = sprites.get(key);
      if (s) return s;
      s = { ready: false, canvas: null };
      sprites.set(key, s);
      const w = part.w + 2 * PAD, h = part.h + 2 * PAD;
      const body = stripFrames(part).replace(/stroke-width="([\d.]+)"/g, (_, v) => `stroke-width="${(+v * thick).toFixed(2)}"`);
      // a mask's frame stroke is near-invisible at sheet scale but turns into a hard box once
      // tinted, so masks keep their fill (the fade) and lose the outline
      const defs = (part.defs || "").replace(/(<mask[\s\S]*?<\/mask>)/g, (m) => m.replace(/stroke="[^"]*"/g, 'stroke="none"'));
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-w / 2} ${-h / 2} ${w} ${h}" width="${Math.ceil(w * RES)}" height="${Math.ceil(h * RES)}">${defs ? `<defs>${defs}</defs>` : ""}${body}</svg>`;
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement("canvas"); cv.width = Math.max(1, Math.ceil(w * RES)); cv.height = Math.max(1, Math.ceil(h * RES));
        const g = cv.getContext("2d");
        if (color) {
          // tint by luminance, so the dark occluding fills some parts carry stay dark
          g.filter = "grayscale(1) brightness(1.45)"; g.drawImage(img, 0, 0, cv.width, cv.height); g.filter = "none";
          g.globalCompositeOperation = "multiply"; g.fillStyle = color; g.fillRect(0, 0, cv.width, cv.height);
          g.globalCompositeOperation = "destination-in"; g.drawImage(img, 0, 0, cv.width, cv.height);
          g.globalCompositeOperation = "source-over";
        } else g.drawImage(img, 0, 0, cv.width, cv.height);
        s.canvas = cv; s.ready = true;
      };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      return s;
    }

    function prepare(speciesId, rigRecord) {
      const key = speciesId + "|" + (rigRecord ? rigRecord.id + "@" + rigRecord.version : "");
      if (preps.has(key)) return preps.get(key);
      let prep = null;
      try {
        const rig = R.build(speciesId, parts, store);
        if (rig.chain.length) {
          let y0 = Infinity, y1 = -Infinity;
          for (const id of rig.chain) { const p = rig.bones[id].part; y0 = Math.min(y0, p.oy - p.h / 2); y1 = Math.max(y1, p.oy + p.h / 2); }
          let f0 = Infinity, f1 = -Infinity;
          for (const b of rig.bones) { f0 = Math.min(f0, b.part.oy - b.part.h / 2); f1 = Math.max(f1, b.part.oy + b.part.h / 2); }
          const layer = { wing: 0, spine: 1, fixed: 1, pendulum: 2 };
          const order = rig.order.slice().sort((a, b) => layer[rig.bones[a].kind] - layer[rig.bones[b].kind]);
          prep = { rig, y0, y1, len: Math.max(1, y1 - y0), full: Math.max(1, f1 - f0), order, swim: rigRecord && rigRecord.recipe ? rigRecord.recipe.swim : null };
        }
      } catch (e) { prep = null; }
      preps.set(key, prep);
      return prep;
    }

    function frameAt(chain, K, u) {
      const i = Math.max(0, Math.min(K - 2, Math.floor(u))), f = Math.max(0, Math.min(1, u - i));
      const x = chain[i * 2] + (chain[i * 2 + 2] - chain[i * 2]) * f, y = chain[i * 2 + 1] + (chain[i * 2 + 3] - chain[i * 2 + 1]) * f;
      const dx = chain[i * 2] - chain[i * 2 + 2], dy = chain[i * 2 + 1] - chain[i * 2 + 3];
      return [x, y, Math.atan2(dy, dx)];
    }

    // draws one creature; returns false if any sprite wasn't ready yet
    function draw(ctx, prep, o) {
      // size: the spine fills the body, unless the whole drawing (wings, plumes) would get
      // much longer than the body; spine bones then sit along the chain by real distance
      const rig = prep.rig, K = o.K, V = o.view || [1, 0, 0, 1, 0, 0];
      const s = Math.min(o.bodyLen / prep.len, (o.bodyLen * 1.3) / prep.full), seg = o.bodyLen / (K - 1);
      const P = R.pose(rig, o.time || 0, "swim", o.swim || prep.swim);
      const M = new Array(rig.bones.length), MM = new Array(rig.bones.length).fill(null);
      for (const id of rig.order) {
        const b = rig.bones[id];
        if (b.kind === "spine") {
          const u = ((b.pivot[1] - prep.y0) * s) / seg, [px, py, phi] = frameAt(o.chain, K, Math.max(0, Math.min(K - 1, u)));
          const th = phi + Math.PI / 2, a = Math.cos(th) * s, bb = Math.sin(th) * s;
          M[id] = [a, bb, -bb, a, px - (a * b.pivot[0] - bb * b.pivot[1]), py - (bb * b.pivot[0] + a * b.pivot[1])];
        } else {
          const PM = b.parent >= 0 && M[b.parent] ? M[b.parent] : null;
          if (!PM) continue;
          if (b.kind === "fixed") M[id] = PM;
          else {
            const L = rotAbout(b.pivot[0], b.pivot[1], P.angles[id]);
            M[id] = mul(PM, L);
            if (b.mirror) MM[id] = mul(mul(PM, MIRROR), L);
          }
        }
      }
      let ok = true;
      ctx.save();
      ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
      for (const id of prep.order) {
        const b = rig.bones[id], m = M[id];
        if (!m) continue;
        const sp = sprite(b.part, o.color);
        if (!sp.ready) { ok = false; continue; }
        const w = b.part.w + 2 * PAD, h = b.part.h + 2 * PAD;
        for (const mm of b.mirror ? [m, MM[id]] : [m]) {
          if (!mm) continue;
          const T = mul(V, mm);
          ctx.setTransform(T[0], T[1], T[2], T[3], T[4], T[5]);
          ctx.drawImage(sp.canvas, b.part.ox - w / 2, b.part.oy - h / 2, w, h);
        }
      }
      ctx.restore();
      return ok;
    }

    return { prepare, draw, sprite };
  }

  window.CreatureSprites = { create };
})();
