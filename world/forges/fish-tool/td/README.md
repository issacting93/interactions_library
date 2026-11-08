# A Cybernetic Ecology creature in TouchDesigner

Pulls one swimming sigil-creature out of `Cybernetic Ecology.html` and
rebuilds it as a real, animated 3D mesh in a TouchDesigner Script SOP: the
same body-bending/swim-wave rig the web tool's shader does on the GPU,
ported to Python, driving one creature with simple cruise+wander steering
(no flocking/predation — see `creature_sop.py`'s docstring for the exact
line-by-line mapping of what's ported from
`shared/engine/ecology/ecology-sim.js` and `Cybernetic Ecology.html`, and what's
deliberately left out).

## 1. Extract a species (run once, outside TD)

```sh
python3 extract_species.py --list        # see all 41 species keys
python3 extract_species.py koi           # writes data/koi.json (~220KB)
```

This reads `shared/engine/ecology/ecology-species.js` (20MB — every species'
baked mesh data) and pulls out just one: its body-length/wiggle constants,
triangulated mesh, and per-part rig info (which parts pivot rigidly —
fins, whiskers — vs. which bend with the body). You only need to do this
once per species; `data/<key>.json` is what the Script SOP actually loads.

## 2. Verify without TouchDesigner

```sh
python3 creature_sop.py --test koi
```

Simulates a few seconds of swimming and writes sample frames to
`td_test_out/*.obj` (no TD needed — the sim/rig code has no TD import).
Open one in Blender or any OBJ viewer, or render a quick top-view PNG, to
see the silhouette swim before touching TD. Koi's shape is genuinely
spiky/angular up close (medallion head ring, angular pectoral fin sails,
a rib-fin spine) — that's the source art, not a bug; it reads as a koi
once filled/shaded rather than wireframed.

## 3. Wire it into TouchDesigner

1. Create a **Text DAT**, paste `creature_sop.py`'s contents into it.
2. Create a **Script SOP**, set its *Script* parameter to that Text DAT.
3. It needs to cook every frame to animate — Script SOPs don't have a
   built-in "cook every frame" toggle, so feed it something that changes
   every frame as input 1, e.g. an **LFO CHOP** or a **Timer CHOP** left
   running. (The script ignores the input's actual values; it reads
   TouchDesigner's own `absTime.seconds` for timing. The input just forces
   a recook.)
4. Cook it. `onSetupParameters` adds a **Creature** custom page:
   - **Species** — a key from `extract_species.py --list` (e.g. `koi`),
     or a path to a `data/<key>.json` you extracted
   - **Seed**, **Size** (body length, metres), **Speed**, **Wander**,
     **Wiggle**, **Flex**, **Bank**, **Bob**
   - **Reset Swim** — pulse to respawn it at the origin with a fresh seed
5. Add a **Geometry COMP** with the Script SOP inside, a camera, a light,
   and a **Render TOP** to see it. Bodies run roughly 0.3–1m by default
   (`Size`) — pull the camera back accordingly.

Multiple creatures = multiple Script SOPs (each pointed at the same or a
different Text DAT) — each keeps its own swim state, keyed by the Script
SOP's own path, so they won't collide or share position/phase.

## What's really going on, briefly

`Cybernetic Ecology.html` draws every fish as a flat silhouette (think: a
thin card, not a solid body) bent along a moving 3D spine curve. The spine
is a chain of 20 points that trails the creature's head with a max bend
per joint (`followChain`), gets a lateral sine wave added on top for the
swim stroke (`writeSpines`), and a vertex shader places every body vertex
by sampling that spine at the vertex's own position along the body, then
offsetting sideways. Fins/whiskers pivot rigidly at one fixed spine point
instead of sampling it per-vertex. This script reimplements exactly that,
in Python, for one creature — see `creature_sop.py`'s docstring for the
full ported/not-ported breakdown (short version: no fin flap/whisker
sway, no outline stroke, no multi-fish ecology).

## Caveat

Like `world/forges/spire-forge/td`, the TD-specific calls at the bottom of
`creature_sop.py` (`scriptOp.clear()`, `.appendPoint()`, `.appendPoly()`,
`.appendCustomPage()`, `absTime.seconds`) were written from memory — there
is no TouchDesigner install here to run them against. The sim/rig math
above that line is verified (see step 2); if a TD-specific call errors,
that's the first and only place to look.
