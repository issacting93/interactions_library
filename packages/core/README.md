# @forge/core

The bottom layer: seeded random numbers, the simulation core (World, Clock, Schedule; built from games/the-maw/src/core), the walking surface, small helpers, the creature registry, the watched mechanism, and the vendored triangulator.

Needs: nothing.

These are classic scripts: a page loads each with `<script src>` and it puts its name on `window` (in the order of what it needs). Nothing here imports anything yet; see `docs/PACKAGES.md`.

Scripts: `eco-core.js`, `kit-utils.js`, `registry.js`, `rng.js`, `surface.js`, `svg-utils.js`, `vendor/delaunator.min.js`, `watch.js`.
