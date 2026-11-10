# Forge Mech · Blender template

Build a walker in Blender, export one `.glb`, and drop it into the Walker Bestiary
(**Import a Forge SVG or Blender GLB**). It walks with your pieces, mirrored, in mint strokes.

## Start

- **Easiest:** open `forge-mech-template.blend`. When Blender asks, choose **Allow Execution**
  so the Forge panel loads. (If you skipped that, open the Scripting tab, pick
  `forge_mech.py` in the text editor and press **Run Script**.)
- **Fresh file:** open `forge_mech.py` in the Scripting tab, press **Run Script**, then
  **New mech** in the Forge tab. Or install it once as an add-on: Edit › Preferences ›
  Add-ons › Install from Disk.

The panel is in the 3D view's sidebar (press **N**) under **Forge**.

## The rules

| | |
|---|---|
| Front | **−Y**. Blender's Front view (numpad 1) looks the mech in the face. Up is +Z. |
| Body | Pieces in the **Body** collection, built whole and centred on X = 0. The Bestiary arches them into a dome (**Dome** in the panel; 0 keeps them flat). |
| Head | Pieces in **Head** are drawn exactly as built. |
| Legs | Build **one side only, +X**. The grey legs on the other side are a live mirror preview and are not exported. **Leg 1** is the front pair. |
| Thigh / Shin | Each leg has two rigid parts. Pieces in **Leg N Thigh** swing at the **Hip** marker, pieces in **Leg N Shin** at the **Knee** marker. |
| Markers | Move **Hip**, **Knee** and **Foot** (the small spheres) onto your joints. The Foot is where the leg meets the ground. The knee bends the way you pose it. |

Any piece can be a mesh or a curve, such as an SVG you imported and extruded. Several pieces
can share a slot: put them all in the same collection.

## Workflow

1. File › Import › SVG, then extrude or solidify the curves.
2. Delete the placeholder pieces and move yours into Body, Head, and each Leg's Thigh and Shin.
3. Snap the markers to your joints.
4. **Check**, then **Export GLB**.
5. Bestiary › **Import a Forge SVG or Blender GLB**.

For more or fewer legs, run **New mech** in a new file with 1–4 leg pairs. The size doesn't
matter: the Bestiary scales the body to walker size.

GLBs that don't come from this template still load, but the Bestiary has to guess which
pieces are legs and where the knee is.
