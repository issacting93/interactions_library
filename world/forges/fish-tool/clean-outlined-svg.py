"""A drawing saved as filled, outlined strokes -> single lines.
The fill is rasterised; where it is a thin band (a line that was outlined) the band's centre line is traced; where it is a solid
shape its outline is kept. Lines come back as polylines, simplified, in the drawing's own coordinates."""
import re, sys, math, numpy as np, cv2
from skimage.morphology import skeletonize
from scipy import ndimage as ndi
S = 24.0      # pixels a drawing unit
def flatten(d):
    polys = []; cur = None; pos = (0, 0)
    for cmd, rest in re.findall(r"([MLCZ])([^MLCZ]*)", d):
        n = [float(x) for x in re.findall(r"-?\d*\.?\d+(?:e-?\d+)?", rest)]
        if cmd == "M": cur = [(n[0], n[1])]; polys.append(cur); pos = (n[0], n[1]); n = n[2:]; cmd = "L"
        if cmd == "L":
            for i in range(0, len(n) - 1, 2): pos = (n[i], n[i + 1]); cur.append(pos)
        elif cmd == "C":
            for i in range(0, len(n) - 5, 6):
                p0, p1, p2, p3 = pos, (n[i], n[i + 1]), (n[i + 2], n[i + 3]), (n[i + 4], n[i + 5])
                for t in np.linspace(0, 1, 13)[1:]: cur.append(tuple((1 - t) ** 3 * np.array(p0) + 3 * (1 - t) ** 2 * t * np.array(p1) + 3 * (1 - t) * t * t * np.array(p2) + t ** 3 * np.array(p3)))
                pos = p3
    return [p for p in polys if len(p) > 2]
def rdp(P, tol):
    if len(P) < 3: return P
    keep = np.zeros(len(P), bool); keep[0] = keep[-1] = True; st = [(0, len(P) - 1)]; A = np.array(P, float)
    while st:
        a, b = st.pop()
        if b - a < 2: continue
        v = A[b] - A[a]; L = np.hypot(*v) or 1; dd = np.abs((A[a + 1:b, 0] - A[a, 0]) * v[1] - (A[a + 1:b, 1] - A[a, 1]) * v[0]) / L if L > 1e-9 else np.hypot(A[a + 1:b, 0] - A[a, 0], A[a + 1:b, 1] - A[a, 1])
        i = int(np.argmax(dd))
        if dd[i] > tol: m = a + 1 + i; keep[m] = True; st += [(a, m), (m, b)]
    return [P[i] for i in range(len(P)) if keep[i]]
def trace(sk):
    """the skeleton's pixels as polylines: from every end and fork along to the next, then what is left (rings)"""
    H, W = sk.shape; ys, xs = np.nonzero(sk); pix = set(zip(ys.tolist(), xs.tolist()))
    N8 = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    nb = lambda p: [(p[0] + a, p[1] + b) for a, b in N8 if (p[0] + a, p[1] + b) in pix]
    deg = {p: len(nb(p)) for p in pix}; nodes = {p for p in pix if deg[p] != 2}; used = set(); lines = []
    ek = lambda a, b: (a, b) if a < b else (b, a)
    def walk(a, b):
        line = [a, b]; used.add(ek(a, b)); prev, cur = a, b
        while cur not in nodes:
            nx = [q for q in nb(cur) if q != prev and ek(cur, q) not in used]
            if not nx: break
            q = nx[0]; used.add(ek(cur, q)); line.append(q); prev, cur = cur, q
        return line
    for a in nodes:
        for b in nb(a):
            if ek(a, b) not in used: lines.append(walk(a, b))
    for a in pix:
        if a in nodes: continue
        for b in nb(a):
            if ek(a, b) not in used: lines.append(walk(a, b) )
    return lines, nodes
def clean(d, width=None):
    polys = flatten(d); xs = [p[0] for q in polys for p in q]; ys = [p[1] for q in polys for p in q]; x0, y0 = min(xs) - 1, min(ys) - 1
    W, H = int((max(xs) - x0 + 1) * S), int((max(ys) - y0 + 1) * S); mask = np.zeros((H, W), np.uint8)
    cv2.fillPoly(mask, [np.round((np.array(p) - [x0, y0]) * S).astype(np.int32) for p in polys], 255)      # even-odd, as the drawing's holes are
    m = mask > 0; dt = ndi.distance_transform_edt(m); sk0 = skeletonize(m); half = float(np.median(dt[sk0]))      # a line's half-width, in pixels
    T = half * 1.25      # deeper than this inside the fill is wider than a line: part of a solid shape, if it is joined to somewhere clearly solid
    lab, n = ndi.label(dt > T); seeds = np.unique(lab[dt > half * 2.4]); core = np.isin(lab, seeds[seeds > 0])
    solid = (ndi.distance_transform_edt(~core) <= T + 2) & m if core.any() else np.zeros_like(m)
    band = m & ~((ndi.distance_transform_edt(~solid) <= 2) if solid.any() else solid)
    sk = skeletonize(band); out = []
    def free(p): return int(sk[max(0, p[0] - 1):p[0] + 2, max(0, p[1] - 1):p[1] + 2].sum()) - 1 <= 1      # an end with nothing beyond it
    for _ in range(3):      # the whiskers thinning leaves at corners: short pieces with a free end, taken off so the line runs through
        lines, nodes = trace(sk); cut = 0
        for ln in lines:
            length = sum(math.hypot(ln[i][0] - ln[i - 1][0], ln[i][1] - ln[i - 1][1]) for i in range(1, len(ln)))
            if length < half * 3.2 and (free(ln[0]) != free(ln[-1])):
                for q in (ln[1:] if free(ln[-1]) else ln[:-1]): sk[q] = False
                cut += 1
        if not cut: break
    lines, nodes = trace(sk)
    # the thinning leaves a knot of one- and two-pixel pieces wherever a line turns or forks: drop those, then join the lines whose ends
    # are left a few pixels apart, where just two ends meet (three or more is a real fork, and the lines stop there)
    lines = [ln for ln in lines if len(ln) > 4 or ln[0] == ln[-1]]; R = 5.0; changed = True
    while changed:
        changed = False; E = [(ln[0], i, 0) for i, ln in enumerate(lines) if ln[0] != ln[-1]] + [(ln[-1], i, 1) for i, ln in enumerate(lines) if ln[0] != ln[-1]]
        grid = {}
        for k, (p, i, w) in enumerate(E): grid.setdefault((int(p[0] // R), int(p[1] // R)), []).append(k)
        for k, (p, i, w) in enumerate(E):
            near = [q for a in (-1, 0, 1) for b in (-1, 0, 1) for q in grid.get((int(p[0] // R) + a, int(p[1] // R) + b), []) if q != k and math.hypot(E[q][0][0] - p[0], E[q][0][1] - p[1]) <= R]
            if len(near) != 1: continue
            q = near[0]; back = [r for a in (-1, 0, 1) for b in (-1, 0, 1) for r in grid.get((int(E[q][0][0] // R) + a, int(E[q][0][1] // R) + b), []) if r != q and math.hypot(E[r][0][0] - E[q][0][0], E[r][0][1] - E[q][0][1]) <= R]
            if back != [k]: continue
            j, w2 = E[q][1], E[q][2]
            if j == i: lines[i] = lines[i] + [lines[i][0]]      # its own two ends: a ring
            else:
                A = lines[i] if w == 1 else lines[i][::-1]; B = lines[j] if w2 == 0 else lines[j][::-1]
                lines = [ln for n, ln in enumerate(lines) if n not in (i, j)] + [A + B]
            changed = True; break
    for ln in lines:
        closed = ln[0] == ln[-1] and len(ln) > 8; length = sum(math.hypot(ln[i][0] - ln[i - 1][0], ln[i][1] - ln[i - 1][1]) for i in range(1, len(ln)))
        if length < half * 2 and not closed and free(ln[0]) and free(ln[-1]): continue      # a speck
        pts = [(p[1] / S + x0, p[0] / S + y0) for p in ln]
        if closed: far = len(pts) // 2; pts = rdp(pts[:far + 1], 0.07) + rdp(pts[far:], 0.07)[1:]
        else: pts = rdp(pts, 0.07)
        out.append({"pts": pts, "closed": closed, "kind": "line"})
    cs, hier = cv2.findContours(solid.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    for c in cs:
        if len(c) < 12: continue
        pts = [(p[0][0] / S + x0, p[0][1] / S + y0) for p in c]; far = max(range(len(pts)), key=lambda i: math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]))
        ring = rdp(pts[:far + 1], 0.05) + rdp(pts[far:] + [pts[0]], 0.05)[1:]; out.append({"pts": ring, "closed": True, "kind": "shape"})
    return out, half / S
if __name__ == "__main__":
    s = open(sys.argv[1]).read(); d = re.search(r' d="([^"]*)"', s).group(1); out, half = clean(d)
    f2 = lambda v: ("%.2f" % v).rstrip("0").rstrip(".")
    w, h = re.search(r'width="([\d.]+)" height="([\d.]+)"', s).groups()
    body = "\n".join('<path d="M%s%s"/>' % ("L".join(f2(x) + " " + f2(y) for x, y in (o["pts"][:-1] if o["closed"] else o["pts"])), "Z" if o["closed"] else "") for o in out)
    open(sys.argv[2], "w").write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %s %s" width="%s" height="%s">\n<g fill="none" stroke="#000" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round">\n%s\n</g>\n</svg>\n' % (w, h, w, h, body.replace("<path ", '<path vector-effect="non-scaling-stroke" ')))
    print("line half-width %.2f units; %d lines (%d closed), %d solid outlines; %d points" % (half, sum(o["kind"] == "line" for o in out), sum(o["kind"] == "line" and o["closed"] for o in out), sum(o["kind"] == "shape" for o in out), sum(len(o["pts"]) for o in out)))
