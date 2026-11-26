/* ForgeKeys: one list of a page's actions, its keys and their names, so that a shortcut is never undocumented.
   Classic script: puts ForgeKeys on window. Pages: the level editor first; the field and the tank to follow.

   const km = ForgeKeys.create({ title: 'Level editor' });
   km.add({ id: 'undo', keys: ['mod+z'], label: 'Undo', group: 'Edit', run: () => ... });
   km.add({ id: 'tool.select', keys: ['v'], label: 'Select', group: 'Tools', run, when: () => true });
   km.bind();                 // listens on window. Keys are ignored while typing in a field, unless the action says typing: true
   km.tip(button, 'undo');    // the button's tooltip and aria-keyshortcuts come from the action: "Undo (⌘Z)"
   km.help();                 // the ? overlay: every action by group, with its keys
   km.palette();              // ⌘K: find an action by name, Enter runs it

   Keys are written lower-case, modifiers first: 'mod+shift+z', 'shift+2', 'delete', 'arrowleft', '?', 'space'. 'mod' is ⌘ on a Mac and Ctrl
   elsewhere. A key may be listed more than once across actions only if their `when` never hold together.
   Styling uses the TAPE 08 tokens (packages/ui/tape08-tokens.css) where the page has them. */
(function (root) {
  "use strict";
  const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
  const NAMES = { mod: MAC ? "⌘" : "Ctrl", shift: MAC ? "⇧" : "Shift", alt: MAC ? "⌥" : "Alt", ctrl: MAC ? "⌃" : "Ctrl", enter: "↵", escape: "Esc", delete: "Del", backspace: "⌫",
    arrowleft: "←", arrowright: "→", arrowup: "↑", arrowdown: "↓", space: "Space", tab: "Tab", "=": "+", " ": "Space" };
  const pretty = (combo) => combo.split("+").map((p) => NAMES[p] || (p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1))).join(MAC ? "" : "+");
  // the combo a key event makes, in the same spelling as the actions use
  function comboOf(ev) { let k = (ev.key || "").toLowerCase(); if (k === " ") k = "space"; if (k === "+") k = "=";
    // shift+digit gives a symbol on most layouts: use the digit, so 'shift+1' works everywhere
    if (ev.shiftKey && /^Digit\d$/.test(ev.code || "")) k = ev.code.slice(5);
    const mods = []; if (MAC ? ev.metaKey : ev.ctrlKey) mods.push("mod"); if (MAC && ev.ctrlKey) mods.push("ctrl"); if (ev.altKey) mods.push("alt"); if (ev.shiftKey && k !== "?") mods.push("shift");
    return mods.concat([k]).join("+"); }
  const typingIn = (t) => !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
  let css = false;
  function style() { if (css || typeof document === "undefined") return; css = true; const s = document.createElement("style"); s.textContent = `
.fk-back { position: fixed; inset: 0; z-index: 9000; background: color-mix(in srgb, var(--t8-ground, #161618) 72%, transparent); display: grid; place-items: start center; padding: 8vh 16px 16px; }
.fk-box { width: min(720px, 100%); max-height: 80vh; overflow: auto; background: var(--t8-panel, #1D1D20); border: 1px solid var(--t8-line-3, rgba(236,232,222,.14)); border-radius: 18px; padding: 20px 22px; color: var(--t8-ink, #ECE8DE); font: 12px/1.5 var(--t8-ui, 'IBM Plex Mono', ui-monospace, monospace); }
.fk-box h2 { font: 400 13px var(--t8-display, 'Martian Mono', ui-monospace, monospace); letter-spacing: .12em; text-transform: uppercase; margin: 0 0 14px; display: flex; justify-content: space-between; align-items: baseline; }
.fk-box h2 small { color: var(--t8-ink-2, #8C8981); font: 10px var(--t8-ui, monospace); letter-spacing: .2em; }
.fk-cols { columns: 2 260px; column-gap: 28px; } .fk-g { break-inside: avoid; margin: 0 0 16px; }
.fk-g h3 { font: 500 10px var(--t8-ui, monospace); letter-spacing: .22em; text-transform: uppercase; color: var(--t8-ink-2, #8C8981); margin: 0 0 6px; }
.fk-row { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; border-bottom: 1px solid var(--t8-line-1, rgba(236,232,222,.07)); }
.fk-row.off { opacity: .45; }
kbd.fk { font: 11px var(--t8-ui, monospace); border: 1px solid var(--t8-line-4, rgba(236,232,222,.16)); border-radius: 5px; padding: 0 6px; min-width: 20px; display: inline-block; text-align: center; white-space: nowrap; }
.fk-in { width: 100%; box-sizing: border-box; min-height: 44px; background: var(--t8-ground, #161618); color: inherit; border: 1px solid var(--t8-line-4, rgba(236,232,222,.16)); border-radius: 10px; padding: 0 12px; font: 13px var(--t8-ui, monospace); margin: 0 0 10px; }
.fk-in:focus { outline: none; border-color: var(--t8-accent, #E8B04A); }
.fk-list { display: grid; gap: 2px; } .fk-item { all: unset; box-sizing: border-box; display: flex; justify-content: space-between; gap: 12px; min-height: 40px; padding: 0 12px; border-radius: 10px; cursor: pointer; align-items: center; }
.fk-item[aria-selected="true"] { background: var(--t8-accent, #E8B04A); color: var(--t8-on-signal, #161618); } .fk-item[aria-selected="true"] kbd.fk { border-color: currentColor; }
.fk-item .fk-gr { color: var(--t8-ink-2, #8C8981); margin-right: 8px; } .fk-item[aria-selected="true"] .fk-gr { color: inherit; opacity: .7; }
.fk-none { color: var(--t8-ink-2, #8C8981); padding: 8px 12px; }`; document.head.append(s); }

  function create(o) { o = o || {}; const acts = [], byId = {}, km = { title: o.title || "Shortcuts", acts };
    km.add = (a) => { a.keys = a.keys || []; a.group = a.group || "Other"; acts.push(a); byId[a.id] = a; return a; };
    km.get = (id) => byId[id];
    km.keysOf = (id) => ((byId[id] || {}).keys || []).map(pretty);
    km.label = (id) => { const a = byId[id]; if (!a) return ""; const k = km.keysOf(id)[0]; return a.label + (k ? " (" + k + ")" : ""); };
    km.tip = (el, id) => { const a = byId[id]; if (!el || !a) return el; el.title = km.label(id); if (a.keys.length) el.setAttribute("aria-keyshortcuts", a.keys.map((k) => k.replace("mod", MAC ? "Meta" : "Control").split("+").map((p) => p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1)).join("+")).join(" ")); return el; };
    km.run = (id, ev) => { const a = byId[id]; if (!a || (a.when && !a.when())) return false; a.run(ev); return true; };
    km.handle = (ev) => { const c = comboOf(ev), t = ev.target;
      if (open) { if (c === 'escape' || (c === '?' && open.dataset.kind === 'help')) { ev.preventDefault(); ev.stopPropagation(); close(); return true; } return false; }   // an open overlay takes the keys
      for (const a of acts) { if (!a.keys.includes(c)) continue; if (typingIn(t) && !a.typing) continue; if (a.when && !a.when()) continue; ev.preventDefault(); a.run(ev); return true; } return false; };
    km.bind = (target) => { (target || root).addEventListener("keydown", (ev) => { if (!ev.defaultPrevented) km.handle(ev); }, true); return km; };   // capture: the overlay hears Esc before the page
    let open = null; const close = () => { if (open) { open.remove(); open = null; } };
    km.close = close; km.isOpen = () => !!open;
    function shell(build) { style(); close(); const back = document.createElement("div"); back.className = "fk-back"; back.setAttribute("role", "dialog"); back.setAttribute("aria-modal", "true");
      const box = document.createElement("div"); box.className = "fk-box"; back.append(box); back.addEventListener("pointerdown", (ev) => { if (ev.target === back) close(); });
      back.addEventListener("keydown", (ev) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); close(); } }); build(box); document.body.append(back); open = back; return back; }
    const kbd = (k) => { const e = document.createElement("kbd"); e.className = "fk"; e.textContent = k; return e; };
    km.help = () => { if (open) return close(); shell((box) => { box.setAttribute("aria-label", km.title + ": shortcuts");
      box.innerHTML = "<h2>" + km.title + "<small>? OR ESC TO CLOSE · " + pretty("mod+k") + " TO FIND ANY ACTION</small></h2>"; const cols = document.createElement("div"); cols.className = "fk-cols"; box.append(cols);
      const groups = []; for (const a of acts) if (!a.hidden && !groups.includes(a.group)) groups.push(a.group);
      for (const g of groups) { const d = document.createElement("div"); d.className = "fk-g"; d.innerHTML = "<h3></h3>"; d.firstChild.textContent = g;
        for (const a of acts.filter((q) => q.group === g && !q.hidden)) { const r = document.createElement("div"); r.className = "fk-row" + (a.when && !a.when() ? " off" : ""); const n = document.createElement("span"); n.textContent = a.label; const ks = document.createElement("span");
          (a.keys.length ? a.keys.map(pretty) : a.note ? [a.note] : ["—"]).forEach((k, i) => { if (i) ks.append(" "); ks.append(kbd(k)); }); r.append(n, ks); d.append(r); }
        cols.append(d); }
      box.setAttribute("tabindex", "-1"); }).dataset.kind = "help"; open.firstChild.focus(); };
    km.palette = () => { if (open) return close(); let hi = 0, shown = []; shell((box) => { box.setAttribute("aria-label", "Find an action");
      const inp = document.createElement("input"); inp.className = "fk-in"; inp.placeholder = "Find an action…"; inp.setAttribute("aria-label", "Find an action"); const list = document.createElement("div"); list.className = "fk-list"; list.setAttribute("role", "listbox"); box.append(inp, list);
      const draw = () => { const q = inp.value.trim().toLowerCase(); shown = acts.filter((a) => !a.hidden && !a.noPalette && (!a.when || a.when()) && (!q || (a.label + " " + a.group).toLowerCase().includes(q))); if (hi >= shown.length) hi = Math.max(0, shown.length - 1); list.textContent = "";
        if (!shown.length) { const n = document.createElement("div"); n.className = "fk-none"; n.textContent = "Nothing matches."; list.append(n); }
        shown.forEach((a, i) => { const b = document.createElement("button"); b.type = "button"; b.className = "fk-item"; b.setAttribute("role", "option"); b.setAttribute("aria-selected", String(i === hi));
          const l = document.createElement("span"), gr = document.createElement("span"); gr.className = "fk-gr"; gr.textContent = a.group; l.append(gr, a.label); b.append(l); if (a.keys[0]) b.append(kbd(pretty(a.keys[0])));
          b.onclick = () => { close(); a.run(); }; list.append(b); }); };
      inp.addEventListener("input", () => { hi = 0; draw(); });
      inp.addEventListener("keydown", (ev) => { if (ev.key === "ArrowDown") { hi = Math.min(shown.length - 1, hi + 1); draw(); ev.preventDefault(); } else if (ev.key === "ArrowUp") { hi = Math.max(0, hi - 1); draw(); ev.preventDefault(); }
        else if (ev.key === "Enter") { const a = shown[hi]; ev.preventDefault(); if (a) { close(); a.run(); } } });
      draw(); }).dataset.kind = "palette"; open.querySelector("input").focus(); };   // focus at once: what is typed next is the search
    return km; }
  const api = { create, pretty, comboOf, MAC };
  root.ForgeKeys = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
