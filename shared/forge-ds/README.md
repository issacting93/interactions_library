Forge Console is the interface of Forge, a procedural world builder: a kit of hand-drawn creature parts, generators that grow towers and seals from it, a round city to stand them in, and an ecology where bred species drift around the buildings. It takes the TAPE 08 design language (a 1970s tape machine drawn as an instrument panel) and extends it for objects that are made, placed, reused and go out of date.

Build every Forge screen from `tokens.css` and `components.css`. Use the `f-` classes; never restate a colour, size or radius in a page.

## Principles

1. **One panel per page.** The head unit (`f-unit`, on `panel`, `radius-panel`) holds whatever is picked. Everything else sits on `ground` as rows split by `line-1` hairlines. Never put a card inside a card; never give a list its own box.
2. **Draw, don't fill.** Structure is hairlines: `line-2` for region edges, `line-1` inside them. A solid fill means "on" (a pressed toggle, the current tab's underline), nothing else.
3. **Colour is a signal, and each signal has one meaning.**
   - `pick` (amber): the picked thing, keyboard focus, and the single next action.
   - `ok` (green): up to date, saved, live.
   - `stale` (red): out of date, broken, thin or clipped.
   - `sim` (cyan): a simulation or preview is running.
4. **Content hues identify; they never act.** `trk-1` to `trk-11` and the `stage-*`, `role-*` and `zone-*` aliases mark what a thing is: a 2px underline under a number, a clip's baseline, a meter. Never fill a button, a toggle or a state with one.
5. **Numbers are readouts.** Set every count, size, seed and version in Martian Mono (`readout-lg`, `readout`, `readout-sm`) with the unit beside it in `ink-2` at a smaller size: `158 px`, `v2`, `06`. Pad counts to two digits and indexes to two or three (`01`, `004`).
6. **Depth by one step.** `well` is below `ground`, `panel` and `lane-sel` are above it. No shadows, gradients or glows.
7. **Built for fingers.** Primary controls are at least `target` (44px) tall; secondary actions inside dense columns may use `target-dense` (36px). Focus is a 1px `pick` outline, 2px out.

## Content fundamentals

Write for someone making a world, not someone reading a database.

- **Labels** are one or two words, uppercase (`label`, `micro`): `SHAFT HEIGHT`, `PARTS USED`, `IN · KIT`.
- **Buttons** name their result, uppercase (`button`): `SAVE AS PREFAB`, `REROLL`, `RECOOK ALL`, `+ NEW WORLD`. Not "Submit", not "OK".
- **Names Forge owns** (stages, roles, chain modules) are `name-fixed`, uppercase: `BENCH`, `SEGMENT`, `SHAPE`.
- **Names people make** (worlds, species, buildings, cities) are `name` and keep the case they were typed in: "Pearl clawed hundred worm", "City 7". Never uppercase them; long names wrap.
- **Sentences** (hints, empty states) are `body` in sentence case: "Click a socket to inspect it, or drag a saved item from the Shelf onto one."
- Join related facts with a middle dot (`PREFAB · V2`), show routing with an arrow (`IN · KIT → OUT · VIEWPORT`), use a true minus (−6) and say `00`, not "none", in a readout.
- Empty lanes say what would be there and how to get it: `EMPTY · BREED A SPECIES FROM THE PARTS`.

### Vocabulary

Use these words, and only for these things.

| Word | Means | Not |
| --- | --- | --- |
| World | One file holding everything made in it | project, save |
| Kit | The shared parts library | assets |
| Sheet | A hand-drawn source of parts, such as "Butterfly worm" in Kit | species (in Kit) |
| Family | Sheets with the same body plan: wyrms, swifts and lancers, monarchs and seraphs, dragons, drifters, fish and puffers, crawlers, and marks (not creatures) | category, type |
| Part, role | One cut-out drawing, named sheet + feature + number ("Koi segment 03"); what it can be used as (frieze, hook, bead, core, segment, rib, halo, lamp, blade, spire, buttress) | piece, type |
| Hidden | A part that draws nothing at thumbnail size, or repeats another part on its sheet. Kept, never deleted; off by default, with a "Show hidden parts" check | deleted, broken |
| Building | Anything Bench grows for a city (a tower, a shrine) | tower (as a category), model |
| Prefab | A building tagged with the districts it may stand in | template |
| Seal, alphabet, rule set | Bench's other outputs and its grammar | sigil set, preset |
| City, plot, district | A solved round city; a place a building can stand; a ring of the city | map, slot, zone (in copy) |
| Species | A creature bred in Bestiary Forge | creature, monster |
| Variant | A species that drifted in Ecology and was captured | mutation, variation |
| Attach points, rig | Where a species' parts join; the bones and swim built from them | skeleton |
| Reroll | Keep the settings, draw a new seed | variation, randomize |
| Stale, recook | Built from something saved since; rebuild it | outdated, refresh |

## Workflow

Forge has five stages. The rail numbers them in an order that always works, but the work branches:

```
Kit ──▶ Bench ──▶ City ──┐
  └───▶ Species ─────────┴──▶ Ecology
```

- **1 Kit**: the parts. Everything starts here.
- **2 Bench**: grow buildings, seals and alphabets from parts and rule sets. Save a building as a prefab to use it in a city.
- **3 City**: solve a round city and stand prefabs on its plots.
- **4 Species**: breed creatures from parts (any time after Kit), set attach points, rig them.
- **5 Ecology**: needs a city and species; species drift around the buildings, and a captured variant comes back to Species.
- **Lineage** sits apart at the bottom of the rail: what each thing was made from, what uses it, and what is stale.

One thing is picked at a time across every page and tab. The head unit shows it, the selection bar at the bottom names it with every place it can be edited, and picking it anywhere picks it everywhere.

## Names in the kit

Ids never change (`P213`, `sheet-koi`): recipes, rigs and saved worlds point at them. What people read comes from `shared/creature-catalog.json`, built by `shared/creature-catalog/build.py`:

- A sheet has a clean name (sentence case, no "sheet-" prefix: "Koi", "Ringed lance swift II"), a family and two or three features ("koi fins · scales · rings"), and a hero part used as its thumbnail.
- A part is named by its sheet, the feature its role reads as (`body`, `wing`, `segment`, `claw`, `ring`, `halo`, `lantern`, `spine`, `rib`, `blade`, `frond`, `fin`, `plate`, `fleck`), and a two-digit number: "Koi segment 03". Show the id beside it in `micro` when someone may need to type it.
- Lists of sheets are grouped by family, in the catalogue's order, each row with its hero thumbnail (`f-catfam`, `f-catsheet`).

## Keyboard

Every Forge page: `1`–`5` jump to a stage, `L` to Lineage, `H` home. Kit: `/` search, `←` `→` step through the parts on screen, `C` copy the picked part's id. Show keys in `f-kbd` beside the thing they do, never only in a tooltip.

## Visual foundations

**Colour.** `ground` is the page; `well` sits behind drawings; `panel` is the head unit only. `ink` on any surface for names and values, `ink-body` for sentences, `ink-2` for labels and units. `ink-2` is 4.48:1 on `lane-sel`, just under AA, so a picked row's own label turns `ink`. `ink-off` passes only at 24px and up: use it for zero readouts, never for small text. Signal fills (`pick` on an on-toggle) take `on-signal` text at 9.2:1.

**Type.** Two families, both mono. Martian Mono (`--font-display`) for numbers and names; IBM Plex Mono (`--font-ui`) for labels, buttons and sentences. Load both from Google Fonts: `IBM+Plex+Mono:wght@400;500;600` and `Martian+Mono:wdth,wght@75..112.5,100..500`. Never use a proportional face for a readout.

**Space.** A 4px grid: `space-6` inside button clusters and lanes, `space-16` between row columns, `space-24` panel padding, `space-28` the page gutter.

**Radius grows with size.** `radius-xs` chips, `radius-sm` thumbs and clips, `radius-btn` buttons and fields, `radius-lane` lanes and the viewport, `radius-card` the index box, `radius-panel` the head unit, `radius-round` dots and badges.

**Drawings.** Parts, buildings and creatures are drawn by Forge's generators in their own phosphor green on `well`. That green is part of the art, not the `ok` signal: never use `ok` to mean "this is a drawing".

**Motion.** State toggles (a pressed button, the active tab, a selection) change instantly — never eased. A stale status dot blinks once a second in steps. Loading and transition feedback — leaving a stage, a panel regenerating, a new Shelf card arriving, a save confirming — uses eased motion (`shared/forge-anim.js`, built on anime.js): short, ease-out curves, never a spring or bounce. Under reduced motion both the blink and the eased motion stop; everything snaps to its end state.

## Components

- **Strip** (`f-strip`): the top bar. The world as a button that opens the worlds list, then where you are (`f-strip__where`), view tabs, and the page's actions on the right.
- **Rail** (`f-rail`): the five stages, numbered, then Lineage after a separator.
- **Head unit** (`f-unit`): the picked thing. Art, index box, name, status, readouts, and its actions. One per page.
- **Readout** (`f-readout`): a label over a number with its unit.
- **Track row** (`f-track`): a numbered thing (a stage, a role, a species) with a content-hue underline, a lane of clips or thumbs, a count and an action.
- **Clip** (`f-clip`): a saved object in a lane, with a content-hue baseline. Picked: a `pick` ring. Stale: a `stale` baseline.
- **Signal chain** (`f-chain`): IN, numbered modules on a dashed rail, OUT. Vertical for a recipe; `is-row` for a process laid left to right.
- **Meter bank** (`f-meters`): segmented channel meters, one per role; thin ones turn `stale`.
- **Buttons** (`f-btn`): outlined by default, `is-go` for the one next action, `is-on` for a pressed toggle, `is-text` for actions inside rows.
- **Tabs** (`f-tabs`): uppercase, the current one underlined in `pick`.
- **Field** (`f-field`): label with its value readout, then a fader, select or check. A value changed from its base turns its label `pick`.
- **Status, flag and note**: a dot with a word; a flag line under readouts; a note with a left rule for a sentence that needs attention.
- **List row** (`f-row`), **thumb** (`f-thumb`), **empty lane** (`f-empty`), **socket** (`f-socket`), **shelf and selection bar** (`f-shelf`, `f-sel`).
- **Sheet list** (`f-catfam`, `f-catsheet`): sheets grouped under a family label with its hue, each with a hero thumbnail, name and count. Build it with `CreatureCatalog.renderSheetList()`.
- **Key** (`f-kbd`): a keyboard key shown inline with what it does.

## Iconography

Forge has no icon set. Use words and Unicode arrows (`→`, `▾`, `↑`) in `ink-2`; a status is a 6px dot. When an icon is unavoidable, draw it inline as SVG with a 1.2–1.3px `currentColor` stroke on a 12–18px box; fill only transport glyphs. No emoji, no icon fonts. Icon-only buttons need an `aria-label`.
