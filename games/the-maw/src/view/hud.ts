// The HUD and the screens, in TAPE 08: a strip of readouts, two segmented meters, trait chips, toasts; the mutation sheet; the nest
// (the bestiary that carries over) and the end of a run. DOM, not canvas, so text stays crisp and every control is a real button.
import type { Game } from "../game";
import { need } from "../systems/feed";
import { BY_KEY, FAMILY, KIT, SPECIES, TRAIT_INFO, TRAITS, type Trait } from "../content/data";
import type { Save } from "./save";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const pad = (n: number, k = 2) => String(Math.floor(n)).padStart(k, "0");
const ROMAN = ["", "I", "II", "III"];
const FAM_OF: Record<Trait, string> = { climb: "crawlers", eyes: "fish", swim: "swifts", leap: "wyrms", sting: "drifters", cloak: "monarchs", bulk: "dragons" };
export const timecode = (t: number) => `${pad(t / 60)}:${pad(t % 60)}<small>.${Math.floor((t * 10) % 10)}</small>`;

export class Hud {
  private segE: HTMLElement[] = []; private segX: HTMLElement[] = [];
  private lastTraits = "";
  hidden = false;           // the mutation sheet put off ("later")
  onPick: (i: number) => void = () => {};
  constructor() {
    for (const [id, arr] of [["energy", this.segE], ["growth", this.segX]] as const) { const el = $(id).querySelector(".segs")!; for (let k = 0; k < 24; k++) { const s = document.createElement("i"); el.appendChild(s); arr.push(s); } }
    $("later").onclick = () => { this.hidden = true; };
    $("mutpill").onclick = () => { this.hidden = false; };
  }

  update(g: Game, run: number): void {
    const m = g.maw, ri = g.ringOf(g.player), ring = g.map.rings[ri];
    $("ri").textContent = "R" + ri; $("rn").textContent = ring.name.toUpperCase();
    $("tc").innerHTML = timecode(g.stats.t); $("run").textContent = `RUN ${pad(run, 3)} · SEED ${pad(g.seed, 4)}`;
    $("lv").textContent = pad(m.level);
    const e = Math.max(0, m.energy), x = Math.min(1, m.xp / need(m.level));
    this.segE.forEach((s, k) => s.classList.toggle("on", k < Math.ceil(e * 24))); this.segX.forEach((s, k) => s.classList.toggle("on", k < Math.floor(x * 24)));
    $("energy").classList.toggle("low", e < 0.25);
    $("ev").textContent = String(Math.round(e * 100)); $("xv").textContent = `${Math.round(x * 100)}`;
    $("status").className = "status " + (m.state === "dead" ? "" : m.strike || m.coil > 0 ? "rec" : "play");
    $("st").textContent = { walk: "WALK", swim: "SWIM", climb: "CLIMB", leap: "LEAP", dead: "DEAD", won: "APEX" }[m.state];
    const tk = TRAITS.map((t) => t + m.traits[t]).join();
    if (tk !== this.lastTraits) { this.lastTraits = tk;
      $("traits").innerHTML = TRAITS.filter((t) => m.traits[t] > 0).map((t) => `<span class="chip"><b>${TRAIT_INFO[t].name.toUpperCase()}</b>${pips(m.traits[t])}</span>`).join("") || `<span class="chip dim">NO TRAITS · EAT TO MUTATE</span>`; }
    // the mutation sheet
    const off = !!g.offer;
    $("mutate").classList.toggle("open", off && !this.hidden); $("mutpill").classList.toggle("open", off && this.hidden);
    if (off) $("mutpill").textContent = `MUTATE · ${m.owed}`;
    if (!off) this.hidden = false;
  }

  offer(g: Game): void {
    const m = g.maw, o = g.offer; if (!o) return;
    $("mlv").textContent = `LEVEL ${pad(m.level)} · ${m.owed > 1 ? m.owed + " TO TAKE · " : ""}FROM WHAT YOU ATE`;
    $("cards").innerHTML = o.map((c, i) => { const info = TRAIT_INFO[c.trait], fam = FAMILY[c.family];
      return `<button class="card" data-i="${i}"><span class="badge">${i + 1}</span><span class="nm">${info.name.toUpperCase()} <em>${ROMAN[c.rank]}</em></span>
        <span class="from">FROM ${(fam?.name ?? c.family).toUpperCase()}</span><span class="does">${info.ranks[c.rank - 1]}</span>
        ${info.gate && c.rank === 1 ? `<span class="opens">OPENS · ${info.gate.toUpperCase()}</span>` : `<span class="opens dim">${pips(c.rank)}</span>`}</button>`; }).join("");
    $("cards").querySelectorAll<HTMLButtonElement>(".card").forEach((b) => (b.onclick = () => this.onPick(+b.dataset.i!)));
  }

  toast(text: string, kind = ""): void {
    const el = document.createElement("div"); el.className = "toast " + kind; el.innerHTML = text; $("toasts").prepend(el);
    setTimeout(() => el.classList.add("out"), 2600); setTimeout(() => el.remove(), 3000);
    const all = $("toasts").children; for (let k = 3; k < all.length; k++) all[k].remove();
  }

  // the events a run emits, said in the HUD's words
  listen(g: Game): void {
    g.ev.on("level", (e) => this.toast(`LEVEL <b>${pad(e.level)}</b>`, "amber"));
    g.ev.on("mutated", (e) => this.toast(`+ ${e.trait.toUpperCase()} <b>${ROMAN[e.rank]}</b>`, "amber"));
    g.ev.on("climbed", (e) => this.toast(`↑ <b>${g.map.rings[e.to].name.toUpperCase()}</b>`, "amber"));
    g.ev.on("caught", () => this.toast("BITTEN · <b>−ENERGY</b>", "rec"));
    g.ev.on("apex", (e) => this.toast(`APEX TAKEN · <b>${(BY_KEY[e.species]?.name ?? e.species).toUpperCase()}</b>`, "amber"));
    g.ev.on("gate", (e) => {
      const m = g.maw, fam = (t: Trait) => (FAMILY[FAM_OF[t]]?.name ?? FAM_OF[t]).toUpperCase();
      const say: Record<string, string> = {
        climb: `TOWER · NEEDS <b>CLIMB</b> · EAT ${fam("climb")}`,
        eyes: `STAIR · NEEDS <b>EYES</b> · EAT ${fam("eyes")}`,
        tower: m.traits.climb > 0 ? "WALL · CLIMB AT A <b>TOWER</b>" : `WALL · FIND A <b>TOWER</b> · GROW CLIMB`,
        stair: m.traits.eyes > 0 ? "WALL · TAKE A <b>STAIR</b>" : `WALL · THE WAY IS HIDDEN · <b>EYES</b>`,
        "swim or leap": `MOAT · <b>SWIM</b> (${fam("swim")}) OR <b>LEAP</b> (${fam("leap")})`,
      };
      this.toast(say[e.need] ?? e.need.toUpperCase());
    });
  }

  nest(save: Save, seed: number): void {
    $("n-runs").textContent = pad(save.runs, 3); $("n-deep").textContent = "R" + save.best.ring; $("n-lv").textContent = pad(save.best.level); $("n-won").textContent = pad(save.won);
    $("n-seed").textContent = pad(seed, 4);
    const known = new Set(save.seen), fams = KIT.families.filter((f) => SPECIES.some((s) => s.family === f.id));
    let seen = 0;
    $("bestiary").innerHTML = fams.map((f) => {
      const sps = SPECIES.filter((s) => s.family === f.id && s.key !== "maw");
      return `<div class="fam"><div class="fh"><span>${f.name.toUpperCase()}</span><em>${TRAIT_INFO[f.trait]?.name.toUpperCase() ?? ""}</em></div>${sps.map((s) => {
        const n = save.eaten[s.key] ?? 0, k = known.has(s.key); if (k) seen++;
        return `<div class="row ${k ? "" : "unk"}"><span>${k ? s.name : "— — —"}</span><b>${n ? "×" + n : k ? "SEEN" : ""}</b></div>`; }).join("")}</div>`;
    }).join("");
    $("n-seen").textContent = `${pad(seen)} / ${pad(SPECIES.length)}`;
  }

  end(g: Game, save: Save, fresh: number, run: number): void {
    const m = g.maw, won = m.state === "won";
    $("e-title").textContent = won ? "THE APEX FALLS" : "RUN ENDED"; $("e-run").textContent = `RUN ${pad(run, 3)} · SEED ${pad(g.seed, 4)}`;
    $("e-cause").textContent = won ? "You ate the dragon at the centre." : g.cause + ".";
    $("e-t").innerHTML = timecode(g.stats.t); $("e-lv").textContent = pad(m.level); $("e-ring").textContent = "R" + g.stats.maxRing; $("e-meals").textContent = pad(g.stats.meals, 3);
    $("e-new").textContent = fresh ? `+${fresh} NEW IN THE BESTIARY` : "NOTHING NEW IN THE BESTIARY";
    $("e-traits").innerHTML = TRAITS.filter((t) => m.traits[t] > 0).map((t) => `<span class="chip"><b>${TRAIT_INFO[t].name.toUpperCase()}</b>${pips(m.traits[t])}</span>`).join("") || `<span class="chip dim">NO TRAITS</span>`;
    void save;
  }
}
const pips = (n: number) => `<i class="pips">${[1, 2, 3].map((k) => `<u class="${k <= n ? "on" : ""}"></u>`).join("")}</i>`;
