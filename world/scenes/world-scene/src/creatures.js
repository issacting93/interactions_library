// world/scenes/world-scene/src/creatures.js -- World Scene: the creatures. They are drawn by the shared renderer
// (packages/render/ecology-render.js), the code Specimen runs: the same shaders, passes and looks. This page has no creature drawing of its
// own (it used to keep a copy, which drifted: Sigil, Both and Cloud). To change how a creature looks, change the renderer or its look
// (packages/kit/data/creature-looks.json), and every page follows.
//
// What World Scene gives it: the sim, its own camera (cam.vp, cam.eye, cam.dist) and, from the drawer's Draw, 3D (solid bodies, Specimen's
// defaults) or Lines (the drawing only). A place may restyle the creatures (ENVX.creatureStyle: its own looks and line settings).
let creatureRender = null,
  ecoLooksFor = null,
  ecoFillFor = null;
function drawCreatures(t) {
  const ER = window.EcologyRender;
  if (!ER) return;
  const ES0 = window.EcologySpeciesPristine || EcologySpecies;
  if (!creatureRender) {
    creatureRender = ER.create(canvas, ES0, { maxFish: MAX_FISH });
    creatureRender.ghostCap = 360;
  } // trails (a look's trail): at most 360 past poses in all
  const style = (window.ENVX && ENVX.creatureStyle && ENVX.creatureStyle()) || null; // { key, look(sp, saved), render, lines }
  // each species' look: the saved one (as Specimen shows it), or the place's
  const key = style ? style.key : 'saved';
  if (ecoLooksFor !== key) {
    ecoLooksFor = key;
    const CL = window.CreatureLooks || {};
    ES0.SPECIES.forEach((sp, i) => {
      const saved = CL[sp.key];
      ER.setLook(
        creatureRender,
        i,
        style && style.look ? style.look(sp, saved) : saved && saved.material !== 'own' ? saved : null
      );
    });
  }
  if (ecoFillFor !== key) {
    ecoFillFor = key;
    ES0.SPECIES.forEach((sp) => {
      // a place's own fill colours; the species' own come back where it sets none
      if (!sp.__col0) sp.__col0 = [sp.colHi, sp.colLo];
      const f = style && style.fill ? style.fill(sp) : null;
      sp.colHi = f ? f[0] : sp.__col0[0];
      sp.colLo = f ? f[1] : sp.__col0[1];
    });
  }
  if (style && style.grow) ES0.SPECIES.forEach((sp, i) => ER.setGrowth(creatureRender, i, style.grow(sp))); // stone creatures: how much the place grows on them now
  const solid = S.mode !== 'lines' && !(style && style.lines) && !!window.PartSolid;
  const shapes =
    window.CreatureShapes && Object.keys(window.CreatureShapes).length ? { shape: window.CreatureShapes } : undefined;
  const px = ((cam.dist || cam.refDist) * 2 * Math.tan(20 * DEG)) / Math.max(1, canvas.height); // one device pixel in tank units where the camera looks: a one-pixel line, as Specimen's
  ER.drawInto(creatureRender, {
    sim,
    time: t,
    vp: cam.vp,
    eye: cam.eye,
    refDist: cam.refDist,
    shift: cam.shift,
    shiftX: cam.shiftX,
    dpr,
    px,
    // Specimen's own settings (cores 1, the Shape tab's shapes, lit 1; Dark fish and Shimmer start at 0); backing: a see-through look over black, as Specimen shows it
    render: Object.assign(
      {
        cores: solid ? 1 : 0,
        core: shapes,
        coreWorker: window.ENVX && ENVX.manualOn ? false : undefined,
        wings: S.wings,
        iris: S.iris,
        irisMode: S.irisMode,
        shimmer: S.shimmer,
        dark: S.dark,
        lit: 1,
        backing: 1,
      },
      style && style.render
    ),
  });
  // the renderer leaves its own GL state: back to this page's
  gl.bindVertexArray(null);
  gl.useProgram(null);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LESS);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.CULL_FACE);
}
