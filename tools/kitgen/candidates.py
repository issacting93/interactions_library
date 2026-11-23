#!/usr/bin/env python3
"""Kit candidates: new kinds of creature put together from the kit's parts by rule, for Zac to pick from.

  python3 tools/kitgen/candidates.py                 write round one's recipes and sheet (kit-sources/kit-candidates-round1.json and .svg)

ROUND ONE, kept for the record. Zac's answer to it was to study the designed species first; round2.py is what followed and writes the
current candidates. This file still supplies round two's part lists and placing helpers.
  python3 tools/kitgen/candidates.py explore <dir>   many seeds of every plan, one sheet a plan, to choose from (nothing in the repo changes)

None of these is a redrawing of an existing creature. Each of the ten plans below is a silhouette the bestiary's six orders do not have
(a column, a cross, wings, sickles, a ring with rays, a veil); a plan is a rule that says where parts go, and a candidate is one run of
it with parts chosen from the kit by what they are (segment, lantern, wing, blade...). The result is a recipe in the format
packages/kit/data/kit-creatures.json already uses (Bestiary Forge's plan: part ids and placements on a 400-wide canvas, centre line
x = 200), so a picked candidate moves there unchanged and the kit gets no new ids.

Every placement is written "free" (put exactly there) and the mirror image is written beside it, so a centre part can stand off the
centre line and still come in a pair. All ten plans are mirror-symmetric except the pinwheels, which turn about their hub.
"""
import sys, os, json, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kitlib import ROOT, DATA, PARTS, info, bounds, path_d, f1

# ---------- parts by what they do in a plan (chosen by eye from the kit's contact sheets; whole-creature drawings are left out) ----------
SEG = "P285 P259 P564 P276 P147 P295 P129 P110 P479 P280 P277 P195 P534 P296 P146 P055 P587 P226 P641 P142 P140".split()      # spine segments, drawn upright
CLASP = "P050 P051 P205 P123 P124 P423".split()                                                                                  # open U-shaped links
HEAD = "P145 P159 P230 P558 P643 P116 P246 P680 P583 P228 P571 P478 P702 P065 P535 P683 P500 P501 P658 P705".split()            # lanterns that read as a head or crest
BAR = "P650 P346 P096 P619 P661 P253 P246 P643 P571 P001 P165".split()                                                           # wide low centre parts: a yoke, a tier, a bridge
CORE = "P033 P075 P182 P720 P475 P654 P085 P007 P020 P095 P233 P012 P272 P653 P652 P294 P158".split()                           # big ornate centre bodies
RING = "P024 P169 P022 P234 P707 P351".split()                                                                                   # rings and discs
SPEAR = "P713 P032 P651 P146 P587".split()                                                                                       # long pointed centre parts: a tail or a prow
WING = "P290 P105 P038 P019 P603 P461 P171 P493 P133 P118 P626 P291 P240 P241 P004 P015 P107 P027 P549 P040 P471 P029 P026 P261 P223 P153 P212 P028 P518 P582 P152 P079 P607 P579 P466 P258 P627".split()
BLADE = "P691 P036 P495 P432 P429 P497 P684 P227 P581 P395 P430 P117 P631 P017 P431 P490 P555 P462 P433 P491 P463 P554 P184 P185 P434 P398 P252 P256 P402 P254 P160 P403 P401 P399 P440 P044 P435 P437 P190".split()
RIB = "P396 P128 P245 P187 P183 P191 P163".split()                                                                               # long thin blades
BEAD = "P235 P274 P052 P207 P111 P237 P013 P003 P505 P507".split()                                                               # small round things
for _p in SEG + CLASP + HEAD + BAR + CORE + RING + SPEAR + WING + BLADE + RIB + BEAD: assert _p in PARTS, _p

_bb = {}
def bb(pid):
    """a part's box in its own frame (its origin is where a placement's x, y puts it)"""
    if pid not in _bb: _bb[pid] = bounds({"parts": [{"part": pid, "x": 0, "y": 0, "free": True}]})
    return _bb[pid]
W = lambda pid, s=1: (bb(pid)[2] - bb(pid)[0]) * s
H = lambda pid, s=1: (bb(pid)[3] - bb(pid)[1]) * s

class Build:
    """a recipe being put together: parts placed by the middle of their box, each with its mirror image when asked"""
    def __init__(self): self.parts = []
    def put(self, pid, cx, cy, s=1, rot=0, flip=False):
        x0, y0, x1, y1 = bb(pid); mx, my = (x0 + x1) / 2 * s, (y0 + y1) / 2 * s * (-1 if flip else 1); a = math.radians(rot)
        ox, oy = mx * math.cos(a) - my * math.sin(a), mx * math.sin(a) + my * math.cos(a)
        pl = {"part": pid, "x": round(cx - ox, 1), "y": round(cy - oy, 1), "scale": round(s, 3), "free": True}
        if rot: pl["rotate"] = round(rot, 1)
        if flip: pl["flipY"] = True
        self.parts.append(pl); return pl
    def mirror(self, pl):
        m = dict(pl); m["x"] = round(400 - pl["x"], 1); m["rotate"] = round(180 - pl.get("rotate", 0), 1)
        if pl.get("flipY"): m.pop("flipY")
        else: m["flipY"] = True
        self.parts.append(m); return m
    def pair(self, pid, dx, cy, s=1, rot=0, flip=False):
        """the part with its box's middle dx left of the centre line, and its mirror image on the right"""
        self.mirror(self.put(pid, 200 - dx, cy, s, rot, flip))
    def centre(self, pid, cy, s=1, flip=False): return self.put(pid, 200, cy, s, 0, flip)
    def stack(self, pids, y, s0=1, s1=None, lap=0.86, up=False, flip=False):
        """centre parts one after another down (or up) the centre line from y, each overlapping the last; returns where it ended"""
        n = len(pids)
        for i, pid in enumerate(pids):
            s = s0 + ((s1 if s1 is not None else s0) - s0) * (i / max(1, n - 1)); h = H(pid, s)
            self.centre(pid, y - h / 2 if up else y + h / 2, s, flip); y += (-h if up else h) * lap
        return y
    def chain(self, pids, pts, s0=1, s1=None, lap=0.84, both=True, flip=False):
        """parts laid head to tail along a line of points, turned to follow it, scale running from s0 to s1; `both` adds the mirror image.
        Returns the last point reached and the heading there."""
        seg = [(math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])) for i in range(len(pts) - 1)]; total = sum(seg)
        def at(t):
            for i, L in enumerate(seg):
                if t <= L or i == len(seg) - 1:
                    u = max(0.0, t / L) if L else 0; p, q = pts[i], pts[i + 1]; return (p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u), ((q[0] - p[0]) / (L or 1), (q[1] - p[1]) / (L or 1))
                t -= L
        t = 0; n = len(pids); end = (pts[0], (0, 1))
        for i, pid in enumerate(pids):
            s = s0 + ((s1 if s1 is not None else s0) - s0) * (i / max(1, n - 1)); L = H(pid, s)
            if t + L * 0.5 > total + L * 0.3: break
            (x, y), (tx, ty) = at(t + L / 2); rot = math.degrees(math.atan2(-tx, ty)); pl = self.put(pid, x, y, s, rot, flip)
            if both: self.mirror(pl)
            t += L * lap; end = (at(min(t, total))[0], (tx, ty))
        return end

def arc(cx, cy, r, a0, a1, n=24):
    """points on a circle: angle 0 is straight down, growing toward the left (so a mirrored chain grows toward the right)"""
    return [(cx - r * math.sin(math.radians(a0 + (a1 - a0) * i / n)), cy + r * math.cos(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]
def ray(x, y, ang, length, n=2):
    """a straight line from x, y: angle 0 straight down, 90 to the left, 180 straight up"""
    return [(x - math.sin(math.radians(ang)) * length * i / n, y + math.cos(math.radians(ang)) * length * i / n) for i in range(n + 1)]
def spiral(cx, cy, r0, r1, a0, turns, n=60):
    """a coil about cx, cy, from radius r0 at angle a0 winding in (or out) to r1 over so many turns"""
    return [(cx - (r0 + (r1 - r0) * i / n) * math.sin(math.radians(a0 + 360 * turns * i / n)), cy + (r0 + (r1 - r0) * i / n) * math.cos(math.radians(a0 + 360 * turns * i / n))) for i in range(n + 1)]

# ---------- the ten plans ----------
def twins(R, o):
    """Geminata, the twins: two spines side by side under one head, held together by bridges"""
    b = Build(); seg = o.get("seg") or R.choice(SEG); n = o.get("n", R.randint(5, 8)); s0 = o.get("s", 1.0); d = o.get("d", max(34, W(seg, s0) * 0.5 + 16))
    bar = o.get("bar") or R.choice(BAR); bs = (2 * d + W(seg, s0) * 1.5) / W(bar)
    ys = []; y = 120
    for i in range(n):
        s = s0 * (1 - 0.5 * i / max(1, n - 1)); h = H(seg, s); b.pair(seg, d * (1 - 0.25 * i / max(1, n - 1)), y + h / 2, s); ys.append((y + h / 2, s, d * (1 - 0.25 * i / max(1, n - 1)))); y += h * 0.84
    tip = o.get("tip") or R.choice(BLADE + RIB); ts = o.get("tips", 0.9); b.pair(tip, ys[-1][2], y + H(tip, ts) * 0.4, ts, o.get("tiprot", 0))
    link = o.get("link") or R.choice(RING + BEAD + CLASP)
    for i in range(1, n - 1, o.get("every", 2)): yy, s, dd = ys[i]; b.centre(link, yy, min(1.4, (2 * dd - W(seg, s) * 0.5) / W(link)))
    fin = o.get("fin")
    if fin:
        for i in range(0, n - 1, 2): yy, s, dd = ys[i]; fs = o.get("fins", 0.8) * s; b.pair(fin, dd + W(seg, s) * 0.4 + W(fin, fs) * 0.42, yy, fs)
    b.centre(bar, 120 - H(bar, bs) * 0.25, bs)
    crest = o.get("crest")
    if crest: b.centre(crest, 120 - H(bar, bs) * 0.7 - H(crest, o.get("crests", 0.8)) * 0.3, o.get("crests", 0.8))
    return b

def bows(R, o):
    """Arcuata, the bows: a crescent, its two horns reaching forward round an open middle"""
    b = Build(); r = o.get("r", 120); cy = 180; seg = o.get("seg") or R.choice(SEG); n = o.get("n", R.randint(5, 7)); s0 = o.get("s", 1.15); span = o.get("span", 125)
    key = o.get("key") or R.choice(CORE + HEAD); ks = o.get("keys", 0.7 if key in CORE else 1.25)
    end = b.chain([seg] * n, arc(200, cy, r, o.get("start", 9), span), s0, s0 * o.get("taper", 0.42))
    tip = o.get("tip") or R.choice(BLADE + RIB); (x, y), (tx, ty) = end; ts = o.get("tips", 0.9); L = H(tip, ts) * 0.42
    b.mirror(b.put(tip, x + tx * L, y + ty * L, ts, math.degrees(math.atan2(-tx, ty)) + o.get("tiprot", 0)))
    b.centre(key, cy + r - H(key, ks) * o.get("keyup", 0.18), ks)
    lure = o.get("lure")
    if lure: b.centre(lure, cy + o.get("lurey", -10), o.get("lures", 0.9))
    fin = o.get("fin")
    if fin:   # barbs on the outside of the curve
        for a in o.get("fina", (40, 70, 100)): fs = o.get("fins", 0.7) * (1 - a / 260); rr = r + W(seg, s0) * 0.35 + W(fin, fs) * 0.3; b.mirror(b.put(fin, 200 - rr * math.sin(math.radians(a)), cy + rr * math.cos(math.radians(a)), fs, a - 90 + o.get("finrot", 0)))
    tail = o.get("tail")
    if tail: b.centre(tail, cy + r + H(key, ks) * 0.3 + H(tail, o.get("tails", 0.7)) * 0.4, o.get("tails", 0.7))
    return b

def forks(R, o):
    """Furcata, the forks: one trunk that splits into several necks, a head on each"""
    b = Build(); seg = o.get("seg") or R.choice(SEG); neck = o.get("neck") or R.choice(SEG + CLASP); head = o.get("head") or R.choice(HEAD); k = o.get("k", R.choice((3, 5)))
    hub_y = 250; core = o.get("core") or R.choice(CORE); cs = o.get("cores", 0.55); b.centre(core, hub_y + H(core, cs) * 0.3, cs)
    y = b.stack([seg] * o.get("trunk", 4), hub_y + H(core, cs) * 0.62, o.get("ts", 1.0), o.get("ts", 1.0) * 0.5)
    tail = o.get("tail") or R.choice(SPEAR + BLADE); ts = o.get("tails", 0.6)
    if tail in SPEAR: b.centre(tail, y + H(tail, ts) * 0.42, ts)
    else: b.pair(tail, W(tail, ts) * 0.42, y + H(tail, ts) * 0.3, ts)
    angs = {3: (0, 48), 5: (0, 34, 70), 7: (0, 26, 52, 80)}[k] if "angs" not in o else o["angs"]; ns = o.get("ns", 0.8); hs = o.get("hs", 0.7)
    for i, a in enumerate(angs):
        length = o.get("len", 150) * (1 - 0.14 * i) if "lens" not in o else o["lens"][i]; nn = max(2, int(length / (H(neck, ns) * 0.8)))
        pts = ray(200 - math.sin(math.radians(a)) * 18, hub_y - 8, 180 - a, length)
        (x, yy), (tx, ty) = b.chain([neck] * nn, pts, ns, ns * 0.6, both=(a != 0)); L = H(head, hs) * 0.3
        pl = b.put(head, x + tx * L, yy + ty * L, hs * (1 - 0.1 * i), math.degrees(math.atan2(-tx, ty)) + 180)
        if a != 0: b.mirror(pl)
    return b

def tiers(R, o):
    """Scalata, the tiers: wide storeys stacked on a mast, each wider than the one above"""
    b = Build(); seg = o.get("seg") or R.choice(SEG); n = o.get("n", R.randint(3, 5)); arm = o.get("arm") or R.choice(WING + BLADE); a0 = o.get("as", 0.45); a1 = o.get("ae", 1.0)
    ms = o.get("ms", 0.9); y = 90; top = o.get("top") or R.choice(HEAD); tsx = o.get("tops", 0.8); b.centre(top, y - H(top, tsx) * 0.2, tsx); y += H(top, tsx) * 0.2
    for i in range(n):
        s = a0 + (a1 - a0) * (i / max(1, n - 1)); h = H(seg, ms)
        b.centre(seg, y + h / 2, ms); b.pair(arm, W(seg, ms) * o.get("root", 0.2) + W(arm, s) * 0.5, y + h * 0.5 + o.get("drop", 0) * s, s, o.get("rot", 0)); y += max(h * 0.84, H(arm, s) * o.get("gap", 0.5))
    base = o.get("base") or R.choice(CORE + BAR); bs = o.get("bases", 0.6); b.centre(base, y + H(base, bs) * 0.35, bs); y += H(base, bs) * 0.75
    tail = o.get("tail")
    if tail: b.centre(tail, y + H(tail, o.get("tails", 0.6)) * 0.4, o.get("tails", 0.6))
    return b

def coils(R, o):
    """Spirata, the coils: a head between two horns that wind in on themselves"""
    b = Build(); seg = o.get("seg") or R.choice(SEG); n = o.get("n", 11); s0 = o.get("s", 1.0); r0 = o.get("r0", 78); cxo = o.get("cx", 96); cy = o.get("cy", 170)
    core = o.get("core") or R.choice(CORE + HEAD); cs = o.get("cores", 0.6 if core in CORE else 1.2); b.centre(core, cy + o.get("corey", 30), cs)
    # the left horn: starts beside the head, sweeps out and winds inward
    pts = spiral(200 - cxo, cy, r0, o.get("r1", 10), o.get("a0", -100), o.get("turns", 1.25)); b.chain([seg] * n, pts, s0, s0 * o.get("taper", 0.3), lap=o.get("lap", 0.8))
    y = cy + o.get("corey", 30) + H(core, cs) * 0.45; tr = o.get("trunk", 3)
    if tr: y = b.stack([o.get("tseg") or seg] * tr, y, o.get("ts", 0.8), o.get("ts", 0.8) * 0.55)
    tail = o.get("tail") or R.choice(SPEAR); b.centre(tail, y + H(tail, o.get("tails", 0.55)) * 0.42, o.get("tails", 0.55))
    return b

def mirrors(R, o):
    """Bicipita, the mirrors: the same above as below, a head at both ends"""
    b = Build(); hub = o.get("hub") or R.choice(RING + CORE); hs = o.get("hubs", 0.6); cy = 250; b.centre(hub, cy, hs)
    seg = o.get("seg") or R.choice(SEG); n = o.get("n", 3); ss = o.get("s", 1.0); head = o.get("head") or R.choice(HEAD); hds = o.get("heads", 0.9); wing = o.get("wing") or R.choice(WING + BLADE); ws = o.get("wings", 0.8)
    for up in (True, False):
        sg = -1 if up else 1; y = cy + sg * H(hub, hs) * o.get("hubgap", 0.42)
        y = b.stack([seg] * n, y, ss, ss * 0.7, up=up, flip=not up if o.get("segflip", True) else False)
        b.centre(head, y + sg * H(head, hds) * 0.3, hds, flip=not up)
        b.pair(wing, o.get("wroot", 14) + W(wing, ws) * 0.5, cy + sg * (H(hub, hs) * 0.3 + o.get("wy", 30)), ws, o.get("wrot", 0) * sg, flip=not up)
        w2 = o.get("wing2")
        if w2: s2 = o.get("wing2s", 0.6); b.pair(w2, o.get("w2root", 10) + W(w2, s2) * 0.5, y - sg * o.get("w2y", 30), s2, o.get("w2rot", 0) * sg, flip=not up)
    return b

def yokes(R, o):
    """Jugata, the yokes: a long beam held crosswise, a weight at each end and pendants hung beneath"""
    b = Build(); seg = o.get("seg") or R.choice(SEG); n = o.get("n", 4); s0 = o.get("s", 0.95); cy = 150
    hub = o.get("hub") or R.choice(CORE + HEAD); hs = o.get("hubs", 0.55 if hub in CORE else 1.1); b.centre(hub, cy, hs)
    (x, y), _ = b.chain([seg] * n, ray(200 - W(hub, hs) * o.get("hubw", 0.3), cy + o.get("beamy", 0), 90 - o.get("droop", 0), 400), s0, s0 * o.get("taper", 0.7))
    pod = o.get("pod") or R.choice(RING + HEAD); ps = o.get("pods", 0.7); px = 200 - x + W(pod, ps) * 0.35; b.pair(pod, px, y + o.get("pody", 0), ps, o.get("podrot", 0))
    pen = o.get("pen") or R.choice(SEG + BLADE + RIB); k = o.get("pens", 3); step = (px - W(hub, hs) * 0.3) / (k + 0.5)
    for i in range(k):
        s = o.get("pensc", 0.95) * (1 - 0.2 * i) if not o.get("grow") else o.get("pensc", 0.95) * (0.6 + 0.25 * i); dx = W(hub, hs) * 0.3 + step * (i + 0.8); yy = cy + o.get("beamy", 0) + (dx - W(hub, hs) * 0.3) * math.tan(math.radians(o.get("droop", 0)))
        m = o.get("penlen", 1)
        for j in range(m): b.pair(pen, dx, yy + W(seg, s0) * 0.3 + H(pen, s) * (0.5 + j * 0.8), s * (1 - 0.25 * j), o.get("penrot", 0))
    tail = o.get("tail") or R.choice(SEG); y2 = b.stack([tail] * o.get("tn", 4), cy + H(hub, hs) * 0.42, o.get("ts", 1.0), o.get("ts", 1.0) * 0.5)
    end = o.get("end")
    if end: b.centre(end, y2 + H(end, o.get("ends", 0.6)) * 0.42, o.get("ends", 0.6))
    return b

def lattices(R, o):
    """Reticulata, the lattices: a colony, many small bodies held in a net"""
    b = Build(); node = o.get("node") or R.choice(BEAD + RING + CLASP); rows = o.get("rows", (1, 2, 3, 2, 1)); dx = o.get("dx", 46); dy = o.get("dy", 44); nsz = o.get("ns", dx * 0.62 / max(W(node), H(node)))
    link = o.get("link") or R.choice(RIB); y0 = 130; pos = []
    for r, k in enumerate(rows): pos.append([(200 + (c - (k - 1) / 2) * dx, y0 + r * dy) for c in range(k)])
    for r in range(len(pos) - 1):   # a link between each node and its neighbours in the next row
        for (x, y) in pos[r]:
            for (x2, y2) in pos[r + 1]:
                if abs(x2 - x) < dx * 0.75 and x <= 200.01:
                    L = math.hypot(x2 - x, y2 - y); ls = L * 0.78 / H(link); pl = b.put(link, (x + x2) / 2, (y + y2) / 2, ls, math.degrees(math.atan2(-(x2 - x), y2 - y)))
                    if not (abs(x - 200) < 0.01 and abs(x2 - 200) < 0.01): b.mirror(pl)
    big = o.get("big"); grow = o.get("grow", 0)
    for r, row in enumerate(pos):
        for (x, y) in row:
            if x > 200.01: continue
            s = nsz * (1 + grow * (len(rows[:1]) and (1 - abs(r - (len(rows) - 1) / 2) / max(1, (len(rows) - 1) / 2))))
            pid = big if big and abs(x - 200) < 0.01 and r == o.get("bigrow", len(rows) // 2) else node; ss = o.get("bigs", s) if pid == big else s
            pl = b.put(pid, x, y, ss)
            if abs(x - 200) > 0.01: b.mirror(pl)
    head = o.get("head") or R.choice(HEAD); hs = o.get("heads", 0.8); b.centre(head, y0 - dy * 0.55 - H(head, hs) * 0.25, hs)
    tail = o.get("tail") or R.choice(SPEAR + SEG); ts = o.get("tails", 0.6); yb = y0 + (len(rows) - 1) * dy + dy * 0.5
    if o.get("threads"):
        for (x, y) in pos[-1]:
            if x <= 200.01:
                e = b.chain([tail] * o.get("tn", 3), ray(x, y + dy * 0.4, 0, 300), ts, ts * 0.5, both=abs(x - 200) > 0.01)
    else: b.stack([tail] * o.get("tn", 1), yb, ts, ts * 0.6)
    fin = o.get("fin")
    if fin:
        for r, row in enumerate(pos): x, y = row[0]; fs = o.get("fins", 0.6); b.pair(fin, 200 - x + dx * 0.3 + W(fin, fs) * 0.45, y, fs, o.get("finrot", 0))
    return b

def pinwheels(R, o):
    """Rotata, the pinwheels: arms that all lean the same way round a hub, so it turns instead of mirroring"""
    b = Build(); k = o.get("k", R.choice((3, 4, 5))); cy = 200; hub = o.get("hub") or R.choice(RING); hs = o.get("hubs", 0.5); arm = o.get("arm") or R.choice(WING + BLADE); a_s = o.get("arms", 0.9)
    r = H(hub, hs) * 0.38 + W(arm, a_s) * o.get("reach", 0.42)
    for i in range(k):
        a = 360 * i / k + o.get("turn", 0); ar = math.radians(a); b.put(arm, 200 - r * math.cos(ar), cy - r * math.sin(ar), a_s, a + o.get("lean", 0))
    inner = o.get("inner")
    if inner:
        s2 = o.get("inners", 0.5); r2 = H(hub, hs) * 0.3 + W(inner, s2) * 0.4
        for i in range(k): a = 360 * (i + 0.5) / k + o.get("turn", 0); ar = math.radians(a); b.put(inner, 200 - r2 * math.cos(ar), cy - r2 * math.sin(ar), s2, a + o.get("lean2", 0))
    b.put(hub, 200, cy, hs)
    eye = o.get("eye")
    if eye: b.put(eye, 200, cy, o.get("eyes", 0.5))
    return b

def arches(R, o):
    """Portata, the gates: two legs joined by a span overhead, with room to pass beneath"""
    b = Build(); seg = o.get("seg") or R.choice(SEG); s0 = o.get("s", 1.0); r = o.get("r", 78); cy = 170; legn = o.get("legn", 4)
    # the span: from the crown down each side to the springing, then the leg straight down
    b.chain([seg] * o.get("spann", 4), arc(200, cy, r, 180 - o.get("from", 14), 90), s0, s0 * 0.88)
    (x, y), _ = b.chain([o.get("leg") or seg] * legn, ray(200 - r, cy + o.get("legy", 10), o.get("splay", 0), 400), s0 * 0.88, s0 * o.get("legtaper", 0.45))
    foot = o.get("foot") or R.choice(BLADE + RIB); fs = o.get("foots", 0.8); b.pair(foot, 200 - x + o.get("footx", 0), y + H(foot, fs) * 0.35, fs, o.get("footrot", 0))
    key = o.get("key") or R.choice(HEAD + CORE); ks = o.get("keys", 0.5 if key in CORE else 1.0); b.centre(key, cy - r - o.get("keyy", 0), ks)
    pen = o.get("pen")
    if pen: b.stack([pen] * o.get("penn", 2), cy - r + H(key, ks) * 0.35, o.get("pens", 0.7), o.get("pens", 0.7) * 0.6)
    fin = o.get("fin")
    if fin:
        for a in o.get("fina", (150, 120)): fsz = o.get("fins", 0.7); rr = r + W(seg, s0) * 0.4 + W(fin, fsz) * 0.35; b.mirror(b.put(fin, 200 - rr * math.sin(math.radians(a)), cy + rr * math.cos(math.radians(a)), fsz, a - 90 + o.get("finrot", 0)))
    return b

PLANS = [("twins", "Geminata", "The twins", "Two spines side by side under one head, held together by bridges.", twins),
         ("bows", "Arcuata", "The bows", "A crescent: two horns reaching forward round an open middle.", bows),
         ("forks", "Furcata", "The forks", "One trunk that splits into several necks, a head on each.", forks),
         ("tiers", "Scalata", "The tiers", "Wide storeys stacked on a mast, each wider than the one above.", tiers),
         ("coils", "Spirata", "The coils", "A head between two horns that wind in on themselves.", coils),
         ("mirrors", "Bicipita", "The mirrors", "The same above as below: a head at both ends.", mirrors),
         ("yokes", "Jugata", "The yokes", "A long beam held crosswise, a weight at each end and pendants beneath.", yokes),
         ("lattices", "Reticulata", "The lattices", "A colony: many small bodies held in a net.", lattices),
         ("pinwheels", "Rotata", "The pinwheels", "Arms that all lean the same way round a hub: it turns instead of mirroring.", pinwheels),
         ("arches", "Portata", "The gates", "Two legs joined by a span overhead, with room to pass beneath.", arches)]

def sheet(items, path, cols=5, cell=250, title=None, head=30):
    """items: [(label, sublabel, recipe)] drawn in a grid, 1 px lines, each fitted to its cell"""
    rows = math.ceil(len(items) / cols); Wd = cols * cell; Hd = rows * (cell + 34) + head
    s = ['<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">' % (Wd, Hd, Wd, Hd), '<rect width="100%" height="100%" fill="#fff"/>']
    if title: s.append('<text x="12" y="20" font-family="monospace" font-size="13" fill="#111">%s</text>' % title)
    for n, (label, sub, rec) in enumerate(items):
        cx = (n % cols) * cell + cell / 2; cy = head + (n // cols) * (cell + 34) + cell / 2
        x0, y0, x1, y1 = bounds(rec); k = min((cell - 24) / max(1, x1 - x0), (cell - 24) / max(1, y1 - y0))
        d = path_d(rec, k, cx - (x0 + x1) / 2 * k, cy - (y0 + y1) / 2 * k)
        s.append('<g id="%s"><path d="%s" fill="none" stroke="#111" stroke-width="1" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></g>' % (rec.get("key", "c%d" % n), " ".join(d)))
        s.append('<text x="%.0f" y="%.0f" font-family="monospace" font-size="11" text-anchor="middle" fill="#111">%s</text>' % (cx, cy + cell / 2 + 12, label))
        if sub: s.append('<text x="%.0f" y="%.0f" font-family="monospace" font-size="9" text-anchor="middle" fill="#888">%s</text>' % (cx, cy + cell / 2 + 25, sub))
    open(path, "w").write("\n".join(s) + "\n</svg>\n")

# ---------- the fifty: five runs of each plan, chosen by eye from the exploration sheets (plan, seed, name, anything set by hand) ----------
PICKS = [
    ("twins", 0, "Rosary twin", {}), ("twins", 3, "Hoop twin", {}), ("twins", 5, "Honeycomb twin", {}), ("twins", 10, "Horned twin", {}), ("twins", 12, "Clasp twin", {}),
    ("bows", 3, "Ring crescent", {}), ("bows", 5, "Honeycomb crescent", {}), ("bows", 9, "Shard crescent", {}), ("bows", 14, "Lantern crescent", {}), ("bows", 2, "Thorn crescent", {}),
    ("forks", 0, "Chain hydra", {}), ("forks", 6, "Ring hydra", {}), ("forks", 11, "Plated hydra", {}), ("forks", 12, "Horned hydra", {}), ("forks", 4, "Fan hydra", {}),
    ("tiers", 2, "Frond fir", {}), ("tiers", 10, "Swept fir", {}), ("tiers", 14, "Ring fir", {}), ("tiers", 8, "Leaf fir", {}), ("tiers", 6, "Crested fir", {}),
    ("coils", 0, "Thorn ram", {}), ("coils", 4, "Hoop ram", {}), ("coils", 8, "Shard ram", {}), ("coils", 13, "Bramble ram", {}), ("coils", 3, "Ring ram", {}),
    ("mirrors", 0, "Winged janus", {}), ("mirrors", 3, "Sickle janus", {}), ("mirrors", 4, "Hooded janus", {}), ("mirrors", 11, "Long janus", {}), ("mirrors", 13, "Moth janus", {}),
    ("yokes", 3, "Ring yoke", {}), ("yokes", 10, "Hooded yoke", {}), ("yokes", 8, "Disc yoke", {}), ("yokes", 12, "Fang yoke", {}), ("yokes", 9, "Tassel yoke", {}),
    ("lattices", 2, "Lantern colony", {}), ("lattices", 8, "Hoop colony", {}), ("lattices", 14, "Disc colony", {}), ("lattices", 5, "Clasp colony", {}), ("lattices", 10, "Thorn colony", {}),
    ("pinwheels", 4, "Hook whorl", {}), ("pinwheels", 8, "Sickle whorl", {}), ("pinwheels", 13, "Flame whorl", {}), ("pinwheels", 6, "Ring whorl", {}), ("pinwheels", 12, "Thorn whorl", {}),
    ("arches", 0, "Bramble gate", {}), ("arches", 6, "Eye gate", {}), ("arches", 9, "Bead gate", {}), ("arches", 11, "Ring gate", {}), ("arches", 13, "Thorn gate", {}),
]

def build():
    fns = {p[0]: p for p in PLANS}; out = []
    for n, (plan, seed, name, o) in enumerate(PICKS):
        b = fns[plan][4](random.Random(plan + str(seed)), dict(o)); key = name.lower().replace(" ", "-")
        out.append({"key": key, "name": name, "no": n + 1, "plan": plan, "order": fns[plan][1], "uses": sorted({p["part"] for p in b.parts}), "parts": b.parts})
    return out

def candidate_sheet(cands, path, cell=236, cols=5, plans=None, title="Kit candidates: fifty new kinds, put together from the kit by rule"):
    """the fifty on one sheet: a row a plan, its rule at the left, every line 1 px"""
    plans = plans or PLANS; left = 190; rows = len(plans); Wd = left + cols * cell; rowh = cell + 30; Hd = 56 + rows * rowh
    s = ['<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">' % (Wd, Hd, Wd, Hd), '<rect width="100%" height="100%" fill="#fff"/>',
         '<text x="16" y="30" font-family="monospace" font-size="15" fill="#111">%s</text>' % title]
    for r, (pk, order, common, rule, fn) in enumerate(plans):
        y0 = 56 + r * rowh; s.append('<line x1="16" y1="%d" x2="%d" y2="%d" stroke="#ccc" stroke-width="1"/>' % (y0, Wd - 16, y0))
        s.append('<text x="16" y="%d" font-family="monospace" font-size="13" fill="#111">%s</text><text x="16" y="%d" font-family="monospace" font-size="11" fill="#666">%s</text>' % (y0 + 28, order, y0 + 46, common))
        words = rule.split(); line = ""; ly = y0 + 70
        for w in words + [""]:
            if not w or len(line) + len(w) > 23: s.append('<text x="16" y="%d" font-family="monospace" font-size="10" fill="#888">%s</text>' % (ly, line.strip())); ly += 14; line = ""
            line += " " + w
        for c, cand in enumerate([x for x in cands if x["plan"] == pk]):
            cx = left + c * cell + cell / 2; cy = y0 + cell / 2 + 4; x0, yy0, x1, y1 = bounds(cand); k = min((cell - 30) / max(1, x1 - x0), (cell - 30) / max(1, y1 - yy0))
            d = path_d(cand, k, cx - (x0 + x1) / 2 * k, cy - (yy0 + y1) / 2 * k)
            s.append('<g id="%s"><path d="%s" fill="none" stroke="#111" stroke-width="1" stroke-linejoin="round"/></g>' % (cand["key"], " ".join(d)))
            s.append('<text x="%.0f" y="%.0f" font-family="monospace" font-size="11" text-anchor="middle" fill="#111">%02d  %s</text>' % (cx, y0 + cell + 20, cand["no"], cand["name"]))
    open(path, "w").write("\n".join(s) + "\n</svg>\n")

if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "explore":
        out = sys.argv[2]; os.makedirs(out, exist_ok=True); only = sys.argv[3:] or [p[0] for p in PLANS]
        for key, order, common, rule, fn in PLANS:
            if key not in only: continue
            items = []
            for seed in range(15):
                R = random.Random(key + str(seed))
                try: b = fn(R, {}); items.append(("%s %d" % (key, seed), " ".join(sorted({p["part"] for p in b.parts}))[:44], {"parts": b.parts}))
                except Exception as e: print(key, seed, "failed:", repr(e)[:120])
            sheet(items, os.path.join(out, key + ".svg"), title=order + " · " + rule); print(key, len(items))
    else:
        cands = build()
        doc = {"about": "Candidates, not yet creatures: fifty new kinds put together from kit parts by rule (tools/kitgen/candidates.py), for Zac to pick from. Ten plans, five of each; "
                        "a plan is a silhouette the bestiary's six orders do not have. Each candidate is a recipe in the format kit-creatures.json uses (part ids and placements on a "
                        "400-wide canvas, centre line x = 200; every placement is free, with its mirror image written beside it), so a picked one moves there unchanged. Names are working names.",
               "plans": [{"key": p[0], "order": p[1], "common": p[2], "rule": p[3]} for p in PLANS], "candidates": cands}
        open(os.path.join(DATA, "kit-sources", "kit-candidates-round1.json"), "w").write(json.dumps(doc, indent=1) + "\n")
        candidate_sheet(cands, os.path.join(DATA, "kit-sources", "kit-candidates-round1.svg"))
        used = sorted({u for c in cands for u in c["uses"]})
        print("%d candidates in %d plans, %d placements, %d different kit parts -> kit-sources/kit-candidates-round1.json and .svg (round one, kept for the record; round2.py writes the current sheet)" % (len(cands), len(PLANS), sum(len(c["parts"]) for c in cands), len(used)))
