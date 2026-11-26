// packages/ui/eco-hud.js -- the inspection boxes the ecology pages draw round creatures (World Scene, Cybernetic Ecology, Field Scan,
// Species Style Lab each carried the same copy): one box element by index, and a creature's box on the screen. Plain global functions;
// they use the page's own globals when called.

function hudBoxEl(i) {
  let b = hudPool[i];
  if (!b) {
    const el = document.createElement('div'); el.className = 'hud-box';
    const lab = document.createElement('div'); lab.className = 'hud-label';
    el.appendChild(lab); hudEl.appendChild(el);
    b = hudPool[i] = { el, lab };
  }
  return b;
}
function hudRect(f) {
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, n = 0;
  for (let k = 0; k < K; k += 2) {
    const p = hudProject(f.chain[k * 2], f.chain[k * 2 + 1], f.cz[k]);
    if (!p) continue;
    n++; if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  if (n < 2) return null;
  const w = Math.max(10, maxX - minX), h = Math.max(10, maxY - minY);
  return { x: minX, y: minY, w, h, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}
