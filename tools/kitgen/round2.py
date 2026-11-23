#!/usr/bin/env python3
"""Kit candidates, round two: new kinds of creature built to the grammar of the species Zac designed.

  python3 tools/kitgen/round2.py                  write packages/kit/data/kit-candidates.json and kit-sources/kit-candidates.svg (the picks below)
  python3 tools/kitgen/round2.py explore <dir>    run every plan over many seeds, keep what passes the gate, draw the best of each plan to choose from

Round one (candidates.py) laid one segment end to end along a line. The study that followed (measure.py; forge-kit-shape-grammar.md)
found what the designed species do instead, and each rule here is one of its findings:

  zones      a small head, one dominant mass about a third of the way down, a short tail of shrinking segments, often with a flourish
  budget     eight or more different drawings (eleven is typical), none more than a quarter of the placements, the largest part a quarter of the area or more.
             A run of segments is kindred drawings, each different: the designed species almost never use one drawing twice
  wings      the largest side pair roots at the shoulders and carries the silhouette; a smaller pair may sit behind it
  layers     parts overlap their neighbours; nothing is laid end to end
  nature     only what travels has a head (the five-armed drifters have none); a colony is zones and repeated sets, not one node everywhere

Every plan is still a silhouette the six orders do not have. A candidate goes on the sheet only if measure.py puts it inside the
designed species' range (GATE below); of those, the picks were chosen by eye.
"""
import sys, os, json, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kitlib import DATA, PARTS, compose, bounds, path_d
import candidates as C1
from candidates import Build, W, H, bb, arc, ray, spiral, SEG, CLASP, HEAD, BAR, CORE, RING, SPEAR, WING, BLADE, RIB, BEAD
import measure as M

MASS = CORE + "P687 P159 P230 P558 P696".split()            # what can be the dominant body: the ornate centre bodies and the largest lanterns
LONG = "P651 P720 P475 P654 P085 P182 P687".split()         # the tall ones, for a mantle
EYE = "P274 P052 P207 P235".split()                         # small rings, used in pairs as eyes
END = "P713 P032 P146 P587 P571 P098 P661".split()          # what a tail ends in
FLOAT = "P169 P022 P707 P234 P075".split()                  # a colony's float, a drifter's hub
# The designed species almost never repeat a drawing: the segments of a tail are each drawn on their own, alike but not the same.
# So a run is taken from a family of kindred drawings, each used once before any comes round again.
FAMS = ["P285 P259 P564 P129 P179".split(), "P110 P226 P195 P055 P587 P146".split(), "P276 P295 P534 P147 P612".split(), "P050 P051 P205 P123 P124 P423".split(),
        "P641 P142 P140 P277 P280 P296 P479".split()]
RIBS = ["P431 P430 P429 P432 P433".split(), "P245 P252 P254 P256".split(), "P556 P555 P554 P557".split(), "P464 P463 P462 P470 P474".split(), "P491 P490 P489 P496".split(),
        "P183 P184 P192 P186 P185".split(), "P395 P396 P424 P400".split(), "P656 P660 P666 P670 P718".split()]
for _p in MASS + LONG + EYE + END + FLOAT + [x for f in FAMS + RIBS for x in f]: assert _p in PARTS, _p
def run(R, n, fams=FAMS):
    """n kindred drawings for a run, each used once before any repeats"""
    f = list(R.choice(fams)); R.shuffle(f); return [f[i % len(f)] for i in range(n)]

_root = {}
def root(pid):
    """where a side part meets the body, in its own frame: the middle of its edge nearest the centre line (parts are drawn for the left side, so that is its right edge)"""
    if pid not in _root:
        P = [q for pts, _ in M.flat(compose.lines({"parts": [{"part": pid, "x": 0, "y": 0, "free": True}]})) for q in pts]; x1 = max(x for x, _ in P); w = x1 - min(x for x, _ in P)
        near = [q for q in P if q[0] >= x1 - 0.12 * w]; _root[pid] = (x1 - 0.06 * w, sum(y for _, y in near) / len(near))
    return _root[pid]

class B2(Build):
    def by_root(self, pid, x, y, s=1, rot=0, flip=False, both=True):
        """a side part with its root at x, y (left of the centre line), and its mirror image"""
        rx, ry = root(pid); rx, ry = rx * s, ry * s * (-1 if flip else 1); a = math.radians(rot)
        pl = {"part": pid, "x": round(x - (rx * math.cos(a) - ry * math.sin(a)), 1), "y": round(y - (rx * math.sin(a) + ry * math.cos(a)), 1), "scale": round(s, 3), "free": True}
        if rot: pl["rotate"] = round(rot, 1)
        if flip: pl["flipY"] = True
        self.parts.append(pl)
        if both: self.mirror(pl)
        return pl

def along(b, pids, pts, w0, w1, lap=0.72, both=True, flip=False):
    """a run laid along a line of points, each part scaled to a width running from w0 to w1; returns where it ended and its heading"""
    seg = [math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(len(pts) - 1)]; total = sum(seg)
    def at(t):
        for i, L in enumerate(seg):
            if t <= L or i == len(seg) - 1: u = max(0.0, t / L) if L else 0; a, q = pts[i], pts[i + 1]; return (a[0] + (q[0] - a[0]) * u, a[1] + (q[1] - a[1]) * u), ((q[0] - a[0]) / (L or 1), (q[1] - a[1]) / (L or 1))
            t -= L
    t = 0; n = len(pids); end = (pts[0], (0, 1))
    for i, pid in enumerate(pids):
        s = (w0 + (w1 - w0) * i / max(1, n - 1)) / W(pid); L = H(pid, s); (x, y), (tx, ty) = at(min(total, t + L / 2)); pl = b.put(pid, x, y, s, math.degrees(math.atan2(-tx, ty)), flip)
        if both: b.mirror(pl)
        t += L * lap; end = (at(min(t, total))[0], (tx, ty))
    return end
def mass(b, R, top, width, pool=MASS, cx=200, pid=None):
    """the dominant body, its top at `top`, scaled to `width`; cx off the centre line makes a pair"""
    pid = pid or R.choice(pool); s = width / W(pid); h = H(pid, s)
    pl = b.put(pid, cx, top + h / 2, s)
    if abs(cx - 200) > 0.5: b.mirror(pl)
    return {"pid": pid, "s": s, "top": top, "bot": top + h, "w": width, "h": h, "cy": top + h / 2, "cx": cx}
def head(b, R, m, size=0.5, eyes=True, cx=200, pid=None):
    """a small head set into the top of the mass, with a pair of ring eyes"""
    pid = pid or R.choice(HEAD); s = m["w"] * size / W(pid); h = H(pid, s); y = m["top"] - h * 0.22; b.put(pid, cx, y, s)
    if eyes and cx == 200: e = R.choice(EYE); es = m["w"] * 0.1 / W(e); b.pair(e, W(pid, s) * 0.24, y + h * 0.1, es)
    return y - h / 2
def details(b, R, m, n=2):
    """small things layered on the mass: a ring at its heart, a clasp or bead lower down"""
    pool = [RING[0], RING[1]] + BEAD + CLASP; got = []
    for i in range(n):
        pid = R.choice([p for p in pool if p not in got]); got.append(pid); s = m["w"] * (0.3 if i == 0 else 0.2) / max(W(pid), H(pid)); b.put(pid, m.get("cx", 200), m["top"] + m["h"] * (0.42 if i == 0 else 0.74), s)
def wings(b, R, m, frac=0.3, ratio=1.5, pool=WING, inset=0.26, flip=False, rot=0, pid=None, cx=None):
    """a side pair rooted on the mass `frac` of the way down it, sized so the pair's boxes come to `ratio` times the mass's"""
    pid = pid or R.choice(pool); s = math.sqrt(ratio * m["w"] * m["h"] / (2 * W(pid) * H(pid))); s = max(0.45, min(2.2, s))
    x = (cx if cx is not None else 200) - m["w"] * inset; b.by_root(pid, x, m["top"] + m["h"] * frac, s, rot, flip); return pid, s
def tail(b, R, y, n, width, shrink=0.88, lap=0.7, end=True, cx=200, seg=None, endp=None):
    """a short run of shrinking segments down from y, and what it ends in"""
    ws = width
    for pid in (seg or run(R, n)):
        s = ws / W(pid); h = H(pid, s); pl = b.put(pid, cx, y + h / 2, s)
        if abs(cx - 200) > 0.5: b.mirror(pl)
        y += h * lap; ws *= shrink
    if end:
        e = endp or R.choice(END); es = width * 1.25 / W(e) if W(e) > H(e) else width * 0.9 / W(e); es = min(es, 1.3); pl = b.put(e, cx, y + H(e, es) * 0.36, es)
        if abs(cx - 200) > 0.5: b.mirror(pl)
        y += H(e, es) * 0.8
    return y

# ---------- the ten plans ----------
def conjoined(R):
    """Geminata: two bodies grown together under one head, a wing and a tail to each"""
    b = B2(); w = R.uniform(105, 125); d = w * R.uniform(0.36, 0.44); pid = R.choice(MASS); m = mass(b, R, 150, w, cx=200 - d, pid=pid)
    wings(b, R, m, R.uniform(0.2, 0.4), R.uniform(1.6, 2.4), cx=200 - d); wings(b, R, m, 0.8, 0.45, pool=BLADE, cx=200 - d)
    k = R.choice(RING[:2] + CLASP); b.centre(k, m["cy"], d * 1.0 / max(W(k), H(k)))                       # the join
    hp = R.choice(HEAD); hs = d * 1.7 / W(hp); b.centre(hp, m["top"] + m["h"] * 0.08, hs); e = R.choice(EYE); b.pair(e, W(hp, hs) * 0.25, m["top"] + m["h"] * 0.02, w * 0.1 / W(e))
    y = tail(b, R, m["bot"] - m["h"] * 0.16, R.randint(4, 5), w * 0.24, cx=200 - d * 0.92, endp=R.choice(END[:4]))
    br = R.choice(BEAD); b.centre(br, m["bot"] + 14, d * 0.9 / max(W(br), H(br)))
    return b
def hydra(R):
    """Furcata: one body, three necks, a head on each"""
    b = B2(); w = R.uniform(115, 145); m = mass(b, R, 210, w); details(b, R, m, 2); wings(b, R, m, R.uniform(0.3, 0.5), R.uniform(1.3, 2.0)); wings(b, R, m, 0.82, 0.4, pool=BLADE)
    neck = run(R, 4); hp = R.choice(HEAD)
    for a in (0, R.uniform(34, 46)):
        L = R.uniform(72, 92) * (1 if a == 0 else 0.92); (x, y), (tx, ty) = along(b, neck, ray(200 - math.sin(math.radians(a)) * w * 0.16, m["top"] + m["h"] * 0.16, 180 - a, L), w * 0.2, w * 0.14, both=(a != 0), flip=True)
        hs = w * (0.36 if a == 0 else 0.3) / W(hp); pl = b.put(hp, x + tx * H(hp, hs) * 0.2, y + ty * H(hp, hs) * 0.2, hs, math.degrees(math.atan2(-tx, ty)) + 180)
        if a != 0: b.mirror(pl)
    tail(b, R, m["bot"] - m["h"] * 0.14, R.randint(4, 5), w * 0.24); return b
def ram(R):
    """Spirata: a body whose two horns wind in on themselves"""
    b = B2(); w = R.uniform(120, 150); m = mass(b, R, 170, w); details(b, R, m, 2); head(b, R, m, 0.42)
    r0 = R.uniform(62, 78); cx = 200 - w * 0.34 - r0 * 0.72; cy = m["top"] + m["h"] * 0.1
    (x, y), (tx, ty) = along(b, run(R, 6), spiral(cx, cy, r0, r0 * 0.34, -112, R.uniform(0.72, 0.9)), w * 0.25, w * 0.12, lap=0.74)
    tip = R.choice(BLADE[:20]); ts = w * 0.3 / max(W(tip), H(tip)); b.mirror(b.put(tip, x + tx * 8, y + ty * 8, ts, math.degrees(math.atan2(-tx, ty)) - 90))
    wings(b, R, m, 0.62, R.uniform(0.6, 0.9), pool=BLADE + WING[20:]); tail(b, R, m["bot"] - m["h"] * 0.14, R.randint(4, 6), w * 0.24); return b
def janus(R):
    """Bicipita: the same above as below, a head at both ends"""
    b = B2(); w = R.uniform(110, 135); pid = R.choice(MASS); s = w / W(pid); h = H(pid, s); cy = 250; b.put(pid, 200, cy, s); m = {"pid": pid, "s": s, "top": cy - h / 2, "bot": cy + h / 2, "w": w, "h": h, "cy": cy}
    k = R.choice(RING[:2]); b.centre(k, cy, w * 0.3 / W(k)); wp = R.choice(WING); ws = math.sqrt(R.uniform(0.8, 1.2) * w * h / (2 * W(wp) * H(wp))); bp = R.choice(BLADE); segs = run(R, 3); hp = R.choice(HEAD); e = R.choice(EYE)
    for up in (True, False):
        g = -1 if up else 1; b.by_root(wp, 200 - w * 0.24, cy + g * h * 0.2, ws, 0, flip=up); b.by_root(bp, 200 - w * 0.2, cy + g * h * 0.42, w * 0.34 / max(W(bp), H(bp)), 0, flip=up)
        y = cy + g * h * 0.4; nw = w * 0.24
        for seg in segs: sg = nw / W(seg); hh = H(seg, sg); b.put(seg, 200, y + g * hh / 2, sg, 0, flip=up); y += g * hh * 0.7; nw *= 0.86
        hs = w * 0.44 / W(hp); b.put(hp, 200, y + g * H(hp, hs) * 0.3, hs, 0, flip=not up); b.pair(e, W(hp, hs) * 0.24, y + g * H(hp, hs) * 0.3, w * 0.09 / W(e))
    return b
def fir(R):
    """Scalata: storeys of wings on a mast, each wider than the one above, the body at the foot"""
    b = B2(); w = R.uniform(110, 135); mast = run(R, 7); hp = R.choice(HEAD); hs = w * 0.42 / W(hp); y = 96; b.centre(hp, y, hs); e = R.choice(EYE); b.pair(e, W(hp, hs) * 0.24, y, w * 0.09 / W(e)); y += H(hp, hs) * 0.3
    small = R.choice(BLADE); mid = R.choice(BLADE + WING[18:])
    for i, (pid, size) in enumerate(((small, 0.34), (mid, 0.6))):
        for j in range(2): seg = mast[i * 2 + j]; sg = w * 0.22 / W(seg); hh = H(seg, sg); b.centre(seg, y + hh / 2, sg); y += hh * 0.7
        s = w * size * 1.5 / max(W(pid), H(pid)); b.by_root(pid, 200 - W(seg, sg) * 0.2, y - H(seg, sg) * 0.5, s)
    m = mass(b, R, y - 10, w); details(b, R, m, 1); wings(b, R, m, 0.24, R.uniform(1.8, 2.6)); tail(b, R, m["bot"] - m["h"] * 0.14, 3, w * 0.22, seg=mast[4:7]); return b
def colony(R):
    """Sociata: a float, a cluster of bells beneath it, then the same set of parts again and again down a stem"""
    b = B2(); w = R.uniform(120, 150); m = mass(b, R, 110, w, pool=FLOAT + MASS[:6]); k = R.choice(EYE + BEAD[:2]); b.centre(k, m["cy"], w * 0.22 / max(W(k), H(k)))
    bell = R.choice(HEAD)
    for i, a in enumerate((58, 26)):   # two pairs of bells round the lower half of the float
        s = w * (0.4 - 0.06 * i) / W(bell); r = m["h"] * 0.5; pl = b.put(bell, 200 - r * math.sin(math.radians(a)) * (w / m["h"]) * 0.9, m["cy"] + r * math.cos(math.radians(a)) + H(bell, s) * 0.2, s, a * 0.5); b.mirror(pl)
    n = R.randint(3, 4); stem = run(R, n); arms = run(R, n, RIBS); bead = R.choice(BEAD + CLASP); y = m["bot"] + 6; sc = 1.0
    for i in range(n):   # the repeated set: a link of stem, a pair of feeders, a bead
        seg = stem[i]; arm = arms[i]; sg = w * 0.2 * sc / W(seg); hh = H(seg, sg); b.centre(seg, y + hh / 2, sg); sa = w * 0.5 * sc / max(W(arm), H(arm)); b.by_root(arm, 200 - W(seg, sg) * 0.25, y + hh * 0.45, sa); b.centre(bead, y + hh * 0.9, w * 0.12 * sc / max(W(bead), H(bead))); y += hh * 0.92; sc *= 0.84
    e = R.choice(END[:4]); es = w * 0.2 / W(e); b.centre(e, y + H(e, es) * 0.4, min(es, 1.2)); return b
def crescent(R):
    """Arcuata: the body at the rear, its two great wings swept forward round an open middle, a lure held between them"""
    b = B2(); w = R.uniform(115, 140); m = mass(b, R, 230, w); details(b, R, m, 2)
    pid, s = wings(b, R, m, R.uniform(0.22, 0.4), R.uniform(2.0, 3.0), flip=True, rot=R.uniform(-8, 10))          # flipped head to tail: what swept back now sweeps forward
    wings(b, R, m, 0.7, 0.5, pool=BLADE + WING[22:])
    y = m["top"] + m["h"] * 0.12; ws = w * 0.14
    for stalk in run(R, 3): ss = ws / W(stalk); hh = H(stalk, ss); b.put(stalk, 200, y - hh / 2, ss, 0, flip=True); y -= hh * 0.72; ws *= 0.86
    lure = R.choice(RING[:2] + HEAD[:8]); ls = w * 0.36 / max(W(lure), H(lure)); b.centre(lure, y - H(lure, ls) * 0.3, ls)
    e = R.choice(EYE); b.pair(e, w * 0.2, m["top"] + m["h"] * 0.2, w * 0.1 / W(e)); tail(b, R, m["bot"] - m["h"] * 0.14, R.randint(3, 4), w * 0.24); return b
def drifter(R):
    """Quinata: five arms round a hub and no head, each arm the same on both its sides"""
    b = B2(); w = R.uniform(140, 170); pid = R.choice(FLOAT + MASS[:8]); s = w / max(W(pid), H(pid)); cy = 250; b.put(pid, 200, cy, s); k = R.choice(RING[:2]); b.put(k, 200, cy, w * 0.34 / W(k)); e = R.choice(EYE); b.put(e, 200, cy, w * 0.12 / W(e))
    base = R.choice(HEAD); segs = run(R, 3); tip = R.choice(END[:4]); r0 = min(W(pid, s), H(pid, s)) * 0.36; turn = R.choice((0, 180))
    for i in range(5):
        a = turn + 72 * i
        if a % 360 > 180.01: continue          # the arms on the right are the mirror images of those on the left
        both = (a % 180) > 0.01; x0, y0 = 200 - math.sin(math.radians(a)) * r0, cy + math.cos(math.radians(a)) * r0; dx, dy = -math.sin(math.radians(a)), math.cos(math.radians(a)); rot = math.degrees(math.atan2(-dx, dy))
        bs = w * 0.36 / W(base); t = H(base, bs) * 0.3; pl = b.put(base, x0 + dx * t, y0 + dy * t, bs, rot + 180)
        if both: b.mirror(pl)
        t += H(base, bs) * 0.32; ws = w * 0.17
        for seg in segs:
            sg = ws / W(seg); hh = H(seg, sg); pl = b.put(seg, x0 + dx * (t + hh / 2), y0 + dy * (t + hh / 2), sg, rot)
            if both: b.mirror(pl)
            t += hh * 0.7; ws *= 0.84
        ts = w * 0.14 / W(tip); pl = b.put(tip, x0 + dx * (t + H(tip, ts) * 0.36), y0 + dy * (t + H(tip, ts) * 0.36), min(ts, 1.2), rot)
        if both: b.mirror(pl)
    return b
def shield(R):
    """Scutata: a head shield, a middle of paired ribs that swell and narrow, a tail shield: three lobes side by side"""
    b = B2(); w = R.uniform(110, 135); bar = R.choice(BAR); bs = w * 1.7 / W(bar); y0 = 120; m = mass(b, R, y0 + H(bar, bs) * 0.35, w); details(b, R, m, 1)
    b.centre(bar, y0 + H(bar, bs) * 0.3, bs); e = R.choice(EYE); b.pair(e, W(bar, bs) * 0.2, y0 + H(bar, bs) * 0.3, w * 0.1 / W(e))
    n = R.randint(5, 6); ribs = run(R, n, RIBS); axis = run(R, n); y = m["top"] + m["h"] * 0.5; ws = w * 0.24
    for i in range(n):
        u = i / (n - 1); swell = 0.7 + 0.5 * math.sin(math.pi * (0.25 + 0.75 * u)); rib = ribs[i]; seg = axis[i]; rs = w * 0.62 * swell / max(W(rib), H(rib)); sg = ws / W(seg); hh = H(seg, sg)
        b.centre(seg, y + hh / 2, sg); b.by_root(rib, 200 - W(seg, sg) * 0.3, y + hh * 0.4, rs, -8 - 10 * u); y += hh * 0.66; ws *= 0.93
    py = R.choice(HEAD + BAR[3:8]); ps = w * 0.62 / W(py); b.centre(py, y + H(py, ps) * 0.3, ps, flip=True); e2 = R.choice(END[:4]); es = w * 0.2 / W(e2); b.centre(e2, y + H(py, ps) * 0.5 + H(e2, es) * 0.4, min(1.2, es)); return b
def arrow(R):
    """Sagittata: arms at the front, a long mantle, and the great fins at the very back"""
    b = B2(); w = R.uniform(84, 104); pid = R.choice(LONG); m = mass(b, R, 190, w, pid=pid); details(b, R, m, 2)
    wings(b, R, m, R.uniform(0.62, 0.8), R.uniform(1.4, 2.2)); wings(b, R, m, 0.3, 0.3, pool=BLADE)
    hp = R.choice(HEAD); hs = w * 0.6 / W(hp); hy = m["top"] + H(hp, hs) * 0.1; b.centre(hp, hy, hs); e = R.choice(EYE); b.pair(e, W(hp, hs) * 0.3, hy + 4, w * 0.13 / W(e))
    arm = run(R, 4)
    for a, L in ((R.uniform(10, 16), 96), (R.uniform(34, 44), 74)):
        (x, y), (tx, ty) = along(b, arm, ray(200 - math.sin(math.radians(a)) * w * 0.2, hy - H(hp, hs) * 0.2, 180 - a, L), w * 0.2, w * 0.12)
        tp = R.choice(["P110", "P226", "P146", "P587"]); ts = w * 0.12 / W(tp); b.mirror(b.put(tp, x + tx * H(tp, ts) * 0.3, y + ty * H(tp, ts) * 0.3, ts, math.degrees(math.atan2(-tx, ty))))
    e3 = R.choice(END[:4]); es = w * 0.3 / W(e3); b.centre(e3, m["bot"] + H(e3, es) * 0.3, min(1.3, es)); return b

PLANS = [("conjoined", "Geminata", "The twins", "Two bodies grown together under one head, a wing and a tail to each.", conjoined),
         ("hydra", "Furcata", "The hydras", "One body, three necks, a head on each.", hydra),
         ("ram", "Spirata", "The rams", "A body whose two horns wind in on themselves.", ram),
         ("janus", "Bicipita", "The januses", "The same above as below: a head at both ends.", janus),
         ("fir", "Scalata", "The firs", "Storeys of wings on a mast, each wider than the last, the body at the foot.", fir),
         ("colony", "Sociata", "The colonies", "A float, a cluster of bells, then the same set of parts repeated down a stem.", colony),
         ("crescent", "Arcuata", "The crescents", "The body at the rear, two great wings swept forward round an open middle, a lure between.", crescent),
         ("drifter", "Quinata", "The drifters", "Five arms round a hub and no head: it has no front.", drifter),
         ("shield", "Scutata", "The shields", "A head shield, paired ribs that swell and narrow, a tail shield.", shield),
         ("arrow", "Sagittata", "The arrows", "Arms at the front, a long mantle, the great fins at the very back.", arrow)]

# the designed species' range (measure.py): a candidate outside it does not go on the sheet
GATE = {"kinds": (8, 99), "repeat": (0, 0.25), "big": (0.25, 1), "overlap": (0.75, 1), "core": (0.30, 1), "aspect": (0.6, 2.0)}
MED = {"kinds": 11, "repeat": 0.15, "big": 0.44, "overlap": 0.90, "core": 0.42, "aspect": 1.03}
def passes(m): return all(GATE[k][0] <= m[k] <= GATE[k][1] for k in GATE)
def score(m):
    """how far from the designed species' medians, lower is nearer (each measure in units of its own median)"""
    return sum(abs(m[k] - MED[k]) / MED[k] for k in ("repeat", "big", "overlap", "core")) + max(0, 11 - m["kinds"]) * 0.1

def make(plan, seed):
    fn = {p[0]: p[4] for p in PLANS}[plan]; b = fn(random.Random("r2" + plan + str(seed))); return b.parts

# the fifty: five of each plan, chosen by eye from the candidates that passed the gate (plan, seeds)
PICKS = [("conjoined", (47, 38, 5, 40, 37)), ("hydra", (57, 31, 69, 37, 29)), ("ram", (49, 57, 15, 68, 42)), ("janus", (30, 43, 1, 58, 44)), ("fir", (65, 20, 4, 29, 48)),
         ("colony", (53, 52, 15, 13, 48)), ("crescent", (51, 2, 56, 44, 66)), ("drifter", (19, 57, 20, 13, 22)), ("shield", (3, 41, 8, 50, 68)), ("arrow", (67, 59, 36, 41, 12))]
NOUN = {"conjoined": "twin", "hydra": "hydra", "ram": "ram", "janus": "janus", "fir": "fir", "colony": "colony", "crescent": "crescent", "drifter": "drifter", "shield": "shield", "arrow": "arrow"}

def build():
    """the picks as recipes, each with its measures. A working name comes from the species whose part is its largest: 'Sickle twin' wears a Sickle swift's wing"""
    from kitlib import CAT
    out = []; used = set(); n = 0
    for plan, seeds in PICKS:
        order = [p for p in PLANS if p[0] == plan][0][1]
        for seed in seeds:
            parts = make(plan, seed); m = M.measure({"parts": parts}); n += 1
            big = sorted({p["part"] for p in parts}, key=lambda pid: -W(pid, max(q["scale"] for q in parts if q["part"] == pid)) * H(pid, max(q["scale"] for q in parts if q["part"] == pid)))
            name = None
            for pid in big:
                for word in CAT["sheets"][PARTS[pid]["species"]]["name"].replace("-", " ").split():
                    cand = word.capitalize() + " " + NOUN[plan]
                    if cand.lower() not in used and word.lower() not in ("new", "a", "b", "c", "ii", "plates"): name = cand; break
                if name: break
            used.add(name.lower())
            out.append({"key": name.lower().replace(" ", "-"), "name": name, "no": n, "plan": plan, "order": order, "seed": seed, "uses": sorted({p["part"] for p in parts}),
                        "measures": {k: round(m[k], 2) for k in ("kinds", "repeat", "big", "overlap", "core", "aspect")}, "passes": passes(m), "parts": parts})
    return out

if __name__ == "__main__":
    if len(sys.argv) < 2:
        cands = build(); bad = [c["name"] for c in cands if not c["passes"]]
        doc = {"about": "Candidates, not yet creatures: fifty new kinds put together from kit parts by rule (tools/kitgen/round2.py), for Zac to pick from. Round two: built to the grammar "
                        "measured from the species he designed (a small head, one dominant mass, shoulder wings that carry the silhouette, a short tail of kindred segments, parts layered, "
                        "hardly any drawing used twice), and each one checked against those species' range (measures). Ten plans, five of each; a plan is a silhouette the six orders do "
                        "not have. Recipes are in kit-creatures.json's format (part ids and placements on a 400-wide canvas, centre line x = 200; every placement free, its mirror image "
                        "beside it). Names are working names, taken from the species whose part is the candidate's largest.",
               "gate": GATE, "plans": [{"key": p[0], "order": p[1], "common": p[2], "rule": p[3]} for p in PLANS], "candidates": cands}
        open(os.path.join(DATA, "kit-candidates.json"), "w").write(json.dumps(doc, indent=1) + "\n")
        C1.candidate_sheet(cands, os.path.join(DATA, "kit-sources", "kit-candidates.svg"), plans=PLANS, title="Kit candidates, round two: fifty new kinds, built to the designed species' grammar")
        import statistics
        print("%d candidates, %d different kit parts; outside the gate: %s" % (len(cands), len({u for c in cands for u in c["uses"]}), ", ".join(bad) or "none"))
        print("medians: " + ", ".join("%s %.2f" % (k, statistics.median(c["measures"][k] for c in cands)) for k in ("kinds", "repeat", "big", "overlap", "core", "aspect")))
    elif len(sys.argv) > 2 and sys.argv[1] == "explore":
        out = sys.argv[2]; os.makedirs(out, exist_ok=True); only = sys.argv[3:] or [p[0] for p in PLANS]; N = 70
        for key, order, common, rule, fn in PLANS:
            if key not in only: continue
            ok = []; fail = {}
            for seed in range(N):
                try: parts = make(key, seed); m = M.measure({"parts": parts})
                except Exception as e: fail["error " + repr(e)[:60]] = fail.get("error " + repr(e)[:60], 0) + 1; continue
                if passes(m): ok.append((score(m), seed, parts, m))
                else:
                    for k in GATE:
                        if not GATE[k][0] <= m[k] <= GATE[k][1]: fail[k] = fail.get(k, 0) + 1
            ok.sort(key=lambda t: t[0])
            items = [("%s %d" % (key, seed), "kinds %d rep %.2f big %.2f core %.2f" % (m["kinds"], m["repeat"], m["big"], m["core"]), {"parts": parts}) for sc, seed, parts, m in ok[:15]]
            if items: C1.sheet(items, os.path.join(out, key + ".svg"), title=order + " · " + rule)
            print("%-10s %d of %d pass; failed on: %s" % (key, len(ok), N, ", ".join("%s %d" % kv for kv in sorted(fail.items(), key=lambda kv: -kv[1]))))
