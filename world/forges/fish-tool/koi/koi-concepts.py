"""Koi concepts: top-view drawings for the tank, one SVG per koi, every path one rig part.

    python3 world/forges/fish-tool/koi/koi-concepts.py            writes koi-<name>.svg here, and sheet.svg (all five side by side)

The pipeline (pipeline/from-svg.mjs) reads each path as a part: a path across the centre line rides the body wave, a path off it is
a side part (a fin, a barbel) and sways from where it joins. Head at the top, tail at the bottom, as the tank's drawings are.

Each koi is a body profile (half-width along the length), the body cut into bands so it bends, and fins built as fans of rays.
The markings (kohaku patches, porcelain scales) are not drawn: the look draws them on the solid body (creature-looks, pattern
"koi" and "scales"). The five, after Zac's references (2026-11-25):
  kohaku     the classic pond koi seen from above (Rebecca Gregory's Koi Pond): stout, round pectorals, short soft tail
  butterfly  long-finned (Yuumei's paper koi lanterns): slim, pectorals and tail long and feathered, many rays
  sumi       ink brush koi: the fins and tail as ragged brush strands
  ember      a koi of overlapping shards (the copper feather koi): shard plates down the body, flame fins
  ghost      the deep koi (the whale-shadow and lily-pad scenes): long, slender, veil tail, for glass
"""
import math, os

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 290, 560
CX = W / 2


def f(v):
    return f"{v:.2f}"


def poly(pts, closed=True):
    d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts)
    return d + (" Z" if closed else "")


def smooth(pts, n=6):
    """Chaikin rounding, closed."""
    for _ in range(n // 3):
        out = []
        for i in range(len(pts)):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            out += [(a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25), (a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75)]
        pts = out
    return pts


def rng(seed):
    s = [seed * 9301 + 49297]

    def r():
        s[0] = (s[0] * 1103515245 + 12345) & 0x7FFFFFFF
        return s[0] / 0x7FFFFFFF
    return r


class Koi:
    def __init__(self, name, top, length, width, nose, ped, bands, seed=1):
        self.name, self.top, self.L, self.Wd, self.nose, self.ped, self.bands = name, top, length, width, nose, ped, bands
        self.paths, self.r = [], rng(seed)

    # half-width of the body at t (0 snout, 1 the tail's root): a rounded snout, the widest at `nose`, a long taper to the root
    def w(self, t):
        t = min(1.0, max(0.0, t))
        if t < self.nose:   # the snout: a superellipse, so the head is blunt and round as a koi's, not pointed
            u = 1 - t / self.nose
            return self.Wd * max(0.0, 1 - u ** 2.6) ** (1 / 2.6) * (0.72 + 0.28 * (1 - u))
        u = (t - self.nose) / (1 - self.nose)
        return self.ped + (self.Wd - self.ped) * (0.5 + 0.5 * math.cos(math.pi * u ** 0.85))

    def y(self, t):
        return self.top + t * self.L

    def add(self, d):
        self.paths.append(d)

    # the body: one piece from snout to the tail's root. The tank bends a centre part vertex by vertex along its spine, so it needs
    # no cuts (cuts drew as stripes across the solid)
    def body(self, n=60):
        ts = [k / n for k in range(n + 1)]
        self.add(poly([(CX - self.w(t), self.y(t)) for t in ts] + [(CX + self.w(t), self.y(t)) for t in reversed(ts)]))

    # a fin: a fan of `rays` from its root, along a direction, its edge `edge(k)` (k 0..1 across the fan) as far out as `reach`
    def fin(self, t, side, ang, spread, reach, rays, edge=None, rootw=4.0, inset=0.85, curl=0.0):
        x0, y0 = CX + side * self.w(t) * inset, self.y(t)
        edge = edge or (lambda k: 1.0)
        outline, strokes = [], []
        for k in range(rays + 1):
            u = k / rays
            a = ang + side * (u - 0.5) * spread
            R = reach * edge(u)
            # a ray bends back a little (curl) as it runs out
            mid = (x0 + side * math.cos(a) * R * 0.5, y0 + math.sin(a) * R * 0.5 + curl * R * 0.25)
            tip = (x0 + side * math.cos(a) * R, y0 + math.sin(a) * R + curl * R * 0.6)
            outline.append(tip)
            strokes.append([(x0 + side * (u - 0.5) * rootw * 0.4, y0), mid, tip])
        rim = [(x0 - side * rootw * 0.3, y0 - rootw)] + outline + [(x0 - side * rootw * 0.3, y0 + rootw)]
        d = poly(rim)
        for s in strokes[1:-1]:
            d += " " + poly(s, closed=False)
        self.add(d)

    # long strands from a root (brush fins, flame fins): each a slim tapering blade, all in one part
    def strands(self, t, side, ang, spread, reach, n, width=3.0, wave=0.15, jitter=0.25):
        x0, y0 = CX + side * self.w(t) * 0.8, self.y(t)
        d = ""
        for k in range(n):
            u = (k + 0.5) / n
            a = ang + side * (u - 0.5) * spread + (self.r() - 0.5) * jitter
            R = reach * (0.65 + 0.35 * math.sin(math.pi * u)) * (0.85 + 0.3 * self.r())
            seg, L, Rt = 10, [], []
            for j in range(seg + 1):
                s = j / seg
                bend = math.sin(s * math.pi * 1.2 + k) * wave * R * s
                px = x0 + side * (math.cos(a) * R * s) - math.sin(a) * bend * side
                py = y0 + math.sin(a) * R * s + math.cos(a) * bend
                hw = width * (1 - s) ** 0.8 + 0.25
                nx, ny = -math.sin(a) * side, math.cos(a)
                L.append((px + nx * hw, py + ny * hw))
                Rt.append((px - nx * hw, py - ny * hw))
            d += (" " if d else "") + poly(L + list(reversed(Rt)))
        self.add(d)

    # the tail: across the centre, so it ripples with the body wave (one piece: the tank bends it vertex by vertex)
    def tail(self, length, spread, parts=1, rays=9, fork=0.35, lobe=0.0, wave=0.0):
        y0 = self.y(1.0) - 4
        for p in range(parts):
            s0, s1 = p / parts, (p + 1) / parts + (0.04 if p < parts - 1 else 0)
            def half(s):   # the half-width of the tail at s along it: opens out, the fork's notch at the end
                return self.ped * (1 - s) + spread * (s ** 0.8) * (1 + lobe * math.sin(s * math.pi))
            def notch(s):
                return max(0.0, (s - (1 - fork)) / fork) if fork > 0 else 0.0
            n = 10
            ss = [s0 + (s1 - s0) * k / n for k in range(n + 1)]
            yl = lambda s: y0 + s * length
            sway = lambda s: math.sin(s * math.pi * 2) * wave * spread
            left = [(CX - half(s) + sway(s), yl(s)) for s in ss]
            right = [(CX + half(s) + sway(s), yl(s)) for s in reversed(ss)]
            outline = left + right
            if p == parts - 1:   # the end: a forked edge with soft lobes, scalloped between rays
                end = []
                for k in range(rays * 2 + 1):
                    u = k / (rays * 2)
                    x = CX - half(1) + 2 * half(1) * u + sway(1)
                    dip = fork * length * 0.9 * (1 - abs(u - 0.5) * 2) ** 1.5
                    scal = 3.5 * (0.5 - 0.5 * math.cos(u * math.pi * rays * 2)) if rays else 0
                    end.append((x, yl(1) - dip - scal))
                outline = left + end + list(reversed([(CX + half(s) + sway(s), yl(s)) for s in ss]))
            d = poly(outline)
            last = p == parts - 1
            for k in range(1, rays):   # rays down this piece; in the last, each stops short of the forked edge
                u = k / rays
                stop = s1 - 0.01
                if last: stop = 1 - (fork * 0.9 * (1 - abs(u - 0.5) * 2) ** 1.5 + 6 / length)
                if stop <= s0: continue
                d += " " + poly([(CX + (u - 0.5) * 2 * half(s) * 0.92 + sway(s), yl(s)) for s in (s0, (s0 + stop) / 2, stop)], closed=False)
            self.add(d)

    def barbels(self, t=0.03, length=16, curl=0.6):
        for side in (-1, 1):
            x0, y0 = CX + side * self.w(t) * 0.6, self.y(t) + 2
            pts = [(x0 + side * length * s * 0.7 + side * math.sin(s * curl * 3) * 3, y0 - length * s * 0.2 + s * s * length * 0.5) for s in [i / 8 for i in range(9)]]
            self.add(poly(pts + [(x + side * 0.8, y + 0.8) for x, y in reversed(pts)]))

    def dorsal(self, t0, t1, height=6.0, rays=7):
        pts, n = [], 16
        ts = [t0 + (t1 - t0) * k / n for k in range(n + 1)]
        hw = lambda t: height * math.sin(math.pi * (t - t0) / (t1 - t0)) ** 0.7 + 0.6
        d = poly([(CX - hw(t), self.y(t)) for t in ts] + [(CX + hw(t), self.y(t)) for t in reversed(ts)])
        for k in range(1, rays):
            t = t0 + (t1 - t0) * k / rays
            d += " " + poly([(CX - hw(t) * 0.8, self.y(t) + 3), (CX + hw(t) * 0.8, self.y(t) - 3)], closed=False)
        self.add(d)

    # shards: leaf plates down the body (the copper koi), each across the centre or just off it
    def shards(self, rows, per, t0=0.16, t1=0.98):
        for i in range(rows):
            t = t0 + (t1 - t0) * (i + 0.5) / rows
            ww = self.w(t)
            for j in range(per):
                u = (j + 0.5) / per - 0.5
                x, y = CX + u * ww * 2.1, self.y(t) + (self.r() - 0.5) * 6
                L, Wd = self.L / rows * 1.7, ww * 2.2 / per * 0.9
                a = math.atan2(1, u * 0.9)
                pts = []
                for k in range(13):
                    s = k / 12
                    pts.append((x + math.sin(math.pi * s) * Wd * 0.5, y - L * 0.35 + L * s))
                for k in range(11, 0, -1):
                    s = k / 12
                    pts.append((x - math.sin(math.pi * s) * Wd * 0.5 * 0.8, y - L * 0.35 + L * s))
                ca, sa = math.cos(u * 0.5), math.sin(u * 0.5)
                pts = [(x + (px - x) * ca - (py - y) * sa, y + (px - x) * sa + (py - y) * ca) for px, py in pts]
                self.add(poly(pts))

    def svg(self, x=0, frame=True):
        body = "\n".join(f'<path d="{d}"/>' for d in self.paths)
        return body


def kohaku():
    k = Koi("kohaku", 34, 330, 52, 0.30, 10, 6, seed=3)
    k.body()
    k.barbels()
    for s in (-1, 1):
        k.fin(0.27, s, math.radians(30), math.radians(70), 54, 9, edge=lambda u: 0.75 + 0.25 * math.sin(math.pi * u), curl=0.15)
        k.fin(0.62, s, math.radians(50), math.radians(45), 28, 6, edge=lambda u: 0.8 + 0.2 * math.sin(math.pi * u))
    k.dorsal(0.36, 0.78, 7, 9)
    k.tail(120, 58, parts=1, rays=11, fork=0.32, lobe=0.25)
    return k


def butterfly():
    k = Koi("butterfly", 34, 300, 40, 0.28, 8, 6, seed=5)
    k.body()
    k.barbels(length=20)
    for s in (-1, 1):
        k.fin(0.26, s, math.radians(42), math.radians(80), 112, 16, edge=lambda u: 0.55 + 0.45 * math.sin(math.pi * u ** 0.8), curl=0.35)
        k.fin(0.6, s, math.radians(62), math.radians(50), 58, 10, edge=lambda u: 0.6 + 0.4 * math.sin(math.pi * u), curl=0.3)
    k.dorsal(0.3, 0.86, 11, 14)
    k.tail(210, 74, parts=1, rays=17, fork=0.42, lobe=0.4, wave=0.05)
    return k


def sumi():
    k = Koi("sumi", 34, 320, 48, 0.3, 9, 6, seed=11)
    k.body()
    k.barbels(length=22, curl=0.9)
    for s in (-1, 1):
        k.strands(0.27, s, math.radians(36), math.radians(70), 92, 7, width=4.2, wave=0.18)
        k.strands(0.62, s, math.radians(72), math.radians(40), 52, 5, width=3.0, wave=0.2)
    k.tail(150, 50, parts=1, rays=8, fork=0.5, lobe=0.2, wave=0.08)
    return k


def ember():
    k = Koi("ember", 34, 320, 50, 0.3, 9, 6, seed=7)
    k.body()
    k.shards(9, 3)
    for s in (-1, 1):
        k.strands(0.25, s, math.radians(48), math.radians(60), 112, 6, width=6.5, wave=0.1, jitter=0.15)
        k.strands(0.62, s, math.radians(70), math.radians(40), 60, 4, width=5.0, wave=0.12)
    k.tail(190, 66, parts=1, rays=10, fork=0.45, lobe=0.35, wave=0.06)
    return k


def ghost():
    k = Koi("ghost", 34, 330, 36, 0.27, 7, 6, seed=13)
    k.body()
    k.barbels(length=26, curl=1.1)
    for s in (-1, 1):
        k.fin(0.25, s, math.radians(50), math.radians(60), 88, 12, edge=lambda u: 0.5 + 0.5 * math.sin(math.pi * u), curl=0.5)
        k.fin(0.6, s, math.radians(80), math.radians(40), 50, 8, curl=0.4)
    k.dorsal(0.28, 0.9, 6, 12)
    k.tail(170, 50, parts=1, rays=13, fork=0.3, lobe=0.6, wave=0.07)
    return k


KOI = [kohaku(), butterfly(), sumi(), ember(), ghost()]

if __name__ == "__main__":
    for k in KOI:
        with open(os.path.join(HERE, f"koi-{k.name}.svg"), "w") as fh:
            fh.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" fill="none" stroke="#61E5BF" stroke-width="1">\n{k.svg()}\n</svg>\n')
    # the sheet: all five, outlines as the tank draws them, filled grey so the masses read
    cells = []
    for i, k in enumerate(KOI):
        cells.append(f'<g transform="translate({i * W} 0)"><rect width="{W}" height="{H}" fill="#f4f1ea"/><g fill="#2b292a" fill-opacity="0.12" stroke="#1f1d1c" stroke-width="0.9">'
                     + "".join(f'<path d="{d}"/>' for d in k.paths)
                     + f'</g><text x="{W / 2}" y="{H - 12}" text-anchor="middle" font-family="monospace" font-size="12" fill="#555">{k.name} · {len(k.paths)} parts</text></g>')
    with open(os.path.join(HERE, "sheet.svg"), "w") as fh:
        fh.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W * len(KOI)} {H}" width="{W * len(KOI)}" height="{H}">' + "".join(cells) + "</svg>\n")
    for k in KOI:
        print(k.name, len(k.paths), "parts")
