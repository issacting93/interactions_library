# Sigil City variants

Three mutually-divergent copies of this tool existed at once (root-level drafts plus the tracked
`tools/city-gen/Sigil City.html`), each ~100-300 lines apart from the others with no clean merge
path. Resolved 2026-11-02 by picking the most feature-complete as canonical and archiving the rest
here rather than deleting anything.

## Canonical: `tools/city-gen/Sigil City.html`

Was the root-level `Sigil City (3).html` (paths fixed to the current `shared/city/`, `shared/ui/`
layout). The most advanced of the three: on top of the radial WFC city, it loads cut sigil parts
from `shared/creature-parts.json` and assembles every building elevation from them (`elevTower`,
`elevHall`, `standElev`, kitted per district so each district reads as a whole), plus a creature
halo inlaid in the plaza and a creature crown above the central dome. Uses a green sigil-glow
palette (`GLOW` keyed per district) and a 0.6-default glow slider.

## `Sigil City (halo-crown-only).html`

An earlier point on the same branch as the canonical file: has the creature halo + crown ornament
and the green glow palette, but not yet the full per-building creature-architecture system
(`ARCH`/`elevTower`/`elevHall`). Kept as a reference for how the creature-ornament idea started
before it grew into full building assembly.

## `Sigil City (white-palette, no creature ornament).html`

A different branch entirely — this was the previously-tracked file. Took the WFC core in a more
neutral direction: every `GLOW` entry collapsed to white (`0xffffff`), glow slider defaulted to 0,
different bloom/line-gain tuning, and `arcadeDomes` called unconditionally rather than gated behind
a creature-architecture flag. It never grew the creature-ornament/architecture system the other two
did. Kept in case the monochrome direction is wanted again — it reflects a deliberate low-saturation
visual style choice, not an abandoned scrap.
