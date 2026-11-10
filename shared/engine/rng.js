/* INTERACTIONS — Seeded RNG core.
   The mulberry32 + xmur3 pair copy-pasted verbatim into 10+ tools/ files (Asset Foundry, Rosette,
   Vessel, Masterplan, Xenomandala, Xenoglyph, Mandala Studio, Image FX Lab, Round City Generator,
   Sigil City, the Field Scan family) — these are the standard public-domain tiny-PRNG snippets,
   unchanged here, just relocated to one source of truth. xmur3 turns a string seed into a 32-bit
   int; mulberry32 turns a 32-bit int into a repeatable stream of floats in [0, 1). `create()` chains
   them the same way Xenoglyph/Xenomandala's own `rngFor()` helpers already do.

   Not a reimplementation: existing tools/ files keep their own inline copies untouched (this module
   is for new work, starting with library/tools/generative-forge/, not a retrofit of the originals).

   Classic script (not a module), so it also works from file://. Load order:
     <script src="../../../shared/engine/rng.js"></script>
*/
(function () {
  'use strict';

  // String seed -> a function that yields 32-bit ints each call (call once for a single int seed).
  function xmur3(s) {
    let h = 1779033703 ^ s.length;
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }

  // 32-bit int seed -> a function that yields floats in [0, 1) each call.
  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // String (or numeric) seed straight to a float stream — the common chained usage across tools/.
  // Extra args are joined with "::" before hashing, matching Xenoglyph/Xenomandala's rngFor(seed,
  // style, ch, variant) pattern, so a caller can derive independent sub-streams from one seed:
  //   RNG.create(seed, 'wobble', ringWord)  ===  mulberry32(xmur3(`${seed}::wobble::${ringWord}`)())
  function create(seed, ...parts) {
    if (typeof seed === 'number') return mulberry32(seed);
    const key = parts.length ? `${seed}::${parts.join('::')}` : String(seed);
    return mulberry32(xmur3(key)());
  }

  window.RNG = { xmur3, mulberry32, create };
})();
