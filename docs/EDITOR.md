# Using the level editor

Built for one person working fast: keys first. `?` in the editor lists every key; `⌘K` (Ctrl+K) finds any action by name. Both read one list (`packages/ui/keymap.js`), so a key cannot be undocumented. Why it is this way: `claude/forge-editor-workflow.md`.

## Tools

| Key | Tool |
|---|---|
| V | Select (the default) |
| H, or hold Space | Hand: drag pans |
| T G W L X E M | Place a tower, grove, wall, landmark, exit, encounter, the Maw's start |

A place tool **stays armed**: T then ten clicks is ten towers. Esc or V ends it. The line at the foot of the map says which tool is active and what a drag will do; the cursor changes with it.

## Selecting

Click selects. Shift-click (or ⌘-click) adds or takes away. **Drag on empty ground draws a box**; Shift-drag adds to the selection. ⌘A all, Esc none. On a touch screen one finger on ground pans; turn Multi on to draw the box.

With several things selected the inspector is the **Selection** panel: what they share is edited for all (a differing value shows MIXED), plus Line up, Spread, Duplicate, Turn, Make prefab, Delete, and "Only towers" to narrow a mixed selection.

## Moving the view

Trackpad: two fingers pan, pinch zooms. Mouse: the wheel zooms at the cursor; middle-drag or Space-drag pans. ⌘-scroll always zooms. F fits the level, Shift+2 zooms to the selection, + and − zoom.

## Editing

Drag moves the selection; arrows nudge (Shift for far). ⌘C ⌘X ⌘V (⇧⌘V pastes at the cursor), ⌘D or D duplicates, Delete removes. Copy and paste carry the prefabs and creatures a thing needs, so they work between levels. R turns walls and prefabs 15° (Shift+R back). ⌘G makes a prefab, ⇧⌘G unpacks one. ⌘Z, ⇧⌘Z.

## Panels, play, files

1 to 9 switch panel tabs. P or ⌘↵ plays; Esc stops. N steps the snap. ⌘S saves, ⌘O opens.

### Saving into the repo

From `games/the-maw`, run `npm run editor` and open the editor from the address it prints (`http://127.0.0.1:5173/games/the-maw/editor/index.html`). It serves the repo on this machine only. With it running:

- ⌘S writes `games/the-maw/levels/<name>.json` and adds the name to `levels/index.json` (existing order kept). The World tab's Save does the same for `worlds/`.
- The name comes from the level's name (lowercase, dashes). If that file already exists and this is not the file you opened, the first Save says so and the second replaces it.
- The label by the title says `not in the repo yet` or `saved to levels/<name>.json`. Closing the tab with unsaved changes asks first.
- The server refuses other hosts and other websites, names with a path in them, and anything that is not a Forge level or world file. It never deletes.

Without the server, Save downloads a file as before; move it into `levels/` and add its name to `index.json` yourself. `--port` picks another port.

## Not yet

Right-click menus, ⌥-drag to duplicate, the keyboard going to the game on Play, and the same keymap in the field and the tank.

Checked by `games/the-maw/tests/editor-input.py` (real mouse and keys in headless Chrome, 25 checks). Not yet tried with a real trackpad or in Safari.
