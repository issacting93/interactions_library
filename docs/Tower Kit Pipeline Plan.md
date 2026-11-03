# Tower Kit Pipeline Plan

We will replace the hand-coded tower parts with a kit of drawn pieces, so the rules stay in code and the craft stays in Illustrator and Blender. A MAP-Elites search then combines the pieces into a wide gallery of towers.

## What exists today

| Tool | What it does | Role in this plan |
| --- | --- | --- |
| Tower Forge | Stacks tiers into towers, with crowns, bands, turrets and an animated aura. You shape it by dragging the silhouette and branch variations. | The first tool to load the kit |
| Building Graph | Node graph in three stages (arrange, surface, carve) that saves as code | Uses the same kit for walls, arches and roofs later |
| Round City Generator | Radial wave function collapse city with noise streets, Naqsh patterns and karbandi vaults | Places finished towers and buildings |
| Nine Li Lab | Chinese wards from model synthesis, space syntax and MAP-Elites | Proof that MAP-Elites works in this pipeline |

Right now every piece in these tools is built by hand in code. The kit swaps those pieces for ones you draw, and the rules stay as they are.

## The pipeline

1. **Draw** every piece in one Illustrator sprite sheet (SVG), each in a labelled box with a base line and connection points.
2. **Model** in Blender, only for pieces that are truly 3D (crowns, halos, finials): import the SVG, lathe or extrude it, keep its name as a tag, add socket markers. Profiles, openings and band outlines skip Blender, because the tool reads them straight from the SVG.
3. **Export** one glTF kit file with tags stored as custom properties.
4. **Generate**: Tower Forge loads the kit and places pieces by tag instead of hand-built geometry.
5. **Breed**: MAP-Elites mixes and mutates pieces, keeping the best tower per cell of a two-trait grid (for example height against ornament).
6. **Return**: export finished towers and cities as glTF to Blender for rendering.

## First kit: about 25 tower pieces

| Group | Count | Pieces |
| --- | --- | --- |
| Profiles | 7 | straight, bulge, onion, flare, waist, bell, taper |
| Crowns | 6 | dome, onion, spire, spikes, lantern, crescent |
| Bands | 5 | ring, beads, crenel, balcony, corbel |
| Openings | 4 | pointed arch, round, slit, door |
| Halos and finials | 4 | portal ring, gear arc, armillary, finial |

The city kit adds about 40 more pieces later: walls, corners, gates, roofs and courtyard parts.

## Naming and drawing rules

- Each shape's layer is named group\_name, for example crown\_dome or band\_balcony.
- Profiles are drawn as the right-hand half only, from the axis outward; the tool lathes them.
- The base line in each box is where a piece sits; small circles mark sockets where another piece attaches. Each socket also carries a type, direction and rule (see Contracts below), so a name alone never has to carry the logic.

## Contracts: recipe, plan, geometry

Generation runs in two steps with a readable middle:

**Tower recipe** (the genes the search changes) → **Tower plan** (tiers, placed pieces, socket connections and diagnostics, but no triangles) → **geometry** (meshes for the screen or for glTF).

The plan is the single source of truth:

- Fitness is scored on it.
- glTF export reads it.
- You can open any tower and see why it scored badly without rebuilding it.
- Two tools, browser or Rust, agree on a kit when they produce the same plan from the same recipe.

The plan also lists problems: missing pieces, unused pieces, sockets left open, two pieces claiming the same surface.

**Typed sockets.** A socket is a small record, stored in the SVG layer's metadata for 2D pieces and in glTF custom properties for 3D ones:

| Field | Meaning |
| --- | --- |
| Type | What it is, for example tier\_top, tier\_base, crown\_base, band\_ring, opening\_cut |
| Direction | Which way it faces (up, down, out) |
| Rule | Must connect, optional, or blocked |
| Accepts | Which socket types may join it |
| Id | A stable name for lookups and debugging |

When two pieces meet, the loader can then answer whether they connect, where, facing which way, and whether the result is valid, instead of guessing from names.

**A light grammar for the stack.** A tower splits into foot, shaft, setback and crown; a shaft can repeat tiers or split into twin shafts joined by a bridge tier. The grammar is the skeleton and the kit is the flesh: the search only explores arrangements that make architectural sense, so it spends its effort on proportion and ornament. The same split grammar handles L, T and U shaped footprints for the city kit later.

## How the tool reads the kit

- **2D pieces, straight from the SVG.** The loader finds each layer by name, samples its path and measures it against the box's base line and axis.
  - A profile becomes a lathe outline, replacing the built-in straight, bulge and onion curves.
  - An opening becomes a window cutout.
  - A band outline is swept round the tier top.
- **3D pieces, from one glTF kit file.** Each mesh carries its tag (for example crown\_dome) and its sockets as empty markers. The tool snaps a piece's base socket to the tier top and scales it to the tier radius.
- **Fallback.** Any piece missing from the kit keeps its built-in version, so the kit can grow ten pieces at a time.
- **Sizes are relative.** Pieces are drawn at any scale; the box's base line and width define one unit, and the tower's parameters set the real size.

## Breeding with MAP-Elites

This works like the Species Forge: the kit pieces are the parts, and a tower is a recipe that picks a piece for each slot (profile per tier, band, opening, crown, halo) plus numbers for size, count and placement.

- **Mutate and cross.** Swap a piece, nudge a number, or splice tiers from two parents. The Variations strip in Tower Forge already does the mutation half.
- **Two traits make the grid.** Start with height against ornament (how much of the surface is banded, ribbed or carved). Other useful pairs are slenderness against aura, and silhouette variety against symmetry.
- **One best tower per cell.** Fitness rewards towers that hold together: tiers that meet without big jumps in width, crowns sized to their tier, balanced proportions, and nothing floating that should rest.
- **You curate.** The grid is the gallery: click a cell to open that tower, pin the ones you like as parents, and breed again.
- **Scale.** About 26 pieces across 5 slots, multiplied by the numeric settings, gives thousands of distinct valid towers; the grid keeps them spread out instead of near-duplicates.

### Upgrades from current research

- **Gene-by-gene crossover.** Treat each slot (profile per tier, band, opening, crown, halo) and each number as a token, and build offspring by sampling tokens from two parents. Hutchinson et al. (2026) found that discrete gene crossover raises quality-diversity score, coverage and best fitness, most strongly late in a run once good building blocks exist. Keep small mutations alongside it, because crossover alone did worse in their tests.
- **Curation that trains the search.** Preference-Learning Emitters (Gallotta et al., 2022) learn what the designer likes from their picks and use it to propose the next candidates. Every pin or click records "this over its neighbours"; a small ranking model over the recipe biases which towers become parents. The gallery stays the only interface.
- **Breed from these.** Select two pinned towers and seed the next batch with their crossover children.
- **Structural fitness.** Add a cheap stability check: the centre of mass sits over the base, tiers overlap enough to rest on each other, and every piece's base socket is connected. Measure how smoothly tiers meet (the jump in width and the change in slope at each joint) instead of a yes or no. Save a real physics check for the few towers you export.
- **More traits without a bigger grid.** Add symmetry and silhouette variety (how many times the outline turns in or out) as traits. For three or more traits at once, switch the grid to a CVT archive, which divides any number of traits into a fixed number of cells.
- **The gallery is the thinking tool.** In a field study with 808 people, designers shown MAP-Elites suggestions engaged more and produced better designs than those shown random suggestions (Walton et al., 2026). So the grid's layout, labels and speed matter as much as the algorithm: name axes in design language, show where a pinned tower sits, draw thumbnails as soon as a cell fills, and only build full geometry when a cell is opened.

## Platform

| Option | Good for | Costs |
| --- | --- | --- |
| Browser (Three.js), current | Easy to share by link, fast to iterate, already built | Slowest at heavy solves; large cities need care (workers, instancing) |
| Blender (open source) | Geometry Nodes is already a Houdini-like graph; imports SVG and meshes; renders for free; Python scripting | The tools live inside Blender, and a designer-friendly interface takes extra work |
| Rust with Bevy | Fast standalone app, the stack Tiny Glade is built on; good for a real-time builder | You write most of the tooling and interface yourself |
| Swift | Native Apple app with good graphics | Smallest ecosystem for procedural 3D; Apple-only |

**Decision: one Rust core, three hosts, with Blender as the workshop.** Illustrator draws the pieces, Blender models the 3D ones and renders, and every rule (towers, solvers, MAP-Elites) lives in one Rust library with no engine inside it. That library runs in the browser tools we already have (compiled to WebAssembly), in a Mac and Windows app built with Bevy, and inside Blender as an add-on. Nothing gets rewritten twice, and the browser tools keep working while the app is built.

## Rust and Blender pipeline

| Part | Job | Built with |
| --- | --- | --- |
| Forge core (Rust library) | Tower and building specs, kit reading, wave function collapse and model synthesis, MAP-Elites, mesh building. No rendering, no interface. | Plain Rust; rayon to spread the search over every CPU core |
| Browser host | Today's Tower Forge, Building Graph and Round City, with their slow parts swapped for the core one at a time | wasm-bindgen; Three.js stays for display |
| Desktop app (Mac and Windows) | The designer's tool: viewport, drag-to-shape profile, atlas gallery, node editor, live creatures | Bevy, egui panels through bevy\_egui, egui-snarl for node graphs |
| Blender add-on | Generate a tower or city straight into a Blender scene for rendering, and check kit pieces as you model them | Python add-on calling the core through PyO3 |
| Kit files | Your pieces and their tags | SVG sprite sheet read with usvg and tessellated with lyon; glTF with tags in custom properties |

**How a piece travels.** Draw it in the Illustrator sheet, then:

1. 2D pieces go straight into the core from the SVG.
2. 3D pieces are modelled in Blender, with tags as custom properties and sockets as empties, and exported as one glTF kit.
3. The app reloads the kit file when it changes, so a Blender edit shows up in the app within seconds.
4. Finished towers and cities go back to Blender as glTF, with repeated pieces kept as instances so big cities stay light.

**Tags follow one convention end to end.** bevy\_skein reads Blender custom properties out of glTF extras as Bevy components, and supports Blender 4.2 to 5.x and Bevy 0.15 to 0.18. Using its format means a socket or a habitat value tagged in Blender arrives in the app as data with no glue code.

**Workspace layout.** One Cargo workspace; only the last crate knows about Bevy.

| Crate | Holds |
| --- | --- |
| forge-core | Recipe, plan, typed sockets, fitness; serde and glam only |
| forge-kit-svg | Reads the sprite sheet: layers, base lines, sockets, sampled outlines |
| forge-kit-gltf | Reads 3D pieces and their custom properties (the gltf crate with its extras and names features turned on) |
| forge-search | MAP-Elites and CVT archives, crossover, the preference model |
| forge-grammar | The tier split grammar |
| forge-wasm | The core compiled for the browser tools |
| forge-app | The Bevy desktop app |

The kit boundary stays fixed: SVG and glTF in, glTF out, plain recipes and plans in between. If the app ever depends on a Bevy-only format for the kit, the hybrid breaks.

## Libraries to build on

| Need | Library | Note |
| --- | --- | --- |
| Engine | Bevy (0.19, June 2026) | Breaks its API every 3 to 4 months; pin a version and upgrade on purpose |
| Panels, sliders | egui with bevy\_egui | Bevy's own editor is still experimental, so egui is the safer choice for tool UI |
| Node graphs | egui-snarl (or egui\_node\_graph2) | For the Building Graph in the app |
| Grid wave function collapse | ghx\_proc\_gen | Good reference and fine for square 2D and 3D grids; no polar grid and it restarts on a contradiction, so the Round City keeps our own solver with backtracking |
| Blender to Bevy data | bevy\_skein | Components set in Blender, carried in glTF extras |
| SVG | usvg and lyon | Read the sprite sheet, turn paths into outlines and meshes |
| Search prototyping | pyribs (Python) | Try new archive types (CVT archives for more than two traits, CMA-ME) before porting the winners to Rust |

**Worth evaluating before committing.** These fit the plan closely but are young, so test them against our own code first:

| Library | What it would give us | Caution |
| --- | --- | --- |
| symbios-shape | A Rust CGA grammar: extrude, split, repeat, taper, 15 roof types, deterministic output, and a genotype wrapper for evolving rule tables | Version 0.4.1, released 30 October 2026, about 60% documented, one maintainer |
| symbios-genetics | MAP-Elites, CVT-MAP-Elites, NSGA-II and novelty search behind one evaluator interface, with seeded, repeatable runs | Young; our own MAP-Elites is small enough to keep if it falls short |
| bevy\_workbench | An egui editor shell for Bevy: docked panels, inspector, console, undo and redo, saved layouts | Version 0.3; check it tracks Bevy releases |
| manifold (or csgrs) | Real boolean cutouts for openings | Only for final export; too slow inside the search |

## Roadmap

1. **Now, in the browser (2–3 weeks).** Read profiles and openings from the SVG sheet; export towers as glTF; keep improving the atlas. Introduce the tower plan step and typed sockets in the current code too. No Rust yet; this proves the kit format and the contracts.
2. **Forge core (3–4 weeks).** Move the tower spec, the tower builder and MAP-Elites into Rust; compile to WebAssembly and swap it into Tower Forge. Success: the same tower from the same spec in both, and the atlas running at least 10 times faster.
3. **Blender bridge (2 weeks).** Kit conventions written down, an export check in Blender, and an add-on that drops a generated tower into the scene for rendering.
4. **Desktop app (6–8 weeks).** Bevy viewport, egui panels, the profile editor, the atlas, kit hot reload, packaged for Mac and Windows.
5. **City and ecology (next term).** The polar solver and Building Graph in the core, then creatures that read habitat tags as they move through the city.

## Risks and how we handle them

- **Bevy churn.** Releases break code every few months. Keep all rules in the engine-free core, pin the Bevy version, and budget a few days per upgrade.
- **Renderer limits.** Tiny Glade began fully on Bevy, then moved rendering to its own Vulkan code while keeping Bevy's ECS. Keeping the core separate leaves the same escape route open.
- **Tool UI cost.** A designer-friendly interface is most of the work. Reuse egui widgets, keep the browser tools as the reference design, and test each tool with people before polishing it.
- **Kit drift.** Naming mistakes break the pipeline silently. The Blender add-on checks names, sockets and base lines on export.

## Testing and repeatability

- **Same seed, same gallery.** Seed every random choice and keep archives in a fixed order, so a seed and a kit always reproduce the same towers. This makes results shareable and bugs reproducible.
- **Plan hashes in tests.** Hash each tower plan (pieces, sockets, genes) and compare against stored hashes. Run thousands of evaluations headless on every change, with no GPU.
- **Browser and Rust agree.** While both exist, run the same recipes through both and compare plans; any difference is a contract bug.
- **Blender exports headless.** Run Blender from the command line in background mode with custom properties turned on, rather than through an interactive session, so kit exports are scriptable and reliable.

## Lessons from Tiny Glade

- Give each element its own generator (towers, walls, roofs, bridges) instead of one algorithm for everything.
- Watching structures assemble themselves in real time is a large part of the pleasure; keep generation live, not batched.
- Watch how people misuse pieces and turn the best misuses into tools; their machicolation tool started as players aligning stairs.
- Expect five or six rounds of interface changes per tool, driven by playtesting.

## Next steps

- [x] Generate the SVG sprite sheet template
- [ ] Draw the first ten pieces
- [ ] Build the kit loader in Tower Forge
- [ ] Add the MAP-Elites gallery
- [ ] Read profiles and openings straight from the SVG sheet
- [ ] Load 3D pieces from a glTF kit by tag and socket
- [ ] Export towers as glTF with their tags, for Blender
- [ ] Place Tower Forge towers in the Round City (sanctum and gates)
- [ ] Start the city kit: walls, corners, gates, roofs, courtyard parts
- [ ] Write the kit conventions page (names, base lines, sockets, custom properties)
- [ ] Set up the Rust forge core and run the tower builder in the browser through WebAssembly
- [ ] Prototype a CVT archive in pyribs for searching on three or more traits
- [ ] Build the Blender add-on: export check, then generate-in-scene
- [ ] Start the Bevy desktop app with egui panels and kit hot reload
- [ ] Split Tower Forge into recipe, plan and geometry steps, with the plan's problem list shown in the app
- [ ] Add gene-by-gene crossover and a "Breed from these" action to the atlas
- [ ] Log pins and clicks as preference pairs, then train a small ranking model to steer parent choice
- [ ] Add the stability check and smooth joint scoring to fitness
- [ ] Evaluate symbios-shape, symbios-genetics and bevy\_workbench against our own code
