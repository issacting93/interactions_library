# Forge: review, 2026-11-10

A review of Forge after the consolidation pass (commit `dbf2090` on `machine-stance`), against its stated focus: **procedural generation and animation**. The system itself is described in [`forge-system.md`](./forge-system.md).

Method: I read the code I touched and the modules round it, measured the 3D scene in a headless browser with software rendering, and counted duplication across `world/` and `shared/`. I did not see it on a real GPU, so frame rates below are relative, not absolute.

## Summary

The generators are in good shape: seeded, recipe-based, and now each has one home. The weakest part is **animation in the world**: creatures and the city do not know about each other. The largest cost is **tower line geometry**, which is thirty times the whole city's. The biggest structural risk is **World Scene as one 3,900-line script** that everything now depends on.

Ranked, with what I would do first:

| # | Finding | Kind | Effort |
|---|---|---|---|
| 1 | Walkers ignore streets, terraces and buildings | Animation | Medium |
| 2 | Towers carry about 417,000 line segments; the city has 12,600 | Performance | Small |
| 3 | No undo for pins, and no autosave | Design | Small |
| 4 | Three places still do one job twice (Plots, Ecology top view, Tower engine) | Structure | Large |
| 5 | World Scene is one 3,900-line script on shared globals | Structure | Medium |
| 6 | Pure generators have no direct tests | Quality | Small |
| 7 | Small duplicated helpers and three versions of three.js | Structure | Small |
| 8 | Documentation is mostly history | Docs | Small |
| 9 | Nothing leaves Forge as motion | Product | Medium |

---

## 1. Walkers ignore the city

**What happens.** A saved creature picks a tower and walks to it in a straight line. It passes through blocks, across terrace edges and over the canal. It is lifted onto whichever terrace is under its body, so it jumps a level at each edge.

**Why it matters.** This is the point where generation and animation meet, and it is the least finished. The qilin's gait work is invisible when it glides through a house.

**What to do.**
- Build a walkable graph from the grammar: lots that are open, the ring roads, the avenues, and the stairs where an avenue climbs a terrace. The grammar already knows all four.
- Route each walker along it (A* on a few hundred nodes is cheap) and let it step up stairs.
- Then let buildings matter: a creature lingers at buildings that attract its kind. The attraction data already exists on building records (`prefab.attracts`).

## 2. Tower geometry dominates the scene

**Measured.** Line segments per tower: 245,722 for the main tower and 48,000 to 62,000 for each ring tower. The whole city is 12,638 segments and 18,706 triangles.

**Why.** `creature-spire.js` wraps every ornament part round every terrace at full detail, and each part is a hand-drawn SVG with many points. The towers are also the smallest things on screen at the default view.

**What to do.**
- Simplify part polylines once at load to a tolerance set by how large the tower stands (a Douglas–Peucker pass). I would expect a large reduction with no visible change at city scale.
- Build two levels: the full drawing for a close view, a light one for the whole-city view.
- A change to one tower currently stands every tower again. Rebuild only the site that changed.

A pin on a block is already fast: 34 ms to rebuild the city, 225 ms for a whole new world.

## 3. No undo, no autosave

**What happens.** A pin can be removed from its block's bloom, and "Unpin all" clears everything, but there is no step back. A city is only kept when you press Save; a reload loses unsaved pins.

**What to do.** Keep a short history of `recipe.grammar` (it is a small object) with undo and redo, and save a draft of the open city to the world file after each change.

## 4. Three jobs are still done twice

Kept on purpose in the last pass, because each still holds something the 3D world lacks.

| Still split | What the older half holds | What it would take |
|---|---|---|
| **Plots view** (flat map on `city-wfc.js`) | Placing buildings on plots, per-plot tweaks, terrain | Give the 3D city more tower sites, chosen by district, and move per-site tweaks to the tower bloom |
| **Ecology top view** | Variants, drift, captures, what each building attracts | Run `ecology-loop.js` inside World Scene and move its controls into the Ecology tab. It depends on finding 1 for attraction to mean anything |
| **Tower engine** (two files, Tower Forge, the Tower panel) | A shell editor that Forge buildings no longer use | Decide whether Tower Forge is still a tool you want. If not, about 2,300 lines go |

`city-wfc.js` would then have one remaining job, choosing tower sites, which the grammar could do itself.

## 5. World Scene is one large script

**What it is.** `World Scene.html` is 3,920 lines in one inline script. `forge-host.js` reaches its variables as plain globals and relies on load order. It works, and the check suite covers the seam, but any rename inside the scene can break the host silently.

**What to do.** Split it along lines it already has: camera, city, towers, creatures, atmosphere, panels. Give the scene one object the host talks to instead of bare globals. This is the refactor I would do before adding anything large to the scene.

About one line in seven of the file is a comment, and many describe earlier designs. They should be cut down to what the code does now.

## 6. Generators are tested only through pages

Every check opens a page in a browser. The modules that matter most are pure functions with seeds: `CityGrammar.build`, `SpireGenerator.generate`, `CreatureSpire.layout`, `Gaits`, `IK`. None has a direct test.

**What to do.** Add a small Node test file per module:
- the same seed gives the same result (a stored hash);
- a pin is honoured, and an impossible pin is ignored without an error;
- every building template produces a non-empty drawing in 2D and 3D;
- a gait never leaves fewer feet on the ground than it promises.

These run in milliseconds and would have caught the "approximate in 3D" gap when the new forms were added.

## 7. Small duplication

- The seeded random generator is written out in 26 files; `shared/engine/rng.js` exists.
- `rolesOf` (which role a part can play) exists in 6 files, and they differ slightly.
- Pages load three.js at three versions: 0.128, 0.160 and 0.169.

None is urgent. The `rolesOf` copies are the one to settle, because two tools can disagree about what a part is.

## 8. Documentation is mostly history

The root README is 415 lines and the World Scene README 643; most of both narrates past changes, and `TODO.md` mixes open items with dated notes. I added removal notes instead of rewriting them. They should be cut to what is true now, with the history left to git.

## 9. Nothing leaves Forge as motion

Forge generates and animates, but what I found leaving it is still: PNG and SVG exports, layout JSON, a world file, and GLB from the Rust tools. I found no export of motion.

**Worth considering.**
- Record the 3D world to video or a GIF from a set camera path.
- Export the city as GLB, and a creature with its walk baked as an animation clip, so the game can load them.
- A turntable for one building or one creature.

If the game is the destination, the GLB export is the one that matters.

---

## Design notes

These are judgement, not defects.

- **The bloom is carrying three kinds of choice at once** on a block: district, street front, and built or open. With up to sixteen hexes it is a menu shaped like a bloom. Since the hex bloom is for variations, a block's bloom could show a handful of *whole results* (this block as a market, as a shrine, as a garden), each a small picture, the way the creature bloom does.
- **The default look is dim.** In my renders the city read poorly in Route Zero and well in Paper. Worth choosing the default by eye on your screen.
- **The main tower does not yet dominate.** Every tower is scaled to fit its site, so a wide hall comes out small and the centre tower is one among several. The centre could take a larger share of height by rule.
- **The Plots tab is hard to explain.** It shows a different city under the same seed. Until it is removed, a line on the tab saying so would save confusion.

## What I would not do yet

More building forms, more creature kinds and more stages. Each adds surface to a system whose parts are only now in one place. Findings 1, 2 and 3 make what already exists feel finished.
