import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const V = path.join(path.dirname(new URL(import.meta.url).pathname), 'node_modules');
export const BASE = process.env.CAPTURE_BASE || 'http://localhost:8731';
const MIME = { '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.woff2':'font/woff2', '.json':'application/json' };
const FONTS = {
  'IBM Plex Mono': w => `${V}/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-${w}-normal.woff2`,
  'IBM Plex Sans': w => `${V}/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-${w}-normal.woff2`,
  'Barlow': w => `${V}/@fontsource/barlow/files/barlow-latin-${w}-normal.woff2`,
  'Barlow Condensed': w => `${V}/@fontsource/barlow-condensed/files/barlow-condensed-latin-${w}-normal.woff2`,
};
function fontCss(url) {
  const u = new URL(url); let css = '';
  for (const fam of u.searchParams.getAll('family')) {
    const name = fam.split(':')[0];
    if (name === 'Martian Mono') {
      css += `@font-face{font-family:'Martian Mono';font-style:normal;font-weight:100 800;font-stretch:75% 112.5%;src:url(https://fonts.gstatic.com/local${V}/@fontsource-variable/martian-mono/files/martian-mono-latin-standard-normal.woff2) format('woff2');}\n`;
    } else if (FONTS[name]) {
      for (const w of [300,400,500,600,700]) { const f = FONTS[name](w); if (fs.existsSync(f)) css += `@font-face{font-family:'${name}';font-style:normal;font-weight:${w};src:url(https://fonts.gstatic.com/local${f}) format('woff2');}\n`; }
    }
  }
  return css;
}
function local(url) {
  let m;
  if ((m = url.match(/cdn\.jsdelivr\.net\/npm\/three@0\.(160|169|128)\.0\/(.*)$/))) return `${V}/three${m[1]}/${m[2]}`;
  if (/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js/.test(url)) return `${V}/three128/build/three.min.js`;
  if (/animejs\/3\.2\.2\/anime\.min\.js/.test(url)) return `${V}/animejs3/lib/anime.min.js`;
  if (/npm\/animejs@4\/\+esm/.test(url)) return `${V}/animejs4/dist/bundles/anime.esm.min.js`;
  if (/clipper-lib@6\.4\.2\/clipper\.js/.test(url)) return `${V}/clipper-lib/clipper.js`;
  if ((m = url.match(/fonts\.gstatic\.com\/local(\/.*)$/))) return m[1];
  return null;
}
export async function open(url, { w=1280, h=800, clock=false, scale=1 } = {}) {
  const browser = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'] });
  const ctx = await browser.newContext({ viewport:{width:w,height:h}, deviceScaleFactor:scale });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PE ' + e.message.slice(0,200)));
  await ctx.route(u => !u.href.startsWith(BASE) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), async route => {
    const u = route.request().url();
    if (u.includes('fonts.googleapis.com')) return route.fulfill({ status:200, contentType:'text/css', body: fontCss(u) });
    const f = local(u.split('?')[0].includes('+esm') ? u : u.split('?')[0]);
    if (f && fs.existsSync(f)) return route.fulfill({ status:200, contentType: MIME[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f), headers:{'access-control-allow-origin':'*'} });
    errs.push('MISS ' + u.slice(0,140)); return route.abort();
  });
  if (clock) await page.clock.install();
  await page.goto(url.startsWith('http') ? url : BASE + url, { waitUntil:'load', timeout:90000 });
  return { browser, page, errs };
}
// advance fake time in steps (clock must be installed)
export async function run(page, ms, step=40) { for (let t=0; t<ms; t+=step) await page.clock.runFor(step); }
export async function gif(page, out, { frames=60, step=40, clip=null, width=640, fps=25, colors=48 } = {}) {
  const dir = fs.mkdtempSync('/tmp/gif-');
  for (let i=0;i<frames;i++) { await page.clock.runFor(step); await page.screenshot({ path:`${dir}/f${String(i).padStart(4,'0')}.png`, ...(clip?{clip}:{}) }); }
  execFileSync('ffmpeg', ['-y','-loglevel','error','-framerate',String(fps),'-i',`${dir}/f%04d.png`,'-vf',`scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`, out]);
  fs.rmSync(dir, { recursive:true });
  return fs.statSync(out).size;
}
