# Levels and the level editor

Written 25 Nov 2026 (branch `level-editor`). A level is a data file. A game page builds its world from the file; the editor makes and changes files. This is the first step of the engine and editor plan (`claude/forge-rust-engine-build-plan.md` in the Forge project).

| What | Where |
|---|---|
| The format, checks and edit commands | `packages/level/level.js` (`window.ForgeLevel`) |
| The editor | `games/the-maw/editor/index.html` |
| A page that reads levels | `games/the-maw/field/index.html` (`#level=draft`, `#level=<name>`) |
| Levels | `games/the-maw/levels/*.json`, listed in `index.json` |
| Tests | `games/the-maw/tests/level.test.ts` (vitest), `games/the-maw/tests/level-editor.py` (browser) |

## How it maps to an engine's editor

The editor is laid out the way Unity's and Unreal's are, and each of their ideas has one home here.

| Unity / Unreal | Here |
|---|---|
| Scene file / level (`.unity`, `.umap`) | a level file: `games/the-maw/levels/<name>.json` |
| GameObject / Actor | an entity: `{ id, type, x, y, ...properties }` in `level.entities` |
| Component properties shown by reflection (`[SerializeField]`, `UPROPERTY`) | `ForgeLevel.TYPES`: each type lists its properties once; the inspector and the checks are both made from that list |
| Hierarchy / World Outliner | the outliner (left) |
| Scene view / viewport | the scene (centre): the level from above |
| Inspector / Details | the inspector (right): Inspect, Level, Checks |
| Project window / Place Actors | the Add bar (bottom) |
| Play mode / Play In Editor | Play: the game page itself, given the draft; Stop returns to the edit as it was |
| Undo system / transactions | every edit is a command with its inverse (`ForgeLevel.apply`, `undo`, `redo`); a drag is one step |
| Console errors, Map Check | Checks: `ForgeLevel.validate`; a level with errors cannot be played |
| Prefab / Blueprint | not yet. Templates (New) are whole levels |

## The file (version 1)

```json
{
  "format": "forge-level", "version": 1, "name": "One on one", "notes": "", "seed": 7,
  "field": { "shape": "disc", "radius": 100, "crowd": 70 },
  "life": { "ambient": [{ "species": "koi", "count": 7 }] },
  "entities": [
    { "id": "e1", "type": "start", "x": 0, "y": 30 },
    { "id": "e2", "type": "tower", "x": 0, "y": -55, "r": 3.9, "height": 0.82 },
    { "id": "e3", "type": "encounter", "x": 0, "y": -10, "pattern": "charge", "tower": "" }
  ]
}
```

- **Units.** The field is a disc of radius `field.radius` (100). The middle is 0, 0; y runs down the map. A page scales this to its own size, so a level keeps its shape whatever `field.crowd` (how much ground: 40 to 600) is.
- **seed.** Everything a page draws by chance for the layout (plants in a grove, a creature's first heading) comes from it.
- **life.ambient.** The food the field keeps in numbers.
- **Entity types.**

| Type | Properties | Notes |
|---|---|---|
| `start` | | Where the Maw begins. Exactly one |
| `tower` | `r` 1.5 to 25, `height` 0.2 to 0.95 of the tank's depth | A solid the Maw climbs |
| `grove` | `r` 2 to 30, `plants` 1 to 40 | Grown plants, placed from the seed |
| `encounter` | `pattern` (one of the field's 21), `tower` (an id, or empty for the nearest) | Its place is the creature's home. A Hanging Drop goes to its tower |

- **Nothing is baked.** A file holds recipes and places only.
- **Written one way.** `ForgeLevel.stringify` gives the same text for the same level (the tests hold every file in `levels/` to it), so diffs stay small.
- **Versions.** `ForgeLevel.migrate` brings an older file forward one version at a time (`MIGRATIONS`). A newer file than the build knows is refused.

## Using the editor

Open `games/the-maw/editor/index.html` from a local server (or the deployed site). It works with a mouse or a finger.

- **Add:** choose a kind in the bottom bar, then tap where it goes.
- **Select and move:** tap a thing; drag it. Drag empty ground to pan; pinch or scroll to zoom; **Fit** shows the whole field. **Snap** sets the step.
- **Inspect:** the selected thing's place and properties. **Level:** name, seed, field size, food, notes, and **+ Field roster** (fills by rule from the seed). **Checks:** what is wrong; tap one to find it.
- **Play / Stop:** runs the level in the field page. Errors must be fixed first.
- **New / Open / Save:** templates; a file or one of `levels/`; a `.json` download. The level being edited is also kept on the device as a draft and comes back on reload.
- Keys: Ctrl/Cmd+Z and Shift+Z, Delete, D (duplicate), arrows (nudge, Shift for more), P (play), F (fit), Esc.

To add a level to the game's own list: save it, put the file in `games/the-maw/levels/`, and add its name to `index.json`.

## In a page

```html
<script src="packages/level/level.js"></script>
```

```js
const level = ForgeLevel.parse(text);                 // throws if it is not a level; migrates old versions
const { ok, errors, warnings } = ForgeLevel.validate(level);
const doc = ForgeLevel.doc(level);
ForgeLevel.apply(doc, { op: 'set', id: 'e3', props: { x: 10 } });
ForgeLevel.undo(doc);
```

The field page also writes itself out: `__arena.levelOf()` returns the field as it stands as a level.

## Not done

- **The tank does not read levels.** The seven stages (`packages/maw/maw-stages.js`: roster, crew, env, kit, goal) are not level files yet, and the format has no goal, look, weather or stage roster. Those are the next additions to version 2.
- **The machine garden** (machines, ground cover, weather) is not in the repo, so none of it can be placed.
- **The scene is a map,** not the game's 3D view. Play is how the level is seen as it will look.
- **The engine does not hold the level.** The field page builds its JavaScript world from the file. Commands in, events out (the Rust side) is still ahead.
- **A run does not replay exactly from a level's seed:** the field's patterns still use `Math.random`.
- Play reloads the game page each time. No painting of ground, no prefabs, no multi-select, no balance run.
- Seen in headless Chrome only: not on a real GPU, a phone or Safari.
