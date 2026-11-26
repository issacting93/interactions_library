# The lab

Runs of the game with nothing drawn, logged the same way on every page, so one version of a level can be compared with the next. Plan: `claude/forge-rust-engine-build-plan.md` (L1 to L3).

## One log

`packages/lab/lab-log.js` (`window.ForgeLog`). The field writes every event into one; the tank's balance runs write one per run.

```
{ "format": "forge-log", "version": 1, "page": "field", "level": "One on one", "seed": 3, "secs": 120, "dropped": 0 }   <- first line
{ "t": 4.18, "type": "meal", "pred": "Maw", "prey": "Sigil Koi" }                                                     <- one event a line
```

- `t` is simulation seconds, never wall time.
- Shared types: `meal`, `death`, `maw_hit`, `maw_death`, `catch`, `grow` (from `EcologyMaw.hist`: kind and donor), `shed`, `level`, `end`. A page may add its own (the field has `hit`, `engage`, `fight_end`, `kill`, `respawn`, `ink`, `plate`, `accept`, `maw_respawn`).
- `ForgeLog.digest(log)` hashes the events: two runs agree exactly or they do not. `summary` counts by type and per minute. `toJSONL`, `fromJSONL`, `toCSV` (a column for every field any event has).
- The field's Log panel exports the same events; `window.__runLog()` gives them as JSON lines after a `#run`.

## The runner

```
python3 games/the-maw/tools/lab-run.py --field field --seeds 1-20 --secs 120 --out lab/field-before
# change something
python3 games/the-maw/tools/lab-run.py --field field --seeds 1-20 --secs 120 --out lab/field-after --compare lab/field-before
python3 games/the-maw/tools/lab-run.py --stage floor --seeds 1-10 --secs 90 --out lab/floor
```

- `--field NAME` plays a field level on Auto (the field page's `#run`), `--stage ID` a tank stage on its autopilot (`floor`, `frond`, `shoals`, `deep`, `spires`, `colony`, `apex`, `lv-<file>`). `--jobs` pages side by side (default 3). `--repeat` plays the first seed twice and fails if the logs differ.
- Writes `OUT/logs/<seed>.jsonl`, `OUT/runs.csv` (a row a seed) and `OUT/summary.json` (each measure's mean, spread, range; every seed's digest).
- `--compare DIR` prints each measure before and now, marks a change bigger than the old spread, and counts how many seeds' logs changed.
- Speed here (headless, software graphics): a field seed of 30 s takes about 8 s with 2 pages side by side; a tank seed of 30 s about 60 s. A real machine will be faster.

The numbers are Auto's and the autopilot's, not a person's. They say whether a change moved a level, not how it feels.

## What is repeatable

| Page | Same seed, same log? |
|---|---|
| Field (`#run`, `--field`) | **Yes.** Checked: `tests/field-run.py`, and `--repeat` / `--compare` over four seeds. |
| Tank stages (`--stage`) | **No, not yet.** Two runs of one seed start from different states: at step zero they hold different numbers of creatures and the Maw stands a fraction apart. Each balance run now starts as a run's ring does (the tank restored and emptied, the random stream, the director and the ground from the seed), which was not enough. What still carries over is most likely the walker crew (`EcologyWalkers`: hidden bodies that `empty` keeps) and state built up while the page ran live before the balance run. The tank's own `replay.py` passes because it goes through `runBegin` on a fresh page; the stage path does not yet do the same. |

So for a tank stage, compare means over many seeds, not digests, until that is fixed.

## Checked

- `games/the-maw/tests/lab-log.test.ts`: 5 tests (counts, digest, JSON lines both ways, the table, the cap).
- The runner on the field (4 seeds, `--repeat` the same, `--compare` against an earlier run: every measure and every digest the same) and on the floor stage (3 seeds; `--repeat` reports a different log, as above).
- `tests/field-run.py`, `tests/level-editor.py` (the editor's stage balance), the tank's `replay.py`.
