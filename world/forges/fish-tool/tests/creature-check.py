"""Creature construction and animation check, on the Specimen page (the tank's own walkers and the Maw).

Construction: how many of a creature's drawn line segments reach the screen. For the body, the kit drawings placed on its pieces against what
the tank draws after thinning. For each leg and wing, the source drawing the length of line that survives being cut into bones against the length drawn
(LimbArt.sliceSpine drops an edge whose two ends land on different parts of a bent spine). Also: closed shapes that thinning collapses to a stub, any piece with nothing drawn, any NaN in the lines sent to the renderer.
Animation: over 8 s on the floor, does every leg step, does every wing swing, does the body travel, do the pieces stay joined.

    python3 -m http.server 8731   (at the repo root)
    python3 world/forges/fish-tool/tests/creature-check.py
"""
import json, sys
from playwright.sync_api import sync_playwright
CASES = [("carapace-strider", None), ("pincer", None), ("crowned-sickle-lancer", None), ("pearl-chasing-centiwyrm", None), ("quad", None),
         ("maw", ("serpent", "pincer")), ("maw", ("wraith", "stalker")), ("maw", ("wraith", "strider"))]
JS = """async ([body, legs]) => {
  const S = __specimen, isMaw = typeof maw !== 'undefined' && S.UI.i === SPECIES.length;
  if (isMaw && body) { EcologyMaw.bodyFrom(maw, body); EcologyMaw.legsFrom(maw, legs); }
  const B = isMaw ? maw.body : S.walkers.crew[0].body, look = isMaw ? maw.look : S.walkers.crew[0].look, def = B.def, seg2 = (polys) => polys.reduce((n, p) => n + Math.max(0, p.length / 2 - 1), 0), len2 = (polys) => polys.reduce((n, p) => { for (let i = 0; i + 3 < p.length; i += 2) n += Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]); return n; }, 0), lenB = (bones) => bones.reduce((n, b) => { for (let i = 0; i + 3 < b.length; i += 4) n += Math.hypot(b[i + 2] - b[i], b[i + 3] - b[i + 1]); return n; }, 0);
  // construction
  let src = 0, empty = 0; for (const sg of def.segs) for (const p of sg.parts) { const n = seg2(p.polys) * (p.mirror ? 2 : 1); src += n; if (!n) empty++; }
  const built = look.groups.reduce((n, g) => n + g.children[0].geometry.attributes.position.array.length / 6, 0), drawn = look.thin.reduce((n, a) => n + a.length / 6, 0);
  // shapes lost to thinning: a closed shape smaller than the threshold comes out as one stub shorter than a fifth of it
  const lost = (min) => look.groups.reduce((n, g) => { const T = EcologyWalkers.kit.thin(g.children[0].geometry.attributes.position.array, min); for (let i = 0; i < T.length; i += 6) if (Math.hypot(T[i + 3] - T[i], T[i + 4] - T[i + 1], T[i + 5] - T[i + 2]) < min / 5) n++; return n; }, 0);
  const lostTank = lost(0.025), lostHere = lost(isMaw ? (maw.thin ?? 0.02) : S.walkers.thin);
  const limbs = []; for (const sg of def.segs) for (const [kind, list] of [['leg', sg.legs], ['arm', sg.arms]]) for (const l of list) { const art = l.artObj || (look.limbArt.find((a) => a && a.art && (a.len === l.len)) || {}).art;
    const s0 = art && art.src && art.src.polys ? len2(art.src.polys) : null; limbs.push({ kind, kept: art && s0 ? lenB(art.bones) : null, src: s0, bones: art ? art.bones.map((b) => b.length / 4) : null }); }
  // animation: 8 s
  const legs0 = B.legs.map((L) => ({ steps: 0, was: L.stepping, far: 0, f0: L.foot.clone() })), arms0 = B.arms.map(() => ({ lo: 1e9, hi: -1e9 })), p0 = B.chunks[0].p.clone(); let nan = 0, stretch = 0, modes = {};
  for (let k = 0; k < 480; k++) { S.systems.run(1 / 60); modes[B.mode] = (modes[B.mode] || 0) + 1;
    B.legs.forEach((L, i) => { const o = legs0[i]; if (L.stepping && !o.was) o.steps++; o.was = L.stepping; });
    B.arms.forEach((A, i) => { const y = A.J[A.J.length - 1].y - A.J[0].y; arms0[i].lo = Math.min(arms0[i].lo, y); arms0[i].hi = Math.max(arms0[i].hi, y); });
    for (let i = 0; i + 1 < B.chunks.length; i++) { const d = B.chunks[i].p.distanceTo(B.chunks[i + 1].p), r = B.rest[i] || 1; stretch = Math.max(stretch, Math.abs(d / r - 1)); } }
  const L = isMaw ? EcologyMaw.lines(maw) : EcologyWalkers.lines(S.walkers); for (let i = 0; i < L.verts * 4; i++) if (!Number.isFinite(L.data[i])) nan++;
  return { lostTank, lostHere, pieces: def.segs.length, src, built, drawn, empty, limbs, legs: B.legs.length, steps: legs0.map((o) => o.steps), arms: arms0.map((a) => +(a.hi - a.lo).toFixed(2)), travel: +B.chunks[0].p.distanceTo(p0).toFixed(2), stretch: +stretch.toFixed(2), nan, verts: L.verts, modes };
}"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"]); bad = 0
    for key, opt in CASES:
        pg = b.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
        pg.goto("http://localhost:8731/world/forges/fish-tool/Specimen.html#c=" + key); pg.wait_for_timeout(4500)
        r = pg.evaluate(JS, list(opt or (None, None))); pg.close()
        name = key + (" " + "+".join(opt) if opt else "")
        legkeep = [round(100 * l["kept"] / l["src"]) for l in r["limbs"] if l["kind"] == "leg" and l["src"]]
        armkeep = [round(100 * l["kept"] / l["src"]) for l in r["limbs"] if l["kind"] == "arm" and l["src"] and l["kept"]]
        flags = []
        if r["empty"]: flags.append("%d empty parts" % r["empty"])
        if r["nan"]: flags.append("NaN in lines")
        if legkeep and min(legkeep) < 90: flags.append("leg lines lost")
        if armkeep and min(armkeep) < 90: flags.append("wing lines lost")
        if r["legs"] and min(r["steps"]) == 0 and r["modes"].get("walk", 0) > 240: flags.append("a leg never stepped")
        if r["stretch"] > 0.5: flags.append("pieces pulled apart %.0f%%" % (100 * r["stretch"]))
        if errs: flags.append("page error: " + errs[0])
        bad += bool(flags)
        print("%-34s pieces %2d  body %5d src > %5d built > %5d drawn (%3d%%)  shapes lost %d at the tank's thinning, %d here  legs kept %s  wings kept %s  steps %s  wing swing %s  travel %.1f  stretch %.2f  %s  %s" % (
            name, r["pieces"], r["src"], r["built"], r["drawn"], round(100 * r["drawn"] / max(1, r["src"])), r["lostTank"], r["lostHere"], legkeep or "-", armkeep or "-", r["steps"], r["arms"], r["travel"], r["stretch"], r["modes"], "FLAG: " + "; ".join(flags) if flags else "ok"))
    b.close(); sys.exit(1 if bad else 0)
