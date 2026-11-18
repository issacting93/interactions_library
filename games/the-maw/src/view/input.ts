// Input → the Maw's intent (a move vector and whether the bite is held). Keys on a desktop; on a phone, a stick under the left
// thumb wherever it lands and a bite button under the right. The view writes intent; the sim reads it at the next step.
export interface Intent { x: number; y: number; hold: boolean }

export class Input {
  readonly intent: Intent = { x: 0, y: 0, hold: false };
  private keys = new Set<string>();
  private stick: { id: number; ox: number; oy: number; x: number; y: number } | null = null;
  private biteIds = new Set<number>();
  touch = false;
  onKey: (k: string) => void = () => {};
  constructor(private zone: HTMLElement, private stickEl: HTMLElement, private biteEl: HTMLElement) {
    addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase(); if (e.repeat) return;
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
      this.keys.add(k); this.onKey(k);
    });
    addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener("blur", () => { this.keys.clear(); this.stick = null; this.biteIds.clear(); });
    zone.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") { this.biteIds.add(e.pointerId); return; }   // a mouse click is a bite
      this.touch = true; document.body.classList.add("touch");
      if (e.clientX < innerWidth * 0.55 && !this.stick) { this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY }; }
      else this.biteIds.add(e.pointerId);
      zone.setPointerCapture(e.pointerId); e.preventDefault();
    });
    zone.addEventListener("pointermove", (e) => { if (this.stick && e.pointerId === this.stick.id) { this.stick.x = e.clientX; this.stick.y = e.clientY; } });
    const up = (e: PointerEvent) => { if (this.stick?.id === e.pointerId) this.stick = null; this.biteIds.delete(e.pointerId); };
    zone.addEventListener("pointerup", up); zone.addEventListener("pointercancel", up);
    biteEl.addEventListener("pointerdown", (e) => { this.touch = true; document.body.classList.add("touch"); this.biteIds.add(e.pointerId); biteEl.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation(); });
    biteEl.addEventListener("pointerup", up); biteEl.addEventListener("pointercancel", up);
  }
  read(): Intent {
    const k = this.keys, i = this.intent;
    let x = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
    let y = (k.has("s") || k.has("arrowdown") ? 1 : 0) - (k.has("w") || k.has("arrowup") ? 1 : 0);
    if (this.stick) { const dx = this.stick.x - this.stick.ox, dy = this.stick.y - this.stick.oy, d = Math.hypot(dx, dy), R = 56;
      if (d > R) { this.stick.ox = this.stick.x - dx / d * R; this.stick.oy = this.stick.y - dy / d * R; }
      x = dx / R; y = dy / R; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } if (l < 0.12) x = y = 0;
      this.stickEl.style.display = "block"; this.stickEl.style.transform = `translate(${this.stick.ox}px, ${this.stick.oy}px)`;
      (this.stickEl.firstElementChild as HTMLElement).style.transform = `translate(${Math.max(-1, Math.min(1, dx / R)) * 28}px, ${Math.max(-1, Math.min(1, dy / R)) * 28}px)`;
    } else this.stickEl.style.display = "none";
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    i.x = x; i.y = y; i.hold = k.has(" ") || k.has("j") || k.has("k") || this.biteIds.size > 0;
    this.biteEl.classList.toggle("on", i.hold);
    return i;
  }
}
