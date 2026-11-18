// The systems, in the one order they always run. A system is a named function of (dt); it can be gated by `when`, switched off,
// and is timed, so "what is slow" and "what runs when" are answered by reading one list.
export interface System { name: string; run: (dt: number) => void; when?: () => boolean; on: boolean; ms: number; calls: number }
export class Schedule {
  readonly systems: System[] = [];
  add(name: string, run: (dt: number) => void, when?: () => boolean): this { this.systems.push({ name, run, when, on: true, ms: 0, calls: 0 }); return this; }
  get(name: string): System | undefined { return this.systems.find((s) => s.name === name); }
  run(dt: number): void {
    const now = typeof performance !== "undefined" ? () => performance.now() : () => 0;
    for (const s of this.systems) { if (!s.on || (s.when && !s.when())) continue; const t0 = now(); s.run(dt); s.ms += now() - t0; s.calls++; }
  }
  // average milliseconds a call, by system (and reset)
  report(): Record<string, number> { const out: Record<string, number> = {}; for (const s of this.systems) { out[s.name] = s.calls ? +(s.ms / s.calls).toFixed(3) : 0; s.ms = 0; s.calls = 0; } return out; }
}
