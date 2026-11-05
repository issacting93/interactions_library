# Creature Architecture System

Tools that build architecture for the radial city from Zac's own creature parts: the 394-part kit
cut from the species sheet, the spine/dial parts and the xenoglyph alphabet. Everything draws in one
language: mint line on a dark plate, parts at their native size, flat elevations, no perspective.

## What's in here

```
tools/                      standalone pages (each runs on its own)
  bestiary-forge/           creatures assembled from parts; MAP-Elites "Evolve"; compose with Claude
  spire-forge/              round buildings as flat elevations: lighthouse, spire, hive, shrine, rotunda
                            (terraces, shaft, balconies, drums, dome, crown; bay split grammar)
  block-forge/              horizontal block stacks, plus two grammar families:
                              Classical  temple, palazzo, giant order, library (orders, pediments, domes)
                              Gothic     cathedral front, college range, with a Romanesque switch;
                                         29 named rules with the observation each came from
    src/classical.js, src/gothic.js   the two generators as separate files (already inlined in index.html)
  spire-stack/              sprite-stacked 3D of an elevation, with sections (spun / flat face / laid flat)
  sigil-forge/              sigils (word -> wheel / kamea / monogram path in a rosette and star frame),
                            grid-walk glyph alphabets, and icons with a 24 px legibility check
  tower-forge-ornament/     Tower Forge with Spire Forge ornament bands
  kit-scripts/              the Python used to cut the sheet into parts and classify them

repo-drop-ins/              files for the city repo
  shared/
    creature-arch.js        your original (unchanged): parsing, roles, kits, standElevation, wrapOnSurface
    creature-spire.js       Spire Forge designs built in 3D (wrap / spun / crossed sections, dome, occluder)
    creature-classical.js   Classical designs built in 3D (plan, four facades, round columns, gable roof,
                            stairs, dome, occluder)
    creature-city.js        the WFC city built from parts: Block Forge blocks, mini Spire towers,
                            classical temples/libraries/palazzos in the inner rings, streets, gardens
    creature-parts.json     the 394-part kit
  tools/
    World Scene.html        uses the four shared files above (Spire towers via spec.spire, the creature city)
    Sigil City.html, Tower Forge.html, Shrine Lathe.html   earlier green/creature versions

previews/                   renders of each system
```

## Running the tools

The pages load `parts.json` with `fetch`, so open them through a local server, not by double-clicking:

```
cd tools
python3 -m http.server 8000
# then open http://localhost:8000/spire-forge/
```

Saving to the shared gallery, downloads and "Design with Claude" only work when the page is opened
as a Claude artifact; locally everything else works (drawing, variations, controls).

Live versions (private to you): Bestiary Forge, Spire Forge, Block Forge, Spire Stack, Sigil Forge and
Tower Forge are published as artifacts in your Claude gallery.

## World Scene load order

```html
<script src="../../shared/creature-arch.js"></script>
<script src="../../shared/creature-spire.js"></script>
<script src="../../shared/creature-classical.js"></script>
<script src="../../shared/creature-city.js"></script>
```

`CreatureArch.load()` must resolve before the city or Spire towers build; World Scene already rebuilds
them once the parts arrive.

## Units

- Spire Forge and the 3D tower builder: 1 m = 16 px (`opts.unit`, default 1/16).
- The city: one Block Forge floor (46 px) = one WFC storey (`CityWFC.STOREY_H`).
- Classical in the city uses the city's unit, so temples and houses share one storey height.

## Data flow

```
creature-parts.json -> CreatureArch (roles, polylines)
Spire Forge genome  -> "To Tower Forge" spec includes spec.spire -> World Scene builds it with creature-spire.js
Block Forge Classical design (cl) -> creature-classical.js -> 3D (also used by creature-city.js)
CityWFC.generate + stack -> creature-city.js -> instanced line groups + one occluder mesh
```

## Not built yet

- Gothic family in 3D, and a cathedral for the city's core plaza.
- Rose windows taken from saved Sigil Forge designs.
- Campus layer: hedged lawns, stairs at the axes, sigil wellheads.
- World Scene changes were checked for syntax only; they haven't been run in a browser.
