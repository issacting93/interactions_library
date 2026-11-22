# @forge/ecology

The living tank: the simulation, diet and food web, director, habitat, walkers on the floor, and the Rust engine as a script (eco-engine.js, built from games/the-maw/engine).

Needs: @forge/core, @forge/kit, @forge/parts, @forge/motion.

These are classic scripts: a page loads each with `<script src>` and it puts its name on `window` (in the order of what it needs). Nothing here imports anything yet; see `docs/PACKAGES.md`.

Scripts: `eco-engine.js`, `ecology-diet.js`, `ecology-director.js`, `ecology-habitat.js`, `ecology-loop.js`, `ecology-sim.js`, `ecology-walk.js`, `ecology-walkers.js`.
