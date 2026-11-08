/* shared/engine/mechanisms/watch.js — "is anyone looking at this?"
   A mechanism, not a look: it decides when a thing is watched and says so. It draws nothing and
   knows no colours, so any piece can use it in any style (a weeping angel that freezes when
   watched, an iris that closes, a dial that only turns when you look away).

   Watched means the viewer's attention is on the thing:
     mouse    the pointer is over it (with a little slack before it counts as looking away)
     touch    a finger is held on the screen; lifting it is looking away
     blink    holding the blink key (Space by default) closes your eyes, even with the pointer on it
   Not watched: the pointer is elsewhere or has left the page, the tab is hidden, or nobody has
   looked yet.
   Other senses can take over: w.feed(name, true|false) adds a source (a camera, a sensor, another
   program); while any source is fed, the pointer no longer counts and the thing is watched when any
   source says so. w.feed(name, null) removes it. w.look(x, y) moves the gaze without a pointer.

     const w = Watch.create(stageEl, { hit: (x, y) => bool, slack: 1.15, blinkKey: " " });
     w.watched            -> true | false
     w.since              -> seconds in the current state
     w.gaze               -> { x, y } last place the viewer looked, in stageEl px (null before any)
     w.glances            -> how many times the viewer has looked away
     w.on("change", fn)   -> fn(watched, w) whenever it flips
     w.tick(dt)           -> call once a frame (advances `since`)
     w.feed(name, v)      -> an outside source says watched (true) or not (false); null removes it
     w.look(x, y)         -> where an outside source says the viewer is, in stageEl px
     w.destroy()

   `hit(x, y, wide)` gets stage px; `wide` is true while already watched, so a piece can test
   against a slightly bigger shape before it lets go (hysteresis), e.g. radius * slack.
   Classic script, no dependencies. */
(function () {
  "use strict";

  function create(el, opts) {
    opts = Object.assign({ hit: () => true, blinkKey: " ", touchHolds: true }, opts || {});
    const fns = { change: [] };
    const w = { watched: false, since: 0, gaze: null, glances: 0, blinking: false, pointerIn: false };
    let fingers = 0, hidden = document.hidden;
    const fed = new Map();   // outside sources: name -> true | false

    function local(e) { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function decide() {
      let on = false;
      if (fed.size) on = !hidden && !w.blinking && [...fed.values()].some(Boolean);
      else if (!hidden && !w.blinking && w.gaze) {
        if (fingers > 0) on = true;
        else if (w.pointerIn) on = !!opts.hit(w.gaze.x, w.gaze.y, w.watched);
      }
      if (on !== w.watched) {
        w.watched = on; w.since = 0;
        if (!on) w.glances++;
        fns.change.forEach((f) => f(on, w));
      }
    }

    const onMove = (e) => { if (e.pointerType === "touch" && !fingers) return; w.gaze = local(e); w.pointerIn = true; decide(); };
    const onDown = (e) => { w.gaze = local(e); w.pointerIn = true; if (e.pointerType === "touch" && opts.touchHolds) fingers++; decide(); };
    const onUp = (e) => { if (e.pointerType === "touch") { fingers = Math.max(0, fingers - 1); if (!fingers) w.pointerIn = false; } decide(); };
    const onLeave = (e) => { if (e.pointerType !== "touch") { w.pointerIn = false; decide(); } };
    const onVis = () => { hidden = document.hidden; decide(); };
    // focus is not attention (a piece inside an iframe never gets it), but a blur drops held fingers and a held blink
    const onBlur = () => { fingers = 0; w.blinking = false; decide(); };
    const onFocus = () => decide();
    const onKey = (e) => {
      if (!opts.blinkKey || e.key !== opts.blinkKey || /INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement && document.activeElement.tagName)) return;
      e.preventDefault();
      const b = e.type === "keydown";
      if (b !== w.blinking) { w.blinking = b; decide(); }
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    el.addEventListener("pointerleave", onLeave);
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);

    w.on = (name, fn) => { (fns[name] = fns[name] || []).push(fn); return w; };
    w.tick = (dt) => { w.since += dt; };
    w.feed = (name, v) => { if (v === null || v === undefined) fed.delete(name); else fed.set(name, !!v); decide(); return w; };
    w.look = (x, y) => { w.gaze = { x, y }; };
    w.sources = () => [...fed.keys()];
    w.refresh = decide; // call if the hit shape moved under a still pointer
    w.destroy = () => {
      el.removeEventListener("pointermove", onMove); el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp); window.removeEventListener("pointercancel", onUp);
      el.removeEventListener("pointerleave", onLeave); document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("visibilitychange", onVis); window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus); window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKey);
    };
    return w;
  }

  window.Watch = { create };
})();
