#!/usr/bin/env python3
"""Which kit parts are the same drawing?
  python3 world/forges/fish-tool/kit-duplicates.py [out.json]      (default: packages/kit/catalog/duplicates.json)
Every part of packages/kit/data/creature-parts.json is read as points along its lines (in its own frame, set to a unit box about its
centre), and two parts count as one drawing when every point of each lies on the other: mean distance under SAME of the part's
size (the same drawing, perhaps resized or mirrored), under NEAR (the same drawing with small changes). Parts are compared as
drawn and mirrored left-right. Writes the groups; changes nothing in the kit."""
import sys, os, json, math, importlib.util
import xml.etree.ElementTree as ET
import numpy as np
from scipy.spatial import cKDTree
HERE = os.path.dirname(os.path.abspath(__file__)); DATA = os.path.join(HERE, "../../../packages/kit/data")
spec = importlib.util.spec_from_file_location("kit", os.path.join(HERE, "export-kit-svg.py")); kit = importlib.util.module_from_spec(spec); spec.loader.exec_module(kit)
SAME, NEAR, N = 0.006, 0.02, 400

def points(part):
    acc = []; kit.walk(ET.fromstring('<svg xmlns="http://www.w3.org/2000/svg">' + part["svg"] + "</svg>"), (1, 0, 0, 1, 0, 0), acc)
    segs = []
    for s in acc:
        line = [s["start"]]
        for seg in s["segs"]:
            if seg[0] == "L": line.append(seg[1])
            else:
                c1, c2, q = seg[1], seg[2], seg[3]; p0 = line[-1]
                for i in range(1, 9):
                    t = i / 8; u = 1 - t
                    line.append((u*u*u*p0[0]+3*u*u*t*c1[0]+3*u*t*t*c2[0]+t*t*t*q[0], u*u*u*p0[1]+3*u*u*t*c1[1]+3*u*t*t*c2[1]+t*t*t*q[1]))
        if s.get("closed"): line.append(line[0])
        segs.append(np.array(line, float))
    segs = [s for s in segs if len(s) > 1]
    if not segs: return None
    a = np.vstack([s[:-1] for s in segs]); b = np.vstack([s[1:] for s in segs]); ln = np.hypot(*(b - a).T); tot = ln.sum()
    if tot <= 0: return None
    cum = np.concatenate([[0], np.cumsum(ln)]); t = (np.arange(N) + 0.5) / N * tot; i = np.clip(np.searchsorted(cum, t) - 1, 0, len(ln) - 1)
    f = ((t - cum[i]) / np.where(ln[i] > 0, ln[i], 1))[:, None]; pts = a[i] + (b[i] - a[i]) * f
    lo, hi = pts.min(0), pts.max(0); size = max(hi - lo); 
    if size <= 0: return None
    return (pts - (lo + hi) / 2) / size, (hi - lo), tot / size

def dist(A, TA, B, TB): return max(TB.query(A)[0].mean(), TA.query(B)[0].mean())

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "../../../packages/kit/catalog/duplicates.json")
    parts = json.load(open(os.path.join(DATA, "creature-parts.json"))); cat = json.load(open(os.path.join(DATA, "creature-catalog.json")))
    rows = []
    for p in parts:
        r = points(p)
        if r is None: continue
        pts, wh, ink = r; flip = pts * [-1, 1]
        rows.append({"id": p["id"], "sheet": p["species"], "side": p["side"], "pts": pts, "tree": cKDTree(pts), "flip": flip, "wh": wh, "ink": ink, "size": max(wh)})
    n = len(rows); asp = np.array([r["wh"][0] / max(r["wh"]) - r["wh"][1] / max(r["wh"]) for r in rows]); ink = np.array([r["ink"] for r in rows])
    pairs = []
    for i in range(n):
        for j in range(i + 1, n):
            if abs(asp[i] - asp[j]) > 0.08 or abs(ink[i] - ink[j]) > 0.25 * max(ink[i], ink[j]): continue
            a, b = rows[i], rows[j]; d = dist(a["pts"], a["tree"], b["pts"], b["tree"]); m = False
            if d > SAME:
                d2 = max(b["tree"].query(a["flip"])[0].mean(), cKDTree(a["flip"]).query(b["pts"])[0].mean())
                if d2 < d: d, m = d2, True
            if d < NEAR: pairs.append((i, j, d, m))
    def groups(limit):
        par = list(range(n))
        def find(x):
            while par[x] != x: par[x] = par[par[x]]; x = par[x]
            return x
        for i, j, d, m in pairs:
            if d < limit: par[find(i)] = find(j)
        g = {}
        for i in range(n): g.setdefault(find(i), []).append(i)
        return sorted([v for v in g.values() if len(v) > 1], key=lambda v: (-len(v), rows[v[0]]["id"]))
    def tell(g):
        return [{"parts": [rows[i]["id"] for i in v], "sheets": sorted({cat["sheets"].get(rows[i]["sheet"], {}).get("name", rows[i]["sheet"]) for i in v}),
                 "feature": cat["parts"].get(rows[v[0]]["id"], {}).get("feature"), "sizes": [round(rows[i]["size"], 1) for i in v]} for v in g]
    same, near = groups(SAME), groups(NEAR)
    res = {"about": "Kit parts that are the same drawing. same: identical line work (any size, either way round). near: the same drawing with small changes; includes the same groups, grown. From kit-duplicates.py.",
           "parts": n, "same": tell(same), "near": tell(near)}
    json.dump(res, open(out, "w"), indent=1)
    for name, g in (("same", same), ("near", near)):
        k = sum(len(v) for v in g); print(f"{name}: {len(g)} groups, {k} parts, {k - len(g)} spare copies; across sheets: {sum(1 for v in g if len({rows[i]['sheet'] for i in v}) > 1)} groups")
