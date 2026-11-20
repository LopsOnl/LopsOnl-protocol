(function(){'use strict';
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

/* motion: damped-spring reveal, parallax, spotlight, progress bar, nav */
function springTo(el, opts) {
  const o = Object.assign({ from: 28, k: 170, c: 22, delay: 0 }, opts || {});
  if (REDUCED) { el.style.opacity = 1; el.style.transform = ''; return; }
  let x = o.from, v = 0, last = 0, started = false;
  el.style.opacity = 0; el.style.transform = 'translateY(' + o.from + 'px)';
  const t0 = performance.now() + o.delay;
  function frame(now) {
    if (now < t0) { requestAnimationFrame(frame); return; }
    if (!started) { started = true; last = now; }
    let dt = Math.min((now - last) / 1000, 0.05); last = now;
    const step = 1 / 240;
    while (dt > 0) { const h = Math.min(step, dt); const a = -o.k * x - o.c * v; v += a * h; x += v * h; dt -= h; }
    const prog = 1 - Math.min(Math.abs(x) / o.from, 1);
    el.style.opacity = Math.max(0, Math.min(1, prog * 1.15));
    el.style.transform = 'translateY(' + x.toFixed(2) + 'px)';
    if (Math.abs(x) < 0.15 && Math.abs(v) < 0.15) { el.style.opacity = 1; el.style.transform = ''; return; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
function initReveal() {
  const els = $$('[data-reveal]');
  if (REDUCED || !('IntersectionObserver' in window)) { els.forEach(e => { e.style.opacity = 1; }); return; }
  const groups = new Map();
  const io = new IntersectionObserver(ents => {
    ents.filter(e => e.isIntersecting).forEach(e => {
      const p = e.target.parentElement; const n = groups.get(p) || 0; groups.set(p, n + 1);
      springTo(e.target, { delay: n * 70 }); io.unobserve(e.target);
      setTimeout(() => groups.set(p, Math.max(0, (groups.get(p) || 1) - 1)), 400);
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -4% 0px' });
  els.forEach(e => io.observe(e));
  setTimeout(() => els.forEach(e => { if (getComputedStyle(e).opacity === '0') { springTo(e); io.unobserve(e); } }), 6000);
}
function initProgress() {
  const bar = $('#progress'); if (!bar) return;
  let tick = false;
  const upd = () => { tick = false; const h = document.documentElement.scrollHeight - innerHeight; bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, scrollY / h) : 0) + ')'; };
  addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(upd); } }, { passive: true });
  upd();
}
function initParallax() {
  const layers = $$('.layer'); if (REDUCED || !layers.length) return;
  let px = 0, py = 0, tx = 0, ty = 0, sy = 0, idle = true;
  const loop = () => {
    px += (tx - px) * 0.08; py += (ty - py) * 0.08;
    layers.forEach(l => {
      const d = parseFloat(l.dataset.depth || 0);
      l.style.transform = 'translate3d(' + (px * d * 14).toFixed(2) + 'px,' + (py * d * 10 - sy * d * 0.06).toFixed(2) + 'px,0)';
    });
    if (Math.abs(tx - px) > 0.002 || Math.abs(ty - py) > 0.002) requestAnimationFrame(loop); else idle = true;
  };
  const kick = () => { if (idle) { idle = false; requestAnimationFrame(loop); } };
  addEventListener('pointermove', e => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; kick(); }, { passive: true });
  addEventListener('scroll', () => { sy = Math.min(scrollY, 700); kick(); }, { passive: true });
}
function initSpotlight() {
  document.addEventListener('pointermove', e => {
    const t = e.target.closest && e.target.closest('.spot, .mrow'); if (!t) return;
    const r = t.getBoundingClientRect();
    t.style.setProperty('--mx', (e.clientX - r.left) + 'px'); t.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });
}
function initNav() {
  const btn = $('#menuBtn'), nav = $('#navLinks');
  btn.addEventListener('click', () => { const o = nav.classList.toggle('open'); btn.setAttribute('aria-expanded', o); });
  nav.addEventListener('click', e => { if (e.target.closest('a')) { nav.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); } });
  const links = $$('[data-nav]'); const secs = links.map(a => document.getElementById(a.dataset.nav));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(ents => ents.forEach(e => { if (e.isIntersecting) links.forEach(a => a.classList.toggle('on', a.dataset.nav === e.target.id)); }), { rootMargin: '-40% 0px -55% 0px' });
    secs.forEach(s => s && io.observe(s));
  }
}

/* CA slot: inert unless the register says stated. The build renders the markup; this wires copy only. */
function initCA() {
  const bar = $('.ca-bar'); if (!bar) return;
  const rec = REG.ca;
  if (!isStated(rec) || !BASE58.test(rec.value || '')) return; /* inert: no handler attached at all */
  const btn = $('.ca-v', bar), cp = $('.ca-copy', bar);
  const copy = async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(rec.value); ok = true; } catch (e) {
      try {
        const ta = document.createElement('textarea'); ta.value = rec.value; ta.style.position = 'fixed'; ta.style.opacity = 0;
        document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); document.body.removeChild(ta);
      } catch (e2) {}
    }
    if (ok) {
      bar.classList.add('copied'); cp.textContent = 'copied ✓'; toast('Contract address copied');
      setTimeout(() => { bar.classList.remove('copied'); cp.textContent = 'copy'; }, 1600);
    } else toast('Copy blocked: select the address instead');
  };
  btn.addEventListener('click', copy); cp.addEventListener('click', copy);
}

/* hero terminal: typewriter, 28-58ms per character */
let demoRun = 0;
async function playDemo() {
  const el = $('#demo'); if (!el) return;
  const run = ++demoRun; el.textContent = '';
  const add = h => { el.insertAdjacentHTML('beforeend', h); };
  const type = async t => {
    const s = document.createElement('span'); el.appendChild(s);
    for (const ch of t) { if (run !== demoRun) throw 0; s.textContent += ch; if (!REDUCED) await sleep(28 + Math.random() * 30); }
  };
  const pause = ms => REDUCED ? Promise.resolve() : sleep(ms);
  try {
    add('<span class="c-acc">$ </span>'); await type('lops wake'); add('\n'); await pause(300);
    add('<span class="c-ok">✓</span> awake <span class="c-dim">· blocks aligned</span>\n\n'); await pause(450);
    add('<span class="c-dim">› scanning your habits…</span>\n'); await pause(500);
    add('<span class="c-dim">› three notes filed</span>\n\n'); await pause(450);
    add('<span class="c-acc">  ■ _ ■</span>\n\n'); await pause(400);
    add('<span class="c-acc">  ✦ noted:</span> summaries first, details after <span class="c-dim">+1</span>\n\n'); await pause(600);
    add('<span class="c-dim">› drafting tomorrow\'s checklist…</span>\n'); await pause(600);
    add('<span class="c-ok">✓</span> done. idle time: <b>none</b>\n\n');
    add('<span class="c-acc">$ </span><span class="caret"></span>');
  } catch (e) {}
}
function initDemo() {
  const el = $('#demo'); if (!el) return;
  const r = $('#replay'); if (r) r.addEventListener('click', playDemo);
  if (REDUCED || !('IntersectionObserver' in window)) { playDemo(); return; }
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); playDemo(); } }, { threshold: 0.2 });
  io.observe(el);
}

/* market board. Follows REG.market only. CA state never touches the trending pipeline. */
const MK = REG.market;
const BRAND_LOGO = 'assets/lops-mark.png';
const POLL_MS = 60000;
const state = { trending: new Map(), order: [], own: null, ownRow: null, inflight: false, timer: null, everLoaded: false, rows: new Map() };

/* ---------- fetch with exponential backoff ---------- */
async function getJSON(url, opts) {
  const o = Object.assign({ tries: 4, base: 800, cap: 8000, timeout: 10000, method: 'GET', body: null }, opts || {});
  let lastErr;
  for (let i = 0; i < o.tries; i++) {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), o.timeout);
    try {
      const init = { signal: ctl.signal, method: o.method, headers: { accept: 'application/json' } };
      if (o.body) { init.body = o.body; init.headers['content-type'] = 'application/json'; }
      const r = await fetch(url, init); clearTimeout(to);
      if (r.ok) return await r.json();
      lastErr = new Error('http ' + r.status);
      if (r.status !== 429 && r.status < 500) throw lastErr;
    } catch (e) { clearTimeout(to); lastErr = e; if (e && e.message && /^http 4\d\d/.test(e.message) && e.message !== 'http 429') break; }
    if (i < o.tries - 1) await sleep(Math.min(o.cap, o.base * Math.pow(2, i)) * (0.8 + Math.random() * 0.4));
  }
  throw lastErr || new Error('fetch failed');
}

/* ---------- formatting ---------- */
const nfC = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 });
const nf2 = new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtPrice(p) {
  if (p >= 1) return '$' + nf2.format(p);
  if (p >= 0.01) return '$' + p.toFixed(4);
  if (p <= 0) return '$0';
  const d = Math.min(12, -Math.floor(Math.log10(p)) + 3);
  return '$' + p.toFixed(d);
}
const fmtMoney = v => '$' + nfC.format(v);
const fmtPct = v => (v > 0 ? '▲ ' : v < 0 ? '▼ ' : '') + Math.abs(v).toFixed(2) + '%';
const FMT = { price: fmtPrice, chg: fmtPct, vol: fmtMoney, liq: fmtMoney };
const num = v => { const n = typeof v === 'string' ? parseFloat(v) : v; return typeof n === 'number' && isFinite(n) ? n : null; };

/* ---------- count-up with flash ---------- */
function setNum(cell, kind, value, first) {
  const target = cell.querySelector('[data-v]') || cell;
  const prev = cell._v;
  if (value == null) { target.textContent = '—'; cell._v = null; cell.classList.remove('up', 'down'); return; }
  const fmt = FMT[kind];
  if (kind === 'chg') { cell.classList.toggle('up', value > 0); cell.classList.toggle('down', value < 0); }
  if (prev === value) return;
  cell._v = value;
  cancelAnimationFrame(cell._raf);
  if (REDUCED) { target.textContent = fmt(value); return; }
  const from = prev == null ? 0 : prev;
  if (prev != null) { const cls = value > prev ? 'flash-up' : 'flash-down'; cell.classList.remove('flash-up', 'flash-down'); void cell.offsetWidth; cell.classList.add(cls); setTimeout(() => cell.classList.remove(cls), 500); }
  const t0 = performance.now(), dur = prev == null ? 900 : 650;
  const step = now => {
    const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3);
    target.textContent = fmt(from + (value - from) * e);
    if (t < 1) cell._raf = requestAnimationFrame(step); else target.textContent = fmt(value);
  };
  cell._raf = requestAnimationFrame(step);
}

/* ---------- logo tile: chain of sources, letter tile as the last resort ---------- */
function fillTile(tile, sources, letter) {
  tile.innerHTML = '<span class="ltr">' + esc((letter || '?').slice(0, 1).toUpperCase()) + '</span>';
  const list = sources.filter(Boolean); let i = 0;
  const next = () => {
    if (i >= list.length) return;
    const src = list[i++]; const im = new Image(); im.alt = ''; im.decoding = 'async'; im.referrerPolicy = 'no-referrer';
    im.onload = () => { if (im.naturalWidth > 0) { const old = tile.querySelector('img'); if (old) tile.removeChild(old); tile.appendChild(im); tile.classList.toggle('has-brand', /lops-mark/.test(src)); } else next(); };
    im.onerror = next; im.src = src;
  };
  next();
}

/* ---------- row construction ---------- */
function buildRow(model, rank, own) {
  const el = document.createElement(model.url ? 'a' : 'div');
  el.className = 'mrow' + (own ? ' own' : '');
  el.setAttribute('role', 'listitem');
  if (model.url) { el.href = model.url; el.target = '_blank'; el.rel = 'noopener'; }
  el.innerHTML = '<i class="spotlight"></i><span class="rank" data-real>' + rank + '</span>' +
    '<div class="who" data-real><span class="tile"></span><div class="nm"><b></b><span></span></div></div>' +
    '<span class="num price" data-real data-k="price"><span data-v>—</span></span>' +
    '<span class="num chg" data-real data-k="chg"><span data-v>—</span></span>' +
    '<span class="num vol" data-real data-k="vol"><span class="lbl">vol </span><span data-v>—</span></span>' +
    '<span class="num liq" data-real data-k="liq"><span class="lbl">liq </span><span data-v>—</span></span>';
  return el;
}
function fillRow(el, m, rank) {
  const rk = el.querySelector('.rank'); if (rk) rk.textContent = rank;
  const b = el.querySelector('.nm b'), s = el.querySelector('.nm span');
  b.textContent = m.symbol || (m.addr ? m.addr.slice(0, 4) + '…' + m.addr.slice(-4) : '—');
  s.textContent = m.name || (m.addr ? m.addr.slice(0, 6) + '…' : '');
  const key = (m.logos || []).join('|') + '#' + (m.symbol || '');
  const tile = el.querySelector('.tile');
  if (tile._key !== key) { tile._key = key; fillTile(tile, m.logos || [], m.symbol || m.name || '?'); }
  el.querySelectorAll('[data-k]').forEach(c => setNum(c, c.dataset.k, m[c.dataset.k] == null ? null : m[c.dataset.k]));
}

/* ---------- pills / status ---------- */
function setPill(st, text) {
  ['#marketPill', '#heroPill'].forEach(sel => { const p = $(sel); if (p) { p.dataset.state = st; const t = p.querySelector('[data-pill-text]'); if (t) t.textContent = text; } });
  const sl = $('#slPill'); if (sl) sl.textContent = '● ' + text;
}

/* ---------- trending pipeline ---------- */
function bestPair(pairs, addr) {
  if (!Array.isArray(pairs) || !pairs.length) return null;
  const mine = pairs.filter(p => p.baseToken && p.baseToken.address === addr);
  const pool = mine.length ? mine : pairs;
  return pool.slice().sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0))[0];
}
function modelFromPair(addr, pair, boost) {
  const info = pair && pair.info || {};
  return {
    addr, symbol: pair && pair.baseToken && pair.baseToken.symbol, name: pair && pair.baseToken && pair.baseToken.name,
    logos: [safeUrl(info.imageUrl), safeUrl(boost && boost.icon)],
    price: pair ? num(pair.priceUsd) : null,
    chg: pair && pair.priceChange ? num(pair.priceChange.h24) : null,
    vol: pair && pair.volume ? num(pair.volume.h24) : null,
    liq: pair && pair.liquidity ? num(pair.liquidity.usd) : null,
    url: pair ? safeUrl(pair.url, 'dexscreener.com') : null
  };
}
async function fetchTrending() {
  const boosts = await getJSON(MK.boosts);
  const seen = new Map();
  (Array.isArray(boosts) ? boosts : []).filter(b => b && b.chainId === MK.chain && b.tokenAddress).forEach(b => {
    const cur = seen.get(b.tokenAddress); if (!cur || (b.totalAmount || 0) > (cur.totalAmount || 0)) seen.set(b.tokenAddress, b);
  });
  const top = Array.from(seen.values()).sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0)).slice(0, 10);
  const res = await Promise.allSettled(top.map(b => getJSON(MK.tokens + encodeURIComponent(b.tokenAddress), { tries: 3 })));
  return top.map((b, i) => {
    const prev = state.trending.get(b.tokenAddress);
    if (res[i].status === 'fulfilled') {
      const pair = bestPair(res[i].value, b.tokenAddress);
      if (pair) return modelFromPair(b.tokenAddress, pair, b);
    }
    return prev || { addr: b.tokenAddress, logos: [safeUrl(b.icon)], symbol: null, name: null, price: null, chg: null, vol: null, liq: null, url: safeUrl(b.url, 'dexscreener.com') };
  });
}

/* ---------- own token (pump.fun alongside DexScreener, never blocking each other) ---------- */
const ownOn = () => isStated(REG.ca) && BASE58.test(REG.ca.value || '');
async function ownCycle() {
  if (!ownOn()) return;
  const ca = REG.ca.value;
  const m = state.own || { addr: ca, logos: [], symbol: null, name: null, price: null, chg: null, vol: null, liq: null, url: null, _pump: null, _dex: null };
  state.own = m;
  const merge = () => {
    const d = m._dex, p = m._pump;
    if (d) { m.symbol = d.baseToken && d.baseToken.symbol; m.name = d.baseToken && d.baseToken.name; m.price = num(d.priceUsd); m.chg = d.priceChange ? num(d.priceChange.h24) : null; m.vol = d.volume ? num(d.volume.h24) : null; m.liq = d.liquidity ? num(d.liquidity.usd) : null; m.url = safeUrl(d.url, 'dexscreener.com'); }
    if (p) { if (!m.symbol) m.symbol = p.symbol; if (!m.name) m.name = p.name; }
    m.logos = [p && safeUrl(p.image_uri), d && d.info && safeUrl(d.info.imageUrl), BRAND_LOGO];
    paintOwn();
  };
  const dexP = getJSON(MK.pairs + encodeURIComponent(ca), { tries: 3 }).then(j => {
    const pairs = (j && j.pairs || []).slice().sort((a, b) => ((b.volume && b.volume.h24) || 0) - ((a.volume && a.volume.h24) || 0));
    if (pairs[0]) { m._dex = pairs[0]; merge(); }
  }).catch(() => {});
  const pumpP = getJSON(MK.pump + encodeURIComponent(ca), { tries: 2 }).then(j => { if (j) { m._pump = j; merge(); } }).catch(() => {});
  await Promise.allSettled([dexP, pumpP]);
  if (!m._dex && !m._pump) { m.logos = [BRAND_LOGO]; paintOwn(); }
}
function paintOwn() {
  const m = state.own; if (!m || !state.ownRow) return;
  const old = state.ownRow;
  if (m.url && old.tagName !== 'A') { /* upgrade to link once a pair url exists */
    const a = buildRow(m, 1, true); a.classList.add('ready', 'settled'); old.replaceWith(a); state.ownRow = a; fillRow(a, m, 1); return;
  }
  fillRow(old, m, 1);
  renderTicker();
}

/* ---------- render trending ---------- */
function render() {
  const rowsEl = $('#rows');
  const own = ownOn() ? REG.ca.value : null;
  const list = state.order.filter(m => m.addr !== own); /* dedup: own token is pinned, never repeated */
  rowsEl.querySelectorAll('[data-skel-row]').forEach(n => n.remove());
  const seen = new Set();
  list.forEach((m, i) => {
    const rank = i + 2; seen.add(m.addr);
    let el = state.rows.get(m.addr);
    if (!el) {
      el = buildRow(m, rank, false); el.style.setProperty('--i', i); state.rows.set(m.addr, el); rowsEl.appendChild(el);
      requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add('ready'); setTimeout(() => el.classList.add('settled'), 1400 + i * 55); }));
    }
    fillRow(el, m, rank);
    if (rowsEl.children[i + 1] !== el) rowsEl.insertBefore(el, rowsEl.children[i + 1] || null);
  });
  state.rows.forEach((el, k) => { if (!seen.has(k)) { el.remove(); state.rows.delete(k); } });
  renderTicker();
}

/* ---------- ticker from the same data ---------- */
function tickHTML(m) {
  const c = m.chg;
  return '<span class="tick"><b>' + esc(m.symbol || (m.addr || '').slice(0, 4)) + '</b><span>' + (m.price != null ? fmtPrice(m.price) : '—') + '</span><span class="' + (c > 0 ? 'c-up' : c < 0 ? 'c-down' : '') + '">' + (c != null ? fmtPct(c) : '—') + '</span></span>';
}
function renderTicker() {
  const tr = $('#tickerTrack'); if (!tr) return;
  const own = ownOn() && state.own && (state.own.price != null) ? [state.own] : [];
  const items = own.concat(state.order.filter(m => !ownOn() || m.addr !== REG.ca.value));
  if (!items.length) { tr.innerHTML = '<span class="tick dim">' + (state.failed ? '— feed unreachable —' : 'warming up the feed…') + '</span>'; tr._sig = ''; tr.style.animation = 'none'; return; }
  const sig = items.map(m => m.addr).join(',');
  const html = items.map(tickHTML).join('');
  if (tr._sig === sig) {
    const ticks = tr.querySelectorAll('.tick'); const per = items.length;
    items.forEach((m, i) => { const h = tickHTML(m); [ticks[i], ticks[i + per]].forEach(t => { if (t && t.outerHTML !== h) t.outerHTML = h; }); });
    return;
  }
  tr._sig = sig; tr.style.animation = '';
  tr.innerHTML = REDUCED ? html : html + html;
}

/* ---------- chain slot (rpc) ---------- */
async function pollSlot() {
  const el = $('#slSlot'); if (!el || !MK.rpc) return;
  try {
    const j = await getJSON(MK.rpc, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSlot' }), tries: 2 });
    if (j && typeof j.result === 'number') el.textContent = 'slot ' + j.result.toLocaleString('en');
  } catch (e) { el.textContent = 'slot —'; }
}

/* ---------- cycle + polling ---------- */
async function cycle() {
  if (state.inflight) return; state.inflight = true;
  if (!state.everLoaded) setPill('load', 'connecting');
  const tasks = [ownCycle(), pollSlot()];
  try {
    const list = await fetchTrending();
    state.failed = false; state.everLoaded = true;
    list.forEach(m => state.trending.set(m.addr, m)); state.order = list;
    $('#boardErr').hidden = true; setPill('live', 'live'); render();
  } catch (e) {
    state.failed = true; $('#boardErr').hidden = false; setPill('error', 'feed down');
    if (!state.everLoaded) { /* dash + error on skeleton rows */
      $$('[data-skel-row]').forEach(r => { r.classList.add('ready'); r.querySelectorAll('.sk').forEach(s => { s.outerHTML = '<span class="dim">—</span>'; }); });
    }
    renderTicker();
  }
  await Promise.allSettled(tasks);
  state.inflight = false; schedule();
}
function schedule() { clearTimeout(state.timer); if (document.hidden) return; state.timer = setTimeout(cycle, POLL_MS); }
function initMarket() {
  /* own row: placeholder (absent) is rendered by the build; stated gets a live row, brand logo until data lands */
  const first = $('#rows .mrow.own');
  if (ownOn()) {
    const m = { addr: REG.ca.value, logos: [BRAND_LOGO], symbol: null, name: null };
    const el = buildRow(m, 1, true); el.classList.add('ready', 'settled'); first.replaceWith(el); state.ownRow = el;
    state.own = Object.assign({ price: null, chg: null, vol: null, liq: null, url: null, _pump: null, _dex: null }, m); fillRow(el, state.own, 1);
  } else state.ownRow = null;
  renderTicker();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(state.timer); else cycle();
  });
  cycle();
}

/* boot */
function boot() {
  initProgress(); initNav(); initReveal(); initParallax(); initSpotlight(); initCA(); initDemo(); initMarket();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

})();
