# Forge dev logs

The dev logs are Claude Docs on claude.ai, so they can be commented on and edited in place. This folder holds what supports them: the writing guide, the pictures in them, and the scripts that made the pictures.

| Log | Dates | Entries |
|---|---|---|
| [Forge](https://claude.ai/artifact/BnFzr3j8QD15Gvs8sSHwxC) | 2 to 8 Nov 2026 | 25 |
| [City and World](https://claude.ai/artifact/J2nfM7dLdPhkhKXXNbteUV) | 6 to 11 Nov | 23 |
| [Walkers](https://claude.ai/artifact/Qe6rgqHxEMqwE38BhioiRJ) | 8 to 15 Nov | 32 |
| [The Maw](https://claude.ai/artifact/E2dMrnEdzQ17WPrE1CBpaG) | 10 to 19 Nov | 30 |
| [Kit to 3D](https://claude.ai/artifact/TVAC8BEPnuDRreNx2jEQSh) | 20 to 21 Nov | 17 |

- `STYLE.md`: how the logs are written (v2, after reading Factorio's Friday Facts, the Obra Dinn devlog, Dwarf Fortress and others). On 20 Nov the Walkers log was rewritten in this style as suggestions that are still waiting to be accepted.
- `media/`: the captures added to the logs on 19 Nov, and the three in Kit to 3D (`kit3d-*`).
- `../../tools/capture/`: the scripts that made them.

## Pictures

All were captured on 19 Nov 2026 from `the-maw-game` at `f5dba6c`, in headless Chrome on software GL. They show the pages as they stood then, not on the date of the entry they illustrate.

| File | Log, entry | What it shows |
|---|---|---|
| `townsfolk.gif` | Walkers 2 | Townsfolk walking the square |
| `quad-mech.gif` | Walkers 8 | The segmented Quad Mech, one kit part per bone |
| `hex-mech.gif` | Walkers 9 | The Hex Mech |
| `walk-qilin.gif` | Walkers 17 | The Blender Qilin led round the Walk page |
| `family.png` | Walkers 22 | The family sheet (`creatures-by-family.svg`) |
| `walk-centiwyrm.gif` | Walkers 26 | The Centiwyrm rippling |
| `walk-hunt.gif` | Walkers 27 | The Hunt scene: a Pincer Crawler and Blade Puffers |
| `body-shove.gif` | Walkers 28 | The Body page after a shove, Kit and Soft looks |
| `terrain.gif` | Walkers 31 | The terrain prototype running |
| `p-attach.png` | Forge 4 | The Attach points page |
| `p-rules.png` | Forge 4 | The Rule sets page |
| `ws-looks.png` | City and World 10 | World Scene in six looks |
| `tank-play.gif` | The Maw 3 | The Maw on autopilot in stage 01 |
| `specimen.gif` | The Maw 17 | The Sigil Koi in Specimen |
| `sheet.png` | The Maw 30 | Every species on the exported sheet |

The Kit to 3D log was written in the v2 style from the start. Its pictures were captured during the work, on 20 and 21 Nov:

| File | Entry | What it shows |
|---|---|---|
| `kit3d-maw-in-tank.png` | 12 | The Maw in level 01 with 3D creatures on: the gold eye, the curled tail |
| `kit3d-maw-walk.gif` | 15 | The same route before and after the heavy-predator walk, on a fake clock at 30 fps |
| `kit3d-solid-wings.png` | 17 | Black Monarch, Glass Manta and Eye Wing with solid wings and fins |

`media/unused/` holds two captures of climbing on the Body page's tower (Walkers 29) that were left out of the log. In both, the Pincer Crawler tumbles at the foot of the wall instead of climbing. That may come from the headless capture with stepped time, or it may be a regression. It needs a look on a real screen.
