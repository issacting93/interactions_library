/* TAPE 08 Patch: core.
   Data model, geometry, formatting and graph analysis shared by every component.
   Ported from the "Patch — node graph effect builder" mockup (Patch.dc.html).
   Classic script: defines window.Patch so pages also work from file://. */
(function () {
  'use strict';

  // ── colours (mirror shared/tape08-tokens.css; SVG attributes can't read CSS vars) ──
  const C = {
    ground: '#161618', panel: '#1D1D20', canvas: '#1A1A1D',
    ink: '#ECE8DE', ink2: '#8C8981', dim: '#8A877F',
    line2: 'rgba(236,232,222,0.10)', line4: 'rgba(236,232,222,0.16)',
    accent: '#E8B04A', rec: '#FF4D5E', loop: '#5BE39A', solo: '#5CC8E0'
  };
  const R = C.ink2;

  // ── node types ──
  const T = {
    input:    { name: 'INPUT', cat: 'SOURCE', ins: [], outs: ['OUT'], color: C.ink, params: [['GAIN', 'db', 0.67]], role: 'Live device input. One per engine; feeds the patch.', fixed: true },
    track:    { name: 'TRK 01', cat: 'SOURCE', ins: [], outs: ['OUT'], color: '#FF5A6A', params: [['LEVEL', 'db', 0.67]], role: 'Plays the clips of one track. Here it keys the compressor.' },
    metro:    { name: 'METRONOME', cat: 'SOURCE', ins: [], outs: ['OUT'], color: '#CFC8B8', params: [['LEVEL', 'db', 0.5]], role: 'Click generator, locked to tempo.' },
    output:   { name: 'OUTPUT', cat: 'SINK', ins: ['IN'], outs: [], color: C.ink, params: [['LEVEL', 'db', 0.67]], role: 'Final sink. Everything you hear passes through here.', fixed: true },
    splitter: { name: 'SPLITTER', cat: 'ROUTING', ins: ['IN'], outs: ['A', 'B'], color: R, params: [], role: 'Duplicates one signal to parallel paths.' },
    mixer:    { name: 'MIXER', cat: 'ROUTING', ins: ['1', '2', '3'], outs: ['OUT'], color: R, params: [['LEVEL', 'db', 0.67]], role: 'Sums its inputs. Use it to rejoin parallel paths or close a feedback loop.' },
    crossover:{ name: 'CROSSOVER', cat: 'ROUTING', ins: ['IN'], outs: ['LO', 'MID', 'HI'], color: R, params: [['LO/MID', 'hz', 0.33], ['MID/HI', 'hz', 0.7]], role: 'Splits the signal into three bands for multiband processing.' },
    drywet:   { name: 'DRY / WET', cat: 'ROUTING', ins: ['DRY', 'WET'], outs: ['OUT'], color: R, params: [['MIX', 'pct', 0.5]], role: 'Blends a dry and a processed path.' },
    send:     { name: 'SEND', cat: 'ROUTING', ins: ['IN'], outs: ['BUS'], color: R, params: [['AMT', 'pct', 0.4]], role: 'Sends to a shared bus that a RETURN picks up.' },
    ret:      { name: 'RETURN', cat: 'ROUTING', ins: [], outs: ['OUT'], color: R, params: [['LEVEL', 'db', 0.67]], role: 'Brings a bus back into the patch.' },
    gain:     { name: 'GAIN', cat: 'PROCESS', ins: ['IN'], outs: ['OUT'], color: C.ink, params: [['GAIN', 'db', 0.67], ['PAN', 'pan', 0.5]], role: 'Volume and pan for one path.' },
    effect:   { name: 'TAPE SAT', cat: 'EFFECT', ins: ['IN'], outs: ['OUT'], color: '#FF8A3D', params: [['DRIVE', 'db', 0.83], ['MIX', 'pct', 1]], role: 'Wraps any FX module. Here: tape saturation.', bypass: true },
    delay:    { name: 'DELAY', cat: 'EFFECT', ins: ['IN'], outs: ['OUT'], color: '#A98BFF', params: [['TIME', 'ms', 0.35], ['FDBK', 'pct', 0.45]], role: 'Delay line. Its block of latency is what makes a feedback loop legal.', bypass: true, lat: 128, breaks: true },
    comp:     { name: 'COMPRESSOR', cat: 'EFFECT', ins: ['IN', 'SC'], outs: ['OUT'], color: '#6F8CFF', params: [['THRESH', 'db', 0.45], ['RATIO', 'ratio', 0.16]], role: 'Sidechain compressor. The square SC port takes one key signal.', bypass: true, lat: 64 },
    limiter:  { name: 'LIMITER', cat: 'EFFECT', ins: ['IN'], outs: ['OUT'], color: C.ink, params: [['CEIL', 'db', 0.64]], role: 'Peak limiter for the end of a chain.', bypass: true, lat: 32 },
    tap:      { name: 'TAP', cat: 'UTILITY', ins: ['IN'], outs: ['OUT', 'TAP'], color: R, params: [], role: 'Passes audio through and copies it to a meter or recorder.' }
  };
  const LIB = [
    ['SOURCES', ['input', 'track', 'metro', 'ret']],
    ['ROUTING', ['splitter', 'mixer', 'crossover', 'drywet', 'send']],
    ['EFFECTS', ['effect', 'delay', 'comp', 'limiter']],
    ['UTILITY', ['gain', 'tap']]
  ];

  // ── canvas geometry ──
  const W = 132, CW = 900, CH = 600;

  // ── cable kinds ──
  const KC = { audio: 'rgba(236,232,222,0.6)', sc: C.solo, feedback: C.loop, illegal: C.rec };
  const KIND_LABEL = { audio: 'AUDIO', sc: 'SIDECHAIN', feedback: 'FEEDBACK', illegal: 'ILLEGAL LOOP' };
  const KIND_NOTE = {
    audio: 'Audio cable. If this input has other cables, they are summed.',
    sc: 'Sidechain key. This port accepts one cable; patching another replaces it.',
    feedback: 'Part of a feedback loop. Legal because the loop passes through a DELAY, which adds one block of latency.',
    illegal: 'This cable closes a loop with no DELAY in it. Add a DELAY node to the loop or disconnect it.'
  };

  // Node height and port row y, from the node's type.
  function geom(type) {
    const d = T[type];
    const rows = Math.max(d.ins.length, d.outs.length, 1);
    const knobH = d.params.length ? 56 : 0;
    return { h: 36 + rows * 22 + 12 + knobH + 4, py: (k) => 36 + 12 + k * 22 + 6 };
  }

  // Display value for a normalised 0–1 parameter.
  function fmt(kind, v) {
    if (kind === 'db') { const x = -24 + v * 36; return (x > 0.05 ? '+' : x < -0.05 ? '−' : '') + Math.abs(x).toFixed(1) + 'dB'; }
    if (kind === 'pct') return Math.round(v * 100) + '%';
    if (kind === 'ms') return Math.round(1 + v * v * 1999) + 'ms';
    if (kind === 'ratio') return (1 + v * 19).toFixed(1) + ':1';
    if (kind === 'hz') { const f = 20 * Math.pow(1000, v); return f >= 1000 ? (f / 1000).toFixed(1) + 'k' : Math.round(f) + ''; }
    if (kind === 'pan') return v < 0.48 ? 'L' + Math.round((0.5 - v) * 200) : v > 0.52 ? 'R' + Math.round((v - 0.5) * 200) : 'C';
    return v.toFixed(2);
  }
  // Where a knob's value arc starts: 0 dB, centre pan, or the bottom of the sweep.
  function zero(kind) { return kind === 'db' ? 24 / 36 : kind === 'pan' ? 0.5 : 0; }

  // Arc on the 270° knob sweep, in a 44×44 box.
  function arcPath(a, b) {
    if (Math.abs(b - a) < 0.002) return 'M0 0';
    const lo = Math.min(a, b), hi = Math.max(a, b), r = 18;
    const s = (135 + 270 * lo) * Math.PI / 180, e = (135 + 270 * hi) * Math.PI / 180;
    return 'M' + (22 + r * Math.cos(s)).toFixed(2) + ' ' + (22 + r * Math.sin(s)).toFixed(2) +
      ' A18 18 0 ' + (270 * (hi - lo) > 180 ? 1 : 0) + ' 1 ' +
      (22 + r * Math.cos(e)).toFixed(2) + ' ' + (22 + r * Math.sin(e)).toFixed(2);
  }
  function knobGeom(kind, v) {
    const a = (135 + 270 * v) * Math.PI / 180;
    return { track: arcPath(0, 1), arc: arcPath(zero(kind), v), px: (22 + 10 * Math.cos(a)).toFixed(2), py: (22 + 10 * Math.sin(a)).toFixed(2) };
  }

  // Horizontal-tangent bezier from an output port to an input port.
  function cablePath(x1, y1, x2, y2) {
    const dx = Math.max(50, Math.abs(x2 - x1) * 0.5);
    return 'M' + x1 + ' ' + y1 + ' C' + (x1 + dx) + ' ' + y1 + ' ' + (x2 - dx) + ' ' + y2 + ' ' + x2 + ' ' + y2;
  }

  // Classify every cable, then topo-sort with feedback cut at each DELAY.
  function analyse(nodes, edges) {
    const byId = {}; nodes.forEach((n) => { byId[n.id] = n; });
    const isDelay = (id) => byId[id] && T[byId[id].type].breaks;
    const reach = (from, to, skipDelay) => {
      const seen = new Set([from]); const st = [from];
      while (st.length) {
        const u = st.pop(); if (u === to) return true;
        edges.forEach((e) => { if (e.a === u && !seen.has(e.b) && !(skipDelay && isDelay(e.b) && e.b !== to)) { seen.add(e.b); st.push(e.b); } });
      }
      return false;
    };
    const kind = {};
    edges.forEach((e) => {
      const inCycle = reach(e.b, e.a, false);
      const illegal = inCycle && !isDelay(e.a) && !isDelay(e.b) && reach(e.b, e.a, true);
      kind[e.id] = illegal ? 'illegal' : inCycle ? 'feedback' : (T[byId[e.b].type].ins[e.bp] === 'SC' ? 'sc' : 'audio');
    });
    const live = edges.filter((e) => !(kind[e.id] === 'feedback' && isDelay(e.a)));
    const indeg = {}; nodes.forEach((n) => { indeg[n.id] = 0; });
    live.forEach((e) => { indeg[e.b]++; });
    const q = nodes.filter((n) => indeg[n.id] === 0).map((n) => n.id).sort((a, b) => byId[a].x - byId[b].x || byId[a].y - byId[b].y);
    const order = []; const lat = {}; nodes.forEach((n) => { lat[n.id] = 0; });
    while (q.length) {
      const u = q.shift(); order.push(u);
      lat[u] += (T[byId[u].type].lat || 0) * (byId[u].on ? 1 : 0);
      live.forEach((e) => { if (e.a === u) { lat[e.b] = Math.max(lat[e.b], lat[u]); if (--indeg[e.b] === 0) q.push(e.b); } });
    }
    const outNode = nodes.find((n) => n.type === 'output');
    const kinds = Object.values(kind);
    return { kind, order, lat, pdc: outNode ? lat[outNode.id] : 0, illegal: kinds.includes('illegal'), feedback: kinds.includes('feedback') };
  }

  // Everything a view needs that isn't stored: analysis, lookups, labels.
  function derive(s) {
    const A = analyse(s.nodes, s.edges);
    const byId = {}; s.nodes.forEach((n) => { byId[n.id] = n; });
    const orderIdx = {}; A.order.forEach((id, i) => { orderIdx[id] = i + 1; });
    return { A, byId, orderIdx };
  }
  const label = (n) => n.name || T[n.type].name;
  const pad2 = (i) => String(i).padStart(2, '0');
  const orderTag = (D, id) => D.orderIdx[id] ? pad2(D.orderIdx[id]) : '!';
  // Grey routing nodes draw their knobs in ink so the arc stays visible.
  const knobColor = (c) => c === C.ink2 ? C.ink : c;

  // ── patch state ──
  function mkNode(id, type, x, y, over, name) {
    return { id, type, x, y, on: true, name: name || null, p: Object.assign({}, ...T[type].params.map(([k, , v]) => ({ [k]: v })), over || {}) };
  }
  function defaultPatch() {
    return {
      nodes: [
        mkNode('n1', 'input', 12, 70), mkNode('n2', 'track', 12, 420), mkNode('n3', 'splitter', 162, 70),
        mkNode('n4', 'gain', 312, 10, {}, 'CLEAN'), mkNode('n5', 'effect', 312, 210, {}, 'DIRT'), mkNode('n6', 'mixer', 462, 110),
        mkNode('n7', 'gain', 462, 420, { GAIN: 0.55 }, 'FDBK'), mkNode('n8', 'delay', 612, 60), mkNode('n9', 'comp', 762, 170), mkNode('n10', 'output', 762, 430)
      ],
      edges: [
        { id: 'e1', a: 'n1', ap: 0, b: 'n3', bp: 0 }, { id: 'e2', a: 'n3', ap: 0, b: 'n4', bp: 0 }, { id: 'e3', a: 'n3', ap: 1, b: 'n5', bp: 0 },
        { id: 'e4', a: 'n4', ap: 0, b: 'n6', bp: 0 }, { id: 'e5', a: 'n5', ap: 0, b: 'n6', bp: 1 }, { id: 'e6', a: 'n6', ap: 0, b: 'n8', bp: 0 },
        { id: 'e7', a: 'n8', ap: 0, b: 'n7', bp: 0 }, { id: 'e8', a: 'n7', ap: 0, b: 'n6', bp: 2 }, { id: 'e9', a: 'n8', ap: 0, b: 'n9', bp: 0 },
        { id: 'e10', a: 'n2', ap: 0, b: 'n9', bp: 1 }, { id: 'e11', a: 'n9', ap: 0, b: 'n10', bp: 0 }
      ],
      nextId: 11
    };
  }
  function initialState(over) {
    return Object.assign({ title: 'DIRT LOOP', sel: { kind: 'node', id: 'n8' }, pending: null, audition: false, toast: '', toastC: C.ink2, added: 0 }, defaultPatch(), over || {});
  }

  function createStore(init) {
    let s = init; const subs = new Set();
    return {
      get: () => s,
      set(patch) { s = Object.assign({}, s, typeof patch === 'function' ? patch(s) : patch); subs.forEach((f) => f(s)); },
      subscribe(f) { subs.add(f); return () => subs.delete(f); }
    };
  }

  // Every user intent in the patch, as functions over a store.
  function createActions(store) {
    const get = store.get, set = store.set.bind(store);
    let toastTimer = 0;
    const mapNode = (id, f) => get().nodes.map((x) => x.id === id ? Object.assign({}, x, f(x)) : x);
    const a = {
      toast(t, c) { clearTimeout(toastTimer); set({ toast: t, toastC: c || C.ink2 }); toastTimer = setTimeout(() => set({ toast: '' }), 2600); },
      select(sel) { set({ sel, pending: null }); },
      clearSelection() { set({ sel: null, pending: null }); },
      clickOut(nodeId, port) {
        const p = get().pending;
        set({ pending: p && p.node === nodeId && p.port === port ? null : { node: nodeId, port } });
      },
      clickIn(nodeId, port) {
        const s = get(), p = s.pending;
        if (!p) { const e = s.edges.find((x) => x.b === nodeId && x.bp === port); if (e) set({ sel: { kind: 'edge', id: e.id } }); return; }
        if (p.node === nodeId) { set({ pending: null }); return; }
        const isSC = T[s.nodes.find((n) => n.id === nodeId).type].ins[port] === 'SC';
        let edges = s.edges.filter((e) => !(isSC && e.b === nodeId && e.bp === port));
        if (edges.some((e) => e.a === p.node && e.ap === p.port && e.b === nodeId && e.bp === port)) { set({ pending: null }); return; }
        const id = 'e' + s.nextId;
        set({ edges: edges.concat({ id, a: p.node, ap: p.port, b: nodeId, bp: port }), nextId: s.nextId + 1, pending: null, sel: { kind: 'edge', id } });
      },
      addNode(type) {
        const s = get(), d = T[type];
        if (d.fixed && s.nodes.some((n) => n.type === type)) { a.toast('ONLY ONE ' + d.name + ' PER PATCH', C.rec); return; }
        const k = s.added % 6, id = 'n' + s.nextId;
        set({ nodes: s.nodes.concat(mkNode(id, type, 180 + k * 46, 440 - (k % 3) * 18)), nextId: s.nextId + 1, added: s.added + 1, sel: { kind: 'node', id } });
      },
      moveNode(id, x, y) { set({ nodes: mapNode(id, () => ({ x, y })) }); },
      toggleNode(id) { set({ nodes: mapNode(id, (x) => ({ on: !x.on })) }); },
      setParam(id, k, v) { set({ nodes: mapNode(id, (x) => ({ p: Object.assign({}, x.p, { [k]: v }) })) }); },
      removeNode(id) { const s = get(); set({ nodes: s.nodes.filter((x) => x.id !== id), edges: s.edges.filter((e) => e.a !== id && e.b !== id), sel: null }); },
      removeEdge(id) { set({ edges: get().edges.filter((e) => e.id !== id), sel: null }); },
      toggleAudition() { set({ audition: !get().audition }); },
      saveFx() {
        const s = get();
        if (analyse(s.nodes, s.edges).illegal) a.toast('FIX THE ILLEGAL LOOP BEFORE SAVING', C.rec);
        else a.toast('SAVED “' + s.title + '” TO THE FX LIBRARY', C.loop);
      },
      reset() { set(Object.assign({ sel: null, pending: null }, defaultPatch())); }
    };
    return a;
  }

  // ── tiny DOM builder: h('div', {class, style, onClick}, ...children) ──
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SVG_TAGS = new Set(['svg', 'path', 'circle', 'line', 'rect', 'g']);
  function h(tag, props, ...kids) {
    const el = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
    for (const k in props || {}) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'style' && typeof v === 'object') { for (const sk in v) el.style.setProperty(sk.startsWith('--') ? sk : sk.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), v[sk]); }
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    kids.flat(Infinity).forEach((c) => { if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return el;
  }

  // ── motion (anime.js v4, vendor/anime.umd.min.js) ──
  // Every tween goes through animate(). If anime.js is missing or the viewer
  // prefers reduced motion, the end state is applied at once instead.
  const reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const RESERVED = new Set(['duration', 'delay', 'ease', 'loop', 'alternate', 'autoplay', 'composition', 'modifier', 'frameRate', 'playbackRate',
    'onBegin', 'onUpdate', 'onRender', 'onLoop', 'onComplete', 'onPause']);
  function moving() { return !!window.anime && !(reduceMQ && reduceMQ.matches); }
  function animate(target, params) {
    if (moving()) return window.anime.animate(target, params);
    const isEl = target && target.nodeType === 1;
    for (const k in params) {
      if (RESERVED.has(k)) continue;
      let v = params[k]; if (Array.isArray(v)) v = v[v.length - 1];
      if (typeof v === 'function') continue;
      if (isEl) { if (k === 'opacity') target.style.opacity = ''; else target.style.transform = ''; }
      else target[k] = v;
    }
    if (params.onUpdate) params.onUpdate();
    if (params.onComplete) params.onComplete();
    return null;
  }
  function stop(target) { if (window.anime) window.anime.remove(target); }
  // A spring that settles in roughly `ms`; bounce 0 = critically damped.
  function spring(bounce, ms) { return window.anime ? window.anime.spring({ bounce: bounce, duration: ms }) : 'outQuad'; }
  function stagger(ms, o) { return window.anime ? window.anime.stagger(ms, o) : 0; }
  function fadeOut(el, done) {
    animate(el, { opacity: [1, 0], scale: [1, 0.94], duration: 220, ease: 'inQuad', onComplete: () => { el.remove(); if (done) done(); } });
  }
  // Quick "it registered" bump for anything you tap.
  function pop(el, amt) { animate(el, { scale: [amt || 1.3, 1], duration: 520, ease: spring(0.45, 520) }); }

  window.Patch = {
    C, T, LIB, W, CW, CH, KC, KIND_LABEL, KIND_NOTE,
    geom, fmt, zero, arcPath, knobGeom, cablePath, analyse, derive, label, pad2, orderTag, knobColor,
    mkNode, defaultPatch, initialState, createStore, createActions, h,
    moving, animate, stop, spring, stagger, fadeOut, pop,
    ui: {}
  };
})();
