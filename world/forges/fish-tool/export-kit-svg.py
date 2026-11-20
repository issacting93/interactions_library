#!/usr/bin/env python3
"""Every creature of the kit as a clean SVG line drawing, 1 px wide.
  python3 world/forges/fish-tool/export-kit-svg.py [out-dir]     (default: world/forges/fish-tool/exports/kit-svg)
Reads the kit itself (shared/data/creature-parts.json: every sheet's parts, each where it sits on its sheet; a part drawn for the left
side is mirrored to the right about the sheet's centre line) with the names in creature-catalog.json, and writes one file a creature
plus sheet.svg with all of them. For each creature: every transform is worked into the points (so the file is plain coordinates), fills,
masks and colours are dropped, exact doubles and zero-length pieces are removed, pieces whose ends touch are joined into one path
(and closed where a path meets its own start), and the longest side is set to 1024 px with a 1 px stroke."""
import sys, os, re, math
import xml.etree.ElementTree as ET
import json
HERE = os.path.dirname(os.path.abspath(__file__)); DATA = os.path.join(HERE, "../../../shared/data")
CX = 200      # every sheet's centre line
WHOLE = {"sheet-drape-vampire": "kit-sources/drape-vampire-2026-11-19.svg"}      # sheets redrawn as one finished creature
SKIP = {"sheet-eyes",               # a sheet of loose eye parts, not a creature
        "sheet-new-ornaments",      # a sheet of loose ornaments, not a creature
        "sheet-studded-leech"}      # kept in the kit as a mesh of triangles with no outline to read: its drawing comes from export-svg.mjs (leech.svg)
OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "exports/kit-svg"))
SIZE, PAD, JOIN = 1024, 16, 0.6     # px at the written size; JOIN: ends this close are one point
NS = "{http://www.w3.org/2000/svg}"

def mat(t):
    m = (1, 0, 0, 1, 0, 0)
    for name, args in re.findall(r"(\w+)\(([^)]*)\)", t or ""):
        a = [float(x) for x in re.findall(r"-?\d*\.?\d+(?:e-?\d+)?", args)]
        n = {"translate": lambda: (1, 0, 0, 1, a[0], a[1] if len(a) > 1 else 0), "scale": lambda: (a[0], 0, 0, a[1] if len(a) > 1 else a[0], 0, 0),
             "matrix": lambda: tuple(a), "rotate": lambda: (math.cos(math.radians(a[0])), math.sin(math.radians(a[0])), -math.sin(math.radians(a[0])), math.cos(math.radians(a[0])), 0, 0)}[name]()
        m = mul(m, n)
    return m
def mul(m, n): return (m[0]*n[0]+m[2]*n[1], m[1]*n[0]+m[3]*n[1], m[0]*n[2]+m[2]*n[3], m[1]*n[2]+m[3]*n[3], m[0]*n[4]+m[2]*n[5]+m[4], m[1]*n[4]+m[3]*n[5]+m[5])
def ap(m, p): return (m[0]*p[0]+m[2]*p[1]+m[4], m[1]*p[0]+m[3]*p[1]+m[5])

def arc(p0, rx, ry, phi, fa, fs, p1):      # an elliptical arc as cubic segments
    if rx == 0 or ry == 0 or p0 == p1: return [("L", p1)]
    phi = math.radians(phi); c, s = math.cos(phi), math.sin(phi); dx, dy = (p0[0]-p1[0])/2, (p0[1]-p1[1])/2
    x1, y1 = c*dx+s*dy, -s*dx+c*dy; rx, ry = abs(rx), abs(ry); lam = x1*x1/(rx*rx)+y1*y1/(ry*ry)
    if lam > 1: rx *= math.sqrt(lam); ry *= math.sqrt(lam)
    den = rx*rx*y1*y1+ry*ry*x1*x1; k = math.sqrt(max(0, (rx*rx*ry*ry-den)/den)) * (-1 if fa == fs else 1)
    cx1, cy1 = k*rx*y1/ry, -k*ry*x1/rx; cx, cy = c*cx1-s*cy1+(p0[0]+p1[0])/2, s*cx1+c*cy1+(p0[1]+p1[1])/2
    ang = lambda ux, uy: math.atan2(uy, ux); t1 = ang((x1-cx1)/rx, (y1-cy1)/ry); dt = ang((-x1-cx1)/rx, (-y1-cy1)/ry) - t1
    if fs and dt < 0: dt += 2*math.pi
    if not fs and dt > 0: dt -= 2*math.pi
    n = max(1, math.ceil(abs(dt)/(math.pi/2))); d = dt/n; t = 4/3*math.tan(d/4); out = []
    pt = lambda a: (cx+rx*math.cos(a)*c-ry*math.sin(a)*s, cy+rx*math.cos(a)*s+ry*math.sin(a)*c)
    dv = lambda a: (-rx*math.sin(a)*c-ry*math.cos(a)*s, -rx*math.sin(a)*s+ry*math.cos(a)*c)
    for i in range(n):
        a0, a1 = t1+i*d, t1+(i+1)*d; q0, q1, d0, d1 = pt(a0), pt(a1), dv(a0), dv(a1)
        out.append(("C", (q0[0]+t*d0[0], q0[1]+t*d0[1]), (q1[0]-t*d1[0], q1[1]-t*d1[1]), q1 if i < n-1 else p1))
    return out

def subpaths(d, m):
    """the path as subpaths: {pts: start + [("L", p) | ("C", c1, c2, p)], closed}; absolute M L H V C A Z, in final coordinates"""
    out = []; cur = None; pos = (0, 0)
    for cmd, rest in re.findall(r"([MLHVCAZmlhvcaz])([^MLHVCAZmlhvcaz]*)", d):
        a = [float(x) for x in re.findall(r"-?\d*\.?\d+(?:e-?\d+)?", rest)]
        if cmd in "Zz":
            if cur: cur["closed"] = True; pos = cur["raw0"]
            continue
        if cmd.islower(): raise ValueError("relative path command " + cmd)
        if cmd == "M":
            for i in range(0, len(a) - 1, 2):
                p = (a[i], a[i+1])
                if i == 0: cur = {"start": ap(m, p), "raw0": p, "segs": [], "closed": False}; out.append(cur)
                else: cur["segs"].append(("L", ap(m, p)))
                pos = p
        elif cmd == "L":
            for i in range(0, len(a) - 1, 2): pos = (a[i], a[i+1]); cur["segs"].append(("L", ap(m, pos)))
        elif cmd == "H":
            for v in a: pos = (v, pos[1]); cur["segs"].append(("L", ap(m, pos)))
        elif cmd == "V":
            for v in a: pos = (pos[0], v); cur["segs"].append(("L", ap(m, pos)))
        elif cmd == "C":
            for i in range(0, len(a) - 5, 6): cur["segs"].append(("C", ap(m, (a[i], a[i+1])), ap(m, (a[i+2], a[i+3])), ap(m, (a[i+4], a[i+5])))); pos = (a[i+4], a[i+5])
        elif cmd == "A":
            for i in range(0, len(a) - 6, 7):
                p1 = (a[i+5], a[i+6])
                for sg in arc(pos, a[i], a[i+1], a[i+2], a[i+3], a[i+4], p1): cur["segs"].append((sg[0],) + tuple(ap(m, q) for q in sg[1:]))
                pos = p1
    return out

def walk(el, m, acc):
    tag = el.tag.replace(NS, "")
    if tag in ("defs", "mask", "clipPath", "text", "title"): return
    m = mul(m, mat(el.get("transform")))
    if tag == "path" and el.get("d"): acc.extend(subpaths(el.get("d"), m))
    for ch in el: walk(ch, m, acc)

def clean(subs):
    """in place of the raw subpaths: no zero-length pieces, no exact doubles, touching ends joined, rings closed. Returns (paths, counts)"""
    n = {"in": len(subs), "empty": 0, "double": 0, "joined": 0, "closed": 0, "frame": 0}
    if subs:
        allp = [q for sp in subs for q in [sp["start"]] + [g[-1] for g in sp["segs"]]]; X0, X1 = min(q[0] for q in allp), max(q[0] for q in allp); Y0, Y1 = min(q[1] for q in allp), max(q[1] for q in allp); keep = []
        for sp in subs:
            pts = [sp["start"]] + [g[-1] for g in sp["segs"]]; w = max(q[0] for q in pts) - min(q[0] for q in pts); h = max(q[1] for q in pts) - min(q[1] for q in pts)
            boxy = all(min(abs(q[0] - min(r[0] for r in pts)), abs(q[0] - max(r[0] for r in pts))) < 0.02 * w + 1e-6 or min(abs(q[1] - min(r[1] for r in pts)), abs(q[1] - max(r[1] for r in pts))) < 0.02 * h + 1e-6 for q in pts)
            if boxy and len(pts) <= 14 and w > 0.9 * (X1 - X0) and h > 0.9 * (Y1 - Y0): n["frame"] += 1; continue
            keep.append(sp)
        subs = keep
        # a small piece sitting far off to one side (a part filed at the wrong place on its sheet) is dropped
        while len(subs) > 3:
            B = [(lambda pts: (min(q[0] for q in pts), min(q[1] for q in pts), max(q[0] for q in pts), max(q[1] for q in pts)))([sp["start"]] + [q for g in sp["segs"] for q in g[1:]]) for sp in subs]; out = None
            for side, pick in ((0, min), (2, max), (1, min), (3, max)):
                i = pick(range(len(B)), key=lambda k: B[k][side]); R = [b for k, b in enumerate(B) if k != i]
                r = (min(b[0] for b in R), min(b[1] for b in R), max(b[2] for b in R), max(b[3] for b in R)); rd = math.hypot(r[2] - r[0], r[3] - r[1]); b = B[i]
                gap = max(r[0] - b[2], b[0] - r[2], r[1] - b[3], b[1] - r[3])
                if math.hypot(b[2] - b[0], b[3] - b[1]) < 0.12 * rd and gap > 0.15 * rd: out = i; break
            if out is None: break
            subs.pop(out); n["frame"] += 1
        if subs:
            allp = [q for sp in subs for q in [sp["start"]] + [g[-1] for g in sp["segs"]]]; X0, X1 = min(q[0] for q in allp), max(q[0] for q in allp); Y0, Y1 = min(q[1] for q in allp), max(q[1] for q in allp)
        # small boxes (a mask's or a frame's rectangle left in a part) and specks lying well outside the body are not the creature
        size = lambda sp: (lambda pts: (max(q[0] for q in pts) - min(q[0] for q in pts), max(q[1] for q in pts) - min(q[1] for q in pts), pts))([sp["start"]] + [q for g in sp["segs"] for q in g[1:]])
        D = math.hypot(X1 - X0, Y1 - Y0); big = [sp for sp in subs if math.hypot(*size(sp)[:2]) > 0.02 * D]
        if big:
            bp = [q for sp in big for q in size(sp)[2]]; bx0, bx1, by0, by1 = min(q[0] for q in bp), max(q[0] for q in bp), min(q[1] for q in bp), max(q[1] for q in bp); mx, my = 0.04 * (bx1 - bx0), 0.04 * (by1 - by0); keep = []
            for sp in subs:
                w, h, pts = size(sp); cx, cy = sum(q[0] for q in pts) / len(pts), sum(q[1] for q in pts) / len(pts)
                if math.hypot(w, h) <= 0.02 * D and not (bx0 - mx <= cx <= bx1 + mx and by0 - my <= cy <= by1 + my): n["frame"] += 1; continue
                rect = all(g[0] == "L" for g in sp["segs"]) and len(pts) <= 6 and all((abs(q[0] - min(r[0] for r in pts)) < 1e-3 or abs(q[0] - max(r[0] for r in pts)) < 1e-3) and (abs(q[1] - min(r[1] for r in pts)) < 1e-3 or abs(q[1] - max(r[1] for r in pts)) < 1e-3) for q in pts)
                if rect and w > 0.03 * D and h > 0.03 * D: n["frame"] += 1; continue
                keep.append(sp)
            subs = keep
    d2 = lambda a, b: math.hypot(a[0]-b[0], a[1]-b[1]); P = []
    for sp in subs:
        segs = []; last = sp["start"]
        for sg in sp["segs"]:      # drop steps that go nowhere
            if d2(sg[-1], last) < 1e-6 and (sg[0] == "L" or all(d2(q, last) < 1e-6 for q in sg[1:])): continue
            segs.append(sg); last = sg[-1]
        if not segs: n["empty"] += 1; continue
        ln = 0; last = sp["start"]
        for sg in segs: ln += d2(sg[-1], last) if sg[0] == "L" else d2(sg[1], last) + d2(sg[2], sg[1]) + d2(sg[3], sg[2]); last = sg[-1]
        if ln < 0.75: n["empty"] += 1; continue
        closed = sp["closed"]
        if closed and d2(segs[-1][-1], sp["start"]) > 1e-6: segs.append(("L", sp["start"]))
        P.append({"start": sp["start"], "segs": segs, "closed": closed})
    seen = set(); Q = []      # exact doubles (same points either way round)
    key = lambda p: tuple((round(x, 1), round(y, 1)) for x, y in [p["start"]] + [q for sg in p["segs"] for q in sg[1:]])
    for p in P:
        k = key(p); kr = tuple(reversed(k))
        if k in seen or kr in seen: n["double"] += 1; continue
        seen.add(k); Q.append(p)
    def rev(p):
        pts = [p["start"]] + [sg[-1] for sg in p["segs"]]; segs = []
        for i in range(len(p["segs"]) - 1, -1, -1):
            sg = p["segs"][i]; segs.append(("L", pts[i]) if sg[0] == "L" else ("C", sg[2], sg[1], pts[i]))
        return {"start": pts[-1], "segs": segs, "closed": p["closed"]}
    end = lambda p: p["segs"][-1][-1]
    opens = [p for p in Q if not p["closed"]]; done = [p for p in Q if p["closed"]]; changed = True
    while changed:      # join open pieces end to end
        changed = False
        for i in range(len(opens)):
            a = opens[i]
            for j in range(len(opens)):
                if i == j: continue
                b = opens[j]; c = None
                if d2(end(a), b["start"]) < JOIN: c = b
                elif d2(end(a), end(b)) < JOIN: c = rev(b)
                elif d2(a["start"], end(b)) < JOIN: a, c = b, a
                elif d2(a["start"], b["start"]) < JOIN: a, c = rev(b), a
                if c is None: continue
                segs = a["segs"] + ([("L", c["start"])] if d2(end(a), c["start"]) > 1e-6 else []) + c["segs"]
                merged = {"start": a["start"], "segs": segs, "closed": False}
                opens = [p for k, p in enumerate(opens) if k not in (i, j)] + [merged]; n["joined"] += 1; changed = True; break
            if changed: break
    for p in opens:
        if len(p["segs"]) > 1 and d2(end(p), p["start"]) < JOIN: p["closed"] = True; n["closed"] += 1
        done.append(p)
    n["out"] = len(done); n["open"] = sum(1 for p in done if not p["closed"])
    return done, n

def bbox(paths):
    xs, ys = [], []
    for p in paths:
        for q in [p["start"]] + [q for sg in p["segs"] for q in sg[1:]]: xs.append(q[0]); ys.append(q[1])
    return min(xs), min(ys), max(xs), max(ys)
f2 = lambda v: ("%.2f" % v).rstrip("0").rstrip(".")
def dstr(p, fx, fy):
    s = "M" + f2(fx(p["start"][0])) + " " + f2(fy(p["start"][1])); segs = p["segs"]
    if p["closed"] and segs[-1][0] == "L": segs = segs[:-1]      # Z draws the last straight step
    for sg in segs: s += sg[0] + " ".join(f2(fx(q[0])) + " " + f2(fy(q[1])) for q in sg[1:])
    return s + ("Z" if p["closed"] else "")
STYLE = 'fill="none" stroke="#000" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"'
slug = lambda s: re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True); made = []
    kit = json.load(open(os.path.join(DATA, "creature-parts.json"))); cat = json.load(open(os.path.join(DATA, "creature-catalog.json")))
    fam = {f["id"]: f["name"] for f in cat["families"]}; order = [sid for f in cat["families"] for sid in f["sheets"]]; by = {}
    for p in kit: by.setdefault(p["species"], []).append(p)
    for sid in order + [k for k in by if k not in order]:
        if sid not in by or cat["sheets"].get(sid, {}).get("family") == "marks" or sid in SKIP: continue
        acc = []; info = cat["sheets"].get(sid, {})
        if sid in WHOLE:      # a newer drawing of the whole creature stands in for its sheet's parts
            walk(ET.parse(os.path.join(DATA, WHOLE[sid])).getroot(), (1, 0, 0, 1, 0, 0), acc)
        for p in ([] if sid in WHOLE else by[sid]):
            el = ET.fromstring('<svg xmlns="http://www.w3.org/2000/svg">' + p["svg"] + "</svg>"); here = (1, 0, 0, 1, p["ox"], p["oy"]); got = []
            walk(el, here, got); acc.extend(got)
            if p["side"] != "center":
                mir = []; walk(el, mul((-1, 0, 0, 1, 2 * CX, 0), here), mir); acc.extend(mir)
        if acc: made.append((info.get("name") or sid.replace("sheet-", "").replace("-", " ").title(), sid, fam.get(info.get("family")), acc))
    cells = []
    for name, sub, family, acc in made:
        paths, n = clean(acc); x0, y0, x1, y1 = bbox(paths); k = (SIZE - 2*PAD) / max(x1-x0, y1-y0); W, H = (x1-x0)*k + 2*PAD, (y1-y0)*k + 2*PAD
        fx = lambda x: (x-x0)*k + PAD; fy = lambda y: (y-y0)*k + PAD
        # joining and closing are judged at the written size
        scaled = [{"start": (fx(p["start"][0]), fy(p["start"][1])), "segs": [(sg[0],) + tuple((fx(q[0]), fy(q[1])) for q in sg[1:]) for sg in p["segs"]], "closed": p["closed"]} for p in acc]
        paths, n = clean(scaled); ident = lambda v: v
        body = "\n".join('  <path d="%s"/>' % dstr(p, ident, ident) for p in paths)
        open(os.path.join(OUT, slug(name) + ".svg"), "w").write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %s %s" width="%s" height="%s">\n<title>%s</title>\n<g %s>\n%s\n</g>\n</svg>\n' % (f2(W), f2(H), f2(W), f2(H), name, STYLE, body))
        cells.append((name, family, W, H, paths))
        print("%-28s %-22s %4d pieces -> %4d paths (%d open)   dropped %d empty, %d double, %d frame; joined %d, closed %d" % (name, sub[:22], n["in"], n["out"], n["open"], n["empty"], n["double"], n["frame"], n["joined"], n["closed"]))
    C, COLS, LAB = 320, 8, 22; rows = math.ceil(len(cells) / COLS); parts = []
    for i, (name, family, W, H, paths) in enumerate(cells):
        s = (C - 24) / max(W, H); ox = (i % COLS)*C + (C - W*s)/2; oy = (i // COLS)*(C + LAB) + (C - H*s)/2
        parts.append('<g id="%s">%s</g>' % (slug(name), "".join('<path vector-effect="non-scaling-stroke" d="%s"/>' % dstr(p, lambda x: ox + x*s, lambda y: oy + y*s) for p in paths)))
        parts.append('<text x="%s" y="%s" text-anchor="middle" font-family="IBM Plex Mono, ui-monospace, monospace" font-size="10" fill="#000" stroke="none">%s</text>' % (f2((i % COLS)*C + C/2), f2((i // COLS)*(C + LAB) + C + 12), name.replace("&", "&amp;")))
    open(os.path.join(OUT, "sheet.svg"), "w").write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">\n<rect width="100%%" height="100%%" fill="#fff"/>\n<g %s>\n%s\n</g>\n</svg>\n' % (COLS*C, rows*(C+LAB), COLS*C, rows*(C+LAB), STYLE, "\n".join(parts)))
    print(len(cells), "creatures written to", OUT)
