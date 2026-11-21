// Kit to 3D: the tank's species, for the tools. One place that loads them the way a page does, and one that reads and writes the file.
//
//   tank({ outlines, render })   the browser scripts run in a sandbox: { w, PS (PartSolid), species, R (EcologyRender), gl }
//                                outlines: also load shared/data/core-outlines.js. render: false skips PartSolid and the renderer
//                                (no Delaunator needed). gl is a stand-in: upload calls go nowhere.
//   readSpecies()                the SPECIES array of shared/engine/ecology/ecology-species.js, as data, with how to write it back
//   writeSpecies(file, S)        writes S back in place of that array; everything else in the file is kept
import fs from "node:fs"; import vm from "node:vm"; import path from "node:path"; import { createRequire } from "node:module"; import { fileURLToPath } from "node:url";
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."), SPECIES_FILE = path.join(ROOT, "shared/engine/ecology/ecology-species.js");

export function tank(opts = {}) {
  const render = opts.render !== false, w = {};
  if (render) { const req = createRequire(path.join(ROOT, "tools/check/")); let D; try { D = req("delaunator"); } catch (e) { throw new Error("needs delaunator: cd tools/check && npm install"); } w.Delaunator = D.default || D; }
  const g = { window: w, performance, console, atob: (x) => Buffer.from(x, "base64").toString("binary") }; vm.createContext(g);
  const files = render ? ["shared/engine/generators/part-solid.js", "shared/engine/ecology/ecology-species.js", ...(opts.outlines ? ["shared/data/core-outlines.js"] : []), "shared/engine/ecology/ecology-render.js"] : ["shared/engine/ecology/ecology-species.js"];
  for (const f of files) if (fs.existsSync(path.join(ROOT, f))) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), g);
  return { w, PS: w.PartSolid, species: w.EcologySpecies.SPECIES, R: w.EcologyRender, gl: new Proxy({}, { get: () => () => ({}) }) };
}

export function readSpecies(file = SPECIES_FILE) {
  const lines = fs.readFileSync(file, "utf8").split("\n"), at = lines.findIndex((l) => l.startsWith("const SPECIES = ["));
  if (at < 0) throw new Error("no `const SPECIES = [` line in " + path.relative(ROOT, file));
  return { file, lines, at, S: JSON.parse(lines[at].slice(16).replace(/;\s*$/, "")) };
}
export function writeSpecies(sp) { sp.lines[sp.at] = "const SPECIES = " + JSON.stringify(sp.S) + ";"; fs.writeFileSync(sp.file, sp.lines.join("\n")); }
