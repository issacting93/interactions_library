// world/scenes/world-scene/places/check.js -- World Scene's ?check mode: on a real device, step through the places and report how each moves and
// looks (packages/ecology/scene-metrics.js), so what a phone shows is measured, not guessed from a headless browser that cannot finish building
// the 3D bodies. Open the page with ?check (every place) or ?check=garden,spires. Each place settles for a few seconds, is measured for six
// (real frames: fps, turns, bends, schools), and its frame is kept. The report shows red / amber / green per place; Copy gives the JSON to
// paste back into a chat. The last report is kept in localStorage 'forge:world-check'. The Camera tab's Check every place button starts it
// too (a link's ?query may not reach a page shown inside another, as an artifact is).
(function () {
  'use strict';
  const q = new URLSearchParams(location.search);
  const SETTLE = +(q.get('settle') || 3500), MEASURE = +(q.get('measure') || 6000);
  const css = `#wc{position:fixed;inset:auto 10px 10px 10px;max-height:72vh;overflow:auto;z-index:50;background:rgba(12,10,20,.94);color:#e8e4f0;font:12px/1.4 'JetBrains Mono',monospace;border:1px solid #3a3450;border-radius:10px;padding:10px 12px}
#wc h3{margin:0 0 6px;font-size:13px}#wc .row{display:grid;grid-template-columns:64px 1fr;gap:8px;padding:6px 0;border-top:1px solid #2a2438}#wc img{width:64px;border-radius:4px}
#wc .chip{display:inline-block;padding:0 6px;border-radius:8px;font-size:11px;margin-right:6px}#wc .fail{background:#8a2430}#wc .warn{background:#7a5a14}#wc .ok{background:#245a34}
#wc ul{margin:2px 0 0;padding-left:16px}#wc button{font:inherit;background:#2a2438;color:#e8e4f0;border:1px solid #4a4060;border-radius:6px;padding:4px 10px;margin:6px 6px 0 0}`;
  const box = () => { let b = document.getElementById('wc'); if (!b) { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); b = document.createElement('div'); b.id = 'wc'; document.body.appendChild(b); } return b; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  // which creatures to watch in a place: the rows that school or stream (6 or more), else the most numerous
  function watched(P) { const rows = (P && P.cast) || [], keys = new Set(rows.filter((r) => ['stream', 'school', 'formation', 'wild'].includes(r.role) && (r.n | 0) >= 6).map((r) => r.species));
    if (!keys.size && rows.length) keys.add(rows.slice().sort((a, b) => (b.n | 0) - (a.n | 0))[0].species); if (!P) keys.add('koi'); return [...keys]; }
  // measure for ms of real frames
  function measure(ms, keys) { return new Promise((done) => { const m = SceneMetrics.motion(sim, { species: keys }); let t0 = null, last = null, frames = 0;
    const tick = (now) => { if (t0 == null) { t0 = last = now; requestAnimationFrame(tick); return; } const dt = (now - last) / 1000; last = now; frames++; m.sample(Math.min(0.1, dt));
      if (now - t0 < ms) requestAnimationFrame(tick); else done({ motion: m.result(), fps: Math.round(frames / ((now - t0) / 1000)) }); };
    requestAnimationFrame(tick); }); }
  async function run() {
    while (!(window.ENVX && ENVX.places && window.SceneMetrics && typeof sim !== 'undefined')) await wait(300);
    if (!q.has('check')) { /* started by hand: already loaded */ } else await wait(2500);   // the parts and the first city
    ENVX.hidePanels && ENVX.hidePanels();
    const want = q.get('check'), ids = want ? want.split(',').filter((k) => ENVX.places[k]) : Object.keys(ENVX.places);
    const out = { when: new Date().toISOString(), ua: navigator.userAgent, screen: [innerWidth, innerHeight, devicePixelRatio], places: {} };
    const b = box(), momentsWas = ENVX.momentsOn; ENVX.momentsOn = false;   // the check measures calm swimming
    for (let i = 0; i < ids.length; i++) { const id = ids[i], P = ENVX.places[id];
      b.innerHTML = `<h3>Checking ${i + 1}/${ids.length}: ${esc((P && P.title) || id)}</h3><p>Settling, then measuring ${MEASURE / 1000}s. Keep the page in front.</p>`;
      ENVX.set(id); ENVX.setDirected && ENVX.setDirected(true); await wait(SETTLE);
      const rep = await measure(MEASURE, watched(ENVX.P)); rep.free = !ENVX.P || !!(ENVX.P.setting && ENVX.P.setting.life); rep.limits = (ENVX.P && ENVX.P.check) || null; rep.picture = SceneMetrics.picture(document.getElementById('c')); rep.issues = SceneMetrics.grade(rep);
      out.places[id] = rep; }
    try { const keepable = JSON.parse(JSON.stringify(out)); for (const k in keepable.places) delete keepable.places[k].picture.thumb; localStorage.setItem('forge:world-check', JSON.stringify(keepable)); } catch (e) { /* storage off */ }
    ENVX.momentsOn = momentsWas; show(out);
  }
  function show(out) {
    const b = box(), rows = Object.entries(out.places).map(([id, r]) => { const fails = r.issues.filter((x) => x.level === 'fail').length, warns = r.issues.length - fails;
      const chip = fails ? `<span class="chip fail">${fails} fail</span>` : warns ? `<span class="chip warn">${warns} warn</span>` : '<span class="chip ok">ok</span>';
      const mot = Object.entries(r.motion).map(([k, m]) => `${esc(k)}: turn ${m.turn95} · bend ${m.bend95} · align ${m.align} · groups ${m.groups}`).join('<br>');
      return `<div class="row"><img src="${r.picture.thumb}" alt=""><div><b>${esc((ENVX.places[id] && ENVX.places[id].title) || id)}</b> ${chip} ${r.fps} fps<br><small>${mot}</small>${r.issues.length ? '<ul>' + r.issues.map((x) => `<li>${esc(x.what)}: ${x.value} (limit ${x.limit})</li>`).join('') + '</ul>' : ''}</div></div>`; }).join('');
    b.innerHTML = `<h3>World Scene check</h3>${rows}<div><button id="wc-copy">Copy report</button><button id="wc-again">Run again</button><button id="wc-close">Close</button></div>`;
    const lean = () => { const o = JSON.parse(JSON.stringify(out)); for (const k in o.places) delete o.places[k].picture.thumb; return JSON.stringify(o); };
    document.getElementById('wc-copy').onclick = (e) => { const s = lean(); (navigator.clipboard ? navigator.clipboard.writeText(s) : Promise.reject()).then(() => { e.target.textContent = 'Copied'; }, () => { const t = document.createElement('textarea'); t.value = s; b.appendChild(t); t.select(); e.target.textContent = 'Select and copy below'; }); };
    document.getElementById('wc-again').onclick = () => { run(); };
    document.getElementById('wc-close').onclick = () => { b.remove(); };
  }
  window.WorldCheck = { run };   // the Camera tab's Check every place button
  if (q.has('check')) run();
})();
