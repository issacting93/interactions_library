"""One-time extraction: pull one species' body mesh out of
shared/engine/ecology/ecology-species.js (20MB of every species' baked geometry)
into a small standalone JSON that creature_sop.py's TouchDesigner Script
SOP can load directly, with no 20MB parse at TD cook time.

Usage:
    python3 extract_species.py koi
    python3 extract_species.py --list

Writes world/forges/fish-tool/td/data/<key>.json.

What gets pulled, and why the rest is dropped (see creature_sop.py's
module docstring for the full picture of what's ported):
  - bounds, swim          -- the species' body-length/wiggle-wave constants
                             (ecology-sim.js reads these as SPECIES[i].swim).
  - fillV / fillI          -- the triangulated body mesh: fillV is (x, y,
                             partIndex) per vertex in the species' own flat
                             local coordinates (Y runs along the body axis),
                             fillI are triangle indices. Decoded from the
                             page's base64 Float32Array/Uint16Array.
  - per-part group + pivotY -- decoded from partTex (4 texels x 4 floats
                             per part). group tells a vertex whether it
                             rides the spine directly (body/head/tail/most
                             fins) or pivots rigidly at one fixed point
                             along the spine (whiskers, pectoral fins --
                             Cybernetic Ecology.html's `rigid(g)` test:
                             (1.5<g<2.5) or g>3.5). pivotY is that fixed
                             attachment point (R.w in the shader, at texel
                             offset +11).
  - lineV/lineI (outline), anchor points, beat/fold/keyed-pose rig data,
    and B (a cosmetic shading-gradient range) are NOT extracted -- v1 only
    reproduces body shape + swim bend, not the stroke overlay or
    independent fin-flap/whisker-sway animation. See creature_sop.py.
"""

import base64
import json
import os
import struct
import sys

SPECIES_JS = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "..",
    "shared", "ecology", "ecology-species.js",
)
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")


def _find_array_literal(text, marker):
    # marker should end in the array's opening "[" -- start points AT that
    # bracket so the depth counter below sees it as the first char.
    assert marker.endswith("[")
    start = text.index(marker) + len(marker) - 1
    i, depth, in_str, esc, quote = start, 0, False, False, None
    n = len(text)
    while i < n:
        c = text[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == quote:
                in_str = False
        else:
            if c in "\"'":
                in_str, quote = True, c
            elif c == "[":
                depth += 1
            elif c == "]":
                depth -= 1
                if depth == 0:
                    i += 1
                    break
        i += 1
    return text[start:i]


def load_raw_species():
    with open(SPECIES_JS, encoding="utf-8") as f:
        text = f.read()
    arr_text = _find_array_literal(text, "const SPECIES = [")
    return json.loads(arr_text)


def b64_floats(s):
    raw = base64.b64decode(s)
    return list(struct.unpack(f"<{len(raw)//4}f", raw))


def b64_uint16(s):
    raw = base64.b64decode(s)
    return list(struct.unpack(f"<{len(raw)//2}H", raw))


def rigid_group(g):
    return (1.5 < g < 2.5) or g > 3.5


def extract(key):
    raw = load_raw_species()
    sp = next((s for s in raw if s["key"] == key), None)
    if sp is None:
        keys = ", ".join(s["key"] for s in raw)
        raise SystemExit(f"no species {key!r}. Available: {keys}")

    fill_v = b64_floats(sp["fillV"])
    fill_i = b64_uint16(sp["fillI"])
    part_tex = sp["partTex"]
    n_parts = sp["parts"]

    parts = []
    for p in range(n_parts):
        base = p * 16
        group = part_tex[base + 0]
        pivot_y = part_tex[base + 8 + 3]
        parts.append({"group": group, "pivotY": pivot_y, "rigid": rigid_group(group)})

    out = {
        "key": sp["key"],
        "name": sp["name"],
        "bounds": sp["bounds"],       # [xmin, BY0, xmax, ymax] -- BY0=bounds[1], LEN=bounds[3]-bounds[1]
        "swim": sp["swim"],           # len, waves, amp, ampPow, bend, fin, lag, sep, speed
        "parts": parts,
        "fillV": fill_v,              # flat [x0,y0,part0, x1,y1,part1, ...]
        "fillI": fill_i,              # flat triangle indices
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, f"{key}.json")
    with open(out_path, "w") as f:
        json.dump(out, f)
    size_kb = os.path.getsize(out_path) / 1024
    print(f"{key}: {len(fill_v)//3} verts, {len(fill_i)//3} tris, {n_parts} parts "
          f"({sum(1 for p in parts if p['rigid'])} rigid) -> {out_path} ({size_kb:.0f} KB)")


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(__doc__)
    elif sys.argv[1] == "--list":
        for s in load_raw_species():
            print(s["key"], "-", s["name"])
    else:
        extract(sys.argv[1])
