# Forge -> World Scene pipeline

`tools/pipeline/forge-to-scene.sh [sigils|towers|scene|build ...]` runs the steps that carry forge work into the scene.

| Stage | What it does |
|---|---|
| `sigils` | `tools/sigil-atlas/`: Sigil Forge's generator makes 8 seals headless, gold on transparent, packed into `world/scenes/world-scene/sigils/seal-atlas.png`. A place wears them with `setting.etch`. |
| `towers` | `solid-towers.mjs`: every Forge spire in `tower-presets.js` is built as solids (`SpireSolid`, the Solid Tower code) with no browser and checked (NaN, unit normals, index range, triangle count, time). |
| `scene` | World Scene smoke test and the scene check against `tools/capture/world-scene-baseline.json`. |
| `build` | `tools/publish/world-scene.py` builds the folder; the files that changed since the last build are written to `<out>.files.json` for `publish_files`. |

Where each forge's work enters the scene:
- **Sigil Forge** -> `sigils/seal-atlas.png` -> tower shader etching (`setting.etch`).
- **Spire / Tower Forge** -> saved towers are `TowerPresets` (`spec.spire` genome) -> `city.ring` / `hub` in a place.
- **Solid Tower** -> `SpireSolid` -> `city.solid: true` in a place draws the kit parts as stone on the towers (experimental: some plates still draw black in the Route styles).
- **City grammar / grid** -> `city.layout: 'grid'` (`packages/city/city-grid.js`).

Rule learned the hard way: commit forge work. The Solid Tower code lived only in a patch sent in chat and was recovered from the published artifact on 27 Nov.
