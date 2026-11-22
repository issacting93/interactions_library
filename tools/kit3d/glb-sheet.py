"""Lay the Blender Qilin's traced pieces (tools/kit3d/out/blender-qilin.json, from glb-to-kit.mjs) out as a kit source sheet,
packages/kit/data/kit-sources/blender-qilin.svg, one named group per part, for packages/kit/catalog/add_sheets.py ("loose": taken as drawn,
centre parts on x = 200). Both legs are the same mesh, so one leg drawing serves all four. The leg's hip, knee and foot go beside it in
packages/kit/data/kit-sources/blender-qilin-joints.json, in sheet units.   python3 tools/kit3d/glb-sheet.py"""
import json, os, re
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
K = json.load(open(os.path.join(ROOT, "tools/kit3d/out/blender-qilin.json")))
nums = lambda d: [float(x) for x in re.findall(r"-?\d*\.?\d+", d)]
NAMES = {"top0": "plate-lower", "top1": "plate-upper", "side": "leg", "front": "head"}
tops = sorted([p for p in K["pieces"] if p["view"] == "top"], key=lambda p: p["y"])
pick = [("plate-lower", tops[0], "C"), ("plate-upper", tops[1], "C"), ("leg", next(p for p in K["pieces"] if p["view"] == "side"), "L"), ("head", next(p for p in K["pieces"] if p["view"] == "front"), "C")]
y, groups, joints = 30, [], {}
for name, p, side in pick:
    cx, cy = (200, y + p["h"] / 2) if side == "C" else (200, y + p["h"] / 2)
    paths = []
    for d in re.findall(r'd="([^"]+)"', p["svg"]):
        n = nums(d); xs, ys = n[0::2], n[1::2]
        if min(max(xs) - min(xs), max(ys) - min(ys)) < 2.5: continue      # slivers: a face seen edge-on traces as a line
        paths.append("M" + " L".join("%.2f %.2f" % (x + cx, yy + cy) for x, yy in zip(xs, ys)) + " Z")
    groups.append('<g id="%s" data-side="%s">%s</g>' % (name, side, "".join('<path d="%s"/>' % d for d in paths)))
    if name == "leg": joints = {k: [round(p["meta"][k][0] + cx, 2), round(p["meta"][k][1] + cy, 2)] for k in ("J", "K", "T")}
    y += p["h"] + 30
src = os.path.join(ROOT, "packages/kit/data/kit-sources/blender-qilin.svg")
open(src, "w").write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 %d">\n<!-- The Blender Qilin (packages/kit/data/mechs/blender-mech.glb), traced flat by tools/kit3d/glb-to-kit.mjs: the body plates from above, the leg from the side, the head from the front -->\n%s\n</svg>\n' % (y, "\n".join(groups)))
meta = {"about": "The Blender Qilin's leg joints on its kit drawing (sheet units), and where the mock's pieces sat, in its own units (plates' heights, centres)",
        "leg": joints, "plates": [{"name": n, "y": p["y"], "w": p["w"], "h": p["h"], "unitsPerModel": p["unitsPerModel"]} for n, p, _ in pick[:2]], "model": K["plates"], "hipY": K["hipY"]}
json.dump(meta, open(os.path.join(ROOT, "packages/kit/data/kit-sources/blender-qilin-joints.json"), "w"), indent=1)
print(open(src).read()[:300]); print(meta)
