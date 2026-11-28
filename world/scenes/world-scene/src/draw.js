// world/scenes/world-scene/src/draw.js -- World Scene: One frame: the passes in order (terrain, towers, city, creatures, the hooks for World Scene's places), and the blit.
// One of the page's scripts, loaded in order (World Scene.html); they share their top-level names as one script did.

// ---------- draw ----------
// The creatures are drawn by the shared renderer (src/creatures.js -> packages/render/ecology-render.js), the code Specimen runs. This file
// draws the world round them: towers, city, terrain, a place's water and plants, snow, glow, and the final blit.
function draw(t) {
  if (S.glow > 0) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, glowA.fb); gl.viewport(0, 0, glowA.w, glowA.h);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.blendEquation(gl.MAX);   // overlapping bodies (tight schools, small dense shapes like wisp) take the brightest contribution instead of summing — plain additive blend let close-packed fish stack past white
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
  if (window.ENVX && ENVX.mossStone) ENVX.mossStone(true);   // a place's moss on the stone
  drawTowers(t, false);   // opaque: shares this pass's depth buffer with the fish above, so each occludes the other correctly
  drawCity(t, false);
  if (!window.NOSOLID) drawSolidTowers(t);   // a place's solid towers, in the shared creature renderer's stone
  if (window.ENVX && ENVX.mossStone) ENVX.mossStone(false);   // the tower panel's thumbnails share the program: none on them
  if (window.ENVX && ENVX.plants) ENVX.plants(t);   // a place's plants, in the same depth buffer
  drawCreatures(t);   // src/creatures.js: the shared renderer, in this pass's depth buffer with the towers, the city and the plants
  if (styled() && S.routeAtmo && atmoWorld) { routeAtmoCtx.recipe = curStyle; styleBands(); RouteAtmoGL2.drawSolid(gl, routeAtmoCtx, atmoWorld, cam); }   // ridge ring, pines, pilgrims -- opaque, shares this pass's depth buffer too
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
