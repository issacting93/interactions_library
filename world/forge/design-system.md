# Forge Console (design system)

Forge's interface is built on **Forge Console**, the TAPE 08 instrument-panel language extended for
Forge. It lives in `shared/look/forge-ds/`:

| File | What |
| --- | --- |
| `tokens.json` | The one source for colours, type, spacing, radii and sizes. |
| `build.mjs` | `node shared/look/forge-ds/build.mjs` writes `tokens.css` from `tokens.json`. |
| `tokens.css` | Generated. Scoped to `:root[data-theme="forge"]`; also aliases the older names (`--accent`, `--loop`, `--r-btn` …). |
| `components.css` | The `f-` components: strip, rail, head unit, readout, track row, clip, signal chain, meter bank, buttons, tabs, fields, status, list row, socket, shelf. |
| `README.md` | The brand book: principles, vocabulary, workflow, foundations. Read it before changing a page. |

The same system is published as the "Forge Console" design-system artifact, whose `project/tokens.json`,
`project/README.md` and `project/components/bundle.css` are these files. Change one side, copy the file
to the other whole.

Every Forge page links, in this order: `shared/look/tokens.css`, `shared/look/forge-ds/tokens.css`,
`shared/look/forge-ds/components.css`, `shared/look/theme-forge.css` (an adapter that restyles older page-local
classes until they move onto `f-` components).
