// Address gate. Never blanket-rejects 0x hex: every address-shaped string is matched against the stated registry.
// The stated CA is exempt (it is the one address the page is allowed to carry).
import fs from 'node:fs';
import path from 'node:path';

const SHAPES = [/\b0x[0-9a-fA-F]{40}\b/g, /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g];

export function statedValues(reg) {
  const out = new Set();
  const walk = o => { if (o && typeof o === 'object') { if (o.state === 'stated') for (const v of Object.values(o)) if (typeof v === 'string') out.add(v); for (const v of Object.values(o)) walk(v); } };
  walk(reg);
  return out;
}

export function gateScan(dir, reg) {
  const stated = statedValues(reg);
  const res = { scanned: 0, allowed: 0, violations: [] };
  const files = fs.readdirSync(dir, { recursive: true }).filter(f => /\.(html|css|js|svg|json)$/.test(f));
  for (const f of files) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const re of SHAPES) for (const m of text.matchAll(re)) {
      if (/^[A-Za-z]+$/.test(m[0]) && re === SHAPES[1]) continue; // plain words (long identifiers) are not addresses
      res.scanned++;
      if ([...stated].some(v => v.includes(m[0]) || m[0].includes(v))) res.allowed++;
      else res.violations.push(`${f}: ${m[0]}`);
    }
  }
  return res;
}
