# How we write the Forge dev logs (v2)

Written 2026-11-19, after reading how other game teams write theirs. This replaces the way the first four logs (Forge, City and World, Walkers, The Maw) were written. The Walkers log was redone in this style as suggestions on 20 November; the other three have not been changed yet. See "Rollout" at the end.

## 1. What other dev logs do

| Source | What it does | What we take |
|---|---|---|
| Factorio, Friday Facts (weekly since 2013) | Each section is written by the person who did the work, in first person. It opens with why the thing matters, not what it is. It says what was tried and rejected, gives a number where there is one (a 3 ms cost against the frame budget), and ends by saying what is not promised. Clips and stills are evidence for a claim in the text. Example: FFF #323, animated water. | Open with the reason. Put rejected options in the story. Use numbers. End with what is not done. |
| Lucas Pope, Return of the Obra Dinn (TIGSource devlog) | Explains the basic technique first so the reader can see why the problem exists, then names the symptom plainly. One section per approach, each the same shape: the idea, the result, the verdict. Failures are told without apology. Captions are short and dry. Ends with the compromises he settled on. | Name the symptom in plain words. Give every attempt the same three beats. Let captions carry a point of view. |
| Dwarf Fortress, Toady's dev log (daily since 2004) | Short, dated, first person. Describes a bug by what you would see, gives the cause only if known, and says when he has no idea. Fixes sit in a terse list apart from the prose. | Small work goes in a terse list. Say "cause not known" when it is not. Keep dated entries short. |
| Caves of Qud, Feature Friday (itch.io) | A flat list of one-line changes with no reasoning and no pictures. | This is a changelog, not a dev log. Good for "Also" lists, wrong for the main entries. |
| Devlog guides (SEELES; Wayline; indiegamedev.net) | Open each post with the one question it answers. State the baseline. For each change give the reason and the evidence. Record a failed experiment only if it changed a decision. For a trade-off, name the benefit and the cost. End with what is still uncertain and the next test. | The entry template in section 3. |

Common to the good ones: the reader is told **why** before **what**, failures sit in the sequence where they happened, there is one clear voice, and the pictures prove something.

## 2. What was wrong with ours

Judged from the Walkers log (all 32 entries read); the other three were written the same way.

1. **Entries were named for what was built, not what was learned.** A reader could not tell which entries matter.
2. **Every entry had the same weight.** Housekeeping got the same space as turning points.
3. **The reason was thin.** Entries started with the thing rather than the problem.
4. **Failures were filed away** in a "Tried and dropped" list at the end.
5. **Commit ids led every heading.**
6. **Zac was nearly absent.** His verdicts are the best material in the log.
7. **Terms were used before they were explained.** Bloom, Compose, LimbArt, kit, skeleton, look.
8. **Pictures were captioned as inventory.** They said what the picture is, not what to look at.

What stays: dates and commit ids checked against the repo, the decisions table, the Open list with Zac's words, honesty about what was checked only headless, and pictures at all.

## 3. The new way

**Who it is for.** Zac in three months, and a collaborator who missed two weeks. Plain, dry, complete enough to act on.

**One entry = one question.** The title states what was found or decided, as a claim: "A leg should bend between parts, not through one", not "The Quad Mech in 3D, and one part per bone".

**The shape of an entry**

1. **The question or the symptom**, in one or two plain sentences.
2. **Before.** What the previous version did, if the reader needs it.
3. **What we tried**, in order: what we expected, what happened, why we kept it or dropped it.
4. **The decision.** What was chosen, what it gives, what it costs. Say who chose when it was Zac, and quote him if his words are on record.
5. **Evidence.** A picture or GIF straight after the sentence that claims it.
6. **What it left open**, if anything. One line.
7. **Date and commits** on a line at the foot: `9 Nov · 35241d8, e1adc25`.

Entries over about 250 words should be asked to split. Small work goes in a short list entry, or an "Also" list under its day in a new log.

**Pictures.** A GIF for a motion claim, a still for a layout claim. The caption says what to look at ("Watch the knee: it closes between two parts"). Say once in the introduction when the captures were taken; keep that tag off each caption. If a picture would only decorate, leave it out.

**Numbers.** Use them where we have them. Do not invent them.

**Terms.** Define a term where it first matters, and keep a short glossary at the top of each log.

**Voice.** Plain past tense. Zac's words in quotes only where a record has them. "Cause not known" when it is not. No hype.

**Top and bottom.** Top: what the period was about, a "read first" list, the glossary. Bottom: the decisions table, the dead ends, and "Open", ending on the next question to test.

## 4. Rollout

1. **Walkers (done, as suggestions, 20 Nov).** Entry numbers kept and nothing merged, because the other logs link to entries by number. The changes are in titles, the order inside entries, the commit line and the captions.
2. **Then The Maw**, then Forge, then City and World, keeping entry numbers.
3. **New logs** are written this way from the start.
4. **Needs Zac:** for entries from commits only (Walkers 22 to 32), a line on what he saw at the time.

## Sources

- Factorio Friday Facts #323: <https://factorio.com/blog/post/fff-323>
- Lucas Pope, Obra Dinn devlog, "Dithering Process" (TIGSource thread mirror): <https://dotat.at/:/KZX5L>
- Dwarf Fortress development log: <https://www.bay12games.com/dwarves/dev_2014.html>
- Caves of Qud, Feature Friday: <https://freeholdgames.itch.io/cavesofqud/devlog/664714/feature-friday-january-12-2024>
- SEELES devlog guide: <https://www.seeles.ai/resources/blogs/game-development-devlog-guide>
- indiegamedev.net: <https://indiegamedev.net/2020/02/05/how-to-write-a-good-devlog/>
