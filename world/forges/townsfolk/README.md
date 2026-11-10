# Townsfolk

Procedural people for the town square, on the same IK engine as the Walker Bestiary. Nothing is
keyframed: feet plant and step, the hips ride over the standing foot, arms swing against the legs,
heads turn to look at you, and coats hang on Verlet points.

    python3 -m http.server 8731      # from the repo root
    # http://localhost:8731/world/forges/townsfolk/index.html

Tap a person to follow them, then tap the ground to send them there.

## How it works

- **Feet** are planted targets. A foot steps when the body has moved far enough past it, landing
  ahead along the walk; one foot is always down.
- **Pelvis** rides a spring over the standing foot, with a small rise and drop each step.
- **Legs and arms** use `IK.twoBone` from `shared/engine/motion/ik.js`: knees bend forward, elbows back.
- **Head** turns toward the camera when it sees you, on a spring, and drifts when it does not.
  `person.noGlance = true` holds it still (the sprite tools use this so frames repeat cleanly).
- **Coat** hems are Verlet chains hung from the hips.
- **Drawing**: camera-facing silhouette lines with filled occluders, so hidden lines drop out.

### The Touched dial

One dial makes them wrong, in five ways that can also be set one by one: **a beat off** (one leg late
and dragging, arms stop), **watching** (the head follows you past where a neck should turn, at a
steady, unblinking speed), **unsettled** (the hips never come to rest), **wrong joints** (knees and
elbows bend the other way, the back hunches, the neck stretches), and **held frames** (the body redraws
only every few frames, and sometimes stops mid-step). Each person takes it
differently: the dial reaches some of them only partly.

## Folders

| Folder | What is in it |
| --- | --- |
| `sprites/` | Sprite-sheet templates for six townsfolk, ordinary and taken: 8 directions x 8 walk frames + idle, one closed shape per body part, the skeleton on its own layer, a pivot cross in every cell. Cell 192 x 252 px, 100 px = 1 m. `00-preview-widow-crane.png` shows one |
| `templates/` | `character-template.svg`: a bare average person in five views (front, both three-quarters, side, back) with named joints, to handcraft a new character over |
| `tools/` | The scripts that make them |

## Tools

    python3 -m http.server 8731                                   # from the repo root
    python3 world/forges/townsfolk/tools/sprite-sheets.py         # rewrites sprites/*.svg
    python3 world/forges/townsfolk/tools/character-template.py    # rewrites templates/character-template.svg

Both open the page in headless Chromium (Python Playwright) and run `tools/sprites.js` in it, through
`window.Townsfolk` (`Person`, `S`, `THREE`, `people`). Offline, set `THREE_DIR` to a local
`three@0.160.0` package folder.
