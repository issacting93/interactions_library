# The city grammar sheets

Three spreadsheets define the ancient city. `shared/city/city-grammar.js` reads them and builds the city in four layers. Open them in Numbers, Excel or Google Sheets, save them as CSV, and click **Reload sheets** in `tools/city-grammar/` to see the change.

| Sheet | One row per | What it decides |
|---|---|---|
| `districts.csv` | district | Where each district goes, how built-up it is, how tall it is |
| `modules.csv` | module | The pieces: what each looks like at the street, how floors stack, roofs, joins between levels |
| `sockets.csv` | socket | Which street fronts may meet which |

## The four layers

1. **Height.** The city sits on terraces, highest at the centre. The acropolis (the tower and sanctum) is level 3, the university terrace level 2, the upper town level 1 and the lower town level 0. Ring roads run between the terraces. The terrace radii and levels are `TERRACES` in `city-grammar.js`.
2. **Zoning.** Each terrace is a lattice of *lots*. `districts.csv` assigns lots to districts by rule. Then each lot is either built or open (street, plaza, garden, courtyard, water), using smooth noise so built lots clump into blocks.
3. **Modules.** The tiles sit *between* the lots. This is the dual grid from Townscaper. A tile looks at its four corner lots and picks its module from which of them are built:
   - `end`: one corner built (the round end of a row; Gothic spires grow here)
   - `edge`: two side by side (a straight street front)
   - `inner`: three (an inside corner)
   - `saddle`: two diagonal (two buildings kissing across a lane)
   - `full`: all four (inside a block, no facade)

   The edge where a tile's outline crosses into the lane carries the module's **socket** (its street front). A small wave-function-collapse solver makes neighbouring sockets meet, so an arcade runs on until it meets a plain wall. Then each tile stacks its floors (base, body, top) and takes a roof that fits its top band and its shape.
4. **Stitching.** Where the layers meet, the generator adds:
   - retaining walls with buttresses, and stairs where an avenue climbs a terrace
   - a torii with Gothic tracery where an avenue enters the sanctum
   - bridges over the canal, and wells at the stair feet
   - the city wall, its gates, and stone lanterns along the upper avenues

## districts.csv

| Column | Meaning |
|---|---|
| `id`, `name` | `id` is what `modules.csv` refers to |
| `terrace` | Which terrace(s), e.g. `1` or `2;3` |
| `placement` | `base` fills the terrace. `arc` takes a slice of the ring (`span` = fraction of the circle). `patch` makes `count` blobs of radius `span` (in lots). `spoke` puts `count` blobs of radius `span` where the avenues cross the middle of the terrace. `ring` takes one whole ring of lots (`span` = which ring). `centre` is the tower. |
| `solid` | 0–1: how much of the district is built rather than open |
| `floors_min`, `floors_max` | Building height in floors |
| `open` | What the unbuilt lots are: `plaza`, `garden`, `courtyard`, `yard`, `lane`, `sacred` (a sacred tree), `water` |
| `colour` | Its colour in the Plan view |

Later rows override earlier ones where they overlap.

## modules.csv

Every row has a `layer`:

| Layer | `shape` | Other columns used |
|---|---|---|
| `footprint` | `end` / `edge` / `inner` / `saddle` / `full` | `socket`: the street front (`plain`, `door`, `arcade`, `sacred`; `blank` for `full`) |
| `stack` | `base` / `body` / `top` (a floor band) | `below` / `above`: vertical sockets (`ground`, `floor`, `roof`, `eave`) |
| `roof` | `flat` / `pyramid` / `spire` / `eave` | `below`: the top band it caps (`roof` or `eave`). `on`: which footprint shapes it may sit on (`*` = any) |
| `stitch` | Where it goes: `terrace-edge`, `spoke-edge`, `sanctum-spoke`, `canal-spoke`, `ring-spoke`, `wall`, `wall-spoke`, `path` | — |

Columns every layer has:

- `district`: which districts may use the row (`a;b`, or `*` for any)
- `weight`: how likely the row is relative to the others that fit
- `part`: **the handcrafted layer**. Put a Forge object id here (a building, prefab or seal saved in your world) and a viewer can stand that handmade piece where the module goes. The inspector in `tools/city-grammar/` shows each module's `part`.

To add a new piece, add a row:

- **A new kind of house front:** a `footprint` row with the district, the shape and a socket.
- **A new roof:** a `roof` row.
- **A new kind of join between levels:** a `stitch` row.

If a district has no `plain` row for some shape, the generator quietly gives it a rare plain end, so the solver can always finish where two districts meet.

## sockets.csv

`meets` lists the sockets each one may face across a shared edge (`*` = any). Keep this vocabulary tiny: every new socket multiplies the work and starves the solver of options. `plain` meets everything, which is what lets a run of arcade, door or sacred front stop cleanly.
