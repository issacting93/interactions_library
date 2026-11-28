/* INTERACTIONS: SpireLook. What a tower adds to the creature look's surface shader: stone, and far walls.

   The towers wear the creatures' shader (SOLID_FRAG in shared/engine/motion/solid-look.js). That shader has two empty hooks; this
   module is the GLSL a tower puts in them:

     const frag = SpireLook.frag(SOLID_FRAG)

   Stone (uStone 1 = ornament, 2 = the body, with masonry courses; uStoneK = how strong)
     A bump from a height made of four octaves of noise and a cell noise for pits, read at the fragment's place in the world, so an
     ornament and the wall under it share one stone. The bump is the surface gradient of that height (Mikkelsen 2010), which needs no
     texture coordinates. The body also gets courses of blocks, staggered row to row, with a groove at every joint.

   Far walls (uReliefOn, uRelief, uReliefDim = top in metres, highest relief in metres, 1/w, 1/h)
     The wall reliefs baked by SpireSolid.sink({ far }) into a height map round the axis (height, and the wall's distance from the axis), drawn on the body with no triangles:
     (below)
   Windows (uWindows; vWall = metres up the wall and the wall's height, 0 where there is no wall)
     Slots with a round head in any body wall over 5 m tall, a framed opening with a reveal and a lit room behind, all in the shader:
     the view ray is carried a wall's thickness in and asked whether it is still inside the opening (interior mapping, van Dongen 2008,
     cut down to one plane). Some are blind, some unlit.
   Far walls, how: the view ray is walked from the shell the highest relief reaches down to the wall, a linear search then a binary one
     (relief mapping: Policarpo, Oliveira and Comba 2005), and the normal is the map's gradient there. A relief does not break the
     body's silhouette; it is the look for a tower seen from across the city.

   vRest must be the fragment's position in the tower's own space, in metres (the tower page's vertex shader writes it so).
   Classic script -> window.SpireLook. */
(function () {
  'use strict';
  const DECL = `
uniform float uStone; uniform float uStoneK; uniform float uWindows; varying vec2 vWall; uniform sampler2D uRelief; uniform float uReliefOn; uniform vec4 uReliefDim;
float sFbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
float sCell(vec3 p) { vec3 i = floor(p), f = fract(p); float m = 1.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) { vec3 g = vec3(float(x), float(y), float(z)), c = i + g; vec3 d = g + vec3(h3(c), h3(c + 11.3), h3(c + 23.7)) - f; m = min(m, dot(d, d)); }
  return sqrt(m); }
vec3 sBump(vec3 n, float h, float amp) { vec3 dpx = dFdx(vView), dpy = dFdy(vView); float dhx = dFdx(h), dhy = dFdy(h); vec3 r1 = cross(dpy, n), r2 = cross(n, dpx); float det = dot(dpx, r1);
  return normalize(abs(det) * n - amp * sign(det) * (dhx * r1 + dhy * r2)); }
// the far map: a relief's height, if it stands on a wall at this distance from the axis (the map is one sheet round the axis; a ledge and the shaft behind it share its cells)
// a window: a slot with a round head, 0.64 m wide and 1.47 m tall; negative inside
float sWin(vec2 p) { return p.y > 0.35 ? length(vec2(p.x, p.y - 0.35)) - 0.32 : max(abs(p.x) - 0.32, -(p.y + 0.8)); }
float sH(vec2 uv, float r) { vec2 q = texture2D(uRelief, uv).rg; return q.r * step(abs(q.g - r), 0.5); }
`;
  const SURFACE = `
  { vec3 sp = vRest; float sR = length(sp.xz), sA = atan(sp.x, sp.z), sRel = 0.0;
    vec3 nW = normalize((vec4(n, 0.0) * viewMatrix).xyz); float wall = 1.0 - smoothstep(0.45, 0.75, abs(nW.y));   // 1 on a wall, 0 on a floor or a cap
    if (uReliefOn > 0.5 && sR > 0.05 && wall > 0.01) {
      vec3 Nw = vec3(sin(sA), 0.0, cos(sA)), Tw = vec3(cos(sA), 0.0, -sin(sA)), E = normalize(cameraPosition - sp);
      float top = uReliefDim.x, hm = uReliefDim.y, en = dot(E, Nw);
      if (en > 0.02 && hm > 0.0) {
        float Lr = hm / max(en, 0.3), hTop = en * Lr; vec2 uv0 = vec2(sA / 6.2831853, sp.y / top), duv = vec2(dot(E, Tw) * Lr / (6.2831853 * sR), E.y * Lr / top);
        float t = 1.0, tPrev = 1.0, hit = 0.0;
        for (int i = 0; i < 16; i++) { float tt = 1.0 - float(i) / 16.0; if (sH(uv0 + duv * tt, sR) >= hTop * tt) { t = tt; hit = 1.0; break; } tPrev = tt; }
        if (hit > 0.5) { float a = t, b = tPrev; for (int i = 0; i < 5; i++) { float m = 0.5 * (a + b); if (sH(uv0 + duv * m, sR) >= hTop * m) a = m; else b = m; } t = a; } else t = 0.0;
        vec2 uv = uv0 + duv * t, ex = vec2(1.5 * uReliefDim.z, 0.0), ey = vec2(0.0, 1.5 * uReliefDim.w);
        float hh = sH(uv, sR), hxp = sH(uv + ex, sR), hxm = sH(uv - ex, sR), hyp = sH(uv + ey, sR), hym = sH(uv - ey, sR);
        float gx = (hxp - hxm) / (2.0 * ex.x * 6.2831853 * sR), gy = (hyp - hym) / (2.0 * ey.y * top);
        float cov = step(1e-4, hh + abs(gx) + abs(gy)) * wall;
        vec3 nr = normalize((viewMatrix * vec4(normalize(Nw - Tw * gx - vec3(0.0, 1.0, 0.0) * gy), 0.0)).xyz);
        n = normalize(mix(n, nr, cov)); sRel = wall * smoothstep(0.0, 0.03, hh);
        // a crease where the slope is steep, and the wall darker at a relief's foot
        xAO *= mix(1.0, 1.0 - 0.4 * smoothstep(0.8, 4.0, length(vec2(gx, gy))), cov) * (1.0 - 0.4 * wall * smoothstep(0.0, 0.2 * hm, max(max(hxp, hxm), max(hyp, hym)) - hh));
        sp += (Tw * dot(E, Tw) + vec3(0.0, E.y, 0.0)) * Lr * t;
      }
    }
    // windows in a tall wall of the body: rows up it, a ring of them round it. Behind the opening the view ray is carried a wall's
    // thickness in: if it is still inside the opening there, it sees the lit room; if not, the stone of the reveal (interior mapping, cut down)
    float wFrame = 0.0, wIn = 0.0;
    if (uWindows > 0.5 && vWall.y > 5.0 && sR > 1.0 && wall > 0.5) {
      vec3 Tw2 = vec3(cos(sA), 0.0, -sin(sA)), E2 = normalize(cameraPosition - sp); float en2 = max(dot(E2, vec3(sin(sA), 0.0, cos(sA))), 0.3);
      float nrow = max(1.0, floor(vWall.y / 4.6)), chh = vWall.y / nrow, rowI = floor(vWall.x / chh), nwin = clamp(floor(6.2831853 * sR / 3.4), 3.0, 14.0);
      float cxn = sA / 6.2831853 * nwin + 0.5 * mod(rowI, 2.0), colI = floor(cxn + 0.5); vec2 wp = vec2((cxn - colI) * 6.2831853 * sR / nwin, vWall.x - (rowI + 0.5) * chh);
      float d = sWin(wp), id = h3(vec3(colI, rowI, floor(sR * 3.0) + 5.0));
      if (id > 0.22) {   // some bays of the wall are left blind
        wFrame = smoothstep(0.11, 0.05, d) * step(0.0, d);
        if (d < 0.0) { wIn = 1.0; vec2 wq = wp - vec2(dot(E2, Tw2), E2.y) * (0.34 / en2); float d2 = sWin(wq), lit = step(0.45, h3(vec3(colI, rowI, 9.0)));
          if (d2 < 0.0) { float bar = max(1.0 - smoothstep(0.02, 0.035, abs(wq.x)), 1.0 - smoothstep(0.02, 0.035, abs(wq.y - 0.1))); xTint *= 0.1; xGlow += uEmit * mix(0.06, 0.95, lit) * (1.0 - 0.8 * bar) * (0.75 + 0.25 * vn(vec3(wq * 6.0, id * 40.0))); }
          else { xTint *= 0.42; xGlow += uEmit * 0.1 * lit; } }
      }
    }
    if (uStone > 0.5) {
      float h = sFbm(sp * 2.2) * 0.6 + sFbm(sp * 9.0) * 0.25; h -= 0.35 * (1.0 - smoothstep(0.0, 0.35, sCell(sp * 5.0))); float tone = 0.0;
      if (uStone > 1.5 && sR > 0.05) {   // the body: courses of blocks, staggered; not across a relief
        float ch = 0.55, cy = sp.y / ch, row = floor(cy), nb = max(6.0, floor(6.2831853 * sR / 0.95)), bx = sA / 6.2831853 * nb + 0.5 * mod(row, 2.0);
        float jy = min(fract(cy), 1.0 - fract(cy)) * ch, jx = min(fract(bx), 1.0 - fract(bx)) * (6.2831853 * sR / nb), groove = (1.0 - smoothstep(0.012, 0.04, min(jx, jy))) * wall * (1.0 - sRel) * (1.0 - wFrame) * (1.0 - wIn);
        h -= groove * 0.9; tone = (h3(vec3(floor(bx), row, nb)) - 0.5) * wall * (1.0 - sRel); xAO *= 1.0 - 0.45 * groove;
      }
      h += 0.7 * wFrame; n = sBump(n, h * (1.0 - wIn), 0.05 * uStoneK);
      xTint *= (0.86 + 0.28 * sFbm(sp * 0.7)) * (1.0 + 0.18 * tone) * (0.8 + 0.3 * smoothstep(-0.2, 0.6, h)) * (1.0 + 0.12 * sRel);
    }
  }
`;
  const frag = (src) => { if (src.indexOf('/*HOOK_DECL*/') < 0 || src.indexOf('/*HOOK_SURFACE*/') < 0) throw new Error('SpireLook: the surface shader has no hooks'); return src.replace('/*HOOK_DECL*/', DECL).replace('/*HOOK_SURFACE*/', SURFACE); };
  window.SpireLook = { DECL, SURFACE, frag };
})();
