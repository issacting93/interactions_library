"""Spire Forge, ported to TouchDesigner as real 3D geometry.

Spire Forge (../index.html) draws buildings as a flat 2D elevation, dressed
in parts cut from the designer's creature art. That part library doesn't
exist here, so this port keeps the STRUCTURAL generator (newGenome, around
index.html:288-332) and the metric tier massing already used to bridge to a
3D renderer (toTowerForge, around index.html:761-828) -- base terraces,
shaft + balconies, upper drums, dome, neck and crown -- and rebuilds it as
real lathed/strut geometry instead of SVG sprites. Ornament (friezes, bay
parts, ribs-as-art) is reinterpreted as plain geometric stand-ins: the point
is a working, good-looking parametric generator with the same knobs (seed,
template, dome rise, crown blades, buttresses...), not a pixel-identical
port of the 2D drawing.

Usage in TouchDesigner
-----------------------
1. Create a Script SOP.
2. Point its "Script" parameter at a Text DAT containing this file's
   contents (or paste this file's contents straight into a Text DAT and
   reference it).
3. Edit the PARAMS dict below (template + seed) and the SOP will cook a
   building. onSetupParameters() also adds a couple of custom parameters
   (Tpl, Seed, Rebuild) on the Script SOP itself so you can drive it without
   touching the script -- the callbacks read those first and fall back to
   PARAMS if they're missing.

This was written against TouchDesigner's documented Script SOP Python API
(scriptOp.clear() / .appendPoint() / .appendPoly() / .appendCustomPage()). I
can't run TouchDesigner from here to test it, so if a call on scriptOp
doesn't match your installed version, that's the first thing to check --
the pure-Python geometry builder above the "TouchDesigner adapter" section
has no TD dependency and is covered by the `python3 spire_forge_sop.py
--test` block at the bottom.
"""

import math
import random

# --------------------------------------------------------------------------
# Defaults used when TD custom parameters aren't wired up yet.
PARAMS = {
    "tpl": "lighthouse",   # lighthouse | spire | hive | shrine | rotunda
    "seed": 1,
}

TEMPLATES = ("lighthouse", "spire", "hive", "shrine", "rotunda")

# The web tool's SVG canvas is 1m = 16px (index.html:741). Keeping that
# constant lets every range below read as a straight copy of newGenome's
# pixel ranges, converted to metres at the point of use.
PXPM = 16.0
SMOOTH_SIDES = 28


def clamp(v, a, b):
    return min(b, max(a, v))


def px2m(v):
    return v / PXPM


# --------------------------------------------------------------------------
# Genome: ports newGenome's per-template numeric ranges (index.html:296-327).
# Part-id picks (pk(...), friezes, bays) are dropped -- there's no part
# catalog here -- everything else keeps the same ranges and odds.

def make_genome(tpl, seed):
    if tpl not in TEMPLATES:
        raise ValueError(f"unknown template {tpl!r}, expected one of {TEMPLATES}")
    rnd = random.Random(seed)

    def between(a, b):
        return a + rnd.random() * (b - a)

    def integer(a, b):
        return int(math.floor(between(a, b + 1)))

    def chance(p):
        return rnd.random() < p

    g = {"tpl": tpl, "seed": seed}

    if tpl == "lighthouse":
        g["base"] = {"n": 3, "half": between(150, 190), "h": between(34, 46), "step": between(0.76, 0.84)}
        g["shaft"] = {"h": between(330, 420), "ribs": True}
        g["balc"] = {"n": 3, "half": between(95, 125), "taper": between(0.15, 0.3)}
        g["drums"] = {"n": 0, "half": 70, "h": 40}
        g["neckN"] = 2
        g["crown"] = {"R": between(95, 125), "beads": integer(7, 11), "n": integer(5, 7), "spire": True, "beams": True}
        g["butt"] = {"on": True, "scale": between(0.65, 0.85)}
        g["dome"] = {"on": False, "rise": 0.8, "shells": 2}
    elif tpl == "spire":
        g["base"] = {"n": 2, "half": between(80, 120), "h": between(26, 36), "step": between(0.78, 0.9)}
        g["shaft"] = {"h": between(480, 600), "ribs": chance(0.6)}
        g["balc"] = {"n": integer(4, 6), "half": between(60, 90), "taper": between(0.3, 0.5)}
        g["drums"] = {"n": 0, "half": 50, "h": 30}
        g["neckN"] = 1
        g["crown"] = {"R": between(50, 70) if chance(0.4) else 0, "beads": integer(0, 6), "n": integer(3, 5), "spire": True, "beams": False}
        g["butt"] = {"on": chance(0.5), "scale": between(0.55, 0.75)}
        g["dome"] = {"on": False, "rise": 0.8, "shells": 2}
    elif tpl == "hive":
        g["base"] = {"n": 1, "half": between(160, 200), "h": between(30, 40), "step": 0.8}
        g["shaft"] = {"h": between(60, 120), "ribs": False}
        g["balc"] = {"n": 0, "half": 100, "taper": 0.2}
        g["drums"] = {"n": integer(3, 5), "half": between(120, 160), "h": between(55, 75)}
        g["neckN"] = 1
        g["crown"] = {"R": between(55, 85), "beads": integer(6, 10), "n": integer(4, 6), "spire": chance(0.6), "beams": False}
        g["butt"] = {"on": chance(0.7), "scale": between(0.6, 0.85)}
        g["dome"] = {"on": False, "rise": 0.8, "shells": 2}
    elif tpl == "shrine":
        g["base"] = {"n": integer(3, 4), "half": between(200, 240), "h": between(22, 30), "step": between(0.84, 0.9)}
        g["shaft"] = {"h": between(90, 170), "ribs": True}
        g["balc"] = {"n": 1, "half": between(110, 140), "taper": 0}
        g["drums"] = {"n": 0, "half": 60, "h": 30}
        g["neckN"] = 2
        g["crown"] = {"R": between(160, 200), "beads": integer(10, 16), "n": integer(7, 10), "spire": chance(0.5), "beams": chance(0.5)}
        g["butt"] = {"on": True, "scale": between(0.7, 0.95)}
        g["dome"] = {"on": False, "rise": 0.8, "shells": 2}
    else:  # rotunda
        g["base"] = {"n": 2, "half": between(190, 230), "h": between(30, 40), "step": between(0.9, 0.95)}
        g["shaft"] = {"h": 0, "ribs": False}
        g["balc"] = {"n": 0, "half": 140, "taper": 0}
        g["drums"] = {"n": 2, "half": between(150, 175), "h": between(80, 100)}
        g["neckN"] = 0
        g["crown"] = {"R": 0, "beads": 0, "n": integer(2, 4), "spire": True, "beams": False}
        g["butt"] = {"on": False, "scale": 0.6}
        g["dome"] = {"on": True, "rise": between(0.62, 0.9), "shells": integer(1, 3)}

    n0 = g["crown"]["n"]
    g["fans"] = [
        {"n": n0, "r": 0.62, "from": -165, "to": -25, "spin": between(-50, 10), "scale": between(0.8, 1.1)},
        {"n": max(2, n0 - 2), "r": 0.95, "from": -150, "to": -35, "spin": between(-45, -10), "scale": between(0.7, 1.0)},
    ]
    return g


# --------------------------------------------------------------------------
# Tiers: ports toTowerForge's metric massing (index.html:770-805). Window
# rows/bays/ribs-as-ornament are dropped (no parts); straight structural
# dimensions (radii, heights, step, ribs-as-faceting, buttress counts) are
# kept.

def make_tiers(g):
    tiers = []
    half = g["base"]["half"]
    for i in range(g["base"]["n"]):
        r = clamp(px2m(half), 0.2, 12)
        h = clamp(px2m(g["base"]["h"]), 0.5, 40)
        tiers.append({
            "kind": "base", "h": h, "r0": r, "r1": r, "sides": 0,
            "butN": 6 if (i == 0 and g["butt"]["on"]) else 0,
            "butR": clamp(px2m(g["base"]["half"] * 0.5), 1, 16),
        })
        half *= g["base"]["step"]

    coreR = clamp(px2m(max(26.0, min(half * 0.55, 60.0))), 0.2, 12)
    segs = g["balc"]["n"] + 1
    if g["shaft"]["h"] > 10:
        for i in range(segs):
            t = (i + 1) / segs
            has_balc = i < g["balc"]["n"]
            bh = g["balc"]["half"] * (1 - g["balc"]["taper"] * t)
            tiers.append({
                "kind": "shaft", "h": clamp(px2m(g["shaft"]["h"] / segs), 0.5, 40),
                "r0": coreR, "r1": coreR,
                "sides": 12 if g["shaft"]["ribs"] else 0,
                "ribs": 16 if g["shaft"]["ribs"] else 0,
                "hasBalc": has_balc,
                "balcR": clamp(px2m(bh), coreR + 0.1, coreR + 6) if has_balc else 0,
            })

    dh = g["drums"]["half"]
    for i in range(g["drums"]["n"]):
        h = g["drums"]["h"] * (1 - i * 0.08)
        tiers.append({
            "kind": "drum", "h": clamp(px2m(h), 0.5, 40),
            "r0": clamp(px2m(dh), 0.2, 12), "r1": clamp(px2m(dh * 0.97), 0.2, 12),
            "prof": "bulge", "amp": 0.3,
        })
        dh *= 0.8

    if not tiers:
        tiers.append({"kind": "base", "h": 4, "r0": 2, "r1": 2})
    return tiers, coreR


# --------------------------------------------------------------------------
# Geometry primitives. points: list of (x, y, z) float tuples; polys: list
# of index lists into points (quads or ngons); groups: parallel list of
# part names, one per poly, for optional per-part material/Cd assignment.

def add_ring(points, y, r, sides):
    start = len(points)
    for i in range(sides):
        a = 2 * math.pi * i / sides
        points.append((r * math.cos(a), y, r * math.sin(a)))
    return list(range(start, start + sides))


def add_band(points, polys, groups, ring_a, ring_b, group):
    n = len(ring_a)
    if n != len(ring_b) or n == 0:
        return
    for i in range(n):
        j = (i + 1) % n
        polys.append([ring_a[i], ring_a[j], ring_b[j], ring_b[i]])
        groups.append(group)


def add_cap(points, polys, groups, ring, y, group, flip=False):
    if not ring:
        return
    center = len(points)
    points.append((0.0, y, 0.0))
    n = len(ring)
    for i in range(n):
        j = (i + 1) % n
        tri = [center, ring[j], ring[i]] if flip else [center, ring[i], ring[j]]
        polys.append(tri)
        groups.append(group)


def add_box(points, polys, groups, center, size, group):
    cx, cy, cz = center
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    verts = [
        (cx - hx, cy - hy, cz - hz), (cx + hx, cy - hy, cz - hz),
        (cx + hx, cy + hy, cz - hz), (cx - hx, cy + hy, cz - hz),
        (cx - hx, cy - hy, cz + hz), (cx + hx, cy - hy, cz + hz),
        (cx + hx, cy + hy, cz + hz), (cx - hx, cy + hy, cz + hz),
    ]
    base = len(points)
    points.extend(verts)
    faces = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]]
    for f in faces:
        polys.append([base + i for i in f])
        groups.append(group)


def add_strut(points, polys, groups, p0, p1, width, thickness, group):
    """An oriented box running from point p0 to point p1 (a blade, buttress...)."""
    dx, dy, dz = p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]
    length = math.sqrt(dx * dx + dy * dy + dz * dz) or 1e-6
    d = (dx / length, dy / length, dz / length)

    def cross(a, b):
        return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])

    def norm(v):
        l = math.sqrt(sum(c * c for c in v)) or 1e-6
        return (v[0] / l, v[1] / l, v[2] / l)

    perp1 = cross(d, (0.0, 1.0, 0.0))
    if sum(c * c for c in perp1) < 1e-8:
        perp1 = (1.0, 0.0, 0.0)
    perp1 = norm(perp1)
    perp2 = norm(cross(d, perp1))
    hw, ht = width / 2, thickness / 2

    def off(p, s1, s2):
        return (p[0] + perp1[0] * s1 + perp2[0] * s2,
                p[1] + perp1[1] * s1 + perp2[1] * s2,
                p[2] + perp1[2] * s1 + perp2[2] * s2)

    verts = [off(p0, hw, ht), off(p0, -hw, ht), off(p0, -hw, -ht), off(p0, hw, -ht),
             off(p1, hw, ht), off(p1, -hw, ht), off(p1, -hw, -ht), off(p1, hw, -ht)]
    base = len(points)
    points.extend(verts)
    faces = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]]
    for f in faces:
        polys.append([base + i for i in f])
        groups.append(group)


def add_torus(points, polys, groups, center_y, major_r, minor_r, group, major_sides=24, minor_sides=10):
    rings = []
    for i in range(major_sides):
        theta = 2 * math.pi * i / major_sides
        ring = []
        for j in range(minor_sides):
            phi = 2 * math.pi * j / minor_sides
            rr = major_r + minor_r * math.cos(phi)
            x = rr * math.cos(theta)
            z = rr * math.sin(theta)
            y = center_y + minor_r * math.sin(phi)
            idx = len(points)
            points.append((x, y, z))
            ring.append(idx)
        rings.append(ring)
    for i in range(major_sides):
        a, b = rings[i], rings[(i + 1) % major_sides]
        m = len(a)
        for j in range(m):
            k = (j + 1) % m
            polys.append([a[j], a[k], b[k], b[j]])
            groups.append(group)


# --------------------------------------------------------------------------
# The building.

def build_geometry(g):
    points, polys, groups = [], [], []
    tiers, coreR = make_tiers(g)

    y = 0.0
    prev_ring, prev_r = None, None
    first_ring = None
    buttresses = []  # (y0, y1, outer_r, inner_r, count)

    for t in tiers:
        sides = t.get("sides") or SMOOTH_SIDES
        r0, r1 = t["r0"], t.get("r1", t["r0"])
        h = t["h"]
        y0, y1 = y, y + h
        prof = t.get("prof", "straight")

        if prof == "bulge":
            amp = t.get("amp", 0.25)
            samples = [(y0, r0), (y0 + h * 0.5, max(r0, r1) * (1 + amp)), (y1, r1)]
        else:
            samples = [(y0, r0), (y1, r1)]

        rings = [add_ring(points, sy, sr, sides) for sy, sr in samples]
        if first_ring is None:
            first_ring = rings[0]

        if prev_ring is not None and abs((prev_r or 0) - samples[0][1]) > 1e-6:
            add_band(points, polys, groups, prev_ring, rings[0], t["kind"] + "-step")

        for a, b in zip(rings[:-1], rings[1:]):
            add_band(points, polys, groups, a, b, t["kind"])

        top_ring, top_r = rings[-1], samples[-1][1]

        if t.get("hasBalc"):
            flange_r = t.get("balcR") or top_r * 1.6
            flange = add_ring(points, y1, flange_r, sides)
            add_band(points, polys, groups, top_ring, flange, "balcony")
            add_band(points, polys, groups, flange, top_ring, "balcony-under")

        if t.get("butN"):
            buttresses.append((y0, y1, t.get("butR", r0 * 1.4), r0, t["butN"]))

        prev_ring, prev_r = top_ring, top_r
        y = y1

    if first_ring is not None:
        add_cap(points, polys, groups, first_ring, 0.0, "ground-cap", flip=True)

    # dome: a curved cap replacing the neck/crown stalk (rotunda, or whenever switched on)
    if g["dome"]["on"] and prev_ring is not None:
        Rd = prev_r * 0.98
        Hd = Rd * clamp(g["dome"]["rise"], 0.3, 1.4)
        n = 8
        rings = [prev_ring]
        for i in range(1, n + 1):
            tt = i / n
            ang = tt * (math.pi / 2) * 0.94  # stop short of a true point -> small flat plinth on top
            sy = y + math.sin(ang) * Hd
            sr = max(0.15, math.cos(ang) * Rd)
            rings.append(add_ring(points, sy, sr, SMOOTH_SIDES))
        for a, b in zip(rings[:-1], rings[1:]):
            add_band(points, polys, groups, a, b, "dome")
        apex_ring = rings[-1]
        apex_y = y + math.sin((n / n) * (math.pi / 2) * 0.94) * Hd
        add_cap(points, polys, groups, apex_ring, apex_y, "dome-cap")
        y, prev_ring, prev_r = apex_y, apex_ring, max(0.15, math.cos((math.pi / 2) * 0.94) * Rd)
    elif g["neckN"] > 0 and prev_ring is not None:
        r0 = min(prev_r, coreR)
        r1 = round(r0 * 0.7, 3)
        h = clamp(px2m(40 * g["neckN"]), 0.5, 40)
        top = add_ring(points, y + h, r1, SMOOTH_SIDES)
        if abs(prev_r - r0) > 1e-6:
            waist = add_ring(points, y, r0, SMOOTH_SIDES)
            add_band(points, polys, groups, prev_ring, waist, "neck-step")
            prev_ring = waist
        add_band(points, polys, groups, prev_ring, top, "neck")
        y, prev_ring, prev_r = y + h, top, r1

    # crown: lamp, optional spire, optional halo ring + beads, blade fans
    topY, plinthR = y, (prev_r or coreR)
    R = px2m(g["crown"]["R"])
    lamp_r = max(0.15, plinthR * 0.6)
    lamp_h = max(0.3, lamp_r * 1.8)
    lamp_mid = topY + lamp_h * 0.5
    lamp_rings = [add_ring(points, topY, lamp_r, 16),
                  add_ring(points, topY + lamp_h * 0.7, lamp_r * 0.55, 16)]
    add_band(points, polys, groups, lamp_rings[0], lamp_rings[1], "lamp")
    add_cap(points, polys, groups, lamp_rings[1], topY + lamp_h, "lamp-cap")
    spire_base_y = topY + lamp_h

    if g["crown"]["spire"]:
        spire_h = max(0.6, R * 0.9 if R > 0 else lamp_h * 1.4)
        add_strut(points, polys, groups, (0, spire_base_y, 0), (0, spire_base_y + spire_h, 0),
                  lamp_r * 0.5, lamp_r * 0.5, "spire")

    if R > 1.2:
        halo_y = lamp_mid
        halo_tube = max(0.04, R * 0.035)
        add_torus(points, polys, groups, halo_y, R, halo_tube, "halo")
        beads = g["crown"]["beads"]
        bead_r = max(0.08, R * 0.05)
        for k in range(beads):
            a = 2 * math.pi * k / max(1, beads)
            add_box(points, polys, groups,
                    (R * math.cos(a), halo_y, R * math.sin(a)),
                    (bead_r, bead_r, bead_r), "bead")

    blade_base_r = max(R, px2m(50))
    for fan in g["fans"]:
        n = fan["n"]
        if n <= 0:
            continue
        length = blade_base_r * fan["r"] * clamp(fan["scale"], 0.3, 1.5)
        width = max(0.08, length * 0.16)
        thickness = max(0.03, length * 0.05)
        for i in range(n):
            # spread evenly around the full circle -- in 3D the fan reads as a
            # radiating crown rather than the web tool's front-only sweep
            az = 2 * math.pi * i / n
            tilt = math.radians(clamp(fan["spin"], -60, 30))
            tip = (length * math.cos(tilt) * math.sin(az),
                   lamp_mid + length * math.sin(tilt),
                   length * math.cos(tilt) * math.cos(az))
            add_strut(points, polys, groups, (0, lamp_mid, 0), tip, width, thickness, "blade")

    # buttresses: lean from a ring of outer ground points up to the base tier wall
    for (y0, y1, outer_r, inner_r, count) in buttresses:
        scale = clamp(g["butt"]["scale"], 0.3, 1.2)
        for k in range(count):
            a = 2 * math.pi * k / count
            foot = (outer_r * math.cos(a), y0, outer_r * math.sin(a))
            head = (inner_r * 1.02 * math.cos(a), y0 + (y1 - y0) * scale, inner_r * 1.02 * math.sin(a))
            add_strut(points, polys, groups, foot, head, outer_r * 0.12, outer_r * 0.12, "buttress")

    return {"points": points, "polys": polys, "groups": groups, "topY": topY}


def build(tpl, seed):
    g = make_genome(tpl, seed)
    mesh = build_geometry(g)
    mesh["genome"] = g
    return mesh


# --------------------------------------------------------------------------
# TouchDesigner adapter. Everything above this line is plain Python with no
# TD dependency; everything below only runs when TD calls it.

def onSetupParameters(scriptOp):
    page = scriptOp.appendCustomPage("Spire")
    p = page.appendMenu("Tpl", label="Template")
    p[0].menuNames = list(TEMPLATES)
    p[0].menuLabels = [s.capitalize() for s in TEMPLATES]
    p[0].default = PARAMS["tpl"]
    p = page.appendInt("Seed", label="Seed")
    p[0].default = PARAMS["seed"]
    p = page.appendPulse("Reroll", label="Reroll Seed")
    return


def onPulse(par):
    if par.name == "Reroll":
        scriptOp = par.owner
        scriptOp.par.Seed = random.randint(1, 999999)
        scriptOp.cook(force=True)
    return


def onCook(scriptOp):
    scriptOp.clear()

    tpl = PARAMS["tpl"]
    seed = PARAMS["seed"]
    try:
        if hasattr(scriptOp.par, "Tpl"):
            tpl = scriptOp.par.Tpl.eval()
        if hasattr(scriptOp.par, "Seed"):
            seed = int(scriptOp.par.Seed.eval())
    except Exception:
        pass

    mesh = build(tpl, seed)
    points, polys, groups = mesh["points"], mesh["polys"], mesh["groups"]

    try:
        group_attr = scriptOp.attribs.create("group", "str", attribType="Prim")
    except Exception:
        group_attr = None

    sop_points = [scriptOp.appendPoint() for _ in points]
    for sp, (x, y, z) in zip(sop_points, points):
        sp.x, sp.y, sp.z = x, y, z

    for idx, verts in enumerate(polys):
        n = len(verts)
        prim = scriptOp.appendPoly(n, closed=True, addPoints=False)
        for i, v in enumerate(verts):
            prim[i].point = sop_points[v]
        if group_attr is not None:
            try:
                prim.group[0] = groups[idx]
            except Exception:
                pass
    return


# --------------------------------------------------------------------------
# Standalone test (no TouchDesigner required):
#   python3 spire_forge_sop.py --test
# Writes one OBJ per template to ./td_test_out/ and sanity-checks the mesh.

def export_obj(path, points, polys):
    with open(path, "w") as f:
        for x, y, z in points:
            f.write(f"v {x:.5f} {y:.5f} {z:.5f}\n")
        for verts in polys:
            f.write("f " + " ".join(str(i + 1) for i in verts) + "\n")


if __name__ == "__main__":
    import sys
    import os

    if "--test" in sys.argv:
        out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "td_test_out")
        os.makedirs(out_dir, exist_ok=True)
        for tpl in TEMPLATES:
            for seed in (1, 2, 42):
                mesh = build(tpl, seed)
                pts, polys = mesh["points"], mesh["polys"]
                xs = [p[0] for p in pts]; ys = [p[1] for p in pts]; zs = [p[2] for p in pts]
                assert pts, f"{tpl}/{seed}: no points generated"
                assert polys, f"{tpl}/{seed}: no polys generated"
                for p in pts:
                    assert all(math.isfinite(c) for c in p), f"{tpl}/{seed}: non-finite point {p}"
                for poly in polys:
                    assert all(0 <= i < len(pts) for i in poly), f"{tpl}/{seed}: poly index out of range {poly}"
                bbox = (max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
                print(f"{tpl:10s} seed={seed:<4d} points={len(pts):5d} polys={len(polys):5d} "
                      f"bbox=({bbox[0]:.1f}, {bbox[1]:.1f}, {bbox[2]:.1f}) topY={mesh['topY']:.1f}")
                export_obj(os.path.join(out_dir, f"{tpl}_{seed}.obj"), pts, polys)
        print(f"\nOK -- wrote OBJs to {out_dir}")
    else:
        print(__doc__)
