# @forge/level

A level as a data file. `level.js` (`window.ForgeLevel`, also loadable in Node) is the one place that knows the format: the entity types and their properties, new levels and templates, files in and out, the checks, and edits as commands with undo and redo.

Needs: nothing.

`catalog.js` (`window.ForgeCatalog`) is the species a level can name, generated from the kit (`games/the-maw/tools/level-catalog.mjs`).

Read by `games/the-maw/field` (`#level=draft` or `#level=<name>`), written by `games/the-maw/editor`. The format is described in `docs/LEVELS.md`; levels are kept in `games/the-maw/levels`.
