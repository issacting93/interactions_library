// What carries between runs (the nest): how many runs, the deepest ring, and the bestiary (what you have seen and eaten).
export interface Save { runs: number; best: { ring: number; level: number; t: number }; eaten: Record<string, number>; seen: string[]; won: number }
const KEY = "the-maw-save-v1";
const fresh = (): Save => ({ runs: 0, best: { ring: 0, level: 1, t: 0 }, eaten: {}, seen: [], won: 0 });
export function load(): Save { try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); return s ? { ...fresh(), ...s } : fresh(); } catch { return fresh(); } }
export function store(s: Save): void { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: the nest forgets */ } }
