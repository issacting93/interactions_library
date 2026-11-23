// kit3d's own test (no browser): a closed sheet comes back as it should.
//   node tools/kit3d/test.mjs
// It takes the sheet audit writes and plays three editors: one that changes nothing; one that bakes the group's move and scale into the points and
// drops the path indexes (as Figma and Illustrator do), closing one part on the way; and one that keeps the file as written and closes another part.
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { audit, importSheet, redraw, SHEET, SHEET_JSON } from "./kit3d.mjs";
const assert = (ok, msg) => { if (!ok) { console.error("FAILED: " + msg); process.exit(1); } };
const quiet = (fn) => { const log = console.log; console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const a = quiet(() => audit({ quiet: true })); assert(a.close.length > 0, "nothing on the sheet to test with");
const sheet = fs.readFileSync(SHEET, "utf8"), layout = JSON.parse(fs.readFileSync(SHEET_JSON, "utf8")).parts, tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kit3d-"));
// 1. untouched
let r = quiet(() => importSheet(SHEET)); assert(r.changed === 0, "an untouched sheet changed " + r.changed + " parts");
// 2. an editor that bakes transforms and drops data-i; the first part's strokes are each closed
const first = layout[0], second = layout[Math.min(1, layout.length - 1)];
let baked = sheet.replace(/<g id="(P\d+)"([^>]*?) transform="[^"]*">([\s\S]*?)<\/g>/g, (all, id, rest, body) => { const L = layout.find((q) => q.id === id).layout, f = (x, y) => [(x - L.mx) * L.s + L.cx, (y - L.my) * L.s + L.cy];
  return `<g id="${id}"${rest}>` + body.replace(/ data-i="\d+"/g, "").replace(/ d="([^"]+)"/g, (m, d) => ` d="${redraw(d, f)}${id === first.id && !/Z\s*$/i.test(d) ? " Z" : ""}"`) + "</g>"; });
fs.writeFileSync(path.join(tmp, "baked.svg"), baked);
r = quiet(() => importSheet(path.join(tmp, "baked.svg")));
assert(r.changed === 1, "a baked sheet with one part closed should change 1 part, changed " + r.changed + "\n" + r.report.join("\n"));
assert(r.report.some((l) => l.startsWith(first.id) && / -> 0,/.test(l) && /now has a closed outline/.test(l)), first.id + " did not come back closed: " + r.report.find((l) => l.startsWith(first.id)));
// 3. the file as written, another part closed
let kept = sheet.replace(new RegExp(`(<g id="${second.id}"[\\s\\S]*?<\\/g>)`), (g) => g.replace(/ d="([^"]+)"/g, (m, d) => / Z\s*$/i.test(d) ? m : ` d="${d} Z"`));
fs.writeFileSync(path.join(tmp, "kept.svg"), kept);
r = quiet(() => importSheet(path.join(tmp, "kept.svg")));
if (second.id !== first.id) { assert(r.changed === 1, "closing " + second.id + " should change 1 part, changed " + r.changed); assert(r.report.some((l) => l.startsWith(second.id) && / -> 0,/.test(l)), second.id + " did not come back closed"); }
// 4. the tank's open outlines: the sheet comes back unchanged; a red part closed by hand is taken up
{ const O = await import("./outlines.mjs"), K = await import("./kit3d.mjs"); O.use({ redraw: K.redraw, readSheet: K.readSheet, apply: K.apply, esc: K.esc });
  const sheetO = path.join(K.ROOT, "packages/kit/data/kit-sources/outlines-to-close.svg"), layO = path.join(K.ROOT, "packages/kit/data/kit-sources/outlines-to-close.json");
  if (fs.existsSync(sheetO) && fs.existsSync(layO)) { const rows = JSON.parse(fs.readFileSync(layO, "utf8")).parts, red = rows.find((q) => !q.closed);
    r = quiet(() => O.importOutlines(sheetO)); assert(r.changed === 0, "an untouched outline sheet changed " + r.changed + " outlines");
    if (red) { const txt = fs.readFileSync(sheetO, "utf8"), g = txt.match(new RegExp(`<g id="${red.id}"[\\s\\S]*?<\\/g>`))[0];
      fs.writeFileSync(path.join(tmp, "outl.svg"), txt.replace(g, g.replace(/ d="([^"]+)"/, (m, d) => ` d="${d} Z"`)));
      r = quiet(() => O.importOutlines(path.join(tmp, "outl.svg"))); assert(r.changed === 1 && r.report.some((l) => l.startsWith(red.id) && /closed by hand/.test(l)), red.id + " closed by hand was not taken up: " + r.report.join(" | ")); } } }
fs.rmSync(tmp, { recursive: true, force: true });
console.log("kit3d: all passed (untouched sheet, a baked sheet with " + first.id + " closed, a kept sheet with " + second.id + " closed, the outline sheet read back)");
