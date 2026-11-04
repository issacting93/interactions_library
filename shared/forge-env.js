// Drop-in local fallbacks for two more Claude Artifact capabilities these tools use --
// window.claude.use("db") and window.claude.use("downloads") -- so "Save"/the saved-marks
// library and SVG/PNG/JSON export also work when a tool is opened outside claude.ai (a plain
// static server, file://, or any other view that doesn't grant those capabilities). Pairs with
// forge-ai.js's fallback for the "sample" capability; same idea, same trigger (no `window.claude`).
// Data lives only in this browser's localStorage, under a per-tool prefix so one tool's saved
// items never collide with another's.
window.ForgeEnv = (function () {
  function localCollection(key) {
    const read = () => { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } };
    const write = list => { try { localStorage.setItem(key, JSON.stringify(list)); } catch {} };
    let listeners = [];
    const notify = () => {
      const list = read().slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      listeners.forEach(fn => { try { fn({ docs: list.map(d => ({ id: d.id, data: () => d })) }); } catch {} });
    };
    const api = {
      // Firestore-shaped enough for this tool's own calls: add/doc(id).delete/orderBy/onSnapshot.
      // orderBy is a no-op -- notify() always re-sorts by createdAt desc, which is the only order
      // these tools ever ask for.
      add(data) {
        const list = read(), id = "local-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        list.push({ id, ...data }); write(list); notify();
        return Promise.resolve({ id });
      },
      orderBy() { return api; },
      where() { return api; },
      onSnapshot(cb, errCb) {
        listeners.push(cb);
        try { notify(); } catch (e) { errCb?.(e); }
        return () => { listeners = listeners.filter(l => l !== cb); };
      },
      doc(id) {
        return {
          delete() { write(read().filter(d => d.id !== id)); notify(); return Promise.resolve(); },
          set(data) {
            const list = read(), i = list.findIndex(d => d.id === id);
            if (i >= 0) list[i] = { id, ...data }; else list.push({ id, ...data });
            write(list); notify();
            return Promise.resolve();
          },
          get() { const d = read().find(d => d.id === id); return Promise.resolve({ exists: !!d, id, data: () => d }); },
        };
      },
    };
    return api;
  }

  // One local "database": a localStorage-backed collection per name, namespaced to `prefix`.
  function createDb(prefix) {
    const cache = {};
    return { collection(name) { return cache[name] || (cache[name] = localCollection(`forge-db:${prefix}:${name}`)); } };
  }

  // A local "downloads" capability: triggers a normal same-origin browser download.
  function createDownloads() {
    return {
      async save({ filename, data }) {
        const ext = (filename || "").split(".").pop().toLowerCase();
        const mime = data instanceof Blob ? data.type
          : ext === "json" ? "application/json"
          : ext === "svg" ? "image/svg+xml"
          : "application/octet-stream";
        const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename || "download";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      },
    };
  }

  return { createDb, createDownloads };
})();
