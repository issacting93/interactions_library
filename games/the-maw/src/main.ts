// The browser shell: the nest, a run, the end of it. One Game per run; the view and the HUD read it; input writes the Maw's intent.
import { Game } from "./game";
import { choose, offers } from "./systems/feed";
import { View } from "./view/render";
import { Input } from "./view/input";
import { Hud } from "./view/hud";
import { load, store } from "./view/save";

const $ = (id: string) => document.getElementById(id)!;
const view = new View($("cv") as HTMLCanvasElement), hud = new Hud(), input = new Input($("zone"), $("stick"), $("bite"));
let save = load(), seed = Math.floor(Math.random() * 9999) + 1, game: Game | null = null, mode: "nest" | "run" | "dying" | "end" = "nest", run = 0;
let offerKey = "";

function show(m: typeof mode): void {
  mode = m; document.body.dataset.mode = m;
  if (m === "nest") hud.nest(save, seed);
}
function begin(): void {
  game = new Game(seed); run = save.runs + 1; view.feet = []; hud.listen(game);
  const p = game.w.get(game.player, "pos")!; view.cx = p.x; view.cy = p.y; view.zoom = 0;
  hud.toast(`<b>THE FLOOR</b> · EAT WHAT IS SMALLER · GO INWARD`);
  show("run");
}
function finish(g: Game): void {
  const before = new Set(save.seen), m = g.maw;
  for (const s of g.seen) before.add(s);
  const fresh = [...g.seen].filter((s) => !save.seen.includes(s)).length;
  for (const [k, n] of Object.entries(m.ate)) save.eaten[k] = (save.eaten[k] ?? 0) + n;
  save.seen = [...before]; save.runs++; if (m.state === "won") save.won++;
  if (g.stats.maxRing > save.best.ring || (g.stats.maxRing === save.best.ring && m.level > save.best.level)) save.best = { ring: g.stats.maxRing, level: m.level, t: g.stats.t };
  store(save); hud.end(g, save, fresh, run); show("end");
}

$("begin").onclick = begin;
$("again").onclick = () => { seed = Math.floor(Math.random() * 9999) + 1; begin(); };
$("tonest").onclick = () => show("nest");
$("quit").onclick = () => { if (game && (mode === "run" || mode === "dying")) { game.cause = "Left the run"; game.maw.state = "dead"; finish(game); } };
$("seed-").onclick = () => { seed = seed > 1 ? seed - 1 : 9999; hud.nest(save, seed); };
$("seed+").onclick = () => { seed = seed < 9999 ? seed + 1 : 1; hud.nest(save, seed); };
$("reroll").onclick = () => { seed = Math.floor(Math.random() * 9999) + 1; hud.nest(save, seed); };
hud.onPick = (i) => { if (game) { choose(game, i); offerKey = ""; } };
input.onKey = (k) => {
  if (mode === "nest" && k === "enter") begin();
  else if (mode === "end" && k === "enter") $("again").click();
  else if (mode === "run" && game?.offer && !hud.hidden) { const i = "123".indexOf(k); if (i >= 0 && i < game.offer.length) hud.onPick(i); if (k === "escape") hud.hidden = true; }
  else if (mode === "run" && game?.offer && hud.hidden && k === "m") hud.hidden = false;
};

addEventListener("resize", () => view.resize()); view.resize();
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (game && mode !== "nest") {
    const g = game, m = g.maw;
    if (mode === "run") {
      const it = input.read(); m.input.x = it.x; m.input.y = it.y; m.holding = it.hold && !(g.offer && !hud.hidden);
      g.clock.scale = document.hidden ? 0 : g.offer && !hud.hidden ? 0.12 : 1;
      const n = g.clock.advance(dt); for (let k = 0; k < n; k++) g.step();
      const key = g.offer ? g.offer.map((o) => o.trait + o.rank).join() + m.owed : ""; if (key !== offerKey) { offerKey = key; hud.offer(g); }
      hud.update(g, run);
      if (m.state === "dead" || m.state === "won") { mode = "dying"; setTimeout(() => game === g && mode === "dying" && finish(g), m.state === "won" ? 1600 : 1000); }
    }
    view.draw(g, dt * (mode === "run" ? 1 : 0.3));
  }
  requestAnimationFrame(frame);
}
show("nest");
requestAnimationFrame(frame);
// headless checks reach in here
(window as unknown as { maw: unknown }).maw = { get game() { return game; }, begin, view, input, hud, setSeed: (s: number) => { seed = s; }, offers };
