// The shared engine's JavaScript, checked for mistakes that are bugs whatever the style: duplicate keys, unreachable code, a value
// assigned to itself, a constant reassigned, comparisons that are always true or false. Style is not checked (the code has its own).
// Run at the repo root: games/the-maw/node_modules/.bin/eslint shared/engine (eslint is a dev dependency of games/the-maw). The classic scripts share globals through window, so undefined names are not checked here.
export default [
  { ignores: ["shared/engine/ecology/eco-engine.js", "**/node_modules/**", "**/*.min.js", "**/vendor/**"] },
  {
    files: ["shared/engine/**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "script" },
    linterOptions: { reportUnusedDisableDirectives: false },
    rules: {
      "no-dupe-keys": "error", "no-dupe-args": "error", "no-duplicate-case": "error", "no-dupe-else-if": "error", "no-unreachable": "error",
      "no-self-assign": "error",   // not no-self-compare: x !== x is how this code asks for NaN
      "no-const-assign": "error", "no-func-assign": "error", "no-import-assign": "error",
      "no-unsafe-finally": "error", "no-unsafe-negation": "error", "use-isnan": "error", "valid-typeof": "error", "no-compare-neg-zero": "error",
      "no-constant-binary-expression": "error", "no-sparse-arrays": "error", "no-loss-of-precision": "error", "no-setter-return": "error",
    },
  },
  // the files written as ES modules (the rest are classic scripts)
  { files: ["shared/engine/motion/looks.js", "shared/engine/motion/solid-look.js", "shared/engine/motion/walker-brain.js", "shared/engine/motion/walker.js", "shared/engine/svg-utils.js"], languageOptions: { sourceType: "module" } },
  // generated species data: its long numbers are as drawn, rounding them is harmless
  { files: ["shared/engine/ecology/ecology-species.js"], rules: { "no-loss-of-precision": "off" } },
];
