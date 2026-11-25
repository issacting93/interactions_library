# Worlds and saves

`packages/world/world.js` (`window.ForgeWorld`). The field page plays a world: `games/the-maw/field/index.html#world=example`.

## Two files

**A world** says which levels there are and how they join. It is made once and does not change as you play. Example: `games/the-maw/worlds/example.json`.

```json
{ "format": "forge-world", "version": 1, "name": "Example: two places", "seed": 2026, "start": "field",
  "levels": [ { "id": "field", "level": "field", "away": "live" }, { "id": "duel", "level": "duel", "away": "freeze" } ],
  "links":  [ { "from": "field", "to": "duel" }, { "from": "duel", "to": "field" } ] }
```

- `level` names a level file in `games/the-maw/levels`. Two places can use the same file with different seeds.
- A level's seed comes from the world's seed and its id unless it states one, so adding a level changes no other.
- A link is one way. `needs` names a flag that opens it.
- `away` is what the level does while you are elsewhere: **`freeze`** (you find it as you left it) or **`live`** (it goes on). Each level chooses.

**A save** is what one player has done to a world. A level is never stored whole: it is made again from its file and seed, and the save holds only what differs.

| Part | Holds | Lives |
|---|---|---|
| `levels[id].changes` | Commands (the level editor's own: add, remove, set) that turn the made level into the one you left | Until death, by the rule below |
| `levels[id].state` | Anything else the game wants kept about that level (food left, who is alive) | The same |
| `levels[id].leftAt` | The clock when you left, so a living level knows how long you were gone | The same |
| `run` | The Maw, its kit, flags set this run | Dies with the run |
| `lasting` | Runs, unlocks, levels seen, lasting flags, bests | Survives |
| `clock` | Seconds played. It only moves while somebody plays | Always |

## Using it

```js
const save = ForgeWorld.newSave(world);
let here = ForgeWorld.go(world, save, world.start);          // { level, seed, changes, state, away, first }
const { level } = ForgeWorld.levelFor(madeLevel, here.changes);   // build this, then play `here.away` seconds forward
ForgeWorld.tick(save, dt);                                     // as the game steps
here = ForgeWorld.go(world, save, 'duel', { made: madeLevel, now: levelAsItStands, state: {...} });
ForgeWorld.die(world, save, { unlocked: ['sonar'] });
```

- `go` refuses a move no link allows, before anything is changed.
- A change that no longer fits (the level file moved on since the save) is skipped and counted, not an error.
- A living level reports how long you were away. **How the game spends that time is not built:** play it forward at speed, or stand in a cheaper estimate.

## Playing a world (the field)

- `#world=<name>` loads `games/the-maw/worlds/<name>.json`. The save is kept on the device under `forge-save:<name>`, written every 5 s and when you leave a level. Clear that key to start again.
- **An exit is a placed thing** (`exit` in a field level: `to` is a level id in the world, `r` its size). The editor has **+ Exit**. Walk the Maw into the ring and, if the world has a link that way and its flag is set, the game saves and loads the next level. A shut way shows a dashed ring and says so.
- **It is a quick page load, not a seamless step.** The next level is built fresh from its file and seed.
- A level you return to is made again from its file and the save's changes. A **living** level is played forward for the time you were away with nothing drawn: **at most 20 s of it**, in chunks, with a line on screen. (The save keeps the true time away; the page plays only that much.)
- Loading the page again mid-level resumes it and counts nothing twice.
- `ForgeWorld.checkExits(world, id, level)` says if an exit leads nowhere (error), has no link (it stays shut), or a link has no exit.
- The example world joins `field-gate` (living) and `duel-gate` (frozen), which are the field and duel with an exit each.

### What the game does not carry between levels yet

- **The Maw itself.** Each level starts it fresh; the save only counts meals into `run.maw`. Carrying its body, kit and growth needs the Maw's state in a form the page can read back.
- Anything in `changes` from play: the field's level changes only through the editor so far. What a player eats or kills is not written back.
- Dying does nothing to the save (the field respawns the Maw as it always did). The `reset` and `keep` rules are built and wait for Zac's decision.

## Not decided

- **What dying does to the levels.** `rules.onDeath` is `keep` or `reset`, and both work. It is `keep` until Zac decides, and can be given at the moment (`die(world, save, { onDeath })`).

## Checked

`games/the-maw/tests/world.test.ts`, 14 tests: a world's checks, seeds, gates, keep-only-what-differs and making the level again from it, frozen against living, both death rules, round trips.

`games/the-maw/tests/world-walk.py` plays the example world in headless Chrome: start, the save on the device, resume, walking out by the exit (the test puts the exit under the Maw, rather than steering it), the seeds, coming back to a living level and playing the time away. Nothing here has been seen on a real screen.
