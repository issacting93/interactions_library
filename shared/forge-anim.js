/*
 * Forge — shared animation helpers on top of anime.js (CDN, v3, loaded as a
 * classic global before this file on every page that needs it). Eased,
 * tasteful motion reserved for loading/transition feedback: leaving a stage,
 * a panel regenerating, a new Shelf card arriving, a save confirming.
 * Never used for instant state (selection highlight, hover, active rail
 * item, stale-dot blink) — those stay immediate/CSS-driven as elsewhere in
 * the app. Every function snaps straight to the end state instead of
 * animating when the user has prefers-reduced-motion set, or if anime.js
 * itself failed to load (CDN down shouldn't make the rail unusable).
 */
(function () {
  "use strict";
  const REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EASE = "easeOutQuad";

  function has() { return typeof window.anime === "function"; }

  // Fades the page out before a real navigation (location.href change).
  // Falls straight through to the navigation if anime.js is missing, the
  // animation throws, or the user prefers reduced motion — a broken fade
  // must never block leaving the page.
  function navigateWithFade(url) {
    if (REDUCED || !has()) { location.href = url; return; }
    let went = false;
    const go = () => { if (!went) { went = true; location.href = url; } };
    try {
      window.anime({ targets: document.body, opacity: [1, 0], duration: 140, easing: EASE, complete: go });
      setTimeout(go, 400); // safety net: never strand the user on a faded-out page
    } catch (e) { go(); }
  }

  // Fades `el` out, runs `renderFn()` to swap its contents, fades back in.
  // Used wherever a panel is regenerated in place (city terrain, bench
  // preview) instead of navigating — renderFn runs synchronously inside the
  // fade-out's completion so nothing is visible mid-swap.
  function crossfade(el, renderFn) {
    if (!el) { renderFn(); return; }
    if (REDUCED || !has()) { renderFn(); return; }
    try {
      window.anime({
        targets: el, opacity: [1, 0], duration: 110, easing: EASE,
        complete: () => { renderFn(); window.anime({ targets: el, opacity: [0, 1], duration: 180, easing: EASE }); },
      });
    } catch (e) { renderFn(); }
  }

  // A freshly-appeared element (a new Shelf card) settles in rather than
  // just appearing — never used for cards that were already on the Shelf.
  function popIn(el) {
    if (!el || REDUCED || !has()) return;
    try { window.anime({ targets: el, opacity: [0, 1], translateY: [6, 0], duration: 220, easing: EASE }); } catch (e) {}
  }

  // Brief confirmation flash, e.g. after a save.
  function pulse(el) {
    if (!el || REDUCED || !has()) return;
    try { window.anime({ targets: el, opacity: [1, 0.35, 1], duration: 420, easing: "easeInOutQuad" }); } catch (e) {}
  }

  window.ForgeAnim = { navigateWithFade, crossfade, popIn, pulse };
})();
