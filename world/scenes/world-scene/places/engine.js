// world/scenes/world-scene/places/engine.js -- window.ENVX: World Scene's places (places/places.js), run and edited.
//
// A place (places/places.js) is data: its setting (style, city, water, surface, light), its paths, its cast (who, how many, in what role and layer),
// its shots and its look. This file runs one: it builds the paths, populates the tank with the cast and steers each row by its role through the
// sim's own f.steer, draws the water and its light in World Scene's own pipeline, takes the shots, and draws the creatures (as Specimen does, in the
// place's own style, or as World Scene's line drawing). The Places tab (a rail tab, built here) picks a place and edits it; an edited place is kept in
// this browser (localStorage 'forge:world-places'), and Copy gives its JSON to paste into places/places.js.
//
// World Scene calls it at these seams: ENVX.tick(dt) after the sim steps; ENVX.camera(dt) in updateCamera; ENVX.under(t) after the frame is cleared
// (the floor); ENVX.over(t) before the frame is shown (surface, shafts, vignette,
// the dip between shots); ENVX.hides(layer); ENVX.bg(), colour(), paint(sp), fill(), solid().
// Z runs down: z = 0 is the top of the tank, tankDepth() the floor. Tilt 0 looks straight down; over 90 looks up.
// Links: ?place=<id> (or ?env=), ?shots=0, ?bodies=specimen|styled|flat.
(function () {
  'use strict';
  const TAU = Math.PI * 2,
    DEG = Math.PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)),
    lerp = (a, b, k) => a + (b - a) * k,
    ease = (v) => v * v * (3 - 2 * v);
  const hex = (h) => {
    const n = parseInt(String(h || '#000000').slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  let seedR = 1;
  const rnd = (a = 0, b = 1) => {
    seedR = (seedR * 16807) % 2147483647;
    return a + (b - a) * (seedR / 2147483647);
  };

  const progs = () => window.ENVX_GL.progs(); // the floor, surface and light shaders: places/gl.js

  // ------------------------------------------------------------------ the vocabulary the editor offers
  const ROLESLIB = window.EcologyRoles,
    LAYERS = ROLESLIB.LAYERS; // the roles, paths and depth bands: packages/ecology/ecology-roles.js (shared with Forge Scenes)
  const LAYER_NAMES = { high: 'High air', air: 'Air', surface: 'Surface', mid: 'Mid-water', deep: 'Deep', bed: 'Bed' };
  const ROLE_NAMES = {
    stream: 'Stream',
    formation: 'Formation',
    escort: 'Escort',
    drift: 'Drift',
    school: 'School',
    bed: 'Crawl the bed',
    wild: 'Wild (the ecosystem)',
  }; // stream and formation follow a path; escort keeps behind another species; drift turns round the middle; school: Forge Scenes' koi
  const SHOT_NAMES = {
    above: 'Above',
    ride: 'Ride behind',
    follow: 'Follow',
    beneath: 'From beneath',
    descent: 'Descent',
    orbit: 'Orbit',
    lookup: 'Look up',
    low: 'Low across',
  };
  const zOf = ROLESLIB.zOf;
  const layerOf = (r) => {
    if (r.layer) return r.layer;
    if (r.z) for (const k in LAYERS) if (LAYERS[k][0] === r.z[0] && LAYERS[k][1] === r.z[1]) return k;
    return 'custom';
  };

  // ------------------------------------------------------------------ helpers
  const keyOf = (f) => SPECIES[f.sp].key,
    bl = (f) => EcologySim.bodyLen(sim, f);
  const live = (keys) => sim.fish.filter((f) => !f.dead && keys.includes(keyOf(f)));
  const specName = (k) => {
    const s = SPECIES.find((x) => x.key === k);
    return s ? s.name : k;
  };
  // the place's ground: where the city stands (src/towers.js builds it at 0.92 of the tank's depth), else the tank's floor. The floor, the plants
  // and the bed all sit on it, so nothing swims or grows under the city
  const groundZ = () => tankDepth() * (X.P && X.P.setting && X.P.setting.city ? 0.92 : 1);
  function holdZ(f, z, k) {
    z = Math.min(z, groundZ() / tankDepth() - 0.015);
    f.z += (z - f.z) * k;
    f.zGoal = z;
    const TD = tankDepth();
    if (f.cz) for (let i = 0; i < f.cz.length; i++) f.cz[i] += (z * TD - f.cz[i]) * k;
  }

  // ------------------------------------------------------------------ the place at run time
  const X = {
    id: 'world',
    P: null,
    R: null,
    places: {},
    shotsOn: true,
    manualOn: false,
    shotT: 0,
    shot: null,
    fade: 0,
    bodies: 'specimen',
  };
  function centerOf(P) {
    const TW = tankW(),
      TH = tankH(),
      c = P.setting && P.setting.center;
    if (c === 'tower') {
      const T = (typeof placedTowers !== 'undefined' && placedTowers[0]) || null;
      if (T) return [T.x != null ? T.x : T.pos[0], T.y != null ? T.y : T.pos[1]];
      return [TW / 2, TH / 2];
    }
    return c ? [c[0] * TW, c[1] * TH] : [TW / 2, TH / 2];
  }
  const buildPaths = (P, C) => ROLESLIB.paths(P.paths, C, tankW(), tankH());

  // the cast's roles run in EcologyRoles, with this page's sim, tank and depth
  const roleCtx = () => ({ sim, rnd, keyOf, bl, tankW, tankDepth, center: X.R.c, paths: X.R.paths, setZ: holdZ });
  const rowLists = (P) => ROLESLIB.rows(roleCtx(), P.cast);
  function runCast(dt) {
    const P = X.P,
      R = X.R;
    if (!P || !P.cast) return;
    ROLESLIB.run(roleCtx(), P.cast, dt, R.st);
  }
  const castPop = (P) => {
    const o = {};
    for (const r of P.cast || []) o[r.species] = (o[r.species] || 0) + (r.n | 0);
    return o;
  };

  // shadows on the floor: what is over the surface casts a broad one; what swims under it a soft small one
  function shadows() {
    const P = X.P,
      out = [];
    if (!P || !P.cast) return out;
    const TD = groundZ(),
      lev = (P.setting.surface || {}).level || 0,
      sun = [0.45, 0.3],
      lists = rowLists(P);
    const add = (f, wing, k) => {
      const h = TD - f.z * tankDepth(),
        b = bl(f);
      out.push([
        f.x + sun[0] * h * 0.35,
        f.y + sun[1] * h * 0.35,
        b * (1 + (h / TD) * 0.25),
        f.ang,
        wing,
        clamp(0.35 + (h / TD) * 0.6, 0.3, 0.95),
        k * (1 - (h / TD) * 0.45),
      ]);
    };
    P.cast.forEach((r, i) => {
      if (zOf(r)[1] < lev) for (const f of lists[i]) if (out.length < 64) add(f, 2.1, 0.55);
    });
    if (lev > 0.1)
      P.cast.forEach((r, i) => {
        if (zOf(r)[0] >= lev && zOf(r)[0] < 0.9) for (const f of lists[i]) if (out.length < 64) add(f, 0.9, 0.3);
      });
    return out;
  }

  // ------------------------------------------------------------------ shots
  const distFor = (span) => span / (2 * Math.tan(20 * DEG));
  function targetOf(sh) {
    const R = X.R,
      P = X.P,
      tg = sh.target || 'center';
    if (tg === 'center') return [R.c[0], R.c[1], null];
    if (tg === 'densest') {
      const r = (P.cast || []).find((q) => q.role === 'stream');
      const L = r && R.paths[r.path];
      if (!L) {
        const pts = rowLists(P)
            .flat()
            .map((f) => [f.x, f.y]),
          b = pts.length ? bl(rowLists(P).flat()[0]) : 40,
          m = Shots.densest(pts, b * 8); // no stream: where the cast is thickest
        if (!m) return [R.c[0], R.c[1], null];
        if (!R.wd) R.wd = m;
        R.wd[0] += (m[0] - R.wd[0]) * 0.05;
        R.wd[1] += (m[1] - R.wd[1]) * 0.05;
        return [R.wd[0], R.wd[1], null];
      }
      const H = new Float32Array(48),
        lists = rowLists(P);
      P.cast.forEach((q, i) => {
        if (q.role === 'stream' && q.path === r.path)
          for (const f of lists[i]) if (f.role && f.role.ps != null) H[((f.role.ps * 48) | 0) % 48]++;
      });
      let bi = 0,
        bv = -1;
      for (let i = 0; i < 48; i++) {
        const v = H[i] * 2 + H[(i + 1) % 48] + H[(i + 47) % 48];
        if (v > bv) {
          bv = v;
          bi = i;
        }
      }
      if (R.wb == null || bv > (R.wbv || 0) * 1.6) R.wb = bi;
      R.wbv = bv;
      const q = L.at((R.wb + 0.5) / 48);
      return [q[0], q[1], null];
    }
    // one creature for the whole shot: it keeps it while it lives, so the camera does not hop between two when the list reorders
    const all = live([tg]);
    let f = R.subj && R.subj.sp === tg && all.includes(R.subj.f) ? R.subj.f : all[0];
    R.subj = f ? { sp: tg, f } : null;
    return f ? [f.x, f.y, f] : [R.c[0], R.c[1], null];
  }
  function shotCam(sh, v) {
    const R = X.R,
      TD = tankDepth(),
      TH = tankH(),
      zm = sh.zoom || 1,
      y0 = sh.yaw || 0,
      T = targetOf(sh);
    // every ease is by time, not by frame: a frame that runs long or short (a phone) no longer jerks the shot. A creature's own wiggle
    // (heading, height, body length as it bends) is low-passed before the camera sees it
    const s = R.ss || (R.ss = { c: [T[0], T[1]], y: null }),
      dt = X.camDt || 1 / 60,
      ek = (rate) => 1 - Math.exp(-rate * dt);
    const k = ek(sh.kind === 'ride' || sh.kind === 'follow' ? 3.2 : 1.2);
    s.c[0] += (T[0] - s.c[0]) * k;
    s.c[1] += (T[1] - s.c[1]) * k;
    const c = s.c,
      sm = (key, v, rate) => (s[key] = s[key] == null ? v : s[key] + (v - s[key]) * ek(rate));
    switch (sh.kind) {
      case 'above':
        return {
          c: [c[0], c[1], TD * 0.4],
          yaw: y0 + lerp(-6, 4, v),
          tilt: 2,
          dist: distFor(TH * lerp(0.3, 0.26, ease(v))) / zm,
        };
      case 'ride':
      case 'follow': {
        const f = T[2];
        if (!f) return null;
        const want = Math.atan2(-Math.cos(f.ang), -Math.sin(f.ang)) / DEG;
        if (s.w == null) s.w = want;
        s.w = Shots.chase(s.w, want, ek(2.5)); // the heading without the swim's wiggle
        if (s.y == null) s.y = s.w;
        s.y = Shots.chase(s.y, s.w, ek(1.2));
        const z = sm('z', f.z * TD, 1.5),
          d = sm('d', bl(f), 1);
        return sh.kind === 'ride'
          ? { c: [c[0], c[1], z], yaw: s.y + y0, tilt: lerp(14, 26, v), dist: (d * 3.6) / zm }
          : { c: [c[0], c[1], z], yaw: s.y + y0, tilt: 30, dist: (d * 6) / zm };
      }
      case 'beneath':
        return {
          c: [c[0], c[1], TD * ((X.P.setting.surface || {}).level || 0.3)],
          yaw: y0 + lerp(30, 55, v),
          tilt: 152,
          dist: (TD * lerp(0.62, 0.55, ease(v))) / zm,
        };
      case 'descent':
        return {
          c: [c[0], c[1], TD * lerp(0.35, 0.6, ease(v))],
          yaw: y0 + lerp(20, 50, v),
          tilt: lerp(40, 66, ease(v)),
          dist: (TH * lerp(0.36, 0.26, ease(v))) / zm,
        };
      case 'orbit':
        return { c: [c[0], c[1], TD * 0.62], yaw: y0 + 80 + v * 60, tilt: 74, dist: (TH * 0.22) / zm };
      case 'view': {
        // a framing set by hand, in city units (x, z across the plan, y up from the sea bed): at -> to, with yaw, tilt and dist as one value or [from, to]
        const k = (tankW() * 0.4) / 15.3, e = ease(v), a = sh.at || [0, 0, 3], b = sh.to || a, L = (q, d) => (Array.isArray(q) ? lerp(q[0], q[1], e) : q != null ? q : d);
        return { c: [R.c[0] + lerp(a[0], b[0], e) * k, R.c[1] + lerp(a[1], b[1], e) * k, TD * 0.92 - lerp(a[2], b[2], e) * k], yaw: y0 + L(sh.turn, 180), tilt: L(sh.tilt, 80), dist: (L(sh.dist, 12) * k) / zm };
      }
      case 'lookup':
        return {
          c: [c[0] + tankW() * 0.05, c[1], TD * 0.45],
          yaw: y0 + 230 + v * 25,
          tilt: lerp(118, 132, ease(v)),
          dist: (TD * 0.5) / zm,
        };
      case 'low':
        return {
          c: [c[0], c[1] + TH * 0.05, TD * 0.28],
          yaw: y0 + lerp(175, 195, v),
          tilt: 70,
          dist: (TH * lerp(0.3, 0.24, ease(v))) / zm,
        };
    }
    return null;
  }
  X.total = () => (X.P ? Shots.total(X.P.shots) : 0); // packages/motion/shots.js
  X.camera = function (dt) {
    X.camDt = dt > 0 ? Math.min(dt, 0.1) : 1 / 60;
    const P = X.P;
    X.lastDist = 0;
    if (!P || !X.shotsOn || !P.shots || !P.shots.length) return null;
    const total = X.total();
    if (!total) return null;
    const a = Shots.at(P.shots, X.shotT),
      sh = a.shot;
    if (X.shot !== sh) {
      X.shot = sh;
      X.R.ss = null;
      X.R.subj = null;
    }
    X.fade = P.shots.length > 1 ? Shots.dip(a.cut, 0.45) : 0;
    const o = shotCam(sh, a.v);
    if (!o) return null;
    const dist = o.dist / S.zoom;
    X.lastDist = dist; // Turn, Orbit, Zoom and Shift-drag adjust the shot (they are the viewer's); Tilt, View and Follow hand the camera over (X.free)
    return {
      c: [o.c[0] + camPan[0], o.c[1] + camPan[1], o.c[2] + camPan[2]],
      yaw: o.yaw * DEG + cam.yaw,
      tilt: o.tilt * DEG,
      dist,
    };
  };
  // who holds the camera: the place's shots (Directed) or the viewer (Free). The Camera tab and the Places tab both show it.
  X.setDirected = (on) => {
    X.shotsOn = !!on;
    for (const r of document.querySelectorAll('input[name="shotmode"], input[name="pl-cam"]'))
      r.checked = r.value === (on ? 'on' : 'off');
  };
  X.free = () => {
    if (X.P && X.shotsOn) {
      X.setDirected(false);
      cam.fc = null;
    }
  };

  // ------------------------------------------------------------------ loading a place
  const STORE = 'forge:world-places';
  // the edited places live in localStorage; where it is off (a sandboxed frame) places simply are not kept, and say so once
  let storeWarned = false;
  const storeFail = (e) => {
    if (!storeWarned) {
      storeWarned = true;
      console.warn('World Scene: places are not kept (storage off):', e && e.message);
    }
  };
  const saved = () => {
    try {
      return JSON.parse(localStorage.getItem(STORE) || '{}');
    } catch (e) {
      storeFail(e);
      return {};
    }
  };
  const writeSaved = (s) => {
    try {
      localStorage.setItem(STORE, JSON.stringify(s));
    } catch (e) {
      storeFail(e);
    }
  };
  X.writeSaved = writeSaved;
  const PLACES_V = 6; // the built-in places' version: raise it when they are redesigned
  function keep() {
    const s = saved();
    if (X.P && X.id !== 'world') {
      X.P._v = PLACES_V;
      s[X.id] = X.P;
    }
    writeSaved(s);
  }
  function allPlaces() {
    const out = {},
      base = window.WorldPlaces || { world: { title: 'World' } },
      mine = saved();
    for (const k in base) out[k] = clone(base[k]);
    for (const k in mine) if (!base[k] || mine[k]._v === PLACES_V) out[k] = mine[k]; // an edit of a built-in place made before it was redesigned is set aside
    return out;
  }
  X.edited = (id) => {
    const m = saved()[id];
    return !!m && (!(window.WorldPlaces || {})[id] || m._v === PLACES_V);
  };
  let snap = null;
  const SKEYS = [
    'count',
    'snow',
    'glow',
    'shimmer',
    'dark',
    'trail',
    'beh',
    'flow',
    'ptr',
    'dz',
    'routeAtmo',
    'wings',
    'view',
    'orbit',
    'style',
    'irisMode',
    'wiggle',
    'coh',
    'align',
    'sep',
    'tilt',
    'yaw',
    'zoom',
    'projection',
    'hud',
  ];
  function setStyle(id) {
    if (!id || S.style === id) return;
    if (window.ForgeCityHost && ForgeCityHost.setStyle) ForgeCityHost.setStyle(id);
    else {
      const sel = document.getElementById('style-pick');
      if (sel) {
        sel.value = id;
        sel.dispatchEvent(new Event('change'));
      }
    }
  }
  // the place's depth (or World's, coming back): the slider shows it, and the city stands on the new floor
  function syncDepth() {
    const el = document.getElementById('dz'),
      o = document.getElementById('o-dz');
    if (el) {
      el.value = S.dz;
      if (o) o.textContent = Math.round(S.dz * 100) + '%';
    }
    if (typeof cityFollowDepth === 'function') cityFollowDepth();
  }
  // the place's own city (setting.city as an object: see cityPlan in src/city.js), or World's; built again only when it changes
  let cityKey = 'null';
  function rebuildCity() {
    if (typeof buildPlacedCity !== 'function') return;
    buildPlacedCity(worldCitySeed ?? S.seed, worldTowers);
    // the tower panel is in the page by the time a place builds a city; each call is guarded against a host that has not got that panel
    for (const fn of [refreshVortices, refreshCityGenPanels]) if (typeof fn === 'function') fn();
    curTowerIdx = 0;
    curTierIdx = 0;
    if (typeof populateTowerSelect === 'function') populateTowerSelect();
    if (typeof renderTowerForms === 'function') renderTowerForms();
  }
  // set the plan, then build where it is wanted: when the depth moved (cityFollowDepth builds with the new plan) or the built city is another plan's
  function placeCity(c, show) {
    if (typeof cityPlan === 'undefined') return;
    const plan = c && typeof c === 'object' ? c : null,
      key = JSON.stringify(plan);
    cityPlan = plan;
    if (typeof cityFollowDepth === 'function' && cityFollowDepth()) {
      cityKey = key;
      return;
    }
    if (show && key !== cityKey) {
      rebuildCity();
      cityKey = key;
    }
  }
  function applySetting() {
    const st = X.P.setting || {};
    // surface.cityY: the water's height in city units above the sea bed (the cathedral: half way up the piers), turned into the tank's level
    if (st.surface && st.surface.cityY != null) st.surface.level = Math.max(0.02, (tankDepth() * 0.92 - st.surface.cityY * ((tankW() * 0.4) / 15.3)) / tankDepth());
    // a place's own recipe (setting.recipe: palette, depth, light, lines, atmo over Route Zero): registered under the place's id, then set like any style
    if (st.recipe && window.StyleRecipes && StyleRecipes.register) {
      const rid = StyleRecipes.register(Object.assign({ id: 'place-' + X.id, name: X.P.title, base: 'route-zero' }, st.recipe));
      if (typeof fillStylePick === 'function') fillStylePick();
      if (S.style === rid && typeof setStyleId === 'function') setStyleId(rid, true); else setStyle(rid);
    } else setStyle(st.style);
    Object.assign(S, {
      snow: !!st.snow,
      glow: st.glow ?? 0.8,
      shimmer: 0,
      dark: 0,
      trail: 0,
      beh: st.life ? 'on' : 'off',
      irisMode: st.iris ?? 0,
      wiggle: st.wiggle ?? 0.014 /* a calmer body wave than World's 0.03: koi glide */,
      ...(st.life ? {} : { coh: 0, align: 0.2, sep: 0.35 }),
      /* the roles flock the cast (schools along a path): World's tank-wide cohesion would pull every koi into one bundle */ flow: 'free',
      ptr: 'scatter',
      dz: st.dz || 0.8,
      routeAtmo: false,
      view: 'angle',
      orbit: false,
      yaw: 0,
      zoom: 1,
      tilt: 38,
      hud: false,
    });
    cam.yawT = 0;
    camPan[0] = camPan[1] = camPan[2] = 0;
    placeCity(st.city, !!st.city);
    syncDepth();
    syncControls();
    X.setDirected(X.shotsOn);
    for (const id of ['r-city', 'r-tower']) {
      const b = document.getElementById(id);
      if (b) b.hidden = !st.city;
    }
  }
  // what the roles keep on a creature (f.role: its lane, school, slot, pace, heading, a scare) and the fright it carried in: a creature coming from another
  // place starts clean, or it keeps swimming as it did there (a stale school or slot, an alarm that never decays with the ecosystem off)
  function forget(f) {
    f.steer = null;
    f.role = null;
    f.alarm = 0;
    f.dashT = 0;
  }
  function applyCast(warm) {
    for (const sp of SPECIES) sim.pop[sp.key] = 0;
    Object.assign(sim.pop, castPop(X.P));
    S.count = sim.POP_TOTAL;
    EcologySim.setCount(sim); // count = POP_TOTAL: the numbers given are the numbers spawned
    for (const f of sim.fish) forget(f);
    seedR = 12345;
    X.R.st = [];
    X.R.wb = null;
    if (warm) X.warm(warm);
  }
  // a place's title card: its name and its story, over the scene for a few seconds as it loads (P.story)
  function titleCard(P) {
    let el = document.getElementById('placeCard');
    if (!el) { el = document.createElement('div'); el.id = 'placeCard'; document.body.appendChild(el); }
    clearTimeout(titleCard.t);
    if (!P || !P.story) { el.classList.remove('on'); return; }
    el.innerHTML = '<h2></h2><p></p>';
    el.firstChild.textContent = P.title || '';
    el.lastChild.textContent = P.story;
    requestAnimationFrame(() => el.classList.add('on'));
    titleCard.t = setTimeout(() => el.classList.remove('on'), 9000);
  }
  X.set = function (id) {
    X.places = allPlaces();
    if (!X.places[id]) id = 'world';
    titleCard(id === 'world' ? null : X.places[id]);
    if (id !== 'world' && !snap) {
      snap = { S: {}, pop: Object.assign({}, sim.pop) };
      for (const k of SKEYS) snap.S[k] = S[k];
    }
    for (const f of sim.fish) f.steer = null;
    if (id === 'world') {
      if (snap) {
        for (const k of SKEYS) if (k !== 'style') S[k] = snap.S[k];
        Object.assign(sim.pop, snap.pop);
        EcologySim.setCount(sim);
        setStyle(snap.S.style);
        snap = null;
        placeCity(null, true);
        syncDepth();
        syncControls();
      }
      X.P = null;
      X.R = null;
      X.bodies = 'specimen';
      window.PlaceFlora && PlaceFlora.clear();
      for (const b of ['r-city', 'r-tower']) {
        const e = document.getElementById(b);
        if (e) e.hidden = false;
      }
    } else {
      X.P = X.places[id];
      X.R = { st: [] };
      X.id = id;
      applySetting();
      X.R.c = centerOf(X.P);
      X.R.paths = buildPaths(X.P, X.R.c);
      X.bodies = (X.P.look && X.P.look.creatures) || 'specimen';
      applyCast(25);
      X.replant();
    }
    X.mom = null;
    momPrev = -1;
    glow0 = null;
    X.id = id;
    document.body.classList.toggle('in-place', id !== 'world');
    document.body.classList.toggle('place-life', !!(X.P && X.P.setting && X.P.setting.life));
    X.shotT = 0;
    X.shot = null;
    cam.fc = null;
    syncLink();
    X.ui && X.ui.refresh();
    return id;
  };
  X.reset = () => {
    const s = saved();
    delete s[X.id];
    writeSaved(s);
    X.set(X.id);
  };
  X.hides = (layer) =>
    !!(X.P && X.P.setting && !X.P.setting.city && ['city', 'towers', 'walkers', 'terrain'].includes(layer)) ||
    !!(X.P && layer === 'terrain');
  X.tick = function (dt) {
    if (!X.P) return;
    runCast(dt);
    X.shotT += dt;
    moment(dt);
  };
  // ------------------------------------------------------------------ the moment: one thing a place does once a loop (setting P.moment, below)
  // { name, at (s into the loop), len (s), shaft (extra light shafts), colour (their colour), glow (extra bloom), mist, dark (0..1: the frame dips), grow (extra growth: 1 = +40%),
  //   scatter { species: [keys], radius (fraction of the tank's width), from: 'center' | 'cast', kick (0..1) } -- the creatures near it bolt away as it begins }
  // X.mom = { env (0..1: swells and falls), name } while it runs. ?moments=0 or X.momentsOn = false holds it off (the checks measure calm swimming).
  X.momentsOn = new URLSearchParams(location.search).get('moments') !== '0';
  X.mom = null;
  let momPrev = -1,
    glow0 = null;
  function moment(dt) {
    const P = X.P,
      M = P && P.moment,
      total = X.total();
    if (!M || !X.momentsOn || !total) {
      if (X.mom) {
        X.mom = null;
        if (glow0 != null) {
          S.glow = glow0;
          glow0 = null;
        }
      }
      return;
    }
    const ph = ((X.shotT % total) + total) % total,
      u = (ph - M.at) / Math.max(0.1, M.len),
      on = u >= 0 && u <= 1,
      env = on ? Math.sin(Math.PI * u) ** 1.5 : 0;
    if (on && momPrev < 0) momentStart(M);
    momPrev = on ? u : -1;
    if (!on) {
      if (X.mom) {
        X.mom = null;
        if (glow0 != null) {
          S.glow = glow0;
          glow0 = null;
        }
      }
      return;
    }
    X.mom = { env, name: M.name || '', M };
    if (M.glow) {
      if (glow0 == null) glow0 = S.glow;
      S.glow = glow0 + M.glow * env;
    }
  }
  function momentStart(M) {
    const sc = M.scatter;
    if (!sc) return;
    const R = X.R,
      fish = live(sc.species || []);
    if (!fish.length) return;
    let cx = R.c[0],
      cy = R.c[1];
    if (sc.from === 'cast') {
      cx = fish.reduce((a, f) => a + f.x, 0) / fish.length;
      cy = fish.reduce((a, f) => a + f.y, 0) / fish.length;
    }
    const rad = (sc.radius ?? 0.3) * tankW();
    for (const f of fish) {
      const dx = f.x - cx,
        dy = f.y - cy,
        d = Math.hypot(dx, dy) || 1;
      if (d > rad) continue;
      const a = Math.atan2(dy, dx),
        k = sc.kick ?? 1;
      f.role = Object.assign(f.role || {}, { bolt: 1.8 * k, bx: Math.cos(a), by: Math.sin(a) }); // the roles' own heading takes the scare (ecology-roles head)
      f.alarm = k;
      f.dashT = 0.5 * k + 0.2;
      f.dashAng = a;
      f.fleeX = Math.cos(a);
      f.fleeY = Math.sin(a);
    }
  }
  X.warm = (sec) => {
    const n = Math.round(sec * 30);
    for (let i = 0; i < n; i++) {
      EcologySim.step(sim, 1 / 30);
      runCast(1 / 30);
    }
  };

  // ------------------------------------------------------------------ drawing the water and its light
  const W = () => (X.P.setting && X.P.setting.water) || null;
  X.bg = () => (X.P && W() ? hex(W().fog) : null);
  X.under = function (t) {
    if (!X.P || !W()) return;
    const p = progs().floor,
      u = p.u,
      F = W(),
      sh = shadows();
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.BLEND);
    gl.useProgram(p.p);
    gl.bindVertexArray(quadVAO);
    gl.uniformMatrix4fv(u.uIVP, false, cam.ivp);
    gl.uniform3fv(u.uEye, cam.eye);
    gl.uniform1f(u.uFloorZ, groundZ());
    gl.uniform1f(u.uT, t);
    gl.uniform1f(u.uScale, F.scale || 400);
    gl.uniform1f(u.uRib, F.ribbons ?? 0.8);
    gl.uniform1f(u.uRibK, 1);
    gl.uniform1f(u.uNet, F.net ?? 0.1);
    gl.uniform1f(u.uFogK, F.fogK ?? 0.0001);
    gl.uniform1f(u.uMoon, F.moon || 0);
    const ms = X.moss();
    gl.uniform1f(u.uMoss, ms ? ms.amount : 0);
    if (ms) {
      gl.uniform3fv(u.uMossC, ms.c);
      gl.uniform3fv(u.uMossTip, ms.tip);
    }
    gl.uniform3fv(u.uDeep, hex(F.deep));
    gl.uniform3fv(u.uShallow, hex(F.shallow));
    gl.uniform3fv(u.uRibC, hex(F.light));
    gl.uniform3fv(u.uFogC, hex(F.fog));
    gl.uniform3fv(u.uShC, hex(F.shade));
    gl.uniform2f(u.uTank, tankW(), tankH());
    const A = new Float32Array(64 * 4),
      B = new Float32Array(64 * 4),
      n = Math.min(64, sh.length);
    for (let i = 0; i < n; i++) {
      const s = sh[i];
      A.set([s[0], s[1], s[2], s[3]], i * 4);
      B.set([s[4], s[5], s[6], 0], i * 4);
    }
    gl.uniform4fv(u.uSh, A);
    gl.uniform4fv(u.uShB, B);
    gl.uniform1i(u.uShN, n);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
  };
  X.over = function (t) {
    if (!X.P) return;
    const st = X.P.setting || {},
      F = st.surface,
      Fl = W() || {};
    if (F && F.opacity > 0) {
      const p = progs().surf,
        u = p.u;
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(p.p);
      gl.bindVertexArray(quadVAO);
      gl.uniformMatrix4fv(u.uVP, false, cam.vp);
      gl.uniform2f(u.uTank, tankW(), tankH());
      gl.uniform1f(u.uSurfZ, F.level * tankDepth());
      gl.uniform1f(u.uT, t);
      gl.uniform1f(u.uScale, (Fl.scale || 400) * 1.1);
      gl.uniform1f(u.uA, F.opacity);
      gl.uniform1f(u.uRib, F.ribbons || 0);
      gl.uniform1f(u.uRibK, 1);
      gl.uniform1f(u.uMoon, F.moon || 0);
      gl.uniform3fv(u.uCol, hex(F.colour));
      gl.uniform3fv(u.uRibC, hex(Fl.light || '#ffffff'));
      gl.uniform3fv(u.uEye, cam.eye);
      gl.uniform1f(u.uBelow, cam.eye[2] > F.level * tankDepth() ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.depthMask(true);
      gl.depthFunc(gl.LESS);
    }
    const O = st.shafts || {},
      p = progs().over,
      u = p.u;
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(p.p);
    gl.bindVertexArray(quadVAO);
    const mo = X.mom,
      me = mo ? mo.env : 0,
      MM = mo ? mo.M : {};
    gl.uniform1f(u.uT, t);
    gl.uniform1f(u.uShaft, (O.amount || 0) + (MM.shaft || 0) * me);
    gl.uniform1f(u.uFade, Math.max(X.fade, (MM.dark || 0) * me));
    gl.uniform1f(u.uVig, st.vignette || 0);
    gl.uniform1f(u.uMist, ((st.mist && st.mist.amount) || 0) + (MM.mist || 0) * me);
    gl.uniform3fv(u.uMistC, hex((st.mist && st.mist.colour) || '#8fa8b8'));
    gl.uniform1f(u.uAsp, vw / Math.max(1, vh));
    gl.uniform3fv(u.uShaftC, hex(me > 0.02 && MM.colour ? MM.colour : O.colour || '#ffffff'));
    gl.uniform3fv(u.uFadeC, [0, 0, 0]);
    gl.uniform2fv(u.uSrc, [0.5, 1.25]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
  };

  // ------------------------------------------------------------------ the creatures, solid: the shared renderer (packages/render/ecology-render.js) in this page's context
  const toHex = (c) =>
    '#' +
    c
      .map((v) =>
        Math.round(clamp(v, 0, 1) * 255)
          .toString(16)
          .padStart(2, '0')
      )
      .join('');
  function styledLook(sp, savedLook) {
    const Y = (X.P.look && X.P.look.styled) || {},
      row = (X.P.cast || []).find((r) => r.species === sp.key);
    // a creature's look, first found: its own (styled.looks[key]; { from: 'saved' } keeps its saved Specimen look), one for all (styled.all: Lantern Vigil's Energy),
    // the place's base over the creature's own colours (styled.base { material, pattern, ..., bright (0.3 = dark bodies), colors (one set for all) }), else the saved look
    let L = Y.looks && Y.looks[sp.key];
    if (L && L.from === 'saved') L = savedLook && savedLook.material !== 'own' ? savedLook : null;
    if (!L) L = Y.all ? Object.assign({}, Y.all) : null;
    if (!L && !Y.base) L = savedLook && savedLook.material !== 'own' ? savedLook : null;
    if (L && L.preset) L = EcologyRender.preset(L.preset, L); // { preset: 'energy', colors: [...] }: the material's start, then the look's own
    if (!L) {
      const k = (Y.base && Y.base.bright) ?? 1,
        hi = (sp.colHi || [0.8, 0.8, 0.8]).map((v) => v * k),
        lo = (sp.colLo || hi.map((v) => v * 0.5)).map((v) => v * k);
      L = Object.assign(
        {
          material: 'skin',
          pattern: 'veins',
          colors: [toHex(hi), toHex(lo.map((v) => v * 0.6)), toHex(hi), toHex(hi), toHex(lo)],
        },
        Y.base
      );
      delete L.bright;
    }
    if (row && row.stone) {
      // stone keeps the creature's own colours, and takes what the place grows: the season's kind (frost, moss, fungus, rust in turn), or the growth's own kind
      L = Object.assign({}, L, Y.stone || { material: 'golem' }, (Y.stones && Y.stones[sp.key]) || null); // styled.stones[species]: this creature's own stone over the place's
      const m = X.moss();
      if (!(Y.stone && Y.stone.grow)) L.grow = (m && m.name) || 'moss';
    }
    if (Y.paint) L = Object.assign({}, L, Y.paint);
    return L;
  }
  // how this place restyles the creatures, for src/creatures.js (which draws them with the shared renderer). Look: Specimen (nothing changed),
  // Styled (the place's own looks; white lines, lighter) or Lines (the drawing only)
  X.styledLookFor = (sp, saved) => styledLook(sp, saved || null); // the look this place gives a species (for checks)
  X.creatureStyle = () => {
    if (!X.P) return null;
    const Y = (X.P.look && X.P.look.styled) || {},
      styled = X.bodies === 'styled';
    return {
      key: X.id + ':' + X.bodies + ':' + X.lookRev + ':' + ((X.moss() || {}).name || ''), // a new season is a new look for the stone creatures
      // the flat fill under a creature's lines (a wing's membrane) in the place's own colours: styled.fill { species: [high, low] } as hex; null: the species' own
      // styled.lineLook: the outlines take each creature's own look's line colour (as Specimen draws them), not one white for all
      fill: (sp) => {
        const c = Y.fill && Y.fill[sp.key];
        if (c) return [hex(c[0]), hex(c[1] || c[0])];
        if (!Y.lineLook) return null;
        const L = styledLook(sp, (window.CreatureLooks || {})[sp.key]),
          k = L && L.colors && L.colors[3];
        return k ? [hex(k), hex(k).map((v) => v * 0.7)] : null;
      },
      lines: X.bodies === 'flat',
      look: styled ? styledLook : null,
      render: styled
        ? { lineColor: Y.lineLook ? null : [1, 1, 1], lineAlpha: Y.lineAlpha ?? 0.3, backing: Y.backing ?? 0 }
        : null,
      // how much the stone creatures carry right now (0 to 1), for the renderer's growth override; null for the rest: the place's growth, a little lighter than on the towers
      grow: (sp) => {
        const row = (X.P.cast || []).find((r) => r.species === sp.key),
          m = row && row.stone && !(Y.stone && (Y.stone.grow || Y.stone.growAmount != null)) ? X.moss() : null; // a stone look that sets its own growth keeps it
        return m ? clamp(m.amount * 0.75, 0, 1) : null;
      },
    };
  };
  X.lookRev = 0;

  // ------------------------------------------------------------------ plants (places/flora.js: Forge Scenes' plantings in this tank)
  // a Forge Scenes world unit in tank units: its places are about 70 across, so the tank's width is too (the same on every load,
  // whoever is swimming at the moment)
  const worldUnit = () => tankW() / 70;
  function towerInfo() {
    if (typeof placedTowers === 'undefined') return [];
    return placedTowers
      .filter((tw) => tw && tw.model && tw.built && tw.built.parts)
      .map((tw) => {
        const m = tw.model,
          s = m[0];
        let top = 0,
          foot = 0;
        for (const p of tw.built.parts) {
          const P = p.positions;
          if (!P) continue;
          for (let i = 0; i < P.length; i += 3) {
            if (P[i + 1] > top) top = P[i + 1];
            if (P[i + 1] < 0.08 * (top || 1)) foot = Math.max(foot, Math.hypot(P[i], P[i + 2]));
          }
        }
        return { parts: tw.built.parts, model: m, top: top * s, foot: [m[12], m[13], foot * s * 1.1] };
      });
  }
  X.replant = function () {
    if (!window.PlaceFlora) return;
    const P = X.P,
      F = P && P.flora;
    if (!F) {
      PlaceFlora.clear();
      return;
    }
    const st = P.setting || {},
      TD = groundZ(); // the plants stand on the ground (under the city's edge when it stands)
    X.R.flora = PlaceFlora.plant(F, {
      gl,
      TW: tankW(),
      TH: tankH(),
      TD,
      U: worldUnit(),
      C: X.R.c,
      seed: 7,
      surfZ: ((st.surface && st.surface.level) ?? 0) * tankDepth(),
      towers: st.city ? towerInfo() : [],
      city: st.city ? { r: CITY_FOOTPRINT_FRAC * tankW() * 0.9 } : null,
    });
  };
  // what grows on the stone and the ground (setting.growth: { kind moss|frost|rust|fungus, amount, colour, tip, timelapse, seasons }): how much now, which kind, its
  // two colours, and the stone's height. A timelapse grows in over the loop as the plants do; seasons runs frost, moss, fungus and rust one after another.
  const GROWTH = {
    moss: { i: 0, c: '#3f6a2c', tip: '#8fae4a' },
    frost: { i: 1, c: '#a9c8da', tip: '#f4fbff' },
    fungus: { i: 3, c: '#7a6a52', tip: '#e8c88a' },
    rust: { i: 2, c: '#5e2a12', tip: '#d0773a' },
  };
  const SEASONS = ['frost', 'moss', 'fungus', 'rust'],
    sstep = (a, b, v) => ease(clamp((v - a) / (b - a), 0, 1));
  X.moss = function () {
    const st = X.P && X.P.setting,
      M = st && (st.growth || st.moss);
    if (!M) return null;
    const total = X.total() || 30,
      u = (((X.shotT % total) + total) % total) / total;
    let kind = M.kind || 'moss',
      k = M.timelapse ? ease(clamp((u - 0.02) / 0.85, 0, 1)) : 1;
    if (M.seasons) {
      const q = u * 4,
        f = q - Math.floor(q);
      kind = SEASONS[Math.floor(q) % 4];
      k = sstep(0, 0.4, f) * (1 - sstep(0.82, 1, f));
    }
    const G = GROWTH[kind] || GROWTH.moss,
      tw = (typeof placedTowers !== 'undefined' ? placedTowers : []).filter((q) => q && q.built),
      h = tw.reduce((a, q) => Math.max(a, q.built.top * q.scale), 0);
    return {
      amount: (M.amount ?? 1) * k * 1.05 * (1 + 0.4 * (X.mom && X.mom.M.grow ? X.mom.M.grow * X.mom.env : 0)),
      kind: G.i,
      name: kind,
      c: hex(M.seasons || !M.colour ? G.c : M.colour),
      tip: hex(M.seasons || !M.tip ? G.tip : M.tip),
      base: groundZ(),
      h: h || tankDepth() * 0.5,
    };
  };
  // the place's gold sigil etchings (setting.etch { amount, size (of the tower's height), colour, glow }); null when it has none
  X.bands = () => (X.P && X.P.setting && X.P.setting.bands) || null;
  X.etch = function () {
    const E = X.P && X.P.setting && X.P.setting.etch;
    if (!E) return null;
    return { amount: E.amount ?? 1, size: E.size ?? 0.24, glow: E.glow ?? 0.8, c: hex(E.colour || '#f2c36b') };
  };
  // the stone's uniforms (towers and city share towerProg): set for the frame, cleared after
  X.mossStone = function (on) {
    const u = towerProg.u,
      m = on ? X.moss() : null,
      W = on && X.P && X.P.setting.wet;
    gl.useProgram(towerProg.p);
    gl.uniform1f(u.uMoss, m ? m.amount : 0);
    if (m) {
      gl.uniform1f(u.uMossBase, m.base);
      gl.uniform1f(u.uMossH, m.h);
      gl.uniform1f(u.uKind, m.kind);
      gl.uniform3fv(u.uMossC, m.c);
      gl.uniform3fv(u.uMossTip, m.tip);
    }
    gl.uniform1f(u.uWet, W ? (W.amount ?? 1) : 0);
    if (W) gl.uniform3fv(u.uWetC, hex(W.colour || '#cfe8ff'));
  };
  X.plants = function (t) {
    if (!X.P || !X.P.flora || !window.PlaceFlora || !PlaceFlora.count) return;
    const total = X.total() || 30,
      u = (((X.shotT % total) + total) % total) / total,
      grow = PlaceFlora.timelapse ? ease(clamp((u - 0.02) / 0.85, 0, 1)) * 16 : undefined;
    const Fl = W() || {},
      sky = Fl.fog ? hex(Fl.fog) : [0, 0, 0],
      v = [X.R.c[0] - cam.eye[0], X.R.c[1] - cam.eye[1]],
      vl = Math.hypot(v[0], v[1]) || 1;
    PlaceFlora.draw(gl, {
      vp: cam.vp,
      eye: cam.eye,
      shift: cam.shift,
      shiftX: cam.shiftX,
      time: t,
      grow,
      fz: groundZ(),
      view: [v[0] / vl, v[1] / vl],
      sky,
      ...(X.P.flora.ink ? { ink: hex(X.P.flora.ink) } : {}),
    }); // no ink given: flora.js's dark default (an undefined here wiped it, and FloraGPU drew the stems white)
    gl.bindVertexArray(null);
    gl.useProgram(null);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE);
  };

  // ------------------------------------------------------------------ for a recorder: step by hand
  X.manual = (on) => {
    X.manualOn = !!on;
  };
  X.step = (dt) => {
    EcologySim.step(sim, dt);
    for (const fn of [
      typeof forgeDriftTick === 'function' && forgeDriftTick,
      typeof stepCityWalkers === 'function' && stepCityWalkers,
      typeof stepForgeGround === 'function' && stepForgeGround,
    ])
      if (fn) fn(dt);
    t += dt;
    X.tick(dt);
    updateCamera(dt);
    draw(t);
  };
  X.hidePanels = () => {
    const b = document.getElementById('hide-all');
    if (b && !document.body.classList.contains('bare')) b.click();
  };
  function syncLink() {
    const q = new URLSearchParams(location.search);
    q.delete('env');
    if (X.id === 'world') q.delete('place');
    else q.set('place', X.id);
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
  }

  // ------------------------------------------------------------------ start
  window.ENVX = X;
  X.places = allPlaces();
  X.groundZ = groundZ;
  X.lib = {
    clamp,
    lerp,
    hex,
    toHex,
    clone,
    LAYERS,
    LAYER_NAMES,
    ROLE_NAMES,
    SHOT_NAMES,
    STORE,
    saved,
    keep,
    applyCast,
    applySetting,
    buildPaths,
    centerOf,
    layerOf,
    live,
    rowLists,
    specName,
  }; // for the Places tab (places/ui.js)
  const q = new URLSearchParams(location.search);
  if (['specimen', 'styled', 'flat'].includes(q.get('bodies'))) X.bodyOverride = q.get('bodies');
  if (q.get('shots') === '0') X.shotsOn = false;
  const want = q.get('place') || q.get('env');
  if (want && want !== 'world') {
    X.set(want);
    if (X.bodyOverride) {
      X.bodies = X.bodyOverride;
      X.ui && X.ui.refresh();
    }
  }
})();
