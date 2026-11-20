// build: src/ + brand/ -> dist/ (deploy output). Usage: node scripts/build.mjs [--register file] [--out dir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { gateScan } from './gate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = n => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
const OUT = path.resolve(arg('--out') || path.join(ROOT, 'dist'));
const REGFILE = path.resolve(arg('--register') || path.join(ROOT, 'src/register.json'));
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const log = (...a) => console.log('[build]', ...a);

/* ---------- register: stated | absent | unconfirmed ---------- */
function normalise(raw) {
  const reg = JSON.parse(JSON.stringify(raw));
  const down = (k, why) => { console.warn(`[build] register.${k}: ${why} -> unconfirmed (renders inert)`); reg[k].state = 'unconfirmed'; };
  if (reg.ca.state === 'stated' && !BASE58.test(reg.ca.value || '')) down('ca', 'not a base58 Solana address');
  const hostOk = { x: /^(x|twitter)\.com$/, github: /^github\.com$/ };
  for (const k of ['x', 'github']) {
    if (reg[k].state !== 'stated') continue;
    try { const u = new URL(reg[k].url); if (u.protocol !== 'https:' || !hostOk[k].test(u.hostname.replace(/^www\./, ''))) throw 0; } catch { down(k, 'url invalid'); }
  }
  for (const k of ['ca', 'x', 'github']) if (reg[k].state !== 'stated') { delete reg[k].value; delete reg[k].url; }
  return reg;
}
const reg = normalise(JSON.parse(fs.readFileSync(REGFILE, 'utf8')));
const handle = url => { const p = new URL(url).pathname.split('/').filter(Boolean); return p.join('/'); };

/* ---------- image tooling ---------- */
const readPNG = f => PNG.sync.read(fs.readFileSync(f));
function crop(img, x0, y0, w, h) {
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x0 + x, sy = y0 + y, o = (y * w + x) * 4;
    if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) { out.data[o] = out.data[o + 1] = out.data[o + 2] = out.data[o + 3] = 0; continue; }
    const s = (sy * img.width + sx) * 4; for (let k = 0; k < 4; k++) out.data[o + k] = img.data[s + k];
  }
  return out;
}
/* area-weighted resample; premultiplied alpha so pure-black transparent pixels cannot bleed into edges */
function resize(img, nw, nh, premult) {
  const out = new PNG({ width: nw, height: nh });
  const sx = img.width / nw, sy = img.height / nh;
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const x0 = x * sx, x1 = x0 + sx, y0 = y * sy, y1 = y0 + sy;
    let r = 0, g = 0, b = 0, a = 0, wsum = 0;
    for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) {
      const wy = Math.min(yy + 1, y1) - Math.max(yy, y0);
      for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
        const w = wy * (Math.min(xx + 1, x1) - Math.max(xx, x0));
        const i = (Math.min(yy, img.height - 1) * img.width + Math.min(xx, img.width - 1)) * 4;
        const pa = img.data[i + 3] / 255; const m = premult ? pa : 1;
        r += img.data[i] * m * w; g += img.data[i + 1] * m * w; b += img.data[i + 2] * m * w; a += pa * w; wsum += w;
      }
    }
    const o = (y * nw + x) * 4; const den = premult ? (a || 1) : wsum;
    out.data[o] = Math.round(r / den); out.data[o + 1] = Math.round(g / den); out.data[o + 2] = Math.round(b / den); out.data[o + 3] = Math.round(255 * a / wsum);
  }
  return out;
}
const writePNG = (f, png) => fs.writeFileSync(f, PNG.sync.write(png, { colorType: 6 }));

/* ---------- clean + assemble ---------- */
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });

const brandDir = path.join(ROOT, 'brand');
const brandFiles = fs.readdirSync(brandDir);
const findBrand = pred => brandFiles.find(pred);
const tFile = findBrand(f => /\.\.png$/i.test(f));            // RGBA transparent version
const oFile = findBrand(f => /\.png$/i.test(f) && f !== tFile); // opaque orange version
if (!tFile || !oFile) throw new Error('brand/ must hold the transparent and the opaque PNG');
const T = readPNG(path.join(brandDir, tFile)), O = readPNG(path.join(brandDir, oFile));
log(`brand transparent: ${tFile} ${T.width}x${T.height}; opaque: ${oFile} ${O.width}x${O.height}`);

// face region of the transparent logo = first run of rows with alpha > 8
const rowHas = y => { for (let x = 0; x < T.width; x++) if (T.data[(y * T.width + x) * 4 + 3] > 8) return true; return false; };
let ya = -1, yb = -1;
for (let y = 0; y < T.height; y++) { if (rowHas(y)) { if (ya < 0) ya = y; yb = y; } else if (ya >= 0) break; }
let xa = T.width, xb = -1;
for (let y = ya; y <= yb; y++) for (let x = 0; x < T.width; x++) if (T.data[(y * T.width + x) * 4 + 3] > 8) { xa = Math.min(xa, x); xb = Math.max(xb, x); }
const fw = xb - xa + 1, fh = yb - ya + 1;
log(`face bbox x${xa}-${xb} y${ya}-${yb} (${fw}x${fh})`);

// lops-mark.png: transparent face, square crop, premultiplied resize to 128
const side = Math.round(Math.max(fw, fh) * 1.3);
const cx = Math.round((xa + xb) / 2), cy = Math.round((ya + yb) / 2);
const markSq = crop(T, Math.round(cx - side / 2), Math.round(cy - side / 2), side, side);
writePNG(path.join(OUT, 'assets/lops-mark.png'), resize(markSq, 128, 128, true));
// lops-logo.png: opaque orange brand tile at 640
writePNG(path.join(OUT, 'assets/lops-logo.png'), resize(O, 640, 640, false));
log('wrote assets/lops-mark.png (premultiplied) and assets/lops-logo.png');

/* ---------- favicon: traced from the face mask on a 32x32 grid ---------- */
function traceFavicon() {
  const N = 32, pad = 4, span = N - pad * 2, scale = span / Math.max(fw, fh);
  const gw = Math.round(fw * scale), gh = Math.round(fh * scale);
  const ox = Math.floor((N - gw) / 2), oy = Math.floor((N - gh) / 2);
  const grid = [];
  for (let gy = 0; gy < N; gy++) { grid.push([]); for (let gx = 0; gx < N; gx++) {
    const px0 = xa + (gx - ox) / scale, px1 = xa + (gx + 1 - ox) / scale, py0 = ya + (gy - oy) / scale, py1 = ya + (gy + 1 - oy) / scale;
    let cov = 0, n = 0;
    for (let y = Math.floor(py0); y < Math.ceil(py1); y++) for (let x = Math.floor(px0); x < Math.ceil(px1); x++) {
      n++; if (x >= xa && x <= xb && y >= ya && y <= yb) cov += T.data[(y * T.width + x) * 4 + 3] / 255; // face rows only, wordmark excluded
    }
    grid[gy].push(n && cov / n >= 0.4 ? 1 : 0);
  } }
  const rects = [];
  for (let gy = 0; gy < N; gy++) { let gx = 0; while (gx < N) { if (grid[gy][gx]) { let e = gx; while (e < N && grid[gy][e]) e++; rects.push([gx, gy, e - gx, 1]); gx = e; } else gx++; } }
  // merge vertically identical runs
  const merged = [];
  for (const r of rects) { const m = merged.find(q => q[0] === r[0] && q[2] === r[2] && q[1] + q[3] === r[1]); if (m) m[3]++; else merged.push(r.slice()); }
  return merged;
}
const tokens = fs.readFileSync(path.join(ROOT, 'src/tokens.css'), 'utf8');
const tok = n => tokens.match(new RegExp(`--${n}:(#[0-9a-fA-F]{6})`))[1];
const rects = traceFavicon();
fs.writeFileSync(path.join(OUT, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" shape-rendering="crispEdges">` +
  `<rect width="32" height="32" fill="${tok('accent')}"/>` +
  `<g fill="${tok('ink')}">${rects.map(r => `<rect x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}"/>`).join('')}</g></svg>\n`);
log(`wrote favicon.svg (${rects.length} traced rects from the 32x32 coverage grid)`);

/* ---------- markup fragments driven by the register ---------- */
const XSVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
const GHSVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>';
const escA = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
function social(rec, name, svg) {
  if (rec.state === 'stated') { const h = handle(rec.url); return `<a class="social" data-social="${name}" data-state="stated" href="${escA(rec.url)}" target="_blank" rel="noopener noreferrer" aria-label="${name}: ${escA(h)}" title="${escA(h)}">${svg}</a>`; }
  return `<span class="social is-inert" data-social="${name}" data-state="${rec.state}" role="img" aria-disabled="true" aria-label="${name} (not linked yet)">${svg}</span>`;
}
const socialHTML = social(reg.x, 'X', XSVG) + social(reg.github, 'GitHub', GHSVG);
const caBar = reg.ca.state === 'stated'
  ? `<div class="ca-bar" data-state="stated"><div class="wrap"><span class="ca-k">CA</span><button class="ca-v" type="button" aria-label="Copy contract address" title="Click to copy" data-ca>${reg.ca.value}</button><button class="ca-copy" type="button">copy</button></div></div>`
  : `<div class="ca-bar" data-state="${reg.ca.state}"><div class="wrap"><span class="ca-k">CA</span><span class="ca-v" aria-disabled="true" data-ca>${reg.ca.state === 'unconfirmed' ? 'Contract address under confirmation' : 'Contract address will appear here once published'}</span><span class="ca-copy" aria-disabled="true">copy</span></div></div>`;
const dots = '<span class="num price" data-real>· · · · ·</span><span class="num chg" data-real>· · · · ·</span><span class="num vol" data-real>· · · · ·</span><span class="num liq" data-real>· · · · ·</span>';
const ownRow = `<div class="mrow own ready settled${reg.ca.state === 'stated' ? ' loading' : ' placeholder'}" role="listitem" data-own="${reg.ca.state}"><span class="rank" data-real>1</span><div class="who" data-real><span class="tile has-brand"><img src="assets/lops-mark.png" alt="LOPS" width="36" height="36"></span><div class="nm"><b>LOPS</b><span>${reg.ca.state === 'stated' ? 'loading' : 'awaiting contract'}</span></div></div>${dots}</div>`;
const skel = Array.from({ length: 10 }, (_, i) => `<div class="mrow" data-skel-row role="listitem" style="--i:${i}"><span class="rank">${i + 2}</span><div class="who"><span class="sk t"></span><div class="nm" style="flex:1"><span class="sk l"></span></div></div><span class="num price"><span class="sk"></span></span><span class="num chg"><span class="sk"></span></span><span class="num vol"><span class="sk"></span></span><span class="num liq"><span class="sk"></span></span></div>`).join('\n');

let html = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8')
  .replace('{{REGISTER}}', () => JSON.stringify(reg).replace(/</g, '\\u003c'))
  .replace('{{SOCIAL}}', () => socialHTML).replace('{{CA_BAR}}', () => caBar)
  .replace('{{OWN_ROW}}', () => ownRow).replace('{{SKEL_ROWS}}', () => skel);
fs.writeFileSync(path.join(OUT, 'index.html'), html);

fs.copyFileSync(path.join(ROOT, 'src/tokens.css'), path.join(OUT, 'tokens.css'));
fs.copyFileSync(path.join(ROOT, 'src/styles.css'), path.join(OUT, 'styles.css'));
const jsDir = path.join(ROOT, 'src/js');
const js = fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).sort().map(f => fs.readFileSync(path.join(jsDir, f), 'utf8')).join('\n');
fs.writeFileSync(path.join(OUT, 'app.js'), `(function(){'use strict';\n${js}\n})();\n`);

/* ---------- logo path check (built output) ---------- */
const refs = [...html.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)].map(m => m[1]);
for (const r of new Set(refs)) if (!fs.existsSync(path.join(OUT, r))) throw new Error('index.html references missing file: ' + r);
log('index.html asset refs resolved in dist:', [...new Set(refs)].join(', '));

/* ---------- address gate (rule 3) ---------- */
const g = gateScan(OUT, reg);
log(`gate scan: ${g.scanned} address-shaped strings, ${g.allowed} matched the stated registry, ${g.violations.length} violations`);
if (g.violations.length) { g.violations.forEach(v => console.error('[gate] unregistered address-shaped string:', v)); process.exit(1); }
log(`done -> ${path.relative(ROOT, OUT) || '.'}  (ca=${reg.ca.state}, x=${reg.x.state}, github=${reg.github.state})`);
