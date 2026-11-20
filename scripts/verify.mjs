// verify: builds BOTH register branches and runs every gate. Anchors are state-independent:
// each check reads the register that was baked into the build and asserts what that state demands.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, '.tmp');
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/register.json'), 'utf8'));
const TEST_CA = 'So11111111111111111111111111111111111111112'; // wrapped SOL, used only as a test value
const gates = []; let failed = 0;
const gate = (name, ok, detail = '') => { gates.push({ name, ok }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
function variant(name, patch) {
  const reg = JSON.parse(JSON.stringify(base)); patch(reg);
  const rf = path.join(TMP, name + '.json'); fs.writeFileSync(rf, JSON.stringify(reg));
  const out = path.join(TMP, name);
  try { execFileSync('node', [path.join(ROOT, 'scripts/build.mjs'), '--register', rf, '--out', out], { stdio: 'pipe' }); return { out, code: 0 }; }
  catch (e) { return { out, code: e.status }; }
}
const read = (d, f) => fs.readFileSync(path.join(d, f), 'utf8');
const baked = d => JSON.parse(read(d, 'index.html').match(/id="lops-register">([\s\S]*?)<\/script>/)[1]);

// ---- branch matrix: absent (as committed) / stated / mixed ----
const V = {
  absent: variant('absent', () => {}),
  stated: variant('stated', r => { r.ca = { state: 'stated', value: TEST_CA }; r.x = { state: 'stated', url: 'https://x.com/lopsonl' }; r.github = { state: 'stated', url: 'https://github.com/lops/lops' }; }),
  bogus: variant('bogus', r => { r.ca = { state: 'stated', value: '0xNOTANADDRESS' }; r.x = { state: 'stated', url: 'http://evil.example/x' }; }),
};
for (const [n, v] of Object.entries(V)) gate(`build exit 0 [${n}]`, v.code === 0, `exit=${v.code}`);

for (const [n, v] of Object.entries(V)) {
  const html = read(v.out, 'index.html'), reg = baked(v.out);
  const bar = html.match(/<div class="ca-bar"[^>]*data-state="(\w+)"/);
  // CA slot
  gate(`CA slot in header, first thing after nav [${n}]`, /<\/header>\s*<div class="ca-bar"/.test(html));
  gate(`CA bar state matches register [${n}]`, bar && bar[1] === reg.ca.state, `${bar && bar[1]} == ${reg.ca.state}`);
  if (reg.ca.state === 'stated') {
    gate(`stated CA: full address printed in a button [${n}]`, html.includes(`<button class="ca-v" type="button" aria-label="Copy contract address" title="Click to copy" data-ca>${reg.ca.value}</button>`));
  } else {
    gate(`non-stated CA: inert (no button, no address) [${n}]`, !/<button class="ca-v"/.test(html) && !html.includes('data-ca>' + (reg.ca.value || '§')));
  }
  // socials: both present, icon-only, inert unless stated
  for (const [k, name, shape] of [['x', 'X', 'M18.244 2.25h3.308'], ['github', 'GitHub', 'M8 0c4.42 0 8 3.58 8 8']]) {
    const m = html.match(new RegExp(`<(a|span) class="social[^"]*" data-social="${name}"[^>]*>(.*?)</\\1>`, 's'));
    gate(`${name} icon present [${n}]`, !!m && m[2].includes(shape));
    gate(`${name} icon-only (no text node) [${n}]`, !!m && !/>[^<\s][^<]*</.test(m[2].replace(/<path[^>]*>/g, '')));
    const wantLink = reg[k].state === 'stated';
    gate(`${name} href iff stated [${n}]`, m && ((m[1] === 'a') === wantLink) && (wantLink ? html.includes(`href="${reg[k].url}"`) : !/data-social="${name}"[^>]*href/.test(html)));
  }
  gate(`socials inside nav-right (top-right) [${n}]`, /<div class="nav-right">[\s\S]*data-social="X"[\s\S]*data-social="GitHub"[\s\S]*<\/div>\s*<\/div>\s*<\/header>/.test(html));
  // own row #1
  const own = html.match(/<div class="mrow own[^"]*"[^>]*data-own="(\w+)"/);
  gate(`own row #1 present and first in list [${n}]`, !!own && html.indexOf('data-own') < html.indexOf('data-skel-row'));
  gate(`own row state follows CA register [${n}]`, own && own[1] === reg.ca.state);
  if (reg.ca.state !== 'stated') {
    const row = html.match(/<div class="mrow own[\s\S]*?<span class="num liq" data-real>[^<]*<\/span><\/div>/)[0];
    gate(`placeholder row: brand logo, not letter tile [${n}]`, /src="assets\/lops-mark\.png"/.test(row) && !/class="ltr"/.test(row));
    gate(`placeholder row: five-dot data, non-link [${n}]`, (row.match(/· · · · ·/g) || []).length === 4 && !/<a /.test(row));
  }
  // generic per-build checks
  gate(`gate scan clean [${n}]`, v.code === 0);
}
gate('bogus CA downgraded to unconfirmed, never rendered as stated', baked(V.bogus.out).ca.state === 'unconfirmed' && baked(V.bogus.out).x.state === 'unconfirmed' && !/<a class="social"/.test(read(V.bogus.out, 'index.html')));

// ---- market is independent of CA state ----
const mk = d => JSON.stringify(baked(d).market);
gate('market register identical across CA states', mk(V.absent.out) === mk(V.stated.out) && mk(V.stated.out) === mk(V.bogus.out));
const appJs = read(V.absent.out, 'app.js');
const fetchTrending = appJs.slice(appJs.indexOf('async function fetchTrending'), appJs.indexOf('/* ---------- own token'));
gate('trending pipeline never reads CA', !/REG\.ca|ownOn/.test(fetchTrending));
gate('pump.fun fetched alongside DexScreener (Promise.allSettled, neither awaits the other)', /const dexP = getJSON\(MK\.pairs/.test(appJs) && /const pumpP = getJSON\(MK\.pump/.test(appJs) && /Promise\.allSettled\(\[dexP, pumpP\]\)/.test(appJs));
gate('pair selection sorted by volume.h24 desc', /volume && b\.volume\.h24[\s\S]{0,80}volume && a\.volume\.h24/.test(appJs) || /sort\(\(a, b\) => \(\(b\.volume/.test(appJs));
gate('polling: 60s + visibility pause + immediate fetch on visible', /POLL_MS = 60000/.test(appJs) && /document\.hidden\) clearTimeout/.test(appJs) && /else cycle\(\)/.test(appJs));
gate('exponential backoff present', /Math\.pow\(2, i\)/.test(appJs));

// ---- dist hygiene: assets, no dates, no ch units, palette rule ----
const D = V.absent.out;
const html = read(D, 'index.html');
gate('logo files exist in build output', fs.existsSync(path.join(D, 'assets/lops-logo.png')) && fs.existsSync(path.join(D, 'assets/lops-mark.png')));
{
  const { PNG } = await import('pngjs');
  const m = PNG.sync.read(fs.readFileSync(path.join(D, 'assets/lops-mark.png')));
  let ink = 0, fringe = 0;
  for (let i = 0; i < m.data.length; i += 4) { if (m.data[i + 3] > 200) { ink++; if (m.data[i] > 0x40) fringe++; } }
  gate('premultiplied mark: opaque ink present, no light fringe on ink', ink > 300 && fringe === 0, `ink=${ink} fringe=${fringe}`);
}
gate('index.html references logo with relative path', /src="assets\/lops-logo\.png"/.test(html) && /src="assets\/lops-mark\.png"/.test(html));
gate('favicon.svg is 32x32', /viewBox="0 0 32 32" width="32" height="32"/.test(read(D, 'favicon.svg')) && /href="favicon\.svg"/.test(html));
const visible = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
const dateRe = /\b(19|20)\d{2}\b|\b\d{1,2}[:.]\d{2}(:\d{2})?\s?(am|pm)?\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d|\bas of\b|\bchecked\b|\bupdated\b|\blast\s+(seen|sync)/i;
gate('no dates / timestamps / "as of" in visible page text', !dateRe.test(visible), (visible.match(dateRe) || [''])[0]);
const css = read(D, 'styles.css'), tokens = read(D, 'tokens.css');
gate('no colour literals outside tokens.css (css)', !/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(css));
gate('no colour literals in html/js', !/#[0-9a-fA-F]{6}\b|rgba?\(/.test(html.replace(/<svg[\s\S]*?<\/svg>/g, '')) && !/#[0-9a-fA-F]{6}\b|rgba?\(/.test(appJs));
gate('no ch units', !/\d\s?ch\b/.test(css));
gate('prefers-reduced-motion covers all animation', /prefers-reduced-motion:reduce\)\{[\s\S]*animation:none !important[\s\S]*transition:none !important/.test(css) && /\.mrow\.own\{animation:none\}/.test(css));
{
  const kfs = [...css.matchAll(/@keyframes ([A-Za-z]+)/g)].map(m => m[1]);
  const unused = kfs.filter(k => !new RegExp(`animation:[^;}]*\\b${k}\\b`).test(css));
  gate(`every @keyframes is applied by an animation declaration (${kfs.length})`, unused.length === 0, unused.join(','));
  gate('flash keyframes use .45s ease-out (reference hflash)', /\.flash-up\{animation:flashUp \.45s ease-out\}/.test(css) && /\.flash-down\{animation:flashDown \.45s ease-out\}/.test(css));
  gate('row fade-in uses .25s ease / 4px (reference fade)', /animation:fadeIn \.25s ease both/.test(css) && /@keyframes fadeIn\{from\{opacity:0;transform:translateY\(4px\)\}/.test(css));
  gate('parallax layers never share an element with a keyframe transform (blob wrappers)', !/class="blob[^"]*layer|class="layer[^"]*blob/.test(html) && /class="pl layer"/.test(html));
  gate('hero h1 stays 28px at every width (reference terminal theme)', !/\.hero h1\{font-size:(?!28px)/.test(css));
  gate('live dot is square (reference radius reset)', /\.live-dot\{[^}]*border-radius:0/.test(css));
}
gate('own row accent border + ownPulse', /\.mrow\.own\{border-left:2px solid var\(--accent\)/.test(css) && /@keyframes ownPulse/.test(css));
gate('tap targets 44px (social, ca-copy, buttons)', /\.social\{[^}]*width:44px;height:44px/.test(css) && /\.ca-copy\{[^}]*min-height:44px/.test(css) && /\.btn\{[^}]*min-height:44px/.test(css));
const tokenHex = [...tokens.matchAll(/(#[0-9a-fA-F]{6})/g)].map(m => m[1]);
gate('every token hex has a provenance comment', tokens.split('\n').every((l, i, a) => !/#[0-9a-fA-F]{6}/.test(l) || /\*\//.test(a[i - 1] || '') || /\/\*/.test(a[i - 1] || '')), `${tokenHex.length} literals`);

// ---- repo hygiene ----
const banned = ['CLAUDE.md', '.claude'];
gate('no CLAUDE.md / .claude/ in project', banned.every(b => !fs.existsSync(path.join(ROOT, b))));
const scan = ['README.md', 'docs/whitepaper.md', 'LICENSE', 'package.json', 'src', 'scripts'].flatMap(p => { const f = path.join(ROOT, p); return fs.statSync(f).isDirectory() ? fs.readdirSync(f, { recursive: true }).filter(x => /\.[a-z]+$/.test(x)).map(x => path.join(f, x)) : [f]; });
gate('no AI attribution strings in repo files', scan.every(f => f.endsWith('verify.mjs') || !/co-authored-by|generated (with|by)|claude|anthropic|\bGPT\b/i.test(fs.readFileSync(f, 'utf8'))));
gate('LICENSE is MIT, LOPS 2026', /MIT License[\s\S]*Copyright \(c\) 2026 LOPS/.test(fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8')));

// ---- copy originality vs the reference: zero shared 2-grams ----
const refFile = process.env.REF_HTML;
if (refFile && fs.existsSync(refFile)) {
  const grams = t => { const w = t.toLowerCase().match(/[a-z0-9$]+/g) || []; const s = new Set(); for (let i = 0; i < w.length - 1; i++) if (!(/^[0-9]+$/.test(w[i]) && /^[0-9]+$/.test(w[i + 1]))) s.add(w[i] + ' ' + w[i + 1]); /* number-only pairs are structure, not copy */ return s; };
  const refHtml = fs.readFileSync(refFile, 'utf8');
  const refText = refHtml.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
  const jsText = [...refHtml.matchAll(/`([^`]{20,})`|'([^'\n]{20,})'/g)].map(m => m[1] || m[2]).join(' ');
  const R = grams(refText + ' ' + jsText), M = grams(visible);
  const shared = [...M].filter(g => R.has(g));
  gate('copy shares zero 2-grams with the reference', shared.length === 0, shared.slice(0, 12).join(' | '));
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${gates.length} gates, ${failed} failed`);
process.exit(failed ? 1 : 0);
