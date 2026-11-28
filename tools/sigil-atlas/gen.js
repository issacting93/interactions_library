// Generates Sigil Forge seals headlessly -> assets/sigils/seal-N.svg (gold line art on transparent).
// Run: node tools/sigil-atlas/gen.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '../..');
global.window = global;
for (const f of ['packages/core/kit-utils.js', 'packages/glyph/sigil-generator.js']) vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
const parts = ForgeKit.tagRoles(JSON.parse(fs.readFileSync(path.join(root, 'packages/kit/data/creature-parts.json'), 'utf8')));
const byId = Object.fromEntries(parts.map(p => [p.id, p]));
const alphabet = SigilGenerator.newAlphabet(1729);
const words = ['OVERGROWTH', 'ROOT', 'TOWER', 'MOSS', 'VIGIL', 'SPORE', 'HOLLOW', 'WARDEN'];
const GOLD = '#f2c36b';
words.forEach((w, i) => {
  const g = SigilGenerator.newSigil(1729 + i * 37, w, parts);
  g.detail = Math.max(g.detail, 0.8); g.alpha = 'forged'; g.weave = false; g.oneColor = false;
  let { svg } = SigilGenerator.generate(g, { parts, byId, alphabet });
  svg = svg.replace(/<rect width="600" height="600" fill="#14171d"\/>/, '');          // drop the plate
  svg = svg.replace(/stroke="#14171d"[^>]*?(\/?>)/g, m => m.replace(/stroke="#14171d"/, 'stroke="none"'));   // knockout strokes off
  svg = svg.replace(/#[0-9a-f]{6}\b/gi, m => m.toLowerCase() === '#14171d' ? m : GOLD);   // every colour -> gold
  fs.writeFileSync(path.join(root, 'assets/sigils', `seal-${i}.svg`), svg);
  console.log(w, g.method, g.frame.kind, svg.length);
});
