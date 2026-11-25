# Worlds and saves

`packages/world/world.js` (`window.ForgeWorld`). A library and its tests so far: **no game page reads a world or writes a save yet.** That is the next step (the loader).

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

## Not decided

- **What dying does to the levels.** `rules.onDeath` is `keep` or `reset`, and both work. It is `keep` until Zac decides, and can be given at the moment (`die(world, save, { onDeath })`).

## Checked

`games/the-maw/tests/world.test.ts`, 12 tests: a world's checks, seeds, gates, keep-only-what-differs and making the level again from it, frozen against living, both death rules, round trips.
