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
