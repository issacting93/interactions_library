// The classic-script face of the run layer: the tank page loads packages/maw/maw-run.js (built from here) and gets
// window.MawRun. Built by `npm run build`; do not edit the built file.
import * as Run from "./run";
(window as unknown as { MawRun: typeof Run }).MawRun = Run;
