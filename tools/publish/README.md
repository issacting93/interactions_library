# Publishing

The pages in the repo load their scripts from `shared/` by relative path. A published artifact has to stand alone, so each published
page has a build that writes a self-contained folder: the page, every script it loads laid flat, and its data beside it.
Each build finds the scripts from the page itself, so adding a `<script>` to a page needs no change here.

| Artifact | Page in the repo | Build |
|---|---|---|
| Specimen | `world/forges/fish-tool/Specimen.html` | `python3 tools/publish/specimen.py <out>` |
| Walker Bestiary | `world/forges/walker-bestiary/index.html` | `python3 tools/publish/bestiary.py <out>` |
| Cybernetic Ecology, The Maw | `world/forges/fish-tool/Cybernetic Ecology.html` | `node world/forges/fish-tool/tests/build-artifact.mjs <out> [--run] [--endless]` |

Then look at it (`cd <out> && python3 -m http.server 8743`) and publish the folder's files to the artifact.

Why the tank species are split in two files (`species-a.js`, `species-b.js`): one published file may not be over 16 MB, and
`ecology-species.js` is about 20 MB.
