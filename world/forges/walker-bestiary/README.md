# Walker Bestiary

Bestiary Forge creatures walking in 3D. Each drawn limb is cut into bones and moved with inverse
kinematics, so the walk comes from the engine while the look stays your line art.

Open `index.html` from a server at the repo root (it fetches `shared/data/creature-parts.json`
and the specimens):

    python3 -m http.server 8731
    # http://localhost:8731/world/forges/walker-bestiary/index.html

## Where the pieces live

- **The walker** is `shared/engine/motion/walker.js` (`createWalker(env)` → `Walker`): stepping,
  posture, the leg solvers, running and appendages. This page lends it a scene, a ground and its art
  pipeline. Any page with a three.js scene can do the same.
- **How a creature moves is data.** `RUN` (in walker.js) holds the running gaits: `horse` (trot, then
  gallop) and `strider` (pace, then bound). `APPENDAGES` holds the neck-and-tail presets: qilin,
  dragon, scorpion, swan. The Motion buttons put either on any single-bodied creature.
- **Saving.** "Save to world" writes the creature to the Forge world file as a species record
  (`shared/engine/creature-record.js`): its kind, how to rebuild it, how it moves, and what it was
  bred from. Forge's Species page lists them by kind and opens them here with `?world=…&object=…`.
- **Genes.** Every creature has a few of its own: leg length, stance width, ride height, which neck
  and tail it carries and how big, and how it runs. They are saved with it (`recipe.motion`,
  `recipe.tweak`).
- **Bloom of blooms**: the centre hex is the creature that is walking, the six around it are that
  creature with one gene changed. Pick one and it becomes the centre. A Kit Mech's six also swap its
  parts; lock a slot to keep its part.
- **Click the creature** in 3D (its head, tail, body or a leg) and that part's options open in a
  ring where you clicked.
- **Gaits** come from `shared/engine/motion/gaits.js`, the same rulebook the flat walker in Rig and
  Ecology uses.

## How it works

- **Legs**: every leg is a chain of bones. The last bone (the foot) angles down to the planted target;
  on three-bone legs `IK.twoBone` solves the two above it, and longer legs use `IK.fabrik` with a pole
  bias so they keep their arch. Tentacles are all FABRIK, with a swaying pole so they curl.
- **Feet** plant and stay planted until they fall too far behind; then they step. Gaits: alternate
  (tripod/tetrapod), ripple (a wave down each side, centipede style), wave (one leg at a time), free.
- **Bodies** follow the leader along the path, and tilt to fit the planted feet.
- **Art**: `LimbArt.sliceSpine` cuts each drawn limb along a spine, one slab of line art per bone.
  The spine comes from the limb's joint and tip, from the middle of the drawing (`medialSpine`), or
  from hand-placed waypoints (`guidedSpine`, used for the scythe leg and the Hook Weaver).
- **Legs toggle**: the scythe leg (`specimens/scythe-leg.svg`, Zac's redrawn leg) can replace every
  walker's legs. Creatures drawn with it (Hook Weaver, Scythe Walker) keep their own.

The solvers and slicing live in `shared/engine/motion/` (`ik.js`, `limb-art.js`); this page is the
creatures and the look.

## Folders

| Folder | What is in it |
| --- | --- |
| `specimens/` | Forge exports that become walkers (`<key>.svg`), `scythe-leg.svg`, and `hook-weaver-v1.svg` (the first Hook Weaver, kept for reference; `hook-weaver.svg` is the redraw) |
| `rigs/` | One editable SVG per walker, top view, nose up: a layer per part type, a group per leg, a closed outline per bone, and a rig-guide layer with bones, joints and foot targets. `walker-rigs-all.svg` has all 13 on one sheet |
| `templates/` | Blank creature templates to draw a new walker over: strider, weaver, hundred-worm, pincer-crawler, radial-star, kraken. The Forge 400 x 400 top view at 2x, a numbered skeleton, optional pieces in a tray below. `00-overview.png` shows all six |
| `tools/` | The scripts that make `rigs/` and `templates/` |

## Adding a walker

1. Export it from Bestiary Forge and put the SVG in `specimens/` as `<key>.svg`.
2. Add the key and a display name to `SPECIMENS` in `index.html`.
3. If its legs need hand-placed spines, add waypoints for it to `OWN_SPINES`.

Or use **Import a Forge SVG** on the page to try one without saving it.

## Tools

    python3 -m http.server 8731                                   # from the repo root
    python3 world/forges/walker-bestiary/tools/rig-sheets.py      # rewrites rigs/
    python3 world/forges/walker-bestiary/tools/creature_templates.py   # rewrites templates/*.svg

`rig-sheets.py` opens the page in headless Chromium (Python Playwright) and runs `layout.js` in it,
through `window.WalkerBestiary`. Offline, set `THREE_DIR` to a local `three@0.160.0` package folder.
`creature_templates.py` has no dependencies.

`window.WalkerBestiary` (`CREATURES`, `PARTS`, `mapPart`, `sliceLimb`, `SCYTHE`, `sliceSpine`,
`walkers`) is also there for poking at things from the console.
