// world/scenes/world-scene/src/draw.js -- World Scene: One frame: the passes in order (terrain, towers, city, creatures, the hooks for World Scene's places), and the blit.
// One of the page's scripts, loaded in order (World Scene.html); they share their top-level names as one script did.

// ---------- draw ----------
let runs = [];
let walkLastT = null, walkDt = 0;
function writeSpines() {
  { const now = performance.now() / 1000; walkDt = walkLastT == null || paused ? 0 : Math.min(0.05, now - walkLastT); walkLastT = now; }
  // deepest drawn first; within a depth band, fish of one kind sit together so each run is one draw call
  for (const f of sim.fish) f.band = Math.floor(f.z * 8);
  sim.fish.sort((a, b) => (b.band - a.band) || (a.sp - b.sp) || (b.z - a.z));
  runs = [];
  for (let i = 0; i < sim.fish.length; i++) {
    const last = runs[runs.length - 1];
    if (last && last.sp === sim.fish[i].sp) last.n++; else runs.push({ sp: sim.fish[i].sp, row0: i, n: 1 });
  }
  const n = sim.fish.length;
  for (let i = 0; i < n; i++) {
    const f = sim.fish[i], c = f.chain, row = i * TEX_W * 4;
    const sw = SPECIES[f.sp].swim, bl = EcologySim.bodyLen(sim, f), A = S.wiggle * bl * sw.amp * (1 - 0.8 * (f.ground || 0));   // walking: the body is carried, not waved
    // the swim wave rides on top of the trailing chain (not stored, so it never accumulates)
    for (let k = 0; k < K; k++) {
      const s = k / (K - 1);
      const k0 = Math.max(0, k - 1), k1 = Math.min(K - 1, k + 1);
      let tx = c[k1 * 2] - c[k0 * 2], ty = c[k1 * 2 + 1] - c[k0 * 2 + 1];
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const off = A * (0.12 + 0.88 * Math.pow(s, sw.ampPow)) * Math.sin(f.phase - s * Math.PI * 2 * sw.waves);
      spineData[row + k * 4] = c[k * 2] + ty * off;
      spineData[row + k * 4 + 1] = c[k * 2 + 1] - tx * off;
      spineData[row + k * 4 + 2] = f.cz[k];
      spineData[row + k * 4 + 3] = f.croll[k];
    }
    spineData[row + K * 4] = f.phase;
    spineData[row + K * 4 + 1] = f.seed;
    spineData[row + K * 4 + 2] = bl / SPECIES[f.sp].LEN;
    { const lit = Math.max(SPECIES[f.sp].glow, 1 - 0.8 * f.z); // light falls off with depth, steeply —
      // unless the species glows its own light (angler's lure, jelly's pulse), which ignores depth
      const bk = S.beh === 'on' && sim.speciesRT[f.sp].beh.blink ? 0.35 + 0.9 * Math.pow(0.5 + 0.5 * Math.sin(performance.now() * 0.001 * sim.speciesRT[f.sp].beh.blink + f.seed * 3), 3) : 1;
      spineData[row + K * 4 + 3] = lit * lit * (f.darkRoll < S.dark ? 0.09 : 1) * (1 - 0.85 * f.cloak) * bk * f.fade * (1 + 0.8 * f.gulp); }   // shadow fish: barely lit; a cloaked rogue fades
    spineData[row + (K + 1) * 4] = f.tuck; spineData[row + (K + 1) * 4 + 1] = f.turnS;
    spineData[row + (K + 1) * 4 + 2] = f.puff; spineData[row + (K + 1) * 4 + 3] = f.alert;
    spineData[row + (K + 2) * 4] = f.glide; spineData[row + (K + 2) * 4 + 1] = f.flap;
    // walking legs: feet planted on the tank floor, posed on the spine just written
    EcologyWalk.write(spineData, row, f, SPECIES[f.sp], (k) => [spineData[row + k * 4], spineData[row + k * 4 + 1]],
      bl / SPECIES[f.sp].LEN, walkDt, null, K, SPECIES[f.sp].BY0, SPECIES[f.sp].LEN);
  }
  gl.bindTexture(gl.TEXTURE_2D, spineTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TEX_W, Math.max(1, n), gl.RGBA, gl.FLOAT, spineData, 0);
}

function camUniforms(u) {
  gl.uniformMatrix4fv(u.uVP, false, cam.vp); gl.uniform3fv(u.uCam, cam.eye);
  gl.uniform1f(u.uShift, cam.shift); gl.uniform1f(u.uShiftX, cam.shiftX); gl.uniform1f(u.uRefDist, cam.refDist);
  if (u.uIrisMode) gl.uniform1f(u.uIrisMode, S.irisMode);
  if (u.uOrtho) gl.uniform1f(u.uOrtho, S.projection === 'ortho' ? 1 : 0);
  if (u.uWhite) gl.uniform1f(u.uWhite, styled() && !(window.ENVX && ENVX.colour()) ? 1 : 0);
}
function draw(t) {
  const n = sim.fish.length;
  writeSpines();

  const cloudPass = (alpha) => {
    const u = cloudProg.u;
    gl.useProgram(cloudProg.p);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, spineTex); gl.uniform1i(u.uSpine, 1);
    gl.uniform2f(u.uRes, vw, vh); gl.uniform1f(u.uTime, t); gl.uniform1f(u.uIris, S.iris);
    camUniforms(u);
    gl.uniform1f(u.uDensity, S.density);
    gl.uniform1f(u.uPt, Math.max(1, S.size / 70) * dpr);
    gl.uniform1f(u.uAlpha, alpha);
    gl.bindVertexArray(quadVAO);
    for (const r of runs) {
      const sp = SPECIES[r.sp], c = sp.cloud;
      gl.uniform1f(u.uLEN, sp.LEN); gl.uniform1i(u.uRow0, r.row0); gl.uniform1i(u.uNFan, c.nFan); gl.uniform1f(u.uWing, (sp.wing || 0) * S.wings);
      gl.uniform4fv(u.uHead, c.head); gl.uniform4fv(u.uBody, c.body); gl.uniform4fv(u.uWh, c.wh);
      gl.uniform4fv(u.uFanA, sp.fanA); gl.uniform4fv(u.uFanB, sp.fanB); gl.uniform4fv(u.uFanC, sp.fanC);
      gl.drawArraysInstanced(gl.POINTS, 0, CLOUD_N, r.n);
    }
  };
  // one draw per run of same-species fish
  const fishPass = (prog, which, mode, filter) => {
    for (const r of runs) {
      const sp = SPECIES[r.sp], vao = sp[which];
      if (!vao.count || (filter && !filter(sp))) continue;
      gl.uniform1f(prog.u.uBY0, sp.BY0); gl.uniform1f(prog.u.uLEN, sp.LEN);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, sp.partTex); gl.uniform1i(prog.u.uParts, 2);
      gl.uniform4fv(prog.u.uKeyT, sp.keyT); gl.uniform1i(prog.u.uKeyN, sp.keyN);
      gl.uniform1i(prog.u.uRow0, r.row0); gl.uniform1f(prog.u.uWing, (sp.wing || 0) * S.wings);
      const pc = window.ENVX && ENVX.paint(sp);   // a set piece's colours for this species
      if (prog.u.uColLo) gl.uniform3fv(prog.u.uColLo, pc ? pc[1] : sp.colLo);
      if (prog.u.uColHi) gl.uniform3fv(prog.u.uColHi, pc ? pc[0] : sp.colHi);
      gl.bindVertexArray(vao.vao);
      gl.drawElementsInstanced(mode, vao.count, gl.UNSIGNED_SHORT, 0, r.n);
    }
  };
  const solidEnv = !!(window.ENVX && ENVX.solid());   // a set piece in Solid: the shared renderer draws the creatures (ENVX.creatures, below), not these passes
  const showSigil = S.mode !== 'cloud' && !solidEnv, showCloud = S.mode !== 'sigil' && !solidEnv;
  const common = (prog, lineW, layer) => {
    gl.useProgram(prog.p);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, spineTex); gl.uniform1i(prog.u.uSpine, 1);
    gl.uniform2f(prog.u.uRes, vw, vh); camUniforms(prog.u);
    gl.uniform1f(prog.u.uLineW, lineW); gl.uniform1f(prog.u.uLayer, layer);
    gl.uniform1f(prog.u.uZScale, 1 / (MAX_FISH * 256 + 4));
    gl.uniform1f(prog.u.uTime, t);
    if (prog.u.uIris) { gl.uniform1f(prog.u.uIris, S.iris); gl.uniform1f(prog.u.uTimeF, t); }
    if (prog.u.uPtSize) gl.uniform1f(prog.u.uPtSize, Math.max(1.5, S.size / 45) * dpr);
    if (prog.u.uEnvLit) gl.uniform1f(prog.u.uEnvLit, window.ENVX && ENVX.colour() ? 1 : 0);
  };

  if (S.glow > 0) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, glowA.fb); gl.viewport(0, 0, glowA.w, glowA.h);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.blendEquation(gl.MAX);   // overlapping bodies (tight schools, small dense shapes like wisp) take the brightest contribution instead of summing — plain additive blend let close-packed fish stack past white
    if (showSigil) {
      common(lineProg, 1.3, 1); gl.uniform1f(lineProg.u.uAlpha, 0.22);   // thinner/dimmer glow source — dense bodies (fins, whiskers, overlapping segments) were stacking additively into a blown-out white core
      fishPass(lineProg, 'lineVAO', gl.TRIANGLES);
    }
    if (showCloud) cloudPass(0.22);
    drawTowers(t, true);   // glow-tagged tower/city parts only (windows, halos, aura) — same MAX-additive source as the fish lines above
    drawCity(t, true);
    drawCreatureLines(t, true);
    gl.blendEquation(gl.FUNC_ADD);
    gl.disable(gl.BLEND);
    gl.useProgram(blurProg.p); gl.bindVertexArray(quadVAO); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(blurProg.u.uTex, 0);
    for (let pass = 0; pass < 2; pass++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, glowB.fb); gl.bindTexture(gl.TEXTURE_2D, glowA.tex);
      gl.uniform2f(blurProg.u.uDir, (1 + pass) / glowA.w, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, glowA.fb); gl.bindTexture(gl.TEXTURE_2D, glowB.tex);
      gl.uniform2f(blurProg.u.uDir, 0, (1 + pass) / glowA.h); gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  const bg = (window.ENVX && ENVX.bg()) || (styled() ? StyleRecipes.rgb(curStyle.palette.sky[1]).map(v => v * 0.92) : [0.051, 0.039, 0.078]);   // a recipe's sky beyond the floor; Glitch's own deep violet
  // the glowing creature-line wireframe bakes its colour per vertex at mesh-build time (no uTint
  // uniform like towers/city have) -- this flat multiply is the cheap, live, no-rebuild way to pull
  // it toward a quiet sage/warm mood for Route style. Values persist on the program object across
  // useProgram switches, so setting it once per frame here covers every later draw call that binds
  // either program (drawCreatureLines, drawCityWalkers, the grid overlay). Route style also dims it
  // hard (not just retints it): now that drawTowers/drawCity draw real solid facades in Route style,
  // the glowing wireframe should read as a thin accent line over them, the way route-scene.html's
  // optional line layer sits over its flat fills -- not stay the dominant bright element it is in
  // Glitch style, where the wireframe IS the only visible building.
  // a recipe's line colour, normalised so routeLines (the Look tab's Lines knob) sets the magnitude.
  // On a light recipe (paper, engraving) lines are drawn SUBTRACTIVELY (lineBlend below): additive
  // light can't make a dark ink line on cream, but taking (1 - ink) away from the page can.
  const lineRGB = StyleRecipes.rgb(lightStyle() ? curStyle.palette.ink : curStyle.palette.line), lmax = Math.max(0.05, ...lineRGB);
  const styleTint = !styled() ? [1, 1, 1] : lightStyle() ? lineRGB.map(v => (1 - v) * S.routeLines * 1.6) : lineRGB.map(v => v / lmax * S.routeLines);
  const mono = styled() ? 1 : 0;
  gl.useProgram(creatureLineProg.p); gl.uniform3fv(creatureLineProg.u.uStyleTint, styleTint); gl.uniform1f(creatureLineProg.u.uMono, mono);
  gl.useProgram(creatureLineInstProg.p); gl.uniform3fv(creatureLineInstProg.u.uStyleTint, styleTint); gl.uniform1f(creatureLineInstProg.u.uMono, mono);
  gl.bindFramebuffer(gl.FRAMEBUFFER, trailBuf.fb); gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clearDepth(1);
  if (S.trail <= 0) {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  } else {
    // fade last frame toward the background colour instead of wiping it, so motion leaves a trail
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(fadeProg.p); gl.bindVertexArray(quadVAO);
    gl.uniform4f(fadeProg.u.uColor, bg[0], bg[1], bg[2], Math.max(0.02, 1 - S.trail));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
  }
  window.ENVX && ENVX.under(t);   // a set piece's floor: the pond bed, its light, the shadows on it
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true); gl.disable(gl.BLEND);
  if (showSigil) {
    // translucent, glassy bodies: real alpha blending (FILL_FS/LINE_FS both output it in their alpha
    // channel now, not baked into rgb as a fake darken-toward-black the way it used to be) -- depth
    // write stays on, so solid scenery (towers, mountains) still correctly hides a fish behind it,
    // the trade-off being two overlapping translucent fish at different depths won't blend with each
    // other (the nearer one's depth write still rejects the farther one), only with the background
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    if (window.ENVX && ENVX.fill()) { common(fillProg, 0, 0); gl.uniform1f(fillProg.u.uAlpha, ENVX.fill()); fishPass(fillProg, 'fillVAO', gl.TRIANGLES, sp => sp.lineVAO.count > 0); }   // a set piece's painted bodies, under their lines
    common(lineProg, Math.max(0.35, Math.min(0.8, S.size / 220)), 1); gl.uniform1f(lineProg.u.uAlpha, window.ENVX && ENVX.fill() ? 0.85 : S.mode === 'both' ? 0.35 : 0.6);
    fishPass(lineProg, 'lineVAO', gl.TRIANGLES);
    // a few species (jelly, puffer, dragon) have no separate stroke mesh at all — their whole silhouette
    // is the fill plate, so without this they'd render as nothing rather than a stroke
    common(fillProg, 0, 0); gl.uniform1f(fillProg.u.uAlpha, 0.6);
    fishPass(fillProg, 'fillVAO', gl.TRIANGLES, sp => sp.lineVAO.count === 0);
    gl.disable(gl.BLEND);
  }
  drawTowers(t, false);   // opaque: shares this pass's depth buffer with the fish above, so each occludes the other correctly
  drawCity(t, false);
  if (window.ENVX && ENVX.plants) ENVX.plants(t);   // a place's plants, in the same depth buffer
  if (solidEnv) ENVX.creatures(t);   // the 3D bodies, sharing this pass's depth buffer with the towers and the city
  if (styled() && S.routeAtmo && atmoWorld) { routeAtmoCtx.recipe = curStyle; RouteAtmoGL2.drawSolid(gl, routeAtmoCtx, atmoWorld, cam); }   // ridge ring, pines, pilgrims -- opaque, shares this pass's depth buffer too
  // glowing creature-line architecture: additive like the fish's own glow, tested against (but not
  // writing into) the depth buffer the occluders above just wrote, so it's hidden behind nearer solid objects
  gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); lineBlend(true);
  drawCreatureLines(t, false);
  lineBlend(false); gl.disable(gl.BLEND); gl.depthMask(true);
  if (S.showGrid && cityGridLines) {   // City tab > Layers > Radial grid: the ring/wedge outlines the WFC solver works on
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(creatureLineProg.p);
    const u = creatureLineProg.u;
    gl.uniformMatrix4fv(u.uVP, false, cam.vp); gl.uniform1f(u.uShift, cam.shift); gl.uniform1f(u.uShiftX, cam.shiftX);
    gl.uniformMatrix4fv(u.uModel, false, IDENTITY4); gl.uniform1f(u.uAlpha, 0.35);
    gl.bindVertexArray(cityGridLines.vao); gl.drawArrays(gl.LINES, 0, cityGridLines.count);
    gl.disable(gl.BLEND); gl.depthMask(true);
  }
  lineBlend(true); drawCityWalkers(t); lineBlend(false);
  drawSelectionHighlight(t);
  if (styled() && S.routeAtmo && atmoWorld) {
    const atmoDt = Math.max(0, Math.min(0.1, t - lastAtmoT)); lastAtmoT = t;
    RouteAtmoGL2.updatePilgrims(gl, atmoWorld, atmoDt);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    RouteAtmoGL2.drawGlow(gl, routeAtmoCtx, atmoWorld, cam);
    gl.disable(gl.BLEND); gl.depthMask(true); gl.depthFunc(gl.LESS);
  }
  if (S.snow) {   // snow drifting between the fish — the seabed floor speckle grid was removed, the terrain contours alone now read the ground
    const u = snowProg.u;
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(snowProg.p); gl.bindVertexArray(quadVAO);
    gl.uniformMatrix4fv(u.uVP, false, cam.vp); gl.uniform1f(u.uShift, cam.shift); gl.uniform1f(u.uShiftX, cam.shiftX); gl.uniform1f(u.uRefDist, cam.refDist);
    gl.uniform1f(u.uOrtho, S.projection === 'ortho' ? 1 : 0);
    gl.uniform1f(u.uTime, t); gl.uniform1f(u.uPx, 1.6 * dpr); gl.uniform3f(u.uTank, tankW(), tankH(), tankDepth()); gl.uniform1f(u.uRelief, TERR_RELIEF);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, terrHeightTex); gl.uniform1i(u.uHeight, 0);
    gl.uniform1i(u.uFloor, 0); gl.drawArrays(gl.POINTS, 0, SNOW_N);
    gl.disable(gl.BLEND); gl.depthMask(true); gl.depthFunc(gl.LESS);
  }
  if (terrainVertCount && !(window.ENVX && ENVX.hides('terrain'))) {   // contour lines over the seabed relief, rising gold out of the teal
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(terrainProg.p); gl.bindVertexArray(terrainVAO);
    gl.uniformMatrix4fv(terrainProg.u.uVP, false, cam.vp); gl.uniform1f(terrainProg.u.uShift, cam.shift); gl.uniform1f(terrainProg.u.uShiftX, cam.shiftX);
    gl.drawArrays(gl.LINES, 0, terrainVertCount);
    gl.disable(gl.BLEND); gl.depthMask(true); gl.depthFunc(gl.LESS);
  }
  if (sim.carcasses.length) {
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(carcassProg.p); gl.bindVertexArray(quadVAO);
    const cu = carcassProg.u;
    gl.uniformMatrix4fv(cu.uVP, false, cam.vp); gl.uniform1f(cu.uShift, cam.shift); gl.uniform1f(cu.uShiftX, cam.shiftX); gl.uniform1f(cu.uRefDist, cam.refDist);
    gl.uniform1f(cu.uOrtho, S.projection === 'ortho' ? 1 : 0);
    gl.uniform1f(cu.uPx, 9 * dpr);
    for (const c of sim.carcasses) { gl.uniform3f(cu.uPos, c.x, c.y, c.z * tankDepth()); gl.uniform1f(cu.uLife, c.life); gl.drawArrays(gl.POINTS, 0, 1); }
    gl.disable(gl.BLEND); gl.depthMask(true); gl.depthFunc(gl.LESS);
  }
  if (showCloud) {
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    cloudPass(S.mode === 'both' ? 0.45 : 0.75);
    gl.disable(gl.BLEND); gl.depthMask(true); gl.depthFunc(gl.LESS);
  }

  if (S.shimmer > 0 && showSigil) {
    gl.depthMask(false); gl.depthFunc(gl.LEQUAL); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    common(ptProg, 0, 1); gl.uniform1f(ptProg.u.uAlpha, S.shimmer);
    fishPass(ptProg, 'ptsVAO', gl.POINTS);
  }

  if (S.glow > 0) {
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(glowCompProg.p); gl.bindVertexArray(quadVAO);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, glowA.tex);
    gl.uniform1i(glowCompProg.u.uTex, 0); gl.uniform1f(glowCompProg.u.uGain, S.glow * 1.1 * (styled() ? curStyle.atmo.bloom : 1));   // the recipe's bloom: Route Zero's is a lit window's glow, not neon
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  gl.disable(gl.BLEND); gl.depthMask(true);
  window.ENVX && ENVX.over(t);   // a set piece's water surface, light shafts, vignette and the dip between shots

  // blit the (possibly trailing) scene from the persistent buffer onto the real canvas
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
  gl.useProgram(compProg.p); gl.bindVertexArray(quadVAO);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, trailBuf.tex);
  gl.uniform1i(compProg.u.uTex, 0); gl.uniform1f(compProg.u.uGain, 1.0);
  gl.uniform1f(compProg.u.uGrainAmt, styled() ? S.routeGrain : 0); gl.uniform1f(compProg.u.uVigAmt, styled() ? S.routeVignette : 0); gl.uniform1f(compProg.u.uTime, t);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
}
