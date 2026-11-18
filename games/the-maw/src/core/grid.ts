// A uniform spatial hash, rebuilt once a step: who is near a point, without asking everyone.
export class Grid {
  private cells = new Map<number, number[]>();
  constructor(readonly cell: number) {}
  private key(i: number, j: number) { return ((i + 4096) << 13) ^ (j + 4096); }
  clear(): void { this.cells.clear(); }
  insert(e: number, x: number, y: number): void {
    const k = this.key(Math.floor(x / this.cell), Math.floor(y / this.cell));
    const c = this.cells.get(k); if (c) c.push(e); else this.cells.set(k, [e]);
  }
  // every entity in the cells touching a circle (the caller checks the exact distance)
  near(x: number, y: number, r: number, out: number[] = []): number[] {
    out.length = 0;
    const i0 = Math.floor((x - r) / this.cell), i1 = Math.floor((x + r) / this.cell), j0 = Math.floor((y - r) / this.cell), j1 = Math.floor((y + r) / this.cell);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const c = this.cells.get(this.key(i, j)); if (c) for (const e of c) out.push(e); }
    return out;
  }
}
