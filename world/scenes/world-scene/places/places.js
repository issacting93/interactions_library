// world/scenes/world-scene/places/places.js -- window.WorldPlaces: World Scene's places, as data. places/engine.js reads them; the Places tab edits them
// (an edited place is kept in this browser, and Copy gives its JSON to paste back here).
//
// A place:
//   title, note
//   setting  style (a style recipe id), city (the city and towers stand: true / false), center ('tower' or [x, y] as fractions of the tank),
//            water { deep, shallow, light, shade, fog, ribbons, net, fogK, scale, moon }, surface { level (0..1 of the depth), colour, opacity, ribbons, moon },
//            shafts { amount, colour }, vignette, snow, glow
//   paths    named loops the cast swims along: { x, y (fractions of the tank: the middle), along, across (fractions of the tank's width), angle (deg),
//            square (2 an ellipse, 4 a rounded box), through: [x, y] (the loop is slid so its near side passes through that point) }
//   cast     rows: { species, n, role, layer, ... } -- roles: stream (along a path, in lanes), formation (a leader and its wing along a path),
//            escort (behind and beside the first of another species), drift (turning slowly round the middle), bed (on the floor);
//            layer: air, surface, mid, deep, bed, or z: [top, bottom] (fractions of the depth). stone: true turns it to stone in the place's own style.
//   shots    { kind, len (s), target, yaw, zoom } -- kinds: above, ride, follow, beneath, descent, orbit, lookup, low;
//            target: 'center', 'densest' (the busiest stretch of the first stream), or a species key
//   look     creatures: 'specimen' (the saved looks, drawn as Specimen draws them) | 'styled' (this place's own) | 'flat' (World Scene's line drawing);
//            styled { paint: Painted fields, stone: a look, looks: { species: look }, lineAlpha }, flat { fill, colours: { species: [hi, lo] } }
window.WorldPlaces = {
  world: { title: 'World', note: 'The city, its towers and the open water: the page as it was.' },

  crossing: {
    title: 'Glass Crossing', note: 'Glass Mantas cross a river of koi, seen from above through the water.',
    setting: { style: 'glitch', city: false, center: [0.5, 0.5], snow: false, glow: 0.55, vignette: 0.55,
      water: { deep: '#0a3d66', shallow: '#21b48d', light: '#e8fff0', shade: '#05223a', fog: '#0f5d6e', ribbons: 1.1, net: 0.16, fogK: 0.00005, scale: 330 },
      surface: { level: 0.3, colour: '#2fb3a0', opacity: 0.12, ribbons: 0.3 }, shafts: { amount: 0 } },
    paths: {
      river: { through: [0.5, 0.5], along: 0.6, across: 0.2, angle: -60, square: 4 },
      sky: { through: [0.5, 0.5], along: 0.64, across: 0.32, angle: 14.5, square: 3 },
    },
    // the river: koi and Showa in lanes; over it the mantas in an echelon with a murmuration of swifts behind them; two Lance Monarchs
    // high and slow; glass stars hanging in the water between; scavengers on the bed
    cast: [
      { species: 'koi', n: 70, role: 'stream', path: 'river', layer: 'deep', speed: 0.6, width: 0.08 },
      { species: 'koi-longfin-showa', n: 24, role: 'stream', path: 'river', layer: 'deep', speed: 0.55, width: 0.08 },
      { species: 'manta', n: 3, role: 'formation', path: 'sky', z: [0.07, 0.07], speed: 0.42 },
      { species: 'swift', n: 14, role: 'escort', lead: 'manta', z: [0.03, 0.12], back: 7, side: 2.5 },
      { species: 'ringed-lance-monarch', n: 2, role: 'drift', z: [0.01, 0.04], radius: 0.32, speed: 0.25 },
      { species: 'glass-star', n: 6, role: 'drift', layer: 'mid', radius: 0.3, speed: 0.14 },
      { species: 'plated-scavenger', n: 4, role: 'bed', radius: 0.3 },
    ],
    flora: { kind: 'river', amount: 0.8 },
    shots: [
      { kind: 'above', len: 12, target: 'densest' },
      { kind: 'ride', len: 11, target: 'manta' },
      { kind: 'beneath', len: 10, target: 'densest' },
    ],
    look: { creatures: 'specimen',
      styled: { paint: { paint: 1, paintSteps: 4, paintBrush: 1.1, paintWobble: 0.35, paintTemp: 0.32, paintDetail: 0.7, paintOutline: 0.75 }, lineAlpha: 0.14,
        looks: { koi: { material: 'ember', pattern: 'koi', colors: ['#ff8a1e', '#3a1406', '#ffc45a', '#ffe2a8', '#ff5a1a'], emissive: 0.35 } } },
      flat: { fill: 0.9, colours: { koi: ['#ffc061', '#ff6a12'], 'koi-longfin-showa': ['#fff7ea', '#e2382a'], manta: ['#ffffff', '#cfe8ff'], swift: ['#ffffff', '#9fc3d6'] } } },
  },

  spires: {
    title: 'Drowned Spires', note: 'The city under the sea: light shafts, jellies between the towers, koi circling the tallest.',
    setting: { style: 'route-blue', city: true, center: 'tower', snow: true, glow: 0.8, vignette: 0.7,
      water: { deep: '#06142e', shallow: '#13406a', light: '#7fd8ff', shade: '#020814', fog: '#071a36', ribbons: 0.45, net: 0.22, fogK: 0.00028, scale: 420 },
      surface: { level: 0.02, colour: '#3d7fb8', opacity: 0.18, ribbons: 0.5 }, shafts: { amount: 0.55, colour: '#9fdcff' } },
    paths: {
      ring: { x: 'center', y: 'center', along: 0.16, across: 0.16, angle: 0, square: 2 },
      wide: { x: 'center', y: 'center', along: 0.42, across: 0.53, angle: 23, square: 2 },
    },
    // the deep city: koi round the tallest tower, jellies rising between the towers, plankton wisps in the shafts, two mantas over the
    // roofs, anglers with their lanterns low among the kelp, lance swifts and eels in the dark near the bed, rosary eels turned to stone
    cast: [
      { species: 'koi', n: 40, role: 'stream', path: 'ring', z: [0.35, 0.7], speed: 0.5, width: 0.06 },
      { species: 'jelly', n: 12, role: 'drift', z: [0.45, 0.45], radius: 0.35, speed: 0.2, bob: 0.35, bobSpeed: 0.12 },
      { species: 'angler-tailed-jelly-af60', n: 5, role: 'drift', z: [0.45, 0.45], radius: 0.35, speed: 0.2, bob: 0.35, bobSpeed: 0.12 },
      { species: 'manta', n: 2, role: 'formation', path: 'wide', z: [0.2, 0.2], speed: 0.38 },
      { species: 'wisp', n: 30, role: 'drift', z: [0.1, 0.6], radius: 0.4, speed: 0.3, bob: 0.05 },
      { species: 'angler', n: 3, role: 'drift', z: [0.82, 0.9], radius: 0.22, inner: 0.08, speed: 0.15 },
      { species: 'puffer-plated-angler-25d9', n: 2, role: 'drift', z: [0.82, 0.9], radius: 0.22, inner: 0.08, speed: 0.15 },
      { species: 'abyssal-lance-swift', n: 6, role: 'stream', path: 'wide', z: [0.78, 0.88], speed: 0.5, width: 0.05 },
      { species: 'eel', n: 3, role: 'stream', path: 'wide', reverse: true, z: [0.6, 0.75], speed: 0.4, width: 0.08 },
      { species: 'siphon', n: 3, role: 'drift', z: [0.3, 0.6], radius: 0.42, inner: 0.14, speed: 0.12, bob: 0.03, stone: true },
    ],
    flora: { kind: 'kelp', amount: 0.8 },
    shots: [
      { kind: 'descent', len: 11, target: 'center' },
      { kind: 'orbit', len: 12, target: 'center' },
      { kind: 'lookup', len: 10, target: 'center' },
    ],
    look: { creatures: 'specimen',
      styled: { paint: { paint: 0.85, paintSteps: 3, paintBrush: 1.3, paintWobble: 0.25, paintTemp: 0.18, paintDetail: 0.5, paintOutline: 0 }, lineAlpha: 0.22,
        stone: { material: 'golem', pattern: 'veins', colors: ['#5f6a6c', '#141a1c', '#5fd8ff', '#c9d6d4', '#6f7a66'], grow: 'moss', growAmount: 0.55, growClump: 0.6, lumps: 0.6, roughness: 0.7, grain: 1, vein: 0.5, emissive: 0.15 } } },
  },

  vigil: {
    title: 'Lantern Vigil', note: 'A night pond: the moon on the water, Lantern Wisps afloat, monarchs drifting, koi below.',
    setting: { style: 'glitch', city: false, center: [0.5, 0.42], snow: false, glow: 1.7, vignette: 0.8,
      water: { deep: '#03101a', shallow: '#123a40', light: '#4d8090', shade: '#000000', fog: '#02060b', ribbons: 0.22, net: 0.12, fogK: 0.00008, scale: 380, moon: 1 },
      surface: { level: 0.32, colour: '#040c12', opacity: 0.08, ribbons: 0.1, moon: 1 }, shafts: { amount: 0 } },
    paths: {
      pond: { x: 'center', y: 'center', along: 0.3, across: 0.22, angle: 11.5, square: 2 },
      drift: { x: 'center', y: 0.46, along: 0.36, across: 0.32, angle: -17, square: 2.2 },
    },
    // the night pond: Lantern Wisps afloat, moths drawn to them, monarchs drifting over, one seraph high above, Showa koi turning below
    cast: [
      { species: 'wisp', n: 60, role: 'drift', z: [0.2, 0.3], radius: 0.3, squash: 0.75, speed: 0.25, bob: 0.02, bobSpeed: 0.8 },
      { species: 'moth', n: 8, role: 'drift', z: [0.12, 0.24], radius: 0.24, speed: 0.35, bob: 0.03 },
      { species: 'black-monarch', n: 6, role: 'stream', path: 'drift', z: [0.08, 0.2], speed: 0.4, width: 0.06 },
      { species: 'ophan-halo-monarch', n: 2, role: 'stream', path: 'drift', z: [0.08, 0.2], speed: 0.4, width: 0.06 },
      { species: 'halo-eyed-seraph', n: 1, role: 'drift', z: [0.02, 0.03], radius: 0.18, speed: 0.18 },
      { species: 'koi-longfin-showa', n: 24, role: 'stream', path: 'pond', z: [0.62, 0.88], speed: 0.35, width: 0.07 },
    ],
    flora: { kind: 'night', amount: 0.9, ink: '#0b1712' },
    shots: [
      { kind: 'above', len: 11, target: 'center', zoom: 0.8 },
      { kind: 'low', len: 11, target: 'center' },
      { kind: 'follow', len: 10, target: 'ophan-halo-monarch' },
    ],
    // every creature in the Energy material: a clear shell with a hot rim, ribbons arcing round it, light streaming to the tail (additive)
    look: { creatures: 'styled',
      styled: { all: { preset: 'energy' },   // EcologyRender.PRESETS.energy, as Specimen's Energy button starts it
        looks: { wisp: { preset: 'energy', colors: ['#6a3a10', '#100804', '#ffb347', '#ffe2b0', '#ff7a3c'], vein: 0.5, fresnel: 0.8, grain: 1.2, roughness: 0.5 },
          moth: { preset: 'energy', colors: ['#3a2a8a', '#080428', '#8fb8ff', '#d8e0ff', '#ffc0e0'], vein: 0.7, roughness: 0.4 } },
        paint: { paint: 0 }, lineAlpha: 0.06 },
      flat: { fill: 0.85, colours: { wisp: ['#fff1b8', '#ff9a3c'], moth: ['#fff3d6', '#d8a060'], 'black-monarch': ['#e9e4ff', '#6c5a9c'], 'ophan-halo-monarch': ['#fff6d8', '#c9a2ff'], 'koi-longfin-showa': ['#d9d2c8', '#a8342a'] } } },
  },
  garden: {
    title: 'Garden Pond', note: 'A shallow green pond in sun: koi under the lilies, moths and monarchs over the water.',
    setting: { style: 'glitch', city: false, center: [0.5, 0.5], snow: false, glow: 0.5, vignette: 0.5,
      water: { deep: '#1f4a2c', shallow: '#5fa86a', light: '#f4ffe0', shade: '#10261a', fog: '#2c5a3c', ribbons: 0.7, net: 0.2, fogK: 0.00005, scale: 300 },
      surface: { level: 0.28, colour: '#6fbf8a', opacity: 0.14, ribbons: 0.25 }, shafts: { amount: 0 } },
    paths: {
      pond: { x: 'center', y: 'center', along: 0.32, across: 0.24, angle: 20, square: 2.5 },
      edge: { x: 'center', y: 'center', along: 0.42, across: 0.34, angle: 20, square: 2.5 },
    },
    // a sunny pond: koi and Showa in schools under the lilies, Frond Wings hiding in the weed, crawlers on the bed,
    // Butterfly Worms and Black Monarchs over the water
    cast: [
      { species: 'koi', n: 30, role: 'school', layer: 'deep', radius: 0.38 },   // Forge Scenes' koi: schools going place to place
      { species: 'koi-longfin-showa', n: 20, role: 'school', layer: 'deep', radius: 0.38 },
      { species: 'frond-serpent', n: 3, role: 'drift', z: [0.72, 0.82], radius: 0.36, inner: 0.2, speed: 0.15 },
      { species: 'plated-scavenger', n: 4, role: 'bed', radius: 0.32 },
      { species: 'pincer', n: 2, role: 'bed', radius: 0.25 },
      { species: 'worm', n: 4, role: 'drift', layer: 'air', radius: 0.32, speed: 0.35 },
      { species: 'black-monarch', n: 4, role: 'drift', layer: 'high', radius: 0.3, speed: 0.3 },
    ],
    flora: { kind: 'pond' },
    shots: [
      { kind: 'above', len: 11, target: 'densest' },
      { kind: 'beneath', len: 10, target: 'densest' },
      { kind: 'follow', len: 10, target: 'black-monarch' },
    ],
    look: { creatures: 'specimen',
      styled: { paint: { paint: 1, paintSteps: 4, paintBrush: 1, paintWobble: 0.4, paintTemp: 0.5, paintDetail: 0.6, paintOutline: 0.6 }, lineAlpha: 0.15 } },
  },

  overgrowth: {
    title: 'Overgrown Tower', note: 'The old tower gone green: mossed stone creatures round it, pollen in the light, koi circling its foot.',
    setting: { style: 'relief', city: true, center: 'tower', snow: true, glow: 0.6, vignette: 0.7, dz: 0.9,
      water: { deep: '#16261d', shallow: '#3d5a40', light: '#e8f0c0', shade: '#0a120c', fog: '#1e3024', ribbons: 0.35, net: 0.25, fogK: 0.00022, scale: 450 },
      surface: { level: 0.02, colour: '#9fbf7a', opacity: 0.1, ribbons: 0.4 }, shafts: { amount: 0.45, colour: '#f0e6a8' } },
    paths: {
      ring: { x: 'center', y: 'center', along: 0.14, across: 0.14, angle: 0, square: 2 },
      wide: { x: 'center', y: 'center', along: 0.4, across: 0.5, angle: 30, square: 2 },
    },
    // the old tower gone green: koi round its foot, Bramble Wyrms and a Spine Dragon turned to mossed stone coiled round it,
    // Frond Wings in the green, Butterfly Worms and Black Monarchs round the ledges, wisps hanging like pollen in the shafts
    cast: [
      { species: 'koi', n: 24, role: 'stream', path: 'ring', z: [0.6, 0.82], speed: 0.42, width: 0.05 },
      { species: 'dragon', n: 1, role: 'stream', path: 'ring', reverse: true, z: [0.35, 0.45], speed: 0.3, width: 0.02, stone: true },
      { species: 'chain-colony', n: 5, role: 'drift', z: [0.25, 0.7], radius: 0.22, inner: 0.1, speed: 0.08, bob: 0.03, stone: true },
      { species: 'frond-serpent', n: 4, role: 'drift', z: [0.4, 0.7], radius: 0.3, inner: 0.12, speed: 0.15 },
      { species: 'worm', n: 6, role: 'drift', z: [0.1, 0.35], radius: 0.25, speed: 0.3 },
      { species: 'black-monarch', n: 4, role: 'drift', z: [0.05, 0.25], radius: 0.3, speed: 0.28 },
      { species: 'wisp', n: 24, role: 'drift', z: [0.1, 0.6], radius: 0.4, speed: 0.2, bob: 0.05 },
    ],
    flora: { kind: 'overgrowth', timelapse: true },
    shots: [
      { kind: 'descent', len: 11, target: 'center' },
      { kind: 'orbit', len: 12, target: 'center' },
      { kind: 'lookup', len: 10, target: 'center' },
    ],
    look: { creatures: 'styled',
      styled: { paint: { paint: 0.7, paintSteps: 3, paintBrush: 1.2, paintWobble: 0.3, paintTemp: 0.4, paintDetail: 0.6, paintOutline: 0 }, lineAlpha: 0.2,
        stone: { material: 'golem', pattern: 'veins', colors: ['#6a6e5e', '#16180f', '#c8e07a', '#d6dcc4', '#7a7a5a'], grow: 'moss', growAmount: 0.8, growClump: 0.6, lumps: 0.6, roughness: 0.7, vein: 0.5, emissive: 0.1 } } },
  },

  snow: {
    title: 'Snow Fortress', note: 'The city under snow: frosted stone guardians, mantas and swifts over the walls, koi turning in the cold below.',
    setting: { style: 'paper', city: true, center: 'tower', snow: true, glow: 0.3, vignette: 0.4, dz: 0.9,
      water: { deep: '#b8c6d4', shallow: '#e8eef4', light: '#ffffff', shade: '#8a9aac', fog: '#d8e0e8', ribbons: 0.3, net: 0.1, fogK: 0.00018, scale: 500 },
      surface: { level: 0.02, colour: '#f4f8fb', opacity: 0 }, shafts: { amount: 0.3, colour: '#ffffff' } },
    paths: {
      ring: { x: 'center', y: 'center', along: 0.16, across: 0.16, angle: 0, square: 2 },
      wide: { x: 'center', y: 'center', along: 0.42, across: 0.5, angle: -20, square: 2 },
    },
    // the fortress under snow: mantas over the walls with swifts behind, Lance Monarchs high, two frosted Spine Dragons and Blade
    // Hunters standing guard round the keep, comb drifters like ice in the water, koi turning in the cold below
    cast: [
      { species: 'manta', n: 3, role: 'formation', path: 'wide', z: [0.1, 0.1], speed: 0.38 },
      { species: 'swift', n: 12, role: 'escort', lead: 'manta', z: [0.05, 0.15], back: 6, side: 2.5 },
      { species: 'ringed-lance-monarch', n: 3, role: 'drift', layer: 'high', radius: 0.35, speed: 0.25 },
      { species: 'dragon', n: 2, role: 'stream', path: 'ring', z: [0.4, 0.55], speed: 0.3, width: 0.04, stone: true },
      { species: 'hunter', n: 4, role: 'stream', path: 'ring', reverse: true, z: [0.55, 0.65], speed: 0.35, width: 0.05, stone: true },
      { species: 'comb-drifter', n: 6, role: 'drift', z: [0.15, 0.35], radius: 0.4, speed: 0.1, bob: 0.03 },
      { species: 'koi', n: 24, role: 'stream', path: 'ring', z: [0.68, 0.86], speed: 0.38, width: 0.06 },
    ],
    flora: { kind: 'snowfield', amount: 0.8 },
    shots: [
      { kind: 'descent', len: 11, target: 'center' },
      { kind: 'ride', len: 11, target: 'manta' },
      { kind: 'orbit', len: 11, target: 'center' },
    ],
    look: { creatures: 'styled',
      styled: { paint: { paint: 0.8, paintSteps: 3, paintBrush: 1, paintWobble: 0.3, paintTemp: 0.2, paintDetail: 0.5, paintOutline: 0.7 }, lineAlpha: 0.12,
        stone: { material: 'golem', pattern: 'veins', colors: ['#9aa4ac', '#2a3036', '#8fd8ff', '#eef4f8', '#b0b8c0'], grow: 'frost', growAmount: 0.7, growClump: 0.5, lumps: 0.5, roughness: 0.6, vein: 0.5, emissive: 0.1 } } },
  },
};
