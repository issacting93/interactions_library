/* ecology-maw.js: the Maw, the creature a person plays in the ecology tank.

   A mouth on a neck. It has one ability, the lunge: hold to coil (it stops, rears its head and opens its mouth),
   release and the neck throws the head at what is in front of it, then draws it back. The body stays where it
   stands. It only eats in a lunge. What it eats it wears.

   It is one of the tank's walkers. Nothing here moves or draws a creature on its own:
     the body    a CreatureBody (shared/engine/motion/creature-body.js) in the walkers' world (EcologyWalkers' host.W):
                 it stands on the tank's terrain on its own feet, is carried by them, steps by the shared gait rules,
                 and climbs the towers. The person is its brain: a heading to walk, or nowhere.
     the look    KitLook (shared/engine/motion/looks.js) draws the kit's parts on the body's pieces and its leg blades
                 on the bones; lines() gives it as 3D line segments in tank space for the tank's own renderer.
     the rules   a hidden creature of the tank stands where its head is (as each walker has), but inside the diet
                 rules: it is hunted, held, fed and starved like any creature.
   What this module adds: the def (the body plan as a walker def), the neck (the head and neck chunks are held up and
   aimed by pushes, and thrown along the strike), the mouth (drawn each frame, since it opens), the lunge, what a meal
   gives, and the gates on what it may eat.

   The body plan is the qilin's, built as Compose builds a creature: rows down a spine, one centre part per row and
   side parts mirrored. Head, two neck rows, shoulders with a leg pair, back, haunch with a leg pair, tail. Each row is
   one piece of the walker (one chunk), so the body bends between rows. A meal becomes rows or teeth:
     a flier (wing)        reach   a new neck row with the donor's largest side part; a longer neck strikes further
     a walker (leg, claw)  bulk    a new body row with the donor's parts and one more leg pair
     anything else         wide    four tusks on the mouth from the donor's blades; the mouth opens wider
   Three of each; after that the oldest of that kind is re-dressed from the new donor. The parts come from the
   donor's own kit sheet, chosen by shape.

     const maw = EcologyMaw.create({ parts, KitLook, sheetOf, colorOf })
        parts: PartLib.load() result. sheetOf(speciesName) -> kit sheet key or null. colorOf(sp) -> [r, g, b] of a species
     EcologyMaw.attach(maw, { sim, diet, walkers }) -> its creature in the tank (make it diet.mine), or null without a walkers' world
     EcologyMaw.detach(maw)
     EcologyMaw.input(maw, { move, aim, hold })   move, aim: [x, y] headings in the tank, or null; hold: the lunge key is down
     EcologyMaw.step(maw, dt)                     after the tank's and the diet's steps
     EcologyMaw.lines(maw) -> { data: x, y, z, 1 per vertex (tank space), verts, batches: [{ start, count, color }] }
     EcologyMaw.view(maw) -> { x, y, z, len, aim, coil }   where a camera should look: the body's middle, in tank space
     EcologyMaw.relayout(maw)                     after the walkers' world was rebuilt (EcologyWalkers.layout)
     EcologyMaw.edible(maw, creature)             may it eat that one
     EcologyMaw.feed(maw, sp)                     as if it had eaten one of species sp (the workbench, tests)
     maw.state   walk | coil | lunge | chew | miss      maw.charge 0..1      maw.lv { reach, bulk, wide }

   Sizes of parts are in the kit's own drawing units ("design units": a row is 22.5 apart); maw.U is walker units per
   design unit. Classic script -> window.EcologyMaw. Needs EcologyWalkers (and what it needs), PartLib, LimbArt. */
(function () {
  "use strict";
  // everything that simulates draws its randomness here: the seeded stream when the core is loaded (a seed replays), Math.random when it is not
  const RND = () => (window.EcoCore ? window.EcoCore.random() : Math.random());
  const { min, max, abs, sin, cos, acos, atan2, hypot, PI, sqrt, floor, round } = Math, TAU = PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t, clamp = (x, a, b) => (x < a ? a : x > b ? b : x), ease = (t) => t * t * (3 - 2 * t);
  const wrap = (a) => ((a + PI) % TAU + TAU) % TAU - PI;

  const FLOOR = 0.97;                                     // the tank floor, as a share of its depth (as EcologyWalkers has it)
  const STEP = sqrt(3) * 13, U0 = 0.0165;                 // a row's length in design units; walker units per design unit at the smallest size
  const INK = [0.925, 0.91, 0.87], GOLD = [0.91, 0.69, 0.29], HIT = [0.61, 0.89, 0.42], NOHIT = [0.92, 0.36, 0.30], CHARGE = [0.62, 0.62, 0.66], SONAR = [0.45, 0.86, 0.96], /* green: catchable; red: too big (or not food); grey: charging, nothing catchable yet */ THROAT = [0.62, 0.19, 0.24];
  // legs as the Quad Mech (the Kit Qilin's) has them: one whole part per bone, thigh, shin and foot, each carried by its bone so the leg bends between parts and never through one
  // the kit's fins (creature-catalog feature "fin"): a swimmer wears these where its legs were
  // only the clean, swept shapes (the kit's jagged fin stubs read as damage, not fins); first the ones a donor may lend, then the defaults
  // a fin is two kit parts, a ribbed root and a blade, each a bone of an IK chain (as a leg's thigh and shin); the defaults are the lance swifts'
  const FIN_DEFAULT = { front: ["P581", "P579"], hind: ["P580", "P578"], extra: ["P605", "P607"], tail: ["P608", "P606"] }, FINS = new Set(Object.values(FIN_DEFAULT).flat());
  // where its legs hang and how long they are (design units). Their bones are not its own: a leg is a walker's leg blade, taken whole from the
  // kind it last ate that walks (SpeciesRig.PLANS), built and walked as that walker's is. The pincer's until it eats another
  const LEG = { front: { ang: 52, len: 96 }, hind: { ang: 128, len: 92 }, extra: { ang: 90, len: 88 } }, LEG_FROM = "pincer";
  // fins and wings likewise: a swimmer's fin pairs and the tail's are the fin blades of what it ate, beating as a winged walker's wings do
  // (CreatureBody arms with a flap: in the water they beat at a steady 1.25); a side part that is some walker's wing beats as that wing
  // strike: how far the neck throws the head, in neck lengths, at no charge and added at full charge; out, back: seconds to throw and draw back
  const RULES = { walk: { ahead: 8, speed: 2.2, top: 0.62, turn: 14, face: 0.15, tail: 0.45, brake: 3.5, hand: [1, 0.6], grip: 0.7 },   // walk: top (share of the body's own top speed it is driven to), turn (rad/s the body swings to a new heading), face (share of speed kept while still turning to it), tail (how much of the drive the last piece gets: the rest follows the head's path), brake (how much harder it stops than it goes)
    jaw: 0.35, feared: false, quiet: 0.7,   // jaw: what its mouth is worth in the food web (EcoCore.Web: with the band at 2 it takes prey up to 1 / (2 x jaw) = 1.4 times its own weight; at 0.5 (prey up to its own weight) the autopilot could not finish the Frond Forest or the Shoals in four minutes); quiet: under this share of its top speed, and not in a lunge, nothing runs from it by its size (it walks at 0.62 of it, so a walking Maw is an ambusher that prey let near; a lunge scatters what it could have eaten); feared: whether prey run from it by its weight at all. Off: tried on (20 Nov 2026), the autopilot could no longer win the Frond Forest or the Shoals in four minutes, because what it lunged at was already running; it is an ambusher, and the tank lets it near
    coil: 0.85, minCharge: 0.16, strike: [1.7, 1.7], out: 0.13, hold: 0.12, back: 0.3, cone: 1.0, rise: 1.9, lead: 0.2, lowland: 0.35, struggle: 1.0, angW: 0.8, stick: 0.3, assist: 0.6, stop: 0.09, level: { base: 2, grow: 1, stock: 8, offer: 6 },
    // abilities: worn organs that give a verb, from what the donor carried (its diet trait). Eyes are passive (the camera sees further); sonar is the ability button
    abil: { eyes: { max: 2, dist: 0.3 }, sonar: { cool: 7, cost: 0.35, R: 0.45, dur: 1.4, show: 4, spook: 0.35 },
      // the rest (the abilities plan, 2026-11-17): each one a trick some species in the tank already has, or a verb from the Alien angle.
      // cool: seconds before the button works again; cost: a share of the dash's energy; dur: how long it lasts
      cloak: { cool: 2, drain: 0.12 },                                   // still: hunters lose you; moving or striking ends it; it drains while held
      lure: { cool: 10, dur: 8, cost: 0.2 },                             // a light on a stalk: draws small things to the mouth
      puff: { cool: 9, dur: 3, cost: 0.4 },                              // swollen: nothing can swallow you; you cannot move or bite
      sting: { stun: 2, speed: 0.85 },                                   // passive: whatever bites you is stunned and lets go; slower
      harpoon: { cool: 4, cost: 0.3, reach: 6, cone: 0.55, light: 1.2, heavy: 2.4, tow: 2.2 },   // a line: lighter comes to you, heavier drags you
      hitch: { range: 9, ratio: 1.6, speed: 1.8 },                       // ride beside something bigger; the stick gets off
      leap: { cool: 5, k: 2.3, coil: 3 },                                // the next lunge coils fast and reaches far: a drop from a tower
      infect: { cool: 6, hatch: 20 },                                    // the next bite lays in its host instead of eating it; it hatches a spare life
      brood: { cool: 14, cost: 0.5, max: 3, life: 45, energy: 0.6 },     // hatchlings that hunt; what they eat feeds you
      mimic: { need: 3 },                                                // passive: a kind you have eaten 3 of ignores you
      spit: { cool: 1.6, cost: 0.15, speed: 5, life: 1.1, slow: 3 } },    // a glob that slows the first thing it hits
    // metamorphosis: three meals of swimmers in stock offer the swimmer form (three of walkers, the way back); it cocoons, helpless, then emerges
    form: { need: 3, cocoon: 2.6, altStep: 0.8, alt0: 1.2 }, miss: 0.5, cost: [0.6, 0.8], gate: 1.6, upkeep: 0.1, max: 3, grow: 0.15, roomy: 1.7,
    neck: { k: 180, d: 24, rear: 0.38, coilRear: 0.3, flex: 0.75, sway: 0.13, swayHz: 0.45, whip: 0.14 } };   // flex: how far the neck's base lags its head when it turns (0 = a rod); sway: its idle S-wave, radians at the head; whip: the bow of a strike, in neck lengths   // the push that holds the head and neck up and aims them; how high the head rides, in neck lengths

  const row = (id, o) => Object.assign({ id, long: 0, wide: 0, own: null, sides: [], legs: null }, o);

  function create(opts) {
    opts = opts || {};
    const byId = Array.isArray(opts.parts) ? Object.fromEntries(opts.parts.map((p) => [p.id, p])) : (opts.parts || {});
    const bySheet = {}; for (const id in byId) { const p = byId[id]; (bySheet[p.species] || (bySheet[p.species] = [])).push(p); }
    if (window.Fangs) for (const p of window.Fangs.PARTS) if (!byId[p.id]) byId[p.id] = p;
    if (window.MawWing) for (const p of window.MawWing.PARTS) if (!byId[p.id]) byId[p.id] = p;   // its own wing (shared/look/game/maw-wing.js): its fins   // its own teeth: the hand-drawn fangs (shared/look/game/fangs.js), not a donor's
    const maw = { byId, bySheet, thin: opts.thin, KitLook: opts.KitLook, sheetOf: opts.sheetOf || (() => null), colorOf: opts.colorOf || (() => [0.36, 0.89, 0.6]),
      sim: null, diet: null, host: null, guest: null, body: null, look: null, def: null, was: null, buf: new Float32Array(8192), batches: [], tooth: new Map(), in: { move: null, aim: null, hold: false } };
    if (opts.design !== false) { const d = designKept(); if (d && Array.isArray(d.rows) && d.rows.every((q) => byId[q.id])) { maw.design = d; maw.bodyKey = "custom"; if (d.legs) maw.legFrom = LEG_ALIAS[d.legs] || d.legs; } }
    reset(maw);
    return maw;
  }
  const ABILS = ["eyes", "sonar", "cloak", "lure", "puff", "sting", "harpoon", "hitch", "leap", "infect", "brood", "mimic", "spit"];
  const ACTIVE = ["sonar", "cloak", "lure", "puff", "harpoon", "hitch", "leap", "infect", "brood", "spit"];   // on the button, one at a time; eyes, sting and mimic are always on
  // the bodies it can be built as: the same plan (head, two neck rows, shoulders with legs, back, haunch with legs, tail), different pieces.
  //   serpent  the first Maw: the serpent's head, neck and tail on the pincer crawler's plates, every piece about a row long
  //   wraith   after Zac's references (one dark sinuous body, a mane, a long tail): the kit's large pieces. A mask for the head, the strider's
  //            carapace for shoulders with a mane of wing blades swept back from it, broad plates behind, and a tail of four rows ending in a
  //            dagger. room: how much further than a plain row this one sits from the row before, so the big plates do not pile up.
  const BODIES = {
    serpent: () => [row("P277", { long: 36, head: true }), row("P280", { long: 27, neck: true }), row("P280", { long: 27, neck: true }),
      row("P246", { wide: 64, legs: "front" }), row("P253", { wide: 46 }), row("P251", { wide: 52, legs: "hind" }), row("P276", { long: 46, tail: true })],
    wraith: () => [row("P294", { wide: 76, head: true }), row("P280", { long: 30, neck: true, room: 1.5 }), row("P280", { long: 30, neck: true }),
      row("P075", { wide: 128, legs: "front", room: 2.1, sides: [{ id: "P290", len: 150, rise: 0.5 }, { id: "P578", len: 104, rise: 0.38 }] }),
      row("P562", { wide: 86, room: 1.9 }), row("P456", { wide: 106, legs: "hind", room: 1.5 }),
      row("P257", { wide: 42, room: 1.5 }), row("P255", { wide: 32 }), row("P274", { long: 22 }), row("P080", { long: 84, tail: true, room: 1.7 })],
  };
  // the body is rebuilt as another of BODIES; what it has grown (neck rows, body rows) goes back where it grew
  // key: one of BODIES, or the rows themselves ([{ id, wide | long, sides, legs, head, neck, tail, room }], as Maw Forge exports a design)
  const rowsOf = (rows) => rows.map((q) => row(q.id, Object.assign({}, q, { sides: (q.sides || []).map((sd) => Object.assign({}, sd)) })));
  function bodyFrom(maw, key) { const own = Array.isArray(key); if (!own && !BODIES[key]) return maw.bodyKey || "serpent"; maw.bodyKey = own ? "custom" : key; if (!own) maw.design = null;
    const R = own ? rowsOf(key) : BODIES[key]();
    for (const g of maw.grown.reach) R.splice(R.findIndex((q) => q.legs === "front"), 0, g); for (const g of maw.grown.bulk) R.splice(R.findIndex((q) => q.legs === "hind"), 0, g);
    maw.rows = R; if (maw.body) build(maw); return key; }
  // on its own, with no tank: the body built in the walker engine on a ground of its own (a design page). The page steps maw.body and reads maw.look
  // what the Maw weighs in the food web: the length of the body it stands on (so a grown row makes it heavier), in the tank's length units
  function weigh(maw) { const g = maw.guest, b = maw.body; if (!g || !b || !maw.sim) return; let L = 0; for (let i = 1; i < b.chunks.length; i++) { const a = b.chunks[i - 1].p, c = b.chunks[i].p; L += hypot(a.x - c.x, a.y - c.y, a.z - c.z); }
    const sp = maw.sim.speciesRT[g.sp], unit = window.EcologySim.bodyLen(maw.sim, g) / (g.scale * sp.swim.len); if (L > 0 && unit > 0) { g.len = L / maw.host.ks / unit; g.jaw = RULES.jaw; } }
  function standAlone(maw, W) { maw.host = maw.host || { W: Object.assign({ H: () => 0 }, W || {}) }; maw.body = null; build(maw, { x: 0, z: 0, yaw: 0 }); return maw.body; }
  // a design from Maw Forge ({ legs, rows }, as its Export body gives): the Maw's body and legs from then on, new runs included. keep: also the
  // default on this device (EcologyMaw.create reads it). null clears it. Returns { ok, why }
  const DKEY = "maw-design", LEG_ALIAS = { crawler: "pincer", hook: "sickle" };
  function design(maw, d, keep) {
    if (d == null || d === "") { maw.design = null; if (keep) try { localStorage.removeItem(DKEY); } catch (e) {} bodyFrom(maw, BODIES[maw.bodyKey] ? maw.bodyKey : "serpent"); return { ok: true, why: "cleared" }; }
    if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) { return { ok: false, why: "not a design: paste the text from Maw Forge's Export body" }; } }
    const rows = d && d.rows; if (!Array.isArray(rows) || rows.length < 3) return { ok: false, why: "a design needs at least three rows" };
    const miss = []; for (const q of rows) { if (!maw.byId[q.id]) miss.push(q.id); for (const sd of q.sides || []) if (!maw.byId[sd.id]) miss.push(sd.id); }
    if (miss.length) return { ok: false, why: "parts not in the kit: " + [...new Set(miss)].slice(0, 6).join(", ") };
    if (!rows.some((q) => q.legs === "front") || !rows.some((q) => q.legs === "hind")) return { ok: false, why: "a design needs front and hind leg rows" };
    maw.design = { legs: d.legs || null, rows: rows.map((q) => Object.assign({}, q)) };
    bodyFrom(maw, maw.design.rows); maw.design = { legs: d.legs || null, rows }; if (d.legs) legsFrom(maw, LEG_ALIAS[d.legs] || d.legs);
    if (keep) try { localStorage.setItem(DKEY, JSON.stringify({ legs: d.legs || null, rows })); } catch (e) {}
    return { ok: true, why: rows.length + " rows" + (d.legs ? ", " + d.legs + " legs" : "") }; }
  const designKept = () => { try { return JSON.parse(localStorage.getItem(DKEY) || "null"); } catch (e) { return null; } };
  function reset(maw) {
    Object.assign(maw, { rows: maw.design ? rowsOf(maw.design.rows) : (BODIES[maw.bodyKey] || BODIES.serpent)(),
      teeth: [], lv: { wide: 0, bulk: 0, reach: 0 }, grown: { wide: [], bulk: [], reach: [] }, Rmax: 50, RmaxT: 50, m: 0.08,
      state: "walk", st: 0, t: 0, charge: 0, cool: 0, ext: 0, reachMax: 1, strikeTo: null, target: null, bolus: [], tier: null, U: U0, xp: 0, lvls: 0, owed: 0, stock: [], offer: null, ab: Object.fromEntries(ABILS.map((k) => [k, 0])), act: null, on: {}, cd: {}, eggs: [], brood: [], spits: [], slowed: [], lives: 0, eatenSp: {}, form: "walk", alt: 0, sonar: null, pingCool: 0, cocoonTo: null });
    // twelve teeth, one on every 30 degree ray
    const F = window.Fangs ? ["FANG-U-INNER", "FANG-L-INNER", "FANG-U-MID", "FANG-L-MID"] : ["P258", "P032", "P244", "P244"];   // fangs alternate upper and lower shapes; the kit's teeth if the fangs are not loaded
    for (let i = 0; i < 12; i++) { const big = i % 2 === 0; maw.teeth.push({ a: i / 12 * TAU + PI / 12, id: big ? (i % 4 === 0 ? F[0] : F[1]) : (i % 4 === 1 ? F[2] : F[3]), len: big ? (i % 4 === 0 ? 32 : 28) : 18, own: null, grow: 1 }); }
  }
  const lines = (maw, id) => (maw.byId[id] ? window.PartLib.lines(maw.byId[id]) : []);

  // ---- limbs from the other creatures ----
  const plans = () => (window.SpeciesRig && window.SpeciesRig.PLANS) || {};
  // leg designs that are not a walker's own: three kit drawings a leg (upper, lower, hand or foot), one a bone. long: the leg's length against the
  // Maw's usual; reach: how far out the foot rests (less: a higher knee). The qilin's are the Kit Quad Mech's (plain blades, a round foot, fore and aft pairs).
  const LEG_PLANS = {
    qilin:   { bones: { front: ["P128", "P183", "P444"], extra: ["P128", "P187", "P444"], hind: ["P245", "P187", "P444"] }, fracs: [0.42, 0.4, 0.18], long: 1.5, reach: 0.6 },
    stalker: { bones: ["P396", "P187", "P424"], fracs: [0.38, 0.4, 0.22], long: 1.7, reach: 0.55 },
    raptor:  { bones: ["P395", "P183", "P518"], fracs: [0.32, 0.34, 0.34], long: 1.6, reach: 0.58 },
    reaper:  { bones: ["P430", "P396", "P171"], fracs: [0.26, 0.28, 0.46], long: 1.8, reach: 0.6 },
    sickle:  { bones: ["P395", "P557", "P079"], fracs: [0.32, 0.3, 0.38], long: 1.5, reach: 0.6 },
    stilt:   { bones: ["P183", "P187", "P080"], fracs: [0.3, 0.3, 0.4], long: 1.9, reach: 0.5 },
    grasper: { bones: ["P430", "P432", "P429"], fracs: [0.36, 0.32, 0.32], long: 1.5, reach: 0.6 },
  };
  for (const k in LEG_PLANS) LEG_PLANS[k].legs = [{ id: (LEG_PLANS[k].bones.front || LEG_PLANS[k].bones)[0] }];
  const legPlan = (maw) => { const P = Object.assign({}, LEG_PLANS, plans()), k = maw.legFrom && P[maw.legFrom] && P[maw.legFrom].legs && P[maw.legFrom].legs.length ? maw.legFrom : LEG_FROM; return P[k] ? { key: k, plan: P[k] } : null; };
  const WINGS = () => new Set(Object.values(plans()).map((q) => q.wing).filter(Boolean));
  // a leg as SpeciesRig makes one: the donor's blade, its medial spine cut into bones at the donor's fractions, at the donor's splay
  function legOf(maw, place, len) {
    const LA = window.LimbArt, lp = legPlan(maw), sp = LEG[place]; if (!lp) return null;
    if (lp.plan.bones) { const B = lp.plan.bones[place] || lp.plan.bones, Q = B.map((id) => lines(maw, id)); if (!Q[0].length) return null;
      return { keepOwn: true, artObj: LA.segmentArt(Q, lp.plan.fracs), ang: sp.ang, len, fracs: lp.plan.fracs, reach: lp.plan.reach ?? 0.55, faceUp: true, pole: [place === "front" ? 0.8 : place === "hind" ? -0.8 : 0.3, 1], from: lp.key, part: B.join("+") }; }
    const L = lp.plan.legs, l = place === "front" ? L[0] : place === "hind" ? L[L.length - 1] : L[L.length >> 1], q = lines(maw, l.id); if (!q.length) return null;
    const jt = LA.jointAndTip(q), fr = lp.plan.fracs || [0.4, 0.36, 0.24];
    // the donor's own splay, turned to face the Maw's way (front legs forward, hind back): its angle from the donor, mirrored into this place's half
    const own = l.ang ?? sp.ang, ang = place === "front" ? min(own, 90 - abs(90 - own)) : place === "hind" ? max(own, 90 + abs(90 - own)) : own;
    // two of the donor's leg blades, a thigh and a shin, each one bone of the leg's IK chain (the knee is solved: CreatureBody.solveLeg), and a short foot
    const other = L.find((x) => x.id !== l.id && lines(maw, x.id).length) || l, q2 = lines(maw, other.id), F2 = [0.5, 0.42, 0.08];
    // the foot rests well inside the leg's reach so the knee always bends, and the knee juts forward on the front legs, back on the hind (seen from above)
    return { keepOwn: true, artObj: LA.segmentArt([q, q2, []], F2), ang, len, fracs: F2, reach: 0.55, faceUp: true, pole: [place === "front" ? 1.2 : place === "hind" ? -1.2 : 0.5, 0.6], knee: l.knee, from: lp.key, part: l.id + "+" + other.id };
  }
  // a fin or a wing as SpeciesRig hangs a wing: the blade's own drawing along three bones, mounted on the rim, resting swept back, beating
  function armOf(maw, id, half, len, sweep, o) {
    const two = Array.isArray(id); let q = lines(maw, two ? id[0] : id); if (!q.length) return null;
    // its own wing, as drawn (from above, head up): the blade sweeps forward and out, the lobes hang behind it. At the tail it is turned over
    // so the same drawing trails backward
    if (id === "MAW-WING" && o && o.flip) q = q.map((pl) => pl.map((v, i) => (i % 2 ? -v : v)));
    const mx = max(half * 0.7, 0.05), my = (o && o.my) || 0.03, mz = (o && o.mz) || 0, a = sweep * PI / 180, dx = cos(a), dz = -sin(a);
    const q2 = two ? lines(maw, id[1]) : null, seg = q2 && q2.length;
    return { art: "MAW-" + (two ? id.join("+") : id), artPolys: q, faceUp: true, ...(seg ? { artObj: window.LimbArt.segmentArt([q, q2], [0.45, 0.55]) } : {}), mount: [mx, my, mz], len, fracs: seg ? [0.45, 0.55] : [0.4, 0.34, 0.26], rest: [mx + dx * len * 0.86, my + 0.12 * len, mz + dz * len * 0.86],
      flap: { amps: (o && o.amps) || [20, 15, 11], lags: (o && o.lags) || (seg ? [0, 0.16] : [0, 0.1, 0.22]), rate: (o && o.rate) || 3.4, ground: (o && o.ground) ?? 1 } };
  }

  // ---- the def: the rows as a walker's pieces ----
  function buildDef(maw) {
    const LA = window.LimbArt, U = maw.U, fr = [0.3, 0.4, 0.3], gap0 = STEP * U, legLens = [];
    const segs = maw.rows.map((r, i) => {
      // a grown row is a whole plate with its own legs: it gets room for them, so a fed Maw is longer, not a pile (RULES.roomy)
      const gap = gap0 * (r.room || (maw.grown.reach.includes(r) || maw.grown.bulk.includes(r) ? RULES.roomy : 1));
      const p = maw.byId[r.id], polys = lines(maw, r.id), k = (r.long ? r.long / +p.h : r.wide / +p.w) * U, half = +p.w * k / 2;
      // the centre part lies on the spine as drawn, arched a little across its width so it has a back to it
      const parts = [{ id: r.id, polys, cx: +p.ox, cy: +p.oy, k, arch: { hw: +p.w / 2, h: half * 0.5 } }];
      // side parts hang from where they met the donor's body, mirrored, raised toward their tips; one that is a fin or some walker's wing beats as one
      const legs = [], arms = [], swim = maw.form === "swim" && maw.state !== "cocoon", wings = WINGS();
      for (const sd of r.sides) { const q = lines(maw, sd.id); if (!q.length) continue; const jt = LA.jointAndTip(q), ks = sd.len * U / (jt.L || 1), J = jt.J, rise = sd.rise ?? 0.32;
        if (!sd.organ && (wings.has(sd.id) || FINS.has(sd.id))) { const A = armOf(maw, sd.id, half, sd.len * U, wings.has(sd.id) ? 20 : 35, { my: half * 0.3, amps: wings.has(sd.id) ? [24, 18, 14] : [16, 12, 9], rate: wings.has(sd.id) ? 4.2 : 3, ground: wings.has(sd.id) ? 0.25 : 0.4 }); if (A) { arms.push(A); continue; } }
        parts.push({ id: sd.id, polys: q, cx: J[0] + half * 0.55 / ks, cy: J[1] + gap * 0.15 / ks, k: ks, mirror: true, lift: (sx, sy) => rise * hypot(sx - J[0], sy - J[1]) * ks }); }
      if (swim && (r.legs || r.tail)) {   // a swimmer: a pair of fins where the legs were (and a pair at the tail), from the fins of what it ate to change, beating
        const own = maw.byId["MAW-WING"] ? "MAW-WING" : null, fin = own || (maw.fins && maw.fins[r.legs || "tail"]) || FIN_DEFAULT[r.legs || "tail"];
        if (r.legs) legLens.push(LEG[r.legs].len * U);
        const A = armOf(maw, fin, half, (own ? (r.tail ? 46 : r.legs === "front" ? 104 : r.legs === "hind" ? 80 : 70) : r.tail ? 44 : LEG[r.legs].len * 0.55) * U, own ? (r.tail ? 58 : r.legs === "front" ? -30 : -14) : r.tail ? 62 : r.legs === "front" ? 28 : 42, { flip: own && r.tail, mz: r.tail ? -gap * 0.3 : 0, amps: own ? (r.tail ? [12, 5, 3] : [20, 8, 4]) : r.tail ? [14, 12, 10] : [22, 16, 12], lags: own ? [0, 0.06, 0.12] : null, rate: 3 });   // its own wing beats mostly from the root, so the drawing holds its shape
        if (A) arms.push(A); }
      else if (r.legs) { const lp0 = legPlan(maw), len = LEG[r.legs].len * U * ((lp0 && lp0.plan.long) || 1), L = legOf(maw, r.legs, len); legLens.push(len);
        // the hip sits on the rim of the row, toward the leg's side and its end of the body, as the Quad Mech's does
        if (L) legs.push(Object.assign(L, { hip: [max(half * 0.8, 0.06), 0.02, (L.ang < 90 ? 1 : L.ang > 90 ? -1 : 0) * 0.15 * len] })); }
      return { h: 0, gap: i ? gap : 0, parts, legs, arms, zF: gap / 2, zB: -gap / 2, row: r, half };
    });
    const Lm = legLens.length ? legLens.slice().sort((a, b) => a - b)[legLens.length >> 1] : 1;
    for (const sg of segs) sg.h = 0.5 * Lm;
    const gp = (legPlan(maw) || { plan: {} }).plan;
    return { segs, smooth: false, flatLimbs: true, Lm, speed: 2.6 * Math.pow(Lm, 0.6), cadence: 2, stride: (gp.stride ?? 0.44) * Lm, lift: (gp.step ?? 0.3) * Lm, turn: 3.4, bob: gp.bob ?? 0.012, climb: true };
  }
  // a new body for the def, standing where the old one stood (rows that were there keep their place)
  function build(maw, at) {
    const W = maw.host.W, kit = window.EcologyWalkers.kit, old = maw.body, def = (maw.def = buildDef(maw));
    const start = old ? { x: old.chunks[0].p.x, z: old.chunks[0].p.z } : at, yaw = old ? old.heading : (at.yaw || 0);
    const body = new window.CreatureBody(def, { H: W.H, S: { speed: 1, stride: 1, lift: 1, height: 1, gait: "alt" }, surface: W.surface, ceil: W.ceil, climb: true, start, yaw });
    if (old) {
      const was = new Map(old.def.segs.map((sg, i) => [sg.row, old.chunks[i]])), C = body.chunks;
      C.forEach((c, i) => { const o = was.get(def.segs[i].row); if (o) { c.p.copy(o.p); c.prev.copy(o.prev); c.had = true; } });
      C.forEach((c, i) => { if (c.had) return; const a = C[i - 1], b = C[i + 1]; if (a && a.had && b && b.had) c.p.lerpVectors(a.p, b.p, 0.5); else if (a && a.had) c.p.copy(a.p).addScaledVector(old.hdir, -body.rest[i - 1]); c.prev.copy(c.p); });
      body.hdir.copy(old.hdir); body.frames(); for (const L of body.legs) { body.homeOf(L, L.foot, 0); body.solveLeg(L); } body.write();
    }
    body.rest0 = body.rest.slice();
    if (maw.look) maw.look.dispose();
    const look = new maw.KitLook(kit.T, kit.NOWHERE, def, body.skel, {}); look.update(body.skel);
    look.thin = look.groups.map((g) => kit.thin(g.children[0].geometry.attributes.position.array, maw.thin ?? 0.02));   // it is seen close: thinned far less than the crew
    maw.body = body; maw.look = look; maw.ia = max(1, def.segs.findIndex((sg) => sg.row.legs)); setForm(maw); weigh(maw);
  }
  // the fins a swimmer grows: from the kinds it ate to become one (their sheets' fins), the kit's own where those have none
  function pickFins(maw) {
    const LA = window.LimbArt, sheets = (maw.finFrom || []).concat(maw.stock.map((q) => q.don.sheet)).filter(Boolean), found = [];
    // a fin-worthy part: a side blade drawn in detail (not a stub), long enough to be a limb; the wider of a pair is its root
    for (const sh of sheets) for (const p of maw.bySheet[sh] || []) { if (p.side === "center" || p.side === "c" || found.some((f) => f.id === p.id)) continue; const q = lines(maw, p.id); let n = 0; for (const pl of q) n += pl.length / 2;
      const L = LA.jointAndTip(q).L; if (n >= 40 && L >= 30) found.push({ id: p.id, L, wide: (+p.w * +p.h) / (L * L) }); }
    found.sort((a, b) => b.L - a.L);
    const pair = (k) => { const a = found[k * 2 % (found.length || 1)], b = found[(k * 2 + 1) % (found.length || 1)]; return a && b && a !== b ? (a.wide >= b.wide ? [a.id, b.id] : [b.id, a.id]) : null; };
    maw.fins = found.length >= 2 ? { front: pair(0), hind: pair(1) || pair(0), extra: pair(2) || pair(0), tail: pair(1) || pair(0) } : null;
  }

  // the form on the body: walking, or afloat at its chosen height above whatever is under it
  function setForm(maw) { const b = maw.body; if (!b) return; b.setMode(maw.form === "swim" ? "swim" : "walk"); b.alt = maw.form === "swim" ? maw.alt : 0; }
  // swimmer: a step up (+1) or down (-1)
  function depth(maw, dir) { if (maw.form !== "swim" || !maw.body) return false; const h = maw.host, top = FLOOR * h.td * h.ks * 0.8; maw.alt = clamp(maw.alt + dir * RULES.form.altStep * maw.neckLen * 3, 0, top); maw.body.alt = maw.alt; return true; }
  // sonar: a ring through the water; what it meets is marked for a few seconds; prey near it is spooked
  function ping(maw) {
    const g = maw.guest, b = maw.body, S = RULES.abil.sonar; if (!g || !b || !maw.ab.sonar || maw.pingCool > 0 || maw.state === "cocoon") return false;
    const h = maw.host, E = window.EcologyDiet, d = g.diet, hd = b.chunks[maw.ia].p, R = S.R * h.tw * h.ks;
    if (d && E) d.energy -= E.RULES.dash.cost * S.cost; maw.pingCool = S.cool; maw.sonar = { t: 0, x: hd.x, y: hd.y, z: hd.z, R };
    for (const q of maw.sim.fish) { if (q === g || q.dead || q.hidden) continue; fishPos(h, q, _w); if (hypot(_w.x - hd.x, _w.z - hd.z) < R * S.spook) { q.alarm = 1; } }
    note(maw, "sonar", "The Maw pings"); return true; }
  // what the sonar found, in tank space: prey it may eat, and what hunts it
  function sensed(maw) {
    const S = maw.sonar, g = maw.guest; if (!S || !g || S.t > RULES.abil.sonar.show) return null; const h = maw.host, out = [], hunts = window.EcologySim.hunts ? window.EcologySim.hunts(maw.sim) : [];
    const threat = new Set(hunts.filter((x) => x.prey === g).map((x) => x.hunter));
    for (const q of maw.sim.fish) { if (q === g || q.dead || (q.hidden && !q.crew)) continue; const crew = q.crew && q.crew.body; if (crew) { const p = crew.chunks[crew.chunks.length >> 1].p; _w.x = p.x; _w.y = p.y; _w.z = p.z; } else fishPos(h, q, _w);
      if (hypot(_w.x - S.x, _w.z - S.z) > S.R * min(1, S.t / RULES.abil.sonar.dur)) continue; const k = threat.has(q) ? "threat" : edible(maw, q) ? "prey" : null; if (!k) continue; toTank(h, _w, _t); out.push({ x: _t.x, y: _t.y, z: _t.z, kind: k }); }
    return out; }

  // ---- tank <-> walker space (as EcologyWalkers has it) ----
  const toTank = (h, p, out) => { out.x = p.x / h.ks + h.tw / 2; out.y = p.z / h.ks + h.th / 2; out.z = FLOOR * h.td - p.y / h.ks; return out; };
  const fishPos = (h, f, out) => { out.x = (f.x - h.tw / 2) * h.ks; out.y = (FLOOR - f.z) * h.td * h.ks; out.z = (f.y - h.th / 2) * h.ks; return out; };
  const _t = { x: 0, y: 0, z: 0 }, _w = { x: 0, y: 0, z: 0 }, _m = { x: 0, y: 0, z: 0 };

  // ---- what a meal gives: the donor's own parts, chosen by shape ----
  function donorParts(maw, sheet) {
    const LA = window.LimbArt, list = (sheet && maw.bySheet[sheet] || []).filter((p) => String(p.svg).length < 12000 && min(+p.w, +p.h) > 4 && max(+p.w, +p.h) > 14);
    const isC = (p) => p.side === "center" || p.side === "c", centre = list.filter(isC), side = list.filter((p) => !isC(p));
    const spine = centre.slice().sort((a, b) => abs(max(+a.w, +a.h) - 46) - abs(max(+b.w, +b.h) - 46))[0];
    const long = side.map((p) => ({ p, L: LA.jointAndTip(lines(maw, p.id)).L })).filter((q) => q.L > 0).sort((a, b) => b.L - a.L);
    const slim = long.slice().sort((a, b) => (b.L * b.L) / (b.p.w * b.p.h) - (a.L * a.L) / (a.p.w * a.p.h));
    return { spine: spine ? spine.id : null, side: long[0] ? long[0].p.id : null, side2: long[1] ? long[1].p.id : null, tooth: slim[0] ? slim[0].p.id : null };
  }
  // ---- the abilities on the button (one at a time: maw.act), and the passives. Each is a trick a kind in the tank already has, or a verb from
  // the Alien angle; each has a price. use() is the button; abilStep() runs what is under way; abilLines() draws it ----
  const leapK = (maw) => (maw.on && maw.on.leap ? RULES.abil.leap.k : 1);
  const speedK = (maw) => (1 + PART.bulk.speed * (maw.lv ? maw.lv.bulk : 0)) * (maw.ab && maw.ab.sting ? RULES.abil.sting.speed : 1) * (maw.on && (maw.on.ride || (maw.on.tow && maw.on.tow.heavy)) ? (maw.on.ride ? RULES.abil.hitch.speed : RULES.abil.harpoon.tow) : 1);
  // keeping still: walking under a share of its top speed and not in a lunge
  function quiet(maw) { const b = maw.body; if (!b || maw.state === "lunge") return false; const v = b.vel(b.chunks[maw.ia || 0], _vq || (_vq = new window.CreatureBody.V3())); return hypot(v.x, v.z) < RULES.quiet * (b.def.speed || 1); }
  let _vq = null;
  function unseen(maw, a) { const g = maw.guest; return !!(maw.on.cloak || maw.on.puff > 0 || (g && g.mimic && g.mimic.has(a.sp))); }
  function mimicSet(maw) { const g = maw.guest; if (!g || !maw.ab.mimic) return; const sp = maw.sim.speciesRT; g.mimic = new Set(sp.map((x, i) => ((maw.eatenSp[x.key] || 0) >= RULES.abil.mimic.need ? i : -1)).filter((i) => i >= 0)); }
  function shake(maw) { const g = maw.guest; for (const f of maw.sim.fish) if (f.target === g) { f.target = null; f.ignore = g; f.ignoreT = 3; } }   // hunters lose it
  function pay(maw, c) { const d = maw.guest && maw.guest.diet, E = window.EcologyDiet; if (d && E) d.energy -= E.RULES.dash.cost * c; }
  function abilClear(maw) { const sim = maw.sim, H = sim && sim.hooks;
    if (H && H.lurers) { const i = H.lurers.indexOf(maw.guest); if (i >= 0) H.lurers.splice(i, 1); }
    for (const f of maw.brood || []) if (!f.dead) { f.dead = true; f.noRespawn = true; }
    for (const o of maw.eggs || []) o.mawEgg = 0;
    Object.assign(maw, { on: {}, cd: {}, eggs: [], brood: [], spits: [], slowed: [], moveOver: undefined }); }
  // the fish the aim points at, out to r (walker units) and inside the cone: any kind, for the harpoon
  function aimed(maw, r, cone) {
    const h = maw.host, g = maw.guest, hd = maw.body.chunks[0].p, aim = maw.aimW; let best = null, bd = r;
    for (const q of maw.sim.fish) { if (q === g || q.dead || (q.hidden && !q.crew) || q.caught || q.brood === maw || (q.guest && !q.crew)) continue; fishPos(h, q, _w);
      const dx = _w.x - hd.x, dz = _w.z - hd.z, d = hypot(dx, dz); if (d > bd || d < 1e-6) continue; if (acos(clamp((dx * aim.x + dz * aim.z) / d, -1, 1)) > cone) continue; bd = d; best = q; }
    return best; }
  function use(maw) {
    const k = maw.act, g = maw.guest, A = RULES.abil[k]; if (!k || !maw.ab[k] || !g || !maw.body || maw.state === "cocoon" || g.dead) return false;
    if (k === "sonar") return ping(maw);
    if ((maw.cd[k] || 0) > 0 && !(k === "cloak" && maw.on.cloak) && !(k === "hitch" && maw.on.ride)) return false;
    const sim = maw.sim, h = maw.host, on = maw.on;
    if (k === "cloak") { on.cloak = !on.cloak; if (on.cloak) shake(maw); else maw.cd.cloak = A.cool; note(maw, "cloak", on.cloak ? "The Maw goes still and fades" : "The Maw shows itself"); return true; }
    if (k === "lure") { on.lure = A.dur; pay(maw, A.cost); maw.cd.lure = A.cool; if (!sim.hooks.lurers.includes(g)) sim.hooks.lurers.push(g); note(maw, "lure", "The Maw raises a light"); return true; }
    if (k === "puff") { on.puff = A.dur; pay(maw, A.cost); maw.cd.puff = A.cool; shake(maw);
      if (g.caught) { const c = g.caught; c.holding = null; g.caught = null; c.ignore = g; c.ignoreT = 4; note(maw, "puff", "The Maw swelled and was spat out by " + sim.speciesRT[c.sp].name); } else note(maw, "puff", "The Maw swells"); return true; }
    if (k === "harpoon") { const o = aimed(maw, maw.neckLen * A.reach, A.cone); maw.cd.harpoon = A.cool; pay(maw, A.cost);
      if (!o) { on.line = { miss: 0.35, t: 0.35 }; note(maw, "miss", "The harpoon missed"); return true; }
      const heavy = !fits(maw, o) || bodyLen(maw, o) > bodyLen(maw, g) * 1.4; on.tow = { o, t: heavy ? A.heavy : A.light, heavy }; o.alarm = 1;
      note(maw, "harpoon", (heavy ? "The Maw harpooned " : "The Maw reeled in ") + sim.speciesRT[o.sp].name); return true; }
    if (k === "hitch") { if (on.ride) { on.ride = null; maw.cd.hitch = 1; note(maw, "hitch", "The Maw lets go"); return true; }
      const bl = bodyLen(maw, g); let best = null, bd = A.range * bl;
      for (const q of sim.fish) { if (q === g || q.dead || (q.hidden && !q.crew) || q.brood === maw || bodyLen(maw, q) < bl * A.ratio) continue; const d = hypot(q.x - g.x, q.y - g.y); if (d < bd) { bd = d; best = q; } }
      if (!best) { note(maw, "miss", "Nothing big enough to ride"); return false; } on.ride = best; note(maw, "hitch", "The Maw hitches on " + sim.speciesRT[best.sp].name); return true; }
    if (k === "leap") { on.leap = !on.leap; note(maw, "leap", on.leap ? "The Maw crouches to leap" : "The Maw stands down"); return true; }
    if (k === "infect") { on.infect = !on.infect; note(maw, "infect", on.infect ? "Its next bite lays an egg" : "It will eat again"); return true; }
    if (k === "brood") { maw.brood = maw.brood.filter((f) => !f.dead); if (maw.brood.length >= A.max) { note(maw, "miss", "The brood is full"); return false; }
      const f = window.EcologySim.add(sim, "pincer"); if (!f) return false; pay(maw, A.cost); maw.cd.brood = A.cool;
      Object.assign(f, { x: g.x + (RND() - 0.5) * 2, y: g.y + (RND() - 0.5) * 2, z: g.z, brood: maw, broodT: A.life, darkRoll: 1, fade: 1, noRespawn: true, hunter: true }); maw.brood.push(f);
      note(maw, "brood", "The Maw lets out a hatchling"); return true; }
    if (k === "spit") { const hd = maw.body.chunks[0].p, a = maw.aimW, v = maw.neckLen * A.speed; pay(maw, A.cost); maw.cd.spit = A.cool;
      maw.spits.push({ x: hd.x + a.x * maw.neckLen * 0.5, y: hd.y, z: hd.z + a.z * maw.neckLen * 0.5, vx: a.x * v, vz: a.z * v, t: A.life }); return true; }
    return false;
  }
  function broodFed(maw, f, prey) { const g = maw.guest, d = g && g.diet, E = window.EcologyDiet; if (!g) return;
    maw.bolus.push({ t: 0, ...donOf(maw, prey.sp) }); if (d && E) d.energy = Math.min(E.RULES.energyCap, d.energy + RULES.abil.brood.energy);
    note(maw, "brood", "The brood brought back " + maw.sim.speciesRT[prey.sp].name); }
  function abilStep(maw, dt, I) {
    const on = maw.on, g = maw.guest, sim = maw.sim, h = maw.host, A = RULES.abil; maw.moveOver = undefined;
    for (const k in maw.cd) if (maw.cd[k] > 0) maw.cd[k] -= dt;
    if (!g.caught) g.escMul = 1 + PART.bulk.grip * maw.lv.bulk;   // more legs: a better chance to pull free of a jaw
    if (maw.ab.mimic && (maw.mimicT = (maw.mimicT || 0) - dt) <= 0) { maw.mimicT = 1; mimicSet(maw); }
    if (on.cloak) { if (I.move || I.hold || g.caught) { on.cloak = false; maw.cd.cloak = A.cloak.cool; } else pay(maw, A.cloak.drain * dt); }
    if (on.lure > 0) { on.lure -= dt; if (on.lure <= 0) { on.lure = 0; const i = sim.hooks.lurers.indexOf(g); if (i >= 0) sim.hooks.lurers.splice(i, 1); } }
    if (on.puff > 0) { on.puff -= dt; maw.moveOver = null; if (maw.state === "coil") maw.state = "walk"; pay(maw, 0.25 * dt); }
    if (on.line) { on.line.t -= dt; if (on.line.t <= 0) on.line = null; }
    if (on.tow) { const T = on.tow, o = T.o; T.t -= dt;
      if (!o || o.dead || o.caught === g || T.t <= 0 || g.caught) on.tow = null;
      else if (T.heavy) { const dx = o.x - g.x, dy = o.y - g.y, l = hypot(dx, dy) || 1; maw.moveOver = [dx / l, dy / l]; }   // it drags you: the body runs after it
      else { const k = min(1, dt * 2.6), reach = mouthR(maw) * 2.5; o.x += (g.x - o.x) * k; o.y += (g.y - o.y) * k; o.vx *= 0.3; o.vy *= 0.3; o.z += (g.z - o.z) * k;   // lighter: it comes to you
        if (hypot(o.x - g.x, o.y - g.y) < reach) on.tow = null; } }
    if (on.ride) { const o = on.ride;
      if (o.dead || I.move || g.caught) { on.ride = null; maw.cd.hitch = 1; }
      else { const bl = bodyLen(maw, o), tx = o.x - Math.sin(o.ang || 0) * bl * 0.3, ty = o.y + Math.cos(o.ang || 0) * bl * 0.3, dx = tx - g.x, dy = ty - g.y, l = hypot(dx, dy);
        maw.moveOver = l > bl * 0.25 ? [dx / l, dy / l] : null; } }
    // eggs: a host carries one until it hatches a spare life, or dies with it
    for (let i = maw.eggs.length - 1; i >= 0; i--) { const o = maw.eggs[i]; if (o.dead || !o.mawEgg) { if (o.dead && o.mawEgg) note(maw, "infect", "An egg died with its host"); maw.eggs.splice(i, 1); continue; }
      o.mawEgg -= dt; if (o.mawEgg <= 0) { o.mawEgg = 0; maw.eggs.splice(i, 1); maw.lives++; window.EcologySim.kill(sim, o); note(maw, "hatch", "A Maw hatched out of " + sim.speciesRT[o.sp].name + ": a spare life"); } }
    // a spare life: caught, a hatchling takes its place in the jaw
    if (g.caught && maw.lives > 0) { const c = g.caught; c.holding = null; g.caught = null; c.ignore = g; c.ignoreT = 5; c.target = null; maw.lives--; note(maw, "hatch", "A hatchling took the Maw's place in " + sim.speciesRT[c.sp].name + "'s jaw"); }
    // the brood: they age out
    for (const f of maw.brood) if (!f.dead && (f.broodT -= dt) <= 0) { f.dead = true; f.noRespawn = true; }
    // spit: a glob flies straight; the first creature it touches is slowed
    for (let i = maw.spits.length - 1; i >= 0; i--) { const s = maw.spits[i]; s.t -= dt; s.x += s.vx * dt; s.z += s.vz * dt; let hit = null;
      if (s.t > 0) for (const q of sim.fish) { if (q === g || q.dead || (q.hidden && !q.crew) || q.brood === maw || (q.guest && !q.crew)) continue; fishPos(h, q, _w); if (hypot(_w.x - s.x, _w.z - s.z) < maw.neckLen * 0.5 + bodyLen(maw, q) * h.ks * 0.3) { hit = q; break; } }
      if (hit) { hit.full = Math.max(hit.full || 0, 1); maw.slowed.push({ o: hit, t: A.spit.slow }); note(maw, "spit", "The Maw spat on " + sim.speciesRT[hit.sp].name); }
      if (hit || s.t <= 0) maw.spits.splice(i, 1); }
    for (let i = maw.slowed.length - 1; i >= 0; i--) { const w = maw.slowed[i]; w.t -= dt; if (w.t <= 0 || w.o.dead) { maw.slowed.splice(i, 1); continue; } w.o.vx *= 1 - min(1, dt * 6); w.o.vy *= 1 - min(1, dt * 6); }
  }
  // what is under way, as lines in walker space: the lure's light, the puff's spines, the harpoon's line, the spit, an egg's mark, the brood
  function abilLines(maw, put, room, batch, o0) {
    const h = maw.host, b = maw.body, on = maw.on, hd = b.chunks[0].p, L = maw.neckLen, circ = (x, y, z, r, n, flat) => { room(n * 2); for (let i = 0; i < n; i++) { const a0 = i / n * TAU, a1 = (i + 1) / n * TAU;
      if (flat) { put(x + cos(a0) * r, y, z + sin(a0) * r); put(x + cos(a1) * r, y, z + sin(a1) * r); } else { put(x + cos(a0) * r, y + sin(a0) * r, z); put(x + cos(a1) * r, y + sin(a1) * r, z); } } };
    let start = o0();
    if (on.lure > 0) { const tip = { x: hd.x - b.hdir.x * L * 0.2, y: hd.y + L * 0.9, z: hd.z - b.hdir.z * L * 0.2 }; room(2); put(hd.x, hd.y + L * 0.2, hd.z); put(tip.x, tip.y, tip.z);
      const p = 0.18 + 0.05 * sin(maw.t * 6); circ(tip.x, tip.y, tip.z, L * p, 12, false); circ(tip.x, tip.y, tip.z, L * p, 12, true); }
    if (on.lure > 0) { batch(GOLD, start); start = o0(); }
    if (on.puff > 0) { const c = b.chunks[min(b.chunks.length - 1, maw.ia + 1)].p, r = L * 1.1, n = 18; room(n * 2); for (let i = 0; i < n; i++) { const a = i / n * TAU + maw.t; put(c.x + cos(a) * r * 0.7, c.y, c.z + sin(a) * r * 0.7); put(c.x + cos(a) * r * 1.15, c.y + L * 0.1, c.z + sin(a) * r * 1.15); }
      circ(c.x, c.y, c.z, r * 0.7, 24, true); batch(NOHIT, start); start = o0(); }
    if (on.tow && on.tow.o && !on.tow.o.dead) { fishPos(h, on.tow.o, _w); room(2); put(hd.x, hd.y, hd.z); put(_w.x, _w.y, _w.z); batch(on.tow.heavy ? NOHIT : HIT, start); start = o0(); }
    else if (on.line) { const a = maw.aimW, r = L * RULES.abil.harpoon.reach * (1 - on.line.t / 0.35); room(2); put(hd.x, hd.y, hd.z); put(hd.x + a.x * r, hd.y, hd.z + a.z * r); batch(CHARGE, start); start = o0(); }
    if (on.ride && !on.ride.dead) { fishPos(h, on.ride, _w); room(2); put(hd.x, hd.y, hd.z); put(_w.x, _w.y, _w.z); batch(GOLD, start); start = o0(); }
    for (const s of maw.spits) circ(s.x, s.y, s.z, L * 0.12, 8, true);
    if (maw.spits.length) { batch(HIT, start); start = o0(); }
    for (const q of maw.eggs) { if (q.dead) continue; fishPos(h, q, _w); const u = 1 - q.mawEgg / RULES.abil.infect.hatch; circ(_w.x, _w.y, _w.z, L * (0.35 + 0.1 * sin(maw.t * 4)), 10, true); circ(_w.x, _w.y, _w.z, L * 0.2 * u + 0.01, 6, true); }
    for (const q of maw.brood) { if (q.dead) continue; fishPos(h, q, _w); circ(_w.x, _w.y, _w.z, L * 0.3, 6, true); }
    if (maw.eggs.length || maw.brood.length) batch(GOLD, start);
  }
  // for the button and the chips: what is on it, what it can swap to, how long until it works
  function abilView(maw) {
    const k = maw.act, A = RULES.abil[k] || {}, on = maw.on;
    const cd = k === "sonar" ? max(0, maw.pingCool) / RULES.abil.sonar.cool : k && A.cool ? max(0, maw.cd[k] || 0) / A.cool : 0;
    const live = { cloak: !!on.cloak, lure: on.lure > 0, puff: on.puff > 0, harpoon: !!on.tow, hitch: !!on.ride, leap: !!on.leap, infect: !!on.infect }[k] || false;
    return { act: k, cd, on: live, owned: ACTIVE.filter((a) => maw.ab[a]), passive: ["eyes", "sting", "mimic"].filter((a) => maw.ab[a]), lives: maw.lives, eggs: maw.eggs.length, brood: maw.brood.filter((f) => !f.dead).length };
  }
  function equip(maw, k) { if (ACTIVE.includes(k) && maw.ab[k]) { maw.act = k; return true; } return false; }
  // ---- what a part does, in numbers: for the Mutate panel's before -> after ----
  const PART = { bulk: { speed: 0.08, grip: 0.5 }, wide: { mouth: 9 } };
  function stats(maw) {
    const neck = maw.neckLen || 1, reach = neck * (RULES.strike[0] + RULES.strike[1]), grown = maw.lv.reach + maw.lv.bulk + maw.lv.wide;
    return { reach, mouth: maw.RmaxT, speed: speedK(maw), grip: 1 + PART.bulk.grip * maw.lv.bulk, upkeep: 1 + RULES.upkeep * grown };
  }
  // the stats an offer would change: [{ key, label, from, to, good }]
  function preview(maw, o) {
    if (!o || o.abil || o.form) return []; const a = stats(maw), b = { ...a }, lv = maw.lv;
    if (o.redress) return [];
    if (o.kind === "reach") { const n = maw.rows.filter((r) => r.neck).length; b.reach = a.reach * (n + 2) / (n + 1); }   // one more neck row: the head and its rows share the throw
    if (o.kind === "bulk") { b.speed = a.speed * (1 + PART.bulk.speed * (lv.bulk + 1)) / (1 + PART.bulk.speed * lv.bulk); b.grip = 1 + PART.bulk.grip * (lv.bulk + 1); }
    if (o.kind === "wide") b.mouth = 50 + PART.wide.mouth * (lv.wide + 1);
    b.upkeep = a.upkeep + RULES.upkeep;
    const L = { reach: "Reach", mouth: "Mouth", speed: "Speed", grip: "Grip", upkeep: "Upkeep" };
    return Object.keys(L).filter((k) => Math.abs(b[k] - a[k]) > 1e-6).map((k) => ({ key: k, label: L[k], from: a[k], to: b[k], good: k === "upkeep" ? b[k] < a[k] : b[k] > a[k] }));
  }
  const kindOf = (move) => (move === "wing" ? "reach" : move === "leg" || move === "claw" ? "bulk" : "wide");
  const LABEL = { reach: "a longer neck", bulk: "a body row and two legs", wide: "tusks", eyes: "eyes that see further", sonar: "a sonar dish", swim: "the swimmer form", walk: "the walker form" };
  const ORGAN = { eyes: "P024", sonar: "P598", swim: "P578", walk: "P245" };
  // which abilities a meal can offer: by what its kind carries (the diet's trait), and a few by the kind itself
  const TRAIT_ABIL = { lure: ["eyes", "lure"], cloak: ["eyes", "cloak"], sting: ["sonar", "sting"], puff: ["sonar", "puff"], harpoon: ["harpoon"], hitch: ["hitch"], leap: ["leap"], shoal: ["mimic"] };
  const SP_ABIL = { "chain-colony": ["infect"], siphon: ["infect"], eel: ["spit"], serpent: ["spit"], hunter: ["brood"], dragon: ["brood"], "koi-winged-dragon-6cce": ["brood"] };
  const abilsOf = (don) => [...(TRAIT_ABIL[don.trait] || []), ...(SP_ABIL[don.key] || [])];
  const ABIL_MAX = (k) => (k === "eyes" ? RULES.abil.eyes.max : 1);
  Object.assign(LABEL, { cloak: "a cloak: still, hunters lose it", lure: "a lure on a stalk", puff: "a puffing sac", sting: "a sting", harpoon: "a harpoon line", hitch: "a hitching sucker",
    leap: "springing legs for a leap", infect: "an ovipositor: it lays in what it bites", brood: "a brood sac", mimic: "the look of what it ate", spit: "a spitting gland" });
  function give(maw, kind, don) {
    if (kind === "eyes" || kind === "sonar") {   // an organ: worn as a mirrored pair on the head (eyes) or the back (sonar), and its verb
      const n = ++maw.ab[kind], R = maw.rows, r = kind === "eyes" ? R[0] : (R.find((q) => !q.head && !q.neck && !q.legs && !q.tail) || R[0]);
      r.sides.push(kind === "eyes" ? { id: ORGAN.eyes, len: 16 + 5 * n, rise: 0.75, organ: kind } : { id: ORGAN.sonar, len: 26, rise: 0.95, organ: kind });
      note(maw, "graft", "The Maw grew " + LABEL[kind] + " from " + (don.name || "its meal")); if (kind === "sonar" && !maw.act) maw.act = "sonar"; if (maw.body) build(maw); return; }
    if (ABILS.includes(kind)) {   // the rest: worn as a mirrored pair of the donor's own part, on the row that does the work
      maw.ab[kind] = 1; const R = maw.rows, P = donorParts(maw, don.sheet), id = P.side || P.spine || ORGAN.sonar;
      const r = { lure: R[0], spit: R[0], mimic: R[0], harpoon: R[0], sting: R[R.length - 1], leap: R.find((q) => q.legs === "hind"), hitch: R.find((q) => q.legs === "front") }[kind] || R.find((q) => !q.head && !q.neck && !q.legs && !q.tail) || R[0];
      r.sides.push({ id, len: kind === "lure" ? 30 : 20, rise: kind === "lure" ? 1.2 : 0.85, organ: kind, own: null });
      if (ACTIVE.includes(kind) && !maw.act) maw.act = kind; if (kind === "mimic") mimicSet(maw);
      note(maw, "graft", "The Maw grew " + LABEL[kind] + " from " + (don.name || "its meal")); if (maw.body) build(maw); return; }
    const lv = maw.lv, R = maw.rows, col = don.col, P = donorParts(maw, don.sheet);
    const spineId = P.spine || { reach: "P594", bulk: "P259", wide: null }[kind], sideId = P.side || { reach: "P578", bulk: "P261", wide: "P028" }[kind], toothId = P.tooth || P.side || "P026";
    note(maw, "graft", "The Maw grew " + LABEL[kind] + " from " + (don.name || "its meal"));
    if (lv[kind] >= RULES.max) {          // full: the oldest of this kind is re-dressed from the new donor
      const old = maw.grown[kind].shift(); maw.grown[kind].push(old);
      if (kind === "wide") { for (const t of old) { t.id = toothId; t.own = col; t.grow = 0.4; } return; }
      if (spineId) old.id = spineId; old.own = col; if (sideId && old.sides[0]) old.sides[0].id = sideId;
    } else {
      const n = ++lv[kind];
      if (kind === "reach") {             // a longer neck, with the donor's blades on the new row
        const r = row(spineId, { wide: 38, own: col, neck: true, sides: sideId ? [{ id: sideId, len: [88, 66, 74][n - 1] }] : [] });
        R.splice(R.findIndex((q) => q.legs === "front"), 0, r); maw.grown.reach.push(r);
      } else if (kind === "bulk") {       // one more body row: a plate, its blades, and a leg pair
        const r = row(spineId, { long: 40, own: col, legs: "extra", sides: sideId ? [{ id: sideId, len: [66, 58, 62][n - 1] }] : [] });
        R.splice(R.findIndex((q) => q.legs === "hind"), 0, r); maw.grown.bulk.push(r);
      } else {                            // tusks on the odd rays of the mouth, and a wider mouth
        const set = []; for (let i = 0; i < 4; i++) { const t = { a: i / 4 * TAU + n * PI / 6 + PI / 4, id: toothId, len: 38 + 4 * n, own: col, grow: 0 }; maw.teeth.push(t); set.push(t); }
        maw.RmaxT = 50 + 9 * n; maw.grown.wide.push(set);
        if (n === 1 && P.side2) R[0].sides.push({ id: P.side2, len: 54, rise: 0.5 });
        if (n !== 1) return;
      }
    }
    if (maw.body) build(maw);
  }
  // ---- levels (after the maw-play branch): a meal is stocked and counts toward a level; at a level the person picks ONE part from what it has eaten ----
  const need = (maw) => RULES.level.base + RULES.level.grow * maw.lvls;
  function refreshOffer(maw) {
    if (!maw.owed) { maw.offer = null; return; }
    const seen = {}, out = [];
    { const to = maw.form === "walk" ? "swim" : "walk", fits = maw.stock.filter((q) => (to === "swim" ? q.don.move === "shoal" : q.don.move === "leg" || q.don.move === "claw"));   // metamorphosis
      if (fits.length >= RULES.form.need) { const last = fits[fits.length - 1]; out.push({ kind: to, don: last.don, label: LABEL[to], parts: { spine: ORGAN[to], side: null, tooth: ORGAN[to] }, redress: false, ref: last, refs: fits.slice(-RULES.form.need), form: true }); } }
    for (let i = maw.stock.length - 1; i >= 0; i--) { const q = maw.stock[i];   // abilities: what this meal's kind can teach, that it does not have yet
      for (const a of abilsOf(q.don)) { if (seen["ab" + a] || maw.ab[a] >= ABIL_MAX(a) || (a === "mimic" && (maw.eatenSp[q.don.key] || 0) < RULES.abil.mimic.need)) continue; seen["ab" + a] = 1;
        const P = donorParts(maw, q.don.sheet), org = ORGAN[a] || P.side || P.spine || ORGAN.sonar;
        out.push({ kind: a, don: q.don, label: LABEL[a], parts: { spine: org, side: null, tooth: org }, redress: false, ref: q, abil: true }); } }
    for (let i = maw.stock.length - 1; i >= 0 && out.length < RULES.level.offer; i--) { const q = maw.stock[i], key = q.kind + "|" + (q.don.name || ""); if (seen[key]) continue; seen[key] = 1;
      const P = donorParts(maw, q.don.sheet), parts = { spine: P.spine || { reach: "P594", bulk: "P259", wide: null }[q.kind], side: P.side || { reach: "P578", bulk: "P261", wide: "P028" }[q.kind], tooth: P.tooth || P.side || "P026" };
      out.push({ kind: q.kind, don: q.don, label: LABEL[q.kind], parts, redress: maw.lv[q.kind] >= RULES.max, ref: q }); }
    maw.offer = out.length ? out : null;
  }
  function eaten(maw, kind, don) {
    maw.stock.push({ kind, don }); while (maw.stock.length > RULES.level.stock) maw.stock.shift();
    maw.xp++;
    if (maw.xp >= need(maw)) { maw.xp -= need(maw); maw.lvls++; maw.owed++; note(maw, "level", "The Maw can mutate: choose one part"); }
    refreshOffer(maw);
    // the autopilot takes what the place asks for first (maw.wants: kinds, e.g. ["eyes", "swim"]), then grows parts
    if (maw.autoPick && maw.offer) { const W = maw.wants || [], w = maw.offer.findIndex((o) => W.includes(o.kind)), i = w >= 0 ? w : maw.offer.findIndex((o) => !o.abil && !o.form); choose(maw, i >= 0 ? i : 0); }
  }
  // a catch in the jaw: carried at the mouth while it thrashes (the tank's struggle shakes a swimmer; a walker's own legs flail)
  function holdAt(maw, o) {
    const h = maw.host; mouthAt(maw, _m); const t = maw.t * 1000, calm = o.struggleT0 ? 0.35 + 0.65 * max(0, o.struggleT / o.struggleT0) : 1;   // the shake dies down as it tires
    if (o.crew && o.crew.body) { const C = o.crew.body.chunks, mid = C[C.length >> 1].p, j = maw.Rmax * maw.U * 0.3 * calm;
      const dx = _m.x - mid.x + sin(t * 0.031) * j, dy = _m.y - mid.y + sin(t * 0.043) * j * 0.5, dz = _m.z - mid.z + cos(t * 0.027) * j;
      for (const c of C) { c.p.x += dx; c.p.y += dy; c.p.z += dz; c.prev.x += dx; c.prev.y += dy; c.prev.z += dz; } return; }
    if (!o.chain) return; const K = window.EcologySim.K, k = K >> 2; toTank(h, _m, _t);
    const jt = maw.Rmax * maw.U * 0.3 * calm / h.ks, dx = _t.x - o.chain[k * 2] + sin(t * 0.031) * jt, dy = _t.y - o.chain[k * 2 + 1] + cos(t * 0.027) * jt, dz = o.cz ? _t.z - o.cz[k] + sin(t * 0.043) * jt * 0.5 : 0;
    for (let i = 0; i < K; i++) { o.chain[i * 2] += dx; o.chain[i * 2 + 1] += dy; if (o.cz) o.cz[i] += dz; }
    o.x += dx; o.y += dy; if (o.cz) o.z = o.cz[0] / h.td; }
  // the person's pick: an option of maw.offer (by index); one part grows, that donor is spent, and the level with it
  function choose(maw, i) {
    const o = maw.offer && maw.offer[i]; if (!o || !maw.owed) return false;
    maw.owed--;
    if (o.form) { maw.finFrom = o.refs.map((q) => q.don.sheet); for (const q of o.refs) { const k = maw.stock.indexOf(q); if (k >= 0) maw.stock.splice(k, 1); } maw.cocoonTo = o.kind; maw.state = "cocoon"; maw.st = 0; maw.in.hold = false; note(maw, "cocoon", "The Maw cocoons"); refreshOffer(maw); return true; }
    maw.stock.splice(maw.stock.indexOf(o.ref), 1); give(maw, o.kind, o.don); refreshOffer(maw); return true;
  }
  // a stage's starting kit: organs it already wears and the form it is in (a swimmer finishes an instant cocoon on its next step)
  function kit(maw, k) {
    if (!k || !maw.guest) return; const don = { name: "its brood", col: null };
    for (let i = 0; i < (k.eyes || 0); i++) if (maw.ab.eyes < RULES.abil.eyes.max) give(maw, "eyes", don);
    if (k.sonar && !maw.ab.sonar) give(maw, "sonar", don);
    for (const a of k.abil || []) if (!maw.ab[a]) give(maw, a, don);
    if (k.act) equip(maw, k.act);
    if (k.form && k.form !== maw.form) { maw.cocoonTo = k.form; maw.state = "cocoon"; maw.st = RULES.form.cocoon; }
    refreshOffer(maw);
  }
  // the body plan as cells, head to tail, and the mouth ring: for the compose panel
  function plan(maw) {
    const out = maw.rows.map((r) => ({ id: r.id, side: r.sides[0] ? r.sides[0].id : null, role: r.head ? "head" : r.neck ? "neck" : r.tail ? "tail" : r.legs === "front" ? "shoulders" : r.legs === "hind" ? "haunch" : r.legs === "extra" ? "bulk" : "back",
      grown: maw.grown.reach.includes(r) ? "reach" : maw.grown.bulk.includes(r) ? "bulk" : null }));
    out.push({ id: (maw.teeth.find((t) => t.own !== undefined && maw.grown.wide.some((set) => set.includes(t))) || maw.teeth[0]).id, role: "mouth", grown: maw.lv.wide ? "wide" : null, n: maw.teeth.length });
    return out;
  }
  // starved a tier: the newest thing it grew goes
  function shed(maw) {
    const order = ["reach", "bulk", "wide"].filter((k) => maw.lv[k] > 0); if (!order.length) return;
    const kind = order.sort((a, b) => maw.lv[b] - maw.lv[a])[0], last = maw.grown[kind].pop(); maw.lv[kind]--;
    if (kind === "wide") { maw.teeth = maw.teeth.filter((t) => !last.includes(t)); maw.RmaxT = 50 + 9 * maw.lv.wide; if (!maw.lv.wide) maw.rows[0].sides.length = 0; }
    else maw.rows.splice(maw.rows.indexOf(last), 1);
    note(maw, "shed", "The Maw shed " + LABEL[kind]);
    if (maw.body) build(maw);
  }
  function note(maw, kind, text) { const d = maw.diet; if (d && d.events) { d.events.push({ kind, f: maw.guest, text, t: d.t }); if (d.events.length > 40) d.events.shift(); } }

  // ---- its creature in the tank ----
  function attach(maw, o) {
    detach(maw); reset(maw);
    const host = o.walkers, sim = o.sim; if (!host || !host.W || !maw.KitLook) return null;
    const g = window.EcologySim.add(sim, "pincer") || window.EcologySim.add(sim, sim.speciesRT[0].key); if (!g) return null;
    g.guest = false; g.hidden = true; g.maw = true; g.fade = 1; g.darkRoll = 1;      // not a guest: the diet's rules are for it too
    if (!g.diet && sim.hooks.onSpawn) sim.hooks.onSpawn(g);
    if (g.diet) { g.diet.gut = []; g.diet.traits = []; g.diet.offers = null; g.diet.wait = 0; }   // it starts empty
    Object.assign(maw, { sim, diet: o.diet, host, guest: g, tier: g.diet ? g.diet.tier : null, U: U0 * (1 + RULES.grow * (g.diet ? g.diet.tier : 0)) });
    const rnd = window.WorldGen.rng(((sim.cfg && sim.cfg.seed) | 0) * 13 + 7), at = host.W.nav.random(rnd);
    build(maw, { x: at[0], z: at[1], yaw: rnd() * TAU });
    weigh(maw);
    const H = sim.hooks, was = (maw.was = { eats: H.eats, fears: H.fears, onMeal: H.onMeal, onCatch: H.onCatch, lowland: H.lowland }); H.lowland = RULES.lowland;
    // RULES.feared: what could be its food runs from it, as from any hunter of that weight, unless it is unseen (cloak, puff, mimic) or keeping still
    H.fears = (a, h) => (h === maw.guest ? RULES.feared && !unseen(maw, a) && !quiet(maw) && !!was.fears && was.fears(a, h) : was.fears ? was.fears(a, h) : false);   // part of the tank lives near the floor, where it can be reached
    H.eats = (a, q) => (a === maw.guest ? false : q === maw.guest && (a.brood === maw || unseen(maw, a)) ? false : was.eats ? was.eats(a, q) : undefined);   // its creature does not bite: the head does (strike); cloaked, puffed or mimicking, hunters pass it by
    H.onMeal = (pred, prey) => { if (was.onMeal) was.onMeal(pred, prey); if (pred === maw.guest) ate(maw, prey); else if (pred.brood === maw) broodFed(maw, pred, prey); };
    H.onCatch = (a, q) => { if (q === maw.guest && maw.on.puff > 0) return false;   // swollen: it will not go down
      if (q === maw.guest && maw.ab.sting) { a.full = Math.max(a.full || 0, RULES.abil.sting.stun); a.ignore = q; a.ignoreT = 4; a.target = null; note(maw, "sting", "The Maw stung " + sim.speciesRT[a.sp].name); return false; }
      return was.onCatch ? was.onCatch(a, q) : true; };
    pin(maw, 0);
    return g;
  }
  function detach(maw) {
    if (!maw.guest) return; const H = maw.sim.hooks, g = maw.guest;
    if (maw.was) { H.eats = maw.was.eats; H.fears = maw.was.fears; H.onMeal = maw.was.onMeal; H.onCatch = maw.was.onCatch; H.lowland = maw.was.lowland; }
    abilClear(maw);
    if (!g.dead) { g.dead = true; g.noRespawn = true; if (g.caught) { g.caught.holding = null; g.caught = null; } }
    if (maw.look) maw.look.dispose();
    Object.assign(maw, { guest: null, body: null, look: null, def: null, was: null });
  }
  // whose legs it walks on: a key of SpeciesRig.PLANS that names its legs (the game sets this when it eats a walker); the body is rebuilt on them
  function legsFrom(maw, key) { maw.legFrom = key; if (maw.body && maw.form === "walk") build(maw); return legPlan(maw).key; }
  function relayout(maw) { if (!maw.guest || !maw.host.W) return; const g = maw.guest, h = maw.host; fishPos(h, g, _w); maw.body = null; build(maw, { x: _w.x, z: _w.z, yaw: 0 }); }

  const bodyLen = (maw, f) => window.EcologySim.bodyLen(maw.sim, f);
  const mouthR = (maw) => maw.Rmax * maw.U / maw.host.ks;                         // the open mouth's radius, in tank units
  const fits = (maw, o) => bodyLen(maw, o) <= 2 * mouthR(maw) * RULES.gate;
  // may the Maw eat o: the diet's rules for a creature played by hand, its own creature's kind included, and only what the mouth takes in
  function edible(maw, o) {
    const f = maw.guest; if (!f || !o || o === f || o.dead || o.caught || (o.guest && !o.crew) || !o.diet || o.brood === maw) return false;
    const web = maw.sim.web;
    if (o.crew) return (!web || !maw.diet || maw.diet.web !== "body" || web.eats(f, o)) && fits(maw, o);   // the floor crew walk where the Maw walks: what the web gives it of them, and that fits its mouth
    const H = maw.sim.hooks, r = maw.was && maw.was.eats ? maw.was.eats(f, o) : true;
    if (r === false && (web && maw.diet && maw.diet.web === "body" || !(o.sp === f.sp && (!H.canEat || H.canEat(f, o))))) return false;   // with the web, its body has the last word (it is its own kind: the creature it rides is not); without, its creature's own kind is food too
    return fits(maw, o);
  }
  function swallow(maw, o) {
    const f = maw.guest, sim = maw.sim, H = sim.hooks;
    if (maw.on.infect) {   // it lays instead: the host lives on, marked, and hatches a spare Maw later
      maw.on.infect = false; maw.cd.infect = RULES.abil.infect.cool; o.mawEgg = RULES.abil.infect.hatch; o.alarm = 1; maw.eggs.push(o);
      note(maw, "infect", "The Maw laid in " + sim.speciesRT[o.sp].name); return "infect"; }
    if (H.onCatch && H.onCatch(f, o) === false) return false;        // stung
    // held in the jaw: it struggles for RULES.struggle seconds (the tank's own struggle, without the chance to twist free), then the tank's finishCatch
    // kills it and calls onMeal, which is the Maw's ate(). Pinned to the mouth meanwhile (holdAt)
    if (window.EcologySim.grab(sim, f, o)) { o.escMul = 0; o.struggleT = o.struggleT0 = RULES.struggle; o.tryT = -1e9; maw.held = o; maw.state = "hold"; maw.st = 0; return true; }
    o.dead = true; if (o.holding) { o.holding.caught = null; o.holding = null; }
    f.gulp = 1; f.full = 0; f.meals = (f.meals || 0) + 1; if (sim.tally) { sim.tally[f.sp].eaten++; sim.tally[o.sp].lost++; }
    if (H.onMeal) H.onMeal(f, o);                                    // the diet's meal, then ate() below
    return true;
  }
  const donOf = (maw, sp) => { const name = maw.sim.speciesRT[sp].name, tag = maw.diet && maw.diet.tag ? maw.diet.tag[sp] : { move: "shoal" }; return { kind: kindOf(tag.move), don: { sheet: maw.sheetOf(name), col: null, name, key: maw.sim.speciesRT[sp].key, trait: tag.trait || null, move: tag.move } }; };   /* grafted parts take the Maw's own ink (null = its colour), not the donor's: it is one body */
  function ate(maw, prey) { maw.bolus.push({ t: 0, ...donOf(maw, prey.sp) }); maw.state = "chew"; maw.st = 0; const k = maw.sim.speciesRT[prey.sp].key;
    maw.eatenSp[k] = (maw.eatenSp[k] || 0) + 1; mimicSet(maw);
    // a walker with legs of its own: the Maw walks on its legs from now on (SpeciesRig's plan for that kind)
    const sh = maw.sheetOf(maw.sim.speciesRT[prey.sp].name), P = plans(), hit = Object.keys(P).find((pk) => P[pk].sheet === sh && P[pk].legs && P[pk].legs.length);
    if (hit && hit !== legPlan(maw).key) { maw.legFrom = hit; note(maw, "graft", "The Maw walks on " + (maw.sim.speciesRT[prey.sp].name) + " legs"); if (maw.body && maw.form === "walk") build(maw); } }
  function feed(maw, sp) { if (maw.sim) maw.bolus.push({ t: 0, ...donOf(maw, sp) }); }
  function input(maw, i) { if (maw.posed) { maw.in.move = null; maw.in.hold = false; return; } const I = maw.in; if (i.hold != null) I.hold = !!i.hold; for (const k of ["move", "aim"]) if (k in i) { const v = i[k], l = v ? hypot(v[0], v[1]) : 0; I[k] = l > 1e-9 ? [v[0] / l, v[1] / l] : null; } }

  // its creature stands where the head is, so the tank's rules meet it there
  function pin(maw, dt) {
    const g = maw.guest, h = maw.host, body = maw.body, K = window.EcologySim.K, hd = body.chunks[0].p;
    if (g.caught) {   // a hunter has it: the body goes where its jaws go
      g.z += (g.caught.z - g.z) * min(1, dt * 1.5); fishPos(h, g, _w); const dx = _w.x - hd.x, dy = _w.y - hd.y, dz = _w.z - hd.z;
      for (const c of body.chunks) { c.p.x += dx; c.p.y += dy; c.p.z += dz; c.prev.x += dx; c.prev.y += dy; c.prev.z += dz; }
      return; }
    toTank(h, hd, _t); g.x = _t.x; g.y = _t.y; g.z = clamp(_t.z / h.td, 0.02, FLOOR); g.vx = g.vy = 0; g.fade = 1; g.full = 5; g.target = null; g.steer = null;
    g.ang = atan2(body.hdir.z, body.hdir.x);
    if (g.chain) for (let k = 0; k < K; k++) { g.chain[k * 2] = g.x; g.chain[k * 2 + 1] = g.y; if (g.cz) g.cz[k] = g.z * h.td; }
  }

  // ---- the neck: the head and neck chunks have no feet under them. They are held up and aimed by pushes, and thrown along the strike ----
  // where the head rests: out from the shoulders along dir (a unit vector), raised
  function restHead(maw, dir, out) {
    const b = maw.body, sh = b.chunks[maw.ia], n = sh.n, L = maw.neckLen, N = RULES.neck, up = L * (N.rear + N.coilRear * (maw.state === "coil" ? maw.charge : 0));
    out.x = sh.p.x + dir.x * L * 0.94 + n.x * up; out.y = sh.p.y + dir.y * L * 0.94 + n.y * up; out.z = sh.p.z + dir.z * L * 0.94 + n.z * up; return out;
  }
  let _va = null, _vc = null, _vd = null;
  const _P = { x: 0, y: 0, z: 0 }, _sum = { x: 0, y: 0, z: 0 }, _dir = { x: 0, y: 0, z: 1 }, _rh = { x: 0, y: 0, z: 0 }, _hp = { x: 0, y: 0, z: 0 }, _imp = { x: 0, y: 0, z: 0 };
  function neck(maw, h) {
    const b = maw.body, C = b.chunks, ia = maw.ia, sh = C[ia], n = sh.n, L = maw.neckLen;
    // which way the neck points: the body's own line, or the aim while coiled and striking (kept in the surface it stands on)
    // the body is steered by its head: the neck points along the heading the person gave (b.hdir), so the shoulders' legs drive that way and the rest follows
    let dx = b.hdir.x, dy = b.hdir.y, dz = b.hdir.z;
    const lim = (x, y, z) => {   // the neck turns no further than 50 degrees off the torso's own line: past that the body must turn
      const bk = C[min(C.length - 1, ia + 1)], tx = sh.p.x - bk.p.x, ty = sh.p.y - bk.p.y, tz = sh.p.z - bk.p.z, tl = hypot(tx, ty, tz) || 1, l = hypot(x, y, z) || 1;
      const ux = tx / tl, uy = ty / tl, uz = tz / tl, c = (x * ux + y * uy + z * uz) / l, C0 = 0.64; if (c >= C0) return [x, y, z];
      let px = x / l - ux * c, py = y / l - uy * c, pz = z / l - uz * c; const pl = hypot(px, py, pz); if (pl < 1e-6) { px = n.y * uz - n.z * uy; py = n.z * ux - n.x * uz; pz = n.x * uy - n.y * ux; } else { px /= pl; py /= pl; pz /= pl; }
      const sn = sqrt(1 - C0 * C0); return [ux * C0 + px * sn, uy * C0 + py * sn, uz * C0 + pz * sn]; };
    if (maw.aimW && (maw.state === "coil" || maw.ext > 0)) { const a = maw.aimW, dn = a.x * n.x + a.z * n.z; const ax = a.x - n.x * dn, ay = -n.y * dn, az = a.z - n.z * dn; if (hypot(ax, ay, az) > 0.2) { dx = ax; dy = ay; dz = az; } }
    [dx, dy, dz] = lim(dx, dy, dz);
    const dl = hypot(dx, dy, dz) || 1; _dir.x = dx / dl; _dir.y = dy / dl; _dir.z = dz / dl;
    restHead(maw, _dir, _rh);
    // the neck is a limb of the body that the person aims, not a thing the body's legs must hold up: its pieces stand flat in the shoulders' surface,
    // so the body's own frames (which tell it where it climbs) do not tilt; the lift that raises the head is added to what is drawn afterwards (see lift)
    const lift = maw.lift || (maw.lift = []);
    const put = (i, x, y, z) => { const c = C[i], dx = x - sh.p.x, dy = y - sh.p.y, dz = z - sh.p.z, up = dx * n.x + dy * n.y + dz * n.z;
      c.p.set(x - n.x * up, y - n.y * up, z - n.z * up); c.prev.set(c.p.x - (sh.p.x - sh.prev.x), c.p.y - (sh.p.y - sh.prev.y), c.p.z - (sh.p.z - sh.prev.z)); lift[i] = up; };   // it travels as the shoulders do
    if (maw.ext > 0 && maw.strikeTo) {   // struck out: the head is carried along the line to where it strikes, the neck spans from it to the shoulders
      const k = maw.ext / maw.reachMax, T = maw.strikeTo; _hp.x = lerp(_rh.x, T.x, k); _hp.y = lerp(_rh.y, T.y, k); _hp.z = lerp(_rh.z, T.z, k);
      const sx = _dir.z * n.y - _dir.y * n.z, sz = _dir.x * n.y - _dir.y * n.x, bow = RULES.neck.whip * L * (1 - k * 0.6) * (maw.bendSide || 1);   // a strike bows to one side, most at the start of the throw
      for (let i = 0; i < ia; i++) { const t = i / ia, w = sin(PI * t) * bow; put(i, lerp(_hp.x, sh.p.x, t) + sx * w, lerp(_hp.y, sh.p.y, t), lerp(_hp.z, sh.p.z, t) - sz * w); }
      for (let i = 0; i < ia; i++) b.rest[i] = hypot(C[i].p.x - C[i + 1].p.x, C[i].p.y - C[i + 1].p.y, C[i].p.z - C[i + 1].p.z);
      maw.nd = null; maw.segD = null; return;
    }
    // at rest it is set out along a direction that eases toward where it should point (its own rest lengths, a little arch)
    let tx = _rh.x - sh.p.x, ty = _rh.y - sh.p.y, tz = _rh.z - sh.p.z; const tl = hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    const nd = maw.nd || (maw.nd = { x: tx, y: ty, z: tz }), k = min(1, h * (maw.state === "coil" ? 7 : 4.5));
    nd.x += (tx - nd.x) * k; nd.y += (ty - nd.y) * k; nd.z += (tz - nd.z) * k; const nl = hypot(nd.x, nd.y, nd.z) || 1; nd.x /= nl; nd.y /= nl; nd.z /= nl;
    { const up = nd.x * n.x + nd.y * n.y + nd.z * n.z, hor = sqrt(max(0.04, 1 - up * up)); for (let i = 0; i < ia; i++) b.rest[i] = b.rest0[i] * hor; }   // flat in the shoulders' surface the pieces lie closer: the body's own rest lengths follow
    let dist = 0; const D = []; for (let i = ia - 1; i >= 0; i--) { dist += b.rest0[i]; D[i] = dist; }
    // not a rod: each piece of the neck has its own heading. The head's piece turns first and quickest, the ones toward the shoulders follow
    // later and only part of the way (flex), so a turn bends the neck into a curve; and a slow S-wave runs down it while it waits (sway)
    const N = RULES.neck, bk = C[min(C.length - 1, ia + 1)].p; let bx = sh.p.x - bk.x, by = sh.p.y - bk.y, bz = sh.p.z - bk.z; { const l = hypot(bx, by, bz) || 1; bx /= l; by /= l; bz /= l; }
    const sd = maw.segD || (maw.segD = []); maw.neckT = (maw.neckT || 0) + h; const calm = maw.state === "coil" ? 0.35 : maw.state === "hold" ? 0.6 : 1;
    let px = sh.p.x, py = sh.p.y, pz = sh.p.z;
    for (let i = ia - 1; i >= 0; i--) { const f = ia > 1 ? 1 - i / (ia - 1) : 1;   // f: 0 at the piece by the shoulders, 1 at the head
      const w = 1 - N.flex * (1 - f);                                                              // how far this piece turns toward the head's heading
      let qx = bx + (nd.x - bx) * w, qy = by + (nd.y - by) * w, qz = bz + (nd.z - bz) * w; { const l = hypot(qx, qy, qz) || 1; qx /= l; qy /= l; qz /= l; }
      const a = N.sway * calm * (0.35 + 0.65 * f) * sin(maw.neckT * N.swayHz * TAU - f * 2.6), ca = cos(a), sa = sin(a);   // the wave, about the shoulders' up
      const kx = n.y * qz - n.z * qy, ky = n.z * qx - n.x * qz, kz = n.x * qy - n.y * qx; qx = qx * ca + kx * sa; qy = qy * ca + ky * sa; qz = qz * ca + kz * sa;
      const d = sd[i] || (sd[i] = { x: qx, y: qy, z: qz }), ke = min(1, h * (maw.state === "coil" ? 7 : 4.5) * (0.35 + 0.65 * f));   // the head's piece eases quickest
      d.x += (qx - d.x) * ke; d.y += (qy - d.y) * ke; d.z += (qz - d.z) * ke; { const l = hypot(d.x, d.y, d.z) || 1; d.x /= l; d.y /= l; d.z /= l; }
      px += d.x * b.rest0[i]; py += d.y * b.rest0[i]; pz += d.z * b.rest0[i];
      const arch = sin(PI * D[i] / L) * 0.08 * L; put(i, px + n.x * arch, py + n.y * arch, pz + n.z * arch); }
    for (let i = 0; i < ia; i++) b.rest[i] = hypot(C[i].p.x - C[i + 1].p.x, C[i].p.y - C[i + 1].p.y, C[i].p.z - C[i + 1].p.z);   // the body's rest lengths are the curve's own, so it pulls nothing
  }
  // after the body's step: raise the neck's pieces by their lift for the drawing, then put them back
  function showLift(maw) {
    const b = maw.body, C = b.chunks, ia = maw.ia, n = C[ia].n, lift = maw.lift || [], was = [];
    for (let i = 0; i < ia; i++) { const c = C[i], u = lift[i] || 0; was.push(c.p.x, c.p.y, c.p.z); c.p.x += n.x * u; c.p.y += n.y * u; c.p.z += n.z * u; }
    b.frames(); b.write(); maw.look.update(b.skel);
    for (let i = 0; i < ia; i++) C[i].p.set(was[i * 3], was[i * 3 + 1], was[i * 3 + 2]);
  }
  // the torso (shoulders back to the tail). Three pushes a tick, each paired so the body gains no momentum from itself:
  //   go      its gripping pieces are pushed toward the velocity the person asked for, whichever way it faces (it sidesteps and backs up; the feet step to follow)
  //   line    a spine: each piece is pulled toward the middle of its neighbours, so the body does not fold (the physics body only resists sagging)
  //   face    the torso is twisted about its middle toward the heading
  // Walking free on the level (the person steering, not coiled) the spine is let go: it keeps 'loose' of its straightening and none of its twist, so
  // the head leads and the body follows its path, and a wave runs down it from the shoulders to the tail (wave: how hard, as a share of its pace;
  // per: how far along the body one wave reaches, in pieces), as the Centiwyrm and the qilin walked. Standing, coiling and climbing keep it stiff, for the aim
  const TORSO = { go: 14, line: 420, lineD: 30, face: 60, faceD: 9, loose: 0.1, wave: 10, per: 3.2, bend: 0.04, curl: 0.3, turnTo: 1.5 };   // bend 0.04, curl 0.3: at rest a 75° sweep from shoulders to tail, no joint over 30° (0.06 and 0.5 hooked the tail, 152°)
  // bend: the body bends along a curve, not a straight stack (how far each piece sits beside its neighbours' middle, as a share of the gap to them);
  // curl: more of it toward the tail, so the tail curls (rising with the square of the way along). The side it bends to follows the way it last turned
  // (turnTo: how fast it swings over, per second). Off while posed (Mutate) and mid-lunge, when the body is laid out or thrown
  function torso(maw, h, want, free, gain) {
    const b = maw.body, C = b.chunks, ia = maw.ia, N = C.length, K = window.CreatureBody.K, LN = free ? TORSO.line * TORSO.loose : TORSO.line, FC = free ? 0 : TORSO.face;
    if (want) for (let i = ia; i < N; i++) { const c = C[i], nm = c.n; if (!nm || !isFinite(c.grip) || !isFinite(nm.x + nm.y + nm.z)) continue; const grip = maw.form === "swim" ? 0.8 : c.grip, wgt = (gain || 1) * (free ? 1 - (1 - RULES.walk.tail) * (i - ia) / max(1, N - 1 - ia) : 1), g = grip * K.drive * (1 + K.climb * b.cling) * h * wgt, wn = want.x * nm.x + want.z * nm.z, v = b.vel(c, _vc), vn = v.x * nm.x + v.y * nm.y + v.z * nm.z;
      let wx = want.x - nm.x * wn, wy = -nm.y * wn, wz = want.z - nm.z * wn;
      if (nm.y < 0.95) { const ux = -nm.x * nm.y, uy = 1 - nm.y * nm.y, uz = -nm.z * nm.y, ul = hypot(ux, uy, uz) || 1; wx -= ux / ul * wn; wy -= uy / ul * wn; wz -= uz / ul * wn; }   /* sent into a wall, it goes up it; sent away from it, down it */
      const q = TORSO.go * (0.3 + 0.7 * grip) * h * wgt;   /* a swimmer pushes on the water: it grips nothing */   // and a sharper pull of its own, so a new heading is taken up in a quarter second, not a whole one
      _imp.x = wx * g + (wx - (v.x - nm.x * vn)) * q; _imp.y = wy * g + (wy - (v.y - nm.y * vn)) * q; _imp.z = wz * g + (wz - (v.z - nm.z * vn)) * q; b.poke(i, _imp); }
    const bendOn = !maw.posed && maw.state !== "lunge", side = maw.bendSide || (maw.bendSide = 1), M2 = max(1, N - 1 - ia);
    for (let i = ia + 1; i + 1 < N; i++) { const a = C[i - 1], c = C[i], d = C[i + 1], va = b.vel(a, _va), vc = b.vel(c, _vc), vd = b.vel(d, _vd);
      let ex = (a.p.x + d.p.x) / 2 - c.p.x, ey = (a.p.y + d.p.y) / 2 - c.p.y, ez = (a.p.z + d.p.z) / 2 - c.p.z;
      if (bendOn) { const nm = c.n || { x: 0, y: 1, z: 0 }, dx = d.p.x - a.p.x, dy = d.p.y - a.p.y, dz = d.p.z - a.p.z, dl = hypot(dx, dy, dz) || 1, u = (i - ia) / M2;
        let qx = nm.y * dz - nm.z * dy, qy = nm.z * dx - nm.x * dz, qz = nm.x * dy - nm.y * dx; const ql = hypot(qx, qy, qz) || 1;   // the piece's side, in its surface
        const off = side * (TORSO.bend + TORSO.curl * u * u) * dl * 0.5 / ql; ex += qx * off; ey += qy * off; ez += qz * off; }
      _imp.x = (LN * ex + TORSO.lineD * ((va.x + vd.x) / 2 - vc.x)) * h; _imp.y = (LN * ey + TORSO.lineD * ((va.y + vd.y) / 2 - vc.y)) * h; _imp.z = (LN * ez + TORSO.lineD * ((va.z + vd.z) / 2 - vc.z)) * h;
      b.poke(i, _imp); _imp.x *= -0.5; _imp.y *= -0.5; _imp.z *= -0.5; b.poke(i - 1, _imp); b.poke(i + 1, _imp); }
    { const f = C[ia], r = C[N - 1], nm = f.n, hd = b.hdir; let tx = f.p.x - r.p.x, ty = f.p.y - r.p.y, tz = f.p.z - r.p.z; const tl = hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      const sx = nm.y * tz - nm.z * ty, sy = nm.z * tx - nm.x * tz, sz = nm.x * ty - nm.y * tx;      // the torso's side, in its surface
      const cs = tx * hd.x + ty * hd.y + tz * hd.z, sn = hd.x * sx + hd.y * sy + hd.z * sz, ang = atan2(sn, cs);     // how far the heading is round from where the torso points
      if (abs(ang) > 0.25) maw.bendSide = clamp((maw.bendSide || 1) + Math.sign(ang) * TORSO.turnTo * h, -1, 1);   // it bends the way it turns, and the tail curls after
      const vf = b.vel(f, _va), vr = b.vel(r, _vd), w = ((vf.x - vr.x) * sx + (vf.y - vr.y) * sy + (vf.z - vr.z) * sz) / tl, k = (FC * ang - TORSO.faceD * (free ? 0.3 : 1) * w) * tl * 0.5 * h;
      _imp.x = sx * k; _imp.y = sy * k; _imp.z = sz * k; b.poke(ia, _imp); _imp.x = -_imp.x; _imp.y = -_imp.y; _imp.z = -_imp.z; b.poke(N - 1, _imp);
      // the walking wave: a sideways push on each piece behind the shoulders, its phase running back down the body as it walks, growing toward the tail
      if (free) { let pace = 0; for (let i = ia; i < N; i++) { const v = b.vel(C[i], _vc); pace += hypot(v.x, v.z); } pace /= (N - ia);
        const amp = TORSO.wave * min(1, pace / max(1e-3, b.def.speed * 0.6)) * h, M = max(1, N - 1 - ia);
        for (let i = ia + 1; i < N; i++) { const u = (i - ia) / M, f2 = amp * (0.25 + 0.75 * u) * sin(maw.wph - (i - ia) * TAU / TORSO.per) * tl * 0.3; _imp.x = sx * f2; _imp.y = sy * f2; _imp.z = sz * f2; b.poke(i, _imp); } } }
  }
  // ---- finding the prey: the nearest edible thing in front, in the cone, that the neck can reach. Up counts less than along (rise): the neck rears,
  // and where the prey is going counts (lead): the head is thrown at where it will be ----
  const leadPos = (h, q, w) => { if (q.crew) return w; w.x += (q.vx || 0) * h.ks * RULES.lead; w.z += (q.vy || 0) * h.ks * RULES.lead; return w; };
  // a creature's body is a chain of points trailing its head: k = 0 is the head. In walker space.
  const chainAt = (h, q, k, out) => { out.x = (q.chain[k * 2] - h.tw / 2) * h.ks; out.z = (q.chain[k * 2 + 1] - h.th / 2) * h.ks; out.y = (FLOOR * h.td - q.cz[k]) * h.ks; return out; };
  const _c = { x: 0, y: 0, z: 0 }, _s = { x: 0, y: 0, z: 0 };
  // what the strike goes for: the middle of the body, moved on by where it is swimming
  // a body's points: a swimmer's chain, or, for one of the floor crew, the walker body that is drawn (its tank creature is only a stand-in at its head)
  const nPts = (q) => q.crew && q.crew.body ? q.crew.body.chunks.length : window.EcologySim.K;
  const ptAt = (h, q, k, out) => { if (q.crew && q.crew.body) { const p = q.crew.body.chunks[k].p; out.x = p.x; out.y = p.y; out.z = p.z; return out; } return chainAt(h, q, k, out); };
  const preyAt = (h, q, out) => leadPos(h, q, ptAt(h, q, nPts(q) >> 1, out));
  // the strike is tested the way a top-down game tests a skillshot (League of Legends' line missiles against a unit's gameplay radius): on the ground plane,
  // a capsule swept by the open jaw from A (where the throw began) to B (where the jaw is), against each point of the prey's body with a radius of its own.
  // Height is not part of the hit, since from the camera a gap in height reads as overlap; it only decides whether the neck can get up there at all.
  // > 0: out of reach by that much, in tank units
  const jawW = (maw) => maw.Rmax * maw.U;                                                     // the capsule's half-width: the open mouth
  function missBy(maw, h, q, A, B, extra) {
    B = B || A; const K = window.EcologySim.K, ex = B.x - A.x, ez = B.z - A.z, el = ex * ex + ez * ez, sh = maw.body.chunks[maw.ia].p;
    const vmax = maw.neckLen * (1 + RULES.strike[0] + RULES.strike[1]) * RULES.rise; let d = 1e9;
    for (let k = 0, n = nPts(q); k < n; k++) { ptAt(h, q, k, _c); if (_c.y - sh.y > vmax) continue;
      const t = el > 1e-9 ? clamp(((_c.x - A.x) * ex + (_c.z - A.z) * ez) / el, 0, 1) : 0, e = hypot(_c.x - A.x - ex * t, _c.z - A.z - ez * t); if (e < d) d = e; }
    return d - (jawW(maw) * (1 + (extra || 0)) + max(0.12, window.EcologySim.bodyLen(maw.sim, q) * h.ks * 0.15)); }
  // which creature the strike goes for. As in Arkham's freeflow and God of War's target selection: every edible creature in the cone is scored by how far it is
  // (as a share of the reach) and how far off the aim it lies, and the best score wins; the one already locked keeps a head start (stick), so the lock does not flicker
  function lockOn(maw, h, reach, aimA) {
    const sh = maw.body.chunks[maw.ia].p, lim = maw.neckLen + reach + maw.Rmax * maw.U; let best = null, bs = 1e9, near = null, nd = 1e9;
    for (const q of maw.sim.fish) { if (!edible(maw, q)) continue; preyAt(h, q, _w);
      const hz = hypot(_w.x - sh.x, _w.z - sh.z), dist = hypot(hz, (_w.y - sh.y) / RULES.rise), off = hz > 0.4 ? abs(wrap(atan2(_w.z - sh.z, _w.x - sh.x) - aimA)) : 0;
      if (off > RULES.cone) continue;
      if (dist < nd) { nd = dist; near = q; } if (dist > lim) continue;
      const sc = dist / lim + RULES.angW * off / RULES.cone - (q === maw.lock ? RULES.stick : 0); if (sc < bs) { bs = sc; best = q; } }
    // a creature in front that it may not eat (too big, or not on its menu) is marked red too, so what looks like a target is not mistaken for one
    maw.refuseQ = null; if (!best) { let rd = 1e9; for (const q of maw.sim.fish) { if (q === maw.guest || q.dead || q.guest || q.hidden || !q.diet || edible(maw, q)) continue; preyAt(h, q, _w); const hz = hypot(_w.x - sh.x, _w.z - sh.z), dist = hypot(hz, (_w.y - sh.y) / RULES.rise); if (dist > lim || dist >= rd) continue; if (hz > 0.4 && abs(wrap(atan2(_w.z - sh.z, _w.x - sh.x) - aimA)) > RULES.cone) continue; rd = dist; maw.refuseQ = q; } }
    maw.nearOut = best ? null : near; return best; }
  // where the head goes to take q: along the line from its rest to q's middle, as far as the reach allows (up is easier than along), stopping short by the head's own length;
  // .hit: whether the open mouth, there, touches q's body
  const _M = { x: 0, y: 0, z: 0 }, _A = { x: 0, y: 0, z: 0 };
  function strikeAt(maw, h, q, reach) {
    preyAt(h, q, _w); const dx = _w.x - _rh.x, dy = _w.y - _rh.y, dz = _w.z - _rh.z, dl3 = hypot(dx, dy, dz) || 1, dl = hypot(dx, dy / RULES.rise, dz) || 1, k = min(1, reach / dl), mo = maw.def.segs[0].half * 1.3;
    const T = { x: _rh.x + dx * k - dx / dl3 * mo, y: _rh.y + dy * k - dy / dl3 * mo, z: _rh.z + dz * k - dz / dl3 * mo };
    _M.x = T.x + dx / dl3 * mo; _M.y = T.y + dy / dl3 * mo; _M.z = T.z + dz / dl3 * mo; T.hit = missBy(maw, h, q, mouthAt(maw, _A), _M, RULES.assist) <= 0; T.ax = _A.x; T.az = _A.z; T.mx = _M.x; T.my = _M.y; T.mz = _M.z; return T; }
  // the mouth's centre in walker space: just ahead of the head piece
  function mouthAt(maw, out) { const sg = maw.body.skel.segs[0], zf = maw.def.segs[0].half * 1.3; out.x = sg.o.x + sg.z.x * zf; out.y = sg.o.y + sg.z.y * zf; out.z = sg.o.z + sg.z.z * zf; return out; }

  function step(maw, dt) {
    const g = maw.guest; if (!g || !maw.body || dt <= 0) return;
    const sim = maw.sim, diet = maw.diet, h = maw.host, d = g.diet, I = maw.in;
    if (g.dead || !sim.fish.includes(g)) { detach(maw); return; }
    if (d && maw.tier != null && d.tier !== maw.tier) {   // it grew or starved a tier: a bigger or smaller body, and the newest growth is lost with a tier
      if (d.tier < maw.tier) shed(maw); if (d.tier >= 2 && !maw.ab.brood) give(maw, "brood", { name: "its own size: a queen" }); maw.tier = d.tier; maw.U = U0 * (1 + RULES.grow * d.tier); build(maw); }
    maw.t += dt; if (maw.cool > 0) maw.cool -= dt; if (maw.pingCool > 0) maw.pingCool -= dt; if (maw.sonar) { maw.sonar.t += dt; if (maw.sonar.t > RULES.abil.sonar.show) maw.sonar = null; }
    abilStep(maw, dt, I);
    const b = maw.body, C = b.chunks, ia = maw.ia, hd = C[0].p;
    maw.neckLen = 0; for (let i = 0; i < ia; i++) maw.neckLen += b.rest0[i];
    const aimT = I.aim || I.move, fwdA = atan2(b.hdir.z, b.hdir.x), aimA = aimT ? atan2(aimT[1], aimT[0]) : fwdA;
    maw.aimW = { x: cos(aimA), y: 0, z: sin(aimA) };
    // ---- the lunge: the body holds, the neck throws the head ----
    let move = null;
    if (maw.state === "walk") {
      move = g.caught ? null : maw.moveOver !== undefined ? maw.moveOver : I.move;
      let near = 1e9; const o = window.EcologySim.nearestFish(sim, g.x, g.y, mouthR(maw) * 6, (q) => edible(maw, q)); if (o) near = hypot(o.x - g.x, o.y - g.y) / (mouthR(maw) * 6);
      const want = 0.07 + 0.03 * sin(maw.t * 1.7) + (near < 1 ? 0.16 * (1 - near) : 0); maw.m += (want - maw.m) * min(1, 5 * dt);
      if (I.hold && maw.cool <= 0 && !g.caught && !(maw.on.puff > 0)) { maw.state = "coil"; maw.charge = 0; maw.on.cloak = false; }
    } else if (maw.state === "coil") {
      maw.charge = min(1, maw.charge + dt / RULES.coil * (maw.on.leap ? RULES.abil.leap.coil : 1)); try { const rc = maw.neckLen * leapK(maw) * (RULES.strike[0] + RULES.strike[1] * maw.charge); maw.lock = lockOn(maw, h, rc, aimA); maw.lockAt = maw.lock ? strikeAt(maw, h, maw.lock, rc) : null; } catch (e) { maw.lock = maw.lockAt = maw.nearOut = null; if (!maw.warned) { maw.warned = 1; console.error("Maw strike preview:", e); } } maw.m += ((0.22 + 0.5 * maw.charge) - maw.m) * min(1, 9 * dt);
      if (g.caught) maw.state = "walk";
      else if (!I.hold) {
        if (maw.charge < RULES.minCharge) maw.state = "walk";
        else { const ch = maw.charge, reach = maw.neckLen * leapK(maw) * (RULES.strike[0] + RULES.strike[1] * ch), sh = C[ia].p;
          const best = maw.lock && edible(maw, maw.lock) ? maw.lock : lockOn(maw, h, reach, aimA);   // what the indicator showed is what it strikes
          restHead(maw, maw.aimW, _rh);
          if (best) maw.strikeTo = strikeAt(maw, h, best, reach);
          else maw.strikeTo = { x: _rh.x + maw.aimW.x * reach, y: _rh.y - maw.neckLen * 0.15, z: _rh.z + maw.aimW.z * reach };
          maw.target = best; maw.reachMax = reach;
          const E = window.EcologyDiet; if (d && E) d.energy -= E.RULES.dash.cost * (RULES.cost[0] + RULES.cost[1] * ch);
          maw.cool = E ? E.RULES.dash.cool : 2.5; if (diet) diet.dashCool = maw.cool;
          mouthAt(maw, _m); maw.throwFrom = { x: _m.x, y: _m.y, z: _m.z };   // the capsule starts where the jaw rests
          maw.state = "lunge"; maw.st = 0; maw.ext = 1e-4; if (maw.on.leap) { maw.on.leap = false; maw.cd.leap = RULES.abil.leap.cool; note(maw, "leap", "The Maw leaps"); } maw.on.cloak = false; }
      }
    } else if (maw.state === "lunge") {
      maw.st += dt; maw.m += (1 - maw.m) * min(1, 30 * dt);
      if (maw.target && !maw.target.dead && !maw.target.caught) try { maw.strikeTo = strikeAt(maw, h, maw.target, maw.reachMax); } catch (e) { if (!maw.warned) { maw.warned = 1; console.error("Maw homing:", e); } }   // the head follows what it is after while it is thrown
      const u = min(1, maw.st / RULES.out); maw.ext = max(1e-4, maw.reachMax * (1 - (1 - u) * (1 - u)));
      if (maw.st > RULES.out + RULES.hold) { maw.state = "miss"; maw.st = 0; maw.fxN = (maw.fxN || 0) + 1; maw.fx = { n: maw.fxN, kind: "miss", t: 0 }; }
    } else if (maw.state === "hold") {   // the catch thrashes in the jaw; the neck draws it back
      maw.st += dt; maw.m += (0.42 + 0.14 * sin(maw.st * 31) - maw.m) * min(1, 20 * dt);
      const o = maw.held; if (!o || o.dead || o.caught !== g) { maw.held = null; if (maw.state === "hold") { maw.state = "miss"; maw.st = 0; } }   // gone without a meal (a meal sets chew)
      else if (maw.st > RULES.struggle + 0.8) window.EcologySim.kill(sim, o);   // a safety: it is eaten
    } else if (maw.state === "cocoon") {   // helpless while it changes: no walking, no strike
      maw.st += dt; maw.m += (0 - maw.m) * min(1, 10 * dt);
      if (maw.st > RULES.form.cocoon) { maw.form = maw.cocoonTo; maw.cocoonTo = null; maw.state = "walk"; maw.alt = maw.form === "swim" ? RULES.form.alt0 * maw.neckLen * 3 : 0; if (maw.form === "swim") pickFins(maw); build(maw); note(maw, "form", maw.form === "swim" ? "The Maw swims" : "The Maw walks again"); }
    } else if (maw.state === "chew") {
      maw.st += dt; const t = maw.st; maw.m = t < 0.07 ? lerp(maw.m, 0, 0.6) : 0.02 + 0.16 * max(0, sin((t - 0.1) * 17)) * max(0, 1 - t / 0.75);
      if (t > 0.8) maw.state = "walk";
    } else if (maw.state === "miss") {
      maw.st += dt; maw.m += (0 - maw.m) * min(1, 30 * dt);
      if (maw.st > RULES.back + RULES.miss) maw.state = "walk";
    }
    if (maw.state !== "lunge" && maw.state !== "coil" && maw.ext > 0) { maw.ext = max(0, maw.ext - maw.reachMax * dt / (maw.state === "hold" ? RULES.struggle * 1.1 : RULES.back)); if (maw.ext <= 0) { maw.strikeTo = null; maw.target = null; } }
    // ---- the person is its brain: somewhere to walk, or nowhere; coiled, it turns to face the aim where it stands ----
    // the target is on the surface under the head, so "close" means close along it (a head up in the air is not far from it)
    b.surf.project(hd.x, hd.y, hd.z, _P); const sx = _P.x, sy = _P.y, sz = _P.z;
    // on level ground the person's heading is where it goes at once (torso: go) and what it turns to face; the body's own walking is left with a target
    // too close to walk to, only to turn toward. On a wall the body's own climbing takes it: there a heading is a way up, not a velocity
    const nS = b.chunks[ia].n, flat = nS.y > 0.8, sp = b.def.speed * speedK(maw), st = b.def.stride * 0.5;
    let want = null;
    if (maw.state === "coil" && flat) {   // coiled, it turns to face the aim where it stands. (Walking, the body turns itself, as the Walker Bestiary's do.) It turns to face where it is sent (or, coiled, where it aims) all the way: the body's own turning stops a sixth of a turn short
      const to = move ? atan2(move[1], move[0]) : aimA, d = wrap(to - atan2(b.hdir.z, b.hdir.x)), r = Math.sign(d) * min(abs(d), 5 * dt), a0 = atan2(b.hdir.z, b.hdir.x) + r; b.hdir.set(cos(a0), 0, sin(a0)); }
    b.S.speed = speedK(maw) * RULES.walk.speed;
    if (move) {
      // on the level, walking or swimming, it is driven as the Walker Bestiary drives its creatures: a destination well ahead, and the body's own
      // physics pulls the head there on its planted feet, gathering and losing speed, turning at its own rate. (Before, the torso was shoved
      // along from the shoulders at full speed while the legs scrambled to keep up.) On a wall the torso drive below still climbs it
      if (flat) { b.target.set(sx + move[0] * st * RULES.walk.ahead, sy, sz + move[1] * st * RULES.walk.ahead);
        // ... and, walking, the hand is felt at once: the body swings to the new heading and is driven to its speed from the shoulders (the tail
        // follows the head's path), slower while it is still turning, so it plants and turns instead of sliding on the way it was going
        if (maw.form !== "swim" && maw.state !== "coil") { const W = RULES.walk, a0 = atan2(b.hdir.z, b.hdir.x), d = wrap(atan2(move[1], move[0]) - a0), a1 = a0 + Math.sign(d) * min(abs(d), W.turn * dt); b.hdir.set(cos(a1), 0, sin(a1));
          const v = sp * W.speed * W.top * (W.face + (1 - W.face) * max(0, cos(wrap(atan2(move[1], move[0]) - a1)))); want = { x: move[0] * v, z: move[1] * v }; } }
      else want = { x: move[0] * sp, z: move[1] * sp };
      if (!flat) { const wn = move[0] * nS.x + move[1] * nS.z; let tx = move[0] - nS.x * wn, ty = -nS.y * wn, tz = move[1] - nS.z * wn;      // on a wall: the heading along it, and up it for what points into it
        { const ux = -nS.x * nS.y, uy = 1 - nS.y * nS.y, uz = -nS.z * nS.y, ul = hypot(ux, uy, uz) || 1; tx -= ux / ul * wn; ty -= uy / ul * wn; tz -= uz / ul * wn; }   /* into the wall is up it, away from it is down it */
        const tl = hypot(tx, ty, tz); if (tl > 0.05) { tx /= tl; ty /= tl; tz /= tl;
          // turn the heading toward that, about the wall's normal, at up to 5 rad/s: a blend would never turn a heading that points the opposite way (it only shrinks)
          const hx = b.hdir.x, hy = b.hdir.y, hz = b.hdir.z, cs = hx * tx + hy * ty + hz * tz, cx = hy * tz - hz * ty, cy = hz * tx - hx * tz, cz = hx * ty - hy * tx;
          let ang = atan2(cx * nS.x + cy * nS.y + cz * nS.z, cs); if (abs(ang) > PI - 0.05) ang = PI; const r = Math.sign(ang || 1) * min(abs(ang), 5 * dt), co = cos(r), si = sin(r), nd = nS.x * hx + nS.y * hy + nS.z * hz;
          b.hdir.set(hx * co + (nS.y * hz - nS.z * hy) * si + nS.x * nd * (1 - co), hy * co + (nS.z * hx - nS.x * hz) * si + nS.y * nd * (1 - co), hz * co + (nS.x * hy - nS.y * hx) * si + nS.z * nd * (1 - co));
          const hn = nS.x * b.hdir.x + nS.y * b.hdir.y + nS.z * b.hdir.z; b.hdir.x -= nS.x * hn; b.hdir.y -= nS.y * hn; b.hdir.z -= nS.z * hn; if (b.hdir.length() < 1e-4) b.hdir.set(tx, ty, tz); b.hdir.normalize(); }
        b.target.set(sx + b.hdir.x * st * 0.6, sy + b.hdir.y * st * 0.6, sz + b.hdir.z * st * 0.6); } }
    else if (maw.state === "coil") b.target.set(sx + maw.aimW.x * st, sy, sz + maw.aimW.z * st);
    else b.target.set(sx + b.hdir.x * st * 0.6, sy + b.hdir.y * st * 0.6, sz + b.hdir.z * st * 0.6);   // somewhere it is already facing, and close: it stands
    // ---- the body, a tick at a time, with the neck's pushes between ----
    const n = clamp(round(dt * 120), 1, 12), hs = dt / n;
    if (!_va) { const V = window.CreatureBody.V3; _va = new V(); _vc = new V(); _vd = new V(); }
    let gain = 1; if (!want && flat && !move) { want = { x: 0, z: 0 }; gain = RULES.walk.brake; }   // let go (or coiled) on level ground: it stops where it stands, rather than coasting on
    // free: walking on the level under the person's hand; the wave's phase goes round once a stride
    const free = !!move && flat && maw.state !== "coil" && maw.form !== "swim";
    if (free) { let pv = 0; { const v = b.vel(b.chunks[ia], _va || (_va = new window.CreatureBody.V3())); pv = hypot(v.x, v.z); } maw.wph = ((maw.wph || 0) + dt * TAU * pv / max(1e-3, b.def.stride * 2)) % (TAU * 64); }
    // body first, feet after: under the hand on the level the body itself is sent at the wanted velocity (CreatureBody.steer): hand is how much of
    // each piece's drive that takes, from the shoulders to the tail (the tail keeps some of following its own length, so the body still trails
    // round a turn), and grip the least a piece counts as gripping while its feet are in the air
    { const it = maw.intent || (maw.intent = { x: 0, z: 0, act: "" }); it.x = want ? want.x : 0; it.z = want ? want.z : 0; it.act = maw.state; if (maw.guest) maw.guest.intent = it; }   // Intent: what the hand or the autopilot wants of the body this step (the record a crew walker's brain writes too)
    if (want && flat && maw.form !== "swim") { const W = RULES.walk, N = b.chunks.length, st = maw._steer || (maw._steer = { x: 0, y: 0, z: 0, k: [], grip: 0 }); st.x = want.x; st.z = want.z; st.grip = W.grip;
      for (let i = 0; i < N; i++) st.k[i] = i < ia ? 0 : W.hand[0] + (W.hand[1] - W.hand[0]) * (i - ia) / max(1, N - 1 - ia); st.k.length = N; b.steer = st; }
    else b.steer = null;
    for (let i = 0; i < n; i++) { neck(maw, hs); torso(maw, hs, want, free, gain); b.step(hs); }
    if (maw.posed) pose(maw, dt);
    if (maw.state !== "coil") { maw.lock = null; maw.lockAt = null; maw.nearOut = null; maw.refuseQ = null; }
    showLift(maw);
    // ---- whatever the open mouth meets, while it is thrown ----
    if (maw.state === "lunge" && maw.st > 0) { mouthAt(maw, _m); let got = null;   /* not on the frame it lets go: the head is seen thrown before the jaw shuts */ const A = maw.throwFrom || _m;
      if (maw.target && edible(maw, maw.target) && missBy(maw, h, maw.target, A, _m, RULES.assist) <= 0) got = maw.target;   // the locked prey: the wider (assist) ring, as aim assist has an outer ring
      if (!got) for (const q of sim.fish) { if (!edible(maw, q)) continue; if (missBy(maw, h, q, A, _m) <= 0) { got = q; break; } }
      if (!got && !maw.told) for (const q of sim.fish) {   // it met a creature it may not eat: say why, once a lunge
        if (q === g || q.dead || q.guest || !q.diet || q.hidden || edible(maw, q) || missBy(maw, h, q, A, _m) > 0) continue;
        maw.told = 1; const why = maw.sim.web && maw.diet && maw.diet.web === "body" ? maw.sim.web.why(g, q) : "";
        note(maw, "refuse", (maw.sim.speciesRT[q.sp].name || "It") + (!fits(maw, q) ? " is too big for its mouth" : why === "too big" ? " is too heavy for the Maw yet: it must grow" : why === "too small" ? " is too small to be worth the Maw's while" : " is not something the Maw can eat")); break; }
      if (got) { maw.fxN = (maw.fxN || 0) + 1; const r = swallow(maw, got); maw.fx = { n: maw.fxN, kind: r === true ? "hit" : r === "infect" ? "infect" : "stung", t: 0, size: window.EcologySim.bodyLen(sim, got) }; if (maw.fx.kind !== "hit") { maw.state = "miss"; maw.st = 0; } } }
    else if (maw.state !== "lunge") { maw.throwFrom = null; maw.told = 0; }
    if (maw.held && !maw.held.dead && maw.held.caught === g) holdAt(maw, maw.held);
    // ---- a meal travels down, then shows ----
    maw.Rmax += (maw.RmaxT - maw.Rmax) * min(1, 2.2 * dt);
    for (const t of maw.teeth) t.grow = min(1, t.grow + dt);
    for (const bo of maw.bolus) { bo.t += dt; if (!bo.done && bo.t > 0.5) { bo.done = true; eaten(maw, bo.kind, bo.don); } }
    maw.bolus = maw.bolus.filter((bo) => bo.t < 1.1);
    // ---- the cost of a big body ----
    if (d) { const grown = maw.lv.reach + maw.lv.bulk + maw.lv.wide, E = window.EcologyDiet;
      if (grown && E && !g.caught) { const rec = E.describe(diet, g); if (rec) d.energy -= rec.upkeep / 60 * E.RULES.drain * dt * RULES.upkeep * grown; } }
    pin(maw, dt);
  }

  // ---- drawing: every line of it as segments in tank space ----
  // a tooth's drawing along its own long axis: [s, v, s, v, ...] pairs of segment ends, s 0..1 from root to tip, v across
  function toothArt(maw, id) {
    let A = maw.tooth.get(id); if (A) return A;
    const polys = lines(maw, id), pts = []; for (const pl of polys) for (let i = 0; i < pl.length; i += 2) pts.push([pl[i], pl[i + 1]]);
    const st = max(1, floor(pts.length / 160)), sm = pts.filter((_, i) => i % st === 0); let a = [0, 0], b = [0, 1], best = -1;
    for (let i = 0; i < sm.length; i++) for (let j = i + 1; j < sm.length; j++) { const dd = (sm[i][0] - sm[j][0]) ** 2 + (sm[i][1] - sm[j][1]) ** 2; if (dd > best) { best = dd; a = sm[i]; b = sm[j]; } }
    const L = sqrt(max(best, 1e-6)), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, wide = (e0, e1) => { let w = 0; for (const q of pts) { const t = ((q[0] - a[0]) * ux + (q[1] - a[1]) * uy) / L; if (t >= e0 && t <= e1) w = max(w, abs(-(q[0] - a[0]) * uy + (q[1] - a[1]) * ux)); } return w; };
    const flip = wide(0.7, 1) > wide(0, 0.3), out = [];   // the thick end is the root
    const sv = (x, y) => { const s = ((x - a[0]) * ux + (y - a[1]) * uy) / L, v = (-(x - a[0]) * uy + (y - a[1]) * ux) / L; return flip ? [1 - s, -v] : [s, v]; };
    for (const pl of polys) for (let i = 0; i + 3 < pl.length; i += 2) out.push(...sv(pl[i], pl[i + 1]), ...sv(pl[i + 2], pl[i + 3]));
    A = new Float32Array(out); maw.tooth.set(id, A); return A;
  }
  function linesOf(maw) {
    const h = maw.host, b = maw.body, L = maw.look; if (!b || !L) return { data: maw.buf, verts: 0, batches: [] };
    let B = maw.buf, o = 0; const batches = (maw.batches.length = 0, maw.batches), ks = h.ks, tw2 = h.tw / 2, th2 = h.th / 2, fz = FLOOR * h.td;
    const room = (n) => { if (B.length < o + n * 4) { const nb = new Float32Array(Math.ceil((o + n * 4) * 1.5)); nb.set(B.subarray(0, o)); B = maw.buf = nb; } };
    const put = (x, y, z) => { B[o++] = x / ks + tw2; B[o++] = z / ks + th2; B[o++] = fz - y / ks; B[o++] = 1; };
    const batch = (color, start) => { const last = batches[batches.length - 1]; if (last && last.color === color) last.count = o / 4 - last.start; else batches.push({ start, count: o / 4 - start, color }); };
    // the body's pieces, each in its row's colour
    for (let gi = 0; gi < L.groups.length; gi++) { const m = L.groups[gi].matrix.elements, P = L.thin[gi], start = o / 4; room(P.length / 3);
      for (let i = 0; i < P.length; i += 3) { const x = P[i], y = P[i + 1], z = P[i + 2]; put(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]); }
      batch(maw.def.segs[gi].row.own || INK, start); }
    // the eye: a ring round the one glowing mark on the head, in gold
    if (EYE.on && L.groups[0]) { const m = L.groups[0].matrix.elements, e = eyeSpot(maw), n = 16, start = o / 4; room(n * 2);
      const at = (k, rr) => { const a = k / n * TAU, x = e.x + Math.cos(a) * rr, y = e.y + e.r * 0.2, z = e.z + Math.sin(a) * rr; put(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]); };
      for (let k = 0; k < n; k++) { at(k, e.r); at(k + 1, e.r); } batch(GOLD, start); }
    // the legs
    { const P = L.pos, cnt = min(L.limbs.geometry.drawRange.count, P.length / 3), start = o / 4; room(cnt); for (let i = 0; i < cnt * 3; i += 3) put(P[i], P[i + 1], P[i + 2]); batch(INK, start); }
    // the mouth: a ring standing on the front of the head, a throat behind it, the teeth round it
    const sg = b.skel.segs[0], hf = maw.def.segs[0].half, e = ease(clamp(maw.m, 0, 1)), U = maw.U, R = lerp(hf * 0.8, maw.Rmax * U, e), Ry = R * lerp(0.1, 0.85, e), zf = hf * 1.3;
    const at = (lx, ly, lz) => put(sg.o.x + sg.x.x * lx + sg.y.x * ly + sg.z.x * lz, sg.o.y + sg.x.y * lx + sg.y.y * ly + sg.z.y * lz, sg.o.z + sg.x.z * lx + sg.y.z * ly + sg.z.z * lz);
    const ring = (k, z, N) => { for (let i = 0; i < N; i++) { const a0 = i / N * TAU, a1 = (i + 1) / N * TAU; at(cos(a0) * R * k, sin(a0) * Ry * k, z); at(cos(a1) * R * k, sin(a1) * Ry * k, z); } };
    { const start = o / 4; room(28 * 2 + 12); ring(1, zf, 28); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + PI / 6; at(cos(a) * R, sin(a) * Ry, zf); at(cos(a) * R * 0.55, sin(a) * Ry * 0.55, zf - R * 0.6); } batch(INK, start); }
    if (e > 0.15) { const start = o / 4; room(40 * 2); ring(0.55, zf - R * 0.6, 20); ring(0.25, zf - R * 1.1, 14); batch(THROAT, start); }
    // teeth: rooted on the ring; shut they lie forward as a beak, open they point in across the mouth
    const tilt = (1 - e) * 1.25, ct = cos(tilt), stl = sin(tilt), byCol = new Map();
    for (const t of maw.teeth) { const k = t.own || INK; (byCol.get(k) || byCol.set(k, []).get(k)).push(t); }
    for (const [col, list] of byCol) { const start = o / 4;
      for (const t of list) { const A = toothArt(maw, t.id), ca = cos(t.a), sa = sin(t.a), len = min(t.len * U * min(1, t.grow) * lerp(0.5, 1, e), max(R, hf) * 0.98); room(A.length / 2);
        const rx = ca * R, ry = sa * Ry;            // root; in: toward the middle, tilted forward when shut; across: along the ring
        const ix = -ca * ct, iy = -sa * ct, iz = stl, cxx = -sa, cyy = ca;
        for (let i = 0; i < A.length; i += 2) { const s = A[i] * len, v = A[i + 1] * len; at(rx + ix * s + cxx * v, ry + iy * s + cyy * v, zf + iz * s); } }
      batch(col, start); }
    // coiled: where the strike will carry the mouth
    if (maw.state === "coil" && maw.charge > RULES.minCharge && maw.aimW) { const start = o / 4, reach = maw.neckLen * leapK(maw) * (RULES.strike[0] + RULES.strike[1] * maw.charge), a = maw.aimW, Rm = maw.Rmax * U; room(24);
      // the strike's capsule on the ground, as a skillshot's range indicator: exactly what the hit test uses
      const col = maw.lockAt && maw.lock && maw.lockAt.hit ? HIT : maw.refuseQ ? NOHIT : CHARGE, W = jawW(maw), y = maw.body.chunks[maw.ia].p.y - maw.neckLen * 0.05;
      mouthAt(maw, _A); const ax = _A.x, az = _A.z, bx = maw.lockAt && maw.lock ? maw.lockAt.mx : ax + a.x * reach, bz = maw.lockAt && maw.lock ? maw.lockAt.mz : az + a.z * reach;
      let ux = bx - ax, uz = bz - az; const ul = hypot(ux, uz) || 1; ux /= ul; uz /= ul; const nx = -uz, nz = ux; room(4 + 2 * 2 * 12);
      put(ax + nx * W, y, az + nz * W); put(bx + nx * W, y, bz + nz * W); put(ax - nx * W, y, az - nz * W); put(bx - nx * W, y, bz - nz * W);
      for (let i = 0; i < 12; i++) { const a0 = i / 12 * PI, a1 = (i + 1) / 12 * PI;   // round ends
        put(bx + (nx * cos(a0) + ux * sin(a0)) * W, y, bz + (nz * cos(a0) + uz * sin(a0)) * W); put(bx + (nx * cos(a1) + ux * sin(a1)) * W, y, bz + (nz * cos(a1) + uz * sin(a1)) * W);
        put(ax + (nx * cos(a0) - ux * sin(a0)) * W, y, az + (nz * cos(a0) - uz * sin(a0)) * W); put(ax + (nx * cos(a1) - ux * sin(a1)) * W, y, az + (nz * cos(a1) - uz * sin(a1)) * W); }
      batch(col, start);
      const mk = (q, col, M) => { const st = o / 4; room(24); preyAt(maw.host, q, _w); const r = max(Rm, 0.4), fy = maw.body.chunks[maw.ia].p.y, px = _w.x, py = _w.y, pz = _w.z;
        for (let i = 0; i < 4; i++) { const a0 = i * PI / 2, a1 = (i + 1) * PI / 2; put(px + cos(a0) * r, py, pz + sin(a0) * r); put(px + cos(a1) * r, py, pz + sin(a1) * r); }
        put(px, py, pz); put(px, fy, pz);
        if (M) { const rm = Rm * 0.95; for (let i = 0; i < 6; i++) { const a0 = i * PI / 3, a1 = (i + 1) * PI / 3; put(M.mx + cos(a0) * rm, M.my, M.mz + sin(a0) * rm); put(M.mx + cos(a1) * rm, M.my, M.mz + sin(a1) * rm); } put(M.mx, M.my, M.mz); put(px, py, pz); }   // where the mouth will be, and a line to the prey
        batch(col, st); };
      try { if (maw.lock && !maw.lock.dead && maw.lockAt) mk(maw.lock, maw.lockAt.hit ? HIT : CHARGE, null);
        else if (maw.refuseQ && !maw.refuseQ.dead) mk(maw.refuseQ, NOHIT, null);
        else if (maw.nearOut && !maw.nearOut.dead) mk(maw.nearOut, CHARGE, null); } catch (e) { if (!maw.warned) { maw.warned = 1; console.error("Maw marker:", e); } } }
    // the sonar: two rings going out through the water from where it pinged
    if (maw.sonar) { const S = maw.sonar, D = RULES.abil.sonar, u = min(1, S.t / D.dur); if (S.t < D.dur + 0.5) { const start = o / 4; room(3 * 64 * 2);
      for (const lag of [0, 0.18, 0.36]) { const uu = clamp((S.t - lag) / D.dur, 0, 1), rr = S.R * uu * uu * (0.15 + 0.85 * uu); if (uu <= 0 || uu >= 1) continue; for (let i = 0; i < 64; i++) { const a0 = i / 64 * TAU, a1 = (i + 1) / 64 * TAU; put(S.x + cos(a0) * rr, S.y, S.z + sin(a0) * rr); put(S.x + cos(a1) * rr, S.y, S.z + sin(a1) * rr); } }
      batch(SONAR, start); } }
    abilLines(maw, put, room, batch, () => o / 4);
    // the cocoon: hex shells close round the body while it changes, turning
    if (maw.state === "cocoon") { const C = b.chunks, c = C[min(C.length - 1, maw.ia + 1)].p, u = min(1, maw.st / 0.6), L0 = maw.neckLen * 1.6, start = o / 4; room(9 * 6 * 2);
      for (let j = 0; j < 9; j++) { const f = j / 8, rr = L0 * u * sin(PI * (0.15 + 0.7 * f)), y = c.y + (f - 0.35) * L0 * 1.3, rot = maw.st * (j % 2 ? 0.8 : -0.8) + j * 0.3;
        for (let i = 0; i < 6; i++) { const a0 = rot + i * PI / 3, a1 = rot + (i + 1) * PI / 3; put(c.x + cos(a0) * rr, y, c.z + sin(a0) * rr); put(c.x + cos(a1) * rr, y, c.z + sin(a1) * rr); } }
      batch(GOLD, start); }
    return { data: B, verts: o / 4, batches };
  }
  // the prey the strike is going for, in tank space, for a lock-on camera: while coiled, the locked one; while thrown, its target
  const _lv = { x: 0, y: 0, z: 0 };
  function lockView(maw, h) {
    const q = maw.state === "coil" ? maw.lock : maw.state === "lunge" ? maw.target : null; if (!q || q.dead) return null;
    ptAt(h, q, nPts(q) >> 1, _w); toTank(h, _w, _lv); return [_lv.x, _lv.y, _lv.z]; }
  // where each place of plan() is, in tank space (rows: their segment's middle; the mouth: in front of the head), for a HUD drawn on the body
  function anchors(maw) {
    const b = maw.body, h = maw.host; if (!b) return null; const out = [];
    maw.rows.forEach((r, i) => { const sg = b.skel.segs[i]; if (!sg) { out.push(null); return; } toTank(h, sg.o, _t); out.push([_t.x, _t.y, _t.z]); });
    mouthAt(maw, _m); toTank(h, _m, _t); out.push([_t.x, _t.y, _t.z]);
    return out;
  }
  // where a camera should look: the middle of the body on the ground, how long it is, which way it aims
  // posed (the Mutate rig is open): it holds still and its spine is drawn straight along its heading, head to tail, each piece at its rest
  // length from the torso's middle, at the height it stands. Pieces are moved with their last positions, so no speed is put into them;
  // the feet step after the body as they would after any shove
  function pose(maw, dt) {
    const b = maw.body, C = b.chunks, N = C.length, hx = b.hdir.x, hz = b.hdir.z, k = min(1, dt * 5);
    let mx = 0, mz = 0; for (const c of C) { mx += c.p.x; mz += c.p.z; } mx /= N; mz /= N;
    let tot = 0; for (let i = 0; i < N - 1; i++) tot += b.rest0[i]; let s0 = tot / 2;
    for (let i = 0; i < N; i++) { const c = C[i], tx = mx + hx * s0, tz = mz + hz * s0, dx = (tx - c.p.x) * k, dz = (tz - c.p.z) * k;
      c.p.x += dx; c.p.z += dz; c.prev.x += dx; c.prev.z += dz; c.prev.x += (c.p.x - c.prev.x) * k; c.prev.z += (c.p.z - c.prev.z) * k; if (i < N - 1) s0 -= b.rest0[i]; }
  }
  function setPose(maw, on) { maw.posed = !!on; if (on) { maw.in.move = null; maw.in.hold = false; if (maw.state === "coil") maw.state = "walk"; } }
  // ---- the Maw, solid: its rows' parts made solid (EcologyWalkers.solidDef), made again whenever its body is rebuilt (it ate, changed form,
  // took a design), placed by its look's own pieces. What EcologyRender.solids draws, in the same shape as EcologyWalkers.solids gives
  function solidOf(maw) { if (!maw.def) return null; if (maw.solidFor !== maw.def) { maw.solidFor = maw.def; maw.solid = window.EcologyWalkers.solidDef(maw.def); } return maw.solid; }
  // ---- one eye: a single glowing mark on the head, where the eye lands (the references' focal point) ----
  // Where: the highest point of the head's solid near its middle line, a little forward; without a solid, over the head's middle.
  // In the head piece's own frame (x side, y up, z forward). EYE: its size as a share of the head's half-width, and whether to draw it
  const EYE = { on: true, r: 0.15, fwd: 0.25 };
  function eyeSpot(maw) {
    const sd = maw.def && maw.def.segs[0], hf = (sd && sd.half) || 0.2, S = maw.solid && maw.solidFor === maw.def ? maw.solid : null, m = S && S.segs[0];
    if (maw.eyeFor === m && maw.eye && maw.eyeDef === maw.def) return maw.eye;
    let best = null; if (m) { const P = m.pos; let zmin = 1e9, zmax = -1e9; for (let i = 2; i < P.length; i += 3) { zmin = min(zmin, P[i]); zmax = max(zmax, P[i]); }
      const zt = zmin + (zmax - zmin) * (0.5 + EYE.fwd); for (let i = 0; i < P.length; i += 3) { if (abs(P[i]) > hf * 0.3) continue; const sc = P[i + 1] - abs(P[i + 2] - zt) * 0.5; if (!best || sc > best.sc) best = { sc, x: 0, y: P[i + 1], z: P[i + 2] }; } }
    const r = hf * EYE.r; maw.eye = best ? { x: 0, y: best.y + r * 0.35, z: best.z, r } : { x: 0, y: hf * 0.45, z: hf * EYE.fwd, r }; maw.eyeFor = m; maw.eyeDef = maw.def; return maw.eye;
  }
  let eyeMesh = null;
  function eyeBall(e) {   // a unit sphere scaled to the eye, in the head's frame
    if (!eyeMesh) { const pos = [], nrm = [], idx = [], NU = 14, NV = 8; for (let v = 0; v <= NV; v++) for (let u = 0; u <= NU; u++) { const th = v / NV * PI, ph = u / NU * TAU, x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph); pos.push(x, y, z); nrm.push(x, y, z); }
      for (let v = 0; v < NV; v++) for (let u = 0; u < NU; u++) { const a = v * (NU + 1) + u, b = a + NU + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      eyeMesh = { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint32Array(idx) }; }
    if (e.mesh && e.mesh.r === e.r && e.mesh.y === e.y && e.mesh.z === e.z) return e.mesh;
    const P = new Float32Array(eyeMesh.pos.length); for (let i = 0; i < P.length; i += 3) { P[i] = e.x + eyeMesh.pos[i] * e.r; P[i + 1] = e.y + eyeMesh.pos[i + 1] * e.r * 0.7; P[i + 2] = e.z + eyeMesh.pos[i + 2] * e.r; }
    return (e.mesh = { pos: P, nrm: eyeMesh.nrm, idx: eyeMesh.idx, r: e.r, y: e.y, z: e.z });
  }
  function solids(maw) {
    const h = maw.host, L = maw.look, S = maw.body && L ? solidOf(maw) : null, list = [];
    const qk = maw.body ? 1 / Math.max(1e-6, maw.body.len0 || maw.def.Lm * 4) : 1;   // the pattern's scale: one body length
    if (S) S.segs.forEach((m, gi) => { const g = L.groups[gi]; if (m && g) list.push({ mesh: m, matrix: g.matrix.elements, color: maw.def.segs[gi].row.own || INK, qk }); });
    if (S && EYE.on && L.groups[0]) list.push({ mesh: eyeBall(eyeSpot(maw)), matrix: L.groups[0].matrix.elements, color: GOLD, eye: true, qk });   // eye: a page gives it a glowing look of its own
    return { list, ks: h.ks, tw2: h.tw / 2, th2: h.th / 2, fz: FLOOR * h.td };
  }
  function view(maw) {
    const b = maw.body, h = maw.host; if (!b) return null; const C = b.chunks, sh = C[maw.ia], nx = C[min(C.length - 1, maw.ia + 1)], tl = C[C.length - 1];
    _w.x = _w.y = _w.z = 0; for (let i = maw.ia; i < C.length; i++) { _w.x += C[i].p.x; _w.y += C[i].p.y; _w.z += C[i].p.z; } { const k = 1 / (C.length - maw.ia); _w.x *= k; _w.y *= k; _w.z *= k; } toTank(h, _w, _t);   // the torso's middle: it turns about this, so a turn does not swing the camera
    let len = 0; for (const r of b.rest0) len += r;
    // the surface it stands on (its normal, in tank space: z is depth, so up is -z) and how fast the torso goes, for the camera
    const nm = sh.n; let vx = 0, vz = 0; for (let i = maw.ia; i < C.length; i++) { vx += C[i].p.x - C[i].prev.x; vz += C[i].p.z - C[i].prev.z; } const kv = window.CreatureBody.K.hz / (C.length - maw.ia) / h.ks;
    return { n: [nm.x, nm.z, -nm.y], wall: clamp(1 - nm.y, 0, 1), vel: [vx * kv, vz * kv], x: _t.x, y: _t.y, z: _t.z, len: len / h.ks, aim: maw.aimW ? [maw.aimW.x, maw.aimW.z] : [0, 0], coil: maw.state === "coil" ? maw.charge : 0, out: maw.ext > 0, fx: maw.fx || null,
      hd: [b.hdir.x, b.hdir.z], posed: !!maw.posed, lock: lockView(maw, h), hit: !!(maw.lockAt && maw.lock && maw.lockAt.hit), eyes: maw.ab.eyes, form: maw.form, cocoon: maw.state === "cocoon" ? min(1, maw.st / RULES.form.cocoon) : 0 };
  }

  window.EcologyMaw = { EYE, TORSO, eyeSpot, pose: setPose, solids, solidOf, create, legsFrom, bodyFrom, design, designKept, standAlone, BODIES: Object.keys(BODIES), LEGS: Object.keys(LEG_PLANS), anchors, attach, detach, kit, use, equip, abilView, stats, preview, ACTIVE, ABILS, relayout, input, step, lines: linesOf, view, edible, feed, reset, RULES, LEG, choose, plan, need, ping, sensed, depth, part: (maw, id) => maw.byId[id] || null,
    _test: { missBy: (maw, q, A, B) => missBy(maw, maw.host, q, A, B), mouthAt: (maw) => mouthAt(maw, { x: 0, y: 0, z: 0 }) } };   // for the tests
})();
