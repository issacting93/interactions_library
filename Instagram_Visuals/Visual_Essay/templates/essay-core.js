// Shared helpers for the genui-ep1 shot files. Each shot is a pure function of time t (seconds):
// call runEssay(step) once, where step(t) sets every animated property. Live in a browser it free-
// runs off requestAnimationFrame; with ?driven=1 (set by capture-shots.mjs) it instead only moves
// when window.essayStep(ms) is called, so capture gets an exact, repeatable frame every time.

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function prog(t, start, dur) { return clamp01((t - start) / dur); }

const ease = {
  linear: x => x,
  outCubic: x => 1 - Math.pow(1 - x, 3),
  inOutSine: x => -(Math.cos(Math.PI * x) - 1) / 2,
  outBack: (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
};

// Draws an SVG geometry element on/off by p (0 = hidden, 1 = fully drawn). Caches path length.
function drawOn(el, p) {
  let L = el._L;
  if (L == null) { L = el._L = el.getTotalLength(); el.style.strokeDasharray = `${L} ${L}`; }
  el.style.strokeDashoffset = String(L * (1 - clamp01(p)));
}

function lerp(a, b, p) { return a + (b - a) * clamp01(p); }

function runEssay(step) {
  const driven = new URLSearchParams(location.search).get('driven') === '1';
  function frame(ms) { step((ms || 0) / 1000); if (!driven) requestAnimationFrame(frame); }
  window.essayStep = frame;
  if (!driven) requestAnimationFrame(frame);
  injectSafeZoneGuide();
}

// Conservative cross-platform unsafe margins for a 1080x1920 export, for ?safezone=1 preview only
// (never passed by capture-templates.mjs, so it never reaches a rendered video). Covers the account
// name/follow button strip Reels draws at the top, and the caption/sound-title/action-rail chrome
// TikTok, Reels, and Shorts each draw over the bottom and right edge — TikTok is the most
// aggressive of the three at both edges, so these numbers are sized to clear all three at once.
// Sources: platform safe-zone guides collected Oct 2026 (Instagram Reels ~996x1400 safe area;
// TikTok ~900x1492 safe area, right action rail ~140px; YouTube Shorts ~984x1500, right ~48px).
window.SAFE_ZONE = { top: 250, bottom: 350, right: 160, left: 32 };

function injectSafeZoneGuide() {
  if (new URLSearchParams(location.search).get('safezone') !== '1') return;
  const z = window.SAFE_ZONE;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none;font-family:ui-monospace,monospace';
  const band = (css, label) => {
    const d = document.createElement('div');
    d.style.cssText = `position:absolute;background:rgba(255,40,40,.22);box-sizing:border-box;${css}`;
    if (label) d.innerHTML = `<span style="position:absolute;color:#fff;font-size:13px;letter-spacing:.08em;background:rgba(200,20,20,.9);padding:4px 8px;border-radius:3px">${label}</span>`;
    return d;
  };
  wrap.appendChild(band(`left:0;top:0;width:100%;height:${z.top}px`, 'UNSAFE · TOP (ACCOUNT / FOLLOW)'));
  wrap.appendChild(band(`left:0;bottom:0;width:100%;height:${z.bottom}px`, 'UNSAFE · BOTTOM (CAPTIONS / SOUND)'));
  wrap.appendChild(band(`right:0;top:${z.top}px;width:${z.right}px;height:calc(100% - ${z.top + z.bottom}px)`, 'UNSAFE · ACTION RAIL'));
  const safe = document.createElement('div');
  safe.style.cssText = `position:absolute;left:${z.left}px;right:${z.right}px;top:${z.top}px;bottom:${z.bottom}px;border:2px dashed rgba(80,255,160,.85)`;
  wrap.appendChild(safe);
  document.body.appendChild(wrap);
}
