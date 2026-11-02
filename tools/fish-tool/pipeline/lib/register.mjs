// Splices a rigged species entry into shared/ecology-species.js (loaded by Cybernetic Ecology.html
// and shared/ecology-sim.js before their own scripts): appends to the SPECIES array, and (if
// `ecology` behavior fields are given) adds
// matching BEH/ECO entries so the new species gets a real population default, diet, and flee style
// instead of silently falling back to the generic PLAIN behavior (which the live code already does
// safely for any species key missing from BEH -- see `sp.beh = BEH[sp.key] || PLAIN` -- so the
// BEH/ECO step is optional, not required for the species to render and swim).
//
// Edits the multi-MB data file by string-splicing around located boundaries, never by loading it
// through an LLM context window or a DOM parser.

import fs from 'node:fs';

// String-literal-aware brace matcher: given the index of an opening `{`, returns the index of its
// matching `}`. Used to find the end of `const BEH = { ... }` / `const ECO = { ... }` without
// assuming anything about their internal formatting.
function matchBrace(text, openIdx) {
  let depth = 0, inStr = null;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  throw new Error('matchBrace: no matching close brace found');
}

function insertBeforeClose(text, declPattern, entryLine) {
  const m = text.match(declPattern);
  if (!m) throw new Error(`register: couldn't find ${declPattern}`);
  const openIdx = m.index + m[0].length - 1; // declPattern must end in the opening "{"
  const closeIdx = matchBrace(text, openIdx);
  return text.slice(0, closeIdx) + entryLine + text.slice(closeIdx);
}

export function registerSpecies(filePath, speciesEntry) {
  let text = fs.readFileSync(filePath, 'utf8');
  const { _ecology, ...liveEntry } = speciesEntry;

  // 1. SPECIES array: insert the new compact JSON object right before the array's closing `];`.
  const specM = text.match(/const SPECIES = \[/);
  if (!specM) throw new Error('register: const SPECIES = [ not found');
  const openIdx = specM.index + specM[0].length - 1;
  const closeIdx = matchBraceArray(text, openIdx);
  const json = JSON.stringify(liveEntry);
  text = text.slice(0, closeIdx) + ',' + json + text.slice(closeIdx);

  // 2. BEH[key] (optional) -- steering/personality. Falls back to PLAIN if omitted.
  if (_ecology && _ecology.beh) {
    const behLine = `\n  ${JSON.stringify(speciesEntry.key)}: ${jsObjectLiteral(_ecology.beh)},`;
    text = insertBeforeClose(text, /const BEH = \{/, behLine);
  }
  // 3. ECO[key] (optional) -- population default, diet, flee style.
  if (_ecology && _ecology.eco) {
    const ecoLine = `\n  ${JSON.stringify(speciesEntry.key)}: ${jsObjectLiteral(_ecology.eco)},`;
    text = insertBeforeClose(text, /const ECO = \{/, ecoLine);
  }

  fs.writeFileSync(filePath, text);
  return { key: speciesEntry.key, bytesWritten: text.length };
}

// Replaces an ALREADY-registered species' entry in place (SPECIES + BEH + ECO, whichever exist),
// instead of appending a new one -- for re-running a recipe after fixing it, not for first-time
// registration (use registerSpecies for that; it throws on a duplicate key via run.mjs's own flow
// only if you re-dry-run, it does NOT check for an existing key, so calling registerSpecies again
// on a key that's already present would duplicate it -- updateSpecies is the correct call for a fix).
export function updateSpecies(filePath, speciesEntry) {
  let text = fs.readFileSync(filePath, 'utf8');
  const { _ecology, ...liveEntry } = speciesEntry;
  const key = speciesEntry.key;

  // 1. SPECIES array entry: find by its leading `"key":"<key>"` marker (always the object's first
  // field, right after its opening `{`, so the nearest preceding `{` is that object's own start).
  const marker = `"key":${JSON.stringify(key)}`;
  const markerIdx = text.indexOf(marker);
  if (markerIdx === -1) throw new Error(`updateSpecies: "${key}" not found in SPECIES -- use registerSpecies for a new species`);
  const objStart = text.lastIndexOf('{', markerIdx);
  const objEnd = matchBrace(text, objStart);
  text = text.slice(0, objStart) + JSON.stringify(liveEntry) + text.slice(objEnd + 1);

  // 2. BEH[key] / 3. ECO[key]: replace in place if present, matching either quoted ("key": for a
  // key with a hyphen) or bare (key: for a plain identifier) style -- both exist in this file.
  for (const [constName, data] of [['BEH', _ecology?.beh], ['ECO', _ecology?.eco]]) {
    if (!data) continue;
    const declM = text.match(new RegExp(`const ${constName} = \\{`));
    if (!declM) throw new Error(`updateSpecies: const ${constName} = { not found`);
    const blockStart = declM.index + declM[0].length - 1;
    const blockEnd = matchBrace(text, blockStart);
    const entryRe = new RegExp(`(?:\\b${key}\\s*:|${JSON.stringify(key)}\\s*:)\\s*\\{`);
    const sub = text.slice(blockStart, blockEnd);
    const m = sub.match(entryRe);
    if (!m) throw new Error(`updateSpecies: "${key}" not found in ${constName} -- pass a matching _ecology shape, or omit it to leave the existing entry untouched`);
    const entryOpen = blockStart + m.index + m[0].length - 1;
    const entryClose = matchBrace(text, entryOpen);
    text = text.slice(0, entryOpen) + jsObjectLiteral(data) + text.slice(entryClose + 1);
  }

  fs.writeFileSync(filePath, text);
  return { key, bytesWritten: text.length };
}

function matchBraceArray(text, openBracketIdx) {
  // same idea as matchBrace but for [ ... ]
  let depth = 0, inStr = null;
  for (let i = openBracketIdx; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) return i; }
  }
  throw new Error('matchBraceArray: no matching close bracket found');
}

// BEH/ECO entries in the source use bare (unquoted) object-literal syntax, not JSON -- this keeps
// the inserted line visually consistent with its neighbors instead of switching to "key": style.
function jsObjectLiteral(obj) {
  const parts = Object.entries(obj).map(([k, v]) => `${k}: ${jsValue(v)}`);
  return `{ ${parts.join(', ')} }`;
}
function jsValue(v) {
  if (Array.isArray(v)) return `[${v.map(jsValue).join(', ')}]`;
  if (v && typeof v === 'object') return jsObjectLiteral(v);
  if (typeof v === 'string') return JSON.stringify(v);
  return String(v);
}
