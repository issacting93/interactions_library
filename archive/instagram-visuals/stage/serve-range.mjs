// A tiny static file server that answers HTTP Range requests — python3 -m http.server doesn't,
// and a <video> element can't actually seek() without them (Chrome reports `seekable` as [0,0]
// and silently ignores currentTime writes). Only needed for captures that embed real video, like
// pieces/gear-lock/capture-reveal.mjs; everything else in this pipeline is pure SVG + deterministic
// seek(t), so the plain python server is still fine for stage/capture.mjs and friends.
//
//   node stage/serve-range.mjs [port]     (default 8766 — a different port from the usual 8765,
//                                          so this can run alongside `npm run serve`)
// Serves the repo root, same as `cd .. && python3 -m http.server 8765` (package.json's "serve").

import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, '..', '..');                 // Instagram_Visuals/stage/ -> repo root
const port = +(process.argv[2] || 8766);

const TYPES = {
  '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.woff': 'font/woff',
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let filePath = join(root, urlPath);
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) filePath = join(filePath, 'index.html');
  if (!existsSync(filePath)) { res.writeHead(404); res.end('not found'); return; }
  const stat = statSync(filePath);
  const type = TYPES[extname(filePath)] || 'application/octet-stream';
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m[1] ? parseInt(m[1], 10) : 0;
    const end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Content-Type': type,
    });
    createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Accept-Ranges': 'bytes', 'Content-Length': stat.size, 'Content-Type': type });
    createReadStream(filePath).pipe(res);
  }
}).listen(port, () => console.log(`serving ${root} on :${port} (Range-aware)`));
