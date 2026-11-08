# The city and its gods

A working world bible for the ancient radial city. The generator in `shared/engine/city/city-grammar.js` builds the city's architecture from this document's districts and grammar, and World Scene, Route Scene and `world/scenes/city-grammar/` all show that city. The ecology in `shared/engine/ecology/` provides the revered species.

## The question underneath

**Are the gods truly bad? What do they want from us, and what do we want from them?**

The city lives alongside beings it doesn't understand: the species of the Cybernetic Ecology. They aren't deities to obey. They are presences to be revered, bargained with, feared a little and lived beside.

The story never fully explains them. As in *Your Name* and much of Shinto-inflected storytelling, the supernatural is mysterious and everyday at once. It is something unexplained and something you make room for.

This is a story about our relationship with nature and with technology, AI especially. We build shrines to things that shape our lives but don't answer us in our terms. We ask them for things. We wonder whether they ask anything back. The city's architecture is that negotiation made physical.

## Aesthetic: Gothic bones, Eastern spirit

The buildings are **Gothic**: pointed arches, buttresses, spires, lancet windows, iron and stone, narrow lanes and stacked terraces. Yharnam in *Bloodborne* is the closest reference.

The worship is **Shinto and Buddhist** in spirit: gods tied to nature (a tree, a rock, a spring, a species) rather than one monolithic deity.

The two traditions meet in shared habits. Both are vertical and layered. Both repeat structural rhythms (bay and pier, eave over eave). Both treat the **threshold** as sacred.

| Gothic | Shinto / Buddhist | Where they meet in the grammar |
|---|---|---|
| Pointed arch, tracery | Torii gate | The **sacred gate**: a torii whose lintel carries a Gothic pointed arch (`stitch-torii`) |
| Spire | Pagoda | The **tower**: a Gothic shaft ringed with stacked pagoda eaves, crowned by a spire |
| Buttress, retaining wall | Stone terrace, stair | The **terrace stitches**: buttressed retaining walls, stairs where avenues climb |
| Gas lamp | Stone lantern | **Stone lanterns** along the sanctum and university avenues |
| Cloister, arcade | Covered walkway, pergola | The **arcade** socket: university cloisters, market stalls, garden pergolas |
| — | Rope and paper (shimenawa, shide) | The **sacred** socket: shrine fronts carry the rope |

## The city, ring by ring

Height carries meaning, as in Yharnam. The sacred and the learned sit high, and the many live low.

| Terrace | Level | Who is there |
|---|---|---|
| **Acropolis** | 3 (highest) | **The Tower**, the old one at the centre. Round it, the **Sanctum**: a plaza of lantern halls, purification basins and paired halls. Every avenue enters it through a sacred gate. |
| **University terrace** | 2 | **One university**, cloisters round courtyards with spired corner towers, and its **library**. The rest is **terrace gardens** for recreation: moss, raked gravel, tea houses, pergolas. |
| **Upper town** | 1 | **Villas** for the wealthy: bigger houses round private courtyards, loggias, pavilions. **Pocket gardens.** An **elementary school**. |
| **Lower town** | 0 | **Dense housing** for the many: tall narrow houses on tight lanes. **Markets** where the avenues cross. A **craft quarter** of workshops and granaries by the wall. **Schools.** A **canal** ring crossed by bridges. |
| **Everywhere below the top** | 1–3 | **Shrines** to the revered species: small, built round a sacred tree, rock or spring, with rope at the threshold. |
| **The edge** | 0 | **The city wall**, and its **gates** where the avenues leave the city. |

Water threads through the city:

- the canal through the lower town
- **wells** at the foot of every stair
- purification basins at shrine thresholds

## The revered species

Each species of the ecology can be a god of the city. Each one can have:

- **shrines** that draw it: a shrine district can carry the species it reveres, so its creatures gather there
- **a quarter**: the river god's lanes along the canal, a forest god's in the gardens
- **an ambiguous temperament**: some guard and some take. The ecology's predator and prey roles (hunter, schooler, ambusher, drifter) are the gods' moods. The city's question is which of them it has misread.

## Why a grammar

Bad North and Townscaper feel alive because the pieces shape each other. A wall knows it's a corner because of what's beside it. Our first city picked one whole block per cell, so neighbours never spoke.

The grammar fixes that in four layers:

1. **Height.** Terraces, the centre highest.
2. **Zoning.** Districts by rule.
3. **Modules.** A dual grid: each piece is chosen from which of its corners are built, and its street front (its socket) has to meet its neighbour's.
4. **Stitching.** Stairs, gates, bridges and walls wherever the layers meet.

The handmade layer goes in through the `part` column of `shared/engine/city/grammar/modules.csv`. Each module row can name a piece built in Forge, so the grammar decides *where* and the handmade parts decide *what*. See `shared/engine/city/grammar/README.md` for how to edit the sheets.

## Open threads

- **Which species are which gods.** Pair each ecology species with a shrine type and a quarter.
- **Shrines that draw creatures.** A shrine's species should bias the ecology sim toward it.
- **Handmade parts.** Fill the `part` column with Forge buildings, starting with the sacred gate, the tower and the shrine end.
- **Story beats.** What the city asks of the tower, and what the tower has started asking back.
