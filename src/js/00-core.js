/* core: register access, helpers. The register is read at runtime from the page. */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const REG = JSON.parse(document.getElementById('lops-register').textContent);
const isStated = rec => !!rec && rec.state === 'stated';
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(msg) {
  const t = $('#toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600);
}
const safeUrl = (u, host) => {
  try { const x = new URL(u); return x.protocol === 'https:' && (!host || x.hostname === host || x.hostname.endsWith('.' + host)) ? x.href : null; } catch (e) { return null; }
};
