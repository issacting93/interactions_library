# Spire Forge in TouchDesigner

`spire_forge_sop.py` ports Spire Forge's structural generator into a
TouchDesigner Script SOP that builds a real 3D building instead of a flat
elevation drawing. It keeps the same genome (template + seed → base
terraces, shaft + balconies, upper drums, dome, neck, crown) but swaps the
creature-part dressing (which doesn't exist in TD) for plain geometric
stand-ins: struts for ribs/blades/buttresses, a torus for the crown halo,
boxes for beads, lathed rings for everything else.

## Verifying it without TouchDesigner

The geometry builder (everything above the "TouchDesigner adapter" comment
in the script) is plain Python with no TD import. Run:

```sh
python3 spire_forge_sop.py --test
```

This builds all 5 templates at a few seeds, asserts there are no
degenerate/non-finite points, and writes an `.obj` per template+seed to
`td_test_out/` (gitignored-worthy scratch — delete after checking). Open
one in Blender, Preview, or any OBJ viewer to see the silhouette before
touching TD at all.

## Wiring it into TouchDesigner

1. Create a **Text DAT**, paste the contents of `spire_forge_sop.py` into
   it.
2. Create a **Script SOP**, and set its *Script* parameter to that Text
   DAT.
3. Cook it. `onSetupParameters` adds a **Spire** custom page to the Script
   SOP with:
   - **Tpl** — lighthouse / spire / hive / shrine / rotunda
   - **Seed** — integer seed
   - **Reroll Seed** — pulse button, picks a new random seed and recooks
4. Change Tpl/Seed and recook (or hit Reroll) to get a new building.

If you'd rather not touch custom parameters yet, just edit the `PARAMS`
dict near the top of the script and recook — the callbacks fall back to it
whenever the custom parameters aren't present.

## What carried over from the web tool, and what didn't

Ported (same ranges/odds as `../index.html`):
- `make_genome` ≈ `newGenome` (index.html:288-332) — per-template massing
  numbers (base tiers, shaft height, balcony count/taper, drum count,
  crown radius/blade count/beads, dome rise/shells, buttress odds).
- `make_tiers` ≈ `toTowerForge`'s metric conversion (index.html:761-805) —
  same 1m = 16px convention, same tier radii/heights.

Reinterpreted for real 3D (the web tool only ever drew these as a flat,
front-only elevation):
- Crown blade fans and halo beads are spread around the full 360°, not
  just the front-facing sweep the 2D drawing used.
- The dome is an actual curved lathed cap (the web tool only drew it as an
  SVG arc; `toTowerForge` didn't carry it through to tiers at all).
- Ribs/friezes/bay ornament are faceted shaft sides and simple struts, not
  creature-part sprites — there's no part catalog to draw from in TD.

Not ported: Claude-assisted design, saved buildings, SVG/PNG/layout.json
export, the Tower Forge / Forge world bridge. Those are web-tool-specific
plumbing (localStorage, clipboard, the shared Forge world file) that has
no TD equivalent; this script only needs to produce geometry.

## Caveat

This was written against TouchDesigner's documented Script SOP API
(`scriptOp.clear()`, `.appendPoint()`, `.appendPoly()`,
`.appendCustomPage()`, `.attribs.create()`) from memory — there's no
TouchDesigner install in this environment to run it against. The pure
geometry builder is verified (see above); if a call in the "TouchDesigner
adapter" section at the bottom of the script errors against your TD
version, that's the first place to look, and it should be a small, local
fix (the geometry logic above it doesn't need to change).
