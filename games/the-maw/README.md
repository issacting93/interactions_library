# The Maw

A roguelike run over the Cybernetic Ecology tank (`world/forges/fish-tool/Cybernetic Ecology.html`).

**The tank handles everything alive:**
- the creatures, their motion and their AI (`EcologySim`);
- the Maw's rig, its eating and its mutations (`EcologyMaw`, `EcologyDiet`);
- the director, the habitat and the walkers;
- the look: WebGL, Night and Route, and the TAPE 08 HUD.

**This folder holds the run around it:**
- **Rings:** the tank's seven places (`maw-stages.js`), always in order, always inward. Each run varies them from its seed: creature counts, landmarks, the ground, and sometimes a creature from the ring before.
- **Gates:** each ring's goal is the key to its way in. When the Maw has it, a gate opens at a spot on the floor. Reaching the gate takes the Maw to the next ring, carrying everything it has. Meeting the last ring's goal wins the run.
- **The nest:** death ends the run. What the Maw saw and ate goes into the bestiary, along with the runs, wins and deepest ring. It is kept on the device (`localStorage` key `maw-nest-v1`).

## Layout

```
src/core/rng.ts     the seeded RNG (mulberry32)
src/run/run.ts      the run: rings, gates, nest (pure data and rules, no DOM)
src/run/index.ts    exposes it as window.MawRun
tests/run.test.ts   against the tank's real places
```

`npm run build` writes `shared/engine/ecology/maw-run.js`, a classic script the tank loads after `maw-stages.js`. Don't edit that file by hand. The tank's glue is the "run" block in the page: `runBegin`, `ringPlace`, `runStep`, `runCard` and `runSheet`.

## Play

- **Locally:** serve the repo root and open the tank with `?run`.
- **Published copy:** `node world/forges/fish-tool/tests/build-artifact.mjs <out> --run`. This builds the same page with its title set to The Maw, and it opens on the Run.
