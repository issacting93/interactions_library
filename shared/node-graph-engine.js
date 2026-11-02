/* INTERACTIONS — Forge Graph adapter.
   Binds this repo's own node-type contract to litegraph.js (vendored via CDN in the page, NOT
   bundled here — https://github.com/jagenjo/litegraph.js). Litegraph owns graph topology, pan/
   zoom, wiring, cycle-safety and serialization; this module only adds the three things it doesn't
   know about:
     - ForgeGraph.registerType(def): turns a {id,category,label,inputs,outputs,params,palette,
       generate,renderInto} definition into a real LiteGraph node class (addInput/addOutput/
       addProperty/addWidget, onExecute, onDrawBackground).
     - ForgeGraph.toCanvas(output, onReady): normalizes {kind:'canvas'|'svg', value} into an
       HTMLCanvasElement, so an SVG-output node and a canvas-output node can both feed a
       Composite node the same way. SVG rasterization is async (Image decode), so this caches by
       SVG string and calls onReady() once a new rasterization lands — callers that can't wait
       just get null back for that tick and try again next tick.
     - Per-node seed derivation from one graph-level seed, via shared/rng.js.

   generate(resolvedInputs, params, seedNum) must be side-effect-free from the graph's point of
   view: it returns a value, it doesn't paint onto a shared canvas the way tools/city_gen/
   Naqsh Forge.html's hand-rolled node graph does (that approach works but means a node has no
   output independent of the paint call — this fixes that for a graph that needs to mix canvas,
   SVG, and eventually other output kinds).

   Known limitation: a node immediately downstream of an SVG-output node can't tell when that
   SVG's async rasterization (toCanvas above) finishes, since the upstream output object's
   identity doesn't change once the rasterized canvas lands in the cache — only its contents do.
   A node def that consumes canvas-kind inputs which might be SVG-sourced should set
   `alwaysRegenerate: true` on its definition so it re-pulls fresh pixels every tick instead of
   trusting the cache key; this tool's Pixel FX and Composite/Output nodes do this. Cheap for the
   handful of small canvases this tool composites; a much larger graph would want real
   invalidation instead.

   Classic script (not a module), so it also works from file://. Load order:
     <script src="https://cdn.jsdelivr.net/npm/litegraph.js/build/litegraph.js"></script>
     <script src="../../shared/rng.js"></script>
     <script src="../../shared/node-graph-engine.js"></script>
     (then the generator engines, then the page's own ForgeGraph.registerType calls)
*/
(function () {
  'use strict';

  const PREVIEW = 220; // px — internal working size for every node's preview/compositing canvas
  const svgCache = new Map(); // svg string -> rasterized HTMLCanvasElement
  const svgPending = new Set();

  function rasterizeSVG(svg, onReady) {
    if (svgCache.has(svg)) return svgCache.get(svg);
    if (!svgPending.has(svg)) {
      svgPending.add(svg);
      const img = new Image();
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      img.onload = function () {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || PREVIEW;
        c.height = img.naturalHeight || PREVIEW;
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        svgCache.set(svg, c);
        svgPending.delete(svg);
        URL.revokeObjectURL(url);
        if (onReady) onReady(c);
      };
      img.onerror = function () { svgPending.delete(svg); URL.revokeObjectURL(url); };
      img.src = url;
    }
    return null; // not ready this tick
  }

  function toCanvas(output, onReady) {
    if (!output) return null;
    if (output.kind === 'canvas') return output.value;
    if (output.kind === 'svg') return rasterizeSVG(output.value, onReady);
    return null;
  }

  // Default renderInto, used when a node def doesn't supply its own: draws the output into the
  // given 2D context at [0,0,w,h]. A pending SVG rasterization draws a "generating…" placeholder
  // and repaints once ready (graph.setDirtyCanvas keeps litegraph from needing a manual poke).
  function defaultRenderInto(ctx, output, w, h, onReadyRepaint) {
    const c = toCanvas(output, onReadyRepaint);
    if (c) {
      ctx.drawImage(c, 0, 0, c.width, c.height, 0, 0, w, h);
    } else {
      ctx.fillStyle = '#222';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#666';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(output ? 'rendering…' : 'no output', w / 2, h / 2);
    }
  }

  let graphSeed = 'forge';
  function setSeed(s) { graphSeed = String(s); }
  function getSeed() { return graphSeed; }

  // A plain numeric seed per node (and per preset slot, if the node has one) — individual node
  // defs build whatever RNG shape their engine wants (a raw number for CityWFC/NAQSH, a callable
  // via RNG.mulberry32(seedNum) for Xenoglyph) from this.
  function seedFor(nodeId, salt) {
    const h = window.RNG.xmur3(graphSeed + '::' + nodeId + '::' + (salt || 0));
    return h() >>> 0;
  }

  function widgetFor(node, p) {
    const label = p.label || p.id;
    if (p.type === 'select') {
      const values = (p.opts || []).map(o => o[0]);
      const labels = {};
      (p.opts || []).forEach(o => { labels[o[0]] = o[1] || o[0]; });
      node.addWidget('combo', label, node.properties[p.id], (v) => { node.properties[p.id] = v; node._dirty = true; },
        { values: () => values, values_label: labels });
    } else if (p.type === 'check') {
      node.addWidget('toggle', label, !!node.properties[p.id], (v) => { node.properties[p.id] = v; node._dirty = true; });
    } else {
      node.addWidget('slider', label, node.properties[p.id], (v) => { node.properties[p.id] = v; node._dirty = true; },
        { min: p.min != null ? p.min : 0, max: p.max != null ? p.max : 1, step: p.step || 1 });
    }
  }

  function registerType(def) {
    const params = def.params || [];
    const inputs = def.inputs || [];
    const outputs = def.outputs || [];
    const palette = def.palette || [];

    function ForgeNode() {
      this.properties = {};
      params.forEach(p => { this.properties[p.id] = p.v; });
      this.properties.seed = 1;

      inputs.forEach(inp => this.addInput(inp.name, inp.kind));
      outputs.forEach(out => this.addOutput(out.name, out.kind));

      if (palette.length) {
        const labels = palette.map(p => p.label);
        this.addWidget('combo', 'preset', labels[0], (label) => {
          const preset = palette.find(p => p.label === label);
          if (!preset) return;
          Object.assign(this.properties, preset.params || {});
          if (preset.seed != null) this.properties.seed = preset.seed;
          this._dirty = true;
        }, { values: labels });
      }
      params.forEach(p => widgetFor(this, p));
      this.addWidget('button', 'reseed', null, () => {
        this.properties.seed = (Math.random() * 1e9) | 0;
        this._dirty = true;
      });

      const widgetRows = params.length + (palette.length ? 1 : 0) + 1;
      this._previewTop = widgetRows * (LiteGraph.NODE_WIDGET_HEIGHT + 4) + 8;
      this.size = [PREVIEW + 20, this._previewTop + PREVIEW + 12];

      this._cacheKey = null;
      this._lastInputs = {};
      this._output = null;
      this._dirty = true;
    }

    ForgeNode.title = def.label;
    ForgeNode.desc = def.label;
    if (def.category) ForgeNode.category = def.category;

    ForgeNode.prototype.onExecute = function () {
      const resolved = {};
      let inputsChanged = false;
      inputs.forEach((inp, i) => {
        const v = this.getInputData(i);
        if (this._lastInputs[inp.name] !== v) inputsChanged = true;
        this._lastInputs[inp.name] = v;
        resolved[inp.name] = v;
      });

      const key = JSON.stringify(this.properties);
      if (def.alwaysRegenerate || inputsChanged || this._cacheKey !== key || this._dirty) {
        this._cacheKey = key;
        this._dirty = false;
        const seedNum = seedFor(this.id, this.properties.seed);
        try {
          this._output = def.generate(resolved, this.properties, seedNum) || null;
        } catch (e) {
          console.error('[ForgeGraph] generate() failed for', def.id, e);
          this._output = null;
        }
        // litegraph only repaints a node's onDrawBackground when the canvas is marked dirty —
        // new output from generate() doesn't do that on its own, so force one here.
        if (this.graph) this.graph.setDirtyCanvas(true, false);
      }

      outputs.forEach((out, i) => this.setOutputData(i, this._output));
    };

    ForgeNode.prototype.onDrawBackground = function (ctx) {
      if (this.flags.collapsed) return;
      const w = this.size[0] - 20, h = this.size[1] - this._previewTop - 12;
      ctx.save();
      ctx.translate(10, this._previewTop);
      ctx.fillStyle = '#0b0b0b';
      ctx.fillRect(0, 0, w, h);
      const repaint = () => this.graph && this.graph.setDirtyCanvas(true, false);
      if (def.renderInto) {
        try { def.renderInto(ctx, this._output, w, h); } catch (e) { /* keep graph usable */ }
      } else {
        defaultRenderInto(ctx, this._output, w, h, repaint);
      }
      ctx.restore();
    };

    LiteGraph.registerNodeType('forge/' + def.id, ForgeNode);
  }

  window.ForgeGraph = { registerType, toCanvas, setSeed, getSeed, seedFor, PREVIEW };
})();
