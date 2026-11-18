// Kit art on a canvas. Every creature is drawn from its own Forge sheet: each part sits at its height on the sheet (head at the
// top), and that height is mapped to the same share of the creature's spine, so the body bends through the parts as it moves.
// Paths are built once into Path2D and reused every frame.
import { KIT, type KitPart, type MawPart, type Sheet } from "../content/data";

const cache = new Map<string, Path2D>();
export function pathOf(key: string, d: string[]): Path2D {
  let p = cache.get(key);
  if (!p) { p = new Path2D(); for (const s of d) p.addPath(new Path2D(s)); cache.set(key, p); }
  return p;
}

// a point along a spine (head first), t 0..1, with the forward angle there
export function along(pts: number[], t: number): { x: number; y: number; a: number } {
  const n = pts.length / 2 - 1, f = Math.max(0, Math.min(n - 1e-6, t * n)), i = Math.floor(f), u = f - i;
  const x0 = pts[i * 2], y0 = pts[i * 2 + 1], x1 = pts[i * 2 + 2], y1 = pts[i * 2 + 3];
  return { x: x0 + (x1 - x0) * u, y: y0 + (y1 - y0) * u, a: Math.atan2(y0 - y1, x0 - x1) };
}

export interface Ink { fill: string; stroke: string; width: number; alpha?: number }

// a species from its sheet: `px` is how many screen pixels one world unit is (so the line stays a hairline at any zoom)
export function drawSheet(ctx: CanvasRenderingContext2D, sheetName: string, pts: number[], len: number, px: number, ink: Ink, lift = 1): void {
  const sh: Sheet | undefined = KIT.sheets[sheetName]; if (!sh) return;
  const H = sh.y1 - sh.y0, s = (len / H) * lift;
  ctx.fillStyle = ink.fill; ctx.strokeStyle = ink.stroke; ctx.lineWidth = ink.width / (s * px); ctx.lineJoin = "round";
  for (const p of sh.parts) {
    const t = (p.oy - sh.y0) / H, at = along(pts, t);
    ctx.setTransform(ctxBase.a, ctxBase.b, ctxBase.c, ctxBase.d, ctxBase.e, ctxBase.f);
    ctx.translate(at.x, at.y); ctx.rotate(at.a + Math.PI / 2); ctx.scale(s, s); ctx.translate(-200, -p.oy);
    const path = pathOf(sheetName + p.id + p.side + p.oy, p.d);
    ctx.fill(path); ctx.stroke(path);
  }
  ctx.setTransform(ctxBase.a, ctxBase.b, ctxBase.c, ctxBase.d, ctxBase.e, ctxBase.f);
}
// the camera's transform, set once a frame (parts set their own on top of it)
export let ctxBase: DOMMatrix = new DOMMatrix();
export function setBase(m: DOMMatrix): void { ctxBase = m; }

// one Maw part placed with its centre at a point, its sheet "up" turned to angle a, at scale s (sx stretches along its length)
export function drawPart(ctx: CanvasRenderingContext2D, part: MawPart | KitPart, key: string, x: number, y: number, a: number, s: number, sx = 1, flip = false): void {
  ctx.setTransform(ctxBase.a, ctxBase.b, ctxBase.c, ctxBase.d, ctxBase.e, ctxBase.f);
  ctx.translate(x, y); ctx.rotate(a); ctx.scale(s * sx * (flip ? -1 : 1), s); ctx.translate(-part.ox, -part.oy);
  const path = pathOf(key, part.d); ctx.fill(path); ctx.stroke(path);
  ctx.setTransform(ctxBase.a, ctxBase.b, ctxBase.c, ctxBase.d, ctxBase.e, ctxBase.f);
}
// a path already centred on 0,0 (fangs, the wing)
export function drawCentred(ctx: CanvasRenderingContext2D, key: string, d: string[], x: number, y: number, a: number, sx: number, sy: number): void {
  ctx.setTransform(ctxBase.a, ctxBase.b, ctxBase.c, ctxBase.d, ctxBase.e, ctxBase.f);
  ctx.translate(x, y); ctx.rotate(a); ctx.scale(sx, sy);
  const path = pathOf(key, d); ctx.fill(path); ctx.stroke(path);
  ctx.setTransform(ctxBase.a, ctxBase.b, ctxBase.c, ctxBase.d, ctxBase.e, ctxBase.f);
}
