# Engineering practices

How changes reach `main`, what is checked, and how to run every check by hand. Written 22 Nov 2026, when these were set up.

## How a change lands

1. Make a branch from `main`, one idea each (`git checkout -b maw-hunters`).
2. Push it and open a pull request. The fast checks (`.github/workflows/checks.yml`) run on it.
3. Merge when they are green. Anything that changes how the game plays says so in the pull request, with the numbers (below).

`main` should be protected in GitHub (Settings > Branches > Add rule for `main`: require a pull request and the `checks` workflow to pass). That setting is the repo owner's to turn on; until then, this is a habit, not a lock.

## The checks

| Check | What it catches | When | By hand |
|---|---|---|---|
| Rust tests, clippy | the engine's own rules; Rust mistakes (`-D warnings`; the lints the engine keeps on purpose are listed with reasons in `engine/src/lib.rs`) | every push | `cd games/the-maw/engine && cargo test && cargo clippy -- -D warnings` |
| Engine freshness | `eco-engine.js` built from Rust that has since changed, or edited by hand | every push | `cd games/the-maw && npm run check:engine` (rebuild: `npm run build:engine`) |
| TypeScript, vitest | the run layer and the engine's loader | every push | `cd games/the-maw && npx tsc --noEmit && npx vitest run` |
| ESLint (bugs only) | duplicate keys, unreachable code, constants reassigned, comparisons that are always the same (not style) | every push | at the root: `games/the-maw/node_modules/.bin/eslint shared/engine` |
| The game's data | a stage roster, crew or rule naming something that does not exist (the page silently skips those), bad numbers | every push | `cd games/the-maw && node tests/data-check.mjs` |
| Engine against JavaScript | the Rust engine giving a different number from the JavaScript it replaces | one seed every push, all nightly | `cd games/the-maw && node tests/engine-sim.mjs [seed]`, `node tests/engine-body.mjs`, `node tests/engine-surface.mjs` |
| The tank, engine on and off | the same in the real page (diet, the Maw, walkers) | nightly | `python3 world/forges/fish-tool/tests/engine-replay.py 4242` |
| A recording replays | a run that does not play back the same from its recording | nightly | `python3 world/forges/fish-tool/tests/record-replay.py 4242 7` |
| The rule audit | each rule of the diet, the pods, steering, a run and the Maw | nightly, three seeds | `python3 world/forges/fish-tool/tests/served.py audit.py 4242 7 99` |
| The game's numbers | a change in how the game plays (meals a minute, strikes landing, lowest energy, being caught, per mode) | nightly, reported | `python3 world/forges/fish-tool/tests/maw-balance.py` |
| The speed budget | the swimmers' step getting slower | nightly | `python3 games/the-maw/tests/engine-bench.py` |

The browser checks need Python's playwright (`pip install playwright`) and Chrome (`CHROME=/path/to/chrome`, else `/usr/bin/google-chrome`). None needs a local server: they serve the repo's files to the browser themselves.

## Reading the slow ones

- **The audit** marks each check PASS (every seed), SOMETIMES (some seeds) or FAIL (none). Many of its checks are statistical (a creature has to find food or a host in time), so SOMETIMES measures luck as much as the rule; watch for one that drops. Only FAIL fails the run. The seed restocks the creatures but not the walkers' world or the pods, so a seed does not give exactly the same results twice.
- **The game's numbers** are compared with `world/forges/fish-tool/tests/maw-balance.json`. A number outside its band prints DRIFT. That is a design question, not a bug: if the change meant it, say so in the pull request and save the new numbers with `--write`. They are measured with the Maw's autopilot, which does not play like a person (it never charges a strike against armour, for one).
- **The speed budget**: 220 creatures under 2.5 ms a step and 1,000 under 16 on this machine; nightly uses 5 and 32, since shared runners are slower. Times vary about 20% run to run.

## Bug reports as replays

A run records its seed, every step's size and every call the player makes into the Maw and the diet (`__eco.record()` in the console). Shift+R downloads it as a file. `__eco.replay(rec)` plays it back in a fresh page and returns the world's digest at its end; a run replays exactly. Endless records too, but starts from the tank as it grew in real time, so its recording only replays roughly.

## Generated files

`shared/engine/ecology/eco-engine.js` is built from `games/the-maw/engine` and `games/the-maw/src/engine` (`npm run build:engine` there). Its first line carries the fingerprint of the source it was built from, and the freshness check compares it, so CI never needs to build Rust to WebAssembly. Commit the rebuilt script with the Rust change.

## Not done yet

- Branch protection on `main` (a repo setting, above).
- Splitting the tank page (about 3,300 lines, with its own copy of the renderer) and the 1,000-line engine files into modules, and moving the classic scripts to ES modules. Planned in `claude/forge-engine-architecture-plan.md`; each step needs a look in a real browser, so each is its own pull request.
- Moving the game's tuning (species, `RULES`, stages) into data files with a schema. The data check covers the names and numbers in the meantime.
- Making Endless start from its seed alone, so its recordings replay exactly, and the audit fully repeatable from a seed.
