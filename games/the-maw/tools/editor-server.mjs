#!/usr/bin/env node
// The editor's local server: `npm run editor` (from games/the-maw).
// It serves the repo over http on this machine only, and lets the editor save a level or a world straight into
// games/the-maw/levels/ or worlds/, keeping each folder's index.json right. Without it the editor still works and Save downloads a file.
//
//   npm run editor                 serve on http://127.0.0.1:5173
//   npm run editor -- --port 8080
//   node tools/editor-server.mjs --levels <dir> --worlds <dir>   (where files go; the tests use this)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");   // the repo
const FORMATS = { level: "forge-level", world: "forge-world" };
const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_BODY = 2 * 1024 * 1024;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".wasm": "application/wasm", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8", ".glb": "model/gltf-binary", ".woff2": "font/woff2" };

function send(res, code, body, type) {
  const data = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, { "content-type": type || "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(data);
}

// Write a file so a crash cannot leave half of it: to a temp name beside it, then rename over.
function writeAtomic(file, text) { const tmp = file + "." + process.pid + ".tmp"; fs.writeFileSync(tmp, text); fs.renameSync(tmp, file); }

// Put `name` in a folder's index.json if it is not there; the order stays as it was. Returns true when the index changed.
function keepIndex(dir, name) {
  const file = path.join(dir, "index.json"); let list = [];
  try { list = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { if (e.code !== "ENOENT") throw new Error("index.json in " + path.basename(dir) + " is not readable JSON; fix it first"); }
  if (!Array.isArray(list)) throw new Error("index.json in " + path.basename(dir) + " is not a list");
  if (list.includes(name)) return false;
  list.push(name); writeAtomic(file, JSON.stringify(list) + "\n"); return true;
}

// What Save sends: { kind: "level" | "world", name, text }. Checks it, writes it, keeps the index. Returns what happened, or throws an Error with a plain message.
export function saveFile(dirs, body) {
  const kind = body && body.kind, name = body && body.name, text = body && body.text;
  if (kind !== "level" && kind !== "world") throw new Error("kind must be level or world");
  if (typeof name !== "string" || !NAME.test(name)) throw new Error("the file name must be lowercase letters, digits and dashes");
  if (typeof text !== "string") throw new Error("no file text");
  let doc; try { doc = JSON.parse(text); } catch (e) { throw new Error("the text is not JSON"); }
  if (!doc || doc.format !== FORMATS[kind]) throw new Error("not a " + FORMATS[kind] + " file");
  const dir = dirs[kind]; fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name + ".json"), existed = fs.existsSync(file);
  writeAtomic(file, text.endsWith("\n") ? text : text + "\n");
  const indexed = keepIndex(dir, name);
  return { ok: true, kind, name, created: !existed, indexed, path: path.relative(ROOT, file).split(path.sep).join("/") };
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let n = 0; const parts = [];
    req.on("data", (c) => { n += c.length; if (n > limit) { reject(Object.assign(new Error("too big"), { code: 413 })); req.destroy(); } else parts.push(c); });
    req.on("end", () => resolve(Buffer.concat(parts).toString("utf8")));
    req.on("error", reject);
  });
}

// Only this machine, and only pages this server gave out: a web page from somewhere else must not be able to write into the repo.
function sameOrigin(req) {
  const host = (req.headers.host || "").replace(/:\d+$/, "");
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "[::1]") return false;
  const o = req.headers.origin;
  return !o || new URL(o).host === req.headers.host;
}

export function makeServer(opts) {
  opts = opts || {};
  const root = opts.root || ROOT, dirs = { level: opts.levels || path.join(root, "games/the-maw/levels"), world: opts.worlds || path.join(root, "games/the-maw/worlds") };
  return http.createServer(async (req, res) => {
    try {
      if (!sameOrigin(req)) return send(res, 403, { ok: false, error: "not from this machine" });
      const url = new URL(req.url, "http://x"), p = decodeURIComponent(url.pathname);
      if (p === "/__forge/ping") return send(res, 200, { ok: true, levels: path.relative(root, dirs.level), worlds: path.relative(root, dirs.world) });
      if (p === "/__forge/save") {
        if (req.method !== "POST" && req.method !== "PUT") return send(res, 405, { ok: false, error: "use POST" });
        let body; try { body = JSON.parse(await readBody(req, MAX_BODY)); } catch (e) { return send(res, e.code === 413 ? 413 : 400, { ok: false, error: e.code === 413 ? "that file is too big" : "the request was not JSON" }); }
        try { return send(res, 200, saveFile(dirs, body)); } catch (e) { return send(res, 400, { ok: false, error: e.message }); }
      }
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { ok: false, error: "read only" });
      let file = path.resolve(root, "." + path.posix.normalize("/" + p));
      if (file !== root && !file.startsWith(root + path.sep)) return send(res, 403, "no", "text/plain");
      let st; try { st = fs.statSync(file); } catch (e) { return send(res, 404, "not found", "text/plain"); }
      if (st.isDirectory()) { file = path.join(file, "index.html"); try { st = fs.statSync(file); } catch (e) { return send(res, 404, "not found", "text/plain"); } }
      if (file.split(path.sep).includes(".git")) return send(res, 404, "not found", "text/plain");
      send(res, 200, req.method === "HEAD" ? "" : fs.readFileSync(file), TYPES[path.extname(file).toLowerCase()] || "application/octet-stream");
    } catch (e) { send(res, 500, { ok: false, error: String(e && e.message || e) }); }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
  const port = +arg("port", 5173), srv = makeServer({ levels: arg("levels", null), worlds: arg("worlds", null) });
  srv.on("error", (e) => { console.error(e.code === "EADDRINUSE" ? "Port " + port + " is taken. Try: npm run editor -- --port " + (port + 1) : e.message); process.exit(1); });
  srv.listen(port, "127.0.0.1", () => {
    const base = "http://127.0.0.1:" + port + "/games/the-maw/";
    console.log("Forge editor server\n  editor  " + base + "editor/index.html\n  field   " + base + "field/index.html\n  Save in the editor now writes into games/the-maw/levels and worlds. Ctrl+C to stop.");
  });
}
