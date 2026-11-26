"""Bakes every group transform into its paths, so an SVG exported from Bestiary Forge (each part placed by translate/rotate/scale
and mirrored by a matrix) becomes plain, already-placed paths that pipeline/from-svg.mjs reads as one rig part each.
Handles absolute M/L/C/Q/Z paths, which is all the Forge exports.
  python3 flatten-svg.py <in.svg> <out.svg>
"""
import sys, re, math
import xml.etree.ElementTree as ET

def parse(t):
    m = [1, 0, 0, 1, 0, 0]
    for name, args in re.findall(r"(\w+)\s*\(([^)]*)\)", t or ""):
        a = [float(v) for v in re.split(r"[\s,]+", args.strip()) if v]
        if name == "translate": n = [1, 0, 0, 1, a[0], a[1] if len(a) > 1 else 0]
        elif name == "scale": n = [a[0], 0, 0, a[1] if len(a) > 1 else a[0], 0, 0]
        elif name == "rotate":
            r = math.radians(a[0]); c, s = math.cos(r), math.sin(r); n = [c, s, -s, c, 0, 0]
            if len(a) == 3: n = mul(mul([1, 0, 0, 1, a[1], a[2]], n), [1, 0, 0, 1, -a[1], -a[2]])
        elif name == "matrix": n = a
        else: raise SystemExit("unsupported transform " + name)
        m = mul(m, n)
    return m

def mul(p, q):
    a, b, c, d, e, f = p; A, B, C, D, E, F = q
    return [a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f]

def bake(d, m):
    if re.search(r"[HVASTmlcqhvast]", d): raise SystemExit("relative or unsupported path command in: " + d[:60])
    out = []
    for cmd, body in re.findall(r"([MLCQZ])([^MLCQZ]*)", d):
        n = [float(v) for v in re.findall(r"-?\d*\.?\d+(?:e-?\d+)?", body)]
        pts = [(m[0] * n[i] + m[2] * n[i + 1] + m[4], m[1] * n[i] + m[3] * n[i + 1] + m[5]) for i in range(0, len(n) - 1, 2)]
        out.append(cmd + " ".join("%.2f %.2f" % p for p in pts))
    return "".join(out)

def walk(el, m, paths):
    m = mul(m, parse(el.get("transform")))
    for ch in el:
        tag = ch.tag.split("}")[-1]
        if tag == "path": paths.append(bake(ch.get("d"), mul(m, parse(ch.get("transform")))))
        elif tag == "g": walk(ch, m, paths)

src, dst = sys.argv[1], sys.argv[2]
root = ET.parse(src).getroot(); paths = []
walk(root, [1, 0, 0, 1, 0, 0], paths)
vb = root.get("viewBox", "0 0 400 400")
open(dst, "w").write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s">\n' % vb + "".join(
    '<path fill="none" stroke="#000" d="%s"/>\n' % d for d in paths) + "</svg>\n")
print(len(paths), "paths written to", dst)
