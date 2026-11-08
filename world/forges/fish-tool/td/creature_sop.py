"""One swimming Cybernetic Ecology creature, ported into TouchDesigner as a
real, animated 3D mesh.

Cybernetic Ecology.html draws every fish as a flat 2D silhouette ("card")
bent and banked along a moving 3D spine curve -- the body mesh never
changes topology, only its vertex positions, driven by a GPU vertex shader
(FISH_VS) sampling a spine texture written each frame by writeSpines() in
the page script, on top of boid steering from shared/engine/ecology/ecology-sim.js.
This file reimplements that same deformation in plain Python so a
TouchDesigner Script SOP can drive it, for ONE creature (no flocking,
predation, or multi-species ecology -- see "What's ported" below).

Pipeline
--------
1. `extract_species.py <key>` (run once, outside TD) pulls one species'
   body mesh + swim constants out of shared/engine/ecology/ecology-species.js
   (20MB, every species baked in) into data/<key>.json (a few hundred KB).
2. This file's pure-Python core (no TD import) simulates simple swim
   steering (`step`), builds the moving spine (`build_spine`, porting
   Cybernetic Ecology.html:852-862's wiggle formula), and deforms every
   body vertex along it (`build_geometry`, porting that page's FISH_VS
   shader math with all fin/whisker-flap animation terms zeroed -- see
   below).
3. The "TouchDesigner adapter" section at the bottom wires that into a
   Script SOP's onSetupParameters/onCook, matching world/forges/spire-forge/td's
   pattern: custom Creature page (SpeciesPath, Seed, Size, Speed, Wiggle,
   Flex, Bank, Reset), persistent per-instance state, geometry rebuilt
   every cook.

What's ported (from shared/engine/ecology/ecology-sim.js and
Cybernetic Ecology.html, line references to the latter unless noted):
  - followChain's bend-limited trailing chain (ecology-sim.js:224-236) --
    `follow_chain`.
  - trail3D's smoothed depth/roll trailing down the chain
    (ecology-sim.js:210-223), simplified to just roll/banking (`trail3d`).
  - writeSpines' lateral swim wave riding the chain (840-862) --
    `build_spine`.
  - FISH_VS's spine frame (frame3, in SP3) and body-vertex placement
    (`main()`'s non-rigid branch) -- `frame3` / `place_vertex`.
  - FISH_VS's rigid-part placement (fins/whiskers, ported at rest: no
    `partAngle` beat/fold/keyed-pose animation, i.e. lift=0, ang=0). At
    that setting the shader's own math collapses to `w = P + L*x*sc +
    T*(y - pivotY)*sc` -- a part rigidly attached at one fixed point along
    the spine instead of shearing vertex-by-vertex like the body does.
    `place_vertex`'s rigid branch.

What's NOT ported (all deliberate, not oversights):
  - Fin/whisker flap and fold animation (partAngle's beat, mood-driven
    fold, keyed poses) -- the rigid parts above are correctly PLACED, they
    just don't flutter independently. The whiskers/pectoral fins will look
    stiff rather than swaying.
  - The outline/stroke mesh (lineV/lineI) -- only the solid fill mesh is
    built. A card this thin reads fine as a solid in TD; the stroke was a
    cosmetic SVG-style overlay.
  - Everything multi-fish: flocking (separation/alignment/cohesion),
    predator/prey, schooling, the tank bounds, pointer/vortex interaction.
    This drives exactly one creature with simple cruise+wander steering
    (a stand-in for ecology-sim.js step()'s single-fish terms, dropping
    every term that reads `fish[j]`). Multiple creatures would mean
    multiple Script SOPs, each with its own persistent state (already
    keyed per scriptOp.path below) -- not a redesign, just more of them.
  - The shader's shading (iris/film colour, glow, depth fade) -- geometry
    only. Shade/light it however you like in TD.

Like spire_forge_sop.py, the geometry/sim core above the "TouchDesigner
adapter" section has zero TD dependency and is covered by
`python3 creature_sop.py --test <key>`, which needs no TouchDesigner.
"""

import json
import math
import os
import random

K = 20  # spine points per fish -- matches ecology-sim.js's own K exactly
         # (that file's docstring: changing one without the other breaks nothing
         # here since we don't share its spine-texture layout, but keep it
         # anyway so the wiggle shape reads the same).

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

PARAMS = {
    "species": "koi",
    "seed": 1,
    "size": 0.6,        # body length, metres
    "speed": 1.4,       # metres/second, cruise target
    "wander": 0.6,      # how strongly it drifts off a straight line
    "turnRate": 160.0,  # max turn, degrees/second
    "wiggle": 0.35,      # swim-wave amplitude, as a fraction of body length (matches the web tool's S.wiggle)
    "flex": 18.0,        # max per-joint bend, degrees (matches the web tool's S.flex)
    "bank": 0.6,         # how hard it banks/rolls into turns (matches the web tool's S.bank)
    "bob": 0.08,         # a little vertical drift, fraction of body length (the web tool's "depth" axis, repurposed here as true vertical since TD is real 3D)
}


def clamp(v, a, b):
    return min(b, max(a, v))


def wrap(a):
    return math.atan2(math.sin(a), math.cos(a))


# --------------------------------------------------------------------------
# Species data

def load_species(key_or_path):
    path = key_or_path if os.path.sep in key_or_path or key_or_path.endswith(".json") \
        else os.path.join(DATA_DIR, f"{key_or_path}.json")
    with open(path) as f:
        return json.load(f)


# --------------------------------------------------------------------------
# Swim steering + spine (ecology-sim.js's followChain/trail3D, simplified to
# one free-swimming creature -- no flocking, predation, or tank bounds).

def new_state(seed=1, x=0.0, y=0.0, ang=0.0):
    rnd = random.Random(seed)
    return {
        "rnd": rnd, "x": x, "y": y, "ang": ang,
        "vx": math.cos(ang), "vy": math.sin(ang),
        "wanderA": rnd.uniform(0, 2 * math.pi), "phase": rnd.uniform(0, 10),
        "turnS": 0.0, "chain": None,
        "cz": [0.0] * K, "croll": [0.0] * K, "_t": 0.0,
    }


def _ensure_chain(state, seg_len):
    if state["chain"] is not None:
        return
    dx, dy = -math.cos(state["ang"]), -math.sin(state["ang"])
    state["chain"] = [(state["x"] + dx * seg_len * i, state["y"] + dy * seg_len * i) for i in range(K)]


def follow_chain(state, seg_len, max_bend):
    c = state["chain"]
    old = list(c)
    c[0] = (state["x"], state["y"])
    prev_ang = math.atan2(-state["vy"], -state["vx"])
    px, py = c[0]
    for i in range(1, K):
        ox, oy = old[i]
        a = math.atan2(oy - py, ox - px)
        d = wrap(a - prev_ang)
        if d > max_bend:
            a = prev_ang + max_bend
        elif d < -max_bend:
            a = prev_ang - max_bend
        px, py = px + math.cos(a) * seg_len, py + math.sin(a) * seg_len
        c[i] = (px, py)
        prev_ang = a


def trail3d(state, dt, sp, cfg, body_len):
    cz, croll = state["cz"], state["croll"]
    seg_len = max(1e-4, body_len / (K - 1))
    k = clamp(sp * dt / seg_len * 1.2, 0.0, 1.0)
    roll_goal = clamp(-state["turnS"] * cfg.get("bank", 0.6) * 1.3, -1.1, 1.1)
    bob = cfg.get("bob", 0.0) * body_len
    cz[0] = bob * math.sin(state["_t"] * 0.6 + state["wanderA"])
    croll[0] += (roll_goal - croll[0]) * min(1.0, dt * 5)
    for i in range(1, K):
        cz[i] += (cz[i - 1] - cz[i]) * k
        croll[i] += (croll[i - 1] - croll[i]) * k


def step(state, species, cfg, dt):
    if dt <= 0:
        return
    state["_t"] += dt
    swim = species["swim"]
    body_len = cfg["size"] * swim["len"]
    seg_len = max(1e-4, body_len / (K - 1))
    _ensure_chain(state, seg_len)

    max_sp = cfg["speed"]
    rnd = state["rnd"]
    state["wanderA"] += rnd.uniform(-1, 1) * dt * 1.2
    fx = math.cos(state["wanderA"]) * max_sp * cfg.get("wander", 0.6)
    fy = math.sin(state["wanderA"]) * max_sp * cfg.get("wander", 0.6)
    fx += math.cos(state["ang"]) * max_sp * 0.4
    fy += math.sin(state["ang"]) * max_sp * 0.4

    state["vx"] += fx * dt
    state["vy"] += fy * dt
    sp = math.hypot(state["vx"], state["vy"])
    if sp > max_sp and sp > 1e-6:
        k = max_sp / sp
        state["vx"] *= k; state["vy"] *= k; sp = max_sp
    min_sp = max_sp * 0.35
    if 1e-6 < sp < min_sp:
        k = min_sp / sp
        state["vx"] *= k; state["vy"] *= k; sp = min_sp

    want = math.atan2(state["vy"], state["vx"])
    dA = wrap(want - state["ang"])
    max_turn = math.radians(cfg.get("turnRate", 160.0)) * dt
    if abs(dA) > max_turn:
        dA = math.copysign(max_turn, dA)
    state["ang"] = wrap(state["ang"] + dA)
    state["vx"], state["vy"] = math.cos(state["ang"]) * sp, math.sin(state["ang"]) * sp
    state["x"] += state["vx"] * dt
    state["y"] += state["vy"] * dt

    turn_norm = clamp(dA / dt / math.radians(max(cfg.get("turnRate", 160.0), 1.0)), -1.0, 1.0) if dt > 0 else 0.0
    state["turnS"] += (turn_norm - state["turnS"]) * min(1.0, dt * 6)

    max_bend = math.radians(cfg.get("flex", 18.0)) * swim["bend"] * 11.0 / (K - 1)
    follow_chain(state, seg_len, max_bend)
    trail3d(state, dt, sp, cfg, body_len)

    beat = 3.0 + 9.0 * sp / max_sp
    state["phase"] += dt * beat * math.sqrt(max(cfg["speed"], 0.01)) / math.sqrt(max(0.6, swim["len"] / swim["waves"]))


def build_spine(state, species, cfg, body_len):
    """The moving spine: the trailing chain plus the swim wave riding on
    top of it (ecology-sim.js's chain + Cybernetic Ecology.html:852-862's
    writeSpines wiggle), returned as (x, y_up, z, roll) in TD's Y-up axes
    -- the web tool's "depth" axis becomes true vertical height here."""
    swim = species["swim"]
    amp = cfg.get("wiggle", 0.35) * body_len * swim["amp"]
    waves, amp_pow = swim["waves"], swim["ampPow"]
    c, cz, croll = state["chain"], state["cz"], state["croll"]
    spine = []
    for k in range(K):
        s = k / (K - 1)
        k0, k1 = max(0, k - 1), min(K - 1, k + 1)
        tx, ty = c[k1][0] - c[k0][0], c[k1][1] - c[k0][1]
        tl = math.hypot(tx, ty) or 1.0
        tx, ty = tx / tl, ty / tl
        off = amp * (0.12 + 0.88 * (s ** amp_pow)) * math.sin(state["phase"] - s * 2 * math.pi * waves)
        sx = c[k][0] + ty * off
        sy = c[k][1] - tx * off
        spine.append((sx, cz[k], sy, croll[k]))  # (x, up, forward, roll)
    return spine


# --------------------------------------------------------------------------
# Vertex placement: frame3 + main()'s body/rigid-part math from FISH_VS,
# with every animation term (beat, fold, lift, keyed pose) at rest.

def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _norm(v):
    l = math.sqrt(sum(c * c for c in v)) or 1e-6
    return (v[0] / l, v[1] / l, v[2] / l)


def frame3(spine, s):
    f = s * (K - 1)
    i0 = max(0, min(K - 2, int(math.floor(f))))
    t = clamp(f - i0, 0.0, 1.0)
    a, b = spine[i0], spine[i0 + 1]
    P = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)

    def tan_at(i):
        im, ip = max(0, i - 1), min(K - 1, i + 1)
        pa, pb = spine[im], spine[ip]
        return _norm((pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]))

    ta, tb = tan_at(i0), tan_at(i0 + 1)
    T = _norm((ta[0] + (tb[0] - ta[0]) * t, ta[1] + (tb[1] - ta[1]) * t, ta[2] + (tb[2] - ta[2]) * t))
    roll = a[3] + (b[3] - a[3]) * t

    L0 = _cross(T, (0.0, 1.0, 0.0))
    if sum(c * c for c in L0) < 1e-8:
        L0 = (1.0, 0.0, 0.0)
    L0 = _norm(L0)
    U0 = _norm(_cross(L0, T))
    cs, sn = math.cos(roll), math.sin(roll)
    L = (L0[0] * cs + U0[0] * sn, L0[1] * cs + U0[1] * sn, L0[2] * cs + U0[2] * sn)
    U = (-L0[0] * sn + U0[0] * cs, -L0[1] * sn + U0[1] * cs, -L0[2] * sn + U0[2] * cs)
    return P, T, L, U


def place_vertex(local_x, local_y, part, spine, by0, length, unit_scale):
    if part["rigid"]:
        s = clamp((part["pivotY"] - by0) / length, 0.0, 1.0)
        P, T, L, U = frame3(spine, s)
        dy = (local_y - part["pivotY"]) * unit_scale
        return (P[0] + L[0] * local_x * unit_scale + T[0] * dy,
                P[1] + L[1] * local_x * unit_scale + T[1] * dy,
                P[2] + L[2] * local_x * unit_scale + T[2] * dy)
    s = clamp((local_y - by0) / length, 0.0, 1.0)
    P, T, L, U = frame3(spine, s)
    return (P[0] + L[0] * local_x * unit_scale,
            P[1] + L[1] * local_x * unit_scale,
            P[2] + L[2] * local_x * unit_scale)


def build_geometry(species, state, cfg):
    swim = species["swim"]
    body_len = cfg["size"] * swim["len"]
    by0 = species["bounds"][1]
    length = species["bounds"][3] - species["bounds"][1]
    unit_scale = body_len / length

    spine = build_spine(state, species, cfg, body_len)
    parts = species["parts"]
    fv = species["fillV"]
    n = len(fv) // 3
    points = [None] * n
    for v in range(n):
        lx, ly, pid = fv[v * 3], fv[v * 3 + 1], int(fv[v * 3 + 2])
        points[v] = place_vertex(lx, ly, parts[pid], spine, by0, length, unit_scale)

    tris = species["fillI"]
    polys = [tris[i:i + 3] for i in range(0, len(tris), 3)]
    return points, polys


# --------------------------------------------------------------------------
# TouchDesigner adapter (see spire_forge_sop.py for the same pattern and
# the same caveat: written from memory against TD's Script SOP API, not
# run against a live TouchDesigner here).

_SPECIES_CACHE = {}
_STATE = {}


def _get_species(path_or_key):
    if path_or_key not in _SPECIES_CACHE:
        _SPECIES_CACHE[path_or_key] = load_species(path_or_key)
    return _SPECIES_CACHE[path_or_key]


def onSetupParameters(scriptOp):
    page = scriptOp.appendCustomPage("Creature")
    p = page.appendStr("Species", label="Species (key or data/<key>.json)")
    p[0].default = PARAMS["species"]
    p = page.appendInt("Seed", label="Seed")
    p[0].default = PARAMS["seed"]
    for name, default in (("Size", PARAMS["size"]), ("Speed", PARAMS["speed"]), ("Wander", PARAMS["wander"]),
                           ("Wiggle", PARAMS["wiggle"]), ("Flex", PARAMS["flex"]), ("Bank", PARAMS["bank"]),
                           ("Bob", PARAMS["bob"])):
        p = page.appendFloat(name)
        p[0].default = default
    p = page.appendPulse("Reset", label="Reset Swim")
    return


def onPulse(par):
    if par.name == "Reset":
        scriptOp = par.owner
        _STATE.pop(scriptOp.path, None)
        scriptOp.cook(force=True)
    return


def onCook(scriptOp):
    scriptOp.clear()

    species_key = PARAMS["species"]
    cfg = dict(PARAMS)
    seed = PARAMS["seed"]
    try:
        if hasattr(scriptOp.par, "Species"):
            species_key = scriptOp.par.Species.eval() or species_key
        if hasattr(scriptOp.par, "Seed"):
            seed = int(scriptOp.par.Seed.eval())
        for name in ("Size", "Speed", "Wander", "Wiggle", "Flex", "Bank", "Bob"):
            key = name[0].lower() + name[1:]
            if hasattr(scriptOp.par, name):
                cfg[key] = float(getattr(scriptOp.par, name).eval())
    except Exception:
        pass

    species = _get_species(species_key)

    state = _STATE.get(scriptOp.path)
    if state is None:
        state = new_state(seed=seed)
        _STATE[scriptOp.path] = state

    now = absTime.seconds
    dt = min(0.1, max(0.0, now - state.get("_lastT", now)))
    state["_lastT"] = now
    step(state, species, cfg, dt)

    points, polys = build_geometry(species, state, cfg)

    try:
        group_attr = scriptOp.attribs.create("group", "str", attribType="Prim")
    except Exception:
        group_attr = None

    sop_points = [scriptOp.appendPoint() for _ in points]
    for sp, (x, y, z) in zip(sop_points, points):
        sp.x, sp.y, sp.z = x, y, z

    for tri in polys:
        prim = scriptOp.appendPoly(3, closed=True, addPoints=False)
        for i, vidx in enumerate(tri):
            prim[i].point = sop_points[vidx]
        if group_attr is not None:
            try:
                prim.group[0] = species["key"]
            except Exception:
                pass
    return


# --------------------------------------------------------------------------
# Standalone test (no TouchDesigner required):
#   python3 creature_sop.py --test [species_key]
# Runs a few seconds of simulated swim and writes one OBJ per sampled
# frame to ./td_test_out/.

def export_obj(path, points, polys):
    with open(path, "w") as f:
        for x, y, z in points:
            f.write(f"v {x:.5f} {y:.5f} {z:.5f}\n")
        for tri in polys:
            f.write("f " + " ".join(str(i + 1) for i in tri) + "\n")


if __name__ == "__main__":
    import sys

    if "--test" in sys.argv:
        idx = sys.argv.index("--test")
        key = sys.argv[idx + 1] if len(sys.argv) > idx + 1 else PARAMS["species"]
        species = load_species(key)
        state = new_state(seed=1)
        cfg = dict(PARAMS)
        out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "td_test_out")
        os.makedirs(out_dir, exist_ok=True)

        dt = 1 / 30.0
        sample_at = {0.0, 0.5, 1.0, 2.0, 3.0, 4.0}
        t = 0.0
        frame = 0
        while t < 4.05:
            step(state, species, cfg, dt)
            t += dt
            frame += 1
            if any(abs(t - s) < dt / 2 for s in sample_at):
                points, polys = build_geometry(species, state, cfg)
                for p in points:
                    assert all(math.isfinite(c) for c in p), f"non-finite point at t={t}: {p}"
                xs = [p[0] for p in points]; ys = [p[1] for p in points]; zs = [p[2] for p in points]
                bbox = (max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
                print(f"t={t:4.1f}s  verts={len(points):5d}  tris={len(polys):5d}  "
                      f"bbox=({bbox[0]:.2f}, {bbox[1]:.2f}, {bbox[2]:.2f})  head=({state['x']:.2f},{state['y']:.2f})")
                export_obj(os.path.join(out_dir, f"{key}_t{t:.1f}.obj"), points, polys)
        print(f"\nOK -- wrote OBJs to {out_dir}")
    else:
        print(__doc__)
