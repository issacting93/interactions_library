#!/usr/bin/env python3
"""Shape measures of a creature drawn from kit parts, to compare the species Zac designed (the kit sheets, each part where he drew it)
with candidates put together by rule.

  python3 tools/kitgen/measure.py            the designed species, the candidates, and the two side by side

What is measured, per creature (head at the top, as the sheets are drawn):
  aspect     height over width of the whole
  widest     how far down the body the widest point is (0 head, 1 tail)
  mass       how far down the middle of its filled area is
  cover      how much of its bounding box its closed shapes fill
  core       the same for the middle third of its width: is there a body on the centre line
  big        the largest part (with its mirror image) as a share of the whole's filled area
  spread     largest part's box area over the median part's
  kinds      how many different drawings it uses
  repeat     the most-used drawing as a share of all placements
  overlap    share of parts whose box is at least a quarter covered by another part's
  back       of the side parts' reach, the share that sweeps tailward of where the part meets the body (1 all back, 0 all forward)
"""
import sys, os, json, math, statistics
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kitlib import PARTS, CAT, DATA, compose
from PIL import Image, ImageDraw

def flat(lines, n=8):
    """each line as plain points (curves sampled)"""
    out = []
    for s in lines:
        pts = [s["start"]]
        for g in s["segs"]:
            p0 = pts[-1]; c = g[1:]
            if len(c) == 3: pts += [tuple(((1 - t) ** 3) * p0[k] + 3 * ((1 - t) ** 2) * t * c[0][k] + 3 * (1 - t) * t * t * c[1][k] + t ** 3 * c[2][k] for k in (0, 1)) for t in [i / n for i in range(1, n + 1)]]
            elif len(c) == 2: pts += [tuple(((1 - t) ** 2) * p0[k] + 2 * (1 - t) * t * c[0][k] + t * t * c[1][k] for k in (0, 1)) for t in [i / n for i in range(1, n + 1)]]
            elif c: pts.append(c[-1])
        out.append((pts, s["closed"]))
    return out

def measure(recipe):
    per = []   # each placement on its own: its lines and box. A left part comes with its mirror image, and a free placement is put with the mirror image written beside it
    groups = {}
    for pl in recipe["parts"]:
        gk = (pl.get("part"), round(min(pl["x"], 400 - pl["x"])), round(pl["y"]), pl.get("scale", 1)) if pl.get("free") and "part" in pl else id(pl)
        groups.setdefault(gk, []).append(pl)
    for pls in groups.values():
        L = flat(compose.lines({"parts": pls})); P = [q for pts, _ in L for q in pts]
        if not P: continue
        per.append({"pl": pls[0], "L": L, "box": (min(x for x, _ in P), min(y for _, y in P), max(x for x, _ in P), max(y for _, y in P))})
    X0 = min(p["box"][0] for p in per); Y0 = min(p["box"][1] for p in per); X1 = max(p["box"][2] for p in per); Y1 = max(p["box"][3] for p in per); Wd, Hd = X1 - X0, Y1 - Y0
    k = 400 / max(Wd, Hd); w, h = max(2, int(Wd * k) + 2), max(2, int(Hd * k) + 2)
    def raster(parts):
        im = Image.new("1", (w, h), 0); d = ImageDraw.Draw(im)
        for p in parts:
            for pts, closed in p["L"]:
                if len(pts) >= 3: d.polygon([((x - X0) * k, (y - Y0) * k) for x, y in pts], fill=1)
        return im
    im = raster(per); px = im.load(); rows = [sum(1 for x in range(w) if px[x, y]) for y in range(h)]; total = sum(rows) or 1
    widest = max(range(h), key=lambda y: max((x for x in range(w) if px[x, y]), default=0) - min((x for x in range(w) if px[x, y]), default=0)) / h
    mass = sum(y * r for y, r in enumerate(rows)) / total / h
    cx0, cx1 = int(w / 3), int(2 * w / 3); core = sum(1 for y in range(h) for x in range(cx0, cx1) if px[x, y]) / max(1, (cx1 - cx0) * h)
    areas = []
    for p in per:
        ip = raster([p]).load(); areas.append(sum(1 for y in range(0, h, 2) for x in range(0, w, 2) if ip[x, y]) * 4)
    boxa = [max(1e-6, (p["box"][2] - p["box"][0]) * (p["box"][3] - p["box"][1])) for p in per]
    draw = [CAT["parts"][p["pl"].get("part") or p["pl"].get("array") or p["pl"].get("ring")].get("drawing", "?") for p in per]
    counts = {}
    for d_ in draw: counts[d_] = counts.get(d_, 0) + 1
    def cov(a, b):
        ix = max(0, min(a[2], b[2]) - max(a[0], b[0])); iy = max(0, min(a[3], b[3]) - max(a[1], b[1])); return ix * iy / max(1e-6, (a[2] - a[0]) * (a[3] - a[1]))
    ov = sum(1 for i, p in enumerate(per) if any(j != i and cov(p["box"], q["box"]) >= 0.25 for j, q in enumerate(per))) / len(per)
    # side parts: where each meets the body (its point nearest the centre line) against the middle of its reach
    num = den = 0
    for p in per:
        pid = p["pl"].get("part"); 
        if not pid: continue
        P = [q for pts, _ in p["L"] for q in pts if q[0] <= 200]
        if len(P) < 4 or min(x for x, _ in P) > 195 or (PARTS[pid]["side"] == "center" and abs(sum(x for x, _ in P) / len(P) - 200) < 12): continue
        near = sorted(P, key=lambda q: -q[0])[: max(3, len(P) // 12)]; ya = sum(y for _, y in near) / len(near); far = sorted(P, key=lambda q: q[0])[: max(3, len(P) // 12)]; yb = sum(y for _, y in far) / len(far); reach = 200 - min(x for x, _ in P)
        if reach < 0.06 * Wd: continue
        num += reach * (1 if yb > ya else 0); den += reach
    return {"aspect": Hd / Wd, "widest": widest, "mass": mass, "cover": total / (w * h), "core": core, "big": max(areas) / total, "spread": max(boxa) / statistics.median(boxa),
            "kinds": len(counts), "repeat": max(counts.values()) / len(per), "overlap": ov, "back": (num / den) if den else float("nan"), "parts": len(per)}

def species():
    out = []
    for sid, sh in CAT["sheets"].items():
        if sh["family"] in ("marks", "mechs"): continue
        ps = [p for p in PARTS.values() if p["species"] == sid and not CAT["parts"][p["id"]].get("hidden")]
        if len(ps) < 4: continue   # a sheet that is one fused drawing says nothing about how parts are put together
        out.append((sh["name"], measure({"parts": [{"part": p["id"], "x": p["ox"], "y": p["oy"]} for p in ps]})))
    return out

KEYS = ["aspect", "widest", "mass", "cover", "core", "big", "spread", "kinds", "repeat", "overlap", "back", "parts"]
def summary(rows):
    r = {}
    for k in KEYS:
        v = sorted(x[1][k] for x in rows if not math.isnan(x[1][k])); r[k] = (v[len(v) // 4], statistics.median(v), v[(3 * len(v)) // 4]) if v else (0, 0, 0)
    return r

if __name__ == "__main__":
    S = species(); cands = json.load(open(os.path.join(DATA, "kit-candidates.json")))["candidates"]; Cn = [(c["name"], measure(c), c["plan"]) for c in cands]
    a, b = summary(S), summary(Cn)
    print("%d designed species (sheets of four parts or more), %d candidates. Each cell: lower quartile / median / upper quartile" % (len(S), len(Cn)))
    print("%-9s %-26s %-26s" % ("", "designed", "candidates"))
    for k in KEYS: print("%-9s %-26s %-26s" % (k, " / ".join("%.2f" % x for x in a[k]), " / ".join("%.2f" % x for x in b[k])))
    if "--all" in sys.argv:
        for name, m in S: print("%-24s" % name, " ".join("%s %.2f" % (k, m[k]) for k in KEYS))
    print("\ncandidates by plan (medians)")
    for plan in dict.fromkeys(c[2] for c in Cn):
        s = summary([c for c in Cn if c[2] == plan]); print("%-10s" % plan, " ".join("%s %.2f" % (k, s[k][1]) for k in KEYS))
