# @forge/level

A level as a data file. `level.js` (`window.ForgeLevel`, also loadable in Node) is the one place that knows the format: the entity types and their properties, new levels and templates, files in and out, the checks, and edits as commands with undo and redo.

Needs: nothing.

Read by `games/the-maw/field` (`#level=draft` or `#level=<name>`), written by `games/the-maw/editor`. The format is described in `docs/LEVELS.md`; levels are kept in `games/the-maw/levels`.
